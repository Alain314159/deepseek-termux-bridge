// DeepSeek Termux Bridge — content script
// v1.0.0 — Puente directo chat.deepseek.com ⇄ termux-native-mcp
//
// Flujo: DeepSeek propone ```sh → extensión detecta y decora con ▶ Ejecutar
//        → fetch POST 127.0.0.1:8081/mcp (JSON-RPC: tools/call "run" {cmd})
//        → servidor MCP ejecuta en Termux real → respuesta content[0].text
//        → se pega como [AGENT REPORT] en el chat

const MCP_URL = 'http://127.0.0.1:8081/mcp';
const DEBUG = false;
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

const lastCmd = new WeakMap();
const executed = new Map();
let mcpSession = null, mcpReady = false, mcpInitPromise = null;
let lastExecAt = 0, nextId = 2;
let panel = null, autopilot = false;

function log(...a){ if (DEBUG) console.log('[mdsb]', ...a); }
function warn(...a){ console.warn('[mdsb]', ...a); }

function loadAP(){
  try {
    chrome.storage.local.get(['autopilot']).then(r=>{
      autopilot = !!r.autopilot;
      updateFab();
      const tgl = panel && panel.querySelector('#mdsb-ap-toggle');
      const ap  = panel && panel.querySelector('#mdsb-ap');
      if (tgl) tgl.classList.toggle('on', autopilot);
      if (ap) ap.checked = autopilot;
      if (autopilot) runAuto();
    }).catch(e=>warn('loadAP', e));
  } catch(e){ warn('storage', e); }
}
function saveAP(){
  try { chrome.storage.local.set({ autopilot }); } catch(e){ warn('saveAP', e); }
}

async function mcpHandshake(){
  if (mcpReady && mcpSession) return true;
  if (mcpInitPromise) return mcpInitPromise;
  setStatus('wait', '● conectando...');
  mcpInitPromise = (async () => {
    const r = await fetch(MCP_URL, {
      method:'POST',
      headers: { 'Content-Type':'application/json', 'Accept':'application/json, text/event-stream' },
      body: JSON.stringify({
        jsonrpc:'2.0', id:1, method:'initialize',
        params:{ protocolVersion:'2025-06-18', capabilities:{},
                 clientInfo:{ name:'deepseek-termux-bridge', version:'1.0' } }
      })
    });
    const sid = r.headers.get('Mcp-Session-Id');
    if (!sid) throw new Error('sin Mcp-Session-Id');
    mcpSession = sid;
    await fetch(MCP_URL, {
      method:'POST',
      headers: { 'Content-Type':'application/json', 'Accept':'application/json, text/event-stream',
                 'Mcp-Session-Id': mcpSession },
      body: JSON.stringify({ jsonrpc:'2.0', method:'notifications/initialized' })
    });
    mcpReady = true;
    setStatus('ok', '● MCP listo');
    log('MCP OK', sid);
    return true;
  })().catch(e => {
    mcpInitPromise = null; mcpReady = false; mcpSession = null;
    setStatus('bad', '● MCP error');
    warn('MCP handshake', e);
    throw e;
  });
  return mcpInitPromise;
}

function parseSSE(text){
  for (const line of text.split('\n')){
    const t = line.trim();
    if (t.startsWith('data:')){
      try { return JSON.parse(t.slice(5).trim()); } catch (e) {}
    }
  }
  try { return JSON.parse(text); } catch (e) {}
  return null;
}

