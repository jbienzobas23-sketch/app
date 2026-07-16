import { describe, it, expect } from "vitest";
import {
  categoriesOf, modelOf, modelsOf, answerFor, comboIdFromModels,
  audioComposers, audioTags, courseUnitList, unitExList, resultStatusOf,
  partsOf, partToExercise, durationOf, keyReadyOf, resultPartsOf, questionsCountOf, updatePart, composersOf,
  questionsSnapshotOf, attemptsOf, addAttempt, normalizeExercise, questionScopeOf, serializeIntervals, btnOf,
  flattenSinglePart, audioDisplayTitle, unitAverage, courseAverage, mediaStatusOf,
} from "./domain.js";
import { interactiveFigureDiagnostics } from "./scoring.js";
import { DEFAULT_CATEGORY } from "../seed.js";

describe("categoriesOf", () => {
  it("prioriza el formato nuevo `categories`", () => {
    const cats = [{ id: "x" }];
    expect(categoriesOf({ categories: cats })).toBe(cats);
  });
  it("cae al formato `modes` y al heredado `mode`", () => {
    const modes = [{ id: "m" }];
    expect(categoriesOf({ modes })).toBe(modes);
    expect(categoriesOf({ mode: { id: "leg" } })).toEqual([{ id: "leg" }]);
  });
  it("usa la categoría por defecto si no hay nada", () => {
    expect(categoriesOf({})).toEqual([DEFAULT_CATEGORY]);
  });
});

describe("answerFor", () => {
  it("lee el formato nuevo `answers[categoryId]`", () => {
    const ex = { answers: { cat1: [{ fn: "T", start: 0, end: 1 }] } };
    expect(answerFor(ex, "cat1")).toEqual([{ fn: "T", start: 0, end: 1 }]);
    expect(answerFor(ex, "otra")).toEqual([]);
  });
  it("lee el formato heredado `answer` con su `mode.id`", () => {
    const ex = { answer: [{ fn: "S", start: 0, end: 2 }], mode: { id: "leg" } };
    expect(answerFor(ex, "leg")).toEqual([{ fn: "S", start: 0, end: 2 }]);
    expect(answerFor(ex, "otra")).toEqual([]);
  });
  it("el formato heredado sin mode cae a la categoría por defecto", () => {
    const ex = { answer: [{ fn: "D", start: 0, end: 3 }] };
    expect(answerFor(ex, DEFAULT_CATEGORY.id)).toEqual([{ fn: "D", start: 0, end: 3 }]);
  });
});

describe("modelOf / modelsOf", () => {
  it("modelOf cae a 'interactivo' por defecto", () => {
    expect(modelOf({})).toBe("interactivo");
    expect(modelOf({ model: "esquema" })).toBe("esquema");
  });
  it("modelsOf devuelve el array o lo deriva de model", () => {
    expect(modelsOf({ models: ["a", "b"] })).toEqual(["a", "b"]);
    expect(modelsOf({ model: "esquema" })).toEqual(["esquema"]);
    expect(modelsOf({})).toEqual(["interactivo"]);
  });
});

describe("comboIdFromModels", () => {
  it("deriva el comboId a partir del array de modelos", () => {
    expect(comboIdFromModels([])).toBe("interactivo");
    expect(comboIdFromModels(["esquema"])).toBe("esquema");
    expect(comboIdFromModels(["interactivo", "cuestionario"])).toBe("interactivo+cuestionario");
    expect(comboIdFromModels(["esquema", "cuestionario"])).toBe("esquema+cuestionario");
  });
});

describe("unitExList — resolución tolerante al tipo de id", () => {
  // Los ejercicios se crean con id numérico (Date.now()); las unidades guardan
  // exerciseIds como texto. La resolución debe funcionar con AMBOS tipos.
  const exercises = [
    { id: 1779175479413, title: "Cadencia 1" },          // id numérico (real)
    { id: 1779182638495, title: "Análisis 1" },
    { id: "ex-abc", title: "Nuevo (id texto)" },
    { id: 5, title: "Oculto", hidden: true },
  ];
  it("resuelve exerciseIds de TEXTO contra ids de ejercicio NUMÉRICOS (el bug)", () => {
    const unit = { id: "u1", exerciseIds: ["1779175479413", "1779182638495"] };
    const got = unitExList(unit, exercises, "teacher").map((e) => e.title);
    expect(got).toEqual(["Cadencia 1", "Análisis 1"]);
  });
  it("resuelve exerciseIds NUMÉRICOS (unidades antiguas)", () => {
    const unit = { id: "u2", exerciseIds: [1779175479413] };
    expect(unitExList(unit, exercises, "teacher").map((e) => e.title)).toEqual(["Cadencia 1"]);
  });
  it("conserva el orden de exerciseIds e ignora ids inexistentes", () => {
    const unit = { id: "u3", exerciseIds: ["ex-abc", "no-existe", "1779175479413"] };
    expect(unitExList(unit, exercises, "teacher").map((e) => e.title)).toEqual(["Nuevo (id texto)", "Cadencia 1"]);
  });
  it("el alumno no ve los ejercicios ocultos", () => {
    const unit = { id: "u4", exerciseIds: ["1779175479413", "5"] };
    expect(unitExList(unit, exercises, "student").map((e) => e.title)).toEqual(["Cadencia 1"]);
    expect(unitExList(unit, exercises, "teacher").map((e) => e.title)).toEqual(["Cadencia 1", "Oculto"]);
  });
});

