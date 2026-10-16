// P0/P1 integration: the REAL genericConstructorMissionWorkflow against an
// EPHEMERAL Temporal dev server (CGL_TEMPORAL_TEST_ADDRESS, in-memory, never
// the POC server on 7243) with fake activities. No OpenCode, oracle or model.
import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { ApplicationFailure } from "@temporalio/common";
import { Client, Connection, WorkflowExecutionAlreadyStartedError } from "@temporalio/client";
import { NativeConnection, Worker } from "@temporalio/worker";

const ADDRESS = process.env.CGL_TEMPORAL_TEST_ADDRESS;
const SKIP = ADDRESS ? (ADDRESS.endsWith(":7243") ? "refusing to use the POC server" : false) : "set CGL_TEMPORAL_TEST_ADDRESS to an ephemeral dev server";
const WORKFLOWS = fileURLToPath(new URL("../src/workflows.ts", import.meta.url));

type Calls = Record<string, any[]>;
function contract(missionId: string, maxDurationMs = 120_000, maxRepairAttempts = 1) {
  return { missionId, workspace: `/tmp/${missionId}`, instructions: "build", validation: { kind: "external-oracle", oracleId: "expense-oracle-001", requiredArtifacts: ["a.py"] },
    budget: { maxRepairAttempts, maxDurationMs, maxTokens: null }, artifactPaths: ["a.py"] };
}

// Fake activities record every call; behaviour is scripted per scenario.
function fakeActivities(script: { wait?: any[]; validate?: any[]; continueFailsOnce?: boolean; waitGate?: Promise<void>; startFails?: boolean; abortFails?: boolean }, calls: Calls) {
  const rec = (name: string, input: any) => { (calls[name] ??= []).push(input); };
  const sent = new Set<string>();
  let continueFailed = false;
  return {
    async prepareGenericMission(input: any) { rec("prepare", input); return input.contract; },
    async verifyOpenCodeWorkspace(input: any) { rec("verify", input); return { pid: "1", cwd: input.workspace }; },
    async startMission(input: any) {
      rec("start", input);
      // Ambiguous start: the adapter may have created the session before failing.
      if (script.startFails) throw ApplicationFailure.nonRetryable("start_mission timed out", "AmbiguousStart");
      return { sessionId: "ses_fake", alreadyExisted: false };
    },
    async waitMission(input: any) {
      rec("wait", input);
      if (script.waitGate) await script.waitGate;
      return script.wait?.shift() ?? { kind: "idle", text: "done", polls: 1, sessionId: "ses_fake" };
    },
    async replyPermission(input: any) { rec("reply", input); return { replied: true }; },
    async validateGenericMission(input: any) {
      rec("validate", input);
      const next = script.validate?.shift() ?? { ok: true, status: "passed", diagnostics: [], artifactPaths: [] };
      if (next instanceof Error) throw next;
      return next;
    },
    async continueMission(input: any) {
      rec("continue", input);
      // Mirrors the adapter: the key is recorded before the effect.
      const duplicate = sent.has(input.continuationId);
      sent.add(input.continuationId);
      if (!duplicate) rec("prompt_sent", input.continuationId);
      if (script.continueFailsOnce && !continueFailed) { continueFailed = true; throw new Error("socket hang up"); }
      return { continued: true, alreadySent: duplicate };
    },
    async abortMission(input: any) {
      rec("abort", input);
      if (script.abortFails) throw ApplicationFailure.nonRetryable("adapter unavailable", "AbortUnavailable");
      return { aborted: true };
    }
  };
}

async function harness(script: Parameters<typeof fakeActivities>[0], calls: Calls) {
  const taskQueue = `cgl-it-${Math.random().toString(36).slice(2, 10)}`;
  const connection = await NativeConnection.connect({ address: ADDRESS! });
  const worker = await Worker.create({ connection, namespace: "default", taskQueue, workflowsPath: WORKFLOWS, activities: fakeActivities(script, calls) });
  const client = new Client({ connection: await Connection.connect({ address: ADDRESS! }), namespace: "default" });
  return { worker, client, taskQueue, connection };
}

const run = async (h: Awaited<ReturnType<typeof harness>>, workflowId: string, c: unknown) =>
  h.worker.runUntil(h.client.workflow.execute("genericConstructorMissionWorkflow", { taskQueue: h.taskQueue, workflowId, args: [{ contract: c, title: "t" }] }));

test("passes after one repair; a retried repair sends exactly one prompt; no abort", { skip: SKIP }, async () => {
  const calls: Calls = {};
  const h = await harness({ validate: [{ ok: false, status: "failed", diagnostics: [{ code: "FUNCTIONAL_FAILURE", summary: "x", artifactPaths: [] }], artifactPaths: [] }], continueFailsOnce: true }, calls);
  const id = `it-repair-${Date.now()}`;
  const s: any = await run(h, id, contract(id));
  assert.equal(s.functional_status, "passed");
  assert.equal(calls.start.length, 1);
  assert.equal(calls.continue.length, 2, "the repair Activity was retried");
  assert.deepEqual(calls.prompt_sent, [`${id}-repair-1`], "but only one prompt was sent");
  assert.equal(calls.continue[0].continuationId, calls.continue[1].continuationId);
  assert.equal(calls.abort, undefined);
  const deadlines = new Set([...calls.start, ...calls.wait, ...calls.validate, ...calls.continue].map((x) => x.deadlineAt));
  assert.equal(deadlines.size, 1, "every Activity receives the same absolute deadline");
  await h.connection.close();
});

