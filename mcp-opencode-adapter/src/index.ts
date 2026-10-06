import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { z } from "zod/v4";
import fs from "node:fs";
import path from "node:path";
import { subscriptionId, loadSubscriptions, saveSubscriptions, SubscriptionRecord, SubscriptionDelivery, findSubscription, putSubscription, deleteSubscription } from "./subscription-store.ts";
import { validateWebhookSecret, verifyWebhookCallback, Webhook } from "./webhook-security.ts";
import { ProtocolError } from "@modelcontextprotocol/server";

const BASE = process.env.OPENCODE_URL ?? "http://127.0.0.1:4096";
const STATE_FILE = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "..",
  ".mission-map.json"
);

type MissionMap = Record<string, { session_id: string; title: string }>;

function loadState(): MissionMap {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {
    return {};
  }
}

function saveState(state: MissionMap) {
  const tmp = STATE_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, STATE_FILE);
}

const missions = loadState();

function result(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data) }],
  };
}

function toolError(message: string) {
  return {
    isError: true,
    content: [{
      type: "text" as const,
      text: JSON.stringify({ error: message }),
    }],
  };
}

async function oc(route: string, init: RequestInit = {}) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string> ?? {}),
  };

  const password = process.env.OPENCODE_SERVER_PASSWORD;
  if (password) {
    headers.Authorization =
      "Basic " + Buffer.from(`opencode:${password}`).toString("base64");
  }

  const response = await fetch(BASE + route, { ...init, headers });
  const raw = await response.text();

  if (!response.ok) {
    throw new Error(
      `OpenCode HTTP ${response.status}: ${raw.slice(0, 800)}`
    );
  }

  if (!raw.trim()) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function textParts(message: any): string {
  return (message?.parts ?? [])
    .filter((p: any) => p?.type === "text" && typeof p.text === "string")
    .map((p: any) => p.text)
    .join("\n")
    .trim();
}

function latestAssistant(messages: any[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    const role = m?.info?.role ?? m?.role;
    if (role === "assistant") {
      const text = textParts(m);
      if (text) return text;
    }
  }
  return null;
}

function statusFor(sessionID: string, statuses: any): string {
  const s = statuses?.[sessionID];
  if (!s) return "idle";

  const type =
    typeof s === "string"
      ? s
      : s?.type ?? s?.status ?? s?.state ?? "unknown";

  if (["busy", "running", "working"].includes(String(type).toLowerCase())) {
    return "running";
  }

  return String(type);
}

