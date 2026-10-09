import { proxyActivities, defineSignal, defineQuery, setHandler, condition, log, workflowInfo } from "@temporalio/workflow";
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
const { prepareGenericMission, verifyOpenCodeWorkspace, validateGenericMission } = proxyActivities<typeof missionActivities>({
  startToCloseTimeout: "3 minutes",
  retry: { maximumAttempts: 2 }
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
  artifact_paths: string[];
  oracle_execution_ids: string[];
  checkpoint: MissionCheckpoint | null;
  transitions: { phase: string; at: string }[];
};

export const genericMissionQuery = defineQuery<GenericMissionState>("generic-mission");
export const genericMissionCheckpointSignal = defineSignal<[MissionCheckpoint]>("generic-mission-checkpoint");
export function canRepair(repairs: number, maxRepairs: number): boolean {
  return Number.isInteger(repairs) && Number.isInteger(maxRepairs) && repairs < maxRepairs;
}

// Only structured, non-secret oracle diagnostics enter a repair turn. This
// module runs in the deterministic workflow sandbox, so keep it dependency-free.
export function repairPromptFromDiagnostics(diagnostics: Array<{ code: string; summary: string }>): string {
  const publicDiagnostics = diagnostics.map((d) => `- [${d.code}] ${d.summary}`).join("\n");
  return `Continúa la misma misión y sesión. Corrige únicamente los defectos funcionales descritos a continuación. No accedas a rutas fuera del workspace, no modifiques pruebas externas y vuelve a ejecutar las pruebas públicas disponibles.\n${publicDiagnostics}`;
}

// This path reuses the start/wait heartbeat and reconciliation activities but
// remains fail-closed until validation crosses an independent OS boundary.
export async function genericConstructorMissionWorkflow(input: { contract: GenericMissionContract; title: string }): Promise<GenericMissionState> {
  const contract = await prepareGenericMission({ contract: input.contract });
  const s: GenericMissionState = {
    phase: "created", temporal_status: "running", functional_status: "not_started", mission_id: contract.missionId, session_id: null,
    validation_evidence: null, attempts: { starts: 0, repairs: 0, max_repairs: contract.budget.maxRepairAttempts },
    permission_status: "none", artifact_paths: contract.artifactPaths.map((artifact) => `${contract.workspace}/${artifact}`), oracle_execution_ids: [], checkpoint: null, transitions: []
  };
  const mark = (phase: string) => { s.phase = phase; s.transitions.push({ phase, at: new Date().toISOString() }); log.info("generic mission transition", { phase }); };
  setHandler(genericMissionQuery, () => s);
  setHandler(genericMissionCheckpointSignal, (checkpoint) => {
    s.checkpoint = acceptCheckpoint(s.checkpoint, checkpoint, s.mission_id, s.session_id, s.attempts.repairs);
  });
  mark("contract_validated");
  await verifyOpenCodeWorkspace({ workspace: contract.workspace });
  mark("workspace_and_server_verified");
  const started = await startMission({ missionId: contract.missionId, title: input.title, prompt: contract.instructions });
  s.session_id = started.sessionId;
  s.attempts.starts = 1;
  s.functional_status = "running";
  mark(started.alreadyExisted ? "mission_reattached" : "mission_started");
  while (true) {
    const monitored = await waitMission({ missionId: contract.missionId, expectedSessionId: s.session_id, maxMs: contract.budget.maxDurationMs, repliedPermissions: [] });
    if (monitored.kind === "permission") {
      s.permission_status = "pending";
      s.functional_status = "blocked";
      mark("permission_escalated");
      s.temporal_status = "completed";
      return s;
    }
    if (monitored.kind !== "idle") {
      s.functional_status = "failed";
      mark(monitored.kind);
      s.temporal_status = "completed";
      return s;
    }
    // This identity is derived only from durable workflow metadata and state.
    // Activity retries receive this same input; a repair creates the next ordinal.
    const oracleExecutionId = oracleExecutionIdFromTemporalRun(workflowInfo().runId, s.oracle_execution_ids.length + 1);
    s.oracle_execution_ids.push(oracleExecutionId);
    const evidence = await validateGenericMission({ contract, sessionId: s.session_id, oracleExecutionId });
    s.validation_evidence = evidence;
    if (evidence.ok) {
      s.functional_status = "passed";
      mark("validated");
      s.temporal_status = "completed";
      return s;
    }
    if (evidence.status === "failed" && canRepair(s.attempts.repairs, s.attempts.max_repairs)) {
      s.attempts.repairs++;
      await continueMission({ missionId: contract.missionId, prompt: repairPromptFromDiagnostics(evidence.diagnostics) });
      mark("repair_started");
      continue;
    }
    // Until an independent runner exists, do not invent diagnostics or run
    // code. A failed runner result uses the same session above; exhausted
    // budgets and unavailable validation are hard stops.
    s.functional_status = "blocked";
    mark("validation_blocked");
    s.temporal_status = "completed";
    return s;
  }
}
