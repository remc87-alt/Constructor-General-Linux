import type { Emission } from "./event-emitter.ts";

// Consume the durable server-side result, never a replayed query or assistant
// text. The caller pins the result read to the run returned by describe.
export function terminalEmission(info: any, result: any, missionId: string, sessionId: string): Emission | null {
  if (info?.execution?.workflowId !== missionId || info?.type?.name !== "genericConstructorMissionWorkflow" ||
      typeof info.execution.runId !== "string" || !info.execution.runId || !Number.isFinite(Date.parse(info.closeTime))) return null;
  const runId = info.execution.runId;
  const status = String(info.status).replace(/^WORKFLOW_EXECUTION_STATUS_/, "");
  const base = { missionId, sessionId, key: `temporal-terminal:${runId}`, occurredAt: Date.parse(info.closeTime) };
  const summary = (functional: string, phase: string, oracleIds: string[] = []) => JSON.stringify({
    workflow_id: missionId, run_id: runId, functional_status: functional,
    phase: /^[a-z_]{1,80}$/.test(phase) ? phase : "unknown", oracle_execution_ids: oracleIds,
  });
  if (["FAILED", "TIMED_OUT", "CANCELED", "TERMINATED"].includes(status)) {
    return { ...base, name: "mission.failed", data: { mission_id: missionId, session_id: sessionId, error: summary("failed", `temporal_${status.toLowerCase()}`) } };
  }
  if (status !== "COMPLETED" || result?.workflowId !== missionId || result?.runId !== runId || result.status !== "COMPLETED") return null;
  const state = result.result;
  if (state?.mission_id !== missionId || state.session_id !== sessionId || state.temporal_status !== "completed") return null;
  const verdict = state.functional_status;
  const phase = typeof state.phase === "string" ? state.phase : "unknown";
  if (verdict === "passed") {
    const evidence = state.validation_evidence;
    const ids = state.oracle_execution_ids;
    if (evidence?.ok !== true || evidence.status !== "passed" || !Array.isArray(evidence.diagnostics) || evidence.diagnostics.length !== 0 ||
        !Array.isArray(ids) || ids.length === 0 || ids.length > 10 || !ids.every((id: unknown) => typeof id === "string" && /^[a-z0-9][a-z0-9-]{2,119}$/.test(id))) return null;
    return { ...base, name: "mission.completed", data: { mission_id: missionId, session_id: sessionId, result: summary(verdict, phase, ids) } };
  }
  if (verdict === "failed") return { ...base, name: "mission.failed", data: { mission_id: missionId, session_id: sessionId, error: summary(verdict, phase) } };
  if (verdict === "blocked") return { ...base, name: "mission.blocked", data: { mission_id: missionId, session_id: sessionId, reason: summary(verdict, phase) } };
  return null;
}
