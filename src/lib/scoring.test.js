import { describe, it, expect } from "vitest";
import {
  getAt, resolveOverlap, calcScore, calcQuestionnaireScore, calcSchemaPlacementScore,
} from "./scoring.js";

// Tests de caracterización: fijan el comportamiento ACTUAL para detectar
// regresiones en fases posteriores (no describen el comportamiento "ideal").

describe("getAt", () => {
  const ivs = [{ fn: "T", start: 0, end: 4 }, { fn: "D", start: 4, end: 8 }];
  it("devuelve la función en el intervalo [start, end)", () => {
    expect(getAt(ivs, 0)).toBe("T");
    expect(getAt(ivs, 3.99)).toBe("T");
    expect(getAt(ivs, 4)).toBe("D");   // start es inclusivo
    expect(getAt(ivs, 7.99)).toBe("D");
  });
  it("end es exclusivo y fuera de rango devuelve null", () => {
    expect(getAt(ivs, 8)).toBeNull();
    expect(getAt(ivs, -1)).toBeNull();
    expect(getAt([], 1)).toBeNull();
  });
});

describe("resolveOverlap", () => {
  it("deja intactos los intervalos que no solapan", () => {
    const ex = [{ fn: "T", start: 0, end: 2 }];
    expect(resolveOverlap(ex, { start: 4, end: 6 })).toEqual(ex);
  });
  it("recorta por la izquierda y por la derecha", () => {
    const ex = [{ fn: "T", start: 0, end: 10 }];
    expect(resolveOverlap(ex, { start: 3, end: 6 })).toEqual([
      { fn: "T", start: 0, end: 3 },
      { fn: "T", start: 6, end: 10 },
    ]);
  });
  it("elimina por completo un intervalo contenido en el nuevo", () => {
    const ex = [{ fn: "T", start: 4, end: 6 }];
    expect(resolveOverlap(ex, { start: 0, end: 10 })).toEqual([]);
  });
});

describe("calcScore", () => {
  it("devuelve null si el profesor no marcó nada", () => {
    expect(calcScore([], [], 10)).toBeNull();
  });
  it("coincidencia total → 100", () => {
    const t = [{ fn: "T", start: 0, end: 10 }];
    expect(calcScore(t, t, 10, 1)).toBe(100);
  });
  it("ninguna coincidencia con margen 0 → 0 (no null)", () => {
    const t = [{ fn: "T", start: 0, end: 10 }];
    const s = [{ fn: "S", start: 0, end: 10 }];
    expect(calcScore(t, s, 10, 0)).toBe(0);
  });
  it("el resultado es un entero dentro de [0, 100]", () => {
    const t = [{ fn: "T", start: 0, end: 5 }, { fn: "D", start: 5, end: 10 }];
    const s = [{ fn: "T", start: 0, end: 4 }, { fn: "D", start: 6, end: 10 }];
    const sc = calcScore(t, s, 10, 1);
    expect(Number.isInteger(sc)).toBe(true);
    expect(sc).toBeGreaterThanOrEqual(0);
    expect(sc).toBeLessThanOrEqual(100);
  });
  it("un margen mayor no puede bajar la puntuación", () => {
    const t = [{ fn: "T", start: 0, end: 4 }];
    const s = [{ fn: "T", start: 2, end: 6 }];
    expect(calcScore(t, s, 8, 2)).toBeGreaterThanOrEqual(calcScore(t, s, 8, 0));
  });
});

describe("calcQuestionnaireScore", () => {
  const q = (id, correct) => ({ id, type: "test", correctOptionId: correct });
  it("null si no hay preguntas tipo test con respuesta correcta", () => {
    expect(calcQuestionnaireScore([], {})).toBeNull();
    expect(calcQuestionnaireScore([{ id: "x", type: "desarrollo" }], {})).toBeNull();
  });
  it("todas correctas → 100", () => {
    const qs = [q("a", "A"), q("b", "B")];
    expect(calcQuestionnaireScore(qs, { a: "A", b: "B" })).toBe(100);
  });
  it("ninguna correcta → 0", () => {
    const qs = [q("a", "A"), q("b", "B")];
    expect(calcQuestionnaireScore(qs, { a: "X", b: "Y" })).toBe(0);
  });
  it("mezcla → porcentaje redondeado", () => {
    const qs = [q("a", "A"), q("b", "B")];
    expect(calcQuestionnaireScore(qs, { a: "A", b: "Y" })).toBe(50);
    const qs3 = [q("a", "A"), q("b", "B"), q("c", "C")];
    expect(calcQuestionnaireScore(qs3, { a: "A", b: "B", c: "X" })).toBe(67); // 66.66 → 67
  });
});

describe("calcSchemaPlacementScore", () => {
  const kb = [{ level: 1, start: 0, end: 4 }, { level: 2, start: 4, end: 8 }];
  it("null si no hay bloques clave", () => {
    expect(calcSchemaPlacementScore([], [], 3)).toBeNull();
    expect(calcSchemaPlacementScore(null, [], 3)).toBeNull();
  });
  it("bloques exactos → 100", () => {
    expect(calcSchemaPlacementScore(kb, kb, 3)).toBe(100);
  });
  it("desplazados dentro del margen cuentan", () => {
    const sb = [{ level: 1, start: 2, end: 6 }, { level: 2, start: 6, end: 10 }];
    expect(calcSchemaPlacementScore(kb, sb, 3)).toBe(100);
  });
  it("fuera del margen no cuentan", () => {
    const sb = [{ level: 1, start: 20, end: 24 }, { level: 2, start: 24, end: 28 }];
    expect(calcSchemaPlacementScore(kb, sb, 3)).toBe(0);
  });
  it("distinto nivel no empareja", () => {
    const sb = [{ level: 3, start: 0, end: 4 }, { level: 4, start: 4, end: 8 }];
    expect(calcSchemaPlacementScore(kb, sb, 3)).toBe(0);
  });
});
