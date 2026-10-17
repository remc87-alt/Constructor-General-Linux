# Matriz de reconciliación CGL — cierre maestro 16/10/2026

Estado vigente: MVP supervisado PARCIAL; gate NO-GO por recuperación compatible pendiente; rollback PARCIAL. Alcance definitivo según GUARDA §13. La falta de retorno automático o de equivalencia binaria no es por sí sola un bloqueo MVP. Las fuentes Ubuntu son aportadas por Director, no nuevas ejecuciones durante GUARDA. Históricos anteriores completos en el commit c1d625b18dd72c450767314695b0c786de486158.

| Hecho | Fuente | Estado/fecha | Acción |
|---|---|---|---|
| Publicación herramientas y túnel persistente | Director y evidencia histórica 16/10 | PASS histórico | No repetir descubrimiento ni prueba de fallo del servicio |
| Primer E2E real blocked/permission_timeout | Run 01a14694-6989-76fd-b022-cbe1e0df549d, 46 eventos | Confirmado histórico; no PASS funcional | No repetir ese run ni reutilizar su workspace |
| Contención antigua y rechazo residual | Codex, aborted_at 21:38:18.130Z y lecturas posteriores | Confirmado histórico | No volver a abortar ni autorizar once |
| Workspace nuevo y primer E2E todavía pendientes según c1d625b | INICIA/GUARDA anteriores | Histórico superado | Reemplazado por ejecución real fallida y contenida |
| Parche replay/integración | Director Ubuntu: replay PASS, integración 11/11 | PASS local/Ubuntu | Conservar parche, no desplegar todavía |
| Estado compartido y Events/outbox | Lote Codex 63 PASS | PASS local, despliegue PARCIAL | Referencia explícita preparada; no afirmar mapa operativo unificado |
| Productor terminal | Lote 36 PASS y lectura del resultado durable real | PASS local, operativo PARCIAL | Activación pendiente; lectura no envió webhook |
| MCP Events recibido por Director | Callback local sustituido y documentación OpenAI | NO DEMOSTRADO | Suscripción/recepción real pendientes; no confundir firma local con ChatGPT |
| Worker UID1000 PID2262122, queue constructor-poc | Inspección Ubuntu suministrada por usuario | Confirmado histórico | No reiniciado; no repetir entorno ni usar PID para señales sin control |
| Raíces heredadas Worker/preparador/validador | Ubuntu y código ya revisados | Confirmado histórico | No dejar raíz del preparador pendiente |
| Candidato histórico b280… frente a c077… | comparison.json, SDK local y auditoría del verificador | No equivalencia binaria; causa completa no demostrada | Hash incluye sourcemaps; no forzar PASS ni inferir incompatibilidad funcional |
| Fallback compatible congelado | rollback-compatible-20261016, provenance y procedimiento | PARCIAL | No confundir con réplica del Worker anterior |
| Adaptador congelado | frozen-adapter-sandbox.log | 2 PASS locales | Paquete congelado probado con servidor simulado |
| Traspaso compatible entre Workers | Preflight ERR_SWC_NATIVE_CACHE | Bloqueo de entorno, no FAIL del workflow | Único comando próximo en Ubuntu; revisar verified-fallback.json |
| Git previo al GUARDA maestro | fetch y rev-list local/remoto | Confirmado: c1d625b, sin divergencia | Preservar código en ff833399; documentos en commit contenedor |
| Código preparado frente a runtime | 12 archivos del commit funcional | Confirmado, no desplegado | Publicación GitHub no actualiza Worker ni configuración |
| Otros proyectos | PROJECT.md y límites del Director | Fuera de alcance | Conservar servicios/proyectos ajenos sin cambios |

No sumar lotes de pruebas solapados ni convertir sus PASS en E2E funcional. Próximo paso, restricciones, backups y hashes en GUARDA/INICIA/manifiesto del mismo directorio. No se ejecutaron pruebas funcionales ni cambios de servicios durante este guardado.

