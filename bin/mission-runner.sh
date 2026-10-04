#!/usr/bin/env bash
set -euo pipefail

MISSION="${1:-}"

if [[ -z "$MISSION" ]]; then
  echo "ERROR: falta archivo de misión"
  echo "Uso: ./bin/mission-runner.sh missions/test-002.yaml"
  exit 2
fi

if [[ ! -f "$MISSION" ]]; then
  echo "ERROR: misión no encontrada: $MISSION"
  exit 2
fi

ROOT="$(git rev-parse --show-toplevel)"
MISSION_ABS="$(realpath "$MISSION")"

echo "=== CONSTRUCTOR GENERAL LINUX · MISSION RUNNER ==="
echo
echo "ROOT      : $ROOT"
echo "MISSION   : $MISSION_ABS"
echo

echo "→ Validando repositorio..."
git -C "$ROOT" rev-parse --is-inside-work-tree >/dev/null

echo "→ Estado inicial..."
git -C "$ROOT" status --short

echo
echo "→ Ejecutando OpenCode..."
echo

cd "$ROOT"

opencode run \
  --model freellmapi/nemotron-3-super-120b \
  "$(cat "$MISSION_ABS")"

STATUS=$?

echo
echo "=== RESULTADO ==="
echo "OpenCode exit code: $STATUS"

echo
echo "=== GIT STATUS ==="
git status --short

echo
echo "=== GIT DIFF ==="
git diff

exit "$STATUS"
