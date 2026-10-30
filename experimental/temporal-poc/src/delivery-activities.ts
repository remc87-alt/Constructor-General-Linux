// Delivery: after the independent oracle validated a mission, copy exactly the
// contract's artifacts into a fresh clone of an allow-listed GitHub repository
// and push them as a new branch cgl/<missionId>. Never main, never force.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ApplicationFailure } from "@temporalio/activity";
import { assertBeforeDeadline } from "./mission-activities.ts";
import { deliveryAllowlistFromEnv, deliveryBranch, type GenericMissionContract } from "./generic-contract.ts";

export const DELIVERY_FAILED = "DeliveryFailed";
const MAX_ARTIFACT_BYTES = 5 * 1024 * 1024;
const GIT_TIMEOUT_MS = 90_000;

export type DeliveryResult = {
  status: "pushed" | "already_delivered";
  repo: string;
  branch: string;
  base_branch: string;
  commit: string;
  files: string[];
  compare_url: string;
};

type GitRun = (args: string[], cwd: string) => { status: number; stdout: string };
export type DeliveryDeps = { token: () => string | undefined; git?: GitRun; remoteUrl?: (repo: string) => string; tmpRoot?: string; env?: NodeJS.ProcessEnv };

const failDelivery = (reason: string): never => { throw ApplicationFailure.nonRetryable(`delivery: ${reason}`, DELIVERY_FAILED); };

// Token from CGL_GITHUB_TOKEN or ~/.config/cgl/github-token (mode 600). It is
// sent only as an HTTP header through git's environment config, never in a
// URL, an argument, workflow history or an error message.
export function readGitHubToken(env: NodeJS.ProcessEnv = process.env): string | undefined {
  if (env.CGL_GITHUB_TOKEN?.trim()) return env.CGL_GITHUB_TOKEN.trim();
  const file = path.join(os.homedir(), ".config/cgl/github-token");
  try {
    const st = fs.statSync(file);
    if (st.mode & 0o077) return undefined;
    return fs.readFileSync(file, "utf8").trim() || undefined;
  } catch { return undefined; }
}

