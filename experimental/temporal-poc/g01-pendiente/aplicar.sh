#!/usr/bin/env bash
# G01 §7.3 pasos 2',4',5',6' (sin 4b). Idempotente: salta lo ya correcto, verifica tras cada paso, se detiene al primer fallo.
#   sudo bash ~/cgl-g01/aplicar.sh
set -euo pipefail
[[ $EUID -eq 0 && -n "${SUDO_USER:-}" && "$SUDO_USER" != root ]] || { echo "Ejecutar: sudo bash $0"; exit 1; }
U=$SUDO_USER; UH=$(getent passwd "$U" | cut -d: -f6)
C=aafa277009405181539dc0c518024202b1f47562; R=$UH/constructor-general-linux-m01-lab; P=experimental/temporal-poc
CFG=${CGL_CONFIG:-$UH/cgl-g01/opencode.jsonc}   # config revisada del ejecutor (paso 5'), solo si falta la instalada
STATE=/var/lib/cgl-exec/opencode
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
step() { echo; echo "== $*"; }
fail() { echo "FALLO: $*" >&2; exit 1; }
need() { local d=$1; shift; "$@" || fail "verificación: $d"; echo "  ok: $d"; }
mode() { [[ "$(stat -c '%a %U:%G' "$1")" == "$2" ]]; }
gitf() { sudo -u "$U" git -C "$R" show "$C:$P/$1" >"$2"; }
# install_if_diff <src> <dst> <mode>  (BAK=1: respaldo .bak-g01 una sola vez)
install_if_diff() {
  if [[ -e $2 ]] && cmp -s "$1" "$2" && mode "$2" "${3#0} root:root"; then echo "  ya correcto: $2"; return; fi
  if [[ ${BAK:-0} == 1 && -e $2 && ! -e $2.bak-g01 ]]; then cp -p "$2" "$2.bak-g01"; echo "  respaldo: $2.bak-g01"; fi
  install -o root -g root -m "$3" "$1" "$2"
}

step "2' raíz y grupo cgl_ws"
getent group cgl_ws >/dev/null || groupadd cgl_ws
id -nG cgl_exec | grep -qw cgl_ws || usermod -aG cgl_ws cgl_exec
id -nG "$U" | grep -qw cgl_ws || usermod -aG cgl_ws "$U"
install -d -o root -g root -m 0755 /srv/cgl
mode /srv/cgl/workspaces "2750 $U:cgl_ws" 2>/dev/null || install -d -o "$U" -g cgl_ws -m 2750 /srv/cgl/workspaces
need "/srv/cgl 755 root:root" mode /srv/cgl "755 root:root"
need "/srv/cgl/workspaces 2750 $U:cgl_ws" mode /srv/cgl/workspaces "2750 $U:cgl_ws"
need "cgl_exec en cgl_ws" bash -c 'id -nG cgl_exec | grep -qw cgl_ws'

step "6' binario, lanzador, sudoers, wrappers (hashes contra el commit $C)"
install -d -o root -g root -m 0755 /usr/local/lib/cgl-exec
cmp -s "$UH/.opencode/bin/opencode" /usr/local/lib/cgl-exec/opencode || install -o root -g root -m 0755 "$UH/.opencode/bin/opencode" /usr/local/lib/cgl-exec/opencode
need "opencode == origen" cmp "$UH/.opencode/bin/opencode" /usr/local/lib/cgl-exec/opencode
gitf executor/cgl-exec-opencode "$T/l"; install_if_diff "$T/l" /usr/local/libexec/cgl-exec-opencode 0755
gitf executor/cgl-exec.sudoers "$T/s"; visudo -cf "$T/s" >/dev/null || fail "visudo del sudoers del commit"
if ! { cmp -s "$T/s" /etc/sudoers.d/cgl-exec && mode /etc/sudoers.d/cgl-exec "440 root:root"; }; then install -o root -g root -m 0440 "$T/s" /etc/sudoers.d/cgl-exec; fi
gitf oracle-wrapper/cgl-oracle-prepare.py "$T/p"; BAK=1 install_if_diff "$T/p" /usr/local/libexec/cgl-oracle-prepare 0750
gitf oracle-wrapper/cgl-oracle-validate.py "$T/v"; BAK=1 install_if_diff "$T/v" /usr/local/libexec/cgl-oracle-validate 0755
need "visudo -c" visudo -c
need "sudoers == commit" cmp "$T/s" /etc/sudoers.d/cgl-exec
need "launcher == commit" cmp "$T/l" /usr/local/libexec/cgl-exec-opencode
need "prepare == commit" cmp "$T/p" /usr/local/libexec/cgl-oracle-prepare
need "validate == commit" cmp "$T/v" /usr/local/libexec/cgl-oracle-validate
need "dueños root, sin escritura de grupo/otros" bash -c '[[ "$(stat -c "%U %A" /usr/local/lib/cgl-exec /usr/local/libexec | grep -vc "^root ......-..-")" == 0 ]]'
need "sudo -l: solo start/stop para cgl_exec" bash -c "sudo -l -U $U | grep -c 'cgl-exec-opencode' | grep -qx 2"

