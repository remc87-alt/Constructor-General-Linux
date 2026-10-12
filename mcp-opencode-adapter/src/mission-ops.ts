// Effectful mission operations with explicit dependencies, so idempotency and
// containment can be tested without a live OpenCode.
export type MissionRecord = { session_id: string; title: string; continuations?: string[]; aborted_at?: string };
export type MissionMap = Record<string, MissionRecord>;
export type OpenCodeCall = (route: string, init?: RequestInit) => Promise<any>;
// get() must read the durable map fresh and patch() must re-read before writing
// only that mission's fields: each STDIO call is a separate adapter process.
export type MissionDeps = {
  get: (missionId: string) => MissionRecord | undefined;
  patch: (missionId: string, fields: Partial<MissionRecord>) => void;
  oc: OpenCodeCall;
};

const MODEL = { providerID: "freellmapi", modelID: "nemotron-3-super-120b" };

// At-most-once per continuation_id: the id is persisted BEFORE the prompt is
// sent, so a retry after an ambiguous outcome never sends a second prompt.
// Trade-off (fail closed): a definitive send failure is not resent either.
export async function continueOnce(deps: MissionDeps, input: { mission_id: string; prompt: string; continuation_id?: string }) {
  const mission = deps.get(input.mission_id);
  if (!mission) throw new Error(`unknown mission_id: ${input.mission_id}`);
  if (mission.aborted_at) throw new Error(`mission aborted: ${input.mission_id}`);
  if (input.continuation_id) {
    if (mission.continuations?.includes(input.continuation_id)) {
      return { mission_id: input.mission_id, session_id: mission.session_id, status: "already_sent", continuation_id: input.continuation_id };
    }
    deps.patch(input.mission_id, { continuations: [...(mission.continuations ?? []), input.continuation_id] });
  }
  // Re-check right before the effect: an abort may have landed meanwhile.
  if (deps.get(input.mission_id)?.aborted_at) throw new Error(`mission aborted: ${input.mission_id}`);
  await deps.oc(`/session/${encodeURIComponent(mission.session_id)}/prompt_async`, {
    method: "POST",
    body: JSON.stringify({ model: MODEL, parts: [{ type: "text", text: input.prompt }] })
  });
  return { mission_id: input.mission_id, session_id: mission.session_id, status: "running", continuation_id: input.continuation_id ?? null };
}

// Idempotent containment: marks the mission aborted (no further continuations)
// and stops the current OpenCode turn. An unknown mission has nothing to stop.
export async function abortMission(deps: MissionDeps, input: { mission_id: string }) {
  const mission = deps.get(input.mission_id);
  if (!mission) return { mission_id: input.mission_id, session_id: null, status: "not_found" };
  const abortedAt = mission.aborted_at ?? new Date().toISOString();
  if (!mission.aborted_at) deps.patch(input.mission_id, { aborted_at: abortedAt });
  await deps.oc(`/session/${encodeURIComponent(mission.session_id)}/abort`, { method: "POST" });
  return { mission_id: input.mission_id, session_id: mission.session_id, status: "aborted", aborted_at: abortedAt };
}
