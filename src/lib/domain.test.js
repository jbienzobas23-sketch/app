import { describe, it, expect } from "vitest";
import {
  categoriesOf, modelOf, modelsOf, answerFor, comboIdFromModels,
  audioComposers, audioTags, courseUnitList, unitExList, resultStatusOf,
  partsOf, partToExercise, durationOf, keyReadyOf, resultPartsOf, questionsCountOf, updatePart, composersOf,
} from "./domain.js";
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
