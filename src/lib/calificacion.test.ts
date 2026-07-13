import { describe, it, expect } from "vitest";
import {
  ponderar, pesosDeCurso, pesosDeUnidad, nivelesDe, modelosDe,
  etiquetaCuentaDe, equivalenciasDe, instrumentoDe,
} from "./calificacion.js";

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

describe("pesosDeCurso / pesosDeUnidad", () => {
  it("sin sobre evaluacion, todos pesan 1 (equitativa)", () => {
    expect(pesosDeCurso(undefined, ["u1", "u2", "u3"])).toEqual([
      { id: "u1", peso: 1 }, { id: "u2", peso: 1 }, { id: "u3", peso: 1 },
    ]);
    expect(pesosDeUnidad({}, ["e1", "e2"])).toEqual([{ id: "e1", peso: 1 }, { id: "e2", peso: 1 }]);
  });
  it("modo equitativa explícito ignora pesos personalizados", () => {
    const course = { evaluacion: { modo: "equitativa" as const, pesos: { u1: 5 } } };
    expect(pesosDeCurso(course, ["u1", "u2"])).toEqual([{ id: "u1", peso: 1 }, { id: "u2", peso: 1 }]);
  });
  it("modo personalizada usa los pesos dados y 1 por defecto para los que faltan", () => {
    const course = { evaluacion: { modo: "personalizada" as const, pesos: { u1: 20, u2: 30 } } };
    expect(pesosDeCurso(course, ["u1", "u2", "u3"])).toEqual([
      { id: "u1", peso: 20 }, { id: "u2", peso: 30 }, { id: "u3", peso: 1 },
    ]);
  });
});

describe("nivelesDe", () => {
  it("sin sobre evaluacion, defecto {grados: 1} (comportamiento actual)", () => {
    expect(nivelesDe(undefined)).toEqual({ grados: 1 });
    expect(nivelesDe({ evaluacion: {} })).toEqual({ grados: 1 });
  });
  it("con cifrado configurado, devuelve ambos niveles", () => {
    expect(nivelesDe({ evaluacion: { niveles: { grados: 70, cifrado: 30 } } })).toEqual({ grados: 70, cifrado: 30 });
  });
});

describe("modelosDe / etiquetaCuentaDe / equivalenciasDe / instrumentoDe — defectos tolerantes", () => {
  it("sin sobre evaluacion: modelos {}, etiquetaCuenta false, equivalencias [], instrumento undefined", () => {
    expect(modelosDe(undefined)).toEqual({});
    expect(etiquetaCuentaDe(undefined)).toBe(false);
    expect(equivalenciasDe(undefined)).toEqual([]);
    expect(instrumentoDe(undefined)).toBeUndefined();
  });
  it("instrumentoDe funciona igual para un ejercicio y para una pregunta", () => {
    const instr = { tipo: "lista" as const, niveles: [], items: [] };
    expect(instrumentoDe({ evaluacion: { instrumento: instr } })).toBe(instr);
  });
});
