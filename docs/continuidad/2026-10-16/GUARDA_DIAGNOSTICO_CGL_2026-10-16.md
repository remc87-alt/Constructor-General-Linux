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

## 10. Integración Git y antecedentes conservados

- Rama canónica: m03-g5-consolidation-20261008, origin https://github.com/remc87-alt/Constructor-General-Linux.git.
- Base común: f98140129675e0f0f139e82ff196d4c83aa5f081.
- Commit local de continuidad preservado: 47a26b3da909f304def391919e583c40dc5781cf (tres documentos).
- Línea remota comprobada antes de integrar: e216613 → 02902a1e44536053a946bd3d0fd9dd21144d9866.
- e216613 conserva el diagnóstico inicial del 16/10: perfil multicanal, observaciones del túnel y límites de publicación.
- 02902a1 conserva la adición CGL-01/CGL-02, matriz C01–C12, reglas INICIA/GUARDA y camino crítico de ese momento.
- Ambas versiones remotas permanecen íntegras en sus commits, accesibles con git show <commit>:docs/continuidad/2026-10-16/GUARDA_DIAGNOSTICO_CGL_2026-10-16.md. Son antecedentes históricos; no volver a ejecutar sus instrucciones superadas.
- Integración autorizada mediante merge de ambas líneas, sin rebase, reset, force push ni ramas permanentes adicionales. Los tres commits originales se conservan como ancestros.
- Conflicto único add/add en este GUARDA. Resolución explícita: estado reconciliado local como referencia operativa, referencias a los antecedentes remotos y metodología incorporadas en este documento. No se aplicó una selección automática ours/theirs ni se descartaron commits.
- El commit efectivo de la integración se obtiene con git log -1 --format=%H -- docs/continuidad/2026-10-16/INICIA_SIGUIENTE_CHAT.md; el informe final registra los SHA local/remoto comprobados.
- No añadir ni borrar los dos archivos sin seguimiento preexistentes: docs/G01_BWRAP_CIERRE_2026-10-12.md y resultado.json.
- Borrador externo ~/.local/state/cgl-temporal-publicacion/GUARDA_PENDIENTE.md inspeccionado previamente y preservado; sus pendientes antiguos están superados por este GUARDA.
- Intentos anteriores mediante GitHub update_file fueron rechazados: aprobación requerida, política never. Eso describe el intento anterior, no el resultado de una publicación Git posterior.
- Publicación de esta integración: se determina comparando el HEAD local con git ls-remote origin refs/heads/m03-g5-consolidation-20261008 después del intento permitido. No declarar respaldo remoto o PASS por la mera existencia del commit local. Ante rechazo, conservar el commit y detenerse, sin intentar otro transporte o credencial.

## 10.1 Procedimiento GUARDA simplificado para futuras sesiones

1. Comprobar repositorio, rama, estado local y actualizar la referencia remota mediante git fetch de la rama canónica. Esto no modifica archivos de trabajo. Comparar HEAD, referencia remota actualizada y ancestro común antes de editar continuidad.
2. Preservar cualquier cambio local antes de integrar: revisar diff y preparar un commit selectivo autorizado, o detenerse si no está clara su pertenencia. No incluir secretos ni archivos sin seguimiento automáticamente; no resetear ni borrar para limpiar el árbol.
3. Detectar divergencia con git rev-list --left-right --count HEAD...origin/m03-g5-consolidation-20261008. Integrar primero la historia necesaria con autorización. Revisar conflictos manualmente; evidencia reciente verificada prevalece y antecedentes quedan en Git. Detenerse si la resolución es ambigua.
4. Mantener un único GUARDA vigente y un único INICIA vigente: los paths de este directorio. La matriz existente es apoyo. Versiones anteriores quedan en el historial, sin crear sistemas paralelos. El INICIA identifica ruta, rama, estado, pendientes reales y DO_NOT_REPEAT.
5. Revisar diff documental, referencias, coherencia de fechas y ausencia de secretos; confirmar que no se incluye código funcional. Crear un solo commit documental por guardado cuando sea posible; una integración de historiales puede requerir un merge.
6. Publicar inmediatamente por el mecanismo Git autorizado a la rama canónica, sin force y usando únicamente las credenciales existentes. Solicitar aprobación cuando el mecanismo la requiera; no cambiar políticas o credenciales para evitarla.
7. Consultar la rama remota con git ls-remote y exigir igualdad con el HEAD local. Solo entonces declarar PASS de guardado/publicación; esto nunca equivale a PASS del MVP.
8. Si falla, informar el error exacto, los SHA local/remoto y la aprobación o reconciliación necesaria. Conservar el commit local y no repetir intentos idénticos ni eludir controles.

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
