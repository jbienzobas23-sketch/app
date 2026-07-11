import { describe, it, expect } from "vitest";
import { buildRepeatSegments, buildCompleteViewSegments, getSegBounds, syncSecondPassBlocks, rulerTicksForSeg } from "./repeats.js";

// Tests de CARACTERIZACIÓN (C4.2, A4-01): fijan el comportamiento ACTUAL de
// repeats.ts para detectar regresiones antes de subdividir SchemaExerciseView
// (C4.3). No describen el comportamiento "ideal" — si un caso sorprende, se
// documenta aquí y en el log, no se "corrige".

describe("buildRepeatSegments", () => {
  it("sin repeticiones: un único segmento normal que cubre toda la duración", () => {
    expect(buildRepeatSegments(60, undefined)).toEqual([
      { type: "normal", recStart: 0, recEnd: 60, canonDur: 60, vStart: 0, vEnd: 1, index: 0 },
    ]);
    expect(buildRepeatSegments(60, [])).toEqual([
      { type: "normal", recStart: 0, recEnd: 60, canonDur: 60, vStart: 0, vEnd: 1, index: 0 },
    ]);
  });

  it("una repetición en medio: normal · repeat · normal, con vStart/vEnd proporcionales", () => {
    const rep = { id: "r1", first: { start: 20, end: 30 }, second: { start: 40, end: 50 } };
    const segs = buildRepeatSegments(60, [rep]);
    expect(segs).toHaveLength(3);
    expect(segs[0]).toMatchObject({ type: "normal", recStart: 0, recEnd: 20, canonDur: 20, vStart: 0, vEnd: 0.5, index: 0 });
    expect(segs[1]).toMatchObject({ type: "repeat", rep, canonDur: 10, vStart: 0.5, vEnd: 0.75, index: 1 });
    expect(segs[2]).toMatchObject({ type: "normal", recStart: 50, recEnd: 60, canonDur: 10, vStart: 0.75, vEnd: 1, index: 2 });
  });

  it("repetición pegada al inicio: sin segmento normal inicial", () => {
    const rep = { id: "r1", first: { start: 0, end: 10 }, second: { start: 20, end: 30 } };
    const segs = buildRepeatSegments(40, [rep]);
    expect(segs).toHaveLength(2);
    expect(segs[0]).toMatchObject({ type: "repeat", canonDur: 10, vStart: 0, vEnd: 0.5, index: 0 });
    expect(segs[1]).toMatchObject({ type: "normal", recStart: 30, recEnd: 40, canonDur: 10, vStart: 0.5, vEnd: 1, index: 1 });
  });

  it("repetición pegada al fin: sin segmento normal final", () => {
    const rep = { id: "r1", first: { start: 20, end: 30 }, second: { start: 40, end: 50 } };
    const segs = buildRepeatSegments(50, [rep]);
    expect(segs).toHaveLength(2);
    expect(segs[0]).toMatchObject({ type: "normal", recStart: 0, recEnd: 20, canonDur: 20, index: 0 });
    expect(segs[1]).toMatchObject({ type: "repeat", canonDur: 10, index: 1 });
    expect(segs[1].vEnd).toBe(1);
  });

  it("repeticiones desordenadas: se procesan ordenadas por first.start, no por orden de entrada", () => {
    const repA = { id: "rA", first: { start: 5, end: 10 }, second: { start: 15, end: 20 } };
    const repB = { id: "rB", first: { start: 30, end: 35 }, second: { start: 40, end: 45 } };
    const segs = buildRepeatSegments(50, [repB, repA]); // orden de entrada invertido
    const repeatSegs = segs.filter((s) => s.type === "repeat");
    expect(repeatSegs).toHaveLength(2);
    expect(repeatSegs[0].rep).toBe(repA); // repA (first.start menor) va primero
    expect(repeatSegs[1].rep).toBe(repB);
  });

  it("repetición malformada (sin first.start o second.end) se filtra sin lanzar", () => {
    const good = { id: "rGood", first: { start: 10, end: 20 }, second: { start: 30, end: 40 } };
    const malformed1 = { id: "rBad1", first: { start: null }, second: { end: 50 } };
    const malformed2 = { id: "rBad2", first: { start: 5, end: 8 }, second: { end: null } };
    expect(() => buildRepeatSegments(60, [malformed1, malformed2, good])).not.toThrow();
    const segs = buildRepeatSegments(60, [malformed1, malformed2, good]);
    const repeatSegs = segs.filter((s) => s.type === "repeat");
    expect(repeatSegs).toHaveLength(1);
    expect(repeatSegs[0].rep).toBe(good);
  });
});

