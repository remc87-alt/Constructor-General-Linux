// M03-A3: mission.turn_completed — the 12 mandatory cases. Local and simulated:
// OpenCode is a fixture (real M03-B0 message shapes) and the HTTPS hop is faked.
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { Webhook } from "standardwebhooks";
import { isolateStateFiles, newSecret, PUBLIC_CALLBACK, CapturedRequest, mcpEnvelope } from "./helpers.ts";

isolateStateFiles();
const em = await import("../src/event-emitter.ts");
const store = await import("../src/subscription-store.ts");
const ws = await import("../src/webhook-security.ts");
const events = await import("../src/events.ts");
const { McpServer, createMcpHandler } = await import("@modelcontextprotocol/server");

const TURN = "mission.turn_completed";
const MISSIONS = {
  "director-constructor-e2e-canary-20261005": { session_id: "ses_ef289cc1cffe3hAJA71nOLGKKb", title: "canary" },
  "mission-other": { session_id: "ses_other", title: "other" }
};
const MID = "director-constructor-e2e-canary-20261005";
const SID = "ses_ef289cc1cffe3hAJA71nOLGKKb";
const T0 = Date.now() + 60_000;

// Real ids and shape from the M03-B0 capture of the canary session.
const U1 = "msg_10d7633ef001cpdfVzzsqDmmyP";
const A1 = "msg_10d7633fb001wdVNlZAp6aZ1sH";
const U2 = "msg_10d779e42001Bky2Hquur1g6Xz";
const A2 = "msg_10d779e50001JMWn4TVSVO7mnF";
const user = (id: string, created = T0) => ({ info: { id, role: "user", sessionID: SID, time: { created } }, parts: [] });
const assistant = (id: string, parentID: string, text: string, over: Record<string, unknown> = {}) => ({
  info: { id, role: "assistant", sessionID: SID, parentID, time: { created: T0, completed: T0 + 10 }, finish: "stop", ...over },
  parts: [
    { type: "step-start" },
    { type: "reasoning", text: "…" },
    { type: "text", text },
    { type: "step-finish", reason: "stop" }
  ]
});
const TURN1 = [user(U1), assistant(A1, U1, "DIRECTOR_CONSTRUCTOR_E2E_PASS")];
const TURN2 = [user(U2), assistant(A2, U2, "SAME_SESSION_E2E_PASS")];

let oc: { statuses: any; messages: Record<string, any[]>; permissions: any[]; questions: any[] };
let delivered: CapturedRequest[];
let receiverStatus: number[];
let scheduled: { fn: () => void; ms: number }[];
const secret = newSecret();

const ocClient = async (route: string) => {
  if (route === "/session/status") return oc.statuses;
  if (route === "/permission") return oc.permissions;
  if (route === "/question") return oc.questions;
  const m = route.match(/^\/session\/([^/]+)\/message$/);
  if (m) return oc.messages[decodeURIComponent(m[1])] ?? [];
  throw new Error("unexpected route " + route);
};

function subscribe(name: string, missionId = MID) {
  const createdAt = new Date().toISOString();
  const id = store.subscriptionId({ principal: events.PRINCIPAL, name, arguments: { mission_id: missionId }, callbackUrl: PUBLIC_CALLBACK });
  store.putSubscription({
    id, principal: events.PRINCIPAL, name, arguments: { mission_id: missionId },
    delivery: { mode: "webhook", url: PUBLIC_CALLBACK, secret },
    cursor: null, expiresAt: new Date(Date.now() + 3_600_000).toISOString(), refreshBefore: null,
    createdAt, updatedAt: createdAt
  });
  return id;
}

const newEmitter = () => new em.MissionEventEmitter({
  oc: ocClient as any, missions: () => MISSIONS, sleep: async () => {},
  schedule: (fn, ms) => { scheduled.push({ fn, ms }); }, log: () => {}
});
const idle = (sid = SID) => ({ type: "session.idle", properties: { sessionID: sid } });
const body = (i = 0) => JSON.parse(delivered[i].payload);

