#!/usr/bin/env bash
# Reproducible tests for the M03-G2-FIX guards. Starts nothing; never writes
# outside $EXP_ROOT_DEFAULT/.sandbox/<run>/ and a mktemp dir for fake tools.
#   experimental/g2/test-guards.sh
set -uo pipefail
G2="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=exp.env
source "$G2/exp.env"

PASSED=0; FAILED=0
ok()  { echo "ok    $*"; PASSED=$((PASSED+1)); }
bad() { echo "FAIL  $*"; FAILED=$((FAILED+1)); }
# expect <rc> <label> <cmd…>: exit code must match.
expect() {
  local want="$1" label="$2"; shift 2
  local out rc; out="$("$@" 2>&1)"; rc=$?
  if [[ "$rc" == "$want" ]]; then ok "$label (rc=$rc) $(tail -n1 <<<"$out" | cut -c1-90)"
  else bad "$label: want rc=$want got rc=$rc :: $(tail -n1 <<<"$out" | cut -c1-120)"; fi
}
# expect_out <regex> <label> <cmd…>: output must match.
expect_out() {
  local re="$1" label="$2"; shift 2
  local out; out="$("$@" 2>&1)"
  if grep -qE -- "$re" <<<"$out"; then ok "$label"; else bad "$label :: $(tail -n3 <<<"$out" | tr '\n' '|' | cut -c1-200)"; fi
}
# expect_no <regex> <label> <cmd…>: output must NOT match.
expect_no() {
  local re="$1" label="$2"; shift 2
  local out; out="$("$@" 2>&1)"
  if grep -qE -- "$re" <<<"$out"; then bad "$label :: matched '$re'"; else ok "$label"; fi
}

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
SANDBOX="$EXP_ROOT_DEFAULT/.sandbox/t$$"

guard_only() { EXP_ROOT="$1" bash -c "source '$G2/lib.sh'; guard_config; echo accepted"; }

echo "== Bloqueo 1: EXP_ROOT"
expect 2 "reject \$HOME"                 guard_only "$HOME"
expect 2 "reject /"                      guard_only "/"
expect 2 "reject lab"                    guard_only "$EXP_LAB"
expect 2 "reject stable"                 guard_only "$STABLE_CHECKOUT"
expect 2 "reject inside stable"          guard_only "$STABLE_CHECKOUT/x"
expect 2 "reject relative"               guard_only "relative/dir"
expect 2 "reject '..' escape"            guard_only "$EXP_ROOT_DEFAULT/../../.."
expect 2 "reject '..' inside sandbox"    guard_only "$EXP_ROOT_DEFAULT/.sandbox/../.."
expect 2 "reject '.' segment"            guard_only "$EXP_ROOT_DEFAULT/./x"
expect 2 "reject external /tmp path"     guard_only "$TMP/root"
expect 2 "reject ~/.local/state"         guard_only "$HOME/.local/state"
expect 2 "reject sandbox dir itself"     guard_only "$EXP_ROOT_DEFAULT/.sandbox"
expect 2 "reject sibling prefix trick"   guard_only "${EXP_ROOT_DEFAULT}-evil"
(umask 077; mkdir -p "$SANDBOX")
ln -s "$HOME" "$SANDBOX/escape"
expect 2 "reject symlink escape"         guard_only "$SANDBOX/escape"
expect 2 "reject path below symlink"     guard_only "$SANDBOX/escape/sub"
expect 0 "accept dedicated default"      guard_only "$EXP_ROOT_DEFAULT"
expect 0 "accept sandbox subtree"        guard_only "$SANDBOX/root"
expect 2 "rollback refuses \$HOME"       env EXP_ALLOW_ROLLBACK=1 EXP_ROOT="$HOME" "$G2/exp-rollback.sh"
expect 2 "rollback refuses symlink"      env EXP_ALLOW_ROLLBACK=1 EXP_ROOT="$SANDBOX/escape" "$G2/exp-rollback.sh"
expect 2 "rollback needs explicit flag"  env EXP_ROOT="$SANDBOX/root" "$G2/exp-rollback.sh"
mkdir -p "$SANDBOX/root/run"
expect 0 "rollback removes sandbox root" env EXP_ALLOW_ROLLBACK=1 EXP_ROOT="$SANDBOX/root" "$G2/exp-rollback.sh"
if [[ ! -e "$SANDBOX/root" && -d "$HOME" && -L "$SANDBOX/escape" ]]; then ok "sandbox root gone; \$HOME and symlink intact"; else bad "rollback effect"; fi

