import { proxyActivities, defineSignal, defineQuery, setHandler, condition, log, workflowInfo, ActivityFailure, ApplicationFailure, CancellationScope, isCancellation, patched } from "@temporalio/workflow";
import type * as activities from "./activities";
import { oracleExecutionIdFromTemporalRun } from "./oracle-execution-id";

// One controlled workflow: A start → B idempotent effect → C record →
// (T2.4 watched step) → D wait for human approval (Signal) → E continue →
// F finalize. State is exposed through a Query; everything else is history.

const { applyEffect, finalize } = proxyActivities<typeof activities>({
  startToCloseTimeout: "30 seconds",
  retry: { maximumAttempts: 4, initialInterval: "1 second", backoffCoefficient: 2, maximumInterval: "5 seconds" }
});

const { watchedStep } = proxyActivities<typeof activities>({
  startToCloseTimeout: "2 minutes",
  heartbeatTimeout: "3 seconds",
  retry: { maximumAttempts: 2, initialInterval: "1 second" }
});

export type Approval = { by: string; decision: "approve" | "reject" };
export const approveSignal = defineSignal<[Approval]>("approve");

export type PocInput = {
  opKey: string;
  payload: string;
  failAfterEffectAttempts?: number;
  hangOnFirstAttempt?: boolean;
};

export type PocState = {
  phase: string;
  opKey: string;
  effect: unknown;
  watched: unknown;
  approval: Approval | null;
  final: unknown;
  transitions: { phase: string; at: string }[];
};

export const stateQuery = defineQuery<PocState>("state");

export async function constructorPocWorkflow(input: PocInput): Promise<PocState> {
  const state: PocState = {
    phase: "started", opKey: input.opKey, effect: null, watched: null,
    approval: null, final: null, transitions: []
  };
  const mark = (phase: string) => {
    state.phase = phase;
    state.transitions.push({ phase, at: new Date().toISOString() }); // workflow time: deterministic
    log.info("transition", { phase });
  };
  setHandler(stateQuery, () => state);
  setHandler(approveSignal, (a) => {
    if (state.approval === null) state.approval = a; // first decision wins
  });

  mark("started");                                                   // A
  state.effect = await applyEffect({                                 // B
    opKey: input.opKey, payload: input.payload,
    failAfterEffectAttempts: input.failAfterEffectAttempts ?? 0
  });
  mark("effect_recorded");                                           // C
  state.watched = await watchedStep({ opKey: input.opKey, hangOnFirstAttempt: input.hangOnFirstAttempt ?? false });
  mark("watched_step_done");
  mark("awaiting_approval");                                         // D
  if (!(await condition(() => state.approval !== null, "24 hours"))) {
    mark("approval_timeout");
    return state;
  }
  if (state.approval!.decision !== "approve") {
    mark("rejected");
    return state;
  }
  mark("approved");                                                  // E
  state.final = await finalize({ opKey: input.opKey, decision: "approve", by: state.approval!.by });
  mark("completed");                                                 // F
  return state;
}

// ---------------- T3: real Constructor mission orchestrated by Temporal ----------------
import type * as missionActivities from "./mission-activities";
import type * as bridgeActivities from "./bridge-activities";
import type { GenericMissionContract } from "./generic-contract";
import { acceptCheckpoint, type MissionCheckpoint } from "./mission-checkpoint";
import { MISSION_PROMPT } from "./t3-fixture";

const { verifyWorkspace, validateResult } = proxyActivities<typeof missionActivities>({
  startToCloseTimeout: "1 minute",
  retry: { maximumAttempts: 2 }
});
const { prepareGenericMission, verifyOpenCodeWorkspace } = proxyActivities<typeof missionActivities>({
  startToCloseTimeout: "3 minutes",
  retry: { maximumAttempts: 2 }
});
// The oracle runs prepare + validate, each bounded at 130 s by spawnSync, so the
// envelope must exceed 260 s. Single attempt: reuse of an oracle execution id
// on retry is not proven safe, and a lost result fails closed as blocked.
const { validateGenericMission } = proxyActivities<typeof missionActivities>({
  startToCloseTimeout: "5 minutes",
  retry: { maximumAttempts: 1 }
});
// Containment is idempotent and intentionally outlives the mission budget.
const { abortMission } = proxyActivities<typeof missionActivities>({
  startToCloseTimeout: "30 seconds",
  retry: { maximumAttempts: 3, initialInterval: "2 seconds" }
});
// start_mission is idempotent by mission_id (retry finds the existing mission).
const { startMission, replyPermission } = proxyActivities<typeof missionActivities>({
  startToCloseTimeout: "90 seconds",
  heartbeatTimeout: "15 seconds",
  retry: { maximumAttempts: 3, initialInterval: "2 seconds", backoffCoefficient: 2, maximumInterval: "8 seconds" }
});
const { continueMission } = proxyActivities<typeof missionActivities>({
  startToCloseTimeout: "90 seconds",
  heartbeatTimeout: "15 seconds",
  retry: { maximumAttempts: 2, initialInterval: "2 seconds", maximumInterval: "8 seconds" }
});
// Waiting is idempotent; it never starts a mission and can be safely retried.
const { waitMission } = proxyActivities<typeof missionActivities>({
  // The activity itself observes maxMs (at most 15 minutes); retain one minute
  // of Temporal envelope so a bounded graceful timeout is returned instead of
  // a scheduler timeout at the same boundary.
  startToCloseTimeout: "16 minutes",
  heartbeatTimeout: "15 seconds",
  retry: { maximumAttempts: 3, initialInterval: "5 seconds" }
});