test("budget exhaustion inside an Activity ends blocked and aborts the session", { skip: SKIP }, async () => {
  const calls: Calls = {};
  const h = await harness({ validate: [ApplicationFailure.nonRetryable("mission budget exhausted", "BudgetExhausted")] }, calls);
  const id = `it-budget-${Date.now()}`;
  const s: any = await run(h, id, contract(id));
  assert.equal(s.functional_status, "blocked");
  assert.equal(s.budget_exhausted, true);
  assert.ok(s.transitions.some((t: any) => t.phase === "session_aborted"));
  assert.equal(calls.abort.length, 1);
  assert.equal(calls.continue, undefined, "no repair after the budget is gone");
  assert.equal(s.temporal_status, "completed");
  await h.connection.close();
});

test("identity mismatch performs no external effect", { skip: SKIP }, async () => {
  const calls: Calls = {};
  const h = await harness({}, calls);
  const id = `it-identity-${Date.now()}`;
  const s: any = await run(h, `${id}-other`, contract(id));
  assert.equal(s.phase, "identity_mismatch");
  assert.equal(calls.start, undefined);
  assert.equal(calls.abort, undefined);
  await h.connection.close();
});

test("permission blocks until an exact human decision; forged signals are ignored", { skip: SKIP }, async () => {
  const calls: Calls = {};
  const permission = { permission_id: "per_1", permission: "bash", patterns: ["python3 a.py"] };
  const h = await harness({ wait: [{ kind: "permission", permission, polls: 1, sessionId: "ses_fake" }] }, calls);
  const id = `it-permission-${Date.now()}`;
  const done = h.worker.runUntil(async () => {
    const handle = await h.client.workflow.start("genericConstructorMissionWorkflow", { taskQueue: h.taskQueue, workflowId: id, args: [{ contract: contract(id), title: "t" }] });
    let q: any;
    for (let i = 0; i < 100; i++) { q = await handle.query("generic-mission"); if (q.phase === "permission_pending") break; await new Promise((r) => setTimeout(r, 100)); }
    assert.equal(q.next_action, "decide_permission");
    assert.equal(q.pending_permission.risk, "sensitive");
    const base = { mission_id: id, session_id: "ses_fake", permission_id: "per_1", patterns: permission.patterns, by: "director" };
    await handle.signal("generic-permission", { ...base, session_id: "ses_other", decision: "once" });
    await handle.signal("generic-permission", { ...base, patterns: ["/**"], decision: "once" });
    await new Promise((r) => setTimeout(r, 500));
    assert.equal((await handle.query("generic-mission") as any).phase, "permission_pending", "forged decisions do not unblock");
    assert.equal(calls.reply, undefined);
    await handle.signal("generic-permission", { ...base, decision: "once" });
    return await handle.result();
  });
  const s: any = await done;
  assert.equal(s.functional_status, "passed");
  assert.equal(calls.reply.length, 1);
  assert.equal(calls.reply[0].decision, "once");
  assert.deepEqual(s.permissions_handled, ["per_1"]);
  assert.equal(s.pending_permission, null);
  assert.equal(s.permission_status, "none");
  assert.equal(calls.abort, undefined, "an approved, validated mission is not aborted");
  await h.connection.close();
});

test("a duplicate start of the same mission id is rejected", { skip: SKIP }, async () => {
  const calls: Calls = {};
  const h = await harness({}, calls);
  const id = `it-dup-${Date.now()}`;
  await run(h, id, contract(id));
  await assert.rejects(
    h.client.workflow.start("genericConstructorMissionWorkflow", { taskQueue: h.taskQueue, workflowId: id, workflowIdReusePolicy: "REJECT_DUPLICATE", args: [{ contract: contract(id), title: "t" }] }),
    WorkflowExecutionAlreadyStartedError
  );
  assert.equal(calls.start.length, 1);
  await h.connection.close();
});

test("worker loss mid-mission resumes on a new worker without a second session", { skip: SKIP }, async () => {
  const calls: Calls = {};
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  const first = await harness({ waitGate: gate }, calls);
  const id = `it-recovery-${Date.now()}`;
  const handle = await first.client.workflow.start("genericConstructorMissionWorkflow", { taskQueue: first.taskQueue, workflowId: id, args: [{ contract: contract(id), title: "t" }] });
  const running = first.worker.run();
  for (let i = 0; i < 100 && !calls.wait; i++) await new Promise((r) => setTimeout(r, 100));
  assert.equal(calls.start.length, 1);
  first.worker.shutdown();
  release();
  await running.catch(() => undefined);
  // A fresh worker on the same queue picks the mission up from durable history.
  const second = await Worker.create({ connection: first.connection, namespace: "default", taskQueue: first.taskQueue, workflowsPath: WORKFLOWS, activities: fakeActivities({}, calls) });
  const s: any = await second.runUntil(handle.result());
  assert.equal(s.functional_status, "passed");
  assert.equal(calls.start.length, 1, "no second start_mission / session");
  assert.equal(s.attempts.starts, 1);
  await first.connection.close();
});

