#!/usr/bin/env bash
# Read-only runtime preflight for the V2 POC (Temporal 7243 + OpenCode 4098).
# Prints one PASS/FAIL line per gate and exits 1 if any gate fails. It never
# starts, stops, signals or approves anything; secrets are never printed.
# Run it before any worker reload, OpenCode restart or mission start.
#   runtime-preflight.sh [workspace-dir]   (workspace: also checks 4098 cwd)
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=poc.env
source "$HERE/poc.env"
ADDR="$TEMPORAL_IP:$TEMPORAL_PORT"
PASSFILE="$POC_RUN/opencode-t3.password"
fails=0
gate() { if [[ "$2" == ok ]]; then echo "PASS  $1${3:+ ($3)}"; else echo "FAIL  $1${3:+ ($3)}"; fails=$((fails + 1)); fi; }

"$TEMPORAL_BIN" operator cluster health --address "$ADDR" 2>/dev/null | grep -q SERVING && gate "temporal serving" ok || gate "temporal serving" ko
running="$("$TEMPORAL_BIN" workflow count --address "$ADDR" --query "ExecutionStatus='Running'" 2>/dev/null | awk '/Total/ {print $2}')"
[[ "$running" == 0 ]] && gate "zero running workflows" ok || gate "zero running workflows" ko "running=${running:-unknown}"
pollers="$("$TEMPORAL_BIN" task-queue describe --task-queue "$POC_TASK_QUEUE" --address "$ADDR" 2>/dev/null | awk '$2 == "workflow" && $3 ~ /@/ {print $3}' | sort -u)"
[[ -n "$pollers" && "$(wc -l <<<"$pollers")" == 1 ]] && gate "single worker poller" ok "$pollers" || gate "single worker poller" ko "${pollers:-none}"
wpid="$(cat "$POC_RUN/worker.pid" 2>/dev/null || true)"
if [[ -n "$wpid" && -d "/proc/$wpid" ]]; then
  started="$(stat -c %Y "/proc/$wpid")"
  newest="$(find "$POC_DIR/src" "$HOME/constructor-general-linux-m01-lab/mcp-opencode-adapter/src" -name '*.ts' -printf '%T@\n' | sort -n | tail -1 | cut -d. -f1)"
  (( newest <= started )) && gate "worker runs current code" ok || gate "worker runs current code" ko "source newer than worker start: reload + adapter-instance sync required"
else
  gate "worker runs current code" ko "worker pid not running"
fi
if [[ -s "$PASSFILE" ]]; then
  auth=(-s -m 5 -u "opencode:$(cat "$PASSFILE")")
  curl "${auth[@]}" http://127.0.0.1:4098/global/health | grep -q '"healthy":true' && gate "opencode 4098 healthy" ok || gate "opencode 4098 healthy" ko
  [[ "$(curl "${auth[@]}" http://127.0.0.1:4098/permission)" == "[]" ]] && gate "zero pending permissions" ok || gate "zero pending permissions" ko
  [[ "$(curl "${auth[@]}" http://127.0.0.1:4098/session/status)" == "{}" ]] && gate "zero busy sessions" ok || gate "zero busy sessions" ko
else
  gate "opencode 4098 credentials" ko "password file missing"
fi
if [[ -n "${1:-}" ]]; then
  ws="$(realpath -e -- "$1" 2>/dev/null || true)"
  ocpid="$(cat "$POC_RUN/opencode-t3.pid" 2>/dev/null || true)"
  [[ -n "$ws" && -n "$ocpid" && "$(realpath "/proc/$ocpid/cwd" 2>/dev/null)" == "$ws" ]] && gate "opencode cwd = workspace" ok || gate "opencode cwd = workspace" ko "restart 4098 on this workspace"
fi
echo "preflight: $fails failing gate(s)"
exit $(( fails > 0 ))
