import assert from "node:assert/strict";
import test from "node:test";
import { EXPECTED, HOLDOUT_EXPECTED, MISSION_PROMPT, VARIANT_EXPECTED } from "../src/t3-fixture.ts";
import { checkExtraction } from "../src/mission-activities.ts";

function validOutput(expected: typeof EXPECTED) {
  return {
    participantes: expected.participantes,
    acuerdos: expected.acuerdos.map((words) => words.join(" ")),
    tareas: expected.tareas.map((task) => ({ responsable: task.responsable, tarea: task.tarea.join(" "), plazo: task.plazo }))
  };
}

test("primary example accepts canonical semantic output", () => {
  assert.deepEqual(checkExtraction(validOutput(EXPECTED), EXPECTED), []);
});

test("reformulated agreements and tasks accept without primary literals", () => {
  assert.deepEqual(checkExtraction(validOutput(VARIANT_EXPECTED), VARIANT_EXPECTED), []);
});

test("holdout accepts different order, names and agreement wording", () => {
  assert.deepEqual(checkExtraction(validOutput(HOLDOUT_EXPECTED), HOLDOUT_EXPECTED), []);
});

test("missing information is omitted rather than invented", () => {
  const out = validOutput(HOLDOUT_EXPECTED);
  assert.deepEqual(checkExtraction(out, HOLDOUT_EXPECTED), []);
  out.tareas.push({ responsable: "Noa", tarea: "ayudar con una presentación", plazo: "" });
  assert.ok(checkExtraction(out, HOLDOUT_EXPECTED).some((e) => e.includes("tareas count")));
});

test("distractors and incorrect outputs fail strict canonical validation", () => {
  const out = validOutput(HOLDOUT_EXPECTED) as any;
  out.acuerdos.push("la sugerencia de cambiar el logo no es un acuerdo");
  assert.ok(checkExtraction(out, HOLDOUT_EXPECTED).some((e) => e.includes("acuerdos count")));
  assert.ok(checkExtraction({ participants: [], agreements: [], tasks: [] }, HOLDOUT_EXPECTED).some((e) => e.includes("canonical keys")));
});

test("generation contract requires generalized decision and commitment parsing without fixture answers", () => {
  assert.match(MISSION_PROMPT, /acord-, decid- y defin-/);
  assert.match(MISSION_PROMPT, /patrón morfológico general/);
  assert.match(MISSION_PROMPT, /terminadas en -ré/);
  for (const fixtureLiteral of ["Elena", "Diego", "Marta", "consultas", "correo", "difundiré"]) {
    assert.doesNotMatch(MISSION_PROMPT, new RegExp(fixtureLiteral, "i"));
  }
});
