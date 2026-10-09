import { spawn } from "node:child_process";

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

async function invoke(config: TemporalBridgeConfig, args: string[]) {
  return await new Promise<{ code: number; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(config.bin, ["--address", config.address, "--namespace", config.namespace, ...args], { shell: false });
    let stdout = "", stderr = "";
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.once("error", reject);
    child.once("close", (code) => resolve({ code: code ?? -1, stdout, stderr }));
  });
}

function workflowInfo(raw: string) {
  const parsed = JSON.parse(raw).workflowExecutionInfo;
  return { workflow_id: parsed.execution.workflowId, run_id: parsed.execution.runId, temporal_status: parsed.status };
}

export async function startTemporalMission(config: TemporalBridgeConfig, input: { workflowId: string; title: string; contract: unknown }) {
  // A stable workflow id is the idempotency boundary before invoking Temporal.
  const existing = await invoke(config, ["workflow", "describe", "--workflow-id", input.workflowId, "-o", "json"]);
  if (existing.code === 0) return { ...workflowInfo(existing.stdout), created: false };
  if (!/not found|not exist|unknown workflow/i.test(existing.stderr + existing.stdout)) {
    throw new Error(`Temporal describe failed: ${(existing.stderr || existing.stdout).slice(0, 500)}`);
  }
  const payload = JSON.stringify({ contract: input.contract, title: input.title });
  const started = await invoke(config, ["workflow", "start", "--type", "genericConstructorMissionWorkflow", "--task-queue", config.taskQueue, "--workflow-id", input.workflowId, "--input", payload]);
  if (started.code !== 0) throw new Error(`Temporal start failed: ${(started.stderr || started.stdout).slice(0, 500)}`);
  const run = /RunId\s+([^\s]+)/.exec(started.stdout)?.[1] ?? null;
  return { workflow_id: input.workflowId, run_id: run, temporal_status: "WORKFLOW_EXECUTION_STATUS_RUNNING", created: true };
}

export async function getTemporalMission(config: TemporalBridgeConfig, workflowId: string) {
  const described = await invoke(config, ["workflow", "describe", "--workflow-id", workflowId, "-o", "json"]);
  if (described.code !== 0) throw new Error(`Temporal describe failed: ${(described.stderr || described.stdout).slice(0, 500)}`);
  const queried = await invoke(config, ["workflow", "query", "--workflow-id", workflowId, "--type", "generic-mission", "-o", "json"]);
  if (queried.code !== 0) throw new Error(`Temporal query failed: ${(queried.stderr || queried.stdout).slice(0, 500)}`);
  const state = JSON.parse(queried.stdout).queryResult?.[0] ?? null;
  return { ...workflowInfo(described.stdout), state };
}
