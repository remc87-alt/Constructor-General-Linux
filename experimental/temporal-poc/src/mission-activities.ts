import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Context, heartbeat, sleep, ApplicationFailure } from "@temporalio/activity";
import { Client } from "@temporalio/client";
import { NativeConnection } from "@temporalio/worker";
import { EXPECTED, TRANSCRIPT, VALIDATION_VARIANTS } from "./t3-fixture.ts";
import { type GenericMissionContract, validateGenericMissionContract, workspaceArtifactsAreFresh } from "./generic-contract.ts";
import { parsePublicOracleResult, publicOracleResultPath, validateOracleExecutionIdentity } from "./oracle-result-contract.ts";
import { checkpointDue, checkpointFromObservation, type MissionCheckpoint } from "./mission-checkpoint.ts";

// T3 activities. They drive the EXISTING MCP adapter (isolated instance copy,
// own mission map) over STDIO — the same contract the Director uses — against
// the POC-exclusive OpenCode on :4098. No direct OpenCode writes here.

const ROOT = `${os.homedir()}/.local/state/constructor-temporal-poc`;
const ADAPTER = `${ROOT}/adapter-instance`;
const OC_URL = "http://127.0.0.1:4098";
let checkpointClient: Promise<Client> | undefined;

async function temporalCheckpointClient(): Promise<Client> {
  if (!checkpointClient) {
    const address = process.env.POC_TEMPORAL_ADDRESS;
    if (!address) throw new Error("POC_TEMPORAL_ADDRESS is required for checkpoints");
    checkpointClient = NativeConnection.connect({ address }).then((connection) => new Client({ connection, namespace: "default" }));
  }
  return checkpointClient;
}

async function publishCheckpoint(checkpoint: MissionCheckpoint): Promise<void> {
  const execution = Context.current().info.workflowExecution;
  if (!execution) return;
  try {
    const client = await temporalCheckpointClient();
    await client.workflow.getHandle(execution.workflowId, execution.runId).signal("generic-mission-checkpoint", checkpoint);
  } catch {
    // Observability cannot alter mission execution. The ordinary Activity
    // heartbeat still makes the delivery failure visible to Temporal retries.
    heartbeat({ phase: "checkpoint_delivery_unavailable" });
  }
}

function adapterEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    OPENCODE_URL: OC_URL,
    OPENCODE_SERVER_PASSWORD: fs.readFileSync(`${ROOT}/run/opencode-t3.password`, "utf8").trim(),
    MCP_SUBSCRIPTIONS_FILE: `${ADAPTER}/state/subscriptions.json`,
    MCP_EVENT_OUTBOX_FILE: `${ADAPTER}/state/event-outbox.json`,
    MCP_EVENTS_EMITTER: "off",
    MCP_TRANSPORT: ""
  };
}

const META = {
  "io.modelcontextprotocol/protocolVersion": "2026-07-28",
  "io.modelcontextprotocol/clientCapabilities": {},
  "io.modelcontextprotocol/clientInfo": { name: "temporal-poc", version: "1" }
};

// One adapter process per call; the adapter persists its own mission map.
async function mcpTool(name: string, args: Record<string, unknown>): Promise<{ isError: boolean; data: any }> {
  const child = spawn(process.execPath, [`${ADAPTER}/node_modules/tsx/dist/cli.mjs`, `${ADAPTER}/src/index.ts`],
    { cwd: ADAPTER, env: adapterEnv(), stdio: ["pipe", "pipe", "pipe"] });
  const errLog = fs.createWriteStream(`${ROOT}/logs/adapter-instance.log`, { flags: "a", mode: 0o600 });
  child.stderr.pipe(errLog);
  try {
    return await new Promise((resolve, reject) => {
      let buf = "";
      const timer = setTimeout(() => reject(new Error(`MCP ${name} timed out`)), 60_000);
      child.on("exit", (code) => { clearTimeout(timer); reject(new Error(`adapter exited (${code}) before answering ${name}`)); });
      child.stdout.on("data", (d) => {
        buf += d;
        let i;
        while ((i = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, i); buf = buf.slice(i + 1);
          const msg = JSON.parse(line);
          if (msg.id !== 2) continue;
          clearTimeout(timer);
          if (msg.error) return reject(new Error(`MCP ${name} error ${msg.error.code}: ${msg.error.message}`));
          const text = msg.result?.content?.[0]?.text ?? "null";
          resolve({ isError: Boolean(msg.result?.isError), data: JSON.parse(text) });
        }
      });
      const send = (o: object) => child.stdin.write(JSON.stringify(o) + "\n");
      send({ jsonrpc: "2.0", id: 1, method: "server/discover", params: { _meta: META } });
      send({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name, arguments: args, _meta: META } });
    });
  } finally {
    child.kill();
  }
}

