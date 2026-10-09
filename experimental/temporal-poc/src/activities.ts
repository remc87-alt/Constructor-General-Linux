import fs from "node:fs";
import path from "node:path";
import { Context, heartbeat, sleep, log } from "@temporalio/activity";

// Temporal may execute an activity more than once (retries, worker crashes,
// timeouts). External effects are made idempotent here with an operation key
// and a persistent ledger: the effect file is created with O_EXCL exactly once;
// every later execution finds it and reports the original effect.

const effectsDir = () => {
  const dir = process.env.POC_EFFECTS_DIR;
  if (!dir) throw new Error("POC_EFFECTS_DIR not set");
  return dir;
};

function recordAttempt(opKey: string, step: string): number {
  const info = Context.current().info;
  fs.appendFileSync(path.join(effectsDir(), `${opKey}.attempts.log`),
    `${new Date().toISOString()} step=${step} attempt=${info.attempt} activityId=${info.activityId}\n`, { mode: 0o600 });
  return info.attempt;
}

function applyOnce(file: string, record: object): { duplicateSuppressed: boolean; effect: any } {
  try {
    fs.writeFileSync(file, JSON.stringify(record), { flag: "wx", mode: 0o600 });
    return { duplicateSuppressed: false, effect: record };
  } catch (e: any) {
    if (e?.code !== "EEXIST") throw e;
    return { duplicateSuppressed: true, effect: JSON.parse(fs.readFileSync(file, "utf8")) };
  }
}

// B. Idempotent external effect. failAfterEffectAttempts simulates the worst
// transient failure: the effect is applied, then the attempt fails anyway.
export async function applyEffect(input: { opKey: string; payload: string; failAfterEffectAttempts: number }) {
  const info = Context.current().info;
  const attempt = recordAttempt(input.opKey, "applyEffect");
  const res = applyOnce(path.join(effectsDir(), `${input.opKey}.json`), {
    opKey: input.opKey, payload: input.payload, appliedAt: new Date().toISOString(),
    attempt, workflowId: info.workflowExecution.workflowId
  });
  if (attempt <= input.failAfterEffectAttempts) {
    throw new Error(`simulated transient failure after effect (attempt ${attempt})`);
  }
  return { ...res.effect, duplicateSuppressed: res.duplicateSuppressed, returnedOnAttempt: attempt };
}

// T2.4: heartbeats normally; on attempt 1 it can stop heartbeating (stuck).
export async function watchedStep(input: { opKey: string; hangOnFirstAttempt: boolean }) {
  const attempt = recordAttempt(input.opKey, "watchedStep");
  for (let i = 0; i < 5; i++) {
    heartbeat({ i });
    await sleep(200);
  }
  if (input.hangOnFirstAttempt && attempt === 1) {
    log.warn("watchedStep simulating a stuck execution (no heartbeats)");
    await sleep(120_000); // cancelled by the worker once the heartbeat timeout is reported
  }
  return { attempt, heartbeats: 5 };
}

// F. Idempotent finalization after human approval.
export async function finalize(input: { opKey: string; decision: string; by: string }) {
  const attempt = recordAttempt(input.opKey, "finalize");
  const res = applyOnce(path.join(effectsDir(), `${input.opKey}.final.json`), {
    opKey: input.opKey, decision: input.decision, by: input.by, finalizedAt: new Date().toISOString(), attempt
  });
  return { ...res.effect, duplicateSuppressed: res.duplicateSuppressed };
}
