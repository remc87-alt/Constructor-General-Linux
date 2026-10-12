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

## 7. Addendum 2026-10-12 · Misión `CGL-V2-G01-CODIGO-AISLAMIENTO-20261012`

La §3 queda **IMPLEMENTADA y PROBADA en local; NO instalada ni activada**. Esta sección **prevalece** sobre §2–§5 donde difiera; lo anterior se conserva como historia. Ningún paso de esta sección se ha ejecutado.

### 7.1 Código entregado (§3)

| §3 | Implementación |
|---|---|
| 1. Raíz configurable | `src/workspace.ts` `workspaceRoot()`: `CGL_WORKSPACE_ROOT` absoluta, normalizada, sin symlinks; sin definir = raíz legado. La usan `generic-contract.ts` (solo hijo directo) y `t3-setup.ts`. Los wrappers del oráculo usan la **constante** `/srv/cgl/workspaces`: un binario root bajo sudo no lee el entorno. |
| 2. `verifyOpenCodeWorkspace` | `verifyServerIdentity`: argv exacto por `/proc/<pid>/cmdline`, `Uid` real/efectivo/guardado/fs, un único LISTEN en `127.0.0.1:4098` (IPv4 e IPv6) del uid esperado, y `GET /path` con `directory` === `worktree` === workspace y `home` del ejecutor. No usa `/proc/<pid>/cwd`. Cualquier inconsistencia: FAIL. `runtime-preflight.sh` usa `GET /path`. |
| 3. Workspace git | `ensureGitWorkspace`: `git init --shared=0640` + commit vacío, sin config de usuario ni hooks (`core.hooksPath=/dev/null`, `core.fsmonitor=false`). Un repo existente solo se verifica; un `.git` que sea gitfile, symlink, ajeno o sin commit se rechaza sin tocarlo; si falla, se borra el `.git` creado. `src/workspace-setup.ts <id> <artefactos…>` crea el workspace completo o nada. Motivo, verificado en el binario 1.18.34: sin repo, `Project.resolve` devuelve worktree `/`, y git rechaza un repo de otro dueño sin `safe.directory`. |
| 4. Lanzador | `executor/cgl-exec-opencode` (`start <id>` / `stop`), `executor/cgl-exec.sudoers`, modo aislado de `t3-opencode.sh` (`CGL_OPENCODE_USER=cgl_exec` + `CGL_WORKSPACE_ROOT=/srv/cgl/workspaces`; sin definir = legado intacto). Ver 7.3. |
| 5. Pruebas | `test/g01-isolation.test.ts` (24, incluye el cableado de `prepareGenericMission`/`verifyOpenCodeWorkspace` con dependencias inyectadas), `test/oracle_g01_contract_test.py`, `test/g01_launcher_test.sh` (54), mutaciones 25/25. |

Endurecimientos adicionales, a raíz de la revisión ECC:
- `prepareGenericMission` exige que el workspace, `opencode.json` y `.git` sean del orquestador, que no sean escribibles por otros y que no haya `.opencode/` ni `opencode.jsonc`. Esto impide el squatting y que se reemplace la política.
- `opencode.json` del workspace solo admite `$schema` y `permission`. Se rechazan `provider`, `plugin`, `mcp`, `model` e `instructions`, así como cualquier `{env:` o `{file:`, porque la config de proyecto anula la global.
- Los artefactos no pueden contener comodines (`* ? [ ] { } !`), porque se convierten en patrones de permiso.
- `cgl-oracle-prepare` (root) abre raíz → misión → archivo con `dir_fd`, `O_NOFOLLOW|O_DIRECTORY` y `O_NONBLOCK`. Exige que el workspace sea del orquestador, archivo regular y `nlink==1`, y no hace `resolve()`. `source_workspace` = `ROOT/mission_id` exacto. `cgl-oracle-validate` compara ese valor por igualdad exacta.
- Fase 4 (revisión del código):
  - `.git`, `.git/config` y `.git/hooks` no pueden ser escribibles por grupo u otros, y `prepareGenericMission` también exige el toplevel y el commit inicial (`gitWorkspaceViolation`).
  - La raíz no puede ser world-writable.
  - El lanzador exige que el home del ejecutor y `opencode.jsonc` sean root-owned y no escribibles: OpenCode también lee `$HOME/.opencode` y los dotfiles.
  - `t3-opencode.sh` falla si varios servidores coinciden.
  - `cgl-exec-netfilter apply` construye la cadena nueva antes de retirar la anterior, sin ventana sin filtro.

