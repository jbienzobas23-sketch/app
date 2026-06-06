// ═══ SCORING E INTERVALOS ════════════════════════════════════════════════════
// Funciones puras de puntuación (interactivo, cuestionario, esquema) y utilidades
// de intervalos. Extraídas de App.jsx (Fase 0). Migrado a TypeScript (Fase 3).

export interface Interval { start: number; end: number; fn: string; }
export interface SchemaBlock { level: number; start: number; end: number; }
export interface Question { id: string; type?: string; correctOptionId?: string; }

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
