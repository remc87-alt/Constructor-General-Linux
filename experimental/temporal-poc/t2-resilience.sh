#!/usr/bin/env bash
# T2 resilience sequence (no LLM, no OpenCode). Evidence to $POC_LOGS/t2-evidence.log.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HERE/poc.env"
T=(timeout 20 "$TEMPORAL_BIN" --address "$TEMPORAL_IP:$TEMPORAL_PORT")
CTL="$HERE/ctl.sh"
EV="$POC_LOGS/t2-evidence.log"
RUN="${1:-001}"; WF="poc-t2-resilience-$RUN"; OP="op-t2-resilience-$RUN"
log() { echo "[$(date +%T)] $*" | tee -a "$EV"; }
state() { # phase + transitions via Query (needs a worker)
  "${T[@]}" workflow query --workflow-id "$1" --name state -o json 2>/dev/null | python3 -c '
import json,sys; d=json.load(sys.stdin); r=d["queryResult"][0]
print(r["phase"], "|", ",".join(t["phase"] for t in r["transitions"]))' 2>/dev/null || echo "QUERY_UNAVAILABLE"; }
describe() { "${T[@]}" workflow describe --workflow-id "$1" -o json 2>/dev/null | python3 -c '
import json,sys; d=json.load(sys.stdin); i=d["workflowExecutionInfo"]
print(i["execution"]["workflowId"], i["execution"]["runId"], i["status"], "historyLength="+str(i["historyLength"]))'; }
wait_phase() { for _ in $(seq 1 "${3:-60}"); do [[ "$(state "$1")" == "$2"* ]] && return 0; sleep 1; done; return 1; }

EV="$POC_LOGS/t2-evidence-$RUN.log"; : >"$EV"
log "== T2.3/T2.4 start $WF (failAfterEffectAttempts=2, hangOnFirstAttempt=true)"
"${T[@]}" workflow start --type constructorPocWorkflow --task-queue "$POC_TASK_QUEUE" --workflow-id "$WF" \
  --input "{\"opKey\":\"$OP\",\"payload\":\"t2\",\"failAfterEffectAttempts\":2,\"hangOnFirstAttempt\":true}" >/dev/null
if wait_phase "$WF" awaiting_approval 90; then log "reached: $(state "$WF")"; else log "FAIL: did not reach awaiting_approval: $(state "$WF")"; exit 1; fi
log "effects ledger files: $(ls "$POC_EFFECTS_DIR" | grep "^$OP" | tr '\n' ' ')"
log "attempt log:"; sed 's/^/    /' "$POC_EFFECTS_DIR/$OP.attempts.log" | tee -a "$EV"
log "describe: $(describe "$WF")"

log "== T2.1 worker crash (SIGKILL) while workflow waits"
"$CTL" worker kill >>"$EV" 2>&1; tail -1 "$EV"
log "query with worker down: $(state "$WF")"
log "describe with worker down: $(describe "$WF")"
"$CTL" worker start >>"$EV" 2>&1; tail -1 "$EV"
log "after worker restart: $(state "$WF")"

log "== T2.2 server crash (SIGKILL) + worker stop; restart server on same SQLite"
"$CTL" worker kill >>"$EV" 2>&1; tail -1 "$EV"
"$CTL" server kill >>"$EV" 2>&1; tail -1 "$EV"
sleep 1
"$CTL" server start >>"$EV" 2>&1; tail -1 "$EV"
log "describe after server restart: $(describe "$WF")"
log "describe T1 run after server restart: $(describe poc-t1-basic-001)"
log "describe failed-attempt run 001 after server restart: $(describe poc-t2-resilience-001)"

log "== T2.5 approval Signal sent while the worker is DOWN"
"${T[@]}" workflow signal --workflow-id "$WF" --name approve --input '{"by":"director-poc","decision":"approve"}' 2>&1 | tail -1 | tee -a "$EV"
log "describe (signal durable, worker down): $(describe "$WF")"
"$CTL" worker start >>"$EV" 2>&1; tail -1 "$EV"
for _ in $(seq 1 30); do describe "$WF" | grep -q COMPLETED && break; sleep 1; done
log "final describe: $(describe "$WF")"
"${T[@]}" workflow result --workflow-id "$WF" -o json 2>/dev/null | python3 -c '
import json,sys; d=json.load(sys.stdin); r=d.get("result",d)
print("result phase:", r["phase"]); print("transitions:", [t["phase"] for t in r["transitions"]])
print("effect.duplicateSuppressed:", r["effect"]["duplicateSuppressed"], "returnedOnAttempt:", r["effect"]["returnedOnAttempt"], "appliedOnAttempt:", r["effect"]["attempt"])
print("watched.attempt:", r["watched"]["attempt"]); print("final:", {k:r["final"][k] for k in ("decision","by","duplicateSuppressed")})' | tee -a "$EV"
log "effect files for $OP: $(ls "$POC_EFFECTS_DIR" | grep -c "^$OP.json$") effect, $(ls "$POC_EFFECTS_DIR" | grep -c "^$OP.final.json$") final"

log "== T2.6 history"
"${T[@]}" workflow show --workflow-id "$WF" -o json 2>/dev/null | python3 -c '
import json,sys,collections; d=json.load(sys.stdin); ev=d.get("events",d)
print("events:", len(ev))
print("types:", dict(collections.Counter(e["eventType"].replace("EVENT_TYPE_","") for e in ev)))
for e in ev:
    t=e["eventType"].replace("EVENT_TYPE_","")
    if any(k in t for k in ("FAILED","TIMED_OUT","SIGNAL","COMPLETED","STARTED")) and "TASK" not in t:
        print(f"  #{e[\"eventId\"]} {t}")' | tee -a "$EV"
log "T2 sequence done"
