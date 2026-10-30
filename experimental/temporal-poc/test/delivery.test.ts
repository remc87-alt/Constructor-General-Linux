// Delivery of validated artifacts to an allow-listed repository. Uses a local
// bare repository as the remote: no network, no GitHub, no credentials.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { validateGenericMissionContract } from "../src/generic-contract.ts";
import { deliverMissionArtifacts, gitRunner, readGitHubToken } from "../src/delivery-activities.ts";

const REPO = "remc87-alt/cgl-sandbox";
const ENV = { CGL_DELIVERY_REPOS: `other/repo, ${REPO.toUpperCase()}` };

function workspace(root: string, missionId = "cgl-delivery-001") {
  const ws = path.join(root, "workspaces", missionId);
  fs.mkdirSync(ws, { recursive: true });
  fs.writeFileSync(path.join(ws, "opencode.json"), "{}", { mode: 0o600 });
  fs.writeFileSync(path.join(ws, "expense_cli.py"), "print('ok')\n");
  fs.writeFileSync(path.join(ws, "test_expense_cli.py"), "def test_ok():\n    assert True\n");
  fs.writeFileSync(path.join(ws, "secret.txt"), "not an artifact\n");
  return {
    missionId, workspace: ws, instructions: "build",
    validation: { kind: "external-oracle", oracleId: "expense-oracle-001", requiredArtifacts: ["expense_cli.py"] },
    budget: { maxRepairAttempts: 1, maxDurationMs: 300_000, maxTokens: null },
    artifactPaths: ["expense_cli.py", "test_expense_cli.py"],
  };
}

const sh = (args: string[], cwd: string) => {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" } });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
};

function bareRemote(root: string, withMain: boolean) {
  const bare = path.join(root, "remote.git");
  sh(["init", "-q", "--bare", "-b", "main", bare], root);
  if (withMain) {
    const seed = path.join(root, "seed");
    sh(["init", "-q", "-b", "main", seed], root);
    fs.writeFileSync(path.join(seed, "README.md"), "# sandbox\n");
    sh(["add", "README.md"], seed); sh(["commit", "-q", "-m", "init"], seed);
    sh(["push", "-q", bare, "main"], seed);
  }
  return bare;
}

const deps = (root: string, bare: string) => ({ token: () => undefined, git: gitRunner(undefined), remoteUrl: () => bare, tmpRoot: root, env: ENV });

