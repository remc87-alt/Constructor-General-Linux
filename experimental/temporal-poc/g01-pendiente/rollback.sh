#!/usr/bin/env bash
# Rollback de aplicar.sh (G01). Detiene el ejecutor aislado, restaura wrappers y retira lo instalado.
#   sudo bash ~/cgl-g01/rollback.sh
# NO revierte 4b (ver paso-4b.sh --rollback). Continúa ante errores: es un rollback.
[[ $EUID -eq 0 && -n "${SUDO_USER:-}" ]] || { echo "Ejecutar: sudo bash $0"; exit 1; }
U=$SUDO_USER; L=/usr/local/libexec
echo "== detener 4098 aislado (si corre)"; sudo -n -u cgl_exec $L/cgl-exec-opencode stop 2>&1 || true
echo "== wrappers (parte del rollback de 4098)"
for w in prepare validate; do
  m=0755; [[ $w == prepare ]] && m=0750
  if [[ -e $L/cgl-oracle-$w.bak-g01 ]]; then install -o root -g root -m $m $L/cgl-oracle-$w.bak-g01 $L/cgl-oracle-$w && echo "  restaurado $w"; else echo "  sin respaldo para $w"; fi
done
echo "== sudoers / lanzador / binario"
rm -f /etc/sudoers.d/cgl-exec $L/cgl-exec-opencode
rm -r /usr/local/lib/cgl-exec 2>/dev/null || true
echo "== netfilter"
/usr/local/sbin/cgl-exec-netfilter remove 2>&1 || true
if [[ -e /etc/wsl.conf.bak-g01 ]]; then cp -p /etc/wsl.conf.bak-g01 /etc/wsl.conf && echo "  wsl.conf restaurado"; else sed -i '\#cgl-exec-netfilter apply#d' /etc/wsl.conf; fi
rm -f /usr/local/sbin/cgl-exec-netfilter
echo "== estado del ejecutor"; rm -r /var/lib/cgl-exec/opencode 2>/dev/null || true
echo "== raíz (solo si vacía)"; rmdir /srv/cgl/workspaces /srv/cgl 2>&1 || echo "  /srv/cgl/workspaces no vacío: conservado"
echo "(grupo cgl_ws y membresías conservados; para quitarlos: gpasswd -d cgl_exec cgl_ws; gpasswd -d $U cgl_ws; groupdel cgl_ws)"
echo "Modo legado: unset CGL_WORKSPACE_ROOT CGL_OPENCODE_USER; ./t3-opencode.sh start <workspace legado>; recargar worker sin esas variables."
