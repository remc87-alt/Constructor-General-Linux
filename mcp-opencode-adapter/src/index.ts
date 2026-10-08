import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { z } from "zod/v4";
import fs from "node:fs";
import path from "node:path";
import { registerEventHandlers } from "./events.ts";
import { latestAssistant, MissionEventEmitter, runOpenCodeEventStream } from "./event-emitter.ts";

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

function authHeaders(): Record<string, string> {
  const password = process.env.OPENCODE_SERVER_PASSWORD;
  return password
    ? { Authorization: "Basic " + Buffer.from(`opencode:${password}`).toString("base64") }
    : {};
}

async function oc(route: string, init: RequestInit = {}) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string> ?? {}),
  };

  Object.assign(headers, authHeaders());

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

// MCP Events emitter: listens to OpenCode's own event stream inside this
// process (no extra process, no polling). Opt-in: MCP_EVENTS_EMITTER=on.
let emitter: MissionEventEmitter | null = null;
if (process.env.MCP_EVENTS_EMITTER === "on") {
  try {
    emitter = new MissionEventEmitter({ oc, missions: () => missions });
  } catch (e: any) {
    // e.g. OutboxLockedError: another live adapter owns the outbox.
    console.error(`MCP Events emitter disabled: ${e?.message ?? e}`);
  }
}
console.error(`MCP Events emitter ${emitter ? "ENABLED" : "disabled (set MCP_EVENTS_EMITTER=on)"}`);
if (emitter) {
  const active = emitter;
  // Durable recovery even if the OpenCode stream never connects.
  active.resumePending().catch((e) => console.error(`resume pending failed: ${e?.message ?? e}`));
  void runOpenCodeEventStream({ url: BASE + "/event", headers: authHeaders(), emitter: active });
}

  // Function to create the MCP server with all handlers
  function createMcpServer() {
    const server = new McpServer(
      { name: "empresa-ia-opencode-adapter", version: "1.0.0" },
      {
        supportedProtocolVersions: ["2026-07-28"],
        capabilities: {
          // @ts-expect-error SDK 2.3.1 types lack the draft MCP Events capability; it is advertised at runtime (test/events.test.ts).
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

    registerEventHandlers(server, {
      // Notify still-pending permissions/questions right after subscribing.
      // Deferred so the subscribe response is sent first.
      onSubscribed: (missionId) => {
        if (!emitter) return;
        setTimeout(() => {
          emitter.evaluatePending(missionId).catch((e) =>
            console.error(`post-subscribe evaluation failed: ${e?.message ?? e}`)
          );
        }, 1000).unref();
      }
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
