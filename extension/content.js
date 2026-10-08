// DeepSeek Termux Bridge — content script
// v1.0.0 — Puente directo chat.deepseek.com ⇄ termux-native-mcp
//
// Flujo: DeepSeek propone ```sh → extensión detecta y decora con ▶ Ejecutar
//        → fetch POST 127.0.0.1:8081/mcp (JSON-RPC: tools/call "run" {cmd})
//        → servidor MCP ejecuta en Termux real → respuesta content[0].text
//        → se pega como [AGENT REPORT] en el chat

const MCP_URL = 'http://127.0.0.1:8081/mcp';
const DEBUG = true;
const LEDGER_TTL_MS = 10 * 60 * 1000;
const COALESCE_MS = 2500;
const COOLDOWN_MS = 5000;
const MAX_OUT_LEN = 8000;
const RUN_TIMEOUT_MS = 120000;

const SYSTEM_PROMPT =
  "Eres un asistente que trabaja en modo agente con el usuario a traves de un puente " +
  "que ejecuta comandos en una terminal Linux real (Termux en Android). REGLAS: " +
  "1. Cuando necesites ejecutar algo, responde UNICAMENTE con un bloque de codigo ```sh " +
  "con el comando exacto. 2. Un comando por bloque. Espera el resultado. " +
  "3. El usuario te devuelve la salida en un bloque ```plaintext con [AGENT REPORT]. " +
  "4. Nunca inventes resultados. 5. Avanza de a un paso. " +
  "6. Usa flags no interactivos (ej: < /dev/null). 7. Al terminar, resumi sin bloques.";

// Ledger persistente de bloques ya decorados/ejecutados.
// Se guarda en chrome.storage.local con clave 'seenCmds'.
let seenCmds = {};   // { hash: timestamp }
const SEEN_TTL_MS = 6 * 60 * 60 * 1000;  // 6 horas

function loadSeen(){
  try {
    chrome.storage.local.get(['seenCmds']).then(r => {
      seenCmds = r.seenCmds || {};
      // Limpiar viejos
      const now = Date.now();
      for (const k in seenCmds){
        if (now - seenCmds[k] > SEEN_TTL_MS) delete seenCmds[k];
      }
      console.log('[mdsb] seenCmds cargado: ' + Object.keys(seenCmds).length);
    }).catch(e => warn('loadSeen', e));
  } catch(e){ warn('storage', e); }
}

function saveSeen(){
  try { chrome.storage.local.set({ seenCmds }); } catch(e){ warn('saveSeen', e); }
}

function hashStr(s){
  let h = 0;
  for (let i=0;i<s.length;i++) h = (h*31 + s.charCodeAt(i)) | 0;
  return 'h' + Math.abs(h).toString(36) + '_' + s.length;
}

// Determina si un comando modifica el estado (NO cachear)
function isMutating(cmd){
  const c = cmd.trim();
  // Escribe/modifica FS
  if (/\b(rm|mv|cp|mkdir|rmdir|touch|chmod|chown|ln|tar|unzip|zip)\b/.test(c)) return true;
  // Redirecciones
  if (/[>]/.test(c)) return true;
  // Git que modifica
  if (/\bgit\s+(add|commit|push|pull|fetch|checkout|reset|merge|rebase|clone|init|stash|apply|cherry-pick)\b/.test(c)) return true;
  // npm/pip que instalan
  if (/\b(npm|yarn|pnpm|pip|pip3|apt|pkg|apk)\s+(install|add|remove|uninstall|upgrade|update)\b/.test(c)) return true;
  // Editores
  if (/\b(sed|awk)\s+-i\b/.test(c)) return true;
  return false;
}
const executed = new Map();
let mcpSession = null, mcpReady = false, mcpInitPromise = null;
let lastExecAt = 0, nextId = 2;
let panel = null, mode = 'off';  // 'off' | 'semi' | 'auto'

function log(...a){ if (DEBUG) console.log('[mdsb]', ...a); }
function warn(...a){ console.warn('[mdsb]', ...a); }

