// ═══ SCORING E INTERVALOS ════════════════════════════════════════════════════
// Funciones puras de puntuación (interactivo, cuestionario, esquema) y utilidades
// de intervalos. Extraídas de App.jsx (Fase 0). Migrado a TypeScript (Fase 3).
import { ponderar, labelsMatchForLevel, matchSchemaBlocks, etiquetaEquivalente } from "./calificacion.js";

// `fig` (opcional): id de cifrado de bajo (inversión) en categorías con
// hasFigures — ver lib/figures.ts. Los ejercicios sin cifrado no lo llevan.
export interface Interval { start: number; end: number; fn: string; fig?: string | null; }
export interface SchemaBlock { id?: string; level: number; start: number; end: number; label?: string; }
export interface Question { id: string; type?: string; correctOptionId?: string | null; points?: number; accepted?: string[]; }

export const getAt = (intervals: Interval[], t: number): string | null => {
  for (const iv of intervals) if (t >= iv.start && t < iv.end) return iv.fn;
  return null;
};

export const resolveOverlap = (existing: Interval[], newInterval: Interval): Interval[] => {
  const result: Interval[] = [];
  for (const iv of existing) {
    if (iv.end <= newInterval.start || iv.start >= newInterval.end) { result.push(iv); continue; }
    if (iv.start < newInterval.start) result.push({ ...iv, end: newInterval.start });
    if (iv.end > newInterval.end)     result.push({ ...iv, start: newInterval.end });
  }
  return result;
};

// A2-08: sin duración (0/undefined/NaN) no hay nada que medir — devolver 0
// sería una nota injusta (el alumno "suspende" un ejercicio mal configurado,
// no su respuesta). null ya significa "pendiente" en todo el resto del código
// (clave vacía → null); esta rama usa la misma semántica.
export const calcScore = (teacherAns: Interval[], studentAns: Interval[], duration: number, margin = 1): number | null => {
  if (!teacherAns.length) return null;
  if (!duration || duration <= 0) return null;
  const STEP = 0.1;
  let tot = 0, ok = 0;
  for (let t = 0; t < duration; t += STEP) {
    const tf = getAt(teacherAns, t);
    if (!tf) continue;
    tot++;
    let found = false;
    for (let d = -margin; d <= margin + STEP / 2; d += STEP) {
      if (getAt(studentAns, t + d) === tf) { found = true; break; }
    }
    if (found) ok++;
  }
  return tot > 0 ? Math.round((ok / tot) * 100) : 0;
};

// Rango Unicode de marcas diacríticas combinantes (U+0300–U+036F): lo que
// `normalize("NFD")` separa de una vocal acentuada ("á" → "a" + marca). Se
// construye con fromCharCode para no depender de escapes \uXXXX en el fuente.
const DIACRITIC_MARKS_RE = new RegExp(`[${String.fromCharCode(0x0300)}-${String.fromCharCode(0x036f)}]`, "g");

// Normaliza una respuesta corta para comparar sin distinguir mayúsculas,
// tildes/diacríticos ni espacios sobrantes (F5, T5.6): "Semicadencia",
// " semicadencia ", "SEMICADENCIA" son la misma respuesta; "V/V" y "6/8" no
// llevan tildes pero sí se benefician del recorte de espacios y minúsculas.
const normalizeShort = (s: string): string =>
  s.trim().toLowerCase().normalize("NFD").replace(DIACRITIC_MARKS_RE, "").replace(/\s+/g, " ").trim();

// Corrector de respuesta corta: ¿coincide (normalizada) con alguna aceptada?
export const gradeShort = (answer: string | null | undefined, accepted: string[] | null | undefined): boolean => {
  if (!answer?.trim() || !accepted?.length) return false;
  const norm = normalizeShort(answer);
  return accepted.some((a) => normalizeShort(a) === norm);
};

