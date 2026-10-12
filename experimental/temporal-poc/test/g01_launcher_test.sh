#!/usr/bin/env bash
# G01 launcher tests without sudo: runs copies of executor/cgl-exec-opencode
# whose fixed paths point at a temp dir. The positive copy also relaxes the
# identity checks that need root (orchestrator != executor, root-owned binary
# and config); those checks are then exercised by un-relaxed copies.
# SAFETY: never runs a valid `stop` (kill -1 as this user would end the session).
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$HERE/executor/cgl-exec-opencode"
ME="$(id -un)"
T="$(mktemp -d /tmp/g01-launcher-XXXXXX)"
fails=0; passes=0
pids=()
cleanup() { for p in "${pids[@]}"; do kill "$p" 2>/dev/null; done; chmod -R u+rwx "$T" 2>/dev/null; rm -rf "$T"; }
trap cleanup EXIT
ok() { passes=$((passes + 1)); }
ko() { echo "FAIL: $*"; fails=$((fails + 1)); }

listen() { # host var: background listener (kept in this shell for cleanup); port -> $var
  python3 -c '
import socket, sys
fam = socket.AF_INET6 if ":" in sys.argv[1] else socket.AF_INET
s = socket.socket(fam); s.bind((sys.argv[1], 0)); s.listen(8)
print(s.getsockname()[1], flush=True)
while True: c, _ = s.accept(); c.close()' "$1" >"$T/port.$2" 2>/dev/null &
  pids+=($!)
  for _ in $(seq 1 50); do [[ -s "$T/port.$2" ]] && break; sleep 0.1; done
  printf -v "$2" '%s' "$(cat "$T/port.$2")"
}
free_port() { python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1])'; }

listen 127.0.0.1 PROVIDER_PORT
DEAD_PORT="$(free_port)"
ROOT="$T/srv/workspaces"; STATE="$T/state"; OUT="$T/fake.out"
mkdir -p "$ROOT" "$STATE/config/opencode" "$STATE/log" "$T/orch-home" "$T/binfmt" "$T/bin" "$T/home"
printf '{}' >"$STATE/config/opencode/opencode.jsonc"; chmod 644 "$STATE/config/opencode/opencode.jsonc"; chmod 755 "$T/home"
chmod 000 "$T/orch-home"
echo disabled >"$T/binfmt/WSLInterop"
# Fake server: builtins only (no fork: RLIMIT_NPROC counts this uid's threads);
# records argv, cwd, environment names, password and limits.
cat >"$T/bin/opencode" <<EOF
#!/bin/bash
{ printf 'ARG:%s\n' "\$@"; printf 'PWD:%s\n' "\$PWD"; echo ENVBEGIN; compgen -e; echo ENVEND
  printf 'PASS:%s\n' "\$OPENCODE_SERVER_PASSWORD"; printf 'GITSAFE:%s\n' "\$GIT_CONFIG_VALUE_0"; printf 'NPROC:'; ulimit -u; } >"$OUT"
EOF
chmod 755 "$T/bin/opencode"

