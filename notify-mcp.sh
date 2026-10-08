#!/data/data/com.termux/files/usr/bin/bash
set +e
timeout 5 termux-notification-remove mdsb-mcp 2>/dev/null
timeout 10 termux-notification \
  --id mdsb-mcp \
  --title "DeepSeek Termux Bridge" \
  --content "MCP activo en 127.0.0.1:8081" \
  --ongoing \
  --priority low \
  --icon terminal \
  --button1 "Detener" \
  --button1-action "pkill -9 -f termux-native-mcp; termux-notification-remove mdsb-mcp"
echo "✅ Notificación enviada (o timeout)"
