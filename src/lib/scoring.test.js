import { describe, it, expect } from "vitest";
import {
  getAt, resolveOverlap, calcScore, calcQuestionnaireScore, calcSchemaPlacementScore,
  interactiveDiagnostics, interactiveFigureDiagnostics, schemaDiagnostics, aggregateParts, gradeShort, nota10,
} from "./scoring.js";

// Tests de caracterización: fijan el comportamiento ACTUAL para detectar
// regresiones en fases posteriores (no describen el comportamiento "ideal").

describe("getAt", () => {
  const ivs = [{ fn: "T", start: 0, end: 4 }, { fn: "D", start: 4, end: 8 }];
  it("devuelve la función en el intervalo [start, end)", () => {
    expect(getAt(ivs, 0)).toBe("T");
    expect(getAt(ivs, 3.99)).toBe("T");
    expect(getAt(ivs, 4)).toBe("D");   // start es inclusivo
    expect(getAt(ivs, 7.99)).toBe("D");
  });
  it("end es exclusivo y fuera de rango devuelve null", () => {
    expect(getAt(ivs, 8)).toBeNull();
    expect(getAt(ivs, -1)).toBeNull();
    expect(getAt([], 1)).toBeNull();
  });
});

describe("resolveOverlap", () => {
  it("deja intactos los intervalos que no solapan", () => {
    const ex = [{ fn: "T", start: 0, end: 2 }];
    expect(resolveOverlap(ex, { start: 4, end: 6 })).toEqual(ex);
  });
  it("recorta por la izquierda y por la derecha", () => {
    const ex = [{ fn: "T", start: 0, end: 10 }];
    expect(resolveOverlap(ex, { start: 3, end: 6 })).toEqual([
      { fn: "T", start: 0, end: 3 },
      { fn: "T", start: 6, end: 10 },
    ]);
  });
  it("elimina por completo un intervalo contenido en el nuevo", () => {
    const ex = [{ fn: "T", start: 4, end: 6 }];
    expect(resolveOverlap(ex, { start: 0, end: 10 })).toEqual([]);
  });
});

describe("calcScore", () => {
  it("devuelve null si el profesor no marcó nada", () => {
    expect(calcScore([], [], 10)).toBeNull();
  });
  it("coincidencia total → 100", () => {
    const t = [{ fn: "T", start: 0, end: 10 }];
    expect(calcScore(t, t, 10, 1)).toBe(100);
  });
  it("ninguna coincidencia con margen 0 → 0 (no null)", () => {
    const t = [{ fn: "T", start: 0, end: 10 }];
    const s = [{ fn: "S", start: 0, end: 10 }];
    expect(calcScore(t, s, 10, 0)).toBe(0);
  });
  it("el resultado es un entero dentro de [0, 100]", () => {
    const t = [{ fn: "T", start: 0, end: 5 }, { fn: "D", start: 5, end: 10 }];
    const s = [{ fn: "T", start: 0, end: 4 }, { fn: "D", start: 6, end: 10 }];
    const sc = calcScore(t, s, 10, 1);
    expect(Number.isInteger(sc)).toBe(true);
    expect(sc).toBeGreaterThanOrEqual(0);
    expect(sc).toBeLessThanOrEqual(100);
  });
  it("un margen mayor no puede bajar la puntuación", () => {
    const t = [{ fn: "T", start: 0, end: 4 }];
    const s = [{ fn: "T", start: 2, end: 6 }];
    expect(calcScore(t, s, 8, 2)).toBeGreaterThanOrEqual(calcScore(t, s, 8, 0));
  });
  it("dos ejercicios con márgenes distintos puntúan distinto la misma respuesta", () => {
    const t = [{ fn: "T", start: 0, end: 4 }, { fn: "D", start: 4, end: 8 }];
    const s = [{ fn: "T", start: 1.5, end: 5.5 }, { fn: "D", start: 5.5, end: 8 }];
    const strict = calcScore(t, s, 8, 0.5); // margen del ejercicio A
    const loose  = calcScore(t, s, 8, 2);   // margen del ejercicio B
    expect(loose).toBeGreaterThan(strict);
  });
});

