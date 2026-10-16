# GUARDA RECONCILIADO — Constructor General Linux — 2026-10-16

Estado del MVP: **PARCIAL; aceptación funcional E2E pendiente**.
Este documento sustituye como punto de continuidad las instrucciones operativas anteriores del 16/10, conservadas en Git. No certifica salud futura ni autoriza ejecutar la próxima misión.

## 1. Identidad y alcance

- Proyecto exclusivo: Constructor General Linux (CGL).
- Repositorio: https://github.com/remc87-alt/Constructor-General-Linux
- Checkout: /home/rodrigo_mella/constructor-general-linux-m01-lab
- Rama: m03-g5-consolidation-20261008.
- Identidad acreditada en PROJECT.md y README.md; separación expresa en PROJECT.md §Separación.
- Empresa IA es independiente. No incorporar arquitectura, herramientas, configuración ni decisiones de ese proyecto, de PMO, COVAL u otros.
- El identificador técnico histórico empresa-ia-opencode-adapter y la etiqueta del puente principal que contiene «Empresa-IA» aparecen en documentos CGL: son nombres técnicos, no evidencia de identidad del otro proyecto.
- FreeLLMAPI es una dependencia utilizada por CGL; no se atribuye a CGL propiedad exclusiva de su infraestructura.

## 2. Precedencia y fuentes

1. Evidencia de Ubuntu del 16/10 aportada literalmente por Director/usuario en MISIÓN CGL-GUARDA-RECONCILIADO-20261016.
2. Código/archivos efectivos del checkout.
3. Git local/remoto comprobado durante este guardado.
4. INICIA/GUARDA canónicos.
5. Informes históricos fechados.
6. Hipótesis explícitas.

La evidencia Ubuntu reproducida aquí procede del usuario, no de una nueva ejecución por Codex. La matriz detallada está en MATRIZ_RECONCILIACION_CGL_2026-10-16.md.
Referencia histórica remota: commit 02902a1e44536053a946bd3d0fd9dd21144d9866, este mismo path antes de la consolidación. No reproducir sus pendientes superados como estado vigente.
Referencias complementarias: JORNADA_2026-10-06_CHECKPOINT_DIRECTOR_CONSTRUCTOR.md, JORNADA_2026-10-08_GUARDA_CANONICO.md, docs/TEMPORAL_V1_MANIFEST.md y docs/CONTINUIDAD_2026-10-12.md. Sus restricciones y resultados tienen fecha y no prevalecen sobre verificaciones posteriores.

## 3. Arquitectura real acreditada

ChatGPT Director → Secure MCP Tunnel → adaptador MCP → CLI Temporal → Temporal Server → Worker → actividades → adaptador auxiliar STDIO → API OpenCode → FreeLLMAPI → texto/artefactos → oráculo independiente → estado durable → get_temporal_mission.

Fuentes:
- mcp-opencode-adapter/src/index.ts: herramientas y sesiones/prompt_async.
- mcp-opencode-adapter/src/temporal-bridge.ts: startTemporalMission, getTemporalMission, decideTemporalPermission; inicio de genericConstructorMissionWorkflow.
- experimental/temporal-poc/src/worker.ts: imports activities.ts, mission-activities.ts, bridge-activities.ts; Worker.create carga workflows.ts y registra actividades, namespace default, task queue por entorno.
- experimental/temporal-poc/src/workflows.ts: genericConstructorMissionWorkflow y query generic-mission.
- experimental/temporal-poc/src/mission-activities.ts: preparación, identidad OpenCode, inicio/reconciliación, espera, permisos, reparación, abort y oráculo.
- bin/mission-runner.sh y bin/mission_runner_structured.py invocan opencode run por una ruta independiente. No se ha identificado que el workflow genérico llame a esos runners.
- opencode.json documenta el proveedor FreeLLMAPI; no se copian secretos ni configuración global.

MCP Events existe en el adaptador, pero el retorno automático aceptado a ChatGPT sigue pendiente. El workflow genérico inspeccionado no llama bridgeEmit. El receptor T4 fue interno con envío sustituido: no acredita webhook real ni reactivación de ChatGPT.

