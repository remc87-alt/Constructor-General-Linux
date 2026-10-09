import assert from "node:assert/strict";
import test from "node:test";
import { validationAccepted, validatorExecutionFailure } from "../src/workflows.ts";

const clean = { ok: true, errors: [], variant: { ok: true, errors: [] } };

test("accepts only principal and independent variant both passing", () => {
  assert.equal(validationAccepted(clean), true);
});

test("rejects a historical T4-shaped result: primary passes but variant fails", () => {
  assert.equal(validationAccepted({ ok: true, errors: [], variant: { ok: false, errors: ["tareas count=0"] } }), false);
});

test("rejects primary failure even if the variant passes", () => {
  assert.equal(validationAccepted({ ok: false, errors: ["tarea missing"], variant: { ok: true, errors: [] } }), false);
});

test("rejects an absent variant", () => {
  assert.equal(validationAccepted({ ok: true, errors: [], variant: null }), false);
});

test("rejects validator execution failure", () => {
  assert.deepEqual(validatorExecutionFailure(), { ok: false, errors: ["validator execution failed"], variant: null });
  assert.equal(validationAccepted(validatorExecutionFailure()), false);
});
