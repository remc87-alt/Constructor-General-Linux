import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import { Webhook } from "standardwebhooks";
import { isolateStateFiles, newSecret, PUBLIC_CALLBACK, CapturedRequest } from "./helpers.ts";

isolateStateFiles();
const em = await import("../src/event-emitter.ts");
const store = await import("../src/subscription-store.ts");
const ws = await import("../src/webhook-security.ts");
const { PRINCIPAL } = await import("../src/events.ts");

// ---------- OpenCode fixtures (shapes confirmed against real data in M03-B0) ----------

const MISSIONS = {
  "mission-A": { session_id: "ses_A", title: "A" },
  "mission-B": { session_id: "ses_B", title: "B" }
};

const T0 = Date.now() + 60_000; // transitions happen after subscriptions are created

const user = (id: string, created = T0) => ({ info: { id, role: "user", time: { created } }, parts: [] });
// Real shape (M03-B0): step-start, reasoning, text, step-finish; finish="stop".
const assistant = (id: string, over: Record<string, unknown> = {}, text = "Final report: done") => ({
  info: { id, role: "assistant", parentID: "u1", time: { created: T0, completed: T0 + 10 }, finish: "stop", ...over },
  parts: [
    { type: "step-start" },
    { type: "reasoning", text: "thinking" },
    ...(text ? [{ type: "text", text }] : []),
    { type: "step-finish", reason: "stop" }
  ]
});
const apiError = (message: string) => ({ error: { name: "ApiError", data: { message } } });

type OcState = { statuses: any; messages: Record<string, any[]>; permissions: any[]; questions: any[] };
let oc: OcState;
let ocCalls: string[];

const ocClient = async (route: string) => {
  ocCalls.push(route);
  if (route === "/session/status") return oc.statuses;
  if (route === "/permission") return oc.permissions;
  if (route === "/question") return oc.questions;
  const m = route.match(/^\/session\/([^/]+)\/message$/);
  if (m) return oc.messages[decodeURIComponent(m[1])] ?? [];
  throw new Error("unexpected route " + route);
};

// ---------- Delivery capture: real deliverWebhook + signing, fake socket ----------

let delivered: CapturedRequest[];
let receiverStatus: number[];
let scheduled: { fn: () => void; ms: number }[];
let turns: any[];
const secret = newSecret();

function headersOf(r: CapturedRequest): Record<string, string> {
  return Object.fromEntries(Object.entries(r.headers).map(([k, v]) => [k.toLowerCase(), String(v)]));
}

function subscribe(name: string, missionId: string, createdAt = new Date().toISOString(), url = PUBLIC_CALLBACK) {
  const id = store.subscriptionId({ principal: PRINCIPAL, name, arguments: { mission_id: missionId }, callbackUrl: url });
  store.putSubscription({
    id, principal: PRINCIPAL, name, arguments: { mission_id: missionId },
    delivery: { mode: "webhook", url, secret },
    cursor: null, expiresAt: new Date(Date.now() + 3_600_000).toISOString(), refreshBefore: null,
    createdAt, updatedAt: createdAt
  });
  return id;
}

const ALL = ["mission.completed", "mission.failed", "mission.blocked", "permission.required"];

function newEmitter() {
  return new em.MissionEventEmitter({
    oc: ocClient as any,
    missions: () => MISSIONS,
    sleep: async () => {},
    schedule: (fn, ms) => { scheduled.push({ fn, ms }); },
    log: () => {},
    onTurnCompleted: (t) => turns.push(t)
  });
}

// Runs the next scheduled retry round and waits deterministically for it.
async function runNextScheduled(e: InstanceType<typeof em.MissionEventEmitter>) {
  const next = scheduled.shift();
  assert.ok(next, "a retry round was scheduled");
  next!.fn();
  await e.settled();
}

beforeEach(() => {
  fs.rmSync(store.subscriptionsFile(), { force: true });
  fs.rmSync(process.env.MCP_EVENT_OUTBOX_FILE!, { force: true });
  oc = { statuses: {}, messages: {}, permissions: [], questions: [] };
  ocCalls = [];
  delivered = [];
  receiverStatus = [];
  scheduled = [];
  turns = [];
  ws.setHttpsSenderForTesting(async (r) => {
    delivered.push(r);
    return { status: receiverStatus.shift() ?? 200, body: "" };
  });
});