describe("calcQuestionnaireScore", () => {
  const q = (id, correct) => ({ id, type: "test", correctOptionId: correct });
  it("null si no hay preguntas tipo test con respuesta correcta", () => {
    expect(calcQuestionnaireScore([], {})).toBeNull();
    expect(calcQuestionnaireScore([{ id: "x", type: "desarrollo" }], {})).toBeNull();
  });
  it("todas correctas → 100", () => {
    const qs = [q("a", "A"), q("b", "B")];
    expect(calcQuestionnaireScore(qs, { a: "A", b: "B" })).toBe(100);
  });
  it("ninguna correcta → 0", () => {
    const qs = [q("a", "A"), q("b", "B")];
    expect(calcQuestionnaireScore(qs, { a: "X", b: "Y" })).toBe(0);
  });
  it("mezcla → porcentaje redondeado", () => {
    const qs = [q("a", "A"), q("b", "B")];
    expect(calcQuestionnaireScore(qs, { a: "A", b: "Y" })).toBe(50);
    const qs3 = [q("a", "A"), q("b", "B"), q("c", "C")];
    expect(calcQuestionnaireScore(qs3, { a: "A", b: "B", c: "X" })).toBe(67); // 66.66 → 67
  });

  // F5, T5.4 — ponderación por points
  it("sin points en ninguna, pesan igual (comportamiento de siempre)", () => {
    const qs = [q("a", "A"), q("b", "B"), q("c", "C")];
    expect(calcQuestionnaireScore(qs, { a: "A", b: "X", c: "X" })).toBe(33); // 1/3 → 33
  });
  it("una pregunta con más points pesa más en la nota", () => {
    const qs = [{ ...q("a", "A"), points: 3 }, q("b", "B")];
    // a (3 pts) correcta, b (1 pt) incorrecta → 3/4 = 75%
    expect(calcQuestionnaireScore(qs, { a: "A", b: "X" })).toBe(75);
    // al revés: a incorrecta, b correcta → 1/4 = 25%
    expect(calcQuestionnaireScore(qs, { a: "X", b: "B" })).toBe(25);
  });
  it("points=0 en todas las preguntas → null (nada que repartir)", () => {
    const qs = [{ ...q("a", "A"), points: 0 }];
    expect(calcQuestionnaireScore(qs, { a: "A" })).toBeNull();
  });

  // F5, T5.6 — tipo "corta" entra en la nota junto con test
  it("las preguntas 'corta' cuentan como autocorregibles, junto a test", () => {
    const qs = [q("a", "A"), { id: "b", type: "corta", accepted: ["Semicadencia"] }];
    expect(calcQuestionnaireScore(qs, { a: "A", b: "semicadencia" })).toBe(100);
    expect(calcQuestionnaireScore(qs, { a: "A", b: "otra cosa" })).toBe(50);
  });
  it("desarrollo nunca entra en la nota automática, aunque tenga points", () => {
    const qs = [q("a", "A"), { id: "b", type: "desarrollo", points: 5 }];
    expect(calcQuestionnaireScore(qs, { a: "A", b: "cualquier cosa" })).toBe(100);
  });

  // M6: el ámbito (fragmento/obra) NO afecta a la nota — solo cambia dónde se
  // escucha el audio. Una pregunta de obra puntúa exactamente igual que la misma
  // de fragmento; scoring.ts no lee `scope` ni audioStart/audioEnd.
  it("el ámbito (scope obra/fragmento) no altera la puntuación", () => {
    const frag = { id: "a", type: "test", correctOptionId: "A", scope: "fragmento", audioStart: 3, audioEnd: 9 };
    const obra = { id: "a", type: "test", correctOptionId: "A", scope: "obra" };
    expect(calcQuestionnaireScore([obra], { a: "A" })).toBe(calcQuestionnaireScore([frag], { a: "A" }));
    expect(calcQuestionnaireScore([obra], { a: "X" })).toBe(calcQuestionnaireScore([frag], { a: "X" }));
    // combinadas: da igual el ámbito de cada una, solo cuentan tipo y acierto
    const mixed  = [q("a", "A"), { id: "b", type: "test", correctOptionId: "B", scope: "obra" }];
    const allFrag = [q("a", "A"), { id: "b", type: "test", correctOptionId: "B", audioStart: 0, audioEnd: 4 }];
    expect(calcQuestionnaireScore(mixed, { a: "A", b: "X" })).toBe(calcQuestionnaireScore(allFrag, { a: "A", b: "X" }));
  });
});

