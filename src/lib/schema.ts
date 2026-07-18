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

// ── Bloques de transición (Jon, 2026-07-16) ─────────────────────────────────
// Un «puente» / «transición» / «enlace» / «retransición» es un pasaje
// conectivo, no una sección: se dibuja como una FLECHA de izquierda a derecha
// en vez de un bloque relleno (ver TransitionArrow), en cualquier nivel y en
// las tres vistas que pintan esquema (editor, corrección y miniatura de
// clave). Sin acentos y en minúsculas para casar «Transición»/«transicion»/
// «PUENTE» por igual; casa la palabra exacta o como PRIMERA palabra de la
// etiqueta («puente 2», «enlace armónico»), para que la regla sea predecible
// sin depender de mayúsculas.
const TRANSITION_WORDS = new Set(["puente", "transicion", "enlace", "retransicion"]);
export function isTransitionLabel(label?: string | null): boolean {
  if (!label) return false;
  const norm = label.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  if (TRANSITION_WORDS.has(norm)) return true;
  const first = norm.split(/[^a-z]+/).filter(Boolean)[0];
  return first != null && TRANSITION_WORDS.has(first);
}

// Radio de imantación (Jon, 2026-07-06: reducido de 2.8 a 2 — se notaba
// demasiado generoso, imantaba antes de acercar el borde de verdad).
export const SCHEMA_SNAP_THR       = 2;
export const SCHEMA_MIN_DUR        = 2;
export const SCHEMA_CLICK_MS       = 320;
export const SCHEMA_CLICK_MOVE_THR = 6;
export const SCHEMA_CLICK_DUR_FRAC = 0.12;
export const SCHEMA_HND_VISUAL_W   = 6;     // ancho visual del asa (px)
export const SCHEMA_HND_HIT_W      = 40;    // hitbox táctil real del asa (px, A5-16) — zona invisible más ancha que el dibujo
// Ancho de la "cápsula" de asa de borde de bloque en el editor de esquema
// (SegBlocks). Compartida con SchemaExerciseView para pintar su posición en
// vivo durante el arrastre (A7-01 rAF) sin duplicar el número mágico.
export const SCHEMA_CAP_W          = 16;
// Desplazamiento de la cápsula para quedar A RAS del canto VISUAL del bloque
// (Jon, 2026-07-16, v2): los rectángulos se pintan con 1px de inset lateral,
// así que sin esta corrección el asa sobresalía 1px («parecen sobresalir del
// bloque»). El asa se ciñe al borde, dentro del bloque — sin margen ni sombra
// (la v1 con margen de 5px le daba aspecto de objeto flotante aparte).
// Compartida por SegBlocks (render) y SchemaExerciseView (paintDrag).
export const SCHEMA_CAP_INSET      = 1;

// ── Geometría/morfo de las cápsulas de asa (Jon, 2026-07-16, v3) ────────────
// Cada lado del bloque seleccionado tiene UNA sola asa persistente (hl-/hr-)
// que muta entre dos estados: "libre" (a ras dentro del canto, chevron simple,
// canto interior recto) y "compartida" (centrada en la juntura con el vecino
// imantado, chevron doble, redondeada entera). El cambio de estado se anima
// (radio + chevrones siempre; `left` SOLO en reposo — durante un arrastre
// paintDrag pinta left a cada frame y no puede perseguir con easing, por eso
// existe la variante _DRAG). Helpers compartidos por SegBlocks (render) y
// SchemaExerciseView (paintDrag) para que reposo y arrastre coincidan.
export type SchemaCapSide = "l" | "r" | "shared";
export const SCHEMA_CAP_TRANSITION      = "left 160ms ease, border-radius 160ms ease";
export const SCHEMA_CAP_TRANSITION_DRAG = "border-radius 160ms ease";
// Alto del bloque por nivel: la pista mide 62 (Partes) / 52 (Frases) / 44
// (resto) y el bloque va con top:6/bottom:6 → alto = pista − 12.
export const schemaBlockH = (level: number): number =>
  (level === 1 ? 62 : level === 2 ? 52 : 44) - 12;
// Radio exterior de la cápsula — y del propio bloque, para que sus curvas
// coincidan: semicírculo en niveles de píldora (3+), 5px en rectángulos.
export const schemaCapRouter = (level: number): number =>
  level >= 3 ? Math.round(schemaBlockH(level) / 2) : 5;
export const schemaCapRadius = (level: number, side: SchemaCapSide): string => {
  const r = schemaCapRouter(level);
  return side === "shared" ? `${r}px` : side === "l" ? `${r}px 0 0 ${r}px` : `0 ${r}px ${r}px 0`;
};
// `pct` es el borde del bloque (libre) o la juntura (compartida), en % del segmento.
export const schemaCapLeft = (pct: number, side: SchemaCapSide): string =>
  side === "shared" ? `calc(${pct}% - ${SCHEMA_CAP_W / 2}px)`
  : side === "l"    ? `calc(${pct}% + ${SCHEMA_CAP_INSET}px)`
  :                   `calc(${pct}% - ${SCHEMA_CAP_W + SCHEMA_CAP_INSET}px)`;