const health = await oc("/global/health");
if (!health?.healthy) {
  throw new Error("OpenCode health check failed");
}
console.error(`OpenCode health PASS; version=${health.version ?? "unknown"}`);

  // Function to create the MCP server with all handlers
  function createMcpServer() {
    const server = new McpServer(
      { name: "empresa-ia-opencode-adapter", version: "1.0.0" },
      {
        supportedProtocolVersions: ["2026-07-28"],
        capabilities: {
          events: {}
        }
      }
    );

    server.registerTool(
      "start_mission",
      {
        description: "Create a persistent OpenCode mission and start it asynchronously.",
        inputSchema: {
          mission_id: z.string().min(1).optional(),
          title: z.string().min(1),
          prompt: z.string().min(1),
        },
      },
      async ({ mission_id, title, prompt }) => {
        try {
          const id =
            mission_id ??
            `mission-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

          if (missions[id]) {
            return toolError(`mission_id already exists: ${id}`);
          }

          const session = await oc("/session", {
            method: "POST",
            body: JSON.stringify({ title }),
          });

          const sessionID = session?.id ?? session?.sessionID;

          if (!sessionID) {
            return toolError("OpenCode created no session_id");
          }

          missions[id] = { session_id: sessionID, title };
          saveState(missions);

          await oc(`/session/${encodeURIComponent(sessionID)}/prompt_async`, {
            method: "POST",
            body: JSON.stringify({
              model: {
                providerID: "freellmapi",
                modelID: "nemotron-3-super-120b",
              },
              parts: [{ type: "text", text: prompt }],
            }),
          });

          return result({
            mission_id: id,
            session_id: sessionID,
            status: "running",
          });
        } catch (e: any) {
          console.error("start_mission:", e?.message ?? e);
          return toolError(e?.message ?? String(e));
        }
      }
    );


    server.registerTool(
      "continue_mission",
      {
        description: "Continue the exact same persistent OpenCode session.",
        inputSchema: {
          mission_id: z.string().min(1),
          prompt: z.string().min(1),
        },
      },
      async ({ mission_id, prompt }) => {
        try {
          const mission = missions[mission_id];

          if (!mission) {
            return toolError(`unknown mission_id: ${mission_id}`);
          }

          await oc(
            `/session/${encodeURIComponent(mission.session_id)}/prompt_async`,
            {
              method: "POST",
              body: JSON.stringify({
                model: {
                  providerID: "freellmapi",
                  modelID: "nemotron-3-super-120b",
                },
                parts: [{ type: "text", text: prompt }],
              }),
            }
          );

          return result({
            mission_id,
            session_id: mission.session_id,
            status: "running",
          });
        } catch (e: any) {
          console.error("continue_mission:", e?.message ?? e);
          return toolError(e?.message ?? String(e));
        }
      }
    );


    server.registerTool(
      "get_mission",
      {
        description: "Read mission state, latest assistant result and pending permissions.",
        inputSchema: {
          mission_id: z.string().min(1),
        },
      },
      async ({ mission_id }) => {
        try {
          const mission = missions[mission_id];

          if (!mission) {
            return toolError(`unknown mission_id: ${mission_id}`);
          }

          const [statuses, messages, permissions] = await Promise.all([
            oc("/session/status"),
            oc(`/session/${encodeURIComponent(mission.session_id)}/message`),
            oc("/permission"),
          ]);

          const pending = Array.isArray(permissions)
            ? permissions
                .filter(
                  (p: any) =>
                    (p?.sessionID ?? p?.session_id) === mission.session_id
                )
                .map((p: any) => ({
                  permission_id: p?.id ?? p?.permissionID,
                  permission: p?.permission,
                  patterns: p?.patterns,
                  metadata: p?.metadata,
                }))
            : [];

          return result({
            mission_id,
            session_id: mission.session_id,
            status: statusFor(mission.session_id, statuses),
            text: Array.isArray(messages) ? latestAssistant(messages) : null,
            permission_requests: pending,
          });
        } catch (e: any) {
          console.error("get_mission:", e?.message ?? e);
          return toolError(e?.message ?? String(e));
        }
      }
    );


    server.registerTool(
      "reply_permission",
      {
        description: "Reply only to a permission request already emitted by OpenCode.",
        inputSchema: {
          mission_id: z.string().min(1),
          permission_id: z.string().min(1),
          decision: z.enum(["once", "reject"]),
        },
      },
      async ({ mission_id, permission_id, decision }) => {
        try {
          const mission = missions[mission_id];

          if (!mission) {
            return toolError(`unknown mission_id: ${mission_id}`);
          }

          await oc(
            `/session/${encodeURIComponent(mission.session_id)}/permissions/${encodeURIComponent(permission_id)}`,
            {
              method: "POST",
              body: JSON.stringify({ response: decision }),
            }
          );

          return result({
            mission_id,
            session_id: mission.session_id,
            permission_id,
            decision,
            status: "accepted",
          });
        } catch (e: any) {
          console.error("reply_permission:", e?.message ?? e);
          return toolError(e?.message ?? String(e));
        }
      }
    );

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
      return {
      events: [
        {
          name: "mission.completed",
          description: "Mission completed successfully",
          delivery: ["webhook"],
          inputSchema: missionSubscriptionSchema,
          payloadSchema: {
            type: "object",
            properties: {
              mission_id: { type: "string" },
              session_id: { type: "string" },
              result: { type: "string" }
            },
            required: ["mission_id", "session_id", "result"],
            additionalProperties: false
          }
        },
        {
          name: "mission.failed",
          description: "Mission failed",
          delivery: ["webhook"],
          inputSchema: missionSubscriptionSchema,
          payloadSchema: {
            type: "object",
            properties: {
              mission_id: { type: "string" },
              session_id: { type: "string" },
              error: { type: "string" }
            },
            required: ["mission_id", "session_id", "error"],
            additionalProperties: false
          }
        },
        {
          name: "mission.blocked",
          description: "Mission blocked",
          delivery: ["webhook"],
          inputSchema: missionSubscriptionSchema,
          payloadSchema: {
            type: "object",
            properties: {
              mission_id: { type: "string" },
              session_id: { type: "string" },
              reason: { type: "string" }
            },
            required: ["mission_id", "session_id", "reason"],
            additionalPrivileges: false
          }
        },
        {
          name: "permission.required",
          description: "Mission requires explicit user permission",
          delivery: ["webhook"],
          inputSchema: missionSubscriptionSchema,
          payloadSchema: {
            type: "object",
            properties: {
              mission_id: { type: "string" },
              session_id: { type: "string" },
              permission_id: { type: "string" },
              permission: { type: "string" }
            },
            required: ["mission_id", "session_id", "permission_id", "permission"],
            additionalProperties: false
          }
        }
      ]
      };
    });

    // Principal for single-tenant deployment (no authentication in stdio)
    const PRINCIPAL = "empresa-ia-director-single-tenant";

    // Helper to validate event name
    function isValidEventName(name: string): boolean {
      return ["mission.completed", "mission.failed", "mission.blocked", "permission.required"].includes(name);
    }

    // Helper to get input schema for an event (all share mission_id)
    function getEventInputSchema(name: string): z.ZodTypeAny {
      // All events have the same inputSchema: mission_id string, no extra props
      return z.object({
        mission_id: z.string()
      }).strict();
    }

    // Helper to get payload schema for an event
    function getEventPayloadSchema(name: string): z.ZodTypeAny {
      switch (name) {
        case "mission.completed":
          return z.object({
            mission_id: z.string(),
            session_id: z.string(),
            result: z.string()
          }).strict();
        case "mission.failed":
          return z.object({
            mission_id: z.string(),
            session_id: z.string(),
            error: z.string()
          }).strict();
        case "mission.blocked":
          return z.object({
            mission_id: z.string(),
            session_id: z.string(),
            reason: z.string()
          }).strict();
        case "permission.required":
          return z.object({
            mission_id: z.string(),
            session_id: z.string(),
            permission_id: z.string(),
            permission: z.string()
          }).strict();
        default:
          // Should not happen due to validation
          return z.unknown();
      }
    }

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
    }, async (params, ctx) => {
      const { name, arguments: args, delivery, cursor, ttlMs } = params;

      // Validate event name
      if (!isValidEventName(name)) {
        throw new ProtocolError(ProtocolErrorCode.InvalidParams, `Unknown event name: ${name}`);
      }

      // Validate arguments against event's inputSchema
      const inputSchema = getEventInputSchema(name);
      const parseResult = inputSchema.safeParse(args);
      if (!parseResult.success) {
        throw new ProtocolError(ProtocolErrorCode.InvalidParams, `Invalid arguments for event ${name}: ${parseResult.error.message}`);
      }

      // Validate delivery
      if (delivery.mode !== "webhook") {
        throw new ProtocolError(ProtocolErrorCode.InvalidParams, `Only webhook delivery mode is supported`);
      }
      // Validate secret
      try {
        validateWebhookSecret(delivery.secret);
      } catch (e: any) {
        throw new ProtocolError(ProtocolErrorCode.InvalidParams, `Invalid webhook secret: ${e.message}`);
      }

      // Compute subscription ID
      const id = subscriptionId({
        principal: PRINCIPAL,
        name,
        arguments: args,
        callbackUrl: delivery.url
      });

      // Determine expiration and refresh times
      const DEFAULT_SUBSCRIPTION_TTL_MS = 24 * 60 * 60 * 1000;
      let expiresAt: string | null = null;
      let refreshBefore: string | null = null;

      if (ttlMs !== null) {
        const grantedTtlMs =
          ttlMs === undefined ? DEFAULT_SUBSCRIPTION_TTL_MS : ttlMs;
        expiresAt = new Date(Date.now() + grantedTtlMs).toISOString();
        refreshBefore = expiresAt;
      }

      // Build subscription record
      const record: SubscriptionRecord = {
        id,
        principal: PRINCIPAL,
        name,
        arguments: args,
        delivery: {
          mode: delivery.mode,
          url: delivery.url,
          secret: delivery.secret,
          // previousSecret and previousSecretExpiresAt will be handled on update if needed
        },
        cursor: null,
        expiresAt,
        refreshBefore,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      // Before persisting, verify the webhook callback
      try {
        await verifyWebhookCallback(
          { url: delivery.url, secret: delivery.secret },
          PRINCIPAL,
          id
        );
      } catch (e: any) {
        // If verification fails, return CallbackEndpointError (-32015)
        throw new ProtocolError(-32015, `Callback endpoint error: ${e.message}`);
      }

      // Check if subscription already exists (update case)
      const existing = findSubscription({
        principal: PRINCIPAL,
        name,
        arguments: args,
        callbackUrl: delivery.url
      });

      if (existing) {
        // Update existing record with new values (may have changed secret, cursor, ttlMs)
        const previousSecret =
          existing.delivery.secret !== delivery.secret
            ? existing.delivery.secret
            : existing.delivery.previousSecret;

        existing.delivery = {
          mode: delivery.mode,
          url: delivery.url,
          secret: delivery.secret,
          previousSecret,
          previousSecretExpiresAt:
            previousSecret
              ? new Date(Date.now() + 5 * 60 * 1000).toISOString()
              : existing.delivery.previousSecretExpiresAt
        };
        existing.cursor = null;
        existing.expiresAt = expiresAt;
        existing.refreshBefore = refreshBefore;
        existing.updatedAt = new Date().toISOString();
        putSubscription(existing);
      } else {
        putSubscription(record);
      }

      // Return subscription result
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
    }, async (params, ctx) => {
      const { name, arguments: args, delivery } = params;

      // Validate event name
      if (!isValidEventName(name)) {
        throw new ProtocolError(ProtocolErrorCode.InvalidParams, `Unknown event name: ${name}`);
      }

      // Validate arguments (same as subscribe)
      const inputSchema = getEventInputSchema(name);
      const parseResult = inputSchema.safeParse(args);
      if (!parseResult.success) {
        throw new ProtocolError(ProtocolErrorCode.InvalidParams, `Invalid arguments for event ${name}: ${parseResult.error.message}`);
      }

      // Validate delivery
      if (delivery.mode !== "webhook") {
        throw new ProtocolError(ProtocolErrorCode.InvalidParams, `Only webhook delivery mode is supported`);
      }
      // URL validation (basic)
      try {
        new URL(delivery.url);
      } catch {
        throw new ProtocolError(ProtocolErrorCode.InvalidParams, `Invalid webhook URL`);
      }

      // Compute subscription ID (same as subscribe)
      const id = subscriptionId({
        principal: PRINCIPAL,
        name,
        arguments: args,
        callbackUrl: delivery.url
      });

      // Delete subscription (idempotent)
      deleteSubscription(id);

      // Return empty result
      return {};
    });

    console.error(`MCP OpenCode adapter ready; OpenCode=${BASE}`);
    return server;
  }

  // Check for HTTP mode
  if (process.env.MCP_TRANSPORT === "http") {
    // Import HTTP modules
    const { createMcpHandler } = await import("@modelcontextprotocol/server");
    const http = await import("node:http");

    const handler = createMcpHandler(() => createMcpServer());

    const port = 3000; // We can make this configurable via env if needed, but for now fixed
    const httpServer = http.createServer(async (req, res) => {
      // We only handle POST to /mcp for MCP over HTTP
      if (req.method !== "POST" || req.url !== "/mcp") {
        res.writeHead(404);
        res.end("Not Found");
        return;
      }

      try {
        // Read the request body
        let body = "";
        for await (const chunk of req) {
          body += chunk;
        }

        // Create a Request object for the handler
        const init: RequestInit = {
          method: req.method,
          headers: req.headers as unknown as Headers,
          body: body
        };

        const request = new Request("http://localhost/mcp", init);

        const response = await handler.fetch(request);

        // Write the response
        const responseText = await response.text();

        response.headers.forEach((value, name) => {
          res.setHeader(name, value);
        });

        if (responseText && !res.hasHeader("content-type")) {
          res.setHeader("content-type", "application/json");
        }

        res.statusCode = response.status;
        res.end(responseText);
      } catch (error) {
        console.error("HTTP handler error:", error);
        res.writeHead(500);
        res.end("Internal Server Error");
      }
    });

    httpServer.listen(port, "127.0.0.1", () => {
      console.error(`MCP HTTP server listening on http://127.0.0.1:${port}/mcp`);
    });
  } else {
    // Default to stdio
    await serveStdio(() => createMcpServer());
  }