describe("gradeShort", () => {
  it("ignora mayúsculas, tildes y espacios sobrantes", () => {
    expect(gradeShort("Semicadencia", ["semicadencia"])).toBe(true);
    expect(gradeShort("  SEMICADENCIA  ", ["semicadencia"])).toBe(true);
    expect(gradeShort("Función", ["funcion"])).toBe(true);
    expect(gradeShort("cadencia   rota", ["Cadencia Rota"])).toBe(true);
  });
  it("acepta cualquiera de varias grafías válidas", () => {
    const accepted = ["V/V", "quinta de la quinta", "dominante de la dominante"];
    expect(gradeShort("v/v", accepted)).toBe(true);
    expect(gradeShort(" Quinta de la Quinta ", accepted)).toBe(true);
    expect(gradeShort("Dominante de la Dominante", accepted)).toBe(true);
    expect(gradeShort("subdominante", accepted)).toBe(false);
  });
  it("compases y cifrados con barras/números — exacto tras normalizar espacios", () => {
    expect(gradeShort("6/8", ["6/8"])).toBe(true);
    expect(gradeShort(" 6 / 8 ", ["6/8"])).toBe(false); // los espacios internos SÍ importan (cambian el término)
    expect(gradeShort("6/8", ["6 / 8"])).toBe(false);
  });
  it("sin respuesta o sin aceptadas, nunca es correcta", () => {
    expect(gradeShort("", ["algo"])).toBe(false);
    expect(gradeShort("   ", ["algo"])).toBe(false);
    expect(gradeShort(null, ["algo"])).toBe(false);
    expect(gradeShort(undefined, ["algo"])).toBe(false);
    expect(gradeShort("algo", [])).toBe(false);
    expect(gradeShort("algo", null)).toBe(false);
  });
});

describe("calcSchemaPlacementScore", () => {
  const kb = [{ level: 1, start: 0, end: 4 }, { level: 2, start: 4, end: 8 }];
  it("null si no hay bloques clave", () => {
    expect(calcSchemaPlacementScore([], [], 3)).toBeNull();
    expect(calcSchemaPlacementScore(null, [], 3)).toBeNull();
  });
  it("bloques exactos → 100", () => {
    expect(calcSchemaPlacementScore(kb, kb, 3)).toBe(100);
  });
  it("desplazados dentro del margen cuentan", () => {
    const sb = [{ level: 1, start: 2, end: 6 }, { level: 2, start: 6, end: 10 }];
    expect(calcSchemaPlacementScore(kb, sb, 3)).toBe(100);
  });
  it("fuera del margen no cuentan", () => {
    const sb = [{ level: 1, start: 20, end: 24 }, { level: 2, start: 24, end: 28 }];
    expect(calcSchemaPlacementScore(kb, sb, 3)).toBe(0);
  });
  it("distinto nivel no empareja", () => {
    const sb = [{ level: 3, start: 0, end: 4 }, { level: 4, start: 4, end: 8 }];
    expect(calcSchemaPlacementScore(kb, sb, 3)).toBe(0);
  });
  it("dos ejercicios con márgenes distintos puntúan distinto el mismo esquema", () => {
    const sb = [{ level: 1, start: 2, end: 6 }, { level: 2, start: 6, end: 10 }]; // desplazado +2
    const strict = calcSchemaPlacementScore(kb, sb, 1); // margen del ejercicio A
    const loose  = calcSchemaPlacementScore(kb, sb, 3); // margen del ejercicio B
    expect(loose).toBeGreaterThan(strict);
  });
});

