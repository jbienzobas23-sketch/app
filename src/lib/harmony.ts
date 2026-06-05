// ═══ SISTEMA DE COLOR POR TONALIDAD (NIVEL ARMONÍA) ══════════════════════════
// Tabla maestra "tonica|modo" → color, parseo de etiquetas tonales y cálculo de
// colores de bloque. Extraídas de App.jsx (Fase 0). Migrado a TypeScript (Fase 3)
// sin cambiar la lógica.

export type Modo = "mayor" | "menor";
export interface HarmonyParsed { tonica: string; modo: Modo; }
export interface BlockColors { bg: string; textColor: string; }

// Tabla maestra: "tonica|modo" → color hex  (tónica en minúscula, bemoles como "b")
// Orden siguiendo el círculo de quintas del PDF.
export const HARMONY_COLORS: Record<string, string> = {
  "si|mayor":   "#FF4F4F",
  "sol#|menor": "#E64545",
  "lab|menor":  "#E64545",
  "mi|mayor":   "#FF8666",
  "do#|menor":  "#E67658",
  "reb|menor":  "#E67658",
  "la|mayor":   "#FFB86B",
  "fa#|menor":  "#E6A05A",
  "solb|menor": "#E6A05A",
  "re|mayor":   "#FFE66D",
  "si|menor":   "#E6D15A",
  "sol|mayor":  "#C7E96A",
  "mi|menor":   "#AFCF5A",
  "do|mayor":   "#CAEDFB",
  "la|menor":   "#8FC6E8",
  "fa|mayor":   "#FEB8EA",
  "re|menor":   "#E6A3D3",
  "sib|mayor":  "#FE6AB4",
  "sol|menor":  "#D4559A",   // Sol menor = relativa de Sib Mayor
  "mib|mayor":  "#E07FB8",
  "do|menor":   "#B86FA3",
  "lab|mayor":  "#D6A6FF",
  "fa|menor":   "#A98AD6",
  "reb|mayor":  "#A98BFF",
  "sib|menor":  "#7F66C9",
  "solb|mayor": "#9C5ACE",
  "mib|menor":  "#6E3FAF",
};

// Parsea un label y devuelve { tonica, modo } o null.
// Clave: preserva la caja de la M/m original para distinguir Mayor de menor
// ANTES de hacer toLowerCase.
export function parseHarmonyLabel(raw: string | null | undefined): HarmonyParsed | null {
  if (!raw) return null;
  const s = raw.trim();

  // ── 1. Detectar modo mirando el label ORIGINAL (caja preservada) ──────────
  // Probamos de más específico a menos:
  let modo: Modo | null = null;
  let rest = s;

  if (/\bmayor\b/i.test(s))       { modo = "mayor"; rest = s.replace(/\s*\bmayor\b\s*/i, " "); }
  else if (/\bmenor\b/i.test(s))  { modo = "menor"; rest = s.replace(/\s*\bmenor\b\s*/i, " "); }
  else {
    // Abreviatura M o m — debe ser el ÚLTIMO carácter no-espacio
    const lastSig = s.replace(/\s+$/, "").slice(-1);
    if (lastSig === "M")       { modo = "mayor"; rest = s.replace(/\s*M\s*$/, ""); }
    else if (lastSig === "m")  { modo = "menor"; rest = s.replace(/\s*m\s*$/, ""); }
  }
  if (!modo) return null;

  // ── 2. Normalizar la tónica ───────────────────────────────────────────────
  let t = rest.trim().toLowerCase();

  // Bemoles escritos con "b" pegado (Sib, Mib, Lab, Reb, Solb)
  // Convertir a forma interna con "b" al final de la nota (ya en minúscula)
  // Sólo si el "b" sigue INMEDIATAMENTE a la nota sin espacio:
  t = t.replace(/\s+/g, "");   // "Sol b" → "solb", "Do #" → "do#"
  t = t.replace(/♭/g, "b").replace(/♯/g, "#");

  // Enarmónicos → forma canónica del mapa
  const ENARM: Record<string, string> = { "re#": "mib", "mi#": "fa", "la#": "sib", "si#": "do" };
  t = ENARM[t] ?? t;

  return { tonica: t, modo };
}

// Devuelve { bg, textColor } para un bloque del nivel Armonía.
export function harmonyBlockColors(label: string, fallbackColor: string): BlockColors {
  const parsed = parseHarmonyLabel(label);
  let bg = fallbackColor;
  if (parsed) {
    const key = `${parsed.tonica}|${parsed.modo}`;
    bg = HARMONY_COLORS[key] ?? fallbackColor;
  }
  if (!bg || bg[0] !== "#") return { bg: bg || fallbackColor, textColor: "#FFFFFF" };
  const r = parseInt(bg.slice(1, 3), 16) / 255;
  const g = parseInt(bg.slice(3, 5), 16) / 255;
  const b = parseInt(bg.slice(5, 7), 16) / 255;
  const lin = (c: number) => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  const L   = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return { bg, textColor: L > 0.35 ? "#1C1A14" : "#FFFFFF" };
}