describe("buildCompleteViewSegments", () => {
  it("sin repeticiones: un único segmento normal", () => {
    expect(buildCompleteViewSegments(60, null)).toEqual([
      { type: "normal", recStart: 0, recEnd: 60, canonDur: 60, vStart: 0, vEnd: 1, index: 0 },
    ]);
  });

  it("con hueco entre el fin de la 1ª vez y el inicio de la 2ª: 5 segmentos, incluido el hueco", () => {
    const rep = { id: "r1", first: { start: 10, end: 20 }, second: { start: 25, end: 35 } };
    const segs = buildCompleteViewSegments(40, [rep]);
    expect(segs).toHaveLength(5);
    expect(segs.map((s) => s.type)).toEqual(["normal", "repeat-first", "normal", "repeat-second", "normal"]);
    expect(segs[2]).toMatchObject({ recStart: 20, recEnd: 25, canonDur: 5 }); // el hueco
    expect(segs[0].vStart).toBe(0);
    expect(segs[4].vEnd).toBe(1);
  });

  it("sin hueco (la 2ª vez empieza justo donde acaba la 1ª): 4 segmentos, sin el normal intermedio", () => {
    const rep = { id: "r1", first: { start: 10, end: 20 }, second: { start: 20, end: 30 } };
    const segs = buildCompleteViewSegments(30, [rep]);
    expect(segs.map((s) => s.type)).toEqual(["normal", "repeat-first", "repeat-second"]);
  });

  it("con ≥2 repeticiones desordenadas, también ordena por first.start", () => {
    const repA = { id: "rA", first: { start: 5, end: 10 }, second: { start: 15, end: 20 } };
    const repB = { id: "rB", first: { start: 30, end: 35 }, second: { start: 40, end: 45 } };
    const segs = buildCompleteViewSegments(50, [repB, repA]);
    const firsts = segs.filter((s) => s.type === "repeat-first");
    expect(firsts[0].rep).toBe(repA);
    expect(firsts[1].rep).toBe(repB);
  });
});

describe("getSegBounds", () => {
  it("normal / repeat-first / repeat-second: usan recStart/recEnd del propio segmento", () => {
    expect(getSegBounds({ type: "normal", recStart: 1, recEnd: 9 })).toEqual({ min: 1, max: 9 });
    expect(getSegBounds({ type: "repeat-first", recStart: 2, recEnd: 8 })).toEqual({ min: 2, max: 8 });
    expect(getSegBounds({ type: "repeat-second", recStart: 3, recEnd: 7 })).toEqual({ min: 3, max: 7 });
  });
  it("repeat: fila 'second' usa los límites de la 2ª vez; cualquier otra fila, la 1ª", () => {
    const rep = { first: { start: 10, end: 20 }, second: { start: 30, end: 45 } };
    expect(getSegBounds({ type: "repeat", rep }, "second")).toEqual({ min: 30, max: 45 });
    expect(getSegBounds({ type: "repeat", rep }, "first")).toEqual({ min: 10, max: 20 });
    expect(getSegBounds({ type: "repeat", rep })).toEqual({ min: 10, max: 20 }); // sin pass → 1ª vez
  });
});

