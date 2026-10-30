import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ApplicationFailure } from "@temporalio/activity";
import { authorizedOracleSuite } from "./oracle-registry.ts";
import { LEGACY_WORKSPACE_ROOT, workspaceRoot } from "./workspace.ts";

// Legacy default; CGL_WORKSPACE_ROOT (G01: /srv/cgl/workspaces) overrides it.
export const DEFAULT_WORKSPACE_ROOT = LEGACY_WORKSPACE_ROOT;

export type GenericValidationPolicy = {
  kind: "external-oracle";
  // Opaque identity only. A hidden-test path never enters workflow history or prompts.
  oracleId: string;
  requiredArtifacts: string[];
};

// Optional delivery of validated artifacts to a GitHub repository. Only
// repositories listed in CGL_DELIVERY_REPOS are accepted, and the branch is
// always derived (cgl/<missionId>): a contract can never target main.
export type GenericDeliveryPolicy = {
  repo: string;
  baseBranch: string;
  targetDir: string;
};

export type GenericMissionContract = {
  missionId: string;
  workspace: string;
  instructions: string;
  validation: GenericValidationPolicy;
  budget: { maxRepairAttempts: number; maxDurationMs: number; maxTokens: number | null };
  artifactPaths: string[];
  delivery?: GenericDeliveryPolicy;
};

type ContractOptions = { workspaceRoot?: string; deliveryAllowlist?: string[] };

