import assert from "node:assert/strict";
import test from "node:test";
import { oracleExecutionTrace, sanitizeOracleOutput } from "../src/mission-activities.ts";

const identity = { missionId: "oracle-diag-001", oracleExecutionId: "01a12211-0d21-7e45-a1f6-ab7695f8602a-v1" };

test("oracle trace preserves stage, identity and exit code while redacting sensitive output", () => {
  const trace = oracleExecutionTrace("prepare", identity, {
    status: 1,
    stdout: "workspace check",
    stderr: "password: super-secret /var/lib/cgl-oracle/jobs/private.json"
  });
  assert.equal(trace.stage, "prepare");
  assert.equal(trace.mission_id, identity.missionId);
  assert.equal(trace.oracle_execution_id, identity.oracleExecutionId);
  assert.equal(trace.exit_code, 1);
  assert.match(trace.stderr, /password=\[REDACTED\]/i);
  assert.doesNotMatch(trace.stderr, /super-secret|\/var\/lib/);
});

test("oracle output sanitization is bounded and removes control characters and absolute paths", () => {
  const output = sanitizeOracleOutput(`failed at /private/input\u0000 ${"x".repeat(800)}`);
  assert.match(output, /<path>/);
  assert.doesNotMatch(output, /\u0000/);
  assert.ok(output.length <= 600);
});
