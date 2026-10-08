#!/usr/bin/env bash
# Static, read-only verification of the experimental setup + stable fingerprint.
#   exp-preflight.sh               checks; compares the stable fingerprint with the baseline
#   exp-preflight.sh --baseline    creates the baseline ONLY if none exists
#   EXP_ALLOW_REBASELINE=1 exp-preflight.sh --rebaseline
#                                  replaces it (Director-authorized only; previous kept as .prev)
# Starts nothing. Network: one GET /session/status to the stable OpenCode. Prints no secrets.
set -uo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

FAIL=0
pass() { echo "PASS  $*"; }
fail() { echo "FAIL  $*"; FAIL=1; }
warn() { echo "WARN  $*"; }

if ( guard_config ); then pass "EXP_ROOT dedicated; paths isolated from stable; ports differ from stable"; else fail "guard_config"; fi

for f in "$EXP_G2_DIR"/exp-*.sh "$EXP_G2_DIR"/lib.sh; do
  if bash -n "$f"; then pass "syntax $(basename "$f")"; else fail "syntax $(basename "$f")"; fi
done
for f in "$EXP_G2_DIR"/exp-*.sh; do
  if [[ -x "$f" ]]; then pass "executable $(basename "$f")"; else fail "not executable $(basename "$f")"; fi
done

for port in "$EXP_OPENCODE_PORT" "${EXP_TUNNEL_HEALTH##*:}"; do
  case "$(port_state "$port")" in
    FREE) pass "port $port FREE" ;;
    BUSY) fail "port $port BUSY" ;;
    *)    fail "port $port ERROR: port diagnosis unavailable (ss failed); cannot assume FREE" ;;
  esac
done

if grep -qF "$STABLE_TUNNEL_ID" "$EXP_G2_DIR/tunnel-profile.template.yaml"; then
  fail "template references the stable tunnel"
else
  pass "template does not reference the stable tunnel"
fi
# shellcheck disable=SC2016
if grep -qF 'EXP_EVENTS_EMITTER="${EXP_EVENTS_EMITTER:-off}"' "$EXP_G2_DIR/exp.env"; then
  pass "emitter OFF by default"
else
  fail "emitter default is not off"
fi
if [[ -f "$EXP_CONTROL_PLANE_KEY_FILE" && "$(stat -c %a "$EXP_CONTROL_PLANE_KEY_FILE")" == "600" ]]; then
  pass "control-plane key file exists, mode 600 (referenced by path, not read)"
else
  fail "control-plane key file missing or not 600"
fi

# Secret scan of the versioned experimental files (patterns only, nothing printed).
if grep -rEqi '(sk-[A-Za-z0-9_-]{16,}|whsec_[A-Za-z0-9+/=]{16,}|BEGIN [A-Z ]*PRIVATE KEY|api_key:[[:space:]]*"[^f_][^"]+")' "$EXP_G2_DIR"; then
  fail "secret-like content in $EXP_G2_DIR"
else
  pass "no secret-like content in experimental files"
fi

if [[ -d "$EXP_ROOT" ]]; then
  if [[ "$(stat -c %a "$EXP_ROOT")" == "700" ]]; then pass "EXP_ROOT mode 700"; else fail "EXP_ROOT not 700"; fi
else
  pass "EXP_ROOT not created yet"
fi
for f in "$EXP_RUN/opencode.pid" "$EXP_RUN/tunnel-client.pid"; do
  if [[ -f "$f" ]]; then warn "$(basename "$f") present: experimental process may be running"; fi
done

# ---------------- stable fingerprint ----------------
# Fields: integrity (must not change), process identity, runtime activity.
# Diagnostic failures are reported as such, never as values.
STABLE_CMD="opencode serve --hostname 127.0.0.1 --port $STABLE_OPENCODE_PORT"
DIAG=()

stable_pid() {
  local pids rc
  pids="$(pgrep -x -f -- "$STABLE_CMD")"; rc=$?
  case $rc in
    0) if [[ "$(wc -l <<<"$pids")" -eq 1 && "$pids" =~ ^[1-9][0-9]*$ ]]; then echo "$pids"; else echo "AMBIGUOUS"; fi ;;
    1) echo "NOT_FOUND" ;;
    *) echo "ERROR" ;;
  esac
}

fingerprint() {
  local pid cmd cwd status
  echo "stable_head=$(git -C "$STABLE_CHECKOUT" rev-parse HEAD 2>/dev/null || echo ERROR)"
  if status="$(git -C "$STABLE_CHECKOUT" status --porcelain 2>/dev/null)"; then
    echo "stable_status_sha=$(sha256sum <<<"$status" | cut -c1-16)"
  else
    echo "stable_status_sha=ERROR"
  fi
  echo "stable_subscriptions_mtime=$(stat -c %Y "$STABLE_CHECKOUT/mcp-opencode-adapter/.subscriptions.json" 2>/dev/null || echo ABSENT)"
  echo "stable_mission_map_mtime=$(stat -c %Y "$STABLE_CHECKOUT/mcp-opencode-adapter/.mission-map.json" 2>/dev/null || echo ABSENT)"
  if [[ -r "$HOME/.config/tunnel-client/opencode-adapter.yaml" ]]; then
    echo "stable_profile_sha=$(sha256sum "$HOME/.config/tunnel-client/opencode-adapter.yaml" | cut -c1-16)"
  else
    echo "stable_profile_sha=ERROR"
  fi
  pid="$(stable_pid)"
  echo "stable_opencode_pid=$pid"
  if cmd="$(proc_cmdline "$pid")"; then
    echo "stable_opencode_cmd=$cmd"
    cwd="$(readlink "/proc/$pid/cwd" 2>/dev/null)" || cwd="ERROR"
    echo "stable_opencode_cwd=$cwd"
  else
    echo "stable_opencode_cmd=UNAVAILABLE"
    echo "stable_opencode_cwd=UNAVAILABLE"
  fi
  if status="$(curl -sf -m 5 "http://127.0.0.1:$STABLE_OPENCODE_PORT/session/status")"; then
    echo "stable_session_status_sha=$(printf '%s' "$status" | sha256sum | cut -c1-16)" # raw body, as in the baseline
  else
    echo "stable_session_status_sha=UNAVAILABLE"
  fi
}

