#!/usr/bin/env bash
# MCP command launched by tunnel-client (STDIO) for the EXPERIMENTAL profile.
# Pins the lab adapter to the experimental OpenCode and experimental state;
# refuses anything that would point at the stable environment.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
guard_config
guard_start_allowed

PASSFILE="$EXP_RUN/opencode.password"
[[ -s "$PASSFILE" ]] || die "experimental OpenCode password missing; start exp-opencode.sh first"
[[ "$EXP_OPENCODE_PORT" != "$STABLE_OPENCODE_PORT" ]] || die "would target the stable OpenCode"

export OPENCODE_URL="http://$EXP_OPENCODE_HOST:$EXP_OPENCODE_PORT"
OPENCODE_SERVER_PASSWORD="$(cat "$PASSFILE")"
export OPENCODE_SERVER_PASSWORD
export MCP_SUBSCRIPTIONS_FILE="$EXP_SUBSCRIPTIONS_FILE"
export MCP_EVENT_OUTBOX_FILE="$EXP_OUTBOX_FILE"
export MCP_EVENTS_EMITTER="$EXP_EVENTS_EMITTER"
unset MCP_TRANSPORT # STDIO only

cd "$EXP_ADAPTER_DIR"
# stdout is the MCP channel: nothing else may write to it.
exec node "$EXP_ADAPTER_DIR/node_modules/tsx/dist/cli.mjs" "$EXP_ADAPTER_DIR/src/index.ts" \
  2>>"$EXP_LOGS/adapter.log"