after(() => ws.setHttpsSenderForTesting(null));

const body = (i = 0) => JSON.parse(delivered[i].payload);

// Retries are scheduled from the persisted absolute nextAttemptAt, so the
// relative delay can be a few ms below the nominal round delay.
function assertScheduled(nominal: number) {
  assert.equal(scheduled.length, 1, "exactly one retry timer");
  assert.ok(scheduled[0].ms <= nominal && scheduled[0].ms > nominal - 1000, `delay ${scheduled[0].ms} ≈ ${nominal}`);
}
const idle = (sid = "ses_A") => ({ type: "session.idle", properties: { sessionID: sid } });

// ---------- Classification: no false events ----------

const snap = (over: Partial<Parameters<typeof em.classifyTurn>[0]>) => ({
  missionId: "mission-A", sessionId: "ses_A", status: undefined,
  messages: [user("u1"), assistant("a1")], pendingPermissions: 0, pendingQuestions: 0, ...over
});

test("A/9: nothing while busy or retry, even with a finished-looking message", () => {
  assert.equal(em.classifyTurn(snap({ status: { type: "busy" } })), null);
  assert.equal(em.classifyTurn(snap({ status: { type: "retry", attempt: 3, message: "x", next: 0 } })), null);
});

test("A/9: idle alone is not even a finished turn", () => {
  assert.equal(em.classifyTurn(snap({ messages: [] })), null);
  assert.equal(em.classifyTurn(snap({ messages: [user("u1")] })), null, "no reply yet");
  assert.equal(em.classifyTurn(snap({ messages: [user("u1"), assistant("a1", { time: { created: T0 } })] })), null, "not completed");
  assert.equal(em.classifyTurn(snap({ messages: [user("u1"), assistant("a1", { finish: "tool-calls" })] })), null);
  assert.equal(em.classifyTurn(snap({ messages: [user("u1"), assistant("a1", {}, "")] })), null, "empty text");
  assert.equal(em.classifyTurn(snap({ pendingPermissions: 1 })), null);
  assert.equal(em.classifyTurn(snap({ pendingQuestions: 1 })), null);
});

test("A2: finish=stop is classified as a technical turn end, never as mission.completed", () => {
  const t = em.classifyTurn(snap({})) as any;
  assert.equal(t.kind, "turn_completed");
  assert.equal(t.turnId, "a1");
  assert.equal(t.name, undefined, "not an MCP emission");
});

test("A: failed from the assistant error OpenCode recorded", () => {
  const e = em.classifyTurn(snap({ messages: [user("u1"), assistant("a1", apiError("429 rate limit"))] })) as any;
  assert.equal(e.name, "mission.failed");
  assert.equal(e.data.error, "ApiError: 429 rate limit");
});

test("A: failed with no reply only when an explicit session.error was observed", () => {
  assert.equal(em.classifyTurn(snap({ messages: [user("u1", 100)] })), null);
  const e = em.classifyTurn(snap({
    messages: [user("u1", 100)],
    lastSessionError: { error: { name: "ProviderAuthError", data: { message: "bad key" } }, at: 200 }
  })) as any;
  assert.equal(e.name, "mission.failed");
  assert.equal(e.key, "failed:noreply:u1");
  assert.equal(em.classifyTurn(snap({
    messages: [user("u1", 300)], lastSessionError: { error: {}, at: 200 }
  })), null, "stale error from an earlier turn");
});

test("A/9: plain retry is not blocked; retry with a provider action is", () => {
  assert.equal(em.retryActionEmission("mission-A", "ses_A", { type: "retry", attempt: 2, message: "x", next: 0 }, "u1"), null);
  const e = em.retryActionEmission("mission-A", "ses_A", {
    type: "retry", attempt: 2, message: "x", next: 0,
    action: { reason: "auth", provider: "freellmapi", title: "Sign in", message: "Re-authenticate", label: "Open" }
  }, "u1")!;
  assert.equal(e.name, "mission.blocked");
  assert.equal(e.data.reason, "Sign in: Re-authenticate");
});

// ---------- Mandatory M03-A2 regressions ----------