describe("courseUnitList", () => {
  const units = [{ id: "u1", name: "A" }, { id: "u2", name: "B", hidden: true }];
  it("resuelve unitIds en orden y filtra ocultas para el alumno", () => {
    const course = { id: "c1", unitIds: ["u2", "u1"] };
    expect(courseUnitList(course, units, "teacher").map((u) => u.name)).toEqual(["B", "A"]);
    expect(courseUnitList(course, units, "student").map((u) => u.name)).toEqual(["A"]);
  });
});

describe("resultStatusOf", () => {
  it("corregido si el profesor ya corrigió, sin importar el modelo", () => {
    expect(resultStatusOf({ teacherCorrection: { corrected: true } }, { model: "esquema" })).toBe("corregido");
    expect(resultStatusOf({ teacherCorrection: { corrected: true } }, { model: "interactivo" })).toBe("corregido");
  });
  it("pendiente si el ejercicio incluye esquema", () => {
    expect(resultStatusOf({}, { model: "esquema" })).toBe("pendiente");
    expect(resultStatusOf({}, { models: ["esquema", "cuestionario"] })).toBe("pendiente");
  });
  it("pendiente si el cuestionario tiene alguna pregunta de desarrollo", () => {
    const exercise = { model: "cuestionario", questions: [{ id: "q1", type: "test" }, { id: "q2", type: "desarrollo" }] };
    expect(resultStatusOf({}, exercise)).toBe("pendiente");
  });
  it("auto si el cuestionario es solo tipo test", () => {
    const exercise = { model: "cuestionario", questions: [{ id: "q1", type: "test" }] };
    expect(resultStatusOf({}, exercise)).toBe("auto");
  });
  it("auto por defecto (interactivo, sin corrección)", () => {
    expect(resultStatusOf({}, { model: "interactivo" })).toBe("auto");
    expect(resultStatusOf(null, {})).toBe("auto");
  });
  it("lee la instantánea de preguntas de la entrega, no las vigentes (F5, T5.5)", () => {
    const exercise = { model: "cuestionario", questions: [{ id: "q1", type: "test" }] }; // vigente: sin desarrollo
    // la entrega se hizo cuando SÍ había una de desarrollo → sigue pendiente
    const result = { questionsSnapshot: [{ id: "q1", type: "test" }, { id: "q2", type: "desarrollo" }] };
    expect(resultStatusOf(result, exercise)).toBe("pendiente");
  });
  it("sin instantánea (entregas de antes de T5.5), cae a las preguntas vigentes", () => {
    const exercise = { model: "cuestionario", questions: [{ id: "q1", type: "test" }, { id: "q2", type: "desarrollo" }] };
    expect(resultStatusOf({}, exercise)).toBe("pendiente");
  });
});

