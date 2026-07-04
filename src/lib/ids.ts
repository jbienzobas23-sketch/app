// ═══ IDS Y UTILIDADES MENORES ════════════════════════════════════════════════
// Generación de IDs y toggle inmutable de Set. Extraídas de App.jsx (Fase 0).
// Migrado a TypeScript (Fase 3). El formateo de tiempo vive ahora en lib/time.ts
// (fmtClock/fmtPrecise, M3.1).

// ─── Generación de IDs únicos ──────────────────────────────────────────────
// Date.now() solo puede colisionar en operaciones < 1ms; añadir un sufijo
// aleatorio elimina el riesgo y mantiene IDs ordenables por tiempo.
export const uid = (prefix = "id"): string => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

// ─── Toggle inmutable de un id en un Set ───────────────────────────────────
export const toggleInSet = <T>(set: Iterable<T>, id: T): Set<T> => {
  const n = new Set(set);
  if (n.has(id)) n.delete(id); else n.add(id);
  return n;
};
