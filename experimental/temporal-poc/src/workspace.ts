// G01: mission workspace root, git initialisation and OpenCode server identity.
// The root is configurable (CGL_WORKSPACE_ROOT) so the isolated executor can
// use /srv/cgl/workspaces; unset keeps the legacy per-user root. Every check
// fails closed: a mismatch never falls back to a weaker verification.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { missionOpenCodeConfig } from "./opencode-policy.ts";

export const LEGACY_WORKSPACE_ROOT = path.join(os.homedir(), ".local/state/constructor-temporal-poc/workspaces");
export const ISOLATED_WORKSPACE_ROOT = "/srv/cgl/workspaces";
export const ISOLATED_OPENCODE_BIN = "/usr/local/lib/cgl-exec/opencode";
export const OPENCODE_PORT = 4098;
const MISSION_ID = /^[a-z0-9][a-z0-9-]{2,119}$/;

export class WorkspaceError extends Error {}
const fail = (message: string): never => { throw new WorkspaceError(message); };

// Absolute, canonical (no symlink anywhere in the path) and an existing directory.
export function workspaceRoot(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.CGL_WORKSPACE_ROOT;
  if (configured === undefined || configured === "") {
    try { return fs.realpathSync(LEGACY_WORKSPACE_ROOT); } catch { return fail(`legacy workspace root ${LEGACY_WORKSPACE_ROOT} does not exist`); }
  }
  if (!path.isAbsolute(configured) || path.normalize(configured) !== configured || configured.endsWith("/")) fail("CGL_WORKSPACE_ROOT must be a normalized absolute path");
  let real: string;
  try { real = fs.realpathSync(configured); } catch { return fail("CGL_WORKSPACE_ROOT does not exist"); }
  if (real !== configured) fail("CGL_WORKSPACE_ROOT must not traverse symlinks");
  const st = fs.statSync(real);
  if (!st.isDirectory()) fail("CGL_WORKSPACE_ROOT must be a directory");
  if (st.mode & 0o002) fail("CGL_WORKSPACE_ROOT must not be world-writable");
  return real;
}

// The executor shares the cgl_ws group, so everything that carries policy
// (workspace dir, opencode.json, .git) must belong to the orchestrator and be
// non-writable by others; a pre-created ("squatted") path is rejected.
function ownedByOrchestrator(file: string, kind: "dir" | "file", uid: number): string | undefined {
  let st: fs.Stats;
  try { st = fs.lstatSync(file); } catch { return `${path.basename(file)} missing`; }
  if (st.isSymbolicLink() || (kind === "dir" ? !st.isDirectory() : !st.isFile())) return `${path.basename(file)} must be a real ${kind}`;
  if (st.uid !== uid) return `${path.basename(file)} must be owned by the orchestrator`;
  if (st.mode & 0o002) return `${path.basename(file)} must not be world-writable`;
  if (kind === "file" && (st.mode & 0o020 || st.nlink !== 1)) return `${path.basename(file)} must not be group-writable or hard-linked`;
  return undefined;
}

// Static checks before any OpenCode work: no config that OpenCode would load
// from the project besides the orchestrator's own opencode.json.
export function workspaceConfigViolation(ws: string, uid = process.getuid!()): string | undefined {
  if (fs.realpathSync(ws) !== ws) return "workspace must not traverse symlinks";
  for (const [file, kind] of [[ws, "dir"], [path.join(ws, "opencode.json"), "file"], [path.join(ws, ".git"), "dir"]] as const) {
    const violation = ownedByOrchestrator(file, kind, uid);
    if (violation) return violation;
  }
  for (const forbidden of [".opencode", "opencode.jsonc"]) if (fs.existsSync(path.join(ws, forbidden))) return `${forbidden} is not allowed in a mission workspace`;
  return undefined;
}

// Git runs with no user/system config, no hooks and a fixed identity, so a
// planted config or hook in the caller's environment cannot execute.
const GIT_ENV: NodeJS.ProcessEnv = {
  PATH: "/usr/local/bin:/usr/bin:/bin", HOME: "/nonexistent", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_TERMINAL_PROMPT: "0", GIT_AUTHOR_NAME: "cgl-workspace", GIT_AUTHOR_EMAIL: "cgl-workspace@localhost",
  GIT_COMMITTER_NAME: "cgl-workspace", GIT_COMMITTER_EMAIL: "cgl-workspace@localhost", LC_ALL: "C"
};
function git(ws: string, args: string[], bin = "git"): { ok: boolean; out: string } {
  const r = spawnSync(bin, ["-c", "core.hooksPath=/dev/null", "-c", "core.fsmonitor=false", "-c", "commit.gpgsign=false", "-C", ws, ...args], { env: GIT_ENV, encoding: "utf8", timeout: 15_000 });
  return { ok: r.status === 0, out: (r.stdout ?? "").trim() };
}

