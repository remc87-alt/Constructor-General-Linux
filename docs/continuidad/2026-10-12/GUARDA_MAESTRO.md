# GUARDA MAESTRO — CONSTRUCTOR GENERAL LINUX
Fecha: 2026-10-12
Tipo: cierre de jornada / continuidad integral

## FUENTE CANÓNICA
Repositorio: remc87-alt/Constructor-General-Linux
Rama: m03-g5-consolidation-20261008
HEAD previo al guardado: 9f2f520d051b56ea24befa968882b1ac6428de13

## OBJETIVO INNEGOCIABLE

Cerrar un MVP funcional END-TO-END utilizando los componentes
que ya existen, priorizando REUSE FIRST.

ChatGPT Director debe poder enviar una misión real al Constructor,
consultar su estado, interactuar durante la ejecución, recibir
el resultado y recuperar el control ante fallos o interrupciones.

CRITERIO DE CINCO MINUTOS:
No es obligatorio terminar una misión en cinco minutos.
Sí es obligatorio que, si transcurren cinco minutos sin respuesta,
el usuario pueda consultar el estado y decidir cómo intervenir.

No cambiar este objetivo por nuevos desarrollos de seguridad,
infraestructura o investigaciones que no sean bloqueantes reales.

## ARQUITECTURA A RECONCILIAR

1. Usuario / ChatGPT Director / Telegram.
2. Servidor MCP Constructor Linux.
3. MCP Events: suscripción, eventos y retorno al Director.
4. Mission Runner: control y ciclo de vida de misiones.
5. Temporal Server: workflows durables, estado, señales.
6. Temporal Worker: actividades, heartbeats, reintentos.
7. OpenCode: ejecutor de software.
8. FreeLLMAPI: proveedor de modelos.
9. Modelos disponibles y perfiles de ejecución.
10. Workspace Git, permisos y aislamiento.
11. Observabilidad: queries, logs, estados y errores.
12. Memoria, contexto, INICIA/GUARDA y recuperación.

Distinguir IMPLEMENTADO de PROBADO y de E2E DEMOSTRADO.

## ESCENARIOS OBLIGATORIOS DEL MVP

A. NORMAL: iniciar, ejecutar, devolver resultado y evidencia.
B. LARGO: consultar estado durante la ejecución.
C. PERMISOS: bloquear, solicitar decisión, aprobar/rechazar.
D. ERROR: registrar fallo y permitir diagnóstico/intervención.
E. TIMEOUT/STALL: detectar ausencia de progreso, consultar
   y decidir reintento, continuación o cancelación.
F. REENGANCHE: recuperar misión y estado tras interrupción.

## AVANCE CONFIRMADO DEL 12/10/2026

Claude Code completó la misión CGL-G01-MIN con resultado PARCIAL.

Integración experimental de:
- cgl-bwrap-wrapper
- cgl-exec-opencode.bwrap
- opencode.jsonc.template

Claude reportó pruebas de montajes, aislamiento y casos negativos.

El usuario confirmó posteriormente:
- Diff focalizado del lanzador experimental.
- Sintaxis PASS de ambos scripts.
- Puerto 4099 libre en el momento de la comprobación.
- Ambos scripts experimentales cambiados a puerto 4099.
- Resultado G01_LAB_SYNTAX=PASS.

No hay arranque real demostrado del ejecutor G01 integrado.
No hay pentest integral aprobado.
No hay aceptación E2E integral demostrada.

## BRECHAS G01

- WSLInterop bloquea el lanzador original.
- Variante experimental aún no instalada/aceptada.
- Workspace real y permisos por validar.
- Credencial dedicada FreeLLMAPI pendiente.
- Filtro de red y conectividad real por validar.
- Puerto 4099 reservado conceptualmente para laboratorio;
  no se ha demostrado que un servidor esté ejecutándose allí.

G01 no debe consumir nuevamente toda la jornada si
existe una ruta de ejecución controlada ya disponible.

## COMPONENTES EXISTENTES QUE DEBEN REUTILIZARSE

Temporal:
- Server y Worker observados previamente en ejecución.
- Workflows con queries, signals, retries y heartbeats.
- Actividades de start, continue, wait, abort y permisos.
- Actividades de bridgeSubscribe y bridgeEmit.

OpenCode:
- Instancias existentes en 4096 y 4098.
- Integración histórica con FreeLLMAPI.
- Evidencia histórica de comunicación Director-Constructor.

MCP:
- Herramientas y eventos implementados parcialmente.
- Verificar suscripción/retorno efectivo antes de declarar PASS.

Memoria:
- Recuperar documentos canónicos y avances recientes.
- No volver a checkpoints antiguos como estado vigente.
- Mantener evidencia, cronología, decisiones y DO_NOT_REPEAT.

Estos antecedentes no equivalen a un PASS E2E actual.

## ORDEN DE TRABAJO MAÑANA

P0. Recuperar este GUARDA y el código vigente desde GitHub.
P1. Inventariar conexiones ya operativas SIN repetir POC.
P2. Identificar el mínimo bloqueo del flujo E2E.
P3. Ejecutar UNA misión controlada usando la ruta existente.
P4. Verificar consulta de estado durante ejecución.
P5. Verificar retorno del resultado al Director.
P6. Verificar intervención tras cinco minutos sin respuesta.
P7. Probar permisos, error, timeout y recuperación.
P8. Cerrar MVP con evidencia verificable.
P9. Retomar endurecimiento/pentest integral G01.

No ejecutar P3–P9 durante este guardado.

## PROHIBICIONES Y DO_NOT_REPEAT

- No reiniciar WSL ni modificar /etc/wsl.conf.
- No detener ni modificar servicios existentes.
- No crear misiones nuevas durante GUARDA.
- No repetir pruebas ya demostradas.
- No instalar paquetes.
- No publicar credenciales, claves ni tokens.
- No confundir sintaxis PASS con ejecución PASS.
- No confundir componentes activos con E2E demostrado.
- No reconstruir Temporal, MCP, OpenCode o FreeLLMAPI.
- No cambiar la prioridad P0 del MVP funcional.
- No fusionar con main sin autorización.

## GIT LOCAL AL MOMENTO DEL GUARDADO

### Estado
?? docs/G01_BWRAP_CIERRE_2026-10-12.md
?? experimental/temporal-poc/executor/g01-bwrap-lab/
?? resultado.json

### Remotos
origin	https://github.com/remc87-alt/Constructor-General-Linux.git (fetch)
origin	https://github.com/remc87-alt/Constructor-General-Linux.git (push)

## CRITERIO DE CIERRE

GUARDA PASS solo si documentos, cambios locales
pertinentes y evidencias quedan publicados y recuperables
desde la rama canónica de continuidad.

El MVP continúa PENDIENTE DE E2E.