function loadMode(){
  try {
    chrome.storage.local.get(['mode']).then(r=>{
      mode = r.mode || 'off';
      updateModeButton();
      updateFab();
      if (mode !== 'off') runAuto();
    }).catch(e=>warn('loadMode', e));
  } catch(e){ warn('storage', e); }
}
function saveMode(){
  try { chrome.storage.local.set({ mode }); } catch(e){ warn('saveMode', e); }
}

async function mcpHandshake(){
  if (mcpReady) return true;
  setStatus('wait', '● conectando...');
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: 'MCP_PING' }, (resp) => {
      if (chrome.runtime.lastError){
        setStatus('bad', '● bg error');
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!resp || !resp.ok){
        setStatus('bad', '● MCP error');
        reject(new Error((resp && resp.error) || 'handshake falló'));
        return;
      }
      mcpReady = true;
      setStatus('ok', '● MCP listo');
      resolve(true);
    });
  });
}

async function execViaMCP(cmd, opts){
  opts = opts || {};
  const key = hashCmd(cmd);
  const mutating = isMutating(cmd);

  // Solo cachear comandos NO mutantes
  if (!mutating){
    const cached = executed.get(key);
    if (cached && Date.now() - cached.ts < LEDGER_TTL_MS && !opts.force){
      log('ledger hit', cmd);
      return Object.assign({}, cached.result, { cached: true });
    }
  }

  const since = Date.now() - lastExecAt;
  if (lastExecAt && since < COOLDOWN_MS){
    await new Promise(r => setTimeout(r, COOLDOWN_MS - since));
  }
  const t0 = Date.now();

  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: 'MCP_EXEC', cmd: cmd }, (resp) => {
      if (chrome.runtime.lastError){
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!resp || !resp.ok){
        reject(new Error((resp && resp.error) || 'error en background'));
        return;
      }
      const r = resp.result;
      r.ms = Date.now() - t0;
      // Solo guardar en ledger si es read-only y exitoso
      if (!mutating && r.exitCode === 0){
        executed.set(key, { ts: Date.now(), result: r });
      }
      lastExecAt = Date.now();
      resolve(r);
    });
  });
}

function hashCmd(cmd){
  let h = 0;
  for (let i=0;i<cmd.length;i++) h = (h*31 + cmd.charCodeAt(i)) | 0;
  return 'c' + Math.abs(h).toString(36) + '_' + cmd.length;
}

function normalizeOut(text){
  if (!text) return '';
  if (text.length <= MAX_OUT_LEN) return text;
  return text.slice(0, MAX_OUT_LEN) + '\n[...truncado ' + (text.length - MAX_OUT_LEN) + ' chars]';
}

function formatAgentReport(cmd, res){
  const status = res.exitCode === 0 ? 'OK' : 'FAIL';
  const out = normalizeOut((res.stdout || '') +
    (res.stderr ? '\n[stderr]\n' + res.stderr : ''));
  const firstLine = cmd.split('\n')[0].slice(0,80);
  return '```plaintext\n[AGENT REPORT]\ncmd: ' + firstLine +
         '\nstatus: ' + status + '\nexit: ' + res.exitCode + '\nms: ' + (res.ms||0) +
         '\n---\n' + out.trim() + '\n```';
}