describe("unitAverage (N1, PLAN_CALIFICACION.md)", () => {
  const exercises = [
    { id: "e1", model: "interactivo" },
    { id: "e2", model: "interactivo" },
    { id: "e3", model: "esquema" }, // siempre "pendiente" sin corrección manual (resultStatusOf)
  ];
  it("sin sobre evaluacion, equitativa ≡ aritmética simple", () => {
    const unit = { id: "u1", exerciseIds: ["e1", "e2"] };
    const results = { e1: { score: 80 }, e2: { score: 60 } };
    expect(unitAverage(unit, exercises, results, "teacher")).toEqual({ nota: 70, pendientes: 0, total: 2 });
  });
  it("un ejercicio sin entrega cuenta como pendiente y no penaliza la nota", () => {
    const unit = { id: "u2", exerciseIds: ["e1", "e2"] };
    const results = { e1: { score: 80 } };
    expect(unitAverage(unit, exercises, results, "teacher")).toEqual({ nota: 80, pendientes: 1, total: 2 });
  });
  it("un esquema con nota preliminar pero sin corrección manual cuenta pendiente", () => {
    const unit = { id: "u3", exerciseIds: ["e1", "e3"] };
    const results = { e1: { score: 80 }, e3: { score: 50 } };
    expect(unitAverage(unit, exercises, results, "teacher")).toEqual({ nota: 65, pendientes: 1, total: 2 });
  });
  it("una entrega SIN nota utilizable (score null) cuenta pendiente aunque su modelo sea 'auto' (el libre)", () => {
    // Interactivo sin clave: submitAnswer guarda score null y resultStatusOf
    // devuelve "auto" (solo mira el modelo). Sin nota no hay nada corregido.
    const unit = { id: "u6", exerciseIds: ["e1", "e2"] };
    const results = { e1: { score: 80 }, e2: { score: null, status: "auto" } };
    expect(unitAverage(unit, exercises, results, "teacher")).toEqual({ nota: 80, pendientes: 1, total: 2 });
  });
  it("pesos personalizados se respetan", () => {
    const unit = { id: "u4", exerciseIds: ["e1", "e2"], evaluacion: { modo: "personalizada", pesos: { e1: 3, e2: 1 } } };
    const results = { e1: { score: 80 }, e2: { score: 60 } };
    expect(unitAverage(unit, exercises, results, "teacher").nota).toBe(75); // (80*3+60*1)/4
  });
  it("sin ejercicios → nota null, 0 pendientes, 0 total", () => {
    expect(unitAverage({ id: "u5", exerciseIds: [] }, exercises, {}, "teacher")).toEqual({ nota: null, pendientes: 0, total: 0 });
  });
});

describe("courseAverage (N1, PLAN_CALIFICACION.md)", () => {
  const exercises = [{ id: "e1", model: "interactivo" }, { id: "e2", model: "esquema" }];
  const units = [{ id: "u1", exerciseIds: ["e1"] }, { id: "u2", exerciseIds: ["e2"] }];
  it("sin sobre evaluacion, equitativa ≡ aritmética simple entre unidades", () => {
    const course = { id: "c1", unitIds: ["u1", "u2"] };
    const results = { e1: { score: 80 }, e2: { score: 60 } };
    // u2 (esquema, sin corrección) queda pendiente → 1 unidad pendiente
    expect(courseAverage(course, units, exercises, results, "teacher")).toEqual({ nota: 70, pendientes: 1, total: 2 });
  });
  it("pesos personalizados sobre las unidades se respetan", () => {
    const course = { id: "c2", unitIds: ["u1", "u2"], evaluacion: { modo: "personalizada", pesos: { u1: 3, u2: 1 } } };
    const results = { e1: { score: 80 }, e2: { score: 60 } };
    expect(courseAverage(course, units, exercises, results, "teacher").nota).toBe(75); // (80*3+60*1)/4
  });
});

describe("mediaStatusOf", () => {
  it("sin nota → pendiente (○)", () => {
    expect(mediaStatusOf({ nota: null, pendientes: 0 })).toBe("pendiente");
  });
  it("con nota y algo pendiente → provisional (◐)", () => {
    expect(mediaStatusOf({ nota: 70, pendientes: 1 })).toBe("provisional");
  });
  it("con nota y nada pendiente → corregido (●)", () => {
    expect(mediaStatusOf({ nota: 70, pendientes: 0 })).toBe("corregido");
  });
});

describe("questionsSnapshotOf", () => {
  it("con instantánea, la devuelve tal cual", () => {
    const snap = [{ id: "q1", type: "test" }];
    expect(questionsSnapshotOf({ questionsSnapshot: snap }, { questions: [{ id: "otra" }] })).toBe(snap);
  });
  it("sin instantánea, cae a questionsOf(exercise)", () => {
    const exercise = { questions: [{ id: "q1", type: "test" }] };
    expect(questionsSnapshotOf({}, exercise)).toEqual(exercise.questions);
    expect(questionsSnapshotOf(null, exercise)).toEqual(exercise.questions);
  });
});

