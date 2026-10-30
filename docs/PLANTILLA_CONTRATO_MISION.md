# Plantilla de contrato de misión CGL

Regla del Director: NO lanzar una misión si falta la sección 2 (interfaz exacta con ejemplos) o si no existe un oráculo autorizado para ese tipo de tarea. Antes de lanzar, Rodrigo corre `experimental/temporal-poc/cgl-prep-mission.sh <mission_id> <artefactos...>` y confirma `0 failing gate(s)`.

## 1. Objetivo
Una frase con lo que debe existir al terminar.

## 2. Interfaz exacta (obligatoria)
- Ejecución: comando exacto y argumentos.
- Entradas: formato, columnas o campos obligatorios.
- Salida: formato exacto en stdout (nada más en stdout).
- Errores: cuándo falla, código de salida, mensaje a stderr.
- Ejemplos entrada → salida: mínimo 3 normales y 1 de error.

## 3. Artefactos y pruebas
- artifactPaths: archivos que el modelo debe crear o editar.
- Pruebas: tests que cubran los ejemplos de la sección 2.

## 4. Restricciones
Solo dentro del workspace; sin red; sin instalar dependencias; sin leer configuraciones externas; solo biblioteca estándar salvo indicación.

## 5. Regla de permisos delegada al Director
Aprobar con once, sin esperar a Rodrigo: ediciones de los artifactPaths; lecturas e inspección (ls, cat, cat -A, pwd, head, tail, find, grep, wc, sort, con pipes); archivos de prueba .csv/.txt con echo/printf/cat; ejecuciones python/python3 dentro del workspace. No rechazar nada (un reject aborta la misión): lo distinto queda pendiente y se avisa a Rodrigo. Siempre pendientes: red, instalar, sudo, borrar, rutas fuera del workspace.

## 6. Presupuesto
maxDurationMs 900000 (15 min, máximo); maxRepairAttempts 1; maxTokens null.

## 7. Parámetros para start_temporal_mission
workflow_id: <mission_id> · title: <título corto> · contract: {"missionId": "<mission_id>", "workspace": "/home/rodrigo_mella/.local/state/constructor-temporal-poc/workspaces/<mission_id>", "instructions": "<Objetivo>. ESPECIFICACIÓN OBLIGATORIA: <sección 2 con ejemplos>. Crea <artifactPaths> y pruebas que cubran los ejemplos; córrelas y termina. <Restricciones>.", "validation": {"kind": "external-oracle", "oracleId": "<oráculo>", "requiredArtifacts": ["<artefacto>"]}, "budget": {"maxRepairAttempts": 1, "maxDurationMs": 900000, "maxTokens": null}, "artifactPaths": ["<artefacto>"]}

## 7b. Entrega al repositorio (opcional)
Agregar al contract: `"delivery": {"repo": "<owner>/<repo>", "baseBranch": "main", "targetDir": ""}`. Al quedar `validated`, el worker sube los artifactPaths como rama `cgl/<mission_id>` (nunca a main, nunca forzado). El repo debe estar en `~/.config/cgl/delivery-repos`; si no, la misión se rechaza al preparar. Resultado en `state.delivery` de get_temporal_mission (`status`, `commit`, `compare_url`). Una entrega fallida no cambia el veredicto: queda `validated` con `delivery.status = failed` y `next_action = review_evidence`. Detalle: `docs/ENTREGA_A_REPO.md`.

## 8. Oráculos autorizados
- expense-oracle-001 (suite csv-expense-v1): expense_cli.py + test_expense_cli.py. Referencia validada: cgl-mvp-expense-20261017-003 y -004.
- Un tipo de tarea nuevo requiere primero su propio oráculo (validador privado) registrado en oracle-registry.ts.