test("A2 REGRESSION: two finished turns in one session never produce mission.completed", async () => {
  for (const n of ALL) subscribe(n, "mission-A");
  const e = newEmitter();
  // Turn 1 finished (real M03-B0 shape: finish=stop), mission later continued.
  oc.messages.ses_A = [user("u1"), assistant("a1", {}, "DIRECTOR_CONSTRUCTOR_E2E_PASS")];
  await e.handleOpenCodeEvent(idle());
  assert.equal(delivered.length, 0, "turn 1 end is not mission completion");
  // Turn 2 finished as well.
  oc.messages.ses_A.push(user("u2"), assistant("a2", { parentID: "u2" }, "SAME_SESSION_E2E_PASS"));
  await e.handleOpenCodeEvent(idle());
  assert.equal(delivered.length, 0, "turn 2 end is not mission completion either");
  assert.deepEqual(turns.map((t) => t.turnId), ["a1", "a2"], "both turn ends are still observed technically");
});

test("A2 REGRESSION: text claiming success (incl. explicit markers) is not a closure", async () => {
  for (const n of ALL) subscribe(n, "mission-A");
  const e = newEmitter();
  const claims = [
    "Misión completada con éxito. Todo PASS.",
    "MISSION_STATUS: COMPLETED",
    "DONE ✅ mission.completed",
    '{"status":"completed","success":true}'
  ];
  for (const [i, claim] of claims.entries()) {
    oc.messages.ses_A = [user(`u${i}`), assistant(`a${i}`, {}, claim)];
    await e.handleOpenCodeEvent(idle());
  }
  assert.equal(delivered.length, 0);
  assert.equal(turns.length, claims.length);
});

// ---------- Emitter: filtering, dedup, restart, retries ----------

test("A/7: delivery filtered by mission_id and event name", async () => {
  subscribe("mission.failed", "mission-A");
  oc.messages.ses_B = [user("u1"), assistant("b1", apiError("boom"))];
  const e = newEmitter();
  assert.deepEqual(await e.handleOpenCodeEvent(idle("ses_B")), []);
  assert.equal(ocCalls.length, 0, "no OpenCode reads for unsubscribed missions");

  oc.permissions = [{ id: "per_1", sessionID: "ses_A", permission: "bash", patterns: ["ls"] }];
  await e.handleOpenCodeEvent({ type: "permission.asked", properties: oc.permissions[0] });
  assert.equal(delivered.length, 0, "subscribed to failed only");
});

test("A/11: session.idle with an OpenCode error → signed mission.failed webhook", async () => {
  const subId = subscribe("mission.failed", "mission-A");
  oc.messages.ses_A = [user("u1"), assistant("a1", apiError("429"))];
  const out = await newEmitter().handleOpenCodeEvent(idle());
  assert.deepEqual(out.map((o) => o.outcome), ["delivered"]);
  const h = headersOf(delivered[0]);
  new Webhook(secret).verify(delivered[0].payload, h);
  assert.equal(h["x-mcp-subscription-id"], subId);
  assert.equal(h["webhook-id"], body().eventId);
  assert.equal(body().name, "mission.failed");
  assert.equal(body().cursor, null);
  assert.deepEqual(body().data, { mission_id: "mission-A", session_id: "ses_A", error: "ApiError: 429" });
});

test("A/10: duplicates suppressed — repeated stream events and adapter restart", async () => {
  subscribe("mission.failed", "mission-A");
  oc.messages.ses_A = [user("u1"), assistant("a1", apiError("first"))];
  const e = newEmitter();
  const status = { type: "session.status", properties: { sessionID: "ses_A", status: { type: "idle" } } };
  await Promise.all([e.handleOpenCodeEvent(idle()), e.handleOpenCodeEvent(status)]);
  await e.handleOpenCodeEvent(idle());
  assert.equal(delivered.length, 1);

  await newEmitter().reconcile(); // restart: persisted dedup store
  assert.equal(delivered.length, 1);

  oc.messages.ses_A.push(user("u2"), assistant("a2", apiError("second"))); // genuinely new turn
  await e.handleOpenCodeEvent(idle());
  assert.equal(delivered.length, 2);
  assert.equal(body(1).data.error, "ApiError: second");
});

test("A/8: closures that predate the subscription are not delivered", async () => {
  subscribe("mission.failed", "mission-A", new Date(T0 + 1_000_000).toISOString());
  oc.messages.ses_A = [user("u1"), assistant("a1", apiError("old"))];
  await newEmitter().reconcile();
  assert.equal(delivered.length, 0);
});