describe("partsOf", () => {
  it("devuelve `parts` tal cual si existe y no está vacío", () => {
    const parts = [{ id: "a", audioUrl: "x.mp3" }, { id: "b", audioUrl: "y.mp3" }];
    expect(partsOf({ parts })).toBe(parts);
  });
  it("sintetiza una única parte desde los campos planos si no hay `parts`", () => {
    const ex = { id: "e1", audioUrl: "x.mp3", duration: 40, answers: { c1: [1] }, questions: [{ id: "q1" }] };
    const parts = partsOf(ex);
    expect(parts).toHaveLength(1);
    expect(parts[0]).toMatchObject({ id: "p1", audioUrl: "x.mp3", duration: 40, answers: { c1: [1] }, questions: [{ id: "q1" }], points: 1 });
  });
  it("una parts vacío también sintetiza", () => {
    expect(partsOf({ parts: [], audioUrl: "x.mp3" })[0]).toMatchObject({ audioUrl: "x.mp3" });
  });
});

// A2-02: quitar una parte de un multiparte de 2→1 dejaba `parts:[A]` guardado,
// pero partsOf() con length===1 sintetiza desde los CAMPOS PLANOS del
// ejercicio (obsoletos desde que se hizo multiparte) — el audio/clave/
// preguntas de la parte superviviente quedaban enmascarados.
describe("flattenSinglePart", () => {
  const partA = { id: "a", audioUrl: "a.mp3", duration: 30, answers: { c1: [{ fn: "T", start: 0, end: 1 }] }, questions: [{ id: "qa" }] };
  const partB = { id: "b", audioUrl: "b.mp3", duration: 20, answers: {}, questions: [{ id: "qb" }] };

  it("con ≥2 partes, devuelve el ejercicio intacto", () => {
    const ex = { id: "e1", parts: [partA, partB], audioUrl: "viejo.mp3" };
    expect(flattenSinglePart(ex)).toBe(ex);
  });
  it("sin `parts`, devuelve el ejercicio intacto", () => {
    const ex = { id: "e1", audioUrl: "x.mp3" };
    expect(flattenSinglePart(ex)).toBe(ex);
  });
  it("el bug: sin el aplanado, partsOf tras quitar B muestra los planos viejos, no los de A", () => {
    const savedWithoutFix = { id: "e1", title: "T", audioUrl: "viejo.mp3", duration: 99, answers: { vieja: [1] }, questions: [{ id: "vieja" }], parts: [partA] };
    const got = partsOf(savedWithoutFix)[0];
    expect(got.audioUrl).toBe("viejo.mp3"); // el bug: no es "a.mp3"
    expect(got.questions).toEqual([{ id: "vieja" }]); // el bug: no son las de A
  });
  it("con el aplanado antes de guardar, partsOf refleja los datos de la parte superviviente (A)", () => {
    const ex = { id: "e1", title: "T", audioUrl: "viejo.mp3", duration: 99, answers: { vieja: [1] }, questions: [{ id: "vieja" }], parts: [partA] };
    const flattened = flattenSinglePart(ex);
    expect(flattened.parts).toBeUndefined();
    expect(flattened.audioUrl).toBe("a.mp3");
    expect(flattened.duration).toBe(30);
    expect(flattened.questions).toEqual([{ id: "qa" }]);
    const got = partsOf(flattened)[0];
    expect(got.audioUrl).toBe("a.mp3");
    expect(got.questions).toEqual([{ id: "qa" }]);
  });
  it("es idempotente aplicado sobre un ejercicio ya aplanado", () => {
    const ex = { id: "e1", title: "T", parts: [partA] };
    const once = flattenSinglePart(ex);
    const twice = flattenSinglePart(once);
    expect(twice).toEqual(once);
  });
  it("normalizeExercise(flattenSinglePart(ex)) re-materializa parts coherentes con A", () => {
    const ex = { id: "e1", title: "T", audioUrl: "viejo.mp3", parts: [partA] };
    const norm = normalizeExercise(flattenSinglePart(ex));
    expect(norm.parts).toHaveLength(1);
    expect(norm.parts[0]).toMatchObject({ audioUrl: "a.mp3", duration: 30, questions: [{ id: "qa" }] });
  });
});

