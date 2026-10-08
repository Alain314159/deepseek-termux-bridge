#!/data/data/com.termux/files/usr/bin/bash
set +e

# Origen CORS permitido para que la extension pueda hacer fetch desde el navegador
export TERMUX_NATIVE_MCP_ORIGIN="https://chat.deepseek.com"

# Puerto y host (defaults: 8081, 127.0.0.1)
export TERMUX_NATIVE_MCP_PORT="8081"
export TERMUX_NATIVE_MCP_HOST="127.0.0.1"

echo "Deteniendo instancias previas..."
pkill -f termux-native-mcp 2>/dev/null
pkill -f "termux-mcp" 2>/dev/null
sleep 1

echo "Arrancando termux-native-mcp (puerto 8081)..."
echo "   ORIGIN=$TERMUX_NATIVE_MCP_ORIGIN"
nohup termux-native-mcp > ~/native-mcp.log 2>&1 &
PID=$!
echo "   PID: $PID"
sleep 4

if grep -q "listening on" ~/native-mcp.log; then
  echo "   OK Servidor arrancado"
  tail -5 ~/native-mcp.log
else
  echo "   ERROR al arrancar:"
  cat ~/native-mcp.log
  exit 1
fi

echo ""
echo "Test handshake con Origin..."
RESP=$(curl -s -m 5 -X POST http://127.0.0.1:8081/mcp \
  -H "Origin: $TERMUX_NATIVE_MCP_ORIGIN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"cli-test","version":"1.0"}}}')

if echo "$RESP" | grep -q "serverInfo"; then
  echo "   OK Handshake exitoso"
  echo "$RESP" | head -c 200
else
  echo "   ERROR handshake:"
  echo "$RESP"
  exit 1
fi

echo ""
echo "Listo. Puerto 8081 con CORS habilitado para $TERMUX_NATIVE_MCP_ORIGIN"
