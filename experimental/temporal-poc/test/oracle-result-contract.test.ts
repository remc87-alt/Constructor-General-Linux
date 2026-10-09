import assert from "node:assert/strict";
import test from "node:test";
import { oracleExecutionIdFromTemporalRun, parsePublicOracleResult, publicOracleResultPath } from "../src/oracle-result-contract.ts";

const missionId = "oracle-contract-20261009-001";
const runId = "01a120b1-d9d6-7a94-8d14-eb6a8e4df26b";
const executionId = oracleExecutionIdFromTemporalRun(runId, 1);
const identity = { missionId, oracleExecutionId: executionId };
const passed = { schema: "cgl-oracle-result-v1", mission_id: missionId, oracle_execution_id: executionId, ok: true, status: "passed", diagnostics: [] };

test("public oracle result is mission-scoped and accepts a consistent pass", () => {
  assert.equal(publicOracleResultPath(identity), `/var/lib/cgl-oracle-public-results/${missionId}--${executionId}.json`);
  assert.deepEqual(parsePublicOracleResult(passed, identity), passed);
});

test("public oracle result preserves a mission-scoped functional failure", () => {
  const failed = {
    schema: "cgl-oracle-result-v1",
    mission_id: missionId,
    oracle_execution_id: executionId,
    ok: false,
    status: "failed",
    diagnostics: [{ code: "FUNCTIONAL_FAILURE", summary: "oracle rejected generated program" }]
  } as const;
  assert.deepEqual(parsePublicOracleResult(failed, identity), failed);
});

test("execution identity is stable for retries and distinct for a new validation", () => {
  assert.equal(oracleExecutionIdFromTemporalRun(runId, 1), executionId);
  assert.notEqual(oracleExecutionIdFromTemporalRun(runId, 2), executionId);
  assert.notEqual(publicOracleResultPath({ ...identity, missionId: "oracle-contract-20261009-002" }), publicOracleResultPath(identity));
});

test("public oracle result rejects cross-mission, stale, corrupt and inconsistent verdicts", () => {
  assert.throws(() => parsePublicOracleResult({ ...passed, mission_id: "other-20261009-001" }, identity));
  assert.throws(() => parsePublicOracleResult({ ...passed, oracle_execution_id: oracleExecutionIdFromTemporalRun(runId, 2) }, identity));
  assert.throws(() => parsePublicOracleResult({ ...passed, ok: false, status: "passed" }, identity));
  assert.throws(() => parsePublicOracleResult({ ...passed, diagnostics: [{ code: "FUNCTIONAL_FAILURE", summary: "must not accompany pass" }] }, identity));
  assert.throws(() => parsePublicOracleResult(undefined, identity));
  assert.throws(() => publicOracleResultPath({ missionId: "../../escape", oracleExecutionId: executionId }));
});