describe("partToExercise", () => {
  it("mezcla la parte sobre el ejercicio conservando el id del ejercicio", () => {
    const exercise = { id: "e1", title: "T", composerName: "Bach" };
    const part = { id: "p2", audioUrl: "y.mp3", duration: 30 };
    const projected = partToExercise(exercise, part);
    expect(projected.id).toBe("e1");
    expect(projected.audioUrl).toBe("y.mp3");
    expect(projected.duration).toBe(30);
    expect(projected.title).toBe("T");
  });
  it("composerName de la parte, con fallback al del ejercicio", () => {
    const exercise = { id: "e1", composerName: "Bach" };
    expect(partToExercise(exercise, { id: "p1", composerName: "Mozart" }).composerName).toBe("Mozart");
    expect(partToExercise(exercise, { id: "p1" }).composerName).toBe("Bach");
  });
  it("con ejercicios actuales (una parte sintetizada), la proyección conserva los campos que leen las vistas", () => {
    // La parte sintetizada añade `points` (metadato de la parte, no leído por
    // ninguna vista existente) — "bit a bit igual" aplica a lo que las vistas
    // consumen, no a la igualdad estricta del objeto.
    const exercise = { id: "e1", title: "T", audioUrl: "x.mp3", duration: 40, answers: { c1: [1] } };
    const projected = partToExercise(exercise, partsOf(exercise)[0]);
    expect(projected).toMatchObject(exercise);
  });
});

describe("durationOf", () => {
  it("suma la duración de las partes", () => {
    const ex = { parts: [{ id: "a", duration: 30 }, { id: "b", duration: 45 }, { id: "c", duration: 20 }] };
    expect(durationOf(ex)).toBe(95);
  });
  it("con una sola parte sintetizada, es la duración del ejercicio", () => {
    expect(durationOf({ duration: 60 })).toBe(60);
  });
});

describe("questionsCountOf", () => {
  it("con una sola parte sintetizada, coincide con questions.length", () => {
    expect(questionsCountOf({ questions: [{ id: "q1" }, { id: "q2" }] })).toBe(2);
    expect(questionsCountOf({})).toBe(0);
  });
  it("multiparte: suma las preguntas de todas las partes", () => {
    const ex = { parts: [{ id: "a", questions: [{ id: "q1" }] }, { id: "b", questions: [{ id: "q2" }, { id: "q3" }] }] };
    expect(questionsCountOf(ex)).toBe(3);
  });
});

// M6: el ámbito explícito manda; sin él, se infiere de los tiempos, de modo que
// las preguntas antiguas conservan su comportamiento (con tiempos ⇒ fragmento).
describe("questionScopeOf", () => {
  it("respeta el campo `scope` explícito por encima de los tiempos", () => {
    expect(questionScopeOf({ id: "q", scope: "obra", audioStart: 3, audioEnd: 9 })).toBe("obra");
    expect(questionScopeOf({ id: "q", scope: "fragmento" })).toBe("fragmento");
  });
  it("sin `scope`, con audioStart Y audioEnd numéricos ⇒ fragmento (fixtures legadas)", () => {
    expect(questionScopeOf({ id: "q", audioStart: 4, audioEnd: 12 })).toBe("fragmento");
    expect(questionScopeOf({ id: "q", audioStart: 0, audioEnd: 8 })).toBe("fragmento");
  });
  it("sin `scope` y sin tiempos completos ⇒ obra", () => {
    expect(questionScopeOf({ id: "q" })).toBe("obra");
    expect(questionScopeOf({ id: "q", audioStart: 4 })).toBe("obra");
    expect(questionScopeOf({ id: "q", audioEnd: 12 })).toBe("obra");
  });
  it("tolera nulo/indefinido ⇒ obra (sin tiempos)", () => {
    expect(questionScopeOf(null)).toBe("obra");
    expect(questionScopeOf(undefined)).toBe("obra");
  });
});

describe("composersOf", () => {
  it("con una sola parte sintetizada, es [composerName] si lo hay", () => {
    expect(composersOf({ composerName: "Haydn" })).toEqual(["Haydn"]);
    expect(composersOf({})).toEqual([]);
  });
  it("multiparte: únicos, en orden de aparición", () => {
    const ex = { parts: [{ id: "a", composerName: "Haydn" }, { id: "b", composerName: "Bach" }, { id: "c", composerName: "Haydn" }] };
    expect(composersOf(ex)).toEqual(["Haydn", "Bach"]);
  });
  it("partes sin compositor no aportan huecos ni duplicados vacíos", () => {
    const ex = { parts: [{ id: "a" }, { id: "b", composerName: "Bach" }] };
    expect(composersOf(ex)).toEqual(["Bach"]);
  });
});

