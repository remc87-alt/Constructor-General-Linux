# G01 · Aislamiento del ejecutor: due diligence y procedimiento administrativo

Fecha: 2026-10-12. Misión: `CGL-V2-G01-PLAN-Y-GUARDA-20261012`. Estado: **PREPARADO, NO EJECUTADO**.

Ningún comando `sudo` de este documento se ha ejecutado. Lo ejecuta la persona administradora, paso a paso, verificando cada uno antes de seguir. No contiene secretos.

## 1. Due diligence (solo lectura, 2026-10-12)

### A. Identidades

| Identidad | Hecho observado | Riesgo |
|---|---|---|
| `rodrigo_mella` (uid 1000) | Grupos `sudo`, `docker`, `adm` y `empresa-ia-capa0`. `sudo` exige contraseña (`sudo -n` falla). Tiene NOPASSWD para `cgl-oracle-prepare` (como root) y `cgl-oracle-validate` (como `cgl_oracle`), y para `construir-servicio` y `/usr/bin/kill` como `empresa-ia-capa0`. | Hoy es a la vez administrador, orquestador y **ejecutor del agente**. |
| `cgl_oracle` (uid 997) | Usuario de sistema con nologin; solo grupo `cgl_oracle`. | Correcto: el oráculo ya está separado. |
| Ejecutor dedicado | **No existe.** | Este es el origen de G01. |

### B. Servicios

| Servicio | Usuario | Nota |
|---|---|---|
| OpenCode 4098 (V2 POC) | `rodrigo_mella` | Hereda el entorno de una sesión Codex. |
| OpenCode 4096 y 4097 (estable y G5) | `rodrigo_mella` | No se tocan. |
| Temporal 7243 (con 7244 HTTP, 7245 métricas y 8243 UI) y worker `constructor-poc` | `rodrigo_mella` | Sin autenticación, solo en loopback. |
| `dockerd`/`containerd` | root | Contenedores activos: FreeLLMAPI (127.0.0.1:3001, **proveedor del modelo de V2**), `fabrica-minutas-pmo-runner`, `fabrica-minutas-pmo-n8n`, `fab-pmo-lab*` y `poc-gw` (Empresa-IA). |

### C. Aislamiento

- **Suite privada instalada:** protegida. `/etc/cgl-oracle` es `root:cgl_oracle 750`, `/var/lib/cgl-oracle` es `cgl_oracle 700` y los resultados públicos están en `cgl_oracle 711`.
- **Copias de la suite legibles por `rodrigo_mella`, y por tanto por el agente actual:**
  - `oracle-wrapper/private-suite`: pasó a 700 el 2026-10-12, pero sigue siendo del mismo dueño.
  - `~/cgl-mvp-backup-20261010/oracle/private-suite`: 755, dentro de un directorio 700.
- **bwrap** está instalado y lo usa el oráculo, pero OpenCode no corre dentro de bwrap.
- **Rutas de escape del ejecutor actual:**
  - grupo `docker`, equivalente a root (`docker run -v /:/host`);
  - lectura de las copias de la suite;
  - señales y arranque de workflows contra Temporal 7243/7244, sin autenticación;
  - llamadas a la propia API de 4098 con la contraseña, que puede autoaprobar permisos;
  - invocar los wrappers NOPASSWD del oráculo;
  - `kill` como `empresa-ia-capa0`.
- **OpenCode 4098 reporta `worktree: "/"`** (`GET /path`), porque el workspace no es un repo git. NO DEMOSTRADO que `external_directory: deny` delimite el workspace en ese caso.

### D. Secretos (solo nombres, nunca valores)

- **Entorno heredado por 4098 y por el worker:** `OPENCODE_SERVER_PASSWORD` (solo 4098), `FREELLM_KEY`, `OPENVIKING_API_KEY` y variables `CODEX_*`. Todo proceso bash del agente las hereda.
- **`opencode.jsonc` de la instancia:** tiene una `apiKey` literal (archivo 0600, directorio 0700, del mismo usuario que el agente).
- **Rotación obligatoria** después de la separación, porque estuvieron expuestos al ejecutor:
  - la contraseña de 4098;
  - la clave de FreeLLMAPI usada por 4098;
  - `OPENVIKING_API_KEY`, que pertenece a otro proyecto y requiere coordinarse con sus consumidores.

