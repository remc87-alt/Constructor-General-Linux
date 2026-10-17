#!/usr/bin/env bash
# Prepara una misión CGL: workspace nuevo, OpenCode :4098 apuntando a él y preflight.
#   cgl-prep-mission.sh <mission_id> <artefacto>...
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$HERE"; source poc.env
ID="${1:?mission_id requerido}"; shift
[ "$#" -gt 0 ] || { echo "Faltan artefactos"; exit 1; }
RUN=$("$TEMPORAL_BIN" workflow count --address "$TEMPORAL_IP:$TEMPORAL_PORT" --query "ExecutionStatus='Running'" | awk '/Total/{print $2}')
[ "$RUN" = "0" ] || { echo "ABORTO: hay $RUN workflows corriendo"; exit 1; }
npx tsx src/workspace-setup.ts "$ID" "$@"
./t3-opencode.sh stop || true; sleep 2
[ -n "${FREELLM_KEY:-}" ] || source ~/.freellm_env
./t3-opencode.sh start "$POC_ROOT/workspaces/$ID"
./runtime-preflight.sh "$POC_ROOT/workspaces/$ID"