export async function verifyWorkspace(input: { workspace: string }) {
  const t = fs.readFileSync(path.join(input.workspace, "transcripcion.txt"), "utf8");
  if (t !== TRANSCRIPT) throw ApplicationFailure.nonRetryable("transcripcion.txt differs from fixture");
  if (!fs.existsSync(path.join(input.workspace, "opencode.json"))) throw ApplicationFailure.nonRetryable("opencode.json missing");
  const stale = ["process.py", "resultado.json"].filter((f) => fs.existsSync(path.join(input.workspace, f)));
  return { ok: true, staleArtifacts: stale };
}

// Kept separate from T6's historical fixture preflight so its evidence and
// semantics cannot be weakened by generic execution.
export async function prepareGenericMission(input: { contract: unknown }) {
  const contract = validateGenericMissionContract(input.contract);
  if (!fs.existsSync(path.join(contract.workspace, "opencode.json"))) {
    throw ApplicationFailure.nonRetryable("generic contract: opencode.json missing");
  }
  const stale = workspaceArtifactsAreFresh(contract);
  if (stale.length) throw ApplicationFailure.nonRetryable(`generic contract: stale artifacts: ${stale.join(",")}`);
  return contract;
}

// POST /session has no cwd argument. Verify the server's actual cwd before an
// external start, preventing a generic mission from silently using T6's cwd.
export async function verifyOpenCodeWorkspace(input: { workspace: string }) {
  const pid = fs.readFileSync(path.join(ROOT, "run/opencode-t3.pid"), "utf8").trim();
  if (!/^[1-9][0-9]*$/.test(pid)) throw ApplicationFailure.nonRetryable("generic contract: invalid OpenCode pidfile");
  const cmdline = fs.readFileSync(`/proc/${pid}/cmdline`, "utf8").replaceAll("\0", " ");
  if (!cmdline.includes("opencode serve --hostname 127.0.0.1 --port 4098")) {
    throw ApplicationFailure.nonRetryable("generic contract: pidfile is not the POC OpenCode server");
  }
  const cwd = fs.realpathSync(`/proc/${pid}/cwd`);
  if (cwd !== fs.realpathSync(input.workspace)) throw ApplicationFailure.nonRetryable("generic contract: OpenCode cwd does not match workspace");
  return { pid, cwd };
}

export type McpCall = (name: string, args: Record<string, unknown>) => Promise<{ isError: boolean; data: any }>;

function sessionIdOf(data: any): string {
  const sessionId = data?.session_id;
  if (typeof sessionId !== "string" || !sessionId) throw new Error("mission response has no session_id");
  return sessionId;
}

// Pure reconciliation boundary: retries always address the same mission_id.
// An ambiguous first call must discover its already-created mission rather
// than issue a second logical start.
export async function reconcileMissionStart(
  call: McpCall,
  input: { missionId: string; title: string; prompt: string },
  expectedSessionId?: string
) {
  const r = await call("start_mission", { mission_id: input.missionId, title: input.title, prompt: input.prompt });
  let sessionId: string;
  let alreadyExisted = false;
  if (!r.isError) {
    sessionId = sessionIdOf(r.data);
  } else if (String(r.data?.error).includes("already exists")) {
    const g = await call("get_mission", { mission_id: input.missionId });
    if (g.isError) throw new Error(`mission exists but unreadable: ${g.data?.error}`);
    sessionId = sessionIdOf(g.data);
    alreadyExisted = true;
  } else {
    throw ApplicationFailure.nonRetryable(`start_mission failed: ${r.data?.error}`);
  }
  if (expectedSessionId && expectedSessionId !== sessionId) {
    throw ApplicationFailure.nonRetryable(`session_id mismatch for ${input.missionId}`);
  }
  return { sessionId, alreadyExisted };
}

