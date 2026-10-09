// T3 synthetic meeting (3 participants) and its expected extraction.
// Includes the G5 traps: acknowledgements ("De acuerdo", "Confirmado") are not tasks.

export const TRANSCRIPT = `[10:00] Ana: Buenos días. Revisemos el lanzamiento del portal de clientes.
[10:01] Bruno: El módulo de pagos está listo; falta la prueba de carga.
[10:02] Ana: Acordamos lanzar la versión beta el 20 de octubre.
[10:03] Carla: De acuerdo. Yo me encargo de redactar la guía de usuario y la tendré lista el 15 de octubre.
[10:04] Ana: Bruno, ¿puedes ejecutar la prueba de carga?
[10:05] Bruno: Sí, ejecutaré la prueba de carga antes del 13 de octubre.
[10:06] Ana: Perfecto. También acordamos que el soporte será por correo durante la beta.
[10:07] Ana: Yo enviaré el comunicado a los clientes el 18 de octubre.
[10:08] Carla: Confirmado.
`;

export const EXPECTED = {
  participantes: ["Ana", "Bruno", "Carla"],
  acuerdos: [
    ["beta", "20 de octubre"],
    ["soporte", "correo"]
  ],
  tareas: [
    { responsable: "Carla", tarea: ["guía de usuario"], plazo: "15 de octubre" },
    { responsable: "Bruno", tarea: ["prueba de carga"], plazo: "13 de octubre" },
    { responsable: "Ana", tarea: ["comunicado"], plazo: "18 de octubre" }
  ]
};

// This is intentionally not a textual substitution of TRANSCRIPT. It changes
// people, dates, commitments, and agreement wording so a fixture-specific
// parser cannot pass merely by reproducing the original answer.
export const VARIANT_TRANSCRIPT = `[11:00] Elena: Revisemos la salida de la edición candidata.
[11:01] Diego: La integración está terminada; aún debemos medir su rendimiento.
[11:02] Elena: Dejamos acordado publicar la edición candidata el 2 de noviembre.
[11:03] Marta: Asumiré preparar el manual para usuarios y lo terminaré el 28 de octubre.
[11:04] Elena: Diego, necesitamos que midas el rendimiento antes de publicar.
[11:05] Diego: Me corresponde realizar las pruebas de rendimiento a más tardar el 27 de octubre.
[11:06] Elena: También queda definido que las consultas se atenderán por correo durante esta etapa.
[11:07] Elena: Yo difundiré el anuncio entre los clientes el 31 de octubre.
[11:08] Marta: Entendido.
`;

export const VARIANT_EXPECTED = {
  participantes: ["Elena", "Diego", "Marta"],
  acuerdos: [
    ["edición candidata", "2 de noviembre"],
    ["consultas", "correo"]
  ],
  tareas: [
    { responsable: "Marta", tarea: ["manual", "usuarios"], plazo: "28 de octubre" },
    { responsable: "Diego", tarea: ["pruebas", "rendimiento"], plazo: "27 de octubre" },
    { responsable: "Elena", tarea: ["anuncio", "clientes"], plazo: "31 de octubre" }
  ]
};

// Holdout fixture: never described in MISSION_PROMPT. It changes order,
// participants, agreement wording, task wording, distractors and incomplete
// information. It prevents tuning only to the first reformulation.
export const HOLDOUT_TRANSCRIPT = `[09:00] Iván: Podemos revisar el informe cuando estén disponibles las métricas.
[09:01] Noa: No tengo todavía una fecha para apoyar al equipo de soporte.
[09:02] Rocío: Queda decidido publicar el reporte de incidencias el 7 de diciembre.
[09:03] Iván: Que quede claro: la sugerencia de cambiar el logo no es un acuerdo ni una tarea.
[09:04] Noa: Prepararé el informe de incidencias para el 5 de diciembre.
[09:05] Iván: Yo revisaré las métricas antes del 6 de diciembre.
[09:06] Rocío: También se definió que las dudas se atenderán por correo durante el lanzamiento.
[09:07] Noa: Quizá podría ayudar con una presentación, pero aún no hay plazo.
`;

export const HOLDOUT_EXPECTED = {
  participantes: ["Iván", "Noa", "Rocío"],
  acuerdos: [
    ["publicar", "reporte", "7 de diciembre"],
    ["dudas", "correo"]
  ],
  tareas: [
    { responsable: "Noa", tarea: ["informe", "incidencias"], plazo: "5 de diciembre" },
    { responsable: "Iván", tarea: ["revisar", "métricas"], plazo: "6 de diciembre" }
  ]
};

export const VALIDATION_VARIANTS = [
  { name: "reformulated", transcript: VARIANT_TRANSCRIPT, expected: VARIANT_EXPECTED },
  { name: "holdout", transcript: HOLDOUT_TRANSCRIPT, expected: HOLDOUT_EXPECTED }
] as const;

export const MISSION_PROMPT = `Trabaja exclusivamente en el directorio actual: es el workspace de esta misión. No uses rutas fuera de él.
El archivo transcripcion.txt contiene una reunión de tres participantes.

1. Crea process.py en el directorio actual. Debe leer transcripcion.txt usando una ruta relativa al propio script (Path(__file__).parent) y escribir resultado.json en ese mismo directorio, con exactamente esta estructura y estas claves en español:
{"participantes": ["..."], "acuerdos": ["..."], "tareas": [{"responsable": "...", "tarea": "...", "plazo": "..."}]}
No uses las claves inglesas participants, agreements ni tasks.
Reglas semánticas obligatorias:
- participantes: nombres de quienes hablan, sin repetir, en orden de aparición.
- acuerdos: decisiones explícitas del grupo. El programa debe reconocer las raíces de decisión acord-, decid- y defin- en sus distintas conjugaciones, no una lista cerrada de frases exactas. No clasifiques propuestas, hipótesis ni frases que niegan ser un acuerdo.
- tareas: solo compromisos concretos de la persona que habla, con acción y plazo explícitos. Detecta construcciones de compromiso por su estructura: responsabilidad explícita (por ejemplo, primera persona reflexiva), o una acción en primera persona de futuro; para esta última usa un patrón morfológico general (incluidas formas terminadas en -ré) y no una lista cerrada de verbos. "De acuerdo", "Confirmado", "Perfecto", propuestas y compromisos sin plazo NO son tareas.
- tarea: la acción comprometida, sin el plazo. plazo: la fecha tal como aparece (por ejemplo "13 de octubre").
No codifiques nombres de personas, acciones, fechas, frases literales ni contenido del ejemplo. El programa debe derivar todos los datos de transcripcion.txt. Si falta responsable, acción o plazo, omite esa tarea; no inventes texto, fechas ni acuerdos.
Antes de escribir el archivo, valida que el objeto tenga exactamente las tres claves canónicas, arrays para participantes/acuerdos/tareas y objetos de tarea con responsable, tarea y plazo no vacíos.
2. Ejecuta: python3 process.py
3. Muestra el contenido de resultado.json.`;
