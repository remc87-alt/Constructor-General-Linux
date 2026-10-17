# Constructor General Linux · Manifiesto Temporal V1

Estado documental: 2026-10-09. Complementa, sin reemplazar, el checkpoint del
2026-10-06 y la Guarda del 2026-10-08. Precedencia: evidencia reciente más
evidencia histórica no contradicha. GitHub conserva código, decisiones y
evidencia sanitizada; el estado runtime pertenece a Temporal/OpenCode.

## INICIA obligatorio

Antes de intervenir, leer en orden el checkpoint 2026-10-06, la Guarda
2026-10-08 y este manifiesto. Después consultar en vivo `generic-mission` o
`get_temporal_mission`, permisos actuales y el resultado público por identidad.
No deducir runtime desde Git ni crear otra misión para recuperar una existente.

## Arquitectura y estado

| Componente | Interfaz | Estado |
|---|---|---|
| Bridge MCP experimental | STDIO opt-in `TEMPORAL_BRIDGE_ENABLED=1`; `start_temporal_mission`, `get_temporal_mission` | IMPLEMENTADO; el Bridge histórico es fallback |
| Temporal | SDK TypeScript 1.24.0; 7243; task queue `constructor-poc` | HABILITADO POC; recuperación sintética PROBADA |
| Worker POC | `experimental/temporal-poc/src/worker.ts` | PARCIAL: requiere recarga controlada para código posterior |
| OpenCode POC | 1.18.34, 4098 | HABILITADO experimental; generación real DEMOSTRADA |
| FreeLLMAPI | 3001 | Inferencia real DEMOSTRADA en ejecución previa |
| Oráculo independiente | prepare/validate + resultado público sanitizado | Fixtures PASS/FAIL DEMOSTRADOS; aceptación V1 completa NO DEMOSTRADA |
| MCP Events | outbox/firma/contratos locales | PARCIAL; retorno E2E a ChatGPT NO DEMOSTRADO |

`DISPONIBLE` significa que código o versión existen; `HABILITADO`, que el perfil
los expone; `PROBADO`, que existe evidencia de prueba; `OPERATIVO`, que el
circuito funcional completo pasó. Ninguno implica el siguiente.

## Contrato Director → resultado

1. El Director usa el Bridge experimental, no una llamada directa a OpenCode,
   con `mission_id` único y workspace absoluto cuyo basename coincide.
2. El workflow valida contrato/workspace y `startMission` inicia o reconcilia
   una sola misión. `session_id` es identidad durable; `idle` no prueba éxito.
3. `waitMission` consulta la misión existente, mantiene heartbeats y retries
   acotados; no envía un segundo prompt ni crea una segunda sesión.
4. El oráculo independiente decide el estado funcional. Temporal `COMPLETED`
   nunca equivale por sí solo a `functional_status=passed`.
5. `get_temporal_mission` usa la Query durable `generic-mission`, sin reiniciar
   ni aprobar permisos.

## Observabilidad y autonomía supervisada

La Activity no comparte memoria mutable con el Workflow. Durante `waitMission`
conserva un checkpoint en heartbeat y envía un Signal interno rate-limited a un
minuto —o inmediato ante cambio semántico— para actualizar la Query durable.
El checkpoint público incluye solo `mission_id`, `session_id`, `phase`,
`last_seen_at`, `last_progress_at`, `last_checkpoint`, `permission_status`,
`repair_attempts`, `next_action`, `functional_status` y `observed_status`.
No transporta texto del modelo, argumentos de permisos, credenciales, rutas
privadas ni diagnósticos privados. Polls y heartbeats no son progreso funcional.

Política inicial: consulta humana cada cinco minutos; primer intervalo sin
progreso → `inspect`; segundo → `escalate`; permiso pendiente → revisión humana.
Se conserva la misma misión/sesión y no se aprueban permisos sensibles
automáticamente. `Schedule-to-Close` solo se evaluará con presupuesto total
explícito. Las métricas nativas viven en 7245; no se instala infraestructura
adicional.

## Evidencia

### DEMOSTRADO

- Reconciliación de inicio estable: respuesta perdida no debe crear segunda
  sesión; los tests cubren inicio, retry, resultado terminado y mismatch.
- Heartbeats, retries y timeout acotado de `waitMission` están codificados.
- Query `generic-mission`, contrato genérico y resultado público con doble
  identidad están implementados.