make_copy() { # name relax(0|1) [extra sed program]
  local dst="$T/$1"
  sed -e "s|^readonly EXEC_USER=cgl_exec|readonly EXEC_USER=$ME|" \
      -e "s|^readonly ROOT=/srv/cgl/workspaces|readonly ROOT=${ROOT}|" \
      -e "s|^readonly EXEC_HOME=/var/lib/cgl-exec|readonly EXEC_HOME=$T/home|" \
      -e "s|^readonly OC_STATE=/var/lib/cgl-exec/opencode|readonly OC_STATE=$STATE|" \
      -e "s|^readonly OC_BIN=/usr/local/lib/cgl-exec/opencode|readonly OC_BIN=$T/bin/opencode|" \
      -e "s|^readonly ORCHESTRATOR_HOME=/home/rodrigo_mella|readonly ORCHESTRATOR_HOME=$T/orch-home|" \
      -e "s|^readonly FORBIDDEN=(.*)|readonly FORBIDDEN=(127.0.0.1/$DEAD_PORT ${FORBID_EXTRA:-})|" \
      -e "s|^readonly PROVIDER=127.0.0.1/3001|readonly PROVIDER=127.0.0.1/${PROVIDER_OVERRIDE:-$PROVIDER_PORT}|" \
      -e "s|/var/run/docker.sock|$T/docker.sock|g" \
      -e "s|/proc/sys/fs/binfmt_misc/WSLInterop\*|$T/binfmt/WSLInterop*|" \
      -e "s|/mnt/c|$T/mnt-c|g" \
      "$SRC" >"$dst"
  if [[ "$2" == 1 ]]; then
    sed -i -e 's|\[\[ "\$owner" != "\$SELF_UID" && "\$owner" != 0 \]\]|[[ "$owner" == "$SELF_UID" ]]|' \
           -e 's|root_chain "\$OC_BIN"|root_chain /usr/bin/env|' \
           -e 's|"\$(uid_of "\$OC_STATE/config")" == 0 && "\$(uid_of "\$OC_STATE/config/opencode")" == 0|"$(uid_of "$OC_STATE/config")" == "$SELF_UID"|' \
           -e 's|"\$(uid_of "\$cfg")" == 0|"$(uid_of "$cfg")" == "$SELF_UID"|' \
           -e 's|"\$(uid_of "\$EXEC_HOME")" == 0|"$(uid_of "$EXEC_HOME")" == "$SELF_UID"|' "$dst"
  fi
  [[ -n "${3:-}" ]] && sed -i -e "$3" "$dst"
  chmod 755 "$dst"; echo "$dst"
}
new_ws() { # slug -> valid isolated workspace
  local ws="$ROOT/$1"
  mkdir "$ws" && chmod 3770 "$ws" && printf '{}' >"$ws/opencode.json" && git -C "$ws" init -q && echo "$ws"
}
PW="Abcdefghij0123456789xyz"
run() { # launcher args... ; stdin from $STDIN; hostile inherited environment
  rm -f "$OUT"
  env -i PATH=/usr/bin:/bin HOME="$T" FREELLM_KEY=leak-freellm OPENVIKING_API_KEY=leak-ov CODEX_HOME=leak-codex CODEX_TOKEN=leak \
    OPENCODE_SERVER_PASSWORD=inherited-old XDG_CONFIG_HOME=/home/x/.config NODE_OPTIONS=--require=/tmp/evil.js \
    "$@" <"${STDIN:-/dev/null}" 2>"$T/err"
}
expect_refusal() { # label pattern launcher args...
  local label="$1" pattern="$2"; shift 2
  if run "$@"; then ko "$label: accepted"; return; fi
  if grep -q -- "$pattern" "$T/err" && [[ ! -e "$OUT" ]]; then ok; else ko "$label: $(cat "$T/err")"; fi
}
printf '%s\n' "$PW" >"$T/pw"

# ---- positive path: exact argv, cwd, minimal environment ----
L="$(make_copy pos 1)"
WS="$(new_ws g01-launch-001)"
STDIN="$T/pw" run "$L" start g01-launch-001 || ko "positive start failed: $(cat "$T/err")"
if [[ -s "$OUT" ]]; then
  [[ "$(grep '^ARG:' "$OUT" | tr '\n' ' ')" == "ARG:serve ARG:--hostname ARG:127.0.0.1 ARG:--port ARG:4098 " ]] && ok || ko "argv: $(grep ARG "$OUT")"
  grep -qx "PWD:$WS" "$OUT" && ok || ko "cwd not workspace"
  grep -qx "PASS:$PW" "$OUT" && ok || ko "password not from stdin"
  grep -qx "GITSAFE:$WS" "$OUT" && ok || ko "safe.directory not workspace"
  grep -qx "NPROC:1024" "$OUT" && ok || ko "ulimit -u not applied"
  envs="$(sed -n '/^ENVBEGIN$/,/^ENVEND$/p' "$OUT" | grep -vx 'ENVBEGIN\|ENVEND\|PWD\|SHLVL\|_\|OLDPWD' | sort | tr '\n' ' ')"
  want="GIT_CONFIG_COUNT GIT_CONFIG_KEY_0 GIT_CONFIG_VALUE_0 HOME LANG LOGNAME OPENCODE_DISABLE_AUTOUPDATE OPENCODE_DISABLE_LSP_DOWNLOAD OPENCODE_DISABLE_MODELS_FETCH OPENCODE_SERVER_PASSWORD PATH USER XDG_CACHE_HOME XDG_CONFIG_HOME XDG_DATA_HOME XDG_STATE_HOME "
  [[ "$envs" == "$want" ]] && ok || ko "environment not minimal: $envs"
  grep -q 'leak\|inherited-old\|/home/x\|evil' "$OUT" && ko "inherited secret/env leaked" || ok
else
  ko "fake server did not run"
fi

# ---- argument / input validation (injection) ----
for bad in "../etc" "AB-001" "ab" "a;b-001" "--port" "g01 x" "-g01" "$(printf 'g01\nx01')"; do
  STDIN="$T/pw" expect_refusal "slug '$bad'" "invalid mission id" "$L" start "$bad"
