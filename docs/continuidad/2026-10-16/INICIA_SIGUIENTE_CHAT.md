# INICIA — CGL — cierre maestro 16/10/2026

Proyecto exclusivo Constructor General Linux, https://github.com/remc87-alt/Constructor-General-Linux.
Checkout `/home/rodrigo_mella/constructor-general-linux-m01-lab`; rama `m03-g5-consolidation-20261008`.
Base previa `c1d625b18dd72c450767314695b0c786de486158`; código preparado `ff833399c9d4a80ac9f74cf9336515bfa7b4dcda`. Resolver commit documental contenedor con `git log -1 --format=%H -- docs/continuidad/2026-10-16/INICIA_SIGUIENTE_CHAT.md`; comparar SHA local/remoto antes de otro guardado. Publicación de código no es despliegue.

## Leer para recuperar sin la conversación

1. [GUARDA maestro](GUARDA_DIAGNOSTICO_CGL_2026-10-16.md).
2. [Matriz reconciliada](MATRIZ_RECONCILIACION_CGL_2026-10-16.md).
3. [Manifiesto de commits, evidencia y backups privados](MANIFIESTO_GUARDA_CGL_2026-10-16.json).
4. [Procedimiento de rollback propuesto](rollback/ROLLBACK_PROCEDURE.md).

## Objetivo y estado vigente

MVP real: ChatGPT Director → MCP Temporal → Worker/actividades → OpenCode → FreeLLMAPI → oráculo independiente → resultado durable/MCP Events → Director.
**MVP PARCIAL, despliegue NO-GO, rollback PARCIAL.** El puente principal y túnel Temporal persistente están conservados.
El primer E2E `cgl-e2e-expense-20261016-001`, run `01a14694-6989-76fd-b022-cbe1e0df549d`, terminó blocked/permission_timeout, sin oráculo final. Sesión residual contenida y permiso rechazado; no repetir intervención ni reutilizar el workspace fallido.
Worker conocido PID 2262122, UID1000, namespace default, 127.0.0.1:7243, queue constructor-poc, sigue en versión anterior, no reiniciado. CGL_WORKSPACE_ROOT y CGL_OPENCODE_USER ausentes; raíz heredada ya confirmada. No repetir /proc ni interpretar aislamiento como ausencia.
Código preparado preservado: parche generic-terminal-containment-v1, mapa durable compartido y productor terminal. **No desplegados**; mapa del complemento y Worker aún no unificados operativamente por la configuración propuesta. El emisor/observador nuevos no se han activado.

## Evidencias y decisiones cerradas

Replay histórico 46 eventos PASS; integración aislada 11/11 PASS; unidad/adaptador 20 PASS; estado/recuperación/Events 63 PASS; productor terminal/regresiones 36 PASS; adaptador del fallback 2 PASS. Lotes solapados, no sumarlos ni repetirlos sin cambio relevante. Callback simulado no significa recepción ChatGPT.
El candidato histórico compila pero su hash completo no coincide: no es prueba de incompatibilidad funcional ni restauración exacta. Se conserva alternativa compatible congelada; nunca falsificar un PASS. El resultado durable distingue Temporal COMPLETED de functional passed. No ampliar .py/bash automáticos; permisos humanos exactos.

## Único primer paso de mañana — Ubuntu, sin despliegue

```bash
bash /home/rodrigo_mella/.local/state/cgl-temporal-publicacion/rollback-compatible-20261016/verify-compatible-rollback.sh
```

Es una prueba aislada: Temporal efímero en memoria, puerto libre distinto de 7243, actividades simuladas y cleanup de su propio proceso. Preserva copias anteriores y captura Node/deps de Ubuntu. Comprueba recuperación entre Workers con once/reject/timeout y adaptador congelado; no ejecuta modelos, oráculo real ni el Worker operativo.
Faltó completarla en sandbox por ERR_SWC_NATIVE_CACHE, no por fallo del workflow. Registrar resultados, logs y verified-fallback.json. **No ejecutar este comando desde Codex sandbox para repetir el mismo bloqueo**. Si ya existe manifest de validación, revisar su contenido antes de reejecutar. Si el directorio privado falta, detenerse y reconstruir/revalidar; los scripts de rollback/ son archivo documental, no contienen snapshot privado.
Si falla, diagnosticar solo ese fallo. Si pasa, devolver control al Director y evaluar gate: rollback recuperable, hashes, ausencia de ejecuciones afectadas, respaldo y actualización coherente. No reiniciar ni desplegar implícitamente.

## Después, en orden y con autorización

Reconciliar/desplegar Worker y adaptador → activar mapa/stores/emisor/observador Temporal → suscripción real del Director en ChatGPT Work compatible (Cloud en escritorio), eventos por mission_id exacto → demostrar recepción → una sola misión E2E supervisada en workspace limpio autorizado, permisos humanos, misma sesión, proveedor, oráculo y retorno. Codex no dispone aquí de events/subscribe: ChatGPT proporciona callback/secreto sin copiado manual. No declarar MVP PASS antes del circuito integral.

## No investigar ni modificar

DO_NOT_REPEAT: publicación/herramientas, health histórico, raíces, identidad/entorno del Worker/OpenCode, contención antigua, divergencia inicial de mapas y lotes PASS anteriores. No rediseñar arquitectura.
No tocar Empresa IA/PMO/COVAL, 4096/4097, túneles, Temporal, OpenCode, credenciales o mapas durables. No restaurar decisiones viejas sobre nuevas, borrar backups ni ejecutar E2E/modelos sin autorización. No cambiar de rama, fusionar main ni publicar privados. No tocar los dos untracked preexistentes docs/G01_BWRAP_CIERRE_2026-10-12.md y resultado.json.

## Prompt de reenganche

Continúa Constructor General Linux desde el GUARDA maestro del 16/10 en m03-g5-consolidation-20261008. Lee GUARDA, matriz, manifiesto e INICIA publicados. MVP PARCIAL, Worker sin actualizar, rollback PARCIAL. El siguiente paso exclusivo es revisar/ejecutar en Ubuntu verify-compatible-rollback.sh del snapshot privado, conservar resultados y verificar verified-fallback.json; si falla, diagnosticar solo ese fallo. No repetir PASS, contención ni auditorías, no desplegar, no modelos ni E2E. Después devuelve el gate al Director.
