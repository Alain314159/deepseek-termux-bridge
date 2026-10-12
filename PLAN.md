# Plan de mejoras del bridge

Documento vivo. Cada ítem tiene ID para referenciar. Marcar [x] al completar.

## Bloque A — Flujo agente real

### A1 [ALTA] Cola de mensajes cuando el textarea esta ocupado
Problema: si el textarea tiene texto, el resultado no se pega. Se pierde.
Fix: `sendResult` ya reintenta 20 veces x 500ms = 10s. Ampliar a 5 min y encolar los resultados pendientes. Cuando el textarea se vacie, pegar el siguiente de la cola.
Implementacion: `state.resultQueue = []`, worker que cada 1s revisa si el textarea esta libre y saca el siguiente.

### A2 [ALTA] Multiples tool_calls en una respuesta
Problema: la IA emite un tool_call y espera. Podria emitir varios en un mensaje.
Fix: `extractToolCalls` ya devuelve array. Hoy `scheduleExecution` se llama por cada uno, pero comparten timer. Separar: ejecutar en orden, encolar los resultados, y cuando todos terminen, pegar los resultados concatenados en un solo mensaje.
Implementacion: `state.batch = {id, calls:[], results:[]}`, cuando el ultimo call termina, unir y enviar.

### A3 [ALTA] Comandos muy largos sin timeout
Problema: `run` corta a 120s. `vite build` tarda 45s pero algunos npm install tardan mas.
Fix: timeout configurable por llamada (`timeout` en arguments), y si el LLM no lo especifica, default 600s. Actualizar RUN_TIMEOUT_MS a 600000 y respetar `rawArgs.timeout`.
Implementacion: en `execViaBackground`, usar `(args.timeout * 1000) || CONFIG.RUN_TIMEOUT_MS`.

### A4 [ALTA] Timeout con partial output
Problema: si `run` corta por timeout, se pierde el output producido.
Server fix: `_execute_command` acumula chunks. Al detectar timeout, devolver el buffer en vez de descartarlo. Ya lo hace parcialmente pero el `Timed out after Ns` reemplaza el output. Fix: mantener el output + append de la marca.

### A5 [ALTA] pkill que no se mate a si mismo
Problema: `pkill -f 'vite build'` mato 3 veces al propio server.
Fix: smart tool wrapper `safe_pkill` que añade `-o` (oldest) o excluye el PID del proceso actual. Alternativa: interceptar en la extension y reescribir.

### A6 [MEDIA] Varios comandos en un mensaje sin esperar
La IA podria emitir varios tool_calls y no esperar uno a uno. Hoy el `while (state.busy)` los serializa. Mejor: si vienen 3 en un mensaje, los 3 se ejecutan en secuencia rapida, y el resultado se pega como un solo bloque con los 3.
Relacionado con A2.

## Bloque B — Recordatorios y system prompt

### B1 [ALTA] Recordatorio mas frecuente
Problema: REMINDER_EVERY = 10. La IA se olvida de cosas.
Fix: bajar a 5.

### B2 [ALTA] Recordatorio variado
Problema: siempre dice lo mismo, se vuelve ruido.
Fix: pool de 6-8 mensajes. Rotar segun `assistantCount % 8`.
Mensajes propuestos:
- Formato correcto del tool_call (el actual)
- "Recorda leer TOOLS.md si dudas sobre que tool usar"
- "Antes de un comando destructivo, considera sandbox_run"
- "Si la tarea toca varios archivos, usa tx_begin"
- "Usa file_edit en vez de write para cambios puntuales"
- "Si el comando tarda mas de 60s, usa session_run"
- "Considera project_run en vez de armar comandos a mano"
- "Revisa el resultado con read si no estas seguro"

### B3 [ALTA] Inyectar prompt de vez en cuando ademas del reminder
Problema: la IA pierde el contexto del system prompt inicial.
Fix: cada 20 comandos, reinyectar el SYSTEM_PROMPT completo (o un resumen). Sirve cuando la conversacion lleva muchas vueltas y la IA empieza a olvidar reglas.

### B4 [MEDIA] Mejorar el system prompt
Actual es funcional pero podria incluir:
- Ejemplos de cada herramienta comun (read/write/file_edit/project_run/session_run)
- Recordatorio de que TOOLS.md tiene 171 secciones
- Guia de cuando usar smart vs top-level
- Politica de commit: no hacer hasta que el usuario lo pida
- Politica de tests: correr antes y despues de cambios

### B5 [MEDIA] Prompt especifico cuando mode=CONT
En modo CONT, inyectar instrucciones adicionales: trabajar sin parar, no esperar respuesta, usar DONE con token para terminar.

## Bloque C — Edicion y archivos

### C1 [ALTA] undo_last_edit sin argumentos
Fix: atajo en la extension o wrapper smart. Actualmente `undo` requiere task_id. Añadir `undo_last_edit` que resuelve el ultimo task_id del historial y lo pasa.

### C2 [ALTA] grep_content(pattern, path, context)
Server side: nueva smart tool. Hoy `search` solo por nombre. `grep_content` hace `grep -rn` con contexto, devuelve JSON estructurado.

