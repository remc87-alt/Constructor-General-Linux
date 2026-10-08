// Boots the real entrypoint (src/index.ts) over STDIO against a local OpenCode
// stand-in on 127.0.0.1. Never touches the operational OpenCode or tunnel.
import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import path from "node:path";
import { spawn } from "node:child_process";
import { isolateStateFiles } from "./helpers.ts";

// These tests boot the real entrypoint, whose OpenCode health check uses HTTP:
// they need loopback TCP. In sandboxes without it they are skipped, not passed.
async function loopbackAvailable(): Promise<boolean> {
  const server = http.createServer((_q, r) => r.end("ok"));
  try {
    await new Promise<void>((ok, ko) => { server.once("error", ko); server.listen(0, "127.0.0.1", ok); });
    const port = (server.address() as any).port;
    const res = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(2000) });
    return (await res.text()) === "ok";
  } catch {
    return false;
  } finally {
    server.close();
  }
}
const SKIP = (await loopbackAvailable()) ? false : "requires loopback TCP on 127.0.0.1 (unavailable in this sandbox)";

async function boot(emitterFlag: string | undefined) {
  const seen: string[] = [];
  const fake = http.createServer((req, res) => {
    seen.push(req.url!);
    if (req.url === "/global/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ healthy: true, version: "fake" }));
    } else if (req.url === "/event") {
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.write('data: {"type":"server.connected","properties":{}}\n\n');
    } else {
      res.writeHead(404).end();
    }
  });
  await new Promise<void>((r) => fake.listen(0, "127.0.0.1", r));
  const port = (fake.address() as any).port;

  const root = path.resolve(import.meta.dirname, "..");
  const child = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
    cwd: root,
    env: { ...process.env, OPENCODE_URL: `http://127.0.0.1:${port}`, MCP_TRANSPORT: "", MCP_EVENTS_EMITTER: emitterFlag },
    stdio: ["pipe", "pipe", "pipe"]
  });
  let stderr = "";
  child.stderr.on("data", (d) => (stderr += d));
  let stdout = "";
  child.stdout.on("data", (d) => (stdout += d));

  const meta = {
    "io.modelcontextprotocol/protocolVersion": "2026-07-28",
    "io.modelcontextprotocol/clientCapabilities": {},
    "io.modelcontextprotocol/clientInfo": { name: "local-test", version: "1" }
  };
  const waitFor = async (pred: () => boolean, ms = 10_000) => {
    const end = Date.now() + ms;
    while (!pred() && Date.now() < end) await new Promise((r) => setTimeout(r, 25));
    assert.ok(pred(), `timeout; stderr:\n${stderr}`);
  };

  return { child, fake, seen, meta, waitFor, out: () => stdout, err: () => stderr };
}

test("index.ts (MCP_EVENTS_EMITTER=on): event stream connected; discover and events/list over STDIO", { skip: SKIP }, async () => {
  isolateStateFiles();
  const { child, fake, seen, meta, waitFor, out, err } = await boot("on");
  try {
    await waitFor(() => err().includes("OpenCode event stream connected"));
    assert.match(err(), /emitter ENABLED/);
    for (const [id, method] of [[1, "server/discover"], [2, "events/list"]] as const) {
      child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params: { _meta: meta } }) + "\n");
    }
    await waitFor(() => out().split("\n").filter(Boolean).length >= 2);
    const replies = out().split("\n").filter(Boolean).map((l) => JSON.parse(l));
    const discover = replies.find((r) => r.id === 1);
    const list = replies.find((r) => r.id === 2);
    assert.deepEqual(discover.result.capabilities.events, {});
    assert.deepEqual(list.result.events.map((e: any) => e.name), [
      "mission.completed", "mission.failed", "mission.blocked", "permission.required", "mission.turn_completed"
    ]);
    assert.ok(seen.includes("/event"), "emitter subscribed to OpenCode /event");
  } finally {
    child.kill();
    fake.closeAllConnections();
    fake.close();
  }
});

test("index.ts default: emitter disabled, no /event connection, events/* still served", { skip: SKIP }, async () => {
  isolateStateFiles();
  const { child, fake, seen, meta, waitFor, out, err } = await boot(undefined);
  try {
    await waitFor(() => err().includes("MCP OpenCode adapter ready") || err().includes("emitter disabled"));
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "events/list", params: { _meta: meta } }) + "\n");
    await waitFor(() => out().split("\n").filter(Boolean).length >= 1);
    assert.match(err(), /emitter disabled \(set MCP_EVENTS_EMITTER=on\)/);
    assert.equal(JSON.parse(out().split("\n")[0]).result.events.length, 5);
    await new Promise((r) => setTimeout(r, 300));
    assert.ok(!seen.includes("/event"), "no OpenCode /event connection when disabled");
  } finally {
    child.kill();
    fake.closeAllConnections();
    fake.close();
  }
});
