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
