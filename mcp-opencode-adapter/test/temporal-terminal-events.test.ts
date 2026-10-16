import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { Webhook } from "standardwebhooks";
import { isolateStateFiles, newSecret, PUBLIC_CALLBACK } from "./helpers.ts";
import { terminalEmission } from "../src/temporal-terminal-events.ts";
import { readTemporalTerminal } from "../src/temporal-bridge.ts";

const dir = isolateStateFiles();
const { MissionEventEmitter } = await import("../src/event-emitter.ts");
const store = await import("../src/subscription-store.ts");
const ws = await import("../src/webhook-security.ts");
const { PRINCIPAL } = await import("../src/events.ts");
const mission = "terminal-test", session = "ses_terminal", run = "run-exact-001";
const info = { execution: { workflowId: mission, runId: run }, type: { name: "genericConstructorMissionWorkflow" },
  taskQueue: "constructor-poc", status: "WORKFLOW_EXECUTION_STATUS_COMPLETED", closeTime: new Date(Date.now() + 1000).toISOString() };
const result = (functional_status = "blocked") => ({ workflowId: mission, runId: run, status: "COMPLETED", result: {
  mission_id: mission, session_id: session, temporal_status: "completed", functional_status, phase: "permission_timeout",
  validation_evidence: null, oracle_execution_ids: [],
} });

test("terminal result: completed is not passed; exact mission/run/session and oracle evidence required", () => {
  const blocked = terminalEmission(info, result(), mission, session)!;
  assert.equal(blocked.name, "mission.blocked");
  assert.equal(JSON.parse(blocked.data.reason as string).run_id, run);
  assert.equal(terminalEmission(info, result("running"), mission, session), null);
  assert.equal(terminalEmission(info, result("passed"), mission, session), null);
  const passed: any = result("passed");
  passed.result.validation_evidence = { ok: true, status: "passed", diagnostics: [] };
  passed.result.oracle_execution_ids = ["oracle-run-exact-001-1"];
  assert.equal(terminalEmission(info, passed, mission, session)?.name, "mission.completed");
  assert.equal(terminalEmission(info, { ...passed, runId: "other" }, mission, session), null);
  assert.equal(terminalEmission(info, passed, mission, "ses_other"), null);
  assert.equal(terminalEmission({ ...info, closeTime: undefined }, passed, mission, session), null);
  assert.equal(terminalEmission(info, result("failed"), mission, session)?.name, "mission.failed");
  assert.equal(terminalEmission({ ...info, status: "WORKFLOW_EXECUTION_STATUS_TIMED_OUT" }, null, mission, session)?.name, "mission.failed");
});

test("terminal reader pins the exact run and reads result, never query or start", async () => {
  const bin = path.join(dir, "fake-temporal.mjs"), calls = path.join(dir, "calls.jsonl");
  fs.writeFileSync(bin, `#!${process.execPath}\nimport fs from 'node:fs';
    const args=process.argv.slice(2); fs.appendFileSync(${JSON.stringify(calls)},JSON.stringify(args)+'\\n');
    console.log(JSON.stringify(args.includes('describe') ? {workflowExecutionInfo:${JSON.stringify(info)}} : ${JSON.stringify(result())}));`, { mode: 0o700 });
  const config = { bin, address: "isolated-test:1", namespace: "default", taskQueue: "constructor-poc" };
  assert.equal((await readTemporalTerminal(config, mission, session))?.name, "mission.blocked");
  const args = fs.readFileSync(calls, "utf8").trim().split("\n").map((s) => JSON.parse(s));
  assert.equal(args.length, 2);
  assert.ok(args[0].includes("describe"));
  assert.ok(args[1].includes("result"));
  assert.equal(args[1][args[1].indexOf("--run-id") + 1], run);
  assert.equal(args.flat().some((s) => ["query", "start", "signal"].includes(s)), false);
});

test("functional terminal -> signed existing outbox; restart deduplicates, failed delivery remains observable", async () => {
  const secret = newSecret();
  const id = store.subscriptionId({ principal: PRINCIPAL, name: "mission.blocked", arguments: { mission_id: mission }, callbackUrl: PUBLIC_CALLBACK });
  const now = new Date().toISOString();
  store.putSubscription({ id, principal: PRINCIPAL, name: "mission.blocked", arguments: { mission_id: mission },
    delivery: { mode: "webhook", url: PUBLIC_CALLBACK, secret }, createdAt: now, updatedAt: now,
    cursor: null, expiresAt: new Date(Date.now() + 60_000).toISOString(), refreshBefore: null });
  let sends = 0;
  ws.setHttpsSenderForTesting(async (request) => {
    sends++;
    const headers = Object.fromEntries(Object.entries(request.headers).map(([k, v]) => [k.toLowerCase(), String(v)]));
    const verified: any = new Webhook(secret).verify(request.payload, headers);
    assert.ok(JSON.stringify(verified).includes(run));
    assert.equal(request.payload.includes(secret), false);
    return { status: 200, body: "ok" };
  });
  const opts = { oc: async () => assert.fail("no OpenCode reads required for a terminal result"),
    missions: () => ({ [mission]: { session_id: session, title: "t" } }),
    terminalResult: async () => terminalEmission(info, result(), mission, session), sleep: async () => {}, schedule: () => {}, log: () => {} };
  let emitter = new MissionEventEmitter(opts);
  try {
    await Promise.all([emitter.reconcileTerminalResults(), emitter.reconcileTerminalResults()]);
    assert.equal(sends, 1);
    const record = emitter.outbox.all()[0];
    assert.equal(record.status, "delivered");
    assert.equal(record.eventKey, `temporal-terminal:${run}`);
    emitter.outbox.releaseLock();
    emitter = new MissionEventEmitter(opts);
    await emitter.reconcileTerminalResults();
    assert.equal(sends, 1, "restart preserves idempotence");
    assert.equal(emitter.outbox.all()[0].eventId, record.eventId);
    ws.setHttpsSenderForTesting(async () => ({ status: 503, body: "unavailable" }));
    const otherInfo = { ...info, execution: { workflowId: mission, runId: "run-exact-002" } };
    await emitter.emit(terminalEmission(otherInfo, { ...result(), runId: "run-exact-002" }, mission, session)!);
    const failed = emitter.outbox.all().find((r) => r.eventKey.endsWith("002"))!;
    assert.equal(failed.status, "pending");
    assert.equal(failed.attempts, 3);
    assert.equal(failed.lastStatus, 503);
  } finally { emitter.outbox.releaseLock(); ws.setHttpsSenderForTesting(null); }
});