// Retries are scheduled from the persisted absolute nextAttemptAt, so the
// relative delay can be a few ms below the nominal round delay.
function assertScheduled(nominal: number) {
  assert.equal(scheduled.length, 1, "exactly one retry timer");
  assert.ok(scheduled[0].ms <= nominal && scheduled[0].ms > nominal - 1000, `delay ${scheduled[0].ms} ≈ ${nominal}`);
}
const names = () => delivered.map((_, i) => body(i).name);
const ALL = [...events.EVENT_NAMES];

beforeEach(() => {
  fs.rmSync(store.subscriptionsFile(), { force: true });
  fs.rmSync(process.env.MCP_EVENT_OUTBOX_FILE!, { force: true });
  oc = { statuses: {}, messages: {}, permissions: [], questions: [] };
  delivered = [];
  receiverStatus = [];
  scheduled = [];
  ws.setHttpsSenderForTesting(async (r) => {
    delivered.push(r);
    return { status: receiverStatus.shift() ?? 200, body: "" };
  });
});

after(() => ws.setHttpsSenderForTesting(null));

test("contract: listed, closed schema, unambiguous description", async () => {
  const handler = createMcpHandler(() => {
    const server = new McpServer(
      { name: "t", version: "1" },
      // @ts-expect-error SDK 2.3.1 types lack the draft MCP Events capability.
      { supportedProtocolVersions: ["2026-07-28"], capabilities: { events: {} } }
    );
    events.registerEventHandlers(server);
    return server;
  });
  const r = JSON.parse(await (await handler.fetch(mcpEnvelope("events/list"))).text());
  assert.deepEqual(r.result.events.map((e: any) => e.name),
    ["mission.completed", "mission.failed", "mission.blocked", "permission.required", TURN]);
  const def = r.result.events.find((e: any) => e.name === TURN);
  assert.equal(def.payloadSchema.additionalProperties, false);
  assert.deepEqual(def.payloadSchema.required,
    ["mission_id", "session_id", "turn_id", "result_excerpt", "result_truncated"]);
  assert.equal(def.payloadSchema.properties.result_excerpt.maxLength, events.TURN_RESULT_EXCERPT_MAX);
  assert.deepEqual(def.inputSchema.required, ["mission_id"]);
  assert.match(def.description, /does NOT mean the mission is completed/);
  assert.match(def.description, /Director/);
});

test("Caso 1 + 11: a finished turn yields one signed event; result matches its turn_id", async () => {
  const subId = subscribe(TURN);
  oc.messages[SID] = [...TURN1];
  const out = await newEmitter().handleOpenCodeEvent(idle());
  assert.deepEqual(out.map((o) => o.outcome), ["delivered"]);
  assert.equal(delivered.length, 1);
  const h = Object.fromEntries(Object.entries(delivered[0].headers).map(([k, v]) => [k.toLowerCase(), String(v)]));
  new Webhook(secret).verify(delivered[0].payload, h);
  assert.equal(h["x-mcp-subscription-id"], subId);
  assert.equal(body().name, TURN);
  assert.equal(body().cursor, null);
  assert.deepEqual(body().data, {
    mission_id: MID, session_id: SID, turn_id: A1,
    result_excerpt: "DIRECTOR_CONSTRUCTOR_E2E_PASS", result_truncated: false
  });
  assert.ok(events.eventPayloadSchemas[TURN].safeParse(body().data).success);
});

test("Caso 2 + 11: two distinct turns → two events with different turn_ids and their own results", async () => {
  subscribe(TURN);
  const e = newEmitter();
  oc.messages[SID] = [...TURN1];
  await e.handleOpenCodeEvent(idle());
  oc.messages[SID] = [...TURN1, ...TURN2];
  await e.handleOpenCodeEvent(idle());
  assert.equal(delivered.length, 2);
  assert.deepEqual([body(0).data.turn_id, body(1).data.turn_id], [A1, A2]);
  assert.deepEqual([body(0).data.result_excerpt, body(1).data.result_excerpt],
    ["DIRECTOR_CONSTRUCTOR_E2E_PASS", "SAME_SESSION_E2E_PASS"]);
  assert.notEqual(body(0).eventId, body(1).eventId);
});

