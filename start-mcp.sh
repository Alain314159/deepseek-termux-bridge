#!/data/data/com.termux/files/usr/bin/bash
set +e

export TERMUX_NATIVE_MCP_ORIGIN="https://chat.deepseek.com"
export TERMUX_NATIVE_MCP_PORT="8081"
export TERMUX_NATIVE_MCP_HOST="127.0.0.1"

echo "Deteniendo instancias previas..."
pkill -9 -f termux-native-mcp 2>/dev/null
sleep 2
echo "   ✅ Detenido"

echo "Arrancando termux-native-mcp..."
nohup termux-native-mcp > ~/native-mcp.log 2>&1 &
echo "   PID: $!"
sleep 3

echo "Esperando a que responda..."
OK=0
for i in $(seq 1 10); do
  RESP=$(timeout 3 curl -s -m 2 -o /dev/null -w "%{http_code}" \
    -X POST http://127.0.0.1:8081/mcp \
    -H "Origin: $TERMUX_NATIVE_MCP_ORIGIN" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json, text/event-stream" \
    -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"cli","version":"1.0"}}}' 2>/dev/null)
  if [ "$RESP" = "200" ]; then
    OK=1
    echo "   ✅ Responde tras $i intentos"
    break
  fi
  sleep 2
done

if [ "$OK" != "1" ]; then
  echo "❌ No responde. Log:"
  tail -20 ~/native-mcp.log
  exit 1
fi

echo ""
echo "✅ MCP arriba."
echo "   Para notificación persistente: bash notify-mcp.sh"
echo "   Para detener: bash stop-mcp.sh"
