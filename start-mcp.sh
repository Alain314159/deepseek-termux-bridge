#!/data/data/com.termux/files/usr/bin/bash
set +e
echo "Deteniendo instancias previas..."
pkill -f termux-native-mcp 2>/dev/null
pkill -f "termux-mcp" 2>/dev/null
sleep 1
echo "Arrancando termux-native-mcp (puerto 8081)..."
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
echo "Test rapido (initialize)..."
curl -s -m 5 -X POST http://127.0.0.1:8081/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"cli-test","version":"1.0"}}}' \
  | head -c 300
echo ""
echo "Listo. Puerto 8081 escuchando."
