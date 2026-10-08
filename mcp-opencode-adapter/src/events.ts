import { McpServer, ProtocolError, ProtocolErrorCode } from "@modelcontextprotocol/server";
import { z } from "zod/v4";
import {
  subscriptionId,
  SubscriptionRecord,
  findSubscription,
  putSubscription,
  deleteSubscription
} from "./subscription-store.ts";
import {
  validateWebhookSecret,
  verifyWebhookCallback,
  WebhookError
} from "./webhook-security.ts";

// Principal for single-tenant deployment (no authentication in stdio)
export const PRINCIPAL = "empresa-ia-director-single-tenant";

export const CALLBACK_ENDPOINT_ERROR = -32015;

export const DEFAULT_SUBSCRIPTION_TTL_MS = 24 * 60 * 60 * 1000;
// The contract allows enforcing a minimum to prevent excessive refreshes.
export const MIN_SUBSCRIPTION_TTL_MS = 60 * 1000;

export const EVENT_NAMES = [
  "mission.completed",
  "mission.failed",
  "mission.blocked",
  "permission.required",
  "mission.turn_completed"
] as const;

// Bounded excerpt carried by mission.turn_completed; the full text stays in OpenCode.
export const TURN_RESULT_EXCERPT_MAX = 2000;

export type EventName = (typeof EVENT_NAMES)[number];

// MCP Events discovery contract.
// inputSchema = subscription arguments known before the event occurs.
// payloadSchema = event-specific data; timestamp belongs to the event envelope.
const missionSubscriptionSchema = {
  type: "object",
  properties: {
    mission_id: { type: "string" }
  },
  required: ["mission_id"],
  additionalProperties: false
};

function payloadSchema(extra: Record<string, { type: "string" }>) {
  return {
    type: "object",
    properties: {
      mission_id: { type: "string" },
      session_id: { type: "string" },
      ...extra
    },
    required: ["mission_id", "session_id", ...Object.keys(extra)],
    additionalProperties: false
  };
}

export const EVENT_DEFINITIONS = [
  {
    name: "mission.completed",
    description:
      "Mission accepted as completed. Not emitted by this adapter yet: an OpenCode turn ending (finish=stop) is not mission success, and success is decided only by the Director.",
    delivery: ["webhook"],
    inputSchema: missionSubscriptionSchema,
    payloadSchema: payloadSchema({ result: { type: "string" } })
  },
  {
    name: "mission.failed",
    description:
      "The mission's latest OpenCode turn ended with an error reported by OpenCode (technical turn failure; the Director decides whether the mission itself failed).",
    delivery: ["webhook"],
    inputSchema: missionSubscriptionSchema,
    payloadSchema: payloadSchema({ error: { type: "string" } })
  },
  {
    name: "mission.blocked",
    description:
      "The mission is waiting on input: OpenCode asked a question, or a provider retry requires user action.",
    delivery: ["webhook"],
    inputSchema: missionSubscriptionSchema,
    payloadSchema: payloadSchema({ reason: { type: "string" } })
  },
  {
    name: "permission.required",
    description: "OpenCode is waiting for an explicit permission reply for this mission.",
    delivery: ["webhook"],
    inputSchema: missionSubscriptionSchema,
    payloadSchema: payloadSchema({
      permission_id: { type: "string" },
      permission: { type: "string" }
    })
  },
  {
    name: "mission.turn_completed",
    description:
      "A technical OpenCode turn of this mission finished (session idle, final assistant message with finish=stop, no error, no pending permission or question) and its result is available for review. It does NOT mean the mission is completed, the goal is met, the result is approved, or that any further action is authorized; the Director evaluates it. turn_id is the OpenCode assistant message id; result_excerpt is bounded and redacted, use get_mission for the full latest result.",
    delivery: ["webhook"],
    inputSchema: missionSubscriptionSchema,
    payloadSchema: {
      type: "object",
      properties: {
        mission_id: { type: "string" },
        session_id: { type: "string" },
        turn_id: { type: "string" },
        result_excerpt: { type: "string", maxLength: TURN_RESULT_EXCERPT_MAX },
        result_truncated: { type: "boolean" }
      },
      required: ["mission_id", "session_id", "turn_id", "result_excerpt", "result_truncated"],
      additionalProperties: false
    }
  }
] as const;

export function isValidEventName(name: string): name is EventName {
  return (EVENT_NAMES as readonly string[]).includes(name);
}

// All events share the same subscription arguments.
const eventInputSchema = z.object({ mission_id: z.string().min(1) }).strict();

export const eventPayloadSchemas: Record<EventName, z.ZodTypeAny> = {
  "mission.completed": z.object({
    mission_id: z.string(),
    session_id: z.string(),
    result: z.string()
  }).strict(),
  "mission.failed": z.object({
    mission_id: z.string(),
    session_id: z.string(),
    error: z.string()
  }).strict(),
  "mission.blocked": z.object({
    mission_id: z.string(),
    session_id: z.string(),
    reason: z.string()
  }).strict(),
  "permission.required": z.object({
    mission_id: z.string(),
    session_id: z.string(),
    permission_id: z.string(),
    permission: z.string()
  }).strict(),
  "mission.turn_completed": z.object({
    mission_id: z.string(),
    session_id: z.string(),
    turn_id: z.string().min(1),
    result_excerpt: z.string().max(TURN_RESULT_EXCERPT_MAX),
    result_truncated: z.boolean()
  }).strict()
};

