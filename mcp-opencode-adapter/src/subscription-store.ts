import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export type SubscriptionDelivery = {
  mode: "webhook";
  url: string;
  secret: string;
  previousSecret?: string;
  previousSecretExpiresAt?: string;
};

export type SubscriptionRecord = {
  id: string;
  principal: string;
  name: string;
  arguments: Record<string, unknown>;
  delivery: SubscriptionDelivery;
  cursor: string | null;
  expiresAt: string | null;
  refreshBefore: string | null;
  createdAt: string;
  updatedAt: string;
};

type SubscriptionState = Record<string, SubscriptionRecord>;

const SUBSCRIPTIONS_FILE = process.env.MCP_SUBSCRIPTIONS_FILE ?? path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "..",
  ".subscriptions.json"
);

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonicalize(item)])
    );
  }

  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function subscriptionId(input: {
  principal: string;
  name: string;
  arguments: Record<string, unknown>;
  callbackUrl: string;
}): string {
  const identity = canonicalJson({
    principal: input.principal,
    callbackUrl: input.callbackUrl,
    name: input.name,
    arguments: input.arguments
  });

  return "sub_" +
    crypto.createHash("sha256").update(identity).digest("hex").slice(0, 32);
}

export function loadSubscriptions(): SubscriptionState {
  try {
    const parsed = JSON.parse(
      fs.readFileSync(SUBSCRIPTIONS_FILE, "utf8")
    );

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Invalid subscription state");
    }

    return parsed as SubscriptionState;
  } catch (error: any) {
    if (error?.code === "ENOENT") return {};
    throw error;
  }
}

export function saveSubscriptions(state: SubscriptionState): void {
  const tmp = SUBSCRIPTIONS_FILE + ".tmp";

  fs.writeFileSync(
    tmp,
    JSON.stringify(state, null, 2),
    { mode: 0o600 }
  );

  fs.renameSync(tmp, SUBSCRIPTIONS_FILE);
}

export function putSubscription(record: SubscriptionRecord): void {
  const state = loadSubscriptions();
  state[record.id] = record;
  saveSubscriptions(state);
}

export function deleteSubscription(id: string): boolean {
  const state = loadSubscriptions();

  if (!(id in state)) return false;

  delete state[id];
  saveSubscriptions(state);
  return true;
}

export function findSubscription(input: {
  principal: string;
  name: string;
  arguments: Record<string, unknown>;
  callbackUrl: string;
}): SubscriptionRecord | undefined {
  const id = subscriptionId(input);
  return loadSubscriptions()[id];
}

export function subscriptionsFile(): string {
  return SUBSCRIPTIONS_FILE;
}

// Subscriptions still allowed to receive deliveries (not expired).
export function activeSubscriptions(now = Date.now()): SubscriptionRecord[] {
  return Object.values(loadSubscriptions()).filter(
    (s) => s.expiresAt === null || Date.parse(s.expiresAt) > now
  );
}
