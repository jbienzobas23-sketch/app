// ═══ PALETAS Y COLOR DE BLOQUES DE ESQUEMA ═══════════════════════════════════
// Paletas seleccionables, color automático de partes/frases y color de bloque.
// Extraídas de App.jsx (Fase 0) sin cambiar su lógica.
import { _hexToHsl, _hslToHex, lightenColor } from "./color.js";
import { harmonyBlockColors, type BlockColors } from "./harmony.js";
import { SCHEMA_LEVELS, SCHEMA_SNAP_THR } from "./schema.js";
import type { Exercise, Button } from "./types.js";

export interface Palette { id: string; name: string; parts: string[]; }
interface ColorBlock { customColor?: string; level?: number; label?: string; start: number; end: number; }

// Color de bloque para el nivel de Partes según la etiqueta (modo automático).
export function partBlockColor(label?: string | null): string {
  const s=(label??'').trim().normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
  if(/^reex|^recap/.test(s))          return '#C4A55E'; // casi igual a Exposición
  if(/^expo/.test(s))                  return '#C4985A'; // ámbar cálido
  if(/^desa/.test(s))                  return '#5C78A8'; // azul medio
  if(/^intro/.test(s))                 return '#A88A80'; // neutral cálido ≈ A desaturado
  if(/^coda/.test(s))                  return '#9898A8'; // neutral frío suave
  if(/^puente|^trans|^brid/.test(s))   return '#8E9EAA'; // neutral
  if(/^a[''`´'']?[\d''`´'']*$/.test(s)) return '#C47A72'; // rosa terracota
  if(/^b[''`´'']?[\d''`´'']*$/.test(s)) return '#5E8FA8'; // azul pizarra
  if(/^c[''`´'']?[\d''`´'']*$/.test(s)) return '#C05888'; // rosa-magenta (≈330°)
  if(/^d[''`´'']?[\d''`´'']*$/.test(s)) return '#90B050'; // verde oliva (≈82°)
  if(/^e[''`´'']?[\d''`´'']*$/.test(s)) return '#A87060'; // terracota oscuro
  return '#9090A4'; // fallback neutro
}

// ─── Paletas seleccionables (color.adobe.com) ────────────────────────────────
// Cada paleta define 4 colores base para las PARTES, en el orden A · B · C · D
// (el color de la izquierda en la imagen = A, el segundo = B, etc.).
// Las funciones formales con nombre comparten ranura con sus letras:
//   Exposición / Reexposición / Recapitulación → ranura de A (0)
//   Desarrollo                                   → ranura de B (1)
// Intro · Coda · Puente / Transición se dejan en gris neutro (no son temas).
// La relación PARTE → FRASES sigue la imagen "Relación partes a frases":
//   · la PARTE usa el color base (intenso, columna 1)
//   · la frase "a" es la versión MÁS CLARA  (columna 2)
//   · la frase "b" es la versión INTERMEDIA (columna 3)
// y así sucesivamente para c, d, e… aclarando progresivamente.
export const SCHEMA_PALETTES: Palette[] = [
  { id: "p1", name: "Paleta 1", parts: ["#F78584", "#9FC2FF", "#FFD269", "#98D897"] },
  { id: "p2", name: "Paleta 2", parts: ["#A0EB6E", "#FFAA32", "#FF5C91", "#48BBCD"] },
  { id: "p3", name: "Paleta 3", parts: ["#F1C1D2", "#C1D9BA", "#F25480", "#D882E0"] },
  { id: "p4", name: "Paleta 4", parts: ["#5FB7EF", "#A67597", "#CBE0F8", "#64C6B9"] },
  { id: "p5", name: "Paleta 5", parts: ["#6A4698", "#576B35", "#3B6275", "#7C5065"] },
];
// Paleta por defecto del esquema.
export const SCHEMA_PALETTE_DEFAULT = "p1";
export const getSchemaPalette = (id?: string | null): Palette | null => SCHEMA_PALETTES.find(p => p.id === id) || null;

// Devuelve la paleta efectiva: la del ejercicio si existe, si no la preferencia
// del usuario, y por último la de por defecto (P1).
export function effectivePaletteId(exercise?: Exercise | null, userPref?: string | null): string {
  return (exercise && exercise.schemaPalette) || userPref || SCHEMA_PALETTE_DEFAULT;
}

// Genera hasta 8 colores de CATEGORÍA a partir de los 4 colores base de la
// paleta. Los 4 primeros son los colores tal cual; del 5º al 8º se derivan
// oscureciendo/aclarando para mantener contraste con texto blanco en los botones.
export function getCategoryColorsFromPalette(paletteId?: string | null): string[] {
  const pal = getSchemaPalette(paletteId) || SCHEMA_PALETTES[0];
  const base = pal.parts;
  const out = [...base];
  // Variantes para índices 4..7 (oscurecidas un poco respecto a las base).
  for (let i = 0; i < base.length && out.length < 8; i++) {
    out.push(lightenColor(base[i], -16, 6));
  }
  return out.slice(0, 8);
}

// Devuelve una copia del ejercicio con los colores de los botones de cada
// categoría reasignados según la paleta activa (por índice de botón). No muta
// el original. También fija schemaPalette para que el esquema use la misma.
export function applyPaletteToExercise(exercise: Exercise | null, paletteId: string): Exercise | null {
  if (!exercise) return exercise;
  const colors = getCategoryColorsFromPalette(paletteId);
  const recolorButtons = (buttons?: Button[]): Button[] | undefined =>
    Array.isArray(buttons)
      ? buttons.map((b, i) => ({ ...b, color: colors[i % colors.length] }))
      : buttons;
  const next: Exercise = { ...exercise, schemaPalette: paletteId };
  if (Array.isArray(exercise.categories))
    next.categories = exercise.categories.map(c => ({ ...c, buttons: recolorButtons(c.buttons) }));
  if (Array.isArray(exercise.modes))
    next.modes = exercise.modes.map(c => ({ ...c, buttons: recolorButtons(c.buttons) }));
  return next;
}

