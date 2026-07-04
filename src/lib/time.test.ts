import { describe, it, expect } from "vitest";
import { fmtClock, fmtPrecise } from "./time.js";

// M3.1: dos formatos de reloj con nombres que dicen su precisión. Fijan el
// comportamiento heredado del antiguo fmt (lib/ids) y fmtP (session.tsx).
describe("fmtClock (M:SS)", () => {
  it("segundos sueltos con cero a la izquierda", () => {
    expect(fmtClock(0)).toBe("0:00");
    expect(fmtClock(5)).toBe("0:05");
    expect(fmtClock(42)).toBe("0:42");
  });
  it("minutos y segundos", () => {
    expect(fmtClock(60)).toBe("1:00");
    expect(fmtClock(75)).toBe("1:15");
    expect(fmtClock(605)).toBe("10:05");
  });
  it("trunca las fracciones de segundo (no redondea hacia arriba)", () => {
    expect(fmtClock(12.9)).toBe("0:12");
  });
});

describe("fmtPrecise (M:SS.d)", () => {
  it("un decimal, con cero a la izquierda en los segundos", () => {
    expect(fmtPrecise(0)).toBe("0:00.0");
    expect(fmtPrecise(3)).toBe("0:03.0");
    expect(fmtPrecise(12.4)).toBe("0:12.4");
  });
  it("minutos con décimas", () => {
    expect(fmtPrecise(65.5)).toBe("1:05.5");
  });
  it("redondea a la décima más cercana (toFixed)", () => {
    expect(fmtPrecise(9.26)).toBe("0:09.3");
  });
});