**Compatibilidad legado (deliberada, fail closed):**
- Con los wrappers nuevos instalados, el oráculo solo acepta `/srv/cgl/workspaces`.
- Las misiones genéricas exigen un workspace con `.git` propio. Los workspaces previos a G01 se rechazan en `prepareGenericMission`: se crean de nuevo con `workspace-setup.ts`.
- V1 y las instancias 4096/4097 no se tocan.

### 7.2 Hallazgo de host (solo lectura, 2026-10-12)

En este WSL2 hay tres condiciones abiertas:
- `/proc/sys/fs/binfmt_misc/WSLInterop` = **enabled**: cualquier usuario puede ejecutar `.exe` de Windows como el usuario de Windows.
- `/mnt/c` es legible.
- `/var/run/docker.sock` es escribible por `rodrigo_mella`.

El lanzador **se niega a arrancar** mientras interop esté activo, `/mnt/c` sea legible o el filtro de red falte (fail closed). Se resuelve en el paso 4b.

### 7.3 Procedimiento administrativo actualizado (reemplaza los pasos 2, 4, 5, 6 y 8 de §4)

Los pasos 1, 3 y 7 de §4 se mantienen. Al paso 3 se agregan `test -w /var/run/docker.sock`, `test -x /home/rodrigo_mella` y `test -r /mnt/c`; todos deben fallar.

**Paso 2'. Raíz.** `cgl_exec` no puede crear entradas en la raíz (squatting); los workspaces son 3770 (setgid + sticky).
```bash
sudo groupadd cgl_ws && sudo usermod -aG cgl_ws cgl_exec && sudo usermod -aG cgl_ws rodrigo_mella
sudo install -d -o root -g root -m 0755 /srv/cgl
sudo install -d -o rodrigo_mella -g cgl_ws -m 2750 /srv/cgl/workspaces
```
- Verificar: `stat -c '%a %U:%G' /srv/cgl /srv/cgl/workspaces` → `755 root:root` y `2750 rodrigo_mella:cgl_ws`.
- Rollback: `sudo rmdir /srv/cgl/workspaces /srv/cgl`; `gpasswd -d` para los dos usuarios; `groupdel cgl_ws`.

**Paso 4'. Filtro de red persistente.** Usa una cadena propia al tope de OUTPUT, en IPv4 **e IPv6**, y rechaza todos los protocolos.
```bash
sudo install -o root -g root -m 0755 experimental/temporal-poc/executor/cgl-exec-netfilter /usr/local/sbin/cgl-exec-netfilter
sudo /usr/local/sbin/cgl-exec-netfilter apply      # imprime "cgl-exec-netfilter: OK"
```
- Persistencia: en `/etc/wsl.conf`, `[boot]` → `command="/usr/local/sbin/cgl-exec-netfilter apply"`. Si falta, el lanzador lo detecta, porque sondea 7243/7244/8243/4096/4097 y `::1`, y se niega a arrancar.
- Verificar como `cgl_exec`:
  - `curl` a 127.0.0.1:7244, a `[::1]:7243` y a 4098 falla;
  - `curl -o /dev/null -w '%{http_code}' 127.0.0.1:3001/v1/models` devuelve 401;
  - `sudo /usr/local/sbin/cgl-exec-netfilter check` devuelve OK.
- Rollback: `sudo /usr/local/sbin/cgl-exec-netfilter remove` y quitar la línea `[boot]`.

**Paso 4b (NUEVO). WSL interop y automount.** **Decisión del Director y del usuario antes de ejecutarlo.**
- Cambios en `/etc/wsl.conf`:
  - `[interop]` → `enabled=false` y `appendWindowsPath=false`;
  - `[automount]` → `options="metadata,umask=077"`, o `enabled=false`.
- **Impacto:**
  - deja de funcionar `code .`, `explorer.exe` y `clip.exe` desde WSL para todos los usuarios;
  - requiere `wsl --shutdown` desde Windows, que reinicia **todos** los servicios WSL: FreeLLMAPI, Fábrica PMO, n8n, Temporal, worker y OpenCode 4096/4097/4098;
  - hay que coordinarlo con los otros proyectos y ejecutarlo con 0 workflows.
- Verificar: `cat /proc/sys/fs/binfmt_misc/WSLInterop*` está ausente o en `disabled`; `sudo -u cgl_exec test -r /mnt/c` falla.
- Rollback: restaurar `wsl.conf` y ejecutar `wsl --shutdown`.