function ensurePanel(){
  console.log('[mdsb] ensurePanel, panel=' + (panel ? 'existe' : 'null'));
  if (panel) return;
  panel = document.createElement('div');
  panel.id = 'mdsb-panel';
  panel.innerHTML =
    '<div class="header">' +
      '<span>Termux Bridge</span>' +
      '<div class="actions">' +
        '<span id="mdsb-status" class="status-wait">● esperando</span>' +
        '<button id="mdsb-mode-btn" class="mode-off" title="Modo: OFF/SEMI/AUTO">OFF</button>' +
        '<button id="mdsb-reconnect" title="Reconectar MCP">R</button>' +
        '<button id="mdsb-inject" title="Instrucciones">I</button>' +
        '<button id="mdsb-clear" title="Limpiar ledger">L</button>' +
        '<button id="mdsb-close">x</button>' +
      '</div>' +
    '</div>' +
    '<div id="mdsb-log"></div>';
  document.body.appendChild(panel);

  panel.querySelector('#mdsb-close').onclick = () => panel.classList.remove('open');
  panel.querySelector('#mdsb-inject').onclick = injectPrompt;
  panel.querySelector('#mdsb-clear').onclick = () => {
    executed.clear();
    showToast('Ledger limpiado');
  };
  panel.querySelector('#mdsb-mode-btn').onclick = () => {
    mode = (mode === 'off') ? 'semi' : (mode === 'semi') ? 'auto' : 'off';
    saveMode();
    updateModeButton();
    updateFab();
    if (mode !== 'off') runAuto();
    const label = mode === 'off' ? 'Manual' : mode === 'semi' ? 'Semi (pega sin enviar)' : 'Auto (pega y envía)';
    showToast('Modo: ' + label);
  };
  panel.querySelector('#mdsb-reconnect').onclick = () => {
    mcpReady = false;
    setStatus('wait', '● reconectando...');
    chrome.runtime.sendMessage({ type: 'MCP_RESET' }, (resp) => {
      if (chrome.runtime.lastError || !resp || !resp.ok){
        setStatus('bad', '● MCP error');
      } else {
        setStatus('ok', '● MCP listo');
      }
    });
  };
  console.log('[mdsb] panel creado');
}

function logPanel(html){
  if (!panel) return;
  const log = panel.querySelector('#mdsb-log');
  if (!log) return;
  const line = document.createElement('div');
  line.className = 'log-line';
  line.innerHTML = html;
  log.appendChild(line);
  while (log.children.length > 50) log.removeChild(log.firstChild);
  log.scrollTop = log.scrollHeight;
}

function updateModeButton(){
  const b = panel && panel.querySelector('#mdsb-mode-btn');
  if (!b) return;
  b.textContent = mode.toUpperCase();
  b.className = 'mode-' + mode;
}

function setStatus(kind, text){
  const s = panel && panel.querySelector('#mdsb-status');
  if (!s) return;
  s.textContent = text;
  s.className = 'status-' + kind;
}

function openPanel(){
  ensurePanel();
  if (!panel.classList.contains('open')) panel.classList.add('open');
}

function ensureFab(){
  console.log('[mdsb] ensureFab');
  let f = document.getElementById('mdsb-fab');
  if (f){ updateFab(); return; }
  f = document.createElement('button');
  f.id = 'mdsb-fab';
  f.type = 'button';
  f.textContent = '>';
  f.title = 'DeepSeek Termux Bridge';
  document.body.appendChild(f);

  // Cargar posición guardada
  try {
    chrome.storage.local.get(['fabPos']).then(r=>{
      if (r && r.fabPos){
        f.style.left = r.fabPos.left + 'px';
        f.style.top  = r.fabPos.top  + 'px';
        f.style.right = 'auto'; f.style.bottom = 'auto';
      }
    });
  } catch(e){ warn('fabPos', e); }

  // Toggle del panel: simple y confiable
  f.addEventListener('click', function(ev){
    console.log('[mdsb] FAB click');
    ev.preventDefault();
    ev.stopPropagation();
    ensurePanel();
    if (panel.classList.contains('open')){
      panel.classList.remove('open');
    } else {
      panel.classList.add('open');
      mcpHandshake().catch(function(err){ console.error('[mdsb] handshake', err); });
    }
  });

  // Drag opcional vía touch, pero SIN bloquear el click
  let sx=0, sy=0, sl=0, st=0, dragging=false;
  f.addEventListener('touchstart', function(e){
    if (!e.touches || !e.touches[0]) return;
    const p = e.touches[0];
    sx = p.clientX; sy = p.clientY;
    const r = f.getBoundingClientRect();
    sl = r.left; st = r.top;
    dragging = false;
  }, { passive: true });

  f.addEventListener('touchmove', function(e){
    if (!e.touches || !e.touches[0]) return;
    const p = e.touches[0];
    const dx = p.clientX - sx, dy = p.clientY - sy;
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) dragging = true;
    if (!dragging) return;
    let nl = Math.max(0, Math.min(window.innerWidth - f.offsetWidth, sl + dx));
    let nt = Math.max(0, Math.min(window.innerHeight - f.offsetHeight, st + dy));
    f.style.left = nl + 'px'; f.style.top = nt + 'px';
    f.style.right = 'auto'; f.style.bottom = 'auto';
    if (e.cancelable) e.preventDefault();
  }, { passive: false });

  f.addEventListener('touchend', function(e){
    if (!dragging) return;
    const r = f.getBoundingClientRect();
    try { chrome.storage.local.set({ fabPos:{ left:r.left, top:r.top } }); } catch(e){}
    // Bloquear el click posterior solo si hubo drag
    e.preventDefault();
  });

  updateFab();
}

