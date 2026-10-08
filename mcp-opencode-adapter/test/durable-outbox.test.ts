// M03-A4: durable delivery (outbox). Local and simulated: OpenCode is a fixture,
// the HTTPS hop is an in-process fake, "crash" = an emitter instance abandoned
// mid-flight and a new instance created on the same outbox file.
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { spawn } from "node:child_process";
import { Webhook } from "standardwebhooks";
import { isolateStateFiles, newSecret, PUBLIC_CALLBACK, CapturedRequest } from "./helpers.ts";

isolateStateFiles();
const em = await import("../src/event-emitter.ts");
const outboxMod = await import("../src/event-outbox.ts");
const store = await import("../src/subscription-store.ts");
const ws = await import("../src/webhook-security.ts");
const events = await import("../src/events.ts");

const OUTBOX = process.env.MCP_EVENT_OUTBOX_FILE!;
const TURN = "mission.turn_completed";
const MID = "mission-A", SID = "ses_A";
const MISSIONS = { [MID]: { session_id: SID, title: "A" }, "mission-B": { session_id: "ses_B", title: "B" } };
const T0 = Date.now() + 60_000;
const user = (id: string) => ({ info: { id, role: "user", time: { created: T0 } }, parts: [] });
const turn = (id: string, text: string, over: Record<string, unknown> = {}) => ({
  info: { id, role: "assistant", parentID: "u", time: { created: T0, completed: T0 + 1 }, finish: "stop", ...over },
  parts: [{ type: "text", text }]
});

let msgs: any[];
let sent: CapturedRequest[];
let respond: (r: CapturedRequest) => Promise<{ status: number; body: string }>;
let scheduled: { fn: () => void; ms: number }[];
let logs: string[];
const secret = newSecret();

const oc = async (r: string) => (r === "/session/status" ? {} : r.endsWith("/message") ? msgs : []);

function subscribe(name: string, url = PUBLIC_CALLBACK, mission = MID) {
  const id = store.subscriptionId({ principal: events.PRINCIPAL, name, arguments: { mission_id: mission }, callbackUrl: url });
  const now = new Date().toISOString();
  store.putSubscription({ id, principal: events.PRINCIPAL, name, arguments: { mission_id: mission },
    delivery: { mode: "webhook", url, secret }, cursor: null,
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(), refreshBefore: null, createdAt: now, updatedAt: now });
  return id;
}

const mk = () => new em.MissionEventEmitter({
  oc: oc as any, missions: () => MISSIONS, sleep: async () => {},
  schedule: (fn, ms) => { scheduled.push({ fn, ms }); }, log: (m) => logs.push(m)
});
const idle = () => ({ type: "session.idle", properties: { sessionID: SID } });
const payload = (i: number) => JSON.parse(sent[i].payload);
const hdr = (i: number) => Object.fromEntries(Object.entries(sent[i].headers).map(([k, v]) => [k.toLowerCase(), String(v)]));
const records = (): Map<string, any> =>
  new Map(Object.entries(fs.existsSync(OUTBOX) ? JSON.parse(fs.readFileSync(OUTBOX, "utf8")) : {}));

beforeEach(() => {
  fs.rmSync(store.subscriptionsFile(), { force: true });
  fs.rmSync(OUTBOX, { force: true });
  msgs = [];
  sent = [];
  scheduled = [];
  logs = [];
  respond = async () => ({ status: 200, body: "" });
  ws.setHttpsSenderForTesting(async (r) => { sent.push(r); return respond(r); });
});
after(() => ws.setHttpsSenderForTesting(null));

test("A: A fails, B occurs, restart, reconcile → A is recovered (Codex G1 scenario)", async () => {
  const id = subscribe(TURN);
  respond = async () => ({ status: 503, body: "" });
  msgs = [user("u1"), turn("A", "turn A")];
  const e1 = mk();
  await e1.handleOpenCodeEvent(idle());                      // A: round 1 fails → pending
  respond = async () => ({ status: 200, body: "" });
  msgs = [...msgs, user("u2"), turn("B", "turn B")];
  await e1.handleOpenCodeEvent(idle());                      // B delivered
  assert.equal(records().get(`${id}|turn:A`).status, "pending");
  assert.equal(records().get(`${id}|turn:B`).status, "delivered");

  scheduled.length = 0;                                      // restart: in-memory timers lost
  const beforeRestart = sent.length;
  const e2 = mk();
  await e2.reconcile();                                      // OpenCode now only shows B as latest…
  for (const s of scheduled.splice(0)) s.fn();               // …the outbox still owns A
  await e2.settled();
  const afterRestart = sent.slice(beforeRestart).map((r) => JSON.parse(r.payload).data.turn_id);
  assert.deepEqual(afterRestart, ["A"], "only A is (re)sent after restart; B is not duplicated");
  assert.equal(records().get(`${id}|turn:A`).status, "delivered");
  assert.equal(records().size, 2);
});

