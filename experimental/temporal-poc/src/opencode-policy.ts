// G03/P4: explicit OpenCode permission policy for a generic mission workspace.
// The executor still runs as the host user (no OS isolation yet), so nothing
// that executes code is automated: bash always escalates, edits are allowed
// only for the contract's own inert data artifacts, and everything outside the workspace
// or the network is denied. Missing or weaker policies are rejected.
type Action = "allow" | "ask" | "deny";
type Rule = Action | Record<string, Action>;
export type OpenCodePolicy = Record<string, Rule>;

const READ_ONLY = ["read", "list", "glob", "grep", "todoread", "todowrite"] as const;
const MUST_DENY = ["external_directory", "webfetch", "websearch", "task"] as const;
// Only inert data/document artifacts may be edited without escalation; code and
// config (anything a human might later execute) always asks.
const DATA_EXTENSIONS = new Set([".csv", ".txt", ".md", ".json"]);
export const autoEditable = (artifact: string) => DATA_EXTENSIONS.has(artifact.slice(artifact.lastIndexOf(".")).toLowerCase()) && artifact.includes(".");

// G01 allowlist: only when the executor is the dedicated cgl_exec user (OS
// isolation, no network, workspace-only filesystem) are artifact edits and
// workspace-bound python/inspection commands auto-approved. Legacy mode is unchanged.
export const isolatedMode = (env: NodeJS.ProcessEnv = process.env) => env.CGL_OPENCODE_USER === "cgl_exec";
const INSPECT = ["ls", "cat", "pwd", "head", "tail", "find", "grep", "wc", "sort"] as const;
const PYTHON = ["python", "python3"] as const;
// Specific entries come after the generic ones: the last matching pattern wins.
const BASH_ASK_OVERRIDES = ["find * -exec*", "find * -execdir*", "find * -ok*", "find * -delete*", "find * -fprint*"] as const;
export const isolatedBashAllow = (): Record<string, Action> => ({
  "*": "ask",
  ...Object.fromEntries([...INSPECT, ...PYTHON].flatMap((c) => [[c, "allow"], [`${c} *`, "allow"]])),
  ...Object.fromEntries(BASH_ASK_OVERRIDES.map((p) => [p, "ask"])),
});

export function missionOpenCodePolicy(artifactPaths: string[], isolated = isolatedMode()): OpenCodePolicy {
  const policy: OpenCodePolicy = { "*": "ask" };
  for (const tool of READ_ONLY) policy[tool] = "allow";
  policy.edit = { "*": "ask", ...Object.fromEntries(artifactPaths.filter((a) => isolated || autoEditable(a)).map((artifact) => [artifact, "allow" as const])) };
  policy.bash = isolated ? isolatedBashAllow() : { "*": "ask" };
  for (const tool of MUST_DENY) policy[tool] = "deny";
  policy.doom_loop = "ask";
  return policy;
}

export function missionOpenCodeConfig(artifactPaths: string[], isolated = isolatedMode()) {
  return { $schema: "https://opencode.ai/config.json", permission: missionOpenCodePolicy(artifactPaths, isolated) };
}

const ALLOWED_CONFIG_KEYS = new Set(["$schema", "permission"]);
const isAction = (value: unknown): value is Action => value === "allow" || value === "ask" || value === "deny";

// Returns the list of violations; empty means the policy is acceptable.
export function openCodePolicyViolations(config: unknown, artifactPaths: string[], isolated = isolatedMode()): string[] {
  const permission = (config as any)?.permission;
  if (!permission || typeof permission !== "object" || Array.isArray(permission)) return ["permission block missing"];
  const errors: string[] = [];
  // G01: project config overrides the executor's global config, so a mission
  // workspace may only carry the permission block (no provider, plugin, mcp,
  // model, instructions or {env:}/{file:} substitutions).
  for (const key of Object.keys(config as object)) if (!ALLOWED_CONFIG_KEYS.has(key)) errors.push(`config key not allowed: ${key}`);
  if (/\{(env|file):/.test(JSON.stringify(config))) errors.push("config substitutions are not allowed");
  const rule = (tool: string): Rule | undefined => permission[tool];
  const fallback = rule("*");
  if (fallback !== "ask" && fallback !== "deny") errors.push(`"*" must be ask or deny`);
  for (const tool of MUST_DENY) if (rule(tool) !== "deny") errors.push(`${tool} must be deny`);
  const bash = rule("bash");
  const allowedBash = isolated ? isolatedBashAllow() : { "*": "ask" };
  if (!bash || typeof bash !== "object" || !isAction((bash as any)["*"])) errors.push("bash must be a pattern map without allow entries");
  else for (const [pattern, action] of Object.entries(bash)) {
    if (action === "allow" && allowedBash[pattern] !== "allow") errors.push(`bash allow outside the allowlist: ${pattern}`);
    else if (isolated && allowedBash[pattern] === "ask" && pattern !== "*" && action !== "ask") errors.push(`bash override weakened: ${pattern}`);
  }
  const edit = rule("edit");
  if (!edit || typeof edit !== "object" || (edit as any)["*"] === "allow" || !isAction((edit as any)["*"])) {
    errors.push("edit must be a pattern map whose \"*\" is ask or deny");
  } else {
    for (const [pattern, action] of Object.entries(edit)) {
      if (action === "allow" && !artifactPaths.includes(pattern)) errors.push(`edit allow outside contract artifacts: ${pattern}`);
      else if (action === "allow" && !isolated && !autoEditable(pattern)) errors.push(`edit allow on an executable artifact: ${pattern}`);
    }
  }
  const doom = rule("doom_loop");
  if (doom === "allow") errors.push("doom_loop must not be allow");
  for (const [tool, value] of Object.entries(permission)) {
    if (!isAction(value) && !(value && typeof value === "object" && Object.values(value).every(isAction))) errors.push(`${tool} has an invalid rule`);
  }
  return errors;
}

// P4 risk tiers for escalation. Unknown permission types are treated as the
// highest tier (fail closed); no tier is ever auto-approved.
export type PermissionRisk = "sensitive" | "critical";
export function permissionRisk(permission: unknown): PermissionRisk {
  return permission === "edit" || permission === "bash" ? "sensitive" : "critical";
}
