# DeepSeek Termux Bridge

Puente entre chat.deepseek.com (web gratis, sin API) y Termux en Android.

## Como funciona

1. En el chat, DeepSeek propone comandos shell en bloques ```sh```.
2. La extension detecta los bloques e inyecta un boton ▶ Ejecutar.
3. Al tocar, hace fetch al servidor termux-native-mcp en http://127.0.0.1:8081/mcp
4. El servidor ejecuta el comando en shell real de Termux.
5. La respuesta se formatea como [AGENT REPORT] y se pega en el textarea.
6. DeepSeek continua el ciclo.

## Requisitos

- Termux con termux-mcp instalado (pip install termux-mcp)
- termux-native-mcp corriendo en 127.0.0.1:8081
- Chrome/Chromium en Android (probado con Titanium)
- Extension cargada en modo desarrollador

## Arrancar servidor

    bash start-mcp.sh

O manual:

    nohup termux-native-mcp > ~/native-mcp.log 2>&1 &

## Cargar extension en Titanium

1. Abre titanium://extensions
2. Activa Modo desarrollador
3. Cargar descomprimida -> ~/storage/downloads/extension/
4. Abre https://chat.deepseek.com

## Uso

- Boton flotante '>' abre panel. Arrastrable.
- Panel: estado MCP, toggle Auto (autopilot), I (inyectar prompt), L (limpiar ledger).
- Boton ▶ Ejecutar bajo cada bloque sh.
- Autopilot ON: ejecuta y pega [AGENT REPORT] automaticamente.

## Herramientas MCP destacadas

- run - ejecuta comando shell
- run_digest - resumen compacto
- git_pr - operaciones PR de GitHub
- session_run / session_poll - comandos largos
- terminal_open - PTY real visible

## Limitaciones

- node requiere confirmed:true o terminal real (necesita tty)
- Comandos riesgosos (rm -rf) bloqueados o requieren confirmacion
- El servidor MCP debe estar corriendo

## Licencia

MIT