// Read-only: the workspace is its own git worktree (OpenCode 1.18 otherwise
// resolves worktree "/" and the permission boundary becomes the whole disk).
export function gitWorkspaceViolation(ws: string, uid = process.getuid!()): string | undefined {
  let st: fs.Stats;
  try { st = fs.lstatSync(path.join(ws, ".git")); } catch { return "workspace is not a git repository"; }
  if (!st.isDirectory() || st.isSymbolicLink()) return ".git must be a real directory (no gitfile or symlink)";
  if (st.uid !== uid) return ".git must be owned by the orchestrator";
  // The executor shares the group: it must not be able to plant git config or hooks.
  for (const entry of [".git", ".git/config", ".git/hooks"]) {
    let mode = 0;
    try { mode = fs.lstatSync(path.join(ws, entry)).mode; } catch { continue; }
    if (mode & 0o022) return `${entry} must not be group- or world-writable`;
  }
  const top = git(ws, ["rev-parse", "--show-toplevel"]);
  if (!top.ok || top.out !== ws) return "git toplevel is not the workspace";
  if (!git(ws, ["rev-parse", "--verify", "-q", "HEAD^{commit}"]).ok) return "git workspace has no initial commit";
  return undefined;
}

// Initialises a git repo with one empty commit when the workspace has no .git.
// --shared=0640: the executor group may read it (OpenCode needs the worktree)
// but cannot plant hooks or config that the orchestrator's git would run.
// An existing repository is only verified, never modified. On failure a .git
// created here is removed, so preparation leaves no partial effects.
// gitBin is injectable only so tests can force a failure after side effects.
export function ensureGitWorkspace(ws: string, gitBin = "git"): { created: boolean } {
  if (fs.realpathSync(ws) !== ws) fail("workspace must not traverse symlinks");
  const dotGit = path.join(ws, ".git");
  let exists = true;
  try { fs.lstatSync(dotGit); } catch { exists = false; }
  if (exists) {
    const violation = gitWorkspaceViolation(ws);
    if (violation) fail(`existing repository rejected: ${violation}`);
    return { created: false };
  }
  try {
    if (!git(ws, ["init", "-q", "--shared=0640", "-b", "main"], gitBin).ok) fail("git init failed");
    if (!git(ws, ["commit", "-q", "--allow-empty", "-m", "cgl workspace root"], gitBin).ok) fail("initial commit failed");
    const violation = gitWorkspaceViolation(ws);
    if (violation) fail(`new repository rejected: ${violation}`);
  } catch (error) {
    fs.rmSync(dotGit, { recursive: true, force: true });
    throw error;
  }
  return { created: true };
}