function updateFab(){
  const f = document.getElementById('mdsb-fab');
  if (!f) return;
  f.classList.remove('mode-off', 'mode-semi', 'mode-auto');
  f.classList.add('mode-' + mode);
  f.textContent = mode === 'auto' ? 'A' : mode === 'semi' ? 'S' : '>';
}

function findChatTextarea(){
  const all = document.querySelectorAll('textarea');
  let best = null;
  for (const ta of all){
    if (ta.disabled) continue;
    if (ta.offsetParent === null) continue;
    const r = ta.getBoundingClientRect();
    if (r.height === 0 || r.width === 0) continue;
    if (!best){ best = ta; continue; }
    if (r.top > best.getBoundingClientRect().top) best = ta;
  }
  return best;
}

function setTextarea(txt){
  const ta = findChatTextarea();
  if (!ta){ warn('no textarea'); return false; }
  ta.focus();
  const s = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set;
  s.call(ta, txt);
  ta.dispatchEvent(new Event('input', { bubbles:true }));
  return true;
}

function clickSend(){
  const ta = findChatTextarea();
  if (!ta) return { ok:false, reason:'no textarea' };
  ta.focus();

  // 1) submit button en form
  const form = ta.closest('form');
  if (form){
    const s = form.querySelector('button[type="submit"]');
    if (s && !s.disabled && s.offsetParent !== null){
      s.click();
      return { ok:true, via:'form-submit' };
    }
  }

  // 2) aria-label con send/发送/enviar
  const cands = document.querySelectorAll('button[aria-label], [role="button"][aria-label], div[role="button"]');
  for (const b of cands){
    const label = (b.getAttribute('aria-label') || '').toLowerCase();
    if (/(send|env|发送|submit)/i.test(label) && !b.disabled && b.offsetParent !== null){
      b.click();
      return { ok:true, via:'aria-label' };
    }
  }

  // 3) buscar botón dentro de los 3 niveles cercanos al textarea
  let parent = ta.parentElement;
  for (let depth = 0; depth < 5 && parent; depth++){
    const btns = parent.querySelectorAll('button, [role="button"]');
    for (let i = btns.length - 1; i >= 0; i--){
      const b = btns[i];
      if (b.disabled) continue;
      if (b.offsetParent === null) continue;
      // Evitar botones con iconos obvios que no son enviar
      const cls = (b.className || '').toString().toLowerCase();
      const aria = (b.getAttribute('aria-label') || '').toLowerCase();
      if (/(attach|file|adjunt|paperclip|clip|menu|more|emoji|smile)/i.test(cls + ' ' + aria)) continue;
      // Si el botón tiene un SVG, probablemente sea el de enviar
      if (b.querySelector('svg') || (b.textContent || '').trim().length === 0){
        b.click();
        return { ok:true, via:'nearby-svg@' + depth };
      }
    }
    parent = parent.parentElement;
  }

  // 4) Fallback: simular Enter en el textarea
  const enterEvent = new KeyboardEvent('keydown', {
    key: 'Enter', code: 'Enter', keyCode: 13, which: 13,
    bubbles: true, cancelable: true
  });
  ta.dispatchEvent(enterEvent);
  return { ok:true, via:'enter-fallback' };
}

function injectPrompt(){
  if (!setTextarea(SYSTEM_PROMPT)) showToast('No encontre el input del chat');
}

