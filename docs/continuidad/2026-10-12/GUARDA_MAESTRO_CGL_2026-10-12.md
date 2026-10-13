# GUARDA MAESTRO — CONSTRUCTOR GENERAL LINUX

Fecha de jornada: 12/10/2026
Generado: 2026-10-12T22:06:33
Repositorio: remc87-alt/Constructor-General-Linux
Rama local observada: m03-g5-consolidation-20261008
HEAD local observado: 6afb74e08c4934d7203fa2d6dd823998b911f452
Referencia previa: 6afb74e

## OBJETIVO PERMANENTE

Cerrar MVP E2E supervisado:
ChatGPT Director → Tunnel → MCP → Temporal →
Mission Runner/Worker → OpenCode → FreeLLMAPI →
resultado recuperable en ChatGPT.

Prioridades:
- REUSE FIRST.
- Una instrucción/comando por turno.
- Due diligence antes de cambios.
- Preservar la ruta estable.
- No repetir pruebas aprobadas.
- Permisos, recuperación, persistencia y retorno.
- No declarar PASS sin evidencia.

## DEMOSTRADO — PASS

1. ChatGPT → túnel → MCP estable → OpenCode →
   FreeLLMAPI: prueba E2E previa PASS.

2. Misión existente:
   CGL-MVP-SMOKE-01-20261012
   OpenCode session:
   ses_ecd56a2f0ffeYJSX4VPAyFtRLj

3. Respuestas previamente verificadas:
   CGL_E2E_SMOKE_PASS
   CGL_CONTINUE_PASS

4. Durante esta jornada ChatGPT consultó nuevamente
   get_mission sobre la MISMA misión.
   Respuesta:
   status=idle
   text=CGL_CONTINUE_PASS
   permission_requests=[]

5. El túnel experimental inició correctamente.
   Registros:
   tunnel-client started
   OpenCode health PASS; version=1.18.34
   OpenCode health PASS; version=1.18.34

6. Salud del túnel experimental:
   live=true
   ready=true
   instance_id=48ffbacd1c647846b5fa47475085729a

7. Perfil experimental:
   ~/.config/tunnel-client/opencode-temporal-lab.yaml
   Declarados dos canales:
   main → adaptador estable
   temporal → start-temporal-adapter.sh

8. Lanzador experimental:
   ~/.config/tunnel-client/start-temporal-adapter.sh
   Validaciones:
   LAUNCHER_SINTAXIS=PASS
   TEMPORAL_HABILITADO=PASS
   OPENCODE_EXPERIMENTAL=PASS
   AUTENTICACION_CONFIGURADA=PASS

9. Doctor del perfil experimental:
   RESULT ok
   Puerto diagnóstico 127.0.0.1:18080 PASS.

10. Temporal Server y Worker fueron observados activos
    en verificaciones anteriores.
    No confundir proceso activo con E2E demostrado.

## PARCIAL / NO DEMOSTRADO

1. El canal temporal está configurado, pero todavía
   NO se demostró que ChatGPT pueda invocar sus herramientas.

2. ChatGPT continúa exponiendo únicamente:
   start_mission
   get_mission
   continue_mission
   reply_permission

3. Herramientas Temporal NO visibles:
   start_temporal_mission
   get_temporal_mission
   decide_temporal_permission

4. Health detallado informó:
   mcp.status=unknown
   mcp.state=not_observed
   mcp.details.channel=main
   initialize_epoch=0
   tools_list.ok=false

   IMPORTANTE:
   Este diagnóstico no demuestra que temporal esté caído.
   Solo demuestra falta de observación MCP en ese endpoint.

5. MCP Events emitter:
   disabled (set MCP_EVENTS_EMITTER=on)
   Retorno automático NO demostrado.

6. Temporal → Worker → OpenCode → FreeLLMAPI →
   resultado en ChatGPT: NO DEMOSTRADO.

7. Permisos Temporal, recuperación, heartbeat,
   timeout y reanudación integral:
   aceptación E2E pendiente.

## ÚLTIMO ESTADO OPERATIVO OBSERVADO

PID túnel: 1109105

Comando observado:
tunnel-client run --profile opencode-temporal-lab

El proceso NO mostraba los argumentos:
--control-plane.poll-channel main
--control-plane.poll-channel temporal

Por tanto, NO declarar activación explícita
del sondeo multicanal.

Proceso observado al guardar:
1109105 tunnel-client run --profile opencode-temporal-lab

El perfil experimental contiene un campo YAML
poll_channels añadido durante la jornada.
El doctor dio RESULT ok, pero NO se verificó
que el campo sea interpretado funcionalmente.

## ARCHIVOS LOCALES

Perfil estable:
~/.config/tunnel-client/opencode-adapter.yaml

Perfil experimental:
~/.config/tunnel-client/opencode-temporal-lab.yaml

Lanzador:
~/.config/tunnel-client/start-temporal-adapter.sh

Recuperación preparada:
 /tmp/cgl-restaurar-tunel.sh

ATENCIÓN:
El script /tmp puede desaparecer al reiniciar.
No asumir persistencia.

No copiar credenciales, passwords ni API keys
a documentación o GitHub.

## PRIMER ENLACE PENDIENTE

Publicación y accesibilidad real de las herramientas
MCP Temporal desde ChatGPT.

Después:
Una sola misión Temporal controlada,
con verificación de Workflow, Worker,
OpenCode y resultado.

## PUNTO EXACTO DE REENGANCHE

1. NO repetir pruebas del MCP estable.
2. NO crear otra infraestructura.
3. NO lanzar nuevas misiones todavía.
4. NO reiniciar WSL ni otros servicios.
5. Verificar primero el comando real del túnel.
6. Si sigue sin argumentos poll-channel,
   planificar activación controlada con rollback.
7. Comprobar publicación de herramientas Temporal.
8. Ejecutar una única misión E2E.
9. Documentar evidencias y cerrar brechas.

## REGLAS DE INTERACCIÓN OBLIGATORIAS

- UN SOLO COMANDO POR RESPUESTA.
- Esperar resultado del usuario antes de continuar.
- No entregar pasos múltiples para ejecutar juntos.
- Due diligence antes de modificaciones.
- No repetir comprobaciones ya demostradas.
- No confundir configuración con operación.
- No afirmar cierre integral sin E2E.
- Evitar comandos largos o redundantes.
- No hacer commit/push sin revisar estado.

## GIT LOCAL

Rama: m03-g5-consolidation-20261008
HEAD: 6afb74e08c4934d7203fa2d6dd823998b911f452

Estado previo del árbol:
?? docs/G01_BWRAP_CIERRE_2026-10-12.md
?? resultado.json

## PENDIENTE DE PUBLICACIÓN

Este GUARDA es LOCAL.
No afirmar que quedó publicado en GitHub.
Publicar después de revisión y autorización.
