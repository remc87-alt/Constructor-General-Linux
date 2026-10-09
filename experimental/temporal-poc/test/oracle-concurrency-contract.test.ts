import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { oracleExecutionIdFromTemporalRun, publicOracleResultPath } from "../src/oracle-result-contract.ts";

const runA = "01a120b1-d9d6-7a94-8d14-eb6a8e4df26b";
const runB = "01a120b2-d9d6-7a94-8d14-eb6a8e4df26b";

test("A/B concurrent missions derive disjoint manifest, staging and public-result identities", () => {
  const a = { mission: "csv-bench-a-001", execution: oracleExecutionIdFromTemporalRun(runA, 1) };
  const b = { mission: "csv-bench-b-001", execution: oracleExecutionIdFromTemporalRun(runB, 1) };
  const key = (x: typeof a) => `${x.mission}--${x.execution}.json`;
  assert.notEqual(key(a), key(b));
  assert.notEqual(`/var/lib/cgl-oracle/jobs/${a.mission}/${a.execution}`, `/var/lib/cgl-oracle/jobs/${b.mission}/${b.execution}`);
  assert.notEqual(publicOracleResultPath({ missionId: a.mission, oracleExecutionId: a.execution }), publicOracleResultPath({ missionId: b.mission, oracleExecutionId: b.execution }));
});

test("same mission uses a stable retry identity and a separate repair validation identity", () => {
  const first = oracleExecutionIdFromTemporalRun(runA, 1);
  assert.equal(oracleExecutionIdFromTemporalRun(runA, 1), first);
  assert.notEqual(oracleExecutionIdFromTemporalRun(runA, 2), first);
});

test("candidate wrappers remove global active-job/current result contracts and take exactly two opaque IDs", () => {
  const root = path.resolve(import.meta.dirname, "..");
  const prepare = fs.readFileSync(path.join(root, "oracle-wrapper/cgl-oracle-prepare.py"), "utf8");
  const validate = fs.readFileSync(path.join(root, "oracle-wrapper/cgl-oracle-validate.py"), "utf8");
  assert.doesNotMatch(prepare, /active-job\.json/);
  assert.doesNotMatch(validate, /active-job\.json|results\/current\.json/);
  assert.match(prepare, /len\(sys\.argv\) != 3/);
  assert.match(validate, /len\(sys\.argv\) != 3/);
  assert.match(validate, /os\.link\(tmp, final\)/);
  assert.match(prepare, /os\.O_NOFOLLOW/);
  assert.match(prepare, /stage\.lstat\(\)/);
  assert.match(validate, /path\.lstat\(\)/);
});