// Devuelve el índice de ranura A/B/C/D (0..3) para una etiqueta de PARTE,
// o null si es una sección neutra (intro/coda/puente) sin color temático.
export function partSlotIndex(label?: string | null): number | null {
  const s = (label ?? '').trim().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  if (/^reex|^recap|^expo/.test(s))      return 0;            // A / Exposición / Reexposición
  if (/^desa/.test(s))                   return 1;            // B / Desarrollo
  if (/^intro|^coda|^puente|^trans|^brid/.test(s)) return null; // neutras
  const m = s.match(/^([a-z])[''`´'']?[\d''`´'']*$/);          // a/b/c/d/e con primas
  if (m) return (m[1].charCodeAt(0) - 97) % 4;               // a→0 … e→0 (vuelve a A)
  return null;
}

// Índice de frase a partir de su letra: a→0, b→1, c→2…  (null si no aplica)
export function phraseSlotIndex(label?: string | null): number | null {
  const s = (label ?? '').trim().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const m = s.match(/^([a-z])[''`´'']?[\d''`´'']*$/);
  return m ? (m[1].charCodeAt(0) - 97) : null;
}

// Color de una PARTE según la paleta activa (o automático si paletteId="auto"/null).
export function partColorFromPalette(label?: string | null, paletteId?: string | null): string {
  const pal = getSchemaPalette(paletteId);
  if (!pal) return partBlockColor(label);                    // modo automático original
  const slot = partSlotIndex(label);
  if (slot == null) return '#9CA0AC';                        // neutra → gris
  return pal.parts[slot] ?? pal.parts[0];
}

// Color de una FRASE según su parte madre y la paleta activa.
// Implementa la relación "partes a frases" de la imagen de referencia:
//   · la parte es el color base
//   · la frase "a" es la MÁS CLARA, la "b" INTERMEDIA, etc.
// En la imagen roja de referencia (parte L≈74%) la frase a llega a L≈90% y la
// b a L≈82%: es decir recorre ~64% y ~31% del trayecto que queda HASTA blanco.
// Trabajamos con FRACCIONES de ese margen (no incrementos fijos) para que la
// relación se conserve igual en colores intensos (P5) y en pasteles (P1/P3),
// sin que las frases se saturen en blanco ni se confundan con la parte.
export function phraseColorFromPalette(phraseLabel: string | null | undefined, parentPartColor: string, paletteId?: string | null): string {
  const pal = getSchemaPalette(paletteId);
  const idx = phraseSlotIndex(phraseLabel);
  if (!pal) {
    // Modo automático: se mantiene el aclarado uniforme original.
    return lightenColor(parentPartColor, 18, -8);
  }
  // Fracción del margen L→100 que recorre cada frase, y leve desaturación.
  // a = más clara, b = intermedia; c/d/e continúan alternando.
  const STEPS = [
    [0.64, -7],  // a → la más clara
    [0.31, -2],  // b → intermedia
    [0.80, -10], // c → casi pastel
    [0.47, -4],  // d → media-clara
    [0.92, -12], // e → muy pálida
  ];
  const [frac, sAdd] = STEPS[idx != null && idx < STEPS.length ? idx : 0] ?? STEPS[0];
  const [h, s, l] = _hexToHsl(parentPartColor);
  const newL = l + (100 - l) * frac;            // recorre parte del camino a blanco
  const newS = Math.max(0, Math.min(100, s + sAdd));
  return _hslToHex(h, newS, newL);
}

// Calcula { bg, textColor } para cualquier bloque de esquema, replicando el
// sistema de colores del ejercicio real.
// paletteId: "auto"/null → colores automáticos por etiqueta; "p1".."p5" → paleta seleccionada.
export function schemaBlockColor(b: ColorBlock, allBlocks: ColorBlock[], paletteId: string = SCHEMA_PALETTE_DEFAULT): BlockColors {
  if (b.customColor) return harmonyBlockColors(null, b.customColor);
  if (b.level === 3)  return harmonyBlockColors(b.label, SCHEMA_LEVELS[2].color);
  if (b.level === 1)  return harmonyBlockColors(null, partColorFromPalette(b.label, paletteId));
  if (b.level === 2) {
    const parent = allBlocks.find(p => p.level === 1 && p.start <= b.start + 0.01 && p.end > b.start + 0.01);
    const parentColor = parent ? (parent.customColor || partColorFromPalette(parent.label, paletteId)) : SCHEMA_LEVELS[1].color;
    return harmonyBlockColors(null, phraseColorFromPalette(b.label, parentColor, paletteId));
  }
  return { bg: SCHEMA_LEVELS.find(l => l.id === b.level)?.color ?? "#999", textColor: "#fff" };
}

// Devuelve el punto de `pts` más cercano a `v` dentro del umbral; si ninguno
// está suficientemente cerca, devuelve `v` sin cambios. Usado por el snap del
// modelo Esquema (arrastre de bloques y bordes).
export const snapToNearest = (v: number, pts: number[], thr = SCHEMA_SNAP_THR): number => {
  let best = v, bd = thr + 0.01;
  for (const bv of pts) { const dd = Math.abs(v - bv); if (dd < bd) { bd = dd; best = bv; } }
  return best;
};