## 4. Estado de componentes al cierre documental

| Capacidad | Estado y límite |
|---|---|
| Puente principal, misma sesión, consulta y continuación | PASS histórico; conservar, no repetir pruebas básicas |
| Túnel y complemento Constructor Linux Temporal | Publicación/disponibilidad confirmadas por Director/usuario durante el 16/10; no garantía de persistencia futura |
| Catálogo auxiliar CGL-02 | PASS local initialize/tools/list; prueba cerrada, distinta de aceptación funcional |
| Temporal Server/Worker | Activos observados en Ubuntu el 16/10; no reconsultados durante este GUARDA |
| Worker → OpenCode → proveedor | Ejecuciones históricas; circuito actual integral aún sin aceptación |
| Oráculo: raíces | Preparador y validador instalados confirmados sobre raíz heredada |
| Identidad/cwd OpenCode | Comprobados en Ubuntu; directorio histórico identificado, no intercambiable automáticamente con otro |
| Preparación de misión genérica nueva | Código existente; workspace histórico no acreditado como limpio/compatible |
| Consulta generic-mission del run fallido | Error reportado; causa concreta del handler pendiente de correlación de build |
| MCP Events y aceptación E2E | Pendientes; no declarar MVP PASS |

## 5. Evidencia Ubuntu del 16/10 — NO REPETIR

### Temporal y Worker

- Temporal Server PID 245093, 127.0.0.1:7243.
- Worker PID 2262122; launcher 2262108; usuario rodrigo_mella.
- Entrada: experimental/temporal-poc/src/worker.ts.
- Entorno inicial del Worker: CGL_WORKSPACE_ROOT y CGL_OPENCODE_USER ausentes.
- workspaceRoot() selecciona por defecto:
  /home/rodrigo_mella/.local/state/constructor-temporal-poc/workspaces
- expectedExecutor() selecciona UID/HOME del Worker y ejecutable heredado.
- La invisibilidad de esos PIDs desde el sandbox NO demuestra ausencia en el anfitrión.
- Los PIDs son evidencia fechada, no identificadores fiables para intervenciones futuras.

### Oráculo — duda de raíz cerrada

Lectura administrativa realizada por el usuario sobre /usr/local/libexec/cgl-oracle-prepare:
`6:ROOT = Path("/home/rodrigo_mella/.local/state/constructor-temporal-poc/workspaces").resolve()`

El validador /usr/local/libexec/cgl-oracle-validate declara la misma raíz heredada.
**Compatibilidad de raíces Worker/preparador/validador confirmada para la configuración observada.**
No solicitar otra lectura del preparador. /srv/cgl/workspaces es una alternativa del código de aislamiento, no la raíz efectiva de esta ejecución heredada.

### OpenCode — identidad y directorio identificados

Observación del usuario mediante ss y comprobaciones de proceso:
- Listener 127.0.0.1:4098, PID 1428947.
- Usuario rodrigo_mella, UID 1000.
- Ejecutable /home/rodrigo_mella/.opencode/bin/opencode.
- Comando: opencode serve --hostname 127.0.0.1 --port 4098.
- Cwd:
  /home/rodrigo_mella/.local/state/constructor-temporal-poc/workspaces/cgl-v1-csv-expense-20261009-003

No volver a declarar su identidad/cwd «sin comprobar». Esto no certifica GET /path/worktree ni compatibilidad con un workspace nuevo.

### Workspace histórico — preservar

El listado aportado contiene opencode.json, expense_cli.py, test_expense_cli.py, sample.csv, README.md y CSV de pruebas anteriores; no mostró .git.
No está acreditado como workspace limpio de una misión genérica nueva.
No se ha demostrado que crear otro workspace sea indispensable para cualquier variante E2E.
Durante este GUARDA: no crear otro, no modificar el histórico, no borrar artefactos ni reiniciar OpenCode para cambiar cwd.

## 6. Túnel y herramientas publicados