test("Caso 3: the same turn observed repeatedly → one delivery per subscription", async () => {
  subscribe(TURN);
  subscribe(TURN, MID); // same identity: still one subscription
  const e = newEmitter();
  oc.messages[SID] = [...TURN1];
  const status = { type: "session.status", properties: { sessionID: SID, status: { type: "idle" } } };
  await Promise.all([e.handleOpenCodeEvent(idle()), e.handleOpenCodeEvent(status), e.handleOpenCodeEvent(idle())]);
  await e.reconcile();
  await e.handleOpenCodeEvent(idle());
  assert.equal(delivered.length, 1);
});

test("Caso 3b: two different callback subscriptions → one delivery each", async () => {
  subscribe(TURN);
  const other = "https://93.184.215.15/other";
  const id2 = store.subscriptionId({ principal: events.PRINCIPAL, name: TURN, arguments: { mission_id: MID }, callbackUrl: other });
  const now = new Date().toISOString();
  store.putSubscription({ id: id2, principal: events.PRINCIPAL, name: TURN, arguments: { mission_id: MID },
    delivery: { mode: "webhook", url: other, secret }, cursor: null,
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(), refreshBefore: null, createdAt: now, updatedAt: now });
  oc.messages[SID] = [...TURN1];
  const e = newEmitter();
  await e.handleOpenCodeEvent(idle());
  await e.handleOpenCodeEvent(idle());
  assert.equal(delivered.length, 2);
  assert.deepEqual(new Set(delivered.map((d) => d.url.toString())).size, 2);
});

test("Caso 4 + 12: finished turns — including text claiming success — never yield mission.completed", async () => {
  for (const n of ALL) subscribe(n);
  const e = newEmitter();
  const claims = ["Misión completada con éxito.", "MISSION_STATUS: COMPLETED", '{"status":"completed"}'];
  let msgs: any[] = [];
  for (const [i, claim] of claims.entries()) {
    msgs = [...msgs, user(`msg_u${i}`), assistant(`msg_a${i}`, `msg_u${i}`, claim)];
    oc.messages[SID] = msgs;
    await e.handleOpenCodeEvent(idle());
  }
  assert.deepEqual(names(), [TURN, TURN, TURN]);
  assert.ok(!names().includes("mission.completed"));
  assert.deepEqual(delivered.map((_, i) => body(i).data.result_excerpt), claims, "claim is only reported, verbatim");
});

test("Caso 5: busy, retry or incomplete turns do not yield turn_completed", async () => {
  subscribe(TURN);
  const e = newEmitter();
  oc.messages[SID] = [...TURN1];
  oc.statuses = { [SID]: { type: "busy" } };
  await e.handleOpenCodeEvent(idle()); // stale idle event while OpenCode says busy
  oc.statuses = { [SID]: { type: "retry", attempt: 2, message: "429", next: 0 } };
  await e.handleOpenCodeEvent({ type: "session.status", properties: { sessionID: SID, status: oc.statuses[SID] } });
  await e.reconcile();
  oc.statuses = {};
  for (const msgs of [
    [user(U1)],                                                                // no reply yet
    [user(U1), assistant(A1, U1, "partial", { time: { created: T0 } })],       // not completed
    [user(U1), assistant(A1, U1, "calling tools", { finish: "tool-calls" })],  // mid-loop
    [user(U1), assistant(A1, U1, "x", { error: { name: "ApiError", data: { message: "boom" } } })] // error
  ]) {
    oc.messages[SID] = msgs;
    await e.handleOpenCodeEvent(idle());
  }
  oc.messages[SID] = [...TURN1];
  oc.permissions = [{ id: "per_1", sessionID: SID, permission: "bash", patterns: [] }]; // pending permission
  await e.handleOpenCodeEvent(idle());
  assert.equal(delivered.length, 0);
});

test("Caso 6: mission without a valid subscription → no deliveries (and no OpenCode reads)", async () => {
  subscribe(TURN, "mission-other");
  let reads = 0;
  const e = new em.MissionEventEmitter({
    oc: (async (r: string) => { reads++; return ocClient(r); }) as any,
    missions: () => MISSIONS, sleep: async () => {}, schedule: () => {}, log: () => {}
  });
  oc.messages[SID] = [...TURN1];
  await e.handleOpenCodeEvent(idle());
  await e.evaluateMission(MID);
  assert.equal(delivered.length, 0);
  assert.equal(reads, 0);
});

