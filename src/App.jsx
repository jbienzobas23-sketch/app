import { useState, useEffect, useRef, useMemo } from "react";
import { supabase } from "./supabase.js";

/* ═══════════════════════════════════════════════════════════════════════════
   FUNCIONES ARMÓNICAS · APP ROOT
   ───────────────────────────────────────────────────────────────────────────
   Estructura del archivo:
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

// ═══ 1. DESIGN TOKENS ═══════════════════════════════════════════════════════
const C = {
  bg: "#ECE7DA", paper: "#F5F0E5", paper2: "#EDE8DC",
  ink: "#1C1A14", ink2: "#3D3A2F", muted: "#7A7460", muted2: "#B0AA96", line: "#D8D2C0",
  fnT: "#3F9B5B", fnS: "#2F6FB8", fnD: "#C77A1A",
  fnI: "#9A4FB8", fnIV: "#3A8CA8", fnV: "#C9A33A",
  quiz: "#2F6FB8",
  danger: "#B84A3A",
};

const FONT_SANS  = "'Geist', 'Inter', system-ui, -apple-system, sans-serif";
const FONT_SERIF = "'Fraunces', Georgia, 'Times New Roman', serif";
const FONT_MONO  = "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

const S = {
  app:        { fontFamily: FONT_SANS, background: C.bg, minHeight: "100vh", color: C.ink },
  page:       { maxWidth: 780, margin: "0 auto", padding: "1.5rem 1rem" },
  card:       { background: C.paper, border: `1px solid ${C.line}`, borderRadius: 12, padding: "1.25rem 1.5rem", marginBottom: 14 },
  h1:         { fontSize: 26, fontWeight: 600, margin: "0 0 4px", color: C.ink, letterSpacing: -0.8, fontFamily: FONT_SERIF },
  h2:         { fontSize: 19, fontWeight: 600, margin: "0 0 12px", color: C.ink, fontFamily: FONT_SERIF },
  label:      { fontSize: 11, color: C.muted, marginBottom: 5, display: "block", textTransform: "uppercase", letterSpacing: 0.7, fontWeight: 600 },
  btn:        { background: C.paper, border: `1px solid ${C.line}`, color: C.ink2, borderRadius: 7, padding: "8px 16px", cursor: "pointer", fontSize: 13, transition: "all .15s", fontFamily: FONT_SANS },
  btnPrimary: { background: C.ink, border: `1px solid ${C.ink}`, color: C.paper, borderRadius: 7, padding: "9px 18px", cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: FONT_SANS },
  btnDanger:  { background: "transparent", border: `1px solid ${C.danger}`, color: C.danger, borderRadius: 7, padding: "6px 14px", cursor: "pointer", fontSize: 12, fontFamily: FONT_SANS },
  input:      { background: C.paper2, border: `1px solid ${C.line}`, borderRadius: 8, color: C.ink, padding: "9px 12px", fontSize: 14, width: "100%", boxSizing: "border-box", fontFamily: FONT_SANS },
  row:        { display: "flex", alignItems: "center", gap: 10 },
  badge:      { fontSize: 10, padding: "2px 7px", borderRadius: 4, fontWeight: 600, letterSpacing: 0.4 },
  divider:    { border: "none", borderTop: `1px solid ${C.line}`, margin: "16px 0" },
};

const SECTION_STYLE = {
  fontSize: 10, fontWeight: 700, letterSpacing: 1.5,
  textTransform: "uppercase", color: C.muted, margin: "0 0 14px",
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

// Constantes del modelo Esquema
const SCHEMA_LEVELS = [
  { id: 1, sub: "Partes",  color: "#C77A1A", bg: "rgba(199,122,26,0.10)" },
  { id: 2, sub: "Frases",  color: "#2F6FB8", bg: "rgba(47,111,184,0.08)" },
  { id: 3, sub: "Armonía", color: "#3F9B5B", bg: "rgba(63,155,91,0.08)"  },
];
const SCHEMA_DEFAULT_LABELS = {
  1: ["A", "B", "C", "D", "E", "A'", "B'"],
  2: ["a", "b", "c", "d", "e", "a'", "b'"],
  3: ["Sol M", "Do M", "Re M", "Mi m", "Fa M", "La m", "Re m", "Si♭ M"],
};
const SCHEMA_SNAP_THR = 2.8;
const SCHEMA_MIN_DUR  = 2;

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
function schemaSnapTime(t, blocks, excludeId, duration) {
  const bounds = [0, duration, ...blocks.filter(b => b.id !== excludeId && !b.isPreview).flatMap(b => [b.start, b.end])];
  let best = t, bestDist = SCHEMA_SNAP_THR + 0.01;
  for (const bv of bounds) { const d = Math.abs(t - bv); if (d < bestDist) { bestDist = d; best = bv; } }
  return best;
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
    if (typeof document === "undefined" || document.querySelector('link[data-gf="fa-v2"]')) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.setAttribute("data-gf", "fa-v2");
    link.href = "https://fonts.googleapis.com/css2?family=Fraunces:opsz,ital,wght@9..144,0,400;9..144,0,600;9..144,0,700;9..144,1,400;9..144,1,600;9..144,1,700&family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500;600&display=swap";
    document.head.appendChild(link);
  }, []);
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
function PillSubmitButton({ onClick, children }) {
  return (
    <button onClick={onClick} style={{
      background: C.ink, color: C.paper, border: `1px solid ${C.ink}`,
      borderRadius: 999, padding: "10px 16px 10px 20px",
      fontSize: 13, fontWeight: 600, cursor: "pointer",
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
    <div style={{ ...S.app, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ ...S.card, maxWidth: 440, width: "90vw", marginBottom: 0 }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>🎵</div>
          <h1 style={{ ...S.h1, fontSize: 22, marginBottom: 6 }}>Primera configuración</h1>
          <p style={{ color: C.muted, fontSize: 13, margin: 0 }}>Crea tu cuenta de administrador para comenzar</p>
        </div>

        <label style={S.label}>Tu nombre (visible para los alumnos)</label>
        <input style={{ ...S.input, marginBottom: 14 }} value={displayName} autoFocus
          onChange={(e) => setDisplayName(e.target.value)} placeholder="Ej: Prof. García" />

        <label style={S.label}>Nombre de usuario (para el login)</label>
        <input style={{ ...S.input, marginBottom: 14 }} value={username} autoComplete="username"
          onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s/g, ""))} placeholder="admin" />

        <label style={S.label}>Contraseña (mínimo 6 caracteres)</label>
        <input type="password" style={{ ...S.input, marginBottom: 14 }} value={pass}
          onChange={(e) => setPass(e.target.value)} placeholder="••••••" autoComplete="new-password" />

        <label style={S.label}>Confirmar contraseña</label>
        <input type="password" autoComplete="new-password"
          style={{ ...S.input, marginBottom: mismatch ? 6 : 22, borderColor: mismatch ? C.danger : undefined }}
          value={pass2} onChange={(e) => setPass2(e.target.value)} placeholder="••••••"
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()} />

        {mismatch && <ErrorMsg style={{ marginBottom: 16 }}>Las contraseñas no coinciden</ErrorMsg>}
        <ErrorMsg>{error}</ErrorMsg>

        <button onClick={handleSubmit} disabled={!canSave}
          style={{ ...S.btnPrimary, width: "100%", padding: 14, borderRadius: 12, fontSize: 15, ...disabledStyle(canSave) }}>
          {loading ? "Configurando…" : "Crear cuenta y comenzar →"}
        </button>
      </div>
    </div>
  );
}

// Pantalla de login (alumno/profesor/admin)
function LoginView({ roleLabel, filterRole, users, onLogin, onBack, onGuest }) {
  const [username,   setUsername]   = useState("");
  const [credential, setCredential] = useState("");
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState("");

  const targetUsers = useMemo(() => (users || []).filter((u) => u.role === filterRole), [users, filterRole]);
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
    <div style={{ ...S.app, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ ...S.card, maxWidth: 400, width: "90vw", marginBottom: 0 }}>
        <button onClick={onBack} style={{ ...S.btn, marginBottom: 24, fontSize: 12, padding: "6px 12px" }}>← Volver</button>
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ ...S.h1, fontSize: 22, marginBottom: 4 }}>Acceso {roleLabel}</h1>
          <p style={{ color: C.muted, fontSize: 13, margin: 0 }}>Introduce tus credenciales</p>
        </div>

        <label style={S.label}>Nombre de usuario</label>
        <input style={{ ...S.input, marginBottom: 14 }} value={username} autoFocus autoComplete="username"
          onChange={(e) => { setUsername(e.target.value); setError(""); }} placeholder="usuario" />

        <label style={S.label}>{credLabel}</label>
        <CredentialInput
          kind={isPin ? "pin" : "password"}
          value={credential}
          onChange={(v) => { setCredential(v); setError(""); }}
          onSubmit={handleLogin}
          marginBottom={22}
        />

        {error && <ErrorMsg style={{ margin: "-14px 0 14px" }}>{error}</ErrorMsg>}

        <button onClick={handleLogin} disabled={!canSubmit}
          style={{ ...S.btnPrimary, width: "100%", padding: 13, borderRadius: 8, fontSize: 14, ...disabledStyle(canSubmit) }}>
          {loading ? "Verificando…" : "Entrar →"}
        </button>

        {onGuest && (
          <>
            <div style={{ ...S.row, margin: "18px 0 14px", gap: 0 }}>
              <div style={{ flex: 1, height: 1, background: C.line }} />
              <span style={{ color: C.muted2, fontSize: 11, padding: "0 10px", whiteSpace: "nowrap", letterSpacing: 0.3 }}>o sin cuenta</span>
              <div style={{ flex: 1, height: 1, background: C.line }} />
            </div>
            <button onClick={onGuest} style={{ ...S.btn, width: "100%", padding: "11px 20px", borderRadius: 8, fontSize: 13, color: C.muted }}>
              Entrar como invitado
            </button>
            <p style={{ fontSize: 11, color: C.muted2, textAlign: "center", margin: "8px 0 0", lineHeight: 1.5 }}>
              Modo de prueba · los resultados no se guardan
            </p>
          </>
        )}
      </div>
    </div>
  );
}

// Pantalla inicial: selección de rol
function HomeView({ onAdmin, onTeacher, onStudent }) {
  return (
    <div style={{ ...S.app, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
      <div style={{ textAlign: "center", maxWidth: 360, padding: "2.5rem 1.5rem", display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ fontFamily: FONT_MONO, fontSize: 10, letterSpacing: 2.5, textTransform: "uppercase", color: C.muted, marginBottom: 22 }}>
          Análisis Musical Auditivo
        </div>

        <h1 style={{ ...S.h1, fontSize: 38, lineHeight: 1.08, marginBottom: 0, fontStyle: "italic", letterSpacing: -1.5 }}>
          Funciones<br />Armónicas
        </h1>

        <div style={{ width: 36, height: 1.5, background: C.line, margin: "22px 0 20px" }} />

        <p style={{ color: C.muted, fontSize: 13, marginBottom: 40, lineHeight: 1.55, maxWidth: 260 }}>
          Herramienta interactiva de análisis y escucha armónica para el aula
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%" }}>
          <button onClick={onStudent} style={{ ...S.btnPrimary, fontSize: 14, padding: "13px 24px", borderRadius: 8, letterSpacing: 0.1 }}>Acceso Alumno</button>
          <button onClick={onTeacher} style={{ ...S.btn,        fontSize: 14, padding: "13px 24px", borderRadius: 8 }}>Acceso Profesor</button>
        </div>

        <button onClick={onAdmin}
          style={{ marginTop: 40, background: "none", border: "none", color: C.muted2, fontSize: 11, cursor: "pointer", padding: "4px 8px", fontFamily: FONT_SANS, letterSpacing: 0.5 }}>
          Administrador
        </button>
      </div>
    </div>
  );
}

// Selector de profesor (para alumnos al primer login)
function TeacherPickerView({ teachers, currentTeacherId, onPick, onLogout }) {
  const [hoverId, setHoverId] = useState(null);
  return (
    <div style={{ ...S.app, display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
      <div style={{ ...S.card, maxWidth: 440, width: "90vw", marginBottom: 0 }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ fontFamily: FONT_MONO, fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: C.muted, marginBottom: 14 }}>Selección de profesor</div>
          <h1 style={{ ...S.h1, fontSize: 20, marginBottom: 4 }}>
            {currentTeacherId ? "Cambiar profesor" : "Elige tu profesor"}
          </h1>
          <p style={{ color: C.muted, fontSize: 13, margin: 0 }}>Selecciona al profesor cuya clase sigues</p>
        </div>

        {teachers.length === 0 ? (
          <div style={{ textAlign: "center", padding: "1rem 0 1.5rem" }}>
            <p style={{ color: C.muted, fontSize: 13 }}>Aún no hay profesores registrados.</p>
            <button onClick={onLogout} style={{ ...S.btn, marginTop: 12 }}>Volver al inicio</button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 22 }}>
            {teachers.map((t) => {
              const isSelected = t.id === currentTeacherId;
              const isHover    = hoverId === t.id;
              return (
                <button key={t.id} onClick={() => onPick(t)}
                  onMouseEnter={() => setHoverId(t.id)}
                  onMouseLeave={() => setHoverId(null)}
                  style={{
                    background: isSelected ? C.ink : isHover ? C.paper2 : C.paper,
                    border:     `1px solid ${isSelected ? C.ink : isHover ? C.ink2 : C.line}`,
                    borderRadius: 10, padding: "14px 18px", cursor: "pointer",
                    display: "flex", alignItems: "center", gap: 14,
                    transition: "all .15s", textAlign: "left",
                  }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: "50%",
                    background: isSelected ? "rgba(251,250,246,0.18)" : C.line,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 17, fontWeight: 700, color: isSelected ? C.paper : C.ink2,
                    flexShrink: 0, fontFamily: FONT_MONO,
                  }}>
                    {t.displayName[0].toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 15, color: isSelected ? C.paper : C.ink, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.displayName}</div>
                    <div style={{ fontSize: 12, color: isSelected ? "rgba(251,250,246,0.6)" : C.muted, fontFamily: FONT_MONO }}>@{t.username}</div>
                  </div>
                  {isSelected && <span style={{ fontSize: 16, color: C.paper, flexShrink: 0 }}>✓</span>}
                </button>
              );
            })}
          </div>
        )}

        <button onClick={onLogout}
          style={{ background: "none", border: "none", color: C.muted2, fontSize: 12, cursor: "pointer", width: "100%", fontFamily: FONT_SANS, padding: "4px 0" }}>
          Salir
        </button>
      </div>
    </div>
  );
}

// ═══ 7. VISTAS DE ALUMNO ════════════════════════════════════════════════════

// Tarjeta de ejercicio (compartida entre lista global y vista por curso/unidad)
function StudentExerciseCard({ ex, result, onClick }) {
  const isQuiz = modelOf(ex) === "cuestionario";
  const exQs   = questionsOf(ex);
  const { recorded, total } = isQuiz ? { recorded: 0, total: 0 } : answerStats(ex);

  return (
    <div style={{ ...S.card, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <div>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>{ex.title}</div>
        <div style={{ ...S.row, gap: 8, flexWrap: "wrap" }}>
          <span style={{ ...S.badge, background: C.line, color: C.muted }}>{fmt(ex.duration)}</span>

          {isQuiz
            ? <span style={{ ...S.badge, background: "rgba(47,111,184,0.14)", color: C.quiz }}>Cuestionario</span>
            : total > 1 && <span style={{ ...S.badge, background: C.paper2, color: C.fnI }}>{total} categorías</span>}

          {isQuiz
            ? (exQs.length === 0
                ? <span style={{ ...S.badge, background: "rgba(199,122,26,0.16)", color: C.fnD }}>Sin preguntas</span>
                : <span style={{ ...S.badge, background: "rgba(47,111,184,0.10)", color: C.quiz }}>{exQs.length} {exQs.length === 1 ? "pregunta" : "preguntas"}</span>)
            : (recorded === 0 && <span style={{ ...S.badge, background: "rgba(199,122,26,0.16)", color: C.fnD }}>Sin clave</span>)}

          {result && (
            <ScoreBadge score={result.score} suffix="% acierto" emptyLabel="Enviado" />
          )}
        </div>
      </div>
      <button onClick={onClick} style={S.btnPrimary}>{result ? "Repetir" : "Iniciar"} →</button>
    </div>
  );
}

// Dashboard del alumno
function StudentDash({ user, exercises, results, courses, units, onExercise, onLogout, onChangeTeacher }) {
  const [view,           setView]           = useState("all");
  const [openCourseIds,  setOpenCourseIds]  = useState(new Set());
  const [openUnitIds,    setOpenUnitIds]    = useState(new Set());

  const toggleCourse = (id) => setOpenCourseIds((s) => toggleInSet(s, id));
  const toggleUnit   = (id) => setOpenUnitIds  ((s) => toggleInSet(s, id));

  return (
    <div style={S.app}>
      <div style={S.page}>
        {user.isGuest && (
          <div style={{ background: "rgba(199,122,26,0.10)", border: `1px solid rgba(199,122,26,0.25)`, borderRadius: 8, padding: "8px 14px", marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 14 }}>👤</span>
            <div style={{ flex: 1 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: C.fnD }}>Modo invitado</span>
              <span style={{ fontSize: 12, color: C.muted, marginLeft: 8 }}>Los resultados no se guardan al salir</span>
            </div>
          </div>
        )}

        {/* Cabecera */}
        <div style={{ paddingBottom: 20, borderBottom: `1.5px solid ${C.line}`, marginBottom: 0 }}>
          <div style={{ ...S.row, justifyContent: "space-between" }}>
            <div>
              <div style={{ fontFamily: FONT_MONO, fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: C.muted, marginBottom: 5 }}>Alumno</div>
              <h1 style={{ ...S.h1, fontSize: 22, marginBottom: 0 }}>{user.displayName}</h1>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {!user.isGuest && onChangeTeacher && (
                <button onClick={onChangeTeacher} style={{ ...S.btn, fontSize: 12, padding: "6px 12px" }}>🎓 Profesor</button>
              )}
              <button onClick={onLogout} style={S.btn}>Salir</button>
            </div>
          </div>
        </div>

        {/* Pestañas */}
        <div style={{ display: "flex", borderBottom: `1px solid ${C.line}`, marginBottom: 22 }}>
          <TabBar
            tabs={[{ id: "all", label: "Todos los ejercicios" }, { id: "courses", label: "Por cursos" }]}
            value={view} onChange={setView}
          />
        </div>

        {view === "all" && exercises.map((ex) => (
          <StudentExerciseCard key={ex.id} ex={ex} result={results[ex.id]} onClick={() => onExercise(ex)} />
        ))}

        {view === "courses" && (
          courses.length === 0
            ? <p style={{ color: C.muted, textAlign: "center", padding: "3rem 1rem" }}>El profesor aún no ha creado ningún curso.</p>
            : courses.map((course) => {
                const courseUnits = units.filter((u) => course.unitIds.includes(u.id));
                const exCount     = courseUnits.reduce((sum, u) => sum + u.exerciseIds.length, 0);
                const isCourseOpen = openCourseIds.has(course.id);
                return (
                  <div key={course.id} style={{ marginBottom: 10 }}>
                    <div onClick={() => toggleCourse(course.id)}
                      style={{ background: C.paper, border: `1px solid ${isCourseOpen ? C.ink2 : C.line}`, borderRadius: isCourseOpen ? "10px 10px 0 0" : 10, padding: "14px 18px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, transition: "border-color .15s" }}>
                      <span style={{ fontSize: 18, color: C.muted2, fontWeight: 300, display: "inline-block", transition: "transform .2s", transform: isCourseOpen ? "rotate(90deg)" : "rotate(0deg)", lineHeight: 1 }}>›</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 15, color: C.ink, marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{course.name}</div>
                        {course.description && <div style={{ fontSize: 13, color: C.muted, marginBottom: 5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{course.description}</div>}
                        <div style={{ ...S.row, gap: 8 }}>
                          <span style={{ ...S.badge, background: C.line, color: C.muted }}>{courseUnits.length} {courseUnits.length === 1 ? "unidad" : "unidades"}</span>
                          <span style={{ ...S.badge, background: C.paper2, color: C.muted }}>{exCount} {exCount === 1 ? "ejercicio" : "ejercicios"}</span>
                        </div>
                      </div>
                    </div>

                    {isCourseOpen && (
                      <div style={{ border: `1px solid ${C.ink2}`, borderTop: "none", borderRadius: "0 0 10px 10px", background: C.paper2, padding: "14px 18px 12px" }}>
                        {courseUnits.length === 0
                          ? <p style={{ color: C.muted, fontSize: 13, textAlign: "center", padding: "10px 0 4px" }}>Este curso no tiene unidades.</p>
                          : courseUnits.map((unit) => {
                              const isUnitOpen = openUnitIds.has(unit.id);
                              return (
                                <div key={unit.id} style={{ marginBottom: 8 }}>
                                  <div onClick={() => toggleUnit(unit.id)}
                                    style={{ background: C.paper, border: `1px solid ${isUnitOpen ? C.muted2 : C.line}`, borderRadius: isUnitOpen ? "10px 10px 0 0" : 10, padding: "10px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, transition: "border-color .15s" }}>
                                    <span style={{ fontSize: 14, color: C.muted, display: "inline-block", transition: "transform .2s", transform: isUnitOpen ? "rotate(90deg)" : "rotate(0deg)", lineHeight: 1 }}>›</span>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      <div style={{ fontWeight: 600, fontSize: 14, color: C.ink, marginBottom: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{unit.name}</div>
                                      {unit.description && <div style={{ fontSize: 12, color: C.muted, marginBottom: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{unit.description}</div>}
                                      <span style={{ ...S.badge, background: C.line, color: C.muted }}>{unit.exerciseIds.length} {unit.exerciseIds.length === 1 ? "ejercicio" : "ejercicios"}</span>
                                    </div>
                                  </div>

                                  {isUnitOpen && (
                                    <div style={{ border: `1px solid ${C.muted2}`, borderTop: "none", borderRadius: "0 0 10px 10px", background: C.bg, padding: "12px 14px 8px" }}>
                                      {unit.exerciseIds.length === 0
                                        ? <p style={{ color: C.muted, fontSize: 12, textAlign: "center", padding: "6px 0" }}>Esta unidad no tiene ejercicios asignados.</p>
                                        : unit.exerciseIds.map((eid) => {
                                            const ex = exercises.find((e) => e.id === eid);
                                            return ex ? <StudentExerciseCard key={ex.id} ex={ex} result={results[ex.id]} onClick={() => onExercise(ex)} /> : null;
                                          })}
                                    </div>
                                  )}
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
  const dur      = exercise.duration;
  const audioUrl = exercise.audioUrl;
  const hasAudio = !!audioUrl;

  const [time,       setTime]       = useState(0);
  const [playing,    setPlaying]    = useState(false);
  const [audioReady, setAudioReady] = useState(false);
  const [audioError, setAudioError] = useState(null);

  const ctxRef          = useRef(null);
  const bufferRef       = useRef(null);
  const sourceRef       = useRef(null);
  const startCtxTimeRef = useRef(0);
  const playOffsetRef   = useRef(0);
  const playingRef      = useRef(false);
  const timeRef         = useRef(0);
  const scrubbingRef    = useRef(false);
  playingRef.current    = playing;
  timeRef.current       = time;

  const stopSource = () => {
    if (sourceRef.current) {
      try { sourceRef.current.stop(); } catch {}
      sourceRef.current = null;
    }
  };

  const startSource = (offset) => {
    const ctx = ctxRef.current;
    if (!ctx || !bufferRef.current) return;
    const src = ctx.createBufferSource();
    src.buffer = bufferRef.current;
    src.connect(ctx.destination);
    src.onended = () => {
      const lq = loopRegionRef?.current;
      if (!lq && playingRef.current) { playOffsetRef.current = dur; setPlaying(false); }
    };
    src.start(0, Math.min(offset, bufferRef.current.duration));
    sourceRef.current     = src;
    startCtxTimeRef.current = ctx.currentTime;
  };

  // Carga + decodificación cuando cambia el ejercicio
  useEffect(() => {
    setTime(0); setPlaying(false); setAudioReady(false); setAudioError(null);
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
        const buf = await fetchAudioBuffer(audioUrl);
        const decoded = await ctx.decodeAudioData(buf);
        if (cancelled) return;
        bufferRef.current = decoded;
        setAudioReady(true);
        onWaveform?.(buildWaveformFromPCM(decoded.getChannelData(0), decoded.duration));
      } catch { if (!cancelled) setAudioError("Error al decodificar el audio"); }
    })();

    return () => { cancelled = true; stopSource(); ctx.close(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exercise.id]);

  // Timer simulado cuando no hay audio real
  const timerRef = useRef(null);
  useEffect(() => {
    if (playing && !hasAudio) {
      timerRef.current = setInterval(() => {
        if (scrubbingRef.current) return;
        setTime((t) => {
          const lq = loopRegionRef?.current;
          if (lq && t >= lq.audioEnd) return lq.audioStart;
          if (!lq && t >= dur) { setPlaying(false); return dur; }
          return t + 0.05;
        });
      }, 50);
    }
    return () => clearInterval(timerRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, dur, hasAudio]);

  // RAF tick para audio real
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
          setTime(lq.audioStart);
          startSource(lq.audioStart);
        } else {
          const t = Math.min(dur, rawT);
          setTime(t);
          if (!lq && t >= dur) { setPlaying(false); return; }
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
    const ctx = ctxRef.current;
    ctx.resume().then(() => {
      if (playingRef.current) {
        stopSource();
        playOffsetRef.current = Math.min(dur, playOffsetRef.current + (ctx.currentTime - startCtxTimeRef.current));
        setPlaying(false);
      } else {
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
    togglePlay, seekTo, playFrom,
    scrubBegin, scrubTo, scrubEnd,
  };
}

// Canvas con forma de onda + cursor central + intervalos coloreados
function WaveformDisplay({
  time, duration, allIntervals, exerciseId, waveformData,
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
    time, allIntervals, waveData, duration, colorByFn, questionRegion,
    onScrubBegin, onScrubTo, onScrubEnd,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const NUM_BARS = 90;
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

    const draw = () => {
      const { time: t, allIntervals: ivs, waveData: wd, duration: dur, colorByFn: cmap, questionRegion: qr } = stateRef.current;
      const rect = canvas.getBoundingClientRect();
      const W = rect.width, H = rect.height, mid = H / 2;
      const barW = W / NUM_BARS, drawW = barW * 0.7, offsetX = barW * 0.15;
      const pxPerSec = W / VISIBLE_SECS;
      const centerK  = Math.floor(t / secPerBar);
      const kMin = centerK - halfBars - 1, kMax = centerK + halfBars + 1;

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
        const si = Math.min(Math.round((barTime / dur) * (wd.length - 1)), wd.length - 1);
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
    rafId = requestAnimationFrame(draw);

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
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(buttons.length, 3)}, 1fr)`, gap: 12, marginBottom: 14 }}>
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
              borderRadius: 14, padding: "16px 8px", cursor: "pointer",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
              transition: "background .08s, color .08s, border-color .08s, transform .08s",
              transform: isActive ? "translateY(1px)" : "translateY(0)",
              userSelect: "none", touchAction: "none",
            }}>
            <span style={{ fontSize: 28, fontWeight: 800, fontFamily: FONT_MONO, letterSpacing: -1, color: isActive ? C.paper : b.color, lineHeight: 1 }}>{b.id}</span>
            <span style={{ fontSize: 12, fontWeight: 500, color: isActive ? C.paper : C.ink2 }}>{b.name}</span>
            <span style={{ fontSize: 10, fontFamily: FONT_MONO, color: isActive ? C.paper : C.muted, opacity: 0.85, marginTop: 1 }}>{b.key.toUpperCase()}</span>
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

function ExerciseView({ exercise, mode, onSubmit, onBack }) {
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
  const [waveformData, setWaveformData] = useState(exercise.waveformData || null);

  // Reproductor compartido
  const onWaveform = exercise.waveformData ? null : (wd) => setWaveformData(wd);
  const {
    time, playing, audioReady, audioError, hasAudio,
    timeRef, togglePlay, seekTo, scrubBegin, scrubTo, scrubEnd,
  } = useAudioPlayer(exercise, { onWaveform });

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

  return (
    <div style={S.app} onMouseDown={() => { if (selected !== null) setSelected(null); }}>
      <div style={{ ...S.page, paddingTop: "1.25rem" }}>
        <div style={{ ...S.row, justifyContent: "space-between", marginBottom: 18 }}>
          <button onClick={onBack} style={{ ...S.btn, padding: "6px 12px", fontSize: 12 }}>← Volver</button>
          <div style={{ fontWeight: 600, color: C.ink, fontSize: 15, textAlign: "center", flex: 1, fontFamily: FONT_SERIF }}>{exercise.title}</div>
          <div style={{ width: 70 }} />
        </div>

        {hasAudio && !audioReady && !audioError && <div style={{ textAlign: "center", color: C.muted, fontSize: 12, marginBottom: 10 }}>Cargando audio…</div>}
        {audioError && <div style={{ textAlign: "center", color: C.danger, fontSize: 12, marginBottom: 10 }}>{audioError}</div>}

        <section style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 18, padding: "14px 14px 12px", marginBottom: 16 }}>
          <div style={{ marginLeft: gutter, marginRight: gutter, background: C.paper2, borderRadius: 10, overflow: "hidden", border: `1px solid ${C.line}` }}>
            <WaveformDisplay time={time} duration={dur} allIntervals={allIv}
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
            <div />
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <CircleButton onClick={() => seekTo(Math.max(0, time - 5))}>−5s</CircleButton>
              <CircleButton onClick={togglePlay} disabled={hasAudio && !audioReady && !audioError}
                primary size={48} title={playing ? "Pausa (Espacio)" : "Reproducir (Espacio)"}>
                {playing ? "❚❚" : "▶"}
              </CircleButton>
              <CircleButton onClick={() => seekTo(Math.min(dur, time + 5))}>+5s</CircleButton>
            </div>
            <div style={{ textAlign: "right", fontFamily: FONT_MONO, fontVariantNumeric: "tabular-nums", fontSize: 22, fontWeight: 600, color: C.ink, letterSpacing: -0.5 }}>
              {fmt(time)}<span style={{ color: C.muted2, fontWeight: 400 }}>/{fmt(dur)}</span>
            </div>
          </div>
        </section>

        {selected && selectedIv && (
          <div onMouseDown={(e) => e.stopPropagation()} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginBottom: 14, padding: "8px 4px" }}>
            <span style={{ fontSize: 11, color: C.muted, fontFamily: FONT_MONO, textTransform: "uppercase", letterSpacing: 1 }}>Fragmento</span>
            {exCategory.buttons.map((b) => {
              const isSel = selectedIv.fn === b.id;
              return (
                <button key={b.id}
                  onClick={() => setIntervals((prev) => prev.map((iv) => iv.id === selected ? { ...iv, fn: b.id } : iv))}
                  style={{ background: isSel ? b.color : C.paper, color: isSel ? C.paper : b.color, border: `1.5px solid ${b.color}`, borderRadius: 999, padding: "4px 12px", cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: FONT_MONO }}>
                  {b.id}
                </button>
              );
            })}
            <span style={{ fontSize: 11, color: C.muted2, fontFamily: FONT_MONO, marginLeft: 4 }}>{fmt(selectedIv.start)} → {fmt(selectedIv.end)}</span>
            <button onClick={deleteSelected} style={{ ...S.btnDanger, marginLeft: "auto", padding: "4px 12px", fontSize: 12 }}>Eliminar</button>
          </div>
        )}

        <FunctionButtons buttons={exCategory.buttons} pressing={pressing} onDown={handleFnDown} onUp={handleFnUp} />

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginTop: 6 }}>
          <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.5, flex: "1 1 240px", minWidth: 200 }}>
            Mantén pulsado el botón (o tecla) mientras suena · Espacio = Play/Pausa
          </div>
          <PillSubmitButton onClick={handleSubmit}>
            {mode === "record" ? "Guardar como respuesta correcta" : "Corregir ejercicio"}
          </PillSubmitButton>
        </div>
      </div>
    </div>
  );
}

// ═══ 9b. SCHEMA EXERCISE VIEW (modelo Esquema) ══════════════════════════════

function SchemaExerciseView({ exercise, mode, onSubmit, onBack }) {
  const duration = exercise.duration;
  const [waveformData, setWaveformData] = useState(exercise.waveformData || null);
  const onWaveform = exercise.waveformData ? null : (wd) => setWaveformData(wd);
  const { time, playing, audioReady, audioError, hasAudio, togglePlay, seekTo, scrubBegin, scrubTo, scrubEnd } =
    useAudioPlayer(exercise, { onWaveform });

  const [blocks,   setBlocks]   = useState([]);
  const [selected, setSelected] = useState(null);
  const [editId,   setEditId]   = useState(null);
  const [editVal,  setEditVal]  = useState("");
  const [guides,   setGuides]   = useState([]);

  const trackRefs  = useRef({});
  const dragRef    = useRef(null);
  const blocksRef  = useRef(blocks);
  blocksRef.current = blocks;

  // Ruler width → adaptive ticks
  const [rulerW, setRulerW] = useState(600);
  const rulerRef = useRef(null);
  useEffect(() => {
    const el = rulerRef.current; if (!el) return;
    setRulerW(el.getBoundingClientRect().width);
    const ro = new ResizeObserver(([e]) => setRulerW(e.contentRect.width));
    ro.observe(el); return () => ro.disconnect();
  }, []);
  const NICE_N = [2, 3, 4, 6, 8, 12];
  const maxN   = Math.max(2, Math.floor(rulerW / 58));
  const numIv  = [...NICE_N].reverse().find(n => n <= maxN) || 2;
  const ticks  = Array.from({ length: numIv + 1 }, (_, i) => i * duration / numIv);

  const handleRulerDrag = e => {
    const el = rulerRef.current; if (!el) return;
    e.preventDefault();
    const rect = el.getBoundingClientRect();
    const toT  = x => Math.max(0, Math.min(duration, ((x - rect.left) / rect.width) * duration));
    const getX = ev => ev.touches?.[0]?.clientX ?? ev.changedTouches?.[0]?.clientX ?? ev.clientX;
    seekTo(toT(getX(e)));
    const mv = ev => { if (ev.cancelable) ev.preventDefault(); seekTo(toT(getX(ev))); };
    const up = () => {
      window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up);
      window.removeEventListener("touchmove", mv); window.removeEventListener("touchend", up);
    };
    window.addEventListener("mousemove", mv); window.addEventListener("mouseup", up);
    window.addEventListener("touchmove", mv, { passive: false }); window.addEventListener("touchend", up);
  };

  const getClientX = e => e.touches?.[0]?.clientX ?? e.changedTouches?.[0]?.clientX ?? e.clientX;

  // Timeline drag logic
  useEffect(() => {
    const pixToTime = (e, lvId) => {
      const el = trackRefs.current[lvId]; if (!el) return 0;
      const r = el.getBoundingClientRect();
      const x = e.touches?.[0]?.clientX ?? e.changedTouches?.[0]?.clientX ?? e.clientX;
      return Math.max(0, Math.min(duration, ((x - r.left) / r.width) * duration));
    };
    const onMove = e => {
      const d = dragRef.current; if (!d) return;
      const t = pixToTime(e, d.level), all = blocksRef.current;
      if (d.type === "create") {
        let s = Math.min(d.anchor, t), e2 = Math.max(d.anchor, t);
        const ss = schemaSnapTime(s, all, d.pid, duration), se = schemaSnapTime(e2, all, d.pid, duration);
        const ng = [];
        if (Math.abs(s  - ss) <= SCHEMA_SNAP_THR) { s  = ss; ng.push(ss); }
        if (Math.abs(e2 - se) <= SCHEMA_SNAP_THR) { e2 = se; ng.push(se); }
        setGuides(ng); d.ps = s; d.pe = e2;
        setBlocks(prev => [...prev.filter(b => b.id !== d.pid), { id: d.pid, level: d.level, start: s, end: e2, label: "\u2026", isPreview: true }]);
      } else if (d.type === "move") {
        const delta = t - d.anchor, dur2 = d.oe - d.os;
        let ns = Math.max(0, Math.min(duration - dur2, d.os + delta)), ne = ns + dur2;
        const xb = [0, duration, ...all.filter(b => b.id !== d.bid && b.level !== d.level && !b.isPreview).flatMap(b => [b.start, b.end])];
        let snapped = false;
        for (const bv of xb) { if (Math.abs(ns - bv) < SCHEMA_SNAP_THR) { ns = bv; ne = bv + dur2; snapped = true; break; } }
        if (!snapped) { for (const bv of xb) { if (Math.abs(ne - bv) < SCHEMA_SNAP_THR) { ne = bv; ns = bv - dur2; break; } } }
        setGuides([ns, ne]);
        setBlocks(prev => { const placed = prev.map(b => b.id === d.bid ? { ...b, start: ns, end: ne } : b); return schemaApplyPush(placed, d.bid, d.level, duration); });
      } else if (d.type === "resize-l") {
        const ns = schemaSnapTime(Math.min(t, d.oe - SCHEMA_MIN_DUR), all, d.bid, duration);
        setGuides([ns]); setBlocks(prev => prev.map(b => b.id === d.bid ? { ...b, start: ns } : b));
      } else if (d.type === "resize-r") {
        const ne = schemaSnapTime(Math.max(t, d.os + SCHEMA_MIN_DUR), all, d.bid, duration);
        setGuides([ne]); setBlocks(prev => prev.map(b => b.id === d.bid ? { ...b, end: ne } : b));
      }
    };
    const onUp = () => {
      const d = dragRef.current; if (!d) return;
      if (d.type === "create") {
        const dur2 = (d.pe ?? d.anchor) - (d.ps ?? d.anchor);
        if (dur2 >= SCHEMA_MIN_DUR) {
          const n = blocksRef.current.filter(b => b.level === d.level && !b.isPreview).length;
          const label = SCHEMA_DEFAULT_LABELS[d.level]?.[n] ?? String(n + 1);
          setBlocks(prev => prev.map(b => b.id === d.pid ? { ...b, label, isPreview: false } : b));
          setEditId(d.pid); setEditVal(label); setSelected(d.pid);
        } else { setBlocks(prev => prev.filter(b => b.id !== d.pid)); }
      }
      setGuides([]); dragRef.current = null;
    };
    window.addEventListener("mousemove", onMove); window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onMove, { passive: false }); window.addEventListener("touchend", onUp);
    window.addEventListener("touchcancel", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onMove); window.removeEventListener("touchend", onUp);
      window.removeEventListener("touchcancel", onUp);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duration]);

  const commitEdit = () => {
    if (!editId) return;
    setBlocks(prev => prev.map(b => b.id === editId ? { ...b, label: editVal } : b));
    setEditId(null); setEditVal("");
  };
  const handleTrackDown = (e, lvId) => {
    if (e.target.closest("[data-block]")) return;
    const el = trackRefs.current[lvId]; if (!el) return;
    const r = el.getBoundingClientRect();
    const t = Math.max(0, Math.min(duration, ((getClientX(e) - r.left) / r.width) * duration));
    dragRef.current = { type: "create", level: lvId, anchor: t, pid: uid("sb"), ps: t, pe: t };
    setSelected(null); e.preventDefault();
  };
  const handleBlockDown = (e, block, type = "move") => {
    if (editId === block.id) return;
    e.stopPropagation(); setSelected(block.id);
    const el = trackRefs.current[block.level]; if (!el) return;
    const r = el.getBoundingClientRect();
    const t = Math.max(0, Math.min(duration, ((getClientX(e) - r.left) / r.width) * duration));
    dragRef.current = { type, level: block.level, bid: block.id, anchor: t, os: block.start, oe: block.end };
    e.preventDefault();
  };

  const activeAt = {};
  for (const b of blocks) { if (!b.isPreview && time >= b.start && time < b.end) activeAt[b.level] = b.id; }
  const selBlock = selected ? blocks.find(b => b.id === selected) : null;
  const selLv    = selBlock ? SCHEMA_LEVELS.find(l => l.id === selBlock.level) : null;

  const handleSubmit = () => {
    onSubmit({ type: "esquema", blocks: blocks.filter(b => !b.isPreview), mode });
  };

  return (
    <div style={S.app}>
      <div style={{ background: C.paper, borderBottom: `1px solid ${C.line}`, padding: "11px 20px", display: "flex", alignItems: "center", gap: 14 }}>
        <button onClick={onBack} style={{ ...S.btn, padding: "6px 14px", fontSize: 12 }}>{"<-"} Volver</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: FONT_SERIF, fontSize: 18, fontWeight: 600, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{exercise.title}</div>
          <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>Esquema formal</div>
        </div>
        <span style={{ ...S.badge, background: `${C.fnD}1C`, color: C.fnD, border: `1px solid ${C.fnD}45`, padding: "4px 12px", fontSize: 11, fontWeight: 700, letterSpacing: 0.9, flexShrink: 0 }}>ESQUEMA</span>
      </div>

      <div style={{ maxWidth: 980, margin: "0 auto", padding: "16px 16px 60px" }}>
        <section style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 16, padding: "14px 14px 12px", marginBottom: 12 }}>
          {hasAudio && !audioReady && !audioError && <div style={{ textAlign: "center", color: C.muted, fontSize: 12, marginBottom: 8 }}>Cargando audio...</div>}
          {audioError && <div style={{ textAlign: "center", color: C.danger, fontSize: 12, marginBottom: 8 }}>{audioError}</div>}
          <div style={{ background: C.paper2, borderRadius: 10, overflow: "hidden", border: `1px solid ${C.line}`, marginBottom: 8 }}>
            <WaveformDisplay time={time} duration={duration} allIntervals={[]} exerciseId={exercise.id}
              waveformData={waveformData} colorByFn={{}} questionRegion={null}
              onScrubBegin={scrubBegin} onScrubTo={scrubTo} onScrubEnd={scrubEnd} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 12, paddingTop: 10, borderTop: `1px solid ${C.line}` }}>
            <div />
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <CircleButton onClick={() => seekTo(Math.max(0, time - 5))}>-5s</CircleButton>
              <CircleButton onClick={() => { if (time >= duration) seekTo(0); togglePlay(); }}
                primary size={48} disabled={hasAudio && !audioReady && !audioError}>
                {playing ? "||" : ">"}
              </CircleButton>
              <CircleButton onClick={() => seekTo(Math.min(duration, time + 5))}>+5s</CircleButton>
            </div>
            <div style={{ textAlign: "right", fontFamily: FONT_MONO, fontVariantNumeric: "tabular-nums", fontSize: 22, fontWeight: 600, color: C.ink, letterSpacing: -0.5 }}>
              {fmt(time)}<span style={{ color: C.muted2, fontWeight: 400 }}>/{fmt(duration)}</span>
            </div>
          </div>
        </section>

        <div style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 12, overflow: "hidden", marginBottom: 12 }}>
          <div ref={rulerRef} style={{ position: "relative", height: 44, background: C.paper2, borderBottom: `1px solid ${C.line}`, cursor: "pointer", userSelect: "none", touchAction: "none", overflow: "hidden" }}
            onMouseDown={handleRulerDrag} onTouchStart={handleRulerDrag}>
            <div style={{ position: "absolute", top: 0, left: 0, bottom: 0, width: `${(time / duration) * 100}%`, background: `${C.ink}0A`, pointerEvents: "none" }} />
            {ticks.map((t, i) => {
              const isFirst = i === 0, isLast = i === ticks.length - 1;
              return (
                <div key={i} style={{ position: "absolute", top: 0, height: "100%", left: isLast ? "auto" : `${(t / duration) * 100}%`, right: isLast ? 0 : "auto", transform: isFirst || isLast ? "none" : "translateX(-50%)", display: "flex", flexDirection: "column", alignItems: isFirst ? "flex-start" : isLast ? "flex-end" : "center", justifyContent: "center", padding: "0 5px", pointerEvents: "none", gap: 3 }}>
                  <div style={{ width: 1, height: 7, background: C.muted2 }} />
                  <span style={{ fontSize: 10, color: C.muted, fontVariantNumeric: "tabular-nums", fontFamily: FONT_MONO, whiteSpace: "nowrap" }}>{fmt(t)}</span>
                </div>
              );
            })}
            {guides.map((g, i) => <div key={i} style={{ position: "absolute", top: 0, left: `${(g / duration) * 100}%`, width: 1, height: "100%", background: "rgba(210,55,55,0.5)", pointerEvents: "none", zIndex: 9 }} />)}
            <div style={{ position: "absolute", top: 0, left: `${(time / duration) * 100}%`, width: 1.5, height: "100%", background: C.danger, transform: "translateX(-50%)", pointerEvents: "none", zIndex: 10 }} />
            <div style={{ position: "absolute", top: "50%", left: `${(time / duration) * 100}%`, transform: "translate(-50%, -50%)", width: 14, height: 14, borderRadius: "50%", background: C.danger, border: `2px solid ${C.paper}`, boxShadow: "0 1px 4px rgba(0,0,0,0.25)", pointerEvents: "none", zIndex: 11 }} />
          </div>

          {SCHEMA_LEVELS.map((lv, li) => (
            <div key={lv.id} ref={el => trackRefs.current[lv.id] = el}
              style={{ height: 62, position: "relative", background: lv.bg, borderLeft: `3px solid ${lv.color}`, borderBottom: li < SCHEMA_LEVELS.length - 1 ? `1px solid ${C.line}` : "none", cursor: "crosshair", userSelect: "none", touchAction: "none" }}
              onMouseDown={e => handleTrackDown(e, lv.id)} onTouchStart={e => handleTrackDown(e, lv.id)}>
              <div style={{ position: "absolute", top: 4, left: 6, zIndex: 5, pointerEvents: "none" }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: lv.color, letterSpacing: 0.3, opacity: 0.8, fontFamily: FONT_SANS }}>{lv.sub}</span>
              </div>
              {Array.from({ length: 13 }, (_, i) => i * duration / 12).map((t, i) => (
                <div key={i} style={{ position: "absolute", top: 0, left: `${(t / duration) * 100}%`, width: 1, height: "100%", background: "rgba(0,0,0,0.04)", pointerEvents: "none" }} />
              ))}
              {guides.map((g, i) => <div key={i} style={{ position: "absolute", top: 0, left: `${(g / duration) * 100}%`, width: 1, height: "100%", background: "rgba(210,55,55,0.45)", pointerEvents: "none", zIndex: 8 }} />)}
              <div style={{ position: "absolute", top: 0, left: `${(time / duration) * 100}%`, width: 1, height: "100%", background: C.danger, opacity: 0.5, pointerEvents: "none", zIndex: 6 }} />
              {blocks.filter(b => b.level === lv.id).map(block => {
                const isActive = activeAt[lv.id] === block.id, isSel = selected === block.id;
                const pct = (block.end - block.start) / duration * 100;
                return (
                  <div key={block.id} data-block="true" style={{
                    position: "absolute", top: 6, bottom: 6, left: `${(block.start / duration) * 100}%`, width: `${pct}%`,
                    background: block.isPreview ? `${lv.color}38` : lv.color, borderRadius: 5,
                    border: isSel ? `2px solid ${C.ink}` : isActive ? `2px solid rgba(255,255,255,0.75)` : `1px solid rgba(255,255,255,0.22)`,
                    boxShadow: isSel ? "0 2px 10px rgba(0,0,0,0.22)" : "none",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    overflow: "hidden", cursor: block.isPreview ? "default" : "grab",
                    zIndex: isSel ? 7 : isActive ? 4 : 3, boxSizing: "border-box",
                  }}
                    onMouseDown={e => !block.isPreview && handleBlockDown(e, block, "move")}
                    onTouchStart={e => !block.isPreview && handleBlockDown(e, block, "move")}
                    onDoubleClick={() => { if (!block.isPreview) { setEditId(block.id); setEditVal(block.label); } }}>
                    {!block.isPreview && (
                      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: isSel ? 22 : 8, cursor: "ew-resize", zIndex: 12, background: isSel ? "rgba(0,0,0,0.20)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", borderRight: isSel ? "1px solid rgba(255,255,255,0.22)" : "none" }}
                        onMouseDown={e => { e.stopPropagation(); handleBlockDown(e, block, "resize-l"); }}
                        onTouchStart={e => { e.stopPropagation(); handleBlockDown(e, block, "resize-l"); }}>
                        {isSel && <div style={{ display: "flex", flexDirection: "column", gap: 3, pointerEvents: "none" }}>{[0,1,2].map(i => <div key={i} style={{ width: 2, height: 2, borderRadius: "50%", background: "rgba(255,255,255,0.9)" }} />)}</div>}
                      </div>
                    )}
                    {editId === block.id ? (
                      <input autoFocus value={editVal} onChange={e => setEditVal(e.target.value)}
                        onBlur={commitEdit} onKeyDown={e => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") setEditId(null); }}
                        onClick={e => e.stopPropagation()}
                        style={{ width: "82%", background: "rgba(0,0,0,0.18)", border: "none", borderBottom: "1.5px solid rgba(255,255,255,0.85)", color: "white", fontSize: 12, fontWeight: 700, textAlign: "center", outline: "none", padding: "2px 4px", fontFamily: FONT_SERIF, borderRadius: 2 }} />
                    ) : (
                      <span style={{ fontSize: pct < 3.5 ? 0 : pct < 6 ? 9 : 12, fontWeight: 700, color: "white", textShadow: "0 1px 3px rgba(0,0,0,0.28)", maxWidth: "84%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: FONT_SERIF, pointerEvents: "none" }}>
                        {block.label}
                      </span>
                    )}
                    {!block.isPreview && (
                      <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: isSel ? 22 : 8, cursor: "ew-resize", zIndex: 12, background: isSel ? "rgba(0,0,0,0.20)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", borderLeft: isSel ? "1px solid rgba(255,255,255,0.22)" : "none" }}
                        onMouseDown={e => { e.stopPropagation(); handleBlockDown(e, block, "resize-r"); }}
                        onTouchStart={e => { e.stopPropagation(); handleBlockDown(e, block, "resize-r"); }}>
                        {isSel && <div style={{ display: "flex", flexDirection: "column", gap: 3, pointerEvents: "none" }}>{[0,1,2].map(i => <div key={i} style={{ width: 2, height: 2, borderRadius: "50%", background: "rgba(255,255,255,0.9)" }} />)}</div>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {selBlock && !selBlock.isPreview && selLv ? (
            <div style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 8, padding: "9px 14px", display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0, flexWrap: "wrap" }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: selLv.color, flexShrink: 0 }} />
              <span style={{ fontFamily: FONT_SERIF, fontSize: 14, fontWeight: 700, color: C.ink }}>{selBlock.label}</span>
              <span style={{ fontSize: 11, color: C.muted, flex: 1 }}>{selLv.sub} {fmt(selBlock.start)}-{fmt(selBlock.end)} dur. {fmt(selBlock.end - selBlock.start)}</span>
              <button onClick={() => { setEditId(selected); setEditVal(selBlock.label); }} style={{ border: `1px solid ${C.line}`, background: C.paper2, borderRadius: 6, padding: "4px 10px", fontSize: 11, cursor: "pointer", color: C.ink2 }}>Renombrar</button>
              <button onClick={() => { setBlocks(prev => prev.filter(b => b.id !== selected)); setSelected(null); }} style={{ border: `1px solid ${C.danger}`, background: "transparent", borderRadius: 6, padding: "4px 10px", fontSize: 11, cursor: "pointer", color: C.danger }}>Eliminar</button>
            </div>
          ) : (
            <div style={{ flex: 1, fontSize: 12, color: C.muted, padding: "6px 4px" }}>
              {blocks.filter(b => !b.isPreview).length === 0
                ? "Arrastra en cualquier pista para crear un bloque. Doble clic para renombrar."
                : `${blocks.filter(b => !b.isPreview).length} bloque${blocks.filter(b => !b.isPreview).length !== 1 ? "s" : ""}. Selecciona uno para editar.`}
            </div>
          )}
          <PillSubmitButton onClick={handleSubmit}>
            {mode === "record" ? "Guardar esquema" : "Entregar"}
          </PillSubmitButton>
        </div>

        <div style={{ display: "flex", gap: 16, marginTop: 14, flexWrap: "wrap" }}>
          {SCHEMA_LEVELS.map(lv => (
            <div key={lv.id} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, background: lv.color }} />
              <span style={{ fontSize: 11, color: C.muted }}>{lv.sub}</span>
            </div>
          ))}
          <span style={{ fontSize: 11, color: C.muted2, marginLeft: 4 }}>Arrastra para crear. Doble clic para renombrar.</span>
        </div>
      </div>
    </div>
  );
}

// ═══ 10. CORRECTION VIEW · QUESTIONNAIRE VIEW ═══════════════════════════════

function CorrectionView({ exercise, result, margin, onBack }) {
  const dur = exercise.duration;

  // Modelo esquema — sin puntuación automática
  if (result.type === "esquema") {
    const blocks = result.blocks || [];
    return (
      <div style={S.app}>
        <div style={S.page}>
          <button onClick={onBack} style={{ ...S.btn, marginBottom: 24, fontSize: 12, padding: "6px 12px" }}>{"<-"} Mis ejercicios</button>
          <h2 style={S.h2}>Esquema entregado: {exercise.title}</h2>
          <div style={{ ...S.card, textAlign: "center", marginBottom: 20 }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>OK</div>
            <div style={{ color: C.muted, lineHeight: 1.6 }}>
              Esquema enviado al profesor para revisión.<br />
              <span style={{ fontSize: 12 }}>{blocks.length} {blocks.length === 1 ? "bloque dibujado" : "bloques dibujados"}.</span>
            </div>
          </div>
          {blocks.length > 0 && (
            <div style={S.card}>
              <div style={{ fontSize: 13, color: C.muted, marginBottom: 10 }}>Resumen de tu esquema:</div>
              {SCHEMA_LEVELS.map(lv => {
                const lvBlocks = blocks.filter(b => b.level === lv.id);
                if (lvBlocks.length === 0) return null;
                return (
                  <div key={lv.id} style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 11, color: lv.color, fontWeight: 700, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>{lv.sub}</div>
                    <div style={{ position: "relative", height: 28, background: C.paper2, borderRadius: 6, overflow: "hidden" }}>
                      {lvBlocks.map((b, i) => (
                        <div key={i} style={{ position: "absolute", top: 3, bottom: 3, left: `${(b.start / exercise.duration) * 100}%`, width: `${((b.end - b.start) / exercise.duration) * 100}%`, background: lv.color, borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                          <span style={{ fontSize: 9, fontWeight: 700, color: "white", fontFamily: FONT_SERIF }}>{b.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <button onClick={onBack} style={{ ...S.btnPrimary, width: "100%", marginTop: 8, padding: 14, borderRadius: 12 }}>Volver a mis ejercicios</button>
        </div>
      </div>
    );
  }

  // Modelo cuestionario
  if (result.type === "cuestionario") {
    const questions = questionsOf(exercise);
    const sc        = result.score;
    const testQs    = questions.filter((q) => q.type === "test" && q.correctOptionId);
    const correctN  = testQs.filter((q) => result.answers?.[q.id] === q.correctOptionId).length;
    const col       = scoreColor(sc);

    return (
      <div style={S.app}>
        <div style={S.page}>
          <button onClick={onBack} style={{ ...S.btn, marginBottom: 24, fontSize: 12, padding: "6px 12px" }}>← Mis ejercicios</button>
          <h2 style={S.h2}>Corrección: {exercise.title}</h2>

          <div style={{ ...S.card, textAlign: "center", marginBottom: 20 }}>
            {sc == null ? (
              <div style={{ color: C.muted, lineHeight: 1.6 }}>
                {testQs.length === 0
                  ? <>Respuestas enviadas al profesor para revisión.<br /><span style={{ fontSize: 12 }}>Las preguntas de desarrollo se corrigen manualmente.</span></>
                  : "Sin puntuación automática."}
              </div>
            ) : (
              <>
                <div style={{ fontSize: 64, fontWeight: 900, color: col, lineHeight: 1 }}>{sc}%</div>
                <div style={{ color: C.muted, fontSize: 14, marginTop: 4 }}>{correctN} de {testQs.length} {testQs.length === 1 ? "pregunta" : "preguntas"} correctas</div>
                <div style={{ fontSize: 14, marginTop: 12, color: col }}>
                  {sc >= 80 ? "Excelente análisis." : sc >= 50 ? "Bien, pero hay margen de mejora." : "Sigue practicando."}
                </div>
              </>
            )}
          </div>

          {questions.map((q, idx) => {
            const studentAnswer = result.answers?.[q.id];
            const isCorrect = q.type === "test" && studentAnswer === q.correctOptionId;
            const isWrong   = q.type === "test" && !!studentAnswer && studentAnswer !== q.correctOptionId;
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
                    <p style={{ fontSize: 11, color: C.muted2, margin: "6px 0 0" }}>Las preguntas de desarrollo serán revisadas por el profesor.</p>
                  </div>
                )}
              </div>
            );
          })}

          <button onClick={onBack} style={{ ...S.btnPrimary, width: "100%", marginTop: 8, padding: 14, borderRadius: 12 }}>Volver a mis ejercicios</button>
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
        <button onClick={onBack} style={{ ...S.btn, marginBottom: 24 }}>← Mis ejercicios</button>
        <h2 style={S.h2}>Corrección: {exercise.title}</h2>

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
          Volver a mis ejercicios
        </button>
      </div>
    </div>
  );
}

// Vista del alumno para ejercicios tipo "cuestionario"
function QuestionnaireView({ exercise, onSubmit, onBack }) {
  const dur       = exercise.duration;
  const questions = questionsOf(exercise);

  const [answers,        setAnswers]        = useState({});
  const [expandedId,     setExpandedId]     = useState(null);
  const [lockedQuestion, setLockedQuestion] = useState(null);
  const [waveformData,   setWaveformData]   = useState(exercise.waveformData || null);

  // Sincronizado cada render para que RAF/timer conozcan el bucle activo
  const loopRegionRef = useRef(null);
  loopRegionRef.current = lockedQuestion;

  const onWaveform = exercise.waveformData ? null : (wd) => setWaveformData(wd);
  const {
    time, playing, audioReady, audioError, hasAudio,
    togglePlay, seekTo, playFrom, scrubBegin, scrubTo, scrubEnd,
  } = useAudioPlayer(exercise, { onWaveform, loopRegionRef });

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
        <div style={S.page}>
          <button onClick={onBack} style={{ ...S.btn, marginBottom: 24 }}>← Volver</button>
          <div style={{ ...S.card, textAlign: "center", color: C.muted, padding: "3rem 1rem", lineHeight: 1.8 }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
            <div>Este ejercicio aún no tiene preguntas configuradas.</div>
            <div style={{ fontSize: 13 }}>El profesor las añadirá pronto.</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={S.app} onMouseDown={() => { if (lockedQuestion) unlockAudio(); }}>
      <div style={{ ...S.page, paddingTop: "1.25rem" }}>
        <div style={{ ...S.row, justifyContent: "space-between", marginBottom: 18 }}>
          <button onClick={onBack} style={{ ...S.btn, padding: "6px 14px", fontSize: 13 }}>← Volver</button>
          <div style={{ fontWeight: 600, color: C.ink, fontSize: 15, textAlign: "center", flex: 1 }}>{exercise.title}</div>
          <div style={{ width: 70 }} />
        </div>

        {hasAudio && !audioReady && !audioError && <div style={{ textAlign: "center", color: C.muted, fontSize: 12, marginBottom: 10 }}>Cargando audio…</div>}
        {audioError && <div style={{ textAlign: "center", color: C.danger, fontSize: 12, marginBottom: 10 }}>{audioError}</div>}

        <section style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 18, padding: "14px 14px 12px", marginBottom: 16 }}>
          <div style={{ background: C.paper2, borderRadius: 10, overflow: "hidden", border: `1px solid ${C.line}`, marginBottom: 6 }}>
            <WaveformDisplay time={time} duration={dur} allIntervals={[]}
              exerciseId={exercise.id} waveformData={waveformData}
              colorByFn={{}} questionRegion={questionRegion}
              onScrubBegin={scrubBegin} onScrubTo={scrubTo} onScrubEnd={scrubEnd} />
          </div>

          {/* Minimapa de preguntas */}
          <div style={{ position: "relative", height: 28, marginBottom: 4, background: C.paper2, borderRadius: 6, border: `1px solid ${C.line}`, overflow: "hidden", userSelect: "none" }}>
            {questions.map((q, idx) => {
              const isLock = lockedQuestion?.id === q.id;
              return (
                <div key={q.id}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={() => selectQuestion(q)}
                  title={`P${idx + 1}: ${fmt(q.audioStart)} – ${fmt(q.audioEnd)}`}
                  style={{
                    position: "absolute", top: 3, bottom: 3,
                    left:  `${(q.audioStart / dur) * 100}%`,
                    width: `${Math.max(0, (q.audioEnd - q.audioStart) / dur) * 100}%`,
                    background: C.quiz, opacity: isLock ? 1 : 0.45,
                    borderRadius: 3, cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    border: isLock ? `1.5px solid rgba(255,255,255,0.85)` : "none",
                    boxSizing: "border-box", overflow: "hidden", transition: "opacity .15s",
                  }}>
                  <span style={{ fontSize: 7, color: C.paper, fontWeight: 700, fontFamily: FONT_MONO, pointerEvents: "none" }}>P{idx + 1}</span>
                </div>
              );
            })}
            <div style={{ position: "absolute", top: 0, bottom: 0, left: `${(time / dur) * 100}%`, width: 1.5, background: C.ink, opacity: 0.75, pointerEvents: "none" }} />
          </div>

          {lockedQuestion ? (
            <div style={{ ...S.row, gap: 8, justifyContent: "center", fontSize: 12, color: C.quiz, margin: "6px 0 8px", flexWrap: "wrap" }}>
              <span>🔒 Fragmento activo: {fmt(lockedQuestion.audioStart)} – {fmt(lockedQuestion.audioEnd)}</span>
              <span style={{ color: C.muted2, fontSize: 11 }}>(bucle automático)</span>
              <button onClick={unlockAudio} style={{ ...S.btn, padding: "2px 10px", fontSize: 11, color: C.muted, borderColor: C.line }}>Liberar</button>
            </div>
          ) : (
            <div style={{ height: 8 }} />
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 12, paddingTop: 10, borderTop: `1px solid ${C.line}` }}>
            <div />
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <CircleButton onClick={() => seekTo(Math.max(lockedQuestion ? lockedQuestion.audioStart : 0, time - 5))}>−5s</CircleButton>
              <CircleButton onClick={togglePlay} disabled={hasAudio && !audioReady && !audioError}
                primary size={48} title={playing ? "Pausa (Espacio)" : "Reproducir (Espacio)"}>
                {playing ? "❚❚" : "▶"}
              </CircleButton>
              <CircleButton onClick={() => seekTo(Math.min(lockedQuestion ? lockedQuestion.audioEnd : dur, time + 5))}>+5s</CircleButton>
            </div>
            <div style={{ textAlign: "right", fontFamily: FONT_MONO, fontVariantNumeric: "tabular-nums", fontSize: 22, fontWeight: 600, color: C.ink, letterSpacing: -0.5 }}>
              {fmt(time)}<span style={{ color: C.muted2, fontWeight: 400 }}>/{fmt(dur)}</span>
            </div>
          </div>
        </section>

        <div style={{ ...S.row, gap: 8, marginBottom: 12, fontSize: 13, color: C.muted }}>
          <span>{answeredCount} de {questions.length} {questions.length === 1 ? "pregunta respondida" : "preguntas respondidas"}</span>
          <div style={{ flex: 1, height: 4, background: C.line, borderRadius: 2, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${questions.length ? (answeredCount / questions.length) * 100 : 0}%`, background: C.fnT, borderRadius: 2, transition: "width .3s" }} />
          </div>
        </div>

        {questions.map((q, idx) => {
          const isExpanded = expandedId === q.id;
          const isLocked   = lockedQuestion?.id === q.id;
          const answered   = answers[q.id] !== undefined && answers[q.id] !== "";
          return (
            <div key={q.id} onMouseDown={(e) => e.stopPropagation()}
              style={{ ...S.card, border: isLocked ? `1.5px solid ${C.quiz}` : `1px solid ${C.line}`, transition: "border-color .15s" }}>
              <div style={{ cursor: "pointer" }}
                onClick={() => { if (isExpanded) setExpandedId(null); else selectQuestion(q); }}>
                <div style={{ ...S.row, justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                  <div style={{ ...S.row, gap: 8, flex: 1, minWidth: 0, flexWrap: "wrap" }}>
                    <span style={{ ...S.badge, background: C.line, color: C.muted, flexShrink: 0 }}>Pregunta {idx + 1}</span>
                    {answered && <span style={{ ...S.badge, background: "rgba(63,155,91,0.14)", color: C.fnT, flexShrink: 0 }}>✓</span>}
                    <span style={{ fontSize: 14, color: C.ink, fontWeight: isExpanded ? 600 : 400, lineHeight: 1.4 }}>{q.text}</span>
                  </div>
                  <span style={{ color: C.muted2, fontSize: 12, flexShrink: 0 }}>{isExpanded ? "▲" : "▼"}</span>
                </div>
              </div>

              {isExpanded && (
                <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${C.line}` }}>
                  {q.type === "test" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {q.options.map((opt) => {
                        const isSel = answers[q.id] === opt.id;
                        return (
                          <button key={opt.id}
                            onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: opt.id }))}
                            style={{
                              background: isSel ? C.ink : C.paper, color: isSel ? C.paper : C.ink2,
                              border: `1.5px solid ${isSel ? C.ink : C.line}`,
                              borderRadius: 10, padding: "10px 14px", cursor: "pointer",
                              textAlign: "left", fontSize: 14, transition: "all .12s",
                              display: "flex", alignItems: "center", gap: 10,
                            }}>
                            <span style={{ fontFamily: FONT_MONO, fontWeight: 700, fontSize: 13, color: isSel ? C.paper : C.muted, minWidth: 20, flexShrink: 0 }}>{opt.id}</span>
                            {opt.text}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {q.type === "desarrollo" && (
                    <textarea
                      style={{ ...S.input, minHeight: 90, resize: "vertical", fontFamily: FONT_SANS, lineHeight: 1.5 }}
                      placeholder="Escribe tu respuesta aquí…"
                      value={answers[q.id] || ""}
                      onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                      onClick={(e) => e.stopPropagation()}
                    />
                  )}
                </div>
              )}
            </div>
          );
        })}

        <div style={{ ...S.row, justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginTop: 6, marginBottom: 24 }}>
          <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5, flex: "1 1 200px" }}>
            Haz clic en una pregunta para ver su fragmento en la waveform · Espacio = Play/Pausa
          </div>
          <PillSubmitButton onClick={handleSubmit}>Entregar respuestas</PillSubmitButton>
        </div>
      </div>
    </div>
  );
}

// ═══ 11. DASHBOARD DEL PROFESOR ═════════════════════════════════════════════

// ── Pestaña: Ejercicios ────────────────────────────────────────────────────
function ExercisesTab({ exercises, onNew, onSelect }) {
  return (
    <>
      <button onClick={onNew} style={{ ...S.btnPrimary, marginBottom: 20, display: "inline-flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 16, lineHeight: 1, marginTop: -1 }}>+</span> Nuevo ejercicio
      </button>

      {exercises.length === 0 ? (
        <p style={{ color: C.muted, textAlign: "center", padding: "3rem 1rem" }}>Aún no hay ejercicios.</p>
      ) : (
        <div style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 8, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 58px 112px 140px 16px", alignItems: "center", padding: "7px 16px", borderBottom: `1px solid ${C.line}`, background: C.paper2 }}>
            {["Nombre", "Dur.", "Tipo", "Estado", ""].map((h, i) => (
              <span key={i} style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.9, color: C.muted, textTransform: "uppercase" }}>{h}</span>
            ))}
          </div>

          {exercises.map((ex, i) => {
            const isQuiz   = modelOf(ex) === "cuestionario";
            const isSchema = modelOf(ex) === "esquema";
            const exQs   = questionsOf(ex);
            const { recorded, total } = (isQuiz || isSchema) ? { recorded: 0, total: 0 } : answerStats(ex);
            const keyDone    = isQuiz ? exQs.length > 0 : isSchema ? true : (recorded === total && total > 0);
            const keyPartial = !isQuiz && !isSchema && recorded > 0 && recorded < total;
            const dotColor   = isSchema ? C.fnD : keyDone ? C.fnT : keyPartial ? C.fnD : C.muted2;
            const dotLabel   = isQuiz
              ? (exQs.length === 0 ? "Sin preguntas" : `${exQs.length} ${exQs.length === 1 ? "pregunta" : "preguntas"}`)
              : isSchema ? "Sin clave automática"
              : recorded === 0   ? "Sin clave"
              : recorded === total ? "Clave completa"
              : `${recorded}/${total} claves`;

            return (
              <div key={ex.id} onClick={() => onSelect(ex.id)}
                style={{
                  display: "grid", gridTemplateColumns: "1fr 58px 112px 140px 16px",
                  alignItems: "center", padding: "11px 16px", cursor: "pointer",
                  borderBottom: i < exercises.length - 1 ? `1px solid ${C.line}` : "none",
                  transition: "background .1s",
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = C.paper2}
                onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                <div style={{ fontWeight: 500, fontSize: 14, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingRight: 16 }}>{ex.title}</div>
                <div style={{ fontSize: 12, color: C.muted, fontFamily: FONT_MONO }}>{fmt(ex.duration)}</div>
                <div>
                  <span style={{ ...S.badge, background: isQuiz ? "rgba(47,111,184,0.10)" : isSchema ? `${C.fnD}1C` : "rgba(63,155,91,0.08)", color: isQuiz ? C.quiz : isSchema ? C.fnD : C.fnT }}>
                    {isQuiz ? "Cuestionario" : isSchema ? "Esquema" : "Interactivo"}
                  </span>
                </div>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: keyDone ? C.fnT : keyPartial ? C.fnD : C.muted }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: dotColor, flexShrink: 0, display: "inline-block" }} />
                  {dotLabel}
                </div>
                <div style={{ color: C.muted2, fontSize: 16, fontWeight: 300, lineHeight: 1 }}>›</div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

// ── Pestaña: Cursos (con unidades y ejercicios anidados) ──────────────────
function CoursesTab({
  courses, units, exercises,
  openUnitIds, setOpenUnitIds,
  onCreateCourse, onEditCourse, onDeleteCourse,
  onCreateUnit, onEditUnit, onDeleteUnit,
  onPickFromBank, onCreateNewExInUnit, onRemoveExFromUnit,
  onSelectExercise,
  askConfirm,
}) {
  const toggleUnit = (id) => setOpenUnitIds((s) => toggleInSet(s, id));

  return (
    <>
      <button onClick={onCreateCourse} style={{ ...S.btnPrimary, marginBottom: 24, display: "inline-flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 16, lineHeight: 1, marginTop: -1 }}>+</span> Nuevo curso
      </button>

      {courses.length === 0
        ? <p style={{ color: C.muted, textAlign: "center", padding: "3rem 1rem" }}>Aún no hay cursos. Crea el primero para organizar tus ejercicios.</p>
        : courses.map((course, courseIdx) => {
            const courseUnits = units.filter((u) => course.unitIds.includes(u.id));
            const exCount     = courseUnits.reduce((sum, u) => sum + u.exerciseIds.length, 0);
            const accent      = COURSE_ACCENTS[courseIdx % COURSE_ACCENTS.length];

            return (
              <div key={course.id} style={{ marginBottom: 36 }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 0, marginBottom: 10 }}>
                  <div style={{ width: 3, alignSelf: "stretch", background: accent, borderRadius: 2, flexShrink: 0, marginRight: 14, marginTop: 3 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: FONT_SERIF, fontWeight: 600, fontSize: 18, color: C.ink, letterSpacing: -0.4, marginBottom: course.description ? 3 : 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{course.name}</div>
                    {course.description && <div style={{ fontSize: 12, color: C.muted, marginBottom: 6 }}>{course.description}</div>}
                    <div style={{ display: "flex", gap: 6 }}>
                      <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 4, fontWeight: 600, background: accent + "18", color: accent }}>
                        {courseUnits.length} {courseUnits.length === 1 ? "unidad" : "unidades"}
                      </span>
                      <span style={{ ...S.badge, background: C.paper2, color: C.muted }}>{exCount} {exCount === 1 ? "ejercicio" : "ejercicios"}</span>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 5, flexShrink: 0, marginLeft: 12 }}>
                    <button onClick={() => onEditCourse(course)} style={{ ...S.btn, padding: "5px 10px", fontSize: 11 }}>Editar</button>
                    <button onClick={() => askConfirm(`¿Eliminar el curso "${course.name}"?\n\nLas unidades y ejercicios no se eliminarán.`, () => onDeleteCourse(course.id))} style={{ ...S.btnDanger, padding: "5px 10px", fontSize: 11 }}>Eliminar</button>
                  </div>
                </div>

                {courseUnits.length === 0 ? (
                  <div style={{ paddingLeft: 17, color: C.muted, fontSize: 13 }}>Este curso no tiene unidades todavía.</div>
                ) : (
                  <div style={{ paddingLeft: 17 }}>
                    <div style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 8, overflow: "hidden" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "32px 1fr 88px auto", alignItems: "center", padding: "6px 12px", borderBottom: `1px solid ${C.line}`, background: C.paper2 }}>
                        {["", "Unidad", "Ejercicios", ""].map((h, i) => (
                          <span key={i} style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.9, color: C.muted, textTransform: "uppercase" }}>{h}</span>
                        ))}
                      </div>

                      {courseUnits.map((unit, unitIdx) => {
                        const isUnitOpen    = openUnitIds.has(unit.id);
                        const unitExercises = unit.exerciseIds.map((id) => exercises.find((e) => e.id === id)).filter(Boolean);
                        const isLast        = unitIdx === courseUnits.length - 1;

                        return (
                          <div key={unit.id}>
                            <div onClick={() => toggleUnit(unit.id)}
                              style={{
                                display: "grid", gridTemplateColumns: "32px 1fr 88px auto",
                                alignItems: "center", padding: "9px 12px", cursor: "pointer",
                                background: isUnitOpen ? C.paper2 : "transparent",
                                borderBottom: (!isLast || isUnitOpen) ? `1px solid ${C.line}` : "none",
                                transition: "background .1s",
                              }}
                              onMouseEnter={(e) => { if (!isUnitOpen) e.currentTarget.style.background = C.paper2; }}
                              onMouseLeave={(e) => { if (!isUnitOpen) e.currentTarget.style.background = "transparent"; }}>
                              <div style={{ width: 22, height: 22, borderRadius: 5, background: accent + "18", color: accent, fontSize: 10, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT_MONO, flexShrink: 0 }}>
                                U{unitIdx + 1}
                              </div>
                              <div style={{ minWidth: 0, paddingRight: 8 }}>
                                <div style={{ fontWeight: 500, fontSize: 13, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{unit.name}</div>
                                {unit.description && <div style={{ fontSize: 11, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{unit.description}</div>}
                              </div>
                              <div style={{ fontSize: 12, color: C.muted }}>
                                {unit.exerciseIds.length} {unit.exerciseIds.length === 1 ? "ej." : "ejs."}
                              </div>
                              <div style={{ display: "flex", gap: 4, alignItems: "center" }} onClick={(e) => e.stopPropagation()}>
                                <button onClick={() => onEditUnit(unit)} style={{ ...S.btn, padding: "3px 8px", fontSize: 11 }}>Editar</button>
                                <button onClick={() => askConfirm(`¿Eliminar la unidad "${unit.name}"?\n\nLos ejercicios no se eliminarán del banco global.`, () => onDeleteUnit(unit.id, course.id))} style={{ ...S.btnDanger, padding: "3px 8px", fontSize: 11 }}>Eliminar</button>
                                <span style={{ color: C.muted2, fontSize: 12, marginLeft: 2, userSelect: "none" }}>{isUnitOpen ? "▲" : "▼"}</span>
                              </div>
                            </div>

                            {isUnitOpen && (
                              <div style={{ borderBottom: !isLast ? `1px solid ${C.line}` : "none" }}>
                                <div style={{ display: "grid", gridTemplateColumns: "44px 1fr 54px 104px auto", alignItems: "center", padding: "5px 12px", background: C.bg, borderBottom: `1px solid ${C.line}` }}>
                                  {["", "Ejercicio", "Dur.", "Estado", ""].map((h, i) => (
                                    <span key={i} style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.8, color: C.muted2, textTransform: "uppercase" }}>{h}</span>
                                  ))}
                                </div>

                                {unitExercises.length === 0 ? (
                                  <div style={{ padding: "10px 12px 10px 44px", fontSize: 12, color: C.muted, background: C.bg }}>No hay ejercicios en esta unidad.</div>
                                ) : unitExercises.map((ex, exIdx) => {
                                  const isQuiz   = modelOf(ex) === "cuestionario";
                                  const exQs     = questionsOf(ex);
                                  const { recorded, total } = isQuiz ? { recorded: 0, total: 0 } : answerStats(ex);
                                  const keyDone  = isQuiz ? exQs.length > 0 : (recorded === total && total > 0);
                                  const dotColor = keyDone ? C.fnT : C.muted2;
                                  const dotLabel = isQuiz ? (exQs.length === 0 ? "Sin preguntas" : `${exQs.length} preg.`) : (recorded === 0 ? "Sin clave" : "Clave ✓");
                                  return (
                                    <div key={ex.id}
                                      style={{ display: "grid", gridTemplateColumns: "44px 1fr 54px 104px auto", alignItems: "center", padding: "8px 12px", background: C.bg, borderBottom: `1px solid ${C.line}`, transition: "background .1s" }}
                                      onMouseEnter={(e) => e.currentTarget.style.background = C.paper2}
                                      onMouseLeave={(e) => e.currentTarget.style.background = C.bg}>
                                      <span style={{ fontSize: 10, color: C.muted2, fontFamily: FONT_MONO, textAlign: "right", paddingRight: 10 }}>{exIdx + 1}</span>
                                      <div style={{ fontSize: 13, color: C.ink, cursor: "pointer", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingRight: 10 }}
                                        onClick={() => onSelectExercise(ex.id)}>
                                        {ex.title}
                                      </div>
                                      <div style={{ fontSize: 12, color: C.muted, fontFamily: FONT_MONO }}>{fmt(ex.duration)}</div>
                                      <div style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: keyDone ? C.fnT : C.muted }}>
                                        <span style={{ width: 5, height: 5, borderRadius: "50%", background: dotColor, display: "inline-block", flexShrink: 0 }} />
                                        {dotLabel}
                                      </div>
                                      <div>
                                        <button onClick={() => askConfirm(`¿Quitar "${ex.title}" de esta unidad?\n\nEl ejercicio permanecerá en el banco global.`, () => onRemoveExFromUnit(unit.id, ex.id))} style={{ ...S.btnDanger, fontSize: 10, padding: "2px 7px" }}>Quitar</button>
                                      </div>
                                    </div>
                                  );
                                })}

                                <div style={{ display: "flex", gap: 6, padding: "8px 12px 10px 44px", background: C.bg }}>
                                  <button onClick={() => onPickFromBank(unit.id)} style={{ ...S.btn, fontSize: 11, padding: "5px 10px" }}>+ Del banco</button>
                                  <button onClick={() => onCreateNewExInUnit(unit.id)} style={{ ...S.btnPrimary, fontSize: 11, padding: "5px 10px" }}>+ Nuevo ejercicio</button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div style={{ paddingLeft: 17, marginTop: 8 }}>
                  <button onClick={() => onCreateUnit(course.id)}
                    style={{ ...S.btn, fontSize: 12, padding: "6px 14px", borderStyle: "dashed", color: C.muted }}>
                    + Nueva unidad didáctica
                  </button>
                </div>
              </div>
            );
          })}
    </>
  );
}

// ── Pestaña: Alumnos ──────────────────────────────────────────────────────
function StudentsTab({ students, exercises, results, onAddStudent, onResetCred, onRemove, askConfirm }) {
  return (
    <>
      <div style={{ ...S.row, justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <p style={{ color: C.muted, fontSize: 13, margin: 0 }}>{students.length} {students.length === 1 ? "alumno" : "alumnos"}</p>
        <button onClick={onAddStudent} style={S.btnPrimary}>+ Crear cuenta de alumno</button>
      </div>

      {students.length === 0 && (
        <div style={{ ...S.card, textAlign: "center", color: C.muted, padding: "2rem 1rem", lineHeight: 1.8 }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>👨‍🎓</div>
          <div>Aún no hay alumnos.</div>
          <div style={{ fontSize: 13 }}>Crea el primero con el botón de arriba.</div>
        </div>
      )}

      {students.map((s) => {
        const sRes = results[s.id] || {};
        return (
          <div key={s.id} style={S.card}>
            <div style={{ ...S.row, justifyContent: "space-between", marginBottom: 10, gap: 10, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>{s.displayName}</div>
                <div style={{ ...S.row, gap: 6 }}>
                  <span style={{ ...S.badge, background: C.paper2, color: C.muted, fontFamily: FONT_MONO, fontSize: 10 }}>@{s.username}</span>
                  <span style={{ ...S.badge, background: s.credType === "pin" ? "rgba(47,111,184,0.12)" : "rgba(63,155,91,0.10)", color: s.credType === "pin" ? C.quiz : C.fnT }}>
                    {s.credType === "pin" ? "PIN" : "Contraseña"}
                  </span>
                </div>
              </div>
              <div style={{ ...S.row, gap: 6, flexShrink: 0 }}>
                <button onClick={() => onResetCred(s)} style={{ ...S.btn, fontSize: 12, padding: "5px 11px" }}>Resetear acceso</button>
                <button onClick={() => askConfirm(`¿Eliminar al alumno "${s.displayName}"?\n\nSe borrarán también todas sus respuestas guardadas.`, () => onRemove(s.id))} style={S.btnDanger}>Eliminar</button>
              </div>
            </div>
            {exercises.map((ex) => {
              const r = sRes[ex.id];
              return (
                <div key={ex.id} style={{ ...S.row, justifyContent: "space-between", paddingBottom: 6, borderBottom: `1px solid ${C.line}`, marginBottom: 6 }}>
                  <span style={{ fontSize: 13, color: C.muted2 }}>{ex.title}</span>
                  {r ? <ScoreBadge score={r.score} /> : <span style={{ ...S.badge, background: C.line, color: C.muted2 }}>—</span>}
                </div>
              );
            })}
          </div>
        );
      })}
    </>
  );
}

// ── Pestaña: Categorías ───────────────────────────────────────────────────
function CategoriesTab({ categories, onAdd, onEdit, onDelete, askConfirm }) {
  return (
    <>
      <button onClick={onAdd} style={{ ...S.btnPrimary, marginBottom: 16 }}>+ Crear categoría</button>
      <p style={{ color: C.muted, fontSize: 12, marginTop: -8, marginBottom: 16 }}>
        Las categorías definen los botones del modelo Interactivo. Editar o eliminar una categoría no afecta a los ejercicios ya creados.
      </p>

      {categories.map((m) => (
        <div key={m.id} style={S.card}>
          <div style={{ ...S.row, justifyContent: "space-between", marginBottom: 6, gap: 12, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 200px", minWidth: 0 }}>
              <div style={{ ...S.row, gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                <span style={{ fontWeight: 600 }}>{m.name}</span>
                {m.builtIn && <span style={{ ...S.badge, background: C.line, color: C.muted }}>Predeterminada</span>}
              </div>
              <div style={{ ...S.row, gap: 6, flexWrap: "wrap" }}>
                {m.buttons.map((b) => (
                  <span key={b.id} style={{ ...S.badge, background: b.color, color: textOn(b.color), fontSize: 10 }}>
                    {b.id} · {b.name} [{b.key.toUpperCase()}]
                  </span>
                ))}
              </div>
            </div>
            {!m.builtIn && (
              <div style={{ ...S.row, gap: 6 }}>
                <button onClick={() => onEdit(m)} style={S.btn}>Editar</button>
                <button onClick={() => askConfirm(`¿Eliminar la categoría "${m.name}"?\n\nLos ejercicios que ya la usan conservarán su copia.`, () => onDelete(m.id))} style={S.btnDanger}>Eliminar</button>
              </div>
            )}
          </div>
        </div>
      ))}
    </>
  );
}

// ── Pestaña: Audios (almacén) ─────────────────────────────────────────────
function AudiosTab({ audioLibrary, isAdmin, onAdd, onEdit, onDelete, askConfirm }) {
  const [previewId, setPreviewId] = useState(null);
  return (
    <>
      {isAdmin && (
        <button onClick={onAdd} style={{ ...S.btnPrimary, marginBottom: 16 }}>+ Añadir audio</button>
      )}
      {!isAdmin && (
        <p style={{ color: C.muted, fontSize: 13, margin: "0 0 16px" }}>Solo el administrador puede añadir o editar audios del almacén.</p>
      )}

      {audioLibrary.length === 0 && (
        <div style={{ ...S.card, textAlign: "center", color: C.muted, padding: "2.5rem 1rem", lineHeight: 1.8 }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>🎵</div>
          <div>El almacén está vacío.</div>
          {isAdmin && <div style={{ fontSize: 13 }}>Añade el primer audio con el botón de arriba.</div>}
        </div>
      )}

      {audioLibrary.map((audio) => {
        const isPrev = previewId === audio.id;
        return (
          <div key={audio.id} style={S.card}>
            <div style={{ ...S.row, justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 15, color: C.ink, marginBottom: audio.description ? 4 : 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{audio.title}</div>
                {audio.description && <div style={{ fontSize: 13, color: C.muted, marginBottom: 6, lineHeight: 1.4 }}>{audio.description}</div>}
                <div style={{ ...S.row, gap: 6 }}>
                  <span style={{ ...S.badge, background: C.line, color: C.muted, fontFamily: FONT_MONO }}>{fmt(audio.duration)}</span>
                  <span style={{ ...S.badge, background: C.paper2, color: C.muted, fontSize: 10, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{audio.url}</span>
                </div>
              </div>
              <div style={{ ...S.row, gap: 6, flexShrink: 0, flexWrap: "wrap" }}>
                <button onClick={() => setPreviewId(isPrev ? null : audio.id)} style={{ ...S.btn, padding: "5px 11px", fontSize: 12 }}>
                  {isPrev ? "⏹ Cerrar" : "▶ Escuchar"}
                </button>
                {isAdmin && (
                  <>
                    <button onClick={() => onEdit(audio)} style={{ ...S.btn, padding: "5px 10px", fontSize: 12 }}>Editar</button>
                    <button onClick={() => askConfirm(`¿Eliminar "${audio.title}" del almacén?\n\nLos ejercicios que ya lo usan conservarán su enlace.`, () => onDelete(audio.id))} style={{ ...S.btnDanger, padding: "5px 10px", fontSize: 12 }}>Eliminar</button>
                  </>
                )}
              </div>
            </div>
            {isPrev && (
              <audio key={audio.id} src={audio.url} controls autoPlay style={{ width: "100%", marginTop: 12, height: 36 }} />
            )}
          </div>
        );
      })}
    </>
  );
}

// ── Pestaña: Ajustes ──────────────────────────────────────────────────────
function SettingsTab({ margin, onMargin }) {
  return (
    <div style={S.card}>
      <label style={S.label}>Margen de error (segundos) — para ejercicios Interactivos</label>
      <div style={S.row}>
        <input type="range" min={0} max={3} step={0.5} value={margin}
          onChange={(e) => onMargin(Number(e.target.value))} style={{ flex: 1 }} />
        <span style={{ minWidth: 40, textAlign: "center", fontWeight: 600, color: C.fnD }}>{margin}s</span>
      </div>
      <p style={{ color: C.muted, fontSize: 12, marginTop: 8 }}>Por defecto: 1 segundo.</p>
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
  onRecord, onAdd, onLogout,
  categories, onAddCategory, onUpdateCategory, onDeleteCategory,
  courses, units,
  onAddCourse, onUpdateCourse, onDeleteCourse,
  onAddUnit, onUpdateUnit, onDeleteUnit,
  onAddExercisesToUnit, onRemoveExerciseFromUnit,
  audioLibrary = [], onAddAudio, onUpdateAudio, onDeleteAudio,
}) {
  const isAdmin = currentUser?.role === "admin";

  const students = useMemo(() =>
    (users || []).filter((u) => u.role === "student" && (isAdmin || u.createdBy === currentUser?.id || u.teacherId === currentUser?.id)),
    [users, currentUser, isAdmin]
  );
  const teachers = useMemo(() => (users || []).filter((u) => u.role === "teacher"), [users]);

  const [tab, setTab] = useState("exercises");
  const [selectedExerciseId, setSelectedExerciseId] = useState(null);

  // Modal state
  const [editingCategory, setEditingCategory] = useState(null);    // null | "new" | category
  const [confirmState,    setConfirmState]    = useState(null);
  const [editingAudio,    setEditingAudio]    = useState(null);    // null | "new" | audio
  const [showAddUser,     setShowAddUser]     = useState(false);
  const [addingUserRole,  setAddingUserRole]  = useState("student");
  const [showResetCred,   setShowResetCred]   = useState(false);
  const [resetCredTarget, setResetCredTarget] = useState(null);

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
    ? (exercises.find((e) => e.id === selectedExerciseId) || lastCreatedExRef.current)
    : null;

  if (selectedExercise) {
    return (
      <ExerciseDetailView
        exercise={selectedExercise}
        onBack={() => setSelectedExerciseId(null)}
        onRecord={onRecord}
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
      <div style={S.page}>
        <div style={{ paddingBottom: 20, borderBottom: `1.5px solid ${C.line}`, marginBottom: 0 }}>
          <div style={{ ...S.row, justifyContent: "space-between" }}>
            <div>
              <div style={{ fontFamily: FONT_MONO, fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: C.muted, marginBottom: 5 }}>
                {isAdmin ? "Administrador" : "Profesor"}
              </div>
              <h1 style={{ ...S.h1, fontSize: 22, marginBottom: 0 }}>{currentUser?.displayName}</h1>
            </div>
            <button onClick={onLogout} style={{ ...S.btn, fontSize: 12 }}>Salir</button>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "flex-end", borderBottom: `1px solid ${C.line}`, marginBottom: 26, gap: 0 }}>
          <TabBar tabs={primaryTabs}   value={tab} onChange={setTab} variant="primary" />
          <div style={{ flex: 1 }} />
          <TabBar tabs={secondaryTabs} value={tab} onChange={setTab} variant="secondary" />
        </div>

        {tab === "exercises" && (
          <ExercisesTab exercises={exercises}
            onNew={() => setSelectedExerciseId("new")}
            onSelect={setSelectedExerciseId} />
        )}

        {tab === "courses" && (
          <CoursesTab
            courses={courses} units={units} exercises={exercises}
            openUnitIds={openUnitIds} setOpenUnitIds={setOpenUnitIds}
            onCreateCourse={() => setEditingCourse("new")}
            onEditCourse={(c) => setEditingCourse(c)}
            onDeleteCourse={onDeleteCourse}
            onCreateUnit={(courseId) => { setEditingUnit(null); setUnitFormCourseId(courseId); }}
            onEditUnit={(u) => setEditingUnit(u)}
            onDeleteUnit={onDeleteUnit}
            onPickFromBank={(unitId) => setExPickerUnitId(unitId)}
            onCreateNewExInUnit={(unitId) => { setNewExInUnit(unitId); setSelectedExerciseId("new"); }}
            onRemoveExFromUnit={onRemoveExerciseFromUnit}
            onSelectExercise={setSelectedExerciseId}
            askConfirm={askConfirm}
          />
        )}

        {tab === "students" && (
          <StudentsTab students={students} exercises={exercises} results={results}
            onAddStudent={() => { setAddingUserRole("student"); setShowAddUser(true); }}
            onResetCred={(s) => { setResetCredTarget(s); setShowResetCred(true); }}
            onRemove={onRemoveUser} askConfirm={askConfirm} />
        )}

        {tab === "categories" && (
          <CategoriesTab categories={categories}
            onAdd={() => setEditingCategory("new")}
            onEdit={(m) => setEditingCategory(m)}
            onDelete={onDeleteCategory}
            askConfirm={askConfirm} />
        )}

        {tab === "audios" && (
          <AudiosTab audioLibrary={audioLibrary} isAdmin={isAdmin}
            onAdd={() => setEditingAudio("new")}
            onEdit={(a) => setEditingAudio(a)}
            onDelete={onDeleteAudio}
            askConfirm={askConfirm} />
        )}

        {tab === "settings" && <SettingsTab margin={margin} onMargin={onMargin} />}

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
            onSave={(c) => { if (editingCourse === "new") onAddCourse(c); else onUpdateCourse(c); setEditingCourse(null); }}
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
            onSave={(a) => { if (editingAudio === "new") onAddAudio(a); else onUpdateAudio(a); setEditingAudio(null); }}
            onClose={() => setEditingAudio(null)} />
        )}

        {confirmState && (
          <ConfirmModal {...confirmState} onCancel={() => setConfirmState(null)} />
        )}
      </div>
    </div>
  );
}

// ═══ 12. EXERCISE DETAIL VIEW (creación/edición de ejercicio) ═══════════════
function ExerciseDetailView({ exercise, onBack, onRecord, onUpdate, onCreate, onDelete, categories, audioLibrary = [] }) {
  const isCreating = exercise == null;

  // Estado del formulario
  const [title, setTitle] = useState(isCreating ? "" : exercise.title);
  const [model, setModel] = useState(isCreating ? DEFAULT_MODEL_ID : modelOf(exercise));

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
  const [audioDuration,  setAudioDuration]  = useState(null);
  const [waveformData,   setWaveformData]   = useState(isCreating ? null : (exercise.waveformData || null));
  const [manualDuration, setManualDuration] = useState(
    !isCreating && !exercise.audioName && exercise.duration ? String(exercise.duration) : ""
  );
  const [showConfirmDel,    setShowConfirmDel]    = useState(false);
  const [showLibraryPicker, setShowLibraryPicker] = useState(false);

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
    urlReqRef.current++;
  };

  const handlePickFromLibrary = (audio) => {
    urlReqRef.current++;                        // descarta cualquier carga en curso
    setAudioUrl(audio.url);
    setAudioName(audio.title);
    setAudioDuration(audio.duration);
    setWaveformData(null);                      // se recalcula al reproducir
    setManualDuration(String(audio.duration));
    setShowLibraryPicker(false);
  };

  const hasExistingAudio = !!audioName;
  const effDuration = hasExistingAudio
    ? (audioDuration || (!isCreating ? exercise.duration : 0))
    : (parseInt(manualDuration) || 0);

  // Detección de cambios (solo en edición)
  const isDirty = useMemo(() => {
    if (isCreating) return false;
    if (title.trim() !== exercise.title) return true;
    if (model !== modelOf(exercise)) return true;
    if (audioUrl !== (exercise.audioUrl || null)) return true;
    if (!audioName && exercise.audioName) return true;

    if (model === "interactivo") {
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
    return false;
  }, [isCreating, title, model, audioUrl, audioName, selectedCategoryIds, selectedButtonIds, manualDuration, exercise, hasExistingAudio]);

  const canSave = title.trim().length > 0 && effDuration > 0 && (isCreating || isDirty);

  const handleSave = () => {
    if (!canSave) return;
    const chosen = model === "interactivo" ? categories.filter((m) => selectedCategoryIds.has(m.id)) : [];

    const applyBtnFilter = (cat) => {
      const selBtns = selectedButtonIds.get(cat.id);
      const btns    = selBtns ? cat.buttons.filter((b) => selBtns.has(b.id)) : cat.buttons;
      return { ...cat, buttons: btns.length >= 1 ? btns : cat.buttons };
    };
    const safe = (chosen.length ? chosen : (model === "interactivo" ? [DEFAULT_CATEGORY] : [])).map(applyBtnFilter);

    if (isCreating) {
      onCreate({
        id: Date.now(),
        title: title.trim(),
        duration: effDuration,
        model,
        audioUrl:     audioUrl     || null,
        audioName:    audioName    || null,
        waveformData: waveformData || null,
        showHint: false,
        categories: model === "interactivo" ? safe : [],
        answers:    {},
        ...(model === "cuestionario" ? { questions: [] } : {}),
      });
      return;
    }

    const patch = { title: title.trim(), duration: effDuration, model };
    if (model === "interactivo") {
      const keepIds = new Set(safe.map((m) => m.id));
      const prev    = exercise.answers || {};
      patch.categories = safe;
      patch.modes      = undefined;
      patch.answers    = Object.fromEntries(Object.entries(prev).filter(([id]) => keepIds.has(id)));
    } else {
      patch.categories = [];
      patch.answers    = {};
    }
    patch.audioUrl     = audioUrl     || null;
    patch.audioName    = audioName    || null;
    patch.waveformData = waveformData || null;
    if (!audioName && exercise.audioName) {
      patch.audioUrl = null; patch.audioName = null; patch.waveformData = null;
    }
    onUpdate(patch);
  };

  // Estado derivado del ejercicio guardado
  const isQuizSaved = !isCreating && modelOf(exercise) === "cuestionario";
  const exQs        = isCreating ? [] : questionsOf(exercise);
  const { recorded, total } = (isCreating || isQuizSaved) ? { recorded: 0, total: 0 } : answerStats(exercise);

  return (
    <div style={S.app}>
      <div style={S.page}>
        <div style={{ ...S.row, justifyContent: "space-between", marginBottom: 28 }}>
          <button onClick={onBack} style={{ ...S.btn, fontSize: 12, padding: "6px 12px" }}>← Ejercicios</button>
          {(isCreating || isDirty) && (
            <button onClick={handleSave} disabled={!canSave}
              style={{ ...S.btnPrimary, ...disabledStyle(canSave) }}>
              {isCreating ? "Crear ejercicio" : "Guardar cambios"}
            </button>
          )}
        </div>

        <p style={SECTION_STYLE}>Información</p>

        <label style={S.label}>Nombre del ejercicio</label>
        <input style={{ ...S.input, marginBottom: 18, fontSize: 15, fontWeight: 500 }}
          value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej: Coral nº 4 – Bach" />

        <label style={S.label}>{hasExistingAudio ? "Audio" : "Audio del ejercicio"}</label>
        {hasExistingAudio && (
          <div style={{ background: C.paper2, border: `1px solid ${C.line}`, borderRadius: 10, padding: "8px 12px", marginBottom: 10, ...S.row, gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, color: C.ink, flex: "1 1 140px", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              🎵 {audioName}
            </span>
            {!isCreating && <span style={{ fontSize: 12, color: C.muted, fontFamily: FONT_MONO, flexShrink: 0 }}>{fmt(exercise.duration)}</span>}
            <button type="button" onClick={clearAudio} style={{ ...S.btnDanger, padding: "4px 10px", fontSize: 12 }}>Quitar</button>
          </div>
        )}

        {audioLibrary.length > 0 && (
          <button type="button" onClick={() => setShowLibraryPicker(true)}
            style={{ ...S.btn, width: "100%", marginBottom: 10, fontSize: 13, padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span>🎵 {hasExistingAudio ? "Cambiar desde el almacén" : "Elegir del almacén de audios"}</span>
            <span style={{ color: C.muted2, fontSize: 18, fontWeight: 300, lineHeight: 1 }}>›</span>
          </button>
        )}

        <label style={{ ...S.label, marginBottom: 4 }}>{audioLibrary.length > 0 ? "O pega una URL directamente" : "Enlace de audio (URL)"}</label>
        <input type="url" style={{ ...S.input, marginBottom: 4, fontSize: 13 }}
          value={audioUrl || ""} onChange={(e) => handleUrlInput(e.target.value)}
          placeholder="https://res.cloudinary.com/… o cualquier URL pública de audio" />
        {hasExistingAudio && audioDuration !== null && (
          <p style={{ fontSize: 12, color: C.fnT, margin: "4px 0 0" }}>Duración detectada: {fmt(audioDuration)}</p>
        )}
        {hasExistingAudio && audioDuration === null && (
          <p style={{ fontSize: 12, color: C.muted, margin: "4px 0 0" }}>Duración no detectada — se usará la actual o la manual.</p>
        )}
        {!hasExistingAudio && (
          <div style={{ marginTop: 10 }}>
            <label style={S.label}>Duración manual (segundos)</label>
            <input type="number" min={1} style={S.input}
              value={manualDuration} onChange={(e) => setManualDuration(e.target.value)} placeholder="Ej: 30" />
          </div>
        )}
        <div style={{ marginBottom: 18 }} />

        <label style={S.label}>Modelo de ejercicio</label>
        <div style={{ ...S.row, gap: 8, marginBottom: 8 }}>
          {EXERCISE_MODELS.map((m) => (
            <button key={m.id} type="button" onClick={() => setModel(m.id)} title={m.description}
              style={{
                ...S.btn, flex: 1, fontSize: 13, padding: "9px 12px",
                background: model === m.id ? C.ink : C.paper,
                color:      model === m.id ? C.paper : C.ink2,
                border:     `1px solid ${model === m.id ? C.ink : C.line}`,
              }}>
              {m.name}
            </button>
          ))}
        </div>
        {model === "cuestionario" && (
          <p style={{ fontSize: 11, color: C.quiz, margin: 0, padding: "6px 10px", background: "rgba(47,111,184,0.08)", borderRadius: 8 }}>
            Las preguntas se gestionan desde la sección de abajo.
          </p>
        )}

        {model === "interactivo" && (
          <div style={{ marginTop: 18 }}>
            <label style={S.label}>Categorías y botones del ejercicio</label>
            <div style={{ background: C.paper2, border: `1px solid ${C.line}`, borderRadius: 10, padding: 8, maxHeight: 320, overflowY: "auto" }}>
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
                              <span style={{
                                width: 20, height: 20, borderRadius: "50%", background: btn.color, flexShrink: 0,
                                display: "inline-flex", alignItems: "center", justifyContent: "center",
                                fontSize: 9, fontWeight: 800, color: "#fff", fontFamily: FONT_MONO,
                              }}>{btn.id}</span>
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

        <hr style={{ ...S.divider, margin: "28px 0" }} />

        {/* Clave · Interactivo */}
        {model === "interactivo" && (
          <>
            <p style={SECTION_STYLE}>Clave de corrección</p>
            {isCreating ? (
              <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.6, margin: 0 }}>
                Crea el ejercicio para poder grabar la clave de corrección.
              </p>
            ) : (
              <>
                <div style={{ marginBottom: 16 }}>
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
          </>
        )}

        {/* Esquema · info + boton probar */}
        {model === "esquema" && !isCreating && (
          <>
            <p style={SECTION_STYLE}>Esquema formal</p>
            <div style={{ background: `${C.fnD}10`, border: `1px solid ${C.fnD}30`, borderRadius: 10, padding: "12px 14px", marginBottom: 16, fontSize: 13, color: C.ink2, lineHeight: 1.6 }}>
              El alumno dibuja bloques de forma musical (partes, frases, armonía) sobre una línea de tiempo. No requiere clave de corrección automática: el profesor revisa los esquemas manualmente.
            </div>
            <button onClick={() => onRecord(exercise)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", background: C.paper2, color: C.ink, border: `1.5px solid ${C.line}`, borderRadius: 12, padding: "13px 18px", cursor: "pointer", fontSize: 15, fontWeight: 600 }}>
              <span>Probar ejercicio</span>
              <span style={{ fontSize: 18, opacity: 0.55, fontWeight: 300 }}>{">"}</span>
            </button>
          </>
        )}

        {/* Preguntas · Cuestionario */}
        {model === "cuestionario" && !isCreating && (
          <>
            <p style={SECTION_STYLE}>Preguntas</p>
            <div style={{ ...S.row, justifyContent: "space-between", padding: "8px 12px", borderRadius: 8, background: exQs.length > 0 ? "rgba(47,111,184,0.07)" : C.paper2, border: `1px solid ${exQs.length > 0 ? "rgba(47,111,184,0.22)" : C.line}`, marginBottom: 16 }}>
              <span style={{ fontSize: 13, color: C.ink2, fontWeight: 500 }}>Preguntas configuradas</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: exQs.length > 0 ? C.quiz : C.muted }}>
                {exQs.length > 0 ? `${exQs.length} ${exQs.length === 1 ? "pregunta" : "preguntas"}` : "Ninguna todavía"}
              </span>
            </div>
            <button onClick={() => onRecord(exercise)} style={{
              width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
              background: exQs.length === 0 ? C.ink : C.paper2,
              color:      exQs.length === 0 ? C.paper : C.ink,
              border:     exQs.length === 0 ? `1px solid ${C.ink}` : `1.5px solid ${C.line}`,
              borderRadius: 12, padding: "13px 18px", cursor: "pointer", fontSize: 15, fontWeight: 600,
            }}>
              <span>{exQs.length === 0 ? "Crear preguntas" : "Editar preguntas"}</span>
              <span style={{ fontSize: 18, opacity: 0.55, fontWeight: 300 }}>→</span>
            </button>
          </>
        )}

        {/* Opciones para el alumno (solo interactivo, tras crear) */}
        {!isCreating && model === "interactivo" && (
          <>
            <hr style={{ ...S.divider, margin: "28px 0" }} />
            <p style={SECTION_STYLE}>Opciones para el alumno</p>
            <label style={{ display: "flex", alignItems: "flex-start", gap: 14, cursor: "pointer", userSelect: "none" }}>
              <input type="checkbox" checked={!!exercise.showHint}
                onChange={(e) => onUpdate({ showHint: e.target.checked })}
                style={{ width: 16, height: 16, marginTop: 2, accentColor: C.fnT, flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 14, fontWeight: 500, color: C.ink, marginBottom: 3 }}>Mostrar guía de tiempo</div>
                <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5 }}>
                  Muestra los bloques de función como barras apagadas — una pista sin revelar la solución.
                </div>
              </div>
            </label>
          </>
        )}

        {/* Zona de peligro */}
        {!isCreating && (
          <div style={{ marginTop: 40, paddingTop: 20, borderTop: `1px solid ${C.line}` }}>
            <button onClick={() => setShowConfirmDel(true)} style={{ ...S.btnDanger, width: "100%", padding: "10px", fontSize: 13, textAlign: "center" }}>
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
    togglePlay, seekTo, scrubBegin, scrubTo, scrubEnd,
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
                <WaveformDisplay time={time} duration={dur} allIntervals={[]}
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
            <div style={{ position: "absolute", top: 0, bottom: 0, left: `${(time / dur) * 100}%`, width: 1.5, background: C.ink, opacity: 0.75, pointerEvents: "none", zIndex: 5 }} />
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
      id:   initialCategory?.id || uid("cat"),
      name: name.trim(),
      builtIn: false,
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
function CourseFormModal({ initial, onSave, onClose }) {
  const [name, setName] = useState(initial?.name || "");
  const [desc, setDesc] = useState(initial?.description || "");
  const canSave = name.trim().length > 0;

  const handleSave = () => {
    if (!canSave) return;
    onSave({
      id:          initial?.id || uid("course"),
      name:        name.trim(),
      description: desc.trim(),
      unitIds:     initial?.unitIds || [],
      createdAt:   initial?.createdAt || Date.now(),
    });
  };

  return (
    <ModalShell width={440}>
      <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 600, color: C.ink }}>{initial ? "Editar curso" : "Nuevo curso"}</h3>
      <label style={S.label}>Nombre del curso</label>
      <input style={{ ...S.input, marginBottom: 14 }} value={name} autoFocus
        onChange={(e) => setName(e.target.value)} placeholder="Ej: 2º Bachillerato — Armonía" />
      <label style={S.label}>Descripción (opcional)</label>
      <textarea style={{ ...S.input, marginBottom: 18, minHeight: 60, resize: "vertical", fontFamily: FONT_SANS }}
        value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Breve descripción del curso…" />
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

// Picker para elegir un audio del almacén
function AudioLibraryPickerModal({ library, onPick, onClose }) {
  const [previewId, setPreviewId] = useState(null);
  return (
    <ModalShell width={560} align="top">
      <h3 style={{ margin: "0 0 14px", fontSize: 16, fontWeight: 600, color: C.ink }}>Elegir audio del almacén</h3>

      {library.length === 0 ? (
        <div style={{ textAlign: "center", padding: "2rem 1rem", color: C.muted, fontSize: 13, lineHeight: 1.6 }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>🎵</div>
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
                    <div style={{ fontWeight: 500, fontSize: 14, color: C.ink, marginBottom: audio.description ? 2 : 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{audio.title}</div>
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
function AudioLibraryFormModal({ initial, onSave, onClose }) {
  const [title,       setTitle]       = useState(initial?.title || "");
  const [description, setDescription] = useState(initial?.description || "");
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
      description: description.trim(),
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

      <label style={S.label}>Descripción (opcional)</label>
      <textarea style={{ ...S.input, marginBottom: 14, minHeight: 60, resize: "vertical", fontFamily: FONT_SANS }}
        value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Tonalidad, compositor, contexto…" />

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

// ═══ 15. APP ROOT ═══════════════════════════════════════════════════════════
export default function App() {
  useInjectFonts();

  // Estado global
  const [exercises,    setExercises]    = useState(INIT_EXERCISES);
  const [users,        setUsers]        = useState([]);
  const [results,      setResults]      = useState({});   // { userId: { exerciseId: result } }
  const [margin,       setMargin]       = useState(1);
  const [categories,   setCategories]   = useState([DEFAULT_CATEGORY]);
  const [courses,      setCourses]      = useState([]);
  const [units,        setUnits]        = useState([]);
  const [audioLibrary, setAudioLibrary] = useState([]);

  const [dbReady, setDbReady] = useState(false);
  const [user,    setUser]    = useState(null);

  // Navegación
  const [loginRole,    setLoginRole]      = useState(null);   // "admin" | "teacher" | "student" | null
  const [view,         setView]           = useState("home"); // home | student-dash | teacher-dash | exercise | questionnaire | question-manager | correction
  const [exCtx,        setExCtx]          = useState(null);   // { exercise, mode: 'student'|'record' }
  const [qmCtx,        setQmCtx]          = useState(null);   // { exercise }
  const [lastResult,   setLastResult]     = useState(null);
  const [guestResults, setGuestResults]   = useState({});
  const [pickingTeacher, setPickingTeacher] = useState(false);

  // ─── Carga inicial desde Supabase ────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const [
          exRes, userRes, catRes, courseRes, unitRes,
          resultRes, settingsRes, audioRes,
        ] = await Promise.all([
          supabase.from("fa_exercises").select("*"),
          supabase.from("fa_users").select("*"),
          supabase.from("fa_categories").select("*"),
          supabase.from("fa_courses").select("*"),
          supabase.from("fa_units").select("*"),
          supabase.from("fa_results").select("*"),
          supabase.from("fa_settings").select("*"),
          supabase.from("fa_audio_library").select("*"),
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
  const dbUpsertExercise = async (ex) => {
    // El waveform decodificado puede pesar mucho; no se guarda en Supabase.
    // eslint-disable-next-line no-unused-vars
    const { waveformData, ...rest } = ex;
    await supabase.from("fa_exercises").upsert({ id: ex.id, data: rest });
  };
  const dbDeleteExercise = async (id) => { await supabase.from("fa_exercises").delete().eq("id", id); };

  const dbUpsertUser   = async (u)  => { await supabase.from("fa_users").upsert({ id: u.id, data: u }); };
  const dbDeleteUser   = async (id) => { await supabase.from("fa_users").delete().eq("id", id); };

  const dbUpsertCategory = async (c)  => { await supabase.from("fa_categories").upsert({ id: c.id, data: c }); };
  const dbDeleteCategory = async (id) => { await supabase.from("fa_categories").delete().eq("id", id); };

  const dbUpsertCourse = async (c)  => { await supabase.from("fa_courses").upsert({ id: c.id, data: c }); };
  const dbDeleteCourse = async (id) => { await supabase.from("fa_courses").delete().eq("id", id); };

  const dbUpsertUnit = async (u)  => { await supabase.from("fa_units").upsert({ id: u.id, data: u }); };
  const dbDeleteUnit = async (id) => { await supabase.from("fa_units").delete().eq("id", id); };

  const dbUpsertResult = async (userId, exerciseId, data) => {
    await supabase.from("fa_results").upsert({ user_id: userId, exercise_id: exerciseId, data });
  };
  const dbDeleteResultsForUser     = async (userId)     => { await supabase.from("fa_results").delete().eq("user_id", userId); };
  const dbDeleteResultsForExercise = async (exerciseId) => { await supabase.from("fa_results").delete().eq("exercise_id", exerciseId); };

  const dbUpsertSetting = async (key, value) => { await supabase.from("fa_settings").upsert({ key, value }); };

  const dbUpsertAudio = async (a)  => { await supabase.from("fa_audio_library").upsert({ id: a.id, data: a }); };
  const dbDeleteAudio = async (id) => { await supabase.from("fa_audio_library").delete().eq("id", id); };

  // ─── Users ───────────────────────────────────────────────────────────────
  const addUser = (newUser) => {
    setUsers((prev) => [...prev, newUser]);
    dbUpsertUser(newUser);
  };

  const removeUser = (userId) => {
    setUsers((prev) => prev.filter((u) => u.id !== userId));
    setResults((prev) => { const next = { ...prev }; delete next[userId]; return next; });
    dbDeleteUser(userId);
    dbDeleteResultsForUser(userId);
  };

  const updateUser = (updatedUser) => {
    setUsers((prev) => prev.map((u) => u.id === updatedUser.id ? updatedUser : u));
    if (user?.id === updatedUser.id) setUser(updatedUser);
    dbUpsertUser(updatedUser);
  };

  // ─── Setup inicial (primer admin) ────────────────────────────────────────
  const handleSetup = (adminUser) => {
    setUsers([adminUser]);
    setUser(adminUser);
    setLoginRole(null);
    setView("teacher-dash");
    dbUpsertUser(adminUser);
  };

  // ─── Exercises ───────────────────────────────────────────────────────────
  const addExercise = (newEx) => {
    setExercises((prev) => [...prev, newEx]);
    dbUpsertExercise(newEx);
  };

  const updateExercise = (id, patch) => {
    setExercises((prev) => {
      const next = prev.map((e) => e.id === id ? { ...e, ...patch } : e);
      const updated = next.find((e) => e.id === id);
      if (updated) dbUpsertExercise(updated);
      return next;
    });
  };

  const deleteExercise = (id) => {
    setExercises((prev) => prev.filter((e) => e.id !== id));
    // BUG FIX: leer units con callback evita race condition con setUnits anteriores
    setUnits((prev) => {
      const next = prev.map((u) => ({ ...u, exerciseIds: u.exerciseIds.filter((eid) => eid !== id) }));
      next.forEach((u, i) => { if (u.exerciseIds.length !== prev[i].exerciseIds.length) dbUpsertUnit(u); });
      return next;
    });
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
    setCourses((prev) => {
      const next = prev.map((c) => c.id === courseId ? { ...c, unitIds: [...c.unitIds, newUnit.id] } : c);
      const updatedCourse = next.find((c) => c.id === courseId);
      if (updatedCourse) dbUpsertCourse(updatedCourse);
      return next;
    });
    dbUpsertUnit(newUnit);
  };

  const updateUnit = (updated) => {
    setUnits((prev) => prev.map((u) => u.id === updated.id ? updated : u));
    dbUpsertUnit(updated);
  };

  const deleteUnit = (unitId, courseId) => {
    setUnits((prev) => prev.filter((u) => u.id !== unitId));
    setCourses((prev) => {
      const next = prev.map((c) => c.id === courseId ? { ...c, unitIds: c.unitIds.filter((id) => id !== unitId) } : c);
      const updatedCourse = next.find((c) => c.id === courseId);
      if (updatedCourse) dbUpsertCourse(updatedCourse);
      return next;
    });
    dbDeleteUnit(unitId);
  };

  const addExercisesToUnit = (unitId, exIds) => {
    setUnits((prev) => {
      const next = prev.map((u) => {
        if (u.id !== unitId) return u;
        const merged = [...u.exerciseIds, ...exIds.filter((id) => !u.exerciseIds.includes(id))];
        return { ...u, exerciseIds: merged };
      });
      const updated = next.find((u) => u.id === unitId);
      if (updated) dbUpsertUnit(updated);
      return next;
    });
  };

  const removeExerciseFromUnit = (unitId, exId) => {
    setUnits((prev) => {
      const next = prev.map((u) => u.id === unitId ? { ...u, exerciseIds: u.exerciseIds.filter((id) => id !== exId) } : u);
      const updated = next.find((u) => u.id === unitId);
      if (updated) dbUpsertUnit(updated);
      return next;
    });
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

  const openEx = (ex, mode = "student") => {
    const fresh = freshExercise(ex);
    setExCtx({ exercise: fresh, mode });
    const m = modelOf(fresh);
    if (m === "esquema") setView("schema");
    else if (mode === "student" && m === "cuestionario") setView("questionnaire");
    else setView("exercise");
  };

  const openQM = (ex) => {
    setQmCtx({ exercise: freshExercise(ex) });
    setView("question-manager");
  };

  // ─── Submit de respuestas (alumno entrega ejercicio) ────────────────────
  const submitAnswer = (payload) => {
    if (!exCtx) return;
    const ex      = freshExercise(exCtx.exercise);
    const isGuest = user?.isGuest;

    // Cuestionario
    if (payload?.type === "cuestionario") {
      const data = { type: "cuestionario", answers: payload.answers, score: payload.score, timestamp: Date.now() };
      if (isGuest) {
        setGuestResults((prev) => ({ ...prev, [ex.id]: data }));
      } else if (user) {
        setResults((prev) => ({ ...prev, [user.id]: { ...(prev[user.id] || {}), [ex.id]: data } }));
        dbUpsertResult(user.id, ex.id, data);
      }
      setLastResult(data);
      setView("correction");
      return;
    }

    // Esquema
    if (payload?.type === "esquema") {
      if (payload.mode === "record") {
        // El profesor guarda el esquema como modelo de referencia
        updateExercise(ex.id, { schemaKey: payload.blocks });
        setExCtx(null);
        setView("teacher-dash");
        return;
      }
      const data = { type: "esquema", blocks: payload.blocks, timestamp: Date.now() };
      if (isGuest) {
        setGuestResults((prev) => ({ ...prev, [ex.id]: data }));
      } else if (user) {
        setResults((prev) => ({ ...prev, [user.id]: { ...(prev[user.id] || {}), [ex.id]: data } }));
        dbUpsertResult(user.id, ex.id, data);
      }
      setLastResult(data);
      setView("correction");
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
      setExCtx(null);
      setView("teacher-dash");
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
    setView("correction");
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

  // Selección de profesor para alumno (al primer login o al pedirlo)
  if (pickingTeacher && user?.role === "student") {
    const teacherList = (users || []).filter((u) => u.role === "teacher");
    return (
      <TeacherPickerView
        teachers={teacherList}
        currentTeacherId={user.teacherId}
        onPick={(t) => { const upd = { ...user, teacherId: t.id }; updateUser(upd); setPickingTeacher(false); }}
        onLogout={() => { setUser(null); setLoginRole(null); setPickingTeacher(false); setView("home"); }}
      />
    );
  }

  // Login flow
  if (!user) {
    if (loginRole) {
      const labels = { admin: "administrador", teacher: "profesor", student: "alumno" };
      return (
        <LoginView
          roleLabel={labels[loginRole]}
          filterRole={loginRole}
          users={users}
          onLogin={(u) => {
            setUser(u);
            setLoginRole(null);
            if (u.role === "student") {
              const hasTeacher = (users || []).some((x) => x.role === "teacher" && x.id === u.teacherId);
              if (!u.teacherId || !hasTeacher) { setPickingTeacher(true); return; }
              setView("student-dash");
            } else {
              setView("teacher-dash");
            }
          }}
          onBack={() => setLoginRole(null)}
          onGuest={loginRole === "student" ? () => {
            const guest = { id: `guest-${Date.now()}`, displayName: "Invitado", role: "student", isGuest: true };
            setUser(guest); setLoginRole(null); setView("student-dash");
          } : null}
        />
      );
    }
    return (
      <HomeView
        onAdmin  ={() => setLoginRole("admin")}
        onTeacher={() => setLoginRole("teacher")}
        onStudent={() => setLoginRole("student")}
      />
    );
  }

  // Vistas autenticadas
  const onLogout = () => { setUser(null); setView("home"); setGuestResults({}); };
  const userResults = user.isGuest ? guestResults : (results[user.id] || {});

  if (view === "exercise" && exCtx) {
    return (
      <ExerciseView
        exercise={exCtx.exercise} mode={exCtx.mode}
        onSubmit={submitAnswer}
        onBack={() => {
          setExCtx(null);
          setView(exCtx.mode === "record" ? "teacher-dash" : "student-dash");
        }}
      />
    );
  }

  if (view === "schema" && exCtx) {
    return (
      <SchemaExerciseView
        exercise={exCtx.exercise} mode={exCtx.mode}
        onSubmit={submitAnswer}
        onBack={() => {
          setExCtx(null);
          setView(exCtx.mode === "record" ? "teacher-dash" : "student-dash");
        }}
      />
    );
  }

  if (view === "questionnaire" && exCtx) {
    return (
      <QuestionnaireView
        exercise={exCtx.exercise}
        onSubmit={submitAnswer}
        onBack={() => { setExCtx(null); setView("student-dash"); }}
      />
    );
  }

  if (view === "question-manager" && qmCtx) {
    return (
      <QuestionManagerView
        exercise={qmCtx.exercise}
        onSave={(questions) => {
          updateExercise(qmCtx.exercise.id, { questions });
          setQmCtx(null); setView("teacher-dash");
        }}
        onBack={() => { setQmCtx(null); setView("teacher-dash"); }}
      />
    );
  }

  if (view === "correction" && exCtx && lastResult) {
    return (
      <CorrectionView
        exercise={freshExercise(exCtx.exercise)}
        result={lastResult} margin={margin}
        onBack={() => { setExCtx(null); setLastResult(null); setView("student-dash"); }}
      />
    );
  }

  if (user.role === "student") {
    const teacherId = user.teacherId;
    const visibleExercises = teacherId
      ? exercises.filter((ex) => {
          // El alumno ve los ejercicios asignados a través de cursos/unidades del profesor
          // (heurística: cualquier ejercicio en alguna unidad de algún curso del profesor)
          // Si no hay sistema de propietario, mostramos todos los del banco.
          return true;
        })
      : exercises;

    return (
      <StudentDash
        user={user}
        exercises={visibleExercises}
        results={userResults}
        courses={courses}
        units={units}
        onExercise={(ex) => openEx(ex, "student")}
        onLogout={onLogout}
        onChangeTeacher={user.isGuest ? null : () => setPickingTeacher(true)}
      />
    );
  }

  // Teacher / Admin dashboard
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
      onRecord={(ex) => {
        const fresh = freshExercise(ex);
        if (modelOf(fresh) === "cuestionario") openQM(fresh);
        else if (modelOf(fresh) === "esquema") { setExCtx({ exercise: fresh, mode: "record" }); setView("schema"); }
        else { setExCtx({ exercise: fresh, mode: "record" }); setView("exercise"); }
      }}
      onAdd={addExercise}
      onLogout={onLogout}
      categories={categories}
      onAddCategory={addCategory}
      onUpdateCategory={updateCategory}
      onDeleteCategory={deleteCategory}
      courses={courses} units={units}
      onAddCourse={addCourse} onUpdateCourse={updateCourse} onDeleteCourse={deleteCourse}
      onAddUnit={addUnit} onUpdateUnit={updateUnit} onDeleteUnit={deleteUnit}
      onAddExercisesToUnit={addExercisesToUnit}
      onRemoveExerciseFromUnit={removeExerciseFromUnit}
      audioLibrary={audioLibrary}
      onAddAudio={addAudio} onUpdateAudio={updateAudio} onDeleteAudio={deleteAudio}
    />
  );
}