async function t6WaitBarrier(missionId: string, sessionId: string, status: string) {
  if (status !== "running") return;
  const dir = process.env.POC_T6_WAIT_BARRIER_DIR;
  if (!dir) return;
  const root = path.join(ROOT, "t6-barriers") + path.sep;
  const canonical = path.resolve(dir) + path.sep;
  if (!canonical.startsWith(root)) throw ApplicationFailure.nonRetryable("T6 wait barrier must be under POC state");
  fs.mkdirSync(canonical, { recursive: true, mode: 0o700 });
  const observed = path.join(canonical, "wait-observed.json");
  if (!fs.existsSync(observed)) {
    fs.writeFileSync(observed, JSON.stringify({ missionId, sessionId, status, observedAt: new Date().toISOString() }), { flag: "wx", mode: 0o600 });
  }
  const release = path.join(canonical, "release");
  while (!fs.existsSync(release)) {
    heartbeat({ phase: "t6_wait_barrier", missionId, sessionId, status });
    await sleep(250);
  }
}

// Idempotent by mission_id: a retry after an unknown outcome finds the
// existing mission instead of creating a second session.
export async function startMission(input: { missionId: string; title: string; prompt: string }) {
  const timer = setInterval(() => heartbeat({ phase: "start_mission", missionId: input.missionId }), 1_000);
  try {
    return await reconcileMissionStart(mcpTool, input);
  } finally {
    clearInterval(timer);
  }
}

// Repairs use the exact same mission/session, never a replacement start.
export async function continueMission(input: { missionId: string; prompt: string }) {
  const r = await mcpTool("continue_mission", { mission_id: input.missionId, prompt: input.prompt });
  if (r.isError) throw new Error(`continue_mission failed: ${r.data?.error}`);
  return { continued: true };
}

export type MonitorResult =
  | { kind: "idle"; text: string; polls: number; sessionId: string }
  | { kind: "permission"; permission: { permission_id: string; permission: string; patterns: unknown }; polls: number; sessionId: string }
  | { kind: "stalled" | "timeout" | "session_mismatch" | "adapter_error"; lastStatus: string; polls: number; sessionId?: string };

export type MonitorFailureDecision = "retry" | "timeout" | "terminal";

// A stopped/restarting isolated OpenCode server makes a fresh STDIO adapter
// process exit before answering get_mission. That is not evidence that the
// mission or its session failed. Keep the same Activity alive, heartbeat it,
// and retry reads only until the caller's bounded monitoring budget expires.
export function monitorFailureDecision(error: unknown, elapsedMs: number, maxMs: number): MonitorFailureDecision {
  const message = String(error instanceof Error ? error.message : error).toLowerCase();
  const transient = /adapter exited|timed out|econnrefused|econnreset|fetch failed|socket hang up|network error|\b502\b|\b503\b|\b504\b/.test(message);
  if (!transient) return "terminal";
  return elapsedMs >= maxMs ? "timeout" : "retry";
}

export async function readMissionSnapshot(call: McpCall, missionId: string) {
  const g = await call("get_mission", { mission_id: missionId });
  if (g.isError) throw new Error(`get_mission: ${g.data?.error}`);
  const sessionId = sessionIdOf(g.data);
  return {
    sessionId,
    status: String(g.data.status),
    text: g.data.text == null ? null : String(g.data.text),
    permissionRequests: Array.isArray(g.data.permission_requests) ? g.data.permission_requests : []
  };
}

