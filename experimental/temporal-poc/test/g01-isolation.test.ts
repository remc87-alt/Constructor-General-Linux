// G01 focused tests: configurable workspace root, path escapes, git workspace,
// OpenCode server identity (no /proc/<pid>/cwd) and project-config hardening.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { ApplicationFailure } from "@temporalio/activity";
import { prepareGenericMission, verifyOpenCodeWorkspace, type VerifyOpenCodeDeps } from "../src/mission-activities.ts";
import { validateGenericMissionContract } from "../src/generic-contract.ts";
import { missionOpenCodeConfig, openCodePolicyViolations } from "../src/opencode-policy.ts";
import {
  createMissionWorkspace, ensureGitWorkspace, expectedExecutor, gitWorkspaceViolation, ISOLATED_OPENCODE_BIN,
  listenerUids, verifyServerIdentity, workspaceConfigViolation, workspaceRoot, type ServerIdentityInput
} from "../src/workspace.ts";

const tmp = () => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "g01-")));
const withTmp = (fn: (dir: string) => void | Promise<void>) => async () => {
  const dir = tmp();
  try { await fn(dir); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
};
const gitOut = (ws: string, ...args: string[]) => spawnSync("git", ["-C", ws, ...args], { encoding: "utf8", env: { PATH: "/usr/bin:/bin", HOME: "/nonexistent", GIT_CONFIG_NOSYSTEM: "1" } }).stdout.trim();
const ARTIFACTS = ["expense_cli.py", "report.csv"];

function contractFor(workspace: string, missionId = path.basename(workspace)) {
  return {
    missionId, workspace, instructions: "Build the requested CLI.",
    validation: { kind: "external-oracle", oracleId: "expense-oracle-001", requiredArtifacts: ["expense_cli.py"] },
    budget: { maxRepairAttempts: 1, maxDurationMs: 300_000, maxTokens: null },
    artifactPaths: ARTIFACTS
  };
}

// ---- 1. configurable root ----

test("workspaceRoot honours CGL_WORKSPACE_ROOT and keeps the legacy default when unset", withTmp((dir) => {
  assert.equal(workspaceRoot({ CGL_WORKSPACE_ROOT: dir }), dir);
  const legacy = path.join(os.homedir(), ".local/state/constructor-temporal-poc/workspaces");
  if (fs.existsSync(legacy)) assert.equal(workspaceRoot({}), fs.realpathSync(legacy));
}));

test("workspaceRoot fails closed on relative, non-normalized, symlinked, missing or non-directory roots", withTmp((dir) => {
  const link = path.join(dir, "link");
  fs.mkdirSync(path.join(dir, "real"));
  fs.symlinkSync(path.join(dir, "real"), link);
  fs.writeFileSync(path.join(dir, "file"), "");
  for (const [value, pattern] of [
    ["relative/root", /normalized absolute/], [`${dir}/real/`, /normalized absolute/], [`${dir}/real/../real`, /normalized absolute/],
    [link, /symlinks/], [path.join(dir, "missing"), /does not exist/], [path.join(dir, "file"), /directory/]
  ] as const) assert.throws(() => workspaceRoot({ CGL_WORKSPACE_ROOT: value }), pattern, value);
}));

test("the contract uses CGL_WORKSPACE_ROOT when no explicit root is passed", withTmp((dir) => {
  const ws = path.join(dir, "g01-root-001");
  fs.mkdirSync(ws);
  const saved = process.env.CGL_WORKSPACE_ROOT;
  process.env.CGL_WORKSPACE_ROOT = dir;
  try {
    assert.equal(validateGenericMissionContract(contractFor(ws)).workspace, ws);
    process.env.CGL_WORKSPACE_ROOT = path.join(dir, "absent");
    assert.throws(() => validateGenericMissionContract(contractFor(ws)), /workspace root unavailable/);
  } finally {
    if (saved === undefined) delete process.env.CGL_WORKSPACE_ROOT; else process.env.CGL_WORKSPACE_ROOT = saved;
  }
}));

// ---- 2/3. outside root, symlinks, traversal ----

test("workspaces outside the root, nested, traversing or symlinked are rejected", withTmp((dir) => {
  const root = path.join(dir, "root");
  const outside = path.join(dir, "outside", "g01-escape-001");
  fs.mkdirSync(path.join(root, "g01-parent-001", "g01-nested-001"), { recursive: true });
  fs.mkdirSync(outside, { recursive: true });
  const opts = { workspaceRoot: root };
  assert.throws(() => validateGenericMissionContract(contractFor(outside), opts), /child of the POC workspace root/);
  assert.throws(() => validateGenericMissionContract(contractFor(path.join(root, "g01-parent-001", "g01-nested-001")), opts), /child of the POC workspace root/);
  assert.throws(() => validateGenericMissionContract(contractFor(`${root}/../outside/g01-escape-001`, "g01-escape-001"), opts), /child of the POC workspace root/);
  fs.symlinkSync(outside, path.join(root, "g01-escape-001"));
  assert.throws(() => validateGenericMissionContract(contractFor(path.join(root, "g01-escape-001")), opts), /child of the POC workspace root/);
  fs.symlinkSync(path.join(root, "g01-parent-001"), path.join(root, "g01-alias-001"));
  assert.throws(() => validateGenericMissionContract(contractFor(path.join(root, "g01-alias-001")), opts), /basename must equal missionId/);
  assert.throws(() => validateGenericMissionContract(contractFor(root, "root"), opts), /child of the POC workspace root/);
}));

test("artifact paths cannot carry glob patterns into the OpenCode permission policy", withTmp((dir) => {
  const ws = path.join(dir, "g01-glob-001");
  fs.mkdirSync(ws);
  for (const bad of ["*.csv", "data/**", "r?.csv", "[a].csv", "{a,b}.csv"]) {
    assert.throws(() => validateGenericMissionContract({ ...contractFor(ws), artifactPaths: [...ARTIFACTS, bad] }, { workspaceRoot: dir }), /glob characters/, bad);
  }
  assert.throws(() => createMissionWorkspace("g01-glob-002", ["*.csv"], dir), /plain relative paths/);
  assert.throws(() => createMissionWorkspace("g01-glob-002", ["../x.csv"], dir), /plain relative paths/);
  assert.equal(fs.existsSync(path.join(dir, "g01-glob-002")), false);
}));

// ---- 6. git workspace ----

test("ensureGitWorkspace creates an own repo with one empty commit, group read-only", withTmp((dir) => {
  const ws = path.join(dir, "g01-git-001");
  fs.mkdirSync(ws);
  assert.deepEqual(ensureGitWorkspace(ws), { created: true });
  assert.equal(gitOut(ws, "rev-parse", "--show-toplevel"), ws);
  assert.equal(gitOut(ws, "rev-list", "--count", "HEAD"), "1");
  assert.equal(gitWorkspaceViolation(ws), undefined);
  assert.equal(fs.statSync(path.join(ws, ".git", "config")).mode & 0o777, 0o640);
  assert.equal(gitOut(ws, "config", "core.sharedRepository"), "0640");
}));

test("an existing valid repository is verified and never modified", withTmp((dir) => {
  const ws = path.join(dir, "g01-git-002");
  fs.mkdirSync(ws);
  ensureGitWorkspace(ws);
  const head = gitOut(ws, "rev-parse", "HEAD");
  const config = fs.readFileSync(path.join(ws, ".git", "config"), "utf8");
  assert.deepEqual(ensureGitWorkspace(ws), { created: false });
  assert.equal(gitOut(ws, "rev-parse", "HEAD"), head);
  assert.equal(fs.readFileSync(path.join(ws, ".git", "config"), "utf8"), config);
}));

test("foreign or ambiguous repositories are rejected without being touched", withTmp((dir) => {
  const foreign = path.join(dir, "foreign");
  fs.mkdirSync(foreign);
  ensureGitWorkspace(foreign);
  const cases: Array<[string, (ws: string) => void, RegExp]> = [
    ["g01-gitfile-001", (ws) => fs.writeFileSync(path.join(ws, ".git"), `gitdir: ${foreign}/.git\n`), /real directory/],
    ["g01-gitlink-001", (ws) => fs.symlinkSync(path.join(foreign, ".git"), path.join(ws, ".git")), /real directory/],
    ["g01-gitempty-001", (ws) => fs.mkdirSync(path.join(ws, ".git")), /toplevel/],
    ["g01-gitnohead-001", (ws) => { spawnSync("git", ["init", "-q", ws]); }, /initial commit/]
  ];
  for (const [name, plant, pattern] of cases) {
    const ws = path.join(dir, name);
    fs.mkdirSync(ws);
    plant(ws);
    const before = fs.readdirSync(path.join(ws), { recursive: true }).sort();
    assert.throws(() => ensureGitWorkspace(ws), pattern, name);
    assert.deepEqual(fs.readdirSync(path.join(ws), { recursive: true }).sort(), before, `${name} modified`);
  }
  assert.equal(gitOut(foreign, "rev-list", "--count", "HEAD"), "1");
}));

test("a workspace nested in another repository gets its own worktree (no parent capture)", withTmp((dir) => {
  ensureGitWorkspace(dir);
  const ws = path.join(dir, "g01-nested-001");
  fs.mkdirSync(ws);
  assert.match(gitWorkspaceViolation(ws) ?? "", /not a git repository/);
  ensureGitWorkspace(ws);
  assert.equal(gitOut(ws, "rev-parse", "--show-toplevel"), ws);
}));

test("git ignores hooks and fsmonitor planted in the repository config", withTmp((dir) => {
  const ws = path.join(dir, "g01-hooks-001");
  fs.mkdirSync(ws);
  ensureGitWorkspace(ws);
  const marker = path.join(dir, "pwned");
  fs.appendFileSync(path.join(ws, ".git", "config"), `[core]\n\tfsmonitor = touch ${marker}\n\thooksPath = ${dir}\n`);
  fs.writeFileSync(path.join(dir, "post-checkout"), `#!/bin/sh\ntouch ${marker}\n`, { mode: 0o755 });
  assert.equal(gitWorkspaceViolation(ws), undefined);
  assert.equal(fs.existsSync(marker), false);
}));

// ---- 9. preparation without partial effects ----

test("createMissionWorkspace builds the full workspace or leaves nothing behind", withTmp((dir) => {
  const ws = createMissionWorkspace("g01-create-001", ARTIFACTS, dir);
  assert.equal(ws, path.join(dir, "g01-create-001"));
  assert.equal(fs.statSync(ws).mode & 0o7777, 0o700);
  assert.deepEqual(openCodePolicyViolations(JSON.parse(fs.readFileSync(path.join(ws, "opencode.json"), "utf8")), ARTIFACTS), []);
  assert.equal(workspaceConfigViolation(ws), undefined);
  assert.throws(() => createMissionWorkspace("g01-create-001", ARTIFACTS, dir), /already exists/);
  assert.equal(gitOut(ws, "rev-list", "--count", "HEAD"), "1");

  assert.throws(() => createMissionWorkspace("g01-create-002", ARTIFACTS, dir, "/bin/false"), /git init failed/);
  assert.equal(fs.existsSync(path.join(dir, "g01-create-002")), false);
  assert.throws(() => createMissionWorkspace("Bad_Id", ARTIFACTS, dir), /slug/);
  assert.deepEqual(fs.readdirSync(dir), ["g01-create-001"]);
}));

test("ensureGitWorkspace removes a .git it created when initialisation fails", withTmp((dir) => {
  const ws = path.join(dir, "g01-rollback-001");
  fs.mkdirSync(ws);
  const fakeGit = path.join(dir, "fake-git");
  // init succeeds (real git), commit fails: the partial .git must disappear.
  fs.writeFileSync(fakeGit, `#!/bin/sh\nfor a in "$@"; do [ "$a" = commit ] && exit 1; done\nexec /usr/bin/git "$@"\n`, { mode: 0o755 });
  assert.throws(() => ensureGitWorkspace(ws, fakeGit), /initial commit failed/);
  assert.equal(fs.existsSync(path.join(ws, ".git")), false);
}));

test("workspaceConfigViolation rejects squatted, writable, linked or overriding config", withTmp((dir) => {
  const make = (name: string) => createMissionWorkspace(name, ARTIFACTS, dir);
  assert.match(workspaceConfigViolation(make("g01-cfg-001"), process.getuid!() + 1) ?? "", /owned by the orchestrator/);
  const writable = make("g01-cfg-002");
  fs.chmodSync(path.join(writable, "opencode.json"), 0o660);
  assert.match(workspaceConfigViolation(writable) ?? "", /group-writable/);
  const linked = make("g01-cfg-003");
  fs.linkSync(path.join(linked, "opencode.json"), path.join(dir, "hardlink"));
  assert.match(workspaceConfigViolation(linked) ?? "", /hard-linked/);
  const symlinked = make("g01-cfg-004");
  fs.renameSync(path.join(symlinked, "opencode.json"), path.join(dir, "elsewhere.json"));
  fs.symlinkSync(path.join(dir, "elsewhere.json"), path.join(symlinked, "opencode.json"));
  assert.match(workspaceConfigViolation(symlinked) ?? "", /real file/);
  for (const [name, plant] of [["g01-cfg-005", ".opencode"], ["g01-cfg-006", "opencode.jsonc"]] as const) {
    const ws = make(name);
    fs.mkdirSync(path.join(ws, plant));
    assert.match(workspaceConfigViolation(ws) ?? "", /not allowed/);
  }
  const noGit = make("g01-cfg-007");
  fs.rmSync(path.join(noGit, ".git"), { recursive: true });
  assert.match(workspaceConfigViolation(noGit) ?? "", /\.git missing/);
}));

test("project config may only carry the permission block (no provider, plugin or substitutions)", () => {
  const base = missionOpenCodeConfig(ARTIFACTS);
  assert.deepEqual(openCodePolicyViolations(base, ARTIFACTS), []);
  for (const key of ["provider", "plugin", "mcp", "model", "instructions", "agent"]) {
    assert.match(openCodePolicyViolations({ ...base, [key]: {} }, ARTIFACTS).join("|"), new RegExp(`config key not allowed: ${key}`));
  }
  const sub = { ...base, permission: { ...base.permission, bash: { "*": "ask", "{env:FREELLM_KEY}": "ask" } } };
  assert.match(openCodePolicyViolations(sub, ARTIFACTS).join("|"), /substitutions/);
});

// ---- 4/5. OpenCode identity and GET /path ----

const WS = "/srv/cgl/workspaces/g01-id-001";
const UID = 990;
const HOME = "/var/lib/cgl-exec";
const tcp = (rows: string[]) => ["  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode", ...rows].join("\n");
const row = (local: string, uid: number, st = "0A") => `   0: ${local} 00000000:0000 ${st} 00000000:00000000 00:00000000 00000000  ${uid}        0 12345 1`;
function procFixture(over: Partial<Record<string, string>> = {}) {
  const files: Record<string, string> = {
    "/proc/4242/cmdline": [ISOLATED_OPENCODE_BIN, "serve", "--hostname", "127.0.0.1", "--port", "4098", ""].join("\0"),
    "/proc/4242/status": `Name:\topencode\nUid:\t${UID}\t${UID}\t${UID}\t${UID}\nGid:\t1\t1\t1\t1\n`,
    "/proc/net/tcp": tcp([row("0100007F:1002", UID), row("0100007F:0BB9", 1000, "01")]),
    "/proc/net/tcp6": tcp([]),
    ...over
  };
  return (file: string) => { if (!(file in files)) throw new Error(`ENOENT ${file}`); return files[file]!; };
}
function identity(over: Partial<ServerIdentityInput> = {}, proc: Partial<Record<string, string>> = {}, pathInfo: unknown = { home: HOME, directory: WS, worktree: WS }): ServerIdentityInput {
  return { pid: "4242", workspace: WS, expectedUid: UID, expectedHome: HOME, allowedBins: [ISOLATED_OPENCODE_BIN], readProc: procFixture(proc), getPath: async () => pathInfo, ...over };
}

test("verifyServerIdentity accepts the exact executor server without reading /proc/<pid>/cwd", async () => {
  const read: string[] = [];
  const input = identity();
  const base = input.readProc;
  input.readProc = (file) => { read.push(file); return base(file); };
  assert.deepEqual(await verifyServerIdentity(input), { pid: "4242", uid: UID, directory: WS });
  assert.ok(!read.some((file) => file.endsWith("/cwd")));
});

test("verifyServerIdentity fails closed on any process identity inconsistency", async () => {
  const cmd = (...argv: string[]) => ({ "/proc/4242/cmdline": argv.join("\0") });
  const cases: Array<[string, ServerIdentityInput, RegExp]> = [
    ["bad pid", identity({ pid: "42 && x" }), /invalid OpenCode pidfile/],
    ["zero pid", identity({ pid: "0" }), /invalid OpenCode pidfile/],
    ["other binary", identity({}, cmd("/tmp/opencode", "serve", "--hostname", "127.0.0.1", "--port", "4098")), /not the POC OpenCode/],
    ["substring trick", identity({}, cmd("/bin/sh", "-c", `${ISOLATED_OPENCODE_BIN} serve --hostname 127.0.0.1 --port 4098`)), /not the POC OpenCode/],
    ["extra argument", identity({}, cmd(ISOLATED_OPENCODE_BIN, "serve", "--hostname", "127.0.0.1", "--port", "4098", "--cors", "*")), /not the POC OpenCode/],
    ["public bind", identity({}, cmd(ISOLATED_OPENCODE_BIN, "serve", "--hostname", "0.0.0.0", "--port", "4098")), /not the POC OpenCode/],
    ["wrong uid", identity({}, { "/proc/4242/status": "Uid:\t1000\t1000\t1000\t1000\n" }), /process identity mismatch/],
    ["setuid drift", identity({}, { "/proc/4242/status": `Uid:\t${UID}\t0\t${UID}\t${UID}\n` }), /process identity mismatch/],
    ["no Uid line", identity({}, { "/proc/4242/status": "Name:\topencode\n" }), /process identity mismatch/],
    ["listener of another user", identity({}, { "/proc/net/tcp": tcp([row("0100007F:1002", 1000)]) }), /listener identity mismatch/],
    ["no listener", identity({}, { "/proc/net/tcp": tcp([]) }), /listener identity mismatch/],
    ["wildcard listener", identity({}, { "/proc/net/tcp": tcp([row("00000000:1002", UID)]) }), /listener identity mismatch/],
    ["extra IPv6 listener", identity({}, { "/proc/net/tcp6": tcp([row("00000000000000000000000001000000:1002", UID)]) }), /listener identity mismatch/],
    ["two listeners", identity({}, { "/proc/net/tcp": tcp([row("0100007F:1002", UID), row("0200007F:1002", UID)]) }), /listener identity mismatch/],
    ["vanished process", identity({ readProc: () => { throw new Error("ENOENT"); } }), /ENOENT/]
  ];
  for (const [name, input, pattern] of cases) await assert.rejects(verifyServerIdentity(input), pattern, name);
});

test("verifyServerIdentity rejects invalid or ambiguous GET /path answers", async () => {
  const cases: Array<[string, unknown, RegExp]> = [
    ["worktree root", { home: HOME, directory: WS, worktree: "/" }, /ambiguous/],
    ["directory differs", { home: HOME, directory: "/srv/cgl/workspaces/other-001", worktree: WS }, /do not match/],
    ["worktree is parent repo", { home: HOME, directory: WS, worktree: "/srv/cgl" }, /do not match/],
    ["trailing slash", { home: HOME, directory: `${WS}/`, worktree: WS }, /ambiguous/],
    ["dot segments", { home: HOME, directory: `${WS}/../g01-id-001`, worktree: WS }, /ambiguous/],
    ["relative", { home: HOME, directory: "g01-id-001", worktree: WS }, /ambiguous/],
    ["missing fields", { home: HOME }, /ambiguous/],
    ["non-string", { home: HOME, directory: [WS], worktree: WS }, /ambiguous/],
    ["wrong home", { home: "/home/rodrigo_mella", directory: WS, worktree: WS }, /home does not match/],
    ["null", null, /unreadable/],
    ["array", [WS], /unreadable/]
  ];
  for (const [name, info, pattern] of cases) await assert.rejects(verifyServerIdentity(identity({}, {}, info)), pattern, name);
  await assert.rejects(verifyServerIdentity(identity({ getPath: async () => { throw new Error("GET /path returned 401"); } })), /401/);
});

test("listenerUids reads only LISTEN sockets on the OpenCode port", () => {
  assert.deepEqual(listenerUids(tcp([row("0100007F:1002", 7), row("0100007F:1002", 8, "01"), row("0100007F:1003", 9)]), tcp([])), [7]);
});

test("expectedExecutor: legacy when unset, dedicated non-root user when configured", () => {
  const passwd = () => "root:x:0:0::/root:/bin/bash\ncgl_exec:x:990:990::/var/lib/cgl-exec:/usr/sbin/nologin\nself:x:" + process.getuid!() + ":1::/h:/bin/sh\n";
  const legacy = expectedExecutor({}, passwd);
  assert.equal(legacy.isolated, false);
  assert.equal(legacy.uid, process.getuid!());
  assert.deepEqual(expectedExecutor({ CGL_OPENCODE_USER: "cgl_exec" }, passwd), { uid: 990, home: "/var/lib/cgl-exec", bins: [ISOLATED_OPENCODE_BIN], isolated: true });
  assert.throws(() => expectedExecutor({ CGL_OPENCODE_USER: "root" }, passwd), /dedicated non-root/);
  assert.throws(() => expectedExecutor({ CGL_OPENCODE_USER: "self" }, passwd), /dedicated non-root/);
  assert.throws(() => expectedExecutor({ CGL_OPENCODE_USER: "ghost" }, passwd), /does not exist/);
  assert.throws(() => expectedExecutor({ CGL_OPENCODE_USER: "x:0:" }, passwd), /invalid/);
});

// ---- review follow-ups: isolated branch, group-writable .git, root hygiene ----

test("isolated workspaces are 3770 with a 0644 orchestrator policy and still pass the static checks", withTmp((dir) => {
  const ws = createMissionWorkspace("g01-iso-001", ARTIFACTS, dir, "git", true);
  assert.equal(fs.statSync(ws).mode & 0o7777, 0o3770);
  assert.equal(fs.statSync(path.join(ws, "opencode.json")).mode & 0o777, 0o644);
  assert.equal(workspaceConfigViolation(ws), undefined);
  assert.equal(gitWorkspaceViolation(ws), undefined);
}));

test("a group- or world-writable .git, config or hooks is rejected (executor shares the group)", withTmp((dir) => {
  for (const [name, entry] of [["g01-gw-001", ".git"], ["g01-gw-002", ".git/config"], ["g01-gw-003", ".git/hooks"]] as const) {
    const ws = createMissionWorkspace(name, ARTIFACTS, dir);
    fs.chmodSync(path.join(ws, entry), fs.statSync(path.join(ws, entry)).mode | 0o020);
    assert.match(gitWorkspaceViolation(ws) ?? "", /must not be group- or world-writable/, entry);
    assert.throws(() => ensureGitWorkspace(ws), /existing repository rejected/, entry);
  }
}));

test("workspaceRoot rejects a world-writable root and reports a missing legacy root cleanly", withTmp((dir) => {
  const open = path.join(dir, "open");
  fs.mkdirSync(open);
  fs.chmodSync(open, 0o777);
  assert.throws(() => workspaceRoot({ CGL_WORKSPACE_ROOT: open }), /world-writable/);
}));

// ---- req 8: activity wiring (Temporal contract) with injected dependencies ----

async function withEnvRoot<T>(root: string, fn: () => Promise<T>): Promise<T> {
  const saved = process.env.CGL_WORKSPACE_ROOT;
  process.env.CGL_WORKSPACE_ROOT = root;
  try { return await fn(); } finally { if (saved === undefined) delete process.env.CGL_WORKSPACE_ROOT; else process.env.CGL_WORKSPACE_ROOT = saved; }
}
const nonRetryable = (pattern: RegExp) => (error: unknown) => error instanceof ApplicationFailure && error.nonRetryable === true && pattern.test(error.message);

test("prepareGenericMission accepts a prepared workspace and rejects tampered ones as non-retryable", withTmp(async (dir) => {
  await withEnvRoot(dir, async () => {
    const ws = createMissionWorkspace("g01-prep-001", ARTIFACTS, dir);
    assert.equal((await prepareGenericMission({ contract: contractFor(ws) })).workspace, ws);
    fs.chmodSync(path.join(ws, "opencode.json"), 0o660);
    await assert.rejects(prepareGenericMission({ contract: contractFor(ws) }), nonRetryable(/workspace rejected: .*group-writable/));
    const noCommit = createMissionWorkspace("g01-prep-002", ARTIFACTS, dir);
    fs.rmSync(path.join(noCommit, ".git"), { recursive: true });
    spawnSync("git", ["init", "-q", "--shared=0640", noCommit]);
    await assert.rejects(prepareGenericMission({ contract: contractFor(noCommit) }), nonRetryable(/workspace rejected: .*initial commit/));
    const legacy = path.join(dir, "g01-prep-003");
    fs.mkdirSync(legacy);
    fs.writeFileSync(path.join(legacy, "opencode.json"), JSON.stringify(missionOpenCodeConfig(ARTIFACTS)), { mode: 0o600 });
    await assert.rejects(prepareGenericMission({ contract: contractFor(legacy) }), nonRetryable(/workspace rejected: \.git missing/));
  });
}));

test("verifyOpenCodeWorkspace maps every identity failure to a non-retryable ApplicationFailure", withTmp(async (dir) => {
  const ws = createMissionWorkspace("g01-verify-001", ARTIFACTS, dir);
  const pidFile = path.join(dir, "opencode.pid");
  fs.writeFileSync(pidFile, "4242\n");
  const passwd = () => `cgl_exec:x:${UID}:${UID}::${HOME}:/usr/sbin/nologin\n`;
  const deps = (over: Partial<VerifyOpenCodeDeps> = {}): VerifyOpenCodeDeps => ({
    env: { CGL_WORKSPACE_ROOT: "/srv/cgl/workspaces", CGL_OPENCODE_USER: "cgl_exec" }, pidFile, passwd,
    readProc: procFixture(), getPath: async () => ({ home: HOME, directory: ws, worktree: ws }), ...over
  });
  // Isolated mode requires the real isolated root (absent on this host).
  await assert.rejects(verifyOpenCodeWorkspace({ workspace: ws }, deps()), nonRetryable(/verification failed|requires CGL_WORKSPACE_ROOT/));
  await assert.rejects(verifyOpenCodeWorkspace({ workspace: ws }, deps({ env: { CGL_WORKSPACE_ROOT: dir, CGL_OPENCODE_USER: "cgl_exec" } })), nonRetryable(/requires CGL_WORKSPACE_ROOT=\/srv\/cgl\/workspaces/));
  // Legacy mode (same uid) end to end with injected /proc and GET /path.
  const self = process.getuid!();
  const legacyProc = procFixture({
    "/proc/4242/cmdline": [path.join(os.homedir(), ".opencode/bin/opencode"), "serve", "--hostname", "127.0.0.1", "--port", "4098", ""].join("\0"),
    "/proc/4242/status": `Uid:\t${self}\t${self}\t${self}\t${self}\n`,
    "/proc/net/tcp": tcp([row("0100007F:1002", self)])
  });
  const legacy = (over: Partial<VerifyOpenCodeDeps> = {}) => deps({ env: { CGL_WORKSPACE_ROOT: dir }, readProc: legacyProc, getPath: async () => ({ home: os.homedir(), directory: ws, worktree: ws }), ...over });
  assert.deepEqual(await verifyOpenCodeWorkspace({ workspace: ws }, legacy()), { pid: "4242", cwd: ws, uid: self });
  await assert.rejects(verifyOpenCodeWorkspace({ workspace: ws }, legacy({ getPath: async () => { throw new Error("GET /path returned 401"); } })), nonRetryable(/401/));
  await assert.rejects(verifyOpenCodeWorkspace({ workspace: ws }, legacy({ getPath: async () => ({ home: os.homedir(), directory: ws, worktree: "/" }) })), nonRetryable(/ambiguous/));
  await assert.rejects(verifyOpenCodeWorkspace({ workspace: ws }, legacy({ pidFile: path.join(dir, "missing.pid") })), nonRetryable(/verification failed/));
  await assert.rejects(verifyOpenCodeWorkspace({ workspace: ws }, legacy({ env: { CGL_WORKSPACE_ROOT: dir, CGL_OPENCODE_USER: "root" }, passwd: () => "root:x:0:0::/root:/bin/sh\n" })), nonRetryable(/dedicated non-root/));
}));