### E. Impacto de las alternativas

| Acción | Consecuencia |
|---|---|
| Quitar a `rodrigo_mella` del grupo `docker` | **Rompe** la administración de FreeLLMAPI (modelo de V2), de la Fábrica PMO (runner y n8n) y de `poc-gw`. **No resuelve G01 por sí sola**: el agente seguiría leyendo copias y secretos, y enviando señales a Temporal. **No recomendado.** |
| Crear el ejecutor dedicado `cgl_exec` | Resuelve el acceso a docker, sudo, home, copias de la suite y secretos administrativos, siempre que se acompañe de reubicar los workspaces y filtrar la red. |
| Separar el oráculo | Ya hecho (`cgl_oracle`). Solo falta reubicar la raíz de workspaces que el oráculo lee. |
| Rotar credenciales | Corta la exposición histórica. FreeLLMAPI y OpenViking afectan a otros consumidores. |
| Reiniciar OpenCode 4098 | Requiere 0 workflows, 0 permisos y 0 sesiones activas (`runtime-preflight.sh`). La sesión histórica de la misión `cgl-v1-csv-expense-20261009-003` queda en la SQLite de la instancia: no se borra. |

## 2. Arquitectura objetivo

| Rol | Identidad | Puede | No puede |
|---|---|---|---|
| Administración | `rodrigo_mella` | sudo, docker, respaldos, suites de desarrollo, Temporal, worker y adaptador (orquestación) | Ejecutar el agente |
| Ejecutor OpenCode | `cgl_exec` (nuevo, nologin, sin grupos adicionales) | Leer y escribir solo su workspace y su estado; conectarse a 127.0.0.1:3001 (FreeLLMAPI) | Usar docker o sudo; leer `~rodrigo_mella`; conectarse a Temporal, a 4096-4098 ni a otros servicios |
| Oráculo | `cgl_oracle` (existente) | Leer la suite instalada y validar en bwrap | Ser invocado por `cgl_exec` (`cgl_exec` no tiene sudoers) |

## 3. Cambios de código previos (sin sudo; PENDIENTE, en una misión aparte)

Hoy el ejecutor no podría ni ver su workspace, por estas dependencias:

1. **Raíz de workspaces configurable** (`CGL_WORKSPACE_ROOT=/srv/cgl/workspaces`). Afecta a:
   - `generic-contract.ts` (`DEFAULT_WORKSPACE_ROOT`);
   - `t3-setup.ts`;
   - la constante `ROOT` de `cgl-oracle-prepare.py` y `WORKSPACE_ROOT` de `cgl-oracle-validate.py`. Estos wrappers se reinstalan con sudo en el paso 6.
2. **`verifyOpenCodeWorkspace`.** Leer `/proc/<pid>/cwd` de otro usuario falla con EPERM. Debe reemplazarse por `cmdline` (legible) más `GET /path` → `directory`.
3. **Workspace inicializado como repo git**, para que `worktree` sea el workspace y no `/`. Hay que verificarlo con `GET /path`.
4. **`t3-opencode.sh start`.** Debe lanzar OpenCode mediante un lanzador root fijo como `cgl_exec`, con `env -i` y solo `HOME`, `PATH`, `XDG_*` y `OPENCODE_SERVER_PASSWORD`. Sin `FREELLM_KEY`, `OPENVIKING_API_KEY` ni `CODEX_*`: la clave del proveedor vive en la config de `cgl_exec`.
5. Pruebas focalizadas de 1, 2 y 4, y reinstalar los wrappers.

## 4. Procedimiento administrativo (NO ejecutado)