// Polls get_mission (idempotent). Heartbeats every poll; a dead worker or a
// hung adapter is detected by the heartbeat timeout and the poll resumes.
// idle only counts after OpenCode was seen working (G5: idle alone ≠ done).
export async function waitMission(input: { missionId: string; expectedSessionId: string; maxMs: number; repliedPermissions: string[] }): Promise<MonitorResult> {
  const t0 = Date.now();
  let sawWork = Boolean((Context.current().info.heartbeatDetails as any)?.sawWork);
  let checkpoint = ((Context.current().info.heartbeatDetails as any)?.checkpoint ?? null) as MissionCheckpoint | null;
  let retrySince: number | null = null;
  let polls = 0;
  const observe = async (status: string, sessionId: string, pendingPermission: boolean, force = false) => {
    const next = checkpointFromObservation({
      missionId: input.missionId,
      sessionId,
      status,
      pendingPermission,
      previous: checkpoint
    });
    const due = force || checkpointDue(checkpoint, next);
    checkpoint = next;
    // Persist enough recovery state for an Activity retry, even when no query
    // signal is due. This heartbeat is not counted as functional progress.
    heartbeat({ status, sawWork, polls, checkpoint });
    if (due) await publishCheckpoint(next);
  };
  while (Date.now() - t0 < input.maxMs) {
    let g: Awaited<ReturnType<typeof readMissionSnapshot>>;
    try {
      g = await readMissionSnapshot(mcpTool, input.missionId);
    } catch (error) {
      const elapsedMs = Date.now() - t0;
      const decision = monitorFailureDecision(error, elapsedMs, input.maxMs);
      await observe("adapter_unavailable", input.expectedSessionId, false, decision !== "retry");
      heartbeat({ phase: "adapter_unavailable", polls, elapsedMs, decision, checkpoint });
      if (decision === "terminal") return { kind: "adapter_error", lastStatus: "adapter_error", polls };
      if (decision === "timeout") return { kind: "timeout", lastStatus: "adapter_unavailable", polls, sessionId: input.expectedSessionId };
      await sleep(5_000);
      continue;
    }
    polls++;
    if (g.sessionId !== input.expectedSessionId) return { kind: "session_mismatch", lastStatus: g.status, polls, sessionId: g.sessionId };
    const status = g.status;
    if (status === "running") sawWork = true;
    await t6WaitBarrier(input.missionId, g.sessionId, status);
    const pending = g.permissionRequests.filter((p: any) => !input.repliedPermissions.includes(p.permission_id));
    await observe(status, g.sessionId, pending.length > 0, pending.length > 0 || status === "idle");
    if (pending.length > 0) return { kind: "permission", permission: pending[0], polls, sessionId: g.sessionId };
    if (status === "retry") {
      retrySince ??= Date.now();
      if (Date.now() - retrySince > 5 * 60_000) return { kind: "stalled", lastStatus: status, polls };
    } else {
      retrySince = null;
    }
    if (status === "idle" && (sawWork || Date.now() - t0 > 30_000) && g.text) {
      return { kind: "idle", text: g.text.slice(0, 4000), polls, sessionId: g.sessionId };
    }
    await sleep(5_000);
  }
  return { kind: "timeout", lastStatus: "unknown", polls, sessionId: input.expectedSessionId };
}

// Compatibility alias for historical code; new workflows use waitMission.
export const monitorMission = waitMission;

// Idempotent: replying again to an already-answered permission is treated as done.
export async function replyPermission(input: { missionId: string; permissionId: string; decision: "once" | "reject" }) {
  try {
    const r = await mcpTool("reply_permission", { mission_id: input.missionId, permission_id: input.permissionId, decision: input.decision });
    if (r.isError && !/not ?found|404/i.test(String(r.data?.error))) throw new Error(String(r.data?.error));
    return { replied: !r.isError, alreadyHandled: r.isError };
  } catch (e: any) {
    if (/not ?found|404/i.test(String(e?.message))) return { replied: false, alreadyHandled: true };
    throw e;
  }
}

export type GenericOracleDiagnostic = {
  code: "ORACLE_UNAVAILABLE" | "MISSING_ARTIFACT" | "FUNCTIONAL_FAILURE";
  summary: string;
  artifactPaths: string[];
};

export type OracleExecutionTrace = {
  stage: "prepare" | "validate";
  mission_id: string;
  oracle_execution_id: string;
  exit_code: number | null;
  stderr: string;
  stdout: string;
  error: string | null;
};

const ORACLE_PREPARE = "/usr/local/libexec/cgl-oracle-prepare";
const ORACLE_VALIDATE = "/usr/local/libexec/cgl-oracle-validate";

function oracleFailure(code: GenericOracleDiagnostic["code"], summary: string, artifactPaths: string[], oracleTrace?: OracleExecutionTrace): GenericValidationEvidence {
  return { ok: false, status: code === "ORACLE_UNAVAILABLE" ? "blocked" : "failed", diagnostics: [{ code, summary, artifactPaths }], artifactPaths, ...(oracleTrace ? { oracle_trace: oracleTrace } : {}) };
}

function runOracle(command: string, args: string[] = [], runAs?: string) {
  const sudoArgs = ["-n", ...(runAs ? ["-u", runAs] : []), command, ...args];
  return spawnSync("/usr/bin/sudo", sudoArgs, {
    encoding: "utf8", timeout: 130_000, env: { PATH: "/usr/bin:/bin" }
  });
}

