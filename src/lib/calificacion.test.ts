import { describe, it, expect } from "vitest";
import {
  ponderar, pesosDeCurso, pesosDeUnidad, nivelesDe, modelosDe,
  etiquetaCuentaDe, equivalenciasDe, instrumentoDe, notaInstrumento,
  matchSchemaBlocks, etiquetaEquivalente, calcSchemaScore,
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

describe("notaInstrumento", () => {
  it("lista de control (Sí=1/No=0), pesos distintos", () => {
    const lista = {
      tipo: "lista" as const,
      niveles: [{ id: "si", etiqueta: "Sí", valor: 1 }, { id: "no", etiqueta: "No", valor: 0 }],
      items: [
        { id: "i1", texto: "Afina bien", peso: 1 },
        { id: "i2", texto: "Marca el pulso", peso: 1 },
        { id: "i3", texto: "Lee la clave", peso: 2 },
      ],
    };
    // (100*1 + 0*1 + 100*2) / 4 = 75
    expect(notaInstrumento(lista, { i1: "si", i2: "no", i3: "si" })).toBe(75);
  });

  it("escala estimativa de 3 niveles (reproduce el ejemplo del mockup)", () => {
    const escala = {
      tipo: "escala" as const,
      niveles: [{ id: "insuf", etiqueta: "Insuficiente", valor: 0 }, { id: "adec", etiqueta: "Adecuado", valor: 0.5 }, { id: "not", etiqueta: "Notable", valor: 1 }],
      items: [
        { id: "tonalidades", texto: "Identifica tonalidades", peso: 40 },
        { id: "pivote", texto: "Justifica el pivote", peso: 40 },
        { id: "nomenclatura", texto: "Nomenclatura", peso: 20 },
      ],
    };
    // sel = [Notable, Adecuado, Notable] → (100*40 + 50*40 + 100*20) / 100 = 80
    expect(notaInstrumento(escala, { tonalidades: "not", pivote: "adec", nomenclatura: "not" })).toBe(80);
  });

  it("rúbrica: los descriptores por celda son solo texto, no afectan al cálculo", () => {
    const rubrica = {
      tipo: "rubrica" as const,
      niveles: [{ id: "l0", etiqueta: "Insuficiente", valor: 0 }, { id: "l1", etiqueta: "Notable", valor: 1 }],
      items: [{ id: "i1", texto: "Justificación", peso: 1, descriptores: { l0: "Ausente", l1: "Completa" } }],
    };
    expect(notaInstrumento(rubrica, { i1: "l1" })).toBe(100);
  });

  it("un ítem sin responder no penaliza: queda fuera de la ponderación", () => {
    const instr = {
      tipo: "lista" as const,
      niveles: [{ id: "a", etiqueta: "Sí", valor: 1 }, { id: "b", etiqueta: "No", valor: 0 }],
      items: [{ id: "i1", texto: "x", peso: 1 }, { id: "i2", texto: "y", peso: 1 }],
    };
    expect(notaInstrumento(instr, { i1: "a" })).toBe(100);
  });

  it("sin instrumento o sin ítems → null", () => {
    expect(notaInstrumento(undefined, {})).toBeNull();
    expect(notaInstrumento({ tipo: "lista", niveles: [], items: [] }, {})).toBeNull();
  });
});

describe("matchSchemaBlocks", () => {
  const key = [
    { id: "k1", level: 1, start: 0, end: 10, label: "A" },
    { id: "k2", level: 1, start: 10, end: 20, label: "B" },
  ];
  it("empareja por nivel y cercanía dentro del margen, sin reutilizar un bloque dos veces", () => {
    const student = [{ level: 1, start: 11, end: 21, label: "b" }, { level: 1, start: 1, end: 9, label: "a" }];
    const { matches, sobrantes } = matchSchemaBlocks(key, student, 3);
    expect(matches[0].student?.label).toBe("a");
    expect(matches[1].student?.label).toBe("b");
    expect(sobrantes).toEqual([]);
  });
  it("sin bloque del alumno dentro de margen: student null y el sobrante no se consume", () => {
    const student = [{ level: 1, start: 50, end: 60, label: "x" }];
    const { matches, sobrantes } = matchSchemaBlocks(key, student, 3);
    expect(matches[0].student).toBeNull();
    expect(matches[1].student).toBeNull();
    expect(sobrantes).toEqual(student);
  });
});

describe("etiquetaEquivalente", () => {
  it("«B» ≡ «Desarrollo» ≡ «desarrollo» en el nivel de partes (ranura + tildes/mayúsculas)", () => {
    expect(etiquetaEquivalente(1, "B", "Desarrollo")).toBe(true);
    expect(etiquetaEquivalente(1, "Desarrollo", "desarrollo")).toBe(true);
    expect(etiquetaEquivalente(1, "B", "desarrollo")).toBe(true);
  });
  it("etiquetas neutras sin ranura común necesitan un grupo de equivalencia explícito", () => {
    expect(etiquetaEquivalente(1, "Puente", "Transición")).toBe(false);
    expect(etiquetaEquivalente(1, "Puente", "Transición", [["Puente", "Transición"]])).toBe(true);
  });
  it("sin coincidencia de ranura ni grupo, no son equivalentes", () => {
    expect(etiquetaEquivalente(1, "A", "C")).toBe(false);
  });
});

describe("calcSchemaScore", () => {
  const key = [
    { id: "k1", level: 1, start: 0, end: 10, label: "A" },
    { id: "k2", level: 1, start: 10, end: 20, label: "B" },
  ];
  it("etiquetaCuenta=false (defecto): solo cuenta la colocación, igual que calcSchemaPlacementScore", () => {
    const student = [{ level: 1, start: 0, end: 10, label: "cualquier cosa" }, { level: 1, start: 10, end: 20, label: "otra" }];
    expect(calcSchemaScore(key, student, 3)).toBe(100);
  });
  it("etiquetaCuenta=true: colocación correcta con etiqueta no equivalente no cuenta", () => {
    const student = [{ level: 1, start: 0, end: 10, label: "Z" }, { level: 1, start: 10, end: 20, label: "Desarrollo" }];
    // k1 "A" vs "Z": no equivalente; k2 "B" vs "Desarrollo": sí (ranura 1) → 1/2
    expect(calcSchemaScore(key, student, 3, { etiquetaCuenta: true })).toBe(50);
  });
  it("etiquetaCuenta=true con equivalencias personalizadas", () => {
    const keyPuente = [{ id: "k1", level: 1, start: 0, end: 10, label: "Puente" }];
    const student = [{ level: 1, start: 0, end: 10, label: "Transición" }];
    expect(calcSchemaScore(keyPuente, student, 3, { etiquetaCuenta: true })).toBe(0);
    expect(calcSchemaScore(keyPuente, student, 3, { etiquetaCuenta: true, equivalencias: [["Puente", "Transición"]] })).toBe(100);
  });
  it("bloque fuera de margen no cuenta aunque la etiqueta sea idéntica", () => {
    const student = [{ level: 1, start: 100, end: 110, label: "A" }];
    expect(calcSchemaScore([key[0]], student, 3)).toBe(0);
  });
  it("sin bloques de clave → null", () => {
    expect(calcSchemaScore([], [], 3)).toBeNull();
    expect(calcSchemaScore(null, [], 3)).toBeNull();
  });
});