### C3 [MEDIA] file_outline(path)
Devolver solo la estructura (funciones/clases/exports) de un archivo grande sin leer 5400 lineas.

### C4 [MEDIA] read con offset/limit/lines
El schema del server soporta solo `path`. Añadir `offset`, `limit`, `lines` para leer rangos.

### C5 [MEDIA] apply_patch con unified diff
Alternativa a file_edit para cambios multi-hunk. Formato V4A.

### C6 [BAJA] insert_after_line, delete_lines, append_to_file
Combinaciones de file_edit que hoy se pueden hacer con scripts. Atajos.

## Bloque D — Verificacion y flujos

### D1 [ALTA] verify_change como receta
Syntax + lint + build + test en un solo flujo. Puede ser un playbook guardado.

### D2 [ALTA] flow_verify_and_commit
verify_change + git_commit + push. Lo hace 15 veces al dia.

### D3 [MEDIA] project_health
Estado del proyecto en una llamada: build OK, tests OK, lint OK, deps al dia.

### D4 [MEDIA] cleanup_project
Borrar .bak viejos, snapshots huerfanos, node_modules incompletos.

### D5 [MEDIA] test_run estructurado
Correr npm test y devolver JSON {passed, failed, failures:[{test,error}]}.

## Bloque E — Contexto y memoria

### E1 [ALTA] Log de decisiones
Archivo `~/proyecto/.bridge/decisions.md` o JSON. La IA lo lee/escribe con read/file_edit. Convencion, no codigo.

### E2 [ALTA] Log de gotchas
Similar a E1 pero con errores conocidos y sus fixes.

### E3 [MEDIA] pattern_library
Patrones que funcionaron (ej: migracion de store).

### E4 [MEDIA] session_summary
Al final de cada sesion, resumen: archivos tocados, comandos clave, estado.

## Bloque F — Transporte e infraestructura

### F1 [GRANDE] WebSocket persistente
Reemplazar fetch por WS. Reduce latencia 80%, habilita streaming real y notificaciones push.
Cambio arquitectonico en background.js y server.

### F2 [GRANDE] Streaming real con chunks
El server emite, la extension recibe. Permite ver builds avanzar en vivo.
Depende de F1.

### F3 [MEDIA] Watchdog mejorado
Ya existe. Añadir: chequeo cada 30s en vez de 60, y log rotativo.

### F4 [MEDIA] Termux:API para wake-lock real
Instalar app Termux:API para que `termux-wake-lock` funcione.

### F5 [MEDIA] Persistencia de sesiones tmux entre reinicios
Guardar listado en archivo y reconstruir al arrancar.

## Bloque G — Rendimiento de la web

### G1 [ALTA] Evitar lag durante streaming
Ya aplicado: throttle observer, quitar setInterval, fullScan optimizado.
Pendiente: verificar que no haya regresiones.

### G2 [MEDIA] background.js sin bloquear
Hoy el fetch es por turno. Si la IA emite varios comandos, se serializan.
Con F1 se resuelve.

## Bloque H — Analisis de codigo

### H1 [MEDIA] smell_scan
Detectar code smells sin ESLint completo.

### H2 [MEDIA] circular_deps
Detectar dependencias circulares con madge.

### H3 [MEDIA] dead_code
Como knip, exports sin usar.

### H4 [BAJA] complexity_report
Funciones con complejidad alta.

### H5 [BAJA] bundle_analyze
Que pesa en el bundle.

## Bloque I — Testing

### I1 [ALTA] browser_test con screenshot
Chromium headless con screenshot + interaccion.

### I2 [MEDIA] browser_console
Leer consola del navegador sin inyectar HTML.

### I3 [MEDIA] lint_errors_only
Solo errores, no warnings de prettier.

### I4 [MEDIA] lint_since(commit/file)
Lint solo de lo que cambio.

## Prioridad global (por impacto/tiempo)

Fase 1 (esta semana):
- A1 Cola de mensajes
- A2 Multiples tool_calls
- A3 Timeout configurable
- A4 Partial output
- A5 pkill seguro
- B1 Recordatorio cada 5
- B2 Recordatorio variado
- B3 Reinject periodico

Fase 2 (proxima semana):
- C1 undo_last_edit
- C2 grep_content
- D1 verify_change receta
- D2 flow_verify_and_commit
- E1 Log decisiones
- E2 Log gotchas
- B4 Mejorar system prompt

Fase 3 (cuando haya tiempo):
- C3-C6 atajos de edicion
- D3-D5 salud y flujos
- E3-E4 memoria avanzada
- F3-F5 infra
- G1 verificacion rendimiento
- H1-H5 analisis
- I1-I4 testing

Fase 4 (proyecto grande):
- F1 WebSocket
- F2 Streaming real

## Como usar este plan

1. La IA lee este archivo al inicio de una sesion larga.
2. Elige items de la fase activa.
3. Implementa uno por uno.
4. Marca [x] al terminar.
5. Commit al final de cada fase.

Este archivo vive en el repo y se actualiza con file_edit.
