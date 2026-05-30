import React, { useState, useEffect, useLayoutEffect, useRef, useMemo } from "react";
/* ═══════════════════════════════════════════════════════════════════════════
   FUNCIONES ARMÓNICAS · APP ROOT
   ───────────────────────────────────────────────────────────────────────────
   Estructura del archivo:
     0. Hash router (#/… → navegación por URL, atrás/adelante, enlaces)
     1. Design tokens (colores, fuentes, estilos base)
     2. Constantes de dominio (categorías por defecto, ejercicios iniciales…)
     3. Utilidades puras (audio, intervalos, scoring, criptografía)
     4. Helpers de forma de dominio (categoriesOf, answerFor, modelOf…)
     5. Primitivos UI compartidos (ModalShell, TabBar, ScoreBadge…)
     6. Vistas de autenticación
     7. Vistas de alumno
     8. Reproductor de audio compartido (hook + waveform)
     9. ExerciseView (sesión interactiva)
    10. CorrectionView · QuestionnaireView
    11. Dashboard del profesor + pestañas
    12. ExerciseDetailView
    13. QuestionManagerView + QuestionEditorModal
    14. Modales restantes (categorías, cursos, usuarios, audio library)
    15. App root (estado global + Supabase + routing)
   ═══════════════════════════════════════════════════════════════════════════ */

// ═══ 0. HASH ROUTER ═════════════════════════════════════════════════════════
// Enrutado por almohadilla (#/…). Funciona en cualquier hosting estático
// (incluido Vercel) SIN configuración extra: todo lo que va detrás de "#" lo
// gestiona el navegador en el cliente, así que recargar o pegar un enlace
// profundo nunca da 404. La URL es la fuente de verdad de la navegación de alto
// nivel; el contexto de ejercicio se reconstruye a partir del id de la URL.
//
// Mapa de rutas:
//   /                                  → inicio (elegir rol)
//   /entrar/profesor · /entrar/alumno  → login
//   /configuracion                     → setup del primer admin
//   /alumno                            → panel alumno · todos los ejercicios
//   /alumno/cursos                     → panel alumno · por cursos
//   /alumno/elegir-profesor            → selección de profesor
//   /alumno/ejercicio/:id              → sesión de ejercicio (alumno)
//   /alumno/ejercicio/:id/correccion   → corrección (alumno)
//   /profesor                          → panel profesor · ejercicios
//   /profesor/cursos|alumnos|categorias|audios|ajustes|usuarios → pestañas
//   /profesor/ejercicio/nuevo          → crear ejercicio
//   /profesor/ejercicio/:id            → detalle del ejercicio
//   /profesor/ejercicio/:id/grabar     → grabar clave (interactivo/esquema)
//   /profesor/ejercicio/:id/previsualizar → previsualizar esquema
//   /profesor/ejercicio/:id/preguntas  → gestor de preguntas (cuestionario)
//   /profesor/ejercicio/:id/correccion → corrección (previsualización)

function parseHash() {
  let h = (typeof window !== "undefined" && window.location.hash) || "";
  if (h.startsWith("#")) h = h.slice(1);
  const q = h.indexOf("?");
  if (q >= 0) h = h.slice(0, q);
  return h.split("/").filter(Boolean).map((s) => {
    try { return decodeURIComponent(s); } catch { return s; }
  });
}

// Segmentos de URL → ruta lógica { name, params }
function routeFromSegments(segs) {
  const [a, b, c, d] = segs;
  if (!a) return { name: "home", params: {} };
  if (a === "configuracion") return { name: "setup", params: {} };

  if (a === "entrar") {
    const role = b === "profesor" ? "teacher" : b === "alumno" ? "student" : null;
    return role ? { name: "login", params: { role } } : { name: "home", params: {} };
  }

  if (a === "alumno") {
    if (b === "elegir-profesor") return { name: "pick-teacher", params: {} };
    if (b === "ejercicio" && c) {
      if (d === "correccion") return { name: "correction", params: { exId: c, from: "student" } };
      return { name: "session", params: { exId: c, mode: "student" } };
    }
    if (b === "cursos") return { name: "student", params: { tab: "courses" } };
    return { name: "student", params: { tab: "all" } };
  }

  if (a === "profesor") {
    if (b === "ejercicio" && c) {
      if (d === "grabar")        return { name: "session", params: { exId: c, mode: "record" } };
      if (d === "previsualizar") return { name: "session", params: { exId: c, mode: "preview" } };
      if (d === "preguntas")     return { name: "question-manager", params: { exId: c } };
      if (d === "correccion")    return { name: "correction", params: { exId: c, from: "teacher" } };
      return { name: "teacher-detail", params: { exId: c } };
    }
    const TAB = {
      cursos: "courses", alumnos: "students", categorias: "categories",
      audios: "audios", ajustes: "settings", usuarios: "users",
    };
    return { name: "teacher", params: { tab: (b && TAB[b]) || "exercises" } };
  }

  return { name: "home", params: {} };
}

// Pestaña interna del profesor → ruta
const TEACHER_TAB_PATH = {
  exercises: "/profesor", courses: "/profesor/cursos", students: "/profesor/alumnos",
  categories: "/profesor/categorias", audios: "/profesor/audios",
  settings: "/profesor/ajustes", users: "/profesor/usuarios",
};

// Hook de enrutado: devuelve la ruta actual y un navegador.
function useHashRoute() {
  const [segs, setSegs] = useState(() => parseHash());

  useEffect(() => {
    const onChange = () => setSegs(parseHash());
    window.addEventListener("hashchange", onChange);
    if (!window.location.hash) { window.history.replaceState(null, "", "#/"); }
    return () => window.removeEventListener("hashchange", onChange);
  }, []);

  const navigate = (path, opts = {}) => {
    const next = path.startsWith("/") ? path : "/" + path;
    const current = window.location.hash.replace(/^#/, "") || "/";
    if (current === next) return;
    if (opts.replace) {
      window.history.replaceState(null, "", "#" + next);
      setSegs(parseHash());
    } else {
      window.location.hash = next; // dispara "hashchange"
    }
  };

  const route = useMemo(() => routeFromSegments(segs), [segs]);
  return { route, navigate };
}

// ═══ 1. DESIGN TOKENS ═══════════════════════════════════════════════════════
const C = {
  // Base palette
  bg: "#f8f8f6", paper: "#ffffff", paper2: "#f0f0ee",
  ink: "#1a1a1a", ink2: "#555555", muted: "#b0b0a8", muted2: "#b0b0a8", line: "#e6e6e3",
  // V0_9 aliases (usados por primitivos compartidos)
  border: "#e6e6e3", rail: "#e0e0db", chevron: "#c0c0b8",
  chipBg: "#f0f0ee", chipInk: "#888888", tabOff: "#aaaaaa",
  noteBg: "#fffaeb", noteInk: "#c07427",
  field: "#fcfcfb", fieldFocus: "#555",
  // Colores funcionales — sin cambios
  fnT: "#3F9B5B", fnS: "#2F6FB8", fnD: "#C77A1A",
  fnI: "#9A4FB8", fnIV: "#3A8CA8", fnV: "#C9A33A",
  quiz: "#2F6FB8",
  danger: "#B84A3A",
};

const FONT_SANS  = "'Outfit', system-ui, sans-serif";
const FONT_SERIF = "'Cormorant Garamond', Georgia, serif";
const FONT_MONO  = "'Outfit', system-ui, sans-serif";
const F = { serif: FONT_SERIF, sans: FONT_SANS };

const S = {
  app:        { fontFamily: FONT_SANS, background: C.bg, minHeight: "100vh", color: C.ink },
  page:       { maxWidth: 740, margin: "0 auto", padding: "calc(22px + env(safe-area-inset-top,0px)) 24px 40px" },
  card:       { background: C.paper, border: `1px solid ${C.line}`, borderRadius: 8, padding: "14px 18px", marginBottom: 12 },
  h1:         { fontFamily: FONT_SERIF, fontSize: 32, fontWeight: 600, margin: 0, color: C.ink, letterSpacing: "-0.01em", lineHeight: 1 },
  h2:         { fontFamily: FONT_SERIF, fontSize: 22, fontWeight: 600, margin: "0 0 12px", color: C.ink, letterSpacing: "-0.01em" },
  label:      { fontSize: 11, color: "#999", marginBottom: 6, display: "block", fontFamily: FONT_SANS, fontWeight: 500 },
  btn:        { background: C.paper, border: `1px solid ${C.line}`, color: "#555", borderRadius: 7, padding: "7px 14px", cursor: "pointer", fontSize: 13, fontWeight: 500, fontFamily: FONT_SANS },
  btnPrimary: { background: C.ink, border: `1px solid ${C.ink}`, color: "#fff", borderRadius: 7, padding: "7px 15px", cursor: "pointer", fontSize: 12, fontWeight: 500, fontFamily: FONT_SANS },
  btnDanger:  { background: "transparent", border: `1px solid rgba(184,74,58,0.4)`, color: C.danger, borderRadius: 7, padding: "5px 12px", cursor: "pointer", fontSize: 12, fontWeight: 500, fontFamily: FONT_SANS },
  input:      { background: C.field, border: `1px solid ${C.line}`, borderRadius: 7, color: C.ink, padding: "9px 12px", fontSize: 13, width: "100%", boxSizing: "border-box", fontFamily: FONT_SANS, outline: "none" },
  row:        { display: "flex", alignItems: "center", gap: 10 },
  badge:      { fontSize: 11, padding: "2px 8px", borderRadius: 4, fontWeight: 600 },
  divider:    { border: "none", borderTop: `1px solid ${C.line}`, margin: "16px 0" },
};

const SECTION_STYLE = {
  fontSize: 10, fontWeight: 700, letterSpacing: "0.15em",
  textTransform: "uppercase", color: C.chevron, margin: "0 0 14px",
  fontFamily: FONT_SANS,
};

// ═══ 2. CONSTANTES DE DOMINIO ═══════════════════════════════════════════════
const DEFAULT_CATEGORY = {
  id: "default", name: "Funciones armónicas (T/S/D)", builtIn: true,
  buttons: [
    { id: "T", name: "Tónica",       color: "#3F9B5B", key: "a" },
    { id: "S", name: "Subdominante", color: "#2F6FB8", key: "s" },
    { id: "D", name: "Dominante",    color: "#C77A1A", key: "d" },
  ],
};
const CATEGORY_COLORS = ["#3F9B5B","#2F6FB8","#C77A1A","#B84A3A","#9A4FB8","#C75A8E","#3A8CA8","#C9A33A"];
const KEY_SEQUENCE    = ["a","s","d","f","j","k","l","g"];
const VISIBLE_SECS    = 10;
const COURSE_ACCENTS  = ["#3F9B5B","#2F6FB8","#C77A1A","#9A4FB8","#3A8CA8","#B84A3A"];

const EXERCISE_MODELS = [
  { id: "interactivo",  name: "Interactivo",  description: "El alumno marca categorías en vivo durante el audio." },
  { id: "cuestionario", name: "Cuestionario", description: "Preguntas ancladas a fragmentos concretos del audio." },
  { id: "esquema",      name: "Esquema",      description: "El alumno dibuja bloques de forma musical en una línea de tiempo multinivel." },
];
const DEFAULT_MODEL_ID = "interactivo";

// Opciones de combinación de modelos para el editor (incluye modelos individuales + combos dobles)
const MODEL_COMBOS = [
  { id: "interactivo",              models: ["interactivo"],                name: "Interactivo",                description: "El alumno marca categorías en vivo durante el audio." },
  { id: "cuestionario",             models: ["cuestionario"],               name: "Cuestionario",               description: "Preguntas ancladas a fragmentos concretos del audio." },
  { id: "esquema",                  models: ["esquema"],                    name: "Esquema",                    description: "El alumno dibuja bloques de forma musical en una línea de tiempo." },
  { id: "interactivo+cuestionario", models: ["interactivo","cuestionario"], name: "Interactivo + Cuestionario", description: "El alumno puede alternar entre marcado en vivo y cuestionario de preguntas." },
  { id: "esquema+cuestionario",     models: ["esquema","cuestionario"],     name: "Esquema + Cuestionario",     description: "El alumno puede alternar entre el esquema formal y el cuestionario." },
];

// Devuelve el comboId a partir de un array de modelos (para inicializar el editor)
function comboIdFromModels(models) {
  if (!Array.isArray(models) || models.length === 0) return DEFAULT_MODEL_ID;
  if (models.length === 1) return models[0];
  const has = (m) => models.includes(m);
  if (has("interactivo") && has("cuestionario")) return "interactivo+cuestionario";
  if (has("esquema")     && has("cuestionario")) return "esquema+cuestionario";
  return models[0];
}

// Constantes del modelo Esquema
const SCHEMA_LEVELS = [
  { id: 1, sub: "Partes",  color: "#B87850", bg: "rgba(184,120,80,0.10)" },
  { id: 2, sub: "Frases",  color: "#5282AA", bg: "rgba(82,130,170,0.08)" },
  { id: 3, sub: "Armonía", color: "#4A9068", bg: "rgba(74,144,104,0.08)" },
  { id: 4, sub: "Texto",   color: "#8A8478", bg: "rgba(138,132,120,0.09)" },
];
const SCHEMA_DEFAULT_LABELS = {
  1: ["A", "B", "C", "D", "E", "A'", "B'"],
  2: ["a", "b", "c", "d", "e", "a'", "b'"],
  3: ["Do M", "Re m", "Sol M", "Fa M", "La m", "Mi m", "Si♭ M", "Re M"],
  4: ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"],
};
// Calcula { bg, textColor } para cualquier bloque de esquema, replicando el sistema de colores del ejercicio real.
// paletteId: "auto"/null → colores automáticos por etiqueta; "p1".."p5" → paleta seleccionada.
function schemaBlockColor(b, allBlocks, paletteId = SCHEMA_PALETTE_DEFAULT) {
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

const SCHEMA_SNAP_THR       = 2.8;
const SCHEMA_MIN_DUR        = 2;
const SCHEMA_CLICK_MS       = 320;
const SCHEMA_CLICK_MOVE_THR = 6;
const SCHEMA_CLICK_DUR_FRAC = 0.12;
const SCHEMA_HND_VISUAL_W   = 6;     // ancho visual del asa (px) — hitbox permanece en SCHEMA_HND_W

// ─── Sistema de color por tonalidad (nivel Armonía) ──────────────────────────
// Tabla maestra: "tonica|modo" → color hex  (tónica en minúscula, bemoles como "b")
// Orden siguiendo el círculo de quintas del PDF.
const HARMONY_COLORS = {
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
  "fa#|menor":  "#D4559A",   // Fa# menor = relativa de Sib Mayor (enarmónico Solb menor)
  "solb|menor": "#D4559A",
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
function parseHarmonyLabel(raw) {
  if (!raw) return null;
  const s = raw.trim();

  // ── 1. Detectar modo mirando el label ORIGINAL (caja preservada) ──────────
  // Probamos de más específico a menos:
  let modo = null;
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
  const ENARM = { "re#":"mib", "mi#":"fa", "la#":"sib", "si#":"do" };
  t = ENARM[t] ?? t;

  return { tonica: t, modo };
}

// Devuelve { bg, textColor } para un bloque del nivel Armonía.
function harmonyBlockColors(label, fallbackColor) {
  const parsed = parseHarmonyLabel(label);
  let bg = fallbackColor;
  if (parsed) {
    const key = `${parsed.tonica}|${parsed.modo}`;
    bg = HARMONY_COLORS[key] ?? fallbackColor;
  }
  if (!bg || bg[0] !== "#") return { bg: bg || fallbackColor, textColor: "#FFFFFF" };
  const r = parseInt(bg.slice(1,3),16)/255;
  const g = parseInt(bg.slice(3,5),16)/255;
  const b = parseInt(bg.slice(5,7),16)/255;
  const lin = c => c <= 0.04045 ? c/12.92 : Math.pow((c+0.055)/1.055, 2.4);
  const L   = 0.2126*lin(r) + 0.7152*lin(g) + 0.0722*lin(b);
  return { bg, textColor: L > 0.35 ? "#1C1A14" : "#FFFFFF" };
}

// ─── Utilidades de color para Partes y Frases ────────────────────────────────
function _hexToHsl(hex) {
  const r=parseInt(hex.slice(1,3),16)/255,g=parseInt(hex.slice(3,5),16)/255,b=parseInt(hex.slice(5,7),16)/255;
  const max=Math.max(r,g,b),min=Math.min(r,g,b),l=(max+min)/2;
  let h=0,s=0;
  if(max!==min){const d=max-min;s=l>0.5?d/(2-max-min):d/(max+min);
    switch(max){case r:h=((g-b)/d+(g<b?6:0))/6;break;case g:h=((b-r)/d+2)/6;break;case b:h=((r-g)/d+4)/6;break;}}
  return [h*360,s*100,l*100];
}
function _hslToHex(h,s,l) {
  h/=360;s/=100;l/=100;
  const hr=(p,q,t)=>{if(t<0)t+=1;if(t>1)t-=1;if(t<1/6)return p+(q-p)*6*t;if(t<1/2)return q;if(t<2/3)return p+(q-p)*(2/3-t)*6;return p;};
  let r,g,b;
  if(s===0){r=g=b=l;}else{const q=l<0.5?l*(1+s):l+s-l*s,p=2*l-q;r=hr(p,q,h+1/3);g=hr(p,q,h);b=hr(p,q,h-1/3);}
  return '#'+[r,g,b].map(x=>Math.round(x*255).toString(16).padStart(2,'0')).join('');
}
function lightenColor(hex,lAdd=18,sAdd=-8){const[h,s,l]=_hexToHsl(hex);return _hslToHex(h,Math.max(0,Math.min(100,s+sAdd)),Math.max(0,Math.min(100,l+lAdd)));}

// Color de bloque para el nivel de Partes según la etiqueta
function partBlockColor(label) {
  const s=(label??'').trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
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
const SCHEMA_PALETTES = [
  { id: "p1", name: "Paleta 1", parts: ["#F78584", "#9FC2FF", "#FFD269", "#98D897"] },
  { id: "p2", name: "Paleta 2", parts: ["#A0EB6E", "#FFAA32", "#FF5C91", "#48BBCD"] },
  { id: "p3", name: "Paleta 3", parts: ["#F1C1D2", "#C1D9BA", "#F25480", "#D882E0"] },
  { id: "p4", name: "Paleta 4", parts: ["#5FB7EF", "#A67597", "#CBE0F8", "#64C6B9"] },
  { id: "p5", name: "Paleta 5", parts: ["#6A4698", "#576B35", "#3B6275", "#7C5065"] },
];
// Paleta por defecto del esquema.
const SCHEMA_PALETTE_DEFAULT = "p1";
const getSchemaPalette = (id) => SCHEMA_PALETTES.find(p => p.id === id) || null;

// Devuelve la paleta efectiva: la del ejercicio si existe, si no la preferencia
// del usuario, y por último la de por defecto (P1).
function effectivePaletteId(exercise, userPref) {
  return (exercise && exercise.schemaPalette) || userPref || SCHEMA_PALETTE_DEFAULT;
}

// Genera hasta 8 colores de CATEGORÍA a partir de los 4 colores base de la
// paleta. Los 4 primeros son los colores tal cual; del 5º al 8º se derivan
// oscureciendo/aclarando para mantener contraste con texto blanco en los botones.
function getCategoryColorsFromPalette(paletteId) {
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
function applyPaletteToExercise(exercise, paletteId) {
  if (!exercise) return exercise;
  const colors = getCategoryColorsFromPalette(paletteId);
  const recolorButtons = (buttons) =>
    Array.isArray(buttons)
      ? buttons.map((b, i) => ({ ...b, color: colors[i % colors.length] }))
      : buttons;
  const next = { ...exercise, schemaPalette: paletteId };
  if (Array.isArray(exercise.categories))
    next.categories = exercise.categories.map(c => ({ ...c, buttons: recolorButtons(c.buttons) }));
  if (Array.isArray(exercise.modes))
    next.modes = exercise.modes.map(c => ({ ...c, buttons: recolorButtons(c.buttons) }));
  return next;
}

// Devuelve el índice de ranura A/B/C/D (0..3) para una etiqueta de PARTE,
// o null si es una sección neutra (intro/coda/puente) sin color temático.
function partSlotIndex(label) {
  const s = (label ?? '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (/^reex|^recap|^expo/.test(s))      return 0;            // A / Exposición / Reexposición
  if (/^desa/.test(s))                   return 1;            // B / Desarrollo
  if (/^intro|^coda|^puente|^trans|^brid/.test(s)) return null; // neutras
  const m = s.match(/^([a-z])[''`´'']?[\d''`´'']*$/);          // a/b/c/d/e con primas
  if (m) return (m[1].charCodeAt(0) - 97) % 4;               // a→0 … e→0 (vuelve a A)
  return null;
}

// Índice de frase a partir de su letra: a→0, b→1, c→2…  (null si no aplica)
function phraseSlotIndex(label) {
  const s = (label ?? '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const m = s.match(/^([a-z])[''`´'']?[\d''`´'']*$/);
  return m ? (m[1].charCodeAt(0) - 97) : null;
}

// Color de una PARTE según la paleta activa (o automático si paletteId="auto"/null).
function partColorFromPalette(label, paletteId) {
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
function phraseColorFromPalette(phraseLabel, parentPartColor, paletteId) {
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

const INIT_EXERCISES = [
  {
    id: 2, title: "Minueto – Mozart", duration: 24,
    audioUrl: null, audioName: null, showHint: false, model: "interactivo",
    categories: [DEFAULT_CATEGORY],
    answers: {
      [DEFAULT_CATEGORY.id]: [
        { fn: "T", start: 0, end: 4 }, { fn: "S", start: 4, end: 8 },
        { fn: "D", start: 8, end: 12 }, { fn: "T", start: 12, end: 16 },
        { fn: "D", start: 16, end: 20 }, { fn: "T", start: 20, end: 24 },
      ],
    },
  },
  {
    id: 3, title: "Ejercicio libre", duration: 20,
    audioUrl: null, audioName: null, showHint: false, model: "interactivo",
    categories: [DEFAULT_CATEGORY], answers: {},
  },
  {
    id: 4, title: "Análisis – Cuestionario demo", duration: 30,
    audioUrl: null, audioName: null, showHint: false, model: "cuestionario",
    categories: [], answers: {},
    questions: [
      {
        id: "q-demo-1",
        text: "¿Qué función armónica predomina en los primeros 8 segundos?",
        audioStart: 0, audioEnd: 8, type: "test",
        options: [{ id: "A", text: "Tónica" }, { id: "B", text: "Subdominante" }, { id: "C", text: "Dominante" }],
        correctOptionId: "A",
      },
      {
        id: "q-demo-2",
        text: "¿Qué tipo de cadencia concluye el fragmento entre 0:10 y 0:18?",
        audioStart: 10, audioEnd: 18, type: "test",
        options: [{ id: "A", text: "Cadencia auténtica perfecta" }, { id: "B", text: "Cadencia plagal" }, { id: "C", text: "Semicadencia" }],
        correctOptionId: "C",
      },
      {
        id: "q-demo-3",
        text: "Describe con tus propias palabras el carácter expresivo del fragmento final.",
        audioStart: 20, audioEnd: 30, type: "desarrollo",
        options: [], correctOptionId: null,
      },
    ],
  },
];

// ─── Biblioteca de audios inicial (datos de demostración) ───────────────────
const INIT_AUDIO_LIBRARY = [
  {
    id: "audio-demo-01",
    title: "Sinfonía nº 40 en sol menor – I. Molto allegro",
    composer: "Wolfgang Amadeus Mozart",
    description: "K. 550. Exposición con dos grupos temáticos contrastantes.",
    tags: ["Forma sonata", "Clasicismo", "Modo menor", "Sinfonía"],
    url: "https://res.cloudinary.com/demo/video/upload/fake_mozart_40.mp3",
    duration: 186,
    createdAt: 1700000001000,
  },
  {
    id: "audio-demo-02",
    title: "Sinfonía nº 5 en do menor – I. Allegro con brio",
    composer: "Ludwig van Beethoven",
    description: "Op. 67. Motivo de cuatro notas. Desarrollo con modulación a Mi♭ Mayor.",
    tags: ["Forma sonata", "Clasicismo tardío", "Modo menor", "Sinfonía", "Modulación"],
    url: "https://res.cloudinary.com/demo/video/upload/fake_beethoven_5.mp3",
    duration: 220,
    createdAt: 1700000002000,
  },
  {
    id: "audio-demo-03",
    title: "Preludio op. 28 nº 4 en mi menor",
    composer: "Frédéric Chopin",
    description: "Textura homofónica. Cromatismo descendente en el bajo.",
    tags: ["Romanticismo", "Cromatismo", "Modo menor", "Piano"],
    url: "https://res.cloudinary.com/demo/video/upload/fake_chopin_prelude4.mp3",
    duration: 148,
    createdAt: 1700000003000,
  },
  {
    id: "audio-demo-04",
    title: "Coral BWV 227 – Jesu, meine Freude",
    composer: "Johann Sebastian Bach",
    description: "Mi menor. Cuatro voces mixtas. Contrapunto imitativo.",
    tags: ["Barroco", "Coral", "Contrapunto", "Modo menor"],
    url: "https://res.cloudinary.com/demo/video/upload/fake_bach_bwv227.mp3",
    duration: 134,
    createdAt: 1700000004000,
  },
  {
    id: "audio-demo-05",
    title: "Cuarteto de cuerdas op. 76 nº 3 – II. Poco adagio",
    composer: "Joseph Haydn",
    description: "Do Mayor. Tema con variaciones. Conocido como «El Emperador».",
    tags: ["Clasicismo", "Tema y variaciones", "Modo mayor", "Música de cámara"],
    url: "https://res.cloudinary.com/demo/video/upload/fake_haydn_emperor.mp3",
    duration: 272,
    createdAt: 1700000005000,
  },
  {
    id: "audio-demo-06",
    title: "Nocturno op. 9 nº 2 en Mi♭ Mayor",
    composer: "Frédéric Chopin",
    description: "Melodía ornamentada sobre acompañamiento de vals. Cadencia libre.",
    tags: ["Romanticismo", "Modo mayor", "Piano", "Ornamentación"],
    url: "https://res.cloudinary.com/demo/video/upload/fake_chopin_nocturne.mp3",
    duration: 244,
    createdAt: 1700000006000,
  },
  {
    id: "audio-demo-07",
    title: "Tocata y Fuga en re menor BWV 565",
    composer: "Johann Sebastian Bach",
    description: "Re menor. Estructura libre en la tocata; fuga a cuatro voces.",
    tags: ["Barroco", "Fuga", "Modo menor", "Órgano"],
    url: "https://res.cloudinary.com/demo/video/upload/fake_bach_toccata.mp3",
    duration: 198,
    createdAt: 1700000007000,
  },
  {
    id: "audio-demo-08",
    title: "Sinfonía nº 9 en re menor – IV. Finale",
    composer: "Ludwig van Beethoven",
    description: "Op. 125. Estructura de variaciones. Coro y solistas vocales.",
    tags: ["Clasicismo tardío", "Modo menor", "Sinfonía", "Modulación", "Vocal"],
    url: "https://res.cloudinary.com/demo/video/upload/fake_beethoven_9.mp3",
    duration: 310,
    createdAt: 1700000008000,
  },
];

// ═══ 3. UTILIDADES PURAS ════════════════════════════════════════════════════

// ─── Tiempo · intervalos · scoring ─────────────────────────────────────────
const fmt = (s) => {
  const m   = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
};

const getAt = (intervals, t) => {
  for (const iv of intervals) if (t >= iv.start && t < iv.end) return iv.fn;
  return null;
};

const resolveOverlap = (existing, newInterval) => {
  const result = [];
  for (const iv of existing) {
    if (iv.end <= newInterval.start || iv.start >= newInterval.end) { result.push(iv); continue; }
    if (iv.start < newInterval.start) result.push({ ...iv, end: newInterval.start });
    if (iv.end > newInterval.end)     result.push({ ...iv, start: newInterval.end });
  }
  return result;
};

const calcScore = (teacherAns, studentAns, duration, margin = 1) => {
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

const calcQuestionnaireScore = (questions, answers) => {
  const testQs = (questions || []).filter((q) => q.type === "test" && q.correctOptionId);
  if (testQs.length === 0) return null;
  const correct = testQs.filter((q) => (answers || {})[q.id] === q.correctOptionId).length;
  return Math.round((correct / testQs.length) * 100);
};

const calcSchemaPlacementScore = (keyBlocks, studentBlocks, margin = 3) => {
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

// ─── Colores derivados ─────────────────────────────────────────────────────
const textOn = (hex) => {
  if (!hex || hex[0] !== "#") return "#000";
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${Math.round(r * 0.18)},${Math.round(g * 0.18)},${Math.round(b * 0.18)})`;
};

const scoreColor = (sc) =>
  sc == null   ? C.muted :
  sc >= 80     ? C.fnT :
  sc >= 50     ? C.fnD :
                 C.danger;

const scoreBg = (sc) =>
  sc == null   ? C.line :
  sc >= 80     ? "rgba(63,155,91,0.16)" :
  sc >= 50     ? "rgba(199,122,26,0.20)" :
                 "rgba(184,74,58,0.16)";

// ─── Generación de IDs únicos ──────────────────────────────────────────────
// Date.now() solo puede colisionar en operaciones < 1ms; añadir un sufijo
// aleatorio elimina el riesgo y mantiene IDs ordenables por tiempo.
const uid = (prefix = "id") => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

// ─── Toggle inmutable de un id en un Set ───────────────────────────────────
const toggleInSet = (set, id) => {
  const n = new Set(set);
  if (n.has(id)) n.delete(id); else n.add(id);
  return n;
};

// ─── Helpers del modelo Esquema (snap + push) ──────────────────────────────
// excludeIds: string | string[] | null
function schemaSnapTime(t, blocks, excludeIds, duration, marks = []) {
  const excl = excludeIds == null ? [] : Array.isArray(excludeIds) ? excludeIds : [excludeIds];
  const bounds = [0, duration, ...marks, ...blocks.filter(b => !excl.includes(b.id) && !b.isPreview).flatMap(b => [b.start, b.end])];
  let best = t, bestDist = SCHEMA_SNAP_THR + 0.01;
  for (const bv of bounds) { const d = Math.abs(t - bv); if (d < bestDist) { bestDist = d; best = bv; } }
  return best;
}
// Snap con prioridad al cursor de reproducción sobre los límites de bloque
function schemaSnapWithPlayhead(t, blocks, excludeIds, duration, playhead, marks = []) {
  if (Math.abs(t - playhead) <= SCHEMA_SNAP_THR) return playhead;
  return schemaSnapTime(t, blocks, excludeIds, duration, marks);
}

function schemaApplyPush(blocks, movedId, level, duration) {
  const same = blocks
    .filter(b => b.level === level && !b.isPreview)
    .map(b => ({ ...b }))
    .sort((a, b) => a.start !== b.start ? a.start - b.start : a.id < b.id ? -1 : 1);
  const mi = same.findIndex(b => b.id === movedId);
  if (mi < 0) return blocks;
  for (let i = mi; i < same.length - 1; i++) {
    if (same[i].end > same[i + 1].start) { const dur = same[i + 1].end - same[i + 1].start; same[i + 1].start = same[i].end; same[i + 1].end = same[i + 1].start + dur; } else break;
  }
  for (let i = mi; i > 0; i--) {
    if (same[i - 1].end > same[i].start) { const dur = same[i - 1].end - same[i - 1].start; same[i - 1].end = same[i].start; same[i - 1].start = same[i - 1].end - dur; } else break;
  }
  for (let i = same.length - 1; i >= 0; i--) {
    if (same[i].end > duration) {
      const dur = same[i].end - same[i].start; same[i].end = duration; same[i].start = duration - dur;
      for (let j = i - 1; j >= 0; j--) {
        if (same[j].end > same[j + 1].start) { const d = same[j].end - same[j].start; same[j].end = same[j + 1].start; same[j].start = same[j].end - d; } else break;
      }
    }
  }
  for (let i = 0; i < same.length; i++) {
    if (same[i].start < 0) {
      const dur = same[i].end - same[i].start; same[i].start = 0; same[i].end = dur;
      for (let j = i + 1; j < same.length; j++) {
        if (same[j].start < same[j - 1].end) { const d = same[j].end - same[j].start; same[j].start = same[j - 1].end; same[j].end = same[j].start + d; } else break;
      }
    }
  }
  const map = new Map(same.map(b => [b.id, b]));
  return blocks.map(b => (map.has(b.id) ? map.get(b.id) : b));
}

// ─── Drag de puntero unificado (ratón + touch) ─────────────────────────────
function startPointerDrag(event, { onStart, onMove, onEnd } = {}) {
  event.preventDefault();
  const getX = (ev) => ev.touches?.[0]?.clientX ?? ev.changedTouches?.[0]?.clientX ?? ev.clientX;
  onStart?.(event, getX);
  const move = (ev) => { if (ev.cancelable) ev.preventDefault(); onMove?.(ev, getX); };
  const end  = () => {
    window.removeEventListener("mousemove", move);
    window.removeEventListener("mouseup",   end);
    window.removeEventListener("touchmove", move);
    window.removeEventListener("touchend",  end);
    window.removeEventListener("touchcancel", end);
    onEnd?.();
  };
  window.addEventListener("mousemove", move);
  window.addEventListener("mouseup",   end);
  window.addEventListener("touchmove", move, { passive: false });
  window.addEventListener("touchend",  end);
  window.addEventListener("touchcancel", end);
}

// ─── Audio: decoding y waveform ────────────────────────────────────────────
function smoothArray(raw, W) {
  const n = raw.length;
  const out = new Array(n);
  let sum = 0, size = 0;
  for (let j = 0; j <= Math.min(W, n - 1); j++) { sum += raw[j]; size++; }
  for (let i = 0; i < n; i++) {
    out[i] = sum / size;
    const lo = i - W, hi = i + W + 1;
    if (lo >= 0) { sum -= raw[lo]; size--; }
    if (hi < n)  { sum += raw[hi]; size++; }
  }
  return out;
}

function buildWaveformFromPCM(channelData, duration) {
  const N = Math.max(400, Math.ceil(duration * 30));
  const blockSize = Math.max(1, Math.floor(channelData.length / N));
  const raw = new Array(N);
  for (let i = 0; i < N; i++) {
    let s = 0;
    for (let j = 0; j < blockSize; j++) s += Math.abs(channelData[i * blockSize + j] || 0);
    raw[i] = s / blockSize;
  }
  const sm = smoothArray(raw, 3);
  let mx = 1e-4;
  for (let i = 0; i < sm.length; i++) if (sm[i] > mx) mx = sm[i];
  return sm.map((v) => 0.08 + (v / mx) * 0.92);
}

function buildFragmentWaveform(channelData, totalDuration, fragStart, fragEnd) {
  const s = fragStart ?? 0;
  const e = fragEnd   ?? totalDuration;
  if (s <= 0 && e >= totalDuration) return buildWaveformFromPCM(channelData, totalDuration);
  const startIdx = Math.max(0, Math.floor((s / totalDuration) * channelData.length));
  const endIdx   = Math.min(channelData.length, Math.ceil((e  / totalDuration) * channelData.length));
  return buildWaveformFromPCM(channelData.slice(startIdx, endIdx), e - s);
}

function generateWaveform(seed, numSamples) {
  let s = (seed * 1664525 + 1013904223) >>> 0;
  const raw = new Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    raw[i] = s / 0xffffffff;
  }
  const sm = smoothArray(raw, 14);
  let mn = sm[0], mx = sm[0];
  for (let i = 1; i < sm.length; i++) { if (sm[i] < mn) mn = sm[i]; if (sm[i] > mx) mx = sm[i]; }
  return sm.map((v) => 0.08 + ((v - mn) / (mx - mn)) * 0.92);
}

function dataUrlToBuffer(url) {
  const b64 = url.includes(",") ? url.split(",")[1] : url;
  const str = atob(b64);
  const buf = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) buf[i] = str.charCodeAt(i);
  return buf.buffer;
}

// Acepta data: URLs (heredadas) y URLs externas (Cloudinary, etc.)
async function fetchAudioBuffer(url) {
  if (url.startsWith("data:")) return dataUrlToBuffer(url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.arrayBuffer();
}

// ─── Criptografía (PBKDF2-SHA256, 100k iter., salt aleatorio por usuario) ──
// Las contraseñas y PINs se guardan hasheadas; el texto plano nunca.
const generateSalt = () => {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
};

const hashCredential = async (credential, salt) => {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw", enc.encode(credential), "PBKDF2", false, ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: enc.encode(salt), iterations: 100000 },
    keyMaterial, 256
  );
  return Array.from(new Uint8Array(bits)).map((b) => b.toString(16).padStart(2, "0")).join("");
};

const verifyCredential = async (credential, hash, salt) =>
  (await hashCredential(credential, salt)) === hash;

// ═══ 4. HELPERS DE FORMA DE DOMINIO ═════════════════════════════════════════
const categoriesOf = (exercise) => {
  if (Array.isArray(exercise?.categories) && exercise.categories.length > 0) return exercise.categories;
  if (Array.isArray(exercise?.modes)      && exercise.modes.length > 0)      return exercise.modes;
  if (exercise?.mode) return [exercise.mode];
  return [DEFAULT_CATEGORY];
};

const modelOf = (exercise) => exercise?.model || DEFAULT_MODEL_ID;

// Devuelve el array de modelos de un ejercicio (puede tener 1 ó 2 modelos)
const modelsOf = (exercise) => {
  if (Array.isArray(exercise?.models) && exercise.models.length > 0) return exercise.models;
  return [modelOf(exercise)];
};

const answerFor = (exercise, categoryId) => {
  if (exercise?.answers && Array.isArray(exercise.answers[categoryId])) return exercise.answers[categoryId];
  if (Array.isArray(exercise?.answer)) {
    const legacyCategoryId = exercise.mode?.id || DEFAULT_CATEGORY.id;
    if (categoryId === legacyCategoryId) return exercise.answer;
  }
  return [];
};

const answerStats = (exercise) => {
  const cats = categoriesOf(exercise);
  const recorded = cats.filter((c) => answerFor(exercise, c.id).length > 0).length;
  return { recorded, total: cats.length };
};

const btnOf       = (category, id) => category.buttons.find((b) => b.id === id) || category.buttons[0];
const questionsOf = (exercise)      => (Array.isArray(exercise?.questions) ? exercise.questions : []);

// ═══ 5. PRIMITIVOS UI COMPARTIDOS ═══════════════════════════════════════════

// Inyecta Google Fonts una sola vez al montar la app
function useInjectFonts() {
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (!document.querySelector('link[data-gf="fa-v3"]')) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.setAttribute("data-gf", "fa-v3");
      link.href = "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400;1,600&family=Outfit:wght@400;500;600;700&display=swap";
      document.head.appendChild(link);
    }
    if (!document.querySelector('style[data-fa-anim]')) {
      const style = document.createElement("style");
      style.setAttribute("data-fa-anim", "1");
      style.textContent = "@keyframes faModelIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}"
        + "@keyframes faBarUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}"
        + "@keyframes faHintIn{from{opacity:0;max-height:0;margin-bottom:0}to{opacity:1;max-height:120px}}"
        + ".fa-noscroll::-webkit-scrollbar{display:none;height:0;width:0}"
        + ".fa-noscroll{-ms-overflow-style:none}"
        // Sticky bar: pushes a safe spacer below the page so the bar never hides content
        + ".fa-sticky-bar{position:sticky;bottom:0;left:0;right:0;z-index:60;animation:faBarUp .22s ease}"
        + ".fa-pressable{transition:transform .08s ease, box-shadow .12s ease, background .12s ease, color .12s ease, border-color .12s ease}"
        + ".fa-pressable:active{transform:scale(.97)}";
      document.head.appendChild(style);
    }
    // Asegura el viewport responsive en móvil (si el HTML host no lo define)
    if (!document.querySelector('meta[name="viewport"]')) {
      const meta = document.createElement("meta");
      meta.name = "viewport";
      meta.content = "width=device-width, initial-scale=1, viewport-fit=cover";
      document.head.appendChild(meta);
    }
  }, []);
}

// Hook responsive: devuelve true cuando el viewport es estrecho (móvil).
// La app usa estilos en línea (no CSS/media queries), así que las vistas
// ramifican su layout leyendo este valor. Usa matchMedia y se resuscribe a
// los cambios de tamaño/orientación.
function useIsMobile(maxWidth = 640) {
  const query = `(max-width: ${maxWidth}px)`;
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia(query).matches;
  });
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia(query);
    const onChange = (e) => setIsMobile(e.matches);
    setIsMobile(mql.matches);
    // addEventListener es el API moderno; addListener para Safari antiguo
    if (mql.addEventListener) mql.addEventListener("change", onChange);
    else mql.addListener(onChange);
    return () => {
      if (mql.removeEventListener) mql.removeEventListener("change", onChange);
      else mql.removeListener(onChange);
    };
  }, [query]);
  return isMobile;
}

// Backdrop semitransparente + tarjeta centrada. Usado por todos los modales.
function ModalShell({ children, width = 480, align = "center", zIndex = 200 }) {
  const isTop = align === "top";
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(26,25,21,0.55)",
      display: "flex", justifyContent: "center",
      alignItems: isTop ? "flex-start" : "center",
      overflowY: isTop ? "auto" : undefined,
      padding:   isTop ? "32px 16px" : undefined,
      zIndex,
    }}>
      <div style={{ ...S.card, width, maxWidth: "92vw", marginBottom: 0 }}>
        {children}
      </div>
    </div>
  );
}

// Modal de confirmación destructiva
function ConfirmModal({ message, onConfirm, onCancel, confirmLabel = "Eliminar" }) {
  return (
    <ModalShell width={400} zIndex={300}>
      <p style={{ margin: "0 0 18px", color: C.ink, fontSize: 14, lineHeight: 1.5, whiteSpace: "pre-line" }}>{message}</p>
      <div style={{ ...S.row, gap: 10, justifyContent: "flex-end" }}>
        <button onClick={onCancel} style={S.btn} autoFocus>Cancelar</button>
        <button onClick={onConfirm} style={{ ...S.btnPrimary, background: C.danger, border: `1px solid ${C.danger}` }}>
          {confirmLabel}
        </button>
      </div>
    </ModalShell>
  );
}

// Mensaje de error en rojo (oculto si children es vacío)
function ErrorMsg({ children, style }) {
  if (!children) return null;
  return <p style={{ fontSize: 12, color: C.danger, margin: "0 0 12px", ...style }}>{children}</p>;
}

// Barra de pestañas con underline. variant="primary" para pestañas principales,
// "secondary" para tabs de configuración (más pequeñas, color atenuado).
function TabBar({ tabs, value, onChange, variant = "primary" }) {
  const isPrim = variant === "primary";
  return tabs.map(({ id, label }) => {
    const active = value === id;
    return (
      <button key={id} onClick={() => onChange(id)} style={{
        background: "none", border: "none",
        borderBottom: `2px solid ${active ? (isPrim ? C.ink : C.muted) : "transparent"}`,
        color:        active ? (isPrim ? C.ink : C.ink2) : (isPrim ? C.muted : C.muted2),
        marginBottom: -1,
        padding:      isPrim ? "12px 16px 11px" : "10px 10px 11px",
        cursor:       "pointer",
        fontSize:     isPrim ? 13 : 11,
        fontWeight:   active ? 600 : 400,
        fontFamily:   FONT_SANS,
        transition:   "color .12s, border-color .12s",
        whiteSpace:   "nowrap",
      }}>
        {label}
      </button>
    );
  });
}

// Badge de puntuación con color según rango. Usado en dashboards.
function ScoreBadge({ score, suffix = "%", emptyLabel = "—" }) {
  return (
    <span style={{ ...S.badge, background: scoreBg(score), color: scoreColor(score) }}>
      {score == null ? emptyLabel : `${score}${suffix}`}
    </span>
  );
}

// Input de credencial (PIN numérico o contraseña)
function CredentialInput({ kind, value, onChange, placeholder, autoFocus, onSubmit, marginBottom = 14, style }) {
  const isPin = kind === "pin";
  return (
    <input
      type={isPin ? "tel" : "password"}
      inputMode={isPin ? "numeric" : undefined}
      style={{ ...S.input, marginBottom, letterSpacing: isPin ? "0.25em" : undefined, ...style }}
      value={value}
      onChange={(e) => onChange(isPin ? e.target.value.replace(/\D/g, "") : e.target.value)}
      placeholder={placeholder ?? (isPin ? "• • • •" : "••••••")}
      autoComplete={onSubmit ? "current-password" : "new-password"}
      autoFocus={autoFocus}
      onKeyDown={onSubmit ? (e) => e.key === "Enter" && onSubmit() : undefined}
    />
  );
}

// Botón redondo de tipo "+5s / −5s / play"
function CircleButton({ onClick, disabled, title, children, size = 42, primary = false, fontSize }) {
  return (
    <button onClick={onClick} disabled={disabled} title={title} style={{
      width: size, height: size, borderRadius: "50%",
      background: primary ? C.ink : "transparent",
      border:     primary ? `1px solid ${C.ink}` : `1px solid ${C.line}`,
      color:      primary ? C.paper : C.ink2,
      cursor:     "pointer",
      display:    "flex", alignItems: "center", justifyContent: "center",
      fontSize:   fontSize ?? (primary ? 16 : 11),
      fontWeight: primary ? 700 : 400,
      fontFamily: FONT_MONO,
      opacity:    disabled ? 0.4 : 1,
    }}>
      {children}
    </button>
  );
}

// Botón submit grande con flecha (usado en ExerciseView y QuestionnaireView)
function AudioLoadingOverlay() {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(26,25,21,0.52)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 400 }}>
      <div style={{ background: C.paper, borderRadius: 18, padding: "28px 36px", textAlign: "center", boxShadow: "0 10px 40px rgba(0,0,0,0.20)", maxWidth: 280 }}>
        <div style={{ fontFamily: FONT_SANS, fontSize: 15, fontWeight: 600, color: C.ink, marginBottom: 6 }}>Cargando audio…</div>
        <div style={{ fontFamily: FONT_SANS, fontSize: 12, color: C.muted, lineHeight: 1.5 }}>Espera un momento antes de comenzar el ejercicio</div>
      </div>
    </div>
  );
}

function PillSubmitButton({ onClick, children }) {
  return (
    <button onClick={onClick} style={{
      background: C.ink, color: C.paper, border: `1px solid ${C.ink}`,
      borderRadius: 999, padding: "10px 16px 10px 20px",
      fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: FONT_SANS,
      display: "inline-flex", alignItems: "center", gap: 10,
    }}>
      {children}
      <span style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 22, height: 22, borderRadius: "50%",
        background: "rgba(251,250,246,0.18)", fontSize: 12,
      }}>→</span>
    </button>
  );
}

// Botón con estilo "guardar/disabled" (ratio de opacidad común)
const disabledStyle = (canSave) => ({
  opacity: canSave ? 1 : 0.45,
  cursor:  canSave ? "pointer" : "not-allowed",
});

// ── Primitivos de sesión S2 ───────────────────────────────────────────────────
// Estos primitivos unifican las tres vistas de ejercicio (interactivo /
// cuestionario / esquema) para que la lógica de interacción sea obvia y el
// flujo esté pensado para móvil: cabecera con el modelo visible, banner de
// ayuda destacado y barra de acción inferior fija (alcanzable con el pulgar).

// Punto de tiempo abreviado para "0:07" sin minutos cuando es corto
const SESSION_MODEL_META = {
  interactivo:  { color: C.fnT, label: "Interactivo",  hint: "Mantén pulsado el botón de la función (o su tecla) mientras suena el audio para marcar cada fragmento.", verb: "marca categorías en vivo" },
  cuestionario: { color: C.fnS, label: "Cuestionario", hint: "Toca una pregunta para saltar a su fragmento de audio y escucharlo en bucle, luego responde.", verb: "responde sobre fragmentos" },
  esquema:      { color: C.fnD, label: "Esquema",       hint: "Arrastra sobre cualquier pista para crear un bloque. Doble toque para renombrarlo; selecciónalo para moverlo o cambiar su color.", verb: "dibuja la forma musical" },
};

// Cabecera unificada de sesión: volver + título + píldora del modelo activo.
// Sustituye/clarifica a ExercisePageHeader en las vistas de ejercicio S2.
function SessionHeader({ exercise, onBack, modelId, rightSlot = null }) {
  const meta = SESSION_MODEL_META[modelId] || SESSION_MODEL_META.interactivo;
  return (
    <div style={{
      background: C.paper, borderBottom: `1px solid ${C.line}`, flexShrink: 0,
      position: "sticky", top: 0, zIndex: 55,
      paddingTop: "env(safe-area-inset-top, 0px)",
    }}>
      <div style={{ padding: "9px 16px", display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={onBack} aria-label="Volver" className="fa-pressable" style={{
          background: "none", border: "none", cursor: "pointer",
          fontFamily: F.sans, fontSize: 13, color: C.ink2, padding: "6px 4px",
          flexShrink: 0, display: "flex", alignItems: "center", gap: 4, marginLeft: -4,
        }}>
          <span style={{ fontSize: 18, lineHeight: 1 }}>←</span>
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: F.serif, fontSize: 18, fontWeight: 600, color: C.ink,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.25,
          }}>{exercise.title}</div>
          {exercise.composerName && exercise.showComposer !== false && (
            <div style={{ fontFamily: F.sans, fontSize: 11, color: C.fnS, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 1 }}>
              {exercise.composerName}
            </div>
          )}
        </div>
        {rightSlot}
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0,
          background: `${meta.color}14`, border: `1px solid ${meta.color}40`,
          borderRadius: 999, padding: "4px 11px",
          fontFamily: F.sans, fontSize: 11, fontWeight: 600, color: meta.color,
        }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: meta.color }} />
          {meta.label}
        </span>
      </div>
    </div>
  );
}

// Banner de ayuda destacado y descartable, al inicio del área de trabajo.
// Hace evidente el modelo de interacción de un vistazo, sin sustituir el texto
// fino de pie ya existente (que se mantiene como recordatorio).
function SessionHint({ modelId, extra = null, storageKeyless = true }) {
  const meta = SESSION_MODEL_META[modelId] || SESSION_MODEL_META.interactivo;
  const storeKey = `fa_hint_seen_${modelId}`;
  const [open, setOpen] = useState(() => {
    try { return localStorage.getItem(storeKey) !== "1"; } catch { return true; }
  });
  // El banner aclaratorio del modelo solo aparece la primera vez que se accede a
  // ese tipo de ejercicio; se marca como visto al mostrarse (también evita que
  // reaparezca al alternar modelos en ejercicios híbridos).
  useEffect(() => {
    if (!open) return;
    try { localStorage.setItem(storeKey, "1"); } catch {}
  }, [open, storeKey]);
  if (!open) return null;
  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 10,
      background: `${meta.color}0E`, border: `1px solid ${meta.color}33`,
      borderRadius: 12, padding: "11px 12px 11px 14px", marginBottom: 12,
      animation: "faHintIn .25s ease",
    }}>
      <span aria-hidden style={{
        flexShrink: 0, marginTop: 1,
        width: 20, height: 20, borderRadius: "50%",
        background: meta.color, color: C.paper,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: F.serif, fontSize: 13, fontWeight: 700, lineHeight: 1,
      }}>i</span>
      <div style={{ flex: 1, minWidth: 0, fontFamily: F.sans, fontSize: 12.5, lineHeight: 1.5, color: C.ink2 }}>
        {meta.hint}{extra ? <> {extra}</> : null}
      </div>
      <button onClick={() => setOpen(false)} aria-label="Ocultar ayuda" className="fa-pressable" style={{
        flexShrink: 0, background: "transparent", border: "none", cursor: "pointer",
        color: meta.color, fontSize: 16, lineHeight: 1, padding: "0 2px", marginTop: -1, opacity: 0.7,
      }}>✕</button>
    </div>
  );
}

// Barra de acción inferior fija. Garantiza que la acción principal (Entregar /
// Guardar clave) esté siempre visible y al alcance del pulgar en móvil.
// `secondary` permite añadir controles a la izquierda (deshacer, borrar…).
function StickyActionBar({ children, secondary = null, info = null }) {
  return (
    <div className="fa-sticky-bar" style={{
      background: "rgba(255,255,255,0.86)",
      backdropFilter: "saturate(180%) blur(12px)",
      WebkitBackdropFilter: "saturate(180%) blur(12px)",
      borderTop: `1px solid ${C.line}`,
      marginTop: 14,
      padding: "10px 16px",
      paddingBottom: "calc(10px + env(safe-area-inset-bottom, 0px))",
      boxShadow: "0 -6px 22px rgba(26,25,21,0.06)",
    }}>
      <div style={{ maxWidth: 980, margin: "0 auto", display: "flex", alignItems: "center", gap: 10 }}>
        {secondary}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 1 }}>
          {info}
        </div>
        {children}
      </div>
    </div>
  );
}

// Botón submit grande para la barra fija — variante full-bleed amigable al pulgar
function BarSubmitButton({ onClick, children, disabled = false, accent = C.ink }) {
  return (
    <button onClick={onClick} disabled={disabled} className="fa-pressable" style={{
      background: accent, color: C.paper, border: `1px solid ${accent}`,
      borderRadius: 999, padding: "11px 18px 11px 22px",
      fontSize: 14, fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer",
      fontFamily: FONT_SANS, flexShrink: 0,
      display: "inline-flex", alignItems: "center", gap: 9,
      opacity: disabled ? 0.45 : 1,
    }}>
      {children}
      <span style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 22, height: 22, borderRadius: "50%",
        background: "rgba(251,250,246,0.20)", fontSize: 13,
      }}>→</span>
    </button>
  );
}

// Botón circular compacto para la barra de acción (deshacer / borrar)
function BarIconButton({ onClick, disabled, title, children, danger = false }) {
  return (
    <button onClick={onClick} disabled={disabled} title={title} aria-label={title} className="fa-pressable" style={{
      width: 40, height: 40, borderRadius: 10, flexShrink: 0,
      background: C.paper, border: `1px solid ${danger ? "rgba(184,74,58,0.4)" : C.line}`,
      color: danger ? C.danger : C.ink2,
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.35 : 1,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: 17, lineHeight: 1, fontFamily: FONT_SANS,
    }}>
      {children}
    </button>
  );
}

// ── Primitivos del sistema editorial V1 ──────────────────────────────────────

function Chevron({ open, size = 13, color = C.chevron, rotate90WhenClosed = false }) {
  const deg = open ? 180 : rotate90WhenClosed ? -90 : 0;
  return (
    <svg width={size} height={size} viewBox="0 0 13 13" fill="none"
      style={{ flexShrink: 0, transition: "transform 0.18s ease", transform: `rotate(${deg}deg)` }}>
      <path d="M2.5 4.5L6.5 8.5L10.5 4.5" stroke={color} strokeWidth="1.4"
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function StatusCircle({ done, size = 14 }) {
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: done ? C.ink : C.bg, border: done ? "none" : `1.5px solid ${C.chevron}`, flexShrink: 0 }}>
      {done && (
        <svg width={size * 0.5} height={size * 0.43} viewBox="0 0 7 6" fill="none">
          <path d="M1 2.8L3 4.8L6 1" stroke="#fff" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </div>
  );
}

function Chip({ children }) {
  return <span style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 500, background: C.chipBg, color: C.chipInk, borderRadius: 4, padding: "2px 8px" }}>{children}</span>;
}

function CategoryDots({ buttons }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      {buttons.map((b) => <span key={b.id} title={b.name} style={{ width: 9, height: 9, borderRadius: "50%", background: b.color, border: "1px solid rgba(0,0,0,0.08)" }} />)}
    </span>
  );
}

// ─── SuggestInput — campo de texto con desplegable de sugerencias ────────────
function SuggestInput({ value, onChange, suggestions = [], placeholder, autoFocus, style }) {
  const [show, setShow] = useState(false);
  const inputRef = useRef(null);

  const filtered = suggestions.filter(
    (s) => s.toLowerCase().includes(value.toLowerCase()) && s !== value
  );

  return (
    <div style={{ position: "relative" }}>
      <input
        ref={inputRef}
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => { onChange(e.target.value); setShow(true); }}
        onFocus={() => setShow(true)}
        onBlur={() => setTimeout(() => setShow(false), 140)}
        placeholder={placeholder}
        style={style}
      />
      {show && filtered.length > 0 && (
        <div style={{ position: "absolute", top: "calc(100% + 3px)", left: 0, right: 0, zIndex: 40, background: C.paper, border: `1px solid ${C.line}`, borderRadius: 7, boxShadow: "0 4px 14px rgba(0,0,0,0.08)", overflow: "hidden", maxHeight: 180, overflowY: "auto" }}>
          {filtered.map((s) => (
            <div key={s} onMouseDown={() => { onChange(s); setShow(false); }}
              style={{ padding: "8px 12px", cursor: "pointer", fontSize: 13, fontFamily: FONT_SANS, color: C.ink }}>
              {s}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── TagInput — editor de etiquetas con sugerencias de reutilización ─────────
function TagInput({ tags = [], onChange, suggestions = [] }) {
  const [input, setInput] = useState("");
  const [showSug, setShowSug] = useState(false);
  const inputRef = useRef(null);

  const filtered = suggestions.filter(
    (s) => s.toLowerCase().includes(input.toLowerCase()) && !tags.includes(s)
  );

  const addTag = (tag) => {
    const t = tag.trim();
    if (!t || tags.includes(t)) return;
    onChange([...tags, t]);
    setInput("");
    setShowSug(false);
    inputRef.current?.focus();
  };

  const removeTag = (t) => onChange(tags.filter((x) => x !== t));

  const handleKey = (e) => {
    if ((e.key === "Enter" || e.key === ",") && input.trim()) {
      e.preventDefault();
      addTag(input);
    } else if (e.key === "Backspace" && !input && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    }
  };

  return (
    <div style={{ position: "relative" }}>
      <div
        onClick={() => inputRef.current?.focus()}
        style={{ display: "flex", flexWrap: "wrap", gap: 5, alignItems: "center", background: C.field, border: `1px solid ${C.line}`, borderRadius: 7, padding: "6px 10px", minHeight: 40, cursor: "text" }}
      >
        {tags.map((t) => (
          <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: C.ink, color: "#fff", borderRadius: 4, padding: "2px 8px", fontSize: 11, fontFamily: FONT_SANS, fontWeight: 500 }}>
            {t}
            <span onClick={() => removeTag(t)} style={{ cursor: "pointer", opacity: 0.7, fontSize: 13, lineHeight: 1, marginLeft: 1 }}>×</span>
          </span>
        ))}
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => { setInput(e.target.value); setShowSug(true); }}
          onKeyDown={handleKey}
          onFocus={() => setShowSug(true)}
          onBlur={() => setTimeout(() => setShowSug(false), 140)}
          placeholder={tags.length === 0 ? "Añadir etiqueta…" : ""}
          style={{ border: "none", outline: "none", background: "transparent", fontSize: 12, fontFamily: FONT_SANS, color: C.ink, minWidth: 90, flex: 1 }}
        />
      </div>
      {showSug && (input.trim() || filtered.length > 0) && (
        <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 40, background: C.paper, border: `1px solid ${C.line}`, borderRadius: 7, boxShadow: "0 4px 14px rgba(0,0,0,0.08)", overflow: "hidden", maxHeight: 180, overflowY: "auto" }}>
          {input.trim() && !tags.includes(input.trim()) && (
            <div onMouseDown={() => addTag(input)} style={{ padding: "8px 12px", cursor: "pointer", fontSize: 12, fontFamily: FONT_SANS, color: C.ink, display: "flex", alignItems: "center", gap: 8, borderBottom: filtered.length ? `1px solid ${C.line}` : "none" }}>
              <span style={{ color: C.muted, fontSize: 11 }}>Crear:</span>
              <strong>{input.trim()}</strong>
            </div>
          )}
          {filtered.map((s) => (
            <div key={s} onMouseDown={() => addTag(s)} style={{ padding: "8px 12px", cursor: "pointer", fontSize: 12, fontFamily: FONT_SANS, color: C.ink }}>
              {s}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── EyeIcon / EyeButton — visibilidad de ejercicios, cursos, unidades ────────
function EyeIcon({ open = true, size = 15 }) {
  return open ? (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="10" cy="10" rx="8" ry="5" />
      <circle cx="10" cy="10" r="2.2" fill="currentColor" stroke="none" />
    </svg>
  ) : (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3l14 14" />
      <path d="M6.5 6.5C4.5 7.6 3 9 3 10c0 2.8 3.1 5 7 5a9 9 0 0 0 3.5-.7" />
      <path d="M10 5c3.9 0 7 2.2 7 5a6.3 6.3 0 0 1-1.5 2.5" />
    </svg>
  );
}

// Icono de onda de audio — barras verticales de altura variable, estética waveform
function AudioWaveIcon({ size = 16, color = "currentColor" }) {
  const bars = [0.35, 0.6, 0.85, 0.65, 1.0, 0.8, 0.5, 0.9, 0.55, 0.3];
  return (
    <svg width={size} height={size * 0.875} viewBox="0 0 20 14" fill="none" style={{ flexShrink: 0 }}>
      {bars.map((h, i) => {
        const bh = h * 12;
        const y  = (14 - bh) / 2;
        return <rect key={i} x={i * 2} y={y} width={1.2} height={bh} rx={0.6} fill={color} />;
      })}
    </svg>
  );
}

function EyeButton({ visible, onClick, title }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      title={title || (visible ? "Ocultar para alumnos" : "Mostrar a alumnos")}
      style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: 6, border: `1px solid ${visible ? C.line : "rgba(184,74,58,0.35)"}`, background: "transparent", cursor: "pointer", color: visible ? C.muted : C.danger, flexShrink: 0, transition: "all .15s" }}
    >
      <EyeIcon open={visible} size={14} />
    </button>
  );
}

// ─── FilterDropdown — menú desplegable de selección múltiple para filtros ─────
function FilterDropdown({ label, options, selected, onToggle, onClear, accent = C.ink }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const count = selected.length;

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 11px", borderRadius: 20, border: `1.5px solid ${count > 0 ? accent : C.line}`, background: count > 0 ? accent : C.paper, color: count > 0 ? "#fff" : C.ink2, cursor: "pointer", fontFamily: FONT_SANS, fontSize: 12, fontWeight: count > 0 ? 600 : 400, transition: "all .15s", whiteSpace: "nowrap" }}
      >
        {label}
        {count > 0 && (
          <span style={{ background: "rgba(255,255,255,0.28)", borderRadius: 10, padding: "0px 6px", fontSize: 11, fontWeight: 700 }}>{count}</span>
        )}
        <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" style={{ marginLeft: 1, opacity: 0.7, transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform .18s" }}>
          <polyline points="2,3.5 5,6.5 8,3.5" />
        </svg>
      </button>

      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, minWidth: 200, maxWidth: 280, zIndex: 50, background: C.paper, border: `1px solid ${C.line}`, borderRadius: 10, boxShadow: "0 6px 24px rgba(0,0,0,0.10)", padding: "6px 0", overflow: "hidden" }}>
          {options.length === 0 ? (
            <div style={{ padding: "10px 14px", fontSize: 12, color: C.muted, fontFamily: FONT_SANS }}>Sin opciones disponibles</div>
          ) : (
            <>
              {options.map((opt) => {
                const on = selected.includes(opt);
                return (
                  <div key={opt} onMouseDown={() => onToggle(opt)}
                    style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 14px", cursor: "pointer", background: on ? `${accent}10` : "transparent", transition: "background .1s" }}>
                    <span style={{ width: 15, height: 15, borderRadius: 4, border: `1.5px solid ${on ? accent : C.chevron}`, background: on ? accent : "transparent", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {on && <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><polyline points="1.5,5 4,7.5 8.5,2.5"/></svg>}
                    </span>
                    <span style={{ fontSize: 13, fontFamily: FONT_SANS, color: C.ink, lineHeight: 1.3 }}>{opt}</span>
                  </div>
                );
              })}
              {count > 0 && (
                <div style={{ borderTop: `1px solid ${C.line}`, margin: "4px 0 0" }}>
                  <div onMouseDown={onClear} style={{ padding: "7px 14px", cursor: "pointer", fontSize: 12, color: C.danger, fontFamily: FONT_SANS, fontWeight: 500 }}>✕ Limpiar selección</div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Pill select estilizado ────────────────────────────────────────────────────
function PillSelect({ value, onChange, options, accent = C.ink }) {
  const active = value !== options[0]?.id;
  return (
    <div style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ appearance: "none", WebkitAppearance: "none", padding: "5px 28px 5px 12px", borderRadius: 20, border: `1.5px solid ${active ? accent : C.line}`, background: active ? accent : C.paper, color: active ? "#fff" : C.ink2, cursor: "pointer", fontFamily: FONT_SANS, fontSize: 12, fontWeight: active ? 600 : 400, outline: "none", transition: "all .15s" }}
      >
        {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
      <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke={active ? "#fff" : C.ink2} strokeWidth="1.8" strokeLinecap="round"
        style={{ position: "absolute", right: 10, pointerEvents: "none", opacity: 0.7 }}>
        <polyline points="2,3.5 5,6.5 8,3.5" />
      </svg>
    </div>
  );
}

// ─── TeacherFilterBar — filtros de ejercicios para la vista del profesor ──────
const MODEL_OPTIONS = [
  { id: "all",          label: "Todos los modelos" },
  { id: "interactivo",  label: "Interactivo" },
  { id: "cuestionario", label: "Cuestionario" },
  { id: "esquema",      label: "Esquema" },
];

function TeacherFilterBar({ filterModel, setFilterModel, allComposers, filterComposers, setFilterComposers, allTags, filterTags, setFilterTags }) {
  const toggleComposer = (val) => setFilterComposers((p) => p.includes(val) ? p.filter((x) => x !== val) : [...p, val]);
  const toggleTag      = (val) => setFilterTags((p) => p.includes(val) ? p.filter((x) => x !== val) : [...p, val]);
  const active = filterModel !== "all" || filterComposers.length > 0 || filterTags.length > 0;

  return (
    <div style={{ marginBottom: 16, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
      <PillSelect value={filterModel} onChange={setFilterModel} options={MODEL_OPTIONS} />

      <FilterDropdown
        label="Compositor"
        options={allComposers}
        selected={filterComposers}
        onToggle={toggleComposer}
        onClear={() => setFilterComposers([])}
        accent="#2F6FB8"
      />

      <FilterDropdown
        label="Etiquetas"
        options={allTags}
        selected={filterTags}
        onToggle={toggleTag}
        onClear={() => setFilterTags([])}
        accent={C.fnI}
      />

      {active && (
        <button onClick={() => { setFilterModel("all"); setFilterComposers([]); setFilterTags([]); }}
          style={{ padding: "5px 11px", borderRadius: 20, border: "1.5px solid rgba(184,74,58,0.35)", background: "transparent", color: C.danger, cursor: "pointer", fontFamily: FONT_SANS, fontSize: 12 }}>
          ✕ Limpiar
        </button>
      )}
    </div>
  );
}

// ─── StudentFilterBar — filtros de ejercicios para la vista del alumno ────────
function StudentFilterBar({ filterModel, setFilterModel, filterDone, setFilterDone }) {
  const active = filterModel !== "all" || filterDone !== "all";
  const DONE_OPTIONS = [
    { id: "all",     label: "Todos",     accent: C.ink  },
    { id: "notdone", label: "Sin hacer", accent: C.fnD  },
    { id: "done",    label: "Hechos",    accent: C.fnT  },
  ];
  return (
    <div style={{ marginBottom: 14, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
      <PillSelect value={filterModel} onChange={setFilterModel} options={MODEL_OPTIONS} />

      <div style={{ display: "flex", gap: 5, background: C.paper2, borderRadius: 20, padding: "3px 4px" }}>
        {DONE_OPTIONS.map((opt) => {
          const on = filterDone === opt.id;
          return (
            <button key={opt.id} onClick={() => setFilterDone(opt.id)}
              style={{ padding: "4px 12px", borderRadius: 16, border: "none", background: on ? (opt.id === "all" ? C.ink : opt.accent) : "transparent", color: on ? "#fff" : C.ink2, cursor: "pointer", fontFamily: FONT_SANS, fontSize: 12, fontWeight: on ? 600 : 400, transition: "all .15s" }}>
              {opt.label}
            </button>
          );
        })}
      </div>

      {active && (
        <button onClick={() => { setFilterModel("all"); setFilterDone("all"); }}
          style={{ padding: "5px 11px", borderRadius: 20, border: "1.5px solid rgba(184,74,58,0.35)", background: "transparent", color: C.danger, cursor: "pointer", fontFamily: FONT_SANS, fontSize: 12 }}>
          ✕ Limpiar
        </button>
      )}
    </div>
  );
}

function Overline({ children, style }) {
  return <div style={{ fontFamily: F.sans, fontSize: 10, fontWeight: 700, letterSpacing: "0.15em", color: C.chevron, textTransform: "uppercase", marginBottom: 6, ...style }}>{children}</div>;
}

function GhostButton({ children, onClick, full, lg, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{ background: C.paper, border: `1px solid ${C.rail}`, borderRadius: lg ? 8 : 7, padding: lg ? "12px 18px" : "7px 14px", fontFamily: F.sans, fontSize: lg ? 14 : 13, fontWeight: 500, color: "#555", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.4 : 1, width: full ? "100%" : undefined }}>{children}</button>
  );
}

function CtaButton({ children, onClick, disabled, full, lg }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{ background: C.ink, color: "#fff", border: "none", borderRadius: lg ? 8 : 7, padding: lg ? "12px 18px" : "7px 15px", fontFamily: F.sans, fontSize: lg ? 14 : 12, fontWeight: 500, cursor: disabled ? "not-allowed" : "pointer", flexShrink: 0, opacity: disabled ? 0.4 : 1, width: full ? "100%" : undefined }}>{children}</button>
  );
}

function DangerLink({ children, onClick, style }) {
  return <button onClick={onClick} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: F.sans, fontSize: 13, color: C.danger, ...style }}>{children}</button>;
}

function DangerOutlineButton({ children, onClick }) {
  return <button onClick={onClick} style={{ background: C.paper, border: `1px solid rgba(184,74,58,0.4)`, borderRadius: 7, padding: "5px 12px", fontFamily: F.sans, fontSize: 12, fontWeight: 500, color: C.danger, cursor: "pointer" }}>{children}</button>;
}

function FieldLabel({ children }) {
  return <label style={{ display: "block", fontFamily: F.sans, fontSize: 11, fontWeight: 500, color: "#999", marginBottom: 6 }}>{children}</label>;
}

function TextInput({ value, onChange, placeholder, type = "text", big }) {
  const [focus, setFocus] = useState(false);
  return (
    <input type={type} value={value} placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
      style={{ width: "100%", boxSizing: "border-box", fontFamily: big ? F.serif : F.sans, fontSize: big ? 18 : 13, fontWeight: big ? 500 : 400, color: C.ink, background: C.field, border: `1px solid ${focus ? C.fieldFocus : C.border}`, borderRadius: 7, padding: big ? "10px 14px" : "9px 12px", outline: "none", transition: "border-color .15s" }} />
  );
}

function RailStep({ num, title, last, children }) {
  return (
    <div style={{ display: "flex", marginBottom: last ? 0 : 30 }}>
      <div style={{ width: 52, flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ width: 36, height: 36, borderRadius: "50%", background: C.ink, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: F.serif, fontSize: 17, fontWeight: 600 }}>{String(num).padStart(2, "0")}</div>
        {!last && <div style={{ width: 1, flex: 1, background: C.rail, marginTop: 6 }} />}
      </div>
      <div style={{ flex: 1, minWidth: 0, paddingTop: 6, paddingBottom: 4 }}>
        <div style={{ fontFamily: F.serif, fontSize: 20, fontWeight: 600, letterSpacing: "-0.01em", marginBottom: 14 }}>{title}</div>
        {children}
      </div>
    </div>
  );
}

function MetaItem({ label, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <span style={{ fontFamily: F.sans, fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: C.chevron }}>{label}</span>
      <span style={{ display: "flex", alignItems: "center", gap: 5, fontFamily: F.sans, fontSize: 12, color: "#666" }}>{children}</span>
    </div>
  );
}

// Cabecera editorial para vistas de ejercicio
function ExerciseViewHeader({ title, onBack }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: F.sans, fontSize: 13, color: "#888", padding: 0, marginBottom: 16 }}>← Volver</button>
      <div style={{ paddingBottom: 18, borderBottom: `2px solid ${C.ink}` }}>
        <h1 style={{ fontFamily: F.serif, fontSize: 32, fontWeight: 600, letterSpacing: "-0.01em", lineHeight: 1.1, margin: 0 }}>{title}</h1>
      </div>
    </div>
  );
}

// Cabecera unificada para los tres tipos de vista de ejercicio en sesión
function ExercisePageHeader({ exercise, onBack }) {
  return (
    <div style={{ background: C.paper, borderBottom: `1px solid ${C.line}`, flexShrink: 0 }}>
      <div style={{ padding: "10px 20px", display: "flex", alignItems: "center", gap: 14 }}>
        <button
          onClick={onBack}
          style={{
            background: "none", border: "none", cursor: "pointer",
            fontFamily: F.sans, fontSize: 13, color: "#888", padding: 0,
            flexShrink: 0, display: "flex", alignItems: "center", gap: 5,
          }}>
          <span style={{ fontSize: 15, lineHeight: 1 }}>←</span>
          <span>Volver</span>
        </button>
        <div style={{ width: 1, height: 28, background: C.line, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: F.serif, fontSize: 21, fontWeight: 600, color: C.ink,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.2,
          }}>{exercise.title}</div>
        </div>
      </div>
    </div>
  );
}

// ═══ 6. VISTAS DE AUTENTICACIÓN ═════════════════════════════════════════════

// Pantalla de primera ejecución (aún no existe ninguna cuenta admin)
function SetupView({ onSetup }) {
  const [displayName, setDisplayName] = useState("");
  const [username,    setUsername]    = useState("admin");
  const [pass,        setPass]        = useState("");
  const [pass2,       setPass2]       = useState("");
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState("");

  const mismatch = pass && pass2 && pass !== pass2;
  const canSave  = displayName.trim() && username.trim() && pass.length >= 6 && pass === pass2 && !loading;

  const handleSubmit = async () => {
    if (!canSave) return;
    setLoading(true); setError("");
    try {
      const salt = generateSalt();
      const hash = await hashCredential(pass, salt);
      onSetup({
        id:           `admin-${Date.now()}`,
        username:     username.trim().toLowerCase(),
        displayName:  displayName.trim(),
        role:         "admin",
        credType:     "password",
        passwordHash: hash,
        salt,
        createdAt:    Date.now(),
      });
    } catch { setError("Error al configurar la cuenta. Inténtalo de nuevo."); }
    finally  { setLoading(false); }
  };

  return (
    <div style={{ ...S.app, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ maxWidth: 400, width: "100%" }}>
        <div style={{ marginBottom: 30, paddingBottom: 20, borderBottom: `2px solid ${C.ink}` }}>
          <Overline>Primera configuración</Overline>
          <h1 style={{ ...S.h1 }}>Crear cuenta de administrador</h1>
        </div>

        <div style={{ marginBottom: 14 }}>
          <FieldLabel>Tu nombre (visible para los alumnos)</FieldLabel>
          <TextInput value={displayName} onChange={setDisplayName} placeholder="Ej: Prof. García" />
        </div>
        <div style={{ marginBottom: 14 }}>
          <FieldLabel>Nombre de usuario</FieldLabel>
          <TextInput value={username} onChange={(v) => setUsername(v.toLowerCase().replace(/\s/g, ""))} placeholder="admin" />
        </div>
        <div style={{ marginBottom: 14 }}>
          <FieldLabel>Contraseña (mínimo 6 caracteres)</FieldLabel>
          <TextInput value={pass} onChange={setPass} placeholder="••••••" type="password" />
        </div>
        <div style={{ marginBottom: mismatch ? 6 : 24 }}>
          <FieldLabel>Confirmar contraseña</FieldLabel>
          <input type="password" autoComplete="new-password"
            style={{ ...S.input, borderColor: mismatch ? C.danger : undefined }}
            value={pass2} onChange={(e) => setPass2(e.target.value)} placeholder="••••••"
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()} />
        </div>

        {mismatch && <ErrorMsg style={{ marginBottom: 16 }}>Las contraseñas no coinciden</ErrorMsg>}
        <ErrorMsg>{error}</ErrorMsg>

        <CtaButton full lg onClick={handleSubmit} disabled={!canSave}>
          {loading ? "Configurando…" : "Crear cuenta y comenzar →"}
        </CtaButton>
      </div>
    </div>
  );
}

// Pantalla de login (alumno/profesor/admin)
function LoginView({ roleLabel, filterRole, users, onLogin, onBack, onGuest, onForgotPin }) {
  const [username,   setUsername]   = useState("");
  const [credential, setCredential] = useState("");
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState("");

  const targetUsers = useMemo(() =>
    (users || []).filter((u) => u.role === filterRole || (filterRole === "teacher" && u.role === "admin")),
  [users, filterRole]);
  const matchedUser = useMemo(() => {
    if (!username.trim()) return null;
    return targetUsers.find((u) => u.username === username.trim().toLowerCase()) || null;
  }, [username, targetUsers]);

  const isPin     = matchedUser?.credType === "pin";
  const credLabel = matchedUser ? (isPin ? "PIN" : "Contraseña") : "Contraseña / PIN";
  const canSubmit = username.trim() && credential && !loading;

  const handleLogin = async () => {
    if (!canSubmit) return;
    setLoading(true); setError("");
    try {
      const found = targetUsers.find((u) => u.username === username.trim().toLowerCase());
      if (!found) { setError("Usuario no encontrado."); setLoading(false); return; }
      const ok = await verifyCredential(credential, found.passwordHash, found.salt);
      if (!ok)    { setError(`${found.credType === "pin" ? "PIN" : "Contraseña"} incorrecta.`); setLoading(false); return; }
      onLogin(found);
    } catch { setError("Error al verificar. Inténtalo de nuevo."); }
    finally  { setLoading(false); }
  };

  return (
    <div style={{ ...S.app, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ maxWidth: 380, width: "100%" }}>
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: F.sans, fontSize: 13, color: "#888", padding: 0, marginBottom: 28 }}>← Inicio</button>
        <div style={{ marginBottom: 30, paddingBottom: 20, borderBottom: `2px solid ${C.ink}` }}>
          <Overline>Acceso · {roleLabel}</Overline>
          <h1 style={{ ...S.h1 }}>Iniciar sesión</h1>
        </div>

        <div style={{ marginBottom: 16 }}>
          <FieldLabel>Nombre de usuario</FieldLabel>
          <input style={{ ...S.input }} value={username} autoFocus autoComplete="username"
            onChange={(e) => { setUsername(e.target.value); setError(""); }} placeholder="usuario" />
        </div>
        <div style={{ marginBottom: 24 }}>
          <FieldLabel>{credLabel}</FieldLabel>
          <CredentialInput kind={isPin ? "pin" : "password"} value={credential}
            onChange={(v) => { setCredential(v); setError(""); }} onSubmit={handleLogin} marginBottom={0} />
        </div>

        {error && <ErrorMsg style={{ marginBottom: 14 }}>{error}</ErrorMsg>}
        <CtaButton full lg onClick={handleLogin} disabled={!canSubmit}>
          {loading ? "Verificando…" : "Entrar →"}
        </CtaButton>

        {onForgotPin && (
          <div style={{ textAlign: "center", marginTop: 16 }}>
            <button
              onClick={onForgotPin}
              style={{ background: "none", border: "none", cursor: "pointer", fontFamily: F.sans, fontSize: 12, color: C.muted, textDecoration: "underline", padding: 0 }}
            >
              He olvidado mi PIN
            </button>
          </div>
        )}

        {onGuest && (
          <>
            <div style={{ display: "flex", alignItems: "center", margin: "22px 0 16px" }}>
              <div style={{ flex: 1, height: 1, background: C.line }} />
              <span style={{ fontFamily: F.sans, fontSize: 11, color: C.muted, padding: "0 12px", whiteSpace: "nowrap" }}>o sin cuenta</span>
              <div style={{ flex: 1, height: 1, background: C.line }} />
            </div>
            <GhostButton full lg onClick={onGuest}>Entrar como invitado</GhostButton>
            <p style={{ fontFamily: F.sans, fontSize: 11, color: C.muted, textAlign: "center", margin: "10px 0 0", lineHeight: 1.5 }}>
              Modo de prueba · los resultados no se guardan
            </p>
          </>
        )}
      </div>
    </div>
  );
}

// Pantalla inicial: selección de rol
function HomeView({ onTeacher, onStudent }) {
  return (
    <div style={{ ...S.app, display: "flex", alignItems: "center", justifyContent: "center", padding: "calc(24px + env(safe-area-inset-top,0px)) 24px calc(24px + env(safe-area-inset-bottom,0px))" }}>
      <div style={{ maxWidth: 360, width: "100%", textAlign: "center" }}>
        <div style={{ fontFamily: F.serif, fontSize: 17, fontWeight: 600, fontStyle: "italic", color: C.muted, marginBottom: 14, letterSpacing: "0.01em" }}>
          Funciones armónicas
        </div>
        <h1 style={{ fontFamily: F.sans, fontSize: 52, fontWeight: 700, letterSpacing: "-0.04em", lineHeight: 1.0, margin: 0 }}>
          Análisis<br />auditivo
        </h1>
        <div style={{ width: 40, height: 2, background: C.ink, margin: "26px auto 22px" }} />
        <p style={{ fontFamily: F.sans, fontSize: 14, color: "#888", lineHeight: 1.6, maxWidth: 270, margin: "0 auto 36px" }}>
          Herramienta interactiva de análisis y escucha armónica para el aula.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          <CtaButton full lg onClick={onStudent}>Acceso alumno</CtaButton>
          <GhostButton full lg onClick={onTeacher}>Acceso profesor</GhostButton>
        </div>
      </div>
    </div>
  );
}

// Vista para solicitar enlace de recuperación de PIN por correo
function ForgotPinView({ users, supabaseRef, onBack }) {
  const [username, setUsername] = useState("");
  const [loading,  setLoading]  = useState(false);
  const [sent,     setSent]     = useState(false);
  const [error,    setError]    = useState("");

  const handleSend = async () => {
    if (!username.trim() || loading) return;
    setLoading(true); setError("");
    try {
      const found = (users || []).find(
        (u) => u.role === "student" && u.username === username.trim().toLowerCase()
      );
      if (!found) { setError("Usuario no encontrado."); return; }
      if (!found.recoveryEmail) {
        setError("Este usuario no tiene correo de recuperación. Pide ayuda a tu profesor.");
        return;
      }
      const sb = supabaseRef.current;
      if (!sb) { setError("Sin conexión al servidor. Inténtalo más tarde."); return; }
      const { error: sbErr } = await sb.auth.signInWithOtp({
        email: found.recoveryEmail,
        options: {
          shouldCreateUser: true,
          emailRedirectTo: window.location.origin + (window.location.pathname || "/"),
        },
      });
      if (sbErr) throw sbErr;
      setSent(true);
    } catch { setError("No se pudo enviar el correo. Inténtalo de nuevo."); }
    finally { setLoading(false); }
  };

  if (sent) {
    return (
      <div style={{ ...S.app, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ maxWidth: 380, width: "100%", textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 20 }}>✉</div>
          <h1 style={{ ...S.h1, textAlign: "center" }}>Correo enviado</h1>
          <p style={{ fontFamily: F.sans, fontSize: 14, color: C.ink2, lineHeight: 1.6, marginBottom: 28 }}>
            Hemos enviado un enlace de acceso a tu correo de recuperación. Haz clic en él para configurar un nuevo PIN.
          </p>
          <GhostButton full lg onClick={onBack}>← Volver al inicio</GhostButton>
        </div>
      </div>
    );
  }

  return (
    <div style={{ ...S.app, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ maxWidth: 380, width: "100%" }}>
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: F.sans, fontSize: 13, color: "#888", padding: 0, marginBottom: 28 }}>← Volver</button>
        <div style={{ marginBottom: 30, paddingBottom: 20, borderBottom: `2px solid ${C.ink}` }}>
          <Overline>Recuperar acceso · Alumno</Overline>
          <h1 style={{ ...S.h1 }}>He olvidado mi PIN</h1>
        </div>
        <p style={{ fontFamily: F.sans, fontSize: 14, color: C.ink2, lineHeight: 1.6, marginBottom: 20 }}>
          Introduce tu nombre de usuario. Te enviaremos un enlace a tu correo de recuperación.
        </p>
        <div style={{ marginBottom: 24 }}>
          <FieldLabel>Nombre de usuario</FieldLabel>
          <input
            style={{ ...S.input }}
            value={username}
            autoFocus
            autoComplete="username"
            onChange={(e) => { setUsername(e.target.value); setError(""); }}
            placeholder="usuario"
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
          />
        </div>
        {error && <ErrorMsg style={{ marginBottom: 14 }}>{error}</ErrorMsg>}
        <CtaButton full lg onClick={handleSend} disabled={!username.trim() || loading}>
          {loading ? "Enviando…" : "Enviar enlace →"}
        </CtaButton>
      </div>
    </div>
  );
}

// Vista para configurar nuevo PIN tras llegar desde el enlace de correo
function ResetPinView({ users, supabaseSession, onReset, onBack }) {
  const [pin,     setPin]     = useState("");
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");
  const [done,    setDone]    = useState(false);

  const email      = supabaseSession?.user?.email;
  const targetUser = (users || []).find(
    (u) => u.recoveryEmail?.toLowerCase() === email?.toLowerCase()
  );

  const canSave = pin.length >= 4 && !loading;

  const handleReset = async () => {
    if (!canSave || !targetUser) return;
    setLoading(true); setError("");
    try {
      const salt = generateSalt();
      const hash = await hashCredential(pin, salt);
      await onReset({ ...targetUser, credType: "pin", passwordHash: hash, salt });
      setDone(true);
    } catch { setError("Error al actualizar el PIN. Inténtalo de nuevo."); }
    finally { setLoading(false); }
  };

  if (done) {
    return (
      <div style={{ ...S.app, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ maxWidth: 380, width: "100%", textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 20 }}>✓</div>
          <h1 style={{ ...S.h1, textAlign: "center" }}>PIN actualizado</h1>
          <p style={{ fontFamily: F.sans, fontSize: 14, color: C.ink2, lineHeight: 1.6, marginBottom: 28 }}>
            Tu PIN ha sido actualizado correctamente. Ya puedes iniciar sesión con tu nuevo PIN.
          </p>
          <CtaButton full lg onClick={onBack}>Ir al inicio →</CtaButton>
        </div>
      </div>
    );
  }

  if (!targetUser) {
    return (
      <div style={{ ...S.app, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ maxWidth: 380, width: "100%", textAlign: "center" }}>
          <p style={{ fontFamily: F.sans, fontSize: 14, color: C.muted, lineHeight: 1.6, marginBottom: 24 }}>
            No se encontró ningún usuario asociado a este correo. Pide ayuda a tu profesor.
          </p>
          <GhostButton full lg onClick={onBack}>← Volver al inicio</GhostButton>
        </div>
      </div>
    );
  }

  return (
    <div style={{ ...S.app, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ maxWidth: 380, width: "100%" }}>
        <div style={{ marginBottom: 30, paddingBottom: 20, borderBottom: `2px solid ${C.ink}` }}>
          <Overline>Recuperar acceso · {targetUser.displayName}</Overline>
          <h1 style={{ ...S.h1 }}>Nuevo PIN de acceso</h1>
        </div>
        <p style={{ fontFamily: F.sans, fontSize: 14, color: C.ink2, lineHeight: 1.6, marginBottom: 20 }}>
          Elige un nuevo PIN de 4 a 6 dígitos.
        </p>
        <div style={{ marginBottom: 24 }}>
          <FieldLabel>Nuevo PIN</FieldLabel>
          <CredentialInput kind="pin" value={pin} onChange={setPin} onSubmit={handleReset} marginBottom={0} />
        </div>
        {error && <ErrorMsg style={{ marginBottom: 14 }}>{error}</ErrorMsg>}
        <CtaButton full lg onClick={handleReset} disabled={!canSave}>
          {loading ? "Guardando…" : "Guardar nuevo PIN →"}
        </CtaButton>
      </div>
    </div>
  );
}

// Selector de profesor (para alumnos al primer login)
function TeacherPickerView({ teachers, currentTeacherId, onPick, onLogout }) {
  const [hoverId, setHoverId] = useState(null);
  return (
    <div style={{ ...S.app, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ maxWidth: 400, width: "100%" }}>
        <div style={{ marginBottom: 30, paddingBottom: 20, borderBottom: `2px solid ${C.ink}` }}>
          <Overline>Selección de profesor</Overline>
          <h1 style={{ ...S.h1 }}>{currentTeacherId ? "Cambiar profesor" : "Elige tu profesor"}</h1>
        </div>

        {teachers.length === 0 ? (
          <div style={{ paddingTop: 8 }}>
            <p style={{ color: C.muted, fontSize: 13, marginBottom: 14 }}>Aún no hay profesores registrados.</p>
            <GhostButton onClick={onLogout}>Volver al inicio</GhostButton>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 28 }}>
            {teachers.map((t) => {
              const isSel   = t.id === currentTeacherId;
              const isHover = hoverId === t.id;
              return (
                <button key={t.id} onClick={() => onPick(t)}
                  onMouseEnter={() => setHoverId(t.id)} onMouseLeave={() => setHoverId(null)}
                  style={{ background: isSel ? C.ink : isHover ? C.paper2 : C.paper, border: `1px solid ${isSel ? C.ink : isHover ? C.ink2 : C.line}`, borderRadius: 8, padding: "12px 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, textAlign: "left" }}>
                  <div style={{ width: 38, height: 38, borderRadius: "50%", background: isSel ? "rgba(255,255,255,0.15)" : C.chipBg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: F.serif, fontSize: 18, fontWeight: 600, color: isSel ? "#fff" : C.ink, flexShrink: 0 }}>
                    {t.displayName[0].toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: F.sans, fontWeight: 600, fontSize: 14, color: isSel ? "#fff" : C.ink, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.displayName}</div>
                    <div style={{ fontFamily: F.sans, fontSize: 12, color: isSel ? "rgba(255,255,255,0.6)" : C.muted }}>@{t.username}</div>
                  </div>
                  {isSel && <StatusCircle done size={18} />}
                </button>
              );
            })}
          </div>
        )}

        <button onClick={onLogout} style={{ background: "none", border: "none", color: C.muted, fontSize: 12, cursor: "pointer", fontFamily: F.sans, padding: 0 }}>Salir</button>
      </div>
    </div>
  );
}

// ═══ 7. VISTAS DE ALUMNO ════════════════════════════════════════════════════

// Metadatos por modelo de ejercicio (color de franja + etiqueta)
const MODEL_META = {
  interactivo:  { color: "#3F9B5B", label: "Interactivo"  },
  cuestionario: { color: "#2F6FB8", label: "Cuestionario" },
  esquema:      { color: "#C77A1A", label: "Esquema"      },
};
const modelMeta = (ex) => MODEL_META[modelOf(ex)] || MODEL_META.interactivo;

// Barra de alternancia entre modelos (se inyecta entre título y waveform en sesiones con 2 modelos)
function ModelToggleBar({ models, activeIdx, onSwitch }) {
  if (!models || models.length < 2) return null;
  return (
    <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
      <div style={{
        display: "inline-flex",
        background: C.paper2,
        border: `1px solid ${C.line}`,
        borderRadius: 999,
        padding: 3,
        gap: 3,
      }}>
        {models.map((modelId, idx) => {
          const meta = MODEL_META[modelId] || MODEL_META.interactivo;
          const isActive = activeIdx === idx;
          return (
            <button
              key={modelId}
              type="button"
              onClick={() => onSwitch(idx)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "5px 16px",
                borderRadius: 999,
                border: "none",
                background: isActive ? C.ink : "transparent",
                color: isActive ? C.paper : C.ink2,
                cursor: "pointer",
                fontFamily: F.sans,
                fontSize: 12,
                fontWeight: isActive ? 600 : 400,
                transition: "background .15s, color .15s",
                whiteSpace: "nowrap",
              }}
            >
              <span style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: isActive ? "rgba(255,255,255,0.55)" : meta.color,
                flexShrink: 0,
                transition: "background .15s",
              }} />
              {meta.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Tarjeta colapsable de ejercicio (alumno) — franja de tipo + metadatos desplegables
function ExerciseRow({ ex, result, onOpen, onViewCorrection }) {
  const [open, setOpen] = useState(false);
  const isMobile  = useIsMobile();
  const meta      = modelMeta(ex);
  const exModels  = modelsOf(ex);
  const isQuiz    = modelOf(ex) === "cuestionario";
  const exQs      = questionsOf(ex);
  const cats      = categoriesOf(ex);
  const allBtns   = cats.flatMap((c) => c.buttons || []);
  const isDone    = result != null;
  const score     = result?.score ?? null;
  const isCorrected = result?.teacherCorrection?.corrected;

  const actionButtons = (
    <>
      {isDone && onViewCorrection && (
        <button onClick={(e) => { e.stopPropagation(); onViewCorrection(ex); }} className="fa-pressable"
          style={{ ...S.btn, fontSize: 12.5, padding: "8px 14px", flexShrink: 0, flex: isMobile ? 1 : "0 0 auto", color: isCorrected ? C.quiz : C.fnS, borderColor: isCorrected ? C.quiz : C.fnS }}>
          {isCorrected ? "Ver corrección ✓" : "Ver entrega"}
        </button>
      )}
      <button onClick={(e) => { e.stopPropagation(); onOpen(ex); }} className="fa-pressable"
        style={isDone
          ? { ...S.btn, fontSize: 12.5, padding: "8px 14px", flexShrink: 0, flex: isMobile ? 1 : "0 0 auto" }
          : { ...S.btnPrimary, fontSize: 12.5, padding: "8px 16px", flexShrink: 0, flex: isMobile ? 1 : "0 0 auto" }}>
        {isDone ? "Repetir" : "Iniciar →"}
      </button>
    </>
  );

  return (
    <div style={{ display: "flex", flex: 1, minWidth: 0, background: C.paper, border: `1px solid ${C.line}`, borderRadius: 10, overflow: "hidden" }}>
      {exModels.length > 1 ? (
        <div style={{ width: 5, flexShrink: 0, display: "flex", flexDirection: "column" }}>
          <div style={{ flex: 1, background: MODEL_META[exModels[0]]?.color || meta.color }} />
          <div style={{ flex: 1, background: MODEL_META[exModels[1]]?.color || meta.color }} />
        </div>
      ) : (
        <div style={{ width: 5, flexShrink: 0, background: meta.color }} />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div onClick={() => setOpen((o) => !o)}
          style={{ display: "flex", alignItems: "center", gap: 10, padding: isMobile ? "12px 12px 12px 14px" : "11px 14px", cursor: "pointer", userSelect: "none" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontFamily: F.sans, fontSize: isMobile ? 15.5 : 16, fontWeight: 500, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>
              {ex.title}
            </span>
            {/* Línea meta inline: tipo + autor + estado — visible sin desplegar */}
            <span style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 3, overflow: "hidden" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: meta.color }} />
                <span style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 500, color: C.muted }}>
                  {exModels.length > 1 ? exModels.map(m => MODEL_META[m]?.label).join(" + ") : meta.label}
                </span>
              </span>
              {ex.composerName && ex.showComposer !== false && (
                <span style={{ fontFamily: F.sans, fontSize: 11, color: C.fnS, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  · {ex.composerName}
                </span>
              )}
            </span>
          </div>
          {isDone && score != null && (
            <span style={{ ...S.badge, background: scoreBg(score), color: scoreColor(score), flexShrink: 0 }}>{score}%</span>
          )}
          {isDone && score == null && (
            <StatusCircle done />
          )}
          <Chevron open={open} />
          {/* En escritorio, los botones van en línea; en móvil bajan a su propia fila */}
          {!isMobile && actionButtons}
        </div>

        {isMobile && (
          <div style={{ display: "flex", gap: 8, padding: "0 12px 12px 14px" }}>
            {actionButtons}
          </div>
        )}

        {open && (
          <div style={{ borderTop: `1px solid ${C.line}`, padding: "10px 14px 12px", display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: "12px 24px", background: C.bg }}>
            <MetaItem label="Tipo">
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: meta.color }} />
              {exModels.length > 1 ? exModels.map(m => MODEL_META[m]?.label).join(" + ") : meta.label}
            </MetaItem>
            <MetaItem label="Duración">{fmt(ex.duration)}</MetaItem>
            {isQuiz
              ? <MetaItem label="Preguntas">{exQs.length || "—"}</MetaItem>
              : allBtns.length > 0 && <MetaItem label="Categorías"><CategoryDots buttons={allBtns} /></MetaItem>}
            {isDone && (
              <MetaItem label="Resultado">
                <StatusCircle done />
                {score != null ? `${score}%` : "Entregado"}
              </MetaItem>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Dashboard del alumno — cabecera editorial + pestañas + riel de cursos
function StudentDash({ user, exercises, results, courses, units, groups = [], onExercise, onViewCorrection, onLogout, onChangeTeacher, onUpdatePalette, tab = "all", onTab }) {
  const isMobile = useIsMobile();
  const view    = tab;             // controlado por la URL
  const setView = onTab || (() => {});
  const [openCourseIds, setOpenCourseIds] = useState(() => new Set(courses.map((c) => c.id)));
  const [openUnitIds,   setOpenUnitIds]   = useState(new Set());
  const [filterModel,   setFilterModel]   = useState("all");
  const [filterDone,    setFilterDone]    = useState("all");
  const toggleCourse = (id) => setOpenCourseIds((s) => toggleInSet(s, id));
  const toggleUnit   = (id) => setOpenUnitIds((s) => toggleInSet(s, id));

  const teacherCourses = useMemo(() => {
    const studentGroupIds = new Set(groups.filter((g) => g.studentIds?.includes(user.id)).map((g) => g.id));
    return courses.filter((c) => {
      if (c.hidden) return false;
      const vis = c.visibility ?? "teacher";
      if (vis === "public")  return true;
      if (vis === "group")   return studentGroupIds.has(c.visibilityGroupId);
      // "teacher" (default): cursos del profesor asignado
      if (!c.ownerId) return true;
      return c.ownerId === user.teacherId;
    });
  }, [courses, groups, user.id, user.teacherId]);

  const filteredExercises = useMemo(() => {
    return exercises.filter((ex) => {
      if (ex.hidden) return false;
      if (filterModel !== "all" && !modelsOf(ex).includes(filterModel)) return false;
      if (filterDone === "done"    && !results[ex.id]) return false;
      if (filterDone === "notdone" &&  results[ex.id]) return false;
      return true;
    });
  }, [exercises, filterModel, filterDone, results]);

  return (
    <div style={S.app}>
      <div style={{ ...S.page, padding: isMobile ? "calc(18px + env(safe-area-inset-top,0px)) 14px 40px" : S.page.padding }}>
        {user.isGuest && (
          <div style={{ background: C.noteBg, border: `1px solid rgba(199,122,26,0.28)`, borderRadius: 8, padding: "8px 14px", marginBottom: 20, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontFamily: F.sans, fontSize: 12, fontWeight: 600, color: C.noteInk }}>Modo invitado</span>
            <span style={{ fontFamily: F.sans, fontSize: 12, color: C.muted }}>· Los resultados no se guardan al salir</span>
          </div>
        )}

        {/* Cabecera editorial */}
        <div style={{ marginBottom: isMobile ? 18 : 24, paddingBottom: isMobile ? 14 : 20, borderBottom: `2px solid ${C.ink}`, display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <Overline>Alumno</Overline>
            <h1 style={{ ...S.h1, fontSize: isMobile ? 24 : 32, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.displayName}</h1>
          </div>
          <div style={{ display: "flex", gap: 8, flexShrink: 0, alignItems: "center" }}>
            {onUpdatePalette && (
              <PaletteMenuButton current={user.defaultPalette || SCHEMA_PALETTE_DEFAULT} onSelect={onUpdatePalette} />
            )}
            {!user.isGuest && onChangeTeacher && (
              <GhostButton onClick={onChangeTeacher}>{isMobile ? "Profesor" : "Cambiar profesor"}</GhostButton>
            )}
            <GhostButton onClick={onLogout}>Salir</GhostButton>
          </div>
        </div>

        {/* Pestañas */}
        <div className="fa-noscroll" style={{ display: "flex", borderBottom: `1px solid ${C.line}`, marginBottom: 22, overflowX: "auto", flexWrap: "nowrap", WebkitOverflowScrolling: "touch", scrollbarWidth: "none" }}>
          <TabBar tabs={[{ id: "all", label: "Todos los ejercicios" }, { id: "courses", label: "Por cursos" }]} value={view} onChange={setView} />
        </div>

        {/* ── Todos los ejercicios ── */}
        {view === "all" && (
          <>
            <StudentFilterBar
              filterModel={filterModel} setFilterModel={setFilterModel}
              filterDone={filterDone}   setFilterDone={setFilterDone}
            />
            {filteredExercises.length === 0
              ? <p style={{ color: C.muted, fontFamily: F.sans, textAlign: "center", padding: "2rem 1rem", fontSize: 13 }}>
                  {exercises.length === 0
                    ? "Tu profesor aún no ha publicado ejercicios."
                    : "Ningún ejercicio coincide con los filtros."}
                </p>
              : <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  {filteredExercises.map((ex) => (
                    <ExerciseRow key={ex.id} ex={ex} result={results[ex.id]} onOpen={onExercise} onViewCorrection={onViewCorrection} />
                  ))}
                </div>
            }
          </>
        )}

        {/* ── Por cursos (riel tipográfico) ── */}
        {view === "courses" && (
          teacherCourses.length === 0
            ? <p style={{ color: C.muted, fontFamily: F.sans, textAlign: "center", padding: "3rem 1rem" }}>El profesor aún no ha creado ningún curso.</p>
            : teacherCourses.map((course) => {
                const courseUnits = units.filter((u) => course.unitIds.includes(u.id) && !u.hidden);
                const courseOpen  = openCourseIds.has(course.id);
                return (
                  <div key={course.id} style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 10, overflow: "hidden", marginBottom: 20 }}>
                    <div onClick={() => toggleCourse(course.id)} style={{ cursor: "pointer", userSelect: "none", padding: isMobile ? "16px 16px" : "20px 24px", borderBottom: courseOpen ? `1px solid ${C.line}` : "none" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: course.description ? 6 : 0, flexWrap: "wrap" }}>
                            <span style={{ fontFamily: F.serif, fontSize: isMobile ? 23 : 30, fontWeight: 600, letterSpacing: "-0.01em", lineHeight: 1.05, wordBreak: "break-word" }}>{course.name}</span>
                            <Chevron open={courseOpen} rotate90WhenClosed size={14} />
                          </div>
                          {course.description && <div style={{ fontFamily: F.sans, fontSize: 13, color: "#888" }}>{course.description}</div>}
                        </div>
                      </div>
                    </div>

                    {courseOpen && (
                      <div style={{ padding: isMobile ? "16px 0 18px 14px" : "20px 0 24px 24px" }}>
                        {courseUnits.length === 0
                          ? <p style={{ fontFamily: F.sans, color: C.muted, fontSize: 13, margin: 0, paddingRight: isMobile ? 14 : 24 }}>Este curso no tiene unidades todavía.</p>
                          : courseUnits.map((unit, unitIdx) => {
                              const isOpen     = openUnitIds.has(unit.id);
                              const isLastUnit = unitIdx === courseUnits.length - 1;
                              const unitNum    = String(unitIdx + 1).padStart(2, "0");
                              const railW      = isMobile ? 40 : 52;
                              const numW       = isMobile ? 30 : 36;
                              return (
                                <div key={unit.id} style={{ display: "flex", marginBottom: isLastUnit ? 0 : 28 }}>
                                  {/* Riel */}
                                  <div style={{ width: railW, flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center" }}>
                                    <div style={{ width: numW, height: numW, borderRadius: "50%", background: C.ink, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: F.serif, fontSize: isMobile ? 14 : 17, fontWeight: 600 }}>{unitNum}</div>
                                    {(!isLastUnit || isOpen) && <div style={{ width: 1, flex: 1, background: C.rail, marginTop: 6 }} />}
                                  </div>
                                  {/* Contenido */}
                                  <div style={{ flex: 1, paddingTop: 5, minWidth: 0 }}>
                                    <div onClick={() => toggleUnit(unit.id)} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: isOpen ? 12 : 0, paddingRight: isMobile ? 12 : 20, cursor: "pointer", userSelect: "none" }}>
                                      <span style={{ fontFamily: F.serif, fontSize: isMobile ? 18 : 23, fontWeight: 600, letterSpacing: "-0.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{unit.name}</span>
                                      <Chevron open={isOpen} rotate90WhenClosed />
                                      <span style={{ fontFamily: F.sans, fontSize: 12, fontWeight: 400, color: C.muted, marginLeft: 2, flexShrink: 0 }}>
                                        {unit.exerciseIds.length} {unit.exerciseIds.length === 1 ? "ej." : "ejs."}
                                      </span>
                                    </div>
                                    {isOpen && (
                                      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                                        {unit.exerciseIds.length === 0
                                          ? <p style={{ fontFamily: F.sans, fontSize: 12, color: C.muted, margin: "2px 0" }}>Esta unidad no tiene ejercicios asignados.</p>
                                          : unit.exerciseIds.map((eid) => {
                                              const ex = exercises.find((e) => e.id === eid);
                                              if (!ex || ex.hidden) return null;
                                              return (
                                                <div key={ex.id} style={{ display: "flex", alignItems: "flex-start", marginLeft: -railW }}>
                                                  <div style={{ width: railW, flexShrink: 0, display: "flex", justifyContent: "center", paddingTop: 13 }}>
                                                    <StatusCircle done={results[ex.id] != null} />
                                                  </div>
                                                  <ExerciseRow ex={ex} result={results[ex.id]} onOpen={onExercise} onViewCorrection={onViewCorrection} />
                                                </div>
                                              );
                                            })}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                      </div>
                    )}
                  </div>
                );
              })
        )}
      </div>
    </div>
  );
}

// ═══ 8. REPRODUCTOR DE AUDIO COMPARTIDO ════════════════════════════════════

// Hook compartido por ExerciseView, QuestionManagerView y QuestionnaireView.
//   onWaveform:      callback(waveformData) tras decodificar el audio.
//   loopRegionRef:   ref con { audioStart, audioEnd } | null para bucle en
//                    fragmentos (QuestionnaireView).
function useAudioPlayer(exercise, { onWaveform = null, loopRegionRef = null } = {}) {
  const dur           = exercise.duration;
  const audioUrl      = exercise.audioUrl;
  const hasAudio      = !!audioUrl;
  const fragmentStart = exercise.audioFragmentStart ?? 0;
  const fragmentEnd   = exercise.audioFragmentEnd   ?? null;

  const [time,          setTime]          = useState(0);
  const [playing,       setPlaying]       = useState(false);
  const [audioReady,    setAudioReady]    = useState(false);
  const [audioError,    setAudioError]    = useState(null);
  const [audioDuration, setAudioDuration] = useState(exercise.duration);

  const ctxRef           = useRef(null);
  const bufferRef        = useRef(null);
  const sourceRef        = useRef(null);
  const startCtxTimeRef  = useRef(0);
  const playOffsetRef    = useRef(0);
  const playingRef       = useRef(false);
  const timeRef          = useRef(0);
  const scrubbingRef     = useRef(false);
  // Cada fuente recibe un ID único; onended sólo actúa si sigue siendo la fuente activa
  const sourceIdRef      = useRef(0);
  // Evita que togglePlay sea llamado concurrentemente mientras ctx.resume() está pendiente
  const pendingToggleRef = useRef(false);
  // Throttle de setTime: el canvas lee timeRef directamente a 60 fps; React solo necesita
  // ~10 fps para el contador de tiempo visible → mucho menos re-renders.
  const lastSetTimeRef   = useRef(0);
  playingRef.current     = playing;
  timeRef.current        = time;

  const stopSource = () => {
    if (sourceRef.current) {
      sourceIdRef.current += 1;            // invalida el onended de la fuente anterior
      try { sourceRef.current.stop(); } catch (_) {}
      sourceRef.current = null;
    }
  };

  const startSource = (offset) => {
    const ctx = ctxRef.current;
    if (!ctx || !bufferRef.current) return;
    const myId = ++sourceIdRef.current;    // captura el ID de ESTA fuente
    const src  = ctx.createBufferSource();
    src.buffer = bufferRef.current;
    src.connect(ctx.destination);
    src.onended = () => {
      if (sourceIdRef.current !== myId) return;   // ya hay otra fuente activa → ignorar
      const lq = loopRegionRef?.current;
      if (!lq && playingRef.current) {
        timeRef.current       = dur;
        playOffsetRef.current = dur;
        setTime(dur);
        setPlaying(false);
      }
    };
    const absOffset = Math.min(bufferRef.current.duration, offset + fragmentStart);
    const clipDur   = fragmentEnd != null ? Math.max(0, (fragmentEnd - fragmentStart) - offset) : undefined;
    src.start(0, absOffset, clipDur);
    sourceRef.current        = src;
    startCtxTimeRef.current  = ctx.currentTime;
  };

  // Carga + decodificación cuando cambia el ejercicio
  useEffect(() => {
    setTime(0); setPlaying(false); setAudioReady(false); setAudioError(null);
    setAudioDuration(exercise.duration);
    playOffsetRef.current = 0;
    bufferRef.current     = null;
    if (!hasAudio) return;

    let cancelled = false;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) { setAudioError("Tu navegador no soporta Web Audio API"); return; }
    const ctx = new AudioCtx();
    ctxRef.current = ctx;

    (async () => {
      try {
        const buf     = await fetchAudioBuffer(audioUrl);
        const decoded = await ctx.decodeAudioData(buf);
        if (cancelled) return;
        bufferRef.current = decoded;
        setAudioDuration(decoded.duration);
        setAudioReady(true);
        onWaveform?.(buildFragmentWaveform(decoded.getChannelData(0), decoded.duration, fragmentStart, fragmentEnd));
      } catch (_) { if (!cancelled) setAudioError("Error al decodificar el audio"); }
    })();

    return () => { cancelled = true; stopSource(); try { ctx.close(); } catch (_) {} };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exercise.id, audioUrl]);

  // Timer simulado cuando no hay audio real
  const timerRef = useRef(null);
  useEffect(() => {
    if (playing && !hasAudio) {
      timerRef.current = setInterval(() => {
        if (scrubbingRef.current) return;
        setTime((t) => {
          const lq = loopRegionRef?.current;
          let next;
          if (lq && t >= lq.audioEnd) {
            next = lq.audioStart;
          } else if (!lq && t >= dur) {
            timeRef.current = dur;
            setPlaying(false);
            return dur;
          } else {
            next = t + 0.05;
          }
          timeRef.current = next;
          return next;
        });
      }, 50);
    }
    return () => clearInterval(timerRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, dur, hasAudio]);

  // RAF tick para audio real — el canvas lee timeRef a 60 fps; React setState se
  // throttlea a ~10 fps para no saturar el árbol de componentes con re-renders.
  useEffect(() => {
    if (!playing || !hasAudio) return;
    let raf;
    const tick = () => {
      const ctx = ctxRef.current;
      if (ctx && !scrubbingRef.current) {
        const rawT = playOffsetRef.current + (ctx.currentTime - startCtxTimeRef.current);
        const lq   = loopRegionRef?.current;
        if (lq && rawT >= lq.audioEnd) {
          stopSource();
          playOffsetRef.current = lq.audioStart;
          timeRef.current = lq.audioStart;
          setTime(lq.audioStart);          // loop reset: sin throttle
          lastSetTimeRef.current = performance.now();
          startSource(lq.audioStart);
        } else {
          // Techo de la línea de tiempo (0..dur). `dur` es la duración del
          // ejercicio/fragmento que ve el alumno; el buffer puede contener más
          // (archivo completo) o menos audio. El límite reproducible real desde
          // el inicio del fragmento es (bufferDuration - fragmentStart); nunca
          // debemos pasar de ahí ni de `dur`.
          const bufDur      = bufferRef.current?.duration ?? dur;
          const playable    = Math.max(0, bufDur - fragmentStart);
          const effectiveDur = Math.min(dur, playable);
          const t = Math.min(effectiveDur, rawT);
          timeRef.current = t;             // siempre actualizar ref (canvas lo lee directo)
          const now = performance.now();
          if (now - lastSetTimeRef.current >= 100) {    // ~10 fps para React
            lastSetTimeRef.current = now;
            setTime(t);
          }
          if (!lq && rawT >= effectiveDur) {
            timeRef.current = effectiveDur;
            setTime(effectiveDur);         // fin de audio: sin throttle
            setPlaying(false);
            return;
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, dur, hasAudio]);

  const togglePlay = () => {
    if (!hasAudio || !bufferRef.current) { setPlaying((p) => !p); return; }
    if (pendingToggleRef.current) return;
    const ctx = ctxRef.current;
    const wasPlaying = playingRef.current;
    pendingToggleRef.current = true;
    ctx.resume().then(() => {
      pendingToggleRef.current = false;
      if (wasPlaying) {
        stopSource();
        playOffsetRef.current = Math.min(dur, playOffsetRef.current + (ctx.currentTime - startCtxTimeRef.current));
        setPlaying(false);
      } else {
        stopSource();                        // safety: matar cualquier fuente huérfana
        startSource(playOffsetRef.current);
        setPlaying(true);
      }
    });
  };

  const seekTo = (t) => {
    const c = Math.max(0, Math.min(dur, t));
    playOffsetRef.current = c; setTime(c);
    if (playingRef.current && bufferRef.current && ctxRef.current) { stopSource(); startSource(c); }
  };

  // Saltar e iniciar reproducción (usado por QuestionnaireView)
  const playFrom = (t) => {
    const c = Math.max(0, Math.min(dur, t));
    playOffsetRef.current = c; setTime(c);
    if (hasAudio && bufferRef.current && ctxRef.current) {
      stopSource();
      ctxRef.current.resume().then(() => { startSource(c); setPlaying(true); });
    } else {
      setPlaying(true);
    }
  };

  const scrubBegin = () => { scrubbingRef.current = true; stopSource(); };
  const scrubTo    = (t) => { const c = Math.max(0, Math.min(dur, t)); playOffsetRef.current = c; setTime(c); };
  const scrubEnd   = () => {
    if (!scrubbingRef.current) return;
    scrubbingRef.current = false;
    if (playingRef.current && bufferRef.current && ctxRef.current) startSource(playOffsetRef.current);
  };

  return {
    time, setTime, playing, setPlaying,
    audioReady, audioError, hasAudio,
    timeRef, playOffsetRef,
    audioDuration,
    togglePlay, seekTo, playFrom,
    scrubBegin, scrubTo, scrubEnd,
  };
}


// Selector visual de fragmento (barra de rango con handles arrastrables)
function FragmentRangeSelector({ totalDuration, start, end, onChange, onClear, onDefine, audioUrl }) {
  const barRef    = useRef(null);
  const audioRef  = useRef(null);
  const rafRef    = useRef(null);
  const [playing,      setPlaying]      = useState(false);
  const [currentTime,  setCurrentTime]  = useState(start ?? 0);
  // fragPlayMode: si true, la reproducción se limita al fragmento; si false, reproduce libre
  const [fragPlayMode, setFragPlayMode] = useState(false);

  // Refs para acceder a valores actuales dentro del RAF sin causar re-renders
  const startRef        = useRef(start);
  const endRef          = useRef(end);
  const fragPlayModeRef = useRef(false);
  startRef.current        = start;
  endRef.current          = end;
  fragPlayModeRef.current = fragPlayMode;

  // RAF: actualiza el playhead y, en modo fragmento, para al llegar al fin
  useEffect(() => {
    if (!playing) { cancelAnimationFrame(rafRef.current); return; }
    const tick = () => {
      const audio = audioRef.current;
      if (!audio) { rafRef.current = requestAnimationFrame(tick); return; }
      const t = audio.currentTime;
      setCurrentTime(t);
      const e = endRef.current;
      const s = startRef.current;
      // Parar al final del fragmento solo en fragPlayMode
      if (fragPlayModeRef.current && e != null && t >= e) {
        audio.pause();
        audio.currentTime = s ?? 0;
        setCurrentTime(s ?? 0);
        setPlaying(false);
        setFragPlayMode(false);
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing]);

  // Cleanup: parar audio al desmontar el componente
  useEffect(() => () => {
    cancelAnimationFrame(rafRef.current);
    if (audioRef.current) audioRef.current.pause();
  }, []);

  // Si el fragmento cambia y el cursor queda fuera, recolocarlo
  useEffect(() => {
    if (audioRef.current && !playing) {
      if (start != null && (currentTime < start || (end != null && currentTime > end))) {
        audioRef.current.currentTime = start;
        setCurrentTime(start);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start, end]);

  const getT = (clientX) => {
    const r = barRef.current?.getBoundingClientRect();
    if (!r || r.width === 0) return 0;
    return Math.max(0, Math.min(totalDuration, ((clientX - r.left) / r.width) * totalDuration));
  };

  // Clic/arrastre en la barra para seek (ratón + touch, con limpieza garantizada)
  const beginSeek = (e) => {
    startPointerDrag(e, {
      onStart: (ev, getX) => {
        const t = getT(getX(ev));
        if (audioRef.current) audioRef.current.currentTime = t;
        setCurrentTime(t);
      },
      onMove: (ev, getX) => {
        const tv = getT(getX(ev));
        if (audioRef.current) audioRef.current.currentTime = tv;
        setCurrentTime(tv);
      },
    });
  };

  // Arrastre de handles de fragmento (ratón + touch, con limpieza garantizada)
  const beginDrag = (e, which) => {
    e.stopPropagation();
    startPointerDrag(e, {
      onMove: (ev, getX) => {
        const raw = Math.round(getT(getX(ev)) * 10) / 10;
        if (which === "start") onChange({ start: Math.max(0, Math.min(raw, end - 0.5)), end });
        else                   onChange({ start, end: Math.max(start + 0.5, Math.min(raw, totalDuration)) });
      },
    });
  };

  // Reproducción libre (sin límite de fragmento)
  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
      setFragPlayMode(false);
    } else {
      setFragPlayMode(false);
      // Si el audio llegó al final, rebobinar antes de reproducir de nuevo
      if (audio.ended || audio.currentTime >= (audio.duration || totalDuration)) {
        audio.currentTime = 0;
        setCurrentTime(0);
      }
      audio.play().catch(() => {});
      setPlaying(true);
    }
  };

  // Reproducción solo del fragmento (fragStart → fragEnd)
  const playFragment = () => {
    const audio = audioRef.current;
    if (!audio || start == null) return;
    if (playing && fragPlayMode) {
      audio.pause();
      setPlaying(false);
      setFragPlayMode(false);
      return;
    }
    if (playing) audio.pause();
    audio.currentTime = start;
    setCurrentTime(start);
    setFragPlayMode(true);
    audio.play().catch(() => {});
    setPlaying(true);
  };

  const startPct    = start != null ? (start / totalDuration) * 100 : null;
  const endPct      = end   != null ? (end   / totalDuration) * 100 : null;
  const playheadPct = Math.min(100, (currentTime / totalDuration) * 100);

  const HANDLE_W = 12;
  const handleStyle = (pct) => ({
    position: "absolute", top: 0, bottom: 0,
    left: `calc(${pct}% - ${HANDLE_W / 2}px)`, width: HANDLE_W,
    background: C.quiz, borderRadius: 3, cursor: "ew-resize",
    display: "flex", alignItems: "center", justifyContent: "center", zIndex: 3,
  });

  // Formato M:SS.d para mayor precisión en el contador
  const fmtP = (s) => {
    const m  = Math.floor(s / 60);
    const ss = (s % 60).toFixed(1).padStart(4, "0");
    return `${m}:${ss}`;
  };

  return (
    <div>
      {/* Audio element oculto */}
      {audioUrl && <audio ref={audioRef} src={audioUrl} preload="auto" style={{ display: "none" }} />}

      {/* Fila de controles: play + tiempo + botones de fragmento */}
      <div style={{ ...S.row, gap: 8, marginBottom: 10, alignItems: "center" }}>
        {/* ▶ Reproducir desde posición actual (libre) */}
        <button type="button" onClick={togglePlay} disabled={!audioUrl}
          title="Reproducir desde aquí"
          style={{
            ...S.btn, width: 34, height: 34, padding: 0, flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 14, borderRadius: "50%",
            background: (playing && !fragPlayMode) ? C.ink : C.paper,
            color:      (playing && !fragPlayMode) ? C.paper : C.ink2,
            border: `1px solid ${(playing && !fragPlayMode) ? C.ink : C.line}`,
          }}>
          {(playing && !fragPlayMode) ? "⏸" : "▶"}
        </button>

        {/* Contador de tiempo */}
        <span style={{ fontFamily: FONT_MONO, fontSize: 12, color: C.ink2, minWidth: 70 }}>
          {fmtP(currentTime)}
          {totalDuration ? <span style={{ color: C.muted }}> / {fmt(totalDuration)}</span> : null}
        </span>

        <div style={{ flex: 1 }} />

        {/* ▶ Solo fragmento (solo cuando fragmento definido) / + Definir */}
        {start !== null ? (
          <button type="button" onClick={playFragment} disabled={!audioUrl}
            title="Reproducir solo el fragmento seleccionado"
            style={{
              ...S.btn, padding: "4px 10px", fontSize: 12, flexShrink: 0,
              display: "flex", alignItems: "center", gap: 5,
              background: fragPlayMode ? C.quiz : "rgba(47,111,184,0.08)",
              color:      fragPlayMode ? "#fff"  : C.quiz,
              border: `1px solid ${fragPlayMode ? C.quiz : "rgba(47,111,184,0.35)"}`,
            }}>
            <span style={{ fontSize: 11 }}>{fragPlayMode ? "⏸" : "▶"}</span>
            <span>Solo fragmento</span>
          </button>
        ) : (
          <button type="button" onClick={onDefine}
            style={{ ...S.btn, padding: "4px 10px", fontSize: 12, flexShrink: 0 }}>
            + Definir fragmento
          </button>
        )}
      </div>

      {/* Barra integrada: seek + región de fragmento + handles + playhead */}
      <div style={{ position: "relative", paddingTop: start != null ? 20 : 6, marginBottom: 12, userSelect: "none" }}>
        {/* Etiquetas sobre los handles */}
        {start != null && startPct != null && (
          <div style={{ position: "absolute", top: 0, left: `clamp(0px, calc(${startPct}% - 22px), calc(100% - 44px))`, fontSize: 10, color: C.quiz, fontFamily: FONT_MONO, whiteSpace: "nowrap", pointerEvents: "none" }}>
            {fmt(start)}
          </div>
        )}
        {end != null && endPct != null && (
          <div style={{ position: "absolute", top: 0, left: `clamp(22px, calc(${endPct}% - 22px), calc(100% - 0px))`, fontSize: 10, color: C.quiz, fontFamily: FONT_MONO, whiteSpace: "nowrap", pointerEvents: "none" }}>
            {fmt(end)}
          </div>
        )}

        {/* La barra principal (clicable para seek) */}
        <div ref={barRef} onMouseDown={beginSeek} onTouchStart={beginSeek}
          style={{ position: "relative", height: 32, background: C.paper2, border: `1px solid ${C.line}`, borderRadius: 6, cursor: "crosshair", overflow: "visible" }}>

          {/* Región del fragmento */}
          {start != null && startPct != null && endPct != null && (
            <div style={{
              position: "absolute", top: 3, bottom: 3,
              left: `${startPct}%`, width: `${Math.max(0, endPct - startPct)}%`,
              background: "rgba(47,111,184,0.18)", border: "1px solid rgba(47,111,184,0.4)", borderRadius: 3, pointerEvents: "none",
            }} />
          )}

          {/* Zona fuera del fragmento (oscurecida) */}
          {start != null && startPct != null && startPct > 0 && (
            <div style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: `${startPct}%`, background: "rgba(26,25,21,0.07)", borderRadius: "6px 0 0 6px", pointerEvents: "none" }} />
          )}
          {end != null && endPct != null && endPct < 100 && (
            <div style={{ position: "absolute", top: 0, bottom: 0, left: `${endPct}%`, right: 0, background: "rgba(26,25,21,0.07)", borderRadius: "0 6px 6px 0", pointerEvents: "none" }} />
          )}

          {/* Playhead */}
          <div style={{
            position: "absolute", top: -3, bottom: -3,
            left: `${playheadPct}%`, width: 2, marginLeft: -1,
            background: C.fnT, borderRadius: 1, pointerEvents: "none", zIndex: 4,
          }}>
            <div style={{ position: "absolute", top: 0, left: -3, width: 8, height: 8, borderRadius: "50%", background: C.fnT }} />
          </div>

          {/* Handle izquierdo */}
          {start != null && startPct != null && (
            <div onMouseDown={(e) => beginDrag(e, "start")} onTouchStart={(e) => beginDrag(e, "start")} style={handleStyle(startPct)}>
              <span style={{ width: 2, height: 14, background: "rgba(255,255,255,0.7)", borderRadius: 1, display: "block" }} />
            </div>
          )}
          {/* Handle derecho */}
          {end != null && endPct != null && (
            <div onMouseDown={(e) => beginDrag(e, "end")} onTouchStart={(e) => beginDrag(e, "end")} style={handleStyle(endPct)}>
              <span style={{ width: 2, height: 14, background: "rgba(255,255,255,0.7)", borderRadius: 1, display: "block" }} />
            </div>
          )}
        </div>
      </div>

      {/* Inputs numéricos (solo cuando hay fragmento) */}
      {start != null && (
        <div style={{ ...S.row, gap: 8, marginBottom: 10, alignItems: "flex-end" }}>
          <div style={{ flex: 1 }}>
            <label style={{ ...S.label, fontSize: 11, marginBottom: 3 }}>Inicio (s)</label>
            <input type="number" min={0} max={end - 0.5} step={0.1}
              style={{ ...S.input, fontFamily: FONT_MONO, fontSize: 13 }}
              value={start}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (!isNaN(v)) onChange({ start: Math.max(0, Math.min(v, end - 0.5)), end });
              }} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ ...S.label, fontSize: 11, marginBottom: 3 }}>Fin (s)</label>
            <input type="number" min={start + 0.5} max={totalDuration} step={0.1}
              style={{ ...S.input, fontFamily: FONT_MONO, fontSize: 13 }}
              value={end}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (!isNaN(v)) onChange({ start, end: Math.max(start + 0.5, Math.min(v, totalDuration)) });
              }} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ ...S.label, fontSize: 11, marginBottom: 3 }}>Duración</label>
            <div style={{ ...S.input, fontFamily: FONT_MONO, fontSize: 13, background: C.paper2, color: C.ink2, display: "flex", alignItems: "center" }}>
              {fmt(Math.max(0, end - start))}
            </div>
          </div>
        </div>
      )}

      {/* Botón quitar fragmento */}
      {start !== null && (
        <button type="button" onClick={onClear}
          style={{ ...S.btn, width: "100%", fontSize: 12, color: C.muted, padding: "6px 10px" }}>
          Usar audio completo
        </button>
      )}
    </div>
  );
}

// Canvas con forma de onda + cursor central + intervalos coloreados
function WaveformDisplay({
  time, timeRef: timeRefProp, duration, waveformDuration,
  allIntervals, exerciseId, waveformData,
  colorByFn, questionRegion,
  onScrubBegin, onScrubTo, onScrubEnd,
}) {
  const canvasRef = useRef(null);
  const waveData  = useMemo(
    () => waveformData || generateWaveform(exerciseId * 13 + 997, Math.max(400, Math.ceil(duration * 30))),
    [waveformData, exerciseId, duration]
  );
  const stateRef = useRef({});
  Object.assign(stateRef.current, {
    time, timeRef: timeRefProp, allIntervals, waveData, duration, waveformDuration,
    colorByFn, questionRegion,
    onScrubBegin, onScrubTo, onScrubEnd,
  });

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const NUM_BARS = 120;
    const secPerBar = VISIBLE_SECS / NUM_BARS;
    const halfBars  = NUM_BARS / 2;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width  = Math.max(1, Math.floor(rect.width  * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      canvas.getContext("2d").setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
    if (ro) ro.observe(canvas);
    window.addEventListener("resize", resize);

    let rafId;
    const FRAME_MS = 1000 / 75;          // cap a 75 fps
    let lastFrameTime = -FRAME_MS;       // garantiza que el primer frame siempre dibuja
    const ctx = canvas.getContext("2d");
    const drawPill = (x, y, w, h) => {
      if (typeof ctx.roundRect === "function") {
        const r = Math.min(w, h) / 2;
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, r);
        ctx.fill();
      } else {
        ctx.fillRect(x, y, w, h);
      }
    };

    const draw = (ts = 0) => {
      if (ts - lastFrameTime < FRAME_MS) { rafId = requestAnimationFrame(draw); return; }
      lastFrameTime = ts;
      const { time: tState, timeRef: tRef, allIntervals: ivs, waveData: wd, duration: dur, waveformDuration: wDur, colorByFn: cmap, questionRegion: qr } = stateRef.current;
      const t = tRef?.current ?? tState;
      const rect = canvas.getBoundingClientRect();
      const W = rect.width, H = rect.height, mid = H / 2;
      const barW = W / NUM_BARS, drawW = barW * 0.7, offsetX = barW * 0.15;
      const pxPerSec = W / VISIBLE_SECS;
      const centerK  = Math.floor(t / secPerBar);
      const kMin = centerK - halfBars - 1, kMax = centerK + halfBars + 1;
      // wDur: duración real del audio; dur: duración del ejercicio (para eventos/bloques)
      const effectiveWDur = wDur || dur;

      ctx.fillStyle = C.paper2;
      ctx.fillRect(0, 0, W, H);

      for (let k = kMin; k <= kMax; k++) {
        const barTime = k * secPerBar;
        const xLeft   = (barTime - t) * pxPerSec + W / 2 + offsetX;
        if (barTime < 0 || barTime > dur) {
          ctx.fillStyle = "rgba(26,25,21,0.12)";
          ctx.fillRect(xLeft, mid - 2, drawW, 4);
          continue;
        }
        const si = Math.min(Math.round((barTime / effectiveWDur) * (wd.length - 1)), wd.length - 1);
        const h  = Math.max(1.5, wd[si] * (mid - 4));
        let fn = null;
        for (let j = 0; j < ivs.length; j++) {
          const iv = ivs[j];
          if (barTime >= iv.start && barTime < iv.end) { fn = iv.fn; break; }
        }
        ctx.fillStyle = (fn && cmap && cmap[fn]) ? cmap[fn] : "rgba(26,25,21,0.28)";
        drawPill(xLeft, mid - h, drawW, h * 2);
      }

      if (qr) {
        const x1 = (qr.start - t) * pxPerSec + W / 2;
        const x2 = (qr.end   - t) * pxPerSec + W / 2;
        if (x2 > 0 && x1 < W) {
          const col = qr.color || C.quiz;
          ctx.fillStyle = col + "30";
          ctx.fillRect(Math.max(0, x1), 0, Math.min(W, x2) - Math.max(0, x1), H);
          ctx.fillStyle = col + "BB";
          if (x1 > 0 && x1 < W) ctx.fillRect(x1 - 1, 0, 2, H);
          if (x2 > 0 && x2 < W) ctx.fillRect(x2 - 1, 0, 2, H);
        }
      }

      ctx.fillStyle = "rgba(26,25,21,0.85)";
      ctx.fillRect(W / 2 - 1, 3, 2, H - 6);

      rafId = requestAnimationFrame(draw);
    };
    draw();  // primer frame síncrono: evita el destello blanco al montar

    return () => { cancelAnimationFrame(rafId); if (ro) ro.disconnect(); window.removeEventListener("resize", resize); };
  }, []);

  const handlePointerDown = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    let anchorX = 0, anchorTime = 0;
    startPointerDrag(e, {
      onStart: (ev, getX) => { anchorX = getX(ev); anchorTime = stateRef.current.time; stateRef.current.onScrubBegin(); },
      onMove:  (ev, getX) => { const delta = (getX(ev) - anchorX) * VISIBLE_SECS / rect.width; stateRef.current.onScrubTo(anchorTime - delta); },
      onEnd:   () => stateRef.current.onScrubEnd(),
    });
  };

  return (
    <canvas ref={canvasRef}
      style={{ display: "block", width: "100%", height: 80, cursor: "crosshair", borderRadius: 8, touchAction: "none", userSelect: "none" }}
      onMouseDown={handlePointerDown}
      onTouchStart={handlePointerDown}
    />
  );
}

// ═══ 9. EXERCISE VIEW (sesión interactiva) ══════════════════════════════════

// Botonera de funciones (T/S/D…) pulsables con tecla
function FunctionButtons({ buttons, pressing, onDown, onUp }) {
  const isMobile = useIsMobile();
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(buttons.length, 3)}, 1fr)`, gap: 10, marginBottom: 4 }}>
      {buttons.map((b) => {
        const isActive = pressing?.fn === b.id;
        return (
          <button key={b.id}
            onMouseDown={() => onDown(b.id)}
            onMouseUp  ={() => onUp(b.id)}
            onMouseLeave={() => { if (pressing?.fn === b.id) onUp(b.id); }}
            onTouchStart={(e) => { e.preventDefault(); onDown(b.id); }}
            onTouchEnd  ={(e) => { e.preventDefault(); onUp(b.id);   }}
            style={{
              background: isActive ? b.color : C.paper,
              border:     `1.5px solid ${isActive ? b.color : C.line}`,
              color:      isActive ? C.paper : b.color,
              borderRadius: 16, padding: isMobile ? "20px 8px" : "18px 8px", cursor: "pointer",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
              transition: "background .08s, color .08s, border-color .08s, transform .08s, box-shadow .08s",
              transform: isActive ? "scale(0.97)" : "scale(1)",
              boxShadow: isActive ? `0 0 0 4px ${b.color}26` : "none",
              userSelect: "none", touchAction: "none", WebkitTapHighlightColor: "transparent",
            }}>
            <span style={{ fontSize: isMobile ? 32 : 30, fontWeight: 800, fontFamily: FONT_MONO, letterSpacing: -1, color: isActive ? C.paper : b.color, lineHeight: 1 }}>{b.id}</span>
            <span style={{ fontSize: 12.5, fontWeight: 500, color: isActive ? C.paper : C.ink2 }}>{b.name}</span>
            {!isMobile && <span style={{ fontSize: 10, fontFamily: FONT_MONO, color: isActive ? C.paper : C.muted, opacity: 0.85, marginTop: 1 }}>tecla {b.key.toUpperCase()}</span>}
          </button>
        );
      })}
    </div>
  );
}

// Strip de intervalos: render de una categoría (activa o secundaria)
function IntervalStrip({
  category, intervals, isActive, isFnStyle, gutter,
  duration, time, selected, mode, exercise,
  onBeginDragBody, onBeginDragEdge, onSelect, timelineRef,
}) {
  const stripH = isActive ? 44 : 18;
  const pct = (t) => `${(t / duration) * 100}%`;

  return (
    <div style={{ marginTop: 8, marginLeft: gutter, marginRight: gutter, opacity: isActive ? 1 : 0.55 }}>
      <div style={{ fontFamily: FONT_MONO, fontSize: 9, letterSpacing: 1.2, color: isActive ? C.ink2 : C.muted, textTransform: "uppercase", marginBottom: 2, lineHeight: 1, paddingLeft: 2, userSelect: "none" }}>
        {category.name.split(" ")[0]}
      </div>

      <div ref={isActive ? timelineRef : null} style={{
        position: "relative", height: stripH, borderRadius: 6,
        background: "rgba(26,25,21,0.04)", display: "flex", alignItems: "center",
        userSelect: "none", touchAction: isActive ? "none" : "auto", overflow: "hidden",
      }}>
        {intervals.map((iv, i) => {
          const b      = btnOf(category, iv.fn);
          const isSel  = isActive && selected === iv.id;
          const isLive = isActive && iv.id === "live";

          const commonDragHandlers = isActive && !isLive ? {
            onMouseDown:  (e) => onBeginDragBody(e, iv.id),
            onTouchStart: (e) => onBeginDragBody(e, iv.id),
          } : {};

          if (isFnStyle) {
            const dotSize = isActive ? 22 : 12;
            const fontSize = isActive ? 11 : 8;
            const lineH = isActive ? 2 : 1.5;
            return (
              <div key={iv.id || `${iv.fn}-${i}`} {...commonDragHandlers}
                style={{
                  position: "absolute", top: 2, bottom: 2,
                  left: pct(iv.start), width: pct(Math.max(0, Math.min(iv.end, duration) - iv.start)),
                  background: isSel ? `${b.color}1F` : "transparent",
                  opacity: isLive ? 0.5 : 1,
                  border: isSel ? `1.5px solid ${b.color}` : `1px solid ${C.line}`,
                  borderRadius: 4,
                  cursor: isActive && !isLive ? "grab" : "default",
                  display: "flex", alignItems: "center", justifyContent: "flex-start",
                  overflow: "hidden", boxSizing: "border-box",
                  paddingLeft: isActive ? 4 : 2, paddingRight: 2,
                  zIndex: isSel ? 2 : 1,
                }}
                title={`${iv.fn} · ${fmt(iv.start)}–${fmt(iv.end)}`}>
                {isActive && !isLive && <div onMouseDown={(e) => onBeginDragEdge(e, iv.id, "start")} onTouchStart={(e) => onBeginDragEdge(e, iv.id, "start")} style={{ position: "absolute", left: -4, top: -2, bottom: -2, width: 10, cursor: "ew-resize", zIndex: 3 }} />}
                <div style={{ flex: `0 0 ${dotSize}px`, width: dotSize, height: dotSize, borderRadius: "50%", background: b.color, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT_MONO, fontWeight: 700, fontSize, color: C.paper, pointerEvents: "none", lineHeight: 1 }}>{iv.fn}</div>
                <div style={{ flex: "1 1 auto", height: lineH, marginLeft: isActive ? 4 : 2, background: b.color, borderRadius: lineH, alignSelf: "center", transform: `translateY(${fontSize * 0.32}px)`, pointerEvents: "none" }} />
                {isActive && !isLive && <div onMouseDown={(e) => onBeginDragEdge(e, iv.id, "end")} onTouchStart={(e) => onBeginDragEdge(e, iv.id, "end")} style={{ position: "absolute", right: -4, top: -2, bottom: -2, width: 10, cursor: "ew-resize", zIndex: 3 }} />}
              </div>
            );
          }

          return (
            <div key={iv.id || `${iv.fn}-${i}`} {...commonDragHandlers}
              style={{
                position: "absolute", top: 2, bottom: 2,
                left: pct(iv.start), width: pct(Math.max(0, Math.min(iv.end, duration) - iv.start)),
                background: b.color, opacity: isLive ? 0.5 : (isSel ? 1 : 0.86),
                border: isSel ? `1.5px solid ${C.ink}` : "none",
                borderRadius: 4,
                cursor: isActive && !isLive ? "grab" : "default",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: isActive ? 12 : 9, fontFamily: FONT_MONO, fontWeight: 700,
                color: C.paper, overflow: "hidden", boxSizing: "border-box",
              }}
              title={`${iv.fn} · ${fmt(iv.start)}–${fmt(iv.end)}`}>
              {isActive && !isLive && <div onMouseDown={(e) => onBeginDragEdge(e, iv.id, "start")} onTouchStart={(e) => onBeginDragEdge(e, iv.id, "start")} style={{ position: "absolute", left: -4, top: -2, bottom: -2, width: 10, cursor: "ew-resize", zIndex: 3 }} />}
              <span style={{ pointerEvents: "none", padding: "0 6px" }}>{iv.fn}</span>
              {isActive && !isLive && <div onMouseDown={(e) => onBeginDragEdge(e, iv.id, "end")} onTouchStart={(e) => onBeginDragEdge(e, iv.id, "end")} style={{ position: "absolute", right: -4, top: -2, bottom: -2, width: 10, cursor: "ew-resize", zIndex: 3 }} />}
            </div>
          );
        })}

        {isActive && selected && (() => {
          const selIv = intervals.find((iv) => iv.id === selected);
          if (!selIv || selIv.id === "live") return null;
          const selBtn = btnOf(category, selIv.fn);
          const handleBg     = isFnStyle ? selBtn.color : C.paper;
          const handleShadow = isFnStyle ? `0 0 0 1.5px ${C.paper}, 0 0 0 2.5px ${selBtn.color}` : `0 0 0 1.5px ${C.ink}`;
          const Handle = ({ side }) => (
            <div style={{ position: "absolute", top: 0, bottom: 0, left: `calc(${pct(side === "start" ? selIv.start : selIv.end)} - 3px)`, width: 6, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none", zIndex: 4 }}>
              <div style={{ width: 4, height: "70%", background: handleBg, borderRadius: 2, boxShadow: handleShadow }} />
            </div>
          );
          return <><Handle side="start" /><Handle side="end" /></>;
        })()}

        <div style={{ position: "absolute", top: 0, bottom: 0, left: pct(time), width: 1.5, background: C.ink, opacity: 0.55, pointerEvents: "none", zIndex: 2 }} />
      </div>
    </div>
  );
}

function ExerciseView({ exercise, mode, onSubmit, onBack, modelToggleNode = null, sharedAudioPlayer = null }) {
  const dur          = exercise.duration;
  const exCategories = categoriesOf(exercise);
  const initialCategoryId = useMemo(() => {
    if (mode === "record") {
      const empty = exCategories.find((m) => answerFor(exercise, m.id).length === 0);
      if (empty) return empty.id;
    }
    return exCategories[0]?.id || DEFAULT_CATEGORY.id;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exercise.id]);

  const [currentCategoryId, setCurrentCategoryId] = useState(initialCategoryId);
  const exCategory = exCategories.find((m) => m.id === currentCategoryId) || exCategories[0];
  const colorByFn  = useMemo(() => {
    const m = {};
    exCategory.buttons.forEach((b) => { m[b.id] = b.color; });
    return m;
  }, [exCategory]);

  const [intervalsByCategory, setIntervalsByCategory] = useState({});
  const [pressing,     setPressing]     = useState(null);
  const [selected,     setSelected]     = useState(null);
  const [localWaveformData, setLocalWaveformData] = useState(exercise.waveformData || null);
  const waveformData = sharedAudioPlayer?.waveformData ?? localWaveformData;

  // Cuando hay reproductor compartido, se omite la carga propia de audio
  const localOnWaveform = (!sharedAudioPlayer && !exercise.waveformData) ? (wd) => setLocalWaveformData(wd) : null;
  const localPlayer = useAudioPlayer(
    sharedAudioPlayer ? { id: exercise.id, duration: exercise.duration, audioUrl: null } : exercise,
    { onWaveform: localOnWaveform }
  );
  const {
    time, playing, audioReady, audioError, hasAudio,
    timeRef, togglePlay, seekTo, scrubBegin, scrubTo, scrubEnd, audioDuration,
  } = sharedAudioPlayer || localPlayer;

  const intervals    = intervalsByCategory[currentCategoryId] || [];
  const setIntervals = (updater) => setIntervalsByCategory((prev) => {
    const cur  = prev[currentCategoryId] || [];
    const next = typeof updater === "function" ? updater(cur) : updater;
    return { ...prev, [currentCategoryId]: next };
  });

  useEffect(() => { setIntervalsByCategory({}); setPressing(null); setSelected(null); }, [exercise.id]);

  const timelineRef = useRef(null);

  // Cambio de categoría: cierra el intervalo en curso de la actual
  const switchCategory = (newId) => {
    if (newId === currentCategoryId) return;
    if (pressing) {
      const end = timeRef.current;
      if (end - pressing.start > 0.1) {
        setIntervalsByCategory((prev) => {
          const cur = prev[currentCategoryId] || [];
          return { ...prev, [currentCategoryId]: [...cur, { id: uid("iv"), fn: pressing.fn, start: pressing.start, end }] };
        });
      }
      setPressing(null);
    }
    setSelected(null);
    setCurrentCategoryId(newId);
  };

  // Helper para añadir un intervalo nuevo (cerrando el actual)
  const commitInterval = (fn, start, end) => {
    const newIv = { id: uid("iv"), fn, start, end };
    setIntervals((prev) => [...resolveOverlap(prev, newIv), newIv]);
  };

  // Teclado (mantén pulsada la tecla mientras suena)
  const togglePlayRef = useRef(togglePlay);
  useEffect(() => { togglePlayRef.current = togglePlay; });
  useEffect(() => {
    const down = (e) => {
      if (e.repeat) return;
      const btn = exCategory.buttons.find((b) => b.key === e.key.toLowerCase());
      if (btn) {
        setPressing((p) => {
          const now = timeRef.current;
          if (p && p.fn === btn.id) return p;
          if (p && now - p.start > 0.1) commitInterval(p.fn, p.start, now);
          return { fn: btn.id, start: now };
        });
      }
      if (e.key === " ") { e.preventDefault(); togglePlayRef.current(); }
    };
    const up = (e) => {
      const btn = exCategory.buttons.find((b) => b.key === e.key.toLowerCase());
      if (btn) setPressing((p) => {
        if (!p || p.fn !== btn.id) return p;
        const end = timeRef.current;
        if (end - p.start > 0.1) commitInterval(btn.id, p.start, end);
        return null;
      });
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup",   up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exCategory]);

  const handleFnDown = (fn) => setPressing((p) => {
    const now = timeRef.current;
    if (p && p.fn === fn) return p;
    if (p && now - p.start > 0.1) commitInterval(p.fn, p.start, now);
    return { fn, start: now };
  });
  const handleFnUp = (fn) => setPressing((p) => {
    if (!p || p.fn !== fn) return p;
    const end = timeRef.current;
    if (end - p.start > 0.1) commitInterval(fn, p.start, end);
    return null;
  });

  const handleSubmit = () => {
    let byCategory = intervalsByCategory;
    if (pressing) {
      const end = timeRef.current;
      const cur = byCategory[currentCategoryId] || [];
      const newIv = { id: uid("iv"), fn: pressing.fn, start: pressing.start, end };
      byCategory = { ...byCategory, [currentCategoryId]: [...resolveOverlap(cur, newIv), newIv] };
    }
    const touched = Object.entries(byCategory);
    const source  = touched.length > 0 ? touched : [[currentCategoryId, []]];
    onSubmit({
      entries: source.map(([categoryId, ivs]) => ({
        categoryId,
        intervals: ivs.map(({ fn, start, end }) => ({ fn, start, end })),
      })),
      currentCategoryId,
    });
  };

  const deleteSelected = () => { setIntervals((p) => p.filter((iv) => iv.id !== selected)); setSelected(null); };

  // Drag de bordes de un intervalo (resize)
  const beginDragEdge = (e, ivId, which) => {
    e.stopPropagation();
    setSelected(ivId);
    const tl = timelineRef.current;
    if (!tl) return;
    const rect = tl.getBoundingClientRect();
    const xToTime = (x) => Math.max(0, Math.min(dur, ((x - rect.left) / rect.width) * dur));
    const origIvs = intervals;
    const origIv  = origIvs.find((iv) => iv.id === ivId);
    if (!origIv) return;
    startPointerDrag(e, {
      onMove: (ev, getX) => {
        const t = xToTime(getX(ev));
        const updated = which === "start"
          ? { ...origIv, start: Math.min(origIv.end - 0.1, t) }
          : { ...origIv, end:   Math.max(origIv.start + 0.1, t) };
        setIntervals([...resolveOverlap(origIvs.filter((iv) => iv.id !== ivId), updated), updated]);
      },
    });
  };

  // Drag del cuerpo de un intervalo (mover)
  const beginDragBody = (e, ivId) => {
    e.stopPropagation();
    const tl = timelineRef.current;
    if (!tl) return;
    const rect    = tl.getBoundingClientRect();
    const origIvs = intervals;
    const iv0     = origIvs.find((iv) => iv.id === ivId);
    if (!iv0) return;
    const len = iv0.end - iv0.start;
    let startX = 0, moved = false;
    startPointerDrag(e, {
      onStart: (ev, getX) => { startX = getX(ev); },
      onMove:  (ev, getX) => {
        const cx = getX(ev);
        if (!moved && Math.abs(cx - startX) > 3) moved = true;
        if (!moved) return;
        const ns = Math.max(0, Math.min(dur - len, iv0.start + ((cx - startX) / rect.width) * dur));
        const updated = { ...iv0, start: ns, end: ns + len };
        setIntervals([...resolveOverlap(origIvs.filter((iv) => iv.id !== ivId), updated), updated]);
      },
      onEnd: () => { if (!moved) setSelected((s) => s === ivId ? null : ivId); },
    });
  };

  // Render
  const pct        = (t) => `${(t / dur) * 100}%`;
  const allIv      = pressing ? [...intervals, { id: "live", fn: pressing.fn, start: pressing.start, end: Math.min(timeRef.current, dur) }] : intervals;
  const selectedIv = intervals.find((iv) => iv.id === selected);
  const showSwitch = exCategories.length > 1;
  const SWITCH_W   = 14;
  const SWITCH_GAP = 8;
  const gutter     = showSwitch ? SWITCH_W + SWITCH_GAP : 0;

  // Conteo de fragmentos marcados (todas las categorías) para la barra de acción
  const markedCount = Object.values(intervalsByCategory).reduce((n, arr) => n + (arr?.length || 0), 0) + (pressing ? 1 : 0);
  const submitLabel = mode === "record" ? "Guardar clave" : mode === "preview" ? "Ver resultado" : "Entregar";

  return (
    <div style={S.app} onMouseDown={() => { if (selected !== null) setSelected(null); }}>
      <SessionHeader exercise={exercise} onBack={onBack} modelId="interactivo" />
      <div style={{ maxWidth: 980, margin: "0 auto", padding: "16px 16px 24px" }}>

        {modelToggleNode}

        {hasAudio && !audioReady && !audioError && <AudioLoadingOverlay />}
        {audioError && <div style={{ textAlign: "center", color: C.danger, fontSize: 12, marginBottom: 10 }}>{audioError}</div>}

        {mode === "student" && <SessionHint modelId="interactivo" extra={<>Pulsa <b>Espacio</b> para reproducir o pausar.</>} />}

        <section style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 16, padding: "14px 14px 12px", marginBottom: 12 }}>
          <div style={{ marginLeft: gutter, marginRight: gutter, background: C.paper2, borderRadius: 10, overflow: "hidden", border: `1px solid ${C.line}`, marginBottom: 8 }}>
            <WaveformDisplay time={time} timeRef={timeRef} duration={dur} waveformDuration={audioDuration} allIntervals={allIv}
              exerciseId={exercise.id} waveformData={waveformData}
              colorByFn={colorByFn}
              onScrubBegin={scrubBegin} onScrubTo={scrubTo} onScrubEnd={scrubEnd} />
          </div>

          <div style={{ position: "relative" }}>
            {showSwitch && (
              <div role="tablist" style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: SWITCH_W, display: "flex", flexDirection: "column", background: C.paper2, border: `1px solid ${C.line}`, borderRadius: 999, overflow: "hidden", padding: 2, gap: 2, boxSizing: "border-box" }}>
                {exCategories.map((m) => {
                  const isActive = m.id === currentCategoryId;
                  return (
                    <button key={m.id} type="button" role="tab" aria-selected={isActive}
                      onClick={() => switchCategory(m.id)} title={m.name}
                      style={{ flex: "1 1 0", minHeight: 0, border: "none", padding: 0, borderRadius: 999, background: isActive ? C.ink : "transparent", cursor: "pointer" }} />
                  );
                })}
              </div>
            )}
            {exCategories.map((m) => {
              const isActive = m.id === currentCategoryId;
              const ivs = isActive ? allIv : (intervalsByCategory[m.id] || (mode === "record" ? answerFor(exercise, m.id) : []));
              return (
                <IntervalStrip key={m.id}
                  category={m} intervals={ivs} isActive={isActive}
                  isFnStyle={m.id === "default"}
                  gutter={gutter} duration={dur} time={time}
                  selected={selected} mode={mode} exercise={exercise}
                  onBeginDragBody={beginDragBody} onBeginDragEdge={beginDragEdge}
                  onSelect={setSelected} timelineRef={timelineRef}
                />
              );
            })}
          </div>

          {mode === "student" && exercise.showHint && answerFor(exercise, currentCategoryId).length > 0 && (
            <div style={{ position: "relative", height: 6, marginTop: 6, marginLeft: gutter, marginRight: gutter }}>
              {answerFor(exercise, currentCategoryId).map((iv, i) => (
                <div key={i} style={{ position: "absolute", top: 0, bottom: 0, left: pct(iv.start), width: pct(iv.end - iv.start), background: C.muted2, opacity: 0.45, borderRadius: 2 }} />
              ))}
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 12, marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.line}` }}>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <CircleButton onClick={() => seekTo(0)} title="Volver al inicio">⏮</CircleButton>
            </div>
            <CircleButton onClick={togglePlay} disabled={hasAudio && !audioReady && !audioError}
              primary size={52} title={playing ? "Pausa (Espacio)" : "Reproducir (Espacio)"}>
              {playing ? "❚❚" : "▶"}
            </CircleButton>
            <div style={{ textAlign: "right", fontFamily: F.sans, fontVariantNumeric: "tabular-nums", fontSize: 22, fontWeight: 600, color: C.ink, letterSpacing: -0.5 }}>
              {fmt(time)}<span style={{ color: C.muted, fontWeight: 400 }}>/{fmt(dur)}</span>
            </div>
          </div>
        </section>

        {selected && selectedIv && (
          <div onMouseDown={(e) => e.stopPropagation()} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginBottom: 14, padding: "10px 12px", background: C.paper, border: `1px solid ${C.line}`, borderRadius: 12 }}>
            <span style={{ fontSize: 10, color: C.muted, fontFamily: FONT_SANS, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>Fragmento</span>
            {exCategory.buttons.map((b) => {
              const isSel = selectedIv.fn === b.id;
              return (
                <button key={b.id} className="fa-pressable"
                  onClick={() => setIntervals((prev) => prev.map((iv) => iv.id === selected ? { ...iv, fn: b.id } : iv))}
                  style={{ background: isSel ? b.color : C.paper, color: isSel ? C.paper : b.color, border: `1.5px solid ${b.color}`, borderRadius: 999, padding: "5px 13px", cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: FONT_MONO }}>
                  {b.id}
                </button>
              );
            })}
            <span style={{ fontSize: 11, color: C.muted2, fontFamily: FONT_MONO, marginLeft: 4 }}>{fmt(selectedIv.start)} → {fmt(selectedIv.end)}</span>
            <button onClick={deleteSelected} className="fa-pressable" style={{ ...S.btnDanger, marginLeft: "auto", padding: "5px 13px", fontSize: 12 }}>Eliminar</button>
          </div>
        )}

        <FunctionButtons buttons={exCategory.buttons} pressing={pressing} onDown={handleFnDown} onUp={handleFnUp} />
      </div>

      <StickyActionBar
        info={
          <>
            <span style={{ fontFamily: F.sans, fontSize: 13, fontWeight: 600, color: C.ink }}>
              {markedCount === 0 ? "Sin marcas todavía" : `${markedCount} ${markedCount === 1 ? "fragmento marcado" : "fragmentos marcados"}`}
            </span>
            <span style={{ fontFamily: F.sans, fontSize: 11, color: C.muted }}>Mantén pulsada la función mientras suena</span>
          </>
        }>
        <BarSubmitButton onClick={handleSubmit}>{submitLabel}</BarSubmitButton>
      </StickyActionBar>
    </div>
  );
}



// ─── Repeat timeline helpers ────────────────────────────────────────────────


/**
 * Divide la grabación en segmentos visuales. Cada repetición ocupa un slot cuyo
 * ancho de referencia es la duración de la 1ª vez; la 2ª vez comparte ese mismo
 * ancho horizontal pero se muestra en la fila inferior.
 */
function buildRepeatSegments(duration, repetitions) {
  if (!repetitions?.length) {
    return [{ type: "normal", recStart: 0, recEnd: duration, canonDur: duration, vStart: 0, vEnd: 1, index: 0 }];
  }
  const reps = [...repetitions]
    .filter(r => r?.first?.start != null && r?.second?.end != null)
    .sort((a, b) => a.first.start - b.first.start);
  const raw = [];
  let cur = 0;
  for (const rep of reps) {
    if (cur < rep.first.start - 0.01)
      raw.push({ type: "normal", recStart: cur, recEnd: rep.first.start, canonDur: rep.first.start - cur });
    raw.push({ type: "repeat", rep, canonDur: rep.first.end - rep.first.start });
    cur = rep.second.end;
  }
  if (cur < duration - 0.01)
    raw.push({ type: "normal", recStart: cur, recEnd: duration, canonDur: duration - cur });
  const total = raw.reduce((s, g) => s + g.canonDur, 0) || 1;
  let v = 0;
  raw.forEach((g, i) => { g.vStart = v; v += g.canonDur / total; g.vEnd = v; g.index = i; });
  return raw;
}

/** Devuelve { min, max } en segundos de grabación para un segmento + fila. */
function getSegBounds(seg, pass) {
  if (seg.type === "normal")         return { min: seg.recStart, max: seg.recEnd };
  if (seg.type === "repeat-first")   return { min: seg.recStart, max: seg.recEnd };
  if (seg.type === "repeat-second")  return { min: seg.recStart, max: seg.recEnd };
  return pass === "second"
    ? { min: seg.rep.second.start, max: seg.rep.second.end }
    : { min: seg.rep.first.start,  max: seg.rep.first.end  };
}

/**
 * En vista "completa": expande las repeticiones en segmentos secuenciales planos
 * (sin doble altura). Cada repetición produce dos segmentos consecutivos:
 * { type:"repeat-first"|"repeat-second", rep, recStart, recEnd, canonDur }
 */
function buildCompleteViewSegments(duration, repetitions) {
  if (!repetitions?.length) {
    return [{ type: "normal", recStart: 0, recEnd: duration, canonDur: duration, vStart: 0, vEnd: 1, index: 0 }];
  }
  const reps = [...repetitions]
    .filter(r => r?.first?.start != null && r?.second?.end != null)
    .sort((a, b) => a.first.start - b.first.start);
  const raw = [];
  let cur = 0;
  for (const rep of reps) {
    if (cur < rep.first.start - 0.01)
      raw.push({ type: "normal", recStart: cur, recEnd: rep.first.start, canonDur: rep.first.start - cur });
    raw.push({ type: "repeat-first",  rep, recStart: rep.first.start,  recEnd: rep.first.end,  canonDur: rep.first.end  - rep.first.start  });
    // Gap entre fin del original y comienzo de la repetición (si existe)
    if (rep.second.start > rep.first.end + 0.01)
      raw.push({ type: "normal", recStart: rep.first.end, recEnd: rep.second.start, canonDur: rep.second.start - rep.first.end });
    raw.push({ type: "repeat-second", rep, recStart: rep.second.start, recEnd: rep.second.end, canonDur: rep.second.end - rep.second.start });
    cur = rep.second.end;
  }
  if (cur < duration - 0.01)
    raw.push({ type: "normal", recStart: cur, recEnd: duration, canonDur: duration - cur });
  const total = raw.reduce((s, g) => s + g.canonDur, 0) || 1;
  let v = 0;
  raw.forEach((g, i) => { g.vStart = v; v += g.canonDur / total; g.vEnd = v; g.index = i; });
  return raw;
}

/** Sincroniza los bloques de la 2ª vez a partir de los de la 1ª vez.
 *  - Bloques NO overridden: se sincronizan completamente (posición y duración).
 *  - Bloques overridden: conservan su start manual pero la DURACIÓN siempre
 *    sigue proporcional a la del bloque original. Así, redimensionar el original
 *    actualiza la duración de la repetición aunque haya sido editada.
 *  - Bloques anclados a bordes de zona (_lockedStart/_lockedEnd): el asa
 *    correspondiente no se muestra para impedir separarlo del borde.
 */
function syncSecondPassBlocks(blocks, reps) {
  let result = [...blocks];
  for (const rep of reps) {
    const fd    = (rep.first.end  - rep.first.start)  || 1;
    const sd    = (rep.second.end - rep.second.start) || 1;
    const ratio = sd / fd;
    const firstBlocks  = blocks.filter(b => b.repeatId === rep.id && b.pass === "first"  && !b.isPreview);
    const secondBlocks = blocks.filter(b => b.repeatId === rep.id && b.pass === "second" && !b.isPreview);
    const newSecond = [];

    for (const fb of firstBlocks) {
      const isAtZoneStart = Math.abs(fb.start - rep.first.start) < 0.08;
      const isAtZoneEnd   = Math.abs(fb.end   - rep.first.end)   < 0.08;
      const derivedDur    = (fb.end - fb.start) * ratio;
      // Posición por defecto (sin override)
      const ds = isAtZoneStart ? rep.second.start : rep.second.start + ((fb.start - rep.first.start) / fd) * sd;
      const de = isAtZoneEnd   ? rep.second.end   : ds + derivedDur;

      const mirror = secondBlocks.find(b => b.mirrorId === fb.id);
      if (mirror?.overridden) {
        // Preservar start manual pero actualizar end con la duración proporcional
        let newStart, newEnd;
        if (isAtZoneStart) {
          newStart = rep.second.start;
          newEnd   = rep.second.start + derivedDur;
        } else if (isAtZoneEnd) {
          newEnd   = rep.second.end;
          newStart = rep.second.end - derivedDur;
        } else {
          newStart = mirror.start;
          newEnd   = mirror.start + derivedDur;
        }
        newStart = Math.max(rep.second.start, newStart);
        newEnd   = Math.min(rep.second.end,   newEnd);
        newSecond.push({ ...mirror, start: newStart, end: newEnd, _lockedStart: isAtZoneStart, _lockedEnd: isAtZoneEnd });
      } else if (mirror) {
        newSecond.push({ ...mirror, start: ds, end: de, label: fb.label, level: fb.level, customColor: fb.customColor, _lockedStart: isAtZoneStart, _lockedEnd: isAtZoneEnd });
      } else {
        newSecond.push({ ...fb, id: uid("sb"), pass: "second", mirrorId: fb.id, start: ds, end: de, _lockedStart: isAtZoneStart, _lockedEnd: isAtZoneEnd });
      }
    }
    // Overridden sin espejo primario: conservar
    for (const sb of secondBlocks) {
      if (sb.overridden && !newSecond.find(b => b.id === sb.id)) newSecond.push(sb);
    }
    result = result.filter(b => !(b.repeatId === rep.id && b.pass === "second" && !b.isPreview));
    result = [...result, ...newSecond];
  }
  return result;
}

/** Genera marcas de tiempo internas para la regla de un segmento. */
function rulerTicksForSeg(start, end, widthPx) {
  const d = end - start; if (d <= 0) return [];
  const STEPS = [1, 2, 5, 10, 15, 20, 30, 60, 120, 300];
  const target = d / Math.max(2, Math.floor((widthPx || 200) / 55));
  const step = STEPS.find(s => s >= target) || STEPS[STEPS.length - 1];
  const ticks = [];
  const first_t = Math.ceil(start / step) * step;
  for (let t = first_t; t < end - step * 0.1; t += step) ticks.push({ t, frac: (t - start) / d });
  return ticks;
}

// ─── Barras de repetición (notación musical SVG) ─────────────────────────────
// Lado "start" (apertura): línea gruesa | línea fina | puntos  →
// Lado "end"   (cierre):   ← puntos | línea fina | línea gruesa
const REPEAT_BARLINE_W = 17;   // ancho total del SVG (px)
function RepeatBarline({ side = "start", height = 44 }) {
  const THICK = 3.5, THIN = 1.3, GAP = 2.5, DOT_R = 2.3;
  const isStart = side === "start";
  // Posiciones: el par de líneas ocupa THICK+GAP+THIN desde el borde exterior
  const thickX = isStart ? 0.5                             : REPEAT_BARLINE_W - THICK - 0.5;
  const thinX  = isStart ? THICK + GAP + 0.5               : REPEAT_BARLINE_W - THICK - GAP - THIN - 0.5;
  const dotCX  = isStart ? REPEAT_BARLINE_W - DOT_R - 1.5  : DOT_R + 1.5;
  const dotY1  = height * 0.33, dotY2 = height * 0.67;
  return (
    <svg width={REPEAT_BARLINE_W} height={height} style={{ display: "block", flexShrink: 0, pointerEvents: "none" }}>
      <rect x={thickX} y={0} width={THICK} height={height} fill="black" opacity={0.65} />
      <rect x={thinX}  y={0} width={THIN}  height={height} fill="black" opacity={0.40} />
      <circle cx={dotCX} cy={dotY1} r={DOT_R} fill="black" opacity={0.70} />
      <circle cx={dotCX} cy={dotY2} r={DOT_R} fill="black" opacity={0.70} />
    </svg>
  );
}

// ─── Modal de gestión de repeticiones (solo modo "record") ───────────────────
function RepeatManagerModal({ exercise, duration, onSave, onClose }) {
  const [reps, setReps] = useState(
    (exercise.repetitions || []).map(r => ({ ...r, first: { ...r.first }, second: { ...r.second } }))
  );
  const [err, setErr] = useState("");

  const addRep = () => {
    if (!Number.isFinite(duration) || duration <= 0) {
      setErr("El ejercicio no tiene duración válida. Sube el audio antes de añadir repeticiones.");
      return;
    }
    const sorted  = [...reps].sort((a, b) => a.second.end - b.second.end);
    const lastEnd = sorted[sorted.length - 1]?.second.end ?? 0;
    const avail   = duration - lastEnd;
    if (avail < SCHEMA_MIN_DUR * 2) {
      setErr("No queda espacio suficiente al final del audio para otra repetición.");
      return;
    }
    const d       = Math.max(SCHEMA_MIN_DUR, Math.min(Math.round(Math.min(avail / 2.5, 30) * 10) / 10, 20));
    const start   = lastEnd;
    setReps(prev => [...prev, {
      id: uid("rep"), label: "",
      first:  { start, end: start + d },
      second: { start: start + d, end: Math.min(start + d * 2, duration) },
    }]);
  };

  const validate = () => {
    for (const r of reps) {
      if ((r.first.end - r.first.start) < 1) return "La 1ª vez debe durar al menos 1 s.";
      if ((r.second.end - r.first.end)   < 1) return "La 2ª vez debe durar al menos 1 s.";
      if (r.second.end > duration + 0.5)      return `La 2ª vez supera la duración del audio (${fmt(duration)}).`;
    }
    const sorted = [...reps].sort((a, b) => a.first.start - b.first.start);
    for (let i = 0; i < sorted.length - 1; i++) {
      if (sorted[i].second.end > sorted[i + 1].first.start + 0.01)
        return `Las repeticiones #${i + 1} y #${i + 2} se solapan. Ajusta los tiempos.`;
    }
    return "";
  };

  // Cuando cambia first.end, propaga a second.start
  const updFirst = (id, field, raw) => {
    setErr("");
    const v = Math.max(0, parseFloat(raw) || 0);
    setReps(p => p.map(r => {
      if (r.id !== id) return r;
      const newFirst = { ...r.first, [field]: v };
      // second.start siempre = first.end; second.end se ajusta proporcionalmente
      const origFD = (r.first.end - r.first.start) || 1;
      const origSD = (r.second.end - r.second.start) || 1;
      const ratio  = origSD / origFD;
      const newSD  = field === "end" ? Math.max(1, (newFirst.end - newFirst.start) * ratio) : origSD;
      const newSecond = { ...r.second, start: newFirst.end, end: newFirst.end + newSD };
      return { ...r, first: newFirst, second: newSecond };
    }));
  };
  const updSecondEnd = (id, raw) => {
    setErr("");
    const v = Math.max(0, parseFloat(raw) || 0);
    setReps(p => p.map(r => r.id === id ? { ...r, second: { ...r.second, end: v } } : r));
  };

  const handleSave = () => {
    const e = validate(); if (e) { setErr(e); return; }
    // Garantizar second.start = first.end antes de guardar
    onSave(reps.map(r => ({ ...r, second: { ...r.second, start: r.first.end } })));
  };

  return (
    <ModalShell width={520} align="top" zIndex={250}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <h3 style={{ ...S.h2, margin: 0, fontSize: 16 }}>Gestionar repeticiones</h3>
        <button onClick={onClose} style={{ ...S.btn, padding: "4px 10px", fontSize: 12 }}>Cancelar</button>
      </div>
      <p style={{ fontSize: 12, color: C.muted, margin: "0 0 14px", lineHeight: 1.6 }}>
        La 2ª vez empieza obligatoriamente donde termina la 1ª. Solo indica los tiempos de inicio, fin de 1ª vez y fin de 2ª vez.
      </p>

      {reps.length === 0 && (
        <div style={{ textAlign: "center", color: C.muted, fontSize: 13, padding: "14px 0" }}>Sin repeticiones definidas.</div>
      )}

      {reps.map((r, i) => (
        <div key={r.id} style={{ background: C.paper2, border: `1px solid ${C.line}`, borderRadius: 10, padding: "12px 14px", marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.ink2, minWidth: 22 }}>#{i + 1}</span>
            <input style={{ ...S.input, flex: 1, padding: "5px 8px", fontSize: 12 }}
              placeholder="Etiqueta opcional (p.ej. «A», «Estribillo»)"
              value={r.label || ""}
              onChange={e => setReps(p => p.map(x => x.id === r.id ? { ...x, label: e.target.value } : x))} />
            <button onClick={() => setReps(p => p.filter(x => x.id !== r.id))}
              style={{ ...S.btnDanger, padding: "4px 10px", fontSize: 11 }}>✕</button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto 1fr auto 1fr", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 11, color: C.fnS, fontWeight: 700 }}>Inicio</span>
            <input type="number" min={0} max={duration} step={0.5}
              style={{ ...S.input, padding: "5px 8px", fontSize: 12 }}
              value={r.first.start}
              onChange={e => updFirst(r.id, "start", e.target.value)} />

            <span style={{ fontSize: 11, color: C.fnS, fontWeight: 700 }}>Fin 1ª</span>
            <input type="number" min={0} max={duration} step={0.5}
              style={{ ...S.input, padding: "5px 8px", fontSize: 12 }}
              value={r.first.end}
              onChange={e => updFirst(r.id, "end", e.target.value)} />

            <span style={{ fontSize: 11, color: C.fnT, fontWeight: 700 }}>Fin 2ª</span>
            <input type="number" min={0} max={duration} step={0.5}
              style={{ ...S.input, padding: "5px 8px", fontSize: 12 }}
              value={r.second.end}
              onChange={e => updSecondEnd(r.id, e.target.value)} />
          </div>
          <div style={{ fontSize: 10, color: C.muted, marginTop: 6, fontFamily: FONT_MONO }}>
            {fmt(r.first.start)} → {fmt(r.first.end)} → {fmt(r.second.end)}
            &nbsp;·&nbsp;1ª: {fmt(r.first.end - r.first.start)} · 2ª: {fmt(Math.max(0, r.second.end - r.first.end))}
          </div>
        </div>
      ))}

      {err && <p style={{ color: C.danger, fontSize: 12, margin: "6px 0 10px" }}>{err}</p>}

      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button onClick={addRep} style={{ ...S.btn, fontSize: 12 }}>+ Añadir repetición</button>
        <div style={{ flex: 1 }} />
        <button onClick={handleSave} style={{ ...S.btnPrimary }}>Guardar</button>
      </div>
    </ModalShell>
  );
}

// ═══ 9b. SCHEMA EXERCISE VIEW (modelo Esquema) ══════════════════════════════

function SchemaExerciseView({ exercise, mode, onSubmit, onBack, modelToggleNode = null, sharedAudioPlayer = null }) {
  const duration = exercise.duration;
  const [localWaveformData, setLocalWaveformData] = useState(exercise.waveformData || null);
  const waveformData = sharedAudioPlayer?.waveformData ?? localWaveformData;

  const localOnWaveform = (!sharedAudioPlayer && !exercise.waveformData) ? wd => setLocalWaveformData(wd) : null;
  const localPlayer = useAudioPlayer(
    sharedAudioPlayer ? { id: exercise.id, duration: exercise.duration, audioUrl: null } : exercise,
    { onWaveform: localOnWaveform }
  );
  const {
    time, playing, audioReady, audioError, hasAudio,
    togglePlay, seekTo, scrubBegin, scrubTo, scrubEnd,
    timeRef: audioTimeRef, audioDuration,
  } = sharedAudioPlayer || localPlayer;

  const timeRef = useRef(0);
  timeRef.current = time;

  const [blocks,       setBlocks]       = useState(exercise.blocks || []);
  const [history,      setHistory]      = useState([]);
  const [selected,     setSelected]     = useState(null);
  const [selectedRepId, setSelectedRepId] = useState(null); // rep seleccionada en la banda
  const [editId,       setEditId]       = useState(null);
  const [editVal,      setEditVal]      = useState("");
  const [guides,       setGuides]       = useState([]);
  const [localReps,    setLocalReps]    = useState(exercise.repetitions || []);
  const [showRepModal, setShowRepModal] = useState(false);
  // repDraw: null | { step:"first"|"second"|"done"|"error", first?, second?, pendingStart?, pendingEnd? }
  const [repDraw,      setRepDraw]      = useState(null);
  // selectedPass: { [repId]: "first"|"second" } — qué vez mostrar cuando no está sonando
  const [selectedPass,    setSelectedPass]    = useState({});
  const repResizeRef    = useRef(null);   // drag de resize de zona de repetición
  const [repResizeGuide, setRepResizeGuide] = useState(null); // null | { xFrac, color }
  const localRepsRef = useRef(localReps);
  localRepsRef.current = localReps;

  const listenOnly = !!exercise.listenOnly;
  const [playCount,   setPlayCount]   = useState(0);
  const [schemaMarks, setSchemaMarks] = useState([]);
  const schemaMarksRef = useRef([]);
  schemaMarksRef.current = schemaMarks;

  // ── Zoom y desplazamiento horizontal del esquema ─────────────────────────
  const [schemaZoom,       setSchemaZoom]       = useState(1);
  const [schemaScrollFrac, setSchemaScrollFrac] = useState(0);
  const schemaOuterRef = useRef(null);
  const pinchRef       = useRef(null);

  // ── Modo de vista: "completa" (edición secuencial, sin doble altura)
  //               | "resumida" (doble altura, solo lectura)
  const [viewMode, setViewMode] = useState("completa");
  const viewModeRef = useRef("completa");
  viewModeRef.current = viewMode;

  // ── Paleta de color elegida por el alumno para los bloques del esquema ──────
  // "p1".."p5" = paletas de Adobe.
  const [schemaPalette, setSchemaPalette] = useState(exercise.schemaPalette || SCHEMA_PALETTE_DEFAULT);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const paletteRef = useRef(null);
  useEffect(() => {
    if (!paletteOpen) return;
    const onDown = (e) => { if (paletteRef.current && !paletteRef.current.contains(e.target)) setPaletteOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("touchstart", onDown); };
  }, [paletteOpen]);

  // ── Estado de la banda de repetición ────────────────────────────────────
  // bandDrag = null
  //   | { type:"create", startT, curT }          — arrastrando para crear
  //   | { type:"handle", handle, origRep }        — arrastrando asa de borde
  const [bandDrag, setBandDrag] = useState(null);
  const bandRef    = useRef(null);

  const segments    = useMemo(() =>
    viewMode === "resumida"
      ? buildRepeatSegments(duration, localReps)
      : buildCompleteViewSegments(duration, localReps),
    [duration, localReps, viewMode]);
  const segmentsRef = useRef(segments);
  segmentsRef.current = segments;
  const hasRepeats = localReps.length > 0;

  // ¿En qué repetición y qué vez estamos reproduciendo ahora?
  const activeRepeatPass = useMemo(() => {
    for (const r of localReps) {
      if (time >= r.first.start  && time < r.first.end)  return { repId: r.id, pass: "first"  };
      if (time >= r.second.start && time < r.second.end) return { repId: r.id, pass: "second" };
    }
    return null;
  }, [time, localReps]);

  // ── Sync 2ª vez al activar vista completa o al cambiar repeticiones ─────
  useEffect(() => {
    if (viewMode === "completa" && localReps.length > 0) {
      setBlocks(prev => syncSecondPassBlocks(prev, localReps));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, localReps.length]);

  // ── History helpers ──────────────────────────────────────────────────────
  const setBlocksSnap = updater => {
    setHistory(p => [...p, blocksRef.current]);
    setBlocks(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      // En vista completa, sincronizar la 2ª vez a partir de la 1ª
      if (viewMode === "completa" && localRepsRef.current.length > 0) {
        return syncSecondPassBlocks(next, localRepsRef.current);
      }
      return next;
    });
  };
  const undo = () => setHistory(p => {
    if (!p.length) return p;
    setBlocks(p[p.length - 1]);
    setSelected(null); setEditId(null); setEditVal("");
    return p.slice(0, -1);
  });
  const resetAll = () => { setHistory([]); setBlocks([]); setLocalReps([]); setSelected(null); setEditId(null); setEditVal(""); };

  // ── Refs ─────────────────────────────────────────────────────────────────
  // trackSegRefs: key = `${lvId}_${segIndex}_${pass}`  ("pass" = "normal"|"first"|"second")
  // ruler refs:   key = `ruler_${segIndex}_${pass}`
  const trackSegRefs  = useRef({});
  const dragRef       = useRef(null);
  const blocksRef     = useRef(blocks);
  const colorInputRef = useRef(null);
  blocksRef.current   = blocks;

  // Ruler container width (para calcular densidad de marcas)
  const [rulerW, setRulerW] = useState(600);
  const rulerContainerRef   = useRef(null);
  useEffect(() => {
    const el = rulerContainerRef.current; if (!el) return;
    setRulerW(el.getBoundingClientRect().width);
    const ro = new ResizeObserver(([e]) => setRulerW(e.contentRect.width));
    ro.observe(el); return () => ro.disconnect();
  }, []);

  // ── Rueda del ratón → zoom (listener no-pasivo para poder preventDefault) ──
  useEffect(() => {
    const outer = schemaOuterRef.current; if (!outer) return;
    const handler = e => {
      e.preventDefault();
      const rect    = outer.getBoundingClientRect();
      const curFrac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const factor  = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      setSchemaZoom(prevZoom => {
        const nextZoom = Math.min(8, Math.max(1, prevZoom * factor));
        if (nextZoom !== prevZoom) {
          setSchemaScrollFrac(prevSf => {
            if (nextZoom === 1) return 0;
            const newSf = (((prevSf * (prevZoom - 1)) + curFrac) * (nextZoom / prevZoom) - curFrac) / (nextZoom - 1);
            return Math.max(0, Math.min(1, newSf));
          });
        }
        return nextZoom;
      });
    };
    outer.addEventListener('wheel', handler, { passive: false });
    return () => outer.removeEventListener('wheel', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Guardar repeticiones desde el modal ─────────────────────────────────
  const handleSaveRepetitions = newReps => {
    setShowRepModal(false);
    setRepDraw(null);
    const oldIds = new Set(localRepsRef.current.map(r => r.id));
    const newIds = new Set(newReps.map(r => r.id));
    setBlocksSnap(prev => {
      let upd = [...prev];
      // Eliminar etiquetas de repeticiones borradas
      const removed = [...oldIds].filter(id => !newIds.has(id));
      upd = upd.map(b => removed.includes(b.repeatId) ? { ...b, repeatId: null, pass: null } : b);
      upd = upd.filter(b => !(removed.includes(b.repeatId) && b.pass === "second"));
      // Procesar repeticiones nuevas
      for (const rep of newReps.filter(r => !oldIds.has(r.id))) {
        // Etiquetar bloques existentes que caen dentro de la 1ª vez
        upd = upd.map(b => {
          if (b.repeatId) return b;
          if (b.start >= rep.first.start - 0.01 && b.end <= rep.first.end + 0.01)
            return { ...b, repeatId: rep.id, pass: "first" };
          return b;
        });
        // Crear copias espejadas para la 2ª vez (mismos bloques, escalados a la duración de la 2ª vez)
        const fd = (rep.first.end  - rep.first.start)  || 1;
        const sd = (rep.second.end - rep.second.start) || 1;
        const firstBlocks = upd.filter(b => b.repeatId === rep.id && b.pass === "first");
        upd = [...upd, ...firstBlocks.map(b => ({
          ...b,
          id:    uid("sb"),
          pass:  "second",
          start: rep.second.start + ((b.start - rep.first.start) / fd) * sd,
          end:   rep.second.start + ((b.end   - rep.first.start) / fd) * sd,
        }))];
      }
      // Escalar bloques de repeticiones actualizadas proporcionalmente a la nueva zona
      for (const newRep of newReps.filter(r => oldIds.has(r.id))) {
        const oldRep = localRepsRef.current.find(r => r.id === newRep.id);
        if (!oldRep) continue;
        if (oldRep.first.start === newRep.first.start && oldRep.first.end === newRep.first.end &&
            oldRep.second.start === newRep.second.start && oldRep.second.end === newRep.second.end) continue;
        const oldFD = (oldRep.first.end  - oldRep.first.start)  || 1;
        const newFD = (newRep.first.end  - newRep.first.start)  || 1;
        const oldSD = (oldRep.second.end - oldRep.second.start) || 1;
        const newSD = (newRep.second.end - newRep.second.start) || 1;
        upd = upd.map(b => {
          if (b.repeatId !== newRep.id) return b;
          if (b.pass === "first") {
            // Escalar dentro de la nueva 1ª zona
            const relS = (b.start - oldRep.first.start) / oldFD;
            const relE = (b.end   - oldRep.first.start) / oldFD;
            return { ...b, start: newRep.first.start + relS * newFD, end: newRep.first.start + relE * newFD };
          } else {
            // Escalar dentro de la nueva 2ª zona (todos: overridden y no overridden)
            const relS = (b.start - oldRep.second.start) / oldSD;
            const relE = (b.end   - oldRep.second.start) / oldSD;
            return { ...b, start: newRep.second.start + relS * newSD, end: newRep.second.start + relE * newSD };
          }
        }).filter(b => !(b.repeatId === newRep.id && b.end - b.start < 0.1));
      }
      return upd;
    });
    setLocalReps(newReps);
  };

  // ── Mapeo tiempo→posición visual (para bandas del overlay de dibujo) ─────
  const recToVisX = t => {
    for (const seg of segmentsRef.current) {
      if (seg.type === "normal" && t >= seg.recStart - 0.01 && t <= seg.recEnd + 0.01)
        return seg.vStart + Math.max(0, Math.min(1, (t - seg.recStart) / (seg.canonDur || 1))) * (seg.vEnd - seg.vStart);
      if (seg.type === "repeat-first" && t >= seg.recStart - 0.01 && t <= seg.recEnd + 0.01)
        return seg.vStart + Math.max(0, Math.min(1, (t - seg.recStart) / (seg.canonDur || 1))) * (seg.vEnd - seg.vStart);
      if (seg.type === "repeat-second" && t >= seg.recStart - 0.01 && t <= seg.recEnd + 0.01)
        return seg.vStart + Math.max(0, Math.min(1, (t - seg.recStart) / (seg.canonDur || 1))) * (seg.vEnd - seg.vStart);
      if (seg.type === "repeat") {
        const fp = seg.rep.first, fd = (fp.end - fp.start) || 1;
        if (t >= fp.start - 0.01 && t <= fp.end + 0.01)
          return seg.vStart + Math.max(0, Math.min(1, (t - fp.start) / fd)) * (seg.vEnd - seg.vStart);
      }
    }
    return t <= 0 ? 0 : 1;
  };

  // Igual que recToVisX pero, para segmentos "repeat" (vista resumida), mapea
  // la 2ª vez TAMBIÉN de forma proporcional dentro del mismo segmento visual.
  // Esto permite que bloques sin repeatId cuyo end cae en la 2ª ocurrencia
  // calculen su anchura visual correctamente (en vez de devolver siempre 1.0).
  const recToVisXResumed = t => {
    for (const seg of segmentsRef.current) {
      if (seg.type === "normal" && t >= seg.recStart - 0.01 && t <= seg.recEnd + 0.01)
        return seg.vStart + Math.max(0, Math.min(1, (t - seg.recStart) / (seg.canonDur || 1))) * (seg.vEnd - seg.vStart);
      if (seg.type === "repeat-first" && t >= seg.recStart - 0.01 && t <= seg.recEnd + 0.01)
        return seg.vStart + Math.max(0, Math.min(1, (t - seg.recStart) / (seg.canonDur || 1))) * (seg.vEnd - seg.vStart);
      if (seg.type === "repeat-second" && t >= seg.recStart - 0.01 && t <= seg.recEnd + 0.01)
        return seg.vStart + Math.max(0, Math.min(1, (t - seg.recStart) / (seg.canonDur || 1))) * (seg.vEnd - seg.vStart);
      if (seg.type === "repeat") {
        const fp = seg.rep.first, sp = seg.rep.second;
        const fd = (fp.end - fp.start) || 1;
        const sd = (sp.end - sp.start) || 1;
        // 1ª vez: igual que recToVisX
        if (t >= fp.start - 0.01 && t <= fp.end + 0.01)
          return seg.vStart + Math.max(0, Math.min(1, (t - fp.start) / fd)) * (seg.vEnd - seg.vStart);
        // 2ª vez: mapeo proporcional dentro del mismo rango visual
        if (t >= sp.start - 0.01 && t <= sp.end + 0.01)
          return seg.vStart + Math.max(0, Math.min(1, (t - sp.start) / sd)) * (seg.vEnd - seg.vStart);
      }
    }
    return t <= 0 ? 0 : 1;
  };

  // ── Eliminar una repetición por id ───────────────────────────────────────
  const deleteRepeat = repId => handleSaveRepetitions(localRepsRef.current.filter(r => r.id !== repId));

  // ── Banda de repetición: helpers y handlers ──────────────────────────────
  // En vista completa la fracción es lineal: frac = t / duration
  const timeToFrac = t  => Math.max(0, Math.min(1, t / duration));
  const fracToTime = f  => f * duration;   // sin redondeo para movimiento suave

  const getBandClientX = ev =>
    ev.touches?.[0]?.clientX ?? ev.changedTouches?.[0]?.clientX ?? ev.clientX;

  const getBandFrac = ev => {
    const el = bandRef.current; if (!el) return 0;
    const r  = el.getBoundingClientRect();
    return Math.max(0, Math.min(1, (getBandClientX(ev) - r.left) / r.width));
  };

  // Iniciar drag de creación — funciona aunque ya haya repeticiones
  const handleBandCreateDown = e => {
    if (e.target.closest("button") || e.target.closest("[data-band-handle]")) return;
    e.preventDefault();
    const BAND_SNAP  = Math.max(0.3, duration * 0.02);
    const AUTOSNAP_S = 5;
    const snapT = raw => {
      const pts = [0, duration,
        ...blocksRef.current.filter(b => !b.isPreview).flatMap(b => [b.start, b.end]),
        ...localRepsRef.current.flatMap(r => [r.first.start, r.first.end, r.second.end]),
      ];
      let best = raw, bestDist = BAND_SNAP;
      for (const c of pts) { const d = Math.abs(raw - c); if (d < bestDist) { bestDist = d; best = c; } }
      return best;
    };
    const startT = snapT(fracToTime(getBandFrac(e)));
    setBandDrag({ type: "create", startT, curT: startT });
    const mv = ev => {
      if (ev.cancelable) ev.preventDefault();
      setBandDrag(p => p ? { ...p, curT: snapT(fracToTime(getBandFrac(ev))) } : null);
    };
    const up = () => {
      setBandDrag(prev => {
        if (!prev) return null;
        const s  = Math.min(prev.startT, prev.curT);
        const e2 = Math.max(prev.startT, prev.curT);
        const d  = e2 - s;
        if (d >= SCHEMA_MIN_DUR) {
          let fs = s < 3 ? 0 : s;
          for (const r of localRepsRef.current) {
            if (fs > r.second.end - 0.1 && fs <= r.second.end + AUTOSNAP_S) { fs = r.second.end; break; }
          }
          const fe = fs + d, se = Math.min(duration, fe + d);
          handleSaveRepetitions([
            ...localRepsRef.current,
            { id: uid("rep"), label: "", first: { start: fs, end: fe }, second: { start: fe, end: se } },
          ]);
        }
        return null;
      });
      window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up);
      window.removeEventListener("touchmove", mv); window.removeEventListener("touchend", up);
    };
    window.addEventListener("mousemove", mv);
    window.addEventListener("mouseup",   up);
    window.addEventListener("touchmove", mv, { passive: false });
    window.addEventListener("touchend",  up);
  };

  // Añadir repetición programáticamente: usa el siguiente bloque de nivel 1 si existe,
  // o un tamaño por defecto si no hay ninguna parte delimitada todavía.
  const handleAddNextRep = e => {
    e.stopPropagation();
    const sorted  = [...localRepsRef.current].sort((a, b) => a.second.end - b.second.end);
    const lastEnd = sorted[sorted.length - 1]?.second.end ?? 0;
    // Intentar anclar a la siguiente Parte disponible
    const nextParte = blocksRef.current
      .filter(b => b.level === 1 && !b.isPreview && b.start >= lastEnd - 0.5)
      .sort((a, b) => a.start - b.start)[0];
    let fs, fe;
    if (nextParte) {
      fs = nextParte.start; fe = nextParte.end;
    } else {
      // Sin partes: tamaño por defecto
      const avail = duration - lastEnd;
      if (avail < SCHEMA_MIN_DUR * 2) return;
      const d = Math.max(SCHEMA_MIN_DUR, Math.min(Math.round(Math.min(avail / 2.5, 30) * 10) / 10, 20));
      fs = lastEnd; fe = Math.min(duration - SCHEMA_MIN_DUR, fs + d);
    }
    const se = Math.min(duration, fe + (fe - fs));
    handleSaveRepetitions([
      ...localRepsRef.current,
      { id: uid("rep"), label: "", first: { start: fs, end: fe }, second: { start: fe, end: se } },
    ]);
  };

  // Iniciar drag de asa de borde
  // handle: "first.start" | "junction" (first.end = second.start) | "second.end"
  const handleBandHandleDown = (e, rep, handle) => {
    e.preventDefault(); e.stopPropagation();

    const BAND_SNAP = Math.max(0.3, duration * 0.02);
    const snapT = raw => {
      const candidates = [0, duration, ...blocksRef.current.filter(b => !b.isPreview).flatMap(b => [b.start, b.end])];
      let best = raw, bestDist = BAND_SNAP;
      for (const c of candidates) { const dd = Math.abs(raw - c); if (dd < bestDist) { bestDist = dd; best = c; } }
      return best;
    };

    const calcNewRep = raw => {
      const t = snapT(raw);
      const r = { ...rep, first: { ...rep.first }, second: { ...rep.second } };
      if (handle === "first.start") {
        r.first.start = Math.max(0, Math.min(t, r.first.end - SCHEMA_MIN_DUR));
      } else if (handle === "junction") {
        // Mover juntos: fin del original = inicio de la repetición
        const jt = Math.max(r.first.start + SCHEMA_MIN_DUR, Math.min(t, duration - SCHEMA_MIN_DUR));
        // La 2ª vez se ajusta proporcionalmente: si el original crece/encoge, la repetición también
        const origFD = rep.first.end - rep.first.start || 1;
        const origSD = rep.second.end - rep.second.start || 1;
        const ratio  = origSD / origFD;
        r.first.end    = jt;
        r.second.start = jt;
        r.second.end   = Math.min(duration, jt + (jt - r.first.start) * ratio);
      } else {
        r.second.end = Math.max(r.second.start + SCHEMA_MIN_DUR, Math.min(t, duration));
      }
      return r;
    };

    const mv = ev => {
      if (ev.cancelable) ev.preventDefault();
      const newRep = calcNewRep(fracToTime(getBandFrac(ev)));
      setLocalReps(prev => prev.map(r => r.id === rep.id ? newRep : r));
    };
    const up = ev => {
      const newRep = calcNewRep(fracToTime(getBandFrac(ev)));
      handleSaveRepetitions(localRepsRef.current.map(r => r.id === rep.id ? newRep : r));
      setBandDrag(null);
      window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up);
      window.removeEventListener("touchmove", mv); window.removeEventListener("touchend", up);
    };
    window.addEventListener("mousemove", mv);
    window.addEventListener("mouseup",   up);
    window.addEventListener("touchmove", mv, { passive: false });
    window.addEventListener("touchend",  up);
  };

  // ── Dibujar repetición arrastrando en la regla ───────────────────────────
  const handleDrawDown = e => {
    if (!repDraw || repDraw.step === "done" || repDraw.step === "error") return;
    e.preventDefault();
    e.stopPropagation();
    const el = rulerContainerRef.current; if (!el) return;
    const rect = el.getBoundingClientRect();
    const toT = ev => {
      const x = ev.touches?.[0]?.clientX ?? ev.changedTouches?.[0]?.clientX ?? ev.clientX;
      return containerXToRec(Math.max(0, Math.min(1, (x - rect.left) / rect.width)));
    };
    const startT = toT(e);
    setRepDraw(prev => {
      if (!prev) return null;
      // En paso 2, el inicio siempre es first.end
      const ps = prev.step === "second" ? prev.first.end : startT;
      return { ...prev, pendingStart: ps, pendingEnd: startT };
    });
    const mv = ev => {
      if (ev.cancelable) ev.preventDefault();
      setRepDraw(prev => {
        if (!prev) return null;
        // En paso 2, pendingStart fijo en first.end
        const ps = prev.step === "second" ? prev.first.end : prev.pendingStart;
        return { ...prev, pendingStart: ps, pendingEnd: toT(ev) };
      });
    };
    const up = () => {
      setRepDraw(prev => {
        if (!prev || prev.pendingStart === null) return prev;
        if (prev.step === "first") {
          const s  = Math.min(prev.pendingStart, prev.pendingEnd ?? prev.pendingStart);
          const e2 = Math.max(prev.pendingStart, prev.pendingEnd ?? prev.pendingStart);
          if (e2 - s < 1) return { ...prev, pendingStart: null, pendingEnd: null };
          return { step: "second", first: { start: s, end: e2 }, pendingStart: null, pendingEnd: null };
        }
        if (prev.step === "second") {
          // Inicio fijo en first.end; el usuario solo arrastra el final
          const endT = Math.max(prev.pendingEnd ?? prev.first.end, prev.first.end + 1);
          return { step: "done", first: prev.first, second: { start: prev.first.end, end: endT } };
        }
        return prev;
      });
      window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up);
      window.removeEventListener("touchmove", mv); window.removeEventListener("touchend", up);
    };
    window.addEventListener("mousemove", mv); window.addEventListener("mouseup", up);
    window.addEventListener("touchmove", mv, { passive: false }); window.addEventListener("touchend", up);
  };

  // Confirmar repetición cuando llega al estado "done"
  useEffect(() => {
    if (repDraw?.step !== "done") return;
    let { first, second } = repDraw;
    // Enganche al inicio si la 1ª vez empieza antes de 5 s
    if (first.start < 5) first = { ...first, start: 0 };
    // Garantizar second.start = first.end siempre
    second = { ...second, start: first.end };
    handleSaveRepetitions([...localRepsRef.current, { id: uid("rep"), label: "", first, second }]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repDraw?.step]);

  // Cancelar con ESC
  useEffect(() => {
    if (!repDraw) return;
    const onKey = e => { if (e.key === "Escape") setRepDraw(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [!!repDraw]);

  // Delete / Backspace — borrar bloque o repetición seleccionada
  useEffect(() => {
    const onKey = e => {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      const tag = e.target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (selected) {
        setHistory(prev => [...prev, blocksRef.current]);
        setBlocks(prev => prev.filter(b => b.id !== selected));
        setSelected(null);
        e.preventDefault();
      } else if (selectedRepId) {
        deleteRepeat(selectedRepId);
        setSelectedRepId(null);
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, selectedRepId]);

  // ── Resize de barras de repetición arrastrando en la regla ─────────────
  const RESIZE_PX = 22; // zona de detección de borde (px desde cada extremo de la fila)

  const handleRepZoneRulerDown = (e, seg, pass) => {
    if (repDraw || listenOnly) return;
    const rowKey = `ruler_${seg.index}_${pass}`;
    const rowEl  = trackSegRefs.current[rowKey]; if (!rowEl) return;
    const rowRect  = rowEl.getBoundingClientRect();
    const rulerEl  = rulerContainerRef.current; if (!rulerEl) return;
    const rulerRect = rulerEl.getBoundingClientRect();
    const mouseX   = getClientX(e);
    const distL = mouseX - rowRect.left;
    const distR = rowRect.right - mouseX;
    const edgePx = Math.min(RESIZE_PX, rowRect.width * 0.28);
    const isLeft  = distL < edgePx;
    const isRight = distR < edgePx;

    if (!isLeft && !isRight) { handleSegRulerDown(e, seg, pass); return; }

    e.preventDefault();
    const { rep } = seg;
    // Ambos bordes del centro son la "junction" (first.end = second.start)
    const field = pass === "first"
      ? (isLeft ? "first.start" : "junction")
      : (isLeft ? "junction"    : "second.end");
    const color = pass === "first" ? C.fnS : C.fnT;
    repResizeRef.current = { repId: rep.id, field, rulerRect, seg, rep: { ...rep, first: { ...rep.first }, second: { ...rep.second } } };

    const toXFrac = ev => Math.max(0, Math.min(1, (getClientX(ev) - rulerRect.left) / rulerRect.width));
    setRepResizeGuide({ xFrac: toXFrac(e), color: "black" });

    const mv = ev => {
      if (ev.cancelable) ev.preventDefault();
      setRepResizeGuide({ xFrac: toXFrac(ev), color: "black" });
    };
    const up = ev => {
      const d = repResizeRef.current; if (!d) return;
      const xFrac      = toXFrac(ev);
      const xInSeg     = (xFrac - d.seg.vStart) / Math.max(0.001, d.seg.vEnd - d.seg.vStart);
      const cf         = Math.max(0, Math.min(1, xInSeg));
      const { rep: origRep } = d;
      let f = { ...origRep.first }, s = { ...origRep.second };
      const fd = f.end - f.start || 1, sd = s.end - s.start || 1;
      if (d.field === "first.start") {
        f.start = Math.min(f.end - 1, origRep.first.start + cf * fd);
        // Snap al inicio si < 5 s
        if (f.start < 5) f.start = 0;
      } else if (d.field === "junction") {
        // Mueve first.end y second.start juntos; second.end se ajusta en proporción
        const origSD = origRep.second.end - origRep.second.start || 1;
        const ratio  = origSD / fd;
        const newJunction = origRep.first.start + cf * fd;
        f.end   = Math.max(f.start + 1, Math.min(duration - 1, newJunction));
        s.start = f.end;
        const newFD = f.end - f.start;
        s.end = Math.min(duration, f.end + newFD * ratio);
      } else {
        s.end = Math.max(s.start + 1, origRep.second.start + cf * sd);
      }
      f.start = Math.max(0, f.start); f.end = Math.min(duration, f.end);
      s.start = f.end;               s.end = Math.min(duration, s.end);
      const newRep  = { ...origRep, first: f, second: s };
      const newReps = localRepsRef.current.map(r => r.id === d.repId ? newRep : r);
      handleSaveRepetitions(newReps);
      setRepResizeGuide(null);
      repResizeRef.current = null;
      window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up);
      window.removeEventListener("touchmove", mv); window.removeEventListener("touchend", up);
    };
    window.addEventListener("mousemove", mv); window.addEventListener("mouseup", up);
    window.addEventListener("touchmove", mv, { passive: false }); window.addEventListener("touchend", up);
  };

  // Cursor ew-resize al pasar por los bordes (sin asa visible)
  const handleRepRowMouseMove = (e, rowEl) => {
    if (!rowEl || repDraw) return;
    const rect  = rowEl.getBoundingClientRect();
    const distL = getClientX(e) - rect.left;
    const distR = rect.right - getClientX(e);
    const edgePx = Math.min(RESIZE_PX, rect.width * 0.28);
    rowEl.style.cursor = (distL < edgePx || distR < edgePx) ? "ew-resize" : "default";
  };

  // ── Navegador de la regla ────────────────────────────────────────────────
  const getClientX = e => e.touches?.[0]?.clientX ?? e.changedTouches?.[0]?.clientX ?? e.clientX;

  // Igual que containerXToRec pero, para segmentos "repeat" (vista resumida),
  // puede mapear a la 1ª O la 2ª vez según el parámetro `pass`.
  // Esto permite arrastrar de forma continua a través de todos los segmentos.
  const containerXToRecForPass = (xFrac, pass) => {
    const segs = segmentsRef.current;
    for (const sg of segs) {
      if (xFrac >= sg.vStart - 0.001 && xFrac <= sg.vEnd + 0.001) {
        const f = sg.vEnd > sg.vStart
          ? Math.max(0, Math.min(1, (xFrac - sg.vStart) / (sg.vEnd - sg.vStart))) : 0;
        if (sg.type === "normal")        return sg.recStart + f * sg.canonDur;
        if (sg.type === "repeat-first")  return sg.recStart + f * sg.canonDur;
        if (sg.type === "repeat-second") return sg.recStart + f * sg.canonDur;
        // Segmento "repeat" (vista resumida): mapear a 1ª o 2ª vez según pass
        if (pass === "second")
          return sg.rep.second.start + f * (sg.rep.second.end - sg.rep.second.start);
        return sg.rep.first.start + f * (sg.rep.first.end - sg.rep.first.start);
      }
    }
    return 0;
  };

  // Drag continuo que abarca AMBAS FILAS del segmento de repetición en vista resumida.
  // Determina la vez (1ª o 2ª) según la posición vertical del puntero en cada momento,
  // permitiendo pasar de una fila a la otra sin soltar el botón del ratón.
  const handleDoubleRowRulerDown = (e, seg, outerEl) => {
    if (listenOnly) return;
    e.preventDefault();
    const containerEl = rulerContainerRef.current; if (!containerEl) return;
    const getFrac = ev => {
      const r = containerEl.getBoundingClientRect();
      return Math.max(0, Math.min(1, (getClientX(ev) - r.left) / r.width));
    };
    const getPass = ev => {
      if (!outerEl) return "first";
      const r   = outerEl.getBoundingClientRect();
      const y   = ev.touches?.[0]?.clientY ?? ev.changedTouches?.[0]?.clientY ?? ev.clientY;
      return (y - r.top) > r.height / 2 ? "second" : "first";
    };
    const seek = ev => seekTo(containerXToRecForPass(getFrac(ev), getPass(ev)));
    seek(e);
    const mv = ev => { if (ev.cancelable) ev.preventDefault(); seek(ev); };
    const up = () => {
      window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up);
      window.removeEventListener("touchmove", mv); window.removeEventListener("touchend", up);
    };
    window.addEventListener("mousemove", mv); window.addEventListener("mouseup", up);
    window.addEventListener("touchmove", mv, { passive: false }); window.addEventListener("touchend", up);
  };

  // Drag del navegador: usa el contenedor COMPLETO de la regla para que la bola
  // se pueda mover de forma continua a través de todos los segmentos sin pararse
  // en los bordes de cada uno.
  const handleSegRulerDown = (e, seg, pass) => {
    if (e.touches && e.touches.length > 1) return; // pinch-to-zoom → ignorar
    if (listenOnly) return;
    e.preventDefault();
    const containerEl = rulerContainerRef.current; if (!containerEl) return;
    const getFrac = ev => {
      const r = containerEl.getBoundingClientRect();
      return Math.max(0, Math.min(1, (getClientX(ev) - r.left) / r.width));
    };
    // Al entrar en la zona de repetición (vista resumida), determinar la fila
    // por la posición vertical del puntero, no por el pass inicial.
    const resolvePass = (xFrac, ev) => {
      for (const sg of segmentsRef.current) {
        if (sg.type === "repeat" && xFrac >= sg.vStart - 0.001 && xFrac <= sg.vEnd + 0.001) {
          const r = containerEl.getBoundingClientRect();
          const y = ev.touches?.[0]?.clientY ?? ev.changedTouches?.[0]?.clientY ?? ev.clientY;
          return (y - r.top) > r.height / 2 ? "second" : "first";
        }
      }
      return pass;
    };
    seekTo(containerXToRecForPass(getFrac(e), resolvePass(getFrac(e), e)));
    const mv = ev => {
      if (ev.cancelable) ev.preventDefault();
      const f = getFrac(ev);
      seekTo(containerXToRecForPass(f, resolvePass(f, ev)));
    };
    const up = () => {
      window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up);
      window.removeEventListener("touchmove", mv); window.removeEventListener("touchend", up);
    };
    window.addEventListener("mousemove", mv); window.addEventListener("mouseup", up);
    window.addEventListener("touchmove", mv, { passive: false }); window.addEventListener("touchend", up);
  };

  // ── Marcas (listen-only): mapeo visual → tiempo grabación ───────────────
  const containerXToRec = xFrac => {
    const segs = segmentsRef.current;
    for (const sg of segs) {
      if (xFrac >= sg.vStart - 0.001 && xFrac <= sg.vEnd + 0.001) {
        const f = sg.vEnd > sg.vStart
          ? Math.max(0, Math.min(1, (xFrac - sg.vStart) / (sg.vEnd - sg.vStart))) : 0;
        if (sg.type === "normal") return sg.recStart + f * sg.canonDur;
        if (sg.type === "repeat-first")  return sg.recStart + f * sg.canonDur;
        if (sg.type === "repeat-second") return sg.recStart + f * sg.canonDur;
        return sg.rep.first.start + f * (sg.rep.first.end - sg.rep.first.start);
      }
    }
    return 0;
  };
  const handleMarksContainerDown = e => {
    if (e.target.closest("[data-mark]")) return;
    const el = rulerContainerRef.current; if (!el) return;
    e.preventDefault();
    const rect = el.getBoundingClientRect();
    const t = containerXToRec(Math.max(0, Math.min(1, (getClientX(e) - rect.left) / rect.width)));
    setSchemaMarks(prev => [...prev, t].sort((a, b) => a - b));
  };
  const handleMarkDown = (e, idx) => {
    e.stopPropagation(); e.preventDefault();
    const el = rulerContainerRef.current; if (!el) return;
    const rect = el.getBoundingClientRect();
    const startX = getClientX(e);
    let moved = false;
    const mv = ev => {
      if (ev.cancelable) ev.preventDefault();
      const x = getClientX(ev);
      if (!moved && Math.abs(x - startX) > 3) moved = true;
      if (moved) {
        const t = containerXToRec(Math.max(0, Math.min(1, (x - rect.left) / rect.width)));
        setSchemaMarks(prev => { const n = [...prev]; n[idx] = t; return n; });
      }
    };
    const up = () => {
      if (!moved) setSchemaMarks(prev => prev.filter((_, i) => i !== idx));
      window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up);
      window.removeEventListener("touchmove", mv); window.removeEventListener("touchend", up);
    };
    window.addEventListener("mousemove", mv); window.addEventListener("mouseup", up);
    window.addEventListener("touchmove", mv, { passive: false }); window.addEventListener("touchend", up);
  };

  // ── Drag principal (crear / mover / redimensionar bloques) ───────────────
  useEffect(() => {
    // pixToTime vive dentro del efecto para acceder a los refs sin clausura vieja
    const pixToTime = e => {
      const d = dragRef.current; if (!d) return 0;
      const el = trackSegRefs.current[d.segKey]; if (!el) return d.anchor;
      const r = el.getBoundingClientRect();
      const x = e.touches?.[0]?.clientX ?? e.changedTouches?.[0]?.clientX ?? e.clientX;
      return d.segMin + Math.max(0, Math.min(1, (x - r.left) / r.width)) * (d.segMax - d.segMin);
    };

    const onMove = e => {
      // Si el usuario junta un segundo dedo (pinch) durante el drag, abortar
      if (e.touches && e.touches.length > 1) {
        const d = dragRef.current;
        if (d) {
          if (d.type === "create") {
            setHistory(prev => prev.slice(0, -1));
            setBlocks(prev => prev.filter(b => b.id !== d.pid));
          }
          setGuides([]); dragRef.current = null;
        }
        return;
      }
      const d = dragRef.current; if (!d) return;
      const t   = pixToTime(e);
      const all = blocksRef.current;
      const ph  = timeRef.current;
      // Bloques del mismo contexto (misma repetición + misma vez)
      const ctx = all.filter(b => b.repeatId === d.repeatId && b.pass === d.pass && !b.isPreview);
      // Puntos de snap: límites del segmento + bordes de zona de repetición + marcas + bordes de bloques del contexto
      const repBounds = localRepsRef.current.flatMap(r => [r.first.start, r.first.end, r.second.start, r.second.end]);
      const snap = v => {
        const pts = [d.segMin, d.segMax,
          ...repBounds.filter(p => p >= d.segMin - 0.1 && p <= d.segMax + 0.1),
          ...schemaMarksRef.current.filter(m => m >= d.segMin - 0.1 && m <= d.segMax + 0.1),
          ...ctx.filter(b => b.id !== d.pid && b.id !== d.bid).flatMap(b => [b.start, b.end]),
          ph,
        ];
        let best = v, bd = SCHEMA_SNAP_THR + 0.01;
        for (const bv of pts) { const dd = Math.abs(v - bv); if (dd < bd) { bd = dd; best = bv; } }
        return best;
      };
      // Para resize y shared-edge: snap a puntos estructurales + otros niveles fijos (imantación vertical)
      // Se excluyen: mismo nivel (evita cuadrícula) y bloques en cascada (se mueven junto al drag)
      const snapBounds = v => {
        const cascadedIds = new Set((d.cascadeIds ?? []).map(c => c.id));
        const pts = [d.segMin, d.segMax,
          ...repBounds.filter(p => p >= d.segMin - 0.1 && p <= d.segMax + 0.1),
          ...schemaMarksRef.current.filter(m => m >= d.segMin - 0.1 && m <= d.segMax + 0.1),
          ...ctx.filter(b => b.level !== d.level && !cascadedIds.has(b.id))
                .flatMap(b => [b.start, b.end]),
          ph,
        ];
        let best = v, bd = SCHEMA_SNAP_THR + 0.01;
        for (const bv of pts) { const dd = Math.abs(v - bv); if (dd < bd) { bd = dd; best = bv; } }
        return best;
      };
      // Cascada vertical: aplica los bloques pre-identificados al inicio del drag
      const cascadeBoundary = (arr, newT) => {
        if (!d.cascadeIds?.length) return arr;
        return arr.map(b => {
          const ci = d.cascadeIds.find(c => c.id === b.id);
          if (!ci) return b;
          return ci.side === "start" ? { ...b, start: newT } : { ...b, end: newT };
        });
      };
      const cl = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

      if (d.type === "create") {
        let s  = cl(Math.min(d.anchor, t), d.segMin, d.segMax);
        let e2 = cl(Math.max(d.anchor, t), d.segMin, d.segMax);
        s = cl(snap(s), d.segMin, d.segMax); e2 = cl(snap(e2), d.segMin, d.segMax);
        d.ps = s; d.pe = e2;
        const ng = [s, e2].filter(v => v > d.segMin + 0.1 && v < d.segMax - 0.1);
        setGuides(ng);
        setBlocks(prev => [...prev.filter(b => b.id !== d.pid),
          { id: d.pid, level: d.level, start: s, end: e2, label: "…", isPreview: true, repeatId: d.repeatId, pass: d.pass }]);
        return;
      }

      if (d.type === "move") {
        const delta = t - d.anchor, dur2 = d.oe - d.os;
        let ns = cl(d.os + delta, d.segMin, d.segMax - dur2), ne = ns + dur2;
        const xb = [d.segMin, d.segMax,
          ...schemaMarksRef.current.filter(m => m >= d.segMin - 0.1 && m <= d.segMax + 0.1),
          ...all.filter(b => b.id !== d.bid && b.level !== d.level && b.repeatId === d.repeatId && b.pass === d.pass && !b.isPreview).flatMap(b => [b.start, b.end]),
        ];
        let snapped = false;
        for (const bv of xb) { if (Math.abs(ns - bv) < SCHEMA_SNAP_THR) { ns = bv; ne = bv + dur2; snapped = true; break; } }
        if (!snapped) { for (const bv of xb) { if (Math.abs(ne - bv) < SCHEMA_SNAP_THR) { ne = bv; ns = bv - dur2; break; } } }
        for (const nb of ctx.filter(b => b.level === d.level && b.id !== d.bid)) {
          if (ns < nb.end - 0.05 && ne > nb.start + 0.05) {
            if (d.os >= nb.end - 0.3) { ns = nb.end; ne = ns + dur2; }
            else                       { ne = nb.start; ns = ne - dur2; }
          }
        }
        ns = cl(ns, d.segMin, d.segMax - dur2); ne = ns + dur2;
        setGuides([ns, ne]);
        setBlocks(prev => prev.map(b => b.id === d.bid ? { ...b, start: ns, end: ne } : b));
        return;
      }

      if (d.type === "resize-l") {
        const leftNb = d.leftId ? all.find(b => b.id === d.leftId) : null;
        const minNs  = leftNb ? leftNb.end : d.segMin;
        const ns = cl(snapBounds(t), minNs, d.oe - SCHEMA_MIN_DUR);
        setGuides([ns]);
        setBlocks(prev => cascadeBoundary(
          prev.map(b => b.id === d.bid ? { ...b, start: ns } : b),
          ns));
        return;
      }

      if (d.type === "resize-r") {
        const rightNb = d.rightId ? all.find(b => b.id === d.rightId) : null;
        const maxNe   = rightNb ? rightNb.start : d.segMax;
        const ne = cl(snapBounds(t), d.os + SCHEMA_MIN_DUR, maxNe);
        setGuides([ne]);
        setBlocks(prev => cascadeBoundary(
          prev.map(b => b.id === d.bid ? { ...b, end: ne } : b),
          ne));
        return;
      }

      if (d.type === "shared-edge") {
        const ns = cl(snapBounds(t), d.leftStart + SCHEMA_MIN_DUR, d.rightEnd - SCHEMA_MIN_DUR);
        setGuides([ns]);
        setBlocks(prev => cascadeBoundary(
          prev.map(b =>
            b.id === d.leftId  ? { ...b, end:   ns } :
            b.id === d.rightId ? { ...b, start: ns } : b),
          ns));
      }
    };

    const onUp = upEvt => {
      const d = dragRef.current; if (!d) return;
      if (d.type === "create") {
        const dur2    = (d.pe ?? d.anchor) - (d.ps ?? d.anchor);
        const elapsed = Date.now() - (d.downTime ?? 0);
        const movedPx = Math.abs((upEvt?.changedTouches?.[0]?.clientX ?? upEvt?.clientX ?? d.downX) - (d.downX ?? 0));
        const isClick = elapsed < SCHEMA_CLICK_MS && movedPx < SCHEMA_CLICK_MOVE_THR;
        // Bloques creados manualmente en la 2ª vez se marcan overridden
        const overrideFlag = d.pass === "second" ? { overridden: true } : {};

        if (dur2 >= SCHEMA_MIN_DUR || isClick) {
          const ctx   = blocksRef.current.filter(b => b.repeatId === d.repeatId && b.pass === d.pass && !b.isPreview);
          const n     = ctx.filter(b => b.level === d.level).length;
          const label = SCHEMA_DEFAULT_LABELS[d.level]?.[n] ?? String(n + 1);

          if (isClick && dur2 < SCHEMA_MIN_DUR) {
            const segDur = d.segMax - d.segMin;
            const defDur = Math.max(SCHEMA_MIN_DUR * 2, segDur * SCHEMA_CLICK_DUR_FRAC);
            let ns = Math.max(d.segMin, d.anchor - defDur / 2), ne = ns + defDur;
            if (ne > d.segMax) { ne = d.segMax; ns = Math.max(d.segMin, ne - defDur); }
            for (const nb of ctx.filter(b => b.level === d.level)) {
              if (ns < nb.end && ne > nb.start) {
                if (nb.end + defDur <= d.segMax) { ns = nb.end; ne = ns + defDur; }
                else if (nb.start - defDur >= d.segMin) { ne = nb.start; ns = ne - defDur; }
              }
            }
            setBlocks(prev => [...prev.filter(b => b.id !== d.pid),
              { id: d.pid, level: d.level, start: ns, end: ne, label, isPreview: false, repeatId: d.repeatId, pass: d.pass, ...overrideFlag }]);
          } else {
            setBlocks(prev => prev.map(b => b.id === d.pid
              ? { ...b, label, isPreview: false, repeatId: d.repeatId, pass: d.pass, ...overrideFlag } : b));
          }
          setSelected(d.pid);
        } else {
          setHistory(prev => prev.slice(0, -1));
          setBlocks(prev => prev.filter(b => b.id !== d.pid));
        }
      }
      // Si se movió/redimensionó un bloque de 2ª vez, marcarlo como overridden
      if ((d.type === "move" || d.type === "resize-l" || d.type === "resize-r" || d.type === "shared-edge") && d.pass === "second") {
        setBlocks(prev => prev.map(b => {
          if (d.type === "shared-edge") {
            if (b.id === d.leftId || b.id === d.rightId) return { ...b, overridden: true };
          } else {
            if (b.id === d.bid) return { ...b, overridden: true };
          }
          return b;
        }));
      }
      // Si se editó la 1ª vez (o zona normal), re-sincronizar la 2ª vez
      if (viewModeRef.current === "completa" && localRepsRef.current.length > 0 &&
          (d.pass === "first" || d.pass === null)) {
        setBlocks(prev => syncSecondPassBlocks(prev, localRepsRef.current));
      }
      setGuides([]); dragRef.current = null;
    };

    window.addEventListener("mousemove", onMove);  window.addEventListener("mouseup",      onUp);
    window.addEventListener("touchmove", onMove, { passive: false }); window.addEventListener("touchend",   onUp);
    window.addEventListener("touchcancel", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup",     onUp);
      window.removeEventListener("touchmove", onMove); window.removeEventListener("touchend",    onUp);
      window.removeEventListener("touchcancel", onUp);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duration]);

  // ── Edición de etiquetas ─────────────────────────────────────────────────
  const commitEdit = () => {
    if (!editId) return;
    setBlocks(prev => {
      const edited = prev.find(b => b.id === editId);
      return prev.map(b => {
        if (b.id === editId) return { ...b, label: editVal };
        // Propagar el nuevo label al bloque espejo de la 2ª vez
        if (edited?.pass === "first" && b.mirrorId === editId) return { ...b, label: editVal };
        return b;
      });
    });
    setEditId(null); setEditVal("");
  };

  // ── Inicio de drag en pista (crear bloque) ───────────────────────────────
  const handleTrackSegDown = (e, lvId, seg, pass) => {
    if (e.touches && e.touches.length > 1) return; // pinch-to-zoom → ignorar
    if (editId) commitEdit();
    if (e.target.closest("[data-block]")) return;
    const sk = `${lvId}_${seg.index}_${pass}`;
    const el = trackSegRefs.current[sk]; if (!el) return;
    const r = el.getBoundingClientRect();
    const bounds = getSegBounds(seg, pass);
    const t = bounds.min + Math.max(0, Math.min(1, (getClientX(e) - r.left) / r.width)) * (bounds.max - bounds.min);
    setHistory(prev => [...prev, blocksRef.current]);
    // Para segmentos de tipo repeat-first/repeat-second usamos el rep.id y el pass inferido
    const repeatId = seg.type === "repeat" ? seg.rep.id
                   : seg.type === "repeat-first"  ? seg.rep.id
                   : seg.type === "repeat-second" ? seg.rep.id
                   : null;
    const infPass  = seg.type === "repeat"        ? pass
                   : seg.type === "repeat-first"  ? "first"
                   : seg.type === "repeat-second" ? "second"
                   : null;
    dragRef.current = {
      type: "create", level: lvId, anchor: t, pid: uid("sb"),
      ps: t, pe: t, downTime: Date.now(), downX: getClientX(e),
      segKey: sk, segMin: bounds.min, segMax: bounds.max,
      repeatId, pass: infPass,
    };
    setSelected(null); e.preventDefault();
  };

  // ── Inicio de drag en bloque existente (mover / redimensionar) ───────────
  const handleBlockDown = (e, block, type = "move") => {
    if (editId) commitEdit();
    if (type === "move" && editId === block.id) return;
    setHistory(prev => [...prev, blocksRef.current]);
    e.stopPropagation(); setSelected(block.id);

    const seg = segmentsRef.current.find(sg => {
      if (sg.type === "normal") return !block.repeatId && block.start >= sg.recStart - 0.01 && block.start < sg.recEnd + 0.01;
      if (sg.type === "repeat-first")  return block.repeatId === sg.rep.id && block.pass === "first";
      if (sg.type === "repeat-second") return block.repeatId === sg.rep.id && block.pass === "second";
      return block.repeatId === sg.rep.id; // legacy "repeat" type
    });
    if (!seg) return;
    const pass = block.pass || "normal";
    const sk   = `${block.level}_${seg.index}_${pass}`;
    const el   = trackSegRefs.current[sk]; if (!el) return;
    const r = el.getBoundingClientRect();
    const bounds = getSegBounds(seg, pass);
    const t = bounds.min + Math.max(0, Math.min(1, (getClientX(e) - r.left) / r.width)) * (bounds.max - bounds.min);

    const ctx = blocksRef.current.filter(b =>
      b.level === block.level && b.id !== block.id &&
      b.repeatId === block.repeatId && b.pass === block.pass && !b.isPreview
    );
    let extra = {};
    if (type === "resize-r") {
      const rn = ctx.filter(b => b.start >= block.end - 0.5).sort((a, b) => a.start - b.start)[0];
      extra = { rightId: rn?.id, rightEnd: rn?.end };
    } else if (type === "resize-l") {
      const ln = ctx.filter(b => b.end <= block.start + 0.5).sort((a, b) => b.end - a.end)[0];
      extra = { leftId: ln?.id, leftStart: ln?.start };
    }
    const cascadeLvs = block.level === 1 ? [2, 3] : block.level === 2 ? [3] : [];
    let cascadeIds = [];
    if (cascadeLvs.length > 0 && (type === "resize-r" || type === "resize-l")) {
      const boundaryT = type === "resize-r" ? block.end : block.start;
      const EPS = 0.05;
      cascadeIds = blocksRef.current
        .filter(b => cascadeLvs.includes(b.level) && !b.isPreview &&
          (b.repeatId ?? null) === (block.repeatId ?? null) &&
          (b.pass    ?? null) === (block.pass    ?? null))
        .flatMap(b => {
          const hits = [];
          if (Math.abs(b.start - boundaryT) < EPS) hits.push({ id: b.id, side: "start" });
          if (Math.abs(b.end   - boundaryT) < EPS) hits.push({ id: b.id, side: "end" });
          return hits;
        });
    }
    dragRef.current = {
      type, level: block.level, bid: block.id, anchor: t, os: block.start, oe: block.end,
      segKey: sk, segMin: bounds.min, segMax: bounds.max,
      repeatId: block.repeatId, pass: block.pass, cascadeIds, ...extra,
    };
    e.preventDefault();
  };

  // ── Asa de borde compartido ──────────────────────────────────────────────
  const handleSharedHandleDown = (e, leftBlock, rightBlock) => {
    if (editId) commitEdit();
    setHistory(prev => [...prev, blocksRef.current]);
    e.stopPropagation();
    const seg = segmentsRef.current.find(sg => {
      if (sg.type === "normal") return !leftBlock.repeatId;
      if (sg.type === "repeat-first")  return leftBlock.repeatId === sg.rep.id && leftBlock.pass === "first";
      if (sg.type === "repeat-second") return leftBlock.repeatId === sg.rep.id && leftBlock.pass === "second";
      return leftBlock.repeatId === sg.rep.id;
    });
    if (!seg) return;
    const pass = leftBlock.pass || "normal";
    const sk   = `${leftBlock.level}_${seg.index}_${pass}`;
    const el   = trackSegRefs.current[sk]; if (!el) return;
    const r = el.getBoundingClientRect();
    const bounds = getSegBounds(seg, pass);
    const t = bounds.min + Math.max(0, Math.min(1, (getClientX(e) - r.left) / r.width)) * (bounds.max - bounds.min);
    const cascadeLvs2 = leftBlock.level === 1 ? [2, 3] : leftBlock.level === 2 ? [3] : [];
    let cascadeIds2 = [];
    if (cascadeLvs2.length > 0) {
      const boundaryT = leftBlock.end;
      const EPS = 0.05;
      cascadeIds2 = blocksRef.current
        .filter(b => cascadeLvs2.includes(b.level) && !b.isPreview &&
          (b.repeatId ?? null) === (leftBlock.repeatId ?? null) &&
          (b.pass    ?? null) === (leftBlock.pass    ?? null))
        .flatMap(b => {
          const hits = [];
          if (Math.abs(b.start - boundaryT) < EPS) hits.push({ id: b.id, side: "start" });
          if (Math.abs(b.end   - boundaryT) < EPS) hits.push({ id: b.id, side: "end" });
          return hits;
        });
    }
    dragRef.current = {
      type: "shared-edge", level: leftBlock.level,
      leftId: leftBlock.id, rightId: rightBlock.id,
      leftStart: leftBlock.start, rightEnd: rightBlock.end,
      anchor: t, os: leftBlock.end,
      segKey: sk, segMin: bounds.min, segMax: bounds.max,
      repeatId: leftBlock.repeatId, pass: leftBlock.pass,
      cascadeIds: cascadeIds2,
    };
    e.preventDefault();
  };

  const SCHEMA_HND_W   = 18;
  const SCHEMA_HND_H   = Math.round(50 * 2 / 3);
  const SCHEMA_HND_TOP = 6 + Math.round((50 - SCHEMA_HND_H) / 2);

  const activeLevels = SCHEMA_LEVELS.filter(lv =>
    !exercise.schemaLevels || exercise.schemaLevels.length === 0 || exercise.schemaLevels.includes(lv.id)
  );

  // Lookup de bloques activos (según el cursor de reproducción + contexto de repetición)
  const activeAt = {};
  for (const b of blocks) {
    if (b.isPreview || time < b.start || time >= b.end) continue;
    if (!b.repeatId) { activeAt[b.level] = b.id; continue; }
    if (activeRepeatPass && b.repeatId === activeRepeatPass.repId && b.pass === activeRepeatPass.pass)
      activeAt[b.level] = b.id;
  }
  const selBlock = selected ? blocks.find(b => b.id === selected) : null;
  const selLv    = selBlock ? SCHEMA_LEVELS.find(l => l.id === selBlock.level) : null;

  // ── Renderizado de bloques dentro de un segmento+fila ───────────────────
  const renderSegBlocks = (seg, pass, lvId) => {
    const lv = SCHEMA_LEVELS.find(l => l.id === lvId);
    const bounds = getSegBounds(seg, pass);
    const segDur = (bounds.max - bounds.min) || 1;

    const segBlocks = blocks.filter(b => {
      if (b.level !== lvId) return false;
      if (seg.type === "normal") return !b.repeatId && b.end > bounds.min - 0.01 && b.start < bounds.max + 0.01;
      if (seg.type === "repeat-first")  return b.repeatId === seg.rep.id && b.pass === "first";
      if (seg.type === "repeat-second") return b.repeatId === seg.rep.id && b.pass === "second";
      return b.repeatId === seg.rep.id && b.pass === pass;
    });
    const real = segBlocks.filter(b => !b.isPreview).sort((a, b) => a.start - b.start);
    const adjPairs = [];
    for (let i = 0; i < real.length - 1; i++) {
      if (Math.abs(real[i].end - real[i + 1].start) < 0.5)
        adjPairs.push({ left: real[i], right: real[i + 1] });
    }
    const adjLIds = new Set(adjPairs.map(p => p.right.id));
    const adjRIds = new Set(adjPairs.map(p => p.left.id));

    // Posición del cursor de reproducción en esta fila
    let phPct = null;
    if (seg.type === "normal" && time >= seg.recStart && time < seg.recEnd)
      phPct = ((time - seg.recStart) / seg.canonDur) * 100;
    else if (seg.type === "repeat") {
      if (pass === "first" && time >= seg.rep.first.start && time < seg.rep.first.end)
        phPct = ((time - seg.rep.first.start) / (seg.rep.first.end - seg.rep.first.start)) * 100;
      else if (pass === "second" && time >= seg.rep.second.start && time < seg.rep.second.end)
        phPct = ((time - seg.rep.second.start) / (seg.rep.second.end - seg.rep.second.start)) * 100;
    }

    // Altura real del bloque por nivel: la pista mide 62 (Partes) / 52 (Frases)
    // / 44 (resto) y el bloque va con top:6 bottom:6, así que su alto = pista − 12.
    const _trackH    = lvId === 1 ? 62 : lvId === 2 ? 52 : 44;
    const _blockH    = lvId >= 3 ? 32 : _trackH - 12;
    const _hndH      = Math.round(_blockH * 2 / 3);
    const _hndTop    = 6 + Math.round((_blockH - _hndH) / 2);
    const hStyle = { position: "absolute", top: _hndTop, width: SCHEMA_HND_W, height: _hndH, background: "transparent", cursor: "ew-resize", zIndex: 10, display: "flex", alignItems: "center", justifyContent: "center" };
    const vis    = { width: SCHEMA_HND_VISUAL_W, height: "100%", background: "rgba(255,255,255,0.88)", borderRadius: 5, boxShadow: "0 1px 4px rgba(0,0,0,0.16)", pointerEvents: "none" };

    return (<>
      {/* Cuadrícula de fondo — paso fijo global para que la densidad
          sea la misma en todos los segmentos independientemente de su duración */}
      {(() => {
        const GRID_STEPS = [1, 2, 5, 10, 15, 20, 30, 60, 120, 300];
        const gridTarget = duration / 10; // ~10 divisiones en toda la pieza
        const step = GRID_STEPS.find(s => s >= gridTarget) ?? GRID_STEPS[GRID_STEPS.length - 1];
        const lines = [];
        const t0 = Math.ceil(bounds.min / step) * step;
        for (let t = t0; t < bounds.max - step * 0.05; t += step)
          lines.push((t - bounds.min) / segDur);
        return lines.map((f, i) => (
          <div key={i} style={{ position: "absolute", top: 0, left: `${f * 100}%`, width: 1, height: "100%", background: "rgba(0,0,0,0.04)", pointerEvents: "none" }} />
        ));
      })()}
      {/* Marcas listen-only */}
      {listenOnly && schemaMarks.filter(mt => mt >= bounds.min && mt < bounds.max).map((mt, i) => (
        <div key={i} style={{ position: "absolute", top: 0, left: `${((mt - bounds.min) / segDur) * 100}%`, width: 1, height: "100%", background: "rgba(184,74,58,0.28)", pointerEvents: "none", zIndex: 7 }} />
      ))}
      {/* Guías de snap */}
      {guides.filter(g => g >= bounds.min && g <= bounds.max).map((g, i) => (
        <div key={i} style={{ position: "absolute", top: 0, left: `${((g - bounds.min) / segDur) * 100}%`, width: 1, height: "100%", background: "rgba(210,55,55,0.45)", pointerEvents: "none", zIndex: 8 }} />
      ))}
      {/* Cursor de reproducción */}
      {phPct !== null && (
        <div style={{ position: "absolute", top: 0, left: `${phPct}%`, width: 1, height: "100%", background: C.danger, opacity: 0.5, pointerEvents: "none", zIndex: 6 }} />
      )}
      {/* Bloques */}
      {segBlocks.map(block => {
        const isActive = activeAt[lvId] === block.id, isSel = selected === block.id;
        // En vista resumida los bloques sin repeatId pueden cruzar la zona de
        // repetición (la parte abarca tanto la 1ª como la 2ª vez). Usamos
        // recToVisXResumed para que su anchura visual sea correcta.
        let lPct, wPct;
        if (viewMode === "resumida" && seg.type === "normal" && !block.repeatId) {
          const segVW = (seg.vEnd - seg.vStart) || 1;
          const visS  = recToVisX(block.start);
          const visE  = recToVisXResumed(block.end);
          lPct = Math.max(0, (visS - seg.vStart) / segVW) * 100;
          wPct = Math.max(0, (visE - visS) / segVW) * 100;
        } else {
          lPct = Math.max(0, ((block.start - bounds.min) / segDur) * 100);
          wPct = Math.max(0, ((block.end - block.start) / segDur) * 100);
        }
        const { bg: bBg, textColor: bTx } = block.isPreview
          ? { bg: lv.color, textColor: "#FFFFFF" }
          : block.customColor ? harmonyBlockColors(null, block.customColor)
          : lv.id === 3 ? harmonyBlockColors(block.label, lv.color)
          : lv.id === 1 ? harmonyBlockColors(null, partColorFromPalette(block.label, schemaPalette))
          : lv.id === 2 ? (() => {
              const partB = blocks.find(b => b.level === 1 && !b.isPreview &&
                b.start <= block.start + 0.01 && b.end > block.start + 0.01 &&
                (block.repeatId ? b.repeatId === block.repeatId && b.pass === block.pass : !b.repeatId));
              const parentColor = partB ? (partB.customColor || partColorFromPalette(partB.label, schemaPalette)) : lv.color;
              return harmonyBlockColors(null, phraseColorFromPalette(block.label, parentColor, schemaPalette));
            })()
          : { bg: lv.color, textColor: "#FFFFFF" };

        // ── Nivel 3 (Armonía): píldora de color + línea horizontal ─────────
        if (lvId === 3) {
          const pillBg = block.isPreview ? `${bBg}60` : bBg;
          return (
            <div key={block.id} data-block="true" style={{
              position: "absolute", top: 6, bottom: 6, left: `${lPct}%`, width: `${wPct}%`,
              background: "transparent",
              borderRadius: 999,
              boxShadow: "none",
              display: "flex", alignItems: "center",
              overflow: "hidden",
              cursor: (block.isPreview || viewMode === "resumida") ? "default" : "grab",
              zIndex: isSel ? 7 : isActive ? 4 : 3,
              boxSizing: "border-box",
            }}
              onMouseDown={e => !(block.isPreview || viewMode === "resumida") && handleBlockDown(e, block, "move")}
              onTouchStart={e => !(block.isPreview || viewMode === "resumida") && handleBlockDown(e, block, "move")}
              onDoubleClick={() => { if (!(block.isPreview || viewMode === "resumida" || block.pass === "second")) { setEditId(block.id); setEditVal(block.label); } }}>
              {/* Píldora izquierda */}
              {editId === block.id ? (
                <div style={{ alignSelf: "center", background: pillBg, borderRadius: 999, display: "flex", alignItems: "center", padding: "5px 8px", flexShrink: 0 }}>
                  <input autoFocus value={editVal} onChange={e => setEditVal(e.target.value)}
                    onBlur={commitEdit} onKeyDown={e => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") setEditId(null); }}
                    onClick={e => e.stopPropagation()}
                    style={{ width: 60, background: "transparent", border: "none", borderBottom: "1.5px solid rgba(255,255,255,0.8)", color: bTx, fontSize: 11, fontWeight: 700, textAlign: "center", outline: "none", padding: "2px 2px", fontFamily: FONT_SANS, borderRadius: 2 }} />
                </div>
              ) : (
                <div style={{ alignSelf: "center", background: pillBg, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", padding: "5px 11px", flexShrink: 0, boxSizing: "border-box" }}>
                  {wPct >= 2 && (
                    <span style={{ fontSize: wPct < 5 ? 9 : 11, fontWeight: 700, color: bTx, textShadow: bTx === "#FFFFFF" ? "0 1px 3px rgba(0,0,0,0.28)" : "none", fontFamily: FONT_SANS, whiteSpace: "nowrap", pointerEvents: "none" }}>
                      {block.label}
                    </span>
                  )}
                </div>
              )}
              {/* Línea horizontal hasta el borde derecho */}
              {wPct >= 3 && (
                <div style={{ flex: 1, minWidth: 0, height: 2.5, background: pillBg, opacity: 0.55, marginLeft: 4, borderRadius: 1.5, flexShrink: 1 }} />
              )}
            </div>
          );
        }

        // ── Nivel 4 (Texto): píldora de ancho completo, sin línea ───────────
        if (lvId === 4) {
          const pillBg = block.isPreview ? `${bBg}60` : bBg;
          return (
            <div key={block.id} data-block="true" style={{
              position: "absolute", top: 6, bottom: 6, left: `${lPct}%`, width: `${wPct}%`,
              display: "flex", alignItems: "stretch",
              overflow: "hidden",
              cursor: (block.isPreview || viewMode === "resumida") ? "default" : "grab",
              zIndex: isSel ? 7 : isActive ? 4 : 3,
              boxSizing: "border-box",
            }}
              onMouseDown={e => !(block.isPreview || viewMode === "resumida") && handleBlockDown(e, block, "move")}
              onTouchStart={e => !(block.isPreview || viewMode === "resumida") && handleBlockDown(e, block, "move")}
              onDoubleClick={() => { if (!(block.isPreview || viewMode === "resumida" || block.pass === "second")) { setEditId(block.id); setEditVal(block.label); } }}>
              {editId === block.id ? (
                <div style={{ flex: 1, background: pillBg, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 11px", overflow: "hidden" }}>
                  <input autoFocus value={editVal} onChange={e => setEditVal(e.target.value)}
                    onBlur={commitEdit} onKeyDown={e => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") setEditId(null); }}
                    onClick={e => e.stopPropagation()}
                    style={{ width: "82%", background: "transparent", border: "none", borderBottom: "1.5px solid rgba(255,255,255,0.8)", color: bTx, fontSize: 11, fontWeight: 500, textAlign: "center", outline: "none", padding: "2px 4px", fontFamily: FONT_SANS, borderRadius: 2 }} />
                </div>
              ) : (
                <div style={{ flex: 1, background: pillBg, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", padding: "5px 11px", overflow: "hidden" }}>
                  <span style={{ fontSize: wPct < 3.5 ? 0 : wPct < 6 ? 9 : 11, fontWeight: 500, color: bTx, textShadow: bTx === "#FFFFFF" ? "0 1px 3px rgba(0,0,0,0.28)" : "none", maxWidth: "90%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: FONT_SANS, pointerEvents: "none" }}>
                    {block.label}
                  </span>
                </div>
              )}
            </div>
          );
        }

        // ── Resto de niveles: rectángulo relleno (estilo original) ──────────
        return (
          <div key={block.id} data-block="true" style={{
            position: "absolute", top: 6, bottom: 6, left: `${lPct}%`, width: `${wPct}%`,
            background: block.isPreview ? `${bBg}38` : bBg, borderRadius: 5,
            border: isSel ? `2px solid ${C.ink}` : isActive ? `2px solid rgba(255,255,255,0.75)` : `1px solid rgba(255,255,255,0.22)`,
            boxShadow: isSel ? "0 2px 10px rgba(0,0,0,0.22)" : "none",
            display: "flex", alignItems: "center", justifyContent: "center",
            overflow: "hidden", cursor: (block.isPreview || viewMode === "resumida") ? "default" : "grab",
            zIndex: isSel ? 7 : isActive ? 4 : 3, boxSizing: "border-box",
          }}
            onMouseDown={e => !(block.isPreview || viewMode === "resumida") && handleBlockDown(e, block, "move")}
            onTouchStart={e => !(block.isPreview || viewMode === "resumida") && handleBlockDown(e, block, "move")}
            onDoubleClick={() => { if (!(block.isPreview || viewMode === "resumida" || block.pass === "second")) { setEditId(block.id); setEditVal(block.label); } }}>
            {editId === block.id ? (
              <input autoFocus value={editVal} onChange={e => setEditVal(e.target.value)}
                onBlur={commitEdit} onKeyDown={e => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") setEditId(null); }}
                onClick={e => e.stopPropagation()}
                style={{ width: "82%", background: "rgba(0,0,0,0.18)", border: "none", borderBottom: "1.5px solid rgba(255,255,255,0.85)", color: "white", fontSize: 12, fontWeight: lvId === 1 ? 700 : 500, textAlign: "center", outline: "none", padding: "2px 4px", fontFamily: FONT_SANS, borderRadius: 2 }} />
            ) : (
              <span style={{ fontSize: wPct < 3.5 ? 0 : wPct < 6 ? 9 : 12, fontWeight: lvId === 1 ? 700 : 500, color: bTx, textShadow: bTx === "#FFFFFF" ? "0 1px 3px rgba(0,0,0,0.28)" : "none", maxWidth: "84%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: FONT_SANS, pointerEvents: "none" }}>
                {block.label}
              </span>
            )}
          </div>
        );
      })}
      {/* Asas de borde libre — ocultas en modo resumida y en bordes bloqueados */}
      {viewMode !== "resumida" && real.flatMap(block => {
        const lPct = ((block.start - bounds.min) / segDur) * 100;
        const rPct = ((block.end   - bounds.min) / segDur) * 100;
        const out = [];
        // Ocultar el asa izquierda si el bloque está bloqueado al borde de zona
        if (!adjLIds.has(block.id) && !block._lockedStart) out.push(
          <div key={`hl-${block.id}`} data-block="true"
            style={{ ...hStyle, left: `calc(${lPct}% - ${SCHEMA_HND_W / 2}px)` }}
            onMouseDown={e => { e.stopPropagation(); handleBlockDown(e, block, "resize-l"); }}
            onTouchStart={e => { e.stopPropagation(); handleBlockDown(e, block, "resize-l"); }}>
            <div style={vis} />
          </div>
        );
        // Ocultar el asa derecha si el bloque está bloqueado al borde de zona
        if (!adjRIds.has(block.id) && !block._lockedEnd) out.push(
          <div key={`hr-${block.id}`} data-block="true"
            style={{ ...hStyle, left: `calc(${rPct}% - ${SCHEMA_HND_W / 2}px)` }}
            onMouseDown={e => { e.stopPropagation(); handleBlockDown(e, block, "resize-r"); }}
            onTouchStart={e => { e.stopPropagation(); handleBlockDown(e, block, "resize-r"); }}>
            <div style={vis} />
          </div>
        );
        return out;
      })}
      {/* Asas de borde compartido — ocultas en modo resumida */}
      {viewMode !== "resumida" && adjPairs.map(({ left, right }) => {
        const pct = ((left.end - bounds.min) / segDur) * 100;
        return (
          <div key={`sh-${left.id}-${right.id}`} data-block="true"
            style={{ position: "absolute", top: _hndTop, width: SCHEMA_HND_W, height: _hndH, left: `calc(${pct}% - ${SCHEMA_HND_W / 2}px)`, background: "transparent", cursor: "col-resize", zIndex: 11, display: "flex", alignItems: "center", justifyContent: "center" }}
            onMouseDown={e => handleSharedHandleDown(e, left, right)}
            onTouchStart={e => handleSharedHandleDown(e, left, right)}>
            <div style={{ width: SCHEMA_HND_VISUAL_W, height: "100%", background: "rgba(255,255,255,0.88)", borderRadius: 5, boxShadow: "0 1px 4px rgba(0,0,0,0.16)", pointerEvents: "none" }} />
          </div>
        );
      })}
    </>);
  };

  // ── Pinch-to-zoom (móvil) ─────────────────────────────────────────────────
  const handleSchemaPinchStart = e => {
    if (e.touches.length !== 2) return;
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    pinchRef.current = { dist: Math.hypot(dx, dy), zoom: schemaZoom, sf: schemaScrollFrac };
  };
  const handleSchemaPinchMove = e => {
    if (e.touches.length !== 2 || !pinchRef.current) return;
    const dx  = e.touches[0].clientX - e.touches[1].clientX;
    const dy  = e.touches[0].clientY - e.touches[1].clientY;
    const newZoom = Math.min(8, Math.max(1, pinchRef.current.zoom * (Math.hypot(dx, dy) / pinchRef.current.dist)));
    setSchemaZoom(newZoom);
    if (e.cancelable) e.preventDefault();
  };
  const handleSchemaPinchEnd = () => { pinchRef.current = null; };

  // ── Drag de la barra de scroll personalizada ──────────────────────────────
  // El drag es RELATIVO: el desplazamiento es proporcional al movimiento del ratón/dedo,
  // sin saltar a la posición absoluta del clic.
  const handleScrollbarTrackDown = e => {
    e.preventDefault();
    const track   = e.currentTarget;
    const startX  = e.touches?.[0]?.clientX ?? e.clientX;
    const startSf = schemaScrollFrac;
    const move = ev => {
      const rect     = track.getBoundingClientRect();
      const x        = ev.touches?.[0]?.clientX ?? ev.clientX;
      const deltaX   = x - startX;
      const deltaFrac = deltaX / rect.width;
      // El thumb ocupa 1/zoom del track; el rango de movimiento del thumb es (1 - 1/zoom)
      const thumbRange = 1 - 1 / Math.max(1, schemaZoom);
      const newSf    = thumbRange > 0 ? startSf + deltaFrac / thumbRange : 0;
      setSchemaScrollFrac(Math.max(0, Math.min(1, newSf)));
    };
    const up = () => {
      window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up);
      window.removeEventListener('touchmove', move); window.removeEventListener('touchend', up);
    };
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
    window.addEventListener('touchmove', move, { passive: false }); window.addEventListener('touchend', up);
  };

  const handleSubmit = () => onSubmit({ type: "esquema", blocks: blocks.filter(b => !b.isPreview), mode, repetitions: localReps, schemaPalette });

  // ── JSX principal ────────────────────────────────────────────────────────
  return (
    <div style={S.app}>
      <SessionHeader exercise={exercise} onBack={onBack} modelId="esquema" />

      {showRepModal && (
        <RepeatManagerModal
          exercise={{ ...exercise, repetitions: localReps }}
          duration={duration}
          onSave={handleSaveRepetitions}
          onClose={() => setShowRepModal(false)} />
      )}

      <div style={{ maxWidth: 980, margin: "0 auto", padding: "16px 16px 24px" }}
        onMouseDown={e => { if (!e.target.closest("[data-block]") && !e.target.closest("button") && !e.target.closest("input")) { setSelected(null); setSelectedRepId(null); } }}
        onTouchStart={e => { if (!e.target.closest("[data-block]") && !e.target.closest("button") && !e.target.closest("input")) { setSelected(null); setSelectedRepId(null); } }}>

        {modelToggleNode}

        {!listenOnly && mode === "student" && <SessionHint modelId="esquema" />}

        {/* Sección de audio */}
        <section style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 16, padding: "14px 14px 12px", marginBottom: 12 }}>
          {hasAudio && !audioReady && !audioError && <AudioLoadingOverlay />}
          {audioError && <div style={{ textAlign: "center", color: C.danger, fontSize: 12, marginBottom: 8 }}>{audioError}</div>}
          <div style={{ background: C.paper2, borderRadius: 10, overflow: "hidden", border: `1px solid ${C.line}`, marginBottom: 8 }}>
            <WaveformDisplay time={time} timeRef={audioTimeRef} duration={duration} waveformDuration={audioDuration} allIntervals={[]} exerciseId={exercise.id}
              waveformData={waveformData} colorByFn={{}} questionRegion={null}
              onScrubBegin={listenOnly ? () => {} : scrubBegin}
              onScrubTo={listenOnly   ? () => {} : scrubTo}
              onScrubEnd={listenOnly  ? () => {} : scrubEnd} />
          </div>
          {listenOnly ? (
            <div style={{ paddingTop: 10, borderTop: `1px solid ${C.line}` }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 12 }}>
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <CircleButton onClick={() => { seekTo(0); setPlayCount(p => p + 1); }} title="Volver al inicio">⏮</CircleButton>
                </div>
                <CircleButton onClick={togglePlay} primary size={48} disabled={hasAudio && !audioReady && !audioError} title={playing ? "Pausa" : "Reproducir"}>
                  {playing ? "❚❚" : "▶"}
                </CircleButton>
                <div style={{ textAlign: "right", fontFamily: F.sans, fontVariantNumeric: "tabular-nums", fontSize: 22, fontWeight: 600, color: C.ink, letterSpacing: -0.5 }}>
                  {fmt(time)}<span style={{ color: C.muted, fontWeight: 400 }}>/{fmt(duration)}</span>
                </div>
              </div>
              {playCount > 0 && <div style={{ textAlign: "center", fontFamily: F.sans, fontSize: 11, color: C.muted, marginTop: 8 }}>Reproducido {playCount} {playCount === 1 ? "vez" : "veces"} desde el inicio</div>}
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 12, paddingTop: 10, borderTop: `1px solid ${C.line}` }}>
              {/* Columna izq: switch (si hay repeticiones) + ⏮ a la derecha */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                {hasRepeats ? (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4 }}>
                    <span style={{ fontSize: 9, color: C.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.9, fontFamily: FONT_SANS, paddingLeft: 2 }}>Vista de repetición</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div role="tablist"
                        style={{ display: "flex", flexDirection: "row", background: C.paper2, border: `1px solid ${C.line}`, borderRadius: 999, overflow: "hidden", padding: 2, gap: 2, height: 26, boxSizing: "border-box" }}>
                        {[["completa", "Completa"], ["resumida", "Resumida"]].map(([v, label]) => (
                          <button key={v} type="button" role="tab" aria-selected={viewMode === v}
                            onClick={() => setViewMode(v)}
                            title={v === "completa" ? "Vista secuencial editable" : "Vista comprimida (solo lectura)"}
                            style={{
                              flex: "1 1 0", border: "none", borderRadius: 999,
                              background: viewMode === v ? C.ink : "transparent",
                              color: viewMode === v ? C.paper : C.muted,
                              padding: "0 10px", fontSize: 11, fontWeight: viewMode === v ? 600 : 400,
                              cursor: "pointer", transition: "all .12s", fontFamily: FONT_SANS,
                              whiteSpace: "nowrap",
                            }}>
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : <div />}
                <CircleButton onClick={() => seekTo(0)} title="Volver al inicio">⏮</CircleButton>
              </div>
              {/* Columna central: ▶ centrado */}
              <CircleButton onClick={() => { if (time >= duration) seekTo(0); togglePlay(); }} primary size={48} disabled={hasAudio && !audioReady && !audioError}>
                {playing ? "❚❚" : "▶"}
              </CircleButton>
              <div style={{ textAlign: "right", fontFamily: F.sans, fontVariantNumeric: "tabular-nums", fontSize: 22, fontWeight: 600, color: C.ink, letterSpacing: -0.5 }}>
                {fmt(time)}<span style={{ color: C.muted, fontWeight: 400 }}>/{fmt(duration)}</span>
              </div>
            </div>
          )}
        </section>

        {/* Selector de paleta — discreto y desplegable. Solo si hay nivel de
            Partes o Frases activo (afecta a esos niveles, no a Armonía/Texto). */}
        {!listenOnly && activeLevels.some(lv => lv.id === 1 || lv.id === 2) && (
          <div ref={paletteRef} style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10, position: "relative" }}
            onMouseDown={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()}>
            {(() => { const cur = getSchemaPalette(schemaPalette) || SCHEMA_PALETTES[0]; return (
              <button type="button" onClick={() => setPaletteOpen(o => !o)} className="fa-pressable"
                title="Cambiar paleta de color"
                style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "4px 9px 4px 8px", borderRadius: 8, cursor: "pointer", background: C.paper2, border: `1px solid ${C.line}`, fontFamily: F.sans }}>
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: C.muted }}>Paleta</span>
                <span style={{ display: "inline-flex", borderRadius: 3, overflow: "hidden", border: "1px solid rgba(0,0,0,0.08)", flexShrink: 0 }}>
                  {cur.parts.map((c, i) => <span key={i} style={{ width: 9, height: 12, background: c, display: "block" }} />)}
                </span>
                <Chevron open={paletteOpen} size={11} color={C.muted} />
              </button>
            ); })()}
            {paletteOpen && (
              <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 30, background: C.paper, border: `1px solid ${C.line}`, borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.12)", padding: 6, display: "flex", flexDirection: "column", gap: 2, minWidth: 168 }}>
                {SCHEMA_PALETTES.map(pal => {
                  const active = schemaPalette === pal.id;
                  return (
                    <button key={pal.id} type="button" onClick={() => { setSchemaPalette(pal.id); setPaletteOpen(false); }}
                      style={{ display: "flex", alignItems: "center", gap: 9, padding: "6px 8px", borderRadius: 7, cursor: "pointer", background: active ? C.paper2 : "transparent", border: "none", fontFamily: F.sans, textAlign: "left", width: "100%" }}>
                      <span style={{ display: "inline-flex", borderRadius: 4, overflow: "hidden", border: "1px solid rgba(0,0,0,0.08)", flexShrink: 0 }}>
                        {pal.parts.map((c, i) => <span key={i} style={{ width: 13, height: 16, background: c, display: "block" }} />)}
                      </span>
                      <span style={{ flex: 1, fontSize: 12.5, fontWeight: active ? 700 : 500, color: active ? C.ink : C.ink2 }}>{pal.name}</span>
                      {active && <span style={{ fontSize: 12, color: C.ink, flexShrink: 0 }}>✓</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Regla + pistas (layout flex-segmentado) */}
        <div ref={schemaOuterRef} style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 12, overflow: "hidden", marginBottom: schemaZoom > 1 ? 4 : 12, position: "relative" }}
          onTouchStart={handleSchemaPinchStart}
          onTouchMove={handleSchemaPinchMove}
          onTouchEnd={handleSchemaPinchEnd}
        >
          {/* Contenedor de escala: width = zoom*100% con translateX para desplazamiento */}
          <div style={{
            width: schemaZoom > 1 ? `${schemaZoom * 100}%` : "100%",
            position: "relative",
            transform: schemaZoom > 1
              ? `translateX(-${schemaScrollFrac * (1 - 1 / schemaZoom) * 100}%)`
              : "none",
            willChange: schemaZoom > 1 ? "transform" : "auto",
          }}>

          {/* ── BANDA DE REPETICIÓN — dentro del wrapper de zoom para que
               las marcas estén siempre alineadas con la regla y las pistas ── */}
          {viewMode === "completa" && (
            <div style={{ borderTop: `1px solid rgba(47,111,184,0.18)`, borderBottom: `1px solid ${C.line}`, position: "relative", overflow: "visible" }}>
              <div
                ref={bandRef}
                style={{ height: 26, position: "relative", userSelect: "none", touchAction: "none", cursor: "crosshair", background: "rgba(47,111,184,0.055)" }}
                onMouseDown={handleBandCreateDown}
                onTouchStart={handleBandCreateDown}>

                {/* Zonas de repetición */}
                {localReps.map(rep => {
                  const fS  = timeToFrac(rep.first.start)  * 100;
                  const fE  = timeToFrac(rep.first.end)    * 100;
                  const sE  = timeToFrac(rep.second.end)   * 100;
                  const fW  = fE - fS;
                  const sW  = sE - fE;
                  return (
                    <React.Fragment key={rep.id}>
                      {/* Zona "original" — clicable para seleccionar la repetición */}
                      <div
                        onMouseDown={e => { e.stopPropagation(); setSelectedRepId(r => r === rep.id ? null : rep.id); setSelected(null); }}
                        onTouchStart={e => { e.stopPropagation(); setSelectedRepId(r => r === rep.id ? null : rep.id); setSelected(null); }}
                        style={{ position: "absolute", top: 3, bottom: 3, left: `${fS}%`, width: `${fW}%`, background: selectedRepId === rep.id ? `${C.fnS}45` : `${C.fnS}28`, borderRadius: 4, border: selectedRepId === rep.id ? `1.5px solid ${C.fnS}` : `1px solid ${C.fnS}60`, boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", cursor: "pointer", zIndex: 5 }}>
                        <span style={{ fontSize: 9, fontWeight: 700, color: C.fnS, letterSpacing: 0.6, textTransform: "uppercase", whiteSpace: "nowrap", pointerEvents: "none" }}>original</span>
                      </div>
                      {/* Zona "repetición" — clicable para seleccionar la repetición */}
                      <div
                        onMouseDown={e => { e.stopPropagation(); setSelectedRepId(r => r === rep.id ? null : rep.id); setSelected(null); }}
                        onTouchStart={e => { e.stopPropagation(); setSelectedRepId(r => r === rep.id ? null : rep.id); setSelected(null); }}
                        style={{ position: "absolute", top: 3, bottom: 3, left: `${fE}%`, width: `${sW}%`, background: selectedRepId === rep.id ? `${C.fnT}38` : `${C.fnT}22`, borderRadius: 4, border: selectedRepId === rep.id ? `1.5px solid ${C.fnT}` : `1px solid ${C.fnT}55`, boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", cursor: "pointer", zIndex: 5 }}>
                        <span style={{ fontSize: 9, fontWeight: 700, color: C.fnT, letterSpacing: 0.6, textTransform: "uppercase", whiteSpace: "nowrap", pointerEvents: "none" }}>repetición</span>
                      </div>
                      {/* Asa: inicio del original */}
                      <div onMouseDown={e => handleBandHandleDown(e, rep, "first.start")} onTouchStart={e => handleBandHandleDown(e, rep, "first.start")}
                        title={`Inicio original: ${fmt(rep.first.start)}`}
                        style={{ position: "absolute", top: 0, bottom: 0, left: `calc(${fS}% - 5px)`, width: 10, cursor: "ew-resize", zIndex: 10, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <div style={{ width: 3, height: 16, borderRadius: 2, background: C.fnS, boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
                      </div>
                      {/* Asa: unión original/repetición */}
                      <div onMouseDown={e => handleBandHandleDown(e, rep, "junction")} onTouchStart={e => handleBandHandleDown(e, rep, "junction")}
                        title={`Fin original / inicio repetición: ${fmt(rep.first.end)}`}
                        style={{ position: "absolute", top: 0, bottom: 0, left: `calc(${fE}% - 6px)`, width: 12, cursor: "ew-resize", zIndex: 10, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <div style={{ width: 4, height: 20, borderRadius: 2, background: C.ink2, boxShadow: "0 1px 4px rgba(0,0,0,0.25)" }} />
                      </div>
                      {/* Asa: fin de la repetición */}
                      <div onMouseDown={e => handleBandHandleDown(e, rep, "second.end")} onTouchStart={e => handleBandHandleDown(e, rep, "second.end")}
                        title={`Fin repetición: ${fmt(rep.second.end)}`}
                        style={{ position: "absolute", top: 0, bottom: 0, left: `calc(${sE}% - 5px)`, width: 10, cursor: "ew-resize", zIndex: 10, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <div style={{ width: 3, height: 16, borderRadius: 2, background: C.fnT, boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
                      </div>
                      {/* Botón eliminar */}
                      <button onMouseDown={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()}
                        onClick={() => deleteRepeat(rep.id)} title="Eliminar repetición"
                        style={{ position: "absolute", top: 3, right: 4, zIndex: 20, background: "rgba(255,255,255,0.85)", border: `1px solid ${C.line}`, borderRadius: 3, padding: "0px 5px", fontSize: 9, cursor: "pointer", color: C.muted, lineHeight: 1.6 }}>
                        ✕
                      </button>
                    </React.Fragment>
                  );
                })}

                {/* Preview mientras se arrastra para crear */}
                {bandDrag?.type === "create" && (() => {
                  const s  = Math.min(bandDrag.startT, bandDrag.curT);
                  const e2 = Math.max(bandDrag.startT, bandDrag.curT);
                  const fS = timeToFrac(s) * 100, fW = timeToFrac(e2) * 100 - fS;
                  return fW > 0.5 ? (
                    <div style={{ position: "absolute", top: 3, bottom: 3, left: `${fS}%`, width: `${fW}%`, background: `${C.fnS}40`, borderRadius: 4, border: `2px solid ${C.fnS}`, boxSizing: "border-box", pointerEvents: "none", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ fontSize: 8, fontWeight: 700, color: C.fnS }}>original</span>
                    </div>
                  ) : null;
                })()}

                {/* Hint cuando no hay repetición */}
                {localReps.length === 0 && !bandDrag && (
                  <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
                    <span style={{ fontSize: 10, color: C.muted, letterSpacing: 0.3 }}>Arrastra aquí para crear una repetición</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── REGLA ── */}
          <div ref={rulerContainerRef}
            style={{ display: "flex", borderBottom: `1px solid ${C.line}`, userSelect: "none", touchAction: "none", overflow: "hidden", position: "relative" }}
            {...(listenOnly ? { onMouseDown: handleMarksContainerDown, onTouchStart: handleMarksContainerDown } : {})}>

            {/* ── Playhead global: línea + bola a lo largo de TODA la regla ──
                 Se calcula con recToVisX para que sea continuo entre segmentos.
                 En la doble fila (segmento "repeat", vista resumida) la bola se
                 posiciona en la fila correcta (arriba = 1ª vez, abajo = 2ª vez).
                 zIndex 30 para aparecer por encima de todo lo demás en la regla. */}
            {!listenOnly && (() => {
              // Determinar posición horizontal y vertical de la bola
              let xPct = recToVisX(time) * 100;
              // En resumida: bola en fila superior (y=25%) durante la 1ª vez,
              // y en fila inferior (y=75%) durante la 2ª vez y en secciones normales.
              // La x se calcula dentro del rango insetado por REPEAT_BARLINE_W en
              // ambos extremos, igual que la línea vertical del esquema.
              let yPct = viewMode === "resumida" && hasRepeats ? 75 : 50;
              for (const sg of segments) {
                if (sg.type !== "repeat") continue;
                const fp = sg.rep.first, sp = sg.rep.second;
                if (time < fp.start || time >= sp.end) continue; // este segmento no contiene el tiempo actual
                const fd = (fp.end - fp.start) || 1;
                const sd = (sp.end - sp.start) || 1;
                const barFrac = rulerW > 0 ? REPEAT_BARLINE_W / rulerW : 0;
                const segVW   = sg.vEnd - sg.vStart;
                const innerVW = segVW - 2 * barFrac;
                if (time >= fp.start && time < fp.end) {
                  xPct = (sg.vStart + barFrac + (time - fp.start) / fd * innerVW) * 100;
                  yPct = 25; // centro de la fila 1ª (14 px de 57 px = 24.6 %)
                } else if (time >= sp.start && time < sp.end) {
                  xPct = (sg.vStart + barFrac + (time - sp.start) / sd * innerVW) * 100;
                  yPct = 75; // centro de la fila 2ª
                }
                break; // segmento encontrado
              }
              return (
                <div style={{ position: "absolute", top: `${yPct}%`, left: `${xPct}%`, transform: "translate(-50%,-50%)", width: 14, height: 14, borderRadius: "50%", background: C.danger, border: `2px solid ${C.paper}`, boxShadow: "0 1px 4px rgba(0,0,0,0.25)", pointerEvents: "none", zIndex: 31 }} />
              );
            })()}

            {/* ── Guía de resize de barra de repetición ── */}
            {repResizeGuide && (
              <div style={{ position: "absolute", top: 0, bottom: 0, left: `${repResizeGuide.xFrac * 100}%`, width: 1.5, background: repResizeGuide.color, transform: "translateX(-50%)", pointerEvents: "none", zIndex: 28 }} />
            )}

            {/* ── Overlay de dibujo de repetición ── */}
            {segments.map((seg, si) => {
              if (seg.type === "normal") {
                const bounds  = getSegBounds(seg, "normal");
                const segDur  = (bounds.max - bounds.min) || 1;
                const segWidthPx = rulerW * (seg.vEnd - seg.vStart);
                const ticks   = rulerTicksForSeg(bounds.min, bounds.max, segWidthPx);
                const phPct   = time >= bounds.min && time <= bounds.max ? ((time - bounds.min) / segDur) * 100 : null;
                return (
                  <div key={si}
                    ref={el => trackSegRefs.current[`ruler_${si}_normal`] = el}
                    style={{ flex: seg.canonDur, position: "relative", height: viewMode === "resumida" && hasRepeats ? 57 : 28, background: C.paper2, cursor: listenOnly ? "crosshair" : "pointer", overflow: "hidden" }}
                    {...(!listenOnly ? { onMouseDown: e => handleSegRulerDown(e, seg, "normal"), onTouchStart: e => handleSegRulerDown(e, seg, "normal") } : {})}>
                    {/* Pista horizontal — en resumida alineada con el centro de la 2ª vez */}
                    <div style={{ position: "absolute", top: viewMode === "resumida" && hasRepeats ? "75%" : "50%", left: 0, right: 0, height: 2.5, background: `${C.muted}55`, transform: "translateY(-50%)", pointerEvents: "none", zIndex: 3 }} />
                    {/* Marcas listen-only */}
                    {listenOnly && schemaMarks.filter(mt => mt >= bounds.min && mt < bounds.max).map((mt, mi) => {
                      const pct = ((mt - bounds.min) / segDur) * 100;
                      const globalIdx = schemaMarks.indexOf(mt);
                      return (
                        <div key={mi} data-mark="true"
                          style={{ position: "absolute", top: 0, left: `${pct}%`, width: 28, height: "100%", transform: "translateX(-50%)", zIndex: 15, cursor: "grab", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start" }}
                          onMouseDown={e => handleMarkDown(e, globalIdx)} onTouchStart={e => handleMarkDown(e, globalIdx)}>
                          <div style={{ width: 2, height: "100%", background: "rgba(184,74,58,0.6)", position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", pointerEvents: "none" }} />
                          <div style={{ width: 12, height: 12, borderRadius: "50%", background: C.danger, border: "2px solid white", marginTop: 4, boxShadow: "0 1px 3px rgba(0,0,0,0.3)", position: "relative", zIndex: 1, flexShrink: 0 }} />
                          <span style={{ fontSize: 8, color: C.danger, fontFamily: FONT_MONO, position: "relative", zIndex: 1, lineHeight: 1.2, marginTop: 1, pointerEvents: "none" }}>{fmt(mt)}</span>
                        </div>
                      );
                    })}
                    {/* Ayuda listen-only (en el último segmento normal) */}
                    {listenOnly && si === segments.length - 1 && (
                      <div style={{ position: "absolute", top: 0, right: 0, bottom: 0, display: "flex", alignItems: "center", paddingRight: 6, pointerEvents: "none", zIndex: 12 }}>
                        <span style={{ fontSize: 8, color: C.muted, fontFamily: FONT_SANS, background: C.paper2, padding: "2px 5px", borderRadius: 4, border: `1px solid ${C.line}` }}>clic = añadir marca · arrastrar = mover · clic en marca = borrar</span>
                      </div>
                    )}
                  </div>
                );
              }

              // ── Segmento de repetición en vista completa: regla continua ──
              if (seg.type === "repeat-first" || seg.type === "repeat-second") {
                const isFirst = seg.type === "repeat-first";
                const pass    = isFirst ? "first" : "second";
                const bounds  = getSegBounds(seg, pass);
                const segDur  = bounds.max - bounds.min || 1;
                const segWidthPx = rulerW * (seg.vEnd - seg.vStart);
                const ticks   = rulerTicksForSeg(bounds.min, bounds.max, segWidthPx);
                const isActive = time >= bounds.min && time < bounds.max;
                const phPct   = isActive ? ((time - bounds.min) / segDur) * 100 : null;
                // Tinte muy sutil para info visual: azul claro en 1ª vez, verde claro en 2ª vez
                const zoneBg  = C.paper2;
                return (
                  <div key={si}
                    ref={el => trackSegRefs.current[`ruler_${si}_${pass}`] = el}
                    style={{ flex: seg.canonDur, position: "relative", height: 28, background: isActive ? `${isFirst ? C.fnS : C.fnT}12` : zoneBg, cursor: listenOnly ? "default" : "pointer", overflow: "hidden" }}
                    {...(!listenOnly ? {
                      onMouseDown:  e => handleSegRulerDown(e, seg, pass),
                      onTouchStart: e => handleSegRulerDown(e, seg, pass),
                    } : {})}>
                    {/* Pista horizontal continua */}
                    <div style={{ position: "absolute", top: "50%", left: 0, right: 0, height: 2.5, background: isActive ? `${isFirst ? C.fnS : C.fnT}55` : `${C.muted}40`, transform: "translateY(-50%)", pointerEvents: "none", zIndex: 3, transition: "background .15s" }} />
                  </div>
                );
              }

              // ── Segmento de repetición en la regla (doble altura) ──────────
              const { rep } = seg;
              const fd = (rep.first.end  - rep.first.start)  || 1;
              const sd = (rep.second.end - rep.second.start) || 1;
              const isFA = time >= rep.first.start  && time < rep.first.end;
              const isSA = time >= rep.second.start && time < rep.second.end;
              const fPct = isFA ? ((time - rep.first.start)  / fd) * 100 : null;
              const sPct = isSA ? ((time - rep.second.start) / sd) * 100 : null;
              const segWidthPx = rulerW * (seg.vEnd - seg.vStart);
              const fTicks = rulerTicksForSeg(rep.first.start,  rep.first.end,  segWidthPx * 0.65);
              const sTicks = rulerTicksForSeg(rep.second.start, rep.second.end, segWidthPx * 0.65);
              const repLabel = rep.label ? ` — ${rep.label}` : "";

              return (
                <div key={si} style={{ flex: seg.canonDur, position: "relative", display: "flex", flexDirection: "column" }}>
                  {/* Sin barras SVG aquí: el overlay del card exterior las pinta de forma continua */}

                  {/* Overlay de navegación continua (resumida): cubre ambas filas,
                      determina la vez por posición vertical del puntero */}
                  {viewMode === "resumida" && !listenOnly && (
                    <div style={{ position: "absolute", inset: 0, zIndex: 22, cursor: "pointer" }}
                      onMouseDown={e => handleDoubleRowRulerDown(e, seg, e.currentTarget.parentElement)}
                      onTouchStart={e => handleDoubleRowRulerDown(e, seg, e.currentTarget.parentElement)} />
                  )}

                  {/* ── Fila 1ª vez ── */}
                  <div ref={el => trackSegRefs.current[`ruler_${si}_first`] = el}
                    style={{ flexShrink: 0, height: 28, position: "relative", background: isFA ? `${C.fnS}10` : C.paper2, cursor: listenOnly ? "default" : "pointer", overflow: "hidden", transition: "background .15s" }}
                    onMouseDown={!listenOnly && viewMode !== "resumida" ? (e => handleRepZoneRulerDown(e, seg, "first")) : undefined}
                    onTouchStart={!listenOnly && viewMode !== "resumida" ? (e => handleRepZoneRulerDown(e, seg, "first")) : undefined}
                    onMouseMove={!listenOnly && viewMode !== "resumida" ? (e => handleRepRowMouseMove(e, trackSegRefs.current[`ruler_${si}_first`])) : undefined}
                    onMouseLeave={!listenOnly && viewMode !== "resumida" ? (() => { const el = trackSegRefs.current[`ruler_${si}_first`]; if (el) el.style.cursor = ""; }) : undefined}>
                    {/* Franja + etiqueta + línea en flex */}
                    <div style={{ display: "flex", alignItems: "center", position: "absolute", inset: 0, pointerEvents: "none", zIndex: 4 }}>
                      <span style={{ fontSize: 11, fontWeight: 800, fontFamily: FONT_SANS, color: isFA ? C.fnS : `${C.fnS}80`, paddingLeft: 8, paddingRight: 3, flexShrink: 0, letterSpacing: -0.3, lineHeight: 1, transition: "color .15s" }}>1ª</span>
                      <div style={{ flex: 1, height: 2.5, marginRight: 18, background: isFA ? `${C.fnS}55` : `${C.muted}40`, transition: "background .15s" }} />
                    </div>
                    {/* Barra de repetición de cierre — alineada con la de las pistas */}
                    {(() => {
                      const THICK = 3.5, THIN = 1.3, GAP = 2.5, DOT_R = 1.3;
                      const col = isFA ? C.fnS : `${C.fnS}88`;
                      return (
                        <div style={{ position: "absolute", top: 0, bottom: 0, right: 0, width: REPEAT_BARLINE_W, pointerEvents: "none", zIndex: 6 }}>
                          {/* Dots */}
                          <div style={{ position: "absolute", top: "33%", left: 1.5, width: DOT_R * 2, height: DOT_R * 2, borderRadius: "50%", background: col, transform: "translateY(-50%)", transition: "background .15s" }} />
                          <div style={{ position: "absolute", top: "67%", left: 1.5, width: DOT_R * 2, height: DOT_R * 2, borderRadius: "50%", background: col, transform: "translateY(-50%)", transition: "background .15s" }} />
                          {/* Barra fina */}
                          <div style={{ position: "absolute", top: 0, bottom: 0, right: THICK + GAP + 0.5, width: THIN, background: col, opacity: 0.55, transition: "background .15s" }} />
                          {/* Barra gruesa */}
                          <div style={{ position: "absolute", top: 0, bottom: 0, right: 0.5, width: THICK, background: col, opacity: 0.9, transition: "background .15s" }} />
                        </div>
                      );
                    })()}
                  </div>

                  {/* ── Separador entre filas ─────────────────────────────────── */}
                  <div style={{ flexShrink: 0, height: 1, background: C.line, marginLeft: 8, pointerEvents: "none", zIndex: 6 }} />

                  {/* ── Fila 2ª vez ── */}
                  <div ref={el => trackSegRefs.current[`ruler_${si}_second`] = el}
                    style={{ flexShrink: 0, height: 28, position: "relative", background: isSA ? `${C.fnT}10` : C.paper2, cursor: listenOnly ? "default" : "pointer", overflow: "hidden", transition: "background .15s" }}
                    onMouseDown={!listenOnly && viewMode !== "resumida" ? (e => handleRepZoneRulerDown(e, seg, "second")) : undefined}
                    onTouchStart={!listenOnly && viewMode !== "resumida" ? (e => handleRepZoneRulerDown(e, seg, "second")) : undefined}
                    onMouseMove={!listenOnly && viewMode !== "resumida" ? (e => handleRepRowMouseMove(e, trackSegRefs.current[`ruler_${si}_second`])) : undefined}
                    onMouseLeave={!listenOnly && viewMode !== "resumida" ? (() => { const el = trackSegRefs.current[`ruler_${si}_second`]; if (el) el.style.cursor = ""; }) : undefined}>
                    {/* Franja + etiqueta + línea en flex */}
                    <div style={{ display: "flex", alignItems: "center", position: "absolute", inset: 0, pointerEvents: "none", zIndex: 4 }}>
                      <span style={{ fontSize: 11, fontWeight: 800, fontFamily: FONT_SANS, color: isSA ? C.fnT : `${C.fnT}80`, paddingLeft: 8, paddingRight: 3, flexShrink: 0, letterSpacing: -0.3, lineHeight: 1, transition: "color .15s" }}>2ª</span>
                      <div style={{ flex: 1, height: 2.5, background: isSA ? `${C.fnT}55` : `${C.muted}40`, transition: "background .15s" }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── Separador visual entre regla de navegación y pistas del esquema ── */}
          <div style={{ height: 6, background: C.bg, flexShrink: 0 }} />

          {/* ── Fila de timestamps — solo en vista completa ── */}
          {viewMode !== "resumida" && (
            <div style={{ display: "flex", borderBottom: `1px solid ${C.line}`, background: C.paper, height: 18, flexShrink: 0, overflow: "hidden", userSelect: "none", pointerEvents: "none" }}>
              {segments.map((seg, si) => {
                const pass = seg.type === "repeat-second" ? "second" : "normal";
                const bounds = seg.type === "repeat-first" ? { min: seg.rep.first.start, max: seg.rep.first.end }
                             : seg.type === "repeat-second" ? { min: seg.rep.second.start, max: seg.rep.second.end }
                             : { min: 0, max: duration };
                const segDur = (bounds.max - bounds.min) || 1;
                const segWidthPx = rulerW * (seg.vEnd - seg.vStart);
                const ticks = rulerTicksForSeg(bounds.min, bounds.max, segWidthPx);
                return (
                  <div key={si} style={{ flex: seg.canonDur, position: "relative", height: "100%", borderRight: si < segments.length - 1 ? `1px solid ${C.line}` : "none" }}>
                    {ticks.map(({ t, frac }) => (
                      <div key={t} style={{ position: "absolute", top: 0, bottom: 0, left: `${frac * 100}%`, display: "flex", flexDirection: "column", alignItems: "center" }}>
                        <div style={{ width: 1, height: 5, background: C.muted, opacity: 0.5 }} />
                        <span style={{ fontSize: 8, color: C.muted, fontFamily: FONT_MONO, fontWeight: 500, transform: "translateX(-50%)", whiteSpace: "nowrap", lineHeight: 1, marginTop: 1 }}>{fmt(t)}</span>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}

          {/* ── PISTAS POR NIVEL con barras de repetición por nivel ── */}
          <div style={{ position: "relative" }}>
          {activeLevels.map((lv, li) => (
            <div key={lv.id} style={{ display: "flex", position: "relative", borderBottom: li < activeLevels.length - 1 ? `2px solid ${C.line}` : "none" }}>
              {/* Franja de color del nivel — posición absoluta para no afectar al layout flex */}
              <div style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: 3, background: lv.color, zIndex: 2, pointerEvents: "none" }} />
              {segments.map((seg, si) => {
                if (seg.type === "normal") {
                  return (
                    <div key={si}
                      ref={el => trackSegRefs.current[`${lv.id}_${si}_normal`] = el}
                      style={{ flex: seg.canonDur, position: "relative", height: lv.id === 1 ? 62 : lv.id === 2 ? 52 : 44, background: C.paper, cursor: "crosshair", userSelect: "none", touchAction: "none" }}
                      onMouseDown={e => handleTrackSegDown(e, lv.id, seg, "normal")}
                      onTouchStart={e => handleTrackSegDown(e, lv.id, seg, "normal")}>
                      {/* Etiqueta del nivel (solo en el primer segmento) */}
                      {si === 0 && (
                        <div style={{ position: "absolute", top: 4, left: 6, zIndex: 1, pointerEvents: "none" }}>
                          <span style={{ fontSize: 9, fontWeight: 700, color: lv.color, letterSpacing: 0.3, opacity: 0.35, fontFamily: FONT_SANS }}>{lv.sub}</span>
                        </div>
                      )}
                      {renderSegBlocks(seg, "normal", lv.id)}
                    </div>
                  );
                }

                // ── Segmentos de repetición en vista completa (fila única, continua) ──
                if (seg.type === "repeat-first" || seg.type === "repeat-second") {
                  const { rep } = seg;
                  const isFirst = seg.type === "repeat-first";
                  const pass    = isFirst ? "first" : "second";
                  const bounds    = getSegBounds(seg, pass);
                  const isActive  = time >= bounds.min && time < bounds.max;
                  // Fondo: 2ª vez levemente diferente para info visual (sin barras de repetición)
                  const zoneBg = isFirst ? lv.bg : `${lv.bg.replace(")", ", 0.6)").replace("rgba(", "rgba(").replace("0.08)", "0.12)").replace("0.10)", "0.15)").replace("0.09)", "0.13)")}`;
                  return (
                    <div key={si} style={{ flex: seg.canonDur, position: "relative", height: lv.id === 1 ? 62 : lv.id === 2 ? 52 : 44, background: C.paper, cursor: "crosshair", userSelect: "none", touchAction: "none" }}>
                      <div
                        ref={el => trackSegRefs.current[`${lv.id}_${si}_${pass}`] = el}
                        style={{ position: "absolute", inset: 0 }}
                        onMouseDown={e => handleTrackSegDown(e, lv.id, seg, pass)}
                        onTouchStart={e => handleTrackSegDown(e, lv.id, seg, pass)}>
                        {si === 0 && (
                          <div style={{ position: "absolute", top: 4, left: 6, zIndex: 1, pointerEvents: "none" }}>
                            <span style={{ fontSize: 9, fontWeight: 700, color: lv.color, letterSpacing: 0.3, opacity: 0.35, fontFamily: FONT_SANS }}>{lv.sub}</span>
                          </div>
                        )}
                        {/* Indicador visual sutil de zona de repetición en 2ª vez */}
                        {!isFirst && (
                          <div style={{ position: "absolute", inset: 0, background: `${lv.color}09`, pointerEvents: "none", zIndex: 0 }} />
                        )}
                        {renderSegBlocks(seg, pass, lv.id)}
                      </div>
                    </div>
                  );
                }

                // ── Segmento de repetición en la pista (fila única activa) ──────
                const { rep } = seg;
                const isFA = time >= rep.first.start  && time < rep.first.end;
                const isSA = time >= rep.second.start && time < rep.second.end;
                // Qué vez mostrar: la que suena, o la seleccionada manualmente
                const displayPass = isFA ? "first" : isSA ? "second" : (selectedPass[rep.id] || "first");
                const isActiveInThis = isFA || isSA;
                // Barlines en todos los niveles del esquema
                const barInset = REPEAT_BARLINE_W;

                return (
                  <div key={si} style={{ flex: seg.canonDur, position: "relative", height: lv.id === 1 ? 62 : lv.id === 2 ? 52 : 44, background: C.paper, cursor: "crosshair", userSelect: "none", touchAction: "none" }}>
                    {/* Zona de interacción — insetada barInset px para los niveles que llevan barras */}
                    <div
                      ref={el => {
                        trackSegRefs.current[`${lv.id}_${si}_first`]  = el;
                        trackSegRefs.current[`${lv.id}_${si}_second`] = el;
                      }}
                      style={{ position: "absolute", top: 0, bottom: 0, left: barInset, right: barInset }}
                      {...(viewMode !== "resumida" ? {
                        onMouseDown:  e => handleTrackSegDown(e, lv.id, seg, displayPass),
                        onTouchStart: e => handleTrackSegDown(e, lv.id, seg, displayPass),
                      } : {})}>
                      {si === 0 && (
                        <div style={{ position: "absolute", top: 4, left: 4, zIndex: 1, pointerEvents: "none" }}>
                          <span style={{ fontSize: 9, fontWeight: 700, color: lv.color, letterSpacing: 0.3, opacity: 0.35, fontFamily: FONT_SANS }}>{lv.sub}</span>
                        </div>
                      )}
                      {renderSegBlocks(seg, displayPass, lv.id)}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}

          {/* ── Barras de repetición — solo niveles 1 y 2, condicionadas por tamaño ──
               position:absolute relativo al contenedor PISTAS (position:relative).
               Si la sección repetida coincide con un bloque de nivel 1 (Parte),
               la barra abarca niveles 1+2. Si solo coincide con frases, solo nivel 2. ── */}
          {viewMode === "resumida" && (() => {
            const THICK=3, THIN=1, GAP=2, SPACE=3, DOT_R=2.3, DOT_GAP=8;
            const DW = DOT_R*2;
            const BW_S = THICK + GAP + THIN + SPACE + DW + 1;
            const BW_C = DW + SPACE + THIN + GAP + THICK + GAP + THIN + SPACE + DW;
            const dt1=`calc(50% - ${DOT_GAP+DOT_R}px)`, dt2=`calc(50% + ${DOT_GAP-DOT_R}px)`;
            const D=(extra)=>({position:"absolute",width:DW,height:DW,borderRadius:"50%",background:"rgba(0,0,0,0.70)",...extra});
            const V=(extra)=>({position:"absolute",top:0,bottom:0,background:"rgba(0,0,0,0.72)",...extra});
            const Vt=(extra)=>({position:"absolute",top:0,bottom:0,background:"rgba(0,0,0,0.28)",...extra});
            const LH = 62; // altura de cada nivel

            // Todas las repeticiones cubren todos los niveles activos.
            // top=0, bottom=0 → span completo del contenedor PISTAS.
            const ev = new Map();
            const kv = v => v.toFixed(5);
            segments.filter(s => s.type === "repeat").forEach(seg => {
              const ks = kv(seg.vStart);
              if (!ev.has(ks)) ev.set(ks, { v: seg.vStart, isStart: false, isEnd: false });
              ev.get(ks).isStart = true;
              const ke = kv(seg.vEnd);
              if (!ev.has(ke)) ev.set(ke, { v: seg.vEnd, isStart: false, isEnd: false });
              ev.get(ke).isEnd = true;
            });

            return [...ev.values()].map(({ v, isStart, isEnd }, bi) => {
              if (isStart && isEnd) {
                const cx = BW_C/2;
                return (
                  <div key={bi} style={{ position:"absolute", top:0, bottom:0, left:`${v*100}%`, width:BW_C, transform:"translateX(-50%)", pointerEvents:"none", zIndex:18 }}>
                    <div style={D({left:0, top:dt1})} /><div style={D({left:0, top:dt2})} />
                    <div style={Vt({left:DW+SPACE, width:THIN})} />
                    <div style={V({left:cx-THICK/2, width:THICK})} />
                    <div style={Vt({right:DW+SPACE, width:THIN})} />
                    <div style={D({right:0, top:dt1})} /><div style={D({right:0, top:dt2})} />
                  </div>
                );
              } else if (isStart) {
                const dL = THICK+GAP+THIN+SPACE;
                return (
                  <div key={bi} style={{ position:"absolute", top:0, bottom:0, left:`${v*100}%`, width:BW_S, pointerEvents:"none", zIndex:18 }}>
                    <div style={V({left:0.5, width:THICK})} />
                    <div style={Vt({left:THICK+GAP+0.5, width:THIN})} />
                    <div style={D({left:dL, top:dt1})} /><div style={D({left:dL, top:dt2})} />
                  </div>
                );
              } else {
                const dR = THICK+GAP+THIN+SPACE;
                return (
                  <div key={bi} style={{ position:"absolute", top:0, bottom:0, left:`${v*100}%`, width:BW_S, transform:"translateX(-100%)", pointerEvents:"none", zIndex:18 }}>
                    <div style={D({right:dR, top:dt1})} /><div style={D({right:dR, top:dt2})} />
                    <div style={Vt({right:THICK+GAP+0.5, width:THIN})} />
                    <div style={V({right:0.5, width:THICK})} />
                  </div>
                );
              }
            });
          })()}
          </div>
          </div>{/* /contenedor de escala */}
        </div>

        {/* ── Barra de desplazamiento horizontal del esquema ─────────────────
             Aparece debajo del esquema cuando el zoom es > 1.
             En ordenador: usar la rueda del ratón para hacer zoom.
             En móvil: pellizcar con dos dedos para hacer zoom.  ── */}
        {schemaZoom > 1 && (() => {
          const thumbW  = Math.max(4, 100 / schemaZoom);
          const thumbL  = schemaScrollFrac * (100 - thumbW);
          return (
            <div style={{ marginBottom: 12, marginTop: 0 }}>
              {/* Track */}
              <div
                style={{ height: 14, background: C.paper, border: `1px solid ${C.line}`, borderRadius: 7, position: "relative", cursor: "pointer", userSelect: "none", overflow: "hidden", touchAction: "none" }}
                onMouseDown={handleScrollbarTrackDown}
                onTouchStart={handleScrollbarTrackDown}
              >
                {/* Thumb */}
                <div style={{
                  position: "absolute", top: 2, bottom: 2,
                  left: `${thumbL}%`, width: `${thumbW}%`,
                  background: C.muted, borderRadius: 5, pointerEvents: "none",
                  transition: "background .12s",
                }} />
                {/* Indicador de zoom */}
                <div style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", fontSize: 9, color: C.muted2, fontFamily: FONT_MONO, fontWeight: 600, pointerEvents: "none", letterSpacing: 0.3 }}>
                  ×{schemaZoom.toFixed(1)}
                </div>
              </div>

            </div>
          );
        })()}

        {/* Panel de selección de bloque */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {selBlock && !selBlock.isPreview && selLv ? (
            <div style={{ background: C.paper, border: `1px solid ${selLv.color}40`, borderRadius: 12, padding: "10px 14px", display: "flex", alignItems: "center", gap: 9, flex: 1, minWidth: 0, flexWrap: "wrap" }}
              onMouseDown={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: selLv.color, flexShrink: 0 }} />
              <span style={{ fontFamily: FONT_SERIF, fontSize: 16, fontWeight: 700, color: C.ink }}>{selBlock.label}</span>
              <span style={{ fontSize: 11, color: C.muted, flex: 1, minWidth: 90 }}>
                {selLv.sub} · {fmt(selBlock.start)}–{fmt(selBlock.end)} · dur.&nbsp;{fmt(selBlock.end - selBlock.start)}
              </span>
              {/* Selector de color */}
              {selBlock.level !== 4 && (() => {
                const { bg: swatchBg } = selBlock.customColor
                  ? harmonyBlockColors(null, selBlock.customColor)
                  : selLv.id === 3 ? harmonyBlockColors(selBlock.label, selLv.color)
                  : (selLv.id === 1 || selLv.id === 2) ? schemaBlockColor(selBlock, blocks, schemaPalette)
                  : { bg: selLv.color };
                return (
                  <span title="Cambiar color" style={{ position: "relative", display: "inline-flex", alignItems: "center", flexShrink: 0 }}>
                    <span onClick={() => colorInputRef.current?.click()}
                      style={{ display: "inline-block", width: 22, height: 22, borderRadius: 5, background: swatchBg, border: `2px solid ${C.line}`, boxShadow: "inset 0 1px 2px rgba(0,0,0,0.12)", cursor: "pointer" }} />
                    <input ref={colorInputRef} type="color" value={swatchBg}
                      onChange={e => { const hex = e.target.value; setBlocks(prev => prev.map(b => {
                        if (b.id === selected) return { ...b, customColor: hex };
                        if (prev.find(x => x.id === selected)?.pass === "first" && b.mirrorId === selected) return { ...b, customColor: hex };
                        return b;
                      })); }}
                      style={{ position: "absolute", opacity: 0, width: "100%", height: "100%", top: 0, left: 0, cursor: "pointer", border: "none", padding: 0 }} />
                  </span>
                );
              })()}
              {selBlock.level !== 4 && selBlock.customColor && (
                <button title="Restablecer color automático" className="fa-pressable"
                  onClick={() => setBlocks(prev => { const selB = prev.find(b => b.id === selected); return prev.map(b => { if (b.id === selected) return { ...b, customColor: undefined }; if (selB?.pass === "first" && b.mirrorId === selected) return { ...b, customColor: undefined }; return b; }); })}
                  style={{ border: `1px solid ${C.line}`, background: C.paper2, borderRadius: 7, padding: "6px 9px", fontSize: 11, cursor: "pointer", color: C.muted, lineHeight: 1 }}>↺</button>
              )}
              {selBlock.pass !== "second" && (
                <button onClick={() => { setEditId(selected); setEditVal(selBlock.label); }} className="fa-pressable"
                  style={{ border: `1px solid ${C.line}`, background: C.paper2, borderRadius: 7, padding: "6px 12px", fontSize: 11.5, fontWeight: 500, cursor: "pointer", color: C.ink2 }}>Renombrar</button>
              )}
              {selBlock.pass === "second" && (
                <span style={{ fontSize: 10, color: C.muted, fontStyle: "italic" }}>texto igual al original</span>
              )}
              <button onClick={() => { setHistory(prev => [...prev, blocksRef.current]); setBlocks(prev => prev.filter(b => b.id !== selected)); setSelected(null); }} className="fa-pressable"
                style={{ border: `1px solid ${C.danger}`, background: "transparent", borderRadius: 7, padding: "6px 12px", fontSize: 11.5, fontWeight: 500, cursor: "pointer", color: C.danger }}>Eliminar</button>
            </div>
          ) : selectedRepId ? (() => {
            const rep = localReps.find(r => r.id === selectedRepId);
            if (!rep) return null;
            return (
              <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap", background: C.paper, border: `1px solid ${C.fnS}40`, borderRadius: 12, padding: "10px 14px" }}
                onMouseDown={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: C.fnS, display: "inline-block", flexShrink: 0 }} />
                <span style={{ fontFamily: FONT_SERIF, fontSize: 16, fontWeight: 700, color: C.ink }}>Repetición</span>
                <span style={{ fontSize: 11, color: C.muted, flex: 1, minWidth: 90 }}>
                  {fmt(rep.first.start)}–{fmt(rep.first.end)} · {fmt(rep.second.start)}–{fmt(rep.second.end)}
                </span>
                <button className="fa-pressable"
                  onClick={() => { deleteRepeat(selectedRepId); setSelectedRepId(null); }}
                  style={{ border: `1px solid ${C.danger}`, background: "transparent", borderRadius: 7, padding: "6px 12px", fontSize: 11.5, fontWeight: 500, cursor: "pointer", color: C.danger }}>
                  Eliminar
                </button>
              </div>
            );
          })() : (
            <div style={{ flex: 1, fontSize: 12.5, color: C.muted, padding: "8px 10px", lineHeight: 1.5 }}>
              {blocks.filter(b => !b.isPreview).length === 0
                ? "Arrastra sobre cualquier pista para crear un bloque · doble toque para renombrar."
                : `${blocks.filter(b => !b.isPreview).length} bloque${blocks.filter(b => !b.isPreview).length !== 1 ? "s" : ""} · selecciona uno para editarlo.`}
            </div>
          )}

          {/* Área de texto (nivel 4) — ancho completo bajo el panel de selección */}
          {selBlock?.level === 4 && !selBlock.isPreview && (
            <div style={{ width: "100%", marginTop: 4 }}
              onMouseDown={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()}>
              <label style={{ ...S.label, marginBottom: 4, color: SCHEMA_LEVELS[3].color }}>
                Texto / Observaciones
                {selBlock.pass !== "second"
                  ? <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}> — solo visible al seleccionar el bloque</span>
                  : <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0, color: C.muted }}> — sincronizado del original (solo lectura)</span>}
              </label>
              {selBlock.pass === "second" ? (
                <div style={{ ...S.input, minHeight: 60, lineHeight: 1.6, fontSize: 13, color: selBlock.bodyText ? C.ink : C.muted2, fontStyle: selBlock.bodyText ? "normal" : "italic", background: C.paper2, opacity: 0.75, pointerEvents: "none", userSelect: "none" }}>
                  {selBlock.bodyText || "Sin texto en el original"}
                </div>
              ) : (
                <textarea
                  style={{ ...S.input, minHeight: 100, resize: "vertical", fontFamily: FONT_SANS, lineHeight: 1.6, fontSize: 13 }}
                  placeholder="Escribe aquí el texto completo para este bloque… (solo tú lo verás al seleccionarlo)"
                  value={selBlock.bodyText || ""}
                  onChange={e => {
                    const newText = e.target.value;
                    setBlocks(prev => prev.map(b => {
                      if (b.id === selected) return { ...b, bodyText: newText };
                      // Propagar el texto al bloque espejo de la 2ª vez
                      if (b.mirrorId === selected) return { ...b, bodyText: newText };
                      return b;
                    }));
                  }}
                  onClick={e => e.stopPropagation()} />
              )}
            </div>
          )}
        </div>


      </div>

      <StickyActionBar
        secondary={listenOnly ? null : (
          <div style={{ display: "flex", gap: 8 }} onMouseDown={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()}>
            <BarIconButton onClick={undo} disabled={history.length === 0} title="Deshacer">↩</BarIconButton>
            <BarIconButton onClick={resetAll} disabled={blocks.filter(b => !b.isPreview).length === 0} title="Borrar todo" danger>✕</BarIconButton>
          </div>
        )}
        info={
          listenOnly ? (
            <>
              <span style={{ fontFamily: F.sans, fontSize: 13, fontWeight: 600, color: C.ink }}>
                {(() => { const n = schemaMarks.length; return n === 0 ? "Sin marcas todavía" : `${n} ${n === 1 ? "marca" : "marcas"}`; })()}
              </span>
              <span style={{ fontFamily: F.sans, fontSize: 11, color: C.muted }}>Toca la regla para añadir una marca</span>
            </>
          ) : (
            <>
              <span style={{ fontFamily: F.sans, fontSize: 13, fontWeight: 600, color: C.ink }}>
                {(() => { const n = blocks.filter(b => !b.isPreview).length; return n === 0 ? "Sin bloques todavía" : `${n} ${n === 1 ? "bloque" : "bloques"}`; })()}
              </span>
              <span style={{ fontFamily: F.sans, fontSize: 11, color: C.muted }}>Arrastra en una pista para crear</span>
            </>
          )
        }>
        <BarSubmitButton onClick={handleSubmit} accent={C.fnD}>
          {mode === "record" ? "Guardar clave" : mode === "preview" ? "Ver resultado" : "Entregar"}
        </BarSubmitButton>
      </StickyActionBar>
    </div>
  );
}

// ═══ 10. CORRECTION VIEW · QUESTIONNAIRE VIEW ═══════════════════════════════

// Línea vertical animada a 60 fps sobre el timeline del esquema (sin re-renders de React)
function SchemaPlayhead({ timeRef, duration }) {
  const lineRef = useRef(null);
  useEffect(() => {
    let raf;
    const tick = () => {
      if (lineRef.current && duration > 0) {
        const pct = Math.min(100, (timeRef.current / duration) * 100);
        lineRef.current.style.left = `${pct}%`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [timeRef, duration]);
  return (
    <div ref={lineRef} style={{
      position: "absolute", top: 0, left: 0, width: 2, height: "100%",
      background: C.danger, opacity: 0.75, pointerEvents: "none", zIndex: 10,
      transform: "translateX(-50%)", borderRadius: 1,
    }} />
  );
}

function CorrectionView({ exercise, result, margin, onBack, backLabel = "← Mis ejercicios", isTeacherMode = false, student = null, onSaveCorrection = null }) {
  const dur = exercise.duration;
  const tc  = result.teacherCorrection;

  // Hooks siempre en el mismo orden (reglas de React)
  const [lvComments,   setLvComments]   = useState(() => tc?.levelComments   || {});
  const [blkComments,  setBlkComments]  = useState(() => tc?.blockComments   || {});
  const [schemaGlobal, setSchemaGlobal] = useState(tc?.globalComment || "");
  const [schemaScore,  setSchemaScore]  = useState(tc?.totalScore ?? "");
  const [showBlkForm,  setShowBlkForm]  = useState(false);
  const [qComments,    setQComments]    = useState(() => tc?.questionComments || {});
  const [quizGlobal,   setQuizGlobal]   = useState(tc?.globalComment || "");
  const [quizScore,    setQuizScore]    = useState(tc?.totalScore ?? "");

  // Audio — siempre incondicional (reglas de hooks)
  const { time, timeRef: audioTimeRef, playing, audioReady, hasAudio, togglePlay, seekTo } = useAudioPlayer(exercise);

  // Modelo esquema — corrección semiautomática
  if (result.type === "esquema") {
    const blocks      = result.blocks || [];
    const schemaKey   = exercise.schemaKey || [];
    const hasKey      = schemaKey.length > 0;
    const ps          = result.placementScore ?? null;
    const studentPalette = result.schemaPalette || SCHEMA_PALETTE_DEFAULT;   // paleta elegida por el alumno
    const keyPalette     = exercise.schemaPalette || SCHEMA_PALETTE_DEFAULT;  // paleta de la clave (profesor)
    const activeLevels = SCHEMA_LEVELS.filter((lv) =>
      !exercise.schemaLevels || exercise.schemaLevels.length === 0 || exercise.schemaLevels.includes(lv.id)
    );

    const handleTimelineClick = (e) => {
      const rect = e.currentTarget.getBoundingClientRect();
      seekTo(((e.clientX - rect.left) / rect.width) * exercise.duration);
    };

    const SchemaStrip = ({ title: stripTitle, bks, paletteId = studentPalette }) => (
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: C.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 10 }}>{stripTitle}</div>
        {activeLevels.map((lv) => {
          const lvBlocks = bks.filter((b) => b.level === lv.id).sort((a, b) => a.start - b.start);
          if (lvBlocks.length === 0) return null;
          return (
            <div key={lv.id} style={{ marginBottom: lv.id === 4 ? 14 : 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: lv.color, minWidth: 56, textTransform: "uppercase", letterSpacing: 0.5 }}>{lv.sub}</span>
                <div
                  onClick={hasAudio ? handleTimelineClick : undefined}
                  style={{ flex: 1, position: "relative", height: 40, background: C.paper2, borderRadius: 6, overflow: "hidden", cursor: hasAudio ? "pointer" : "default" }}>
                  {lvBlocks.map((b, i) => {
                    const lPct = (b.start / exercise.duration) * 100;
                    const wPct = Math.max(((b.end - b.start) / exercise.duration) * 100, 0.5);
                    const { bg, textColor } = schemaBlockColor(b, bks, paletteId);
                    if (lv.id === 3) {
                      return (
                        <div key={i} style={{ position: "absolute", top: 6, bottom: 6, left: `${lPct}%`, width: `${wPct}%`, display: "flex", alignItems: "center", overflow: "hidden", pointerEvents: "none" }}>
                          <div style={{ background: bg, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", padding: "4px 10px", flexShrink: 0, minWidth: 0 }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: textColor, fontFamily: FONT_SANS, whiteSpace: "nowrap" }}>{b.label}</span>
                          </div>
                          {wPct >= 4 && <div style={{ flex: 1, height: 2.5, background: bg, opacity: 0.55, marginLeft: 4, borderRadius: 1.5 }} />}
                        </div>
                      );
                    }
                    if (lv.id === 4) {
                      return (
                        <div key={i} style={{ position: "absolute", top: 4, bottom: 4, left: `${lPct}%`, width: `${wPct}%`, background: bg, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 10px", overflow: "hidden", pointerEvents: "none" }}>
                          <span style={{ fontSize: 11, fontWeight: 500, color: textColor, fontFamily: FONT_SANS, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{b.label}</span>
                        </div>
                      );
                    }
                    return (
                      <div key={i} style={{ position: "absolute", top: 3, bottom: 3, left: `${lPct}%`, width: `${wPct}%`, background: bg, borderRadius: 4, border: "1px solid rgba(255,255,255,0.22)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", pointerEvents: "none" }}>
                        <span style={{ fontSize: 11, fontWeight: lv.id === 1 ? 700 : 500, color: textColor, fontFamily: FONT_SANS, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "84%", padding: "0 3px" }}>{b.label}</span>
                      </div>
                    );
                  })}
                  {hasAudio && <SchemaPlayhead timeRef={audioTimeRef} duration={exercise.duration} />}
                </div>
              </div>
              {lv.id === 4 && lvBlocks.some(b => b.bodyText) && (
                <div style={{ paddingLeft: 66, marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
                  {lvBlocks.filter(b => b.bodyText).map((b, i) => {
                    const { bg } = schemaBlockColor(b, bks, paletteId);
                    return (
                      <div key={i} style={{ background: C.paper2, border: `1px solid ${C.line}`, borderRadius: 8, padding: "10px 14px", borderLeft: `3px solid ${bg}` }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                          <span style={{ fontFamily: FONT_SANS, fontWeight: 700, fontSize: 13, color: bg }}>{b.label}</span>
                          <span style={{ fontSize: 11, color: C.muted, fontFamily: FONT_MONO }}>{fmt(b.start)}–{fmt(b.end)}</span>
                        </div>
                        <div style={{ fontSize: 13, color: C.ink, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{b.bodyText}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );

    const AudioBar = () => hasAudio ? (
      <div style={{ ...S.card, marginBottom: 16, padding: "12px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            onClick={togglePlay}
            disabled={!audioReady}
            style={{ width: 36, height: 36, borderRadius: "50%", border: "none", background: audioReady ? C.ink : C.line, color: C.paper, cursor: audioReady ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0, transition: "background .15s" }}>
            {playing ? "⏸" : "▶"}
          </button>
          <div
            onClick={handleTimelineClick}
            style={{ flex: 1, position: "relative", height: 6, background: C.paper2, borderRadius: 3, cursor: "pointer", overflow: "visible" }}>
            <div style={{ position: "absolute", top: 0, left: 0, height: "100%", width: `${(time / exercise.duration) * 100}%`, background: C.fnS, borderRadius: 3, transition: "width .1s linear" }} />
          </div>
          <span style={{ fontSize: 12, fontFamily: FONT_MONO, color: C.muted, flexShrink: 0 }}>{fmt(time)} / {fmt(exercise.duration)}</span>
        </div>
      </div>
    ) : null;

    // ── Vista del profesor ────────────────────────────────────────────────────
    if (isTeacherMode) {
      const handleSave = () => onSaveCorrection?.(student?.id, exercise.id, {
        levelComments: lvComments,
        blockComments: Object.fromEntries(Object.entries(blkComments).filter(([, v]) => v?.trim())),
        globalComment: schemaGlobal.trim(),
        totalScore:    schemaScore !== "" ? Number(schemaScore) : null,
      });
      return (
        <div style={S.app}>
          <div style={S.page}>
            <button onClick={onBack} style={{ ...S.btn, marginBottom: 20, fontSize: 12, padding: "6px 12px" }}>{backLabel}</button>
            <h1 style={{ ...S.h1, marginBottom: 4 }}>Corrección: {exercise.title}</h1>
            {student && <p style={{ color: C.muted, fontSize: 13, margin: "0 0 20px" }}>Alumno: <strong>{student.displayName}</strong></p>}

            {ps != null && (
              <div style={{ ...S.card, textAlign: "center", marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>Colocación automática (margen ±3 s)</div>
                <div style={{ fontSize: 48, fontWeight: 900, color: scoreColor(ps), lineHeight: 1 }}>{ps}%</div>
                <div style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>de bloques dentro del margen</div>
              </div>
            )}

            <AudioBar />

            {(blocks.length > 0 || hasKey) && (
              <div style={{ ...S.card, marginBottom: 16 }}>
                {hasKey && <><SchemaStrip title="Referencia (profesor)" bks={schemaKey} paletteId={keyPalette} /><hr style={{ ...S.divider, margin: "10px 0 14px" }} /></>}
                {blocks.length > 0 && <SchemaStrip title="Esquema del alumno" bks={blocks} />}
              </div>
            )}

            <div style={{ ...S.card, border: `1.5px solid rgba(47,111,184,0.3)` }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.quiz, marginBottom: 16 }}>
                {tc?.corrected ? "Editar corrección" : "Añadir corrección manual"}
              </div>

              {activeLevels.map((lv) => (
                <div key={lv.id} style={{ marginBottom: 14 }}>
                  <label style={{ ...S.label, color: lv.color }}>{lv.sub} — comentario (opcional)</label>
                  <textarea value={lvComments[lv.id] || ""}
                    onChange={(e) => setLvComments((p) => ({ ...p, [lv.id]: e.target.value }))}
                    placeholder={`Valoración del nivel ${lv.sub}…`}
                    style={{ ...S.input, minHeight: 56, resize: "vertical", fontFamily: FONT_SANS }} />
                </div>
              ))}

              {blocks.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <button onClick={() => setShowBlkForm(!showBlkForm)} style={{ ...S.btn, fontSize: 12, marginBottom: 8 }}>
                    {showBlkForm ? "▲ Ocultar comentarios por bloque" : "▼ Comentarios por bloque (opcional)"}
                  </button>
                  {showBlkForm && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {blocks.map((b) => {
                        const lv = SCHEMA_LEVELS.find((l) => l.id === b.level);
                        return (
                          <div key={b.id} style={{ background: C.paper2, border: `1px solid ${C.line}`, borderRadius: 8, padding: "8px 12px" }}>
                            <div style={{ ...S.row, gap: 6, marginBottom: 6 }}>
                              <span style={{ fontFamily: FONT_SERIF, fontWeight: 700, fontSize: 12, color: lv?.color }}>{b.label}</span>
                              <span style={{ fontSize: 11, color: C.muted, fontFamily: FONT_MONO }}>{fmt(b.start)}–{fmt(b.end)}</span>
                              <span style={{ fontSize: 10, background: (lv?.color || C.muted) + "20", color: lv?.color || C.muted, padding: "1px 6px", borderRadius: 3 }}>{lv?.sub}</span>
                            </div>
                            <textarea value={blkComments[b.id] || ""}
                              onChange={(e) => setBlkComments((p) => ({ ...p, [b.id]: e.target.value }))}
                              placeholder="Comentario sobre este bloque…" rows={2}
                              style={{ ...S.input, resize: "vertical", fontFamily: FONT_SANS, fontSize: 12 }} />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              <div style={{ marginBottom: 14 }}>
                <label style={S.label}>Comentario general</label>
                <textarea value={schemaGlobal} onChange={(e) => setSchemaGlobal(e.target.value)}
                  placeholder="Observaciones generales sobre el esquema…"
                  style={{ ...S.input, minHeight: 70, resize: "vertical", fontFamily: FONT_SANS }} />
              </div>

              <div style={{ marginBottom: 18 }}>
                <label style={S.label}>Puntuación total (0–10, opcional)</label>
                <input type="number" min={0} max={10} step={0.5} value={schemaScore}
                  onChange={(e) => setSchemaScore(e.target.value)} placeholder="Ej: 7.5"
                  style={{ ...S.input, width: 120 }} />
              </div>

              <button onClick={handleSave} style={{ ...S.btnPrimary, width: "100%" }}>
                {tc?.corrected ? "Actualizar corrección" : "Guardar corrección"}
              </button>
            </div>
            <div style={{ height: 32 }} />
          </div>
        </div>
      );
    }

    // ── Vista del alumno ──────────────────────────────────────────────────────
    const showRefSchema = exercise.immediateSchemaFeedback && hasKey;
    return (
      <div style={S.app}>
        <div style={S.page}>
          <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "var(--f-sans, Outfit)", fontSize: 13, color: "#888", padding: 0, marginBottom: 20 }}>← Volver</button>
          <h1 style={{ ...S.h1, marginBottom: 20 }}>Esquema entregado: {exercise.title}</h1>

          <div style={{ ...S.card, textAlign: "center", marginBottom: 20 }}>
            {ps != null ? (
              <>
                <div style={{ fontSize: 56, fontWeight: 900, color: scoreColor(ps), lineHeight: 1 }}>{ps}%</div>
                <div style={{ color: C.muted, fontSize: 13, marginTop: 4 }}>de bloques colocados correctamente (margen ±3 s)</div>
              </>
            ) : (
              <div style={{ color: C.muted, lineHeight: 1.6 }}>
                Esquema enviado al profesor para revisión.<br />
                <span style={{ fontSize: 12 }}>{blocks.length} {blocks.length === 1 ? "bloque dibujado" : "bloques dibujados"}.</span>
              </div>
            )}
          </div>

          <AudioBar />

          {(blocks.length > 0 || showRefSchema) && (
            <div style={S.card}>
              {showRefSchema && <><SchemaStrip title="Esquema de referencia (profesor)" bks={schemaKey} paletteId={keyPalette} /><hr style={{ ...S.divider, margin: "10px 0 14px" }} /></>}
              {!showRefSchema && hasKey && (
                <p style={{ textAlign: "center", color: C.muted, fontSize: 12, margin: "0 0 14px" }}>
                  El esquema de referencia estará disponible cuando el profesor corrija el ejercicio.
                </p>
              )}
              {blocks.length > 0 && <SchemaStrip title="Tu esquema" bks={blocks} />}
            </div>
          )}

          {tc?.corrected && (
            <div style={{ ...S.card, border: `1.5px solid rgba(47,111,184,0.35)`, marginTop: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.quiz, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 12 }}>Corrección del profesor</div>
              {tc.totalScore != null && (
                <div style={{ textAlign: "center", marginBottom: 14 }}>
                  <span style={{ fontSize: 48, fontWeight: 900, color: C.quiz, lineHeight: 1 }}>{tc.totalScore}</span>
                  <span style={{ fontSize: 18, color: C.quiz }}>/10</span>
                </div>
              )}
              {activeLevels.filter((lv) => tc.levelComments?.[lv.id]).map((lv) => (
                <div key={lv.id} style={{ marginBottom: 10, padding: "10px 12px", background: C.paper2, borderRadius: 8, borderLeft: `3px solid ${lv.color}` }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: lv.color, marginBottom: 4 }}>{lv.sub}</div>
                  <div style={{ fontSize: 13, color: C.ink, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{tc.levelComments[lv.id]}</div>
                </div>
              ))}
              {tc.blockComments && Object.entries(tc.blockComments).filter(([, v]) => v).map(([blockId, comment]) => {
                const block = blocks.find((b) => b.id === blockId);
                if (!block) return null;
                const lv = SCHEMA_LEVELS.find((l) => l.id === block.level);
                return (
                  <div key={blockId} style={{ marginBottom: 6, padding: "8px 10px", background: C.paper2, borderRadius: 8 }}>
                    <div style={{ ...S.row, gap: 6, marginBottom: 4 }}>
                      <span style={{ fontFamily: FONT_SERIF, fontWeight: 700, fontSize: 12, color: lv?.color }}>{block.label}</span>
                      <span style={{ fontSize: 11, color: C.muted, fontFamily: FONT_MONO }}>{fmt(block.start)}–{fmt(block.end)}</span>
                    </div>
                    <div style={{ fontSize: 13, color: C.ink, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{comment}</div>
                  </div>
                );
              })}
              {tc.globalComment && (
                <div style={{ padding: "10px 12px", background: "rgba(47,111,184,0.06)", border: `1px solid rgba(47,111,184,0.2)`, borderRadius: 8, marginTop: 6 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.quiz, marginBottom: 4 }}>Comentario general</div>
                  <div style={{ fontSize: 13, color: C.ink, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{tc.globalComment}</div>
                </div>
              )}
            </div>
          )}

          <button onClick={onBack} style={{ ...S.btnPrimary, width: "100%", marginTop: 16, padding: 14, borderRadius: 12 }}>{backLabel}</button>
        </div>
      </div>
    );
  }

  // Modelo cuestionario
  if (result.type === "cuestionario") {
    const questions = questionsOf(exercise);
    const sc        = result.score;
    const testQs    = questions.filter((q) => q.type === "test" && q.correctOptionId);
    const devQs     = questions.filter((q) => q.type === "desarrollo");
    const correctN  = testQs.filter((q) => result.answers?.[q.id] === q.correctOptionId).length;
    const col       = scoreColor(sc);

    const handleSaveQuiz = () => {
      const correction = {
        corrected: true,
        questionComments: qComments,
        globalComment: quizGlobal,
        totalScore: quizScore === "" ? null : Number(quizScore),
      };
      onSaveCorrection(student.id, exercise.id, correction);
    };

    if (isTeacherMode) {
      return (
        <div style={S.app}>
          <div style={S.page}>
            <button onClick={onBack} style={{ ...S.btn, marginBottom: 24, fontSize: 12, padding: "6px 12px" }}>{backLabel}</button>
            <h1 style={{ ...S.h1, marginBottom: 4 }}>Corrección: {exercise.title}</h1>
            {student && <p style={{ color: C.muted, fontSize: 13, marginBottom: 20 }}>Alumno: <strong>{student.name}</strong></p>}

            {sc != null && (
              <div style={{ ...S.card, textAlign: "center", marginBottom: 20 }}>
                <div style={{ fontSize: 48, fontWeight: 900, color: col, lineHeight: 1 }}>{sc}%</div>
                <div style={{ color: C.muted, fontSize: 13, marginTop: 4 }}>{correctN} de {testQs.length} {testQs.length === 1 ? "pregunta test" : "preguntas test"} correctas (automático)</div>
              </div>
            )}

            {questions.map((q, idx) => {
              const studentAnswer = result.answers?.[q.id];
              const isCorrect = q.type === "test" && studentAnswer === q.correctOptionId;
              const isWrong   = q.type === "test" && !!studentAnswer && studentAnswer !== q.correctOptionId;
              return (
                <div key={q.id} style={{ ...S.card, marginBottom: 16, border: q.type !== "test" ? `1.5px solid ${C.quiz}33` : `1.5px solid ${isCorrect ? C.fnT : isWrong ? C.danger : C.line}` }}>
                  <div style={{ ...S.row, gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                    <span style={{ ...S.badge, background: C.line, color: C.muted }}>P{idx + 1}</span>
                    <span style={{ ...S.badge, background: q.type === "test" ? "rgba(63,155,91,0.12)" : "rgba(47,111,184,0.12)", color: q.type === "test" ? C.fnT : C.quiz }}>{q.type === "test" ? "Test" : "Desarrollo"}</span>
                    <span style={{ ...S.badge, background: C.paper2, color: C.muted, fontFamily: FONT_MONO }}>{fmt(q.audioStart)}–{fmt(q.audioEnd)}</span>
                    {q.type === "test" && (
                      <span style={{ ...S.badge, background: isCorrect ? "rgba(63,155,91,0.16)" : isWrong ? "rgba(184,74,58,0.16)" : C.line, color: isCorrect ? C.fnT : isWrong ? C.danger : C.muted }}>
                        {!studentAnswer ? "Sin respuesta" : isCorrect ? "✓ Correcta" : "✗ Incorrecta"}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 14, color: C.ink, marginBottom: 12 }}>{q.text}</div>

                  {q.type === "test" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {q.options.map((opt) => {
                        const isPick       = opt.id === studentAnswer;
                        const isCorrectOpt = opt.id === q.correctOptionId;
                        return (
                          <div key={opt.id} style={{
                            ...S.row, gap: 10, padding: "8px 12px", borderRadius: 8,
                            background: isCorrectOpt ? "rgba(63,155,91,0.10)" : isPick && !isCorrectOpt ? "rgba(184,74,58,0.10)" : C.paper2,
                            border:     `1.5px solid ${isCorrectOpt ? C.fnT : isPick && !isCorrectOpt ? C.danger : C.line}`,
                            color:      isCorrectOpt ? C.fnT : isPick && !isCorrectOpt ? C.danger : C.muted,
                          }}>
                            <span style={{ fontFamily: FONT_MONO, fontWeight: 700, fontSize: 12, minWidth: 20 }}>{opt.id}</span>
                            <span style={{ flex: 1, fontSize: 13 }}>{opt.text}</span>
                            {isCorrectOpt && <span style={{ fontSize: 11, fontWeight: 700 }}>✓ Correcta</span>}
                            {isPick && !isCorrectOpt && <span style={{ fontSize: 11, fontWeight: 700 }}>Resp. alumno</span>}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {q.type === "desarrollo" && (
                    <div>
                      <div style={{ fontSize: 11, color: C.muted, marginBottom: 6 }}>Respuesta del alumno:</div>
                      <div style={{ background: C.paper2, border: `1px solid ${C.line}`, borderRadius: 8, padding: "10px 12px", fontSize: 14, color: C.ink, whiteSpace: "pre-wrap", minHeight: 40, lineHeight: 1.5, marginBottom: 12 }}>
                        {studentAnswer || <span style={{ color: C.muted2, fontStyle: "italic" }}>Sin respuesta</span>}
                      </div>
                      <div style={{ fontSize: 11, color: C.muted, marginBottom: 6 }}>Comentario del profesor:</div>
                      <textarea
                        value={qComments[q.id] || ""}
                        onChange={(e) => setQComments((prev) => ({ ...prev, [q.id]: e.target.value }))}
                        placeholder="Escribe un comentario para esta respuesta..."
                        rows={3}
                        style={{ width: "100%", fontFamily: "Outfit, sans-serif", fontSize: 13, background: C.paper2, border: `1px solid ${C.line}`, borderRadius: 8, padding: "10px 12px", color: C.ink, resize: "vertical", boxSizing: "border-box" }}
                      />
                    </div>
                  )}
                </div>
              );
            })}

            {devQs.length > 0 && (
              <div style={{ ...S.card, marginBottom: 16 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: C.ink, marginBottom: 12 }}>Corrección global</div>
                <div style={{ fontSize: 11, color: C.muted, marginBottom: 6 }}>Comentario global:</div>
                <textarea
                  value={quizGlobal}
                  onChange={(e) => setQuizGlobal(e.target.value)}
                  placeholder="Comentario general sobre el cuestionario..."
                  rows={3}
                  style={{ width: "100%", fontFamily: "Outfit, sans-serif", fontSize: 13, background: C.paper2, border: `1px solid ${C.line}`, borderRadius: 8, padding: "10px 12px", color: C.ink, resize: "vertical", boxSizing: "border-box", marginBottom: 12 }}
                />
                <div style={{ ...S.row, gap: 12, alignItems: "center" }}>
                  <label style={{ fontSize: 13, color: C.muted }}>Puntuación total (0–10):</label>
                  <input
                    type="number" min={0} max={10} step={0.5}
                    value={quizScore}
                    onChange={(e) => setQuizScore(e.target.value)}
                    style={{ width: 80, fontFamily: "Outfit, sans-serif", fontSize: 14, background: C.paper2, border: `1px solid ${C.line}`, borderRadius: 8, padding: "6px 10px", color: C.ink, textAlign: "center" }}
                  />
                </div>
              </div>
            )}

            <button
              onClick={handleSaveQuiz}
              disabled={devQs.length === 0}
              style={{ ...S.btnPrimary, width: "100%", padding: 14, borderRadius: 12, marginBottom: 8, opacity: devQs.length === 0 ? 0.4 : 1 }}
            >
              {tc?.corrected ? "Actualizar corrección" : "Guardar corrección"}
            </button>
            <button onClick={onBack} style={{ ...S.btn, width: "100%", padding: 14, borderRadius: 12 }}>{backLabel}</button>
          </div>
        </div>
      );
    }

    // Student mode
    return (
      <div style={S.app}>
        <div style={S.page}>
          <button onClick={onBack} style={{ ...S.btn, marginBottom: 24, fontSize: 12, padding: "6px 12px" }}>{backLabel}</button>
          <h1 style={{ ...S.h1, marginBottom: 20 }}>Corrección: {exercise.title}</h1>

          <div style={{ ...S.card, textAlign: "center", marginBottom: 20 }}>
            {tc?.corrected && tc?.totalScore != null ? (
              <>
                <div style={{ fontSize: 64, fontWeight: 900, color: scoreColor(tc.totalScore * 10), lineHeight: 1 }}>{tc.totalScore}<span style={{ fontSize: 28 }}>/10</span></div>
                <div style={{ color: C.muted, fontSize: 13, marginTop: 4 }}>Puntuación del profesor</div>
                {sc != null && <div style={{ color: C.muted, fontSize: 12, marginTop: 8 }}>{correctN} de {testQs.length} preguntas test correctas ({sc}% automático)</div>}
              </>
            ) : sc != null ? (
              <>
                <div style={{ fontSize: 64, fontWeight: 900, color: col, lineHeight: 1 }}>{sc}%</div>
                <div style={{ color: C.muted, fontSize: 14, marginTop: 4 }}>{correctN} de {testQs.length} {testQs.length === 1 ? "pregunta" : "preguntas"} correctas</div>
                <div style={{ fontSize: 14, marginTop: 12, color: col }}>
                  {sc >= 80 ? "Excelente análisis." : sc >= 50 ? "Bien, pero hay margen de mejora." : "Sigue practicando."}
                </div>
              </>
            ) : (
              <div style={{ color: C.muted, lineHeight: 1.6 }}>
                {devQs.length > 0
                  ? <>Respuestas enviadas al profesor para revisión.<br /><span style={{ fontSize: 12 }}>Las preguntas de desarrollo se corrigen manualmente.</span></>
                  : "Sin puntuación automática."}
              </div>
            )}
          </div>

          {questions.map((q, idx) => {
            const studentAnswer = result.answers?.[q.id];
            const isCorrect = q.type === "test" && studentAnswer === q.correctOptionId;
            const isWrong   = q.type === "test" && !!studentAnswer && studentAnswer !== q.correctOptionId;
            const teacherComment = tc?.corrected ? tc?.questionComments?.[q.id] : null;
            return (
              <div key={q.id} style={{ ...S.card, border: q.type !== "test" ? `1px solid ${C.line}` : `1.5px solid ${isCorrect ? C.fnT : isWrong ? C.danger : C.line}` }}>
                <div style={{ ...S.row, gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                  <span style={{ ...S.badge, background: C.line, color: C.muted }}>P{idx + 1}</span>
                  <span style={{ ...S.badge, background: q.type === "test" ? "rgba(63,155,91,0.12)" : "rgba(47,111,184,0.12)", color: q.type === "test" ? C.fnT : C.quiz }}>{q.type === "test" ? "Test" : "Desarrollo"}</span>
                  <span style={{ ...S.badge, background: C.paper2, color: C.muted, fontFamily: FONT_MONO }}>{fmt(q.audioStart)}–{fmt(q.audioEnd)}</span>
                  {q.type === "test" && (
                    <span style={{ ...S.badge, background: isCorrect ? "rgba(63,155,91,0.16)" : isWrong ? "rgba(184,74,58,0.16)" : C.line, color: isCorrect ? C.fnT : isWrong ? C.danger : C.muted }}>
                      {!studentAnswer ? "Sin respuesta" : isCorrect ? "✓ Correcta" : "✗ Incorrecta"}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 14, color: C.ink, marginBottom: 12 }}>{q.text}</div>

                {q.type === "test" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {q.options.map((opt) => {
                      const isPick       = opt.id === studentAnswer;
                      const isCorrectOpt = opt.id === q.correctOptionId;
                      return (
                        <div key={opt.id} style={{
                          ...S.row, gap: 10, padding: "8px 12px", borderRadius: 8,
                          background: isCorrectOpt ? "rgba(63,155,91,0.10)" : isPick && !isCorrectOpt ? "rgba(184,74,58,0.10)" : C.paper2,
                          border:     `1.5px solid ${isCorrectOpt ? C.fnT : isPick && !isCorrectOpt ? C.danger : C.line}`,
                          color:      isCorrectOpt ? C.fnT : isPick && !isCorrectOpt ? C.danger : C.muted,
                        }}>
                          <span style={{ fontFamily: FONT_MONO, fontWeight: 700, fontSize: 12, minWidth: 20 }}>{opt.id}</span>
                          <span style={{ flex: 1, fontSize: 13 }}>{opt.text}</span>
                          {isCorrectOpt && <span style={{ fontSize: 11, fontWeight: 700 }}>✓ Correcta</span>}
                          {isPick && !isCorrectOpt && <span style={{ fontSize: 11, fontWeight: 700 }}>Tu resp.</span>}
                        </div>
                      );
                    })}
                  </div>
                )}

                {q.type === "desarrollo" && (
                  <div>
                    <div style={{ fontSize: 11, color: C.muted, marginBottom: 6 }}>Tu respuesta:</div>
                    <div style={{ background: C.paper2, border: `1px solid ${C.line}`, borderRadius: 8, padding: "10px 12px", fontSize: 14, color: C.ink, whiteSpace: "pre-wrap", minHeight: 40, lineHeight: 1.5 }}>
                      {studentAnswer || <span style={{ color: C.muted2, fontStyle: "italic" }}>Sin respuesta</span>}
                    </div>
                    {teacherComment ? (
                      <div style={{ marginTop: 10, background: "rgba(47,111,184,0.06)", border: `1px solid ${C.quiz}55`, borderRadius: 8, padding: "10px 12px" }}>
                        <div style={{ fontSize: 11, color: C.quiz, fontWeight: 700, marginBottom: 4 }}>Comentario del profesor:</div>
                        <div style={{ fontSize: 13, color: C.ink, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{teacherComment}</div>
                      </div>
                    ) : (
                      <p style={{ fontSize: 11, color: C.muted2, margin: "6px 0 0" }}>Pendiente de revisión por el profesor.</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {tc?.corrected && tc?.globalComment && (
            <div style={{ ...S.card, background: "rgba(47,111,184,0.06)", border: `1px solid ${C.quiz}55`, marginBottom: 8 }}>
              <div style={{ fontSize: 12, color: C.quiz, fontWeight: 700, marginBottom: 6 }}>Comentario global del profesor</div>
              <div style={{ fontSize: 14, color: C.ink, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{tc.globalComment}</div>
            </div>
          )}

          <button onClick={onBack} style={{ ...S.btnPrimary, width: "100%", marginTop: 8, padding: 14, borderRadius: 12 }}>{backLabel}</button>
        </div>
      </div>
    );
  }

  // Modelo interactivo
  const exCategories     = categoriesOf(exercise);
  const resultCategoryId = result.categoryId ?? result.modeId;
  const exCategory       = exCategories.find((m) => m.id === resultCategoryId) || exCategories[0];
  const teacherAns       = answerFor(exercise, exCategory.id);
  const studentAns       = result.intervals;
  const sc               = result.score;
  const col              = scoreColor(sc);
  const pct = (t) => `${(t / dur) * 100}%`;

  return (
    <div style={S.app}>
      <div style={S.page}>
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "Outfit, sans-serif", fontSize: 13, color: "#888", padding: 0, marginBottom: 20 }}>{backLabel}</button>
        <h1 style={{ ...S.h1, marginBottom: 20 }}>Corrección: {exercise.title}</h1>

        {exCategories.length > 1 && (
          <div style={{ marginBottom: 16, color: C.muted, fontSize: 13 }}>
            Categoría: <span style={{ color: C.fnI, fontWeight: 600 }}>{exCategory.name}</span>
          </div>
        )}

        <div style={{ ...S.card, textAlign: "center", marginBottom: 20 }}>
          {sc == null ? (
            <div style={{ color: C.muted }}>Este ejercicio no tiene clave de corrección aún.</div>
          ) : (
            <>
              <div style={{ fontSize: 64, fontWeight: 900, color: col, lineHeight: 1 }}>{sc}%</div>
              <div style={{ color: C.muted, fontSize: 14, marginTop: 4 }}>de acierto · margen ±{margin}s</div>
              <div style={{ fontSize: 14, marginTop: 12, color: col }}>
                {sc >= 80 ? "Excelente análisis armónico." : sc >= 50 ? "Bien, pero hay margen de mejora." : "Sigue practicando."}
              </div>
            </>
          )}
        </div>

        {Array.isArray(result.extras) && result.extras.length > 0 && (
          <div style={{ ...S.card, marginBottom: 20 }}>
            <div style={{ fontSize: 13, color: C.muted, marginBottom: 10 }}>También has practicado:</div>
            {result.extras.map((ex2) => {
              const catId = ex2.categoryId ?? ex2.modeId;
              const m = exCategories.find((mm) => mm.id === catId);
              if (!m) return null;
              return (
                <div key={catId} style={{ ...S.row, justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${C.line}` }}>
                  <span style={{ fontSize: 13, color: C.muted2 }}>{m.name}</span>
                  <ScoreBadge score={ex2.score} />
                </div>
              );
            })}
          </div>
        )}

        {sc != null && (
          <div style={S.card}>
            <div style={{ fontSize: 13, color: C.muted, marginBottom: 12 }}>Comparación visual (margen ±{margin}s aplicado)</div>
            <div style={{ fontSize: 11, ...S.row, gap: 12, marginBottom: 8, flexWrap: "wrap" }}>
              {exCategory.buttons.map((b) => (
                <span key={b.id} style={{ ...S.row, gap: 4 }}>
                  <span style={{ width: 10, height: 10, background: b.color, borderRadius: 2, display: "inline-block" }} />
                  <span style={{ color: C.muted2 }}>{b.id} = {b.name}</span>
                </span>
              ))}
            </div>
            {[{ label: "Clave", ivs: teacherAns }, { label: "Tu respuesta", ivs: studentAns }].map(({ label, ivs }) => (
              <div key={label} style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>{label}</div>
                <div style={{ background: C.paper2, borderRadius: 6, height: 36, position: "relative" }}>
                  {ivs.map((iv, i) => {
                    const b = btnOf(exCategory, iv.fn);
                    return (
                      <div key={i} style={{ position: "absolute", top: "10%", height: "80%", left: pct(iv.start), width: pct(iv.end - iv.start), background: b.color, borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                        {(iv.end - iv.start) / dur > 0.06 && (
                          <span style={{ fontSize: 10, fontWeight: 700, color: textOn(b.color) }}>{iv.fn}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            <div style={{ ...S.row, justifyContent: "space-between", fontSize: 10, color: C.muted2 }}>
              {Array.from({ length: Math.floor(dur / 5) + 1 }, (_, i) => i * 5).map((t) => <span key={t}>{fmt(t)}</span>)}
            </div>
          </div>
        )}

        <button onClick={onBack} style={{ ...S.btnPrimary, width: "100%", marginTop: 8, padding: 14, borderRadius: 12 }}>
          {backLabel}
        </button>
      </div>
    </div>
  );
}

// Vista del alumno para ejercicios tipo "cuestionario"
function QuestionnaireView({ exercise, onSubmit, onBack, modelToggleNode = null, sharedAudioPlayer = null, loopRegionRef: externalLoopRef = null }) {
  const dur       = exercise.duration;
  const questions = questionsOf(exercise);

  const [answers,        setAnswers]        = useState({});
  const [expandedId,     setExpandedId]     = useState(null);
  const [lockedQuestion, setLockedQuestion] = useState(null);
  const [localWaveformData, setLocalWaveformData] = useState(exercise.waveformData || null);
  const waveformData = sharedAudioPlayer?.waveformData ?? localWaveformData;

  // Ref de bucle: usa el externo (del padre) si está disponible, para que el
  // reproductor compartido vea los cambios de fragmento bloqueado
  const ownLoopRegionRef = useRef(null);
  const loopRegionRef    = externalLoopRef || ownLoopRegionRef;
  loopRegionRef.current  = lockedQuestion;   // sincronizado cada render

  const localOnWaveform = (!sharedAudioPlayer && !exercise.waveformData) ? (wd) => setLocalWaveformData(wd) : null;
  const localPlayer = useAudioPlayer(
    sharedAudioPlayer ? { id: exercise.id, duration: exercise.duration, audioUrl: null } : exercise,
    { onWaveform: localOnWaveform, loopRegionRef: sharedAudioPlayer ? null : loopRegionRef }
  );
  const {
    time, playing, audioReady, audioError, hasAudio,
    timeRef, togglePlay, seekTo, playFrom, scrubBegin, scrubTo, scrubEnd, audioDuration,
  } = sharedAudioPlayer || localPlayer;

  const selectQuestion = (q) => { setLockedQuestion(q); setExpandedId(q.id); seekTo(q.audioStart); };
  const unlockAudio    = ()  => { setLockedQuestion(null); };
  // playFrom queda disponible si más adelante se quiere un botón "escuchar este fragmento" desde la card de pregunta.
  // eslint-disable-next-line no-unused-vars
  const _playFromAvailable = playFrom;

  const answeredCount = questions.filter((q) => answers[q.id] !== undefined && answers[q.id] !== "").length;

  const handleSubmit = () => {
    const score = calcQuestionnaireScore(questions, answers);
    onSubmit({ type: "cuestionario", answers, score });
  };

  const questionRegion = lockedQuestion
    ? { start: lockedQuestion.audioStart, end: lockedQuestion.audioEnd, color: C.quiz }
    : null;

  if (questions.length === 0) {
    return (
      <div style={S.app}>
        <SessionHeader exercise={exercise} onBack={onBack} modelId="cuestionario" />
        <div style={S.page}>
          <div style={{ ...S.card, textAlign: "center", color: C.muted, padding: "3rem 1rem", lineHeight: 1.8, borderRadius: 16 }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
            <div>Este ejercicio aún no tiene preguntas configuradas.</div>
            <div style={{ fontSize: 13 }}>El profesor las añadirá pronto.</div>
          </div>
        </div>
      </div>
    );
  }

  const allAnswered = answeredCount === questions.length;

  return (
    <div style={S.app} onMouseDown={() => { if (lockedQuestion) unlockAudio(); }}>
      <SessionHeader exercise={exercise} onBack={onBack} modelId="cuestionario" />
      <div style={{ maxWidth: 980, margin: "0 auto", padding: "16px 16px 24px" }}>

        {modelToggleNode}

        {hasAudio && !audioReady && !audioError && <AudioLoadingOverlay />}
        {audioError && <div style={{ textAlign: "center", color: C.danger, fontSize: 12, marginBottom: 10 }}>{audioError}</div>}

        <SessionHint modelId="cuestionario" />

        <section style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 16, padding: "14px 14px 12px", marginBottom: 12 }}>
          <div style={{ background: C.paper2, borderRadius: 10, overflow: "hidden", border: `1px solid ${C.line}`, marginBottom: 8 }}>
            <WaveformDisplay time={time} timeRef={timeRef} duration={dur} waveformDuration={audioDuration} allIntervals={[]}
              exerciseId={exercise.id} waveformData={waveformData}
              colorByFn={{}} questionRegion={questionRegion}
              onScrubBegin={scrubBegin} onScrubTo={scrubTo} onScrubEnd={scrubEnd} />
          </div>

          {/* Minimapa de preguntas — toca un bloque para saltar a su fragmento */}
          <div style={{ position: "relative", height: 30, marginBottom: 4, background: C.paper2, borderRadius: 6, border: `1px solid ${C.line}`, overflow: "hidden", userSelect: "none" }}>
            {questions.map((q, idx) => {
              const isLock = lockedQuestion?.id === q.id;
              const answered = answers[q.id] !== undefined && answers[q.id] !== "";
              return (
                <div key={q.id}
                  onMouseDown={(e) => e.stopPropagation()} onClick={() => selectQuestion(q)}
                  title={`P${idx + 1}: ${fmt(q.audioStart)} – ${fmt(q.audioEnd)}`}
                  style={{ position: "absolute", top: 3, bottom: 3, left: `${(q.audioStart / dur) * 100}%`, width: `${Math.max(0, (q.audioEnd - q.audioStart) / dur) * 100}%`, background: answered ? C.fnT : C.quiz, opacity: isLock ? 1 : 0.5, borderRadius: 3, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", border: isLock ? `1.5px solid rgba(255,255,255,0.9)` : "none", boxSizing: "border-box", overflow: "hidden" }}>
                  <span style={{ fontSize: 8, color: "#fff", fontWeight: 700, fontFamily: F.sans, pointerEvents: "none" }}>{idx + 1}</span>
                </div>
              );
            })}
            <div style={{ position: "absolute", top: 0, bottom: 0, left: `${(time / dur) * 100}%`, width: 1.5, background: C.ink, opacity: 0.75, pointerEvents: "none" }} />
          </div>

          {lockedQuestion ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center", fontSize: 12, color: C.quiz, margin: "8px 0", flexWrap: "wrap" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, background: `${C.quiz}12`, borderRadius: 999, padding: "4px 12px", fontWeight: 600 }}>
                🔒 Fragmento {fmt(lockedQuestion.audioStart)} – {fmt(lockedQuestion.audioEnd)} · bucle
              </span>
              <button onClick={unlockAudio} className="fa-pressable" style={{ ...S.btn, padding: "4px 12px", fontSize: 11 }}>Liberar</button>
            </div>
          ) : <div style={{ height: 8 }} />}

          <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 12, paddingTop: 10, borderTop: `1px solid ${C.line}` }}>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <CircleButton onClick={() => seekTo(lockedQuestion ? lockedQuestion.audioStart : 0)} title="Volver al inicio">⏮</CircleButton>
            </div>
            <CircleButton onClick={togglePlay} disabled={hasAudio && !audioReady && !audioError}
              primary size={52} title={playing ? "Pausa (Espacio)" : "Reproducir (Espacio)"}>
              {playing ? "❚❚" : "▶"}
            </CircleButton>
            <div style={{ textAlign: "right", fontFamily: F.sans, fontVariantNumeric: "tabular-nums", fontSize: 22, fontWeight: 600, color: C.ink, letterSpacing: -0.5 }}>
              {fmt(time)}<span style={{ color: C.muted, fontWeight: 400 }}>/{fmt(dur)}</span>
            </div>
          </div>
        </section>

        {questions.map((q, idx) => {
          const isExpanded = expandedId === q.id;
          const isLocked   = lockedQuestion?.id === q.id;
          const answered   = answers[q.id] !== undefined && answers[q.id] !== "";
          return (
            <div key={q.id} onMouseDown={(e) => e.stopPropagation()}
              style={{ background: C.paper, border: isLocked ? `1.5px solid ${C.quiz}` : `1px solid ${C.line}`, borderRadius: 12, marginBottom: 8, padding: "14px 16px", transition: "border-color .15s" }}>
              <div style={{ cursor: "pointer" }}
                onClick={() => { if (isExpanded) setExpandedId(null); else selectQuestion(q); }}>
                {/* Fila de metadatos — número + estado + chevron */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 22, height: 22, borderRadius: "50%", background: answered ? C.fnT : `${C.quiz}1A`, color: answered ? C.paper : C.quiz, fontFamily: F.sans, fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                    {answered ? "✓" : idx + 1}
                  </span>
                  <span style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 500, color: C.muted }}>
                    {q.type === "test" ? "Opción múltiple" : "Respuesta abierta"} · {fmt(q.audioStart)}–{fmt(q.audioEnd)}
                  </span>
                  <div style={{ marginLeft: "auto" }}><Chevron open={isExpanded} /></div>
                </div>
                {/* Texto de la pregunta — serif grande */}
                <div style={{ fontFamily: F.serif, fontSize: 20, fontWeight: 600, letterSpacing: "-0.01em", lineHeight: 1.35, color: C.ink }}>{q.text}</div>
              </div>

              {isExpanded && (
                <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${C.line}` }}>
                  {q.type === "test" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                      {q.options.map((opt) => {
                        const isSel = answers[q.id] === opt.id;
                        return (
                          <button key={opt.id} className="fa-pressable"
                            onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: opt.id }))}
                            style={{ background: isSel ? C.ink : C.bg, color: isSel ? "#fff" : C.ink, border: `1.5px solid ${isSel ? C.ink : C.line}`, borderRadius: 10, padding: "12px 14px", cursor: "pointer", textAlign: "left", fontSize: 13.5, lineHeight: 1.4, display: "flex", alignItems: "center", gap: 12 }}>
                            <span style={{ fontFamily: F.sans, fontWeight: 700, fontSize: 12, color: isSel ? "rgba(255,255,255,0.6)" : C.muted, minWidth: 18, flexShrink: 0 }}>{opt.id}</span>
                            {opt.text}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {q.type === "desarrollo" && (
                    <textarea style={{ ...S.input, minHeight: 96, resize: "vertical", lineHeight: 1.5, fontSize: 14 }}
                      placeholder="Escribe tu respuesta aquí…"
                      value={answers[q.id] || ""}
                      onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                      onClick={(e) => e.stopPropagation()} />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <StickyActionBar
        info={
          <>
            <span style={{ fontFamily: F.sans, fontSize: 13, fontWeight: 600, color: allAnswered ? C.fnT : C.ink }}>
              {answeredCount} / {questions.length} {allAnswered ? "· completo" : "respondidas"}
            </span>
            <div style={{ height: 4, background: C.line, borderRadius: 2, overflow: "hidden", marginTop: 3, maxWidth: 160 }}>
              <div style={{ height: "100%", width: `${questions.length ? (answeredCount / questions.length) * 100 : 0}%`, background: allAnswered ? C.fnT : C.quiz, borderRadius: 2, transition: "width .3s" }} />
            </div>
          </>
        }>
        <BarSubmitButton onClick={handleSubmit} accent={C.quiz}>Entregar</BarSubmitButton>
      </StickyActionBar>
    </div>
  );
}

// ═══ 11. DASHBOARD DEL PROFESOR ═════════════════════════════════════════════

// ── Pestaña: Ejercicios ────────────────────────────────────────────────────
function TeacherExerciseRow({ ex, onSelect, onDelete, onToggleVisibility, composerName }) {
  const [open, setOpen] = useState(false);
  const meta    = modelMeta(ex);
  const exModels= modelsOf(ex);
  const isQuiz  = modelOf(ex) === "cuestionario";
  const isSchema= modelOf(ex) === "esquema";
  const exQs    = questionsOf(ex);
  const allBtns = categoriesOf(ex).flatMap((c) => c.buttons || []);
  const { recorded, total } = (isQuiz || isSchema) ? { recorded: 0, total: 0 } : answerStats(ex);
  const keyReady = isQuiz ? exQs.length > 0 : isSchema ? true : (recorded === total && total > 0);
  const isHidden = !!ex.hidden;

  return (
    <div style={{ display: "flex", flex: 1, minWidth: 0, background: C.paper, border: `1px solid ${C.line}`, borderRadius: 8, overflow: "hidden", opacity: isHidden ? 0.55 : 1, transition: "opacity .2s" }}>
      {exModels.length > 1 ? (
        <div style={{ width: 5, flexShrink: 0, display: "flex", flexDirection: "column" }}>
          <div style={{ flex: 1, background: MODEL_META[exModels[0]]?.color || meta.color }} />
          <div style={{ flex: 1, background: MODEL_META[exModels[1]]?.color || meta.color }} />
        </div>
      ) : (
        <div style={{ width: 5, flexShrink: 0, background: meta.color }} />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div onClick={() => setOpen((o) => !o)}
          style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", cursor: "pointer", userSelect: "none" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: F.sans, fontSize: 15, fontWeight: 500, color: isHidden ? C.muted : C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ex.title}</div>
            {composerName && (
              <div style={{ fontSize: 11, color: C.fnS, fontWeight: 500, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{composerName}</div>
            )}
          </div>
          {isHidden && <span style={{ fontSize: 10, color: C.muted, fontFamily: FONT_SANS, fontWeight: 600, letterSpacing: "0.08em", flexShrink: 0 }}>OCULTO</span>}
          <Chevron open={open} />
          <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <EyeButton visible={!isHidden} onClick={() => onToggleVisibility(ex)} />
            <GhostButton onClick={() => onSelect(ex.id)}>Editar</GhostButton>
          </div>
        </div>
        {open && (
          <div style={{ borderTop: `1px solid ${C.line}`, padding: "10px 14px 12px", display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: "12px 24px", background: C.bg }}>
            <MetaItem label="Tipo"><span style={{ width: 7, height: 7, borderRadius: "50%", background: meta.color }} />{meta.label}</MetaItem>
            <MetaItem label="Duración">{fmt(ex.duration)}</MetaItem>
            {isQuiz ? <MetaItem label="Preguntas">{exQs.length || "—"}</MetaItem>
              : allBtns.length > 0 && <MetaItem label="Categorías"><CategoryDots buttons={allBtns} /></MetaItem>}
            <MetaItem label="Clave de corrección">
              <StatusCircle done={keyReady} size={13} />
              <span style={{ color: keyReady ? C.ink : C.muted }}>{keyReady ? "Configurada" : "Pendiente"}</span>
            </MetaItem>
            <MetaItem label="Visible para alumnos">
              <span style={{ color: isHidden ? C.danger : C.fnT }}>{isHidden ? "No" : "Sí"}</span>
            </MetaItem>
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
              <DangerOutlineButton onClick={() => onDelete(ex)}>Eliminar</DangerOutlineButton>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ExercisesTab({ exercises, audioLibrary = [], onNew, onSelect, onToggleVisibility, askConfirm, onDelete }) {
  const [filterModel,     setFilterModel]     = useState("all");
  const [filterComposers, setFilterComposers] = useState([]);
  const [filterTags,      setFilterTags]      = useState([]);

  // Derivar compositores y etiquetas únicas de la biblioteca de audios
  const allComposers = useMemo(
    () => [...new Set(audioLibrary.map((a) => a.composer).filter(Boolean))].sort(),
    [audioLibrary]
  );
  const allTags = useMemo(
    () => [...new Set(audioLibrary.flatMap((a) => a.tags || []).filter(Boolean))].sort(),
    [audioLibrary]
  );
  // Mapa rápido URL → audio
  const audioByUrl = useMemo(() => {
    const m = {};
    audioLibrary.forEach((a) => { if (a.url) m[a.url] = a; });
    return m;
  }, [audioLibrary]);

  const filtered = useMemo(() => {
    return exercises.filter((ex) => {
      if (filterModel !== "all" && !modelsOf(ex).includes(filterModel)) return false;
      if (filterComposers.length > 0 || filterTags.length > 0) {
        const audio = ex.audioUrl ? audioByUrl[ex.audioUrl] : null;
        if (filterComposers.length > 0 && (!audio || !filterComposers.includes(audio.composer))) return false;
        if (filterTags.length > 0) {
          const audioTags = audio?.tags || [];
          if (!filterTags.every((t) => audioTags.includes(t))) return false;
        }
      }
      return true;
    })
    // Los ejercicios ocultos se muestran siempre por debajo de los visibles
    // (orden estable: conservan su orden relativo dentro de cada grupo).
    .sort((a, b) => (a.hidden ? 1 : 0) - (b.hidden ? 1 : 0));
  }, [exercises, filterModel, filterComposers, filterTags, audioByUrl]);

  const hasFilters = filterModel !== "all" || filterComposers.length > 0 || filterTags.length > 0;
  const showFilterBar = exercises.length > 0 && (allComposers.length > 0 || allTags.length > 0 || true);

  return (
    <>
      <div style={{ marginBottom: 14 }}>
        <CtaButton onClick={onNew}>+ Nuevo ejercicio</CtaButton>
      </div>
      {showFilterBar && (
        <TeacherFilterBar
          filterModel={filterModel}       setFilterModel={setFilterModel}
          allComposers={allComposers}     filterComposers={filterComposers} setFilterComposers={setFilterComposers}
          allTags={allTags}               filterTags={filterTags}           setFilterTags={setFilterTags}
        />
      )}
      {exercises.length === 0
        ? <p style={{ color: C.muted, fontFamily: F.sans, textAlign: "center", padding: "3rem 1rem" }}>Aún no hay ejercicios.</p>
        : filtered.length === 0
          ? <p style={{ color: C.muted, fontFamily: F.sans, textAlign: "center", padding: "2rem 1rem" }}>
              Ningún ejercicio coincide con los filtros.{" "}
              <button onClick={() => { setFilterModel("all"); setFilterComposers([]); setFilterTags([]); }}
                style={{ background: "none", border: "none", color: C.fnS, cursor: "pointer", fontSize: 13, textDecoration: "underline", padding: 0 }}>
                Limpiar filtros
              </button>
            </p>
          : <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {filtered.map((ex) => (
                <TeacherExerciseRow key={ex.id} ex={ex} onSelect={onSelect}
                  composerName={ex.audioUrl ? (audioByUrl[ex.audioUrl]?.composer || null) : null}
                  onToggleVisibility={onToggleVisibility}
                  onDelete={(e) => askConfirm(`¿Eliminar "${e.title}"?`, () => onDelete(e.id))} />
              ))}
            </div>}
    </>
  );
}

// ── Pestaña: Cursos ────────────────────────────────────────────────────────
function CoursesTab({
  courses, units, exercises, groups = [],
  openUnitIds, setOpenUnitIds,
  onCreateCourse, onEditCourse, onDeleteCourse, onUpdateCourse,
  onCreateUnit, onEditUnit, onDeleteUnit, onUpdateUnit,
  onPickFromBank, onCreateNewExInUnit, onRemoveExFromUnit,
  onSelectExercise,
  askConfirm,
}) {
  const isMobile = useIsMobile();
  const [openCourseIds, setOpenCourseIds] = useState(() => new Set(courses.map((c) => c.id)));
  const toggleCourse = (id) => setOpenCourseIds((s) => toggleInSet(s, id));
  const toggleUnit   = (id) => setOpenUnitIds((s) => toggleInSet(s, id));

  return (
    <>
      <div style={{ marginBottom: 20 }}>
        <CtaButton onClick={onCreateCourse}>+ Nuevo curso</CtaButton>
      </div>

      {courses.length === 0
        ? <p style={{ color: C.muted, fontFamily: F.sans, textAlign: "center", padding: "3rem 1rem" }}>Aún no hay cursos. Crea el primero para organizar tus ejercicios.</p>
        : courses.map((course) => {
            const courseUnits = units.filter((u) => course.unitIds.includes(u.id));
            const courseOpen  = openCourseIds.has(course.id);

            return (
              <div key={course.id} style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 10, overflow: "hidden", marginBottom: 20 }}>
                {/* Cabecera del curso */}
                <div onClick={() => toggleCourse(course.id)} style={{ cursor: "pointer", userSelect: "none", padding: isMobile ? "16px 16px" : "20px 24px", borderBottom: courseOpen ? `1px solid ${C.line}` : "none" }}>
                  <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", alignItems: isMobile ? "stretch" : "center", justifyContent: "space-between", gap: isMobile ? 12 : 16 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: course.description ? 6 : 0, flexWrap: "wrap" }}>
                        <span style={{ fontFamily: F.serif, fontSize: isMobile ? 22 : 28, fontWeight: 600, letterSpacing: "-0.01em", lineHeight: 1.05, wordBreak: "break-word" }}>{course.name}</span>
                        <Chevron open={courseOpen} rotate90WhenClosed size={14} />
                        {(() => {
                          const vis = course.visibility || "teacher";
                          if (vis === "public")  return <span style={{ ...S.badge, background: "rgba(63,155,91,0.12)", color: C.fnT, fontSize: 10 }}>Público</span>;
                          if (vis === "group") {
                            const g = groups.find((x) => x.id === course.visibilityGroupId);
                            return <span style={{ ...S.badge, background: "rgba(47,111,184,0.10)", color: C.quiz, fontSize: 10 }}>{g ? g.name : "Grupo"}</span>;
                          }
                          return <span style={{ ...S.badge, background: C.line, color: C.muted, fontSize: 10 }}>Mis alumnos</span>;
                        })()}
                      </div>
                      {course.description && <div style={{ fontFamily: F.sans, fontSize: 13, color: "#888" }}>{course.description}</div>}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                      <EyeButton visible={!course.hidden} onClick={() => onUpdateCourse({ ...course, hidden: !course.hidden })} />
                      <GhostButton onClick={() => onEditCourse(course)}>Editar</GhostButton>
                      <DangerOutlineButton onClick={() => askConfirm(`¿Eliminar el curso "${course.name}"?\n\nLas unidades y ejercicios no se eliminarán.`, () => onDeleteCourse(course.id))}>Eliminar</DangerOutlineButton>
                    </div>
                  </div>
                </div>

                {/* Unidades — riel tipográfico */}
                {courseOpen && (
                  <div style={{ padding: isMobile ? "16px 0 18px 14px" : "20px 0 24px 24px" }}>
                    {courseUnits.length === 0
                      ? <p style={{ fontFamily: F.sans, color: C.muted, fontSize: 13, margin: 0, paddingRight: isMobile ? 14 : 24 }}>Este curso no tiene unidades todavía.</p>
                      : courseUnits.map((unit, unitIdx) => {
                          const isOpen     = openUnitIds.has(unit.id);
                          const isLast     = unitIdx === courseUnits.length - 1;
                          const unitNum    = String(unitIdx + 1).padStart(2, "0");
                          const unitExs    = unit.exerciseIds.map((id) => exercises.find((e) => e.id === id)).filter(Boolean);
                          const railW      = isMobile ? 40 : 52;
                          const numW       = isMobile ? 30 : 36;

                          return (
                            <div key={unit.id} style={{ display: "flex", marginBottom: isLast ? 0 : 28 }}>
                              {/* Riel */}
                              <div style={{ width: railW, flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center" }}>
                                <div style={{ width: numW, height: numW, borderRadius: "50%", background: C.ink, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: F.serif, fontSize: isMobile ? 14 : 17, fontWeight: 600 }}>{unitNum}</div>
                                {(!isLast || isOpen) && <div style={{ width: 1, flex: 1, background: C.rail, marginTop: 6 }} />}
                              </div>
                              {/* Contenido */}
                              <div style={{ flex: 1, paddingTop: 5, minWidth: 0 }}>
                                <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", alignItems: isMobile ? "stretch" : "center", gap: isMobile ? 8 : 10, marginBottom: isOpen ? 12 : 0, paddingRight: isMobile ? 12 : 20 }}>
                                  <div onClick={() => toggleUnit(unit.id)} style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 6, cursor: "pointer", userSelect: "none", fontFamily: F.serif, fontSize: isMobile ? 18 : 22, fontWeight: 600, letterSpacing: "-0.01em" }}>
                                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{unit.name}</span>
                                    <Chevron open={isOpen} rotate90WhenClosed />
                                    <span style={{ fontFamily: F.sans, fontSize: 12, fontWeight: 400, color: C.muted, marginLeft: 2, flexShrink: 0 }}>{unit.exerciseIds.length} {unit.exerciseIds.length === 1 ? "ej." : "ejs."}</span>
                                  </div>
                                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                                    <EyeButton visible={!unit.hidden} onClick={() => onUpdateUnit({ ...unit, hidden: !unit.hidden })} />
                                    <GhostButton onClick={() => onEditUnit(unit)}>Editar</GhostButton>
                                    <DangerOutlineButton onClick={() => askConfirm(`¿Eliminar la unidad "${unit.name}"?\n\nLos ejercicios no se eliminarán del banco global.`, () => onDeleteUnit(unit.id, course.id))}>Eliminar</DangerOutlineButton>
                                  </div>
                                </div>

                                {isOpen && (
                                  <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                                    {unitExs.length === 0
                                      ? <p style={{ fontFamily: F.sans, fontSize: 12, color: C.muted, margin: "2px 0" }}>No hay ejercicios en esta unidad.</p>
                                      : unitExs.map((ex) => {
                                          const meta = modelMeta(ex);
                                          const isQuiz = modelOf(ex) === "cuestionario";
                                          const exQs = questionsOf(ex);
                                          const { recorded, total } = isQuiz ? { recorded: 0, total: 0 } : answerStats(ex);
                                          const keyReady = isQuiz ? exQs.length > 0 : (recorded === total && total > 0);
                                          return (
                                            <div key={ex.id} style={{ display: "flex", alignItems: "flex-start", marginLeft: -railW }}>
                                              <div style={{ width: railW, flexShrink: 0, display: "flex", justifyContent: "center", paddingTop: 13 }}>
                                                <StatusCircle done={keyReady} />
                                              </div>
                                              <div style={{ display: "flex", flex: 1, minWidth: 0, background: C.paper, border: `1px solid ${C.line}`, borderRadius: 8, overflow: "hidden" }}>
                                                <div style={{ width: 5, flexShrink: 0, background: meta.color }} />
                                                <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: isMobile ? "column" : "row", alignItems: isMobile ? "stretch" : "center", gap: isMobile ? 8 : 10, padding: isMobile ? "10px 12px" : "10px 14px" }}>
                                                  <span style={{ flex: 1, minWidth: 0, fontFamily: F.sans, fontSize: 14, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: "pointer" }}
                                                    onClick={() => onSelectExercise(ex.id)}>{ex.title}</span>
                                                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                                                    <GhostButton onClick={() => onSelectExercise(ex.id)}>Editar</GhostButton>
                                                    <DangerOutlineButton onClick={() => askConfirm(`¿Quitar "${ex.title}" de esta unidad?\n\nEl ejercicio permanecerá en el banco global.`, () => onRemoveExFromUnit(unit.id, ex.id))}>Quitar</DangerOutlineButton>
                                                  </div>
                                                </div>
                                              </div>
                                            </div>
                                          );
                                        })}
                                    <div style={{ display: "flex", gap: 8, paddingTop: 4 }}>
                                      <GhostButton onClick={() => onPickFromBank(unit.id)}>+ Del banco</GhostButton>
                                      <GhostButton onClick={() => onCreateNewExInUnit(unit.id)}>+ Nuevo ejercicio</GhostButton>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}

                    {/* Nueva unidad — nivel del riel */}
                    <div style={{ paddingTop: courseUnits.length ? 24 : 0, paddingRight: 24 }}>
                      <GhostButton onClick={() => onCreateUnit(course.id)}>+ Nueva unidad didáctica</GhostButton>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
    </>
  );
}

// ── Pestaña: Alumnos ──────────────────────────────────────────────────────
function StudentsTab({ students, exercises, results, groups, onAddStudent, onResetCred, onRemove, askConfirm, onViewAnswer, onEditGroup, onDeleteGroup }) {
  const [expandedStudents, setExpandedStudents] = useState(new Set());
  const toggleExpand = (id) =>
    setExpandedStudents((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const renderStudentCard = (s) => {
    const sRes      = results[s.id] || {};
    const isOpen    = expandedStudents.has(s.id);
    const doneCount = exercises.filter((ex) => sRes[ex.id]).length;
    return (
      <div key={s.id} style={S.card}>
        <div style={{ ...S.row, justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>{s.displayName}</div>
            <div style={{ ...S.row, gap: 6, flexWrap: "wrap" }}>
              <span style={{ ...S.badge, background: C.paper2, color: C.muted, fontFamily: FONT_MONO, fontSize: 10 }}>@{s.username}</span>
              <span style={{ ...S.badge, background: s.credType === "pin" ? "rgba(47,111,184,0.12)" : "rgba(63,155,91,0.10)", color: s.credType === "pin" ? C.quiz : C.fnT }}>
                {s.credType === "pin" ? "PIN" : "Contraseña"}
              </span>
              {exercises.length > 0 && (
                <span style={{ ...S.badge, background: C.line, color: C.muted, fontSize: 10 }}>
                  {doneCount}/{exercises.length} ejs.
                </span>
              )}
            </div>
          </div>
          <div style={{ ...S.row, gap: 6, flexShrink: 0, flexWrap: "wrap" }}>
            {exercises.length > 0 && (
              <button onClick={() => toggleExpand(s.id)} style={{ ...S.btn, fontSize: 12, padding: "5px 11px" }}>
                {isOpen ? "▲ Ocultar" : "▼ Ejercicios"}
              </button>
            )}
            <button onClick={() => onResetCred(s)} style={{ ...S.btn, fontSize: 12, padding: "5px 11px" }}>Resetear</button>
            <button onClick={() => askConfirm(`¿Eliminar al alumno "${s.displayName}"?\n\nSe borrarán también todas sus respuestas guardadas.`, () => onRemove(s.id))} style={S.btnDanger}>Eliminar</button>
          </div>
        </div>

        {isOpen && exercises.length > 0 && (
          <div style={{ marginTop: 12, borderTop: `1px solid ${C.line}`, paddingTop: 12 }}>
            {exercises.map((ex) => {
              const r = sRes[ex.id];
              const needsCorrection = r && !r.teacherCorrection?.corrected && (
                r.type === "esquema" ||
                (r.type === "cuestionario" && questionsOf(ex).some((q) => q.type === "desarrollo"))
              );
              return (
                <div key={ex.id} style={{ ...S.row, justifyContent: "space-between", paddingBottom: 6, borderBottom: `1px solid ${C.line}`, marginBottom: 6 }}>
                  <span style={{ fontSize: 13, color: C.muted2, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingRight: 8 }}>{ex.title}</span>
                  <div style={{ ...S.row, gap: 6, flexShrink: 0 }}>
                    {needsCorrection && (
                      <span style={{ ...S.badge, background: "rgba(212,120,0,0.12)", color: "#d47800", fontSize: 10 }}>Pendiente</span>
                    )}
                    {r ? <ScoreBadge score={r.score} /> : <span style={{ ...S.badge, background: C.line, color: C.muted2 }}>—</span>}
                    {r && (
                      <button onClick={() => onViewAnswer(s, ex, r)} style={{ ...S.btn, fontSize: 11, padding: "2px 9px", color: C.fnS, borderColor: C.fnS }}>Ver</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const assignedStudentIds = new Set(groups.flatMap((g) => g.studentIds || []));
  const ungrouped = students.filter((s) => !assignedStudentIds.has(s.id));

  return (
    <>
      <div style={{ ...S.row, justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
        <p style={{ color: C.muted, fontSize: 13, margin: 0 }}>
          {students.length} {students.length === 1 ? "alumno" : "alumnos"} · {groups.length} {groups.length === 1 ? "grupo" : "grupos"}
        </p>
        <div style={{ ...S.row, gap: 8 }}>
          <button onClick={() => onEditGroup(null)} style={S.btn}>+ Nuevo grupo</button>
          <button onClick={onAddStudent} style={S.btnPrimary}>+ Crear alumno</button>
        </div>
      </div>

      {students.length === 0 && groups.length === 0 && (
        <div style={{ ...S.card, textAlign: "center", color: C.muted, padding: "2rem 1rem", lineHeight: 1.8 }}>
          <div>Aún no hay alumnos.</div>
          <div style={{ fontSize: 13 }}>Crea el primero con el botón de arriba.</div>
        </div>
      )}

      {groups.map((group) => {
        const groupStudents = students.filter((s) => (group.studentIds || []).includes(s.id));
        return (
          <div key={group.id} style={{ marginBottom: 28 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, paddingBottom: 10, borderBottom: `2px solid ${C.ink}`, flexWrap: "wrap" }}>
              <span style={{ fontFamily: F.serif, fontSize: 20, fontWeight: 700, flex: 1, minWidth: 120 }}>{group.name}</span>
              <span style={{ fontSize: 12, color: C.muted, flexShrink: 0 }}>{groupStudents.length} {groupStudents.length === 1 ? "alumno" : "alumnos"}</span>
              <button onClick={() => onEditGroup(group)} style={{ ...S.btn, fontSize: 12, padding: "4px 10px" }}>Editar</button>
              <button onClick={() => askConfirm(`¿Eliminar el grupo "${group.name}"?\n\nLos alumnos no se eliminarán.`, () => onDeleteGroup(group.id))} style={{ ...S.btnDanger, fontSize: 12, padding: "4px 10px" }}>Eliminar</button>
            </div>
            {groupStudents.length === 0
              ? <p style={{ color: C.muted, fontSize: 13, margin: 0 }}>Este grupo no tiene alumnos. Edítalo para añadir.</p>
              : groupStudents.map(renderStudentCard)
            }
          </div>
        );
      })}

      {ungrouped.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          {groups.length > 0 && (
            <div style={{ paddingBottom: 10, marginBottom: 12, borderBottom: `2px solid ${C.line}` }}>
              <span style={{ fontFamily: F.serif, fontSize: 20, fontWeight: 700, color: C.muted }}>Sin grupo</span>
            </div>
          )}
          {ungrouped.map(renderStudentCard)}
        </div>
      )}
    </>
  );
}

// ── Pestaña: Categorías ───────────────────────────────────────────────────
function CategoriesTab({ categories, isAdmin, onAdd, onEdit, onDelete, onToggleGlobal, askConfirm }) {
  return (
    <>
      <button onClick={onAdd} style={{ ...S.btnPrimary, marginBottom: 16 }}>+ Crear categoría</button>
      <p style={{ color: C.muted, fontSize: 12, marginTop: -8, marginBottom: 16 }}>
        Las categorías definen los botones del modelo Interactivo. Editar o eliminar una categoría no afecta a los ejercicios ya creados.
      </p>

      {categories.map((m) => {
        const isGlobal = m.builtIn || m.global;
        const canEdit  = isAdmin || !isGlobal;
        const canDel   = isAdmin ? m.id !== "default" : !isGlobal;
        return (
          <div key={m.id} style={S.card}>
            <div style={{ ...S.row, justifyContent: "space-between", marginBottom: 6, gap: 12, flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                <div style={{ ...S.row, gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 600 }}>{m.name}</span>
                  {isGlobal && (
                    <span style={{ ...S.badge, background: "#e8f0fe", color: "#1a56db", border: "1px solid #bfcfef" }}>
                      ⭐ Predeterminada
                    </span>
                  )}
                </div>
                <div style={{ ...S.row, gap: 6, flexWrap: "wrap" }}>
                  {m.buttons.map((b) => (
                    <span key={b.id} style={{ ...S.badge, background: b.color, color: textOn(b.color), fontSize: 10 }}>
                      {b.id} · {b.name} [{b.key.toUpperCase()}]
                    </span>
                  ))}
                </div>
              </div>
              <div style={{ ...S.row, gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                {isAdmin && !m.builtIn && (
                  <button
                    onClick={() => onToggleGlobal(m.id)}
                    title={m.global ? "Quitar de predeterminadas" : "Establecer como predeterminada para todos los profesores"}
                    style={{ ...S.btn, fontSize: 12, color: m.global ? "#1a56db" : C.muted }}
                  >
                    {m.global ? "⭐ Predeterminada" : "☆ Predeterminar"}
                  </button>
                )}
                {canEdit && (
                  <button onClick={() => onEdit(m)} style={S.btn}>Editar</button>
                )}
                {canDel && (
                  <button
                    onClick={() => askConfirm(
                      `¿Eliminar la categoría "${m.name}"?\n\nLos ejercicios que ya la usan conservarán su copia.`,
                      () => onDelete(m.id)
                    )}
                    style={S.btnDanger}
                  >Eliminar</button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}

// ── Pestaña: Audios (almacén) ─────────────────────────────────────────────
function AudiosTab({ audioLibrary, isAdmin, onAdd, onEdit, onDelete, askConfirm }) {
  const [openId,          setOpenId]          = useState(null);
  const [previewId,       setPreviewId]       = useState(null);
  const [filterComposers, setFilterComposers] = useState([]);
  const [filterTags,      setFilterTags]      = useState([]);

  // Opciones únicas para los dropdowns
  const allComposers = useMemo(() =>
    [...new Set(audioLibrary.map((a) => a.composer).filter(Boolean))].sort(),
    [audioLibrary]
  );
  const allTags = useMemo(() =>
    [...new Set(audioLibrary.flatMap((a) => a.tags || []))].sort(),
    [audioLibrary]
  );

  // Lista filtrada
  const filtered = useMemo(() => {
    if (filterComposers.length === 0 && filterTags.length === 0) return audioLibrary;
    return audioLibrary.filter((a) => {
      if (filterComposers.length > 0 && !filterComposers.includes(a.composer)) return false;
      if (filterTags.length > 0) {
        const aTags = a.tags || [];
        if (!filterTags.every((t) => aTags.includes(t))) return false;
      }
      return true;
    });
  }, [audioLibrary, filterComposers, filterTags]);

  const hasFilters = filterComposers.length > 0 || filterTags.length > 0;

  const toggleComposer = (val) => setFilterComposers((p) => p.includes(val) ? p.filter((x) => x !== val) : [...p, val]);
  const toggleTag      = (val) => setFilterTags((p) => p.includes(val) ? p.filter((x) => x !== val) : [...p, val]);

  return (
    <>
      {isAdmin && (
        <button onClick={onAdd} style={{ ...S.btnPrimary, marginBottom: 16 }}>+ Añadir audio</button>
      )}
      {!isAdmin && (
        <p style={{ color: C.muted, fontSize: 13, margin: "0 0 16px" }}>Solo el administrador puede añadir o editar audios del almacén.</p>
      )}

      {/* ── Barra de filtros ── */}
      {audioLibrary.length > 0 && (
        <div style={{ marginBottom: 16, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <FilterDropdown
            label="Compositor"
            options={allComposers}
            selected={filterComposers}
            onToggle={toggleComposer}
            onClear={() => setFilterComposers([])}
            accent="#2F6FB8"
          />
          <FilterDropdown
            label="Etiquetas"
            options={allTags}
            selected={filterTags}
            onToggle={toggleTag}
            onClear={() => setFilterTags([])}
            accent={C.fnI}
          />
          {hasFilters && (
            <button
              onClick={() => { setFilterComposers([]); setFilterTags([]); }}
              style={{ padding: "5px 11px", borderRadius: 20, border: "1.5px solid rgba(184,74,58,0.35)", background: "transparent", color: C.danger, cursor: "pointer", fontFamily: FONT_SANS, fontSize: 12 }}
            >✕ Limpiar</button>
          )}
        </div>
      )}

      {audioLibrary.length === 0 && (
        <div style={{ ...S.card, textAlign: "center", color: C.muted, padding: "2.5rem 1rem", lineHeight: 1.8 }}>
          <div>El almacén está vacío.</div>
          {isAdmin && <div style={{ fontSize: 13 }}>Añade el primer audio con el botón de arriba.</div>}
        </div>
      )}

      {audioLibrary.length > 0 && filtered.length === 0 && (
        <div style={{ ...S.card, textAlign: "center", color: C.muted, padding: "2rem 1rem" }}>
          No hay audios que coincidan con los filtros seleccionados.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {filtered.map((audio) => {
          const isOpen = openId === audio.id;
          const isPrev = previewId === audio.id;
          return (
            <div key={audio.id} style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 8, overflow: "hidden" }}>
              {/* ── Cabecera siempre visible ── */}
              <div
                onClick={() => setOpenId(isOpen ? null : audio.id)}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", cursor: "pointer", userSelect: "none" }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: F.sans, fontSize: 15, fontWeight: 500, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {audio.title}
                  </div>
                  {audio.composer && (
                    <div style={{ fontSize: 11, color: C.fnS, fontWeight: 500, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {audio.composer}
                    </div>
                  )}
                </div>
                <Chevron open={isOpen} />
                <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <button onClick={() => { setPreviewId(isPrev ? null : audio.id); if (!isOpen) setOpenId(audio.id); }}
                    style={{ ...S.btn, padding: "5px 11px", fontSize: 12 }}>
                    {isPrev ? "⏹" : "▶"}
                  </button>
                  {isAdmin && (
                    <>
                      <button onClick={() => onEdit(audio)} style={{ ...S.btn, padding: "5px 10px", fontSize: 12 }}>Editar</button>
                      <button onClick={() => askConfirm(`¿Eliminar "${audio.title}" del almacén?\n\nLos ejercicios que ya lo usan conservarán su enlace.`, () => onDelete(audio.id))}
                        style={{ ...S.btnDanger, padding: "5px 10px", fontSize: 12 }}>Eliminar</button>
                    </>
                  )}
                </div>
              </div>

              {/* ── Detalle expandido ── */}
              {isOpen && (
                <div style={{ borderTop: `1px solid ${C.line}`, padding: "10px 14px 14px", background: C.bg }}>
                  {audio.description && (
                    <p style={{ margin: "0 0 10px", fontSize: 13, color: C.muted, lineHeight: 1.5 }}>{audio.description}</p>
                  )}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: isPrev ? 12 : 0 }}>
                    <span style={{ ...S.badge, background: C.line, color: C.muted, fontFamily: FONT_MONO }}>{fmt(audio.duration)}</span>
                    <span style={{ ...S.badge, background: C.paper2, color: C.muted, fontSize: 10, maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{audio.url}</span>
                    {(audio.tags || []).map((tag) => (
                      <span key={tag} style={{ ...S.badge, background: "rgba(154,79,184,0.10)", color: C.fnI, fontSize: 10 }}>{tag}</span>
                    ))}
                  </div>
                  {isPrev && (
                    <audio key={audio.id} src={audio.url} controls autoPlay style={{ width: "100%", marginTop: 10, height: 36 }} />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

// ── Pestaña: Ajustes ──────────────────────────────────────────────────────
function SettingsTab({ margin, onMargin, currentUser, onUpdateUser }) {
  const current = currentUser?.defaultPalette || SCHEMA_PALETTE_DEFAULT;
  const setPalette = (id) => { if (currentUser) onUpdateUser({ ...currentUser, defaultPalette: id }); };
  return (
    <>
      <div style={S.card}>
        <label style={S.label}>Margen de error (segundos) — para ejercicios Interactivos</label>
        <div style={S.row}>
          <input type="range" min={0} max={3} step={0.5} value={margin}
            onChange={(e) => onMargin(Number(e.target.value))} style={{ flex: 1 }} />
          <span style={{ minWidth: 40, textAlign: "center", fontWeight: 600, color: C.fnD }}>{margin}s</span>
        </div>
        <p style={{ color: C.muted, fontSize: 12, marginTop: 8 }}>Por defecto: 1 segundo.</p>
      </div>
      <PalettePreferenceCard current={current} onSelect={setPalette} />
    </>
  );
}

// Tarjeta reutilizable de selección de paleta por defecto (profesor y alumno).
function PalettePreferenceCard({ current, onSelect }) {
  return (
    <div style={{ ...S.card, marginTop: 14 }}>
      <label style={S.label}>Paleta de color por defecto</label>
      <p style={{ color: C.muted, fontSize: 12, margin: "0 0 12px" }}>
        Define los colores de los bloques del esquema y de los botones de categorías en tus ejercicios. Por defecto: Paleta 1.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {SCHEMA_PALETTES.map((pal) => {
          const active = (current || SCHEMA_PALETTE_DEFAULT) === pal.id;
          return (
            <button key={pal.id} type="button" onClick={() => onSelect(pal.id)} className="fa-pressable"
              style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 12px", borderRadius: 10, cursor: "pointer", background: active ? C.paper2 : C.paper, border: `1.5px solid ${active ? C.ink : C.line}`, transition: "all .12s", fontFamily: F.sans, textAlign: "left", width: "100%" }}>
              <span style={{ display: "inline-flex", borderRadius: 5, overflow: "hidden", border: "1px solid rgba(0,0,0,0.08)", flexShrink: 0 }}>
                {pal.parts.map((c, i) => <span key={i} style={{ width: 22, height: 22, background: c, display: "block" }} />)}
              </span>
              <span style={{ flex: 1, fontSize: 13.5, fontWeight: active ? 700 : 500, color: active ? C.ink : C.ink2 }}>{pal.name}</span>
              {active && <span style={{ fontSize: 14, color: C.ink, flexShrink: 0 }}>✓</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Botón compacto con desplegable para elegir la paleta por defecto (cabeceras).
function PaletteMenuButton({ current, onSelect, label = "Paleta" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("touchstart", onDown); };
  }, [open]);
  const cur = getSchemaPalette(current) || SCHEMA_PALETTES[0];
  return (
    <div ref={ref} style={{ position: "relative", flexShrink: 0 }}>
      <button type="button" onClick={() => setOpen(o => !o)} className="fa-pressable"
        title="Paleta de color por defecto"
        style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "6px 9px", borderRadius: 7, cursor: "pointer", background: C.paper, border: `1px solid ${C.rail}`, fontFamily: F.sans }}>
        <span style={{ display: "inline-flex", borderRadius: 3, overflow: "hidden", border: "1px solid rgba(0,0,0,0.08)" }}>
          {cur.parts.map((c, i) => <span key={i} style={{ width: 9, height: 12, background: c, display: "block" }} />)}
        </span>
        <Chevron open={open} size={11} color={C.muted} />
      </button>
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 40, background: C.paper, border: `1px solid ${C.line}`, borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.12)", padding: 6, display: "flex", flexDirection: "column", gap: 2, minWidth: 172 }}>
          <div style={{ fontFamily: F.sans, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: C.muted, padding: "4px 8px 6px" }}>{label}</div>
          {SCHEMA_PALETTES.map((pal) => {
            const active = (current || SCHEMA_PALETTE_DEFAULT) === pal.id;
            return (
              <button key={pal.id} type="button" onClick={() => { onSelect(pal.id); setOpen(false); }}
                style={{ display: "flex", alignItems: "center", gap: 9, padding: "6px 8px", borderRadius: 7, cursor: "pointer", background: active ? C.paper2 : "transparent", border: "none", fontFamily: F.sans, textAlign: "left", width: "100%" }}>
                <span style={{ display: "inline-flex", borderRadius: 4, overflow: "hidden", border: "1px solid rgba(0,0,0,0.08)", flexShrink: 0 }}>
                  {pal.parts.map((c, i) => <span key={i} style={{ width: 13, height: 16, background: c, display: "block" }} />)}
                </span>
                <span style={{ flex: 1, fontSize: 12.5, fontWeight: active ? 700 : 500, color: active ? C.ink : C.ink2 }}>{pal.name}</span>
                {active && <span style={{ fontSize: 12, color: C.ink, flexShrink: 0 }}>✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Pestaña: Usuarios (admin) ─────────────────────────────────────────────
function UsersTab({ currentUser, teachers, onAddTeacher, onResetCred, onRemove, askConfirm }) {
  return (
    <>
      <div style={{ ...S.row, justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <p style={{ ...SECTION_STYLE, margin: 0 }}>Profesores ({teachers.length})</p>
        <button onClick={onAddTeacher} style={S.btnPrimary}>+ Crear profesor</button>
      </div>

      {teachers.length === 0 && (
        <div style={{ ...S.card, textAlign: "center", color: C.muted, padding: "1.5rem" }}>
          Aún no hay profesores. Crea el primero con el botón de arriba.
        </div>
      )}

      {teachers.map((t) => (
        <div key={t.id} style={S.card}>
          <div style={{ ...S.row, justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>{t.displayName}</div>
              <span style={{ ...S.badge, background: C.paper2, color: C.muted, fontFamily: FONT_MONO, fontSize: 10 }}>@{t.username}</span>
            </div>
            <div style={{ ...S.row, gap: 6 }}>
              <button onClick={() => onResetCred(t)} style={{ ...S.btn, fontSize: 12, padding: "5px 11px" }}>Resetear contraseña</button>
              <button onClick={() => askConfirm(`¿Eliminar la cuenta del profesor "${t.displayName}"?\n\nSus alumnos y resultados se conservarán.`, () => onRemove(t.id))} style={S.btnDanger}>Eliminar</button>
            </div>
          </div>
        </div>
      ))}

      <hr style={{ ...S.divider, margin: "28px 0" }} />
      <p style={SECTION_STYLE}>Administrador</p>
      <div style={S.card}>
        <div style={{ ...S.row, justifyContent: "space-between", gap: 10 }}>
          <div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>{currentUser.displayName}</div>
            <div style={{ ...S.row, gap: 6 }}>
              <span style={{ ...S.badge, background: C.paper2, color: C.muted, fontFamily: FONT_MONO, fontSize: 10 }}>@{currentUser.username}</span>
              <span style={{ ...S.badge, background: "rgba(154,79,184,0.12)", color: C.fnI }}>Admin</span>
            </div>
          </div>
          <button onClick={() => onResetCred(currentUser)} style={{ ...S.btn, fontSize: 12, padding: "5px 11px" }}>Cambiar mi contraseña</button>
        </div>
      </div>
    </>
  );
}

function TeacherDash({
  currentUser,
  users, onAddUser, onRemoveUser, onUpdateUser,
  exercises, onUpdateExercise, onDeleteExercise,
  results, margin, onMargin,
  onRecord, onPreview, onManageQuestions, onAdd, onLogout,
  categories, onAddCategory, onUpdateCategory, onDeleteCategory, onToggleGlobalCategory,
  courses, units,
  onAddCourse, onUpdateCourse, onDeleteCourse,
  onAddUnit, onUpdateUnit, onDeleteUnit,
  onAddExercisesToUnit, onRemoveExerciseFromUnit,
  groups = [], onAddGroup, onUpdateGroup, onDeleteGroup,
  onSaveCorrection,
  audioLibrary = [], onAddAudio, onUpdateAudio, onDeleteAudio,
  tab = "exercises", onTab, detailExId = null, onSelectExercise,
}) {
  const isAdmin = currentUser?.role === "admin" || currentUser?.username === "jonb";
  const isMobile = useIsMobile();

  const students = useMemo(() =>
    (users || []).filter((u) => u.role === "student" && (isAdmin || u.createdBy === currentUser?.id || u.teacherId === currentUser?.id)),
    [users, currentUser, isAdmin]
  );
  const teachers      = useMemo(() => (users || []).filter((u) => u.role === "teacher"), [users]);
  const teacherGroups = useMemo(() =>
    (groups || []).filter((g) => isAdmin || g.teacherId === currentUser?.id),
    [groups, currentUser, isAdmin]
  );

  const setTab = onTab || (() => {});
  // Detalle de ejercicio controlado por la URL ("new" para creación)
  const selectedExerciseId = detailExId;
  const setSelectedExerciseId = onSelectExercise || (() => {});
  // Para que el profesor vea la respuesta detallada de un alumno en un ejercicio
  const [viewingAnswer, setViewingAnswer] = useState(null); // null | { student, exercise, result }

  // Modal state
  const [editingCategory, setEditingCategory] = useState(null);    // null | "new" | category
  const [confirmState,    setConfirmState]    = useState(null);
  const [editingAudio,    setEditingAudio]    = useState(null);    // null | "new" | audio
  const [showAddUser,     setShowAddUser]     = useState(false);
  const [addingUserRole,  setAddingUserRole]  = useState("student");
  const [showResetCred,   setShowResetCred]   = useState(false);
  const [resetCredTarget, setResetCredTarget] = useState(null);
  const [editingGroup,    setEditingGroup]    = useState(undefined); // undefined=closed, null=new, group=edit

  // Course/unit modal state
  const [openUnitIds,      setOpenUnitIds]      = useState(new Set());
  const [editingCourse,    setEditingCourse]    = useState(null);  // null | "new" | course
  const [editingUnit,      setEditingUnit]      = useState(null);  // null | unit
  const [unitFormCourseId, setUnitFormCourseId] = useState(null);
  const [exPickerUnitId,   setExPickerUnitId]   = useState(null);
  const [newExInUnit,      setNewExInUnit]      = useState(null);

  const askConfirm = (message, onConfirm, confirmLabel = "Eliminar") =>
    setConfirmState({ message, confirmLabel, onConfirm: () => { onConfirm(); setConfirmState(null); } });

  // Tras crear un ejercicio dentro de una unidad, lo añadimos automáticamente
  const lastCreatedExRef = useRef(null);
  const handleExerciseCreated = (newEx, unitId) => {
    lastCreatedExRef.current = newEx;
    onAdd(newEx);
    if (unitId) onAddExercisesToUnit(unitId, [newEx.id]);
    setSelectedExerciseId(newEx.id);
    setNewExInUnit(null);
  };

  // Vista de respuesta de un alumno
  if (viewingAnswer) {
    const { student, exercise: va_ex, result: va_result } = viewingAnswer;
    const freshVa      = exercises.find((e) => e.id === va_ex.id) || va_ex;
    const freshResult  = (results[student.id] || {})[va_ex.id] || va_result;
    // El profesor ve los colores con la paleta que usó el alumno al entregar.
    const vaPalette    = effectivePaletteId({ schemaPalette: freshResult?.schemaPalette }, null);
    const freshVaPal   = applyPaletteToExercise(freshVa, vaPalette);
    return (
      <div style={S.app}>
        <div style={{ background: C.paper, borderBottom: `1px solid ${C.line}`, padding: "10px 20px", display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={() => setViewingAnswer(null)} style={{ ...S.btn, fontSize: 12, padding: "5px 12px" }}>← Volver a alumnos</button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: 12, color: C.muted }}>Respuesta de </span>
            <span style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{student.displayName}</span>
          </div>
        </div>
        <CorrectionView
          key={JSON.stringify(freshResult.teacherCorrection)}
          exercise={freshVaPal}
          result={freshResult}
          margin={margin}
          onBack={() => setViewingAnswer(null)}
          backLabel="← Volver a alumnos"
          isTeacherMode={true}
          student={student}
          onSaveCorrection={onSaveCorrection}
        />
      </div>
    );
  }

  // Vista de detalle/creación
  if (selectedExerciseId === "new") {
    return (
      <ExerciseDetailView
        exercise={null}
        onBack={() => setSelectedExerciseId(null)}
        onRecord={() => {}}
        onUpdate={() => {}}
        onCreate={(newEx) => handleExerciseCreated(newEx, newExInUnit)}
        onDelete={() => {}}
        categories={categories}
        audioLibrary={audioLibrary}
      />
    );
  }

  const selectedExercise = selectedExerciseId != null
    ? (exercises.find((e) => String(e.id) === String(selectedExerciseId)) || lastCreatedExRef.current)
    : null;

  if (selectedExercise) {
    return (
      <ExerciseDetailView
        exercise={selectedExercise}
        onBack={() => setSelectedExerciseId(null)}
        onRecord={onRecord}
        onPreview={onPreview}
        onManageQuestions={onManageQuestions}
        onUpdate={(patch) => onUpdateExercise(selectedExercise.id, patch)}
        onCreate={() => {}}
        onDelete={() => { onDeleteExercise(selectedExercise.id); setSelectedExerciseId(null); }}
        categories={categories}
        audioLibrary={audioLibrary}
      />
    );
  }

  const primaryTabs = [
    { id: "exercises", label: "Ejercicios" },
    { id: "courses",   label: "Cursos" },
    { id: "students",  label: "Alumnos" },
  ];
  const secondaryTabs = [
    { id: "categories", label: "Categorías" },
    { id: "audios",     label: "Audios" },
    { id: "settings",   label: "Ajustes" },
    ...(isAdmin ? [{ id: "users", label: "Usuarios" }] : []),
  ];

  return (
    <div style={S.app}>
      <div style={{ ...S.page, padding: isMobile ? "calc(18px + env(safe-area-inset-top,0px)) 14px 40px" : S.page.padding }}>
        {/* Cabecera editorial */}
        <div style={{ marginBottom: isMobile ? 18 : 24, paddingBottom: isMobile ? 14 : 20, borderBottom: `2px solid ${C.ink}`, display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <Overline>{isAdmin ? "Administrador" : "Profesor"}</Overline>
            <h1 style={{ ...S.h1, fontSize: isMobile ? 24 : 32, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{currentUser?.displayName}</h1>
          </div>
          <div style={{ flexShrink: 0 }}><GhostButton onClick={onLogout}>Salir</GhostButton></div>
        </div>

        {isMobile ? (
          // Móvil: una sola tira de pestañas con scroll horizontal (sin separador
          // que colapse ni pestañas recortadas). El borde inferior se mantiene.
          <div className="fa-noscroll" style={{
            display: "flex", alignItems: "flex-end", borderBottom: `1px solid ${C.line}`,
            marginBottom: 22, gap: 0, overflowX: "auto", flexWrap: "nowrap",
            WebkitOverflowScrolling: "touch", scrollbarWidth: "none",
          }}>
            <TabBar tabs={primaryTabs}   value={tab} onChange={setTab} variant="primary" />
            <TabBar tabs={secondaryTabs} value={tab} onChange={setTab} variant="secondary" />
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "flex-end", borderBottom: `1px solid ${C.line}`, marginBottom: 26, gap: 0 }}>
            <TabBar tabs={primaryTabs}   value={tab} onChange={setTab} variant="primary" />
            <div style={{ flex: 1 }} />
            <TabBar tabs={secondaryTabs} value={tab} onChange={setTab} variant="secondary" />
          </div>
        )}

        {tab === "exercises" && (
          <ExercisesTab exercises={exercises} audioLibrary={audioLibrary}
            onNew={() => setSelectedExerciseId("new")}
            onSelect={setSelectedExerciseId}
            onToggleVisibility={(ex) => onUpdateExercise(ex.id, { hidden: !ex.hidden })}
            onDelete={(id) => { onDeleteExercise(id); setSelectedExerciseId(null); }}
            askConfirm={askConfirm} />
        )}

        {tab === "courses" && (
          <CoursesTab
            courses={courses} units={units} exercises={exercises} groups={teacherGroups}
            openUnitIds={openUnitIds} setOpenUnitIds={setOpenUnitIds}
            onCreateCourse={() => setEditingCourse("new")}
            onEditCourse={(c) => setEditingCourse(c)}
            onDeleteCourse={onDeleteCourse}
            onUpdateCourse={onUpdateCourse}
            onCreateUnit={(courseId) => { setEditingUnit(null); setUnitFormCourseId(courseId); }}
            onEditUnit={(u) => setEditingUnit(u)}
            onDeleteUnit={onDeleteUnit}
            onUpdateUnit={onUpdateUnit}
            onPickFromBank={(unitId) => setExPickerUnitId(unitId)}
            onCreateNewExInUnit={(unitId) => { setNewExInUnit(unitId); setSelectedExerciseId("new"); }}
            onRemoveExFromUnit={onRemoveExerciseFromUnit}
            onSelectExercise={setSelectedExerciseId}
            askConfirm={askConfirm}
          />
        )}

        {tab === "students" && (
          <StudentsTab
            students={students} exercises={exercises} results={results}
            groups={teacherGroups}
            onAddStudent={() => { setAddingUserRole("student"); setShowAddUser(true); }}
            onResetCred={(s) => { setResetCredTarget(s); setShowResetCred(true); }}
            onRemove={onRemoveUser} askConfirm={askConfirm}
            onViewAnswer={(student, exercise, result) => setViewingAnswer({ student, exercise, result })}
            onEditGroup={(g) => setEditingGroup(g === null ? null : g)}
            onDeleteGroup={onDeleteGroup}
          />
        )}

        {tab === "categories" && (
          <CategoriesTab categories={categories}
            isAdmin={isAdmin}
            onAdd={() => setEditingCategory("new")}
            onEdit={(m) => setEditingCategory(m)}
            onDelete={onDeleteCategory}
            onToggleGlobal={onToggleGlobalCategory}
            askConfirm={askConfirm} />
        )}

        {tab === "audios" && (
          <AudiosTab audioLibrary={audioLibrary} isAdmin={isAdmin}
            onAdd={() => setEditingAudio("new")}
            onEdit={(a) => setEditingAudio(a)}
            onDelete={onDeleteAudio}
            askConfirm={askConfirm} />
        )}

        {tab === "settings" && <SettingsTab margin={margin} onMargin={onMargin} currentUser={currentUser} onUpdateUser={onUpdateUser} />}

        {tab === "users" && isAdmin && (
          <UsersTab currentUser={currentUser} teachers={teachers}
            onAddTeacher={() => { setAddingUserRole("teacher"); setShowAddUser(true); }}
            onResetCred={(t) => { setResetCredTarget(t); setShowResetCred(true); }}
            onRemove={onRemoveUser}
            askConfirm={askConfirm} />
        )}

        {/* Modales */}
        {editingCategory !== null && (
          <CategoryEditorModal
            initialCategory={editingCategory === "new" ? null : editingCategory}
            onSave={(c) => { if (editingCategory === "new") onAddCategory(c); else onUpdateCategory(c); setEditingCategory(null); }}
            onClose={() => setEditingCategory(null)} />
        )}

        {editingCourse !== null && (
          <CourseFormModal
            initial={editingCourse === "new" ? null : editingCourse}
            groups={teacherGroups}
            onSave={(c) => { if (editingCourse === "new") onAddCourse({ ...c, ownerId: currentUser.id }); else onUpdateCourse(c); setEditingCourse(null); }}
            onClose={() => setEditingCourse(null)} />
        )}

        {(editingUnit !== null || unitFormCourseId !== null) && (
          <UnitFormModal
            initial={editingUnit}
            onSave={(newUnit) => {
              if (editingUnit) onUpdateUnit(newUnit);
              else onAddUnit(newUnit, unitFormCourseId);
              setEditingUnit(null); setUnitFormCourseId(null);
            }}
            onClose={() => { setEditingUnit(null); setUnitFormCourseId(null); }} />
        )}

        {exPickerUnitId !== null && (
          <ExercisePickerModal
            exercises={exercises}
            alreadyInUnit={units.find((u) => u.id === exPickerUnitId)?.exerciseIds || []}
            onAdd={(ids) => { onAddExercisesToUnit(exPickerUnitId, ids); setExPickerUnitId(null); }}
            onClose={() => setExPickerUnitId(null)} />
        )}

        {showAddUser && (
          <AddUserModal forRole={addingUserRole} currentUserId={currentUser.id}
            existingUsernames={(users || []).map((u) => u.username)}
            onSave={(newUser) => { onAddUser(newUser); setShowAddUser(false); }}
            onClose={() => setShowAddUser(false)} />
        )}

        {showResetCred && resetCredTarget && (
          <ResetCredentialModal targetUser={resetCredTarget}
            onSave={(updated) => { onUpdateUser(updated); setShowResetCred(false); setResetCredTarget(null); }}
            onClose={() => { setShowResetCred(false); setResetCredTarget(null); }} />
        )}

        {editingAudio !== null && (
          <AudioLibraryFormModal
            initial={editingAudio === "new" ? null : editingAudio}
            allTags={[...new Set(audioLibrary.flatMap((a) => a.tags || []).filter(Boolean))].sort()}
            allComposers={[...new Set(audioLibrary.map((a) => a.composer).filter(Boolean))].sort()}
            onSave={(a) => { if (editingAudio === "new") onAddAudio(a); else onUpdateAudio(a); setEditingAudio(null); }}
            onClose={() => setEditingAudio(null)} />
        )}

        {editingGroup !== undefined && (
          <GroupEditorModal
            initial={editingGroup}
            students={students}
            currentUserId={currentUser.id}
            onSave={(g) => {
              if (editingGroup === null) onAddGroup(g); else onUpdateGroup(g);
              setEditingGroup(undefined);
            }}
            onClose={() => setEditingGroup(undefined)}
          />
        )}

        {confirmState && (
          <ConfirmModal {...confirmState} onCancel={() => setConfirmState(null)} />
        )}
      </div>
    </div>
  );
}

// ═══ 12. EXERCISE DETAIL VIEW (creación/edición de ejercicio) ═══════════════
function ExerciseDetailView({ exercise, onBack, onRecord, onPreview, onManageQuestions, onUpdate, onCreate, onDelete, categories, audioLibrary = [] }) {
  const isCreating = exercise == null;

  // Estado del formulario
  const [title, setTitle] = useState(isCreating ? "" : exercise.title);
  // comboId: id de MODEL_COMBOS — puede ser un solo modelo o un combo doble
  const [comboId, setComboId] = useState(() =>
    isCreating ? DEFAULT_MODEL_ID : comboIdFromModels(modelsOf(exercise))
  );
  const activeCombo   = MODEL_COMBOS.find((c) => c.id === comboId) || MODEL_COMBOS[0];
  const selectedModels = activeCombo.models;          // ej. ["interactivo","cuestionario"]
  const model          = selectedModels[0];           // modelo primario (backward compat)

  const initialCatIds = useMemo(() => {
    if (isCreating) return new Set([categories[0]?.id || "default"]);
    const exIds = new Set(categoriesOf(exercise).map((m) => m.id));
    const valid = categories.filter((m) => exIds.has(m.id)).map((m) => m.id);
    return new Set(valid.length ? valid : [categories[0]?.id || "default"]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Map<catId, Set<btnId>>
  const initialBtnIds = useMemo(() => {
    const map = new Map();
    categories.forEach((cat) => {
      const exCat = isCreating ? null : categoriesOf(exercise).find((c) => c.id === cat.id);
      map.set(cat.id, new Set(exCat ? exCat.buttons.map((b) => b.id) : cat.buttons.map((b) => b.id)));
    });
    return map;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [selectedCategoryIds, setSelectedCategoryIds] = useState(initialCatIds);
  const [selectedButtonIds,   setSelectedButtonIds]   = useState(initialBtnIds);

  const [audioUrl,       setAudioUrl]       = useState(isCreating ? null : (exercise.audioUrl || null));
  const [audioName,      setAudioName]      = useState(isCreating ? null : (exercise.audioName || null));
  const [audioDuration,  setAudioDuration]  = useState(() => {
    if (isCreating) return null;
    const lib = (exercise.audioUrl || null)
      ? audioLibrary.find(a => a.url === exercise.audioUrl)
      : null;
    return lib?.duration || exercise.audioTotalDuration || null;
  });
  const [waveformData,   setWaveformData]   = useState(isCreating ? null : (exercise.waveformData || null));
  // Fragmento de audio: inicio y fin en el audio completo (segundos), o null = sin fragmento
  const [fragStart,      setFragStart]      = useState(isCreating ? null : (exercise.audioFragmentStart ?? null));
  const [fragEnd,        setFragEnd]        = useState(isCreating ? null : (exercise.audioFragmentEnd   ?? null));
  const [manualDuration, setManualDuration] = useState(
    !isCreating && !exercise.audioName && exercise.duration ? String(exercise.duration) : ""
  );
  const [showConfirmDel,    setShowConfirmDel]    = useState(false);
  const [showLibraryPicker, setShowLibraryPicker] = useState(false);
  const [listenOnly,                setListenOnly]                = useState(isCreating ? false : (exercise.listenOnly ?? false));
  const [immediateSchemaFeedback,   setImmediateSchemaFeedback]   = useState(isCreating ? false : (exercise.immediateSchemaFeedback ?? false));
  const [showComposer,              setShowComposer]              = useState(isCreating ? true  : (exercise.showComposer ?? true));
  const [schemaLevels,      setSchemaLevels]      = useState(
    () => new Set(isCreating ? [1,2,3,4] : (exercise.schemaLevels ?? [1,2,3,4]))
  );
  const toggleSchemaLevel = (id) => setSchemaLevels(prev => {
    const n = new Set(prev);
    if (n.has(id)) { if (n.size > 1) n.delete(id); } else n.add(id);
    return n;
  });

  const toggleCategory = (id) => setSelectedCategoryIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) { if (next.size > 1) next.delete(id); } else next.add(id);
    return next;
  });

  const toggleButton = (catId, btnId) => setSelectedButtonIds((prev) => {
    const next = new Map(prev);
    const btns = new Set(next.get(catId) || []);
    if (btns.has(btnId)) { if (btns.size > 1) btns.delete(btnId); } else btns.add(btnId);
    next.set(catId, btns);
    return next;
  });

  // BUG FIX: cancelación de detecciones de audio obsoletas cuando el usuario
  // pega otra URL antes de que termine la primera decodificación.
  const urlReqRef = useRef(0);
  const handleUrlInput = (rawUrl) => {
    const url = rawUrl.trim();
    setAudioUrl(url || null);
    setAudioName(url ? url.split("/").pop().split("?")[0] || "audio" : null);
    setAudioDuration(null);
    setWaveformData(null);
    setFragStart(null);
    setFragEnd(null);
    if (!url) return;

    const reqId    = ++urlReqRef.current;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    fetchAudioBuffer(url)
      .then((buf) => ctx.decodeAudioData(buf))
      .then((decoded) => {
        ctx.close();
        if (reqId !== urlReqRef.current) return;   // petición obsoleta
        setAudioDuration(Math.ceil(decoded.duration));
        setWaveformData(buildWaveformFromPCM(decoded.getChannelData(0), decoded.duration));
      })
      .catch(() => { try { ctx.close(); } catch {} });
  };

  const clearAudio = () => {
    setAudioUrl(null); setAudioName(null);
    setAudioDuration(null); setWaveformData(null);
    setFragStart(null); setFragEnd(null);
    urlReqRef.current++;
  };

  const handlePickFromLibrary = (audio) => {
    urlReqRef.current++;                        // descarta cualquier carga en curso
    setAudioUrl(audio.url);
    setAudioName(audio.title);
    setAudioDuration(audio.duration);
    setWaveformData(null);                      // se recalcula al reproducir
    setManualDuration(String(audio.duration));
    setFragStart(null);                         // reset fragmento al cambiar audio
    setFragEnd(null);
    setShowLibraryPicker(false);
  };

  const hasExistingAudio = !!audioName;
  // Duración total del audio del almacén (sin recortar), para la barra de fragmento
  const totalAudioDuration = audioDuration
    || (!audioUrl ? null : audioLibrary.find(a => a.url === audioUrl)?.duration)
    || (!isCreating && !exercise.audioFragmentStart ? exercise.duration : null)
    || null;
  // Duración efectiva del ejercicio (del fragmento si está definido, del audio completo si no)
  const effDuration = hasExistingAudio
    ? (fragStart != null && fragEnd != null
        ? Math.round((fragEnd - fragStart) * 10) / 10
        : (audioDuration || (!isCreating ? exercise.duration : 0)))
    : (parseInt(manualDuration) || 0);

  // Compositor del audio actualmente seleccionado (para el toggle)
  const activeComposer = useMemo(() => {
    if (!audioUrl) return null;
    return audioLibrary.find((a) => a.url === audioUrl)?.composer || null;
  }, [audioUrl, audioLibrary]);

  // Detección de cambios (solo en edición)
  const isDirty = useMemo(() => {
    if (isCreating) return false;
    if (title.trim() !== exercise.title) return true;
    // Comparar array de modelos
    const exModelsArr = modelsOf(exercise);
    if (selectedModels.join(",") !== exModelsArr.join(",")) return true;
    if (audioUrl !== (exercise.audioUrl || null)) return true;
    if (!audioName && exercise.audioName) return true;
    if (selectedModels.includes("esquema") && (exercise.listenOnly ?? false) !== listenOnly) return true;
    if (selectedModels.includes("esquema") && (exercise.immediateSchemaFeedback ?? false) !== immediateSchemaFeedback) return true;
    if ((exercise.showComposer ?? true) !== showComposer) return true;
    if (selectedModels.includes("esquema")) {
      const exLvs = new Set(exercise.schemaLevels ?? [1,2,3,4]);
      if (schemaLevels.size !== exLvs.size || [...schemaLevels].some(id => !exLvs.has(id))) return true;
    }

    if (selectedModels.includes("interactivo")) {
      const exCats = categoriesOf(exercise);
      const exIds  = new Set(exCats.map((m) => m.id));
      if (selectedCategoryIds.size !== exIds.size) return true;
      for (const id of selectedCategoryIds) {
        if (!exIds.has(id)) return true;
        const exCat    = exCats.find((c) => c.id === id);
        const selBtns  = selectedButtonIds.get(id) || new Set();
        const exBtnIds = new Set((exCat?.buttons || []).map((b) => b.id));
        if (selBtns.size !== exBtnIds.size) return true;
        for (const bid of selBtns) if (!exBtnIds.has(bid)) return true;
      }
    }
    if (!hasExistingAudio && !exercise.audioName) {
      const manual = parseInt(manualDuration) || 0;
      if (manual !== exercise.duration) return true;
    }
    if ((fragStart ?? null) !== (exercise.audioFragmentStart ?? null)) return true;
    if ((fragEnd   ?? null) !== (exercise.audioFragmentEnd   ?? null)) return true;
    return false;
  }, [isCreating, title, selectedModels, audioUrl, audioName, selectedCategoryIds, selectedButtonIds, manualDuration, exercise, hasExistingAudio, listenOnly, immediateSchemaFeedback, showComposer, schemaLevels, fragStart, fragEnd]);

  const canSave = title.trim().length > 0 && effDuration > 0 && (isCreating || isDirty);
  const SEC = { background: C.paper, border: `1px solid ${C.line}`, borderRadius: 16, padding: "16px 18px", marginBottom: 14 };

  const handleSave = () => {
    if (!canSave) return;
    const hasInteractivo = selectedModels.includes("interactivo");
    const hasEsquema     = selectedModels.includes("esquema");
    const hasCuestionario = selectedModels.includes("cuestionario");
    const chosen = hasInteractivo ? categories.filter((m) => selectedCategoryIds.has(m.id)) : [];

    const applyBtnFilter = (cat) => {
      const selBtns = selectedButtonIds.get(cat.id);
      const btns    = selBtns ? cat.buttons.filter((b) => selBtns.has(b.id)) : cat.buttons;
      return { ...cat, buttons: btns.length >= 1 ? btns : cat.buttons };
    };
    const safe = (chosen.length ? chosen : (hasInteractivo ? [DEFAULT_CATEGORY] : [])).map(applyBtnFilter);

    if (isCreating) {
      onCreate({
        id: Date.now(),
        title: title.trim(),
        duration: effDuration,
        model,                     // modelo primario (backward compat)
        models: selectedModels,    // array completo de modelos
        audioUrl:            audioUrl     || null,
        audioName:           audioName    || null,
        waveformData:        waveformData || null,
        audioFragmentStart:  fragStart    ?? null,
        audioFragmentEnd:    fragEnd      ?? null,
        audioTotalDuration:  totalAudioDuration || null,
        showHint: false,
        categories: hasInteractivo ? safe : [],
        answers:    {},
        ...(hasCuestionario ? { questions: [] } : {}),
        ...(hasEsquema ? { listenOnly, immediateSchemaFeedback, schemaLevels: [...schemaLevels] } : {}),
        showComposer,
        composerName: activeComposer || null,
      });
      return;
    }

    const patch = { title: title.trim(), duration: effDuration, model, models: selectedModels };
    if (hasInteractivo) {
      const keepIds = new Set(safe.map((m) => m.id));
      const prev    = exercise.answers || {};
      patch.categories = safe;
      patch.modes      = undefined;
      patch.answers    = Object.fromEntries(Object.entries(prev).filter(([id]) => keepIds.has(id)));
    } else {
      patch.categories = [];
      patch.answers    = {};
    }
    patch.audioUrl            = audioUrl     || null;
    patch.audioName           = audioName    || null;
    patch.waveformData        = waveformData || null;
    patch.audioFragmentStart  = fragStart    ?? null;
    patch.audioFragmentEnd    = fragEnd      ?? null;
    patch.audioTotalDuration  = totalAudioDuration || null;
    if (hasEsquema) { patch.listenOnly = listenOnly; patch.immediateSchemaFeedback = immediateSchemaFeedback; patch.schemaLevels = [...schemaLevels]; }
    patch.showComposer = showComposer;
    patch.composerName = activeComposer || null;
    if (!audioName && exercise.audioName) {
      patch.audioUrl = null; patch.audioName = null; patch.waveformData = null;
      patch.audioFragmentStart = null; patch.audioFragmentEnd = null;
    }
    onUpdate(patch);
  };

  // Estado derivado del ejercicio guardado
  const isQuizSaved = !isCreating && modelsOf(exercise).includes("cuestionario");
  const exQs        = isCreating ? [] : questionsOf(exercise);
  const { recorded, total } = (isCreating || isQuizSaved) ? { recorded: 0, total: 0 } : answerStats(exercise);

  return (
    <div style={S.app}>
      <div style={S.page}>
        {/* Cabecera */}
        <div style={{ marginBottom: 20 }}>
          <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: F.sans, fontSize: 13, color: "#888", padding: 0, marginBottom: 14 }}>← Ejercicios</button>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
            <h1 style={{ ...S.h1 }}>{isCreating ? "Nuevo ejercicio" : title || "Sin título"}</h1>
            {(isCreating || isDirty) && (
              <CtaButton onClick={handleSave} disabled={!canSave}>
                {isCreating ? "Crear ejercicio" : "Guardar cambios"}
              </CtaButton>
            )}
          </div>
        </div>

        {/* ══ 1. INFORMACIÓN ══════════════════════════════════════════════════ */}
        <section style={SEC}>
          <p style={{ ...SECTION_STYLE, margin: "0 0 14px" }}>Información</p>

          <label style={S.label}>Nombre del ejercicio</label>
          <input style={{ ...S.input, marginBottom: 14, fontSize: 15, fontWeight: 500 }}
            value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej: Coral nº 4 – Bach" />

          <label style={S.label}>Audio</label>
          {hasExistingAudio ? (
            /* Fila única cuando ya hay audio */
            <div style={{ ...S.row, gap: 8, padding: "8px 10px", background: C.paper2, border: `1px solid ${C.line}`, borderRadius: 8, marginBottom: 4 }}>
              <AudioWaveIcon size={15} color={C.ink2} />
              <span style={{ flex: 1, fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {audioName}
              </span>
              <span style={{ fontSize: 12, color: C.muted, fontFamily: FONT_MONO, flexShrink: 0 }}>
                {fmt(effDuration)}
              </span>
              {audioLibrary.length > 0 && (
                <button type="button" onClick={() => setShowLibraryPicker(true)}
                  style={{ ...S.btn, padding: "3px 10px", fontSize: 12, flexShrink: 0 }}>
                  Cambiar
                </button>
              )}
              <button type="button" onClick={clearAudio}
                style={{ ...S.btnDanger, padding: "3px 10px", fontSize: 12, flexShrink: 0 }}>
                Quitar
              </button>
            </div>
          ) : (
            /* Selección cuando no hay audio: almacén + URL en una fila */
            <div style={{ marginBottom: 4 }}>
              <div style={{ ...S.row, gap: 8, marginBottom: 0 }}>
                {audioLibrary.length > 0 && (
                  <button type="button" onClick={() => setShowLibraryPicker(true)}
                    style={{ ...S.btn, padding: "8px 12px", fontSize: 13, flexShrink: 0, display: "flex", alignItems: "center", gap: 6 }}>
                    <AudioWaveIcon size={13} color="#555" />
                    Almacén
                  </button>
                )}
                <input type="url" style={{ ...S.input, fontSize: 13 }}
                  value={audioUrl || ""} onChange={(e) => handleUrlInput(e.target.value)}
                  placeholder={audioLibrary.length > 0 ? "O pega una URL de audio" : "URL pública de audio"} />
              </div>
              <div style={{ ...S.row, gap: 10, marginTop: 8, flexWrap: "wrap" }}>
                <label style={{ ...S.label, margin: 0, whiteSpace: "nowrap" }}>Sin audio · duración manual (s)</label>
                <input type="number" min={1} style={{ ...S.input, width: 90, flex: "0 0 auto" }}
                  value={manualDuration} onChange={(e) => setManualDuration(e.target.value)} placeholder="30" />
              </div>
            </div>
          )}
          {hasExistingAudio && audioDuration !== null && (
            <p style={{ fontSize: 11, color: C.fnT, margin: "2px 0 0" }}>Duración detectada: {fmt(audioDuration)}</p>
          )}
          {hasExistingAudio && audioDuration === null && (
            <p style={{ fontSize: 11, color: C.muted, margin: "2px 0 0" }}>Duración no detectada — se usará la actual.</p>
          )}

          {/* Fragmento — separado por un divisor interno */}
          {hasExistingAudio && totalAudioDuration && (
            selectedModels.includes("cuestionario") || selectedModels.includes("interactivo")
          ) && (
            <div style={{ borderTop: `1px solid ${C.line}`, marginTop: 14, paddingTop: 14 }}>
              <p style={{ ...SECTION_STYLE, margin: "0 0 10px", display: "flex", alignItems: "center", gap: 8 }}>
                Fragmento
                {fragStart !== null && (
                  <span style={{ fontFamily: FONT_MONO, fontSize: 10, color: C.quiz, fontWeight: 600,
                    textTransform: "none", letterSpacing: 0, background: "rgba(47,111,184,0.1)",
                    padding: "1px 6px", borderRadius: 4 }}>
                    {fmt(fragStart)} – {fmt(fragEnd)}
                  </span>
                )}
              </p>
              <FragmentRangeSelector
                totalDuration={totalAudioDuration}
                start={fragStart}
                end={fragEnd}
                onChange={({ start, end }) => { setFragStart(start); setFragEnd(end); }}
                onClear={() => { setFragStart(null); setFragEnd(null); }}
                onDefine={() => { setFragStart(0); setFragEnd(totalAudioDuration); }}
                audioUrl={audioUrl}
              />
              {fragStart === null && (
                <p style={{ fontSize: 11, color: C.muted, margin: "6px 0 0", lineHeight: 1.5 }}>
                  Escucha el audio y define un fragmento para que el ejercicio use solo ese tramo.
                </p>
              )}
            </div>
          )}
        </section>

        {/* ══ 2. MODELO ═══════════════════════════════════════════════════════ */}
        <section style={SEC}>
          <p style={{ ...SECTION_STYLE, margin: "0 0 14px" }}>Modelo de ejercicio</p>

          {/* Fila 1: modelos individuales */}
          <div style={{ ...S.row, gap: 8, marginBottom: 6 }}>
            {MODEL_COMBOS.slice(0, 3).map((c) => {
              const isActive = comboId === c.id;
              const dotColor = MODEL_META[c.models[0]]?.color || C.muted;
              return (
                <button key={c.id} type="button" onClick={() => setComboId(c.id)} title={c.description}
                  style={{
                    ...S.btn, flex: 1, fontSize: 13, padding: "8px 10px",
                    background: isActive ? C.ink : C.paper2,
                    color:      isActive ? C.paper : C.ink2,
                    border:     `1px solid ${isActive ? C.ink : C.line}`,
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: isActive ? "rgba(255,255,255,0.55)" : dotColor, flexShrink: 0 }} />
                  {c.name}
                </button>
              );
            })}
          </div>
          {/* Fila 2: combos dobles */}
          <div style={{ ...S.row, gap: 8, marginBottom: 10 }}>
            {MODEL_COMBOS.slice(3).map((c) => {
              const isActive = comboId === c.id;
              return (
                <button key={c.id} type="button" onClick={() => setComboId(c.id)} title={c.description}
                  style={{
                    ...S.btn, flex: 1, fontSize: 12, padding: "8px 10px",
                    background: isActive ? C.ink : C.paper2,
                    color:      isActive ? C.paper : C.ink2,
                    border:     `1px solid ${isActive ? C.ink : C.line}`,
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  }}>
                  <span style={{ display: "flex", borderRadius: 999, overflow: "hidden", flexShrink: 0 }}>
                    <span style={{ width: 8, height: 8, background: MODEL_META[c.models[0]]?.color || C.muted }} />
                    <span style={{ width: 8, height: 8, background: MODEL_META[c.models[1]]?.color || C.muted }} />
                  </span>
                  {c.name}
                </button>
              );
            })}
          </div>
          {selectedModels.includes("cuestionario") && (
            <p style={{ fontSize: 11, color: C.quiz, margin: "0 0 4px", padding: "6px 10px", background: "rgba(47,111,184,0.08)", borderRadius: 8 }}>
              {selectedModels.length > 1
                ? "Incluye cuestionario: las preguntas se configuran en la sección de abajo."
                : "Las preguntas se configuran en la sección de abajo."}
            </p>
          )}
          {selectedModels.length > 1 && (
            <p style={{ fontSize: 11, color: C.muted, margin: "4px 0 0", padding: "6px 10px", background: C.paper2, borderRadius: 8, lineHeight: 1.5 }}>
              El alumno podrá alternar entre los dos modos durante la práctica del ejercicio.
            </p>
          )}

          {/* Categorías — solo interactivo */}
          {selectedModels.includes("interactivo") && (
            <div style={{ marginTop: 14, borderTop: `1px solid ${C.line}`, paddingTop: 14 }}>
              <label style={{ ...S.label, marginBottom: 8 }}>Categorías y botones</label>
              <div style={{ background: C.paper2, border: `1px solid ${C.line}`, borderRadius: 10, padding: 8, maxHeight: 300, overflowY: "auto" }}>
                {categories.map((cat) => {
                  const checked  = selectedCategoryIds.has(cat.id);
                  const isLast   = checked && selectedCategoryIds.size === 1;
                  const selBtns  = selectedButtonIds.get(cat.id) || new Set();
                  const allCount = cat.buttons.length;
                  const selCount = checked ? [...cat.buttons].filter((b) => selBtns.has(b.id)).length : 0;
                  return (
                    <div key={cat.id} style={{ marginBottom: checked ? 6 : 2 }}>
                      <label style={{ ...S.row, gap: 10, padding: "6px 8px", borderRadius: 6, cursor: isLast ? "not-allowed" : "pointer", background: checked ? "rgba(26,25,21,0.04)" : "transparent" }}>
                        <input type="checkbox" checked={checked} onChange={() => toggleCategory(cat.id)}
                          style={{ cursor: isLast ? "not-allowed" : "pointer", flexShrink: 0 }} />
                        <span style={{ fontSize: 13, fontWeight: 500, color: checked ? C.ink : C.muted2, flex: 1 }}>{cat.name}</span>
                        <span style={{ fontSize: 11, color: C.muted, fontFamily: FONT_MONO }}>
                          {checked ? `${selCount}/${allCount}` : `${allCount} btn`}
                        </span>
                      </label>
                      {checked && (
                        <div style={{ paddingLeft: 28, paddingBottom: 4, paddingTop: 2, display: "flex", flexDirection: "column", gap: 1 }}>
                          {cat.buttons.map((btn) => {
                            const bChecked = selBtns.has(btn.id);
                            const bIsLast  = bChecked && selCount === 1;
                            return (
                              <label key={btn.id} style={{ ...S.row, gap: 8, padding: "4px 8px", borderRadius: 6, cursor: bIsLast ? "not-allowed" : "pointer", opacity: bChecked ? 1 : 0.45 }}>
                                <input type="checkbox" checked={bChecked} onChange={() => toggleButton(cat.id, btn.id)}
                                  style={{ cursor: bIsLast ? "not-allowed" : "pointer", flexShrink: 0 }} />
                                <span style={{ width: 20, height: 20, borderRadius: "50%", background: btn.color, flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 800, color: "#fff", fontFamily: FONT_MONO }}>{btn.id}</span>
                                <span style={{ fontSize: 13, color: C.ink2 }}>{btn.name}</span>
                                <span style={{ fontSize: 10, color: C.muted, fontFamily: FONT_MONO, marginLeft: "auto" }}>[{btn.key.toUpperCase()}]</span>
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        {/* ══ 3. CLAVE DE CORRECCIÓN (interactivo) ════════════════════════════ */}
        {selectedModels.includes("interactivo") && (
          <section style={SEC}>
            <p style={{ ...SECTION_STYLE, margin: "0 0 14px" }}>Clave de corrección</p>
            {isCreating ? (
              <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.6, margin: 0 }}>
                Crea el ejercicio para poder grabar la clave de corrección.
              </p>
            ) : (
              <>
                <div style={{ marginBottom: 14 }}>
                  {categoriesOf(exercise).map((cat) => {
                    const hasKey = answerFor(exercise, cat.id).length > 0;
                    return (
                      <div key={cat.id} style={{ ...S.row, justifyContent: "space-between", padding: "8px 12px", borderRadius: 8, background: hasKey ? "rgba(63,155,91,0.07)" : C.paper2, border: `1px solid ${hasKey ? "rgba(63,155,91,0.22)" : C.line}`, marginBottom: 6 }}>
                        <span style={{ fontSize: 13, color: C.ink2, fontWeight: 500 }}>{cat.name}</span>
                        <span style={{ ...S.row, gap: 5, fontSize: 12, color: hasKey ? C.fnT : C.muted, fontWeight: 600 }}>
                          <span style={{ width: 7, height: 7, borderRadius: "50%", background: hasKey ? C.fnT : C.muted2, flexShrink: 0 }} />
                          {hasKey ? "Clave grabada" : "Sin clave"}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <button onClick={() => onRecord(exercise)} style={{
                  width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                  background: recorded === 0 ? C.ink : C.paper2,
                  color:      recorded === 0 ? C.paper : C.ink,
                  border:     recorded === 0 ? `1px solid ${C.ink}` : `1.5px solid ${C.line}`,
                  borderRadius: 12, padding: "13px 18px", cursor: "pointer", fontSize: 15, fontWeight: 600,
                }}>
                  <span>{recorded === 0 ? "Grabar clave" : recorded < total ? "Grabar resto" : "Regrabar clave"}</span>
                  <span style={{ fontSize: 18, opacity: 0.55, fontWeight: 300 }}>→</span>
                </button>
              </>
            )}
          </section>
        )}

        {/* ══ 4. ESQUEMA FORMAL ═══════════════════════════════════════════════ */}
        {selectedModels.includes("esquema") && !isCreating && (
          <section style={SEC}>
            <p style={{ ...SECTION_STYLE, margin: "0 0 14px" }}>Esquema formal</p>
            <div style={{ background: `${C.fnD}10`, border: `1px solid ${C.fnD}30`, borderRadius: 10, padding: "10px 14px", marginBottom: 14, fontSize: 13, color: C.ink2, lineHeight: 1.6 }}>
              El alumno dibuja bloques de forma musical sobre una línea de tiempo multinivel. Graba un esquema de referencia para mostrarlo durante la corrección.
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ ...S.label, marginBottom: 8 }}>Niveles que verá el alumno</label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {SCHEMA_LEVELS.map(lv => {
                  const active = schemaLevels.has(lv.id);
                  const isLast = active && schemaLevels.size === 1;
                  return (
                    <button key={lv.id} type="button"
                      onClick={() => !isLast && toggleSchemaLevel(lv.id)}
                      title={isLast ? "Debe haber al menos un nivel activo" : undefined}
                      style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 14px", borderRadius: 9, cursor: isLast ? "not-allowed" : "pointer", border: `1.5px solid ${active ? lv.color : C.line}`, background: active ? lv.color + "18" : C.paper2, transition: "all .12s", opacity: isLast ? 0.6 : 1, fontFamily: FONT_SANS }}>
                      <span style={{ width: 10, height: 10, borderRadius: 2, background: active ? lv.color : C.muted2, flexShrink: 0, transition: "background .12s" }} />
                      <span style={{ fontSize: 12, fontWeight: active ? 600 : 400, color: active ? lv.color : C.muted, transition: "all .12s" }}>{lv.sub}</span>
                      {active && <span style={{ fontSize: 10, color: lv.color, opacity: 0.7, marginLeft: 1 }}>✓</span>}
                    </button>
                  );
                })}
              </div>
              {schemaLevels.size < SCHEMA_LEVELS.length && (
                <p style={{ fontSize: 11, color: C.muted, margin: "6px 0 0" }}>Los niveles desactivados no aparecen al alumno.</p>
              )}
            </div>
            <div style={{ marginBottom: 14, padding: "12px 14px", background: C.paper2, border: `1px solid ${listenOnly ? C.fnD + "55" : C.line}`, borderRadius: 10, transition: "border-color .15s" }}>
              <label style={{ display: "flex", alignItems: "flex-start", gap: 14, cursor: "pointer", userSelect: "none" }}>
                <input type="checkbox" checked={listenOnly} onChange={e => setListenOnly(e.target.checked)}
                  style={{ marginTop: 3, flexShrink: 0, cursor: "pointer" }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.ink, marginBottom: 3 }}>Reproducción sin navegación</div>
                  <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.55 }}>El alumno solo puede dar al play/pausa y a «Empezar de nuevo». No puede saltar en la línea de tiempo.</div>
                </div>
              </label>
            </div>
            <div style={{ marginBottom: 14, padding: "12px 14px", background: C.paper2, border: `1px solid ${immediateSchemaFeedback ? C.quiz + "55" : C.line}`, borderRadius: 10, transition: "border-color .15s" }}>
              <label style={{ display: "flex", alignItems: "flex-start", gap: 14, cursor: "pointer", userSelect: "none" }}>
                <input type="checkbox" checked={immediateSchemaFeedback} onChange={e => setImmediateSchemaFeedback(e.target.checked)}
                  style={{ marginTop: 3, flexShrink: 0, cursor: "pointer" }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.ink, marginBottom: 3 }}>Retroalimentación inmediata</div>
                  <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.55 }}>Al entregar el ejercicio, el alumno verá el esquema de referencia del profesor antes de que corrija manualmente.</div>
                </div>
              </label>
            </div>
            {(() => {
              const key = exercise.schemaKey;
              const hasKey = Array.isArray(key) && key.length > 0;
              const keyLevels = SCHEMA_LEVELS.filter(lv => !exercise.schemaLevels || exercise.schemaLevels.length === 0 || exercise.schemaLevels.includes(lv.id));
              const byLevel = hasKey ? keyLevels.map(lv => ({ lv, blocks: key.filter(b => b.level === lv.id) })).filter(x => x.blocks.length > 0) : [];
              return (
                <div style={{ border: `1px solid ${hasKey ? C.fnT + "55" : C.line}`, borderRadius: 10, padding: "10px 14px", marginBottom: 14, background: hasKey ? `rgba(63,155,91,0.05)` : C.paper2 }}>
                  <div style={{ ...S.row, gap: 8, marginBottom: hasKey ? 10 : 0 }}>
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: hasKey ? C.fnT : C.muted2, flexShrink: 0, display: "inline-block" }} />
                    <span style={{ fontSize: 13, color: hasKey ? C.fnT : C.muted, fontWeight: 600 }}>
                      {hasKey ? `Clave grabada · ${key.length} ${key.length === 1 ? "bloque" : "bloques"}` : "Sin clave de corrección"}
                    </span>
                  </div>
                  {hasKey && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {byLevel.map(({ lv, blocks }) => (
                        <div key={lv.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: lv.color, minWidth: 48, textTransform: "uppercase", letterSpacing: 0.5 }}>{lv.sub}</span>
                          <div style={{ flex: 1, position: "relative", height: 28, background: "rgba(26,25,21,0.05)", borderRadius: 4, overflow: "hidden" }}>
                            {blocks.map((b, i) => {
                              const lPct = (b.start / exercise.duration) * 100;
                              const wPct = Math.max(((b.end - b.start) / exercise.duration) * 100, 0.5);
                              const { bg, textColor } = schemaBlockColor(b, key, exercise.schemaPalette || SCHEMA_PALETTE_DEFAULT);
                              if (lv.id === 3) {
                                return (
                                  <div key={i} style={{ position: "absolute", top: 4, bottom: 4, left: `${lPct}%`, width: `${wPct}%`, display: "flex", alignItems: "center", overflow: "hidden" }}>
                                    <div style={{ background: bg, borderRadius: 999, display: "flex", alignItems: "center", padding: "2px 7px", flexShrink: 0 }}>
                                      <span style={{ fontSize: 9, fontWeight: 700, color: textColor, fontFamily: FONT_SANS, whiteSpace: "nowrap" }}>{b.label}</span>
                                    </div>
                                    {wPct >= 4 && <div style={{ flex: 1, height: 2, background: bg, opacity: 0.5, marginLeft: 3, borderRadius: 1 }} />}
                                  </div>
                                );
                              }
                              if (lv.id === 4) {
                                return (
                                  <div key={i} style={{ position: "absolute", top: 3, bottom: 3, left: `${lPct}%`, width: `${wPct}%`, background: bg, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                                    <span style={{ fontSize: 9, fontWeight: 500, color: textColor, fontFamily: FONT_SANS, whiteSpace: "nowrap", padding: "0 4px", overflow: "hidden", textOverflow: "ellipsis" }}>{b.label}</span>
                                  </div>
                                );
                              }
                              return (
                                <div key={i} style={{ position: "absolute", top: 2, bottom: 2, left: `${lPct}%`, width: `${wPct}%`, background: bg, borderRadius: 3, border: "1px solid rgba(255,255,255,0.22)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                                  <span style={{ fontSize: 9, fontWeight: lv.id === 1 ? 700 : 500, color: textColor, fontFamily: FONT_SANS, whiteSpace: "nowrap", padding: "0 2px", overflow: "hidden", textOverflow: "ellipsis" }}>{b.label}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => onRecord(exercise)} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "space-between", background: !exercise.schemaKey?.length ? C.ink : C.paper2, color: !exercise.schemaKey?.length ? C.paper : C.ink, border: !exercise.schemaKey?.length ? `1px solid ${C.ink}` : `1.5px solid ${C.line}`, borderRadius: 12, padding: "13px 18px", cursor: "pointer", fontSize: 14, fontWeight: 600 }}>
                <span>{exercise.schemaKey?.length ? "Regrabar clave" : "Grabar clave"}</span>
                <span style={{ fontSize: 18, opacity: 0.55, fontWeight: 300 }}>→</span>
              </button>
              {onPreview && (
                <button onClick={() => onPreview(exercise)} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "space-between", background: C.paper2, color: C.ink, border: `1.5px solid ${C.line}`, borderRadius: 12, padding: "13px 18px", cursor: "pointer", fontSize: 14, fontWeight: 600 }}>
                  <span>Probar ejercicio</span>
                  <span style={{ fontSize: 18, opacity: 0.55, fontWeight: 300 }}>›</span>
                </button>
              )}
            </div>
          </section>
        )}

        {/* ══ 5. PREGUNTAS (cuestionario) ══════════════════════════════════════ */}
        {selectedModels.includes("cuestionario") && !isCreating && (
          <section style={SEC}>
            <p style={{ ...SECTION_STYLE, margin: "0 0 14px" }}>Preguntas</p>
            <div style={{ ...S.row, justifyContent: "space-between", padding: "8px 12px", borderRadius: 8, background: exQs.length > 0 ? "rgba(47,111,184,0.07)" : C.paper2, border: `1px solid ${exQs.length > 0 ? "rgba(47,111,184,0.22)" : C.line}`, marginBottom: 14 }}>
              <span style={{ fontSize: 13, color: C.ink2, fontWeight: 500 }}>Preguntas configuradas</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: exQs.length > 0 ? C.quiz : C.muted }}>
                {exQs.length > 0 ? `${exQs.length} ${exQs.length === 1 ? "pregunta" : "preguntas"}` : "Ninguna todavía"}
              </span>
            </div>
            <button onClick={() => (onManageQuestions || onRecord)(exercise)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", background: exQs.length === 0 ? C.ink : C.paper2, color: exQs.length === 0 ? C.paper : C.ink, border: exQs.length === 0 ? `1px solid ${C.ink}` : `1.5px solid ${C.line}`, borderRadius: 12, padding: "13px 18px", cursor: "pointer", fontSize: 15, fontWeight: 600 }}>
              <span>{exQs.length === 0 ? "Crear preguntas" : "Editar preguntas"}</span>
              <span style={{ fontSize: 18, opacity: 0.55, fontWeight: 300 }}>→</span>
            </button>
            {selectedModels.length > 1 && onPreview && (
              <button onClick={() => onPreview(exercise)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", background: "transparent", color: C.ink2, border: `1px solid ${C.line}`, borderRadius: 12, padding: "10px 18px", cursor: "pointer", fontSize: 13, fontWeight: 500, marginTop: 8 }}>
                <span>Probar ejercicio completo</span>
                <span style={{ fontSize: 16, opacity: 0.45, fontWeight: 300 }}>→</span>
              </button>
            )}
          </section>
        )}

        {/* ══ 6. OPCIONES PARA EL ALUMNO ══════════════════════════════════════ */}
        {(!isCreating && selectedModels.includes("interactivo")) || activeComposer ? (
          <section style={SEC}>
            <p style={{ ...SECTION_STYLE, margin: "0 0 14px" }}>Opciones para el alumno</p>
            {!isCreating && selectedModels.includes("interactivo") && (
              <label style={{ display: "flex", alignItems: "flex-start", gap: 14, cursor: "pointer", userSelect: "none", marginBottom: activeComposer ? 14 : 0 }}>
                <input type="checkbox" checked={!!exercise.showHint}
                  onChange={(e) => onUpdate({ showHint: e.target.checked })}
                  style={{ width: 16, height: 16, marginTop: 2, accentColor: C.fnT, flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: C.ink, marginBottom: 3 }}>Mostrar guía de tiempo</div>
                  <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5 }}>Muestra los bloques de función como barras apagadas — una pista sin revelar la solución.</div>
                </div>
              </label>
            )}
            {activeComposer && (
              <label style={{ display: "flex", alignItems: "flex-start", gap: 14, cursor: "pointer", userSelect: "none" }}>
                <input type="checkbox" checked={showComposer}
                  onChange={(e) => setShowComposer(e.target.checked)}
                  style={{ width: 16, height: 16, marginTop: 2, accentColor: C.fnT, flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: C.ink, marginBottom: 3 }}>Mostrar nombre del compositor</div>
                  <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5 }}>
                    Muestra <em style={{ fontStyle: "normal", color: C.fnS }}>{activeComposer}</em> debajo del título en la vista del alumno.
                  </div>
                </div>
              </label>
            )}
          </section>
        ) : null}

        {/* Zona de peligro */}
        {!isCreating && (
          <div style={{ marginTop: 8, textAlign: "center" }}>
            <button onClick={() => setShowConfirmDel(true)} style={{ ...S.btnDanger, padding: "8px 20px", fontSize: 12 }}>
              Eliminar ejercicio
            </button>
          </div>
        )}
      </div>

      {showConfirmDel && (
        <ConfirmModal
          message={`¿Eliminar el ejercicio "${exercise?.title}"?\n\nSe perderán también las respuestas guardadas de los alumnos.`}
          onConfirm={onDelete}
          onCancel={() => setShowConfirmDel(false)} />
      )}
      {showLibraryPicker && (
        <AudioLibraryPickerModal
          library={audioLibrary}
          onPick={handlePickFromLibrary}
          onClose={() => setShowLibraryPicker(false)} />
      )}
    </div>
  );
}

// ═══ 13. QUESTION MANAGER VIEW (profesor edita preguntas) ═══════════════════
function QuestionManagerView({ exercise, onSave, onBack }) {
  const dur = exercise.duration;
  const [questions,   setQuestions]   = useState(questionsOf(exercise));
  const [editingQ,    setEditingQ]    = useState(null);
  const [confirmDel,  setConfirmDel]  = useState(null);
  const [selectedQId, setSelectedQId] = useState(null);
  const minimapRef = useRef(null);

  // QMV usa exercise.waveformData directamente — sin callback de onWaveform
  const {
    time, playing, audioReady, audioError, hasAudio,
    togglePlay, seekTo, scrubBegin, scrubTo, scrubEnd, audioDuration,
  } = useAudioPlayer(exercise);

  // Espacio = Play/Pausa (excepto si hay un input/textarea/button con foco)
  const togglePlayRef = useRef(togglePlay);
  useEffect(() => { togglePlayRef.current = togglePlay; });
  useEffect(() => {
    const down = (e) => {
      if (e.key === " " && !["INPUT", "TEXTAREA", "BUTTON"].includes(e.target.tagName)) {
        e.preventDefault();
        togglePlayRef.current();
      }
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, []);

  // Drag del cuerpo de una pregunta en el minimapa
  const beginDragQBody = (e, qId) => {
    e.stopPropagation();
    const el = minimapRef.current;
    if (!el) return;
    const rect  = el.getBoundingClientRect();
    const origQ = questions.find((q) => q.id === qId);
    if (!origQ) return;
    const len = origQ.audioEnd - origQ.audioStart;
    let startX = 0, moved = false;
    startPointerDrag(e, {
      onStart: (ev, getX) => { startX = getX(ev); setSelectedQId(qId); },
      onMove:  (ev, getX) => {
        const cx = getX(ev);
        if (!moved && Math.abs(cx - startX) > 3) moved = true;
        if (!moved) return;
        const ns = Math.max(0, Math.min(dur - len, origQ.audioStart + ((cx - startX) / rect.width) * dur));
        const s = parseFloat(ns.toFixed(2)), f = parseFloat((ns + len).toFixed(2));
        setQuestions((prev) => prev.map((q) => q.id === qId ? { ...q, audioStart: s, audioEnd: f } : q));
      },
      onEnd: () => { if (!moved) seekTo(origQ.audioStart); },
    });
  };

  // Drag de los bordes de una pregunta (resize)
  const beginDragQEdge = (e, qId, which) => {
    e.stopPropagation();
    const el = minimapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const xToTime = (x) => Math.max(0, Math.min(dur, ((x - rect.left) / rect.width) * dur));
    const origQ = questions.find((q) => q.id === qId);
    if (!origQ) return;
    setSelectedQId(qId);
    startPointerDrag(e, {
      onMove: (ev, getX) => {
        const t = xToTime(getX(ev));
        const updated = which === "start"
          ? { ...origQ, audioStart: parseFloat(Math.min(origQ.audioEnd - 0.5, Math.max(0, t)).toFixed(2)) }
          : { ...origQ, audioEnd:   parseFloat(Math.max(origQ.audioStart + 0.5, Math.min(dur, t)).toFixed(2)) };
        setQuestions((prev) => prev.map((q) => q.id === qId ? updated : q));
      },
    });
  };

  return (
    <div style={S.app}>
      <div style={S.page}>
        <div style={{ ...S.row, justifyContent: "space-between", marginBottom: 18 }}>
          <button onClick={onBack} style={{ ...S.btn, padding: "6px 14px", fontSize: 13 }}>← Volver</button>
          <div style={{ fontWeight: 600, color: C.ink, fontSize: 15, textAlign: "center", flex: 1 }}>{exercise.title} — Preguntas</div>
          <button onClick={() => onSave(questions)} style={S.btnPrimary}>Guardar</button>
        </div>

        <section style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 18, padding: "14px 14px 12px", marginBottom: 20 }}>
          {hasAudio && !audioReady && !audioError && <div style={{ textAlign: "center", color: C.muted, fontSize: 12, marginBottom: 8 }}>Cargando audio…</div>}
          {audioError && <div style={{ textAlign: "center", color: C.danger, fontSize: 12, marginBottom: 8 }}>{audioError}</div>}

          <div style={{ background: C.paper2, borderRadius: 10, overflow: "hidden", border: `1px solid ${C.line}`, marginBottom: 6 }}>
            {(() => {
              const selQ    = questions.find((q) => q.id === selectedQId);
              const qRegion = selQ ? { start: selQ.audioStart, end: selQ.audioEnd, color: C.quiz } : null;
              return (
                <WaveformDisplay time={time} duration={dur} waveformDuration={audioDuration} allIntervals={[]}
                  exerciseId={exercise.id} waveformData={exercise.waveformData || null}
                  colorByFn={{}} questionRegion={qRegion}
                  onScrubBegin={scrubBegin} onScrubTo={scrubTo} onScrubEnd={scrubEnd} />
              );
            })()}
          </div>

          {/* Minimapa de preguntas (draggable) */}
          <div ref={minimapRef} onMouseDown={() => setSelectedQId(null)}
            style={{ position: "relative", height: 36, marginBottom: 4, background: C.paper2, borderRadius: 6, border: `1px solid ${C.line}`, overflow: "hidden", touchAction: "none", userSelect: "none", cursor: "default" }}>
            {questions.map((q, idx) => {
              const isSel  = selectedQId === q.id;
              const qLeft  = `${(q.audioStart / dur) * 100}%`;
              const qWidth = `${Math.max(0, (q.audioEnd - q.audioStart) / dur) * 100}%`;
              return (
                <div key={q.id}
                  onMouseDown ={(e) => beginDragQBody(e, q.id)}
                  onTouchStart={(e) => beginDragQBody(e, q.id)}
                  title={`P${idx + 1}: ${fmt(q.audioStart)} – ${fmt(q.audioEnd)}`}
                  style={{
                    position: "absolute", top: 3, bottom: 3, left: qLeft, width: qWidth,
                    background: C.quiz, opacity: isSel ? 1 : 0.7,
                    borderRadius: 3, cursor: "grab",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    border: isSel ? `1.5px solid rgba(255,255,255,0.85)` : "none",
                    boxSizing: "border-box", overflow: "hidden", zIndex: isSel ? 2 : 1,
                  }}>
                  <div onMouseDown ={(e) => { e.stopPropagation(); beginDragQEdge(e, q.id, "start"); }}
                       onTouchStart={(e) => { e.stopPropagation(); beginDragQEdge(e, q.id, "start"); }}
                       style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 10, cursor: "ew-resize", zIndex: 3, background: isSel ? "rgba(255,255,255,0.22)" : "transparent" }} />
                  <span style={{ fontSize: 8, color: C.paper, fontWeight: 700, fontFamily: FONT_MONO, pointerEvents: "none", padding: "0 12px", overflow: "hidden", whiteSpace: "nowrap" }}>P{idx + 1}</span>
                  <div onMouseDown ={(e) => { e.stopPropagation(); beginDragQEdge(e, q.id, "end"); }}
                       onTouchStart={(e) => { e.stopPropagation(); beginDragQEdge(e, q.id, "end"); }}
                       style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 10, cursor: "ew-resize", zIndex: 3, background: isSel ? "rgba(255,255,255,0.22)" : "transparent" }} />
                </div>
              );
            })}
            <div style={{ position: "absolute", top: 0, bottom: 0, left: `${(time / dur) * 100}%`, width: 2, background: C.ink, opacity: 0.75, pointerEvents: "none", zIndex: 5 }} />
          </div>

          {selectedQId && (() => {
            const selQ   = questions.find((q) => q.id === selectedQId);
            const selIdx = questions.findIndex((q) => q.id === selectedQId);
            if (!selQ) return null;
            return (
              <div onMouseDown={(e) => e.stopPropagation()}
                style={{ ...S.row, gap: 8, flexWrap: "wrap", alignItems: "center", padding: "5px 4px", marginBottom: 6, fontSize: 11 }}>
                <span style={{ fontFamily: FONT_MONO, fontWeight: 700, color: C.quiz }}>P{selIdx + 1}</span>
                <span style={{ fontFamily: FONT_MONO, color: C.ink2 }}>{fmt(selQ.audioStart)} → {fmt(selQ.audioEnd)}</span>
                <span style={{ ...S.badge, background: "rgba(47,111,184,0.10)", color: C.quiz }}>{fmt(selQ.audioEnd - selQ.audioStart)}</span>
                <span style={{ color: C.muted, fontSize: 10, flex: "1 1 160px" }}>Arrastra el bloque para mover · arrastra los bordes para ajustar</span>
                <button onClick={() => { setEditingQ(selQ); setSelectedQId(null); }} style={{ ...S.btn, padding: "3px 10px", fontSize: 11 }}>Editar contenido</button>
              </div>
            );
          })()}

          <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 12 }}>
            <div />
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <CircleButton onClick={() => seekTo(Math.max(0, time - 5))} size={36} fontSize={10}>−5s</CircleButton>
              <CircleButton onClick={togglePlay} disabled={hasAudio && !audioReady && !audioError}
                primary size={42} fontSize={14}>{playing ? "❚❚" : "▶"}</CircleButton>
              <CircleButton onClick={() => seekTo(Math.min(dur, time + 5))} size={36} fontSize={10}>+5s</CircleButton>
            </div>
            <div style={{ textAlign: "right", fontFamily: FONT_MONO, fontVariantNumeric: "tabular-nums", fontSize: 18, fontWeight: 600, color: C.ink }}>
              {fmt(time)}<span style={{ color: C.muted2, fontWeight: 400 }}>/{fmt(dur)}</span>
            </div>
          </div>
        </section>

        <div style={{ ...S.row, justifyContent: "space-between", marginBottom: 8 }}>
          <h2 style={{ ...S.h2, margin: 0 }}>Preguntas ({questions.length})</h2>
          {/* BUG FIX: el original usaba timeRef.current (undefined en este componente).
              Ahora se pasa `time` directamente, que ya está disponible del hook. */}
          <button onClick={() => setEditingQ({ _new: true, defaultStart: time })} style={S.btnPrimary}>
            + Añadir aquí
          </button>
        </div>
        <p style={{ color: C.muted, fontSize: 12, margin: "0 0 14px" }}>
          Sitúate en el punto del audio deseado y pulsa "+ Añadir aquí" para usar ese instante como inicio sugerido del fragmento.
        </p>

        {questions.length === 0 && (
          <div style={{ ...S.card, textAlign: "center", color: C.muted, padding: "2rem" }}>
            Aún no hay preguntas. Crea la primera con el botón de arriba.
          </div>
        )}

        {questions.map((q, idx) => (
          <div key={q.id} style={S.card}>
            <div style={{ ...S.row, justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                <div style={{ ...S.row, gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                  <span style={{ ...S.badge, background: C.line, color: C.muted }}>P{idx + 1}</span>
                  <span style={{ ...S.badge, background: q.type === "test" ? "rgba(63,155,91,0.12)" : "rgba(47,111,184,0.12)", color: q.type === "test" ? C.fnT : C.quiz }}>{q.type === "test" ? "Test" : "Desarrollo"}</span>
                  <span style={{ ...S.badge, background: C.paper2, color: C.muted, fontFamily: FONT_MONO }}>{fmt(q.audioStart)} – {fmt(q.audioEnd)}</span>
                </div>
                <div style={{ fontSize: 14, color: C.ink, marginBottom: q.type === "test" ? 6 : 0 }}>{q.text}</div>
                {q.type === "test" && (
                  <div style={{ ...S.row, gap: 6, flexWrap: "wrap" }}>
                    {q.options.map((opt) => (
                      <span key={opt.id} style={{
                        ...S.badge, fontSize: 11,
                        background: opt.id === q.correctOptionId ? "rgba(63,155,91,0.14)" : C.paper2,
                        color:      opt.id === q.correctOptionId ? C.fnT : C.muted,
                        border:     opt.id === q.correctOptionId ? `1px solid ${C.fnT}` : `1px solid transparent`,
                      }}>
                        {opt.id}) {opt.text}{opt.id === q.correctOptionId ? " ✓" : ""}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ ...S.row, gap: 6 }}>
                <button onClick={() => seekTo(q.audioStart)} style={{ ...S.btn, padding: "6px 10px", fontSize: 12 }} title={`Ir a ${fmt(q.audioStart)}`}>▶ {fmt(q.audioStart)}</button>
                <button onClick={() => setEditingQ(q)} style={S.btn}>Editar</button>
                <button onClick={() => setConfirmDel({ id: q.id, text: q.text })} style={S.btnDanger}>Eliminar</button>
              </div>
            </div>
          </div>
        ))}

        <button onClick={() => onSave(questions)} style={{ ...S.btnPrimary, width: "100%", marginTop: 8, padding: 14, borderRadius: 12 }}>
          Guardar preguntas
        </button>
      </div>

      {editingQ && (
        <QuestionEditorModal
          initial={editingQ._new ? null : editingQ}
          defaultStart={editingQ._new ? editingQ.defaultStart : undefined}
          audioDuration={dur}
          onSave={(q) => {
            if (editingQ._new) setQuestions((prev) => [...prev, q]);
            else               setQuestions((prev) => prev.map((x) => x.id === q.id ? q : x));
            setEditingQ(null);
          }}
          onClose={() => setEditingQ(null)} />
      )}
      {confirmDel && (
        <ConfirmModal
          message={`¿Eliminar la pregunta "${confirmDel.text.slice(0, 60)}${confirmDel.text.length > 60 ? "…" : ""}"?`}
          onConfirm={() => { setQuestions((prev) => prev.filter((x) => x.id !== confirmDel.id)); setConfirmDel(null); }}
          onCancel={() => setConfirmDel(null)} />
      )}
    </div>
  );
}

// ═══ 14. MODALES ═══════════════════════════════════════════════════════════

// Editor de categoría (nuevo o existente)
function CategoryEditorModal({ initialCategory, onSave, onClose }) {
  const isNew = !initialCategory;
  const [name,    setName]    = useState(initialCategory?.name || "");
  const [buttons, setButtons] = useState(initialCategory?.buttons || [
    { id: "A", name: "Botón A", color: CATEGORY_COLORS[0], key: KEY_SEQUENCE[0] },
    { id: "B", name: "Botón B", color: CATEGORY_COLORS[1], key: KEY_SEQUENCE[1] },
  ]);

  const updateBtn = (i, patch) => setButtons((prev) => prev.map((b, idx) => idx === i ? { ...b, ...patch } : b));
  const addBtn = () => {
    if (buttons.length >= 6) return;
    const i = buttons.length;
    setButtons((prev) => [...prev, {
      id: String.fromCharCode(65 + i),
      name: `Botón ${String.fromCharCode(65 + i)}`,
      color: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
      key:   KEY_SEQUENCE[i % KEY_SEQUENCE.length],
    }]);
  };
  const removeBtn = (i) => { if (buttons.length > 2) setButtons((prev) => prev.filter((_, idx) => idx !== i)); };

  const canSave = name.trim() && buttons.length >= 2 && buttons.every((b) => b.id.trim() && b.name.trim() && b.key.trim().length === 1);

  const handleSave = () => {
    if (!canSave) return;
    onSave({
      id:      initialCategory?.id || uid("cat"),
      name:    name.trim(),
      builtIn: initialCategory?.builtIn ?? false,
      global:  initialCategory?.global  ?? false,
      buttons: buttons.map((b) => ({ ...b, id: b.id.trim().toUpperCase(), name: b.name.trim(), key: b.key.trim().toLowerCase() })),
    });
  };

  return (
    <ModalShell width={520} align="top">
      <h3 style={{ margin: "0 0 18px", fontSize: 16, fontWeight: 600, color: C.ink }}>
        {isNew ? "Nueva categoría" : "Editar categoría"}
      </h3>

      <label style={S.label}>Nombre de la categoría</label>
      <input style={{ ...S.input, marginBottom: 18 }} value={name}
        onChange={(e) => setName(e.target.value)} placeholder="Ej: Cadencias" autoFocus />

      <label style={S.label}>Botones ({buttons.length}/6)</label>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
        {buttons.map((b, i) => (
          <div key={i} style={{ ...S.row, gap: 8, background: C.paper2, padding: "8px 10px", borderRadius: 8 }}>
            <input type="color" value={b.color} onChange={(e) => updateBtn(i, { color: e.target.value })}
              style={{ width: 36, height: 32, border: `1px solid ${C.line}`, borderRadius: 6, cursor: "pointer", padding: 0, background: "transparent", flexShrink: 0 }} />
            <input value={b.id} onChange={(e) => updateBtn(i, { id: e.target.value.slice(0, 4) })}
              style={{ ...S.input, width: 50, fontFamily: FONT_MONO, fontWeight: 700, textAlign: "center", padding: "6px 4px", flexShrink: 0 }}
              maxLength={4} placeholder="ID" />
            <input value={b.name} onChange={(e) => updateBtn(i, { name: e.target.value })}
              style={{ ...S.input, flex: 1, padding: "6px 10px", minWidth: 0 }} placeholder="Nombre" />
            <input value={b.key} onChange={(e) => updateBtn(i, { key: e.target.value.slice(0, 1) })}
              style={{ ...S.input, width: 36, fontFamily: FONT_MONO, textAlign: "center", padding: "6px 4px", flexShrink: 0 }}
              maxLength={1} placeholder="t" />
            <button onClick={() => removeBtn(i)} disabled={buttons.length <= 2}
              style={{ ...S.btnDanger, padding: "4px 8px", fontSize: 11, ...disabledStyle(buttons.length > 2), flexShrink: 0 }}>×</button>
          </div>
        ))}
      </div>

      <button onClick={addBtn} disabled={buttons.length >= 6}
        style={{ ...S.btn, width: "100%", marginBottom: 18, ...disabledStyle(buttons.length < 6) }}>
        + Añadir botón
      </button>

      <div style={{ ...S.row, gap: 8, justifyContent: "flex-end" }}>
        <button onClick={onClose} style={S.btn}>Cancelar</button>
        <button onClick={handleSave} disabled={!canSave} style={{ ...S.btnPrimary, ...disabledStyle(canSave) }}>
          {isNew ? "Crear" : "Guardar"}
        </button>
      </div>
    </ModalShell>
  );
}

// Formulario de curso
function GroupEditorModal({ initial, students, currentUserId, onSave, onClose }) {
  const [name,       setName]       = useState(initial?.name || "");
  const [studentIds, setStudentIds] = useState(() => new Set(initial?.studentIds || []));

  const toggleStudent = (id) => setStudentIds((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const canSave = name.trim().length > 0;

  const handleSave = () => {
    if (!canSave) return;
    onSave({
      id:         initial?.id || uid("group"),
      name:       name.trim(),
      teacherId:  currentUserId,
      studentIds: [...studentIds],
      createdAt:  initial?.createdAt || Date.now(),
    });
  };

  return (
    <ModalShell width={480} align="top">
      <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 600, color: C.ink }}>
        {initial ? "Editar grupo" : "Nuevo grupo"}
      </h3>

      <label style={S.label}>Nombre del grupo</label>
      <input style={{ ...S.input, marginBottom: 18 }} value={name} autoFocus
        onChange={(e) => setName(e.target.value)} placeholder="Ej: Grupo A, 2º Bachillerato…" />

      {students.length > 0 && (
        <>
          <label style={{ ...S.label, marginBottom: 8 }}>Alumnos del grupo</label>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 18, maxHeight: 240, overflowY: "auto", border: `1px solid ${C.line}`, borderRadius: 8, padding: "8px 12px" }}>
            {students.map((s) => (
              <label key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontFamily: FONT_SANS, fontSize: 13, color: C.ink }}>
                <input type="checkbox" checked={studentIds.has(s.id)} onChange={() => toggleStudent(s.id)}
                  style={{ accentColor: C.ink, width: 15, height: 15, cursor: "pointer" }} />
                <span style={{ flex: 1 }}>{s.displayName}</span>
                <span style={{ color: C.muted, fontSize: 11, fontFamily: FONT_MONO }}>@{s.username}</span>
              </label>
            ))}
          </div>
        </>
      )}

      <div style={{ ...S.row, gap: 8, justifyContent: "flex-end" }}>
        <button onClick={onClose} style={S.btn}>Cancelar</button>
        <button onClick={handleSave} disabled={!canSave} style={{ ...S.btnPrimary, ...disabledStyle(canSave) }}>
          {initial ? "Guardar" : "Crear grupo"}
        </button>
      </div>
    </ModalShell>
  );
}

function CourseFormModal({ initial, groups = [], onSave, onClose }) {
  const [name,              setName]              = useState(initial?.name || "");
  const [desc,              setDesc]              = useState(initial?.description || "");
  const [visibility,        setVisibility]        = useState(initial?.visibility || "teacher");
  const [visibilityGroupId, setVisibilityGroupId] = useState(initial?.visibilityGroupId || "");

  const canSave = name.trim().length > 0 && (visibility !== "group" || visibilityGroupId !== "");

  const handleSave = () => {
    if (!canSave) return;
    onSave({
      id:                initial?.id || uid("course"),
      name:              name.trim(),
      description:       desc.trim(),
      unitIds:           initial?.unitIds || [],
      visibility,
      visibilityGroupId: visibility === "group" ? visibilityGroupId : null,
      createdAt:         initial?.createdAt || Date.now(),
    });
  };

  const VIS_OPTIONS = [
    { id: "teacher", label: "Mis alumnos",      desc: "Solo los alumnos asignados a ti" },
    { id: "public",  label: "Público",           desc: "Todos los alumnos de la aplicación" },
    { id: "group",   label: "Grupo específico",  desc: "Solo los alumnos de un grupo" },
  ];

  return (
    <ModalShell width={480}>
      <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 600, color: C.ink }}>{initial ? "Editar curso" : "Nuevo curso"}</h3>

      <label style={S.label}>Nombre del curso</label>
      <input style={{ ...S.input, marginBottom: 14 }} value={name} autoFocus
        onChange={(e) => setName(e.target.value)} placeholder="Ej: 2º Bachillerato — Armonía" />

      <label style={S.label}>Descripción (opcional)</label>
      <textarea style={{ ...S.input, marginBottom: 18, minHeight: 60, resize: "vertical", fontFamily: FONT_SANS }}
        value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Breve descripción del curso…" />

      <label style={{ ...S.label, marginBottom: 8 }}>Visibilidad</label>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: visibility === "group" ? 10 : 20 }}>
        {VIS_OPTIONS.map((opt) => (
          <label key={opt.id} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", padding: "9px 12px", borderRadius: 8, border: `1.5px solid ${visibility === opt.id ? C.ink : C.line}`, background: visibility === opt.id ? C.paper2 : "transparent", fontFamily: FONT_SANS }}>
            <input type="radio" name="visibility" value={opt.id} checked={visibility === opt.id} onChange={() => setVisibility(opt.id)}
              style={{ accentColor: C.ink, width: 15, height: 15, cursor: "pointer", flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{opt.label}</div>
              <div style={{ fontSize: 11, color: C.muted }}>{opt.desc}</div>
            </div>
          </label>
        ))}
      </div>

      {visibility === "group" && (
        <div style={{ marginBottom: 18 }}>
          {groups.length === 0
            ? <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>Aún no tienes grupos. Créalos desde la pestaña Alumnos.</p>
            : <select value={visibilityGroupId} onChange={(e) => setVisibilityGroupId(e.target.value)}
                style={{ ...S.input, cursor: "pointer" }}>
                <option value="">— Selecciona un grupo —</option>
                {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
          }
        </div>
      )}

      <div style={{ ...S.row, gap: 8, justifyContent: "flex-end" }}>
        <button onClick={onClose} style={S.btn}>Cancelar</button>
        <button onClick={handleSave} disabled={!canSave} style={{ ...S.btnPrimary, ...disabledStyle(canSave) }}>
          {initial ? "Guardar" : "Crear"}
        </button>
      </div>
    </ModalShell>
  );
}

// Formulario de unidad
function UnitFormModal({ initial, onSave, onClose }) {
  const [name, setName] = useState(initial?.name || "");
  const [desc, setDesc] = useState(initial?.description || "");
  const canSave = name.trim().length > 0;

  const handleSave = () => {
    if (!canSave) return;
    onSave({
      id:          initial?.id || uid("unit"),
      name:        name.trim(),
      description: desc.trim(),
      exerciseIds: initial?.exerciseIds || [],
      createdAt:   initial?.createdAt || Date.now(),
    });
  };

  return (
    <ModalShell width={440}>
      <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 600, color: C.ink }}>{initial ? "Editar unidad" : "Nueva unidad didáctica"}</h3>
      <label style={S.label}>Nombre de la unidad</label>
      <input style={{ ...S.input, marginBottom: 14 }} value={name} autoFocus
        onChange={(e) => setName(e.target.value)} placeholder="Ej: Tema 3 — Cadencias" />
      <label style={S.label}>Descripción (opcional)</label>
      <textarea style={{ ...S.input, marginBottom: 18, minHeight: 60, resize: "vertical", fontFamily: FONT_SANS }}
        value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Objetivos y contenido…" />
      <div style={{ ...S.row, gap: 8, justifyContent: "flex-end" }}>
        <button onClick={onClose} style={S.btn}>Cancelar</button>
        <button onClick={handleSave} disabled={!canSave} style={{ ...S.btnPrimary, ...disabledStyle(canSave) }}>
          {initial ? "Guardar" : "Crear"}
        </button>
      </div>
    </ModalShell>
  );
}

// Picker de ejercicios del banco (para asignar a una unidad)
function ExercisePickerModal({ exercises, alreadyInUnit, onAdd, onClose }) {
  const [selected, setSelected] = useState(new Set());
  const inUnit    = new Set(alreadyInUnit);
  const available = exercises.filter((e) => !inUnit.has(e.id));
  const toggle    = (id) => setSelected((s) => toggleInSet(s, id));

  return (
    <ModalShell width={520} align="top">
      <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 600, color: C.ink }}>Añadir ejercicios desde el banco</h3>

      {available.length === 0 ? (
        <p style={{ color: C.muted, textAlign: "center", padding: "1.5rem 0", fontSize: 13 }}>
          {exercises.length === 0
            ? "Aún no hay ejercicios en el banco. Crea uno desde la pestaña Ejercicios."
            : "Todos los ejercicios del banco ya están en esta unidad."}
        </p>
      ) : (
        <div style={{ maxHeight: 380, overflowY: "auto", border: `1px solid ${C.line}`, borderRadius: 8, padding: 6, marginBottom: 16 }}>
          {available.map((ex) => {
            const isSel = selected.has(ex.id);
            return (
              <label key={ex.id}
                style={{ ...S.row, gap: 10, padding: "10px 12px", borderRadius: 6, cursor: "pointer", background: isSel ? "rgba(26,25,21,0.04)" : "transparent" }}>
                <input type="checkbox" checked={isSel} onChange={() => toggle(ex.id)} style={{ cursor: "pointer", flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 4 }}>{ex.title}</div>
                  <div style={{ ...S.row, gap: 6 }}>
                    <span style={{ ...S.badge, background: C.line, color: C.muted, fontFamily: FONT_MONO }}>{fmt(ex.duration)}</span>
                    {(() => {
                      const isQuiz = modelOf(ex) === "cuestionario";
                      return <span style={{ ...S.badge, background: isQuiz ? "rgba(47,111,184,0.10)" : "rgba(63,155,91,0.08)", color: isQuiz ? C.quiz : C.fnT }}>{isQuiz ? "Cuestionario" : "Interactivo"}</span>;
                    })()}
                  </div>
                </div>
              </label>
            );
          })}
        </div>
      )}

      <div style={{ ...S.row, gap: 8, justifyContent: "flex-end" }}>
        <button onClick={onClose} style={S.btn}>Cancelar</button>
        <button onClick={() => onAdd([...selected])} disabled={selected.size === 0}
          style={{ ...S.btnPrimary, ...disabledStyle(selected.size > 0) }}>
          Añadir {selected.size > 0 && `(${selected.size})`}
        </button>
      </div>
    </ModalShell>
  );
}

// Crear un alumno o profesor con credencial PIN o contraseña
function AddUserModal({ forRole, currentUserId, existingUsernames, onSave, onClose }) {
  const [displayName, setDisplayName] = useState("");
  const [username,    setUsername]    = useState("");
  const [credType,    setCredType]    = useState(forRole === "student" ? "pin" : "password");
  const [credValue,   setCredValue]   = useState("");
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState("");

  const isPin   = credType === "pin";
  const minLen  = isPin ? 4 : 6;
  const taken   = username.trim() && existingUsernames.includes(username.trim().toLowerCase());
  const canSave = displayName.trim() && username.trim() && credValue.length >= minLen && !taken && !loading;

  const handleSave = async () => {
    if (!canSave) return;
    setLoading(true); setError("");
    try {
      const salt = generateSalt();
      const hash = await hashCredential(credValue, salt);
      onSave({
        id:           uid(forRole),
        username:     username.trim().toLowerCase(),
        displayName:  displayName.trim(),
        role:         forRole,
        credType,
        passwordHash: hash,
        salt,
        ...(forRole === "student" ? { teacherId: currentUserId } : {}),
        createdBy:    currentUserId,
        createdAt:    Date.now(),
      });
    } catch { setError("Error al crear la cuenta."); }
    finally  { setLoading(false); }
  };

  const roleLabel = forRole === "teacher" ? "profesor" : "alumno";

  return (
    <ModalShell width={420}>
      <h3 style={{ margin: "0 0 18px", fontSize: 16, fontWeight: 600, color: C.ink }}>Crear cuenta de {roleLabel}</h3>

      <label style={S.label}>Nombre visible</label>
      <input style={{ ...S.input, marginBottom: 14 }} value={displayName} autoFocus
        onChange={(e) => setDisplayName(e.target.value)} placeholder={`Ej: ${forRole === "teacher" ? "Prof. García" : "Juan García"}`} />

      <label style={S.label}>Nombre de usuario</label>
      <input style={{ ...S.input, marginBottom: taken ? 4 : 14, borderColor: taken ? C.danger : undefined }}
        autoComplete="off"
        value={username} onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s/g, ""))}
        placeholder="usuario.unico" />
      {taken && <ErrorMsg style={{ marginBottom: 14 }}>Este nombre de usuario ya existe</ErrorMsg>}

      <label style={S.label}>Tipo de credencial</label>
      <div style={{ ...S.row, gap: 8, marginBottom: 14 }}>
        {[{ id: "pin", label: "PIN (4-6 dígitos)" }, { id: "password", label: "Contraseña" }].map((opt) => (
          <button key={opt.id} type="button" onClick={() => { setCredType(opt.id); setCredValue(""); }}
            style={{
              ...S.btn, flex: 1, fontSize: 12,
              background: credType === opt.id ? C.ink   : C.paper,
              color:      credType === opt.id ? C.paper : C.ink2,
              border:     `1px solid ${credType === opt.id ? C.ink : C.line}`,
            }}>
            {opt.label}
          </button>
        ))}
      </div>

      <label style={S.label}>{isPin ? "PIN inicial" : "Contraseña inicial"} (mín. {minLen} caracteres)</label>
      <CredentialInput
        kind={isPin ? "pin" : "password"}
        value={credValue}
        onChange={setCredValue}
        marginBottom={22}
        onSubmit={handleSave}
      />

      <ErrorMsg style={{ marginTop: -14, marginBottom: 14 }}>{error}</ErrorMsg>

      <div style={{ ...S.row, gap: 8, justifyContent: "flex-end" }}>
        <button onClick={onClose} style={S.btn}>Cancelar</button>
        <button onClick={handleSave} disabled={!canSave} style={{ ...S.btnPrimary, ...disabledStyle(canSave) }}>
          {loading ? "Creando…" : "Crear cuenta"}
        </button>
      </div>
    </ModalShell>
  );
}

// Resetear PIN/contraseña de un usuario existente
function ResetCredentialModal({ targetUser, onSave, onClose }) {
  const [credType,  setCredType]  = useState(targetUser.credType || "pin");
  const [credValue, setCredValue] = useState("");
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState("");
  const isPin   = credType === "pin";
  const minLen  = isPin ? 4 : 6;
  const canSave = credValue.length >= minLen && !loading;

  const handleSave = async () => {
    if (!canSave) return;
    setLoading(true); setError("");
    try {
      const salt = generateSalt();
      const hash = await hashCredential(credValue, salt);
      onSave({ ...targetUser, credType, passwordHash: hash, salt });
    } catch { setError("Error al actualizar la credencial."); }
    finally  { setLoading(false); }
  };

  return (
    <ModalShell width={420}>
      <h3 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 600, color: C.ink }}>Resetear acceso</h3>
      <p style={{ color: C.muted, fontSize: 13, margin: "0 0 18px" }}>
        Usuario: <strong style={{ color: C.ink }}>{targetUser.displayName}</strong>
      </p>

      <label style={S.label}>Tipo de credencial</label>
      <div style={{ ...S.row, gap: 8, marginBottom: 14 }}>
        {[{ id: "pin", label: "PIN" }, { id: "password", label: "Contraseña" }].map((opt) => (
          <button key={opt.id} type="button" onClick={() => { setCredType(opt.id); setCredValue(""); }}
            style={{
              ...S.btn, flex: 1, fontSize: 12,
              background: credType === opt.id ? C.ink   : C.paper,
              color:      credType === opt.id ? C.paper : C.ink2,
              border:     `1px solid ${credType === opt.id ? C.ink : C.line}`,
            }}>
            {opt.label}
          </button>
        ))}
      </div>

      <label style={S.label}>Nuevo {isPin ? "PIN" : "contraseña"} (mín. {minLen})</label>
      <CredentialInput
        kind={isPin ? "pin" : "password"}
        value={credValue}
        onChange={setCredValue}
        autoFocus
        marginBottom={22}
        onSubmit={handleSave}
      />

      <ErrorMsg style={{ marginTop: -14, marginBottom: 14 }}>{error}</ErrorMsg>

      <div style={{ ...S.row, gap: 8, justifyContent: "flex-end" }}>
        <button onClick={onClose} style={S.btn}>Cancelar</button>
        <button onClick={handleSave} disabled={!canSave} style={{ ...S.btnPrimary, ...disabledStyle(canSave) }}>
          {loading ? "Actualizando…" : "Resetear"}
        </button>
      </div>
    </ModalShell>
  );
}

// Modal para configurar el correo de recuperación en el primer login
function RecoveryEmailModal({ onSave, onSkip }) {
  const [email,   setEmail]   = useState("");
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const handleSave = async () => {
    if (!valid || loading) return;
    setLoading(true); setError("");
    try { await onSave(email.trim().toLowerCase()); }
    catch { setError("Error al guardar el correo. Inténtalo de nuevo."); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ ...S.app, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ maxWidth: 400, width: "100%" }}>
        <div style={{ marginBottom: 30, paddingBottom: 20, borderBottom: `2px solid ${C.ink}` }}>
          <Overline>Primer acceso</Overline>
          <h1 style={{ ...S.h1 }}>Correo de recuperación</h1>
        </div>
        <p style={{ fontFamily: F.sans, fontSize: 14, color: C.ink2, lineHeight: 1.6, marginBottom: 24 }}>
          Añade un correo para poder recuperar tu acceso si olvidas tu PIN. Puedes saltarte este paso, pero no podrás recuperar tu cuenta sin ayuda del profesor.
        </p>
        <div style={{ marginBottom: 8 }}>
          <FieldLabel>Correo electrónico</FieldLabel>
          <input
            type="email"
            style={{ ...S.input }}
            value={email}
            autoFocus
            onChange={(e) => { setEmail(e.target.value); setError(""); }}
            placeholder="correo@ejemplo.com"
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
          />
        </div>
        {error && <ErrorMsg style={{ marginBottom: 12 }}>{error}</ErrorMsg>}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 24 }}>
          <CtaButton full lg onClick={handleSave} disabled={!valid || loading}>
            {loading ? "Guardando…" : "Guardar y continuar →"}
          </CtaButton>
          <GhostButton full lg onClick={onSkip}>Ahora no</GhostButton>
        </div>
      </div>
    </div>
  );
}

// Picker para elegir un audio del almacén
function AudioLibraryPickerModal({ library, onPick, onClose }) {
  const [previewId, setPreviewId] = useState(null);
  return (
    <ModalShell width={560} align="top">
      <h3 style={{ margin: "0 0 14px", fontSize: 16, fontWeight: 600, color: C.ink }}>Elegir audio del almacén</h3>

      {library.length === 0 ? (
        <div style={{ textAlign: "center", padding: "2rem 1rem", color: C.muted, fontSize: 13, lineHeight: 1.6 }}>
          
          <div>El almacén está vacío.</div>
          <div style={{ fontSize: 12 }}>Pide al administrador que añada audios.</div>
        </div>
      ) : (
        <div style={{ maxHeight: 420, overflowY: "auto", border: `1px solid ${C.line}`, borderRadius: 8, padding: 6, marginBottom: 16 }}>
          {library.map((audio) => {
            const isPrev = previewId === audio.id;
            return (
              <div key={audio.id} style={{ padding: "8px 10px", borderRadius: 6, marginBottom: 4, background: isPrev ? "rgba(26,25,21,0.04)" : "transparent", transition: "background .1s" }}>
                <div style={{ ...S.row, gap: 10, justifyContent: "space-between" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500, fontSize: 14, color: C.ink, marginBottom: audio.composer ? 1 : (audio.description ? 2 : 4), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{audio.title}</div>
                    {audio.composer && <div style={{ fontSize: 11, color: C.fnS, fontWeight: 500, marginBottom: audio.description ? 2 : 4 }}>{audio.composer}</div>}
                    {audio.description && <div style={{ fontSize: 12, color: C.muted, marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{audio.description}</div>}
                    <span style={{ ...S.badge, background: C.line, color: C.muted, fontFamily: FONT_MONO }}>{fmt(audio.duration)}</span>
                  </div>
                  <div style={{ ...S.row, gap: 6, flexShrink: 0 }}>
                    <button onClick={() => setPreviewId(isPrev ? null : audio.id)} style={{ ...S.btn, padding: "5px 9px", fontSize: 11 }}>
                      {isPrev ? "⏹" : "▶"}
                    </button>
                    <button onClick={() => onPick(audio)} style={{ ...S.btnPrimary, padding: "5px 11px", fontSize: 12 }}>Elegir</button>
                  </div>
                </div>
                {isPrev && (
                  <audio src={audio.url} controls autoPlay style={{ width: "100%", marginTop: 8, height: 34 }} />
                )}
              </div>
            );
          })}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button onClick={onClose} style={S.btn}>Cancelar</button>
      </div>
    </ModalShell>
  );
}

// Crear/editar un audio en el almacén
function AudioLibraryFormModal({ initial, allTags = [], allComposers = [], onSave, onClose }) {
  const [title,       setTitle]       = useState(initial?.title || "");
  const [composer,    setComposer]    = useState(initial?.composer || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [tags,        setTags]        = useState(initial?.tags || []);
  const [url,         setUrl]         = useState(initial?.url || "");
  const [duration,    setDuration]    = useState(initial?.duration || null);
  const [detecting,   setDetecting]   = useState(false);
  const [error,       setError]       = useState("");

  // BUG FIX: cancelación de detecciones obsoletas también aquí
  const urlReqRef = useRef(0);
  const handleUrlChange = (newUrl) => {
    const trimmed = newUrl.trim();
    setUrl(trimmed);
    setError("");
    if (!trimmed) { setDuration(null); urlReqRef.current++; return; }

    setDetecting(true);
    const reqId    = ++urlReqRef.current;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) { setDetecting(false); return; }
    const ctx = new AudioCtx();
    fetchAudioBuffer(trimmed)
      .then((buf) => ctx.decodeAudioData(buf))
      .then((decoded) => {
        ctx.close();
        if (reqId !== urlReqRef.current) return;
        setDuration(Math.ceil(decoded.duration));
        setDetecting(false);
      })
      .catch(() => {
        try { ctx.close(); } catch {}
        if (reqId !== urlReqRef.current) return;
        setError("No se pudo verificar la URL del audio.");
        setDetecting(false);
      });
  };

  const canSave = title.trim() && url.trim() && duration && !detecting;

  const handleSave = () => {
    if (!canSave) return;
    onSave({
      id:          initial?.id || uid("audio"),
      title:       title.trim(),
      composer:    composer.trim(),
      description: description.trim(),
      tags,
      url:         url.trim(),
      duration,
      createdAt:   initial?.createdAt || Date.now(),
    });
  };

  return (
    <ModalShell width={480} align="top">
      <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 600, color: C.ink }}>{initial ? "Editar audio" : "Añadir audio al almacén"}</h3>

      <label style={S.label}>Título</label>
      <input style={{ ...S.input, marginBottom: 14 }} value={title} autoFocus
        onChange={(e) => setTitle(e.target.value)} placeholder="Ej: Coral nº 4 — Bach (BWV 28)" />

      <label style={S.label}>Compositor</label>
      <SuggestInput
        value={composer}
        onChange={setComposer}
        suggestions={allComposers}
        placeholder="Ej: Johann Sebastian Bach"
        style={{ ...S.input, marginBottom: 14 }}
      />

      <label style={S.label}>Descripción (opcional)</label>
      <textarea style={{ ...S.input, marginBottom: 14, minHeight: 60, resize: "vertical", fontFamily: FONT_SANS }}
        value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Tonalidad, contexto histórico…" />

      <label style={{ ...S.label, marginBottom: 4 }}>Etiquetas internas <span style={{ fontWeight: 400, color: C.muted }}>(solo visibles para el profesor)</span></label>
      <div style={{ marginBottom: 14 }}>
        <TagInput tags={tags} onChange={setTags} suggestions={allTags} />
        <div style={{ fontSize: 11, color: C.muted, marginTop: 5 }}>Pulsa Intro o coma para añadir · Ej: "Forma sonata", "Modulación cromática"</div>
      </div>

      <label style={S.label}>URL del audio</label>
      <input type="url" style={{ ...S.input, marginBottom: 6 }}
        value={url} onChange={(e) => handleUrlChange(e.target.value)} placeholder="https://res.cloudinary.com/…" />
      {detecting && <p style={{ fontSize: 12, color: C.muted, margin: "0 0 14px" }}>Verificando audio…</p>}
      {duration && !detecting && <p style={{ fontSize: 12, color: C.fnT, margin: "0 0 14px" }}>✓ Duración detectada: {fmt(duration)}</p>}
      <ErrorMsg>{error}</ErrorMsg>
      <div style={{ marginBottom: 8 }} />

      <div style={{ ...S.row, gap: 8, justifyContent: "flex-end" }}>
        <button onClick={onClose} style={S.btn}>Cancelar</button>
        <button onClick={handleSave} disabled={!canSave} style={{ ...S.btnPrimary, ...disabledStyle(canSave) }}>
          {initial ? "Guardar" : "Añadir"}
        </button>
      </div>
    </ModalShell>
  );
}

// Editor de pregunta (test o desarrollo)
function QuestionEditorModal({ initial, defaultStart, audioDuration, onSave, onClose }) {
  const [text,            setText]            = useState(initial?.text || "");
  const [type,            setType]            = useState(initial?.type || "test");
  const [audioStart,      setAudioStart]      = useState(initial?.audioStart ?? defaultStart ?? 0);
  const [audioEnd,        setAudioEnd]        = useState(initial?.audioEnd   ?? Math.min(audioDuration, (defaultStart ?? 0) + 10));
  const [options,         setOptions]         = useState(initial?.options || [
    { id: "A", text: "" }, { id: "B", text: "" }, { id: "C", text: "" },
  ]);
  const [correctOptionId, setCorrectOptionId] = useState(initial?.correctOptionId || "A");

  const updateOpt = (i, txt) => setOptions((prev) => prev.map((o, idx) => idx === i ? { ...o, text: txt } : o));
  const addOpt = () => {
    if (options.length >= 6) return;
    setOptions((prev) => [...prev, { id: String.fromCharCode(65 + prev.length), text: "" }]);
  };
  const removeOpt = (i) => {
    if (options.length <= 2) return;
    setOptions((prev) => {
      const next = prev.filter((_, idx) => idx !== i).map((o, idx) => ({ ...o, id: String.fromCharCode(65 + idx) }));
      if (correctOptionId && !next.some((o) => o.id === correctOptionId)) setCorrectOptionId(next[0].id);
      return next;
    });
  };

  const canSave =
    text.trim() &&
    audioEnd > audioStart &&
    (type !== "test" || (options.every((o) => o.text.trim()) && correctOptionId));

  const handleSave = () => {
    if (!canSave) return;
    onSave({
      id:         initial?.id || uid("q"),
      text:       text.trim(),
      type,
      audioStart: parseFloat(audioStart),
      audioEnd:   parseFloat(audioEnd),
      options:    type === "test" ? options.map((o) => ({ ...o, text: o.text.trim() })) : [],
      correctOptionId: type === "test" ? correctOptionId : null,
    });
  };

  return (
    <ModalShell width={560} align="top">
      <h3 style={{ margin: "0 0 18px", fontSize: 16, fontWeight: 600, color: C.ink }}>{initial ? "Editar pregunta" : "Nueva pregunta"}</h3>

      <label style={S.label}>Tipo</label>
      <div style={{ ...S.row, gap: 8, marginBottom: 14 }}>
        {[{ id: "test", label: "Tipo test" }, { id: "desarrollo", label: "Desarrollo" }].map((opt) => (
          <button key={opt.id} type="button" onClick={() => setType(opt.id)}
            style={{
              ...S.btn, flex: 1, fontSize: 12,
              background: type === opt.id ? C.ink   : C.paper,
              color:      type === opt.id ? C.paper : C.ink2,
              border:     `1px solid ${type === opt.id ? C.ink : C.line}`,
            }}>
            {opt.label}
          </button>
        ))}
      </div>

      <label style={S.label}>Pregunta</label>
      <textarea style={{ ...S.input, marginBottom: 14, minHeight: 60, resize: "vertical", fontFamily: FONT_SANS }}
        value={text} onChange={(e) => setText(e.target.value)}
        placeholder="¿Qué función armónica predomina en este fragmento?" autoFocus />

      <div style={{ ...S.row, gap: 10, marginBottom: 14 }}>
        <div style={{ flex: 1 }}>
          <label style={S.label}>Inicio (s)</label>
          <input type="number" min={0} max={audioDuration} step={0.1} style={S.input}
            value={audioStart} onChange={(e) => setAudioStart(parseFloat(e.target.value) || 0)} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={S.label}>Fin (s)</label>
          <input type="number" min={0} max={audioDuration} step={0.1} style={S.input}
            value={audioEnd} onChange={(e) => setAudioEnd(parseFloat(e.target.value) || 0)} />
        </div>
      </div>

      {type === "test" && (
        <>
          <label style={S.label}>Opciones (marca la correcta)</label>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
            {options.map((opt, i) => {
              const isCorrect = correctOptionId === opt.id;
              return (
                <div key={opt.id} style={{ ...S.row, gap: 8 }}>
                  <button type="button" onClick={() => setCorrectOptionId(opt.id)}
                    title={isCorrect ? "Esta es la opción correcta" : "Marcar como correcta"}
                    style={{
                      width: 32, height: 32, borderRadius: "50%",
                      background: isCorrect ? C.fnT : C.paper,
                      border:     `1.5px solid ${isCorrect ? C.fnT : C.line}`,
                      color:      isCorrect ? C.paper : C.muted,
                      cursor: "pointer", fontWeight: 700, fontSize: 13, fontFamily: FONT_MONO,
                      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                    }}>
                    {opt.id}
                  </button>
                  <input style={{ ...S.input, flex: 1 }} value={opt.text}
                    onChange={(e) => updateOpt(i, e.target.value)} placeholder={`Texto de la opción ${opt.id}`} />
                  <button onClick={() => removeOpt(i)} disabled={options.length <= 2}
                    style={{ ...S.btnDanger, padding: "5px 9px", fontSize: 11, ...disabledStyle(options.length > 2), flexShrink: 0 }}>×</button>
                </div>
              );
            })}
          </div>
          <button onClick={addOpt} disabled={options.length >= 6}
            style={{ ...S.btn, width: "100%", marginBottom: 18, fontSize: 12, ...disabledStyle(options.length < 6) }}>
            + Añadir opción
          </button>
        </>
      )}

      <div style={{ ...S.row, gap: 8, justifyContent: "flex-end" }}>
        <button onClick={onClose} style={S.btn}>Cancelar</button>
        <button onClick={handleSave} disabled={!canSave} style={{ ...S.btnPrimary, ...disabledStyle(canSave) }}>
          {initial ? "Guardar" : "Crear"}
        </button>
      </div>
    </ModalShell>
  );
}

// ═══ 14b. MULTI-MODEL SESSION VIEW ══════════════════════════════════════════
// Wrapper para ejercicios con dos modelos: gestiona el estado de alternancia
// y pasa la barra de toggle a cada vista como prop.
// El audio se decodifica UNA SOLA VEZ aquí y se comparte con todas las vistas
// para que cambiar de modelo no recargue ni re-decodifique el audio.
function MultiModelSessionView({ exercise, mode, onSubmit, onBack }) {
  const models = modelsOf(exercise);
  const [activeIdx, setActiveIdx] = useState(0);
  const activeModel = models[activeIdx] || models[0];

  // Audio compartido: decodificado una vez, persiste entre cambios de modelo
  const [sharedWaveformData, setSharedWaveformData] = useState(exercise.waveformData || null);
  const loopRegionRef = useRef(null);   // QuestionnaireView lo actualiza con su lockedQuestion
  const onWaveform    = sharedWaveformData ? null : (wd) => setSharedWaveformData(wd);
  const rawPlayer     = useAudioPlayer(exercise, { onWaveform, loopRegionRef });
  const sharedAudioPlayer = { ...rawPlayer, waveformData: sharedWaveformData };

  // Al cambiar de modelo, cancelar cualquier bucle de fragmento activo
  useEffect(() => { loopRegionRef.current = null; }, [activeModel]);

  const toggleNode = models.length > 1 ? (
    <ModelToggleBar models={models} activeIdx={activeIdx} onSwitch={setActiveIdx} />
  ) : null;

  // Cada vista tiene su propio estado de UI; al cambiar de modelo se desmonta
  // y vuelve a montar (React detecta el cambio de key). El audio, sin embargo,
  // vive aquí y se pasa como sharedAudioPlayer para no re-decodificar.
  if (activeModel === "esquema") {
    return (
      <div key={`schema-${exercise.id}`}>
        <SchemaExerciseView
          exercise={exercise}
          mode={mode}
          onSubmit={onSubmit}
          onBack={onBack}
          modelToggleNode={toggleNode}
          sharedAudioPlayer={sharedAudioPlayer}
        />
      </div>
    );
  }
  if (activeModel === "cuestionario") {
    return (
      <div key={`quiz-${exercise.id}`}>
        <QuestionnaireView
          exercise={exercise}
          onSubmit={onSubmit}
          onBack={onBack}
          modelToggleNode={toggleNode}
          sharedAudioPlayer={sharedAudioPlayer}
          loopRegionRef={loopRegionRef}
        />
      </div>
    );
  }
  return (
    <div key={`interactive-${exercise.id}`}>
      <ExerciseView
        exercise={exercise}
        mode={mode}
        onSubmit={onSubmit}
        onBack={onBack}
        modelToggleNode={toggleNode}
        sharedAudioPlayer={sharedAudioPlayer}
      />
    </div>
  );
}

// ═══ 15. APP ROOT ═══════════════════════════════════════════════════════════
export default function App() {
  useInjectFonts();

  // Ref al cliente Supabase — se carga dinámicamente; null en el visor de artefactos
  const supabaseRef = useRef(null);

  // Estado global
  const [exercises,    setExercises]    = useState(INIT_EXERCISES);
  const [users,        setUsers]        = useState([]);
  const [results,      setResults]      = useState({});   // { userId: { exerciseId: result } }
  const [margin,       setMargin]       = useState(1);
  const [categories,   setCategories]   = useState([DEFAULT_CATEGORY]);
  const [courses,      setCourses]      = useState([]);
  const [units,        setUnits]        = useState([]);
  const [groups,       setGroups]       = useState([]);
  const [audioLibrary, setAudioLibrary] = useState(INIT_AUDIO_LIBRARY);

  const [dbReady, setDbReady] = useState(false);
  const [user,    setUser]    = useState(null);

  // Navegación — la URL (#/…) es la fuente de verdad
  const { route, navigate } = useHashRoute();
  const [lastResult,   setLastResult]     = useState(null);
  const [guestResults, setGuestResults]   = useState({});
  const [pickingTeacher, setPickingTeacher] = useState(false);
  const redirectAfterLogin = useRef(null);   // enlace profundo a recuperar tras login

  const [pendingLoginUser, setPendingLoginUser] = useState(null); // alumno esperando configurar correo de recuperación
  const [showForgotPin,    setShowForgotPin]    = useState(false);
  const [resetSession,     setResetSession]     = useState(null);  // sesión Supabase Auth desde magic link

  // Ejercicio referenciado por la URL (reconstruido desde el id)
  const routeExercise = useMemo(() => {
    const exId = route.params?.exId;
    if (!exId || exId === "nuevo") return null;
    // Los ids de la URL son texto; los del modelo pueden ser numéricos → comparar como texto
    return (exercises || []).find((e) => String(e.id) === String(exId)) || null;
  }, [route, exercises]);
  const exCtx = routeExercise
    ? { exercise: routeExercise, mode: route.params?.mode || "student" }
    : null;
  const qmCtx = routeExercise ? { exercise: routeExercise } : null;
  const loginRole = route.name === "login" ? route.params.role : null;

  // ─── Carga inicial desde Supabase (import dinámico) ─────────────────────
  // En la web, el import resuelve y carga datos reales.
  // En el visor de artefactos de Claude, el import falla silenciosamente y
  // la app arranca en modo "en memoria" con los datos semilla (INIT_EXERCISES).
  useEffect(() => {
    (async () => {
      try {
        // Intentar cargar el cliente de Supabase dinámicamente
        try {
          const mod = await import("./supabase.js");
          supabaseRef.current = mod.supabase;
          // Detectar sesión desde magic link de recuperación de PIN
          const { data: { session: magicSession } } = await mod.supabase.auth.getSession();
          if (magicSession) {
            setResetSession(magicSession);
            window.history.replaceState(null, "", "#/");
          }
        } catch {
          // Entorno de previsualización: sin backend — modo en memoria
          setDbReady(true);
          return;
        }

        const sb = supabaseRef.current;
        const [
          exRes, userRes, catRes, courseRes, unitRes,
          resultRes, settingsRes, audioRes, groupRes,
        ] = await Promise.all([
          sb.from("fa_exercises").select("*"),
          sb.from("fa_users").select("*"),
          sb.from("fa_categories").select("*"),
          sb.from("fa_courses").select("*"),
          sb.from("fa_units").select("*"),
          sb.from("fa_results").select("*"),
          sb.from("fa_settings").select("*"),
          sb.from("fa_audio_library").select("*"),
          sb.from("fa_groups").select("*"),
        ]);

        if (exRes.data?.length)     setExercises(exRes.data.map((r) => r.data));
        if (userRes.data?.length)   setUsers(userRes.data.map((r) => r.data));
        if (catRes.data?.length) {
          const loaded = catRes.data.map((r) => r.data);
          // Asegura que la categoría por defecto esté presente
          if (!loaded.find((c) => c.id === "default")) setCategories([DEFAULT_CATEGORY, ...loaded]);
          else setCategories(loaded);
        }
        if (courseRes.data?.length) setCourses(courseRes.data.map((r) => r.data));
        if (unitRes.data?.length)   setUnits(unitRes.data.map((r) => r.data));
        if (audioRes.data?.length)  setAudioLibrary(audioRes.data.map((r) => r.data));
        if (groupRes.data?.length)  setGroups(groupRes.data.map((r) => r.data));

        if (resultRes.data?.length) {
          const byUser = {};
          resultRes.data.forEach((row) => {
            if (!byUser[row.user_id]) byUser[row.user_id] = {};
            byUser[row.user_id][row.exercise_id] = row.data;
          });
          setResults(byUser);
        }

        if (settingsRes.data?.length) {
          const m = settingsRes.data.find((s) => s.key === "margin");
          if (m?.value != null) setMargin(Number(m.value));
        }
      } catch (e) {
        console.error("Error cargando datos de Supabase:", e);
      } finally {
        setDbReady(true);
      }
    })();
  }, []);

  // ─── Helpers de upsert ───────────────────────────────────────────────────
  // Todos los helpers comprueban si el cliente existe; si no (modo en memoria),
  // simplemente retornan sin hacer nada: el estado React ya se actualizó.
  const dbUpsertExercise = async (ex) => {
    const sb = supabaseRef.current; if (!sb) return;
    // El waveform decodificado puede pesar mucho; no se guarda en Supabase.
    // eslint-disable-next-line no-unused-vars
    const { waveformData, ...rest } = ex;
    await sb.from("fa_exercises").upsert({ id: ex.id, data: rest });
  };
  const dbDeleteExercise = async (id) => { const sb = supabaseRef.current; if (!sb) return; await sb.from("fa_exercises").delete().eq("id", id); };

  const dbUpsertUser   = async (u)  => { const sb = supabaseRef.current; if (!sb) return; await sb.from("fa_users").upsert({ id: u.id, data: u }); };
  const dbDeleteUser   = async (id) => { const sb = supabaseRef.current; if (!sb) return; await sb.from("fa_users").delete().eq("id", id); };

  const dbUpsertCategory = async (c)  => { const sb = supabaseRef.current; if (!sb) return; await sb.from("fa_categories").upsert({ id: c.id, data: c }); };
  const dbDeleteCategory = async (id) => { const sb = supabaseRef.current; if (!sb) return; await sb.from("fa_categories").delete().eq("id", id); };

  const dbUpsertCourse = async (c)  => { const sb = supabaseRef.current; if (!sb) return; await sb.from("fa_courses").upsert({ id: c.id, data: c }); };
  const dbDeleteCourse = async (id) => { const sb = supabaseRef.current; if (!sb) return; await sb.from("fa_courses").delete().eq("id", id); };

  const dbUpsertUnit = async (u)  => { const sb = supabaseRef.current; if (!sb) return; await sb.from("fa_units").upsert({ id: u.id, data: u }); };
  const dbDeleteUnit = async (id) => { const sb = supabaseRef.current; if (!sb) return; await sb.from("fa_units").delete().eq("id", id); };

  const dbUpsertResult = async (userId, exerciseId, data) => {
    const sb = supabaseRef.current; if (!sb) return;
    await sb.from("fa_results").upsert({ user_id: userId, exercise_id: exerciseId, data });
  };
  const dbDeleteResultsForUser     = async (userId)     => { const sb = supabaseRef.current; if (!sb) return; await sb.from("fa_results").delete().eq("user_id", userId); };
  const dbDeleteResultsForExercise = async (exerciseId) => { const sb = supabaseRef.current; if (!sb) return; await sb.from("fa_results").delete().eq("exercise_id", exerciseId); };

  const dbUpsertSetting = async (key, value) => { const sb = supabaseRef.current; if (!sb) return; await sb.from("fa_settings").upsert({ key, value }); };

  const dbUpsertAudio = async (a)  => { const sb = supabaseRef.current; if (!sb) return; await sb.from("fa_audio_library").upsert({ id: a.id, data: a }); };
  const dbDeleteAudio = async (id) => { const sb = supabaseRef.current; if (!sb) return; await sb.from("fa_audio_library").delete().eq("id", id); };

  const dbUpsertGroup = async (g)  => { const sb = supabaseRef.current; if (!sb) return; await sb.from("fa_groups").upsert({ id: g.id, data: g }); };
  const dbDeleteGroup = async (id) => { const sb = supabaseRef.current; if (!sb) return; await sb.from("fa_groups").delete().eq("id", id); };

  // ─── Users ───────────────────────────────────────────────────────────────
  const addUser = (newUser) => {
    setUsers((prev) => [...prev, newUser]);
    dbUpsertUser(newUser);
  };

  const removeUser = (userId) => {
    setUsers((prev) => prev.filter((u) => u.id !== userId));
    setResults((prev) => { const next = { ...prev }; delete next[userId]; return next; });
    let changedGroups = [];
    setGroups((prev) => {
      changedGroups = [];
      const next = prev.map((g) => {
        if (!g.studentIds?.includes(userId)) return g;
        const updated = { ...g, studentIds: g.studentIds.filter((id) => id !== userId) };
        changedGroups.push(updated);
        return updated;
      });
      return next;
    });
    changedGroups.forEach((g) => dbUpsertGroup(g));
    dbDeleteUser(userId);
    dbDeleteResultsForUser(userId);
  };

  const updateUser = (updatedUser) => {
    setUsers((prev) => prev.map((u) => u.id === updatedUser.id ? updatedUser : u));
    if (user?.id === updatedUser.id) setUser(updatedUser);
    dbUpsertUser(updatedUser);
  };

  // ─── Correction save ─────────────────────────────────────────────────────
  const saveCorrection = (studentId, exerciseId, correction) => {
    let saved = null;
    setResults((prev) => {
      const existing = (prev[studentId] || {})[exerciseId] || {};
      const updated  = { ...existing, teacherCorrection: { ...correction, corrected: true } };
      saved = updated;
      return { ...prev, [studentId]: { ...(prev[studentId] || {}), [exerciseId]: updated } };
    });
    if (saved) dbUpsertResult(studentId, exerciseId, saved);
  };

  // ─── Groups ──────────────────────────────────────────────────────────────
  const addGroup    = (g) => { setGroups((prev) => [...prev, g]); dbUpsertGroup(g); };
  const updateGroup = (g) => { setGroups((prev) => prev.map((x) => x.id === g.id ? g : x)); dbUpsertGroup(g); };
  const deleteGroup = (id) => { setGroups((prev) => prev.filter((g) => g.id !== id)); dbDeleteGroup(id); };

  // ─── Setup inicial (primer admin) ────────────────────────────────────────
  const handleSetup = (adminUser) => {
    setUsers([adminUser]);
    setUser(adminUser);
    navigate("/profesor");
    dbUpsertUser(adminUser);
  };

  // ─── Exercises ───────────────────────────────────────────────────────────
  const addExercise = (newEx) => {
    setExercises((prev) => [...prev, newEx]);
    dbUpsertExercise(newEx);
  };

  const updateExercise = (id, patch) => {
    let updated = null;
    setExercises((prev) => {
      const next = prev.map((e) => e.id === id ? { ...e, ...patch } : e);
      updated = next.find((e) => e.id === id) || null;
      return next;
    });
    if (updated) dbUpsertExercise(updated);
  };

  const deleteExercise = (id) => {
    setExercises((prev) => prev.filter((e) => e.id !== id));
    let changedUnits = [];
    setUnits((prev) => {
      changedUnits = [];
      const next = prev.map((u) => {
        if (!u.exerciseIds.includes(id)) return u;
        const nu = { ...u, exerciseIds: u.exerciseIds.filter((eid) => eid !== id) };
        changedUnits.push(nu);
        return nu;
      });
      return next;
    });
    changedUnits.forEach((u) => dbUpsertUnit(u));
    setResults((prev) => {
      const next = {};
      for (const uid of Object.keys(prev)) {
        const sub = { ...prev[uid] };
        delete sub[id];
        next[uid] = sub;
      }
      return next;
    });
    dbDeleteExercise(id);
    dbDeleteResultsForExercise(id);
  };

  // ─── Categories ──────────────────────────────────────────────────────────
  const addCategory = (newCat) => {
    setCategories((prev) => [...prev, newCat]);
    dbUpsertCategory(newCat);
  };
  const updateCategory = (updatedCat) => {
    setCategories((prev) => prev.map((c) => c.id === updatedCat.id ? updatedCat : c));
    dbUpsertCategory(updatedCat);
  };
  const deleteCategory = (id) => {
    if (id === "default") return;
    setCategories((prev) => prev.filter((c) => c.id !== id));
    dbDeleteCategory(id);
  };
  const toggleGlobalCategory = (id) => {
    let cat = null;
    setCategories((prev) => {
      const updated = prev.map((c) => c.id === id ? { ...c, global: !c.global } : c);
      cat = updated.find((c) => c.id === id) || null;
      return updated;
    });
    if (cat) dbUpsertCategory(cat);
  };

  // ─── Courses ─────────────────────────────────────────────────────────────
  const addCourse = (newCourse) => {
    setCourses((prev) => [...prev, newCourse]);
    dbUpsertCourse(newCourse);
  };
  const updateCourse = (updated) => {
    setCourses((prev) => prev.map((c) => c.id === updated.id ? updated : c));
    dbUpsertCourse(updated);
  };
  const deleteCourse = (id) => {
    setCourses((prev) => prev.filter((c) => c.id !== id));
    dbDeleteCourse(id);
  };

  // ─── Units (con fix de race condition usando setState callback) ─────────
  const addUnit = (newUnit, courseId) => {
    setUnits((prev) => [...prev, newUnit]);
    let updatedCourse = null;
    setCourses((prev) => {
      const next = prev.map((c) => c.id === courseId ? { ...c, unitIds: [...c.unitIds, newUnit.id] } : c);
      updatedCourse = next.find((c) => c.id === courseId) || null;
      return next;
    });
    if (updatedCourse) dbUpsertCourse(updatedCourse);
    dbUpsertUnit(newUnit);
  };

  const updateUnit = (updated) => {
    setUnits((prev) => prev.map((u) => u.id === updated.id ? updated : u));
    dbUpsertUnit(updated);
  };

  const deleteUnit = (unitId, courseId) => {
    setUnits((prev) => prev.filter((u) => u.id !== unitId));
    let updatedCourse = null;
    setCourses((prev) => {
      const next = prev.map((c) => c.id === courseId ? { ...c, unitIds: c.unitIds.filter((id) => id !== unitId) } : c);
      updatedCourse = next.find((c) => c.id === courseId) || null;
      return next;
    });
    if (updatedCourse) dbUpsertCourse(updatedCourse);
    dbDeleteUnit(unitId);
  };

  const addExercisesToUnit = (unitId, exIds) => {
    let updated = null;
    setUnits((prev) => {
      const next = prev.map((u) => {
        if (u.id !== unitId) return u;
        const merged = [...u.exerciseIds, ...exIds.filter((id) => !u.exerciseIds.includes(id))];
        return { ...u, exerciseIds: merged };
      });
      updated = next.find((u) => u.id === unitId) || null;
      return next;
    });
    if (updated) dbUpsertUnit(updated);
  };

  const removeExerciseFromUnit = (unitId, exId) => {
    let updated = null;
    setUnits((prev) => {
      const next = prev.map((u) => u.id === unitId ? { ...u, exerciseIds: u.exerciseIds.filter((id) => id !== exId) } : u);
      updated = next.find((u) => u.id === unitId) || null;
      return next;
    });
    if (updated) dbUpsertUnit(updated);
  };

  // ─── Audio library ───────────────────────────────────────────────────────
  const addAudio = (a) => {
    setAudioLibrary((prev) => [...prev, a]);
    dbUpsertAudio(a);
  };
  const updateAudio = (a) => {
    setAudioLibrary((prev) => prev.map((x) => x.id === a.id ? a : x));
    dbUpsertAudio(a);
  };
  const deleteAudio = (id) => {
    setAudioLibrary((prev) => prev.filter((x) => x.id !== id));
    dbDeleteAudio(id);
  };

  // ─── Margin (settings) ───────────────────────────────────────────────────
  const updateMargin = (m) => { setMargin(m); dbUpsertSetting("margin", m); };

  // ─── Navegación helpers ──────────────────────────────────────────────────
  const freshExercise = (ex) => exercises.find((e) => e.id === ex.id) || ex;

  // Si entras sin sesión a una ruta protegida, recuérdala para volver tras login
  useEffect(() => {
    if (user) return;
    const open = route.name === "home" || route.name === "login" || route.name === "setup";
    if (!open) {
      redirectAfterLogin.current = window.location.hash.replace(/^#/, "") || null;
    }
  }, [user, route]);

  const openCorrection = (ex) => {
    // Calcular el resultado almacenado de forma local: no depende del `const
    // userResults` declarado más abajo en el cuerpo del componente, lo que
    // evita una referencia frágil en la zona muerta temporal (TDZ).
    const stored = user?.isGuest
      ? guestResults[ex.id]
      : (results[user?.id] || {})[ex.id];
    if (!stored) return;
    setLastResult(stored);
    navigate(`/alumno/ejercicio/${ex.id}/correccion`);
  };

  const openEx = (ex, mode = "student") => {
    if (mode === "record") {
      // El cuestionario puro se "graba" desde el gestor de preguntas.
      // Los híbridos tienen su propio botón onManageQuestions; aquí se graba la clave interactiva.
      if (modelsOf(ex).join(",") === "cuestionario") navigate(`/profesor/ejercicio/${ex.id}/preguntas`);
      else navigate(`/profesor/ejercicio/${ex.id}/grabar`);
    } else {
      navigate(`/alumno/ejercicio/${ex.id}`);
    }
  };

  const openQM = (ex) => navigate(`/profesor/ejercicio/${ex.id}/preguntas`);

  // Finalizar el login una vez que el alumno ya tiene (o ha saltado) el correo de recuperación
  const completeLogin = (u) => {
    setUser(u);
    const dest = redirectAfterLogin.current;
    redirectAfterLogin.current = null;
    if (u.role === "student") {
      const hasTeacher = (users || []).some((x) => x.role === "teacher" && x.id === u.teacherId);
      if (!u.teacherId || !hasTeacher) { setPickingTeacher(true); return; }
      navigate(dest && dest.startsWith("/alumno") ? dest : "/alumno");
    } else {
      navigate(dest && dest.startsWith("/profesor") ? dest : "/profesor");
    }
  };

  // ─── Submit de respuestas (alumno entrega ejercicio) ────────────────────
  const submitAnswer = (payload) => {
    if (!exCtx) return;
    const ex      = freshExercise(exCtx.exercise);
    const isGuest = user?.isGuest;
    const activePalette = effectivePaletteId(ex, user?.defaultPalette);

    // Cuestionario
    if (payload?.type === "cuestionario") {
      const data = { type: "cuestionario", answers: payload.answers, score: payload.score, schemaPalette: activePalette, timestamp: Date.now() };
      if (isGuest) {
        setGuestResults((prev) => ({ ...prev, [ex.id]: data }));
      } else if (user) {
        setResults((prev) => ({ ...prev, [user.id]: { ...(prev[user.id] || {}), [ex.id]: data } }));
        dbUpsertResult(user.id, ex.id, data);
      }
      setLastResult(data);
      navigate(`/alumno/ejercicio/${ex.id}/correccion`);
      return;
    }

    // Esquema
    if (payload?.type === "esquema") {
      if (payload.mode === "record") {
        // El profesor guarda el esquema como modelo de referencia (con su paleta)
        updateExercise(ex.id, { schemaKey: payload.blocks, schemaPalette: payload.schemaPalette ?? SCHEMA_PALETTE_DEFAULT });
        navigate("/profesor");
        return;
      }
      // Modo preview (profesor prueba) o alumno: ambos van a CorrectionView
      const placementScore = calcSchemaPlacementScore(ex.schemaKey, payload.blocks);
      const data = { type: "esquema", blocks: payload.blocks, placementScore, schemaPalette: payload.schemaPalette ?? SCHEMA_PALETTE_DEFAULT, timestamp: Date.now() };
      if (payload.mode !== "preview") {
        // Solo guardar si es un alumno real
        if (isGuest) {
          setGuestResults((prev) => ({ ...prev, [ex.id]: data }));
        } else if (user) {
          setResults((prev) => ({ ...prev, [user.id]: { ...(prev[user.id] || {}), [ex.id]: data } }));
          dbUpsertResult(user.id, ex.id, data);
        }
      }
      setLastResult(data);
      navigate(payload.mode === "preview"
        ? `/profesor/ejercicio/${ex.id}/correccion`
        : `/alumno/ejercicio/${ex.id}/correccion`);
      return;
    }

    // Interactivo: payload = { entries: [{ categoryId, intervals }], currentCategoryId }
    const entries          = payload.entries || [];
    const currentCategoryId = payload.currentCategoryId || entries[0]?.categoryId || "default";
    const cats             = categoriesOf(ex);

    const scoreFor = (categoryId, intervals) => {
      const key = answerFor(ex, categoryId);
      if (!key.length) return null;
      return calcScore(key, intervals, ex.duration, margin);
    };

    if (exCtx.mode === "record") {
      // Guardar como clave del profesor
      const patchAnswers = { ...(ex.answers || {}) };
      entries.forEach(({ categoryId, intervals }) => { patchAnswers[categoryId] = intervals; });
      updateExercise(ex.id, { answers: patchAnswers });
      navigate("/profesor");
      return;
    }

    // Modo alumno: el "principal" es el currentCategoryId
    const mainEntry  = entries.find((e) => e.categoryId === currentCategoryId) || entries[0];
    const mainIvs    = mainEntry?.intervals || [];
    const mainScore  = scoreFor(currentCategoryId, mainIvs);

    const extras = entries
      .filter((e) => e.categoryId !== currentCategoryId)
      .map((e) => ({
        categoryId: e.categoryId,
        intervals:  e.intervals,
        score:      scoreFor(e.categoryId, e.intervals),
      }));

    const data = {
      categoryId: currentCategoryId,
      intervals:  mainIvs,
      score:      mainScore,
      extras,
      schemaPalette: activePalette,
      timestamp:  Date.now(),
    };
    // eslint-disable-next-line no-unused-vars
    const _catsCount = cats.length;

    if (isGuest) {
      setGuestResults((prev) => ({ ...prev, [ex.id]: data }));
    } else if (user) {
      setResults((prev) => ({ ...prev, [user.id]: { ...(prev[user.id] || {}), [ex.id]: data } }));
      dbUpsertResult(user.id, ex.id, data);
    }
    setLastResult(data);
    navigate(`/alumno/ejercicio/${ex.id}/correccion`);
  };

  // ─── Routing ─────────────────────────────────────────────────────────────
  if (!dbReady) {
    return (
      <div style={{ ...S.app, display: "flex", alignItems: "center", justifyContent: "center", color: C.muted, fontSize: 14 }}>
        Cargando…
      </div>
    );
  }

  // Setup inicial: aún no hay admin
  const hasAdmin = (users || []).some((u) => u.role === "admin");
  if (!hasAdmin) return <SetupView onSetup={handleSetup} />;

  // Selección de profesor para alumno (al primer login o desde "Cambiar profesor")
  if ((pickingTeacher || route.name === "pick-teacher") && user?.role === "student") {
    const teacherList = (users || []).filter((u) => u.role === "teacher");
    return (
      <TeacherPickerView
        teachers={teacherList}
        currentTeacherId={user.teacherId}
        onPick={(t) => { const upd = { ...user, teacherId: t.id }; updateUser(upd); setPickingTeacher(false); navigate("/alumno"); }}
        onLogout={() => { setUser(null); setPickingTeacher(false); navigate("/"); }}
      />
    );
  }

  // Login flow
  if (!user) {
    // 1. Recuperar acceso desde magic link enviado por correo
    if (resetSession) {
      return (
        <ResetPinView
          users={users}
          supabaseSession={resetSession}
          onReset={async (updatedUser) => {
            updateUser(updatedUser);
            const sb = supabaseRef.current;
            if (sb) await sb.auth.signOut();
            setResetSession(null);
            navigate("/");
          }}
          onBack={async () => {
            const sb = supabaseRef.current;
            if (sb) await sb.auth.signOut();
            setResetSession(null);
            navigate("/");
          }}
        />
      );
    }

    // 2. Primer login de alumno sin correo de recuperación configurado
    if (pendingLoginUser) {
      return (
        <RecoveryEmailModal
          onSave={async (email) => {
            const updated = { ...pendingLoginUser, recoveryEmail: email };
            setUsers((prev) => prev.map((u) => u.id === updated.id ? updated : u));
            await dbUpsertUser(updated);
            setPendingLoginUser(null);
            completeLogin(updated);
          }}
          onSkip={() => {
            setPendingLoginUser(null);
            completeLogin(pendingLoginUser);
          }}
        />
      );
    }

    // 3. Vista "He olvidado mi PIN"
    if (showForgotPin) {
      return (
        <ForgotPinView
          users={users}
          supabaseRef={supabaseRef}
          onBack={() => setShowForgotPin(false)}
        />
      );
    }

    const finishLogin = (u) => {
      if (u.role === "student" && !u.recoveryEmail) {
        setPendingLoginUser(u);
        return;
      }
      completeLogin(u);
    };

    if (loginRole) {
      const labels = { admin: "administrador", teacher: "profesor", student: "alumno" };
      return (
        <LoginView
          roleLabel={labels[loginRole]}
          filterRole={loginRole}
          users={users}
          onLogin={finishLogin}
          onBack={() => navigate("/")}
          onForgotPin={loginRole === "student" ? () => setShowForgotPin(true) : null}
          onGuest={loginRole === "student" ? () => {
            const guest = { id: `guest-${Date.now()}`, displayName: "Invitado", role: "student", isGuest: true };
            setUser(guest); navigate("/alumno");
          } : null}
        />
      );
    }
    return (
      <HomeView
        onTeacher={() => navigate("/entrar/profesor")}
        onStudent={() => navigate("/entrar/alumno")}
      />
    );
  }

  // Vistas autenticadas
  const onLogout = () => { setUser(null); setGuestResults({}); navigate("/"); };
  const userResults = user.isGuest ? guestResults : (results[user.id] || {});
  const isStudent = user.role === "student";

  // Mensaje cuando el ejercicio referenciado por la URL no existe (o no cargó)
  const NotFound = ({ to }) => (
    <div style={{ ...S.app, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, color: C.muted, fontSize: 14, padding: 24, textAlign: "center" }}>
      <span>No se encontró este ejercicio.</span>
      <button style={S.btn} onClick={() => navigate(to)}>← Volver</button>
    </div>
  );

  // ── Sesión de ejercicio (interactivo / esquema / cuestionario) ──
  if (route.name === "session") {
    const back = isStudent ? "/alumno" : "/profesor";
    // Un alumno no puede entrar a modos de profesor
    if (isStudent && exCtx?.mode !== "student") { navigate("/alumno"); return null; }
    if (!exCtx) return <NotFound to={back} />;
    const exModels = modelsOf(exCtx.exercise);
    const onBack = () => navigate(exCtx.mode === "record" || exCtx.mode === "preview" ? "/profesor" : "/alumno");
    // Paleta efectiva = la del ejercicio, o la preferida por el usuario, o P1.
    const sessionPalette = effectivePaletteId(exCtx.exercise, user?.defaultPalette);
    const sessionExercise = applyPaletteToExercise(exCtx.exercise, sessionPalette);
    // Ejercicio con dos modelos: wrapper de alternancia (alumno y preview del profesor)
    if (exModels.length > 1 && (exCtx.mode === "student" || exCtx.mode === "preview")) {
      return <MultiModelSessionView exercise={sessionExercise} mode={exCtx.mode} onSubmit={submitAnswer} onBack={onBack} />;
    }
    // Ejercicio de un solo modelo (o modo record/preview con el modelo primario)
    const m = exModels[0];
    if (m === "esquema") {
      return <SchemaExerciseView exercise={sessionExercise} mode={exCtx.mode} onSubmit={submitAnswer} onBack={onBack} />;
    }
    if (exCtx.mode === "student" && m === "cuestionario") {
      return <QuestionnaireView exercise={sessionExercise} onSubmit={submitAnswer} onBack={onBack} />;
    }
    return <ExerciseView exercise={sessionExercise} mode={exCtx.mode} onSubmit={submitAnswer} onBack={onBack} />;
  }

  // ── Gestor de preguntas (cuestionario) ──
  if (route.name === "question-manager") {
    if (isStudent) { navigate("/alumno"); return null; }
    if (!qmCtx) return <NotFound to="/profesor" />;
    return (
      <QuestionManagerView
        exercise={qmCtx.exercise}
        onSave={(questions) => { updateExercise(qmCtx.exercise.id, { questions }); navigate("/profesor"); }}
        onBack={() => navigate("/profesor")}
      />
    );
  }

  // ── Corrección (depende del resultado recién entregado) ──
  if (route.name === "correction") {
    const back = route.params.from === "teacher" ? "/profesor" : "/alumno";
    if (!exCtx) return <NotFound to={back} />;
    if (!lastResult) {
      // La corrección no se puede reconstruir desde un enlace pegado/recargado
      return <NotFound to={exCtx ? `/alumno/ejercicio/${exCtx.exercise.id}` : back} />;
    }
    const wasPreview = route.params.from === "teacher";
    const corrPalette = effectivePaletteId({ schemaPalette: lastResult?.schemaPalette }, user?.defaultPalette);
    return (
      <CorrectionView
        exercise={applyPaletteToExercise(freshExercise(exCtx.exercise), corrPalette)}
        result={lastResult} margin={margin}
        onBack={() => { setLastResult(null); navigate(wasPreview ? "/profesor" : "/alumno"); }}
      />
    );
  }

  // ── Panel del alumno ──
  if (isStudent) {
    const visibleExercises = exercises; // (heurística actual: banco completo)
    return (
      <StudentDash
        user={user}
        exercises={visibleExercises}
        results={userResults}
        courses={courses}
        units={units}
        groups={groups}
        tab={route.name === "student" ? route.params.tab : "all"}
        onTab={(t) => navigate(t === "courses" ? "/alumno/cursos" : "/alumno")}
        onExercise={(ex) => openEx(ex, "student")}
        onViewCorrection={openCorrection}
        onLogout={onLogout}
        onChangeTeacher={user.isGuest ? null : () => navigate("/alumno/elegir-profesor")}
        onUpdatePalette={(id) => updateUser({ ...user, defaultPalette: id })}
      />
    );
  }

  // ── Panel del profesor / admin ──
  return (
    <TeacherDash
      currentUser={user}
      users={users}
      onAddUser={addUser}
      onRemoveUser={removeUser}
      onUpdateUser={updateUser}
      exercises={exercises}
      onUpdateExercise={updateExercise}
      onDeleteExercise={deleteExercise}
      results={results}
      margin={margin} onMargin={updateMargin}
      tab={route.name === "teacher" ? route.params.tab : "exercises"}
      onTab={(t) => navigate(TEACHER_TAB_PATH[t] || "/profesor")}
      detailExId={route.name === "teacher-detail" ? (route.params.exId === "nuevo" ? "new" : route.params.exId) : null}
      onSelectExercise={(id) => {
        if (id == null) navigate(route.name === "teacher" ? (TEACHER_TAB_PATH[route.params.tab] || "/profesor") : "/profesor");
        else if (id === "new") navigate("/profesor/ejercicio/nuevo");
        else navigate(`/profesor/ejercicio/${id}`);
      }}
      onRecord={(ex) => openEx(freshExercise(ex), "record")}
      onManageQuestions={(ex) => navigate(`/profesor/ejercicio/${ex.id}/preguntas`)}
      onPreview={(ex) => navigate(`/profesor/ejercicio/${ex.id}/previsualizar`)}
      onAdd={addExercise}
      onLogout={onLogout}
      categories={categories}
      onAddCategory={addCategory}
      onUpdateCategory={updateCategory}
      onDeleteCategory={deleteCategory}
      onToggleGlobalCategory={toggleGlobalCategory}
      courses={courses} units={units}
      onAddCourse={addCourse} onUpdateCourse={updateCourse} onDeleteCourse={deleteCourse}
      onAddUnit={addUnit} onUpdateUnit={updateUnit} onDeleteUnit={deleteUnit}
      onAddExercisesToUnit={addExercisesToUnit}
      onRemoveExerciseFromUnit={removeExerciseFromUnit}
      groups={groups} onAddGroup={addGroup} onUpdateGroup={updateGroup} onDeleteGroup={deleteGroup}
      onSaveCorrection={saveCorrection}
      audioLibrary={audioLibrary}
      onAddAudio={addAudio} onUpdateAudio={updateAudio} onDeleteAudio={deleteAudio}
    />
  );
}
