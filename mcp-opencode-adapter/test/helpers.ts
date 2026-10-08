// Shared fixtures for local, isolated tests. Nothing here talks to OpenCode,
// ChatGPT or any external host: the HTTPS hop is replaced by an in-process sender.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

export function isolateStateFiles(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-events-test-"));
  process.env.MCP_SUBSCRIPTIONS_FILE = path.join(dir, "subscriptions.json");
  process.env.MCP_EVENT_OUTBOX_FILE = path.join(dir, "outbox.json");
  return dir;
}

export function newSecret(bytes = 32): string {
  return "whsec_" + crypto.randomBytes(bytes).toString("base64");
}

// Public IP literal: passes the SSRF check without DNS. No socket is opened
// because tests always install a fake sender.
export const PUBLIC_CALLBACK = "https://93.184.215.14/mcp-events/callback";

export type CapturedRequest = {
  address: string;
  url: URL;
  headers: Record<string, string | number>;
  payload: string;
};

export function mcpEnvelope(method: string, params: Record<string, unknown> = {}) {
  return new Request("http://localhost/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-method": method,
      "mcp-protocol-version": "2026-07-28"
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      params: {
        ...params,
        _meta: {
          "io.modelcontextprotocol/protocolVersion": "2026-07-28",
          "io.modelcontextprotocol/clientCapabilities": {},
          "io.modelcontextprotocol/clientInfo": { name: "local-test", version: "1" }
        }
      }
    })
  });
}