test("B: crash before the first send → record already durable → resent after restart", async () => {
  subscribe(TURN);
  msgs = [user("u1"), turn("A", "turn A")];
  let seenAtSend: any = null;
  respond = () => {
    seenAtSend = [...records().values()][0];
    return new Promise(() => {}); // process "dies" mid-send: never resolves
  };
  void mk().handleOpenCodeEvent(idle());
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(seenAtSend.status, "pending", "persisted before the first attempt");
  assert.equal(seenAtSend.attempts, 0);

  respond = async () => ({ status: 200, body: "" });
  await mk().resumePending();                                // restarted process
  assert.equal([...records().values()][0].status, "delivered");
  assert.equal(new Set(sent.map((_, i) => hdr(i)["webhook-id"])).size, 1, "same webhook-id");
});

test("C: crash after delivery with ambiguous ACK → idempotent resend, same eventId, fresh timestamp+signature", async () => {
  subscribe(TURN);
  msgs = [user("u1"), turn("A", "turn A")];
  respond = () => new Promise(() => {});                     // receiver got it; ACK never recorded
  void mk().handleOpenCodeEvent(idle());
  await new Promise((r) => setTimeout(r, 1100));             // next second → new webhook-timestamp
  respond = async () => ({ status: 200, body: "" });
  await mk().resumePending();
  assert.equal(sent.length, 2);
  assert.equal(hdr(0)["webhook-id"], hdr(1)["webhook-id"]);
  assert.equal(payload(0).eventId, payload(1).eventId);
  assert.notEqual(hdr(0)["webhook-timestamp"], hdr(1)["webhook-timestamp"]);
  assert.notEqual(hdr(0)["webhook-signature"], hdr(1)["webhook-signature"]);
  for (const i of [0, 1]) new Webhook(secret).verify(sent[i].payload, hdr(i));
});

test("D: two subscriptions for the same mission → independent records, eventIds and fates", async () => {
  const s1 = subscribe(TURN);
  const s2 = subscribe(TURN, "https://93.184.215.15/second");
  respond = async (r) => ({ status: r.url.toString().includes("second") ? 503 : 200, body: "" });
  msgs = [user("u1"), turn("A", "turn A")];
  await mk().handleOpenCodeEvent(idle());
  const r = records();
  assert.equal(r.get(`${s1}|turn:A`).status, "delivered");
  assert.equal(r.get(`${s2}|turn:A`).status, "pending");
  assert.notEqual(r.get(`${s1}|turn:A`).eventId, r.get(`${s2}|turn:A`).eventId);
});

test("E + J: repeated reconnect/reconcile never duplicates records or deliveries", async () => {
  subscribe(TURN);
  msgs = [user("u1"), turn("A", "turn A")];
  const e = mk();
  for (let i = 0; i < 5; i++) { await e.reconcile(); await e.handleOpenCodeEvent(idle()); }
  for (let i = 0; i < 3; i++) await mk().reconcile();       // and across restarts
  assert.equal(records().size, 1);
  assert.equal(sent.length, 1);
});

test("F: expiration and revocation stop pending deliveries and are recorded", async () => {
  const id = subscribe(TURN);
  respond = async () => ({ status: 503, body: "" });
  msgs = [user("u1"), turn("A", "turn A")];
  const e = mk();
  await e.handleOpenCodeEvent(idle());
  const rec = store.loadSubscriptions()[id];
  rec.expiresAt = new Date(Date.now() - 1).toISOString();
  store.putSubscription(rec);
  const before = sent.length;
  scheduled.shift()!.fn(); await e.settled();
  assert.equal(sent.length, before, "no send after expiry");
  assert.equal(records().get(`${id}|turn:A`).status, "expired");

  const id2 = subscribe(TURN, "https://93.184.215.15/rev");
  msgs = [...msgs, user("u2"), turn("B", "turn B")];
  await e.handleOpenCodeEvent(idle());
  assert.equal(records().get(`${id2}|turn:B`).status, "pending");
  store.deleteSubscription(id2);                             // revoked while pending
  const before2 = sent.length;
  scheduled.shift()!.fn(); await e.settled();
  assert.equal(sent.length, before2);
  assert.equal(records().get(`${id2}|turn:B`).status, "revoked");
});

