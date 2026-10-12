// P0 (G02/G04): idempotent continuation, containment and the server-side hard
// stop. In-memory fakes only; nothing talks to OpenCode or Temporal.
import { test } from "node:test";
import assert from "node:assert/strict";
import { abortMission, continueOnce, type MissionMap } from "../src/mission-ops.ts";
import { executionTimeoutSeconds, permissionSignalArgs, startArgs } from "../src/temporal-bridge.ts";

// One shared "disk" seen by every simulated adapter process (fresh reads).
function fakes(failFirstPost = false) {
  let disk: MissionMap = { "bench-001": { session_id: "ses_1", title: "t" } };
  const saved: string[] = [];
  const calls: string[] = [];
  let posts = 0;
  const oc = async (route: string) => {
    calls.push(route);
    if (route.endsWith("/prompt_async") && failFirstPost && posts++ === 0) throw new Error("socket hang up");
    return {};
  };
  const deps = {
    get: (id: string) => structuredClone(disk)[id],
    patch: (id: string, fields: any) => { disk = { ...disk, [id]: { ...disk[id], ...fields } }; saved.push(JSON.stringify(disk)); },
    oc
  };
  return { deps, disk: () => disk, saved, calls };
}

test("G02: the same continuation_id never sends a second prompt", async () => {
  const f = fakes();
  const first = await continueOnce(f.deps, { mission_id: "bench-001", prompt: "fix", continuation_id: "bench-001-repair-1" });
  const again = await continueOnce(f.deps, { mission_id: "bench-001", prompt: "fix", continuation_id: "bench-001-repair-1" });
  assert.equal(first.status, "running");
  assert.equal(again.status, "already_sent");
  assert.equal(f.calls.filter((c) => c.endsWith("/prompt_async")).length, 1);
});

test("G02: the key is persisted before the effect, so an ambiguous failure is not resent", async () => {
  const f = fakes(true);
  await assert.rejects(continueOnce(f.deps, { mission_id: "bench-001", prompt: "fix", continuation_id: "bench-001-repair-1" }));
  assert.match(f.saved.at(-1)!, /bench-001-repair-1/);
  const retry = await continueOnce(f.deps, { mission_id: "bench-001", prompt: "fix", continuation_id: "bench-001-repair-1" });
  assert.equal(retry.status, "already_sent");
  assert.equal(f.calls.filter((c) => c.endsWith("/prompt_async")).length, 1);
});

test("G04: abort is idempotent and blocks later continuations", async () => {
  const f = fakes();
  const a = await abortMission(f.deps, { mission_id: "bench-001" });
  const b = await abortMission(f.deps, { mission_id: "bench-001" });
  assert.equal(a.aborted_at, b.aborted_at);
  assert.deepEqual(f.calls, ["/session/ses_1/abort", "/session/ses_1/abort"]);
  await assert.rejects(continueOnce(f.deps, { mission_id: "bench-001", prompt: "x", continuation_id: "bench-001-repair-2" }), /aborted/);
  assert.equal((await abortMission(f.deps, { mission_id: "unknown" })).status, "not_found", "nothing to contain");
});

test("G04: start carries a server-side execution timeout capped at 20 minutes", () => {
  const config = { bin: "temporal", address: "127.0.0.1:1", namespace: "default", taskQueue: "q" };
  const contract = { missionId: "bench-001", budget: { maxDurationMs: 600_000 } };
  const args = startArgs(config, { workflowId: "bench-001", title: "t", contract });
  assert.equal(args[args.indexOf("--execution-timeout") + 1], "900s");
  assert.equal(args[args.indexOf("--id-reuse-policy") + 1], "RejectDuplicate");
  assert.equal(executionTimeoutSeconds({ budget: { maxDurationMs: 900_000 } }), 1200);
  assert.throws(() => executionTimeoutSeconds({ budget: { maxDurationMs: 16 * 60_000 } }));
  assert.throws(() => executionTimeoutSeconds({}));
});

test("M3: an abort landing between key persistence and the effect stops the prompt", async () => {
  const f = fakes();
  const realPatch = f.deps.patch;
  // Another adapter process aborts right after this one persisted its key.
  f.deps.patch = (id: string, fields: any) => { realPatch(id, fields); if (fields.continuations) realPatch(id, { aborted_at: "2026-10-11T00:00:00.000Z" }); };
  await assert.rejects(continueOnce(f.deps, { mission_id: "bench-001", prompt: "x", continuation_id: "bench-001-repair-1" }), /aborted/);
  assert.equal(f.calls.length, 0);
  assert.ok(f.disk()["bench-001"].aborted_at && f.disk()["bench-001"].continuations?.length === 1, "neither update is lost");
});

test("M6: the Director's permission decision is an exact, attributed signal", () => {
  const args = permissionSignalArgs({ workflowId: "bench-001", sessionId: "ses_1", permissionId: "per_1", patterns: ["python3 a.py"], decision: "once", by: "director" });
  assert.deepEqual(args.slice(0, 6), ["workflow", "signal", "--workflow-id", "bench-001", "--name", "generic-permission"]);
  assert.deepEqual(JSON.parse(args.at(-1)!), { mission_id: "bench-001", session_id: "ses_1", permission_id: "per_1", patterns: ["python3 a.py"], decision: "once", by: "director" });
  assert.throws(() => permissionSignalArgs({ workflowId: "bench-001", sessionId: "s", permissionId: "p", patterns: [], decision: "always" as any, by: "d" }));
  assert.throws(() => permissionSignalArgs({ workflowId: "bench-001", sessionId: "s", permissionId: "p", patterns: [], decision: "once", by: " " }));
});
