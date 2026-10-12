// content.js — Puente MCP DeepSeek ↔ Termux v3.1.0
(function () {
  'use strict';

  const CONFIG = {
    NONCE: 'TB-b01b4880261e8fdb',
    DEBOUNCE_MS: 3000,
    REMINDER_EVERY: 5,
    ENABLED_TOOLS: new Set([
      'run','system_info','health','process_list','process_kill','ls','read','write','mkdir',
      'delete','search','battery','location','wifi_info','screenshot','camera_photo','notify',
      'sms_send','sms_inbox','tts_speak','backup','restore','changes_list','undo','cron_add',
      'cron_list','cron_remove','cloud_sync','diff','open_url','download','public_ip','weather',
      'speedtest','smart_install','qrcode','image_process','cancel','clipboard_get','clipboard_set',
      'toast','share','diagnose','optimize','git_pr','recipe_list','recipe_run','recipe_save',
      'context','context_save','session_start','session_run','session_list','session_kill',
      'session_poll','terminal_open','terminal_run','terminal_send','terminal_read','terminal_list',
      'terminal_close','history','history_save','history_clear','do','harvest','capsule','doctor',
      'playbooks','text_extract','theme_list','theme_preview','theme_apply','theme_revert','font',
      'banner_render','approve','ask','run_digest','out_read','context_pack','batch','tool_search',
      'smart'
    ]),
    CONFIRM_REQUIRED: new Set(['restore']),
    SMART_CONFIRM: new Set(['tx_rollback']),
    MAX_OUT_LEN: 8000,
    RUN_TIMEOUT_MS: 600000,
    CONT_UMBRAL_IDLE: 300000,
    CONT_UMBRAL_TOOLCALL: 600000,
    CONT_UMBRAL_DONE: 900000,
    CONT_CHECK_MS: 30000,
    CONT_MAX_HB: 10,
    CONT_DONE_RE: /\bDONE\s+([a-f0-9]{6})\b/i,
    CONT_HB_PREFIX: '[HB:',

    SEL_INPUT: [
      'textarea#chat-input',
      'textarea[placeholder*="Message" i]',
      'textarea[placeholder*="Send" i]',
      'textarea'
    ],
    SEL_ASSISTANT: [
      '.ds-message .ds-markdown:not(.ds-think-content .ds-markdown)',
      '.ds-markdown',
      '[data-message-author-role="assistant"]'
    ],
    SEL_MESSAGE_CONTAINER: [
      '.ds-message',
      '[data-message-author-role]',
      '[class*="message"]'
    ],
    SEL_SEND: [
      'button[type="submit"]',
      'button[aria-label*="Send" i]',
      'button[aria-label*="Enviar" i]',
      'button[aria-label*="发送" i]'
    ],

    DANGEROUS: /(\brm\s+-rf\s+\/|\bsudo\b|\bmkfs\b|\bdd\s+if=|>\s*\/dev\/|\breboot\b|\bshutdown\b|:\s*\(\)\s*\{)/
  };

  const SYSTEM_PROMPT =
    "Sos un asistente de programación en Termux (Android).\n" +
    "Tenés acceso a un shell bash PERSISTENTE mediante tool calls MCP.\n\n" +
    "NONCE de esta sesión: " + CONFIG.NONCE + "\n" +
    "Usalo EXACTAMENTE en cada tool_call.\n\n" +
    "Formato obligatorio:\n" +
    "```json\n{\n  \"tool_call\": {\n    \"nonce\": \"" + CONFIG.NONCE + "\",\n" +
    "    \"id\": \"call_1\",\n    \"name\": \"bash\",\n" +
    "    \"arguments\": { \"command\": \"...\" }\n  }\n}\n```\n\n" +
    "Reglas:\n1. IDs únicos: call_1, call_2...\n" +
    "2. Shell persistente: cd, export mantienen estado.\n" +
    "3. Recibirás [MCP RESULT call_N] con exit, cwd, stdout, stderr.\n" +
    "4. NO inventes resultados.\n5. NO uses ```sh ni ```bash — solo JSON.\n" +
    "6. Campos opcionales en arguments: confirmed (bool, para comandos de riesgo), " +
    'timeout (segundos, ej: 300), cwd (ruta, ej: /sdcard).\n' +
    "7. El reporte [MCP RESULT] incluye exit, cwd y flags (timed_out/cancelled/truncated).\n" +
    "8. Si el nonce no matchea, verás [MCP ERROR] con el nonce correcto.\n" +
    "9. Tenés 84 herramientas top-level + 87 smart tools. El campo name elige cual.\n" +
    "10. ANTES de tu primer comando, leé /data/data/com.termux/files/home/deepseek-termux-bridge-v2/TOOLS.md con name:read.\n" +
    "11. Usa write/file_edit en vez de heredocs, read en vez de sed/cat, search en vez de find, " +
    "session_run en vez de comandos largos, smart con tool=goal_run para objetivos completos.\n" +
    "12. Para editar archivos usa smart con {tool:\"file_edit\", params:{path, find, replace}}. " +
    "Para correr un proyecto usa smart {tool:\"project_run\", params:{path, test:true}}. " +
    "Para probar cambios sin aplicarlos: smart {tool:\"sandbox_run\", params:{cmd, path}}.\n" +
    "13. Cualquier smart tool se invoca igual: name:\"smart\", arguments:{tool:\"<nombre>\", params:{...}}. " +
    "Lista completa en TOOLS.md.\n" +
    "14. Si recibis un mensaje que empieza con [HB:xxxxx], estas en modo autonomo continuo. " +
    "Toma la decision mas razonable y ejecutala. Si la tarea esta terminada, respondi DONE " +
    "seguido del token de 6 caracteres que aparece en el [HB:] (ejemplo: DONE a3f8b2).";

  const REMINDER_POOL = [
    "[RECORDATORIO] Formato del tool_call: bloque JSON con nonce (" + CONFIG.NONCE + "), id unico (call_N), name, y arguments. Ej: {\"tool_call\":{\"nonce\":\"...\",\"id\":\"call_N\",\"name\":\"run\",\"arguments\":{\"cmd\":\"...\"}}}.",
    "[RECORDATORIO] Lista completa de herramientas en /data/data/com.termux/files/home/deepseek-termux-bridge-v2/TOOLS.md. Leela si dudas sobre que tool usar.",
    "[RECORDATORIO] Usa file_edit en vez de write para cambios puntuales en archivos existentes. Guarda snapshot y devuelve diff.",
    "[RECORDATORIO] Si un comando tarda mas de 60s, usa session_run + session_poll en vez de run bloqueante.",
    "[RECORDATORIO] Antes de un comando destructivo, considera sandbox_run para probar en copia descartable.",
    "[RECORDATORIO] Si la tarea toca varios archivos, envuelvela con tx_begin y tx_commit. Si falla, tx_rollback.",
    "[RECORDATORIO] Usa project_profile + project_run para detectar y correr un proyecto sin armar comandos a mano.",
    "[RECORDATORIO] Analiza siempre exit y cwd del ultimo [MCP RESULT] antes de continuar."
  ];

  function getSystemReinject() {
    return '[SYSTEM REINJECT] Recordatorio completo de reglas:\n' +
      '1. Para ejecutar comandos emite un bloque JSON con tool_call.\n' +
      '2. Nonce: ' + CONFIG.NONCE + '\n' +
      '3. Tenes 84 herramientas top-level + 87 smart tools. Detalle en TOOLS.md.\n' +
      '4. Usa smart con {tool:"file_edit", params:{path, find, replace}} para editar sin heredocs.\n' +
      '5. Para builds largos usa session_run + session_poll.\n' +
      '6. Para editar varios archivos con rollback: tx_begin + tx_commit / tx_rollback.\n' +
      '7. Si terminas en modo CONT, escribi DONE <token> tres veces.\n' +
      '8. Analiza exit y cwd de cada [MCP RESULT] antes de continuar.';
  }

  function getReminder(count) {
    const idx = Math.floor(count / CONFIG.REMINDER_EVERY) % REMINDER_POOL.length;
    return REMINDER_POOL[idx];
  }

  const state = {
    executed: new Set(JSON.parse(localStorage.getItem('tb_executed') || '[]')),
    pendingTimers: new Map(),
    blockData: new Map(),
    assistantCount: parseInt(localStorage.getItem('tb_assistantCount') || '0', 10),
    dangerousConfirm: localStorage.getItem('tb_dangerous') !== 'off',
    stats: { executed: 0, pending: 0, errors: 0 },
    nonceOk: null,
    busy: false,
    lastUrl: location.href,
    scanCount: 0,
    parseFails: 0,
    userBlocks: 0,
    executionEpoch: 0,
    extDead: false,
    mode: (localStorage.getItem('tb_mode') || 'semi'),
    offButtons: new Set(),
    contActive: false,
    contOffline: false,
    contToken: null,
    contHb: 0,
    contLastActivity: 0,
    contLastAssistantText: '',
    contAssistantCount: 0,
    contFirstDoneAt: 0,
    contDoneStreak: 0,
    contLastDoneCount: 0,
    contTimer: null
  };

  function fnv1a(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return ('00000000' + (h >>> 0).toString(16)).slice(-8);
  }

  function log(msg, type) {
    const icon = type === 'error' ? 'X' : type === 'warn' ? '!' : 'v';
    console.log('[TermuxBridge] ' + icon + ' ' + msg);
  }

  function saveExecuted() {
    const arr = Array.from(state.executed).slice(-200);
    state.executed = new Set(arr);
    localStorage.setItem('tb_executed', JSON.stringify(arr));
  }

  function queryFirst(selectors, visibleOnly) {
    for (const sel of selectors) {
      try {
        const el = document.querySelector(sel);
        if (el && (!visibleOnly || el.offsetParent !== null)) return el;
      } catch (e) {}
    }
    return null;
  }
  function queryAll(selectors) {
    const out = [];
    const seen = new Set();
    for (const sel of selectors) {
      try {
        for (const el of document.querySelectorAll(sel)) {
          if (!seen.has(el)) { seen.add(el); out.push(el); }
        }
      } catch (e) {}
    }
    return out;
  }

  // ===== INPUT / SEND =====
  function findChatTextarea() {
    const bySel = queryFirst(CONFIG.SEL_INPUT, true);
    if (bySel) return bySel;
    let best = null;
    for (const ta of document.querySelectorAll('textarea')) {
      if (ta.disabled || ta.offsetParent === null) continue;
      const r = ta.getBoundingClientRect();
      if (!r.height || !r.width) continue;
      if (!best || r.top > best.getBoundingClientRect().top) best = ta;
    }
    return best;
  }

  function setTextarea(txt) {
    const ta = findChatTextarea();
    if (!ta) return false;
    ta.focus();
    try { ta.select(); } catch (e) {}
    let inserted = false;
    try { inserted = document.execCommand('insertText', false, txt); } catch (e) {}
    if (!inserted || ta.value !== txt) {
      try {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
        setter.call(ta, txt);
      } catch (e) { ta.value = txt; }
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      ta.dispatchEvent(new Event('change', { bubbles: true }));
    }
    return true;
  }

  async function clickSend() {
    const ta = findChatTextarea();
    if (!ta) return false;

    const sleep = ms => new Promise(r => setTimeout(r, ms));

    function findButtons() {
      const out = [];
      const sels = [
        'button[type="submit"]',
        'button[aria-label*="Send" i]',
        'button[aria-label*="Enviar" i]',
        'div[role="button"][aria-label*="Send" i]',
        'div[role="button"][aria-label*="Enviar" i]',
        '[data-testid*="send" i]'
      ];
      for (const s of sels) {
        try {
          for (const el of document.querySelectorAll(s)) {
            if (el.offsetParent === null) continue;
            if (el.disabled) continue;
            if (el.getAttribute('aria-disabled') === 'true') continue;
            out.push(el);
          }
        } catch (e) {}
      }
      let parent = ta.parentElement;
      for (let d = 0; d < 6 && parent; d++) {
        const btns = parent.querySelectorAll('button, div[role="button"]');
        for (let i = btns.length - 1; i >= 0; i--) {
          const b = btns[i];
          if (b.offsetParent === null) continue;
          if (b.disabled) continue;
          if (b.getAttribute('aria-disabled') === 'true') continue;
          const al = (b.getAttribute('aria-label') || '').toLowerCase();
          if (/(attach|file|adjunt|paperclip|clip|menu|emoji|smile|mic|voice|search|plus)/i.test(al)) continue;
          if (b.querySelector('svg')) out.push(b);
        }
        parent = parent.parentElement;
      }
      return out;
    }

    for (let i = 0; i < 5; i++) {
      const cands = findButtons();
      if (cands.length > 0) {
        const btn = cands[0];
        log('send try#' + (i + 1) + ' ' + btn.tagName + ' aria=' + (btn.getAttribute('aria-label') || '-'));
        try { btn.click(); } catch (e) {}
      } else {
        log('send try#' + (i + 1) + ' no buttons found');
      }
      await sleep(700);
      const after = findChatTextarea();
      if (!after || !after.value.trim()) return true;
    }

    const ta2 = findChatTextarea();
    if (ta2 && ta2.value.trim()) {
      ta2.focus();
      try {
        ta2.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'Enter', code: 'Enter', keyCode: 13, which: 13,
          bubbles: true, cancelable: true
        }));
      } catch (e) {}
      await sleep(700);
      const after = findChatTextarea();
      if (!after || !after.value.trim()) return true;
    }
    return false;
  }


  function toast(msg) {
    let el = document.getElementById('tb-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'tb-toast';
      el.style.cssText = 'position:fixed;left:50%;top:20px;transform:translateX(-50%);' +
        'background:#1a73e8;color:#fff;padding:10px 16px;border-radius:8px;' +
        'font-family:monospace;font-size:13px;z-index:100000;' +
        'box-shadow:0 4px 12px rgba(0,0,0,.5);max-width:80vw;text-align:center;';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.display = 'block';
    clearTimeout(el._timer);
    el._timer = setTimeout(() => { el.style.display = 'none'; }, 4000);
    log('TOAST: ' + msg);
  }

  // ===== FIX: parseo robusto del texto del bloque =====
  function normalizeJsonKeys(text) {
    // Quita espacios dentro de claves: "nonc e": -> "nonce":
    return String(text).replace(/"([^"\\\n]{1,40}?)"\s*:/g, function(m, k){
      return '"' + k.replace(/\s+/g, '') + '":';
    });
  }

  function extractJSON(text) {
    if (!text) return null;
    let t = String(text).trim();

    t = t.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u00ad\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/g, '');
    t = t.replace(/[\u00a0\u2000-\u200a\u202f\u205f\u3000]/g, ' ');
    t = t.replace(/^[a-zA-Z_\-]+((Copy|Download|Copiar|Descargar)[a-zA-Z_\-]*)*/i, '').trim();

    // Intento 1: parseo directo sin tocar
    try { return JSON.parse(t); } catch (e) {}

    // Intento 2: normalizar claves con espacios internos
    const tNorm = normalizeJsonKeys(t);
    try { return JSON.parse(tNorm); } catch (e) {}
    t = tNorm;

    const start = t.indexOf('{"tool_call"');
    if (start >= 0) {
      let depth = 0, inStr = false, esc = false, end = -1;
      for (let i = start; i < t.length; i++) {
        const c = t[i];
        if (esc) { esc = false; continue; }
        if (c === '\\') { esc = true; continue; }
        if (c === '"') { inStr = !inStr; continue; }
        if (inStr) continue;
        if (c === '{') depth++;
        else if (c === '}') { depth--; if (depth === 0) { end = i; break; } }
      }
      if (end > start) {
        try { return JSON.parse(t.slice(start, end + 1)); } catch (e) {}
      }
    }

    t = t.replace(/^(json|javascript|js|bash|sh|shell|text|plaintext)\s*\n/i, '').trim();
    try { return JSON.parse(t); } catch (e) {}

    const fb = t.indexOf('{');
    const lb = t.lastIndexOf('}');
    if (fb >= 0 && lb > fb) {
      try { return JSON.parse(t.slice(fb, lb + 1)); } catch (e) {}
    }

    // Ultimo intento: quitar newlines sueltos (DeepSeek inserta visuales)
    const compact = t.replace(/\n(?![^"]*\")/g, '');
    if (compact !== t) {
      try { return JSON.parse(compact); } catch (e) {}
    }
    const compact2 = t.replace(/[\r\n]/g, '');
    if (compact2 !== t) {
      try { return JSON.parse(compact2); } catch (e) {}
    }
    return extractToolCallRegex(t);
  }

  function extractToolCallRegex(text) {
    if (!text) return null;
    const nonceM = text.match(/"nonce"\s*:\s*"([^"]+)"/);
    const idM = text.match(/"id"\s*:\s*"([^"]+)"/);
    const nameM = text.match(/"name"\s*:\s*"([^"]+)"/);
    if (!nonceM || !idM) return null;
    const argsPos = text.indexOf('"arguments"');
    let args = {};
    if (argsPos >= 0) {
      const braceStart = text.indexOf('{', argsPos);
      if (braceStart >= 0) {
        let depth = 0, inStr = false, esc = false, braceEnd = -1;
        for (let i = braceStart; i < text.length; i++) {
          const c = text[i];
          if (esc) { esc = false; continue; }
          if (c === '\\') { esc = true; continue; }
          if (c === '"') { inStr = !inStr; continue; }
          if (inStr) continue;
          if (c === '{') depth++;
          else if (c === '}') { depth--; if (depth === 0) { braceEnd = i; break; } }
        }
        if (braceEnd > braceStart) {
          try {
            args = JSON.parse(text.slice(braceStart, braceEnd + 1));
          } catch (e) {
            // No inventar valores: si no parsea, dejar args vacío
            // para que executeToolCall falle con un error explícito
            args = null;
          }
        }
      }
    }
    return { tool_call: { nonce: nonceM[1], id: idM[1], name: nameM ? nameM[1] : 'run', arguments: args } };
  }


  // ===== FIX: incluir el propio nodo al escanear =====
  function collectCodeBlocks(root) {
    const out = [];
    if (root.nodeType !== 1) return out;
    if (root.tagName === 'PRE' || root.tagName === 'CODE') {
      out.push(root);
    }
    if (root.querySelectorAll) {
      for (const b of root.querySelectorAll('pre, code, pre code, .md-code-block')) {
        out.push(b);
      }
    }
    return out;
  }

  const warnedNonces = new Set();
  function warnNonceMismatch(tc) {
    if (/\.\.\./.test(tc.nonce || '') || /\.\.\./.test(tc.id || '')) return;
    const key = (tc.id || '?') + '::' + (tc.nonce || '?');
    if (warnedNonces.has(key)) return;
    warnedNonces.add(key);
    const msg = '[MCP ERROR]\n' +
      'tool_call ignorado: nonce incorrecto\n' +
      'esperado: ' + CONFIG.NONCE + '\n' +
      'recibido: ' + (tc.nonce || '(vacío)') + '\n' +
      'id: ' + (tc.id || '(vacío)');
    log('nonce mismatch en ' + (tc.id || '?'), 'warn');
    // Pegar en textarea sin enviar, para que el usuario/IA lo vea
    setTimeout(() => {
      const ta = findChatTextarea();
      if (ta && !ta.value.trim()) setTextarea(msg);
    }, 500);
  }

  function extractToolCalls(root) {
    const calls = [];
    const blocks = collectCodeBlocks(root);
    const seen = new Set();
    for (const block of blocks) {
      let srcBlock = block;
      if (block.tagName === 'PRE') {
        const inner = block.querySelector('code');
        if (inner) srcBlock = inner;
      }
      let text = (srcBlock.textContent || '').trim();
      text = text.replace(/[\u200b\u200c\u200d\ufeff\u00ad\u2060\u180e]/g, '');
      text = text.replace(/^[a-zA-Z]+((Copy|Download|Copiar|Descargar)[a-zA-Z]*)+/i, '').trim();
      if (!text) continue;
      if (seen.has(text)) continue;
      seen.add(text);

      const obj = extractJSON(text);
      if (!obj) {
        if (/\{.*tool_call/i.test(text)) state.parseFails++;
        continue;
      }
      const tc = obj.tool_call;
      if (!tc || !tc.name) continue;
      // Ignorar placeholders y ejemplos
      const nonceStr = String(tc.nonce || '');
      const idStr = String(tc.id || '');
      if (/\.\.\.|XXX|xxx|placeholder|<.*>|\[.*\]/i.test(nonceStr)) continue;
      if (/\.\.\.|XXX|xxx|placeholder|<.*>|call_[A-Za-z]|call_N/i.test(idStr)) continue;
      if (!tc.id || tc.nonce !== CONFIG.NONCE) {
        if (tc.nonce && tc.nonce !== CONFIG.NONCE) {
          state.nonceOk = false;
          updateFAB();
          warnNonceMismatch(tc);
        }
        continue;
      }
      if (/\.\.\./.test(tc.nonce) || /\.\.\./.test(tc.id)) continue;
      state.nonceOk = true;
      if (state.executed.has(execKey(tc))) continue;
      calls.push({ data: tc, el: block });
    }
    return calls;
  }

  function insertOffButton(tc, el) {
    if (state.offButtons.has(tc.id)) return;
    state.offButtons.add(tc.id);
    const btn = document.createElement('button');
    btn.textContent = String.fromCharCode(9654);
    btn.title = 'Ejecutar ' + tc.id;
    btn.style.cssText = 'display:inline-block;width:22px;height:22px;padding:0;margin:2px 4px;border:none;border-radius:11px;background:#2b6cb0;color:#fff;font-size:11px;cursor:pointer;vertical-align:middle;opacity:0.85;';
    btn.onclick = async (e) => {
      e.preventDefault();
      btn.disabled = true;
      await executeToolCall(tc, el, { autoSend: false });
      btn.textContent = String.fromCharCode(10003);
      btn.style.background = '#2f855a';
      btn.disabled = false;
      btn.title = 'Repetir ' + tc.id;
    };
    if (el.parentNode) el.parentNode.insertBefore(btn, el.nextSibling);
  }

  function scheduleExecution(tc, el) {
    if (state.mode === 'off') { insertOffButton(tc, el); return; }
    const key = tc.id + '::' + fnv1a(JSON.stringify(tc));
    if (state.pendingTimers.has(key)) {
      // Ya hay un timer programado para este mismo bloque. No resetear.
      return;
    }
    state.stats.pending++;
    updateFAB();
    state.blockData.set(key, { tc, el });
    const timer = setTimeout(async () => {
      state.pendingTimers.delete(key);
      const data = state.blockData.get(key);
      state.blockData.delete(key);
      state.stats.pending = Math.max(0, state.stats.pending - 1);
      if (data) await executeToolCall(data.tc, data.el);
    }, CONFIG.DEBOUNCE_MS);
    state.pendingTimers.set(key, timer);
  }

  function execViaBackground(cmd, toolName, args) {
    return new Promise((resolve) => {
      let done = false;
      const customTimeout = (args && args.timeout) ? (args.timeout * 1000) : CONFIG.RUN_TIMEOUT_MS;
      const timer = setTimeout(() => {
        if (done) return; done = true;
        resolve({ exit_code: -1, stdout: '', stderr: 'timeout', cwd: '' });
      }, customTimeout);
      try {
        chrome.runtime.sendMessage({ type: 'MCP_EXEC', cmd, toolName, args }, (resp) => {
          if (done) return; done = true; clearTimeout(timer);
          if (chrome.runtime.lastError) {
            const msg = chrome.runtime.lastError.message || '';
            if (/context invalidated/i.test(msg)) {
              state.extDead = true;
              toast('Extensión recargada. Cierra y reabre esta pestaña.');
            }
            resolve({ exit_code: -1, stdout: '', stderr: msg, cwd: '' });
            return;
          }
          if (!resp || !resp.ok) {
            resolve({ exit_code: -1, stdout: '', stderr: (resp && resp.error) || 'error bg', cwd: '' });
            return;
          }
          resolve(resp.result);
        });
      } catch (e) {
        if (!done) { done = true; clearTimeout(timer); resolve({ exit_code: -1, stdout: '', stderr: e.message, cwd: '' }); }
      }
    });
  }

  async function executeToolCall(tc, el, opts) {
    opts = opts || {};
    const autoSend = opts.autoSend !== undefined ? opts.autoSend : (state.mode === 'auto' || state.mode === 'cont');
    if (state.extDead) {
      log('ext dead, no ejecuto ' + tc.id, 'warn');
      return;
    }
    let toolName = (tc.name || 'run').toLowerCase();
    if (toolName === 'bash' || toolName === 'sh' || toolName === 'shell') toolName = 'run';
    const rawArgs = tc.arguments || {};
    if (!CONFIG.ENABLED_TOOLS.has(toolName)) {
      const msg = '[MCP ERROR]\ntool_call bloqueado: ' + toolName + ' no está habilitada.';
      log('tool bloqueada: ' + toolName, 'warn');
      setTimeout(() => { const ta = findChatTextarea(); if (ta && !ta.value.trim()) setTextarea(msg); }, 300);
      return;
    }
    const smartDestructive = (toolName === 'smart' && rawArgs.tool && CONFIG.SMART_CONFIRM.has(rawArgs.tool));
    const needsConfirm = CONFIG.CONFIRM_REQUIRED.has(toolName) || smartDestructive;
    if (needsConfirm && !rawArgs.confirmed && !(rawArgs.params && rawArgs.params.confirmed)) {
      const label = smartDestructive ? ('smart:' + rawArgs.tool) : toolName;
      if (state.mode === 'auto' || state.mode === 'cont') {
        const msg = '[MCP ERROR]\ntool ' + label + ' requiere confirmación.\nCambiá a modo SEMI para ejecutarla.';
        log('tool sensible en AUTO, rechazada: ' + toolName, 'warn');
        setTimeout(() => { const ta = findChatTextarea(); if (ta && !ta.value.trim()) setTextarea(msg); }, 300);
        state.executed.add(execKey(tc)); saveExecuted();
        return;
      }
      const preview = JSON.stringify(rawArgs).slice(0, 300);
      const okConfirm = confirm('Herramienta sensible: ' + label + '\n\nArgumentos:\n' + preview + '\n\n¿Ejecutar?');
      if (!okConfirm) {
        const msg = '[MCP ERROR]\nusuario canceló: ' + toolName;
        setTimeout(() => { const ta = findChatTextarea(); if (ta && !ta.value.trim()) setTextarea(msg); }, 300);
        state.executed.add(execKey(tc)); saveExecuted();
        return;
      }
      rawArgs.confirmed = true;
    }
    const cmd = rawArgs.cmd || rawArgs.command || '';
    if (toolName === 'run' || toolName === 'run_digest') {
      if (!cmd) { log('tool_call sin command para ' + toolName, 'warn'); return; }
    }
    // tools no-shell (read, write, ls, etc.) usan rawArgs tal cual.

    if (state.dangerousConfirm && CONFIG.DANGEROUS.test(cmd)) {
      const ok = confirm('Comando peligroso:\n\n' + cmd + '\n\nEjecutar?');
      if (!ok) {
        log('Cancelado: ' + tc.id, 'warn');
        state.executed.add(execKey(tc)); saveExecuted();
        return;
      }
    }

    const badge = document.createElement('span');
    badge.textContent = '⏳ ' + tc.id;
    badge.style.cssText = 'display:inline-block;padding:2px 8px;margin:4px 0;background:#b7791f;color:#fff;border-radius:4px;font-size:11px;font-family:monospace;';
    if (el.parentNode) el.parentNode.insertBefore(badge, el.nextSibling);

    const epochAtStart = state.executionEpoch;
    while (state.busy) await new Promise(r => setTimeout(r, 500));
    state.busy = true;
    let r;
    try {
      log('Ejecutando ' + tc.id + ' (' + toolName + '): ' + (cmd || JSON.stringify(rawArgs)).slice(0, 60));
      r = await execViaBackground(cmd, toolName, rawArgs);
    } catch (err) {
      log('Error ejecutando ' + tc.id + ': ' + err.message, 'error');
      r = { exit_code: -1, stdout: '', stderr: err.message, cwd: '' };
    } finally {
      state.busy = false;
    }

    const ok = r.exit_code === 0;
    if (badge.parentNode) {
      badge.textContent = (ok ? 'v ' : 'X ') + tc.id;
      badge.style.background = ok ? '#2f855a' : '#c53030';
    }
    if (ok) state.stats.executed++; else state.stats.errors++;
    state.executed.add(execKey(tc)); saveExecuted();
    updateFAB();
    if (epochAtStart !== state.executionEpoch) {
      log('epoch cambio, descarto ' + tc.id, 'warn');
      return;
    }
    state.assistantCount++;
    localStorage.setItem('tb_assistantCount', String(state.assistantCount));
    const withRem = (state.assistantCount % CONFIG.REMINDER_EVERY === 0);
    await sendResult(tc.id, r, withRem, autoSend);
  }

  function formatResult(id, r, appendReminder) {
    const out = (r.stdout || '').slice(0, CONFIG.MAX_OUT_LEN);
    const err = (r.stderr || '').slice(0, 2000);
    let s = '[MCP RESULT ' + id + ']\n';
    s += 'exit=' + (r.exit_code != null ? r.exit_code : '?') + '\n';
    s += 'cwd=' + (r.cwd || '?') + '\n';
    const flags = [];
    if (r.timed_out) flags.push('timed_out');
    if (r.cancelled) flags.push('cancelled');
    if (r.truncated) flags.push('truncated');
    if (flags.length) s += 'flags=' + flags.join(',') + '\n';
    s += '---\n';
    if (out) s += out + (out.endsWith('\n') ? '' : '\n');
    if (err) s += '[stderr]\n' + err;
    if (appendReminder) s += '\n' + getReminder(state.assistantCount);
    if (state.assistantCount > 0 && state.assistantCount % 20 === 0) s += '\n\n' + getSystemReinject();
    return s;
  }

  const resultQueue = [];
  let queueTimer = null;
  let queueWorkerRunning = false;

  function queueResult(text) {
    resultQueue.push(text);
    log('Encolado (' + resultQueue.length + ' en cola)');
    if (queueTimer) clearTimeout(queueTimer);
    queueTimer = setTimeout(flushQueue, 500);
  }

  async function flushQueue() {
    queueTimer = null;
    if (queueWorkerRunning) return;
    if (resultQueue.length === 0) return;
    queueWorkerRunning = true;
    try {
      while (resultQueue.length > 0) {
        const ta = findChatTextarea();
        if (!ta) { await new Promise(r => setTimeout(r, 1000)); continue; }
        if (ta.value.trim()) {
          await new Promise(r => setTimeout(r, 1000));
          continue;
        }
        const batch = resultQueue.splice(0, resultQueue.length);
        const text = batch.join('\n\n');
        if (!setTextarea(text)) {
          await new Promise(r => setTimeout(r, 1000));
          continue;
        }
        log('Pegado batch de ' + batch.length + ' resultados');
        if (state.mode === 'auto' || state.mode === 'cont') {
          await new Promise(r => setTimeout(r, 500));
          const ok = await clickSend();
          if (!ok) log('No pude enviar batch', 'warn');
        } else {
          log('Pegado sin enviar (modo ' + state.mode + ')');
        }
      }
    } finally {
      queueWorkerRunning = false;
    }
  }

  async function sendResult(id, r, appendReminder, autoSend) {
    const text = formatResult(id, r, appendReminder);
    if (!autoSend) {
      const ta = findChatTextarea();
      if (ta && !ta.value.trim() && setTextarea(text)) {
        log('Pegado sin enviar ' + id);
        return;
      }
    }
    queueResult(text);
  }


  function isEmptyChat() {
    return queryAll(CONFIG.SEL_ASSISTANT).length === 0;
  }

  function tryAutoInject() {
    if (!isEmptyChat()) return;
    const ta = findChatTextarea();
    if (!ta || ta.value.trim()) return;
    if (setTextarea(SYSTEM_PROMPT)) {
      setTimeout(async () => { await clickSend(); log('System prompt auto-inyectado'); }, 800);
    }
  }

  async function forceInjectPrompt() {
    const ta = findChatTextarea();
    if (!ta) { toast('No encontré el textarea'); return; }
    if (ta.value.trim()) {
      if (!confirm('Hay texto en el input. ¿Reemplazarlo con el system prompt?')) return;
    }
    if (!setTextarea(SYSTEM_PROMPT)) { toast('No pude escribir en el textarea'); return; }

    let ok = false;
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 100));
      const check = findChatTextarea();
      if (check && check.value.includes('NONCE de esta sesión')) { ok = true; break; }
    }
    if (!ok) { toast('El textarea no aceptó el texto'); return; }

    toast('Prompt puesto. Enviando...');
    const sent = await clickSend();
    toast(sent ? 'Prompt enviado' : 'No pude enviar');
  }

  function contGenToken() {
    let s = '';
    for (let i = 0; i < 6; i++) s += '0123456789abcdef'[Math.floor(Math.random() * 16)];
    return s;
  }

  function contHBText(n, token) {
    const base = '[HB:' + token + ']';
    if (n >= 3) {
      return base + ' Llevas ' + n + ' mensajes sin ejecutar un tool_call. ' +
        'Ejecuta una accion concreta con un tool_call o escribi DONE ' + token + ' si terminaste.';
    }
    if (n >= 2) {
      return base + ' No detecte actividad. Continuá con la tarea. Si preguntaste algo, toma la decision mas razonable y ejecutala. Si terminaste, escribi DONE ' + token + '.';
    }
    return base + ' No detecte actividad. Continuá mejorando el proyecto. ' +
      'Revisa: tests faltantes, casos borde, manejo de errores, codigo duplicado, performance, seguridad, documentacion. ' +
      'Proponé UN proximo paso concreto como tool_call. ' +
      'No instales dependencias nuevas sin justificar. No refactorices lo que funciona. ' +
      'Si hay tests, correlos antes y despues. Si vas a tocar mas de 3 archivos, para y pedi confirmacion. ' +
      'Si terminaste, escribi DONE ' + token + '.';
  }

  function contDetectAssistantCount() {
    return queryAll(CONFIG.SEL_ASSISTANT).length;
  }

  function contGetLastAssistantText() {
    const all = queryAll(CONFIG.SEL_ASSISTANT);
    if (!all.length) return '';
    return (all[all.length - 1].textContent || '').slice(-500);
  }

  function contIsStreaming() {
    const stopBtn = document.querySelector('button[aria-label*="Stop" i], button[aria-label*="Parar" i], button[aria-label*="停止" i], button[data-testid*="stop" i]');
    return !!stopBtn;
  }

  function contHasRecentMcpError() {
    const txt = contGetLastAssistantText();
    if (!txt.includes('[MCP ERROR]')) return false;
    return true;
  }

  function contFindResendBtn() {
    // 1. Por aria-label (casos conocidos)
    const sels = '[aria-label*="Resend" i], [aria-label*="Reintentar" i], [aria-label*="Retry" i], [aria-label*="Send again" i], [aria-label*="Enviar de nuevo" i]';
    const cands = document.querySelectorAll(sels);
    for (const b of cands) if (b.offsetParent !== null && !b.disabled) return b;
    // 2. Por texto visible (caso "Check network and retry")
    const allButtons = document.querySelectorAll('button, [role="button"]');
    for (const b of allButtons) {
      if (b.offsetParent === null || b.disabled) continue;
      const t = (b.textContent || '').toLowerCase().trim();
      if (!t || t.length > 60) continue;
      if (/check\s*network|retry|reintentar|reconnect|reconect|network\s*error|volver\s*a\s*intentar|try\s*again/i.test(t)) return b;
    }
    return null;
  }

  function contFindContinueBtn() {
    const cands = document.querySelectorAll('[aria-label*="Continue" i], [aria-label*="Continuar" i], [aria-label*="Resume" i]');
    for (const b of cands) if (b.offsetParent !== null && !b.disabled) return b;
    return null;
  }

  function contDetectDoneSignal() {
    if (!state.contToken) return false;
    const txt = contGetLastAssistantText();
    const re = new RegExp('DONE\\s+' + state.contToken, 'i');
    return re.test(txt);
  }

  function contUserTyped() {
    const ta = findChatTextarea();
    if (!ta || !ta.value.trim()) return false;
    const v = ta.value.trim();
    if (v.startsWith(CONFIG.CONT_HB_PREFIX)) return false;
    return true;
  }

  function contLog(msg) {
    log('CONT: ' + msg);
    if (typeof logPanel === 'function') logPanel('<b>CONT</b> ' + msg);
  }

  function contStart() {
    if (state.contActive) return;
    state.contToken = contGenToken();
    state.contActive = true;
    state.contHb = 0;
    state.contLastActivity = Date.now();
    state.contAssistantCount = contDetectAssistantCount();
    state.contLastAssistantText = contGetLastAssistantText();
    state.contFirstDoneAt = 0;
    state.contDoneStreak = 0;
    state.contLastDoneCount = 0;
    updateFAB();
    contLog('iniciado, token=' + state.contToken);
    if (state.contTimer) clearInterval(state.contTimer);
    state.contTimer = setInterval(contTick, CONFIG.CONT_CHECK_MS);
    contPersist();
    contKeepAlive(true);
  }

  function contStop(reason) {
    if (!state.contActive) return;
    state.contActive = false;
    if (state.contTimer) { clearInterval(state.contTimer); state.contTimer = null; }
    try { localStorage.removeItem('tb_cont_state'); } catch (e) {}
    contKeepAlive(false);
    updateFAB();
    toast('CONT detenido: ' + reason);
    contLog('detenido: ' + reason);
  }

  function contUmbral() {
    if (state.contFirstDoneAt) return CONFIG.CONT_UMBRAL_DONE;
    if (state.busy || state.pendingTimers.size > 0) return CONFIG.CONT_UMBRAL_TOOLCALL;
    return CONFIG.CONT_UMBRAL_IDLE;
  }

  function contTick() {
    if (!state.contActive) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      if (!state.contOffline) {
        state.contOffline = true;
        contLog('sin red, watchdog pausado');
        toast('Sin red: watchdog pausado');
      }
      state.contLastActivity = Date.now();
      return;
    }
    if (state.contOffline) {
      state.contOffline = false;
      contLog('red recuperada, watchdog reanudado');
      toast('Red recuperada: watchdog reanudado');
      state.contLastActivity = Date.now();
    }
    contPersist();
    if (contUserTyped()) { contStop('usuario escribio'); return; }
    if (contDetectDoneSignal()) {
      const ac = contDetectAssistantCount();
      if (ac > state.contLastDoneCount) {
        state.contDoneStreak++;
        state.contLastDoneCount = ac;
        contLog('DONE detectado (' + state.contDoneStreak + '/3)');
        if (state.contDoneStreak >= 3) { contStop('DONE x3 confirmado'); return; }
      }
    } else {
      state.contDoneStreak = 0;
      state.contLastDoneCount = 0;
    }
    const count = contDetectAssistantCount();
    const txt = contGetLastAssistantText();
    const busy = state.busy || state.pendingTimers.size > 0;
    const streaming = contIsStreaming();
    const changed = (count !== state.contAssistantCount) || (txt !== state.contLastAssistantText);
    if (changed || busy || streaming) {
      state.contLastActivity = Date.now();
      state.contAssistantCount = count;
      state.contLastAssistantText = txt;
      if (state.contHb > 0) { state.contHb = 0; contLog('reset por actividad'); }
      return;
    }
    let umbral = contUmbral();
    const think = document.querySelector('.ds-think-content, [class*="think-content"]');
    if (think && think.offsetParent !== null) umbral *= 2;
    if (Date.now() - state.contLastActivity < umbral) return;
    if (contHasRecentMcpError()) {
      contLog('esperando reaccion a MCP ERROR');
      state.contLastActivity = Date.now();
      return;
    }
    const resend = contFindResendBtn();
    if (resend) { resend.click(); contLog('resend pulsado'); state.contLastActivity = Date.now(); return; }
    const cont = contFindContinueBtn();
    if (cont) { cont.click(); contLog('continue pulsado'); state.contLastActivity = Date.now(); return; }
    if (state.contHb >= CONFIG.CONT_MAX_HB) { contStop('maximo de heartbeats'); return; }
    contSendHeartbeat();
  }

  async function contSendHeartbeat() {
    const ta = findChatTextarea();
    if (!ta || ta.value.trim()) { contLog('textarea ocupado, esperando'); return; }
    state.contHb++;
    const text = contHBText(state.contHb, state.contToken);
    if (!setTextarea(text)) { contLog('no pude pegar HB'); return; }
    contLog('HB ' + state.contHb + '/' + CONFIG.CONT_MAX_HB + ' enviado');
    await new Promise(r => setTimeout(r, 500));
    const ok = await clickSend();
    if (!ok) contLog('clickSend fallo en HB');
    state.contLastActivity = Date.now();
    updateFAB();
  }

  function contPersist() {
    const data = {
      active: state.contActive,
      token: state.contToken,
      hb: state.contHb,
      lastActivity: state.contLastActivity,
      assistantCount: state.contAssistantCount,
      doneStreak: state.contDoneStreak,
      lastDoneCount: state.contLastDoneCount,
      mode: state.mode,
      ts: Date.now()
    };
    try { localStorage.setItem('tb_cont_state', JSON.stringify(data)); } catch (e) {}
  }

  function contRestore() {
    try {
      const raw = localStorage.getItem('tb_cont_state');
      if (!raw) return;
      const d = JSON.parse(raw);
      if (!d || !d.active) return;
      // Solo restaurar si fue hace menos de 30 min
      if (Date.now() - (d.ts || 0) > 30 * 60 * 1000) {
        localStorage.removeItem('tb_cont_state');
        return;
      }
      state.contActive = true;
      state.contToken = d.token || contGenToken();
      state.contHb = d.hb || 0;
      state.contLastActivity = Date.now();
      state.contAssistantCount = contDetectAssistantCount();
      state.contDoneStreak = d.doneStreak || 0;
      state.contLastDoneCount = d.lastDoneCount || 0;
      log('CONT restaurado, token=' + state.contToken);
      if (state.contTimer) clearInterval(state.contTimer);
      state.contTimer = setInterval(contTick, CONFIG.CONT_CHECK_MS);
      contKeepAlive(true);
      updateFAB();
    } catch (e) {}
  }

  function contKeepAlive(alive) {
    try {
      safeSendMessage({ type: 'KEEP_ALIVE', alive: !!alive }, (r) => {
        if (r && r.ok) log('tab marcado alive=' + alive);
        else log('KEEP_ALIVE fallo: ' + ((r && r.error) || 'sin respuesta'), 'warn');
      });
    } catch (e) {}
  }

  function contOnVisibility() {
    if (document.visibilityState === 'hidden') {
      if (state.contActive) {
        contPersist();
        log('CONT: pagina oculta, estado persistido');
      }
    } else {
      const raw = localStorage.getItem('tb_cont_state');
      if (raw && !state.contActive) {
        contRestore();
      }
      if (state.contActive) {
        state.contLastActivity = Date.now();
        if (!state.contTimer) state.contTimer = setInterval(contTick, CONFIG.CONT_CHECK_MS);
        contKeepAlive(true);
        log('CONT: pagina visible, watchdog reanudado');
      }
    }
  }

  // ===== FAB =====
  function ensureFAB() {
    if (document.getElementById('tb-fab')) return;
    const style = document.createElement('style');
    style.textContent =
      '#tb-fab{position:fixed;right:12px;bottom:90px;z-index:99999;font-family:monospace;font-size:12px;user-select:none;display:flex;flex-direction:column-reverse;gap:8px;align-items:flex-end;}' +
      '#tb-fab-toggle{width:48px;height:48px;border-radius:50%;background:#2b6cb0;color:#fff;border:none;font-size:22px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.5);padding:0;display:flex;align-items:center;justify-content:center;}' +
      '#tb-fab-toggle:active{opacity:.7;}' +
      '#tb-fab-panel{display:none;flex-direction:column;gap:6px;background:#222;padding:8px;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,.5);width:200px;box-sizing:border-box;}' +
      '#tb-fab.open #tb-fab-panel{display:flex;}' +
      '#tb-fab-status{background:#333;color:#fff;padding:6px 10px;border-radius:6px;text-align:center;}' +
      '#tb-fab-stats{background:#111;color:#ccc;padding:4px 8px;border-radius:6px;text-align:center;font-size:11px;}' +
      '#tb-fab-debug{background:#111;color:#888;padding:4px 8px;border-radius:6px;text-align:center;font-size:10px;}' +
      '#tb-fab button:not(#tb-fab-toggle){background:#2b6cb0;color:#fff;border:none;padding:6px 10px;border-radius:6px;font-family:monospace;font-size:11px;cursor:pointer;text-align:center;width:100%;box-sizing:border-box;}' +
      '#tb-fab button:not(#tb-fab-toggle):hover{opacity:.85;}' +
      '.tb-ok{color:#4caf50;}.tb-err{color:#f44336;}.tb-warn{color:#ff9800;}';
    document.head.appendChild(style);

    const fab = document.createElement('div');
    fab.id = 'tb-fab';
    fab.innerHTML =
      '<button id="tb-fab-toggle" title="Termux Bridge">🤖</button>' +
      '<div id="tb-fab-panel">' +
        '<div id="tb-fab-status">● init</div>' +
        '<div id="tb-fab-stats"></div>' +
        '<div id="tb-fab-debug"></div>' +
        '<button id="tb-fab-dangerous">peligrosos: on</button>' +
        '<button id="tb-fab-mode">modo: --</button>' +
        '<button id="tb-fab-inject">forzar prompt</button>' +
        '<button id="tb-fab-clean">ocultar resultados</button>' +
        '<button id="tb-fab-scan">escanear ahora</button>' +
        '<button id="tb-fab-cont-stop" style="display:none;background:#c53030;">CONT: STOP</button>' +
      '</div>';
    document.body.appendChild(fab);

    document.getElementById('tb-fab-toggle').onclick = () => fab.classList.toggle('open');
    document.getElementById('tb-fab-mode').onclick = () => {
      state.mode = state.mode === 'off' ? 'semi' : (state.mode === 'semi' ? 'auto' : (state.mode === 'auto' ? 'cont' : 'off'));
      localStorage.setItem('tb_mode', state.mode);
      if (state.mode === 'cont') { contStart(); }
      else if (state.contActive) { contStop('cambio de modo'); }
      updateFAB();
      toast('Modo: ' + state.mode.toUpperCase());
    };
    document.getElementById('tb-fab-dangerous').onclick = () => {
      state.dangerousConfirm = !state.dangerousConfirm;
      localStorage.setItem('tb_dangerous', state.dangerousConfirm ? 'on' : 'off');
      updateFAB();
    };
    document.getElementById('tb-fab-inject').onclick = () => forceInjectPrompt();
    document.getElementById('tb-fab-clean').onclick = () => {
      let n = 0;
      for (const el of queryAll(CONFIG.SEL_MESSAGE_CONTAINER)) {
        if ((el.textContent || '').trim().startsWith('[MCP RESULT')) {
          el.style.display = 'none'; n++;
        }
      }
      log(n + ' resultados ocultos');
    };
    document.getElementById('tb-fab-cont-stop').onclick = () => { contStop('boton manual'); };
    document.getElementById('tb-fab-scan').onclick = () => {
      log('Escaneo manual...');
      fullScan();
      toast('Escaneo completo. ' + state.scanCount + ' bloques vistos, ' + state.parseFails + ' fallos de parseo.');
    };
    updateFAB();
  }

  function updateFAB() {
    const s = document.getElementById('tb-fab-status');
    const st = document.getElementById('tb-fab-stats');
    const dbg = document.getElementById('tb-fab-debug');
    const d = document.getElementById('tb-fab-dangerous');
    if (!s || !st) return;
    let status = '';
    if (state.nonceOk === true) status = '<span class="tb-ok">● nonce ok</span>';
    else if (state.nonceOk === false) status = '<span class="tb-warn">● nonce mismatch</span>';
    else status = '<span>● esperando...</span>';
    s.innerHTML = status;
    const ex = parseInt(state.stats.executed, 10) || 0;
    const pe = parseInt(state.stats.pending, 10) || 0;
    const er = parseInt(state.stats.errors, 10) || 0;
    st.innerHTML = '<span class="tb-ok">v' + ex + '</span> ' +
                   '<span class="tb-warn">+' + pe + '</span> ' +
                   '<span class="tb-err">X' + er + '</span>';
    if (dbg) dbg.textContent = 'scan:' + state.scanCount + ' fail:' + state.parseFails + ' ub:' + state.userBlocks;
    if (d) d.textContent = 'peligrosos: ' + (state.dangerousConfirm ? 'on' : 'off');
    const m = document.getElementById('tb-fab-mode');
    if (m) m.textContent = 'modo: ' + state.mode.toUpperCase();
    const cs = document.getElementById('tb-fab-cont-stop');
    if (cs) cs.style.display = state.contActive ? 'block' : 'none';
    if (state.contActive && dbg) dbg.textContent += ' | hb:' + state.contHb + '/' + CONFIG.CONT_MAX_HB + ' | tk:' + (state.contToken || '-');
  }

  // ===== OBSERVER =====
  const seenNodes = new WeakSet();

  function getConvId() {
    const m = location.pathname.match(/\/a\/chat\/s\/([a-f0-9-]+)/i);
    return m ? m[1] : 'default';
  }

  function execKey(tc) {
    return getConvId() + '::' + tc.id;
  }

  const userMsgCache = new WeakMap();
  function isUserMessageNode(el) {
    if (!el || !el.closest) return false;
    if (userMsgCache.has(el)) return userMsgCache.get(el);
    const sels = [
      '[data-message-author-role="user"]',
      '.ds-message.user',
      '.ds-message-user',
      '[class*="user-message"]',
      '[class*="userMessage"]'
    ];
    let result = false;
    for (const s of sels) {
      try {
        if (el.closest(s)) { result = true; break; }
      } catch (e) {}
    }
    if (result) state.userBlocks++;
    userMsgCache.set(el, result);
    return result;
  }

  function scanNode(node) {
    if (node.nodeType !== 1 || seenNodes.has(node)) return;
    state.scanCount++;
    if (isUserMessageNode(node)) { seenNodes.add(node); return; }
    const calls = extractToolCalls(node);
    if (calls.length > 0) seenNodes.add(node);
    for (const c of calls) scheduleExecution(c.data, c.el);
  }

  const pendingNodes = new Set();
  let scanTimer = null;
  let lastStreamCheck = 0;
  let isStreaming = false;

  function detectStreaming() {
    const now = Date.now();
    if (now - lastStreamCheck < 500) return isStreaming;
    lastStreamCheck = now;
    // El boton de stop suele tener aria-label con stop/parar o un icono cuadrado
    const stopBtn = document.querySelector('button[aria-label*="Stop" i], button[aria-label*="Parar" i], button[aria-label*="停止" i], button[data-testid*="stop" i]');
    isStreaming = !!stopBtn;
    return isStreaming;
  }

  function flushScanQueue() {
    scanTimer = null;
    if (pendingNodes.size === 0) return;
    const nodes = Array.from(pendingNodes);
    pendingNodes.clear();
    for (const n of nodes) {
      if (n.isConnected) scanNode(n);
    }
  }

  function scheduleScan(node) {
    pendingNodes.add(node);
    if (scanTimer !== null) return;
    const delay = detectStreaming() ? 2000 : 500;
    scanTimer = setTimeout(flushScanQueue, delay);
  }

  let observerLastRun = 0;
  const observer = new MutationObserver((mutations) => {
    const now = Date.now();
    if (now - observerLastRun < 250) return;
    observerLastRun = now;
    for (const mut of mutations) {
      for (const node of mut.addedNodes) {
        if (node.nodeType !== 1) continue;
        const hasCode = node.tagName === 'PRE' || node.tagName === 'CODE' ||
                        (node.querySelector && node.querySelector('pre, code'));
        if (!hasCode) continue;
        const txt = node.textContent || '';
        if (txt.length > 100000) continue;
        if (txt.indexOf('tool_call') < 0) continue;
        scheduleScan(node);
      }
    }
  });

  function fullScan() {
    let msgs = [];
    try { msgs = document.querySelectorAll(CONFIG.SEL_ASSISTANT.join(',')); } catch (e) {}
    const start = Math.max(0, msgs.length - 20);
    const seen = new Set();
    for (let i = start; i < msgs.length; i++) {
      for (const b of msgs[i].querySelectorAll('pre, code')) {
        if (seen.has(b)) continue;
        seen.add(b);
        const t = b.textContent || '';
        if (t.length > 100000) continue;
        if (t.indexOf('tool_call') < 0) continue;
        scanNode(b);
      }
    }
    updateFAB();
  }

  function onUrlChange() {
    if (location.href === state.lastUrl) return;
    state.lastUrl = location.href;
    if (state.contActive) contStop('cambio de URL');
    state.executionEpoch++;
    log('URL cambio epoch=' + state.executionEpoch);
    // Cancelar timers pendientes
    for (const t of state.pendingTimers.values()) clearTimeout(t);
    state.pendingTimers.clear();
    state.blockData.clear();
    pendingNodes.clear();
    state.busy = false;
    state.stats.pending = 0;
    state.nonceOk = null;
    updateFAB();
    fullScan();
    setTimeout(tryAutoInject, 2000);
  }

  function initUrlObserver() {
    window.addEventListener('popstate', onUrlChange);
    window.addEventListener('hashchange', onUrlChange);
    window.addEventListener('tb:locationchange', onUrlChange);
  }

  function injectMainWorld() {
    try {
      const s = document.createElement('script');
      s.src = chrome.runtime.getURL('inject-main.js');
      s.onload = () => s.remove();
      (document.head || document.documentElement).appendChild(s);
    } catch (e) { log('No pude inyectar main-world', 'warn'); }
  }

  function boot() {
    if (!document.body) { setTimeout(boot, 100); return; }
    if (CONFIG.NONCE.indexOf('PLACEHOLDER') !== -1) {
      console.error('[TermuxBridge] Falta correr install primero.');
      return;
    }
    injectMainWorld();
    ensureFAB();
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    initUrlObserver();
    fullScan();
    setInterval(fullScan, 5000);
    setTimeout(tryAutoInject, 2000);
    setTimeout(tryAutoInject, 6000);
    document.addEventListener('visibilitychange', contOnVisibility);
    setTimeout(contRestore, 3000);
    log('listo, nonce=' + CONFIG.NONCE);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
