#!/data/data/com.termux/files/usr/bin/bash
set +e

export TERMUX_NATIVE_MCP_ORIGIN="https://chat.deepseek.com"
export TERMUX_NATIVE_MCP_PORT="8081"
export TERMUX_NATIVE_MCP_HOST="127.0.0.1"

# Detener instancia previa
pkill -f termux-native-mcp 2>/dev/null
termux-notification-remove mdsb-mcp 2>/dev/null
sleep 1

# Arrancar
nohup termux-native-mcp > ~/native-mcp.log 2>&1 &
sleep 4

if ! grep -q "listening on" ~/native-mcp.log; then
  echo "❌ Error:"
  cat ~/native-mcp.log
  exit 1
fi

# Notificación persistente
termux-notification \
  --id mdsb-mcp \
  --title "DeepSeek Termux Bridge" \
  --content "MCP activo en 127.0.0.1:8081" \
  --ongoing \
  --priority low \
  --icon terminal \
  --button1 "Detener" \
  --button1-action "pkill -f termux-native-mcp; termux-notification-remove mdsb-mcp"

# Test
RESP=$(curl -s -m 3 -X POST http://127.0.0.1:8081/mcp \
  -H "Origin: $TERMUX_NATIVE_MCP_ORIGIN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"cli","version":"1.0"}}}')

if echo "$RESP" | grep -q "serverInfo"; then
  echo "✅ MCP arriba. Notificación persistente activa."
else
  echo "⚠️  MCP responde pero sin serverInfo:"; echo "$RESP"
fi
