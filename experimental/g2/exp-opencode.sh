#!/usr/bin/env bash
# Experimental OpenCode server: own port, own XDG homes (own SQLite DB),
# random basic-auth password, cwd = lab. Never touches the stable server.
#   exp-opencode.sh status          (read-only)
#   EXP_ALLOW_START=1 FREELLM_KEY=… exp-opencode.sh start   (G3+ only)
#   exp-opencode.sh stop            (only the pid this script started)
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
guard_config

PIDFILE="$EXP_RUN/opencode.pid"
PASSFILE="$EXP_RUN/opencode.password"
EXPECT="opencode serve --hostname $EXP_OPENCODE_HOST --port $EXP_OPENCODE_PORT"
URL="http://$EXP_OPENCODE_HOST:$EXP_OPENCODE_PORT"

auth_curl() { curl -s -m 5 -u "opencode:$(cat "$PASSFILE")" "$@"; }

case "${1:-status}" in
  start)
    guard_start_allowed
    [[ -n "${FREELLM_KEY:-}" ]] || die "FREELLM_KEY must be set in the caller environment"
    require_port_free "$EXP_OPENCODE_PORT"
    ensure_dirs
    [[ -s "$PASSFILE" ]] || (umask 077; head -c 32 /dev/urandom | base64 | tr -d '/+=' >"$PASSFILE")
    cd "$EXP_LAB"
    XDG_DATA_HOME="$EXP_OPENCODE_XDG_DATA" XDG_STATE_HOME="$EXP_OPENCODE_XDG_STATE" \
    XDG_CACHE_HOME="$EXP_OPENCODE_XDG_CACHE" XDG_CONFIG_HOME="$EXP_OPENCODE_XDG_CONFIG" \
    OPENCODE_SERVER_PASSWORD="$(cat "$PASSFILE")" \
      setsid "$HOME/.opencode/bin/opencode" serve --hostname "$EXP_OPENCODE_HOST" --port "$EXP_OPENCODE_PORT" \
      < /dev/null >>"$EXP_LOGS/opencode.log" 2>&1 &
    echo $! >"$PIDFILE"
    for _ in $(seq 1 30); do
      auth_curl "$URL/global/health" | grep -q '"healthy":true' && { info "experimental OpenCode healthy on $URL"; exit 0; }
      sleep 1
    done
    die "experimental OpenCode did not become healthy (see $EXP_LOGS/opencode.log)"
    ;;
  stop)
    stop_pidfile "$PIDFILE" "$EXPECT"
    ;;
  status)
    if [[ -f "$PIDFILE" ]]; then
      info "pidfile: $(cat "$PIDFILE")"
      [[ -f "$PASSFILE" ]] && auth_curl "$URL/global/health" && echo
    else
      info "not running (no pidfile); port $EXP_OPENCODE_PORT: $(port_state "$EXP_OPENCODE_PORT")"
    fi
    ;;
  *) die "usage: exp-opencode.sh start|stop|status" ;;
esac
