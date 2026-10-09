// Prepares the exclusive T3 workspace BEFORE the T3 OpenCode starts (OpenCode
// reads opencode.json from its cwd). Idempotent; never overwrites.
//   tsx src/t3-setup.ts <workspace-dir>
import fs from "node:fs";
import path from "node:path";
import { TRANSCRIPT } from "./t3-fixture.ts";

const ws = process.argv[2];
const root = `${process.env.HOME}/.local/state/constructor-temporal-poc/workspaces/`;
if (!ws || !path.resolve(ws).startsWith(root)) throw new Error(`workspace must be under ${root}`);
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
