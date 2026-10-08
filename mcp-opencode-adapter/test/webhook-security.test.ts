import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { Webhook } from "standardwebhooks";
import { isolateStateFiles, newSecret, PUBLIC_CALLBACK, CapturedRequest } from "./helpers.ts";

isolateStateFiles();
const ws = await import("../src/webhook-security.ts");

let captured: CapturedRequest[] = [];

function headersOf(r: CapturedRequest): Record<string, string> {
  return Object.fromEntries(Object.entries(r.headers).map(([k, v]) => [k.toLowerCase(), String(v)]));
}

// Receiver that checks the Standard Webhooks signature and echoes the challenge.
function honestReceiver(secret: string) {
  return async (r: CapturedRequest) => {
    captured.push(r);
    new Webhook(secret).verify(r.payload, headersOf(r));
    const body = JSON.parse(r.payload);
    return { status: 200, body: JSON.stringify({ challenge: body.challenge }) };
  };
}

beforeEach(() => {
  captured = [];
  ws.clearVerificationCacheForTesting();
});

after(() => ws.setHttpsSenderForTesting(null));

test("B: in Node ESM the global crypto lacks timingSafeEqual (why the import is required)", () => {
  assert.equal(typeof (globalThis as any).crypto.timingSafeEqual, "undefined");
});

test("B: a correct challenge response verifies (signed, real code path)", async () => {
  const secret = newSecret();
  ws.setHttpsSenderForTesting(honestReceiver(secret));
  await ws.verifyWebhookCallback({ url: PUBLIC_CALLBACK, secret }, "p", "sub_x");
  assert.equal(captured.length, 1);
  const h = headersOf(captured[0]);
  assert.equal(h["x-mcp-subscription-id"], "sub_x");
  assert.equal(JSON.parse(captured[0].payload).type, "verification");
});

test("B: verification is cached per principal+URL", async () => {
  const secret = newSecret();
  ws.setHttpsSenderForTesting(honestReceiver(secret));
  await ws.verifyWebhookCallback({ url: PUBLIC_CALLBACK, secret }, "p", "sub_x");
  await ws.verifyWebhookCallback({ url: PUBLIC_CALLBACK, secret }, "p", "sub_x");
  assert.equal(captured.length, 1);
});

for (const [label, body, reason] of [
  ["wrong challenge of equal length", () => JSON.stringify({ challenge: "00000000-0000-4000-8000-000000000000" }), "challenge_failed"],
  ["challenge of different length (no RangeError)", () => JSON.stringify({ challenge: "short" }), "challenge_failed"],
  ["missing challenge", () => JSON.stringify({}), "challenge_failed"],
  ["non-JSON body", () => "ok", "challenge_failed"]
] as const) {
  test(`D: ${label} → WebhookError(${reason})`, async () => {
    ws.setHttpsSenderForTesting(async () => ({ status: 200, body: body() }));
    await assert.rejects(
      ws.verifyWebhookCallback({ url: PUBLIC_CALLBACK, secret: newSecret() }, "p", "s"),
      (e: any) => e instanceof ws.WebhookError && e.reason === reason
    );
  });
}

test("D: non-2xx → http_status; timeout → timeout; network → unreachable", async () => {
  ws.setHttpsSenderForTesting(async () => ({ status: 500, body: "" }));
  await assert.rejects(ws.verifyWebhookCallback({ url: PUBLIC_CALLBACK, secret: newSecret() }, "p", "s"),
    (e: any) => e.reason === "http_status");
  ws.setHttpsSenderForTesting(async () => { throw new Error("Webhook request timed out"); });
  await assert.rejects(ws.verifyWebhookCallback({ url: PUBLIC_CALLBACK, secret: newSecret() }, "p", "s"),
    (e: any) => e.reason === "timeout");
  ws.setHttpsSenderForTesting(async () => { throw new Error("ECONNREFUSED"); });
  await assert.rejects(ws.verifyWebhookCallback({ url: PUBLIC_CALLBACK, secret: newSecret() }, "p", "s"),
    (e: any) => e.reason === "unreachable");
});