function invalidParams(message: string): ProtocolError {
  return new ProtocolError(ProtocolErrorCode.InvalidParams, message);
}

function parseSubscriptionTarget(name: string, args: unknown) {
  if (!isValidEventName(name)) {
    throw invalidParams(`Unknown event name: ${name}`);
  }

  const parsed = eventInputSchema.safeParse(args);
  if (!parsed.success) {
    throw invalidParams(`Invalid arguments for event ${name}: ${parsed.error.message}`);
  }

  return { event: name, args: parsed.data };
}

export function grantedTtlMs(ttlMs: number | null | undefined): number | null {
  if (ttlMs === null) return null;
  if (ttlMs === undefined) return DEFAULT_SUBSCRIPTION_TTL_MS;
  return Math.max(ttlMs, MIN_SUBSCRIPTION_TTL_MS);
}

export type EventHandlerOptions = {
  // Invoked after a subscription is verified and persisted (never on failure).
  onSubscribed?: (missionId: string, name: EventName) => void;
};

export function registerEventHandlers(server: McpServer, opts: EventHandlerOptions = {}): void {
  server.server.setRequestHandler("events/list", {
    params: z.object({}),
    result: z.object({
      events: z.array(
        z.object({
          name: z.string(),
          description: z.string(),
          delivery: z.array(z.literal("webhook")),
          inputSchema: z.any(),
          payloadSchema: z.any()
        })
      )
    })
  }, async (_params, _ctx) => {
    return { events: EVENT_DEFINITIONS.map((e) => ({ ...e, delivery: [...e.delivery] })) };
  });

  // events/subscribe handler
  server.server.setRequestHandler("events/subscribe", {
    params: z.object({
      name: z.string(),
      arguments: z.any(),
      delivery: z.object({
        mode: z.literal("webhook"),
        url: z.string(),
        secret: z.string()
      }),
      cursor: z.union([z.string(), z.null()]).optional(),
      ttlMs: z.union([z.number().int().nonnegative(), z.null()]).optional()
    })
  }, async (params, _ctx) => {
    const { name, delivery, ttlMs } = params;
    const { event, args } = parseSubscriptionTarget(name, params.arguments);

    try {
      validateWebhookSecret(delivery.secret);
    } catch (e: any) {
      throw invalidParams(`Invalid webhook secret: ${e.message}`);
    }

    const identity = {
      principal: PRINCIPAL,
      name,
      arguments: args,
      callbackUrl: delivery.url
    };
    const id = subscriptionId(identity);

    const ttl = grantedTtlMs(ttlMs);
    const expiresAt = ttl === null ? null : new Date(Date.now() + ttl).toISOString();
    const refreshBefore = expiresAt;

    // Verify the callback before persisting anything.
    try {
      await verifyWebhookCallback(
        { url: delivery.url, secret: delivery.secret },
        PRINCIPAL,
        id
      );
    } catch (e: any) {
      const reason = e instanceof WebhookError ? e.reason : "verification_error";
      throw new ProtocolError(
        CALLBACK_ENDPOINT_ERROR,
        `Callback endpoint error: ${e?.message ?? String(e)}`,
        { reason }
      );
    }

    const now = new Date().toISOString();
    const existing = findSubscription(identity);

    if (existing) {
      // Refresh: rotate secret (keeping the old one briefly), renew TTL.
      const rotated = existing.delivery.secret !== delivery.secret;

      existing.delivery = {
        mode: delivery.mode,
        url: delivery.url,
        secret: delivery.secret,
        previousSecret: rotated
          ? existing.delivery.secret
          : existing.delivery.previousSecret,
        previousSecretExpiresAt: rotated
          ? new Date(Date.now() + 5 * 60 * 1000).toISOString()
          : existing.delivery.previousSecretExpiresAt
      };
      existing.cursor = null;
      existing.expiresAt = expiresAt;
      existing.refreshBefore = refreshBefore;
      existing.updatedAt = now;
      putSubscription(existing);
    } else {
      const record: SubscriptionRecord = {
        id,
        principal: PRINCIPAL,
        name,
        arguments: args,
        delivery: {
          mode: delivery.mode,
          url: delivery.url,
          secret: delivery.secret
        },
        cursor: null,
        expiresAt,
        refreshBefore,
        createdAt: now,
        updatedAt: now
      };
      putSubscription(record);
    }

    opts.onSubscribed?.(args.mission_id, event);

    // Events are not replayable: cursor is always null.
    return {
      id,
      refreshBefore,
      cursor: null,
      truncated: false
    };
  });

  // events/unsubscribe handler
  server.server.setRequestHandler("events/unsubscribe", {
    params: z.object({
      name: z.string(),
      arguments: z.any(),
      delivery: z.object({
        mode: z.literal("webhook"),
        url: z.string()
        // secret not required for unsubscription
      })
    })
  }, async (params, _ctx) => {
    const { name, delivery } = params;
    const { args } = parseSubscriptionTarget(name, params.arguments);

    try {
      new URL(delivery.url);
    } catch {
      throw invalidParams("Invalid webhook URL");
    }

    // Idempotent: deleting a missing subscription is not an error.
    deleteSubscription(subscriptionId({
      principal: PRINCIPAL,
      name,
      arguments: args,
      callbackUrl: delivery.url
    }));

    return {};
  });
}
