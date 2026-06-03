import { describe, it, expect } from "vitest";
import { _hexToHsl, _hslToHex, lightenColor, textOn } from "./color.js";

const channels = (hex) => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

describe("textOn", () => {
  it("oscurece el color al 18% en formato rgb()", () => {
    expect(textOn("#ffffff")).toBe("rgb(46,46,46)"); // 255*0.18 ≈ 46
    expect(textOn("#000000")).toBe("rgb(0,0,0)");
  });
  it("devuelve negro para entradas sin '#'", () => {
    expect(textOn(null)).toBe("#000");
    expect(textOn("rgb(1,2,3)")).toBe("#000");
  });
});

describe("lightenColor", () => {
  it("produce un hex válido y no se sale de los límites de luminancia", () => {
    const out = lightenColor("#808080", 18, -8);
    expect(out).toMatch(/^#[0-9a-f]{6}$/);
    const [, , l] = _hexToHsl(out);
    expect(l).toBeGreaterThanOrEqual(0);
    expect(l).toBeLessThanOrEqual(100);
  });
  it("aclara: la luminancia resultante es mayor o igual a la original", () => {
    const [, , l0] = _hexToHsl("#3F9B5B");
    const [, , l1] = _hexToHsl(lightenColor("#3F9B5B", 18, -8));
    expect(l1).toBeGreaterThanOrEqual(l0);
  });
  it("satura en 100 sin desbordar", () => {
    const out = lightenColor("#FFFFFF", 50, 50);
    expect(out).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe("_hexToHsl / _hslToHex (ida y vuelta aproximada)", () => {
  it("recupera el color original dentro de ±2 por canal", () => {
    for (const hex of ["#3f9b5b", "#2f6fb8", "#c77a1a", "#808080"]) {
      const [h, s, l] = _hexToHsl(hex);
      const back = _hslToHex(h, s, l);
      const a = channels(hex);
      const b = channels(back);
      for (let i = 0; i < 3; i++) expect(Math.abs(a[i] - b[i])).toBeLessThanOrEqual(2);
    }
  });
});
