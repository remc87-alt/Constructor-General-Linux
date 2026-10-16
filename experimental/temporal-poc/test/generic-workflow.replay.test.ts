// Read-only regression against the exact closed first E2E. No polling Worker,
// Activities, missions, OpenCode calls or model requests are started.
import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Client, Connection } from "@temporalio/client";
import { Worker } from "@temporalio/worker";

test("pre-patch permission timeout replays without retroactive containment", {
  skip: process.env.CGL_REPLAY_HISTORICAL !== "1" ? "set CGL_REPLAY_HISTORICAL=1 for the read-only historical replay" : false,
}, async () => {
  const workflowId = "cgl-e2e-expense-20261016-001";
  const runId = "01a14694-6989-76fd-b022-cbe1e0df549d";
  const connection = await Connection.connect({ address: "127.0.0.1:7243" });
  try {
    const client = new Client({ connection, namespace: "default" });
    const handle = client.workflow.getHandle(workflowId, runId);
    assert.equal((await handle.describe()).status.name, "COMPLETED");
    const history = await handle.fetchHistory();
    assert.equal(history.events?.length, 46);
    assert.equal(history.events?.at(-1)?.workflowExecutionCompletedEventAttributes !== undefined, true);
    assert.equal(history.events?.some((e) => e.activityTaskScheduledEventAttributes?.activityType?.name === "abortMission"), false);
    await Worker.runReplayHistory({
      workflowsPath: fileURLToPath(new URL("../src/workflows.ts", import.meta.url)),
    }, history, workflowId);
  } finally {
    await connection.close();
  }
});
