// Prepares the exclusive T3 workspace BEFORE the T3 OpenCode starts (OpenCode
// reads opencode.json from its cwd). Idempotent; never overwrites.
//   tsx src/t3-setup.ts <workspace-dir>
import fs from "node:fs";
import path from "node:path";
import { TRANSCRIPT } from "./t3-fixture.ts";
import { ensureGitWorkspace, workspaceRoot } from "./workspace.ts";

// Root from CGL_WORKSPACE_ROOT (legacy per-user root when unset).
const ws = process.argv[2];
const root = workspaceRoot();
if (!ws || path.dirname(path.resolve(ws)) !== root || path.resolve(ws) !== ws) throw new Error(`workspace must be a direct child of ${root}`);
fs.mkdirSync(ws, { recursive: true, mode: 0o700 });

function writeOnce(file: string, content: string) {
  try {
    fs.writeFileSync(file, content, { flag: "wx", mode: 0o600 });
    console.log(`written ${path.basename(file)}`);
  } catch (e: any) {
    if (e?.code !== "EEXIST") throw e;
    if (fs.readFileSync(file, "utf8") !== content) throw new Error(`${file} exists with different content`);
    console.log(`kept ${path.basename(file)} (identical)`);
  }
}

writeOnce(path.join(ws, "transcripcion.txt"), TRANSCRIPT);
// Provider config only (API key is an {env:FREELLM_KEY} reference, no secret).
const labConfig = `${process.env.HOME}/constructor-general-linux-m01-lab/opencode.json`;
writeOnce(path.join(ws, "opencode.json"), fs.readFileSync(labConfig, "utf8"));
// G01: own git worktree so OpenCode does not resolve worktree "/".
console.log(ensureGitWorkspace(ws).created ? "git workspace initialised" : "git workspace kept (verified)");
