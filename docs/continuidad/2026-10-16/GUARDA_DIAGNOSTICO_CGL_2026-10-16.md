# CGL — GUARDA DE CONTINUIDAD — 2026-10-16

## Alcance
Checkpoint documental de diagnóstico en vivo del 16/10/2026. No equivale a aceptación funcional del MVP. Evitar repetir comprobaciones cerradas. No modifica código ni archivos locales.

## Repositorio y estado Git local observado
- Repositorio: remc87-alt/Constructor-General-Linux
- Rama: m03-g5-consolidation-20261008
- HEAD de referencia previamente contrastado: f98140129675e0f0f139e82ff196d4c83aa5f081
- `git status --short --branch` mostró rama correcta, sin modificaciones de archivos rastreados y dos archivos sin seguimiento:
  - `docs/G01_BWRAP_CIERRE_2026-10-12.md`
  - `resultado.json`
- Preservar esos dos archivos. No fueron inspeccionados ni incluidos en este checkpoint.
- No se ejecutó la última comparación `git rev-list --left-right --count HEAD...origin/...`; no afirmar sincronización remota actual del checkout.

## Evidencia positiva del 16/10/2026
1. `ps` inicialmente no detectó tunnel-client, y `systemctl --user` no mostró servicio de túnel; sólo OpenViking, no intervenido.
2. Perfil existente `~/.config/tunnel-client/opencode-temporal-lab.yaml`: rutas MCP `main` y `temporal`.
3. Arranque manual controlado:
   `tunnel-client run --profile opencode-temporal-lab --control-plane.poll-channel main --control-plane.poll-channel temporal`
   Resultado: `tunnel-client started`; OpenCode health PASS, versión 1.18.34.
4. PID de túnel `920795`, listener `127.0.0.1:8080` confirmado por `ss`. La terminal que lo mantiene debe permanecer abierta; su persistencia posterior NO está garantizada.
5. `curl http://127.0.0.1:8080/health?details=true`: `live=true`, `ready=true`, `lifecycle=running`, control-plane `status=ok,state=polling,consecutive_failures=0`, dispatcher `status=ok,state=accepting`; proxy reportó dos rutas `mcp_channel`.
6. `doctor --profile ... --control-plane.poll-channel main --control-plane.poll-channel temporal --json`: configuración, perfil, tunnel ID, API key configurada y ejecutable MCP PASS. `health_listener` FAIL porque puerto 8080 estaba ocupado por el túnel ACTIVO; no es prueba de fallo del túnel. No instalar plugin opcional Codex.
7. Procesos hijos del túnel:
   - main: PID 920811, ruta `/home/rodrigo_mella/opencode-constructor-e2e/mcp-opencode-adapter/src/index.ts`
   - temporal: PID 920812, ruta `/home/rodrigo_mella/constructor-general-linux-m01-lab/mcp-opencode-adapter/src/index.ts`
   - procesos Node descendientes 920891 y 920892.
8. En el código del adaptador Temporal `src/index.ts`, `server.registerTool` declara:
   - `start_temporal_mission` (línea 343)
   - `decide_temporal_permission` (línea 357)
   - `get_temporal_mission` (línea 375)
   Registro condicionado a `if (temporalBridge)`.
9. `temporalBridgeFromEnv` en `src/temporal-bridge.ts` requiere `TEMPORAL_BRIDGE_ENABLED=1` y `TEMPORAL_BIN`, `TEMPORAL_ADDRESS`, `TEMPORAL_TASK_QUEUE`; `TEMPORAL_NAMESPACE` es opcional.
10. Entorno real del proceso PID 920812: las cinco variables presentes; `TEMPORAL_BRIDGE_ENABLED=1 (PASS)` verificado, sin exponer valores sensibles.

## Límites y pendientes (NO declarar PASS)
- En la sesión ChatGPT sólo aparecían cuatro herramientas estables: `start_mission`, `get_mission`, `continue_mission`, `reply_permission`. Las tres Temporal NO estaban disponibles en catálogo de herramientas de esa sesión.
- `/health` reportó para main `mcp.status=unknown,state=not_observed`, `initialize.ok=false`, `tools_list.ok=false`; esto significa **sin observación**, no fallo probado. No mostró diagnóstico independiente del canal temporal.
- Falta comprobar respuesta real MCP `initialize`/`tools/list` para canal temporal y mecanismo de publicación/refresh de herramientas en ChatGPT.
- `MCP Events emitter disabled (set MCP_EVENTS_EMITTER=on)` apareció en arranque. La integración real Temporal → MCP Events → ChatGPT no está demostrada; no basta activar variable sin cableado.
- E2E Temporal integral de aceptación y retorno automático pendientes. Pruebas históricas de main/Temporal/permissions no deben repetirse sin razón.

