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
