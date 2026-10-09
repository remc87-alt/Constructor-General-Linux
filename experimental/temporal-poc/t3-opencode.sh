#!/usr/bin/env bash
# OpenCode instance EXCLUSIVE to the Temporal POC (T3): port 4098, own XDG
# homes (own SQLite), own basic-auth password, cwd = the mission workspace.
#   t3-opencode.sh start <workspace-dir> | stop | status
# Never uses 4096 (stable) or 4097 (G5).
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../g2/lib.sh
source "$HERE/../g2/lib.sh"
# shellcheck source=poc.env
source "$HERE/poc.env"

PORT=4098
[[ "$PORT" != 4096 && "$PORT" != 4097 ]] || die "port reserved for stable/G5"
OC="$POC_ROOT/opencode"
PIDFILE="$POC_RUN/opencode-t3.pid"
PASSFILE="$POC_RUN/opencode-t3.password"
EXPECT="opencode serve --hostname 127.0.0.1 --port $PORT"
auth_curl() { curl -s -m 5 -u "opencode:$(cat "$PASSFILE")" "$@"; }

case "${1:-status}" in
  start)
    ws="$(realpath -m -s -- "${2:?workspace dir required}")"
    [[ "$ws" == "$POC_ROOT/workspaces/"?* && -d "$ws" ]] || die "workspace must be an existing dir under $POC_ROOT/workspaces/"
    [[ -n "${FREELLM_KEY:-}" ]] || die "FREELLM_KEY must be set in the caller environment"
    require_port_free "$PORT"
    umask 077
    [[ -s "$PASSFILE" ]] || head -c 32 /dev/urandom | base64 | tr -d '/+=' >"$PASSFILE"
    (cd "$ws" && XDG_DATA_HOME="$OC/data" XDG_STATE_HOME="$OC/state" XDG_CACHE_HOME="$OC/cache" \
      XDG_CONFIG_HOME="$OC/config" OPENCODE_SERVER_PASSWORD="$(cat "$PASSFILE")" \
      setsid "$HOME/.opencode/bin/opencode" serve --hostname 127.0.0.1 --port "$PORT" \
      </dev/null >>"$POC_LOGS/opencode-t3.log" 2>&1 3>&- 4>&- 5>&- &)
    for _ in $(seq 1 40); do
      pid="$(pgrep -f -x "$HOME/.opencode/bin/opencode serve --hostname 127.0.0.1 --port $PORT" || true)"
      if [[ -n "$pid" ]] && auth_curl "http://127.0.0.1:$PORT/global/health" | grep -q '"healthy":true'; then
        echo "$pid" >"$PIDFILE"; info "T3 OpenCode healthy on :$PORT (pid $pid, cwd $ws)"; exit 0
      fi
      sleep 1
    done
    die "T3 OpenCode did not become healthy (see $POC_LOGS/opencode-t3.log)" ;;
  stop) stop_pidfile "$PIDFILE" "$EXPECT" ;;
  status)
    if [[ -f "$PIDFILE" ]]; then auth_curl "http://127.0.0.1:$PORT/global/health"; echo; else info "not running; port $PORT $(port_state $PORT)"; fi ;;
  *) die "usage: t3-opencode.sh start <workspace>|stop|status" ;;
esac
