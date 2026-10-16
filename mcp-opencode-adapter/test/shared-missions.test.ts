import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { DurableMissionStore } from "../src/durable-mission-store.ts";

test("shared map: fresh reads, immutable session, malformed state fails closed, lock release", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cgl-map-test-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, "missions.json");
  const a = new DurableMissionStore(file), b = new DurableMissionStore(file);
  a.patch("m", { session_id: "ses_1", title: "t" });
  assert.equal(b.get("m")?.session_id, "ses_1");
  b.patch("m", { aborted_at: "contained" });
  assert.equal(a.get("m")?.aborted_at, "contained");
  assert.throws(() => a.patch("m", { session_id: "ses_other" }));
  await a.exclusive("m", async () => {
    await assert.rejects(b.exclusive("m", async () => assert.fail("second owner")), /already in progress/);
  });
  await b.exclusive("m", async () => assert.equal(b.get("m")?.session_id, "ses_1"));
  fs.writeFileSync(file, "invalid");
  assert.throws(() => a.load());
  assert.throws(() => b.patch("m", { title: "overwrite" }));
  assert.equal(fs.readFileSync(file, "utf8"), "invalid");
});

test("two real STDIO adapters share fresh identities and serialize starts, continuations and permission containment", { timeout: 30_000 }, async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cgl-shared-adapters-"));
  const file = path.join(dir, "missions.json");
  let starts = 0, prompts = 0, replies = 0;
  let permissions: any[] = [];
  const fake = http.createServer((q, r) => {
    let value: any = null;
    if (q.url === "/global/health") value = { healthy: true, version: "test" };
    else if (q.url === "/session" && q.method === "POST") value = { id: `ses_${++starts}` };
    else if (q.url?.endsWith("/prompt_async")) { prompts++; value = true; }
    else if (q.url?.endsWith("/abort")) value = true;
    else if (q.url === "/permission") value = permissions;
    else if (q.url?.includes("/permissions/")) { replies++; permissions = []; value = true; }
    else if (q.url === "/session/status") value = {};
    else if (q.url?.endsWith("/message")) value = [];
    else { r.writeHead(404).end(); return; }
    q.resume();
    r.setHeader("Content-Type", "application/json"); r.end(JSON.stringify(value));
  });
  t.after(() => { fake.closeAllConnections(); fake.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  await new Promise<void>((resolve, reject) => { fake.once("error", reject); fake.listen(0, "127.0.0.1", resolve); });
  const root = path.resolve(import.meta.dirname, "..");
  const env = { ...process.env, OPENCODE_URL: `http://127.0.0.1:${(fake.address() as any).port}`,
    OPENCODE_SERVER_PASSWORD: "", TEMPORAL_BRIDGE_ENABLED: "0", MCP_MISSION_MAP_FILE: file,
    MCP_EVENTS_EMITTER: "off", MCP_TRANSPORT: "", MCP_SUBSCRIPTIONS_FILE: path.join(dir, "subscriptions.json") };
  const boot = async () => {
    const child = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], { cwd: root, env, stdio: ["pipe", "pipe", "pipe"] });
    t.after(async () => { if (child.exitCode === null) { const closed = once(child, "close"); child.kill(); await closed; } });
    child.stderr.resume();
    let buffer = "", serial = 0;
    const pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();
    child.stdout.on("data", (chunk) => {
      buffer += chunk;
      let end;
      while ((end = buffer.indexOf("\n")) >= 0) {
        const msg = JSON.parse(buffer.slice(0, end)); buffer = buffer.slice(end + 1);
        pending.get(msg.id)?.resolve(msg); pending.delete(msg.id);
      }
    });
    child.on("exit", () => { for (const p of pending.values()) p.reject(new Error("adapter exited")); pending.clear(); });
    const rpc = (method: string, args: any) => new Promise<any>((resolve, reject) => {
      const id = ++serial;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error("test RPC timeout")); }, 10_000);
      pending.set(id, { resolve: (v) => { clearTimeout(timer); resolve(v); }, reject: (e) => { clearTimeout(timer); reject(e); } });
      child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params: { ...args, _meta: {
        "io.modelcontextprotocol/protocolVersion": "2026-07-28", "io.modelcontextprotocol/clientCapabilities": {},
        "io.modelcontextprotocol/clientInfo": { name: "shared-state-test", version: "1" },
      } } }) + "\n");
    });
    await rpc("server/discover", {});
    return async (name: string, args: any) => {
      const r = await rpc("tools/call", { name, arguments: args });
      assert.equal(r.error, undefined);
      return { error: Boolean(r.result.isError), data: JSON.parse(r.result.content[0].text) };
    };
  };
  const a = await boot(), b = await boot();
  const args = { mission_id: "shared-test", title: "t", prompt: "fake only" };
  const results = await Promise.all([a("start_mission", args), b("start_mission", args)]);
  assert.equal(results.filter((r) => !r.error).length, 1);
  assert.equal(starts, 1);
  assert.equal((await b("get_mission", { mission_id: "shared-test" })).data.session_id, "ses_1");
  const store = new DurableMissionStore(file);
  store.patch("other", { session_id: "ses_other", title: "external writer" });
  assert.equal((await a("get_mission", { mission_id: "other" })).data.session_id, "ses_other");
  const continuation = { mission_id: "shared-test", prompt: "fake repair", continuation_id: "shared-test-repair-1" };
  await a("continue_mission", continuation); await b("continue_mission", continuation);
  assert.equal(prompts, 2, "one initial prompt plus exactly one continuation");
  permissions = [{ id: "per_other", sessionID: "ses_other" }];
  assert.equal((await a("reply_permission", { mission_id: "shared-test", permission_id: "per_other", decision: "once" })).error, true);
  assert.equal(replies, 0);
  await a("abort_mission", { mission_id: "shared-test" });
  permissions = [{ id: "per_1", sessionID: "ses_1" }];
  assert.equal((await b("reply_permission", { mission_id: "shared-test", permission_id: "per_1", decision: "once" })).error, true);
  assert.equal(replies, 0);
  assert.equal((await b("reply_permission", { mission_id: "shared-test", permission_id: "per_1", decision: "reject" })).error, false);
  assert.equal(replies, 1);
  const restarted = await boot();
  assert.equal((await restarted("get_mission", { mission_id: "shared-test" })).data.session_id, "ses_1");
  assert.equal((await restarted("continue_mission", continuation)).error, true);
  assert.equal(starts, 1);
});