echo "== Bloqueo 2: port diagnosis with simulated ss"
mk_tool() { mkdir -p "$TMP/$1"; printf '#!/bin/sh\n%s\n' "$3" >"$TMP/$1/$2"; chmod +x "$TMP/$1/$2"; }
HDR='echo "State  Recv-Q Send-Q Local Address:Port Peer Address:Port Process"'
mk_tool ssfree ss "$HDR"
mk_tool ssbusy ss "$HDR; echo \"LISTEN 0 512 127.0.0.1:4097 0.0.0.0:*\""
mk_tool sserr  ss 'echo "Cannot open netlink socket: Operation not permitted" >&2; exit 1'
mk_tool sserr0 ss 'echo "Cannot open netlink socket: Operation not permitted" >&2; exit 0'
mk_tool ssjunk ss 'echo "garbage"'
pstate() { PATH="$TMP/$1:$PATH" bash -c "source '$G2/lib.sh'; port_state 4097"; }
expect_out '^FREE$'  "ss free  → FREE"                    pstate ssfree
expect_out '^BUSY$'  "ss busy  → BUSY"                    pstate ssbusy
expect_out '^ERROR$' "ss exit 1 + stderr → ERROR"         pstate sserr
expect_out '^ERROR$' "ss exit 0 + stderr → ERROR"         pstate sserr0
expect_out '^ERROR$' "ss unrecognized output → ERROR"     pstate ssjunk
expect 2 "start blocked when port ERROR" env PATH="$TMP/sserr:$PATH"  EXP_ROOT="$SANDBOX/p" EXP_ALLOW_START=1 FREELLM_KEY=dummy-not-used "$G2/exp-opencode.sh" start
expect 2 "start blocked when port BUSY"  env PATH="$TMP/ssbusy:$PATH" EXP_ROOT="$SANDBOX/p" EXP_ALLOW_START=1 FREELLM_KEY=dummy-not-used "$G2/exp-opencode.sh" start
expect 2 "tunnel start blocked when port ERROR" env PATH="$TMP/sserr:$PATH" EXP_ROOT="$SANDBOX/p" EXP_ALLOW_START=1 EXP_TUNNEL_ID=tunnel_0123456789abcdef0123456789abcdef "$G2/exp-tunnel.sh" start
expect_out 'FAIL  port 4097 ERROR' "preflight: ss error is FAIL, not FREE"   env PATH="$TMP/sserr:$PATH" "$G2/exp-preflight.sh"
expect_out 'RESULT: FAIL'          "preflight: ss error never ends in PASS" env PATH="$TMP/sserr:$PATH" "$G2/exp-preflight.sh"
if [[ ! -e "$SANDBOX/p" ]]; then ok "blocked starts created no state"; else bad "blocked start left state in $SANDBOX/p"; fi

echo "== Bloqueo 3: stable fingerprint"
mk_tool pgnone pgrep 'exit 1'
mk_tool pgtwo  pgrep 'echo 1111; echo 2222; exit 0'
mk_tool pgerr  pgrep 'echo "pgrep: error" >&2; exit 3'
mk_tool pgothr pgrep "echo $$; exit 0"   # a live pid that is NOT the stable OpenCode
FP="$G2/exp-preflight.sh"
expect_out 'STABLE_PROCESS_NOT_FOUND'       "empty pid → PROCESS_NOT_FOUND"       env PATH="$TMP/pgnone:$PATH" "$FP"
expect_no  'initrd|BOOT_IMAGE|WSL_ROOT_INIT' "empty pid → /proc/cmdline NOT read"   env PATH="$TMP/pgnone:$PATH" "$FP"
expect_no  'STABLE_DISCREPANCY|STABLE_PROCESS_CHANGED' "empty pid → no fake discrepancy" env PATH="$TMP/pgnone:$PATH" "$FP"
expect_out 'STABLE_PROCESS_AMBIGUOUS'       "two pids → AMBIGUOUS"                env PATH="$TMP/pgtwo:$PATH" "$FP"
expect_out 'DIAGNOSTIC_ERROR: pgrep failed' "pgrep error → DIAGNOSTIC_ERROR"      env PATH="$TMP/pgerr:$PATH" "$FP"
expect_out 'STABLE_PROCESS_CHANGED'         "other live process → PROCESS_CHANGED" env PATH="$TMP/pgothr:$PATH" "$FP"
expect_out 'BASELINE_MISSING'               "no baseline → BASELINE_MISSING"      env EXP_ROOT="$SANDBOX/nobase" "$FP"
(umask 077; mkdir -p "$SANDBOX/fake"; printf 'stable_head=0000000000000000000000000000000000000000\n' >"$SANDBOX/fake/stable-baseline.txt")
expect_out 'STABLE_DISCREPANCY \(integrity\): stable_head' "real field change → STABLE_DISCREPANCY" env EXP_ROOT="$SANDBOX/fake" "$FP"
B="$EXP_ROOT_DEFAULT/stable-baseline.txt"; H0="$(sha256sum "$B" 2>/dev/null)"
expect_out 'baseline already exists; not overwritten'     "--baseline never overwrites"         "$FP" --baseline
expect_out 'requires EXP_ALLOW_REBASELINE=1'              "--rebaseline needs authorization"   "$FP" --rebaseline
expect_out 'baseline NOT written: fingerprint incomplete' "no baseline from a broken diagnosis" env PATH="$TMP/pgnone:$PATH" EXP_ROOT="$SANDBOX/nb2" "$FP" --baseline
if [[ "$(sha256sum "$B" 2>/dev/null)" == "$H0" ]]; then ok "real stable-baseline.txt unchanged"; else bad "real baseline changed"; fi

rm -rf -- "$SANDBOX"
rmdir "$EXP_ROOT_DEFAULT/.sandbox" 2>/dev/null || true
echo "RESULT: $PASSED passed, $FAILED failed"
[[ $FAILED == 0 ]]