test("G: 410 → gone (subscription removed) and 413 → rejected, never retried", async () => {
  const id = subscribe(TURN);
  respond = async () => ({ status: 410, body: "" });
  msgs = [user("u1"), turn("A", "turn A")];
  await mk().handleOpenCodeEvent(idle());
  const r = records().get(`${id}|turn:A`);
  assert.deepEqual([r.status, r.attempts, r.nextAttemptAt], ["gone", 1, null]);
  assert.equal(store.loadSubscriptions()[id], undefined);

  const id2 = subscribe(TURN);
  respond = async () => ({ status: 413, body: "" });
  msgs = [...msgs, user("u2"), turn("B", "turn B")];
  await mk().handleOpenCodeEvent(idle());
  const r2 = records().get(`${id2}|turn:B`);
  assert.deepEqual([r2.status, r2.attempts], ["rejected", 1]);
  assert.equal(scheduled.length, 0);
});

test("H + I: retries exhausted → durable terminal 'exhausted' evidence, no infinite retry, survives restart", async () => {
  const id = subscribe(TURN);
  respond = async () => ({ status: 503, body: "" });
  msgs = [user("u1"), turn("A", "turn A")];
  const e = mk();
  await e.handleOpenCodeEvent(idle());
  while (scheduled.length) { scheduled.shift()!.fn(); await e.settled(); }
  const rounds = 1 + em.RETRY_ROUND_DELAYS_MS.length;
  const r = records().get(`${id}|turn:A`);
  assert.deepEqual([r.status, r.rounds, r.attempts, r.nextAttemptAt, r.lastStatus, r.lastError],
    ["exhausted", rounds, 3 * rounds, null, 503, "HTTP 503"]);
  const n = sent.length;
  await mk().resumePending();
  await mk().reconcile();                                    // restart: terminal stays terminal
  assert.equal(sent.length, n);
  assert.equal(records().get(`${id}|turn:A`).status, "exhausted");
  assert.equal(scheduled.length, 0);
});

test("K: finished turns (even claiming success) never create mission.completed", async () => {
  for (const n of events.EVENT_NAMES) subscribe(n);
  msgs = [user("u1"), turn("A", "MISSION_STATUS: COMPLETED — misión completada con éxito")];
  await mk().handleOpenCodeEvent(idle());
  assert.deepEqual(sent.map((_, i) => payload(i).name), [TURN]);
  assert.ok(![...records().values()].some((r) => r.name === "mission.completed"));
});

test("L: no secret leakage in mission.failed payload, outbox, lastError or logs", async () => {
  const id = subscribe("mission.failed");
  const providerToken = ["sk", "ant", "api03", "SUPERSECRETKEY0123456789"].join("-");
  const password = ["hunter", "2", "hunter", "2"].join("");
  const leak = [providerToken, password, "eyJhbGciOiJIUzI1NiJ9abcdefghij", "whsec_" + "K".repeat(40)];
  msgs = [user("u1"), turn("A", "x", { error: { name: "ApiError", data: {
    message: `401 invalid key ${leak[0]}; OPENCODE_SERVER_PASSWORD=${leak[1]}; Authorization: Bearer ${leak[2]}; ${leak[3]}` } } })];
  let first = true;
  respond = async () => {
    if (first) { first = false; throw new Error(`connect failed https://cb.example/path?token=${leak[1]} ${leak[0]}`); }
    return { status: 200, body: "" };
  };
  await mk().handleOpenCodeEvent(idle());
  const outboxText = fs.readFileSync(OUTBOX, "utf8");
  const blob = [...sent.map((s) => s.payload), outboxText, ...logs].join("\n");
  for (const s of [...leak, ["SUPER", "SECRETKEY"].join(""), "cb.example/path"]) assert.ok(!blob.includes(s), `leaked: ${s}`);
  assert.match(payload(0).data.error, /\[REDACTED\]/);
  assert.ok(logs.some((l) => l.includes("[url]")), "transport error logged, sanitized");
  assert.equal(records().get(`${id}|failed:A`).status, "delivered");
  assert.ok(!outboxText.includes(secret), "subscription secret never stored in outbox");
  assert.ok(!outboxText.includes(PUBLIC_CALLBACK), "callback URL never stored in outbox");
  assert.equal(fs.statSync(OUTBOX).mode & 0o777, 0o600);
});

test("Invariant 12: a second live process cannot open the same outbox; a stale lock is taken over", async () => {
  const other = spawn(process.execPath, ["-e", "setTimeout(() => {}, 30000)"]);
  try {
    await new Promise((r) => setTimeout(r, 100));
    const file = OUTBOX + ".x.json";
    fs.writeFileSync(file + ".lock", String(other.pid));
    assert.throws(() => new outboxMod.EventOutbox(file), outboxMod.OutboxLockedError);
    fs.writeFileSync(file + ".lock", "999999999"); // dead pid
    const ob = new outboxMod.EventOutbox(file);
    assert.equal(fs.readFileSync(file + ".lock", "utf8"), String(process.pid));
    ob.releaseLock();
    assert.ok(!fs.existsSync(file + ".lock"));
  } finally {
    other.kill();
  }
});