## Siguiente acción mínima
1. Recuperar este GUARDA y la evidencia histórica vigente; NO recomenzar chequeos de túnel, variables o registro de código.
2. Verificar una sola vez el catálogo MCP publicado por el canal `temporal` y la capacidad de ChatGPT de descubrirlo, usando una prueba read-only/no misión.
3. Si herramientas visibles, continuar cierre del retorno MCP Events y una aceptación E2E acotada.
4. Preservar puente estable y archivos sin seguimiento; no reiniciar/reinstalar/reconfigurar sin evidencia.
5. Usuario exige **un comando Ubuntu por turno**, esperar salida y minimizar tokens.

## Historial de validación relevante
PASS histórico del puente principal ChatGPT → MCP → OpenCode → FreeLLMAPI; misión de humo `CGL-MVP-SMOKE-01-20261012` retornó `CGL_E2E_SMOKE_PASS` y `CGL_CONTINUE_PASS`. Temporal y permisos tienen pruebas previas, pero el retorno real MCP Events → ChatGPT sigue pendiente.

## Nota de guardado
Este documento es un checkpoint de evidencia, no una sincronización de los archivos locales ni una confirmación de que el túnel siga vivo después de cerrar Ubuntu.


---

# GUARDA ADITIVA — RESULTADOS CGL-01 / CGL-02 — 16/10/2026

**PREVALENCIA:** Este bloque actualiza los estados del diagnóstico anterior; conservar historial sin reinterpretar PASS. **Origen:** reportes de Codex CGL-01 y CGL-02 entregados por el usuario. No es una ejecución independiente de esas pruebas por ChatGPT. **MVP global: PENDIENTE.**

## REGLA DE INICIA Y GUARDA — LECTURA OBLIGATORIA

- Antes de cualquier misión, Codex/Director deben **leer este archivo en GitHub desde la rama m03-g5-consolidation-20261008, incluida esta sección final**. Si el checkout no lo tiene, leerlo remotamente; no inferir que no existe ni lanzar una auditoría sustituta.
- Resumir en cinco líneas: PASS conservados, evidencia nueva, brechas P0, misión única siguiente, tareas que NO se repetirán.
- El resultado de cada misión debe actualizar el GUARDA **antes de iniciar otra**: evidencia, estado, fecha, prueba exacta, PASS/FAIL/INCONCLUSO, siguiente dependencia y límites de validez.
- No confundir PASS histórico, PASS local en proceso auxiliar, y PASS real desde ChatGPT. Ninguno sustituye a los otros.
- No repetir health, variables de entorno, grep de registro ni tools/list auxiliar salvo evidencia de regresión.
- No sincronizar automáticamente el checkout, modificar servicios, lanzar inferencias ni tocar el canal main. Preservar los archivos locales sin seguimiento `docs/G01_BWRAP_CIERRE_2026-10-12.md` y `resultado.json`.
- En asistencia Ubuntu/WSL: un comando por turno y esperar resultado. Codex no debe ejecutar acciones destructivas o reinicios sin aprobación.

## ESTADOS CONSOLIDADOS

