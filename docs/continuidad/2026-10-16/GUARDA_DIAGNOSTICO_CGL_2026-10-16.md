# GUARDA MAESTRO — Constructor General Linux — 16/10/2026

MISIÓN: CGL-GUARDA-INTEGRAL-20261016. Estado MVP: **PARCIAL**. Gate de despliegue: **NO-GO**. Rollback: **PARCIAL**.
Este es el estado vigente al cierre. Sustituye instrucciones operativas anteriores, conservadas íntegramente en Git, no las evidencias históricas. Publicar código no significa desplegarlo.

## 1. Identidad, Git y fuentes

Proyecto exclusivo Constructor General Linux (CGL), repositorio https://github.com/remc87-alt/Constructor-General-Linux, rama `m03-g5-consolidation-20261008`, checkout `/home/rodrigo_mella/constructor-general-linux-m01-lab`.
Empresa IA, PMO y COVAL son proyectos independientes. Una denominación técnica histórica del puente que contenga Empresa-IA no acredita pertenencia a otro proyecto ni autoriza tocarlo.

- HEAD local/remoto comprobados al iniciar este guardado: `c1d625b18dd72c450767314695b0c786de486158`. Fetch: cero commits divergentes.
- Código preparado preservado en `ff833399c9d4a80ac9f74cf9336515bfa7b4dcda`. **Worker operativo todavía no actualizado**.
- El commit documental es el que contiene este GUARDA y el manifiesto; resolver con `git log -1 --format=%H -- docs/continuidad/2026-10-16/INICIA_SIGUIENTE_CHAT.md`. Verificar SHA de rama local/remota, sin inferir publicación a partir de un commit local.
- Antecedentes Git conservados: f981401, 47a26b3, e216613, 02902a1 y merge 8ef1a01. La conciliación anterior está cerrada; no fusionar de nuevo ni resetear.
- Fuentes de esta consolidación: evidencia Ubuntu aportada por Director, resultados Codex anteriores, código preparado, manifiestos y logs locales; Git comprobado durante el GUARDA. No se ejecutaron pruebas funcionales ni inspecciones nuevas de servicios para guardar.
- Histórico documental anterior: [GUARDA en c1d625b](https://github.com/remc87-alt/Constructor-General-Linux/blob/c1d625b18dd72c450767314695b0c786de486158/docs/continuidad/2026-10-16/GUARDA_DIAGNOSTICO_CGL_2026-10-16.md). No tomar sus próximos pasos superados como actuales.

## 2. Resumen ejecutivo y arquitectura real

La primera misión E2E real recorrió Temporal, validó contrato/workspace e inició OpenCode, pero terminó bloqueada esperando permiso. No produjo aceptación funcional ni ejecución final del oráculo. Se contuvo la sesión y se rechazó el permiso residual. Se prepararon compatibilidad de replay, estado compartido y productor terminal; las pruebas aprobadas no equivalen a despliegue ni a recepción por ChatGPT.

Ruta objetivo: ChatGPT Director → túnel MCP Temporal → adaptador MCP → Temporal Server/Worker → actividades → adaptador STDIO → OpenCode :4098 → FreeLLMAPI → oráculo independiente → resultado durable → MCP Events → Director.
El workflow genérico utiliza actividades y adaptador sobre API OpenCode. No hay evidencia de que invoque directamente `bin/mission-runner.sh` ni `bin/mission_runner_structured.py`; son rutas existentes distintas, no reconstruirlas para este MVP.

### Matriz de componentes

| Enlace/componente | Estado | Evidencia y límite |
|---|---|---|
| Puente principal y OpenCode 4096/4097 | PASS histórico | Conservado; no intervenido por estas correcciones |
| Túnel/complemento Constructor Linux Temporal | PASS histórico observado | ID `tunnel_6ad26dc258548191a71dcf157b1b8600`, perfil `cgl-temporal-publicacion`; ocho herramientas publicadas; no repetir descubrimiento |
| Persistencia del túnel | PASS histórico observado | systemd de usuario `cgl-temporal-publicacion.service`, habilitado; independencia de terminal y recuperación probadas. WSL debe estar ejecutándose |
| Temporal operativo | PASS histórico observado | namespace default, 127.0.0.1:7243, queue constructor-poc; PID Worker 2262122 identificado por Ubuntu, no reiniciado. No garantiza salud futura |
| Contrato/workspace y arranque OpenCode del E2E | PASS de esas etapas | Historial del run real; no significa éxito funcional |
| FreeLLMAPI | PARCIAL en este E2E | Proveedor/modelo identificados en sesión OpenCode; sin prueba independiente nueva del HTTP del proveedor ni resultado aceptado. PASS históricos se conservan |
| Oráculo independiente | NO DEMOSTRADO en este E2E | No se ejecutó tras el permiso; configuración/raíces identificadas, no invocar para el GUARDA |
| Parche de cierre/replay | PASS local/Ubuntu | Historial 46 eventos y 11 pruebas aisladas aprobados; no desplegado |
| Mapa compartido/recuperación/permisos | PASS local; PARCIAL operativo | Código y pruebas preparados; lanzador persistente sin activar la referencia compartida |
| Eventos terminales | PASS local; PARCIAL operativo | Productor probado, lectura real generó mission.blocked; ningún webhook enviado por esa lectura |
| MCP Events → ChatGPT | NO DEMOSTRADO | Falta suscripción activa y recepción efectiva del Director |
| Rollback | PARCIAL | Reconstrucción exacta no acreditada; fallback compatible congelado pendiente de traspaso aislado |
| MVP integral | PARCIAL / NO-GO | No hubo E2E funcional aceptado ni retorno automático demostrado |

## 3. Primera ejecución real, fallos y contención

- Mission/workflow: `cgl-e2e-expense-20261016-001`.
- Run: `01a14694-6989-76fd-b022-cbe1e0df549d`.
- Sesión: `ses_eb96b9366ffesoW1f3ujomVt5V`.
- Permiso: `per_1469653bf001sJeiPx47tpLr7H`, edición de `expense_cli.py`.
- Workspace fallido: `/home/rodrigo_mella/.local/state/constructor-temporal-poc/workspaces/cgl-e2e-expense-20261016-001`.
- Contrato: maxDurationMs=240000, maxRepairAttempts=0. No publicar instrucciones privadas ni estados completos.
- UTC: 21:18:14 preparación/arranque; 21:20:21 permiso; 21:22:14 cierre `blocked / permission_timeout`. Temporal COMPLETED no equivale a passed.
- 46 eventos: prepareGenericMission, verifyOpenCodeWorkspace, startMission y waitMission. Eventos 41/42 temporizador; 43–45 última Workflow Task; 46 cierre. No abortMission ni validación de oráculo en ese historial.
- El get_mission directo devolvió unknown mission_id: Worker y complemento consultaban mapas distintos.
- Contención posterior por mecanismo existente: aborted_at=2026-10-16T21:38:18.130Z; rechazo exclusivo del permiso residual. Después, cero sesiones activas, permisos y preguntas. Es observación fechada; no repetir contención ni conceder once a ese run cerrado.
- El workspace histórico cgl-v1-csv-expense-20261009-003 permanece intacto. El workspace del E2E fallido está contaminado: **no reutilizar ni borrar artefactos**.
- Misión accidental anterior `mission-1792179758169-nsr3k4`, sesión `ses_eb9c31b7affea25BdS25Eavq8Y`: aborto y rechazo residual ya cerrados; no intervenirla de nuevo.
- Run previo de contrato inválido cgl-mvp-inspeccion-readonly-20261016 / 01a1461a-b885-7b70-a33a-55477c24d2da: FAILED en prepareGenericMission por workspace vacío; no OpenCode. No repetir ese diagnóstico ni convertirlo en E2E PASS.

## 4. Código preservado, sin despliegue

Commit funcional `ff833399c9d4a80ac9f74cf9336515bfa7b4dcda`; inventario completo en el manifiesto.

| Archivos | Cambio preparado |
|---|---|
| experimental/temporal-poc/src/workflows.ts | patched("generic-terminal-containment-v1"): replay anterior sin insertar aborto; ejecuciones nuevas mantienen aborto obligatorio en cierre no satisfactorio y limpieza del estado de permiso |
| experimental/temporal-poc/src/mission-activities.ts | Adaptador del checkout versionado; mapa y stores Temporal existentes explícitos; hijos transitorios con emisor off |
| mcp-opencode-adapter/src/durable-mission-store.ts e index.ts | Lecturas frescas, flock entre procesos, escritura atómica, sesión inmutable; exclusión por misión y validación de permiso/sesión; mapa explícito por MCP_MISSION_MAP_FILE |
| mcp-opencode-adapter/src/temporal-terminal-events.ts y temporal-bridge.ts | Describe y resultado durable del run exacto; clasificación funcional, rechazo de falsos passed; lecturas acotadas; correlación workflow/run/sesión |
| mcp-opencode-adapter/src/event-emitter.ts, events.ts e index.ts | Reutiliza outbox, firmas y suscripciones; observación terminal opt-in, clave temporal-terminal:<run_id>; catálogo diferencia final técnico y funcional |
| Pruebas generic-workflow.integration, generic-workflow.replay, shared-missions y temporal-terminal-events | Cobertura focalizada; replay histórico opt-in; pruebas con actividades/callback simulados |

No se ampliaron permisos automáticos para .py ni bash. El contrato funcional no cambió.
El adaptador persistente Temporal necesita, en una futura intervención autorizada, MCP_MISSION_MAP_FILE apuntando al mapa heredado, stores explícitos, MCP_EVENTS_EMITTER=on y MCP_TEMPORAL_RESULTS=on. Propuestas privadas preparadas, no instaladas. No activar solo una mitad y declararla despliegue coherente.

## 5. Matriz de pruebas y evidencia

| Lote | Resultado | Fuente y alcance |
|---|---|---|
| Replay histórico de 46 eventos | PASS | Confirmación Ubuntu del Director; no repetido durante GUARDA |
| Integración Temporal aislada | 11 PASS, 0 FAIL, 0 SKIPPED; 41,17 s | /tmp/cgl-temporal-integration.3eXcc7/tests.log, SHA en manifiesto; actividades simuladas |
| Unidad/adaptador anteriores | 20 PASS | Resultados Codex aceptados por Director |
| Estado compartido, recuperación, Events/outbox | 63 PASS | 10 adaptador/estado + 11 recuperación + 42 Events; simulaciones, no modelos |
| Productor terminal/regresiones afectadas | 36 PASS, 0 FAIL, 0 SKIPPED | 3 nuevas terminales + 33 regresiones; callback simulado, sin recepción ChatGPT |
| Adaptador del fallback congelado | 2 PASS | frozen-adapter-sandbox.log; paquete congelado, no runtime operativo |
| Traspaso entre versiones once/reject/timeout | BLOQUEADO por entorno | ERR_SWC_NATIVE_CACHE en preflight; no se inició Temporal efímero ni se probó el traspaso |
| Recepción real del Director | NO DEMOSTRADO | No hay evidencia de suscripción/recepción efectiva |

Los lotes se solapan: **no sumar como pruebas independientes ni aceptación E2E**. No repetirlos por cambio de chat. Un error nativo del sandbox no es FAIL del workflow. /tmp puede desaparecer: resumen y hashes quedan publicados; artefactos privados siguen siendo necesarios para comprobar los originales.

## 6. Desfase y rollback: hechos, límites y alternativa

Worker observado en Ubuntu: UID 1000 rodrigo_mella, PID 2262122, launcher 2262108, Node+tsx, CWD del módulo Temporal del checkout. POC_TEMPORAL_ADDRESS=127.0.0.1:7243; POC_TASK_QUEUE=constructor-poc; POC_EFFECTS_DIR=~/.local/state/constructor-temporal-poc/effects. CGL_WORKSPACE_ROOT, CGL_OPENCODE_USER y MCP_MISSION_MAP_FILE ausentes. No fue reiniciado ni sustituido.
Worker, preparador y validador usan raíz heredada `/home/rodrigo_mella/.local/state/constructor-temporal-poc/workspaces`; identidad OpenCode UID 1000 y ejecutable heredado ya identificados. Son comprobaciones cerradas.

El runtime no programó el aborto final que sí contiene el código preparado. Replay sin parche falló al consumir evento 46 porque esperaba una actividad nueva; parche aprobado resolvió ese replay en Ubuntu.

Build registrado: `@temporalio/worker@1.24.0+c0779ef292b472b96da111afa922cfda29b7c5f396cf4a8d6b60094ae5a2cbba`.
Candidato histórico: base f9e979c8217f56956ee0a4bca6572106823d70e1 + backups DD del 11/10, checksums originales verificados. Compilación Ubuntu PASS, Node v22.23.2 y SDK 1.24.0. SHA completo candidato: `b280a98800af4ff87f4e1b22b5cd15254e5f2450df8d6a1e63700b9ff889076d`; bundle_matches=false.
El SDK local genera su Build ID por SHA256(bundle.code) si no se fija ID explícito: no se compararon magnitudes distintas en ese modo. El hash incluye sourcemaps con rutas absolutas; no acredita incompatibilidad funcional. No se recuperaron los bytes del bundle anterior, ni procedencia completa de actividades/dependencias cargadas. No forzar PASS del verificador ni atribuir un commit exacto al Worker en memoria.

Fallback alternativo: `/home/rodrigo_mella/.local/state/cgl-temporal-publicacion/rollback-compatible-20261016`. Es núcleo endurecido compatible propuesto, **no réplica del Worker anterior**. Contiene snapshot de código/deps, procedimiento y prueba nueva de traspaso real de Workers de prueba con actividades simuladas. El workflow congelado tiene los mismos bytes que el código aprobado actual; el paquete usa mapa durable vigente, no restaura mapas antiguos.
Los verificadores fuente y procedimiento se conservan en [rollback/](rollback/ROLLBACK_PROCEDURE.md), sin snapshots ni estado privado. Son copia documental: **no ejecutar desde docs**; el comando próximo usa el directorio privado preparado. Si falta ese directorio, detenerse y reconstruir/revalidar desde las referencias documentadas, nunca inventar un verified-fallback.json.

## 7. MCP Events: implementación y aceptación pendiente

- permission.required existe a partir de permisos reales OpenCode. No implica autorización.
- Productor terminal nuevo consume describe/result de Temporal fijando run_id; no añade comandos al workflow ni altera replay.
- mission.completed exige functional_status=passed y evidencia de oráculo satisfactoria; mission.failed/blocked conservan correlación. Un cierre blocked no se convierte en solicitud viva de permiso.
- El outbox persiste antes del envío, utiliza eventId estable, firmas, expiración, deduplicación y evidencia de errores/reintentos. Pruebas con recepción sustituida no prueban entrega externa.
- Ruta soportada: [OpenAI MCP Events](https://developers.openai.com/plugins/build/mcp-events), ChatGPT Work compatible; escritorio con Cloud. ChatGPT debe crear events/subscribe con callback y secreto. Codex no tiene esa operación expuesta aquí. No pedir/copiar secretos manualmente.
- Director: suscribir los cuatro eventos por mission_id exacto de la próxima misión autorizada, antes de ejecutarla; comprobar persistencia/challenge y luego recepción real. No generar eventos falsos ni reusar la misión fallida para fabricar aceptación. La observación interna cada 10 s no es entrega por polling a ChatGPT: el retorno sigue siendo webhook HTTPS.

## 8. P0 y próximos objetivos — orden estricto

1. **Ahora: rollback PARCIAL.** En Ubuntu ejecutar únicamente:

```bash
bash /home/rodrigo_mella/.local/state/cgl-temporal-publicacion/rollback-compatible-20261016/verify-compatible-rollback.sh
```

Recaptura Node/dependencias en un área privada, conserva copias anteriores, verifica precondiciones, usa Temporal en memoria/puerto libre distinto de 7243 y limpia solo el servidor de prueba. Prueba tres traspasos (once/reject/timeout) y el adaptador congelado. No toca Worker operativo. Registrar logs y verificar `verified-fallback.json`; su mera existencia no sustituye revisión de resultados/hashes. Si falla, diagnosticar solo ese fallo.
2. Si pasa: revisar gate de despliegue, integridad/compatibilidad del fallback, ausencia de workflows afectados, configuración, respaldo y rollback ejecutable. Devolver control al Director para autorización; no desplegar implícitamente.
3. Reconciliar y actualizar controladamente Worker y adaptador Temporal, preservando mapa/stores y una sola instancia. No tocar canal principal.
4. Activar emisor/observador terminal persistentes en ruta Temporal, establecer suscripción real del Director y demostrar recepción; no declarar PASS solo por generación o challenge.
5. Con autorización explícita, una sola misión E2E real supervisada, en workspace limpio autorizado distinto del fallido: permisos humanos exactos, misma sesión, proveedor, oráculo, resultado recuperable y retorno automático.
6. Aceptación MVP únicamente cuando todos los enlaces estén demostrados. No anticipar PASS por un workflow creado ni por Temporal COMPLETED.

## 9. Recuperación segura y restricciones

Procedimiento detallado: [ROLLBACK_PROCEDURE.md](rollback/ROLLBACK_PROCEDURE.md). El fallback operativo requiere autorización posterior, hashes correctos, identificación actual del Worker actualizado, término controlado y confirmado antes de arrancar otra instancia, configuración heredada y verificación de poller/estado. No SIGKILL automático ni pidfiles retirados mientras el proceso siga vivo. El ctl.sh canónico espera su ruta: no aplicarlo ciegamente al fallback.
No restaurar desde backup Temporal SQLite, historiales, mapas, efectos, decisiones humanas, sesiones, suscripciones/outbox o workspaces. Respaldos de estado sirven como evidencia; no sobrescribir decisiones posteriores. Mantener referencias de autenticación sin publicar ni modificar secretos.
No tocar Empresa IA, otros proyectos, 4096/4097, túneles, Temporal u OpenCode. No crear infraestructura ni otro Worker/túnel/complemento. No modelos, misiones ni permisos automáticos durante recuperación documental. El sandbox sin /proc del anfitrión no acredita ausencia del Worker; D-Bus de usuario disponible para el túnel no equivale a shell libre del host.

## 10. DO_NOT_REPEAT y contradicciones resueltas

No repetir sin regresión demostrada: CGL-01/02 y publicación de herramientas; salud básica del túnel/Temporal; roots heredados; identidad/entorno del Worker y OpenCode; contención antigua; investigación inicial de mapas; replay 46 eventos; 11 integración; 20 unidad; 63 estado/Events; 36 productor. No volver a ejecutar verify-bundle.mjs para perseguir igualdad sin nueva evidencia de reconstrucción.
Quedaron superados los pendientes del GUARDA anterior sobre crear el primer workspace, ejecutar el primer E2E, identificar/cancelar misión accidental, publicar herramientas y persistencia del túnel. Se ejecutó un primer E2E fallido y contenido; **no** una aceptación funcional exitosa. Continúan abiertos el despliegue coherente, fallback, suscripción real y E2E final. Históricos íntegros en Git, no mezclarlos con el estado actual.

## 11. Backups privados y preservación

Inventario de rutas y SHA-256: [MANIFIESTO_GUARDA_CGL_2026-10-16.json](MANIFIESTO_GUARDA_CGL_2026-10-16.json). Publica referencias/hashes, no su contenido.
Áreas: contención de misión fallida; gate-despliegue-20261016T222815Z; gate-continuacion-20261016; rollback-candidate-20261016; rollback-compatible-20261016. `verified-fallback.json` no existía al cerrar este guardado. No hay hash que certifique una validación aún no ejecutada.
No publicar snapshots, node_modules, binarios, estados de misión, callbacks/secretos o logs privados. No borrar `docs/G01_BWRAP_CIERRE_2026-10-12.md` ni `resultado.json`, sin seguimiento y excluidos. Preservar también el borrador externo GUARDA_PENDIENTE.md como histórico, sin reactivar sus pendientes.

## 12. Método de guarda y prueba documental

Fetch de referencia remota → preservar/revisar cambios y excluir privados → detectar divergencia → commits acotados (código preparado y documentación) → push normal únicamente a rama autorizada → comparar SHA local/remoto y leer documentos desde la referencia remota. Sin force, merge automático, main ni credenciales alternativas. Si falla, conservar commits locales y reportar el error; no declarar GUARDA PASS.
INICIA debe recuperar objetivo, arquitectura, estado real, evidencias, cambios, riesgos, decisiones, próxima acción, restricciones y DO_NOT_REPEAT leyendo exclusivamente los documentos publicados. La simulación es documental: no ejecuta scripts, pruebas ni servicios. La verificación remota y sus commits se informan al finalizar este guardado.

## 13. ADENDA DEFINITIVA DE ALCANCE — CGL-MVP-ALCANCE-DEFINITIVO-20261016

Decisión expresa del usuario, formalizada por orden del Director el 16/10/2026.
**Objetivo definitivo: una herramienta de desarrollo funcional, confiable y supervisada desde ChatGPT. No se exige autonomía absoluta.** El usuario encarga tareas, supervisa, autoriza lo sensible, interviene cuando hace falta, recupera resultados y continúa sin perder avances. La utilidad real para desarrollar es la medida de éxito.

### Precedencia y conservación del checkpoint

Esta adenda prevalece sobre cualquier interpretación anterior que exija autonomía total o retorno automático para aceptar el MVP. Complementa, sin reescribir, el GUARDA publicado en `4021ffa4a7eca636c1171fad0b544a7609505c61`. Las secciones 2, 7 y 8 anteriores conservan hechos y planes históricos; sus exigencias de MCP Events como condición obligatoria quedan sustituidas por esta adenda. Ningún PASS histórico se invalida por cambiar el alcance. Temporal permanece en la arquitectura; no se autoriza eliminarlo ni rediseñar la solución.

Ruta obligatoria del MVP supervisado: ChatGPT Director → herramientas MCP disponibles → Temporal/Worker de la arquitectura actual → OpenCode → FreeLLMAPI → resultados verificables → consulta manual del Director y continuación de la misma misión. El oráculo existente se conserva como mecanismo de verificación del contrato de prueba elegido. MCP Events puede complementar la consulta; su recepción automática no es requisito de cierre.

### Siete criterios obligatorios de aceptación

1. **A01 — Encargo real:** ChatGPT Director envía una misión real a Constructor Linux mediante las herramientas disponibles.
2. **A02 — Desarrollo verificable:** OpenCode ejecuta una tarea de desarrollo y produce resultados verificables.
3. **A03 — Permisos humanos:** los permisos sensibles requieren autorización humana explícita; no hay aprobaciones automáticas de las solicitudes de permiso. La intervención humana es parte del producto, no un fallo de autonomía.
4. **A04 — Supervisión y continuidad:** el Director consulta estado, recupera resultados y continúa la misma misión conservando identidad y contexto.
5. **A05 — Continuidad en GitHub:** trabajo y decisiones se preservan y recuperan mediante INICIA/GUARDA publicados.
6. **A06 — Recuperación segura:** existe una vía segura, documentada y verificable de recuperación ante fallos; puede requerir intervención manual. No exige reconstrucción binaria exacta de Workers históricos.
7. **A07 — Ciclo repetible:** el ciclo completo supervisado funciona de forma repetible y tiene evidencia de aceptación. Una misión real aceptada y la evidencia de continuidad/repetibilidad deben respaldarlo; no exigir otra ejecución si la evidencia válida ya cubre el comportamiento.

No declarar MVP PASS hasta ejecutar y validar una misión real supervisada que acredite estos criterios. El E2E bloqueado por permiso conserva su evidencia parcial; no pasa a ser éxito funcional por esta decisión. Los PASS unitarios/integración no sustituyen aceptación E2E.

### Gobierno y clasificación de hallazgos

- No cambiar objetivos sin autorización del usuario. Registrar autor, fecha, decisión y evidencia en la continuidad.
- No repetir pruebas PASS salvo cambio relevante que invalide su evidencia; documentar qué cambió y qué prueba concreta necesita repetirse.
- Clasificar cada hallazgo como **BLOQUEANTE MVP** o **MEJORA POSTERIOR**, con criterio A01–A07 afectado y justificación. No convertir una mejora posterior en gate obligatorio.
- Una recuperación manual segura satisface A06 si está demostrada. Mantener el NO-GO del despliegue mientras falte su verificación; esta adenda no autoriza reinicios ni reduce la seguridad.
- Registrar por separado código preparado, runtime desplegado, pruebas simuladas y aceptación real. Preservar identidad/contexto y trazabilidad entre conversaciones.

### Hoja de ruta vigente

**Antes de aceptar el MVP supervisado:** verificar recuperación compatible/manual; revisar el gate y autorizar la actualización coherente necesaria; preparar una misión de desarrollo con verificación adecuada y permiso humano disponible; ejecutar una única misión real supervisada autorizada; recuperar estado/resultado y demostrar continuidad de la misma misión; registrar aceptación y repetibilidad en GitHub. Reutilizar evidencia cerrada y componentes existentes.

**MEJORA POSTERIOR — no bloquea el MVP por sí sola:** retorno automático MCP Events, recuperación completamente autónoma, memoria autónoma avanzada, reconstrucción binaria exacta de Workers históricos y resiliencia ante todos los escenarios. Los avances y pruebas existentes de Events y rollback se preservan; no se eliminan ni se descartan. Nuevas plataformas o infraestructura no son necesarias para aceptar el MVP actual y requerirían justificación/autorización separadas. Las autorizaciones automáticas no están autorizadas por esta hoja de ruta: cualquier propuesta futura requeriría una nueva decisión explícita del usuario.

### Estado y siguiente acción

MVP sigue **PARCIAL**: no hay misión de desarrollo integral aceptada. Despliegue sigue **NO-GO** por la recuperación compatible pendiente, no por falta de autonomía o recepción de MCP Events. Consultar la matriz A01–A07 vigente en MATRIZ_RECONCILIACION_CGL_2026-10-16.md.
Próxima acción técnica previamente preparada: verificar en Ubuntu el fallback compatible con `verify-compatible-rollback.sh`, conservar logs y revisar `verified-fallback.json`; si falla, diagnosticar solo ese fallo. Esa prueba puede demostrar la vía manual de A06; no requiere equivalencia binaria con el Worker antiguo. Después devolver el gate al Director. Esta misión solo publica alcance y no ejecuta esa acción.
