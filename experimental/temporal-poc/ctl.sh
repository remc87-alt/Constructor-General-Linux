#!/usr/bin/env bash
# POC process control. Only processes started here (pidfile + cmdline check).
#   ctl.sh server start|stop|kill|status
#   ctl.sh worker start|stop|kill|status
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Reuse the audited G2 helpers (port_state, require_port_free, proc_cmdline,
# stop_pidfile, die, info). Sourcing does not run any G2 guard or action.
# shellcheck source=../g2/lib.sh
source "$HERE/../g2/lib.sh"
# shellcheck source=poc.env
source "$HERE/poc.env"

SERVER_PID="$POC_RUN/temporal-server.pid"
WORKER_PID="$POC_RUN/worker.pid"
SERVER_EXPECT="start-dev --db-filename $TEMPORAL_DB"
WORKER_EXPECT="$POC_DIR/src/worker.ts"

kill9() { # abrupt crash simulation, same pidfile/cmdline checks as stop_pidfile
  local pidfile="$1" expect="$2" pid cmd
  [[ -f "$pidfile" ]] || { info "not running"; return 0; }
  pid="$(cat "$pidfile")"
  if cmd="$(proc_cmdline "$pid")" && grep -qF -- "$expect" <<<"$cmd"; then
    kill -KILL "$pid"; info "SIGKILL pid $pid"
  else
    info "pid '$pid' is not '$expect'; nothing signalled"
  fi
  rm -f "$pidfile"
}

server() {
  case "$1" in
    start)
      for p in "$TEMPORAL_PORT" "$TEMPORAL_UI_PORT" "$TEMPORAL_HTTP_PORT" "$TEMPORAL_METRICS_PORT"; do require_port_free "$p"; done
      umask 077
      setsid "$TEMPORAL_BIN" server start-dev --db-filename "$TEMPORAL_DB" --ip "$TEMPORAL_IP" \
        --port "$TEMPORAL_PORT" --ui-port "$TEMPORAL_UI_PORT" --http-port "$TEMPORAL_HTTP_PORT" \
        --metrics-port "$TEMPORAL_METRICS_PORT" --log-level warn \
        </dev/null >>"$POC_LOGS/temporal-server.log" 2>&1 &
      echo $! >"$SERVER_PID"
      for _ in $(seq 1 30); do
        "$TEMPORAL_BIN" operator cluster health --address "$TEMPORAL_IP:$TEMPORAL_PORT" >/dev/null 2>&1 \
          && { info "temporal server SERVING (pid $(cat "$SERVER_PID"))"; return 0; }
        sleep 1
      done
      die "temporal server not healthy (see $POC_LOGS/temporal-server.log)" ;;
    stop) stop_pidfile "$SERVER_PID" "$SERVER_EXPECT" ;;
    kill) kill9 "$SERVER_PID" "$SERVER_EXPECT" ;;
    status) "$TEMPORAL_BIN" operator cluster health --address "$TEMPORAL_IP:$TEMPORAL_PORT" 2>&1 | tail -1 ;;
    *) die "usage: ctl.sh server start|stop|kill|status" ;;
  esac
}

# The worker runs as tsx cli → node child inside its own setsid session, so
# the pidfile holds the real worker pid (printed by worker.ts) and signals go
# to its whole process group, after verifying the pid's cmdline.
worker_signal() {
  local sig="$1" pid pgid cmd
  [[ -f "$WORKER_PID" ]] || { info "worker not running (no pidfile)"; return 0; }
  pid="$(cat "$WORKER_PID")"
  if cmd="$(proc_cmdline "$pid")" && grep -qF -- "$WORKER_EXPECT" <<<"$cmd"; then
    pgid="$(ps -o pgid= -p "$pid" | tr -d ' ')"
    [[ "$pgid" =~ ^[1-9][0-9]*$ ]] || die "cannot resolve process group of worker pid $pid"
    kill "-$sig" -- "-$pgid" && info "SIG$sig worker process group $pgid (worker pid $pid)"
    for _ in $(seq 1 20); do [[ -d "/proc/$pid" ]] || break; sleep 0.5; done
  else
    info "pid '$pid' is not the POC worker; nothing signalled"
  fi
  rm -f "$WORKER_PID"
}

worker() {
  case "$1" in
    start)
      umask 077
      if [[ -f "$WORKER_PID" ]] && proc_cmdline "$(cat "$WORKER_PID")" >/dev/null; then die "worker already running (pid $(cat "$WORKER_PID"))"; fi
      local before; before="$(grep -c 'WORKER RUNNING' "$POC_LOGS/worker.log" 2>/dev/null || true)"
      (cd "$POC_DIR" && POC_TEMPORAL_ADDRESS="$TEMPORAL_IP:$TEMPORAL_PORT" POC_TASK_QUEUE="$POC_TASK_QUEUE" \
        POC_EFFECTS_DIR="$POC_EFFECTS_DIR" setsid node "$POC_DIR/node_modules/tsx/dist/cli.mjs" "$POC_DIR/src/worker.ts" \
        </dev/null >>"$POC_LOGS/worker.log" 2>&1 3>&- 4>&- 5>&- &)
      for _ in $(seq 1 90); do
        if [[ "$(grep -c 'WORKER RUNNING' "$POC_LOGS/worker.log" 2>/dev/null || true)" -gt "${before:-0}" ]]; then
          grep 'WORKER RUNNING' "$POC_LOGS/worker.log" | tail -1 | sed -E 's/.*pid=([0-9]+).*/\1/' >"$WORKER_PID"
          info "worker running (pid $(cat "$WORKER_PID"))"; return 0
        fi
        sleep 1
      done
      die "worker did not start (see $POC_LOGS/worker.log)" ;;
    stop) worker_signal TERM ;;
    kill) worker_signal KILL ;;
    status)
      if [[ -f "$WORKER_PID" ]] && proc_cmdline "$(cat "$WORKER_PID")" >/dev/null; then
        info "worker pid $(cat "$WORKER_PID") alive"
      else
        info "worker not running"
      fi ;;
    *) die "usage: ctl.sh worker start|stop|kill|status" ;;
  esac
}

case "${1:-}" in
  server) server "${2:-status}" ;;
  worker) worker "${2:-status}" ;;
  *) die "usage: ctl.sh server|worker <action>" ;;
esac
