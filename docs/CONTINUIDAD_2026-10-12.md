# Constructor General Linux V2 · Continuidad e INICIA · 2026-10-12

Punto de entrada para un Director o una sesión nueva. Complementa, sin reemplazar, la cadena canónica:

1. `JORNADA_2026-10-06_CHECKPOINT_DIRECTOR_CONSTRUCTOR.md`
2. `JORNADA_2026-10-08_GUARDA_CANONICO.md`
3. `docs/TEMPORAL_V1_MANIFEST.md`
4. Este documento.
5. `docs/G01_AISLAMIENTO_PROCEDIMIENTO.md`

Precedencia: la evidencia reciente prevalece sobre la histórica no contradicha.

**Qué hay en GitHub:** código, contratos, pruebas, decisiones y evidencia sanitizada.

**Qué NO hay en GitHub:** sesiones de OpenCode, historial de Temporal, SQLite, workspaces, logs, suites privadas, contraseñas ni claves. Ese estado vive en runtime y en los respaldos privados `~/cgl-*-backup-*`, y se consulta en vivo.

## 1. Qué construimos y por qué creció el MVP

Constructor General Linux V2 recibe misiones de software de un Director (ChatGPT), las ejecuta en OpenCode bajo orquestación durable de Temporal y las acepta solo con un **oráculo independiente**.

V1 (`~/opencode-constructor-e2e`) es una alternativa independiente y protegida: no se modifica.

El 2026-10-11 el Director descartó el criterio de una única prueba CSV y fijó un **MVP integral P0–P7**. La razón: la due diligence mostró que un PASS funcional aislado no garantiza presupuesto efectivo, aislamiento, comunicación, memoria ni reenganche. Se priorizan confiabilidad y seguridad sobre la urgencia de uso; la Fábrica PMO ya no presiona el calendario.

## 2. Arquitectura actual

Director → adaptador MCP (`mcp-opencode-adapter`, STDIO):
- `start_temporal_mission` / `get_temporal_mission` / `decide_temporal_permission`
- `start|continue|get|abort_mission`, `reply_permission`
- MCP Events

↓

Temporal 7243 (cola `constructor-poc`) → worker (`experimental/temporal-poc/src/worker.ts`) → `genericConstructorMissionWorkflow`.

Ese workflow realiza:
- contrato y política de permisos;
- deadline absoluto;
- start idempotente;
- `waitMission` con heartbeats y checkpoints;
- permiso por señal exacta;
- validación con el oráculo;
- repair at-most-once;
- abort en todo cierre no-passed.

↓

OpenCode 4098, con el modelo `freellmapi/nemotron-3-super-120b` vía FreeLLMAPI 127.0.0.1:3001.

↓

Oráculo: `sudo` → `cgl-oracle-prepare` (root) y `cgl-oracle-validate` (`cgl_oracle`), que ejecuta en bwrap y publica un resultado sanitizado.

## 3. Decisiones del Director (2026-10-11/12)

1. La DD de aceptación del 2026-10-11 dio FAIL en presupuesto (G04): no se ejecuta la E2E.
2. Se adopta el MVP integral P0–P7, con la escala IMPLEMENTADA / INTEGRADA / ACTIVADA / PROBADA / ACEPTADA.
3. Se corrige P0 en código, con autorización acotada.
4. G01 requiere sudo: se prepara el plan, pero **no se ejecuta**.
5. Se autoriza commit y push solo de código y documentación sanitizados en esta rama; sin merge, rebase ni force.

## 4. Matriz de evidencia

| Capacidad | Clasificación | Evidencia |
|---|---|---|
| Correcciones G04/G02/G03/M3/M6/P6 (detalle en el manifiesto) | **DEMOSTRADO en pruebas locales**; NO ACTIVADO | `temporal-poc` 63/63, adaptador 76/76 (`tsc` limpio), mutaciones 13/13 |
| Workflow real: no duplicación, recuperación tras pérdida del worker, bloqueo por permiso, señales falsificadas ignoradas, cancelación con abort | **DEMOSTRADO en Temporal efímero en memoria** (7263) | `test/generic-workflow.integration.test.ts`, 11 casos |
| Lo anterior en el runtime 7243/4098 | **NO DEMOSTRADO** | El worker vivo corre el código del 2026-10-10 (`runtime-preflight.sh`: FAIL "worker runs current code") |
| Semántica de la política de permisos en OpenCode 1.18 | **NO DEMOSTRADO** | `worktree: "/"` observado; requiere el paso 8 de G01 |
| G01 aislamiento del ejecutor | **FAIL / PENDIENTE (sudo)** | `docs/G01_AISLAMIENTO_PROCEDIMIENTO.md` |
| Oráculo separado (`cgl_oracle`, bwrap, resultado sanitizado) | **DEMOSTRADO** (histórico, no contradicho) | Manifiesto y DD del 2026-10-11 |
| MCP Events (`list`, `subscribe`, `unsubscribe`, firma, outbox) | **PARCIAL**: demostrado en local, no activado | Pruebas del adaptador |
| Suscripción real de ChatGPT / retorno automático | **NO DEMOSTRADO** | — |
| Memoria (`claude-mem`, Hermes, OpenViking) integrada al Constructor | **NO APLICABLE hoy / PENDIENTE** | Canon = GitHub + INICIA/GUARDA |
| Medición de tokens y costos | **NO DEMOSTRADO** (sin medidor fiable; `maxTokens` se rechaza) | — |
| Aceptación E2E integral (P7) | **PENDIENTE** | Bloqueada por P0/G01 |

