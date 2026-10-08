import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { isolateStateFiles, newSecret, PUBLIC_CALLBACK, mcpEnvelope } from "./helpers.ts";

isolateStateFiles();
const { McpServer, createMcpHandler } = await import("@modelcontextprotocol/server");
const events = await import("../src/events.ts");
const store = await import("../src/subscription-store.ts");
const ws = await import("../src/webhook-security.ts");

// Same server shape as index.ts createMcpServer(), through the real SDK handler.
const handler = createMcpHandler(() => {
  const server = new McpServer(
    { name: "empresa-ia-opencode-adapter", version: "1.0.0" },
    // @ts-expect-error SDK 2.3.1 types lack the draft MCP Events capability.
    { supportedProtocolVersions: ["2026-07-28"], capabilities: { events: {} } }
  );
  events.registerEventHandlers(server);
  return server;
});

async function rpc(method: string, params: Record<string, unknown> = {}) {
  const res = await handler.fetch(mcpEnvelope(method, params));
  return JSON.parse(await res.text());
}

let verifications = 0;
function acceptChallenges() {
  ws.setHttpsSenderForTesting(async (r) => {
    verifications++;
    return { status: 200, body: JSON.stringify({ challenge: JSON.parse(r.payload).challenge }) };
  });
}

const subscribeParams = (over: Record<string, unknown> = {}) => ({
  name: "mission.completed",
  arguments: { mission_id: "mission-A" },
  delivery: { mode: "webhook", url: PUBLIC_CALLBACK, secret: newSecret() },
  ...over
});

const count = () => Object.keys(store.loadSubscriptions()).length;

beforeEach(() => {
  fs.rmSync(store.subscriptionsFile(), { force: true });
  ws.clearVerificationCacheForTesting();
  verifications = 0;
  acceptChallenges();
});

after(() => ws.setHttpsSenderForTesting(null));

test("server/discover advertises capabilities.events through SDK 2.3.1", async () => {
  const r = await rpc("server/discover");
  assert.deepEqual(r.result.capabilities.events, {});
  assert.deepEqual(r.result.supportedVersions, ["2026-07-28"]);
});

test("E: events/list — every payloadSchema is closed; no unknown keywords", async () => {
  const r = await rpc("events/list");
  assert.deepEqual(r.result.events.map((e: any) => e.name), [...events.EVENT_NAMES]);
  for (const e of r.result.events) {
    assert.equal(e.payloadSchema.additionalProperties, false, e.name);
    assert.ok(!("additionalPrivileges" in e.payloadSchema), e.name);
    assert.deepEqual(e.delivery, ["webhook"]);
    assert.deepEqual(e.inputSchema.required, ["mission_id"]);
  }
});

test("C: invalid params return -32602 InvalidParams (not an internal error)", async () => {
  const cases = [
    subscribeParams({ name: "mission.unknown" }),
    subscribeParams({ arguments: {} }),
    subscribeParams({ arguments: { mission_id: "" } }),
    subscribeParams({ arguments: { mission_id: "m", extra: 1 } }),
    subscribeParams({ delivery: { mode: "webhook", url: PUBLIC_CALLBACK, secret: "not-whsec" } })
  ];
  for (const p of cases) {
    const r = await rpc("events/subscribe", p);
    assert.equal(r.error?.code, -32602, JSON.stringify(r));
  }
  assert.equal((await rpc("events/unsubscribe", {
    name: "nope", arguments: { mission_id: "m" }, delivery: { mode: "webhook", url: PUBLIC_CALLBACK }
  })).error?.code, -32602);
  assert.equal(count(), 0);
  assert.equal(verifications, 0);
});

test("D: callback failure → -32015 with data.reason; nothing persisted; secret not leaked", async () => {
  ws.setHttpsSenderForTesting(async () => ({ status: 200, body: JSON.stringify({ challenge: "wrong" }) }));
  const p = subscribeParams();
  const r = await rpc("events/subscribe", p);
  assert.equal(r.error.code, -32015);
  assert.equal(r.error.data.reason, "challenge_failed");
  assert.ok(!JSON.stringify(r).includes((p.delivery as any).secret));
  assert.equal(count(), 0);

  const bad = await rpc("events/subscribe", subscribeParams({
    delivery: { mode: "webhook", url: "https://127.0.0.1/cb", secret: newSecret() }
  }));
  assert.equal(bad.error.code, -32015);
  assert.equal(bad.error.data.reason, "invalid_callback_url");
  assert.equal(count(), 0);
});