async function mcpCall(tool, args, opts){
  opts = opts || {};
  await mcpHandshake();
  const id = nextId++;
  const r = await fetch(MCP_URL, {
    method:'POST',
    headers: { 'Content-Type':'application/json', 'Accept':'application/json, text/event-stream',
               'Mcp-Session-Id': mcpSession },
    body: JSON.stringify({ jsonrpc:'2.0', id, method:'tools/call',
                           params:{ name: tool, arguments: args } }),
    signal: opts.signal
  });
  const text = await r.text();
  const json = parseSSE(text);
  if (!json) throw new Error('respuesta MCP no parseable');
  if (json.error) throw new Error(json.error.message || 'MCP error');
  return json.result;
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

async function execViaMCP(cmd, opts){
  opts = opts || {};
  const key = hashCmd(cmd);
  const cached = executed.get(key);
  if (cached && Date.now() - cached.ts < LEDGER_TTL_MS && !opts.force){
    log('ledger hit', cmd);
    return Object.assign({}, cached.result, { cached: true });
  }
  const since = Date.now() - lastExecAt;
  if (lastExecAt && since < COOLDOWN_MS){
    await new Promise(r => setTimeout(r, COOLDOWN_MS - since));
  }
  const t0 = Date.now();
  const controller = new AbortController();
  const to = setTimeout(()=>controller.abort(), RUN_TIMEOUT_MS);
  try {
    const result = await mcpCall('run', { cmd }, { signal: controller.signal });
    clearTimeout(to);
    const content = (result.content || []).map(c => c.text || '').join('');
    const isError = !!result.isError;
    const out = {
      stdout: isError ? '' : content,
      stderr: isError ? content : '',
      exitCode: isError ? 1 : 0,
      ms: Date.now() - t0
    };
    if (!isError) executed.set(key, { ts: Date.now(), result: out });
    lastExecAt = Date.now();
    return out;
  } catch(e){
    clearTimeout(to);
    lastExecAt = Date.now();
    throw e;
  }
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
  if (panel) return;
  panel = document.createElement('div');
  panel.id = 'mdsb-panel';
  panel.innerHTML =
    '<div class="header">' +
      '<span>Termux Bridge</span>' +
      '<div class="actions">' +
        '<span id="mdsb-status" class="status-wait">● esperando</span>' +
        '<label class="toggle" id="mdsb-ap-toggle"><input type="checkbox" id="mdsb-ap"/>Auto</label>' +
        '<button id="mdsb-inject" title="Instrucciones">I</button>' +
        '<button id="mdsb-clear" title="Limpiar ledger">L</button>' +
        '<button id="mdsb-close">x</button>' +
      '</div>' +
    '</div>' +
    '<div id="mdsb-log"></div>';
  document.body.appendChild(panel);

  const ap = panel.querySelector('#mdsb-ap');
  const tgl = panel.querySelector('#mdsb-ap-toggle');
  ap.checked = autopilot;
  if (autopilot) tgl.classList.add('on');
  ap.onchange = () => {
    autopilot = ap.checked;
    tgl.classList.toggle('on', autopilot);
    saveAP(); updateFab();
    if (autopilot) runAuto();
  };
  panel.querySelector('#mdsb-close').onclick = () => panel.classList.remove('open');
  panel.querySelector('#mdsb-inject').onclick = injectPrompt;
  panel.querySelector('#mdsb-clear').onclick = () => {
    executed.clear();
    showToast('Ledger limpiado');
  };
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
  let f = document.getElementById('mdsb-fab');
  if (f){ updateFab(); return; }
  f = document.createElement('button');
  f.id = 'mdsb-fab';
  f.textContent = '>';
  f.title = 'DeepSeek Termux Bridge';
  document.body.appendChild(f);

  try {
    chrome.storage.local.get(['fabPos']).then(r=>{
      if (r && r.fabPos){
        f.style.left = r.fabPos.left + 'px';
        f.style.top  = r.fabPos.top  + 'px';
        f.style.right = 'auto'; f.style.bottom = 'auto';
      }
    });
  } catch(e){ warn('fabPos', e); }

  let startX=0,startY=0,startL=0,startT=0,dragged=false,downAt=0,active=false;
  const getPoint = e => e.touches ? e.touches[0] : e;

  function down(e){
    const p = getPoint(e);
    startX=p.clientX; startY=p.clientY;
    const r = f.getBoundingClientRect();
    startL=r.left; startT=r.top;
    dragged=false; active=true; downAt=Date.now();
    f.classList.add('dragging'); f.style.transition='none';
  }
  function move(e){
    if (!active) return;
    const p = getPoint(e);
    const dx = p.clientX - startX, dy = p.clientY - startY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) dragged = true;
    let nl = startL + dx, nt = startT + dy;
    const maxL = window.innerWidth - f.offsetWidth;
    const maxT = window.innerHeight - f.offsetHeight;
    nl = Math.max(0, Math.min(maxL, nl));
    nt = Math.max(0, Math.min(maxT, nt));
    f.style.left = nl+'px'; f.style.top = nt+'px';
    f.style.right='auto'; f.style.bottom='auto';
    if (dragged && e.cancelable) e.preventDefault();
  }
  function up(){
    if (!active) return;
    active=false;
    f.classList.remove('dragging'); f.style.transition='';
    if (dragged){
      const r = f.getBoundingClientRect();
      try { chrome.storage.local.set({ fabPos:{ left:r.left, top:r.top } }); } catch(e){}
    } else if (Date.now() - downAt < 600){
      ensurePanel();
      if (panel.classList.contains('open')) panel.classList.remove('open');
      else { panel.classList.add('open'); mcpHandshake().catch(()=>{}); }
    }
  }
  f.addEventListener('touchstart', down, { passive:true });
  f.addEventListener('touchmove', move, { passive:false });
  f.addEventListener('touchend', up);
  f.addEventListener('touchcancel', up);
  f.addEventListener('mousedown', down);
  document.addEventListener('mousemove', move);
  document.addEventListener('mouseup', up);
  updateFab();
}

