#!/data/data/com.termux/files/usr/bin/bash
pkill -f termux-native-mcp 2>/dev/null
termux-notification-remove mdsb-mcp 2>/dev/null
echo "✅ Servidor detenido"