// T4: subscription + delivery through the existing bridge code.
const { bridgeSubscribe, bridgeEmit } = proxyActivities<typeof bridgeActivities>({
  startToCloseTimeout: "2 minutes",
  retry: { maximumAttempts: 2 } // delivery is idempotent: outbox + stable eventId
});

export type PermissionDecision = { permissionId: string; decision: "once" | "reject"; by: string };
export const permissionSignal = defineSignal<[PermissionDecision]>("permission");
export const missionQuery = defineQuery<MissionState>("mission");

export type MissionState = {
  phase: string;
  missionId: string;
  sessionId: string | null;
  pendingPermission: unknown;
  permissionsHandled: PermissionDecision[];
  lastText: string | null;
  validation: unknown;
  bridge: unknown;
  transitions: { phase: string; at: string }[];
};

// A primary fixture is insufficient if the independent semantic variant is
// absent or fails. Keep the rule pure so it is tested without a Temporal run.
export function validationAccepted(validation: unknown): boolean {
  if (!validation || typeof validation !== "object") return false;
  const value = validation as { ok?: unknown; errors?: unknown; variant?: { ok?: unknown; errors?: unknown } | null };
  return value.ok === true &&
    Array.isArray(value.errors) && value.errors.length === 0 &&
    value.variant !== null && typeof value.variant === "object" &&
    value.variant.ok === true &&
    Array.isArray(value.variant.errors) && value.variant.errors.length === 0;
}

export function validatorExecutionFailure(): { ok: false; errors: string[]; variant: null } {
  // Avoid exposing provider or filesystem details in durable workflow state.
  return { ok: false, errors: ["validator execution failed"], variant: null };
}

export async function constructorMissionWorkflow(input: { missionId: string; title: string; workspace: string; bridge?: boolean }): Promise<MissionState> {
  const s: MissionState = {
    phase: "started", missionId: input.missionId, sessionId: null, pendingPermission: null,
    permissionsHandled: [], lastText: null, validation: null, bridge: null, transitions: []
  };
  const decisions = new Map<string, PermissionDecision>();
  const mark = (p: string) => { s.phase = p; s.transitions.push({ phase: p, at: new Date().toISOString() }); log.info("mission transition", { p }); };
  setHandler(missionQuery, () => s);
  setHandler(permissionSignal, (d) => { if (!decisions.has(d.permissionId)) decisions.set(d.permissionId, d); });

  mark("started");
  await verifyWorkspace({ workspace: input.workspace });
  mark("workspace_verified");
  if (input.bridge) {
    s.bridge = { subscription: await bridgeSubscribe({ missionId: input.missionId }) };
    mark("bridge_subscribed");
  }
  const st = await startMission({ missionId: input.missionId, title: input.title, prompt: MISSION_PROMPT });
  s.sessionId = st.sessionId;
  mark(st.alreadyExisted ? "mission_reattached" : "mission_started");

  for (let round = 0; round < 12; round++) {
    const m = await waitMission({
      missionId: input.missionId, expectedSessionId: s.sessionId, maxMs: 12 * 60_000,
      repliedPermissions: s.permissionsHandled.map((p) => p.permissionId)
    });
    if (m.kind === "permission") {
      s.pendingPermission = m.permission;
      mark("awaiting_permission");
      const id = m.permission.permission_id;
      if (!(await condition(() => decisions.has(id), "2 hours"))) { mark("permission_timeout"); return s; }
      const d = decisions.get(id)!;
      await replyPermission({ missionId: input.missionId, permissionId: id, decision: d.decision });
      s.permissionsHandled.push(d);
      s.pendingPermission = null;
      mark(d.decision === "once" ? "permission_granted" : "permission_rejected");
      continue;
    }
    if (m.kind === "idle") { s.lastText = m.text; mark("turn_finished"); break; }
    mark(m.kind); // stalled | timeout | session_mismatch: no automatic continue_mission
    return s;
  }
  if (input.bridge) {
    s.bridge = { ...(s.bridge as object), delivery: await bridgeEmit({ missionId: input.missionId }) };
    mark("bridge_delivered");
  }
  try {
    s.validation = await validateResult({ workspace: input.workspace });
  } catch {
    s.validation = validatorExecutionFailure();
  }
  mark(validationAccepted(s.validation) ? "validated" : "validation_failed");
  return s;
}

