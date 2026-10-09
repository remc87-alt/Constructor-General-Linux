import assert from "node:assert/strict";
import test from "node:test";
import { monitorFailureDecision, reconcileMissionStart, readMissionSnapshot, type McpCall } from "../src/mission-activities.ts";
import { validationAccepted } from "../src/workflows.ts";

const input = { missionId: "t6-unit-mission", title: "unit", prompt: "unit" };

function externalMission(sessionId = "ses_t6_unit") {
  let starts = 0;
  let completed = false;
  const calls: string[] = [];
  const call: McpCall = async (name, args) => {
    calls.push(name);
    assert.equal(args.mission_id, input.missionId);
    if (name === "start_mission") {
      starts++;
      if (starts === 1) return { isError: false, data: { session_id: sessionId } };
      return { isError: true, data: { error: "mission already exists" } };
    }
    if (name === "get_mission") return { isError: false, data: { session_id: sessionId, status: completed ? "idle" : "running" } };
    throw new Error(`unexpected ${name}`);
  };
  return { call, calls, starts: () => starts, complete: () => { completed = true; } };
}

test("A: first start creates one external mission", async () => {
  const ext = externalMission();
  const result = await reconcileMissionStart(ext.call, input);
  assert.deepEqual(result, { sessionId: "ses_t6_unit", alreadyExisted: false });
  assert.equal(ext.starts(), 1);
});

test("B/D: lost response retry reconciles the running mission without a second session", async () => {
  const ext = externalMission();
  await reconcileMissionStart(ext.call, input); // external effect happened; caller loses this result
  const recovered = await reconcileMissionStart(ext.call, input);
  assert.deepEqual(recovered, { sessionId: "ses_t6_unit", alreadyExisted: true });
  assert.equal(ext.starts(), 2, "one initial request plus one rejected duplicate request");
  assert.deepEqual(ext.calls, ["start_mission", "start_mission", "get_mission"]);
});

test("C: retry after external completion still reconciles the original session", async () => {
  const ext = externalMission();
  await reconcileMissionStart(ext.call, input);
  ext.complete();
  const recovered = await reconcileMissionStart(ext.call, input, "ses_t6_unit");
  assert.equal(recovered.sessionId, "ses_t6_unit");
  assert.equal(recovered.alreadyExisted, true);
});

test("F: reconciliation rejects a different session identity", async () => {
  const call: McpCall = async (name) => name === "start_mission"
    ? { isError: true, data: { error: "mission already exists" } }
    : { isError: false, data: { session_id: "ses_other" } };
  await assert.rejects(() => reconcileMissionStart(call, input, "ses_t6_unit"), /session_id mismatch/);
});

test("G: blocked state is observed by reconciliation, not converted into a new start", async () => {
  const ext = externalMission();
  await reconcileMissionStart(ext.call, input);
  const recovered = await reconcileMissionStart(ext.call, input);
  assert.equal(recovered.alreadyExisted, true);
  assert.equal(ext.starts(), 2);
});

test("E: incomplete or semantically invalid output is not accepted as recovery success", () => {
  assert.equal(validationAccepted({ ok: false, errors: ["resultado.json not in workspace"], variant: null }), false);
  assert.equal(validationAccepted({ ok: true, errors: [], variant: { ok: false, errors: ["tarea missing"] } }), false);
});

test("start reconciliation returns immediately after acceptance; waiting reads only the existing mission", async () => {
  const ext = externalMission();
  const accepted = await reconcileMissionStart(ext.call, input);
  const snapshot = await readMissionSnapshot(ext.call, input.missionId);
  assert.equal(accepted.sessionId, snapshot.sessionId);
  assert.equal(snapshot.status, "running");
  assert.deepEqual(ext.calls, ["start_mission", "get_mission"]);
});

test("English top-level JSON keys fail the canonical output contract", () => {
  assert.equal(validationAccepted({ ok: false, errors: ['canonical keys=["agreements","participants","tasks"]'], variant: { ok: true, errors: [] } }), false);
});

test("Canonical JSON shape can pass before semantic checks", () => {
  assert.equal(validationAccepted({ ok: true, errors: [], variant: { ok: true, errors: [] } }), true);
});

test("transient adapter loss stays inside the bounded wait budget", () => {
  assert.equal(monitorFailureDecision(new Error("adapter exited (1) before answering get_mission"), 30_000, 900_000), "retry");
  assert.equal(monitorFailureDecision(new Error("ECONNREFUSED 127.0.0.1:4098"), 900_000, 900_000), "timeout");
});

test("definitive mission lookup errors do not loop as transport recovery", () => {
  assert.equal(monitorFailureDecision(new Error("get_mission: unknown mission_id"), 1_000, 900_000), "terminal");
});
