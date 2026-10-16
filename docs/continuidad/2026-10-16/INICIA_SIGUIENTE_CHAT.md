# INICIA — Constructor General Linux — 2026-10-16

## Recuperación autónoma

Proyecto único: Constructor General Linux.
Repositorio: https://github.com/remc87-alt/Constructor-General-Linux
Checkout: /home/rodrigo_mella/constructor-general-linux-m01-lab
Rama: m03-g5-consolidation-20261008.

Leer primero, completos:
1. docs/continuidad/2026-10-16/GUARDA_DIAGNOSTICO_CGL_2026-10-16.md
2. docs/continuidad/2026-10-16/MATRIZ_RECONCILIACION_CGL_2026-10-16.md
3. Este INICIA.

Base local antes de guardar: f98140129675e0f0f139e82ff196d4c83aa5f081.
Remoto verificado antes de guardar: 02902a1e44536053a946bd3d0fd9dd21144d9866.
Commit efectivo de esta continuidad: el que incorpora este INICIA; consultar git log -1 --format=%H -- docs/continuidad/2026-10-16/INICIA_SIGUIENTE_CHAT.md.
Publicación de la consolidación: no confirmada; guardado local no equivale a respaldo GitHub. No reemplazar el contenido local por el GUARDA remoto antiguo. Si solo se recupera GitHub en 02902a1e, falta esta consolidación y debe recuperarse el commit local del informe final.
El intento de publicación de esta misión fue rechazado por la herramienta GitHub: requiere aprobación y la política es never. No se intentó eludir ese control. GUARDA, INICIA y matriz permanecen locales.

## Estado y cinco hechos de reenganche

1. MVP funcional E2E pendiente; puente principal y pruebas históricas conservados.
2. Constructor Linux Temporal instalado y ocho herramientas confirmadas por Director, incluidas start/get/decide Temporal. No repetir configuración ni descubrimiento.
3. Worker heredado, preparador y validador comparten /home/rodrigo_mella/.local/state/constructor-temporal-poc/workspaces; raíces YA comprobadas.
4. OpenCode :4098 fue identificado como rodrigo_mella UID 1000, ejecutable /home/rodrigo_mella/.opencode/bin/opencode; cwd termina en cgl-v1-csv-expense-20261009-003.
5. Falta decidir la ruta E2E compatible con ese directorio y las reglas del contrato; un workspace nuevo no es una solución automática.

Las observaciones anteriores son del 16/10, no garantía de que los PIDs sigan vivos.
Túnel Temporal: tunnel_6ad26dc258548191a71dcf157b1b8600; perfil cgl-temporal-publicacion. No detener la terminal que lo sostiene.
No confundir indisponibilidad de herramientas/procesos en el sandbox Codex con ausencia en ChatGPT o Ubuntu anfitrión.

## Fallo que no debe repetirse

Workflow cgl-mvp-inspeccion-readonly-20261016, run 01a1461a-b885-7b70-a33a-55477c24d2da: FAILED en prepareGenericMission por workspace no válido (mensaje exacto en GUARDA); no ejecutó OpenCode.
Error posterior generic-mission: causa de runtime sin cerrar. Fuente actual registra query antes del primer await; versión histórica la registraba después. No inferir versión desplegada.
No reanudar/cancelar/repetir ese run ni intervenir la misión accidental distinta de start_mission.

## No investigar ni modificar de nuevo

- No repetir CGL-01/CGL-02, health básico, variables ya verificadas, registro de herramientas, SDK, tools/list auxiliar, catálogo, inferencia básica o lectura de la raíz del preparador.
- No mezclar Empresa IA, PMO, COVAL ni otros proyectos. Los nombres técnicos históricos no cambian la identidad CGL.
- No modificar infraestructura, túneles, complementos, Worker, Temporal, OpenCode o FreeLLMAPI; no reiniciar ni conceder permisos automáticamente.
- No crear/modificar workspaces históricos ni borrar salidas.
- No añadir/borrar docs/G01_BWRAP_CIERRE_2026-10-12.md o resultado.json.
- Preservar el borrador externo ~/.local/state/cgl-temporal-publicacion/GUARDA_PENDIENTE.md sin tomar sus pendientes antiguos como estado vigente.
- No sincronizar indiscriminadamente, fusionar ramas ni publicar secretos.

## Próxima misión, separada de este guardado

CGL-E2E-PRIMERA-ACEPTACION.
Primero inspección focalizada del código existente para determinar si el flujo histórico permite una sola misión controlada sin crear workspace.
Si no, justificar workspace nuevo y mecanismo para asociarlo con OpenCode, sin implementarlo todavía.
Entregar al Director el contrato exacto, precondiciones, permisos requeridos y evidencia esperada; solicitar autorización de ejecución correspondiente.
Luego una sola misión Temporal, resultado recuperable y aceptación independiente. No sustituir start_temporal_mission por start_mission.
MCP Events → ChatGPT permanece pendiente y se aborda después de la ejecución E2E.

## Prompt breve

Continúa Constructor General Linux en m03-g5-consolidation-20261008. Lee el GUARDA, matriz e INICIA del 16/10 reconciliados, priorizando la copia local si GitHub conserva 02902a1e. Túnel/herramientas, raíces heredadas e identidad/cwd OpenCode ya están comprobados: no repetirlos. Ejecuta solo la inspección focalizada inicial de CGL-E2E-PRIMERA-ACEPTACION para decidir si el flujo histórico admite la prueba sin otro workspace; si no, justifica la preparación y asociación con OpenCode. No inicies misiones ni cambies servicios/workspaces sin la autorización correspondiente.
