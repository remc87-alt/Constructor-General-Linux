import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { validateGenericMissionContract } from "../src/generic-contract.ts";
import { canRepair, repairPromptFromDiagnostics, validationAccepted } from "../src/workflows.ts";

function fixture(root: string) {
  const missionId = "bench-expense-001";
  const workspace = path.join(root, missionId);
  fs.mkdirSync(workspace, { recursive: true });
  fs.writeFileSync(path.join(workspace, "opencode.json"), "{}", { mode: 0o600 });
  return {
    missionId, workspace,
    instructions: "Build the requested CLI in the current workspace.",
    validation: { kind: "external-oracle", oracleId: "expense-oracle-001", requiredArtifacts: ["expense_cli.py"] },
    budget: { maxRepairAttempts: 3, maxDurationMs: 300_000, maxTokens: null },
    artifactPaths: ["expense_cli.py", "test_expense_cli.py"]
  };
}

test("generic contract accepts an isolated absolute workspace and opaque oracle identity", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "generic-contract-"));
  try {
    const value = fixture(root);
    const contract = validateGenericMissionContract(value, { workspaceRoot: root });
    assert.equal(contract.workspace, fs.realpathSync(value.workspace));
    assert.equal(contract.validation.oracleId, "expense-oracle-001");
    assert.equal(contract.budget.maxRepairAttempts, 3);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("generic contract rejects external paths, traversal, and excessive repair budgets", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "generic-contract-"));
  try {
    const value = fixture(root);
    assert.throws(() => validateGenericMissionContract({ ...value, workspace: "/tmp" }, { workspaceRoot: root }), /workspace must be a child/);
    const mismatched = path.join(root, "different-workspace-001");
    fs.mkdirSync(mismatched);
    fs.writeFileSync(path.join(mismatched, "opencode.json"), "{}");
    assert.throws(() => validateGenericMissionContract({ ...value, workspace: mismatched }, { workspaceRoot: root }), /workspace basename must equal missionId/);
    assert.throws(() => validateGenericMissionContract({ ...value, artifactPaths: ["../oracle.py"] }, { workspaceRoot: root }), /relative child path/);
    assert.throws(() => validateGenericMissionContract({ ...value, budget: { ...value.budget, maxRepairAttempts: 4 } }, { workspaceRoot: root }), /maxRepairAttempts/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("repair budget is capped and T6 validation remains strict", () => {
  assert.equal(canRepair(0, 3), true);
  assert.equal(canRepair(3, 3), false);
  assert.equal(validationAccepted({ ok: true, errors: [], variant: { ok: false, errors: ["holdout"] } }), false);
});

test("repair diagnostics are structured and never expose hidden oracle paths", () => {
  const prompt = repairPromptFromDiagnostics([{ code: "FUNCTIONAL_FAILURE", summary: "public CLI test failed", artifactPaths: ["expense_cli.py"] }]);
  assert.match(prompt, /FUNCTIONAL_FAILURE/);
  assert.doesNotMatch(prompt, /oracle|hidden/i);
  assert.match(prompt, /misma misión y sesión/);
});