// Ponderado por points (F5, T5.4): cada pregunta autocorregible (test o corta)
// pesa `points` (defecto 1) en la nota — sin points en ninguna, es exactamente
// el reparto igualitario de antes (todas pesan 1). Desarrollo no entra aquí
// (se corrige a mano). No confundir con aggregateParts (media de partes); esto
// pondera preguntas dentro de UN cuestionario.
export const calcQuestionnaireScore = (
  questions: Question[] | null | undefined,
  answers: Record<string, string> | null | undefined,
): number | null => {
  const gradableQs = (questions || []).filter((q) =>
    (q.type === "test" && q.correctOptionId) || (q.type === "corta" && q.accepted?.length));
  if (gradableQs.length === 0) return null;
  const ans = (answers || {}) as Record<string, string>;
  const totalPoints = gradableQs.reduce((sum, q) => sum + (q.points ?? 1), 0);
  if (totalPoints <= 0) return null;
  const earnedPoints = gradableQs.reduce((sum, q) => {
    const correct = q.type === "corta" ? gradeShort(ans[q.id], q.accepted) : ans[q.id] === q.correctOptionId;
    return sum + (correct ? (q.points ?? 1) : 0);
  }, 0);
  return Math.round((earnedPoints / totalPoints) * 100);
};

export const calcSchemaPlacementScore = (
  keyBlocks: SchemaBlock[] | null | undefined,
  studentBlocks: SchemaBlock[],
  margin = 3,
): number | null => {
  if (!keyBlocks?.length) return null;
  let correct = 0;
  for (const kb of keyBlocks) {
    if (studentBlocks.some((sb) =>
      sb.level === kb.level &&
      Math.abs(sb.start - kb.start) <= margin &&
      Math.abs(sb.end - kb.end) <= margin
    )) correct++;
  }
  return Math.round((correct / keyBlocks.length) * 100);
};

export interface Confusion { de: string; a: string; segundos: number; }
export interface Tramo { start: number; end: number; esperado: string; marcado: string | null; }
export interface InteractiveDiagnostics {
  cobertura: number;
  precision: number;
  confusiones: Confusion[];
  desfaseMedio: number | null;
  tramos: Tramo[];
}

// Diagnóstico del interactivo (F2, T2.4) — NO toca la nota (calcScore sigue
// siendo la fuente de verdad); es información adicional para que el profesor
// entienda POR QUÉ falló, no solo cuánto. Mismo muestreo que calcScore para
// que ambos sean consistentes entre sí.
//   cobertura: % del tiempo con clave en que el alumno marcó algo (intentó),
//              acierte o no — distingue "no lo intentó" de "lo intentó mal".
//   precision: de lo intentado, % que coincide con la clave dentro del margen.
//   confusiones: pares (función esperada → función marcada) con los segundos
//              que se confundieron, para ver el patrón de error más frecuente.
//   desfaseMedio: desplazamiento medio (segundos, con signo) de los aciertos
//              que solo lo son gracias al margen — indica si el alumno tiende
//              a marcar tarde/pronto.
//   tramos: rangos fallidos consecutivos con la misma función esperada, para
//              ofrecer un salto directo al pasaje en el audio.
export const interactiveDiagnostics = (
  key: Interval[],
  student: Interval[],
  duration: number,
  margin = 1,
): InteractiveDiagnostics | null => {
  if (!key.length) return null;
  const STEP = 0.1;
  let total = 0, attempted = 0, matched = 0;
  const confusionSeconds = new Map<string, number>();
  const desfases: number[] = [];
  const tramos: Tramo[] = [];
  let curTramo: Tramo | null = null;

  for (let t = 0; t < duration; t += STEP) {
    const tf = getAt(key, t);
    if (!tf) {
      if (curTramo) { tramos.push(curTramo); curTramo = null; }
      continue;
    }
    total++;
    const sfExact = getAt(student, t);
    let isAttempted = sfExact != null;
    let isMatched = false;
    let matchedOffset: number | null = null;
    for (let d = -margin; d <= margin + STEP / 2; d += STEP) {
      const sf = getAt(student, t + d);
      if (sf != null) isAttempted = true;
      if (sf === tf && (matchedOffset == null || Math.abs(d) < Math.abs(matchedOffset))) {
        isMatched = true;
        matchedOffset = d;
      }
    }
    if (isAttempted) attempted++;
    if (isMatched) {
      matched++;
      if (matchedOffset != null) desfases.push(matchedOffset);
      if (curTramo) { tramos.push(curTramo); curTramo = null; }
    } else {
      if (sfExact != null && sfExact !== tf) {
        const k = `${tf}→${sfExact}`;
        confusionSeconds.set(k, (confusionSeconds.get(k) ?? 0) + STEP);
      }
      if (curTramo && curTramo.esperado === tf) curTramo.end = t + STEP;
      else { if (curTramo) tramos.push(curTramo); curTramo = { start: t, end: t + STEP, esperado: tf, marcado: sfExact }; }
    }
  }
  if (curTramo) tramos.push(curTramo);

  const confusiones: Confusion[] = [...confusionSeconds.entries()]
    .map(([k, segundos]) => { const [de, a] = k.split("→"); return { de, a, segundos: Math.round(segundos * 10) / 10 }; })
    .sort((x, y) => y.segundos - x.segundos);

  const desfaseMedio = desfases.length
    ? Math.round((desfases.reduce((s, d) => s + d, 0) / desfases.length) * 100) / 100
    : null;

  return {
    cobertura: total > 0 ? Math.round((attempted / total) * 100) : 0,
    precision: attempted > 0 ? Math.round((matched / attempted) * 100) : 0,
    confusiones,
    desfaseMedio,
    tramos,
  };
};