describe("interactiveDiagnostics", () => {
  it("null si no hay clave", () => {
    expect(interactiveDiagnostics([], [], 10, 1)).toBeNull();
  });
  it("coincidencia total → cobertura y precisión 100, sin tramos ni confusiones", () => {
    const key = [{ fn: "T", start: 0, end: 10 }];
    const d = interactiveDiagnostics(key, key, 10, 1);
    expect(d.cobertura).toBe(100);
    expect(d.precision).toBe(100);
    expect(d.confusiones).toEqual([]);
    expect(d.tramos).toEqual([]);
  });
  it("silencio del alumno → cobertura 0 y un único tramo con marcado null", () => {
    const key = [{ fn: "T", start: 0, end: 10 }];
    const d = interactiveDiagnostics(key, [], 10, 1);
    expect(d.cobertura).toBe(0);
    expect(d.precision).toBe(0);
    expect(d.tramos).toHaveLength(1);
    expect(d.tramos[0]).toMatchObject({ start: 0, esperado: "T", marcado: null });
  });
  it("función equivocada todo el tramo → cobertura 100, precisión 0 y una confusión", () => {
    const key = [{ fn: "T", start: 0, end: 10 }];
    const student = [{ fn: "S", start: 0, end: 10 }];
    const d = interactiveDiagnostics(key, student, 10, 1);
    expect(d.cobertura).toBe(100);
    expect(d.precision).toBe(0);
    expect(d.confusiones).toHaveLength(1);
    expect(d.confusiones[0]).toMatchObject({ de: "T", a: "S" });
    expect(d.confusiones[0].segundos).toBeCloseTo(10, 0);
    expect(d.tramos).toHaveLength(1);
    expect(d.tramos[0]).toMatchObject({ esperado: "T", marcado: "S" });
  });
  it("desplazado dentro del margen: coincide igualmente y registra desfase", () => {
    const key     = [{ fn: "T", start: 0, end: 10 }];
    const student = [{ fn: "T", start: 0.5, end: 10.5 }];
    const d = interactiveDiagnostics(key, student, 10, 1);
    expect(d.precision).toBe(100);
    expect(d.tramos).toEqual([]);
    expect(d.desfaseMedio).not.toBeNull();
  });
});

describe("interactiveFigureDiagnostics (grados vs. cifrado, Jon 2026-07-06)", () => {
  it("null si la clave no lleva cifrado (fig ausente en todos los intervalos)", () => {
    const key = [{ fn: "T", start: 0, end: 10 }];
    expect(interactiveFigureDiagnostics(key, key, 10, 1)).toBeNull();
  });
  it("grado y cifrado correctos → pct 100, sin fallos", () => {
    const key = [{ fn: "I", start: 0, end: 10, fig: "t1" }];
    const d = interactiveFigureDiagnostics(key, key, 10, 1);
    expect(d.evaluable).toBeGreaterThan(0);
    expect(d.pct).toBe(100);
    expect(d.fallos).toEqual([]);
  });
  it("grado correcto pero cifrado distinto → NO evalúa como 100, registra un fallo con el grado correspondiente", () => {
    const key     = [{ fn: "I", start: 0, end: 10, fig: "t0" }];
    const student = [{ fn: "I", start: 0, end: 10, fig: "t1" }];
    const d = interactiveFigureDiagnostics(key, student, 10, 1);
    expect(d.pct).toBe(0);
    expect(d.fallos).toHaveLength(1);
    expect(d.fallos[0]).toMatchObject({ fn: "I", esperadoFig: "t0", marcadoFig: "t1" });
  });
  it("grado INCORRECTO → el instante no es evaluable para cifrado (no cuenta ni como acierto ni como fallo)", () => {
    const key     = [{ fn: "I", start: 0, end: 10, fig: "t0" }];
    const student = [{ fn: "V", start: 0, end: 10, fig: "t0" }]; // mismo fig, grado distinto
    const d = interactiveFigureDiagnostics(key, student, 10, 1);
    expect(d.evaluable).toBe(0);
    expect(d.pct).toBeNull();
    expect(d.fallos).toEqual([]);
  });
  it("mezcla: la mitad con cifrado correcto y la mitad con cifrado erróneo → pct ≈ 50", () => {
    const key = [
      { fn: "I", start: 0, end: 5,  fig: "t0" },
      { fn: "V", start: 5, end: 10, fig: "D0" },
    ];
    const student = [
      { fn: "I", start: 0, end: 5,  fig: "t0" },  // cifrado correcto
      { fn: "V", start: 5, end: 10, fig: "D1" },  // grado correcto, cifrado erróneo
    ];
    const d = interactiveFigureDiagnostics(key, student, 10, 1);
    expect(d.pct).toBe(50);
    expect(d.fallos).toHaveLength(1);
    expect(d.fallos[0]).toMatchObject({ fn: "V", esperadoFig: "D0", marcadoFig: "D1" });
  });
});