- La ruta experimental generó código y sesión reales; el oráculo rechazó una
  implementación incorrecta en vez de producir falso PASS.

### PARCIAL

- Checkpoint durable implementado y probado localmente; requiere recarga
  autorizada del worker y misión futura autorizada para observación real.
- Reparación en la misma sesión fue ejercida, pero no logró aceptación V1.
- Métricas 7245 existen, pero no hay fuente fiable de tokens.

### NO DEMOSTRADO

- Retorno automático MCP Events a ChatGPT y suscripción ChatGPT real.
- Una aceptación V1 integral con `functional_status=passed`.
- Checkpoints semánticos ricos o presupuesto de tokens medible.
- Commit/push autónomo del constructor.

### FAIL conservado

G5 y aceptaciones CSV anteriores no son éxitos: `idle`, exit 0, archivo
existente o Temporal `COMPLETED` no prueban resultado válido.

## Seguridad, DO_NOT_REPEAT y GUARDA

- Permiso pendiente es bloqueo explícito; no se reutilizan permisos históricos
  ni se aplican políticas globales.
- Activities reintentables reconcilian antes de efectos externos; Temporal no
  proporciona exactly-once sobre OpenCode.
- El oráculo usa doble identidad y resultado público sanitizado; el worker no
  lee pruebas privadas. Runtime, logs, SQLite, secretos, workspaces y suites
  privadas no se versionan; `oracle-wrapper/private-suite/` está ignorado.
- No repetir canaries, G1-R/G2/G3/G4, caída T6, `nohup`/`setsid`, ni iniciar
  una misión histórica. No confundir estados con éxito funcional.

GUARDA debe actualizar este manifiesto al cambiar código, evidencia o decisión,
clasificando DEMOSTRADO/PARCIAL/NO DEMOSTRADO/FAIL/NO APLICABLE y sin secretos.
Antes de publicar, revisar diff, rama remota y staged; GitHub se confirma solo
tras verificar el commit remoto.

Punto de reenganche: revisar el diagnóstico público de
`cgl-v1-csv-expense-20261009-003` sin alterar su sesión. Una próxima misión
requiere autorización del Director, cero workflows activos, cero permisos
pendientes, workspace nuevo con basename igual a `mission_id`, worker recargado
y preflight de oráculo. No declarar Constructor operativo antes de PASS
funcional independiente.

## Addendum de continuidad — 2026-10-10

El checkpoint documental publicado continúa siendo `69276a3` y la rama remota
experimental coincide con el HEAD local. El laboratorio conserva `resultado.json`
como artefacto no rastreado; existe un respaldo externo verificable y no se
incorpora al repositorio.

El respaldo externo ahora incluye snapshots SQLite de Temporal y OpenCode
experimental, ambos con `integrity=ok`, conservando sus SHA256 en el manifiesto
local. Los snapshots son evidencia de continuidad, no autorización para
restaurar procesos ni sustituto de credenciales o configuración secreta.

Estado MVP: G-01, G-02, G-03 y G-04 permanecen **PARCIALES** según sus
definiciones canónicas del Director. No se agregan requisitos de n8n/PMO,
MCP Events ni autonomía total a este alcance.

La reconstrucción desde GitHub recupera código, contratos, pruebas y decisiones,
pero no credenciales, suite privada, SQLite, sesiones OpenCode, historial
Temporal, workspaces, logs ni resultados runtime. Estos elementos requieren
respaldo externo seguro y permanecen excluidos por diseño.

Última aceptación: `cgl-v1-csv-expense-20261009-003`, funcionalmente bloqueada;
Temporal `COMPLETED` no equivale a aceptación. La versión efectiva del worker y
la existencia actual de workflows/permisos no quedaron verificadas en este
entorno restringido. No reiniciar ni recargar automáticamente.

## Contrato MVP integral y estado — 2026-10-11 (CGL-V2-EVOLUCION-INTEGRAL-001)

El Director reemplaza el alcance "una prueba CSV" por un **MVP integral**:

- P0: seguridad y presupuesto.
- P1: Temporal y recuperación durable.
- P2: comunicación bidireccional.
- P3: INICIA/GUARDA y memoria.
- P4: permisos inteligentes.
- P5: skills y modelos eficientes.
- P6: observabilidad y costos.
- P7: oráculo y aceptación funcional.

El MVP integral no es PASS sin comunicación, memoria y reenganche probados.