- Túnel independiente: tunnel_6ad26dc258548191a71dcf157b1b8600.
- Perfil: cgl-temporal-publicacion.
- Complemento: Constructor Linux Temporal.
- Ocho herramientas confirmadas por Director/usuario:
  abort_mission, continue_mission, decide_temporal_permission, get_mission,
  get_temporal_mission, reply_permission, start_mission, start_temporal_mission.
- Puente principal conservado.
- Perfil local nuevo creado anteriormente con referencia segura, sin copiar la clave; doctor y sondeo fueron observados.
- Persistencia futura del runtime no garantizada. No detener la terminal que mantiene el túnel.
- No crear otro túnel/complemento ni repetir publicación, health o tools/list auxiliar.
- Que el sandbox no exponga las herramientas Temporal a Codex no contradice su disponibilidad confirmada en ChatGPT Director.

## 7. Run fallido y causa conocida

- Workflow: cgl-mvp-inspeccion-readonly-20261016.
- Run: 01a1461a-b885-7b70-a33a-55477c24d2da.
- Tipo: genericConstructorMissionWorkflow; task queue constructor-poc.
- Historial consultado anteriormente por Codex con workflow-id y run-id explícitos, namespace default, address 127.0.0.1:7243.
- 11 eventos; inicio 2026-10-16T19:05:18.725750708Z; cierre 19:05:19.373643092Z.
- Eventos 3/4 y 9/10: Workflow Tasks atendidas/completadas por 2262122@WIN-81CO28VJDO7.
- Eventos 5/6/7: prepareGenericMission programada, iniciada y fallida.
- Error: generic contract: workspace must be a non-empty string up to 1000 chars.
- Fallo no reintentable; evento 11 cierra FAILED. No llegó a iniciar OpenCode.
- SDK temporal-typescript 1.24.0.
- Build registrado: @temporalio/worker@1.24.0+c0779ef292b472b96da111afa922cfda29b7c5f396cf4a8d6b60094ae5a2cbba.
- Referencia verificable: identidad exacta y eventos anteriores del historial Temporal. El volcado no se guardó como archivo; estos datos proceden del informe previo de lectura de Codex, no de una nueva consulta durante este GUARDA.

No es PASS E2E. No reanudar, repetir o cancelar el run.
El error posterior «Workflow did not register a handler for generic-mission» no está explicado definitivamente: el código actual registra el handler antes de preparar; la versión histórica f9e979c lo hacía después. Esa hipótesis requiere correlación del build. La consulta del bridge no fija run-id; no se acreditó el destino exacto de la consulta original.
La misión accidental iniciada mediante start_mission es distinta: ID/estado no confirmados; no intervenirla ni confundirla con este run.

## 8. Contrato y preparación existentes

start_temporal_mission exige workflow_id, title y contract. workflow_id debe igualar contract.missionId.
Contrato: missionId, workspace absoluto existente, instructions, validation, budget y artifactPaths.
validation.kind = external-oracle; oracleId = expense-oracle-001, perfil csv-expense-v1.
Artefactos del ejemplo: expense_cli.py y test_expense_cli.py; expense_cli.py requerido por el oráculo.
budget.maxTokens debe ser null: no hay medidor fiable; no inventar límites de tokens.
prepareGenericMission valida opencode.json, propiedad/configuración, git válido, política de permisos y ausencia de artefactos declarados preexistentes.
verifyOpenCodeWorkspace valida identidad y directorio/worktree efectivos del servidor.
createMissionWorkspace y workspace-setup.ts existen para preparación exclusiva de un nuevo directorio, política y git, pero NO se ejecutan durante este GUARDA.
Crear un directorio no cambia el cwd del OpenCode activo.
Las pruebas de generic-workflow.integration.test.ts usan workflow real y actividades simuladas en Temporal efímero; no acreditan ejecución actual de OpenCode/oráculo/modelo.

## 9. Decisiones, restricciones y riesgos