test("Caso 7: subscriptions to other events do not receive turn_completed", async () => {
  for (const n of ALL.filter((n) => n !== TURN)) subscribe(n);
  oc.messages[SID] = [...TURN1];
  await newEmitter().handleOpenCodeEvent(idle());
  assert.equal(delivered.length, 0);
});

test("Caso 8: expired subscription receives nothing", async () => {
  const id = subscribe(TURN);
  const rec = store.loadSubscriptions()[id];
  rec.expiresAt = new Date(Date.now() - 1).toISOString();
  store.putSubscription(rec);
  oc.messages[SID] = [...TURN1];
  await newEmitter().handleOpenCodeEvent(idle());
  assert.equal(delivered.length, 0);
});

test("Caso 9: after an emitter restart a delivered turn is not re-sent", async () => {
  subscribe(TURN);
  oc.messages[SID] = [...TURN1];
  await newEmitter().handleOpenCodeEvent(idle());
  assert.equal(delivered.length, 1);
  const restarted = newEmitter(); // new instance, same persisted dedup store
  await restarted.reconcile();
  await restarted.handleOpenCodeEvent(idle());
  assert.equal(delivered.length, 1);
});

test("Caso 10: failed delivery keeps its eventId and follows the existing bounded retries", async () => {
  subscribe(TURN);
  oc.messages[SID] = [...TURN1];
  receiverStatus = [503, 503, 503, 500, 500, 500];
  const e = newEmitter();
  const out = await e.handleOpenCodeEvent(idle());
  assert.equal(out[0].outcome, "failed");
  assert.equal(delivered.length, 3);
  assertScheduled(em.RETRY_ROUND_DELAYS_MS[0]);
  assert.deepEqual((await e.handleOpenCodeEvent(idle())).map((o) => o.outcome), ["retry_pending"]);
  scheduled.shift()!.fn(); await e.settled(); // round 1: fails again
  assertScheduled(em.RETRY_ROUND_DELAYS_MS[1]);
  scheduled.shift()!.fn(); await e.settled(); // round 2: delivered
  assert.equal(delivered.length, 7);
  assert.equal(new Set(delivered.map((_, i) => body(i).eventId)).size, 1, "same eventId on every attempt");
  assert.equal(new Set(delivered.map((d) => String(d.headers["webhook-id"]))).size, 1);
  await e.reconcile();
  assert.equal(delivered.length, 7, "recorded after success");
});

test("payload safety: excerpt bounded, redacted before truncation, never splits a surrogate pair", () => {
  const long = "a".repeat(events.TURN_RESULT_EXCERPT_MAX - 1) + "😀tail";
  const r = em.turnResultExcerpt(long);
  assert.equal(r.truncated, true);
  assert.ok(r.excerpt.length <= events.TURN_RESULT_EXCERPT_MAX);
  assert.ok(!/[\uD800-\uDBFF]$/.test(r.excerpt));
  const providerToken = ["sk", "ant", "api03", "ABCDEFGHIJKLMNOPQRSTUV"].join("-");
  const password = ["hunter", "2", "hunter", "2"].join("");
  const privateKey = ["-----BEGIN RSA ", "PRIVATE KEY-----\\nMIIE\\n-----END RSA ", "PRIVATE KEY-----"].join("");
  const secretText = [
    `key ${providerToken}`, `OPENCODE_SERVER_PASSWORD=${password}`,
    "Authorization: Bearer abcdefghijklmnopqrstuvwxyz012345", "whsec_" + "Q".repeat(40),
    privateKey, "ghp_" + "x".repeat(36)
  ].join("\n");
  const red = em.turnResultExcerpt(secretText).excerpt;
  for (const leak of [["sk", "ant", "api03"].join("-"), ["hunter", "2"].join(""), "abcdefghijklmnopqrstuvwxyz012345", "Q".repeat(40), "MIIE", "x".repeat(36)]) {
    assert.ok(!red.includes(leak), `leaked: ${leak}`);
  }
  assert.ok(red.includes("[REDACTED]"));
  // A secret straddling the cut is redacted before truncation.
  const straddle = "b".repeat(events.TURN_RESULT_EXCERPT_MAX - 10) + " sk-" + "Z".repeat(40);
  assert.ok(!em.turnResultExcerpt(straddle).excerpt.includes("sk-ZZ"));
});
