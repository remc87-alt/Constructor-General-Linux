import { spawn } from "node:child_process";
import { terminalEmission } from "./temporal-terminal-events.ts";

export type TemporalBridgeConfig = {
  bin: string;
  address: string;
  namespace: string;
  taskQueue: string;
};

export function temporalBridgeFromEnv(env: NodeJS.ProcessEnv = process.env): TemporalBridgeConfig | null {
  if (env.TEMPORAL_BRIDGE_ENABLED !== "1") return null;
  const bin = env.TEMPORAL_BIN;
  const address = env.TEMPORAL_ADDRESS;
  const taskQueue = env.TEMPORAL_TASK_QUEUE;
  if (!bin || !address || !taskQueue) throw new Error("TEMPORAL_BIN, TEMPORAL_ADDRESS and TEMPORAL_TASK_QUEUE are required");
  return { bin, address, namespace: env.TEMPORAL_NAMESPACE ?? "default", taskQueue };
}

async function invoke(config: TemporalBridgeConfig, args: string[], bounded = false) {
  return await new Promise<{ code: number; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(config.bin, ["--address", config.address, "--namespace", config.namespace, ...args], { shell: false });
    const timer = bounded ? setTimeout(() => { child.kill("SIGKILL"); reject(new Error("Temporal terminal read timed out")); }, 10_000) : undefined;
    const fail = () => { child.kill("SIGKILL"); reject(new Error("Temporal terminal response exceeds limit")); };
    let stdout = "", stderr = "";
    child.stdout.on("data", (chunk) => { stdout += String(chunk); if (bounded && stdout.length > 2 * 1024 * 1024) fail(); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); if (bounded && stderr.length > 64 * 1024) fail(); });
    child.once("error", (e) => { clearTimeout(timer); reject(e); });
    child.once("close", (code) => { clearTimeout(timer); resolve({ code: code ?? -1, stdout, stderr }); });
  });
}

export async function readTemporalTerminal(config: TemporalBridgeConfig, missionId: string, sessionId: string) {
  const described = await invoke(config, ["workflow", "describe", "--workflow-id", missionId, "-o", "json"], true);
  if (described.code !== 0) throw new Error("Temporal terminal describe unavailable");
  const info = JSON.parse(described.stdout).workflowExecutionInfo;
  if (info?.taskQueue !== config.taskQueue || info?.type?.name !== "genericConstructorMissionWorkflow" || !info.closeTime) return null;
  let result = null;
  if (info.status === "WORKFLOW_EXECUTION_STATUS_COMPLETED") {
    const response = await invoke(config, ["workflow", "result", "--workflow-id", missionId, "--run-id", info.execution.runId, "-o", "json"], true);
    if (response.code !== 0) throw new Error("Temporal terminal result unavailable");
    result = JSON.parse(response.stdout);
  }
  return terminalEmission(info, result, missionId, sessionId);
}

function workflowInfo(raw: string) {
  const parsed = JSON.parse(raw).workflowExecutionInfo;
  return { workflow_id: parsed.execution.workflowId, run_id: parsed.execution.runId, temporal_status: parsed.status };
}

// Server-side hard stop: mission budget plus a fixed envelope for the final
// oracle run and containment. Capped at 20 minutes for the whole operation.
export const EXECUTION_ENVELOPE_MS = 5 * 60_000;
export const MAX_EXECUTION_MS = 20 * 60_000;
export function executionTimeoutSeconds(contract: unknown): number {
  const ms = (contract as any)?.budget?.maxDurationMs;
  if (!Number.isInteger(ms) || ms < 30_000 || ms > 15 * 60_000) throw new Error("contract.budget.maxDurationMs must be from 30000 to 900000");
  return Math.ceil(Math.min(ms + EXECUTION_ENVELOPE_MS, MAX_EXECUTION_MS) / 1000);
}

export function startArgs(config: TemporalBridgeConfig, input: { workflowId: string; title: string; contract: unknown }): string[] {
  const payload = JSON.stringify({ contract: input.contract, title: input.title });
  return ["workflow", "start", "--type", "genericConstructorMissionWorkflow", "--task-queue", config.taskQueue,
    "--workflow-id", input.workflowId, "--id-reuse-policy", "RejectDuplicate",
    "--execution-timeout", `${executionTimeoutSeconds(input.contract)}s`, "--input", payload];
}

export async function startTemporalMission(config: TemporalBridgeConfig, input: { workflowId: string; title: string; contract: unknown }) {
  const args = startArgs(config, input); // validates the budget before any Temporal call
  // A stable workflow id is the idempotency boundary before invoking Temporal.
  const existing = await invoke(config, ["workflow", "describe", "--workflow-id", input.workflowId, "-o", "json"]);
  if (existing.code === 0) return { ...workflowInfo(existing.stdout), created: false };
  if (!/not found|not exist|unknown workflow/i.test(existing.stderr + existing.stdout)) {
    throw new Error(`Temporal describe failed: ${(existing.stderr || existing.stdout).slice(0, 500)}`);
  }
  const started = await invoke(config, args);
  if (started.code !== 0) throw new Error(`Temporal start failed: ${(started.stderr || started.stdout).slice(0, 500)}`);
  const run = /RunId\s+([^\s]+)/.exec(started.stdout)?.[1] ?? null;
  return { workflow_id: input.workflowId, run_id: run, temporal_status: "WORKFLOW_EXECUTION_STATUS_RUNNING", created: true };
}

// The Director's explicit decision on ONE pending permission. The workflow
// accepts it only if mission/session/permission/patterns match exactly.
export type PermissionDecisionInput = { workflowId: string; sessionId: string; permissionId: string; patterns: unknown; decision: "once" | "reject"; by: string };
export function permissionSignalArgs(input: PermissionDecisionInput): string[] {
  if (input.decision !== "once" && input.decision !== "reject") throw new Error("decision must be once or reject");
  if (!input.by.trim()) throw new Error("by is required");
  const payload = JSON.stringify({ mission_id: input.workflowId, session_id: input.sessionId, permission_id: input.permissionId, patterns: input.patterns, decision: input.decision, by: input.by.trim() });
  return ["workflow", "signal", "--workflow-id", input.workflowId, "--name", "generic-permission", "--input", payload];
}

export async function decideTemporalPermission(config: TemporalBridgeConfig, input: PermissionDecisionInput) {
  const signalled = await invoke(config, permissionSignalArgs(input));
  if (signalled.code !== 0) throw new Error(`Temporal signal failed: ${(signalled.stderr || signalled.stdout).slice(0, 500)}`);
  // Acceptance is visible only through the durable query (phase/permissions_handled).
  return { workflow_id: input.workflowId, permission_id: input.permissionId, decision: input.decision, status: "signalled" };
}

export async function getTemporalMission(config: TemporalBridgeConfig, workflowId: string) {
  const described = await invoke(config, ["workflow", "describe", "--workflow-id", workflowId, "-o", "json"]);
  if (described.code !== 0) throw new Error(`Temporal describe failed: ${(described.stderr || described.stdout).slice(0, 500)}`);
  const queried = await invoke(config, ["workflow", "query", "--workflow-id", workflowId, "--type", "generic-mission", "-o", "json"]);
  if (queried.code !== 0) throw new Error(`Temporal query failed: ${(queried.stderr || queried.stdout).slice(0, 500)}`);
  const state = JSON.parse(queried.stdout).queryResult?.[0] ?? null;
  return { ...workflowInfo(described.stdout), state };
}
