import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ApplicationFailure } from "@temporalio/activity";

export const DEFAULT_WORKSPACE_ROOT = path.join(os.homedir(), ".local/state/constructor-temporal-poc/workspaces");

export type GenericValidationPolicy = {
  kind: "external-oracle";
  // Opaque identity only. A hidden-test path never enters workflow history or prompts.
  oracleId: string;
  requiredArtifacts: string[];
};

export type GenericMissionContract = {
  missionId: string;
  workspace: string;
  instructions: string;
  validation: GenericValidationPolicy;
  budget: { maxRepairAttempts: number; maxDurationMs: number; maxTokens: number | null };
  artifactPaths: string[];
};

type ContractOptions = { workspaceRoot?: string };
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
  return candidate;
};
const childOf = (child: string, parent: string) => child === parent || child.startsWith(parent + path.sep);

// Strict by design: a generic request cannot redirect the POC to an arbitrary
// directory or smuggle an oracle path into its artifacts.
export function validateGenericMissionContract(input: unknown, options: ContractOptions = {}): GenericMissionContract {
  const raw = record(input, "input");
  const missionId = text(raw.missionId, "missionId", 120);
  if (!/^[a-z0-9][a-z0-9-]{2,119}$/.test(missionId)) fail("missionId must be lowercase slug syntax");
  const workspaceRoot = fs.realpathSync(options.workspaceRoot ?? DEFAULT_WORKSPACE_ROOT);
  const requestedWorkspace = text(raw.workspace, "workspace", 1_000);
  if (!path.isAbsolute(requestedWorkspace)) fail("workspace must be absolute");
  let workspace: string;
  try { workspace = fs.realpathSync(requestedWorkspace); } catch { fail("workspace must already exist"); }
  if (!childOf(workspace, workspaceRoot) || workspace === workspaceRoot) fail("workspace must be a child of the POC workspace root");
  // The isolated oracle receives only opaque mission/execution identities and
  // derives its source path as WORKSPACE_ROOT / mission_id. Require that same
  // binding before any external Temporal or OpenCode work begins.
  if (path.basename(workspace) !== missionId) fail("workspace basename must equal missionId");
  const validation = record(raw.validation, "validation");
  if (validation.kind !== "external-oracle") fail("validation.kind must be external-oracle");
  const oracleId = text(validation.oracleId, "validation.oracleId", 120);
  if (!/^[a-z0-9][a-z0-9-]{2,119}$/.test(oracleId)) fail("validation.oracleId must be an opaque lowercase slug");
  if (!Array.isArray(validation.requiredArtifacts) || validation.requiredArtifacts.length === 0) fail("validation.requiredArtifacts must be non-empty");
  const requiredArtifacts = validation.requiredArtifacts.map((item, i) => safeRelative(item, `validation.requiredArtifacts[${i}]`));
  const budget = record(raw.budget, "budget");
  const maxRepairAttempts = budget.maxRepairAttempts;
  const maxDurationMs = budget.maxDurationMs;
  const maxTokens = budget.maxTokens ?? null;
  if (!Number.isInteger(maxRepairAttempts) || (maxRepairAttempts as number) < 0 || (maxRepairAttempts as number) > 3) fail("budget.maxRepairAttempts must be an integer from 0 to 3");
  if (!Number.isInteger(maxDurationMs) || (maxDurationMs as number) < 30_000 || (maxDurationMs as number) > 15 * 60_000) fail("budget.maxDurationMs must be from 30000 to 900000");
  if (maxTokens !== null && (!Number.isInteger(maxTokens) || (maxTokens as number) <= 0)) fail("budget.maxTokens must be a positive integer or null");
  if (!Array.isArray(raw.artifactPaths) || raw.artifactPaths.length === 0) fail("artifactPaths must be non-empty");
  const artifactPaths = raw.artifactPaths.map((item, i) => safeRelative(item, `artifactPaths[${i}]`));
  if (new Set(artifactPaths).size !== artifactPaths.length) fail("artifactPaths must be unique");
  for (const artifact of requiredArtifacts) if (!artifactPaths.includes(artifact)) fail("requiredArtifacts must be listed in artifactPaths");
  return { missionId, workspace, instructions: text(raw.instructions, "instructions"), validation: { kind: "external-oracle", oracleId, requiredArtifacts }, budget: { maxRepairAttempts: maxRepairAttempts as number, maxDurationMs: maxDurationMs as number, maxTokens: maxTokens as number | null }, artifactPaths };
}

export function workspaceArtifactsAreFresh(contract: GenericMissionContract): string[] {
  return contract.artifactPaths.filter((artifact) => fs.existsSync(path.join(contract.workspace, artifact)));
}
