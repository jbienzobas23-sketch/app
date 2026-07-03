import { describe, it, expect } from "vitest";
import { DEFAULT_MARGIN, DEFAULT_SCHEMA_MARGIN } from "./sessionConstants.js";

// M0.5: el margen ya no es configurable de forma global (fa_settings/
// SettingsTab) — estas constantes son la única fuente del valor por defecto
// para ejercicios nuevos o sin margen propio guardado. Fijamos aquí el valor
// esperado para detectar cambios accidentales.
describe("márgenes por defecto (M0.5)", () => {
  it("DEFAULT_MARGIN es 1s (modelo interactivo)", () => {
    expect(DEFAULT_MARGIN).toBe(1);
  });
  it("DEFAULT_SCHEMA_MARGIN es 3s fijo, sin fórmula por duración", () => {
    expect(DEFAULT_SCHEMA_MARGIN).toBe(3);
  });
});