describe("keyReadyOf", () => {
  it("interactivo: lista si todas las categorías tienen respuesta", () => {
    const ex = { model: "interactivo", categories: [{ id: "c1", buttons: [] }], answers: { c1: [{ fn: "T", start: 0, end: 1 }] } };
    expect(keyReadyOf(ex)).toBe(true);
    expect(keyReadyOf({ model: "interactivo", categories: [{ id: "c1", buttons: [] }], answers: {} })).toBe(false);
  });
  it("cuestionario: lista si hay preguntas (aunque sea el modelo secundario de un combo)", () => {
    const ex = { models: ["esquema", "cuestionario"], schemaKey: [{ level: 1, start: 0, end: 1 }], questions: [{ id: "q1" }] };
    expect(keyReadyOf(ex)).toBe(true);
    expect(keyReadyOf({ ...ex, questions: [] })).toBe(false);
  });
  it("esquema: ya NO es siempre true — exige schemaKey no vacío", () => {
    expect(keyReadyOf({ model: "esquema", schemaKey: [] })).toBe(false);
    expect(keyReadyOf({ model: "esquema", schemaKey: [{ level: 1, start: 0, end: 1 }] })).toBe(true);
  });
  it("multiparte: exige que TODAS las partes tengan clave lista", () => {
    const ex = {
      model: "esquema",
      parts: [
        { id: "a", schemaKey: [{ level: 1, start: 0, end: 1 }] },
        { id: "b", schemaKey: [] },
      ],
    };
    expect(keyReadyOf(ex)).toBe(false);
  });
});

describe("updatePart", () => {
  it("fusiona el patch sobre la parte indicada, sin tocar las demás", () => {
    const ex = { id: "e1", parts: [{ id: "a", questions: [] }, { id: "b", questions: [] }] };
    const updated = updatePart(ex, "b", { questions: [{ id: "q1" }] });
    expect(updated.parts).toEqual([{ id: "a", questions: [] }, { id: "b", questions: [{ id: "q1" }] }]);
  });
  it("materializa `parts` a partir de partsOf() si el ejercicio no lo tenía", () => {
    const ex = { id: "e1", title: "T", audioUrl: "x.mp3", questions: [] };
    const updated = updatePart(ex, "p1", { questions: [{ id: "q1" }] });
    expect(updated.parts).toHaveLength(1);
    expect(updated.parts[0]).toMatchObject({ id: "p1", audioUrl: "x.mp3", questions: [{ id: "q1" }] });
  });
  it("no muta el ejercicio original", () => {
    const ex = { id: "e1", parts: [{ id: "a", questions: [] }] };
    updatePart(ex, "a", { questions: [{ id: "q1" }] });
    expect(ex.parts[0].questions).toEqual([]);
  });
});

describe("resultPartsOf", () => {
  it("resultado plano heredado se envuelve como una única parte con un único modelo", () => {
    const result = { type: "esquema", blocks: [], placementScore: 80 };
    expect(resultPartsOf(result)).toEqual({ p1: { byModel: { esquema: result } } });
  });
  it("resultado con `parts` (sobre compuesto) se devuelve tal cual", () => {
    const result = { type: "multi", parts: { a: { byModel: { interactivo: {} } } } };
    expect(resultPartsOf(result)).toBe(result.parts);
  });
  it("null/undefined → objeto vacío", () => {
    expect(resultPartsOf(null)).toEqual({});
    expect(resultPartsOf(undefined)).toEqual({});
  });
});

describe("audioComposers / audioTags", () => {
  const lib = [
    { composer: "Bach", tags: ["Barroco", "Fuga"] },
    { composer: "Mozart", tags: ["Clasicismo"] },
    { composer: "Bach", tags: ["Barroco"] },
    { composer: null, tags: [] },
  ];
  it("devuelven listas únicas y ordenadas", () => {
    expect(audioComposers(lib)).toEqual(["Bach", "Mozart"]);
    expect(audioTags(lib)).toEqual(["Barroco", "Clasicismo", "Fuga"]);
  });
  it("toleran entrada vacía o nula", () => {
    expect(audioComposers(null)).toEqual([]);
    expect(audioTags(undefined)).toEqual([]);
  });
});

describe("audioDisplayTitle", () => {
  const lib = [
    { id: "bk-1", kind: "book", title: "Preludios op. 28" },
    { id: "au-1", title: "n.º 4 en Mi menor", bookId: "bk-1", url: "u1" },
    { id: "au-2", title: "Tocata y fuga", url: "u2" },
    { id: "au-3", title: "Huérfano", bookId: "bk-borrado", url: "u3" },
  ];
  it("compone «pieza ~ libro» cuando el audio pertenece a un libro", () => {
    expect(audioDisplayTitle(lib[1], lib)).toBe("n.º 4 en Mi menor ~ Preludios op. 28");
  });
  it("sin libro, devuelve el título tal cual", () => {
    expect(audioDisplayTitle(lib[2], lib)).toBe("Tocata y fuga");
  });
  it("con bookId que no resuelve, devuelve solo el título", () => {
    expect(audioDisplayTitle(lib[3], lib)).toBe("Huérfano");
  });
  it("tolera audio nulo o sin título", () => {
    expect(audioDisplayTitle(null, lib)).toBe("");
    expect(audioDisplayTitle({ bookId: "bk-1" }, lib)).toBe("Preludios op. 28");
  });
});