test("Security: SSRF/HTTPS rules still reject before any request is sent", async () => {
  ws.setHttpsSenderForTesting(async (r) => { captured.push(r); return { status: 200, body: "{}" }; });
  for (const url of [
    "http://93.184.215.14/cb",
    "https://127.0.0.1/cb",
    "https://10.0.0.5/cb",
    "https://192.168.1.10/cb",
    "https://169.254.169.254/latest",
    "https://203.0.113.10/cb",
    "https://[::1]/cb",
    "https://[::ffff:127.0.0.1]/cb",
    "https://93.184.215.14:8443/cb",
    "https://user:pass@93.184.215.14/cb",
    "not a url"
  ]) {
    await assert.rejects(
      ws.verifyWebhookCallback({ url, secret: newSecret() }, "p", "s"),
      (e: any) => e.reason === "invalid_callback_url",
      url
    );
  }
  assert.equal(captured.length, 0);
});

test("Security: secret format enforced (whsec_, 24–64 bytes)", () => {
  assert.throws(() => ws.validateWebhookSecret("plain"));
  assert.throws(() => ws.validateWebhookSecret(newSecret(16)));
  assert.throws(() => ws.validateWebhookSecret(newSecret(65)));
  ws.validateWebhookSecret(newSecret(24));
  ws.validateWebhookSecret(newSecret(64));
});

test("Delivery: envelope, headers and signature match the contract", async () => {
  const secret = newSecret();
  ws.setHttpsSenderForTesting(async (r) => { captured.push(r); return { status: 202, body: "" }; });
  const res = await ws.deliverWebhook({ url: PUBLIC_CALLBACK, secret }, "sub_1", {
    eventId: "evt_1", name: "mission.completed", timestamp: "2026-10-08T00:00:00.000Z",
    data: { mission_id: "m", session_id: "s", result: "ok" }, cursor: null
  });
  assert.equal(res.status, 202);
  const h = headersOf(captured[0]);
  assert.equal(h["webhook-id"], "evt_1");
  assert.equal(h["x-mcp-subscription-id"], "sub_1");
  assert.equal(h["content-type"], "application/json");
  new Webhook(secret).verify(captured[0].payload, h);
  assert.deepEqual(Object.keys(JSON.parse(captured[0].payload)).sort(),
    ["cursor", "data", "eventId", "name", "timestamp"]);
});

test("Delivery: dual signature only inside the rotation window", async () => {
  const oldSecret = newSecret();
  const secret = newSecret();
  ws.setHttpsSenderForTesting(async (r) => { captured.push(r); return { status: 200, body: "" }; });
  const event = { eventId: "evt_2", name: "mission.failed", timestamp: "t", data: {}, cursor: null };

  await ws.deliverWebhook({ url: PUBLIC_CALLBACK, secret, previousSecret: oldSecret,
    previousSecretExpiresAt: new Date(Date.now() + 60_000).toISOString() }, "s", event);
  const inWindow = headersOf(captured[0]);
  assert.equal(inWindow["webhook-signature"].split(" ").length, 2);
  new Webhook(oldSecret).verify(captured[0].payload, inWindow);
  new Webhook(secret).verify(captured[0].payload, inWindow);

  await ws.deliverWebhook({ url: PUBLIC_CALLBACK, secret, previousSecret: oldSecret,
    previousSecretExpiresAt: new Date(Date.now() - 1).toISOString() }, "s", event);
  const expired = headersOf(captured[1]);
  assert.equal(expired["webhook-signature"].split(" ").length, 1);
  assert.throws(() => new Webhook(oldSecret).verify(captured[1].payload, expired));
});

test("Delivery: body over 256 KiB is refused before sending", async () => {
  ws.setHttpsSenderForTesting(async (r) => { captured.push(r); return { status: 200, body: "" }; });
  await assert.rejects(ws.deliverWebhook({ url: PUBLIC_CALLBACK, secret: newSecret() }, "s", {
    eventId: "e", name: "n", timestamp: "t", data: { big: "x".repeat(262_145) }, cursor: null
  }), /256 KiB/);
  assert.equal(captured.length, 0);
});
