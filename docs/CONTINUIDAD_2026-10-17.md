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


## Cierre del MVP supervisado · 2026-10-17

**MVP supervisado: PASS. Gate de despliegue: GO para uso supervisado.** Esta evidencia actualiza y prevalece sobre los estados provisionales de las misiones 001/002 y la matriz de gates anteriores en el alcance de esta aceptación.

### Evidencia de aceptación y repetibilidad

| Misión | Sesión | Oráculo | Resultado |
|---|---|---|---|
| `cgl-mvp-expense-20261017-003` | `ses_eb4845adaffeLjM4PFtBerXMO3` | `01a14b7b-a363-79f3-9734-2221e5839f28-v1` | `expense-oracle-001: passed`; fase `validated`; sin diagnósticos |
| `cgl-mvp-expense-20261017-004` | `ses_eb477ae84ffeih7nmkCaLqKrAg` | `01a14b88-4f4e-71d4-ad16-3eaee12879d9-v1` | `expense-oracle-001: passed`; fase `validated`; sin diagnósticos |

**Repetibilidad: 2/2 PASS.** En ambas misiones, los artefactos requeridos fueron `expense_cli.py` y `test_expense_cli.py`.

### Gates y permisos

- **A01–A07: PASS**, según la matriz de aceptación de esta misión.
- **A03:** permisos concedidos individualmente con `once` por el Director, bajo la regla explícita del usuario. No se usó aprobación automática del sistema.
- **A06:** rollback compatible verificado hoy: 3/3 traspasos y 2/2 casos del adaptador congelado PASS; `verified-fallback.json` generado.

### Fallos previos y aprendizaje

La causa raíz funcional de los intentos 001/002 quedó resuelta incorporando al contrato la especificación de interfaz que requiere la suite privada `csv-expense-v1`, sin exponer sus pruebas. La misión 001 había sido abortada tras un `reject` de `ls -la` emitido por el supervisor. Aprendizajes: un `reject` aborta la misión; en la misión 004 el Director autorizó con `once` una edición de `README.md` fuera de la regla explícita de archivos permitidos, sin impacto funcional. Considerarlo al diseñar la futura lista blanca.

### Fuera del MVP y decisión de publicación

Mejoras posteriores al MVP:
1. Lista blanca de autoaprobación solo tras activar el aislamiento G01.
2. Retorno automático mediante MCP Events.
3. Plantilla de contrato que incluya la especificación de interfaz.

El GO es para **uso supervisado**. No hacer merge a `main`: queda como decisión separada del usuario.
