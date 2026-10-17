import assert from "node:assert/strict";
import test from "node:test";
import { isolatedMode, missionOpenCodeConfig, openCodePolicyViolations } from "../src/opencode-policy.ts";

const ARTIFACTS = ["expense_cli.py", "test_expense_cli.py", "notes.md"];
const iso = () => missionOpenCodeConfig(ARTIFACTS, true).permission as any;

test("G01 allowlist: isolated mode auto-approves artifact edits and workspace python/inspection only", () => {
  const p = iso();
  assert.deepEqual(p.edit, { "*": "ask", "expense_cli.py": "allow", "test_expense_cli.py": "allow", "notes.md": "allow" });
  for (const c of ["python3 *", "python *", "ls *", "cat *", "grep *", "wc *", "pwd"]) assert.equal(p.bash[c], "allow", c);
  assert.equal(p.bash["*"], "ask");
  for (const c of ["find * -exec*", "find * -delete*"]) assert.equal(p.bash[c], "ask", c);
  for (const c of ["curl *", "pip *", "sudo *", "rm *", "git *", "bash *"]) assert.equal(p.bash[c], undefined, c);
  assert.deepEqual(openCodePolicyViolations({ permission: p }, ARTIFACTS, true), []);
  for (const t of ["external_directory", "webfetch", "websearch", "task"]) assert.equal(p[t], "deny");
});

test("G01 allowlist: legacy mode is unchanged and rejects the isolated allowlist", () => {
  const legacy = missionOpenCodeConfig(ARTIFACTS, false).permission as any;
  assert.deepEqual(legacy.bash, { "*": "ask" });
  assert.deepEqual(legacy.edit, { "*": "ask", "notes.md": "allow" });
  assert.deepEqual(openCodePolicyViolations({ permission: legacy }, ARTIFACTS, false), []);
  assert.match(openCodePolicyViolations({ permission: iso() }, ARTIFACTS, false).join("|"), /bash allow outside the allowlist/);
});

test("G01 allowlist: isolated policy rejects anything beyond the allowlist", () => {
  const reject = (permission: unknown, re: RegExp) => assert.match(openCodePolicyViolations({ permission }, ARTIFACTS, true).join("|"), re);
  const p = iso();
  reject({ ...p, bash: { ...p.bash, "curl *": "allow" } }, /bash allow outside the allowlist: curl \*/);
  reject({ ...p, bash: { ...p.bash, "rm *": "allow" } }, /rm \*/);
  reject({ ...p, bash: { ...p.bash, "find * -exec*": "allow" } }, /bash allow outside/);
  reject({ ...p, bash: "allow" }, /bash/);
  reject({ ...p, edit: { ...p.edit, "other.py": "allow" } }, /outside contract artifacts/);
  reject({ ...p, edit: { ...p.edit, "*": "allow" } }, /edit/);
  reject({ ...p, external_directory: "ask" }, /external_directory must be deny/);
});

test("G01 allowlist: isolatedMode is true only for CGL_OPENCODE_USER=cgl_exec", () => {
  assert.equal(isolatedMode({ CGL_OPENCODE_USER: "cgl_exec" }), true);
  assert.equal(isolatedMode({ CGL_OPENCODE_USER: "other" }), false);
  assert.equal(isolatedMode({}), false);
});