test("contract: delivery is optional and normalized", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cgl-delivery-"));
  try {
    const base = workspace(root);
    const opts = { workspaceRoot: path.join(root, "workspaces"), deliveryAllowlist: ["remc87-alt/cgl-sandbox"] };
    assert.equal(validateGenericMissionContract(base, opts).delivery, undefined);
    const c = validateGenericMissionContract({ ...base, delivery: { repo: REPO } }, opts);
    assert.deepEqual(c.delivery, { repo: REPO, baseBranch: "main", targetDir: "" });
    const d = validateGenericMissionContract({ ...base, delivery: { repo: REPO, baseBranch: "develop", targetDir: "tools/gastos" } }, opts);
    assert.deepEqual(d.delivery, { repo: REPO, baseBranch: "develop", targetDir: "tools/gastos" });
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("contract: unlisted repos, bad branches and escaping targetDir are rejected", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cgl-delivery-"));
  try {
    const base = workspace(root);
    const opts = { workspaceRoot: path.join(root, "workspaces"), deliveryAllowlist: ["remc87-alt/cgl-sandbox"] };
    const bad = (delivery: unknown, re: RegExp) => assert.throws(() => validateGenericMissionContract({ ...base, delivery }, opts), re);
    bad({ repo: "remc87-alt/Constructor-General-Linux" }, /not listed in CGL_DELIVERY_REPOS/);
    bad({ repo: "https://github.com/remc87-alt/cgl-sandbox" }, /owner\/name/);
    bad({ repo: "remc87-alt/../x" }, /owner\/name/);
    bad({ repo: REPO, baseBranch: "main..x" }, /baseBranch/);
    bad({ repo: REPO, baseBranch: "-delete" }, /baseBranch/);
    bad({ repo: REPO, targetDir: "../outside" }, /relative child path/);
    bad({ repo: REPO, targetDir: "/abs" }, /relative child path/);
    bad({ repo: REPO, targetDir: "x/.git" }, /\.git/);
    bad("remc87-alt/cgl-sandbox", /delivery must be an object/);
    // With no allowlist configured, every delivery is refused.
    assert.throws(() => validateGenericMissionContract({ ...base, delivery: { repo: REPO } }, { workspaceRoot: opts.workspaceRoot, deliveryAllowlist: [] }), /not listed/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("delivers exactly the artifacts as branch cgl/<missionId>, never touching main", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cgl-delivery-"));
  try {
    const bare = bareRemote(root, true);
    const mainBefore = sh(["rev-parse", "main"], bare);
    const contract = { ...validateGenericMissionContract({ ...workspace(root), delivery: { repo: REPO, targetDir: "gastos" } }, { workspaceRoot: path.join(root, "workspaces"), deliveryAllowlist: [REPO] }) };
    const r = await deliverMissionArtifacts({ contract }, deps(root, bare));
    assert.equal(r.status, "pushed");
    assert.equal(r.branch, "cgl/cgl-delivery-001");
    assert.deepEqual(r.files, ["gastos/expense_cli.py", "gastos/test_expense_cli.py"]);
    assert.equal(sh(["rev-parse", "main"], bare), mainBefore, "main is untouched");
    assert.equal(sh(["rev-parse", "refs/heads/cgl/cgl-delivery-001"], bare), r.commit);
    const tree = sh(["ls-tree", "-r", "--name-only", r.commit], bare).split("\n");
    assert.deepEqual(tree.sort(), ["README.md", "gastos/expense_cli.py", "gastos/test_expense_cli.py"]);
    assert.equal(sh(["rev-parse", `${r.commit}^`], bare), mainBefore, "branch starts from main");
    assert.match(sh(["log", "-1", "--format=%B", r.commit], bare), /CGL-Mission: cgl-delivery-001/);
    assert.equal(fs.readdirSync(root).filter((f) => f.startsWith("cgl-delivery-")).length, 0, "temporary clone removed");
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("a retry finds its own branch and does not push again; a foreign branch is refused", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cgl-delivery-"));
  try {
    const bare = bareRemote(root, true);
    const contract = validateGenericMissionContract({ ...workspace(root), delivery: { repo: REPO } }, { workspaceRoot: path.join(root, "workspaces"), deliveryAllowlist: [REPO] });
    const first = await deliverMissionArtifacts({ contract }, deps(root, bare));
    const again = await deliverMissionArtifacts({ contract }, deps(root, bare));
    assert.equal(again.status, "already_delivered");
    assert.equal(again.commit, first.commit);
    // Someone else's branch with the same name must never be overwritten.
    sh(["update-ref", "refs/heads/cgl/cgl-delivery-001", "main"], bare);
    await assert.rejects(deliverMissionArtifacts({ contract }, deps(root, bare)), (e: any) => e.type === "DeliveryFailed" && /not this mission's delivery/.test(e.message));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("an empty repository receives the delivery as its first commit", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cgl-delivery-"));
  try {
    const bare = bareRemote(root, false);
    const contract = validateGenericMissionContract({ ...workspace(root), delivery: { repo: REPO } }, { workspaceRoot: path.join(root, "workspaces"), deliveryAllowlist: [REPO] });
    const r = await deliverMissionArtifacts({ contract }, deps(root, bare));
    assert.equal(r.status, "pushed");
    assert.deepEqual(sh(["ls-tree", "-r", "--name-only", r.commit], bare).split("\n").sort(), ["expense_cli.py", "test_expense_cli.py"]);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("symlinked artifacts, missing base branch, shrunk allowlist and expired budget fail closed", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cgl-delivery-"));
  try {
    const bare = bareRemote(root, true);
    const value = workspace(root);
    const opts = { workspaceRoot: path.join(root, "workspaces"), deliveryAllowlist: [REPO] };
    const contract = validateGenericMissionContract({ ...value, delivery: { repo: REPO } }, opts);
    await assert.rejects(deliverMissionArtifacts({ contract }, { ...deps(root, bare), env: { CGL_DELIVERY_REPOS: "other/repo" } }), /not listed/);
    await assert.rejects(deliverMissionArtifacts({ contract, deadlineAt: Date.now() - 1 }, deps(root, bare)), (e: any) => e.type === "BudgetExhausted");
    const noBase = validateGenericMissionContract({ ...value, delivery: { repo: REPO, baseBranch: "develop" } }, opts);
    await assert.rejects(deliverMissionArtifacts({ contract: noBase }, deps(root, bare)), /base branch develop not found/);
    fs.rmSync(path.join(value.workspace, "test_expense_cli.py"));
    fs.symlinkSync("/etc/passwd", path.join(value.workspace, "test_expense_cli.py"));
    await assert.rejects(deliverMissionArtifacts({ contract }, deps(root, bare)), /not a regular file/);
    assert.equal(sh(["for-each-ref", "--format=%(refname)", "refs/heads/cgl"], bare), "", "nothing was pushed");
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("missing credentials stop before any git effect; a loose token file is ignored", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cgl-delivery-"));
  try {
    const contract = validateGenericMissionContract({ ...workspace(root), delivery: { repo: REPO } }, { workspaceRoot: path.join(root, "workspaces"), deliveryAllowlist: [REPO] });
    await assert.rejects(deliverMissionArtifacts({ contract }, { token: () => undefined, env: ENV }), /credentials missing/);
    assert.equal(readGitHubToken({ CGL_GITHUB_TOKEN: " tok " }), "tok");
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