function showToast(msg, ms){
  ms = ms || 3000;
  let el = document.getElementById('mdsb-toast');
  if (!el){
    el = document.createElement('div');
    el.id = 'mdsb-toast';
    el.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);' +
      'background:#1a1a2e;color:#e0e0f0;padding:10px 16px;border-radius:8px;' +
      'font-size:13px;z-index:2147483647;box-shadow:0 4px 16px rgba(0,0,0,.6);' +
      'border:1px solid #2a2a3e;max-width:90vw;';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.display = 'block';
  clearTimeout(el._t);
  el._t = setTimeout(()=>{ el.style.display='none'; }, ms);
}

function isCmd(t){
  t = t.trim();
  if (!t || t.length > 4000) return false;
  if (/^(?:const|let|var|function|import|export|class|return|<\?|\/[a-z])/.test(t)) return false;
  return /^(?:git|npm|node|npx|ls|cd|cat|echo|mkdir|rm|cp|mv|curl|wget|grep|find|chmod|pwd|touch|head|tail|sed|awk|python|python3|pip|bash|sh|yarn|pnpm|tar|zip|unzip|which|whoami|env|export|sudo|apt|apt-get|docker|make|gcc|g\+\+|go|cargo|rustc|termux-\w+)\b|^\.\/|^\/[\w.\/-]+/.test(t);
}

function findNew(){
  const r = [];
  const now = Date.now();
  document.querySelectorAll('pre').forEach(pre => {
    if (pre.closest('#mdsb-panel')) return;
    const el = pre.querySelector('code') || pre;
    const t = (el.textContent || '').trim();
    if (!t || !isCmd(t)) return;

    // Si ya lo vimos recientemente (persistido), no decorarlo de nuevo
    const h = hashStr(t);
    if (seenCmds[h] && (now - seenCmds[h] < SEEN_TTL_MS)){
      // Pero asegurarse de que ya tiene botón, si no, decorarlo sin ejecutar
      let hasBtn = false;
      let sib = el.nextElementSibling;
      while (sib && sib.classList){
        if (sib.classList.contains('mdsb-run-btn') && !sib.classList.contains('mdsb-cancel-btn')){
          hasBtn = true;
          break;
        }
        sib = sib.nextElementSibling;
      }
      if (!hasBtn){
        r.push({ el, cmd: t, already: true });
      }
      return;
    }

    seenCmds[h] = now;
    r.push({ el, cmd: t, already: false });
  });
  return r;
}

function decorate(el, cmd){
  let sib = el.nextElementSibling;
  while (sib && sib.classList && sib.classList.contains('mdsb-run-btn')){
    const s = sib; sib = sib.nextElementSibling; s.remove();
  }
  const b = document.createElement('button');
  b.className = 'mdsb-run-btn';
  b.textContent = '> Ejecutar';
  b.onclick = () => runBlock(b, cmd, { autoPaste:false });
  el.parentNode.insertBefore(b, el.nextSibling);
  return b;
}

