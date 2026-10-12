# DeepSeek Termux Bridge v2

Puente entre chat.deepseek.com (gratis, sin API key) y Termux real en Android. La IA ejecuta comandos en un shell real, recibe los resultados, y continua trabajando de forma autonoma.

## Que hace

- Detecta bloques JSON `{"tool_call":...}` en las respuestas de DeepSeek.
- Los ejecuta en Termux via MCP (127.0.0.1:8081).
- Pega el resultado `[MCP RESULT]` en el chat.
- Repite el ciclo.

## Arquitectura

```
chat.deepseek.com (HTTPS)
  -> content.js detecta tool_call
  -> background.js fetch a http://127.0.0.1:8081/mcp
  -> termux-native-mcp ejecuta la tool en Termux
  <- resultado en el chat como [MCP RESULT]
```

## Modos

- **OFF** - no ejecuta nada. Boton manual por bloque.
- **SEMI** - ejecuta y pega, no envia.
- **AUTO** - ejecuta, pega y envia.
- **CONT** - autonomo. Watchdog con heartbeats si la IA se queda quieta.

## Herramientas

- 84 tools top-level (read, write, run, file_edit, session_*, terminal_*, git_pr, etc.).
- 87 smart tools via `{"name":"smart","arguments":{"tool":"file_edit","params":{...}}}`.
- Documentadas en `TOOLS.md`.

## Archivos

- `content.js` - content script, logica de la UI, deteccion, ejecucion.
- `background.js` - service worker, fetch al MCP.
- `manifest.json` - MV3 manifest.
- `inject-main.js` - observador de cambios de URL.
- `TOOLS.md` - documentacion de las 171 herramientas.
- `PLAN.md` - roadmap de mejoras pendientes.
- `gen-tools-doc-v2.py` - regenera TOOLS.md desde el schema del server.
- `start-mcp.sh`, `stop-mcp.sh`, `watchdog-mcp.sh` - arranque y supervision del server.

## Instalacion

1. En Termux: `pkg install termux-api` y la app Termux:API.
2. `pip install -e ~/termux-mcp` para el server MCP.
3. `pip install -e ~/termux-mcp` apuntando al repo donde vive termux-mcp.
4. Arrancar el server con `~/deepseek-termux-bridge/start-mcp.sh`.
5. En Titanium, cargar la carpeta `/sdcard/Download/deepseek-termux-bridge-v2/` como extension descomprimida.

## Modo CONT

En modo CONT, la extension vigila si la IA deja de responder. Si pasan 5 minutos sin actividad, le envia un heartbeat con un token unico. La IA debe responder con un tool_call o, si termino, escribir `DONE <token>` tres veces seguidas.

## Estado

- v2 en desarrollo activo.
- v1 archivada.

## Repositorio

https://github.com/Alain314159/deepseek-termux-bridge

## Entorno

- Android con Termux.
- Python 3.14.
- Titanium (Chromium con extensiones MV3).
- Todo se gestiona desde el telefono.