function updateFab(){
  const f = document.getElementById('mdsb-fab');
  if (!f) return;
  f.classList.toggle('autopilot', autopilot);
  f.textContent = autopilot ? 'A' : '>';
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
  const form = ta.closest('form');
  if (form){
    const s = form.querySelector('button[type="submit"]');
    if (s && !s.disabled && s.offsetParent !== null){ s.click(); return { ok:true }; }
  }
  const cands = document.querySelectorAll('button[aria-label], [role="button"][aria-label]');
  for (const b of cands){
    const label = (b.getAttribute('aria-label') || '').toLowerCase();
    if (/send|enviar|submit/i.test(label) && !b.disabled && b.offsetParent !== null){
      b.click(); return { ok:true };
    }
  }
  const cont = form || (ta.parentElement && ta.parentElement.parentElement);
  if (cont){
    const btns = cont.querySelectorAll('button');
    for (let i=btns.length-1;i>=0;i--){
      const b = btns[i];
      if (!b.disabled && b.offsetParent !== null){ b.click(); return { ok:true }; }
    }
  }
  return { ok:false, reason:'no send button' };
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
  document.querySelectorAll('pre').forEach(pre => {
    if (pre.closest('#mdsb-panel')) return;
    const el = pre.querySelector('code') || pre;
    const t = (el.textContent || '').trim();
    if (!t || !isCmd(t)) return;
    if (lastCmd.get(el) === t) return;
    lastCmd.set(el, t);
    r.push({ el, cmd: t });
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
      } else {
        setTimeout(()=>{
          const s = clickSend();
          if (!s.ok) showToast('No pude enviar: ' + s.reason);
        }, 400);
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
  if (!autopilot || busy) return;
  const bs = findNew();
  if (!bs.length) return;
  busy = true;
  try {
    for (const item of bs){
      if (!autopilot) break;
      const b = decorate(item.el, item.cmd);
      if (b) await runBlock(b, item.cmd, { autoPaste:true });
      await new Promise(r => setTimeout(r, COALESCE_MS));
    }
  } finally {
    busy = false;
    if (autopilot && findNew().length) setTimeout(runAuto, 300);
  }
}

let moTimer = null;
const mo = new MutationObserver(() => {
  clearTimeout(moTimer);
  moTimer = setTimeout(() => {
    try {
      findNew().forEach(item => decorate(item.el, item.cmd));
      if (autopilot) runAuto();
    } catch(e){ warn('observer', e); }
  }, 250);
});

function boot(){
  if (!document.body){ setTimeout(boot, 100); return; }
  mo.observe(document.body, { childList:true, subtree:true });
  loadAP();
  ensureFab();
  log('listo');
}

boot();
