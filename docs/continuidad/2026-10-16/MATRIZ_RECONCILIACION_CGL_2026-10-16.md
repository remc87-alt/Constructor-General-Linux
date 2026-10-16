# Matriz de reconciliación CGL — 2026-10-16

Alcance exclusivo Constructor General Linux. La fuente «Ubuntu/Director» es evidencia aportada por el usuario en la misión de guardado; no una ejecución nueva de Codex. «Confirmado» tiene validez en la fecha observada, no garantiza runtime futuro.

| Hecho | Fuente | Fecha | Clasificación | Acción |
|---|---|---|---|---|
| Proyecto independiente; repo CGL | PROJECT.md, README.md, origin comprobado | 16/10/2026 | Confirmado | Excluir arquitectura/datos de otros proyectos |
| HEAD local previo f981401 y remoto previo 02902a1e | Git durante el guardado inicial | 16/10/2026 | Histórico | Estado anterior a 47a26b3 y a la integración; no usar como HEAD actual |
| Puente principal y misma sesión | Checkpoint 06/10 y smoke 12/10 | 06–12/10/2026 | Histórico | Conservar PASS, no repetir |
| Auxiliar publica ocho herramientas | CGL-02 initialize/tools/list | 16/10/2026 | Histórico, PASS local | No confundir con aceptación E2E |
| Solo cuatro herramientas visibles | GUARDA remoto 02902a1e, CGL-01/02 | 16/10, anterior a nuevo complemento | Histórico superado | No mantenerlo como bloqueo vigente |
| Constructor Linux Temporal publica ocho herramientas | Confirmación posterior Director/usuario | 16/10/2026 | Confirmado en sesión | Publicación cerrada; no repetir |
| Segundo túnel configurado/observado | Informe Codex y confirmación Director | 16/10/2026 | Histórico | Preservar terminal; persistencia futura pendiente, sin crear recursos |
| Worker/Server no visibles desde sandbox | Informes Codex | 16/10/2026 | Límite de observabilidad | No interpretar ausencia del host |
| Server 245093, Worker 2262122, launcher 2262108, usuario rodrigo_mella | Ubuntu/Director | 16/10/2026 | Confirmado en sesión | No repetir inspección ni reutilizar PIDs para señales |
| Variables CGL ausentes; modo heredado | Entorno inicial Ubuntu/Director y workspace.ts | 16/10/2026 | Confirmado | Raíz heredada; no atribuir /srv como runtime |
| Raíz preparador desconocida | Informes CGL-03/03B previos | 16/10, anterior a lectura sudo del usuario | Histórico superado | Retirar bloqueo documental |
| Preparador ROOT raíz heredada, línea 6 | Salida literal grep administrativo Ubuntu/Director | 16/10/2026 | Confirmado | No solicitar nueva lectura |
| Validador WORKSPACE_ROOT raíz heredada | Archivo instalado, informe de lectura Codex | 16/10/2026 | Confirmado | Tres raíces compatibles con configuración observada |
| OpenCode identidad/cwd desconocidos | Informes previos desde sandbox | 16/10, anterior a comprobaciones Ubuntu | Histórico superado | Retirar pendiente |
| OpenCode 1428947, UID 1000, binario heredado, cwd histórico | ss y proceso Ubuntu/Director | 16/10/2026 | Confirmado | No repetir; no cambiar cwd ni reiniciar |
| Workspace histórico con salidas y sin .git en listado | ls -la Ubuntu/Director | 16/10/2026 | Confirmado; compatibilidad genérica no acreditada | Preservar; no reutilizar automáticamente |
| Es indispensable crear workspace para cualquier E2E | Inferencia de informes previos | 16/10/2026 | No demostrado | Inspección focalizada futura antes de decidir |
| prepareGenericMission exige política/git/frescura | Código actual | 16/10/2026 | Confirmado estáticamente | Respetar precondiciones; no ejecutar preparación en GUARDA |
| Run de inspección FAILED por workspace inválido | Historial/describe leído por Codex, run exacto en GUARDA | 16/10/2026 | Histórico verificable por identidad/eventos | No contar como E2E; no repetir run |
| Error generic-mission explicado por bundle antiguo | Hipótesis frente a fuente actual y git f9e979c | 16/10/2026 | Pendiente | No afirmar causa sin correlación build |
| Copia auxiliar/canónica divergentes | CGL-01, hashes previos | 16/10/2026 | Histórico | Revisar únicamente lo necesario para ruta elegida; no sincronizar masivamente |
| MCP Events retorna a ChatGPT | Catálogo/pruebas locales/T4 interno | Hasta 16/10/2026 | Pendiente de aceptación real | Abordar después de E2E; no declarar PASS |
| Misión accidental start_mission | Referencias previas sin identidad suficiente | 16/10/2026 | Pendiente de identificación | No intervenir ni confundir con run Temporal |
| Borrador externo dice conector pendiente | GUARDA_PENDIENTE.md, inspeccionado | 16/10/2026 | Histórico superado | No sobrescribir; este GUARDA prevalece |
| Publicaciones previas rechazadas | Herramienta GitHub: approval required, policy never | 16/10/2026 | Confirmado por respuestas previas | Preservar local; no eludir controles |

## Integración documental posterior del mismo día

| Hecho | Fuente | Fecha | Clasificación | Acción |
|---|---|---|---|---|
| Divergencia 47a26b3 frente a e216613/02902a1; base f981401 | Git inspeccionado antes del merge | 16/10/2026 | Confirmado | Conservar ambas líneas y sus contenidos históricos mediante merge autorizado |
| Conflicto add/add solo en GUARDA | Git merge --no-commit | 16/10/2026 | Confirmado | Estado reconciliado como vigente; remotos íntegros en sus commits, sin reactivar pendientes superados |
| INICIA/GUARDA vigentes y procedimiento simplificado | GUARDA §10.1 e INICIA | 16/10/2026 | Documentado | Fetch/preservación/divergencia antes de guardar; publicar y verificar SHA |
| Publicación de integración | Comparación Git posterior | 16/10/2026 | Pendiente hasta igualdad de SHA | Informe final con error o confirmación; no declarar PASS por commit local |

## Persistencia del túnel existente — 16/10

| Hecho | Fuente | Fecha | Clasificación | Acción |
|---|---|---|---|---|
| Gestor usuario accesible por D-Bus, socket privado systemctl falla | Lecturas busctl y systemctl | 16/10/2026 | Confirmado | Administrar mediante bus validado; no cambiar políticas globales |
| Unidad nueva enabled y active/running | EnableUnitFiles, StartUnit y propiedades | 16/10/2026 | PASS operativo | Preservar servicio, perfil e ID existentes |
| Terminal 67226 cerrada antes del servicio; una instancia exacta | Salida terminal, cierre endpoint, Service.GetProcesses y filtrado del cgroup usuario | 16/10/2026 | Confirmado | No iniciar clientes manuales paralelos |
| Recuperación automática NRestarts 0→1, MainPID distinto y readyz 200 | KillUnit main autorizado y propiedades/endpoint posteriores | 16/10/2026 | PASS operativo | No repetir prueba de fallo sin causa |
| Catálogo ChatGPT después del traspaso | Consulta pendiente al Director | 16/10/2026 | Pendiente | Confirmar tres Temporal y cuatro principales, sin misiones |
| Perfiles y credencial conservados | Hashes y referencia sin escritura | 16/10/2026 | Confirmado | No copiar secretos ni alterar puente principal |
