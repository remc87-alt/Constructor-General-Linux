# Constructor General Linux · Guarda canónico · 2026-10-08

Complementa, sin reemplazar, el checkpoint del 2026-10-06. Precedencia:
evidencia reciente más evidencia histórica no contradicha.

## INICIA Temporal V1 (obligatorio para este frente)

Para trabajo en Temporal/OpenCode 4098, leer además
[`docs/TEMPORAL_V1_MANIFEST.md`](docs/TEMPORAL_V1_MANIFEST.md) después de esta
Guarda. El manifiesto conserva arquitectura experimental, contrato de
supervisión, evidencia, DO_NOT_REPEAT y reenganche; GitHub no sustituye el
estado runtime, que debe consultarse en Temporal y OpenCode antes de actuar.

## Estado de reenganche

- Repositorio: `remc87-alt/Constructor-General-Linux`.
- Laboratorio: `~/constructor-general-linux-m01-lab`.
- Estable protegido: `~/opencode-constructor-e2e`; no fue modificado.
- Base previa: `ee806dddc1b9b55c60afb2472e2a47d07d35cda7`.
- No duplicar misión: `g5-transcripcion-python-20261008-002`.
- Sesión: `ses_ee359ecd4ffexjMLWFBfGZ81DO`.
- Último permiso observado (confirmar antes de actuar):
  `per_11cd1ec37001jeqb0pot6Mh5D2`, `external_directory`, lectura de
  `resultado.json` en el workspace experimental.

No reutilizar `g5-transcripcion-python-20261008-001`, no responder permisos
históricos sin comprobar que siguen activos, y no crear otra misión.

## Cronología consolidada

| Gate | Resultado | Evidencia / límite |
|---|---|---|
| G1-R | PASS | Auditoría independiente de outbox durable y eventos. |
| G2 | FAIL inicial | `EXP_ROOT` inseguro, puerto fail-open, PID vacío no protegido. |
| G2-FIX / G2-R2 | PASS | Tres guardas corregidas; 45/45 pruebas re-auditadas. |
| G3-LOCAL | PASS reportado | Aislamiento, autenticación, SQLite separada y rollback. |
| G4-LOCAL | PARCIAL | Comprobaciones iniciales incompletas. |
| G4-R | PASS | MCP STDIO, `server/discover`, errores y no-fallback observado. |
| G5 | FAIL | `nohup` perdió OpenCode 4097 entre operaciones. |
| G5-RCA / G5-FIX | PASS de corrección | `setsid` + stdin desacoplado; señal de cierre exacta no capturada. |
| G5-RETRY | PARCIAL | Misión aceptada y sesión creada; bloqueo `external_directory`. |
| G5-PERMISSION-RECOVERY / RCA | FAIL transparente | Sesión persistió, permiso desapareció tras reinicio; `idle` no prueba fin. |
| G5-CONTINUE | PARCIAL | Una continuación sobre la misma sesión y permisos `once`. |
| G5-PYTHON | FAIL funcional | Python ejecutó, pero JSON fuera del workspace y tareas semánticamente erróneas. |

## G5: evidencia y fallo

Workspace esperado:

```text
~/.local/state/constructor-g2-exp/workspaces/g5-transcripcion-python-20261008-002/
```

`process.py` fue creado allí. La sesión ejecutó `python3` con exit 0 y salida
`Generated resultado.json`, pero al invocar el script por ruta absoluta sin
cambiar directorio de trabajo creó este artefacto fuera del workspace:

```text
~/constructor-general-linux-m01-lab/resultado.json
```

Ese archivo es evidencia de FAIL, no resultado válido; no versionarlo ni
borrarlo automáticamente. Identifica participantes, acuerdo y plazos, pero
produce `De acuerdo, me encargo` para Carla en vez de `validar los datos del
cliente`, y `Confirmado` para Luis en vez de `preparar el resumen ejecutivo`.

No asumir que exit 0, un archivo existente, `idle` o un turno terminado
demuestran misión correcta.

## Capacidades

### DEMOSTRADO

- Aislamiento experimental: XDG, SQLite, estado y puertos separados.
- Persistencia experimental mediante `setsid`.
- Inicialización MCP STDIO, `start_mission`, sesión real y `session_id`.
- `continue_mission` sobre la misma sesión y permisos puntuales `once`.
- `process.py`, ejecución Python y creación física de JSON (ubicación errónea).