// Como getAt, pero devuelve el intervalo completo (con `fig`) en vez de solo `fn`.
const getIvAt = (intervals: Interval[], t: number): Interval | null => {
  for (const iv of intervals) if (t >= iv.start && t < iv.end) return iv;
  return null;
};

export interface FigureTramo { start: number; end: number; fn: string; esperadoFig: string | null; marcadoFig: string | null; }
export interface FigureDiagnostics { evaluable: number; correct: number; pct: number | null; fallos: FigureTramo[]; }

// Diagnóstico de CIFRADO (Jon, 2026-07-06): en categorías con hasFigures cada
// intervalo lleva grado (fn) Y cifrado de bajo/inversión (fig) — son dos
// preguntas distintas ("¿qué grado es?" / "¿qué inversión lleva?") y hasta
// ahora la corrección solo evaluaba el grado (interactiveDiagnostics, basado en
// fn). Esta función NO toca esa nota ni su diagnóstico; añade una dimensión
// aparte, solo sobre los instantes donde el GRADO YA ES CORRECTO — acertar la
// cifra cuando el grado está mal no significa nada (no hay "el cifrado de qué").
// null si la clave no usa cifrado (exercise sin `fig`, o categoría sin hasFigures).
export const interactiveFigureDiagnostics = (
  key: Interval[],
  student: Interval[],
  duration: number,
  margin = 1,
): FigureDiagnostics | null => {
  if (!key.some((iv) => iv.fig != null)) return null;
  const STEP = 0.1;
  let evaluable = 0, correct = 0;
  const fallos: FigureTramo[] = [];
  let curFallo: FigureTramo | null = null;

  for (let t = 0; t < duration; t += STEP) {
    const k = getIvAt(key, t);
    if (!k) { if (curFallo) { fallos.push(curFallo); curFallo = null; } continue; }
    // Mismo criterio de acierto de grado que interactiveDiagnostics: el más
    // cercano dentro del margen con el mismo fn. Si no hay match de grado, este
    // instante no es evaluable para cifrado (no sabemos "el cifrado de qué").
    let matched: Interval | null = null, bestOffset = Infinity;
    for (let d = -margin; d <= margin + STEP / 2; d += STEP) {
      const s = getIvAt(student, t + d);
      if (s && s.fn === k.fn && Math.abs(d) < bestOffset) { matched = s; bestOffset = Math.abs(d); }
    }
    if (!matched) { if (curFallo) { fallos.push(curFallo); curFallo = null; } continue; }
    evaluable++;
    const kFig = k.fig ?? null, sFig = matched.fig ?? null;
    if (kFig === sFig) {
      correct++;
      if (curFallo) { fallos.push(curFallo); curFallo = null; }
    } else {
      if (curFallo && curFallo.esperadoFig === kFig && curFallo.fn === k.fn) curFallo.end = t + STEP;
      else { if (curFallo) fallos.push(curFallo); curFallo = { start: t, end: t + STEP, fn: k.fn, esperadoFig: kFig, marcadoFig: sFig }; }
    }
  }
  if (curFallo) fallos.push(curFallo);

  return { evaluable, correct, pct: evaluable > 0 ? Math.round((correct / evaluable) * 100) : null, fallos };
};

