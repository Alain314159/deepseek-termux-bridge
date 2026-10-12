// background.js — Service worker MV3
const MCP_URL = 'http://127.0.0.1:8081/mcp';
let mcpSession = null;
let mcpReady = false;
let mcpInitPromise = null;
let nextId = 2;

async function mcpHandshake() {
  if (mcpReady && mcpSession) return true;
  if (mcpInitPromise) return mcpInitPromise;
  mcpInitPromise = (async () => {
    console.log('[bg] handshake...');
    const r = await fetch(MCP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1, method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'deepseek-termux-bridge', version: '2.0' }
        }
      })
    });
    const sid = r.headers.get('Mcp-Session-Id');
    if (!sid) throw new Error('sin Mcp-Session-Id');
    mcpSession = sid;
    await fetch(MCP_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'Mcp-Session-Id': mcpSession
      },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })
    });
    mcpReady = true;
    console.log('[bg] MCP listo, session=' + sid);
    return true;
  })().catch(e => {
    mcpInitPromise = null; mcpReady = false; mcpSession = null;
    console.error('[bg] handshake falló', e);
    throw e;
  });
  return mcpInitPromise;
}

function parseSSE(text) {
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (t.startsWith('data:')) {
      try { return JSON.parse(t.slice(5).trim()); } catch (e) {}
    }
  }
  try { return JSON.parse(text); } catch (e) {}
  return null;
}

async function mcpCall(tool, args, opts) {
  opts = opts || {};
  await mcpHandshake();
  try {
    return await mcpCallOnce(tool, args, opts);
  } catch (e) {
    if (!isSessionError(e)) throw e;
    console.warn('[bg] error de sesión, reconectando: ' + e.message);
    mcpReady = false; mcpSession = null; mcpInitPromise = null;
    await mcpHandshake();
    return await mcpCallOnce(tool, args, opts);
  }
}

function isSessionError(e) {
  if (!e) return false;
  const msg = String(e.message || e);
  if (/session/i.test(msg)) return true;
  if (/Mcp-Session-Id/i.test(msg)) return true;
  if (e.status === 401 || e.status === 403) return true;
  return false;
}

async function mcpCallOnce(tool, args, opts) {
  const id = nextId++;
  const controller = new AbortController();
  const timeoutMs = opts.timeoutMs || 120000;
  const t = setTimeout(() => controller.abort(), timeoutMs);
  let r;
  try {
    r = await fetch(MCP_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'Mcp-Session-Id': mcpSession
      },
      body: JSON.stringify({
        jsonrpc: '2.0', id,
        method: 'tools/call',
        params: { name: tool, arguments: args }
      }),
      signal: controller.signal
    });
  } finally { clearTimeout(t); }
  if (r.status === 401 || r.status === 403) {
    const err = new Error('HTTP ' + r.status);
    err.status = r.status;
    throw err;
  }
  const text = await r.text();
  const json = parseSSE(text);
  if (!json) throw new Error('respuesta MCP no parseable');
  if (json.error) {
    const msg = json.error.message || 'MCP error';
    if (/session/i.test(msg)) {
      const err = new Error(msg);
      err.status = 400;
      throw err;
    }
    throw new Error(msg);
  }
  return json.result;
}

async function runCommand(cmd, toolName, extraArgs) {
  const tool = toolName || 'run';
  const args = Object.assign({}, extraArgs || {});
  if (tool === 'run' || tool === 'run_digest') args.cmd = cmd;
  const result = await mcpCall(tool, args);
  const content = (result.content || []).map(c => c.text || '').join('');
  const isError = !!result.isError;
  const isShellToolA = (tool === 'run' || tool === 'run_digest');
  const sc = (isShellToolA && result.structuredContent) ? result.structuredContent : null;
  if (sc && typeof sc === 'object') {
    return {
      stdout: isError ? '' : content,
      stderr: isError ? content : '',
      exit_code: sc.exit_code != null ? sc.exit_code : (isError ? 1 : 0),
      cwd: sc.cwd || '',
      timed_out: !!sc.timed_out,
      cancelled: !!sc.cancelled,
      truncated: !!sc.truncated
    };
  }
  // Solo interpretar content como sobre si el tool es run/run_digest
  const isShellTool = (tool === 'run' || tool === 'run_digest');
  let parsed = null;
  if (isShellTool) { try { parsed = JSON.parse(content); } catch (e) {} }
  const looksLikeEnvelope = isShellTool && parsed && typeof parsed === 'object' &&
    ('stdout' in parsed || 'stderr' in parsed || 'exit_code' in parsed || 'cwd' in parsed);
  if (looksLikeEnvelope) {
    return {
      stdout: parsed.stdout || '',
      stderr: parsed.stderr || '',
      exit_code: parsed.exit_code != null ? parsed.exit_code : (isError ? 1 : 0),
      cwd: parsed.cwd || ''
    };
  }
  return {
    stdout: isError ? '' : content,
    stderr: isError ? content : '',
    exit_code: isError ? 1 : 0,
    cwd: ''
  };
}


async function markTabAlive(tabId, alive) {
  try {
    await chrome.tabs.update(tabId, { autoDiscardable: !alive });
    console.log('[bg] tab ' + tabId + ' autoDiscardable=' + (!alive));
    return true;
  } catch (e) {
    console.error('[bg] markTabAlive fallo:', e.message);
    return false;
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'KEEP_ALIVE') {
    const tid = (sender && sender.tab && sender.tab.id) || msg.tabId;
    if (tid) {
      markTabAlive(tid, !!msg.alive).then(ok => sendResponse({ ok }));
    } else {
      sendResponse({ ok: false, error: 'no tabId' });
    }
    return true;
  }

  if (msg && msg.type === 'MCP_PING') {
    mcpHandshake().then(() => sendResponse({ ok: true })).catch(e => sendResponse({ ok: false, error: e.message }));
    return true;
  }
  if (msg && msg.type === 'MCP_RESET') {
    mcpReady = false; mcpSession = null; mcpInitPromise = null;
    mcpHandshake().then(() => sendResponse({ ok: true })).catch(e => sendResponse({ ok: false, error: e.message }));
    return true;
  }
  if (!msg || msg.type !== 'MCP_EXEC') return false;
  (async () => {
    try {
      const r = await runCommand(msg.cmd, msg.toolName, msg.args);
      sendResponse({ ok: true, result: r });
    } catch (e) {
      sendResponse({ ok: false, error: e.message });
    }
  })();
  return true;
});

console.log('[bg] background.js v2 cargado');
