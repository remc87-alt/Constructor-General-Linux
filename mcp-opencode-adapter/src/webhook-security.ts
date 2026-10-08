import crypto from "node:crypto";
import dns from "node:dns/promises";
import https from "node:https";
import net from "node:net";
import ipaddr from "ipaddr.js";
import { Webhook } from "standardwebhooks";

const MAX_RESPONSE_BYTES = 64 * 1024;
const REQUEST_TIMEOUT_MS = 10_000;
const VERIFICATION_CACHE_TTL_MS = 10 * 60 * 1000;

const verifiedCallbacks = new Map<string, number>();

function verificationCacheKey(
  principal: string,
  callbackUrl: string
): string {
  return `${principal}\0${callbackUrl}`;
}

function isVerificationCached(
  principal: string,
  callbackUrl: string
): boolean {
  const key = verificationCacheKey(principal, callbackUrl);
  const expiresAt = verifiedCallbacks.get(key);

  if (!expiresAt) return false;

  if (expiresAt <= Date.now()) {
    verifiedCallbacks.delete(key);
    return false;
  }

  return true;
}

function cacheVerification(
  principal: string,
  callbackUrl: string
): void {
  const now = Date.now();

  for (const [key, expiresAt] of verifiedCallbacks) {
    if (expiresAt <= now) verifiedCallbacks.delete(key);
  }

  verifiedCallbacks.set(
    verificationCacheKey(principal, callbackUrl),
    now + VERIFICATION_CACHE_TTL_MS
  );
}

export type VerifiedDelivery = {
  url: string;
  secret: string;
  previousSecret?: string;
  previousSecretExpiresAt?: string;
};

// Categorized failure; `reason` is safe to expose as data.reason of -32015.
export class WebhookError extends Error {
  constructor(readonly reason: string, message: string) {
    super(message);
    this.name = "WebhookError";
  }
}

export type WebhookResponse = { status: number; body: string };

export type HttpsSender = (request: {
  address: string;
  url: URL;
  headers: Record<string, string | number>;
  payload: string;
}) => Promise<WebhookResponse>;

let sender: HttpsSender = httpsSend;

// Tests replace only the final socket hop; URL, SSRF and signing checks still run.
export function setHttpsSenderForTesting(fn: HttpsSender | null): void {
  sender = fn ?? httpsSend;
}

export function clearVerificationCacheForTesting(): void {
  verifiedCallbacks.clear();
}

function decodeWhsec(secret: string): Buffer {
  if (!secret.startsWith("whsec_")) {
    throw new Error("Webhook secret must start with whsec_");
  }

  const encoded = secret.slice("whsec_".length);

  let decoded: Buffer;
  try {
    decoded = Buffer.from(encoded, "base64");
  } catch {
    throw new Error("Invalid webhook secret encoding");
  }

  if (
    decoded.length < 24 ||
    decoded.length > 64 ||
    decoded.toString("base64").replace(/=+$/, "") !==
      encoded.replace(/=+$/, "")
  ) {
    throw new Error("Webhook secret must decode to 24-64 bytes");
  }

  return decoded;
}

function isPublicIp(address: string): boolean {
  if (!ipaddr.isValid(address)) return false;

  try {
    // process() normalizes IPv4-mapped IPv6 before classification.
    const parsed = ipaddr.process(address);
    return parsed.range() === "unicast";
  } catch {
    return false;
  }
}

async function resolvePublicAddresses(hostname: string): Promise<string[]> {
  if (net.isIP(hostname)) {
    if (!isPublicIp(hostname)) {
      throw new Error("Webhook destination must use a public IP");
    }
    return [hostname];
  }

  const records = await dns.lookup(hostname, {
    all: true,
    verbatim: true
  });

  if (!records.length) {
    throw new Error("Webhook destination did not resolve");
  }

  const addresses = records.map((r) => r.address);

  if (addresses.some((address) => !isPublicIp(address))) {
    throw new Error("Webhook destination resolved to a non-public IP");
  }

  return [...new Set(addresses)];
}

export function validateWebhookSecret(secret: string): void {
  decodeWhsec(secret);

  // Constructor validation also ensures Standard Webhooks accepts the secret.
  new Webhook(secret);
}

export async function validateWebhookUrl(rawUrl: string): Promise<URL> {
  let url: URL;

  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Invalid webhook URL");
  }

  if (url.protocol !== "https:") {
    throw new Error("Webhook URL must use HTTPS");
  }

  if (url.username || url.password) {
    throw new Error("Webhook URL must not contain credentials");
  }

  if (url.port && url.port !== "443") {
    throw new Error("Webhook URL must use HTTPS port 443");
  }

  await resolvePublicAddresses(url.hostname);
  return url;
}