Estado P0–P7:

| Gate | Estado |
|---|---|
| P0 | BLOQUEADO (G01) |
| P1 | PARCIAL: demostrado en efímero, no activado |
| P2 | PARCIAL |
| P3 | PARCIAL: canon documental OK; memoria externa no integrada |
| P4 | PARCIAL: política implementada; automatizar bash requiere G01 |
| P5 | DEMOSTRADO (proveedor verificado) |
| P6 | PARCIAL: query rica; sin costos |
| P7 | PENDIENTE |

## 5. Código publicado y no publicado

- **Rama:** `m03-g5-consolidation-20261008`. El HEAD remoto lo verifica el commit de esta Guarda; consultar con `git log -1 origin/m03-g5-consolidation-20261008`.
- **Publicado:** P0 (`src`, `test`), `runtime-preflight.sh`, el manifiesto, la Guarda y este documento.
- **Nunca se publica:**
  - `resultado.json` (evidencia FAIL de G5, no rastreada);
  - suites privadas, `run/`, SQLite, logs y workspaces;
  - `adapter-instance`.
- **Respaldos privados (verificar con `sha256sum -c SHA256SUMS`):**
  - `~/cgl-mvp-backup-20261010/`: SQLite, oráculo, runtime.
  - `~/cgl-v2-dd-backup-20261011/`: delta G01-G04 previo al P0; es el **rollback del worker**.
  - `~/cgl-v2-evolucion-backup-20261011/`: delta P0 completo.

## 6. Riesgos

- El ejecutor actual tiene alcance de administrador: grupo docker, suites, secretos, Temporal sin autenticación.
- Secretos expuestos al entorno de 4098, que hay que rotar tras G01: la contraseña de 4098, la clave de FreeLLMAPI y `OPENVIKING_API_KEY`.
- **Otros proyectos:** quitar el grupo docker rompería FreeLLMAPI, la Fábrica PMO y `poc-gw`. No hacerlo. Las reglas `kill` NOPASSWD como `empresa-ia-capa0` y el grupo `adm` son de Empresa-IA.
- Ventana residual sin lock en el mapa del adaptador. El repair es at-most-once por diseño: un envío fallido no se reenvía.

## 7. DO_NOT_REPEAT

- **Verificaciones ya hechas:**
  - G1-R, G2, G3, el descubrimiento G4, la comparación `nohup`/`setsid` y el start de G5 (histórico);
  - la DD de aceptación del 2026-10-11, la revisión de G04/G02 y el inventario G01 del 2026-10-12.
- **Prohibiciones:**
  - No probar contra 7243 con actividades simuladas: usar un Temporal efímero (`temporal server start-dev --headless --port 7263`).
  - No activar el código nuevo, no reiniciar 4098 y no lanzar la E2E antes del gate de `G01_AISLAMIENTO_PROCEDIMIENTO.md` §5.
  - No quitar el grupo docker como solución de G01.
  - No aprobar bash que ejecute código generado mientras G01 esté abierto.
  - No reutilizar misiones ni sesiones históricas (`g5-transcripcion-python-*`, `cgl-v1-csv-expense-20261009-003`).
  - No tratar Temporal `COMPLETED`, `idle` ni exit 0 como PASS funcional.

## 8. Próximo gate exacto

1. **Misión de código sin sudo:** `G01_AISLAMIENTO_PROCEDIMIENTO.md` §3. Cubre la raíz de workspaces configurable, `verifyOpenCodeWorkspace` vía `GET /path`, el workspace git, el lanzador `env -i` y sus pruebas.
2. **Persona administradora:** los pasos 1 a 8 de §4, verificando cada uno.
3. **El gate de §5;** después se activa el código (preflight, sincronizar `adapter-instance`, recargar el worker) y se ejecuta una única E2E CSV sintética.

## 9. Comandos para consultar el estado (solo lectura)

