import assert from "node:assert/strict";
import test from "node:test";
import { ActivityFailure, ApplicationFailure, RetryState } from "@temporalio/common";
import { assertBeforeDeadline, monitorEndsAt } from "../src/mission-activities.ts";
import { missionOpenCodeConfig, openCodePolicyViolations, permissionRisk } from "../src/opencode-policy.ts";
import { failurePhase, permissionRiskTier } from "../src/workflows.ts";

const ARTIFACTS = ["expense_cli.py", "test_expense_cli.py"];

test("G04: effects are refused at and after the absolute deadline", () => {
  assert.doesNotThrow(() => assertBeforeDeadline(undefined));
  assert.doesNotThrow(() => assertBeforeDeadline(1_000, 999));
  assert.throws(() => assertBeforeDeadline(1_000, 1_000), (e: any) => e.type === "BudgetExhausted" && e.nonRetryable === true);
  assert.throws(() => assertBeforeDeadline(Number.NaN, 0), (e: any) => e.type === "BudgetExhausted");
});

test("G04: a retried wait attempt cannot extend monitoring past the deadline", () => {
  // First attempt scheduled with 600 s left; the retry restarts t0 500 s later.
  const deadline = 600_000;
  assert.equal(monitorEndsAt(0, 600_000, deadline), deadline);
  assert.equal(monitorEndsAt(500_000, 600_000, deadline), deadline);
  assert.equal(monitorEndsAt(700_000, 600_000, deadline) - 700_000 <= 0, true);
  assert.equal(monitorEndsAt(10, 100), 110); // legacy callers without a deadline
});

test("G03: the generated mission policy is accepted and is not globally permissive", () => {
  const config = missionOpenCodeConfig(ARTIFACTS);
  assert.deepEqual(openCodePolicyViolations(config, ARTIFACTS), []);
  assert.equal(config.permission.external_directory, "deny");
  assert.deepEqual(config.permission.bash, { "*": "ask" });
  assert.deepEqual(config.permission.edit, { "*": "ask" }, "code artifacts are never auto-editable");
  assert.deepEqual(missionOpenCodeConfig(["report.csv", "cli.py"]).permission.edit, { "*": "ask", "report.csv": "allow" });
});

test("G03: missing or weakened policies are rejected", () => {
  const base = missionOpenCodeConfig(ARTIFACTS).permission;
  const reject = (permission: unknown, pattern: RegExp) =>
    assert.match(openCodePolicyViolations({ permission }, ARTIFACTS).join("|"), pattern);
  assert.deepEqual(openCodePolicyViolations({ $schema: "x" }, ARTIFACTS), ["permission block missing"]);
  reject({ ...base, bash: "allow" }, /bash/);
  reject({ ...base, bash: { "*": "ask", "python3 *": "allow" } }, /bash/);
  reject({ ...base, edit: "allow" }, /edit/);
  reject({ ...base, edit: { "*": "allow" } }, /edit/);
  reject({ ...base, edit: { "*": "ask", "../secret.py": "allow" } }, /outside contract artifacts/);
  reject({ ...base, edit: { "*": "ask", "expense_cli.py": "allow" } }, /executable artifact/);
  reject({ ...base, external_directory: "ask" }, /external_directory/);
  reject({ ...base, webfetch: "allow" }, /webfetch/);
  reject({ ...base, "*": "allow" }, /"\*"/);
  reject({ ...base, doom_loop: "allow" }, /doom_loop/);
  reject({ ...base, read: "always" }, /invalid rule/);
});

test("P4: risk tiers escalate unknown permission types as critical", () => {
  for (const tier of [permissionRisk, permissionRiskTier]) {
    assert.equal(tier("bash"), "sensitive");
    assert.equal(tier("edit"), "sensitive");
    assert.equal(tier("external_directory"), "critical");
    assert.equal(tier(undefined), "critical");
  }
});

test("G04/F: activity failures map to explicit states without free text", () => {
  const budget = new ActivityFailure("a", "startMission", "1", RetryState.NON_RETRYABLE_FAILURE, undefined,
    ApplicationFailure.nonRetryable("mission budget exhausted", "BudgetExhausted"));
  assert.deepEqual(failurePhase(budget), { phase: "budget_exhausted", type: "BudgetExhausted" });
  const other = new ActivityFailure("a", "continueMission", "2", RetryState.MAXIMUM_ATTEMPTS_REACHED, undefined,
    ApplicationFailure.create({ message: "token=secret /home/x", type: "Error" }));
  const mapped = failurePhase(other);
  assert.equal(mapped.phase, "activity_failed");
  assert.doesNotMatch(JSON.stringify(mapped), /secret|home/);
});