describe("schemaDiagnostics", () => {
  it("null si no hay bloques clave", () => {
    expect(schemaDiagnostics([], [], 3)).toBeNull();
    expect(schemaDiagnostics(null, [], 3)).toBeNull();
  });
  it("bloque exacto y bien etiquetado", () => {
    const key     = [{ id: "k1", level: 1, start: 0, end: 4, label: "Exposición" }];
    const student = [{ id: "s1", level: 1, start: 0, end: 4, label: "A" }]; // misma ranura semántica
    const d = schemaDiagnostics(key, student, 3);
    expect(d.bloques).toEqual([{ id: "k1", level: 1, label: "Exposición", estado: "exacto", delta: 0, etiquetaOk: true }]);
    expect(d.sobrantes).toEqual([]);
  });
  it("desplazado dentro del margen con delta con signo", () => {
    const key     = [{ id: "k1", level: 1, start: 0, end: 4, label: "A" }];
    const student = [{ id: "s1", level: 1, start: 2, end: 6, label: "A" }];
    const d = schemaDiagnostics(key, student, 3);
    expect(d.bloques[0].estado).toBe("desplazado");
    expect(d.bloques[0].delta).toBe(2);
  });
  it("falta si no hay bloque del alumno en esa posición/nivel", () => {
    const key = [{ id: "k1", level: 1, start: 0, end: 4, label: "A" }];
    const d = schemaDiagnostics(key, [], 3);
    expect(d.bloques[0]).toMatchObject({ estado: "falta", etiquetaOk: false });
  });
  it("colocación 100% pero mal etiquetado → Nombres 0% sin alterar la nota de colocación", () => {
    const key     = [{ id: "k1", level: 1, start: 0, end: 4, label: "A" }, { id: "k2", level: 1, start: 4, end: 8, label: "B" }];
    const student = [{ id: "s1", level: 1, start: 0, end: 4, label: "B" }, { id: "s2", level: 1, start: 4, end: 8, label: "A" }];
    const colocacion = calcSchemaPlacementScore(key, student, 3);
    const d = schemaDiagnostics(key, student, 3);
    expect(colocacion).toBe(100); // la nota no cambia
    expect(d.bloques.every((b) => !b.etiquetaOk)).toBe(true); // "Nombres 0%"
  });
  it("sobrantes: bloques del alumno que no corresponden a ningún bloque clave", () => {
    const key     = [{ id: "k1", level: 1, start: 0, end: 4, label: "A" }];
    const student = [{ id: "s1", level: 1, start: 0, end: 4, label: "A" }, { id: "s2", level: 1, start: 20, end: 24, label: "B" }];
    const d = schemaDiagnostics(key, student, 3);
    expect(d.sobrantes).toEqual([{ id: "s2", level: 1, start: 20, end: 24, label: "B" }]);
  });
});

describe("aggregateParts", () => {
  it("media ponderada por points", () => {
    expect(aggregateParts([80, 60], [1, 1])).toBe(70);
    expect(aggregateParts([100, 0], [3, 1])).toBe(75); // (300+0)/4
  });
  it("points por defecto = 1 si falta", () => {
    expect(aggregateParts([80, 60])).toBe(70);
  });
  it("ignora las partes sin nota calculable (null)", () => {
    expect(aggregateParts([80, null, 60])).toBe(70);
    expect(aggregateParts([null, null])).toBeNull();
  });
  it("array vacío → null", () => {
    expect(aggregateParts([])).toBeNull();
  });
  it("M0.6: pesos heredados respetados — una parte legacy con points ≠ 1 sigue ponderando aunque la autoría ya no lo permita editar", () => {
    // Reproduce el mapeo real (App.tsx/CorrectionView.tsx): parts.map(p => p.points ?? 1).
    const legacyParts = [{ id: "p1", points: 3 }, { id: "p2" }]; // p2 nunca tuvo el campo
    const scores = [100, 0];
    expect(aggregateParts(scores, legacyParts.map((p) => p.points ?? 1))).toBe(75); // (300+0)/4
  });
});

describe("nota10 (presentación 0–10 de una nota almacenada 0–100)", () => {
  it("entero cuando la décima es exacta", () => {
    expect(nota10(70)).toBe("7");
    expect(nota10(100)).toBe("10");
    expect(nota10(0)).toBe("0");
  });
  it("un decimal con coma española cuando no es exacta", () => {
    expect(nota10(33)).toBe("3,3");
    expect(nota10(75)).toBe("7,5");
  });
  it("redondea las centésimas antes de dividir (67% → 6,7)", () => {
    expect(nota10(66.6)).toBe("6,7");
  });
  it("sin nota → null", () => {
    expect(nota10(null)).toBeNull();
    expect(nota10(undefined)).toBeNull();
  });
});