## Matriz vigente de aceptación — decisión definitiva del usuario

Esta sección gobierna la aceptación. La tabla de hechos anterior conserva sus evidencias técnicas; no convierte todas sus tareas pendientes en requisitos MVP.

| ID | Criterio obligatorio | Estado y evidencia disponible | Clasificación del pendiente y justificación |
|---|---|---|---|
| A01 | ChatGPT envía una misión real mediante las herramientas disponibles | PASS de esa etapa: primer workflow real creado por la ruta Temporal | No repetir la publicación ni el envío histórico; encargo incluido en la aceptación supervisada |
| A02 | OpenCode desarrolla y produce resultados verificables | PARCIAL: sesión real iniciada; cierre permission_timeout, sin resultado funcional aceptado | BLOQUEANTE MVP: falta una tarea de desarrollo real validada |
| A03 | Permisos sensibles con autorización humana explícita, sin aprobaciones automáticas | Guardas y rechazo residual demostrados; once/reject y contención probados aisladamente; circuito real completo pendiente | BLOQUEANTE MVP: evidenciar supervisión humana segura durante la misión aceptada, sin ampliar permisos |
| A04 | Director consulta estado, recupera resultado y continúa la misma misión con identidad/contexto | PARCIAL: capacidades y pruebas disponibles; mapa compartido preparado, aún sin despliegue coherente ni aceptación real integral | BLOQUEANTE MVP: demostrar consulta/resultado y continuidad de la misma misión en la ruta aceptada |
| A05 | Trabajo/decisiones recuperables por INICIA/GUARDA desde GitHub | PASS histórico: checkpoint 4021ffa publicado y simulación INICIA 10/10 | Mantener continuidad y publicar esta decisión; no repetir pruebas funcionales para verificar documentos |
| A06 | Recuperación segura, documentada y verificable, aunque manual | PARCIAL: procedimiento y fallback preparado; traspaso aislado pendiente por entorno | BLOQUEANTE MVP: demostrar una vía segura recuperable antes del despliegue; no exige reconstrucción binaria exacta |
| A07 | Ciclo supervisado repetible con evidencia de aceptación | NO DEMOSTRADO: primer E2E bloqueado no acredita el ciclo completo | BLOQUEANTE MVP: aceptar una misión real supervisada y evidencia de continuidad/repetibilidad; no sumar PASS unitarios como E2E |

## Clasificación de evolución posterior

| Hallazgo/capacidad | Clasificación | Justificación |
|---|---|---|
| MCP Events automático, suscripción y recepción del Director | MEJORA POSTERIOR | A04 admite consulta manual; conservar productor/outbox y pruebas, sin exigir activación para aceptar el MVP |
| Recuperación completamente autónoma | MEJORA POSTERIOR | A06 permite intervención manual segura |
| Memoria autónoma avanzada | MEJORA POSTERIOR | A04/A05 requieren preservar contexto y decisiones, no autonomía avanzada |
| Bundle binariamente idéntico al Worker histórico | MEJORA POSTERIOR | A06 se satisface con una recuperación compatible y verificable; no forzar igualdad de hashes |
| Resiliencia ante todo escenario o nueva infraestructura | MEJORA POSTERIOR | No necesaria para demostrar A01–A07; requiere justificación/autorización adicional |
| Aprobaciones automáticas de permisos sensibles, si se detectan | BLOQUEANTE MVP | Contradicen A03. No están autorizadas; cualquier propuesta futura exige nueva decisión explícita del usuario |

No cambiar el objetivo sin autorización. Cada nuevo hallazgo debe indicar BLOQUEANTE MVP o MEJORA POSTERIOR y justificarlo por A01–A07. Un cambio relevante puede justificar una prueba concreta; cambiar de chat no. Hoja de ruta vigente: GUARDA §13; siguiente acción: INICIA. No despliegue ni E2E durante esta misión documental.