async function runBlock(btn, cmd, opts){
  opts = opts || {};
  btn.disabled = true;
  btn.classList.remove('done','error');
  btn.textContent = '⏳ Ejecutando...';

  let cancelBtn = btn.nextElementSibling;
  const needsCancel = !(cancelBtn && cancelBtn.classList && cancelBtn.classList.contains('mdsb-cancel-btn'));
  if (needsCancel){
    cancelBtn = document.createElement('button');
    cancelBtn.className = 'mdsb-run-btn mdsb-cancel-btn';
    cancelBtn.textContent = 'X';
    cancelBtn.title = 'Cancelar';
    btn.parentNode.insertBefore(cancelBtn, btn.nextSibling);
  }
  cancelBtn.style.display = 'inline-flex';
  cancelBtn.onclick = () => {
    btn.textContent = 'X Cancelado';
    btn.classList.add('error');
    cancelBtn.style.display = 'none';
    btn.disabled = false;
  };

  try {
    const r = await execViaMCP(cmd, { force: opts.force });
    cancelBtn.style.display = 'none';

    if (r.cached){
      btn.textContent = 'OK (cache)';
      btn.classList.add('done');
    } else if (r.exitCode === 0){
      btn.textContent = 'OK Listo';
      btn.classList.add('done');
    } else {
      btn.textContent = 'X exit ' + r.exitCode;
      btn.classList.add('error');
    }
    logPanel('<b>&gt;</b> ' + cmd.slice(0,80).replace(/</g,'&lt;') + ' <i>(' + (r.ms||0) + 'ms)</i>');

    if (opts.autoPaste){
      const report = formatAgentReport(cmd, r);
      if (!setTextarea(report)){
        showToast('No encontre el input para pegar');
      } else if (opts.autoSend){
        setTimeout(()=>{
          const s = clickSend();
          if (!s.ok) showToast('No pude enviar: ' + s.reason);
          else log('enviado via ' + s.via);
        }, 600);
      } else {
        showToast('Semi: reporte pegado, revisalo y envia');
      }
    }
    btn.disabled = false;
    btn.title = 'Reintentar (forzar, ignora cache)';
    btn.onclick = () => runBlock(btn, cmd, Object.assign({}, opts, { force:true }));
    return r;
  } catch(e){
    cancelBtn.style.display = 'none';
    btn.textContent = 'X ' + (e.message || 'error').slice(0,30);
    btn.classList.add('error');
    btn.disabled = false;
    btn.title = 'Reintentar';
    btn.onclick = () => runBlock(btn, cmd, opts);
    showToast('Error: ' + e.message);
    return { error: e };
  }
}

let busy = false;
async function runAuto(){
  console.log('[mdsb] runAuto: mode=' + mode + ', busy=' + busy);
  if (mode === 'off' || busy) return;

  // Buscar bloques decorados con botón "> Ejecutar" sin ejecutar
  const blocks = [];
  document.querySelectorAll('pre').forEach(pre => {
    if (pre.closest('#mdsb-panel')) return;
    const el = pre.querySelector('code') || pre;
    const t = (el.textContent || '').trim();
    if (!t || !isCmd(t)) return;

    let sib = el.nextElementSibling;
    while (sib && sib.classList){
      if (sib.classList.contains('mdsb-run-btn') && !sib.classList.contains('mdsb-cancel-btn')){
        if (!sib.disabled &&
            !sib.classList.contains('done') &&
            !sib.classList.contains('error') &&
            sib.textContent.indexOf('Ejecutar') !== -1){
          blocks.push({ el: el, cmd: t, btn: sib });
        }
        break;
      }
      sib = sib.nextElementSibling;
    }
  });

  console.log('[mdsb] runAuto: ' + blocks.length + ' bloques pendientes');
  if (!blocks.length) return;

  busy = true;
  try {
    for (const item of blocks){
      if (mode === 'off') break;
      if (item.btn.disabled) continue;
      const autoSend = (mode === 'auto');
      console.log('[mdsb] auto ejecutando (' + mode + '): ' + item.cmd.slice(0, 60));
      await runBlock(item.btn, item.cmd, { autoPaste: true, autoSend: autoSend });
      await new Promise(r => setTimeout(r, COALESCE_MS));
    }
  } finally {
    busy = false;
    if (mode !== 'off') setTimeout(runAuto, 1500);
  }
}

let moTimer = null;
const mo = new MutationObserver(() => {
  clearTimeout(moTimer);
  moTimer = setTimeout(() => {
    try {
      const nuevos = findNew();
      console.log('[mdsb] observer: ' + nuevos.length + ' bloques nuevos');
      nuevos.forEach(item => {
        const b = decorate(item.el, item.cmd);
        if (item.already) b.disabled = true;  // no ejecutar automaticamente los ya vistos
      });
      saveSeen();
      if (mode !== 'off') runAuto();
    } catch(e){ warn('observer', e); }
  }, 250);
});

function boot(){
  if (!document.body){ setTimeout(boot, 100); return; }
  mo.observe(document.body, { childList:true, subtree:true });
  loadSeen();
  loadMode();
  ensureFab();
  log('listo');
}

boot();