export interface SchemaBlockDiagnostic {
  id?: string;
  level: number;
  label?: string;
  estado: "exacto" | "desplazado" | "falta";
  delta?: number;
  etiquetaOk: boolean;
  // N2.3: la etiqueta casó por un grupo de equivalencias del profesor (≈),
  // no por ranura semántica ni texto — la corrección lo distingue.
  etiquetaEquivalencia?: boolean;
}
export interface SchemaDiagnostics {
  bloques: SchemaBlockDiagnostic[];
  sobrantes: SchemaBlock[];
}

// Tolerancia de arrastre que aún se considera "exacto" (por debajo del margen
// configurado, que es la tolerancia que SÍ afecta a la nota de colocación).
const SCHEMA_EXACT_TOLERANCE = 0.15;

// Diagnóstico por bloque del esquema (F2, T2.5) — igual que interactiveDiagnostics,
// NO toca la nota: calcSchemaPlacementScore (colocación) sigue siendo la fuente
// de verdad. Esto separa dos preguntas que la nota de colocación mezcla: ¿el
// alumno puso el bloque en el sitio correcto? y, por separado, ¿lo llamó como
// tocaba? — un esquema puede colocar perfecto y nombrar mal, o viceversa.
// N0.4: el emparejador clave↔alumno vive en calificacion.ts (matchSchemaBlocks),
// compartido con calcSchemaScore — mismo comportamiento, antes inline aquí.
export const schemaDiagnostics = (
  keyBlocks: SchemaBlock[] | null | undefined,
  studentBlocks: SchemaBlock[] | null | undefined,
  schemaMargin = 3,
  equivalencias: string[][] = [],   // N2.3: grupos de sinónimos del profesor; [] = como siempre
): SchemaDiagnostics | null => {
  if (!keyBlocks?.length) return null;
  const { matches, sobrantes } = matchSchemaBlocks(keyBlocks, studentBlocks, schemaMargin);
  const bloques: SchemaBlockDiagnostic[] = matches.map(({ key: kb, student: best, delta }): SchemaBlockDiagnostic => {
    if (!best || delta == null) return { id: kb.id, level: kb.level, label: kb.label, estado: "falta", etiquetaOk: false };
    const estado = Math.abs(delta) <= SCHEMA_EXACT_TOLERANCE ? "exacto" : "desplazado";
    const okDirecto = labelsMatchForLevel(kb.level, kb.label, best.label);
    const ok = okDirecto || etiquetaEquivalente(kb.level, kb.label, best.label, equivalencias);
    // El campo solo se emite cuando aplica: sin equivalencias, la forma del
    // diagnóstico es byte-idéntica a la de siempre (tests de caracterización).
    return { id: kb.id, level: kb.level, label: kb.label, estado, delta, etiquetaOk: ok, ...(ok && !okDirecto ? { etiquetaEquivalencia: true } : {}) };
  });
  return { bloques, sobrantes };
};

// Nota agregada de un ejercicio multiparte (F4): media ponderada por
// part.points de las partes con nota calculable — las partes sin nota
// automática (esquema/desarrollo sin corregir aún, null) no cuentan en el
// promedio ni en el peso total, para no penalizar lo que el profesor
// todavía no ha corregido. null si ninguna parte tiene nota.
// N0.1: reimplementada sobre `ponderar` (calificacion.ts) — misma firma y
// mismo comportamiento, ahora como caso particular de la única aritmética.
export const aggregateParts = (scores: Array<number | null | undefined>, points: number[] = []): number | null =>
  ponderar(scores.map((s, i) => ({ nota: s ?? null, peso: points[i] ?? 1 })));

// Nota en escala académica 0–10 (Jon, 2026-07-05): las notas se ALMACENAN en
// 0–100 (compatible con todos los resultados guardados y con scoreColor/
// scoreBg), pero se MUESTRAN siempre sobre 10, con un decimal y coma española.
// 33 → "3,3" · 70 → "7" · 75 → "7,5". null/undefined → null (sin nota).
export const nota10 = (score100: number | null | undefined): string | null => {
  if (score100 == null) return null;
  const n = Math.round(score100) / 10;
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(".", ",");
};
