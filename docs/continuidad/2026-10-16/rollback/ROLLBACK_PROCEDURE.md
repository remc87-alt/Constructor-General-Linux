# CGL: rollback compatible propuesto — NO autorizado para ejecución

Este directorio no contiene una restauración exacta del Worker PID 2262122.
Contiene un fallback compatible del núcleo endurecido que ya pasó replay e
integración. No arrancar este fallback hasta completar las pruebas aisladas y
obtener autorización de despliegue/rollback del Director y usuario.

## Procedencia

- Base documental/código: c1d625b18dd72c450767314695b0c786de486158.
- Overlay: proposed-source.tar.gz del gate-despliegue-20261016T222815Z.
- Workflow: mismos bytes que el workflow propuesto actualmente, incluido
  patched("generic-terminal-containment-v1"). Ver provenance.json.
- Worker y actividades: snapshot/experimental/temporal-poc/src.
- Adaptador para llamadas del Worker: snapshot/mcp-opencode-adapter/src.
- Dependencias: copias físicas. El verificador las recaptura en Ubuntu sin
  cambiar las instaladas y conserva cada copia anterior.
- Node de Ubuntu: capturado al verificar. Su ubicación y todos los hashes
  quedan en verified-fallback.json SOLO cuando las pruebas terminan bien.

## Validación previa obligatoria

Ejecutar verify-compatible-rollback.sh en Ubuntu. Deben pasar tres pruebas de
traspaso de Worker (once/reject/timeout) y dos del adaptador congelado. El
Temporal usado es efímero, en memoria, puerto libre distinto de 7243. Todas
las actividades son simuladas; no hay inferencia ni oráculo real.

Estas pruebas son nuevas verificaciones del paquete de rollback: no implican
que se haya ejecutado rollback operativo ni restauración binaria exacta.

## Procedimiento operativo futuro, sujeto a autorización

1. Verificar hashes de TODOS los archivos y enlaces de verified-fallback.json,
   la versión de Node y la igualdad del workflow desplegado con el núcleo
   probado. Si cambió código/dependencias desde la prueba: NO-GO.
2. Verificar desde Ubuntu UID, cmdline, starttime, PGID y CWD del Worker
   actualizado; verificar que no hay otro Worker CGL en la queue constructor-poc.
   No usar PID histórico ni detener el PID 2262122 por este procedimiento.
3. Verificar ausencia de workflows activos. Si hay alguno, detenerse: el
   traspaso con actividad abierta se ha probado aisladamente, pero su uso
   operativo requiere revisión/autorización específica de esas ejecuciones.
4. Registrar PID/PGID/configuración del Worker actualizado. Solicitar SIGTERM
   únicamente a su grupo verificado. Esperar terminación de todos sus miembros;
   si no termina, detenerse sin SIGKILL ni segundo Worker. Conservar el pidfile
   hasta comprobar la terminación; no usar un stop que lo retire antes.
5. Arrancar mediante el mismo patrón existente setsid + Node + tsx, usando:
   - Node: runtime registrado en verified-fallback.json.
   - tsx: snapshot/experimental/temporal-poc/node_modules/tsx/dist/cli.mjs.
   - Código: snapshot/experimental/temporal-poc/src/worker.ts.
   - CWD: snapshot/experimental/temporal-poc.
   - HOME: /home/rodrigo_mella; UID 1000.
   - POC_TEMPORAL_ADDRESS=127.0.0.1:7243.
   - POC_TASK_QUEUE=constructor-poc.
   - POC_EFFECTS_DIR=/home/rodrigo_mella/.local/state/constructor-temporal-poc/effects.
   - CGL_WORKSPACE_ROOT y CGL_OPENCODE_USER ausentes (ruta heredada validada).
   - Credenciales: referencias locales existentes; no copiarlas ni imprimirlas.
6. Añadir logs a un archivo nuevo; esperar WORKER RUNNING. Identificar su PID
   real desde esa nueva salida y contrastar /proc antes de actualizar el
   pidfile. No usar el último WORKER RUNNING de un log histórico completo.
7. Verificar un solo Worker, identidad/queue/namespace y poller actual mediante
   describe de la task queue. Consultar estado durable sin iniciar misiones,
   inferencias ni conceder permisos. Si falla, declarar NO-GO y conservar logs;
   no forzar sucesivos arranques.

## Estado que NO se restaura desde respaldos

- SQLite/estado e historiales del servidor Temporal.
- effects, mapas de misiones, decisiones humanas y sesiones OpenCode.
- Suscripciones, outbox y registros de entrega.
- Workspaces, artefactos y credenciales.

El fallback del Worker usa explícitamente el mapa Temporal existente en
~/.local/state/constructor-temporal-poc/adapter-instance/.mission-map.json.
El adaptador persistente del complemento Temporal puede permanecer actualizado:
lee el mismo esquema y conserva Events/outbox. Este rollback no revierte sus
registros ni toca los conectores estables. ctl.sh del checkout canónico espera
su ruta canónica y no debe usarse ciegamente para gestionar el PID del fallback.

## Límites

No hay PASS operativo antes de la prueba de restauración aislada. El paquete
de prueba no demuestra acceso real a modelos u oráculo: eso corresponde al E2E
posterior. Mantener la misma plataforma Ubuntu/WSL y sus librerías compatibles.
No eliminar este snapshot ni deprecar el parche mientras puedan necesitarse
las historias correspondientes.
