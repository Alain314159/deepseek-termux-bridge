// DeepSeek Termux Bridge — background service worker
// Hace los fetch al servidor MCP porque el content script no puede
// (mixed content: HTTPS → HTTP).

const MCP_URL = 'http://127.0.0.1:8081/mcp';
let mcpSession = null;
let mcpReady = false;
let mcpInitPromise = null;
let nextId = 2;

async function mcpHandshake(){
  if (mcpReady && mcpSession) return true;
  if (mcpInitPromise) return mcpInitPromise;

  mcpInitPromise = (async () => {
    console.log('[bg] handshake...');
    const r = await fetch(MCP_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream'
      },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1, method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'deepseek-termux-bridge', version: '1.0' }
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
    signal: opts.signal
  });
  const text = await r.text();
  const json = parseSSE(text);
  if (!json) throw new Error('respuesta MCP no parseable');
  if (json.error) throw new Error(json.error.message || 'MCP error');
  return json.result;
}

async function runCommand(cmd){
  const result = await mcpCall('run', { cmd });
  const content = (result.content || []).map(c => c.text || '').join('');
  const isError = !!result.isError;
  return {
    stdout: isError ? '' : content,
    stderr: isError ? content : '',
    exitCode: isError ? 1 : 0
  };
}

// Responder a mensajes del content script
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'MCP_PING'){
    mcpHandshake().then(() => sendResponse({ ok: true })).catch(e => sendResponse({ ok: false, error: e.message }));
    return true;
  }
  if (!msg || msg.type !== 'MCP_EXEC') return false;

  (async () => {
    try {
      const r = await runCommand(msg.cmd);
      sendResponse({ ok: true, result: r });
    } catch (e) {
      sendResponse({ ok: false, error: e.message });
    }
  })();

  return true; // mantener el canal abierto para respuesta asíncrona
});

console.log('[bg] background.js cargado');
