# INICIA — CGL — cierre maestro 16/10/2026

## Paso operativo previo obligatorio

Si el PC o WSL se reinició: ejecutar cgl-arranque.sh antes de cualquier otra cosa.

Proyecto exclusivo Constructor General Linux, https://github.com/remc87-alt/Constructor-General-Linux.
Checkout `/home/rodrigo_mella/constructor-general-linux-m01-lab`; rama `m03-g5-consolidation-20261008`.
Base previa `c1d625b18dd72c450767314695b0c786de486158`; código preparado `ff833399c9d4a80ac9f74cf9336515bfa7b4dcda`. Resolver commit documental contenedor con `git log -1 --format=%H -- docs/continuidad/2026-10-16/INICIA_SIGUIENTE_CHAT.md`; comparar SHA local/remoto antes de otro guardado. Publicación de código no es despliegue.

## Decisión vigente de alcance — prioridad de lectura

**Objetivo definitivo: herramienta de desarrollo funcional, confiable y supervisada desde ChatGPT. No se exige autonomía absoluta.** Leer primero la [adenda definitiva del GUARDA, §13](GUARDA_DIAGNOSTICO_CGL_2026-10-16.md#13-adenda-definitiva-de-alcance--cgl-mvp-alcance-definitivo-20261016) y la matriz A01–A07. MCP Events automático, recuperación autónoma y reconstrucción binaria exacta son mejoras posteriores; no condicionan el MVP. Temporal se conserva. El GUARDA histórico publicado en 4021ffa4a7eca636c1171fad0b544a7609505c61 permanece como antecedente; la adenda prevalece para alcance y aceptación.

## Leer para recuperar sin la conversación

1. [GUARDA maestro](GUARDA_DIAGNOSTICO_CGL_2026-10-16.md).
2. [Matriz reconciliada](MATRIZ_RECONCILIACION_CGL_2026-10-16.md).
3. [Manifiesto de commits, evidencia y backups privados](MANIFIESTO_GUARDA_CGL_2026-10-16.json).
4. [Procedimiento de rollback propuesto](rollback/ROLLBACK_PROCEDURE.md).

## Objetivo y estado vigente

MVP supervisado: ChatGPT Director → MCP Temporal → Worker/actividades → OpenCode → FreeLLMAPI → resultados verificables → consulta y continuación por el Director. Se conserva el oráculo del contrato de prueba; MCP Events es una extensión opcional.
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

## Aceptación y después, en orden y con autorización

A01 encargo real desde ChatGPT; A02 tarea de desarrollo con resultados verificables; A03 permisos sensibles humanos explícitos, sin aprobaciones automáticas; A04 consulta, resultado y continuación de la misma misión con identidad/contexto; A05 INICIA/GUARDA recuperables desde GitHub; A06 recuperación segura documentada, incluso manual; A07 ciclo supervisado repetible con evidencia de aceptación.

Verificar recuperación compatible/manual → evaluar gate y autorizar actualización coherente → una única misión real supervisada autorizada, con verificación del contrato elegido → consulta/resultado y continuidad → registrar aceptación y repetibilidad. No declarar MVP PASS por pruebas unitarias o por el primer E2E bloqueado. La recepción de MCP Events queda en evolución posterior y no bloquea A01–A07.

No cambiar objetivos sin autorización del usuario. Clasificar cada hallazgo como BLOQUEANTE MVP (criterio afectado y justificación) o MEJORA POSTERIOR; no transformar mejoras futuras en requisitos. No repetir PASS salvo cambio relevante que invalide la evidencia. Conservar todos los avances de Events y rollback, sin exigir autonomía completa ni igualdad binaria del Worker antiguo.

## No investigar ni modificar

DO_NOT_REPEAT: publicación/herramientas, health histórico, raíces, identidad/entorno del Worker/OpenCode, contención antigua, divergencia inicial de mapas y lotes PASS anteriores. No rediseñar arquitectura.
No tocar Empresa IA/PMO/COVAL, 4096/4097, túneles, Temporal, OpenCode, credenciales o mapas durables. No restaurar decisiones viejas sobre nuevas, borrar backups ni ejecutar E2E/modelos sin autorización. No cambiar de rama, fusionar main ni publicar privados. No tocar los dos untracked preexistentes docs/G01_BWRAP_CIERRE_2026-10-12.md y resultado.json.

## Prompt de reenganche

Continúa Constructor General Linux como herramienta de desarrollo supervisada desde ChatGPT, sin exigir autonomía absoluta. Lee primero la adenda definitiva §13 del GUARDA y la matriz A01–A07; Events automático y reconstrucción binaria exacta no son requisitos MVP. Rama m03-g5-consolidation-20261008, MVP PARCIAL, Worker sin actualizar, rollback compatible/manual PARCIAL. El siguiente paso exclusivo es revisar/ejecutar en Ubuntu verify-compatible-rollback.sh del snapshot privado, conservar resultados y verificar verified-fallback.json; si falla, diagnosticar solo ese fallo. No repetir PASS, contención ni auditorías, no desplegar, no modelos ni E2E. Después devuelve el gate al Director.


## INICIA vigente · cierre post-MVP · 2026-10-17

Esta sección prevalece sobre instrucciones y estados anteriores de este INICIA que hayan quedado desactualizados. Leer también [GUARDA CGL 2026-10-17](../../../../CONTINUIDAD_2026-10-17.md).

- **Ramas:** `m03-g5-consolidation-20261008` y `main` apuntaban al mismo commit `c4ef1c9d2cf4e402582c268ea8099b56de07d5c9`; `main` avanzó por fast-forward desde `f12bcfc75c2c17813812a967e575cf35e38352e6`. Ese commit añadió `docs/PLANTILLA_CONTRATO_MISION.md` y el script ejecutable `experimental/temporal-poc/cgl-prep-mission.sh`. El script recibe `<mission_id> <artefactos...>`, prepara el workspace, reapunta OpenCode :4098 y corre preflight.
- **MVP supervisado:** PASS, misiones 003/004 validadas por `expense-oracle-001`, repetibilidad 2/2; A01–A07 PASS. No repetirlas salvo cambio relevante que invalide la evidencia.
- **Runtime reportado:** servicio systemd `cgl-temporal-publicacion` activo en túnel oficial `tunnel_…8600`; Worker PID `2316340`, código `ff83339`. Adaptador con mapa compartido `MCP_MISSION_MAP_FILE`, resultados Temporal y Events activados. Respaldo `start-temporal-adapter.sh.bak-20261017-162136`.
- **Túnel laboratorio detenido:** `opencode-temporal-lab`, `tunnel_…a5ed`, adaptador viejo `opencode-constructor-e2e`; se validó que no depende de otros proyectos. Queda un solo túnel. Si hace falta: `tunnel-client run --profile opencode-temporal-lab --control-plane.poll-channel main --control-plane.poll-channel temporal`. Recomendar retirar el conector viejo de OpenCode de ChatGPT.
- **No tocar:** `hermes-gateway`, `openviking-empresa-ia`, `n8n`, OpenCode 4096 ni 4097. Pendientes CGL: primero aislamiento G01 y luego evaluar lista blanca; crear oráculo antes de abordar otro tipo de tarea; revisión de n8n duplicado es opcional.
- **Flujo de una misión nueva:** `cgl-prep-mission.sh <mission_id> <artefactos...>` → `start_temporal_mission` con interfaz exacta, ejemplos y oráculo autorizado → permisos delegados sin rechazar (reject aborta) → `get_temporal_mission` hasta `validated`.
- **Terminal:** puede cortar pegados largos. Cambios grandes se publican en GitHub; Rodrigo sincroniza con `git pull --ff-only`.

Retomar desde los pendientes post-MVP; no cambiar ni reiniciar servicios sin autorización y respetar el alcance supervisado.