export function gitRunner(token: string | undefined): GitRun {
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH, HOME: process.env.HOME, LANG: "C",
    GIT_TERMINAL_PROMPT: "0", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_AUTHOR_NAME: "CGL Constructor", GIT_AUTHOR_EMAIL: "cgl-constructor@users.noreply.github.com",
    GIT_COMMITTER_NAME: "CGL Constructor", GIT_COMMITTER_EMAIL: "cgl-constructor@users.noreply.github.com",
  };
  if (token) {
    env.GIT_CONFIG_COUNT = "1";
    env.GIT_CONFIG_KEY_0 = "http.https://github.com/.extraheader";
    env.GIT_CONFIG_VALUE_0 = `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${token}`).toString("base64")}`;
  }
  return (args, cwd) => {
    // Hooks from any source are disabled: an artifact can never run code here.
    const run = spawnSync("git", ["-c", "core.hooksPath=/dev/null", "-c", "core.symlinks=false", ...args], { cwd, env, encoding: "utf8", timeout: GIT_TIMEOUT_MS });
    return { status: run.status ?? -1, stdout: String(run.stdout ?? "") };
  };
}

// Only regular files inside the workspace; no symlinks, nothing under .git.
export function collectArtifacts(contract: GenericMissionContract): Array<{ source: string; target: string }> {
  const workspace = fs.realpathSync(contract.workspace);
  const targetDir = contract.delivery?.targetDir ?? "";
  return contract.artifactPaths.map((artifact) => {
    if (artifact.split(/[\\/]+/).includes(".git")) failDelivery(`artifact path not deliverable: ${artifact}`);
    const source = path.join(workspace, artifact);
    let st: fs.Stats;
    try { st = fs.lstatSync(source); } catch { return failDelivery(`missing artifact: ${artifact}`); }
    if (!st.isFile()) failDelivery(`artifact is not a regular file: ${artifact}`);
    if (st.size > MAX_ARTIFACT_BYTES) failDelivery(`artifact too large: ${artifact}`);
    if (!fs.realpathSync(source).startsWith(workspace + path.sep)) failDelivery(`artifact escapes workspace: ${artifact}`);
    return { source, target: path.posix.join(targetDir.split(path.sep).join("/"), artifact.split(path.sep).join("/")) };
  });
}

export async function deliverMissionArtifacts(input: { contract: GenericMissionContract; deadlineAt?: number }, deps: DeliveryDeps = { token: readGitHubToken }): Promise<DeliveryResult> {
  assertBeforeDeadline(input.deadlineAt);
  const { contract } = input;
  const delivery = contract.delivery ?? failDelivery("contract has no delivery");
  // Re-check at effect time: the allowlist may have shrunk since preparation.
  if (!deliveryAllowlistFromEnv(deps.env).includes(delivery.repo.toLowerCase())) failDelivery("repository is not listed in CGL_DELIVERY_REPOS");
  const token = deps.token();
  if (!token && !deps.git) failDelivery("GitHub credentials missing (CGL_GITHUB_TOKEN or ~/.config/cgl/github-token)");
  const git = deps.git ?? gitRunner(token);
  const remote = (deps.remoteUrl ?? ((repo: string) => `https://github.com/${repo}.git`))(delivery.repo);
  const branch = deliveryBranch(contract.missionId);
  const trailer = `CGL-Mission: ${contract.missionId}`;
  const artifacts = collectArtifacts(contract);
  const dir = fs.mkdtempSync(path.join(deps.tmpRoot ?? os.tmpdir(), "cgl-delivery-"));
  const must = (args: string[], what: string) => { const r = git(args, dir); if (r.status !== 0) failDelivery(`${what} failed`); return r.stdout.trim(); };
  const result = (status: DeliveryResult["status"], commit: string): DeliveryResult => ({
    status, repo: delivery.repo, branch, base_branch: delivery.baseBranch, commit, files: artifacts.map((a) => a.target),
    compare_url: `https://github.com/${delivery.repo}/compare/${encodeURIComponent(delivery.baseBranch)}...${encodeURIComponent(branch)}`,
  });
  try {
    must(["init", "-q", "-b", branch], "init");
    must(["remote", "add", "origin", remote], "remote");
    // Idempotent retry: an existing branch is accepted only if its tip is this
    // mission's own delivery commit; anything else stops without pushing.
    // All heads: "no heads at all" (empty repository) must differ from "base missing".
    const heads = must(["ls-remote", "--heads", "origin"], "ls-remote");
    const refs = new Map(heads.split("\n").filter(Boolean).map((line) => { const [sha, ref] = line.split(/\s+/); return [ref, sha]; }));
    const existing = refs.get(`refs/heads/${branch}`);
    if (existing) {
      must(["fetch", "-q", "--depth", "1", "origin", `refs/heads/${branch}`], "fetch existing branch");
      const message = must(["log", "-1", "--format=%B", "FETCH_HEAD"], "read existing branch");
      if (!message.split("\n").includes(trailer)) failDelivery(`branch ${branch} already exists and is not this mission's delivery`);
      return result("already_delivered", existing);
    }
    if (refs.has(`refs/heads/${delivery.baseBranch}`)) {
      must(["fetch", "-q", "--depth", "1", "origin", `refs/heads/${delivery.baseBranch}`], "fetch base branch");
      must(["reset", "-q", "--hard", "FETCH_HEAD"], "checkout base branch");
    } else if (heads.length > 0) {
      failDelivery(`base branch ${delivery.baseBranch} not found`);
    }
    // An empty repository has no base branch: the delivery becomes its first commit.
    for (const a of artifacts) {
      const target = path.join(dir, a.target);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(a.source, target);
    }
    must(["add", "--", ...artifacts.map((a) => a.target)], "add");
    must(["commit", "-q", "--allow-empty", "-m", `cgl: entrega de misión ${contract.missionId}\n\nArtefactos validados por el oráculo ${contract.validation.oracleId}.\n\n${trailer}`], "commit");
    const commit = must(["rev-parse", "HEAD"], "rev-parse");
    must(["push", "-q", "origin", `HEAD:refs/heads/${branch}`], "push");
    return result("pushed", commit);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