const REPO = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}\/[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/;
const BRANCH = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,99}$/;
export function deliveryBranch(missionId: string): string { return `cgl/${missionId}`; }
// CGL_DELIVERY_REPOS (comma separated) or, when unset, one owner/name per line
// in ~/.config/cgl/delivery-repos. The worker inherits no shell exports, so the
// file is the durable setting; an absent file means no delivery is allowed.
export const DELIVERY_REPOS_FILE = path.join(os.homedir(), ".config/cgl/delivery-repos");
export function deliveryAllowlistFromEnv(env: NodeJS.ProcessEnv = process.env): string[] {
  let raw = env.CGL_DELIVERY_REPOS;
  if (raw === undefined) { try { raw = fs.readFileSync(DELIVERY_REPOS_FILE, "utf8"); } catch { raw = ""; } }
  return raw.split(/[,\n]/).map((r) => r.trim().toLowerCase()).filter((r) => r && !r.startsWith("#"));
}
const fail = (message: string): never => { throw ApplicationFailure.nonRetryable(`generic contract: ${message}`); };
const record = (value: unknown, field: string): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${field} must be an object`);
  return value as Record<string, unknown>;
};
const text = (value: unknown, field: string, max = 12_000): string => {
  if (typeof value !== "string" || !value.trim() || value.length > max) fail(`${field} must be a non-empty string up to ${max} chars`);
  return value.trim();
};
const safeRelative = (value: unknown, field: string): string => {
  const candidate = text(value, field, 300);
  if (path.isAbsolute(candidate) || candidate === "." || candidate.split(/[\\/]+/).includes("..")) fail(`${field} must be a relative child path`);
  // Artifacts become OpenCode permission patterns: no glob metacharacters.
  if (/[*?[\]{}!]/.test(candidate)) fail(`${field} must not contain glob characters`);
  return candidate;
};

// Strict by design: a generic request cannot redirect the POC to an arbitrary
// directory or smuggle an oracle path into its artifacts.
export function validateGenericMissionContract(input: unknown, options: ContractOptions = {}): GenericMissionContract {
  const raw = record(input, "input");
  const missionId = text(raw.missionId, "missionId", 120);
  if (!/^[a-z0-9][a-z0-9-]{2,119}$/.test(missionId)) fail("missionId must be lowercase slug syntax");
  let root = "";
  try { root = options.workspaceRoot ? fs.realpathSync(options.workspaceRoot) : workspaceRoot(); } catch (error) { fail(`workspace root unavailable: ${(error as Error).message}`); }
  const requestedWorkspace = text(raw.workspace, "workspace", 1_000);
  if (!path.isAbsolute(requestedWorkspace)) fail("workspace must be absolute");
  let workspace: string;
  try { workspace = fs.realpathSync(requestedWorkspace); } catch { fail("workspace must already exist"); }
  // Direct child only: the oracle derives the source as WORKSPACE_ROOT / mission_id.
  if (path.dirname(workspace) !== root) fail("workspace must be a child of the POC workspace root");
  // The isolated oracle receives only opaque mission/execution identities and
  // derives its source path as WORKSPACE_ROOT / mission_id. Require that same
  // binding before any external Temporal or OpenCode work begins.
  if (path.basename(workspace) !== missionId) fail("workspace basename must equal missionId");
  const validation = record(raw.validation, "validation");
  if (validation.kind !== "external-oracle") fail("validation.kind must be external-oracle");
  const oracleId = text(validation.oracleId, "validation.oracleId", 120);
  if (!/^[a-z0-9][a-z0-9-]{2,119}$/.test(oracleId)) fail("validation.oracleId must be an opaque lowercase slug");
  try { authorizedOracleSuite(oracleId); } catch { fail("validation.oracleId is not an authorized suite"); }
  if (!Array.isArray(validation.requiredArtifacts) || validation.requiredArtifacts.length === 0) fail("validation.requiredArtifacts must be non-empty");
  const requiredArtifacts = validation.requiredArtifacts.map((item, i) => safeRelative(item, `validation.requiredArtifacts[${i}]`));
  const budget = record(raw.budget, "budget");
  const maxRepairAttempts = budget.maxRepairAttempts;
  const maxDurationMs = budget.maxDurationMs;
  const maxTokens = budget.maxTokens ?? null;
  if (!Number.isInteger(maxRepairAttempts) || (maxRepairAttempts as number) < 0 || (maxRepairAttempts as number) > 3) fail("budget.maxRepairAttempts must be an integer from 0 to 3");
  if (!Number.isInteger(maxDurationMs) || (maxDurationMs as number) < 30_000 || (maxDurationMs as number) > 15 * 60_000) fail("budget.maxDurationMs must be from 30000 to 900000");
  if (maxTokens !== null && (!Number.isInteger(maxTokens) || (maxTokens as number) <= 0)) fail("budget.maxTokens must be a positive integer or null");
  if (maxTokens !== null) fail("budget.maxTokens cannot be enforced without a reliable meter");
  if (!Array.isArray(raw.artifactPaths) || raw.artifactPaths.length === 0) fail("artifactPaths must be non-empty");
  const artifactPaths = raw.artifactPaths.map((item, i) => safeRelative(item, `artifactPaths[${i}]`));
  if (new Set(artifactPaths).size !== artifactPaths.length) fail("artifactPaths must be unique");
  for (const artifact of requiredArtifacts) if (!artifactPaths.includes(artifact)) fail("requiredArtifacts must be listed in artifactPaths");
  const delivery = raw.delivery === undefined || raw.delivery === null ? undefined : parseDelivery(raw.delivery, options.deliveryAllowlist ?? deliveryAllowlistFromEnv());
  return { missionId, workspace, instructions: text(raw.instructions, "instructions"), validation: { kind: "external-oracle", oracleId, requiredArtifacts }, budget: { maxRepairAttempts: maxRepairAttempts as number, maxDurationMs: maxDurationMs as number, maxTokens: maxTokens as number | null }, artifactPaths, ...(delivery ? { delivery } : {}) };
}

// Fail closed before any model work: an unlisted repository or a malformed
// branch is rejected at preparation, not after the mission spent its budget.
function parseDelivery(value: unknown, allowlist: string[]): GenericDeliveryPolicy {
  const raw = record(value, "delivery");
  const repo = text(raw.repo, "delivery.repo", 201);
  if (!REPO.test(repo) || repo.split("/").some((part) => part === "." || part === ".." || part.endsWith(".git"))) fail("delivery.repo must be owner/name");
  if (!allowlist.includes(repo.toLowerCase())) fail("delivery.repo is not listed in CGL_DELIVERY_REPOS");
  const baseBranch = raw.baseBranch === undefined ? "main" : text(raw.baseBranch, "delivery.baseBranch", 100);
  if (!BRANCH.test(baseBranch) || baseBranch.includes("..") || baseBranch.endsWith("/") || baseBranch.endsWith(".lock")) fail("delivery.baseBranch is not a valid branch name");
  const targetDir = raw.targetDir === undefined || raw.targetDir === "" ? "" : safeRelative(raw.targetDir, "delivery.targetDir");
  if (targetDir.split(/[\\/]+/).includes(".git")) fail("delivery.targetDir must not point into .git");
  return { repo, baseBranch, targetDir };
}

export function workspaceArtifactsAreFresh(contract: GenericMissionContract): string[] {
  return contract.artifactPaths.filter((artifact) => fs.existsSync(path.join(contract.workspace, artifact)));
}
