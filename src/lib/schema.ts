// ═══ CONSTANTES DEL MODELO ESQUEMA ═══════════════════════════════════════════
// Niveles, etiquetas por defecto y umbrales de interacción del editor de esquema.
// Extraídas de App.jsx (Fase 0). Migrado a TypeScript (Fase 3) sin cambiar valores.

export interface SchemaLevel { id: number; sub: string; color: string; bg: string; }

export const SCHEMA_LEVELS: SchemaLevel[] = [
  { id: 1, sub: "Partes",  color: "#B87850", bg: "rgba(184,120,80,0.10)" },
  { id: 2, sub: "Frases",  color: "#5282AA", bg: "rgba(82,130,170,0.08)" },
  { id: 3, sub: "Armonía", color: "#4A9068", bg: "rgba(74,144,104,0.08)" },
  { id: 4, sub: "Texto",   color: "#8A8478", bg: "rgba(138,132,120,0.09)" },
];

export const SCHEMA_DEFAULT_LABELS: Record<number, string[]> = {
  1: ["A", "B", "C", "D", "E", "A'", "B'"],
  2: ["a", "b", "c", "d", "e", "a'", "b'"],
  3: ["Do M", "Re m", "Sol M", "Fa M", "La m", "Mi m", "Si♭ M", "Re M"],
  4: ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"],
};

// Radio de imantación (Jon, 2026-07-06: reducido de 2.8 a 2 — se notaba
// demasiado generoso, imantaba antes de acercar el borde de verdad).
export const SCHEMA_SNAP_THR       = 2;
export const SCHEMA_MIN_DUR        = 2;
export const SCHEMA_CLICK_MS       = 320;
export const SCHEMA_CLICK_MOVE_THR = 6;
export const SCHEMA_CLICK_DUR_FRAC = 0.12;
export const SCHEMA_HND_VISUAL_W   = 6;     // ancho visual del asa (px) — hitbox permanece en SCHEMA_HND_W