Escala de estado, sin implicación entre niveles: IMPLEMENTADA (código) → INTEGRADA (cableada en el
flujo) → ACTIVADA (corriendo en runtime) → PROBADA (evidencia de prueba) → ACEPTADA (E2E
funcional con oráculo independiente).

### Cambios P0 (sin commit; respaldo `~/cgl-v2-evolucion-backup-20261011/`)

| Defecto | Corrección | Estado |
|---|---|---|
| G04 deadline reiniciado entre reintentos | Deadline absoluto `startTime + maxDurationMs` enviado como `deadlineAt` a toda Activity; `waitMission` termina en `min(t0+maxMs, deadlineAt)` | IMPLEMENTADA · INTEGRADA · PROBADA |
| G04 sin tope servidor | Bridge: `--execution-timeout` (presupuesto + 5 min, máx. 20) y `--id-reuse-policy RejectDuplicate` | IMPLEMENTADA · PROBADA (args) |
| G04 efectos tras el deadline | `assertBeforeDeadline` (`BudgetExhausted`, no reintentable) antes de start, continue, reply `once` y validate (también entre prepare y validate) | IMPLEMENTADA · PROBADA |
| G04 OpenCode sigue tras agotarse | Herramienta `abort_mission` (idempotente, bloquea continuaciones); `finish()` aborta en todo cierre no-passed, incluso ante cancelación (`nonCancellable`) y start ambiguo | IMPLEMENTADA · INTEGRADA · PROBADA |
| G02 repair duplicable | `continue_mission` con `continuation_id` at-most-once (persistido antes del POST); clave `<mission>-repair-<n>` | IMPLEMENTADA · PROBADA |
| G02 identidad workflow/misión | `workflow_id == contract.missionId` en el bridge y en el workflow | IMPLEMENTADA · PROBADA |
| G02 timeout de validación | Proxy propio: 5 min, 1 intento (prepare + validate pueden sumar 260 s) | IMPLEMENTADA |
| G02 fallos de Activity → workflow failed | Estado explícito `blocked` con `last_error` = tipo de fallo (sin texto) | IMPLEMENTADA · PROBADA |
| G03 sin política de permisos | `opencode-policy.ts` | IMPLEMENTADA · PROBADA (validador); **semántica OpenCode NO DEMOSTRADA en runtime** |
| M3 carrera en el mapa del adaptador | Lectura fresca, patch por misión, temporal por pid, re-chequeo de abort antes del efecto | IMPLEMENTADA · PROBADA; sin lock (ventana residual mínima) |
| P4/M6 sin emisor de decisión | Herramienta `decide_temporal_permission` (señal exacta y atribuida); riesgo `sensitive`/`critical` en `pending_permission` | IMPLEMENTADA · PROBADA (args) |
| P6 query ciega durante preparación | Query registrada antes de `prepareGenericMission` (`preparingState`); `deadline_at` y `next_action` | IMPLEMENTADA · PROBADA |
| Runtime | `runtime-preflight.sh`, de solo lectura | IMPLEMENTADA · PROBADA |

Detalle de la política G03 (`opencode-policy.ts`), exigida en `prepareGenericMission`:

- `"*"` en ask.
- Las herramientas de lectura en allow.
- `bash` como `{"*":"ask"}`, sin ningún allow.
- `edit` con `"*"` en ask; solo los artefactos de datos inertes del contrato pueden ir en allow, nunca el código.
- `external_directory`, `webfetch`, `websearch` y `task` en deny.

Evidencia:

- `temporal-poc`: 63/63, incluidas 11 pruebas de integración del workflow real contra un servidor Temporal **efímero en memoria** (puerto 7263), nunca contra 7243.
  - Cubren: repair reintentado con un único prompt, presupuesto agotado con abort, identidad, permiso exacto con señales falsificadas ignoradas, duplicado rechazado, pérdida del worker sin segunda sesión, permiso sin respuesta, reject, start ambiguo, abort fallido y cancelación.
- Adaptador: 76/76 y `tsc` limpio.
- Mutaciones: 13/13 detectadas.
- Revisión ECC real: `ecc:code-reviewer` (2 HIGH y 4 MEDIUM, corregidos salvo M4/M5, aceptados por diseño), `ecc:security-reviewer` y `ecc:pr-test-analyzer`.

**ACTIVACIÓN: NO.** El worker vivo (pid 2262122) y `adapter-instance` siguen con el código anterior; `runtime-preflight.sh` lo marca como FAIL. No se recargó porque P0 no cerró (ver G01).