field() { grep -m1 "^$1=" <<<"$2" | cut -d= -f2-; }

CURRENT="$(fingerprint)"
for k in stable_head stable_status_sha stable_profile_sha; do
  [[ "$(field "$k" "$CURRENT")" == ERROR ]] && DIAG+=("$k unreadable")
done
case "$(field stable_opencode_pid "$CURRENT")" in
  NOT_FOUND) fail "STABLE_PROCESS_NOT_FOUND: no process '$STABLE_CMD'" ;;
  AMBIGUOUS) fail "STABLE_PROCESS_AMBIGUOUS: more than one '$STABLE_CMD'" ;;
  ERROR)     DIAG+=("pgrep failed") ;;
esac
[[ "$(field stable_session_status_sha "$CURRENT")" == UNAVAILABLE ]] && DIAG+=("stable /session/status unreachable")
for d in "${DIAG[@]}"; do fail "DIAGNOSTIC_ERROR: $d"; done

BASELINE="$EXP_ROOT/stable-baseline.txt"
write_baseline() {
  if (( ${#DIAG[@]} > 0 )) || ! [[ "$(field stable_opencode_pid "$CURRENT")" =~ ^[0-9]+$ ]]; then
    fail "baseline NOT written: fingerprint incomplete"; return
  fi
  ensure_dirs
  (umask 077; echo "$CURRENT" >"$BASELINE.tmp" && mv "$BASELINE.tmp" "$BASELINE")
  pass "stable baseline written: $BASELINE"
}
case "${1:-}" in
  --baseline)
    if [[ -f "$BASELINE" ]]; then
      fail "baseline already exists; not overwritten (use --rebaseline with Director authorization)"
    else
      write_baseline
    fi ;;
  --rebaseline)
    if [[ "${EXP_ALLOW_REBASELINE:-}" == "1" ]]; then
      [[ -f "$BASELINE" ]] && cp -p "$BASELINE" "$BASELINE.prev"
      write_baseline
    else
      fail "--rebaseline requires EXP_ALLOW_REBASELINE=1 (Director authorization)"
    fi ;;
  "") ;;
  *) fail "unknown option $1" ;;
esac

if [[ ! -f "$BASELINE" ]]; then
  fail "BASELINE_MISSING: run --baseline once (creates only if absent)"
else
  BASE="$(cat "$BASELINE")"
  changed_integrity=(); changed_process=(); changed_runtime=()
  for k in stable_head stable_status_sha stable_subscriptions_mtime stable_mission_map_mtime stable_profile_sha; do
    [[ "$(field "$k" "$CURRENT")" == "$(field "$k" "$BASE")" ]] || changed_integrity+=("$k")
  done
  for k in stable_opencode_pid stable_opencode_cmd stable_opencode_cwd; do
    [[ "$(field "$k" "$CURRENT")" == "$(field "$k" "$BASE")" ]] || changed_process+=("$k")
  done
  [[ "$(field stable_session_status_sha "$CURRENT")" == "$(field stable_session_status_sha "$BASE")" ]] \
    || changed_runtime+=("stable_session_status_sha")

  if (( ${#DIAG[@]} > 0 )); then
    fail "fingerprint comparison skipped: diagnostic errors above (not a stable discrepancy)"
  else
    if (( ${#changed_integrity[@]} )); then
      fail "STABLE_DISCREPANCY (integrity): ${changed_integrity[*]}"
      for k in "${changed_integrity[@]}"; do
        echo "      $k: baseline=$(field "$k" "$BASE") current=$(field "$k" "$CURRENT")"
      done
    fi
    # Process identity is only comparable when a single stable pid was found
    # (NOT_FOUND / AMBIGUOUS are already reported above, not as a "change").
    if ! [[ "$(field stable_opencode_pid "$CURRENT")" =~ ^[0-9]+$ ]]; then changed_process=(); fi
    if (( ${#changed_process[@]} )); then
      fail "STABLE_PROCESS_CHANGED: ${changed_process[*]} (baseline pid $(field stable_opencode_pid "$BASE"), current $(field stable_opencode_pid "$CURRENT"))"
    fi
    if (( ${#changed_runtime[@]} )); then
      warn "STABLE_RUNTIME_ACTIVITY: session status differs from baseline (stable's own work; this tooling never writes to it)"
    fi
    if (( ${#changed_integrity[@]} + ${#changed_process[@]} == 0 )); then
      pass "stable fingerprint: integrity and process identity unchanged vs baseline"
    fi
  fi
fi

if [[ $FAIL == 0 ]]; then echo "RESULT: PASS"; else echo "RESULT: FAIL"; fi
exit $FAIL