export type GenericMissionState = {
  phase: string;
  temporal_status: "running" | "completed";
  functional_status: "not_started" | "running" | "passed" | "failed" | "blocked";
  mission_id: string;
  session_id: string | null;
  validation_evidence: unknown;
  attempts: { starts: number; repairs: number; max_repairs: number };
  permission_status: "none" | "pending";
  pending_permission: { permission_id: string; session_id: string; permission: unknown; patterns: unknown; risk: "sensitive" | "critical" } | null;
  permissions_handled: string[];
  artifact_paths: string[];
  oracle_execution_ids: string[];
  checkpoint: MissionCheckpoint | null;
  budget_exhausted: boolean;
  deadline_at: string | null;
  last_error: string | null;
  next_action: "wait" | "decide_permission" | "review_evidence" | "none";
  transitions: { phase: string; at: string }[];
};

// P4 risk tier (mirrors opencode-policy.ts; workflow code stays dependency-free).
export function permissionRiskTier(permission: unknown): "sensitive" | "critical" {
  return permission === "edit" || permission === "bash" ? "sensitive" : "critical";
}

// Minimal public state before the contract is validated; echoes only the
// requested mission id (opaque slug), never instructions or paths.
export function preparingState(raw: unknown): GenericMissionState {
  const id = (raw as any)?.missionId;
  return {
    phase: "preparing", temporal_status: "running", functional_status: "not_started",
    mission_id: typeof id === "string" && /^[a-z0-9][a-z0-9-]{2,119}$/.test(id) ? id : "invalid", session_id: null,
    validation_evidence: null, attempts: { starts: 0, repairs: 0, max_repairs: 0 }, permission_status: "none", pending_permission: null,
    permissions_handled: [], artifact_paths: [], oracle_execution_ids: [], checkpoint: null, budget_exhausted: false,
    deadline_at: null, last_error: null, next_action: "wait", transitions: []
  };
}

// Activity failures end the mission as an explicit, queryable state instead of
// a failed workflow. Only the failure type crosses into history, never text.
export function failurePhase(error: unknown): { phase: "budget_exhausted" | "activity_failed"; type: string } {
  const cause = error instanceof ActivityFailure ? error.cause : error;
  const type = cause instanceof ApplicationFailure && cause.type ? cause.type : (cause as any)?.name ?? "Error";
  return { phase: type === "BudgetExhausted" ? "budget_exhausted" : "activity_failed", type: String(type).slice(0, 80) };
}

export const genericMissionQuery = defineQuery<GenericMissionState>("generic-mission");
export const genericMissionCheckpointSignal = defineSignal<[MissionCheckpoint]>("generic-mission-checkpoint");
export type GenericPermission = { mission_id: string; session_id: string; permission_id: string; patterns: unknown };
export type GenericPermissionDecision = GenericPermission & { decision: "once" | "reject"; by: string };
export function acceptGenericPermission(expected: GenericPermission, decision: GenericPermissionDecision): boolean {
  return decision.mission_id === expected.mission_id && decision.session_id === expected.session_id &&
    decision.permission_id === expected.permission_id && JSON.stringify(decision.patterns) === JSON.stringify(expected.patterns) &&
    (decision.decision === "once" || decision.decision === "reject") && decision.by.trim().length > 0;
}
export function budgetExpired(now: number, deadline: number): boolean { return !Number.isFinite(now) || !Number.isFinite(deadline) || now >= deadline; }
export function remainingBudgetMs(now: number, deadline: number): number { return Math.max(0, deadline - now); }
const PUBLIC_DIAGNOSTIC_MESSAGES: Record<string, string> = Object.freeze({
  ORACLE_UNAVAILABLE: "Independent oracle unavailable; no functional verdict was produced.",
  MISSING_ARTIFACT: "A required public artifact is missing from the mission workspace.",
  FUNCTIONAL_FAILURE: "Independent functional checks rejected the generated program."
});
export function publicDiagnosticMessage(code: string): string {
  return PUBLIC_DIAGNOSTIC_MESSAGES[code] ?? PUBLIC_DIAGNOSTIC_MESSAGES.FUNCTIONAL_FAILURE;
}
export function canRepair(repairs: number, maxRepairs: number): boolean {
  return Number.isInteger(repairs) && Number.isInteger(maxRepairs) && repairs < maxRepairs;
}

