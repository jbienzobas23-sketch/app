import { describe, it, expect } from "vitest";
import { ponderar } from "./calificacion.js";

describe("ponderar", () => {
  it("con pesos iguales coincide con la media aritmética simple", () => {
    expect(ponderar([{ nota: 60, peso: 1 }, { nota: 80, peso: 1 }, { nota: 100, peso: 1 }])).toBe(80);
  });
  it("pondera según el peso de cada entrada", () => {
    // 80*3 + 60*1 = 300 → 300/4 = 75
    expect(ponderar([{ nota: 80, peso: 3 }, { nota: 60, peso: 1 }])).toBe(75);
  });
  it("peso 0 excluye la entrada del resultado", () => {
    expect(ponderar([{ nota: 80, peso: 1 }, { nota: 0, peso: 0 }])).toBe(80);
  });
  it("las notas null no cuentan en el numerador ni en el denominador", () => {
    expect(ponderar([{ nota: 80, peso: 1 }, { nota: null, peso: 5 }])).toBe(80);
  });
  it("array vacío o todo null → null", () => {
    expect(ponderar([])).toBeNull();
    expect(ponderar([{ nota: null, peso: 1 }, { nota: null, peso: 2 }])).toBeNull();
  });
  it("redondea al entero más cercano", () => {
    // 70*1 + 71*1 = 141 → 70.5 → 71 (Math.round)
    expect(ponderar([{ nota: 70, peso: 1 }, { nota: 71, peso: 1 }])).toBe(71);
  });
});
