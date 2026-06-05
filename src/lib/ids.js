// ═══ IDS Y UTILIDADES MENORES ════════════════════════════════════════════════
// Generación de IDs, toggle inmutable de Set y formateo de tiempo (mm:ss).
// Extraídas de App.jsx (Fase 0) sin cambiar su lógica.

// Formatea segundos como mm:ss.
export const fmt = (s) => {
  const m   = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
};

// ─── Generación de IDs únicos ──────────────────────────────────────────────
// Date.now() solo puede colisionar en operaciones < 1ms; añadir un sufijo
// aleatorio elimina el riesgo y mantiene IDs ordenables por tiempo.
export const uid = (prefix = "id") => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

// ─── Toggle inmutable de un id en un Set ───────────────────────────────────
export const toggleInSet = (set, id) => {
  const n = new Set(set);
  if (n.has(id)) n.delete(id); else n.add(id);
  return n;
};