test("A/8: expired subscription receives nothing", async () => {
  const id = subscribe("mission.failed", "mission-A");
  const rec = store.loadSubscriptions()[id];
  rec.expiresAt = new Date(Date.now() - 1).toISOString();
  store.putSubscription(rec);
  oc.messages.ses_A = [user("u1"), assistant("a1", apiError("x"))];
  await newEmitter().handleOpenCodeEvent(idle());
  assert.equal(delivered.length, 0);
});

test("A2: exhausted delivery → bounded retry rounds (same eventId), recorded once delivered", async () => {
  subscribe("mission.failed", "mission-A");
  oc.messages.ses_A = [user("u1"), assistant("a1", apiError("x"))];
  receiverStatus = [503, 503, 503, 503, 503, 503];
  const e = newEmitter();
  const first = await e.handleOpenCodeEvent(idle());
  assert.equal(first[0].outcome, "failed");
  assert.equal(delivered.length, 3);
  assertScheduled(em.RETRY_ROUND_DELAYS_MS[0]);

  const again = await e.handleOpenCodeEvent(idle()); // same fact again
  assert.deepEqual(again.map((o) => o.outcome), ["retry_pending"], "backoff not bypassed");
  assert.equal(delivered.length, 3);
  assert.equal(scheduled.length, 1, "no second timer");

  await runNextScheduled(e); // round 1 fails (3 more attempts)
  assert.equal(delivered.length, 6);
  assertScheduled(em.RETRY_ROUND_DELAYS_MS[1]);

  await runNextScheduled(e); // round 2 succeeds
  assert.equal(delivered.length, 7);
  assert.equal(scheduled.length, 0, "no timers once delivered");
  assert.equal(new Set(delivered.map((_, i) => body(i).eventId)).size, 1);
  await e.reconcile();
  assert.equal(delivered.length, 7, "recorded: never re-sent");
});

test("A2: retry rounds are bounded and stop if the subscription expires", async () => {
  const id = subscribe("mission.failed", "mission-A");
  oc.messages.ses_A = [user("u1"), assistant("a1", apiError("x"))];
  receiverStatus = Array(100).fill(503);
  const e = newEmitter();
  await e.handleOpenCodeEvent(idle());
  for (let i = 0; i < em.RETRY_ROUND_DELAYS_MS.length; i++) await runNextScheduled(e);
  assert.equal(scheduled.length, 0, "gives up after the last round");
  assert.equal(delivered.length, 3 * (1 + em.RETRY_ROUND_DELAYS_MS.length));

  // New fact, then the subscription expires before the retry fires.
  oc.messages.ses_A.push(user("u2"), assistant("a2", apiError("y")));
  await e.handleOpenCodeEvent(idle());
  const sent = delivered.length;
  const rec = store.loadSubscriptions()[id];
  rec.expiresAt = new Date(Date.now() - 1).toISOString();
  store.putSubscription(rec);
  await runNextScheduled(e);
  assert.equal(delivered.length, sent, "expired subscription: retry dropped");
});

test("A: 410 removes the subscription; 413 is not retried", async () => {
  subscribe("mission.failed", "mission-A");
  oc.messages.ses_A = [user("u1"), assistant("a1", apiError("x"))];
  receiverStatus = [410];
  await newEmitter().reconcile();
  assert.equal(delivered.length, 1);
  assert.equal(store.activeSubscriptions().length, 0);

  subscribe("permission.required", "mission-A");
  receiverStatus = [413];
  await newEmitter().handleOpenCodeEvent({ type: "permission.asked",
    properties: { id: "per_9", sessionID: "ses_A", permission: "edit", patterns: [] } });
  assert.equal(delivered.length, 2);
  assert.equal(scheduled.length, 0);
});

test("A: permission.asked → permission.required; question.asked → mission.blocked", async () => {
  subscribe("permission.required", "mission-A");
  subscribe("mission.blocked", "mission-A");
  const e = newEmitter();
  await e.handleOpenCodeEvent({ type: "permission.asked",
    properties: { id: "per_1", sessionID: "ses_A", permission: "bash", patterns: ["rm -rf x"], metadata: {}, always: [] } });
  await e.handleOpenCodeEvent({ type: "question.asked",
    properties: { id: "que_1", sessionID: "ses_A", questions: [{ question: "Which branch?", header: "b", options: [] }] } });
  assert.deepEqual(body(0).data, { mission_id: "mission-A", session_id: "ses_A", permission_id: "per_1", permission: "bash" });
  assert.deepEqual(body(1).data, { mission_id: "mission-A", session_id: "ses_A", reason: "question: Which branch?" });
});

