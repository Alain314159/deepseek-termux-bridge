#!/data/data/com.termux/files/usr/bin/bash
# Reaplica el parche CORS a termux-native-mcp
# Uso: bash patches/apply-cors.sh
set -e

TARGET="$(python3 -c 'import termux_mcp, os; print(os.path.join(os.path.dirname(termux_mcp.__file__), "mcp_transport_http.py"))')"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PATCHED="$SCRIPT_DIR/mcp_transport_http.py.cors-patched"

if [ ! -f "$TARGET" ]; then echo "❌ No existe $TARGET"; exit 1; fi
if [ ! -f "$PATCHED" ]; then echo "❌ No existe $PATCHED"; exit 1; fi

cp "$TARGET" "$TARGET.bak.$(date +%Y%m%d_%H%M%S)"
cp "$PATCHED" "$TARGET"
echo "✅ Parche CORS aplicado a $TARGET"
echo "   Reinicia el servidor: pkill -f termux-native-mcp; bash start-mcp.sh"
