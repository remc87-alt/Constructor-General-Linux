// Serializable, public-only checkpoint shared by Activities and the Workflow.
// It intentionally excludes model text, tool output, paths outside the declared
// artifacts, provider responses, credentials, and oracle-private diagnostics.
export type MissionCheckpoint = {
  mission_id: string;
  session_id: string;
  phase: "waiting" | "adapter_unavailable" | "permission_pending" | "turn_idle";
  last_seen_at: string;
  last_progress_at: string;
  last_checkpoint: "session_status" | "adapter_unavailable" | "permission_pending" | "turn_idle";
  permission_status: "none" | "pending";
  repair_attempts: number;
  next_action: "wait" | "inspect" | "escalate" | "permission_review" | "validate";
  functional_status: "running" | "blocked";
  observed_status: string;
};

const VALID_STATUS = /^(?:running|idle|retry|busy|working|unknown|adapter_unavailable)$/;

export function checkpointFromObservation(input: {
  missionId: string;
  sessionId: string;
  status: string;
  pendingPermission: boolean;
  now?: Date;
  previous?: MissionCheckpoint | null;
}): MissionCheckpoint {
  const now = input.now ?? new Date();
  const lastSeenAt = now.toISOString();
  const status = VALID_STATUS.test(input.status) ? input.status : "unknown";
  const statusChanged = input.previous == null || input.previous.observed_status !== status ||
    input.previous.permission_status !== (input.pendingPermission ? "pending" : "none");
  const lastProgressAt = statusChanged ? lastSeenAt : input.previous!.last_progress_at;
  const stalledForMs = now.getTime() - Date.parse(lastProgressAt);
  const nextAction = input.pendingPermission ? "permission_review"
    : status === "idle" ? "validate"
    : stalledForMs >= 10 * 60_000 ? "escalate"
    : stalledForMs >= 5 * 60_000 ? "inspect"
    : "wait";
  return {
    mission_id: input.missionId,
    session_id: input.sessionId,
    phase: input.pendingPermission ? "permission_pending" : status === "idle" ? "turn_idle" : status === "adapter_unavailable" ? "adapter_unavailable" : "waiting",
    last_seen_at: lastSeenAt,
    last_progress_at: lastProgressAt,
    last_checkpoint: input.pendingPermission ? "permission_pending" : status === "idle" ? "turn_idle" : status === "adapter_unavailable" ? "adapter_unavailable" : "session_status",
    permission_status: input.pendingPermission ? "pending" : "none",
    repair_attempts: input.previous?.repair_attempts ?? 0,
    next_action: nextAction,
    functional_status: input.pendingPermission ? "blocked" : "running",
    observed_status: status,
  };
}

// Do not create one history event per five-second poll. A state change is
// immediately visible; otherwise the Director receives a fresh observation at
// most once per minute, sufficient for the five-minute supervision policy.
export function checkpointDue(previous: MissionCheckpoint | null, next: MissionCheckpoint): boolean {
  if (!previous) return true;
  if (previous.observed_status !== next.observed_status || previous.permission_status !== next.permission_status) return true;
  return Date.parse(next.last_seen_at) - Date.parse(previous.last_seen_at) >= 60_000;
}

export function acceptCheckpoint(current: MissionCheckpoint | null, incoming: MissionCheckpoint, missionId: string, sessionId: string | null, repairs: number): MissionCheckpoint | null {
  if (incoming.mission_id !== missionId || !sessionId || incoming.session_id !== sessionId) return current;
  if (current && Date.parse(incoming.last_seen_at) <= Date.parse(current.last_seen_at)) return current;
  return { ...incoming, repair_attempts: repairs };
}