test("A2: post-subscribe evaluation sends pending permission/question, never historical closures", async () => {
  for (const n of ALL) subscribe(n, "mission-A");
  // Real M03-B0 situation: session busy with a permission pending for days.
  oc.statuses = { ses_A: { type: "busy" } };
  oc.permissions = [{ id: "per_real", sessionID: "ses_A", permission: "external_directory", patterns: ["/x/*"] }];
  oc.questions = [{ id: "que_1", sessionID: "ses_A", questions: [{ question: "Proceed?" }] }];
  // Plus an old failed turn and an old finished turn in history.
  oc.messages.ses_A = [user("u0"), assistant("a0", apiError("old")), user("u1"), assistant("a1")];
  const e = newEmitter();
  await e.evaluatePending("mission-A");
  assert.deepEqual(delivered.map((_, i) => body(i).name).sort(), ["mission.blocked", "permission.required"]);
  assert.equal(turns.length, 0, "turn outcomes not evaluated");
  await e.evaluatePending("mission-A");
  assert.equal(delivered.length, 2, "idempotent");
  // Unknown or unsubscribed mission: no OpenCode reads at all.
  ocCalls = [];
  await e.evaluatePending("mission-B");
  await e.evaluatePending("nope");
  assert.equal(ocCalls.length, 0);
});

test("A/9: busy/retry status events and unrelated sessions never emit", async () => {
  for (const n of ALL) subscribe(n, "mission-A");
  oc.messages.ses_A = [user("u1"), assistant("a1", { time: { created: T0 } })];
  oc.statuses = { ses_A: { type: "busy" } };
  const e = newEmitter();
  await e.handleOpenCodeEvent({ type: "session.status", properties: { sessionID: "ses_A", status: { type: "busy" } } });
  await e.handleOpenCodeEvent({ type: "session.status", properties: { sessionID: "ses_A", status: { type: "retry", attempt: 1, message: "x", next: 0 } } });
  await e.handleOpenCodeEvent(idle("ses_unknown"));
  await e.handleOpenCodeEvent({ type: "message.updated", properties: { info: {} } });
  await e.reconcile();
  assert.equal(delivered.length, 0);
});

// ---------- Operational wiring: real SSE stream from a local OpenCode stand-in ----------

test("A/8: runOpenCodeEventStream consumes /event, reconciles on connect, emits once (no TCP)", async () => {
  subscribe("mission.failed", "mission-A");
  oc.messages.ses_A = [user("u1"), assistant("a1", apiError("x"))];
  let connections = 0;
  // In-process stand-in for OpenCode's /event: frames match the real capture of
  // M03-B1-A (data-only, JSON with type/properties), split across chunks.
  const fakeFetch = (async (url: string | URL) => {
    assert.ok(String(url).endsWith("/event"));
    connections++;
    const enc = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(enc.encode('data: {"id":"evt_1","type":"server.connected","properties":{}}\n\n'));
        c.enqueue(enc.encode('data: {"payload":{"type":"session.idle",'));
        c.enqueue(enc.encode('"properties":{"sessionID":"ses_A"}}}\n\n'));
        c.enqueue(enc.encode("data: {not json\n\n"));
        setTimeout(() => c.close(), 50);
      }
    });
    return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
  }) as typeof fetch;
  const ac = new AbortController();
  const emitter = newEmitter();
  const run = em.runOpenCodeEventStream({
    url: "http://opencode.invalid/event", emitter, signal: ac.signal, log: () => {}, fetchImpl: fakeFetch
  });
  const deadline = Date.now() + 5_000;
  while ((delivered.length < 1 || connections < 2) && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 20));
  }
  ac.abort();
  await run;
  await emitter.settled();
  assert.ok(connections >= 2, "reconnected after stream end");
  assert.equal(delivered.length, 1, "reconnect + reconcile did not duplicate");
  assert.equal(body().name, "mission.failed");
});