| ID | Conexión | Estado al 16/10 | Evidencia y límite |
|---|---|---|---|
| C01 | ChatGPT ↔ MCP principal | PASS HISTÓRICO + cuatro herramientas visibles | start_mission, continue_mission, get_mission, reply_permission; smoke CGL_E2E_SMOKE_PASS/CGL_CONTINUE_PASS. NO REPETIR |
| C02 | Túnel y health | PASS observado CGL-01 | /readyz y /healthz HTTP 200. Salud NO prueba negociación temporal |
| C03 | Perfil y canal temporal | CONFIGURADO, canal reportado habilitado | API local del túnel muestra temporal y launcher start-temporal-adapter.sh, PID 920812; canal main PID 920811. No reintroducir sondeo multicanal |
| C04a | Lanzador Temporal auxiliar MCP initialize/tools/list | **PASS LOCAL CGL-02** | initialize protocolo 2025-11-25, servidor empresa-ia-opencode-adapter 1.0.0; tools/list sin paginación: start_mission, continue_mission, abort_mission, get_mission, reply_permission, start_temporal_mission, decide_temporal_permission, get_temporal_mission. No repetir |
| C04b | Proceso temporal activo → túnel → conector → ChatGPT | **P0 BLOQUEADO / INCONCLUSO** | ChatGPT ve solo 4 estables. La prueba auxiliar no acredita negociación del proceso conectado ni publicación/refresh del conector. NO modificar a ciegas |
| C05 | Adaptador Temporal → Temporal Server | PASS HISTÓRICO | CLI bridge y consulta histórica, sin garantía de versión actual |
| C06 | Temporal Server → Worker | PASS HISTÓRICO | Cola/namespace y workflows anteriores; versión actual pendiente |
| C07 | Worker → adaptador auxiliar → OpenCode | PASS HISTÓRICO | Generación histórica; copia auxiliar y canónica divergentes. NO sincronizar sin revisión |
| C08 | OpenCode → FreeLLMAPI | PASS HISTÓRICO | Ejecución previa; no repetir inferencia básica |
| C09 | get_temporal_mission desde ChatGPT | BLOQUEADO POR C04b | Query implementada; herramienta no visible en ChatGPT |
| C10 | OpenCode → MCP Events | P0 INCOMPLETO | Emitter desactivado en registro y actividades; stream, firma y outbox implementados |
| C11 | Resultado funcional durable → evento | P0 NO CONECTADO EN WORKFLOW INSPECCIONADO | Workflow genérico no llama bridgeEmit; no confundir fin de turno con éxito funcional |
| C12 | Suscripción → receptor → ChatGPT | P0 INCOMPLETO | Suscripción auxiliar expirada 09/10; receptor interno T4; no entrega real acreditada |
| G01 | Gate operativo previo a código generado | PENDIENTE DE ACLARAR/CERRAR | No reabrir pruebas históricas sin evidencia |

## RESULTADO DE MISIONES

- **CGL-01:** DIAGNÓSTICO ENTREGADO / SOLO LECTURA. Matriz C01-C12; identifica publicación Temporal, coherencia de despliegue, retorno automático y G01. No certifica runtime integral.
- **CGL-02:** **INCONCLUSO PARA OBJETIVO CHATGPT**, pero **PASS LOCAL PARA initialize/tools/list del lanzador Temporal auxiliar**. No hubo cambios; hashes del perfil y adaptador main conservados, cuatro herramientas main disponibles. La causa del desfase entre catálogo local (8) y catálogo ChatGPT (4) NO está probada. Rollback no aplica.
- **CGL-03:** NO AUTORIZADA TODAVÍA. No repetir CGL-01 ni CGL-02.

## CAMINO CRÍTICO DE CIERRE MVP — ORDEN VINCULANTE

1. **P0-1 publicación ChatGPT:** observar qué canal y catálogo consulta el conector de ChatGPT, correlacionar con canal temporal activo y mecanismo de actualización. Si el entorno Codex no puede ver configuración/negociación del conector, escalar una comprobación puntual al Director/usuario. NO volver a inspeccionar el SDK ni tools/list auxiliar. PASS = tres herramientas Temporal visibles e invocables desde ChatGPT y cuatro main intactas.
2. **P0-2 coherencia efectiva de despliegue:** comprobar versiones de Worker/auxiliar solo en puntos requeridos para el E2E, sin sincronización masiva.
3. **P0-3 MCP Events:** conectar emisor persistente, mapa de misión correcto, resultado funcional durable, suscripción vigente y entrega real a ChatGPT; no declarar PASS por código existente.
4. **P0-4 gate G01 y una aceptación E2E:** permisos/recuperación pertinentes, resultado funcional validado, retorno a ChatGPT. Reutilizar pruebas históricas.
5. **GUARDA FINAL:** evidencia y estados por conexión, commit, INICIA que apunte a este documento y al último cierre. No declarar MVP PASS antes de E2E.

## INSTRUCCIÓN DIRECTA A CODEX PARA LA PRÓXIMA MISIÓN

**NO EJECUTAR CGL-01 NI CGL-02 NUEVAMENTE.** Iniciar solo una intervención sobre la **frontera conector ChatGPT ↔ canal temporal activo**, con un procedimiento verificable y mínimo. Si falta acceso al conector, devolver exactamente qué comprobación debe hacer el Director/usuario y detenerse. En paralelo, solo si el Director lo autoriza expresamente, preparar corrección aislada de C11 (resultado durable → evento), sin despliegue ni reinicio. Actualizar este GUARDA al cerrar cada trabajo.