describe("attemptsOf", () => {
  it("sin attempts, el propio result ES el único intento", () => {
    const r = { score: 80, type: "cuestionario" };
    expect(attemptsOf(r)).toEqual([r]);
  });
  it("con attempts, los devuelve tal cual", () => {
    const attempts = [{ score: 50 }, { score: 80 }];
    expect(attemptsOf({ score: 80, attempts })).toBe(attempts);
  });
  it("sin resultado, lista vacía", () => {
    expect(attemptsOf(null)).toEqual([]);
    expect(attemptsOf(undefined)).toEqual([]);
  });
});

describe("addAttempt", () => {
  it("primera entrega (sin existing previo): el intento ES el resultado, con attempts de 1", () => {
    const first = { type: "cuestionario", score: 70, status: "auto", timestamp: 100 };
    const result = addAttempt(null, first);
    expect(result.score).toBe(70);
    expect(result.attempts).toEqual([first]);
    expect(result.type).toBe("cuestionario"); // espejo del último intento
  });
  it("repetir: score pasa a ser el MEJOR de todos los intentos", () => {
    const firstResult = addAttempt(null, { type: "cuestionario", score: 60, status: "auto", timestamp: 100 });
    const second = { type: "cuestionario", score: 90, status: "auto", timestamp: 200 };
    const result = addAttempt(firstResult, second);
    expect(result.score).toBe(90); // el segundo es mejor
    expect(result.attempts.map((a) => a.score)).toEqual([60, 90]);

    // repetir de nuevo con una nota PEOR: el mejor histórico se conserva
    const third = { type: "cuestionario", score: 40, status: "auto", timestamp: 300 };
    const result2 = addAttempt(result, third);
    expect(result2.score).toBe(90); // sigue siendo el mejor, aunque el último sea peor
    expect(result2.attempts.map((a) => a.score)).toEqual([60, 90, 40]);
  });
  it("status y demás campos son un espejo del ÚLTIMO intento, no del mejor", () => {
    const firstResult = addAttempt(null, { type: "esquema", score: 90, status: "auto", blocks: [{ id: "a" }] });
    const second = { type: "esquema", score: 40, status: "pendiente", blocks: [{ id: "b" }] };
    const result = addAttempt(firstResult, second);
    expect(result.status).toBe("pendiente"); // del último, no "auto" del mejor
    expect(result.blocks).toEqual([{ id: "b" }]); // contenido del último intento
    expect(result.score).toBe(90); // pero la nota vigente sigue siendo la mejor
  });
  it("puntuaciones null no rompen el cálculo del mejor", () => {
    const firstResult = addAttempt(null, { type: "esquema", score: null, status: "pendiente" });
    const second = { type: "esquema", score: 85, status: "auto" };
    expect(addAttempt(firstResult, second).score).toBe(85);
  });
});

