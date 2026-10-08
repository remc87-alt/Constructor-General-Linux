#!/usr/bin/env bash
# Experimental tunnel-client (STDIO) bound to a tunnel DISTINCT from the stable one.
#   EXP_TUNNEL_ID=tunnel_… exp-tunnel.sh render     (writes the profile outside the repo)
#   EXP_ALLOW_START=1 EXP_TUNNEL_ID=… exp-tunnel.sh start   (G3+ only)
#   exp-tunnel.sh stop | status
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
guard_config

PIDFILE="$EXP_RUN/tunnel-client.pid"
TEMPLATE="$EXP_G2_DIR/tunnel-profile.template.yaml"
WRAPPER="$EXP_G2_DIR/exp-adapter.sh"
EXPECT="--profile-file $EXP_TUNNEL_PROFILE"

render() {
  guard_tunnel_id
  [[ -f "$EXP_CONTROL_PLANE_KEY_FILE" ]] || die "control-plane key file not found (path only is referenced)"
  ensure_dirs
  (umask 077; sed -e "s|__EXP_TUNNEL_ID__|$EXP_TUNNEL_ID|" \
       -e "s|__EXP_CONTROL_PLANE_KEY_FILE__|$EXP_CONTROL_PLANE_KEY_FILE|" \
       -e "s|__EXP_TUNNEL_HEALTH__|$EXP_TUNNEL_HEALTH|" \
       -e "s|__EXP_ADAPTER_WRAPPER__|$WRAPPER|" "$TEMPLATE" >"$EXP_TUNNEL_PROFILE")
  if grep -q "__EXP_" "$EXP_TUNNEL_PROFILE"; then die "unrendered placeholder left in profile"; fi
  if grep -qF "$STABLE_TUNNEL_ID" "$EXP_TUNNEL_PROFILE"; then die "rendered profile references the stable tunnel"; fi
  info "profile rendered: $EXP_TUNNEL_PROFILE"
}

case "${1:-status}" in
  render) render ;;
  start)
    guard_start_allowed
    guard_tunnel_id
    require_port_free "${EXP_TUNNEL_HEALTH##*:}" # before render: a blocked start leaves no state
    render
    "$EXP_G2_DIR/exp-opencode.sh" status 2>&1 | grep -q '"healthy":true' || die "experimental OpenCode is not healthy"
    EXP_ALLOW_START=1 nohup "$HOME/.local/bin/tunnel-client" run --profile-file "$EXP_TUNNEL_PROFILE" \
      >>"$EXP_LOGS/tunnel-client.log" 2>&1 &
    echo $! >"$PIDFILE"
    info "tunnel-client started (pid $(cat "$PIDFILE")); readiness: curl -s http://$EXP_TUNNEL_HEALTH/readyz"
    ;;
  stop) stop_pidfile "$PIDFILE" "$EXPECT" ;;
  status)
    if [[ -f "$PIDFILE" ]]; then
      info "pidfile: $(cat "$PIDFILE")"
      curl -s -m 5 "http://$EXP_TUNNEL_HEALTH/readyz"; echo
    else
      info "not running (no pidfile)"
    fi
    ;;
  *) die "usage: exp-tunnel.sh render|start|stop|status" ;;
esac
