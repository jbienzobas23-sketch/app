import { describe, it, expect } from "vitest";
import { INIT_EXERCISES, DEFAULT_CATEGORY } from "./seed.js";
import { partsOf, durationOf, composersOf, keyReadyOf } from "./lib/domain.js";

// Ejercicio demo multiparte (F4, T4.5) — el caso canónico del plan: tres
// cadencias, tres audios, tres compositores, una sola entrega. Estos tests
// verifican que se lee igual que cualquier otro multiparte, a través de los
// mismos lectores tolerantes que usan las listas y la sesión del alumno.
describe("seed — ejercicio demo multiparte (Tres cadencias comparadas)", () => {
  const ex = INIT_EXERCISES.find((e) => e.title === "Tres cadencias comparadas");

  it("existe y tiene 3 partes", () => {
    expect(ex).toBeTruthy();
    expect(partsOf(ex).length).toBe(3);
  });

  it("durationOf suma la duración de las 3 partes", () => {
    expect(durationOf(ex)).toBe(14 + 12 + 16);
  });

  it("composersOf devuelve los 3 compositores, únicos y en orden", () => {
    expect(composersOf(ex)).toEqual(["Haydn", "Bach", "Beethoven"]);
  });

  it("keyReadyOf: las 3 partes tienen clave interactiva completa", () => {
    expect(keyReadyOf(ex)).toBe(true);
  });

  it("cada parte usa la categoría por defecto del ejercicio", () => {
    for (const part of partsOf(ex)) {
      expect(part.answers?.[DEFAULT_CATEGORY.id]?.length).toBeGreaterThan(0);
    }
  });
});