// Creates <root>/<missionId> exclusively, writes the mission permission policy
// and initialises git. In the isolated root the directory is setgid+sticky
// (3770) so the executor can create files but not replace the orchestrator's
// opencode.json or .git. Any failure removes the directory: no partial state.
export function createMissionWorkspace(missionId: string, artifactPaths: string[], root = workspaceRoot(), gitBin = "git", isolated = root === ISOLATED_WORKSPACE_ROOT): string {
  if (!MISSION_ID.test(missionId)) fail("missionId must be lowercase slug syntax");
  if (artifactPaths.length === 0 || artifactPaths.some((a) => !/^[A-Za-z0-9_-][A-Za-z0-9._-]*(\/[A-Za-z0-9_-][A-Za-z0-9._-]*)*$/.test(a))) fail("artifact paths must be plain relative paths");
  const ws = path.join(root, missionId);
  try { fs.mkdirSync(ws, { mode: 0o700 }); } catch (error) { return fail((error as NodeJS.ErrnoException).code === "EEXIST" ? "workspace already exists" : "workspace cannot be created"); }
  try {
    fs.chmodSync(ws, isolated ? 0o3770 : 0o700);
    const fd = fs.openSync(path.join(ws, "opencode.json"), fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
    try { fs.writeSync(fd, JSON.stringify(missionOpenCodeConfig(artifactPaths, isolated), null, 2) + "\n"); fs.fchmodSync(fd, isolated ? 0o644 : 0o600); } finally { fs.closeSync(fd); }
    ensureGitWorkspace(ws, gitBin);
    const violation = workspaceConfigViolation(ws);
    if (violation) fail(violation);
  } catch (error) {
    fs.rmSync(ws, { recursive: true, force: true });
    throw error;
  }
  return ws;
}

// ---- OpenCode server identity (no /proc/<pid>/cwd: EPERM across users) ----

export type ServerIdentityInput = {
  pid: string;
  workspace: string;
  expectedUid: number;
  expectedHome: string;
  allowedBins: string[];
  readProc: (file: string) => string;
  getPath: () => Promise<unknown>;
};

const PORT_HEX = OPENCODE_PORT.toString(16).toUpperCase().padStart(4, "0");

// Uid of every TCP listener on the OpenCode port. Anything other than exactly
// one IPv4 listener on 127.0.0.1 is reported as -1 so the caller fails closed.
export function listenerUids(procNetTcp: string, procNetTcp6: string): number[] {
  const uids: number[] = [];
  for (const [table, v6] of [[procNetTcp, false], [procNetTcp6, true]] as const) {
    for (const line of table.split("\n").slice(1)) {
      const f = line.trim().split(/\s+/);
      if (f.length < 8 || f[3] !== "0A" || !f[1].endsWith(`:${PORT_HEX}`)) continue;
      uids.push(v6 || f[1] !== `0100007F:${PORT_HEX}` ? -1 : Number(f[7]));
    }
  }
  return uids;
}

const canonicalAbsolute = (value: unknown): value is string => typeof value === "string" && path.isAbsolute(value) && path.normalize(value) === value && value !== "/" && !value.endsWith("/");

export async function verifyServerIdentity(input: ServerIdentityInput): Promise<{ pid: string; uid: number; directory: string }> {
  if (!/^[1-9][0-9]{0,9}$/.test(input.pid)) fail("invalid OpenCode pidfile");
  const argv = input.readProc(`/proc/${input.pid}/cmdline`).split("\0");
  if (argv.at(-1) === "") argv.pop();
  const expected = ["serve", "--hostname", "127.0.0.1", "--port", String(OPENCODE_PORT)];
  if (argv.length !== 6 || !input.allowedBins.includes(argv[0]) || expected.some((arg, i) => argv[i + 1] !== arg)) fail("pidfile is not the POC OpenCode server");
  const uidLine = input.readProc(`/proc/${input.pid}/status`).split("\n").find((line) => line.startsWith("Uid:"));
  const uids = uidLine?.split(/\s+/).slice(1, 5).map(Number) ?? [];
  if (uids.length !== 4 || uids.some((uid) => uid !== input.expectedUid)) fail("OpenCode process identity mismatch");
  const listeners = listenerUids(input.readProc("/proc/net/tcp"), input.readProc("/proc/net/tcp6"));
  if (listeners.length !== 1 || listeners[0] !== input.expectedUid) fail("OpenCode listener identity mismatch");
  const p = await input.getPath() as Record<string, unknown> | null;
  if (!p || typeof p !== "object" || Array.isArray(p)) return fail("OpenCode /path unreadable");
  if (!canonicalAbsolute(p.directory) || !canonicalAbsolute(p.worktree)) fail("OpenCode directory/worktree ambiguous");
  if (p.directory !== input.workspace || p.worktree !== input.workspace) fail("OpenCode directory/worktree do not match workspace");
  if (p.home !== input.expectedHome) fail("OpenCode home does not match executor");
  return { pid: input.pid, uid: input.expectedUid, directory: input.workspace };
}

// Executor identity from configuration: CGL_OPENCODE_USER=cgl_exec selects the
// isolated launcher; unset keeps the legacy same-user server.
export function expectedExecutor(env: NodeJS.ProcessEnv = process.env, passwd = () => fs.readFileSync("/etc/passwd", "utf8")) {
  const user = env.CGL_OPENCODE_USER;
  if (!user) return { uid: process.getuid!(), home: os.homedir(), bins: [path.join(os.homedir(), ".opencode/bin/opencode")], isolated: false };
  if (!/^[a-z_][a-z0-9_-]{0,31}$/.test(user)) fail("CGL_OPENCODE_USER is invalid");
  const entry = passwd().split("\n").map((line) => line.split(":")).find((f) => f[0] === user);
  if (!entry || entry.length < 7 || !/^[0-9]+$/.test(entry[2])) return fail("CGL_OPENCODE_USER does not exist");
  const uid = Number(entry[2]);
  if (uid === 0 || uid === process.getuid!()) fail("CGL_OPENCODE_USER must be a dedicated non-root user");
  return { uid, home: entry[5], bins: [ISOLATED_OPENCODE_BIN], isolated: true };
}
