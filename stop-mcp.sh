#!/data/data/com.termux/files/usr/bin/bash
set +e
pkill -9 -f termux-native-mcp 2>/dev/null
timeout 5 termux-notification-remove mdsb-mcp 2>/dev/null
echo "✅ Servidor detenido"
