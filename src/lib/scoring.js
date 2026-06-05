// ═══ SCORING E INTERVALOS ════════════════════════════════════════════════════
// Funciones puras de puntuación (interactivo, cuestionario, esquema) y utilidades
// de intervalos. Extraídas de App.jsx (Fase 0) sin cambiar su lógica.

export const getAt = (intervals, t) => {
  for (const iv of intervals) if (t >= iv.start && t < iv.end) return iv.fn;
  return null;
};

export const resolveOverlap = (existing, newInterval) => {
  const result = [];
  for (const iv of existing) {
    if (iv.end <= newInterval.start || iv.start >= newInterval.end) { result.push(iv); continue; }
    if (iv.start < newInterval.start) result.push({ ...iv, end: newInterval.start });
    if (iv.end > newInterval.end)     result.push({ ...iv, start: newInterval.end });
  }
  return result;
};

export const calcScore = (teacherAns, studentAns, duration, margin = 1) => {
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

export const calcQuestionnaireScore = (questions, answers) => {
  const testQs = (questions || []).filter((q) => q.type === "test" && q.correctOptionId);
  if (testQs.length === 0) return null;
  const correct = testQs.filter((q) => (answers || {})[q.id] === q.correctOptionId).length;
  return Math.round((correct / testQs.length) * 100);
};

export const calcSchemaPlacementScore = (keyBlocks, studentBlocks, margin = 3) => {
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