**Precondiciones**
- `experimental/temporal-poc/runtime-preflight.sh` sin FAIL, salvo "worker runs current code".
- Respaldos verificados (`sha256sum -c` en `~/cgl-*-backup-*`).
- Sección 3 completada y probada.
- Ninguna operación de la Fábrica PMO en curso. Docker no se toca, pero conviene evitar coincidencias.

**Paso 1. Crear el usuario ejecutor**
```bash
sudo useradd --system --create-home --home-dir /var/lib/cgl-exec --shell /usr/sbin/nologin cgl_exec
```
- Verificar: `id cgl_exec` muestra solo el grupo `cgl_exec`; `sudo -l -U cgl_exec` no muestra reglas.
- Rollback: `sudo userdel -r cgl_exec`.

**Paso 2. Raíz de workspaces compartida solo con el orquestador**
```bash
sudo groupadd cgl_ws
sudo usermod -aG cgl_ws cgl_exec
sudo usermod -aG cgl_ws rodrigo_mella   # efectivo en sesiones nuevas
sudo install -d -o root -g cgl_ws -m 2770 /srv/cgl /srv/cgl/workspaces
```
- Verificar: `stat -c '%A %U:%G' /srv/cgl/workspaces` devuelve `drwxrws--- root:cgl_ws`.
- Rollback: `sudo rmdir /srv/cgl/workspaces /srv/cgl`; `sudo gpasswd -d cgl_exec cgl_ws`; `sudo gpasswd -d rodrigo_mella cgl_ws`; `sudo groupdel cgl_ws`.

**Paso 3. Comprobar que el ejecutor no lee material sensible**
```bash
for p in /home/rodrigo_mella /home/rodrigo_mella/cgl-mvp-backup-20261010 /etc/cgl-oracle /var/lib/cgl-oracle /var/run/docker.sock; do
  sudo -u cgl_exec test -r "$p" && echo "LEGIBLE: $p" || echo "ok: $p"; done
```
- Todo debe dar `ok`. Si algo aparece LEGIBLE, se detiene el procedimiento.
- Sin rollback: es solo lectura.

**Paso 4. Filtro de red del ejecutor** (owner match; en WSL2 no persiste tras reiniciar)
```bash
sudo iptables -A OUTPUT -m owner --uid-owner cgl_exec -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
sudo iptables -A OUTPUT -m owner --uid-owner cgl_exec -d 127.0.0.1 -p tcp --dport 3001 -j ACCEPT
sudo iptables -A OUTPUT -m owner --uid-owner cgl_exec -j REJECT
```
- Verificar:
  - `sudo -u cgl_exec curl -s -m3 127.0.0.1:7244` falla;
  - `sudo -u cgl_exec curl -s -m3 -o /dev/null -w '%{http_code}' 127.0.0.1:3001/v1/models` devuelve 401 (alcanzable);
  - `sudo -u cgl_exec curl -s -m3 127.0.0.1:4098` falla, es decir, el agente no llega a su propia API.
- Rollback: las mismas reglas con `-D` en lugar de `-A`.
- La persistencia queda PENDIENTE: decidir entre `iptables-persistent` o reaplicar en el arranque.

**Paso 5. Estado y configuración del ejecutor**
```bash
sudo install -d -o cgl_exec -g cgl_exec -m 700 /var/lib/cgl-exec/opencode /var/lib/cgl-exec/opencode/{config,data,state,cache}
sudo install -o cgl_exec -g cgl_exec -m 600 <config-sin-secretos-revisada> /var/lib/cgl-exec/opencode/config/opencode/opencode.jsonc
```
- La clave de FreeLLMAPI que se escriba en esa config debe ser **nueva y dedicada** al ejecutor; ver el paso 7.
- Rollback: `sudo rm -r /var/lib/cgl-exec/opencode`.