done
STDIN="$T/pw" expect_refusal "no args" "usage" "$L"
STDIN="$T/pw" expect_refusal "start alone" "usage" "$L" start
STDIN="$T/pw" expect_refusal "extra args" "usage" "$L" start g01-launch-001 extra
STDIN="$T/pw" expect_refusal "stop with args" "usage" "$L" stop now
STDIN="$T/pw" expect_refusal "unknown verb" "usage" "$L" restart g01-launch-001
expect_refusal "no password" "password expected on stdin" "$L" start g01-launch-001
for pw in "short1" "has space 0123456789abc" 'quote"0123456789abcdef' "$(printf 'a%.0s' {1..129})"; do
  printf '%s\n' "$pw" >"$T/badpw"
  STDIN="$T/badpw" expect_refusal "password '${pw:0:12}'" "invalid server password" "$L" start g01-launch-001
done

# ---- workspace validation (symlinks, traversal, ownership markers) ----
STDIN="$T/pw" expect_refusal "missing workspace" "real directory" "$L" start g01-absent-001
mkdir -p "$T/outside/g01-out-001"; ln -s "$T/outside/g01-out-001" "$ROOT/g01-link-001"
STDIN="$T/pw" expect_refusal "symlinked workspace" "real directory" "$L" start g01-link-001
W="$(new_ws g01-mode-001)"; chmod 2770 "$W"
STDIN="$T/pw" expect_refusal "mode 2770" "mode must be 3770" "$L" start g01-mode-001
W="$(new_ws g01-nogit-001)"; rm -rf "$W/.git"
STDIN="$T/pw" expect_refusal "no .git" "own orchestrator-owned .git" "$L" start g01-nogit-001
W="$(new_ws g01-gitlink-001)"; rm -rf "$W/.git"; ln -s "$WS/.git" "$W/.git"
STDIN="$T/pw" expect_refusal ".git symlink" "own orchestrator-owned .git" "$L" start g01-gitlink-001
W="$(new_ws g01-cfglink-001)"; rm "$W/opencode.json"; ln -s "$WS/opencode.json" "$W/opencode.json"
STDIN="$T/pw" expect_refusal "opencode.json symlink" "opencode.json required" "$L" start g01-cfglink-001
W="$(new_ws g01-dotoc-001)"; mkdir "$W/.opencode"
STDIN="$T/pw" expect_refusal ".opencode dir" "overrides are not allowed" "$L" start g01-dotoc-001
W="$(new_ws g01-jsonc-001)"; : >"$W/opencode.jsonc"
STDIN="$T/pw" expect_refusal "opencode.jsonc" "overrides are not allowed" "$L" start g01-jsonc-001
ln -s "$ROOT" "$T/root-link"
LR="$(make_copy rootlink 1 "s|^readonly ROOT=.*|readonly ROOT=$T/root-link|")"
STDIN="$T/pw" expect_refusal "symlinked root" "must not traverse symlinks" "$LR" start g01-launch-001

# ---- isolation probes (fail closed) ----
listen 127.0.0.1 FPORT
LF="$(FORBID_EXTRA="127.0.0.1/$FPORT" make_copy forbid 1)"
STDIN="$T/pw" expect_refusal "forbidden port reachable" "network filter missing: 127.0.0.1/$FPORT" "$LF" start g01-launch-001
listen ::1 F6
L6="$(FORBID_EXTRA="::1/$F6" make_copy forbid6 1)"
STDIN="$T/pw" expect_refusal "forbidden IPv6 port reachable" "network filter missing: ::1/$F6" "$L6" start g01-launch-001
LP="$(PROVIDER_OVERRIDE="$DEAD_PORT" make_copy noprov 1)"
STDIN="$T/pw" expect_refusal "provider unreachable" "provider" "$LP" start g01-launch-001
: >"$T/docker.sock"; chmod 600 "$T/docker.sock"
STDIN="$T/pw" expect_refusal "docker socket writable" "docker socket writable" "$L" start g01-launch-001
rm -f "$T/docker.sock"
chmod 755 "$T/orch-home"
STDIN="$T/pw" expect_refusal "orchestrator home" "orchestrator home accessible" "$L" start g01-launch-001
chmod 000 "$T/orch-home"
echo enabled >"$T/binfmt/WSLInterop"
STDIN="$T/pw" expect_refusal "WSL interop" "WSL interop enabled" "$L" start g01-launch-001
echo disabled >"$T/binfmt/WSLInterop"
mkdir "$T/mnt-c"
STDIN="$T/pw" expect_refusal "windows drive" "Windows drive" "$L" start g01-launch-001
rmdir "$T/mnt-c"

