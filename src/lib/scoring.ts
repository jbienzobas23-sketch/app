// ═══ SCORING E INTERVALOS ════════════════════════════════════════════════════
// Funciones puras de puntuación (interactivo, cuestionario, esquema) y utilidades
// de intervalos. Extraídas de App.jsx (Fase 0). Migrado a TypeScript (Fase 3).
import { partSlotIndex, phraseSlotIndex } from "./palette.js";

export interface Interval { start: number; end: number; fn: string; }
export interface SchemaBlock { id?: string; level: number; start: number; end: number; label?: string; }
export interface Question { id: string; type?: string; correctOptionId?: string | null; }

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

export const calcScore = (teacherAns: Interval[], studentAns: Interval[], duration: number, margin = 1): number | null => {
  if (!teacherAns.length) return null;
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

export const calcQuestionnaireScore = (
  questions: Question[] | null | undefined,
  answers: Record<string, string> | null | undefined,
): number | null => {
  const testQs = (questions || []).filter((q) => q.type === "test" && q.correctOptionId);
  if (testQs.length === 0) return null;
  const ans = (answers || {}) as Record<string, string>;
  const correct = testQs.filter((q) => ans[q.id] === q.correctOptionId).length;
  return Math.round((correct / testQs.length) * 100);
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

const normalizeLabel = (s?: string | null): string =>
  (s ?? "").trim().normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Etiqueta correcta si coincide su ranura semántica (A/B/C/D para Partes,
// a/b/c/d para Frases — así "Desarrollo" y "B" cuentan como la misma etiqueta,
// que es justo lo que ya hace el color automático de la paleta). Si la ranura
// no aplica a ninguna de las dos (niveles 3/4, o etiquetas fuera de patrón),
// cae a igualdad de texto normalizado.
const labelsMatchForLevel = (level: number, keyLabel?: string | null, studentLabel?: string | null): boolean => {
  const slotFn = level === 1 ? partSlotIndex : level === 2 ? phraseSlotIndex : null;
  if (slotFn) {
    const a = slotFn(keyLabel), b = slotFn(studentLabel);
    if (a != null && b != null) return a === b;
  }
  const nk = normalizeLabel(keyLabel);
  return nk !== "" && nk === normalizeLabel(studentLabel);
};

export interface SchemaBlockDiagnostic {
  id?: string;
  level: number;
  label?: string;
  estado: "exacto" | "desplazado" | "falta";
  delta?: number;
  etiquetaOk: boolean;
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
export const schemaDiagnostics = (
  keyBlocks: SchemaBlock[] | null | undefined,
  studentBlocks: SchemaBlock[] | null | undefined,
  schemaMargin = 3,
): SchemaDiagnostics | null => {
  if (!keyBlocks?.length) return null;
  const pool = [...(studentBlocks ?? [])];
  const bloques: SchemaBlockDiagnostic[] = keyBlocks.map((kb): SchemaBlockDiagnostic => {
    let best: SchemaBlock | null = null;
    let bestDist = Infinity;
    let bestIdx = -1;
    for (let i = 0; i < pool.length; i++) {
      const sb = pool[i];
      if (sb.level !== kb.level) continue;
      const dist = Math.max(Math.abs(sb.start - kb.start), Math.abs(sb.end - kb.end));
      if (dist <= schemaMargin && dist < bestDist) { best = sb; bestDist = dist; bestIdx = i; }
    }
    if (!best) return { id: kb.id, level: kb.level, label: kb.label, estado: "falta", etiquetaOk: false };
    pool.splice(bestIdx, 1);
    const delta = Math.round((best.start - kb.start) * 10) / 10;
    const estado = Math.abs(delta) <= SCHEMA_EXACT_TOLERANCE ? "exacto" : "desplazado";
    return { id: kb.id, level: kb.level, label: kb.label, estado, delta, etiquetaOk: labelsMatchForLevel(kb.level, kb.label, best.label) };
  });
  return { bloques, sobrantes: pool };
};

// Nota agregada de un ejercicio multiparte (F4): media ponderada por
// part.points de las partes con nota calculable — las partes sin nota
// automática (esquema/desarrollo sin corregir aún, null) no cuentan en el
// promedio ni en el peso total, para no penalizar lo que el profesor
// todavía no ha corregido. null si ninguna parte tiene nota.
export const aggregateParts = (scores: Array<number | null | undefined>, points: number[] = []): number | null => {
  let weightedSum = 0, totalWeight = 0;
  scores.forEach((s, i) => {
    if (s == null) return;
    const w = points[i] ?? 1;
    weightedSum += s * w;
    totalWeight += w;
  });
  return totalWeight > 0 ? Math.round(weightedSum / totalWeight) : null;
};