**Paso 6. Lanzador fijo y regla sudoers acotada**
- Instalar `/usr/local/libexec/cgl-exec-opencode` (root:root 755), revisado en la misión de la sección 3. Debe validar el workspace bajo `/srv/cgl/workspaces/<slug>`, hacer `cd` a él y ejecutar `env -i … opencode serve --hostname 127.0.0.1 --port 4098`.
- Crear `/etc/sudoers.d/cgl-exec`, editándolo con `visudo -f`:
  ```text
  rodrigo_mella ALL=(cgl_exec) NOPASSWD: /usr/local/libexec/cgl-exec-opencode ^[a-z0-9][a-z0-9-]{2,119}$
  ```
- Reinstalar los wrappers del oráculo con la raíz `/srv/cgl/workspaces`.
- Verificar: `sudo visudo -c`; `sudo -n -l` muestra solo la regla nueva para `cgl_exec`.
- Rollback: `sudo rm /etc/sudoers.d/cgl-exec /usr/local/libexec/cgl-exec-opencode` y reinstalar los wrappers anteriores con `scripts/install-oracle-concurrency.sh` desde el commit previo.

**Paso 7. Rotar secretos** (fuera de Git, sin registrar valores)
- Contraseña de 4098: generar una nueva en `run/opencode-t3.password` (0600, de `rodrigo_mella`) cuando 4098 esté detenido.
- FreeLLMAPI: emitir una clave dedicada para `cgl_exec` y revocar la que estuvo en el entorno de 4098, coordinando con los demás consumidores.
- `OPENVIKING_API_KEY`: rotarla con su proyecto dueño.
- Verificar: la clave revocada ya no autentica. La verificación la hace la persona, sin imprimir valores.

**Paso 8. Reinicio controlado de 4098**
- Requiere `runtime-preflight.sh` limpio.
- `t3-opencode.sh stop`; luego arrancar con el lanzador del paso 6 sobre un workspace git nuevo con `missionOpenCodeConfig`.
- Verificar:
  - `ps -o user= -p <pid>` devuelve `cgl_exec`;
  - `GET /path` muestra `worktree` = workspace;
  - `GET /config` contiene la política;
  - `tr '\0' '\n' </proc/<pid>/environ` no contiene `FREELLM_KEY`, `OPENVIKING` ni `CODEX`. Requiere sudo porque el proceso es de otro usuario.
- Rollback: `t3-opencode.sh start <workspace>` como antes, con el código y la configuración previos.

## 5. Gate para activar V2

Todas estas condiciones deben cumplirse y quedar registradas:
1. Pasos 1 a 8 verificados.
2. Sección 3 hecha y con pruebas en verde.
3. Prueba negativa con `sudo -u cgl_exec`: `docker ps`, la lectura de las suites, `curl` a 7243/7244/4098 y `sudo -n true` fallan.
4. `runtime-preflight.sh` limpio. Después: sincronizar `adapter-instance/src` y recargar el worker.
5. Sondeo de permisos con un prompt trivial: una edición fuera de los artefactos produce `ask`; la lectura fuera del workspace queda denegada.
6. Recién entonces, una única E2E CSV sintética (P7).

## 6. Riesgos residuales tras el procedimiento

- **El ejecutor conoce secretos propios.** Conoce su clave de FreeLLMAPI (necesaria para el modelo) y la contraseña de 4098 (en su entorno). El filtro de red le impide usar la contraseña contra su propia API: hay que verificarlo en el paso 4.
- **Temporal sigue sin autenticación** frente a procesos de `rodrigo_mella`. Es aceptable porque `rodrigo_mella` es el administrador.
- **El filtro de red no persiste en WSL2.** Si no se reaplica tras un reinicio, el aislamiento se degrada. `runtime-preflight.sh` deberá incorporar esa comprobación (PENDIENTE).
- **Semántica de permisos de OpenCode 1.18:** la coincidencia de patrones y `external_directory` con worktree git siguen NO DEMOSTRADAS hasta el paso 8.
- **Fuera del alcance de V2:** la regla NOPASSWD `kill` como `empresa-ia-capa0` y la pertenencia a `adm`. Se informan a sus proyectos.