### Bloqueo crítico G01: requiere al Director con sudo

El ejecutor (OpenCode 4098 y el bash del agente) corre como `rodrigo_mella`. Ese usuario:

- pertenece al grupo `docker`, equivalente a root;
- es dueño de las copias de la suite privada (la de desarrollo, ahora 0700, y la del respaldo);
- puede leer la contraseña de 4098, presente en archivo y en el entorno;
- puede enviar señales a Temporal 7243/7244, que no tiene autenticación.

El entorno de 4098 hereda además `FREELLM_KEY`, `OPENVIKING_API_KEY` y las variables de Codex.

Con `bash` en ask, el humano es la única barrera: un solo comando aprobado obtiene alcance total. La suite privada **no es inaccesible** al ejecutor, así que **P0 no cierra y no se ejecuta la E2E**.

Mitigaciones que requieren sudo, por prioridad:
1. Quitar `docker` al ejecutor.
2. Crear un usuario ejecutor dedicado sin privilegios y dueño de nada sensible.
3. Envolver OpenCode en bwrap con red aislada de 7243/7244.
4. Autenticación en Temporal.
5. Rotar la contraseña de 4098 y arrancarlo con un entorno mínimo.

### Estado P0–P7

| Gate | Estado |
|---|---|
| P0 | **BLOQUEADO** por G01 (entorno). G02/G03/G04: IMPLEMENTADAS y PROBADAS, no ACTIVADAS. |
| P1 | PROBADA en un Temporal efímero (no duplicación, recuperación tras pérdida del worker, bloqueo por permiso); no ACTIVADA. |
| P2 | MCP Events (`events/list/subscribe/unsubscribe`, firma, outbox durable, `mission.*` y `permission.required`): IMPLEMENTADA y PROBADA localmente (66 pruebas); no ACTIVADA en el worker (`MCP_EVENTS_EMITTER=off`); suscripción real de ChatGPT NO DEMOSTRADA. Respaldo: query durable `get_temporal_mission`. MCP Tasks no evaluado: sin compatibilidad demostrada. |
| P3 | GitHub, INICIA/GUARDA y este manifiesto siguen siendo la fuente de verdad. `claude-mem` está activo en Claude Code y Hermes está instalado (`~/.local/bin/hermes`), pero ninguno está integrado al Constructor. Hay una clave OpenViking en el entorno, pero el servicio no está verificado. Sin integración nueva, para no duplicar memorias. |
| P4 | Política por riesgo IMPLEMENTADA: lectura automática; edición de datos automática; código, bash y lo desconocido escalan; deny para lo externo. Nunca se autoaprueba. Automatizar bash requiere G01. |
| P5 | Proveedor verificado en runtime: `freellmapi/nemotron-3-super-120b`, sin cambios. |
| P6 | Query con `mission_id`, `session_id`, fase, `deadline_at`, `pending_permission` y su riesgo, reparaciones, estado funcional, `next_action`, checkpoint (heartbeat ≠ progreso) y `last_error`. Tokens: sin medición fiable. |
| P7 | NO EJECUTADA, porque P0 sigue bloqueado. |

### DO_NOT_REPEAT (añadido)

- No relanzar la DD de aceptación del 2026-10-11 ni repetir la revisión de G04/G02 ya corregida.
- No ejecutar pruebas de integración contra 7243.
- No activar el código nuevo sin volver a correr `runtime-preflight.sh`.
- No aprobar `bash` que ejecute código generado mientras G01 esté abierto.

### Reenganche

1. El Director resuelve G01 con sudo.
2. Se ejecuta `runtime-preflight.sh` (debe dar 0 FAIL salvo "worker runs current code").
3. Se sincroniza `adapter-instance/src` y se recarga el worker con `ctl.sh worker stop`/`start`.
   - Rollback: restaurar los archivos desde `~/cgl-v2-dd-backup-20261011/modified.tgz` y recargar.
4. Se reinicia 4098 con `t3-opencode.sh` sobre un workspace nuevo con `opencode.json` de `missionOpenCodeConfig`, y se verifica `GET /config` → `permission`.
5. Recién entonces se lanza una única E2E CSV sintética.

### Addendum 2026-10-12 · G01

