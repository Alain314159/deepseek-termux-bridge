#!/data/data/com.termux/files/usr/bin/bash
# Watchdog: revisa cada 60s si el MCP responde. Si no, lo relanza.
LOG=~/watchdog-mcp.log
CHECK_URL="http://127.0.0.1:8081/mcp"
CHECK_BODY='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"wd","version":"1"}}}'

echo "[$(date +%H:%M:%S)] watchdog iniciado" >> $LOG

while true; do
  RESP=$(timeout 5 curl -s -m 3 -o /dev/null -w "%{http_code}" \
    -X POST "$CHECK_URL" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json, text/event-stream" \
    -d "$CHECK_BODY" 2>/dev/null)
  if [ "$RESP" != "200" ]; then
    echo "[$(date +%H:%M:%S)] MCP no responde (HTTP=$RESP). Relanzando..." >> $LOG
    bash ~/deepseek-termux-bridge/start-mcp.sh >> $LOG 2>&1
    sleep 10
  fi
  sleep 60
done
