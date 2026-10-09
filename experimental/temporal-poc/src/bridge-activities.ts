import fs from "node:fs";
import os from "node:os";
import { createRequire } from "node:module";

// T4: return path through the EXISTING bridge code (adapter-instance copy):
// subscription store, MissionEventEmitter (real OpenCode-derived turn
// classification), durable outbox and Standard Webhooks signing. Only the
// final socket hop is replaced by an in-process experimental receiver: the
// adapter's SSRF guard forbids local HTTPS receivers by design, and real
// delivery to ChatGPT needs the tunnel (not authorized here).

const ROOT = `${os.homedir()}/.local/state/constructor-temporal-poc`;
const ADAPTER = `${ROOT}/adapter-instance`;
const STATE = `${ADAPTER}/state`;
const RECEIVER_LOG = `${ROOT}/logs/t4-receiver.jsonl`;
const CALLBACK = "https://93.184.215.14/poc-temporal-receiver"; // never contacted (sender replaced)
const { Webhook } = createRequire(`${ADAPTER}/package.json`)("standardwebhooks");

// The adapter modules read their state paths from env at import time.
async function bridge() {
  process.env.MCP_SUBSCRIPTIONS_FILE = `${STATE}/subscriptions.json`;
  process.env.MCP_EVENT_OUTBOX_FILE = `${STATE}/event-outbox.json`;
  const [store, events, emitterMod, ws] = await Promise.all([
    import(`${ADAPTER}/src/subscription-store.ts`),
    import(`${ADAPTER}/src/events.ts`),
    import(`${ADAPTER}/src/event-emitter.ts`),
    import(`${ADAPTER}/src/webhook-security.ts`)
  ]);
  return { store, events, emitterMod, ws };
}

const secretFile = (subId: string) => `${STATE}/receiver-${subId}.secret`;

export async function bridgeSubscribe(input: { missionId: string }) {
  const { store, events } = await bridge();
  const name = "mission.turn_completed";
  const identity = { principal: events.PRINCIPAL, name, arguments: { mission_id: input.missionId }, callbackUrl: CALLBACK };
  const id = store.subscriptionId(identity);
  if (!store.findSubscription(identity)) {
    const secret = "whsec_" + Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64");
    fs.writeFileSync(secretFile(id), secret, { mode: 0o600 });
    const now = new Date().toISOString();
    store.putSubscription({
      id, principal: events.PRINCIPAL, name, arguments: { mission_id: input.missionId },
      delivery: { mode: "webhook", url: CALLBACK, secret }, cursor: null,
      expiresAt: new Date(Date.now() + 24 * 3600_000).toISOString(), refreshBefore: null,
      createdAt: now, updatedAt: now
    });
  }
  return { subscriptionId: id, event: name, challengeVerification: "skipped: in-process receiver" };
}

// Runs the adapter's own emitter against the real POC OpenCode state and
// delivers into the in-process receiver, which verifies the signature.
export async function bridgeEmit(input: { missionId: string }) {
  const { emitterMod, ws } = await bridge();
  const password = fs.readFileSync(`${ROOT}/run/opencode-t3.password`, "utf8").trim();
  const oc = async (route: string) => {
    const r = await fetch(`http://127.0.0.1:4098${route}`, {
      headers: { Authorization: "Basic " + Buffer.from(`opencode:${password}`).toString("base64") }
    });
    if (!r.ok) throw new Error(`OpenCode ${route} HTTP ${r.status}`);
    const t = await r.text();
    return t ? JSON.parse(t) : null;
  };
  const missions = () => JSON.parse(fs.readFileSync(`${ADAPTER}/.mission-map.json`, "utf8"));
  ws.setHttpsSenderForTesting(async (req: any) => {
    const headers = Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k.toLowerCase(), String(v)]));
    const subId = headers["x-mcp-subscription-id"];
    let verified = false;
    try { new Webhook(fs.readFileSync(secretFile(subId), "utf8")).verify(req.payload, headers); verified = true; } catch {}
    fs.appendFileSync(RECEIVER_LOG, JSON.stringify({
      receivedAt: new Date().toISOString(), webhookId: headers["webhook-id"], subscriptionId: subId,
      signatureVerified: verified, body: JSON.parse(req.payload)
    }) + "\n", { mode: 0o600 });
    return { status: verified ? 202 : 401, body: "" };
  });
  try {
    const emitter = new emitterMod.MissionEventEmitter({ oc, missions, log: () => {} });
    const outcomes = await emitter.evaluateMission(input.missionId);
    await emitter.settled();
    const records = emitter.outbox.all().filter((r: any) => r.missionId === input.missionId)
      .map((r: any) => ({ eventId: r.eventId, name: r.name, status: r.status, attempts: r.attempts, turnId: r.data.turn_id }));
    emitter.outbox.releaseLock();
    return { outcomes, outboxRecords: records };
  } finally {
    ws.setHttpsSenderForTesting(null);
  }
}
