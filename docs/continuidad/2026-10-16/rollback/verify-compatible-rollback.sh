#!/usr/bin/env bash
set -euo pipefail
umask 077
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
test ! -e "$ROOT/verified-fallback.json" || { echo 'Already verified: preserve this snapshot; do not recapture dependencies.'; exit 1; }
MOD="$ROOT/snapshot/experimental/temporal-poc"
ADAPTER="$ROOT/snapshot/mcp-opencode-adapter"
CLI="$HOME/.local/state/constructor-temporal-poc/bin/temporal"
test "$(id -u)" = 1000
test "$(node --version)" = v22.23.2
LOGS="$(mktemp -d "$ROOT/validation.XXXXXX")"
CAPTURE="$(mktemp -d "$ROOT/ubuntu-capture.XXXXXX")"
mkdir "$CAPTURE/runtime" "$CAPTURE/previous-dependencies"
# Re-capture native payloads in Ubuntu: sandbox copies are not authoritative.
# Keep every previous copy, and never modify the installed dependencies.
REPO="$HOME/constructor-general-linux-m01-lab"
for REL in experimental/temporal-poc mcp-opencode-adapter; do
  cmp "$REPO/$REL/package-lock.json" "$ROOT/snapshot/$REL/package-lock.json"
  KEY="${REL//\//-}"
  if [[ -e "$ROOT/snapshot/$REL/node_modules" ]]; then
    mv "$ROOT/snapshot/$REL/node_modules" "$CAPTURE/previous-dependencies/$KEY"
  fi
  cp -a --reflink=auto "$REPO/$REL/node_modules" "$ROOT/snapshot/$REL/node_modules"
done
cp --reflink=auto -- "$(readlink -f -- "$(command -v node)")" "$CAPTURE/runtime/node"
chmod 700 "$CAPTURE/runtime/node"
NODE="$CAPTURE/runtime/node"
cd "$MOD"
"$NODE" -e 'require("@swc/core").transformSync("export const ready=true",{jsc:{parser:{syntax:"typescript"}}})'
PORT="$(python3 - <<'PY'
import socket
with socket.socket() as s:
    s.bind(('127.0.0.1',0))
    print(s.getsockname()[1])
PY
)"
test "$PORT" != 7243
PID=
cleanup() {
  if [[ -n "$PID" ]]; then
    kill -TERM "$PID" 2>/dev/null || true
    wait "$PID" 2>/dev/null || true
  fi
  echo "Evidence preserved: $LOGS"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
"$CLI" server start-dev --ip 127.0.0.1 --port "$PORT" --headless >"$LOGS/server.log" 2>&1 &
PID=$!
READY=0
for ((i=0;i<60;i++)); do
  kill -0 "$PID" 2>/dev/null || { cat "$LOGS/server.log"; exit 1; }
  if timeout 2s "$CLI" --address "127.0.0.1:$PORT" operator cluster health >/dev/null 2>&1; then READY=1; break; fi
  sleep 1
done
test "$READY" = 1
kill -0 "$PID"
printf 'Isolated Temporal PID=%s address=127.0.0.1:%s storage=in-memory\n' "$PID" "$PORT" | tee "$LOGS/isolation.txt"
CGL_TEMPORAL_TEST_ADDRESS="127.0.0.1:$PORT" timeout --kill-after=10s 180s "$NODE" --import tsx --test "$ROOT/cross-version.test.mjs" 2>&1 | tee "$LOGS/cross-version.log"
cd "$ADAPTER"
timeout --kill-after=10s 60s "$NODE" --import tsx --test test/shared-missions.test.ts 2>&1 | tee "$LOGS/frozen-adapter.log"
cd "$ROOT"
python3 - "$LOGS" "$CAPTURE/runtime" <<'PY'
from pathlib import Path
import hashlib,json,sys
root=Path.cwd()
items={}
for base in [root/'snapshot',Path(sys.argv[2])]:
    for p in base.rglob('*'):
        if p.is_symlink(): items[str(p.relative_to(root))]={'symlink':str(p.readlink())}
        elif p.is_file(): items[str(p.relative_to(root))]={'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
result={'kind':'tested compatible fallback; not exact PID2262122 reconstruction','tests_passed':True,'logs':sys.argv[1],'runtime':str(Path(sys.argv[2]).relative_to(root)),'files':items}
with (root/'verified-fallback.json').open('x') as f: json.dump(result,f,indent=2)
print('Compatible fallback checks PASS. No production processes were changed.')
PY