- **Due diligence y procedimiento sudo** (no ejecutado): `docs/G01_AISLAMIENTO_PROCEDIMIENTO.md`.
- **Hallazgos que corrigen supuestos previos:**
  - Retirar el grupo docker rompe FreeLLMAPI, la Fábrica PMO y `poc-gw`, y no aísla por sí solo.
  - Con OpenCode bajo otro usuario, `verifyOpenCodeWorkspace` falla (EPERM sobre `/proc/<pid>/cwd`).
  - OpenCode reporta `worktree: "/"` porque el workspace no es repo git, así que `external_directory` queda NO DEMOSTRADO.
  - La raíz de workspaces está fija dentro de `~rodrigo_mella`, tanto en el contrato como en los wrappers del oráculo.
- **Continuidad vigente:** `docs/CONTINUIDAD_2026-10-12.md`.

### Addendum 2026-10-12 · G01 código (`CGL-V2-G01-CODIGO-AISLAMIENTO-20261012`)

- **§3 de G01 IMPLEMENTADA y PROBADA en local; NO instalada ni activada.**
  - Nuevos: `src/workspace.ts` (raíz configurable, workspace git, identidad del servidor) y `src/workspace-setup.ts`.
  - `executor/`: el lanzador `cgl-exec-opencode`, `cgl-exec.sudoers` y `cgl-exec-netfilter`.
  - Wrappers del oráculo con raíz fija `/srv/cgl/workspaces` y acceso `dir_fd`.
- **Contratos:**
  - `workflow_id == missionId == basename(workspace)` se mantiene; el workspace debe ser hijo directo de la raíz.
  - `verifyOpenCodeWorkspace` devuelve `{pid, cwd, uid}`; los workflows no cambian.
  - Pruebas: `test:validation` 87/87 con Temporal efímero 7263; adaptador 76/76 (`typecheck` OK); oráculo PASS; lanzador 54/54; mutaciones 25/25.
- **Modo legado:** es el predeterminado si no se definen `CGL_WORKSPACE_ROOT` ni `CGL_OPENCODE_USER`. Con los wrappers nuevos instalados, el oráculo solo acepta `/srv/cgl/workspaces`.
- **Procedimiento vigente:** `docs/G01_AISLAMIENTO_PROCEDIMIENTO.md` §7.


## Addendum 2026-10-17 · continuidad de misiones MVP

El checkpoint operativo y la evidencia fechada se registran en
`docs/CONTINUIDAD_2026-10-17.md`. En síntesis: rollback compatible A06 PASS
(3/3 traspasos, 2/2 adaptador congelado); worker `ff83339` con preflight 8/8;
misión 001 abortada por rechazo de `ls -la`; misión 002 llegó al oráculo y
terminó `FUNCTIONAL_FAILURE`, con reparación limitada por 15 minutos. A01/A03
PASS, A02/A04 PARCIAL y A07 PENDIENTE.

La causa identificada es la falta de especificación de interfaz en las
instrucciones del contrato frente a `csv-expense-v1`. Siguiente acción:
especificar la interfaz en el contrato sin revelar pruebas privadas y ejecutar
misión 003. La autoaprobación de lecturas/tests queda como mejora posterior al
MVP y condicionada a aislamiento G01 activo.


## Addendum 2026-10-17 · aceptación MVP supervisado

El estado vigente de aceptación está en `docs/CONTINUIDAD_2026-10-17.md`,
sección “Cierre del MVP supervisado”. **MVP supervisado PASS; GO para uso
supervisado**, con misiones 003 y 004 en `validated`, ambas aceptadas por
`expense-oracle-001` sin diagnósticos; repetibilidad 2/2. La matriz A01–A07
queda PASS para este gate. A03 usó decisiones manuales `once` del Director
bajo autorización explícita del usuario; no hubo aprobación automática del
sistema. A06 rollback compatible PASS (3/3 traspasos, 2/2 adaptador congelado).

La causa funcional de los fallos 001/002 se resolvió especificando en el
contrato la interfaz requerida por `csv-expense-v1`, sin divulgar sus pruebas.
La misión 001 abortó por un `reject` del supervisor. La misión 004 incluyó una
edición de `README.md` autorizada por el Director fuera de la regla explícita,
sin impacto, como aprendizaje para una futura política de permisos.

Mejoras no MVP: lista blanca de autoaprobación únicamente tras activar
aislamiento G01; retorno automático MCP Events; plantilla de contrato con
especificación de interfaz. Gate de despliegue: uso supervisado autorizado;
no fusionar a `main` hasta una decisión aparte del usuario.
