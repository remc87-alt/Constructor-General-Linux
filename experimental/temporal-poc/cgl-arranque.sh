#!/usr/bin/env bash
# Arranque CGL tras reiniciar PC/WSL. Orden obligatorio: Temporal -> Worker -> OpenCode 4098; el tunel (systemd) se recupera solo.
#   cgl-arranque.sh [workspace]   (sin argumento: el workspace mas reciente)
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$HERE"; source poc.env
ss -ltn | grep -q ':3001 ' || echo "AVISO: FreeLLMAPI (3001) no esta arriba"
ss -ltn | grep -q ':7243 ' || ./ctl.sh server start
./ctl.sh worker status | grep -q alive || ./ctl.sh worker start
[ -n "${FREELLM_KEY:-}" ] || source ~/.freellm_env
if ! ss -ltn | grep -q ':4098 '; then WS="${1:-$(ls -td "$POC_ROOT"/workspaces/*/ | head -1)}"; ./t3-opencode.sh start "${WS%/}"; fi
for i in $(seq 1 30); do [ "$(systemctl --user is-active cgl-temporal-publicacion.service)" = active ] && break; sleep 2; done
echo "Tunel: $(systemctl --user is-active cgl-temporal-publicacion.service)"
./runtime-preflight.sh | tail -1