// M1.1: normalizeExercise hace, una vez en la frontera, el trabajo que hoy
// hacían categoriesOf/modelOf/questionsOf/partsOf en cada lectura dispersa —
// los componentes (M1.2) leen categories/models/questions/parts como campos
// directos, confiando en que ya vienen poblados.
describe("normalizeExercise", () => {
  it("puebla categories/models/questions/parts desde un ejercicio heredado (mode/model, sin questions ni parts)", () => {
    const legacy = { id: 1, title: "Legado", model: "interactivo", mode: { id: "leg", buttons: [] }, duration: 10 };
    const norm = normalizeExercise(legacy);
    expect(norm.categories).toEqual([{ id: "leg", buttons: [] }]);
    expect(norm.models).toEqual(["interactivo"]);
    expect(norm.questions).toEqual([]);
    expect(norm.parts).toHaveLength(1);
    expect(norm.parts[0].duration).toBe(10);
    expect(norm.parts[0].questions).toEqual([]); // nunca undefined
  });
  it("un ejercicio ya canónico se conserva tal cual (categories/models no se pisan)", () => {
    const cats = [{ id: "c1", buttons: [] }];
    const canon = { id: 2, categories: cats, models: ["esquema"], questions: [], parts: [] };
    const norm = normalizeExercise(canon);
    expect(norm.categories).toBe(cats); // misma referencia: no se reconstruye si ya está poblado
    expect(norm.models).toEqual(["esquema"]);
  });
  it("normaliza questions a array en cada parte de un multiparte real, aunque solo una la traiga", () => {
    const multi = {
      id: 3, model: "interactivo",
      parts: [
        { id: "p1", questions: [{ id: "q1" }] },
        { id: "p2" }, // nunca se le añadió una pregunta: sin la clave `questions`
      ],
    };
    const norm = normalizeExercise(multi);
    expect(norm.parts[0].questions).toEqual([{ id: "q1" }]);
    expect(norm.parts[1].questions).toEqual([]); // antes habría sido undefined
  });
  it("es idempotente: normalizar dos veces da el mismo resultado que una", () => {
    const legacy = { id: 4, model: "cuestionario", mode: { id: "leg2", buttons: [] }, questions: [{ id: "q1" }] };
    const once  = normalizeExercise(legacy);
    const twice = normalizeExercise(once);
    expect(twice).toEqual(once);
    expect(twice.categories).toBe(once.categories); // segunda pasada no reconstruye nada
    expect(twice.models).toBe(once.models);
    expect(twice.parts).toEqual(once.parts); // partsOf().map() siempre da un array nuevo; el contenido es igual
  });
});

// A2-01: ambos submits (ExerciseView, SessionShell) serializaban con un
// `map(({fn,start,end}) => ({fn,start,end}))` inline que descartaba `fig`
// (cifrado/inversión). Resultado: claves grabadas sin fig (diagnóstico de
// cifrado siempre null) y respuestas de alumno que perdían el suyo.
describe("serializeIntervals", () => {
  it("conserva fig cuando existe", () => {
    const ivs = [{ id: "x", fn: "T", start: 0, end: 2, fig: "6" }];
    expect(serializeIntervals(ivs)).toEqual([{ fn: "T", start: 0, end: 2, fig: "6" }]);
  });
  it("omite la clave fig cuando no existe (compatibilidad JSONB: sin fig:undefined explícito)", () => {
    const ivs = [{ id: "x", fn: "T", start: 0, end: 2 }];
    const [out] = serializeIntervals(ivs);
    expect(out).toEqual({ fn: "T", start: 0, end: 2 });
    expect("fig" in out).toBe(false);
  });
  it("integración: la serialización antigua rompía interactiveFigureDiagnostics; serializeIntervals lo arregla", () => {
    const raw = [{ id: "x", fn: "T", start: 0, end: 2, fig: "6" }];
    // Serialización antigua (inline, antes del fix de A2-01): descartaba `fig`.
    const legacySerialize = (list) => list.map(({ fn, start, end }) => ({ fn, start, end }));
    const brokenKey = legacySerialize(raw);
    const brokenStudent = legacySerialize(raw);
    expect(interactiveFigureDiagnostics(brokenKey, brokenStudent, 2)).toBeNull(); // el bug

    const key = serializeIntervals(raw);
    const student = serializeIntervals(raw);
    const diag = interactiveFigureDiagnostics(key, student, 2);
    expect(diag).not.toBeNull();
    expect(diag.evaluable).toBeGreaterThan(0);
  });
});

// A3-08: fa_categories se asigna cruda del JSONB — una fila sin `buttons` (o
// con `buttons` corrupto/no-array) no debe tirar abajo el render de sesión.
describe("btnOf", () => {
  it("encuentra el botón por id cuando existe", () => {
    const category = { buttons: [{ id: "T", name: "Tónica" }, { id: "D", name: "Dominante" }] };
    expect(btnOf(category, "D")).toEqual({ id: "D", name: "Dominante" });
  });
  it("cae al primer botón si el id no existe", () => {
    const category = { buttons: [{ id: "T", name: "Tónica" }] };
    expect(btnOf(category, "no-existe")).toEqual({ id: "T", name: "Tónica" });
  });
  it("categoría sin `buttons` no lanza (el bug)", () => {
    expect(() => btnOf({}, "T")).not.toThrow();
    expect(btnOf({}, "T")).toBeUndefined();
  });
  it("`buttons` no-array (JSONB corrupto) no lanza", () => {
    expect(() => btnOf({ buttons: "no-es-array" }, "T")).not.toThrow();
    expect(btnOf({ buttons: null }, "T")).toBeUndefined();
  });
});