async function signedPost(
  rawUrl: string,
  secret: string,
  messageId: string,
  payload: string,
  subscriptionId?: string,
  previousSecret?: string
): Promise<{ status: number; body: string }> {
  validateWebhookSecret(secret);
  const url = await validateWebhookUrl(rawUrl);

  // Resolve immediately before the actual connection.
  const addresses = await resolvePublicAddresses(url.hostname);
  const address = addresses[0];

  const timestamp = new Date();
  const webhook = new Webhook(secret);
  const signatures = [
    webhook.sign(messageId, timestamp, payload)
  ];

  if (previousSecret && previousSecret !== secret) {
    validateWebhookSecret(previousSecret);
    signatures.unshift(
      new Webhook(previousSecret).sign(
        messageId,
        timestamp,
        payload
      )
    );
  }

  const signature = signatures.join(" ");

  return sender({
    address,
    url,
    payload,
    headers: {
      Host: url.host,
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(payload),
      "webhook-id": messageId,
      "webhook-timestamp": Math.floor(
        timestamp.getTime() / 1000
      ).toString(),
      "webhook-signature": signature,
      ...(subscriptionId
        ? { "X-MCP-Subscription-Id": subscriptionId }
        : {})
    }
  });
}

function httpsSend({
  address,
  url,
  headers,
  payload
}: Parameters<HttpsSender>[0]): Promise<WebhookResponse> {
  return new Promise((resolve, reject) => {
    const request = https.request(
      {
        protocol: "https:",
        hostname: address,
        port: 443,
        method: "POST",
        path: `${url.pathname}${url.search}`,
        servername: url.hostname,
        headers,
        lookup: (_hostname, _options, callback) => {
          callback(null, address, net.isIP(address));
        },
        timeout: REQUEST_TIMEOUT_MS
      },
      (response) => {
        const status = response.statusCode ?? 0;

        // Redirects are never followed.
        if (status >= 300 && status < 400) {
          response.resume();
          reject(new Error("Webhook redirects are not allowed"));
          return;
        }

        const chunks: Buffer[] = [];
        let total = 0;

        response.on("data", (chunk: Buffer) => {
          total += chunk.length;

          if (total > MAX_RESPONSE_BYTES) {
            request.destroy(
              new Error("Webhook response exceeded size limit")
            );
            return;
          }

          chunks.push(chunk);
        });

        response.on("end", () => {
          resolve({
            status,
            body: Buffer.concat(chunks).toString("utf8")
          });
        });
      }
    );

    request.on("error", reject);

    request.on("timeout", () => {
      request.destroy(new Error("Webhook request timed out"));
    });

    request.end(payload);
  });
}

export async function verifyWebhookCallback(
  delivery: VerifiedDelivery,
  principal: string,
  subscriptionId: string
): Promise<void> {
  let callbackUrl: string;
  try {
    callbackUrl = (await validateWebhookUrl(delivery.url)).toString();
  } catch (e: any) {
    throw new WebhookError("invalid_callback_url", e?.message ?? String(e));
  }

  if (isVerificationCached(principal, callbackUrl)) {
    return;
  }

  const challenge = crypto.randomUUID();

  const payload = JSON.stringify({
    type: "verification",
    challenge
  });

  let response: WebhookResponse;
  try {
    response = await signedPost(
      callbackUrl,
      delivery.secret,
      `verify_${crypto.randomUUID()}`,
      payload,
      subscriptionId
    );
  } catch (e: any) {
    const message = e?.message ?? String(e);
    throw new WebhookError(
      /timed out/i.test(message) ? "timeout" : "unreachable",
      message
    );
  }

  if (response.status < 200 || response.status >= 300) {
    throw new WebhookError(
      "http_status",
      `Webhook callback verification failed with HTTP ${response.status}`
    );
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(response.body);
  } catch {
    throw new WebhookError(
      "challenge_failed",
      "Webhook callback verification returned invalid JSON"
    );
  }

  const echoed =
    typeof parsed === "object" && parsed !== null
      ? (parsed as { challenge?: unknown }).challenge
      : undefined;
  const expected = Buffer.from(challenge);
  const received = typeof echoed === "string" ? Buffer.from(echoed) : null;

  // Length check first: timingSafeEqual throws on unequal lengths.
  if (
    !received ||
    received.length !== expected.length ||
    !crypto.timingSafeEqual(received, expected)
  ) {
    throw new WebhookError(
      "challenge_failed",
      "Webhook callback challenge mismatch"
    );
  }

  cacheVerification(principal, callbackUrl);
}

export async function deliverWebhook(
  delivery: VerifiedDelivery,
  subscriptionId: string,
  event: {
    eventId: string;
    name: string;
    timestamp: string;
    data: unknown;
    cursor: string | null;
  }
): Promise<WebhookResponse> {
  const payload = JSON.stringify(event);

  if (Buffer.byteLength(payload) > 256 * 1024) {
    throw new Error("Webhook event exceeds 256 KiB");
  }

  // Dual-sign during the rotation window kept by events/subscribe.
  const previousSecret =
    delivery.previousSecret &&
    delivery.previousSecretExpiresAt &&
    Date.parse(delivery.previousSecretExpiresAt) > Date.now()
      ? delivery.previousSecret
      : undefined;

  return signedPost(
    delivery.url,
    delivery.secret,
    event.eventId,
    payload,
    subscriptionId,
    previousSecret
  );
}
