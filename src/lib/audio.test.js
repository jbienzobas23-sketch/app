import { describe, it, expect } from "vitest";
import {
  smoothArray, buildWaveformFromPCM, buildFragmentWaveform, generateWaveform,
} from "./audio.js";

describe("smoothArray", () => {
  it("conserva la longitud del array", () => {
    expect(smoothArray([1, 2, 3, 4, 5], 2)).toHaveLength(5);
  });
  it("un array constante permanece constante (media móvil)", () => {
    expect(smoothArray([1, 1, 1, 1], 1)).toEqual([1, 1, 1, 1]);
  });
});

describe("generateWaveform", () => {
  it("es determinista por semilla", () => {
    expect(generateWaveform(42, 64)).toEqual(generateWaveform(42, 64));
  });
  it("respeta la longitud y el rango [0.08, 1]", () => {
    const w = generateWaveform(7, 200);
    expect(w).toHaveLength(200);
    for (const v of w) {
      expect(v).toBeGreaterThanOrEqual(0.08 - 1e-9);
      expect(v).toBeLessThanOrEqual(1 + 1e-9);
    }
  });
  it("semillas distintas dan formas distintas", () => {
    expect(generateWaveform(1, 32)).not.toEqual(generateWaveform(2, 32));
  });
});

describe("buildWaveformFromPCM", () => {
  it("produce al menos 400 muestras dentro del rango [0.08, 1]", () => {
    const pcm = Array.from({ length: 2000 }, (_, i) => Math.sin(i / 10));
    const w = buildWaveformFromPCM(pcm, 10);
    expect(w.length).toBeGreaterThanOrEqual(400);
    for (const v of w) {
      expect(v).toBeGreaterThanOrEqual(0.08 - 1e-9);
      expect(v).toBeLessThanOrEqual(1 + 1e-9);
    }
  });
});

describe("buildFragmentWaveform", () => {
  const pcm = Array.from({ length: 2000 }, (_, i) => Math.sin(i / 10));
  it("con el rango completo equivale a la waveform total", () => {
    expect(buildFragmentWaveform(pcm, 10, 0, 10)).toEqual(buildWaveformFromPCM(pcm, 10));
  });
  it("un fragmento interior sigue dentro de los límites válidos", () => {
    const w = buildFragmentWaveform(pcm, 10, 2, 4);
    expect(w.length).toBeGreaterThanOrEqual(400);
    for (const v of w) {
      expect(v).toBeGreaterThanOrEqual(0.08 - 1e-9);
      expect(v).toBeLessThanOrEqual(1 + 1e-9);
    }
  });
});
