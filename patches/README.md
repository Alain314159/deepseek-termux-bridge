# Parches locales para termux-native-mcp

## CORS

El servidor original no devuelve headers `Access-Control-Allow-*`, por lo que
el navegador rechaza las peticiones desde chat.deepseek.com aunque el servidor
responda 200 OK desde curl.

`mcp_transport_http.py.cors-patched` añade:
- `_cors_headers()` que devuelve los headers necesarios cuando hay Origin
- Inyecta esos headers en `_send_body()` (todas las respuestas)
- Los añade también a `do_OPTIONS()` (preflight)

### Aplicar tras reinstalar termux-mcp

    bash patches/apply-cors.sh
    pkill -f termux-native-mcp
    bash start-mcp.sh
