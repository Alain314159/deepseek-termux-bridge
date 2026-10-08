#!/data/data/com.termux/files/usr/bin/bash
set +e

export TERMUX_NATIVE_MCP_ORIGIN="https://chat.deepseek.com"
export TERMUX_NATIVE_MCP_PORT="8081"
export TERMUX_NATIVE_MCP_HOST="127.0.0.1"

pkill -f termux-native-mcp 2>/dev/null
pkill -f "termux-mcp" 2>/dev/null
sleep 1

nohup termux-native-mcp > ~/native-mcp.log 2>&1 &
sleep 4

if grep -q "listening on" ~/native-mcp.log; then
  echo "✅ Servidor arriba"
else
  echo "❌ Error:"; cat ~/native-mcp.log; exit 1
fi

RESP=$(curl -s -m 3 -X POST http://127.0.0.1:8081/mcp \
  -H "Origin: $TERMUX_NATIVE_MCP_ORIGIN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"cli","version":"1.0"}}}')

if echo "$RESP" | grep -q "serverInfo"; then
  echo "✅ Handshake OK"
else
  echo "❌ Handshake falló:"; echo "$RESP"
fi