- REUSE FIRST; no rediseñar ni mezclar proyectos.
- Exclusivamente documentos en esta misión; sin pruebas, sudo, misiones, inferencias, despliegues, permisos globales o cambios de servicios.
- No tocar los túneles, conectores, Temporal, Worker, OpenCode, FreeLLMAPI ni la terminal del túnel.
- No crear ni reutilizar automáticamente workspaces; preservar el histórico.
- No conceder permisos automáticamente ni intervenir la misión accidental.
- No confundir ready, RUNNING, idle, exit 0, archivo existente o Temporal COMPLETED con aceptación funcional.
- Código fuente actual y bundle cargado son evidencias diferentes. No atribuir una versión al Worker solo por archivos en disco.
- Mantener permisos por decisión puntual; no aprobar ejecución generada bajo supuestos de aislamiento no demostrados. El cierre de G01 operativo requiere decisión basada en la ruta que se elija, no reabrir su diseño histórico indiscriminadamente.
- No incorporar secretos, SQLite, sesiones, outbox, workspaces ni suites privadas al commit documental.

## 10. Estado Git y persistencia

Comprobado al iniciar este guardado:
- Origin: https://github.com/remc87-alt/Constructor-General-Linux.git
- Rama: m03-g5-consolidation-20261008.
- HEAD local previo: f98140129675e0f0f139e82ff196d4c83aa5f081.
- HEAD remoto consultado por git ls-remote: 02902a1e44536053a946bd3d0fd9dd21144d9866.
- No afirmar sincronización. La referencia origin local puede estar desactualizada.
- Árbol rastreado limpio antes del guardado.
- Sin seguimiento preexistentes, no añadir ni borrar:
  docs/G01_BWRAP_CIERRE_2026-10-12.md y resultado.json.
- Borrador externo inspeccionado y preservado:
  /home/rodrigo_mella/.local/state/cgl-temporal-publicacion/GUARDA_PENDIENTE.md.
  Sus pendientes de publicación son históricos y superados por la confirmación posterior del Director.
- Intentos anteriores de escritura por herramienta GitHub rechazados: exigencia de aprobación con política never.
- Este guardado genera un commit documental local sobre la base local existente, sin merge ni sincronización masiva.
- Identificar el commit documental efectivo con git log -1 --format=%H -- docs/continuidad/2026-10-16/INICIA_SIGUIENTE_CHAT.md. No insertar un hash autorreferente.
- **Estado de respaldo: LOCAL; publicación de esta consolidación no confirmada.** Un commit local no acredita respaldo remoto. Ante otro rechazo no intentar otro transporte para eludir el control.
- El informe final de esta misión debe indicar el hash local resultante, el remoto verificado y el rechazo/resultado de publicación.
- Resultado del intento de publicación de esta consolidación: herramienta GitHub update_file rechazada con «MCP tool call requires approval, but approval policy is never». No se publicó este contenido, ni INICIA ni matriz; no se intentó git push u otro transporte alternativo. El commit documental local contiene el guardado; su hash efectivo se obtiene con el comando anterior y figura en el informe final.

## 11. Pendientes reales y única reanudación

Bloqueo operativo inmediato: no está determinada ni aceptada una ruta de misión compatible con el directorio actual de OpenCode y las reglas de preparación/validación. Las raíces y la identidad de OpenCode YA están confirmadas.
No afirmar que sea indispensable un workspace nuevo para cualquier E2E.

Próxima misión, todavía NO ejecutada: **CGL-E2E-PRIMERA-ACEPTACION**.
1. Inspección focalizada del código para determinar si el flujo histórico admite una prueba controlada sin crear workspace.
2. Si no, justificar el workspace nuevo y el mecanismo existente para asociarlo con OpenCode, identificando cualquier intervención necesaria.
3. Presentar solicitud exacta, validación y riesgos; obtener autorización correspondiente.
4. Ejecutar una sola misión Temporal real y recuperar resultado verificable, sin sustituirla por start_mission.
5. Después abordar aceptación del retorno automático MCP Events → ChatGPT.

No reabrir investigación del túnel, herramientas, SDK, raíces del oráculo ni identidad/cwd ya identificados.
