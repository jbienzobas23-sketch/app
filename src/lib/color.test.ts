import { describe, it, expect } from "vitest";
import { markOnLight, _hexToHsl } from "./color.js";

describe("markOnLight", () => {
  it("oscurece un color demasiado claro hasta el techo de luminosidad", () => {
    // Gris claro de Partes (#9CA0AC, L≈68) → por debajo del techo (44).
    const out = markOnLight("#9CA0AC");
    const [, , l] = _hexToHsl(out);
    expect(l).toBeLessThanOrEqual(45);
    expect(out).not.toBe("#9CA0AC");
  });

  it("deja intacto un color que ya es suficientemente oscuro", () => {
    // Un color ya oscuro (L < 44) no se toca.
    expect(markOnLight("#3a2f1a")).toBe("#3a2f1a");
  });

  it("conserva el tono al oscurecer (no vira de color)", () => {
    const [h0] = _hexToHsl("#D98A7A"); // salmón
    const [h1] = _hexToHsl(markOnLight("#D98A7A"));
    expect(Math.abs(h1 - h0)).toBeLessThan(2);
  });

  it("devuelve sin tocar lo que no es un hex #rrggbb", () => {
    expect(markOnLight("rgba(0,0,0,0.5)")).toBe("rgba(0,0,0,0.5)");
    expect(markOnLight("transparent")).toBe("transparent");
  });
});