test("F: valid subscribe persists exactly one record (CANTIDAD=1), mode 0600, default TTL", async () => {
  const before = Date.now();
  const r = await rpc("events/subscribe", subscribeParams());
  assert.match(r.result.id, /^sub_[0-9a-f]{32}$/);
  assert.equal(r.result.cursor, null);
  assert.equal(r.result.truncated, false);
  assert.equal(count(), 1);
  const ttl = Date.parse(r.result.refreshBefore) - before;
  assert.ok(Math.abs(ttl - events.DEFAULT_SUBSCRIPTION_TTL_MS) < 5_000);
  assert.equal(fs.statSync(store.subscriptionsFile()).mode & 0o777, 0o600);
  const rec = store.loadSubscriptions()[r.result.id];
  assert.equal(rec.principal, events.PRINCIPAL);
  assert.deepEqual(rec.arguments, { mission_id: "mission-A" });
});

test("F: idempotent refresh — same identity keeps one record; secret rotation keeps previous briefly", async () => {
  const first = subscribeParams();
  const a = await rpc("events/subscribe", first);
  const b = await rpc("events/subscribe", first);
  assert.equal(a.result.id, b.result.id);
  assert.equal(count(), 1);

  const rotated = { ...first, delivery: { ...(first.delivery as any), secret: newSecret() } };
  await rpc("events/subscribe", rotated);
  const rec = store.loadSubscriptions()[a.result.id];
  assert.equal(count(), 1);
  assert.equal(rec.delivery.secret, (rotated.delivery as any).secret);
  assert.equal(rec.delivery.previousSecret, (first.delivery as any).secret);
  assert.ok(Date.parse(rec.delivery.previousSecretExpiresAt!) > Date.now());

  // Different mission or event → different subscription.
  await rpc("events/subscribe", subscribeParams({ arguments: { mission_id: "mission-B" } }));
  await rpc("events/subscribe", subscribeParams({ name: "permission.required" }));
  assert.equal(count(), 3);
});

test("F: TTL — null means no expiry; tiny TTL raised to the minimum", async () => {
  const n = await rpc("events/subscribe", subscribeParams({ ttlMs: null }));
  assert.equal(n.result.refreshBefore, null);
  const before = Date.now();
  const z = await rpc("events/subscribe", subscribeParams({ ttlMs: 0, arguments: { mission_id: "m2" } }));
  assert.ok(Date.parse(z.result.refreshBefore) - before >= events.MIN_SUBSCRIPTION_TTL_MS - 1000);
});

test("F: expired subscriptions are excluded from delivery candidates", async () => {
  const r = await rpc("events/subscribe", subscribeParams());
  const rec = store.loadSubscriptions()[r.result.id];
  rec.expiresAt = new Date(Date.now() - 1000).toISOString();
  store.putSubscription(rec);
  assert.equal(store.activeSubscriptions().length, 0);
});

test("F: unsubscribe removes the record and is idempotent", async () => {
  const p = subscribeParams();
  await rpc("events/subscribe", p);
  const u = { name: p.name, arguments: p.arguments, delivery: { mode: "webhook", url: PUBLIC_CALLBACK } };
  // Empty result; the SDK only adds its own envelope fields (_meta, resultType).
  const emptyResult = (r: any) => {
    assert.equal(r.error, undefined);
    const { _meta, resultType, ...rest } = r.result;
    assert.deepEqual(rest, {});
  };
  emptyResult(await rpc("events/unsubscribe", u));
  assert.equal(count(), 0);
  emptyResult(await rpc("events/unsubscribe", u));
});

test("A2: onSubscribed fires only after a verified, persisted subscription", async () => {
  const calls: [string, string][] = [];
  const h = createMcpHandler(() => {
    const server = new McpServer(
      { name: "t", version: "1" },
      // @ts-expect-error SDK 2.3.1 types lack the draft MCP Events capability.
      { supportedProtocolVersions: ["2026-07-28"], capabilities: { events: {} } }
    );
    events.registerEventHandlers(server, {
      onSubscribed: (m, n) => { calls.push([m, n]); assert.equal(count() > 0, true, "persisted first"); }
    });
    return server;
  });
  const call = async (p: Record<string, unknown>) =>
    JSON.parse(await (await h.fetch(mcpEnvelope("events/subscribe", p))).text());

  ws.setHttpsSenderForTesting(async () => ({ status: 500, body: "" }));
  assert.equal((await call(subscribeParams())).error.code, -32015);
  assert.equal((await call(subscribeParams({ arguments: {} }))).error.code, -32602);
  assert.deepEqual(calls, [], "not called on failures");

  acceptChallenges();
  await call(subscribeParams({ name: "permission.required" }));
  assert.deepEqual(calls, [["mission-A", "permission.required"]]);
});

test("A2: mission.completed is described as not emitted on turn end", async () => {
  const r = await rpc("events/list");
  const completed = r.result.events.find((e: any) => e.name === "mission.completed");
  assert.match(completed.description, /not emitted/i);
  assert.match(completed.description, /Director/);
});