```bash
cd ~/constructor-general-linux-m01-lab && git fetch -q && git status --short && git log -1 --oneline origin/m03-g5-consolidation-20261008
experimental/temporal-poc/runtime-preflight.sh            # gates de runtime, sin efectos
~/.local/state/constructor-temporal-poc/bin/temporal workflow list --address 127.0.0.1:7243 --limit 10
~/.local/state/constructor-temporal-poc/bin/temporal workflow query --address 127.0.0.1:7243 --workflow-id <mission_id> --type generic-mission
(cd experimental/temporal-poc && npm run -s test:validation)   # 52 sin Temporal efímero; 63 con CGL_TEMPORAL_TEST_ADDRESS
(cd mcp-opencode-adapter && npm test && npm run -s typecheck)  # 76
for b in ~/cgl-mvp-backup-20261010 ~/cgl-v2-dd-backup-20261011 ~/cgl-v2-evolucion-backup-20261011; do (cd "$b" && sha256sum -c --quiet SHA256SUMS && echo "OK $b"); done
```

## 10. Addendum 2026-10-12 (tarde) · `CGL-V2-G01-CODIGO-AISLAMIENTO-20261012`

Prevalece sobre §4, §7 y §8 donde difiera.

### 10.1 Resultado
- **G01_CODIGO = PASS.** La §3 de G01 está implementada y probada en local, y revisada por ECC sin CRÍTICO ni ALTO abiertos en el código.
- **G01_OPERATIVO = PENDIENTE.** No se instaló, ejecutó ni activó nada. No se usó sudo, salvo una sonda `sudo -n true` fallida y sin efecto, registrada en la Guarda.

### 10.2 Matriz de evidencia (delta)

| Capacidad | Clasificación | Evidencia |
|---|---|---|
| Raíz de workspaces configurable (`CGL_WORKSPACE_ROOT`), rechazo fuera de raíz, symlinks y traversal | **DEMOSTRADO en pruebas locales**; NO ACTIVADO | `test/g01-isolation.test.ts` |
| `verifyOpenCodeWorkspace` sin `/proc/<pid>/cwd` (cmdline, Uid, listener, `GET /path`) | **DEMOSTRADO en pruebas locales** (con fakes); NO DEMOSTRADO contra un 4098 aislado | ídem, 26 casos negativos |
| Workspace git propio (nuevo y existente, sin efectos parciales) | **DEMOSTRADO en pruebas locales** | ídem |
| Lanzador `env -i` sin secretos heredados, con sondas de aislamiento | **DEMOSTRADO en copia redirigida**; NO INSTALADO | `test/g01_launcher_test.sh` 54/54 |
| Wrappers del oráculo con `dir_fd`/`O_NOFOLLOW`/`O_NONBLOCK`/`nlink`/dueño | **DEMOSTRADO en pruebas locales**; NO INSTALADO | `test/oracle_g01_contract_test.py` |
| Contratos Temporal/oráculo | **DEMOSTRADO en Temporal efímero 7263** | `test:validation` 87/87 |
| Calidad de las pruebas | **DEMOSTRADO** | mutaciones 25/25 detectadas |
| `external_directory` con worktree git | **NO DEMOSTRADO** (requiere el paso 8') | — |
| Aislamiento WSL (interop y `/mnt/c`) | **FAIL hoy**: interop enabled y `/mnt/c` legible; el lanzador se niega a arrancar | §7.2 del procedimiento |

### 10.3 Estado P0–P7

| Gate | Estado |
|---|---|
| P0 | BLOQUEADO por G01_OPERATIVO (código listo) |
| P1 | PARCIAL: demostrado en efímero, no activado |
| P2 | PARCIAL |
| P3 | PARCIAL |
| P4 | PARCIAL: política más allowlist de config; bash automatizable solo tras G01 operativo |
| P5 | DEMOSTRADO |
| P6 | PARCIAL |
| P7 | PENDIENTE |

### 10.4 DO_NOT_REPEAT (adiciones)
- No repetir la investigación del worktree `/`: está verificada en el binario 1.18.34 (`Project.resolve` y `repo.discover`; sin repo git, worktree `/`; repo de otro dueño sin `safe.directory`, también `/`).
- No repetir el diseño ni la revisión G01: hay dos rondas de architect y de security-reviewer, más code-reviewer y pr-test-analyzer.
- **Nunca ejecutar `cgl-exec-opencode stop` como `rodrigo_mella`**, ni copias de prueba con `stop`: hace `kill -1` como el usuario que lo invoca.
- No usar `scripts/install-oracle-concurrency.sh` para G01: sus pines son de los wrappers del 2026-10-09. Usar §7.3, paso 6'.
- No aplicar `chown -R` sobre el home ni sobre `config/` del ejecutor.

### 10.5 Próximo gate exacto
1. **Decisión del Director y del usuario** sobre el paso 4b: desactivar interop de WSL y restringir `/mnt/c`. Requiere `wsl --shutdown`, que reinicia todos los servicios WSL.
2. **Persona administradora:** los pasos 1, 2', 3, 4', 4b, 5', 6', 7 y 8' de `G01_AISLAMIENTO_PROCEDIMIENTO.md` §7.3, verificando cada uno.
3. **Gate §5 más §7.4.** Después: `poc.env` exporta `CGL_WORKSPACE_ROOT` y `CGL_OPENCODE_USER`, se sincroniza `adapter-instance`, se recarga el worker y se ejecuta **una** E2E CSV sintética.
