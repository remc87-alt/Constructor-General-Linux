# Matriz de reconciliación CGL — cierre maestro 16/10/2026

Estado vigente: MVP PARCIAL; gate NO-GO; rollback PARCIAL. Las fuentes Ubuntu son aportadas por Director, no nuevas ejecuciones durante GUARDA. Históricos anteriores completos en el commit c1d625b18dd72c450767314695b0c786de486158.

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
