import { describe, it, expect } from "vitest";
import {
  categoriesOf, modelOf, modelsOf, answerFor, comboIdFromModels,
  audioComposers, audioTags,
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
