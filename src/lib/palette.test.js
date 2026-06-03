import { describe, it, expect } from "vitest";
import {
  partSlotIndex, phraseSlotIndex, effectivePaletteId, applyPaletteToExercise,
  SCHEMA_PALETTE_DEFAULT,
} from "./palette.js";

describe("partSlotIndex", () => {
  it("mapea funciones formales y letras a la ranura A/B/C/D", () => {
    expect(partSlotIndex("Exposición")).toBe(0);
    expect(partSlotIndex("Reexposición")).toBe(0);
    expect(partSlotIndex("Desarrollo")).toBe(1);
    expect(partSlotIndex("A")).toBe(0);
    expect(partSlotIndex("B")).toBe(1);
    expect(partSlotIndex("E")).toBe(0); // (101-97) % 4 = 0
  });
  it("devuelve null para secciones neutras", () => {
    expect(partSlotIndex("Intro")).toBeNull();
    expect(partSlotIndex("Coda")).toBeNull();
    expect(partSlotIndex("Puente")).toBeNull();
  });
});

describe("phraseSlotIndex", () => {
  it("mapea la letra de frase a su índice sin envolver", () => {
    expect(phraseSlotIndex("a")).toBe(0);
    expect(phraseSlotIndex("b")).toBe(1);
    expect(phraseSlotIndex("c")).toBe(2);
    expect(phraseSlotIndex("e")).toBe(4);
  });
  it("null cuando no es una etiqueta de una sola letra", () => {
    expect(phraseSlotIndex("Intro")).toBeNull();
    expect(phraseSlotIndex("")).toBeNull();
  });
});

describe("effectivePaletteId", () => {
  it("prioriza la paleta del ejercicio sobre la del usuario", () => {
    expect(effectivePaletteId({ schemaPalette: "p3" }, "p2")).toBe("p3");
  });
  it("usa la preferencia del usuario si el ejercicio no define paleta", () => {
    expect(effectivePaletteId({}, "p2")).toBe("p2");
    expect(effectivePaletteId(null, "p2")).toBe("p2");
  });
  it("cae a la paleta por defecto si no hay ninguna", () => {
    expect(effectivePaletteId(null, null)).toBe(SCHEMA_PALETTE_DEFAULT);
    expect(effectivePaletteId({}, undefined)).toBe(SCHEMA_PALETTE_DEFAULT);
  });
});

describe("applyPaletteToExercise", () => {
  it("no muta el ejercicio original y recolorea una copia", () => {
    const ex = {
      schemaPalette: "p5",
      categories: [{ id: "c1", buttons: [{ id: "b1", color: "#000000" }] }],
    };
    const snapshot = JSON.parse(JSON.stringify(ex));
    const next = applyPaletteToExercise(ex, "p1");

    expect(ex).toEqual(snapshot);            // original intacto
    expect(next).not.toBe(ex);               // copia nueva
    expect(next.schemaPalette).toBe("p1");
    expect(next.categories[0].buttons[0].color).not.toBe("#000000");
  });
  it("devuelve el valor tal cual si no hay ejercicio", () => {
    expect(applyPaletteToExercise(null, "p1")).toBeNull();
  });
});