const permissionWait = (id = "per_1") => ({ kind: "permission", permission: { permission_id: id, permission: "bash", patterns: ["python3 a.py"] }, polls: 1, sessionId: "ses_fake" });

test("an unanswered permission ends blocked at the deadline, aborts, never replies", { skip: SKIP }, async () => {
  const calls: Calls = {};
  const h = await harness({ wait: [permissionWait()] }, calls);
  const id = `it-permtimeout-${Date.now()}`;
  const s: any = await run(h, id, contract(id, 30_000));
  assert.ok(s.transitions.some((t: any) => t.phase === "permission_timeout"));
  assert.equal(s.functional_status, "blocked");
  assert.equal(calls.reply, undefined);
  assert.equal(calls.abort.length, 1);
  assert.equal(s.pending_permission, null);
  assert.equal(s.permission_status, "none");
  assert.equal(calls.validate, undefined, "an unanswered permission cannot reach validation");
  const history = await h.client.workflow.getHandle(id).fetchHistory();
  const patch = history.events?.find((e) => e.markerRecordedEventAttributes?.markerName === "core_patch");
  assert.ok(patch, "new executions record the containment patch marker");
  await Worker.runReplayHistory({ workflowsPath: WORKFLOWS }, history, id);
  await h.connection.close();
});

test("a rejected permission is replied once, then the mission stops and is aborted", { skip: SKIP }, async () => {
  const calls: Calls = {};
  const h = await harness({ wait: [permissionWait()] }, calls);
  const id = `it-reject-${Date.now()}`;
  const s: any = await h.worker.runUntil(async () => {
    const handle = await h.client.workflow.start("genericConstructorMissionWorkflow", { taskQueue: h.taskQueue, workflowId: id, args: [{ contract: contract(id), title: "t" }] });
    for (let i = 0; i < 100; i++) { if ((await handle.query("generic-mission") as any).phase === "permission_pending") break; await new Promise((r) => setTimeout(r, 100)); }
    await handle.signal("generic-permission", { mission_id: id, session_id: "ses_fake", permission_id: "per_1", patterns: ["python3 a.py"], decision: "reject", by: "director" });
    return await handle.result();
  });
  assert.deepEqual(calls.reply.map((r: any) => r.decision), ["reject"]);
  assert.equal(s.functional_status, "blocked");
  assert.equal(calls.abort.length, 1);
  assert.equal(calls.validate, undefined);
  assert.equal(s.pending_permission, null);
  assert.equal(s.permission_status, "none");
  await h.connection.close();
});

test("an ambiguous start is still contained by mission id", { skip: SKIP }, async () => {
  const calls: Calls = {};
  const h = await harness({ startFails: true }, calls);
  const id = `it-ambiguous-${Date.now()}`;
  const s: any = await run(h, id, contract(id));
  assert.equal(s.session_id, null);
  assert.equal(s.phase, "session_aborted");
  assert.equal(s.last_error, "AmbiguousStart");
  assert.equal(calls.abort.length, 1);
  await h.connection.close();
});

test("a failed abort is recorded and the mission still ends blocked (not failed)", { skip: SKIP }, async () => {
  const calls: Calls = {};
  const h = await harness({ validate: [ApplicationFailure.nonRetryable("mission budget exhausted", "BudgetExhausted")], abortFails: true }, calls);
  const id = `it-abortfail-${Date.now()}`;
  const s: any = await run(h, id, contract(id));
  assert.equal(s.functional_status, "blocked");
  assert.equal(s.phase, "session_abort_failed");
  assert.equal(s.temporal_status, "completed");
  assert.equal(s.pending_permission, null);
  assert.equal(s.permission_status, "none");
  await h.connection.close();
});

test("cancelling the workflow still aborts the session and stays cancelled", { skip: SKIP }, async () => {
  const calls: Calls = {};
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  const h = await harness({ waitGate: gate }, calls);
  const id = `it-cancel-${Date.now()}`;
  await h.worker.runUntil(async () => {
    const handle = await h.client.workflow.start("genericConstructorMissionWorkflow", { taskQueue: h.taskQueue, workflowId: id, args: [{ contract: contract(id), title: "t" }] });
    for (let i = 0; i < 100 && !calls.wait; i++) await new Promise((r) => setTimeout(r, 100));
    await handle.cancel();
    release();
    await assert.rejects(handle.result(), /cancel/i);
    const d = await handle.describe();
    assert.equal(d.status.name, "CANCELLED");
  });
  assert.equal(calls.abort.length, 1);
  await h.connection.close();
});