step "4' filtro de red (aplicar + persistencia en wsl.conf)"
gitf executor/cgl-exec-netfilter "$T/n"; install_if_diff "$T/n" /usr/local/sbin/cgl-exec-netfilter 0755
/usr/local/sbin/cgl-exec-netfilter apply | tee "$T/nf"; grep -q "cgl-exec-netfilter: OK" "$T/nf" || fail "netfilter apply no imprimió OK"
need "netfilter check" /usr/local/sbin/cgl-exec-netfilter check
BOOT='command="/usr/local/sbin/cgl-exec-netfilter apply"'
if ! grep -qF "$BOOT" /etc/wsl.conf; then
  cp -p /etc/wsl.conf /etc/wsl.conf.bak-g01
  python3 - "$BOOT" <<'PY'
import sys,re
b=sys.argv[1]; s=open('/etc/wsl.conf').read()
if re.search(r'^command\s*=',s,re.M): sys.exit("wsl.conf ya tiene otro [boot] command: fusionar a mano")
if re.search(r'^\[boot\]',s,re.M): s=re.sub(r'(^\[boot\][^\n]*\n)',lambda m:m.group(1)+b+"\n",s,count=1,flags=re.M)
else: s=s.rstrip("\n")+"\n\n[boot]\n"+b+"\n"
open('/etc/wsl.conf','w').write(s)
PY
fi
need "wsl.conf contiene el comando de arranque" grep -qF "$BOOT" /etc/wsl.conf
need "cgl_exec no llega a 7244" bash -c '! sudo -u cgl_exec curl -s -m 3 -o /dev/null http://127.0.0.1:7244'
need "cgl_exec no llega a [::1]:7243" bash -c '! sudo -u cgl_exec curl -s -m 3 -o /dev/null "http://[::1]:7243"'
need "cgl_exec no llega a 4098" bash -c '! sudo -u cgl_exec curl -s -m 3 -o /dev/null http://127.0.0.1:4098'
need "3001/v1/models responde 401" bash -c '[[ "$(sudo -u cgl_exec curl -s -m 5 -o /dev/null -w "%{http_code}" http://127.0.0.1:3001/v1/models)" == 401 ]]'

step "5' estado y config del ejecutor"
install -d -o root -g cgl_exec -m 0750 /var/lib/cgl-exec
install -d -o cgl_exec -g cgl_exec -m 0700 "$STATE" "$STATE"/{data,state,cache,log}
install -d -o root -g cgl_exec -m 0750 "$STATE/config" "$STATE/config/opencode"
if [[ ! -s $STATE/config/opencode/opencode.jsonc ]]; then
  [[ -s $CFG ]] || fail "falta la config del ejecutor: crea $CFG (proveedor freellmapi 127.0.0.1:3001, clave NUEVA de cuota mínima, autoupdate:false, modelo) y reintenta"
  install -o root -g cgl_exec -m 0640 "$CFG" "$STATE/config/opencode/opencode.jsonc"
fi
if [[ ! -d $STATE/cache/opencode ]]; then
  cp -a "$UH/.local/state/constructor-temporal-poc/opencode/cache/opencode" "$STATE/cache/opencode"
  chown -R cgl_exec:cgl_exec "$STATE/cache"
fi
need "home root:cgl_exec 750" mode /var/lib/cgl-exec "750 root:cgl_exec"
need "config 640 root:cgl_exec" mode "$STATE/config/opencode/opencode.jsonc" "640 root:cgl_exec"
need "config/ y home no son de cgl_exec" bash -c "[[ \$(stat -c %U $STATE/config $STATE/config/opencode /var/lib/cgl-exec | grep -c cgl_exec) == 0 ]]"
need "cache es de cgl_exec" bash -c "[[ \$(stat -c %U $STATE/cache/opencode) == cgl_exec ]]"

echo; echo "APLICAR: TODO OK. Siguiente: bash ~/cgl-g01/validar.sh   (4b NO aplicado: ~/cgl-g01/paso-4b.sh)"
