import { describe, it, expect } from "vitest";
import { isTransitionLabel } from "./schema.js";

describe("isTransitionLabel", () => {
  it("casa las cuatro palabras exactas, sin importar mayúsculas", () => {
    for (const w of ["puente", "Puente", "PUENTE", "enlace", "Enlace", "transicion", "Transicion", "retransicion", "Retransicion"]) {
      expect(isTransitionLabel(w)).toBe(true);
    }
  });

  it("normaliza tildes: «Transición» ≡ «transicion», «Retransición» ≡ «retransicion»", () => {
    expect(isTransitionLabel("Transición")).toBe(true);
    expect(isTransitionLabel("transición")).toBe(true);
    expect(isTransitionLabel("Retransición")).toBe(true);
    expect(isTransitionLabel("retransición")).toBe(true);
  });

  it("casa como PRIMERA palabra de una etiqueta compuesta", () => {
    expect(isTransitionLabel("puente 2")).toBe(true);
    expect(isTransitionLabel("Enlace armónico")).toBe(true);
    expect(isTransitionLabel("transición central")).toBe(true);
    expect(isTransitionLabel("  puente  ")).toBe(true); // espacios sobrantes
  });

  it("NO casa cuando la palabra clave no es la primera, ni etiquetas normales", () => {
    expect(isTransitionLabel("A")).toBe(false);
    expect(isTransitionLabel("a'")).toBe(false);
    expect(isTransitionLabel("Do M")).toBe(false);
    expect(isTransitionLabel("el puente")).toBe(false);   // «puente» no es la primera palabra
    expect(isTransitionLabel("puentear")).toBe(false);    // otra palabra, no «puente»
    expect(isTransitionLabel("interludio")).toBe(false);
  });

  it("es tolerante con nulos y cadena vacía", () => {
    expect(isTransitionLabel(undefined)).toBe(false);
    expect(isTransitionLabel(null)).toBe(false);
    expect(isTransitionLabel("")).toBe(false);
    expect(isTransitionLabel("   ")).toBe(false);
  });
});
