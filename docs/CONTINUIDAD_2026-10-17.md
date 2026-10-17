# GUARDA CGL · 2026-10-17

Checkpoint de continuidad; prevalece para los hechos de esta fecha. Estado runtime reportado por la misión supervisada, sin publicar workspaces, logs ni pruebas privadas.

## Estado y evidencia

- **Rollback compatible: PASS (A06).** 3/3 traspasos y 2/2 casos del adaptador congelado; generado `verified-fallback.json`.
- **Worker:** actualizado a `ff83339` (PID `2316340`), una sola instancia; preflight **8/8 PASS**.
- **Túnel oficial:** adaptador configurado con `MCP_MISSION_MAP_FILE`, stores, `MCP_TEMPORAL_RESULTS=on` y `MCP_EVENTS_EMITTER=on`. Respaldo: `start-temporal-adapter.sh.bak-20261017-162136`. El túnel lab usa otro `tunnel_id`; no hay conflicto.
- **Misión 001:** código generado; abortada tras el rechazo de `ls -la`, por error en las instrucciones del supervisor.
- **Misión 002:** cadena E2E completa hasta el oráculo; **FAILED (`FUNCTIONAL_FAILURE`)**. La reparación se interrumpió al alcanzar el límite de 15 min. Gates: A01 y A03 **PASS**; A02 y A04 **PARCIAL**; A07 **PENDIENTE**.

## Diagnóstico y siguiente paso

Causa raíz: las instrucciones del contrato no definían la interfaz requerida por la suite privada `csv-expense-v1`. Redactar instrucciones con la especificación de interfaz, sin revelar las pruebas privadas, y ejecutar la misión 003.

## Mejora posterior al MVP

Considerar una lista blanca de autoaprobación para lecturas y tests solo después de activar el aislamiento G01.
