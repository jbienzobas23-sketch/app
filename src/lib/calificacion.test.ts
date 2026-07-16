import { describe, it, expect } from "vitest";
import {
  ponderar, pesosDeCurso, pesosDeUnidad, nivelesDe, modelosDe,
  etiquetaCuentaDe, equivalenciasDe, instrumentoDe, notaInstrumento, notaNiveles,
  matchSchemaBlocks, etiquetaEquivalente, calcSchemaScore, coberturaLibre, mediaDe,
  nuevoInstrumento, cambiaTipoInstrumento, NIVELES_LISTA, NIVELES_ESCALA_DEFECTO,
  fundeComentarios, mapaDeComentarios, tramosDeComentarios, comentarioGeneralDe,
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

describe("notaNiveles", () => {
  it("con el defecto {grados: 1} es exactamente la nota de grados", () => {
    expect(notaNiveles({ grados: 73, cifrado: 20 }, { grados: 1 })).toBe(73);
  });
  it("pondera grados y cifrado según sus pesos (70/30)", () => {
    // 80*70 + 50*30 = 7100 → /100 = 71
    expect(notaNiveles({ grados: 80, cifrado: 50 }, { grados: 70, cifrado: 30 })).toBe(71);
  });
  it("cifrado con peso pero sin nota (clave sin fig) no penaliza: queda fuera", () => {
    expect(notaNiveles({ grados: 80, cifrado: null }, { grados: 70, cifrado: 30 })).toBe(80);
  });
  it("sin ninguna nota → null (el libre sin clave)", () => {
    expect(notaNiveles({ grados: null, cifrado: null }, { grados: 70, cifrado: 30 })).toBeNull();
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

describe("nuevoInstrumento / cambiaTipoInstrumento (N3.1)", () => {
  it("lista nueva: niveles fijos Sí=1/No=0 y un ítem vacío de peso 1", () => {
    const instr = nuevoInstrumento("lista");
    expect(instr.niveles).toEqual(NIVELES_LISTA);
    expect(instr.items).toHaveLength(1);
    expect(instr.items[0]).toMatchObject({ texto: "", peso: 1 });
  });
  it("escala y rúbrica nuevas arrancan con los tres niveles del mockup", () => {
    expect(nuevoInstrumento("escala").niveles).toEqual(NIVELES_ESCALA_DEFECTO);
    expect(nuevoInstrumento("rubrica").niveles).toEqual(NIVELES_ESCALA_DEFECTO);
  });
  it("los niveles de la factoría son copias: mutarlos no toca las plantillas", () => {
    const instr = nuevoInstrumento("lista");
    instr.niveles[0].etiqueta = "Mutado";
    expect(NIVELES_LISTA[0].etiqueta).toBe("Sí");
  });
  it("cambiar de tipo conserva los ítems (texto y peso)", () => {
    const lista = { ...nuevoInstrumento("lista"), items: [{ id: "i1", texto: "Afinación", peso: 3 }] };
    const escala = cambiaTipoInstrumento(lista, "escala");
    expect(escala.items).toEqual([{ id: "i1", texto: "Afinación", peso: 3 }]);
    expect(escala.niveles).toEqual(NIVELES_ESCALA_DEFECTO);
  });
  it("escala ↔ rúbrica conserva los niveles editados; entrar en lista los sustituye por los fijos", () => {
    const escala = { ...nuevoInstrumento("escala"), niveles: [{ id: "x", etiqueta: "Mal", valor: 0 }, { id: "y", etiqueta: "Bien", valor: 1 }] };
    expect(cambiaTipoInstrumento(escala, "rubrica").niveles).toBe(escala.niveles);
    expect(cambiaTipoInstrumento(escala, "lista").niveles).toEqual(NIVELES_LISTA);
  });
  it("salir de rúbrica retira los descriptores (quedarían huérfanos de sus niveles)", () => {
    const rubrica = {
      tipo: "rubrica" as const,
      niveles: [{ id: "l0", etiqueta: "Mal", valor: 0 }, { id: "l1", etiqueta: "Bien", valor: 1 }],
      items: [{ id: "i1", texto: "x", peso: 1, descriptores: { l0: "Ausente", l1: "Completa" } }],
    };
    const lista = cambiaTipoInstrumento(rubrica, "lista");
    expect(lista.items[0]).toEqual({ id: "i1", texto: "x", peso: 1 });
  });
  it("mismo tipo: devuelve el mismo objeto sin cambios", () => {
    const instr = nuevoInstrumento("escala");
    expect(cambiaTipoInstrumento(instr, "escala")).toBe(instr);
  });
});

describe("fundeComentarios (N4.4) — lector de comentarios anclados", () => {
  const legado = {
    globalComment: "Buen trabajo en general.",
    questionComments: { q1: "Revisa la cadencia.", q2: "  " },
    blockComments: { b7: "El puente empieza antes." },
    levelComments: { "2": "Las frases están bien delimitadas." },
  };
  it("sin comentarios[] funde los cuatro campos legados con su tipo y ref", () => {
    const out = fundeComentarios(undefined, legado);
    expect(out).toContainEqual({ id: "general", ancla: { tipo: "general" }, texto: "Buen trabajo en general." });
    expect(out).toContainEqual({ id: "q-q1", ancla: { tipo: "pregunta", ref: "q1" }, texto: "Revisa la cadencia." });
    expect(out).toContainEqual({ id: "b-b7", ancla: { tipo: "bloque", ref: "b7" }, texto: "El puente empieza antes." });
    expect(out).toContainEqual({ id: "lv-2", ancla: { tipo: "nivel", ref: "2" }, texto: "Las frases están bien delimitadas." });
    // q2 era solo espacios: no genera comentario.
    expect(out).toHaveLength(4);
  });
  it("con comentarios[] (escritura nueva, completa) los legados NO se duplican", () => {
    const nuevos = [{ id: "general", ancla: { tipo: "general" as const }, texto: "Texto nuevo." }];
    expect(fundeComentarios(nuevos, legado)).toBe(nuevos);
  });
  it("sin nada → lista vacía", () => {
    expect(fundeComentarios(undefined, undefined)).toEqual([]);
    expect(fundeComentarios([], { globalComment: "" })).toEqual([]);
  });
  it("mapaDeComentarios proyecta un tipo a mapa ref → texto; tramosDeComentarios aplana los tramos", () => {
    const lista = fundeComentarios(undefined, legado).concat([
      { id: "ct-1", ancla: { tipo: "tramo", ref: { start: 12, end: 16 } }, texto: "El pivote es vi, no ii." },
    ]);
    expect(mapaDeComentarios(lista, "pregunta")).toEqual({ q1: "Revisa la cadencia." });
    expect(mapaDeComentarios(lista, "nivel")).toEqual({ "2": "Las frases están bien delimitadas." });
    expect(tramosDeComentarios(lista)).toEqual([{ id: "ct-1", start: 12, end: 16, texto: "El pivote es vi, no ii." }]);
    expect(comentarioGeneralDe(lista)).toBe("Buen trabajo en general.");
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
  it("tildes: «Transición» ≡ «transicion» por texto normalizado (nivel sin ranura)", () => {
    expect(etiquetaEquivalente(3, "Transición", "transicion")).toBe(true);
  });
  it("tildes dentro de un grupo: el alumno sin tilde casa con el grupo escrito con tilde", () => {
    // Ejercita normalizeLabel de forma asimétrica: si la regex de diacríticos
    // se corrompiera, "transición" del grupo no casaría con "transicion".
    expect(etiquetaEquivalente(1, "Puente", "transicion", [["Puente", "Transición"]])).toBe(true);
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

describe("coberturaLibre", () => {
  it("cobertura simple sin solapes", () => {
    expect(coberturaLibre([{ start: 0, end: 5 }, { start: 5, end: 10 }], 20)).toBe(50);
  });
  it("fusiona intervalos solapados sin contar dos veces el instante común", () => {
    // [0,10] ∪ [5,15] = [0,15] → 15/20 = 75 %, no (10+10)/20=100 %
    expect(coberturaLibre([{ start: 0, end: 10 }, { start: 5, end: 15 }], 20)).toBe(75);
  });
  it("intervalos adyacentes se fusionan igual que los solapados", () => {
    expect(coberturaLibre([{ start: 0, end: 10 }, { start: 10, end: 20 }], 20)).toBe(100);
  });
  it("recorta marcas que se salen de los límites de la duración", () => {
    expect(coberturaLibre([{ start: -5, end: 25 }], 20)).toBe(100);
  });
  it("sin marcas → 0 % (duración válida, simplemente no se ha marcado nada)", () => {
    expect(coberturaLibre([], 20)).toBe(0);
    expect(coberturaLibre(null, 20)).toBe(0);
  });
  it("sin duración válida → null", () => {
    expect(coberturaLibre([{ start: 0, end: 5 }], 0)).toBeNull();
    expect(coberturaLibre([{ start: 0, end: 5 }], -1)).toBeNull();
  });
});

describe("mediaDe", () => {
  it("agrega por peso (equitativa ≡ aritmética) y cuenta pendientes/total", () => {
    const hijos = [
      { id: "e1", nota: 80, peso: 1, pendiente: false },
      { id: "e2", nota: 60, peso: 1, pendiente: false },
      { id: "e3", nota: null, peso: 1, pendiente: true },
    ];
    expect(mediaDe(hijos)).toEqual({ nota: 70, pendientes: 1, total: 3 });
  });
  it("respeta pesos personalizados", () => {
    const hijos = [{ id: "u1", nota: 100, peso: 20 }, { id: "u2", nota: 50, peso: 80 }];
    expect(mediaDe(hijos).nota).toBe(60);
  });
  it("sin hijos → nota null, 0 pendientes, 0 total", () => {
    expect(mediaDe([])).toEqual({ nota: null, pendientes: 0, total: 0 });
  });
});