// Only structured, non-secret oracle diagnostics enter a repair turn. This
// module runs in the deterministic workflow sandbox, so keep it dependency-free.
export function repairPromptFromDiagnostics(diagnostics: Array<{ code: string; summary: string }>): string {
  const allowed = new Set(["ORACLE_UNAVAILABLE", "MISSING_ARTIFACT", "FUNCTIONAL_FAILURE"]);
  const publicDiagnostics = diagnostics.map((d) => {
    const code = allowed.has(d.code) ? d.code : "FUNCTIONAL_FAILURE";
    return `- [${code}] ${publicDiagnosticMessage(code)}`;
  }).join("\n").slice(0, 1200);
  return `Continúa la misma misión y sesión. Corrige únicamente los defectos funcionales descritos a continuación. No accedas a rutas fuera del workspace, no modifiques pruebas externas y vuelve a ejecutar las pruebas públicas disponibles.\n${publicDiagnostics}`;
}

// This path reuses the start/wait heartbeat and reconciliation activities but
// remains fail-closed until validation crosses an independent OS boundary.
export async function genericConstructorMissionWorkflow(input: { contract: GenericMissionContract; title: string }): Promise<GenericMissionState> {
  // Queryable from the first workflow task: preparation can take minutes.
  let current: GenericMissionState | null = null;
  setHandler(genericMissionQuery, () => current ?? preparingState(input.contract));
  const contract = await prepareGenericMission({ contract: input.contract });
  // The absolute deadline counts from the workflow start (including preparation)
  // and is passed to every Activity, so retries cannot extend it.
  const deadline = workflowInfo().startTime.getTime() + contract.budget.maxDurationMs;
  const s: GenericMissionState = {
    phase: "created", temporal_status: "running", functional_status: "not_started", mission_id: contract.missionId, session_id: null,
    validation_evidence: null, attempts: { starts: 0, repairs: 0, max_repairs: contract.budget.maxRepairAttempts },
    permission_status: "none", pending_permission: null, permissions_handled: [], artifact_paths: contract.artifactPaths.map((artifact) => `${contract.workspace}/${artifact}`), oracle_execution_ids: [], checkpoint: null,
    budget_exhausted: false, deadline_at: new Date(deadline).toISOString(), last_error: null, next_action: "wait", transitions: []
  };
  const decisions = new Map<string, GenericPermissionDecision>();
  const permissionSignal = defineSignal<[GenericPermissionDecision]>("generic-permission");
  current = s;
  const mark = (phase: string) => { s.phase = phase; s.transitions.push({ phase, at: new Date().toISOString() }); log.info("generic mission transition", { phase }); };
  setHandler(genericMissionCheckpointSignal, (checkpoint) => {
    s.checkpoint = acceptCheckpoint(s.checkpoint, checkpoint, s.mission_id, s.session_id, s.attempts.repairs);
  });
  setHandler(permissionSignal, (reply) => {
    const expected = s.pending_permission && { mission_id: s.mission_id, session_id: s.pending_permission.session_id, permission_id: s.pending_permission.permission_id, patterns: s.pending_permission.patterns };
    if (expected && acceptGenericPermission(expected, reply) && !decisions.has(reply.permission_id)) decisions.set(reply.permission_id, reply);
  });
  // New executions contain every unsuccessful terminal path. Pre-patch
  // histories must replay their recorded closure without inserting an Activity.
  // startAttempted (not session_id): an ambiguous start may have created a
  // session the workflow never learned about; the adapter aborts by mission id.
  let startAttempted = false;
  const finish = async (phase: string, functional: GenericMissionState["functional_status"], nextAction: GenericMissionState["next_action"] = "review_evidence") => {
    const containOnClose = patched("generic-terminal-containment-v1");
    s.functional_status = functional;
    if (phase === "budget_exhausted") s.budget_exhausted = true;
    mark(phase);
    if (containOnClose && startAttempted && functional !== "passed") {
      // Containment must run even when the workflow itself is being cancelled.
      try { await CancellationScope.nonCancellable(() => abortMission({ missionId: contract.missionId })); mark("session_aborted"); }
      catch { s.last_error ??= "AbortFailed"; mark("session_abort_failed"); }
    }
    if (containOnClose) { s.pending_permission = null; s.permission_status = "none"; }
    s.next_action = nextAction; s.temporal_status = "completed";
    return s;
  };
  const expired = () => budgetExpired(Date.now(), deadline);
  mark("contract_validated");
  // One identity: Temporal workflow id, mission id and workspace basename.
  if (workflowInfo().workflowId !== contract.missionId) return await finish("identity_mismatch", "blocked");
  try {
    if (expired()) return await finish("budget_exhausted", "blocked");
    await verifyOpenCodeWorkspace({ workspace: contract.workspace });
    mark("workspace_and_server_verified");
    if (expired()) return await finish("budget_exhausted", "blocked");
    startAttempted = true;
    const started = await startMission({ missionId: contract.missionId, title: input.title, prompt: contract.instructions, deadlineAt: deadline });
    s.session_id = started.sessionId;
    s.attempts.starts = 1;
    s.functional_status = "running";
    mark(started.alreadyExisted ? "mission_reattached" : "mission_started");
    while (true) {
      if (expired()) return await finish("budget_exhausted", "blocked");
      s.next_action = "wait";
      const monitored = await waitMission({ missionId: contract.missionId, expectedSessionId: s.session_id, maxMs: Math.max(1, remainingBudgetMs(Date.now(), deadline)), repliedPermissions: s.permissions_handled, deadlineAt: deadline });
      if (monitored.kind === "permission") {
        s.permission_status = "pending";
        s.pending_permission = { permission_id: monitored.permission.permission_id, session_id: monitored.sessionId, permission: monitored.permission.permission, patterns: monitored.permission.patterns, risk: permissionRiskTier(monitored.permission.permission) };
        s.next_action = "decide_permission";
        mark("permission_pending");
        if (!(await condition(() => decisions.has(monitored.permission.permission_id), Math.max(1, remainingBudgetMs(Date.now(), deadline))))) return await finish("permission_timeout", "blocked");
        const decision = decisions.get(monitored.permission.permission_id)!;
        if (decision.session_id !== s.session_id || decision.mission_id !== s.mission_id || JSON.stringify(decision.patterns) !== JSON.stringify(monitored.permission.patterns)) return await finish("permission_mismatch", "blocked");
        if (decision.decision === "once" && expired()) return await finish("budget_exhausted", "blocked");
        await replyPermission({ missionId: contract.missionId, permissionId: decision.permission_id, decision: decision.decision, deadlineAt: deadline });
        s.permissions_handled.push(decision.permission_id);
        s.pending_permission = null; s.permission_status = "none";
        mark(decision.decision === "once" ? "permission_granted" : "permission_rejected");
        if (decision.decision === "reject") return await finish("permission_rejected_stop", "blocked");
        continue;
      }
      if (monitored.kind !== "idle") return await finish(monitored.kind, monitored.kind === "timeout" ? "blocked" : "failed");
      if (expired()) return await finish("budget_exhausted", "blocked");
      // This identity is derived only from durable workflow metadata and state.
      // A repair creates the next ordinal; validation is never retried.
      const oracleExecutionId = oracleExecutionIdFromTemporalRun(workflowInfo().runId, s.oracle_execution_ids.length + 1);
      s.oracle_execution_ids.push(oracleExecutionId);
      const evidence = await validateGenericMission({ contract, sessionId: s.session_id, oracleExecutionId, deadlineAt: deadline });
      s.validation_evidence = evidence;
      if (evidence.ok) return await finish("validated", "passed", "none");
      if (evidence.status === "failed" && canRepair(s.attempts.repairs, s.attempts.max_repairs)) {
        if (expired()) return await finish("budget_exhausted", "blocked");
        s.attempts.repairs++;
        // Stable per-repair key: a retried Activity cannot send the prompt twice.
        await continueMission({ missionId: contract.missionId, prompt: repairPromptFromDiagnostics(evidence.diagnostics), continuationId: `${contract.missionId}-repair-${s.attempts.repairs}`, deadlineAt: deadline });
        mark("repair_started");
        continue;
      }
      // Exhausted repairs and unavailable validation are hard stops.
      return await finish("validation_blocked", evidence.status === "failed" ? "failed" : "blocked");
    }
  } catch (error) {
    // A cancelled workflow still contains its session, then stays cancelled.
    if (isCancellation(error)) { s.last_error = "Cancelled"; await finish("cancelled", "blocked"); throw error; }
    const failure = failurePhase(error);
    s.last_error = failure.type;
    return await finish(failure.phase, "blocked");
  }
}