// Activity output is persisted in Temporal history. Keep enough context to
// diagnose a failed isolated invocation, while redacting credentials and host
// paths before it crosses that boundary.
export function sanitizeOracleOutput(value: unknown): string {
  return String(value ?? "")
    .replace(/\b(authorization|bearer|token|api[ _-]?key|password|secret)\s*(?:=|:)\s*\S+/gi, "$1=[REDACTED]")
    .replace(/\/(?:[^\s'\"]+)/g, "<path>")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 600);
}

export function oracleExecutionTrace(
  stage: OracleExecutionTrace["stage"],
  identity: { missionId: string; oracleExecutionId: string },
  result: { status?: number | null; stdout?: unknown; stderr?: unknown; error?: unknown }
): OracleExecutionTrace {
  return {
    stage,
    mission_id: identity.missionId,
    oracle_execution_id: identity.oracleExecutionId,
    exit_code: typeof result.status === "number" ? result.status : null,
    stderr: sanitizeOracleOutput(result.stderr),
    stdout: sanitizeOracleOutput(result.stdout),
    error: result.error == null ? null : sanitizeOracleOutput(result.error)
  };
}

export type GenericValidationEvidence =
  | { ok: true; status: "passed"; diagnostics: []; artifactPaths: string[] }
  | { ok: false; status: "failed" | "blocked"; diagnostics: GenericOracleDiagnostic[]; artifactPaths: string[]; oracle_trace?: OracleExecutionTrace };

// The installed sudoers entries expose only these two fixed, argument-checked
// oracle commands. The generated program runs inside the oracle's bwrap target,
// never in this worker or under the validator's host privileges.
export async function validateGenericMission(input: { contract: GenericMissionContract; sessionId: string; oracleExecutionId: string }): Promise<GenericValidationEvidence> {
  const identity = validateOracleExecutionIdentity({ missionId: input.contract.missionId, oracleExecutionId: input.oracleExecutionId });
  const artifactPaths = input.contract.artifactPaths.map((artifact) => path.join(input.contract.workspace, artifact));
  const missing = input.contract.validation.requiredArtifacts.filter((artifact) => !fs.existsSync(path.join(input.contract.workspace, artifact)));
  if (missing.length) return oracleFailure("MISSING_ARTIFACT", `missing required artifacts: ${missing.join(",")}`, missing);
  const prepared = runOracle(ORACLE_PREPARE, [identity.missionId, identity.oracleExecutionId]);
  if (prepared.error || prepared.status !== 0) {
    return oracleFailure("ORACLE_UNAVAILABLE", "isolated oracle preparation failed", artifactPaths, oracleExecutionTrace("prepare", identity, prepared));
  }
  // The installed sudoers rule deliberately permits this validator only as
  // cgl_oracle. Preparation remains root-only because it creates the sealed
  // manifest and read-only staging copy.
  const validated = runOracle(ORACLE_VALIDATE, [identity.missionId, identity.oracleExecutionId], "cgl_oracle");
  const resultPath = publicOracleResultPath(identity);
  if (validated.error || ![0, 1].includes(validated.status ?? -1) || !fs.existsSync(resultPath)) {
    return oracleFailure("ORACLE_UNAVAILABLE", "isolated oracle execution failed", artifactPaths, oracleExecutionTrace("validate", identity, validated));
  }
  try {
    const result = parsePublicOracleResult(JSON.parse(fs.readFileSync(resultPath, "utf8")), identity);
    const diagnostics = result.diagnostics.map((d) => ({ code: d.code === "ORACLE_ERROR" ? "ORACLE_UNAVAILABLE" as const : "FUNCTIONAL_FAILURE" as const, summary: d.summary, artifactPaths }));
    if (result.ok === true && result.status === "passed" && validated.status === 0 && diagnostics.length === 0) {
      return { ok: true, status: "passed", diagnostics: [], artifactPaths };
    }
    return { ok: false, status: "failed", diagnostics: diagnostics.length ? diagnostics : [{ code: "FUNCTIONAL_FAILURE", summary: "oracle rejected the generated program", artifactPaths }], artifactPaths, oracle_trace: oracleExecutionTrace("validate", identity, validated) };
  } catch {
    return oracleFailure("ORACLE_UNAVAILABLE", "isolated oracle returned an invalid result", artifactPaths, oracleExecutionTrace("validate", identity, validated));
  }
}


const norm = (s: unknown) => String(s ?? "").toLowerCase().normalize("NFC").replace(/\s+/g, " ").trim();

type ExtractionExpectation = {
  participantes: string[];
  acuerdos: string[][];
  tareas: Array<{ responsable: string; tarea: string[]; plazo: string }>;
};

export function checkExtraction(out: any, expected: ExtractionExpectation) {
  const errors: string[] = [];
  const canonicalKeys = ["participantes", "acuerdos", "tareas"];
  const keys = out && typeof out === "object" && !Array.isArray(out) ? Object.keys(out).sort() : [];
  if (JSON.stringify(keys) !== JSON.stringify([...canonicalKeys].sort())) errors.push(`canonical keys=${JSON.stringify(keys)}`);
  const parts = Array.isArray(out?.participantes) ? out.participantes.map(norm) : null;
  if (!parts) errors.push("participantes missing");
  else if (JSON.stringify(parts) !== JSON.stringify(expected.participantes.map(norm))) errors.push(`participantes=${JSON.stringify(out.participantes)}`);
  const acuerdos = Array.isArray(out?.acuerdos) ? out.acuerdos.map(norm) : [];
  if (acuerdos.length !== expected.acuerdos.length) errors.push(`acuerdos count=${acuerdos.length}`);
  for (const kws of expected.acuerdos) {
    if (!acuerdos.some((a: string) => kws.every((k) => a.includes(norm(k))))) errors.push(`acuerdo missing ${kws.join("+")}`);
  }
  const tareas = Array.isArray(out?.tareas) ? out.tareas : [];
  if (tareas.length !== expected.tareas.length) errors.push(`tareas count=${tareas.length}`);
  for (const exp of expected.tareas) {
    const t = tareas.find((x: any) => norm(x?.responsable).startsWith(norm(exp.responsable)));
    if (!t) { errors.push(`tarea missing for ${exp.responsable}`); continue; }
    if (typeof t.tarea !== "string" || !t.tarea.trim()) errors.push(`${exp.responsable}.tarea missing`);
    else if (!exp.tarea.every((k) => norm(t.tarea).includes(norm(k)))) errors.push(`${exp.responsable}.tarea=${JSON.stringify(t.tarea)}`);
    if (typeof t.plazo !== "string" || !t.plazo.trim()) errors.push(`${exp.responsable}.plazo missing`);
    else if (!norm(t.plazo).includes(norm(exp.plazo))) errors.push(`${exp.responsable}.plazo=${JSON.stringify(t.plazo)}`);
    if (/^(de acuerdo|confirmado|perfecto)/.test(norm(t.tarea))) errors.push(`${exp.responsable}: acknowledgement taken as task`);
  }
  return errors;
}

// Semantic validation (exit 0 or a file is not enough). Primary: resultado.json
// in the workspace. Additional: re-run process.py on a variant transcript in a
// temp copy to check it is a real program, not hard-coded output.
export async function validateResult(input: { workspace: string }) {
  const file = path.join(input.workspace, "resultado.json");
  // G5 failure mode: output written outside the workspace.
  const misplaced = [ROOT, `${ROOT}/workspaces`, ADAPTER].map((d) => path.join(d, "resultado.json")).filter((f) => fs.existsSync(f));
  if (!fs.existsSync(file)) return { ok: false, errors: ["resultado.json not in workspace"], variant: null, misplaced };
  let out: any;
  try { out = JSON.parse(fs.readFileSync(file, "utf8")); } catch { return { ok: false, errors: ["resultado.json is not valid JSON"], variant: null, misplaced }; }
  const errors = checkExtraction(out, EXPECTED);
  if (misplaced.length) errors.push(`misplaced output: ${misplaced.join(",")}`);

  // Independent semantic variants include a holdout not named in the prompt.
  let variant: { ok: boolean; errors: string[] } | null = null;
  const script = path.join(input.workspace, "process.py");
  if (fs.existsSync(script)) {
    const variantErrors: string[] = [];
    for (const fixture of VALIDATION_VARIANTS) {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "t3-variant-"));
      try {
        fs.writeFileSync(path.join(tmp, "transcripcion.txt"), fixture.transcript);
        fs.copyFileSync(script, path.join(tmp, "process.py"));
        const run = spawnSync("python3", ["-I", "process.py"], { cwd: tmp, timeout: 20_000, encoding: "utf8" });
        try {
          const vOut = JSON.parse(fs.readFileSync(path.join(tmp, "resultado.json"), "utf8"));
          variantErrors.push(...checkExtraction(vOut, fixture.expected).map((e) => `${fixture.name}: ${e}`));
        } catch {
          variantErrors.push(`${fixture.name}: run failed (exit ${run.status}): ${String(run.stderr).slice(0, 200)}`);
        }
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    }
    variant = { ok: variantErrors.length === 0, errors: variantErrors };
  }
  return { ok: errors.length === 0, errors, variant, misplaced, output: out };
}
