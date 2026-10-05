import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { z } from "zod/v4";
import fs from "node:fs";
import path from "node:path";

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

await serveStdio(() => {
  const server = new McpServer({
    name: "empresa-ia-opencode-adapter",
    version: "1.0.0",
  });


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

  console.error(`MCP OpenCode adapter ready; OpenCode=${BASE}`);
  return server;
});