# ---- identity checks relaxed above, now enforced ----
LS="$(make_copy strict 0)"
STDIN="$T/pw" expect_refusal "orchestrator == executor" "owned by the orchestrator" "$LS" start g01-launch-001
LB="$(make_copy strictbin 0 's|\[\[ "\$owner" != "\$SELF_UID" \&\& "\$owner" != 0 \]\]|[[ 1 == 1 ]]|')"
STDIN="$T/pw" expect_refusal "user-owned binary" "root-owned executable" "$LB" start g01-launch-001
LC="$(make_copy strictcfg 0 's|\[\[ "\$owner" != "\$SELF_UID" \&\& "\$owner" != 0 \]\]|[[ 1 == 1 ]]|; s|root_chain "\$OC_BIN"|root_chain /usr/bin/env|')"
STDIN="$T/pw" expect_refusal "agent-writable config" "config must be root-owned" "$LC" start g01-launch-001

RELAX_ALL='s|\[\[ "\$owner" != "\$SELF_UID" \&\& "\$owner" != 0 \]\]|[[ 1 == 1 ]]|; s|root_chain "\$OC_BIN"|root_chain /usr/bin/env|; s|"\$(uid_of "\$OC_STATE/config")" == 0 \&\& "\$(uid_of "\$OC_STATE/config/opencode")" == 0|1 == 1|'
LJ="$(make_copy strictjsonc 0 "$RELAX_ALL")"
STDIN="$T/pw" expect_refusal "agent-owned opencode.jsonc" "opencode.jsonc must be root-owned" "$LJ" start g01-launch-001
LH="$(make_copy stricthome 0 "$RELAX_ALL; s|\"\$(uid_of \"\$cfg\")\" == 0|1 == 1|")"
STDIN="$T/pw" expect_refusal "agent-owned home" "executor home must be root-owned" "$LH" start g01-launch-001
chmod 664 "$STATE/config/opencode/opencode.jsonc"
STDIN="$T/pw" expect_refusal "group-writable opencode.jsonc" "opencode.jsonc must be root-owned" "$L" start g01-launch-001
chmod 644 "$STATE/config/opencode/opencode.jsonc"; chmod 775 "$T/home"
STDIN="$T/pw" expect_refusal "group-writable home" "executor home must be root-owned" "$L" start g01-launch-001
chmod 755 "$T/home"

# ---- the real launcher refuses any user but cgl_exec, before any effect ----
STDIN="$T/pw" expect_refusal "real launcher as $ME" "must run as cgl_exec" "$SRC" start g01-launch-001
STDIN="$T/pw" expect_refusal "real launcher stop as $ME" "must run as cgl_exec" "$SRC" stop

# ---- t3-opencode.sh isolated-mode guards (fail before sudo or ports) ----
T3="$HERE/t3-opencode.sh"
t3() { env -i PATH=/usr/bin:/bin HOME="$HOME" "$@" "$T3" "${T3ARGS[@]}" >"$T/err" 2>&1; }
T3ARGS=(status); if t3 CGL_OPENCODE_USER=bob; then ko "t3 accepted other user"; else grep -q "must be cgl_exec" "$T/err" && ok || ko "t3 user: $(cat "$T/err")"; fi
T3ARGS=(status); if t3 CGL_OPENCODE_USER=cgl_exec; then ko "t3 accepted legacy root"; else grep -q "requires CGL_WORKSPACE_ROOT" "$T/err" && ok || ko "t3 root: $(cat "$T/err")"; fi
T3ARGS=(start "$T/outside/g01-out-001"); if t3 CGL_OPENCODE_USER=cgl_exec CGL_WORKSPACE_ROOT=/srv/cgl/workspaces; then ko "t3 accepted outside ws"; else grep -q "existing /srv/cgl/workspaces" "$T/err" && ok || ko "t3 ws: $(cat "$T/err")"; fi
T3ARGS=(start /srv/cgl/workspaces/../../etc); if t3 CGL_OPENCODE_USER=cgl_exec CGL_WORKSPACE_ROOT=/srv/cgl/workspaces; then ko "t3 accepted traversal"; else grep -q "existing /srv/cgl/workspaces" "$T/err" && ok || ko "t3 traversal: $(cat "$T/err")"; fi

echo "g01 launcher: $passes passed, $fails failed"
exit $(( fails > 0 ))
