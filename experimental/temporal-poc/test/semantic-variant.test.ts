import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { TRANSCRIPT } from "../src/t3-fixture.ts";
import { validateResult } from "../src/mission-activities.ts";
import { validationAccepted } from "../src/workflows.ts";

test("rejects a fixture-hardcoded parser with the independent semantic variant", async () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "temporal-poc-hardcoded-"));
  const originalOutput = {
    participantes: ["Ana", "Bruno", "Carla"],
    acuerdos: [
      "Acordamos lanzar la versión beta el 20 de octubre.",
      "También acordamos que el soporte será por correo durante la beta."
    ],
    tareas: [
      { responsable: "Carla", tarea: "redactar la guía de usuario", plazo: "15 de octubre" },
      { responsable: "Bruno", tarea: "ejecutar la prueba de carga", plazo: "13 de octubre" },
      { responsable: "Ana", tarea: "enviar el comunicado a los clientes", plazo: "18 de octubre" }
    ]
  };
  try {
    fs.writeFileSync(path.join(workspace, "transcripcion.txt"), TRANSCRIPT);
    // Simulates the observed T4 defect: the primary fixture is emitted even
    // when the input transcript changes.
    fs.writeFileSync(
      path.join(workspace, "process.py"),
      `from pathlib import Path\nPath(__file__).with_name("resultado.json").write_text(${JSON.stringify(JSON.stringify(originalOutput))}, encoding="utf-8")\n`
    );
    fs.writeFileSync(path.join(workspace, "resultado.json"), JSON.stringify(originalOutput));

    const validation = await validateResult({ workspace });
    assert.equal(validation.ok, true, "the primary fixture alone still passes");
    assert.equal(validation.variant?.ok, false, "the independent variant detects hardcoding");
    assert.equal(validationAccepted(validation), false, "workflow gate rejects the historical false-PASS shape");
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});