### PARCIAL / FAIL

- Permisos pendientes, recuperación de turno, `idle` frente a herramienta
  `running`, CWD Python, extracción de tareas y permisos repetitivos.
- Finalización integral de G5.

### NO DEMOSTRADO

- JSON correcto dentro del workspace, recuperación transparente, retorno a
  ChatGPT, suscripción MCP Events real y misiones consecutivas autónomas.
- Compatibilidad completa de eventos: `initialize` respondió `2025-11-25`
  aunque se solicitó `2026-07-28`.

## DO_NOT_REPEAT y pendientes

No repetir G1-R, G2, G3, descubrimiento G4, comparación `nohup`/`setsid`, ni
`start_mission` de G5. No detener/reiniciar OpenCode mientras la misión esté
activa o tenga permiso pendiente. No confundir desaparición de permiso con
resolución ni presentar el JSON fuera del workspace como éxito.

Pendientes: resolver estado vivo de G5 sin destruir sesión; asegurar CWD y JSON
en workspace; corregir extracción/validación semántica; diseñar permisos
acotados repetitivos; distinguir turno interrumpido de `idle`; validar
recuperación, MCP Events y retorno automático.

Punto exacto de reenganche: misma misión y sesión, `process.py` creado, Python
ejecutado, JSON incorrecto y fuera del workspace. Antes de actuar, verificar
permiso actual y OpenCode 4097; no usar `start_mission` ni `continue_mission`
automáticamente.

## Seguridad de versionado

No versionar runtime, `.mission-map.json`, SQLite/WAL/SHM, logs, PID,
contraseñas, cachés, secretos, resultados generados ni backups. Los scripts G2
solo contienen variables de entorno y referencias por ruta.

## Cierre de continuidad 2026-10-10

- Rama experimental: `m03-g5-consolidation-20261008`.
- HEAD local y remoto verificado: `69276a382e920b228a3d0d4f1896d444687e3b60`.
- El único cambio local no rastreado identificado es `resultado.json`; fue
  respaldado fuera de Git en `/tmp/cgl-mvp-checkpoint-20261010/` con hash
  `bfcd6f0919b07f83a66e18b816fd360875b4a55f39f0e535ecb2d24b46014a38`.
- No se publican secretos, suites privadas, workspaces, SQLite, logs ni estado
  runtime. El checkout estable permanece intacto y no se limpia.
- El respaldo externo 2026-10-10 incorpora snapshots SQLite con integridad
  `ok`: Temporal `1ad3359bde53a25bc3892e4e7d8c08e040df842db16a53f0a3260b1cbe86cf8e`
  y OpenCode experimental `c688f2ea586c96423b659cf88330ac50d9f968b3bac832813f8971700d458b22`.
  Estos snapshots no sustituyen credenciales ni garantizan restauración en un
  proceso activo sin verificación de compatibilidad.

### G-01 a G-04 (definiciones del MVP)

- **G-01 — Oráculo genérico:** PARCIAL. El contrato y la doble identidad son
  genéricos, pero la suite efectiva validada sigue siendo `csv-expense-v1`.
- **G-02 — Diagnósticos de reparación:** PARCIAL. Existen diagnósticos públicos
  sanitizados y reparación en la misma sesión; falta cobertura accionable por
  clase de fallo.
- **G-03 — Permisos por misión:** PARCIAL. La detección y escalamiento existen;
  falta una política interactiva plenamente asociada a misión/sesión.
- **G-04 — Presupuesto total:** PARCIAL. Duración y reparaciones están acotadas;
  no existe medición fiable de tokens ni un estado durable de presupuesto agotado.

El worker y el runtime posteriores al checkpoint no tienen carga actual
verificada en esta auditoría. La misión `cgl-v1-csv-expense-20261009-003`
terminó `COMPLETED` pero con aceptación funcional `FAIL/BLOCKED`; no debe
reutilizarse como PASS.

Punto de reenganche: conservar runtime y respaldo externo, verificar cero
workflows/permisos y la versión efectiva del worker, y solo después autorizar
una misión supervisada nueva.