describe("syncSecondPassBlocks (con makeId determinista inyectado)", () => {
  const makeCounter = () => { let n = 0; return () => `sb-test-${n++}`; };

  it("espejo nuevo: crea el bloque de la 2ª vez con makeId(), pass y mirrorId", () => {
    const rep = { id: "r1", first: { start: 0, end: 10 }, second: { start: 20, end: 30 } };
    const b1 = { id: "b1", start: 0, end: 10, repeatId: "r1", pass: "first", label: "A", level: 1 };
    const makeId = makeCounter();
    const result = syncSecondPassBlocks([b1], [rep], makeId);
    expect(result).toHaveLength(2);
    const created = result.find((b) => b.id !== "b1");
    expect(created).toMatchObject({
      id: "sb-test-0", pass: "second", mirrorId: "b1", start: 20, end: 30,
      _lockedStart: true, _lockedEnd: true, label: "A", level: 1,
    });
  });

  it("espejo existente SIN override: se resincroniza (posición/duración), conserva su propio id", () => {
    const rep = { id: "r1", first: { start: 0, end: 10 }, second: { start: 20, end: 30 } };
    const b1 = { id: "b1", start: 0, end: 10, repeatId: "r1", pass: "first", label: "A", level: 1 };
    const b2 = { id: "b2-stale", start: 99, end: 199, repeatId: "r1", pass: "second", mirrorId: "b1", label: "vieja" };
    const result = syncSecondPassBlocks([b1, b2], [rep], makeCounter());
    const synced = result.find((b) => b.id === "b2-stale");
    expect(synced).toMatchObject({ id: "b2-stale", start: 20, end: 30, label: "A", level: 1, _lockedStart: true, _lockedEnd: true });
  });

  it("override: conserva el start manual pero recalcula la duración proporcional (fuera de los bordes de zona)", () => {
    const rep = { id: "r1", first: { start: 0, end: 20 }, second: { start: 100, end: 140 } }; // ratio 2
    const b1 = { id: "b1", start: 5, end: 10, repeatId: "r1", pass: "first" }; // ni al inicio ni al fin de zona
    const b2 = { id: "b2", start: 110, end: 999, repeatId: "r1", pass: "second", mirrorId: "b1", overridden: true };
    const result = syncSecondPassBlocks([b1, b2], [rep], makeCounter());
    const synced = result.find((b) => b.id === "b2");
    // derivedDur = (10-5)*ratio(2) = 10; start manual conservado (110), end = 110+10 = 120
    expect(synced).toMatchObject({ id: "b2", start: 110, end: 120, _lockedStart: false, _lockedEnd: false, overridden: true });
  });

  it("override anclado al INICIO de zona: start pasa a rep.second.start, end se deriva de ahí", () => {
    const rep = { id: "r1", first: { start: 0, end: 20 }, second: { start: 100, end: 140 } };
    const b1 = { id: "b1", start: 0, end: 10, repeatId: "r1", pass: "first" }; // al inicio de zona (start===first.start)
    const b2 = { id: "b2", start: 55, end: 999, repeatId: "r1", pass: "second", mirrorId: "b1", overridden: true };
    const result = syncSecondPassBlocks([b1, b2], [rep], makeCounter());
    const synced = result.find((b) => b.id === "b2");
    // derivedDur = (10-0)*2 = 20; anclado al inicio → start=rep.second.start(100), end=100+20=120
    expect(synced).toMatchObject({ start: 100, end: 120, _lockedStart: true, _lockedEnd: false });
  });

  it("override anclado al FIN de zona: end pasa a rep.second.end, start se deriva hacia atrás", () => {
    const rep = { id: "r1", first: { start: 0, end: 20 }, second: { start: 100, end: 140 } };
    const b1 = { id: "b1", start: 10, end: 20, repeatId: "r1", pass: "first" }; // al fin de zona (end===first.end)
    const b2 = { id: "b2", start: 55, end: 999, repeatId: "r1", pass: "second", mirrorId: "b1", overridden: true };
    const result = syncSecondPassBlocks([b1, b2], [rep], makeCounter());
    const synced = result.find((b) => b.id === "b2");
    // derivedDur = (20-10)*2 = 20; anclado al fin → end=rep.second.end(140), start=140-20=120
    expect(synced).toMatchObject({ start: 120, end: 140, _lockedStart: false, _lockedEnd: true });
  });

  it("ratio de la 2ª vez ≠ 1ª (más corta): la duración derivada se escala, no se copia", () => {
    const rep = { id: "r1", first: { start: 0, end: 10 }, second: { start: 50, end: 55 } }; // fd=10, sd=5, ratio=0.5
    const b1 = { id: "b1", start: 2, end: 6, repeatId: "r1", pass: "first" }; // ancho 4, ni inicio ni fin de zona
    const result = syncSecondPassBlocks([b1], [rep], makeCounter());
    const created = result.find((b) => b.id !== "b1");
    expect(created.end - created.start).toBe(2); // 4 * 0.5
  });

  it("override huérfano (sin bloque de 1ª vez que lo genere) se conserva tal cual", () => {
    const rep = { id: "r1", first: { start: 0, end: 10 }, second: { start: 20, end: 30 } };
    // Sin bloques de "first" en absoluto para esta repetición: firstBlocks queda vacío.
    const orphan = { id: "orphan", start: 22, end: 28, repeatId: "r1", pass: "second", mirrorId: "no-existe", overridden: true };
    const result = syncSecondPassBlocks([orphan], [rep], makeCounter());
    expect(result).toContainEqual(orphan);
  });

  it("sin makeId inyectado, usa el generador por defecto (prefijo 'sb', A4-09)", () => {
    const rep = { id: "r1", first: { start: 0, end: 10 }, second: { start: 20, end: 30 } };
    const b1 = { id: "b1", start: 0, end: 10, repeatId: "r1", pass: "first" };
    const result = syncSecondPassBlocks([b1], [rep]); // sin tercer argumento
    const created = result.find((b) => b.id !== "b1");
    expect(created.id).toMatch(/^sb-/);
  });
});

describe("rulerTicksForSeg", () => {
  it("d <= 0 (start === end o start > end): sin marcas", () => {
    expect(rulerTicksForSeg(10, 10)).toEqual([]);
    expect(rulerTicksForSeg(10, 5)).toEqual([]);
  });

  it("elige el paso 'bonito' según el ancho disponible (widthPx=200 → paso 5 para 10s)", () => {
    const ticks = rulerTicksForSeg(0, 10, 200);
    expect(ticks).toEqual([{ t: 0, frac: 0 }, { t: 5, frac: 0.5 }]);
  });

  it("sin widthPx, usa 200 por defecto (mismo resultado que pasarlo explícito)", () => {
    expect(rulerTicksForSeg(0, 10)).toEqual(rulerTicksForSeg(0, 10, 200));
  });

  it("si ningún paso de la lista alcanza el objetivo, cae al mayor (300)", () => {
    const ticks = rulerTicksForSeg(0, 1000, 110); // target = 1000 / max(2, floor(110/55)=2) = 500 → sin paso ≥500 en STEPS
    expect(ticks.length).toBeGreaterThan(0);
    expect(ticks[1].t - ticks[0].t).toBe(300);
  });

  it("start no múltiplo del paso: la primera marca es el primer múltiplo dentro del rango", () => {
    const ticks = rulerTicksForSeg(3, 13, 200); // mismo paso (5) que el caso base, pero start=3
    expect(ticks[0].t).toBe(5); // ceil(3/5)*5 = 5
  });
});