**Paso 5'. Estado y configuración del ejecutor.** El agente **no** puede reescribir su política global.
```bash
sudo install -d -o cgl_exec -g cgl_exec -m 0700 /var/lib/cgl-exec/opencode /var/lib/cgl-exec/opencode/{data,state,cache,log}
sudo install -d -o root -g cgl_exec -m 0750 /var/lib/cgl-exec/opencode/config /var/lib/cgl-exec/opencode/config/opencode
sudo install -o root -g cgl_exec -m 0640 <config-revisada> /var/lib/cgl-exec/opencode/config/opencode/opencode.jsonc
```
- **Home del ejecutor root-owned** (el lanzador lo exige). OpenCode lee `$HOME/.opencode` y los dotfiles; el agente no debe poder plantarlos:
  ```bash
  sudo chown root:cgl_exec /var/lib/cgl-exec && sudo chmod 0750 /var/lib/cgl-exec
  ```
- La config contiene el proveedor `freellmapi` (baseURL 127.0.0.1:3001), una clave **nueva y dedicada** con cuota mínima (paso 7), `"autoupdate": false` y el modelo.
- **Precarga de caché.** Sin red, OpenCode no puede descargar `@ai-sdk/openai-compatible`. Hay que copiar la caché revisada de la instancia actual (`~/.local/state/constructor-temporal-poc/opencode/cache/opencode`) a `/var/lib/cgl-exec/opencode/cache/opencode` y aplicar `chown -R cgl_exec:cgl_exec` **solo sobre `cache/`**. Nunca sobre `config/` ni sobre el home: el lanzador rechazaría arrancar.
- Rollback: `sudo rm -r /var/lib/cgl-exec/opencode`.

**Paso 6'. Binario, lanzador, sudoers y wrappers.**

Los hashes se verifican contra el commit de esta misión (`C`), nunca contra la copia de trabajo:
```bash
C=<commit de esta misión>; R=~/constructor-general-linux-m01-lab; P=experimental/temporal-poc
sudo install -d -o root -g root -m 0755 /usr/local/lib/cgl-exec
sudo install -o root -g root -m 0755 ~/.opencode/bin/opencode /usr/local/lib/cgl-exec/opencode
cmp ~/.opencode/bin/opencode /usr/local/lib/cgl-exec/opencode
git -C $R show $C:$P/executor/cgl-exec-opencode > /tmp/l && sudo install -o root -g root -m 0755 /tmp/l /usr/local/libexec/cgl-exec-opencode
git -C $R show $C:$P/executor/cgl-exec.sudoers  > /tmp/s && sudo visudo -cf /tmp/s && sudo install -o root -g root -m 0440 /tmp/s /etc/sudoers.d/cgl-exec
sudo cp -p /usr/local/libexec/cgl-oracle-prepare  /usr/local/libexec/cgl-oracle-prepare.bak-g01
sudo cp -p /usr/local/libexec/cgl-oracle-validate /usr/local/libexec/cgl-oracle-validate.bak-g01
git -C $R show $C:$P/oracle-wrapper/cgl-oracle-prepare.py  > /tmp/p && sudo install -o root -g root -m 0750 /tmp/p /usr/local/libexec/cgl-oracle-prepare
git -C $R show $C:$P/oracle-wrapper/cgl-oracle-validate.py > /tmp/v && sudo install -o root -g root -m 0755 /tmp/v /usr/local/libexec/cgl-oracle-validate
```
- No se usa `scripts/install-oracle-concurrency.sh`: sus pines son de los wrappers del 2026-10-09.
- La regla sudoers tiene exactamente dos formas: `^start <slug>$` y `^stop$`, con `env_reset` y `!setenv`.
- Verificar:
  - `sudo visudo -c`;
  - `sudo -l -U rodrigo_mella` muestra solo esas dos reglas para `cgl_exec`;
  - `stat -c '%a %U' /usr/local/lib/cgl-exec /usr/local/libexec` devuelve root y ninguno es escribible por grupo u otros;
  - `sudo sha256sum` de cada archivo instalado coincide con el de `git show $C:…`.
- Rollback:
  - `sudo rm /etc/sudoers.d/cgl-exec /usr/local/libexec/cgl-exec-opencode`;
  - `sudo rm -r /usr/local/lib/cgl-exec`;
  - `sudo install -m 0750 …prepare.bak-g01 …prepare` y `sudo install -m 0755 …validate.bak-g01 …validate`.
