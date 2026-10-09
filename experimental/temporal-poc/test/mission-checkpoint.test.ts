import assert from "node:assert/strict";
import test from "node:test";
import { acceptCheckpoint, checkpointDue, checkpointFromObservation } from "../src/mission-checkpoint.ts";

const missionId = "checkpoint-mission-001";
const sessionId = "ses_checkpoint_001";
const at = (seconds: number) => new Date(1_700_000_000_000 + seconds * 1000);

test("checkpoint records an observation without treating polls as functional progress", () => {
  const first = checkpointFromObservation({ missionId, sessionId, status: "running", pendingPermission: false, now: at(0) });
  const later = checkpointFromObservation({ missionId, sessionId, status: "running", pendingPermission: false, previous: first, now: at(6 * 60) });
  assert.equal(first.last_progress_at, first.last_seen_at);
  assert.notEqual(later.last_seen_at, later.last_progress_at);
  assert.equal(later.next_action, "inspect");
  const stale = checkpointFromObservation({ missionId, sessionId, status: "running", pendingPermission: false, previous: later, now: at(11 * 60) });
  assert.equal(stale.next_action, "escalate");
});

test("checkpoint escalates a permission without exposing its arguments", () => {
  const value = checkpointFromObservation({ missionId, sessionId, status: "running", pendingPermission: true, now: at(0) });
  assert.equal(value.phase, "permission_pending");
  assert.equal(value.permission_status, "pending");
  assert.equal(value.functional_status, "blocked");
  assert.equal(value.next_action, "permission_review");
  assert.deepEqual(Object.keys(value).sort(), ["functional_status", "last_checkpoint", "last_progress_at", "last_seen_at", "mission_id", "next_action", "observed_status", "permission_status", "phase", "repair_attempts", "session_id"].sort());
});

test("checkpoint distinguishes an idle turn and rate limits unchanged polls", () => {
  const first = checkpointFromObservation({ missionId, sessionId, status: "running", pendingPermission: false, now: at(0) });
  const idle = checkpointFromObservation({ missionId, sessionId, status: "idle", pendingPermission: false, previous: first, now: at(5) });
  assert.equal(idle.phase, "turn_idle");
  assert.equal(idle.next_action, "validate");
  assert.equal(checkpointDue(first, idle), true);
  const near = checkpointFromObservation({ missionId, sessionId, status: "idle", pendingPermission: false, previous: idle, now: at(30) });
  const minute = checkpointFromObservation({ missionId, sessionId, status: "idle", pendingPermission: false, previous: idle, now: at(65) });
  assert.equal(checkpointDue(idle, near), false);
  assert.equal(checkpointDue(idle, minute), true);
});

test("workflow accepts only fresh checkpoints for its durable mission and session", () => {
  const accepted = checkpointFromObservation({ missionId, sessionId, status: "running", pendingPermission: false, now: at(0) });
  assert.equal(acceptCheckpoint(null, accepted, missionId, sessionId, 2)?.repair_attempts, 2);
  const wrongMission = { ...accepted, mission_id: "other", last_seen_at: at(10).toISOString() };
  const wrongSession = { ...accepted, session_id: "ses_other", last_seen_at: at(10).toISOString() };
  assert.equal(acceptCheckpoint(accepted, wrongMission, missionId, sessionId, 0), accepted);
  assert.equal(acceptCheckpoint(accepted, wrongSession, missionId, sessionId, 0), accepted);
  assert.equal(acceptCheckpoint(accepted, accepted, missionId, sessionId, 0), accepted);
});