- **Atención:** con los wrappers nuevos, el modo legado deja de pasar el oráculo (fail closed). El rollback de los wrappers forma parte del rollback de 4098.

**Paso 8'. Arranque controlado de 4098 aislado.** Requiere `runtime-preflight.sh` limpio y 0 workflows.
```bash
export CGL_WORKSPACE_ROOT=/srv/cgl/workspaces CGL_OPENCODE_USER=cgl_exec
cd ~/constructor-general-linux-m01-lab/experimental/temporal-poc
./t3-opencode.sh stop                          # instancia legado (sin las variables)
npx tsx src/workspace-setup.ts <mission-id> <artefactos…>
./t3-opencode.sh start /srv/cgl/workspaces/<mission-id>
./runtime-preflight.sh /srv/cgl/workspaces/<mission-id>
```
- **Detener la instancia aislada:** `./t3-opencode.sh stop`, con las variables exportadas. Hace `kill -1` como `cgl_exec`, así que termina **todos** sus procesos, incluidos los hijos `nohup`/`setsid` del agente.
- Verificar:
  - `ps -o user= -p $(cat ~/.local/state/constructor-temporal-poc/run/opencode-t3.pid)` devuelve `cgl_exec`;
  - `GET /path` muestra `directory` = `worktree` = workspace;
  - `GET /config` contiene la política;
  - `sudo tr '\0' '\n' </proc/<pid>/environ` contiene solo las variables del lanzador;
  - el log de rechazos del lanzador está en `/var/lib/cgl-exec/opencode/log/opencode.log`.
- **Activación del worker (gate §5, no ahora):** `poc.env` / `ctl.sh` deben exportar `CGL_WORKSPACE_ROOT` y `CGL_OPENCODE_USER` al worker; sin eso, `verifyOpenCodeWorkspace` falla cerrado.
- Rollback:
  - `./t3-opencode.sh stop` con las variables;
  - `unset CGL_WORKSPACE_ROOT CGL_OPENCODE_USER`;
  - restaurar los wrappers `.bak-g01`;
  - `./t3-opencode.sh start <workspace legado>` con el código previo (`fd893f0`).

### 7.4 Gate §5 (adiciones)

- Prueba negativa con `sudo -u cgl_exec`: `docker ps`, `test -w /var/run/docker.sock`, `curl` a `[::1]:7243`, la lectura de `/mnt/c` y la ejecución de `/mnt/c/Windows/System32/cmd.exe` fallan.
- `cgl-exec-netfilter check` devuelve OK después de un `wsl --shutdown`, lo que demuestra la persistencia.
- Una escritura de prueba fuera del workspace, hecha por el agente, queda denegada o pasa a `ask`. Esto valida `external_directory` con worktree git, que sigue **NO DEMOSTRADO**.

### 7.5 Riesgos residuales (actualizado)

- **La clave de FreeLLMAPI y la contraseña de 4098 son legibles por el agente** (mismo uid), así que se asumen comprometibles: cuota mínima y revocables. La contraseña es inútil sin red hacia 4098 (paso 4').
- **Sockets unix abstractos:** el filtro de red no los cubre. La mitigación fuerte es un network namespace propio (`unshare -n` o bwrap con un proxy hacia 3001): **PENDIENTE de diseño**, no bloquea si el paso 4b está hecho y se verifican los sockets de `/run`.
- **No hay aislamiento entre misiones:** `cgl_exec` lee los workspaces de otras misiones por el grupo `cgl_ws`. Mitigación operativa: una misión a la vez y limpiar al terminar.
- **Recursos:** `ulimit -u 1024`, `-n 4096` y `-f` de 4 GiB en el lanzador; no hay cuota de disco.
- **`verifyServerIdentity`** no fija el `starttime` del proceso: queda una ventana teórica de reutilización del pid, pero el uid del listener y `GET /path` deben coincidir igualmente.
- **Filtro de red tras el arranque (MEDIO, N2):** si algo vacía iptables con 4098 ya vivo, el lanzador no lo detecta, porque sondea solo en `start`. Mitigación operativa: `sudo cgl-exec-netfilter check` antes de cada misión. Automatizarlo en el orquestador queda PENDIENTE: requiere root o una sonda como `cgl_exec`.
- **Las sondas del lanzador** prueban puertos concretos; el filtro real lo certifica `cgl-exec-netfilter check`.
