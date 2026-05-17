import { useState, useEffect, useRef, useMemo, useCallback } from "react";

// ═══════════════════════════════════════════════════════════════════════════
//   HOOKS · UTILITIES
// ═══════════════════════════════════════════════════════════════════════════
// usePersistentState: localStorage is not available in this artifact environment,
// so we fall back to plain in-memory useState. The initial value goes through
// transformLoaded once so the data shape is identical to the localStorage path.
function usePersistentState(key, initial, opts = {}) { // eslint-disable-line no-unused-vars
  const { transformLoaded } = opts;
  const resolved = (() => {
    try { return transformLoaded ? transformLoaded(initial) : initial; }
    catch { return initial; }
  })();
  return useState(resolved);
}

function startPointerDrag(event, { onStart, onMove, onEnd }) {
  event.preventDefault();
  const getX = (ev) => ev.touches?.[0]?.clientX ?? ev.changedTouches?.[0]?.clientX ?? ev.clientX;
  onStart?.(event, getX);
  const move = (ev) => { if (ev.cancelable) ev.preventDefault(); onMove?.(ev, getX); };
  const end = () => {
    window.removeEventListener("mousemove", move);
    window.removeEventListener("mouseup", end);
    window.removeEventListener("touchmove", move);
    window.removeEventListener("touchend", end);
    window.removeEventListener("touchcancel", end);
    onEnd?.();
  };
  window.addEventListener("mousemove", move);
  window.addEventListener("mouseup", end);
  window.addEventListener("touchmove", move, { passive: false });
  window.addEventListener("touchend", end);
  window.addEventListener("touchcancel", end);
}

function smoothArray(raw, W) {
  const n = raw.length; const out = new Array(n);
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
  const blk = Math.max(1, Math.floor(channelData.length / N));
  const raw = new Array(N);
  for (let i = 0; i < N; i++) {
    let s = 0;
    for (let j = 0; j < blk; j++) s += Math.abs(channelData[i * blk + j] || 0);
    raw[i] = s / blk;
  }
  const sm = smoothArray(raw, 3);
  let mx = 1e-4; for (let i = 0; i < sm.length; i++) if (sm[i] > mx) mx = sm[i];
  return sm.map(v => 0.08 + (v / mx) * 0.92);
}

function generateWaveform(seed, numSamples) {
  let s = (seed * 1664525 + 1013904223) >>> 0;
  const raw = new Array(numSamples);
  for (let i = 0; i < numSamples; i++) { s = (s * 1664525 + 1013904223) >>> 0; raw[i] = s / 0xffffffff; }
  const sm = smoothArray(raw, 14);
  let mn = sm[0], mx = sm[0];
  for (let i = 1; i < sm.length; i++) { if (sm[i] < mn) mn = sm[i]; if (sm[i] > mx) mx = sm[i]; }
  return sm.map(v => 0.08 + ((v - mn) / (mx - mn)) * 0.92);
}

function dataUrlToBuffer(url) {
  const b64 = url.includes(",") ? url.split(",")[1] : url;
  const str = atob(b64);
  const buf = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) buf[i] = str.charCodeAt(i);
  return buf.buffer;
}

const fmt = (s) => { const m = Math.floor(s / 60), sec = Math.floor(s % 60); return `${m}:${sec.toString().padStart(2, "0")}`; };
const getAt = (intervals, t) => { for (const iv of intervals) if (t >= iv.start && t < iv.end) return iv.fn; return null; };

const resolveOverlap = (existingIntervals, newInterval) => {
  const result = [];
  for (const iv of existingIntervals) {
    if (iv.end <= newInterval.start || iv.start >= newInterval.end) { result.push(iv); continue; }
    if (iv.start < newInterval.start) result.push({ ...iv, end: newInterval.start });
    if (iv.end > newInterval.end)     result.push({ ...iv, start: newInterval.end });
  }
  return result;
};

const calcScore = (teacherAns, studentAns, duration, margin = 1) => {
  if (!teacherAns.length) return null;
  const STEP = 0.1; let tot = 0, ok = 0;
  for (let t = 0; t < duration; t += STEP) {
    const tf = getAt(teacherAns, t); if (!tf) continue; tot++;
    let found = false;
    for (let d = -margin; d <= margin + STEP / 2; d += STEP) {
      if (getAt(studentAns, t + d) === tf) { found = true; break; }
    }
    if (found) ok++;
  }
  return tot > 0 ? Math.round((ok / tot) * 100) : 0;
};

const calcQuestionnaireScore = (questions, answers) => {
  const testQs = (questions || []).filter(q => q.type === "test" && q.correctOptionId);
  if (testQs.length === 0) return null;
  const correct = testQs.filter(q => (answers || {})[q.id] === q.correctOptionId).length;
  return Math.round((correct / testQs.length) * 100);
};

const textOn = (hex) => {
  if (!hex || hex[0] !== "#") return "#000";
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${Math.round(r * 0.18)},${Math.round(g * 0.18)},${Math.round(b * 0.18)})`;
};

// ═══════════════════════════════════════════════════════════════════════════
//   DOMAIN CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════
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

const EXERCISE_MODELS = [
  { id: "interactivo",  name: "Interactivo",  description: "El alumno marca categorías en vivo durante el audio." },
  { id: "cuestionario", name: "Cuestionario", description: "Preguntas ancladas a fragmentos concretos del audio." },
];
const DEFAULT_MODEL_ID = "interactivo";

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

const DEMO_STUDENTS = [
  { id: 1, name: "Ana García" },
  { id: 2, name: "Carlos López" },
  { id: 3, name: "María Fdez." },
];

const INIT_COURSES = [];
const INIT_UNITS   = [];

// ═══════════════════════════════════════════════════════════════════════════
//   DOMAIN SHAPE HELPERS
// ═══════════════════════════════════════════════════════════════════════════
const categoriesOf = (exercise) => {
  if (Array.isArray(exercise?.categories) && exercise.categories.length > 0) return exercise.categories;
  if (Array.isArray(exercise?.modes) && exercise.modes.length > 0) return exercise.modes;
  if (exercise?.mode) return [exercise.mode];
  return [DEFAULT_CATEGORY];
};
const modelOf   = (exercise) => exercise?.model || DEFAULT_MODEL_ID;
const answerFor = (exercise, categoryId) => {
  if (exercise?.answers && Array.isArray(exercise.answers[categoryId])) return exercise.answers[categoryId];
  if (Array.isArray(exercise?.answer)) {
    const legacyCategoryId = exercise.mode?.id || DEFAULT_CATEGORY.id;
    if (categoryId === legacyCategoryId) return exercise.answer;
  }
  return [];
};
const answerStats = (exercise) => {
  const ms = categoriesOf(exercise);
  const recorded = ms.filter((m) => answerFor(exercise, m.id).length > 0).length;
  return { recorded, total: ms.length };
};
const btnOf = (category, id) => category.buttons.find((b) => b.id === id) || category.buttons[0];
const questionsOf = (exercise) => Array.isArray(exercise?.questions) ? exercise.questions : [];

// ═══════════════════════════════════════════════════════════════════════════
//   DESIGN TOKENS
// ═══════════════════════════════════════════════════════════════════════════
const C = {
  bg: "#F2EFE7", paper: "#FBFAF6", paper2: "#F5F2EA",
  ink: "#1A1915", ink2: "#3A3830", muted: "#7C7868", muted2: "#B0AC9C", line: "#E2DCCC",
  fnT: "#3F9B5B", fnS: "#2F6FB8", fnD: "#C77A1A",
  fnI: "#9A4FB8", fnIV: "#3A8CA8", fnV: "#C9A33A",
  quiz: "#2F6FB8",
};
const FONT_SANS = "'Geist', system-ui, -apple-system, 'Segoe UI', sans-serif";
const FONT_MONO = "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace";
const S = {
  app:        { fontFamily: FONT_SANS, background: C.bg, minHeight: "100vh", color: C.ink },
  page:       { maxWidth: 780, margin: "0 auto", padding: "1.5rem 1rem" },
  card:       { background: C.paper, border: `1px solid ${C.line}`, borderRadius: 18, padding: "1.25rem 1.5rem", marginBottom: 16 },
  h1:         { fontSize: 26, fontWeight: 700, margin: "0 0 4px", color: C.ink, letterSpacing: -0.5 },
  h2:         { fontSize: 20, fontWeight: 600, margin: "0 0 12px", color: C.ink },
  label:      { fontSize: 13, color: C.muted, marginBottom: 6, display: "block" },
  btn:        { background: C.paper, border: `1.5px solid ${C.line}`, color: C.ink2, borderRadius: 999, padding: "8px 16px", cursor: "pointer", fontSize: 14, transition: "all .15s" },
  btnPrimary: { background: C.ink, border: `1px solid ${C.ink}`, color: C.paper, borderRadius: 999, padding: "10px 20px", cursor: "pointer", fontSize: 14, fontWeight: 600 },
  btnDanger:  { background: "transparent", border: "1px solid #B84A3A", color: "#B84A3A", borderRadius: 999, padding: "6px 14px", cursor: "pointer", fontSize: 13 },
  input:      { background: C.paper2, border: `1px solid ${C.line}`, borderRadius: 10, color: C.ink, padding: "8px 12px", fontSize: 14, width: "100%", boxSizing: "border-box", fontFamily: FONT_SANS },
  row:        { display: "flex", alignItems: "center", gap: 10 },
  badge:      { fontSize: 11, padding: "2px 8px", borderRadius: 999, fontWeight: 600, letterSpacing: 0.5 },
  divider:    { border: "none", borderTop: `1px solid ${C.line}`, margin: "16px 0" },
};

// ═══════════════════════════════════════════════════════════════════════════
//   COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

function HomeView({ onStudent, onTeacher }) {
  return (
    <div style={{ ...S.app, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center", maxWidth: 380, padding: "2rem 1rem" }}>
        <h1 style={{ ...S.h1, fontSize: 30, marginBottom: 6 }}>Funciones Armónicas</h1>
        <p style={{ color: C.muted, fontSize: 14, marginBottom: 40 }}>Herramienta de análisis musical auditivo</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <button onClick={onStudent} style={{ ...S.btnPrimary, fontSize: 16, padding: "14px 24px", borderRadius: 12 }}>Acceso Alumno</button>
          <button onClick={onTeacher} style={{ ...S.btn, fontSize: 16, padding: "14px 24px", borderRadius: 12 }}>Acceso Profesor</button>
        </div>
        <p style={{ color: C.muted2, fontSize: 12, marginTop: 32, lineHeight: 1.6 }}>
          Esta es una demo funcional. El audio está simulado para que puedas ver<br />cómo funciona toda la mecánica del ejercicio.
        </p>
      </div>
    </div>
  );
}

function StudentList({ students, onSelect, onBack }) {
  const [name, setName] = useState("");
  const enter = () => name.trim() && onSelect({ id: Date.now(), name: name.trim() });
  return (
    <div style={S.app}>
      <div style={S.page}>
        <button onClick={onBack} style={{ ...S.btn, marginBottom: 24 }}>← Volver</button>
        <h2 style={S.h2}>¿Quién eres?</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
          {students.map((s) => (
            <button key={s.id} onClick={() => onSelect(s)} style={{ ...S.card, textAlign: "left", cursor: "pointer", marginBottom: 0, fontSize: 16, border: `1px solid ${C.line}` }}>{s.name}</button>
          ))}
        </div>
        <hr style={S.divider} />
        <div style={S.card}>
          <label style={S.label}>O introduce tu nombre</label>
          <div style={S.row}>
            <input style={S.input} placeholder="Tu nombre o apodo…" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && enter()} />
            <button style={S.btnPrimary} onClick={enter}>Entrar</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function StudentDash({ user, exercises, results, courses, units, onExercise, onLogout }) {
  const [view, setView] = useState("all");
  const [openCourseIds, setOpenCourseIds] = useState(new Set());
  const [openUnitIds,   setOpenUnitIds]   = useState(new Set());

  const toggleCourse = (id) => setOpenCourseIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleUnit   = (id) => setOpenUnitIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const ExCard = ({ ex }) => {
    const res    = results[ex.id];
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
            {res && (
              <span style={{ ...S.badge, background: res.score == null ? C.line : res.score >= 80 ? "rgba(63,155,91,0.16)" : res.score >= 50 ? "rgba(199,122,26,0.20)" : "rgba(184,74,58,0.16)", color: res.score == null ? C.muted : res.score >= 80 ? C.fnT : res.score >= 50 ? C.fnD : "#B84A3A" }}>
                {res.score == null ? "Enviado" : `${res.score}% acierto`}
              </span>
            )}
          </div>
        </div>
        <button onClick={() => onExercise(ex)} style={S.btnPrimary}>{res ? "Repetir" : "Iniciar"} →</button>
      </div>
    );
  };

  return (
    <div style={S.app}>
      <div style={S.page}>
        <div style={{ ...S.row, justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <h1 style={{ ...S.h1, fontSize: 22 }}>Hola, {user.name}</h1>
            <p style={{ color: C.muted, fontSize: 13, margin: 0 }}>Elige un ejercicio para comenzar</p>
          </div>
          <button onClick={onLogout} style={S.btn}>Salir</button>
        </div>

        <div style={{ ...S.row, gap: 8, marginBottom: 20 }}>
          {["all","courses"].map(v => (
            <button key={v} onClick={() => setView(v)}
              style={{ ...S.btn, background: view === v ? C.ink : C.paper, color: view === v ? C.paper : C.ink2, border: view === v ? `1px solid ${C.ink}` : `1px solid ${C.line}` }}>
              {v === "all" ? "Todos los ejercicios" : "Por cursos"}
            </button>
          ))}
        </div>

        {view === "all" && exercises.map(ex => <ExCard key={ex.id} ex={ex} />)}

        {view === "courses" && (
          courses.length === 0
            ? <p style={{ color: C.muted, textAlign: "center", padding: "3rem 1rem" }}>El profesor aún no ha creado ningún curso.</p>
            : courses.map(course => {
                const courseUnits = units.filter(u => course.unitIds.includes(u.id));
                const exCount = courseUnits.reduce((s, u) => s + u.exerciseIds.length, 0);
                const isCourseOpen = openCourseIds.has(course.id);
                return (
                  <div key={course.id} style={{ marginBottom: 10 }}>
                    {/* ── Course header ── */}
                    <div
                      onClick={() => toggleCourse(course.id)}
                      style={{ background: C.paper, border: `1px solid ${isCourseOpen ? C.ink2 : C.line}`, borderRadius: isCourseOpen ? "14px 14px 0 0" : 14, padding: "14px 18px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, transition: "border-color .15s" }}>
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

                    {/* ── Course body ── */}
                    {isCourseOpen && (
                      <div style={{ border: `1px solid ${C.ink2}`, borderTop: "none", borderRadius: "0 0 14px 14px", background: C.paper2, padding: "14px 18px 12px" }}>
                        {courseUnits.length === 0
                          ? <p style={{ color: C.muted, fontSize: 13, textAlign: "center", padding: "10px 0 4px" }}>Este curso no tiene unidades.</p>
                          : courseUnits.map(unit => {
                              const isUnitOpen = openUnitIds.has(unit.id);
                              return (
                                <div key={unit.id} style={{ marginBottom: 8 }}>
                                  {/* ── Unit header ── */}
                                  <div
                                    onClick={() => toggleUnit(unit.id)}
                                    style={{ background: C.paper, border: `1px solid ${isUnitOpen ? C.muted2 : C.line}`, borderRadius: isUnitOpen ? "10px 10px 0 0" : 10, padding: "10px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, transition: "border-color .15s" }}>
                                    <span style={{ fontSize: 14, color: C.muted, display: "inline-block", transition: "transform .2s", transform: isUnitOpen ? "rotate(90deg)" : "rotate(0deg)", lineHeight: 1 }}>›</span>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      <div style={{ fontWeight: 600, fontSize: 14, color: C.ink, marginBottom: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{unit.name}</div>
                                      {unit.description && <div style={{ fontSize: 12, color: C.muted, marginBottom: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{unit.description}</div>}
                                      <span style={{ ...S.badge, background: C.line, color: C.muted }}>{unit.exerciseIds.length} {unit.exerciseIds.length === 1 ? "ejercicio" : "ejercicios"}</span>
                                    </div>
                                  </div>

                                  {/* ── Unit body ── */}
                                  {isUnitOpen && (
                                    <div style={{ border: `1px solid ${C.muted2}`, borderTop: "none", borderRadius: "0 0 10px 10px", background: C.bg, padding: "12px 14px 8px" }}>
                                      {unit.exerciseIds.length === 0
                                        ? <p style={{ color: C.muted, fontSize: 12, textAlign: "center", padding: "6px 0" }}>Esta unidad no tiene ejercicios asignados.</p>
                                        : unit.exerciseIds.map(eid => {
                                            const ex = exercises.find(e => e.id === eid);
                                            return ex ? <ExCard key={ex.id} ex={ex} /> : null;
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

function ConfirmModal({ message, onConfirm, onCancel, confirmLabel = "Eliminar" }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(26,25,21,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300 }}>
      <div style={{ ...S.card, width: 400, maxWidth: "92vw", marginBottom: 0 }}>
        <p style={{ margin: "0 0 18px", color: C.ink, fontSize: 14, lineHeight: 1.5, whiteSpace: "pre-line" }}>{message}</p>
        <div style={{ ...S.row, gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onCancel} style={S.btn} autoFocus>Cancelar</button>
          <button onClick={onConfirm} style={{ ...S.btnPrimary, background: "#B84A3A", border: "1px solid #B84A3A" }}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

// ─── ExerciseDetailView section label (shared constant) ──────────────────────
const SECTION_STYLE = {
  fontSize: 11, fontWeight: 700, letterSpacing: 1.3,
  textTransform: "uppercase", color: C.muted, margin: "0 0 14px",
};
function ExerciseDetailView({ exercise, onBack, onRecord, onUpdate, onCreate, onDelete, categories }) {
  const isCreating = exercise == null;

  // ── Editable form state ───────────────────────────────────────────────
  const [title, setTitle] = useState(isCreating ? "" : exercise.title);
  const [model, setModel] = useState(isCreating ? DEFAULT_MODEL_ID : modelOf(exercise));

  const initialCatIds = useMemo(() => {
    if (isCreating) return new Set([categories[0]?.id || "default"]);
    const exIds = new Set(categoriesOf(exercise).map(m => m.id));
    const valid = categories.filter(m => exIds.has(m.id)).map(m => m.id);
    return new Set(valid.length ? valid : [categories[0]?.id || "default"]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Per-category button selection: Map<catId, Set<btnId>>
  const initialBtnIds = useMemo(() => {
    const map = new Map();
    categories.forEach(cat => {
      // If the exercise already has this category with specific buttons, use those; else all
      const exCat = isCreating ? null : categoriesOf(exercise).find(c => c.id === cat.id);
      map.set(cat.id, new Set(exCat ? exCat.buttons.map(b => b.id) : cat.buttons.map(b => b.id)));
    });
    return map;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [selectedCategoryIds, setSelectedCategoryIds] = useState(initialCatIds);
  const [selectedButtonIds,   setSelectedButtonIds]   = useState(initialBtnIds);
  const [audioFile, setAudioFile]         = useState(null);
  const [audioUrl, setAudioUrl]           = useState(null);
  const [audioName, setAudioName]         = useState(isCreating ? null : (exercise.audioName || null));
  const [audioDuration, setAudioDuration] = useState(null);
  const [waveformData, setWaveformData]   = useState(isCreating ? null : (exercise.waveformData || null));
  const [manualDuration, setManualDuration] = useState(
    !isCreating && !exercise.audioName && exercise.duration ? String(exercise.duration) : ""
  );
  const [showConfirmDel, setShowConfirmDel] = useState(false);

  const toggleCategory = (id) => setSelectedCategoryIds(prev => {
    const next = new Set(prev);
    if (next.has(id)) { if (next.size > 1) next.delete(id); } else next.add(id);
    return next;
  });

  const toggleButton = (catId, btnId) => setSelectedButtonIds(prev => {
    const next  = new Map(prev);
    const btns  = new Set(next.get(catId) || []);
    if (btns.has(btnId)) { if (btns.size > 1) btns.delete(btnId); } else btns.add(btnId);
    next.set(catId, btns);
    return next;
  });

  const handleFileChange = (e) => {
    const file = e.target.files[0]; if (!file) return;
    setAudioFile(file); setAudioName(file.name); setAudioUrl(null); setAudioDuration(null); setWaveformData(null);
    const urlReader = new FileReader();
    urlReader.onload = ev => setAudioUrl(ev.target.result);
    urlReader.readAsDataURL(file);
    const bufReader = new FileReader();
    bufReader.onload = ev => {
      const AudioCtx = window.AudioContext || window.webkitAudioContext; if (!AudioCtx) return;
      const ctx = new AudioCtx();
      ctx.decodeAudioData(ev.target.result.slice(0)).then(decoded => {
        setAudioDuration(Math.ceil(decoded.duration));
        setWaveformData(buildWaveformFromPCM(decoded.getChannelData(0), decoded.duration));
        ctx.close();
      }).catch(() => ctx.close());
    };
    bufReader.readAsArrayBuffer(file);
  };
  const clearAudio = () => { setAudioFile(null); setAudioUrl(null); setAudioName(null); setAudioDuration(null); setWaveformData(null); };

  const hasNewFile       = !!audioFile;
  const hasExistingAudio = !hasNewFile && !!audioName;
  const effDuration = hasNewFile ? (audioDuration || 0)
    : hasExistingAudio ? (isCreating ? 0 : exercise.duration)
    : (parseInt(manualDuration) || 0);
  const audioStillLoading = hasNewFile && (audioDuration === null || audioUrl === null);

  // ── Dirty detection (edit mode only) ────────────────────────────────
  const isDirty = useMemo(() => {
    if (isCreating) return false;
    if (title.trim() !== exercise.title) return true;
    if (model !== modelOf(exercise)) return true;
    if (hasNewFile) return true;
    if (!audioName && exercise.audioName) return true;
    if (model === "interactivo") {
      const exCats = categoriesOf(exercise);
      const exIds  = new Set(exCats.map(m => m.id));
      if (selectedCategoryIds.size !== exIds.size) return true;
      for (const id of selectedCategoryIds) {
        if (!exIds.has(id)) return true;
        // Check if button selection changed for this category
        const exCat    = exCats.find(c => c.id === id);
        const selBtns  = selectedButtonIds.get(id) || new Set();
        const exBtnIds = new Set((exCat?.buttons || []).map(b => b.id));
        if (selBtns.size !== exBtnIds.size) return true;
        for (const bid of selBtns) if (!exBtnIds.has(bid)) return true;
      }
    }
    if (!hasNewFile && !hasExistingAudio && !exercise.audioName) {
      const manual = parseInt(manualDuration) || 0;
      if (manual !== exercise.duration) return true;
    }
    return false;
  }, [isCreating, title, model, hasNewFile, audioName, selectedCategoryIds, selectedButtonIds, manualDuration, exercise, hasExistingAudio]);

  const canSave = title.trim().length > 0 && effDuration > 0 && !audioStillLoading
    && (isCreating || isDirty);

  const handleSave = () => {
    if (!canSave) return;
    const chosen = model === "interactivo" ? categories.filter(m => selectedCategoryIds.has(m.id)) : [];
    // Apply per-category button filtering
    const applyBtnFilter = (cat) => {
      const selBtns = selectedButtonIds.get(cat.id);
      const btns = selBtns ? cat.buttons.filter(b => selBtns.has(b.id)) : cat.buttons;
      return { ...cat, buttons: btns.length >= 1 ? btns : cat.buttons };
    };
    const safe = (chosen.length ? chosen : (model === "interactivo" ? [DEFAULT_CATEGORY] : [])).map(applyBtnFilter);

    if (isCreating) {
      onCreate({
        id: Date.now(),
        title: title.trim(),
        duration: effDuration,
        model,
        audioUrl: audioUrl || null,
        audioName: audioName || null,
        waveformData: waveformData || null,
        showHint: false,
        categories: model === "interactivo" ? safe : [],
        answers: {},
        ...(model === "cuestionario" ? { questions: [] } : {}),
      });
      return;
    }

    const patch = { title: title.trim(), duration: effDuration, model };
    if (model === "interactivo") {
      const keepIds = new Set(safe.map(m => m.id));
      const prev = exercise.answers || {};
      patch.categories = safe; patch.modes = undefined;
      patch.answers = Object.fromEntries(Object.entries(prev).filter(([id]) => keepIds.has(id)));
    } else {
      patch.categories = []; patch.answers = {};
    }
    if (hasNewFile) { patch.audioUrl = audioUrl; patch.audioName = audioName; patch.waveformData = waveformData; }
    else if (!audioName && exercise.audioName) { patch.audioUrl = null; patch.audioName = null; patch.waveformData = null; }
    onUpdate(patch);
  };

  // ── Derived display state (based on saved exercise) ─────────────────
  const isQuizSaved = !isCreating && modelOf(exercise) === "cuestionario";
  const exQs        = isCreating ? [] : questionsOf(exercise);
  const { recorded, total } = (isCreating || isQuizSaved) ? { recorded: 0, total: 0 } : answerStats(exercise);

  return (
    <div style={S.app}>
      <div style={S.page}>

        {/* ── Header ── */}
        <div style={{ ...S.row, justifyContent: "space-between", marginBottom: 32 }}>
          <button onClick={onBack} style={S.btn}>← Ejercicios</button>
  {(isCreating || isDirty) && (
            <button
              onClick={handleSave}
              disabled={!canSave}
              style={{ ...S.btnPrimary, opacity: canSave ? 1 : 0.45, cursor: canSave ? "pointer" : "not-allowed" }}
            >
              {audioStillLoading ? "Cargando audio…" : isCreating ? "Crear ejercicio" : "Guardar cambios"}
            </button>
          )}
        </div>

        {/* ══ Sección: Información ════════════════════════════════════ */}
        <p style={SECTION_STYLE}>Información</p>

        {/* 1 · Nombre */}
        <label style={S.label}>Nombre del ejercicio</label>
        <input
          style={{ ...S.input, marginBottom: 18, fontSize: 15, fontWeight: 500 }}
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Ej: Coral nº 4 – Bach"
        />

        {/* 2 · Audio */}
        <label style={S.label}>{hasExistingAudio ? "Audio" : "Archivo de audio"}</label>
        {hasExistingAudio && (
          <div style={{ background: C.paper2, border: `1px solid ${C.line}`, borderRadius: 10, padding: "8px 12px", marginBottom: 8, ...S.row, gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, color: C.ink, flex: "1 1 140px", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              🎵 {audioName}
            </span>
            {!isCreating && <span style={{ fontSize: 12, color: C.muted, fontFamily: FONT_MONO, flexShrink: 0 }}>{fmt(exercise.duration)}</span>}
            <button type="button" onClick={clearAudio} style={{ ...S.btnDanger, padding: "4px 10px", fontSize: 12 }}>Quitar</button>
          </div>
        )}
        <input type="file" accept="audio/*" onChange={handleFileChange}
          style={{ ...S.input, padding: "6px 10px", fontSize: 13, marginBottom: 4 }} />
        {hasExistingAudio && <p style={{ fontSize: 11, color: C.muted, margin: "0 0 0" }}>Sube otro archivo para reemplazar el audio actual.</p>}
        {hasNewFile && audioDuration === null && <p style={{ fontSize: 12, color: C.muted, margin: "6px 0 0" }}>Cargando duración…</p>}
        {hasNewFile && audioDuration !== null && <p style={{ fontSize: 12, color: C.fnT, margin: "6px 0 0" }}>Duración detectada: {fmt(audioDuration)}</p>}
        {!hasNewFile && !hasExistingAudio && (
          <div style={{ marginTop: 10 }}>
            <label style={S.label}>Duración manual (segundos)</label>
            <input type="number" min={1} style={S.input} value={manualDuration}
              onChange={e => setManualDuration(e.target.value)} placeholder="Ej: 30" />
          </div>
        )}
        <div style={{ marginBottom: 18 }} />

        {/* 3 · Modelo */}
        <label style={S.label}>Modelo de ejercicio</label>
        <div style={{ ...S.row, gap: 8, marginBottom: 8 }}>
          {EXERCISE_MODELS.map(m => (
            <button key={m.id} type="button" onClick={() => setModel(m.id)} title={m.description}
              style={{ ...S.btn, flex: 1, fontSize: 13, padding: "9px 12px",
                background: model === m.id ? C.ink : C.paper,
                color: model === m.id ? C.paper : C.ink2,
                border: model === m.id ? `1px solid ${C.ink}` : `1px solid ${C.line}` }}>
              {m.name}
            </button>
          ))}
        </div>
        {model === "cuestionario" && (
          <p style={{ fontSize: 11, color: C.quiz, margin: "0 0 0", padding: "6px 10px", background: "rgba(47,111,184,0.08)", borderRadius: 8 }}>
            Las preguntas se gestionan desde la sección de abajo.
          </p>
        )}

        {/* 4 · Categorías — interactivo only */}
        {model === "interactivo" && (
          <div style={{ marginTop: 18 }}>
            <label style={S.label}>Categorías y botones del ejercicio</label>
            <div style={{ background: C.paper2, border: `1px solid ${C.line}`, borderRadius: 10, padding: 8, maxHeight: 320, overflowY: "auto" }}>
              {categories.map(cat => {
                const checked  = selectedCategoryIds.has(cat.id);
                const isLast   = checked && selectedCategoryIds.size === 1;
                const selBtns  = selectedButtonIds.get(cat.id) || new Set();
                const allCount = cat.buttons.length;
                const selCount = checked ? [...cat.buttons].filter(b => selBtns.has(b.id)).length : 0;
                return (
                  <div key={cat.id} style={{ marginBottom: checked ? 6 : 2 }}>
                    {/* Category row */}
                    <label style={{ ...S.row, gap: 10, padding: "6px 8px", borderRadius: 6,
                      cursor: isLast ? "not-allowed" : "pointer",
                      background: checked ? "rgba(26,25,21,0.04)" : "transparent" }}>
                      <input type="checkbox" checked={checked} onChange={() => toggleCategory(cat.id)}
                        style={{ cursor: isLast ? "not-allowed" : "pointer", flexShrink: 0 }} />
                      <span style={{ fontSize: 13, fontWeight: 500, color: checked ? C.ink : C.muted2, flex: 1 }}>{cat.name}</span>
                      <span style={{ fontSize: 11, color: C.muted, fontFamily: FONT_MONO }}>
                        {checked ? `${selCount}/${allCount}` : `${allCount} btn`}
                      </span>
                    </label>

                    {/* Button rows — only when category is selected */}
                    {checked && (
                      <div style={{ paddingLeft: 28, paddingBottom: 4, paddingTop: 2, display: "flex", flexDirection: "column", gap: 1 }}>
                        {cat.buttons.map(btn => {
                          const bChecked = selBtns.has(btn.id);
                          const bIsLast  = bChecked && selCount === 1;
                          return (
                            <label key={btn.id} style={{ ...S.row, gap: 8, padding: "4px 8px", borderRadius: 6,
                              cursor: bIsLast ? "not-allowed" : "pointer",
                              background: bChecked ? "transparent" : "transparent",
                              opacity: bChecked ? 1 : 0.45 }}>
                              <input type="checkbox" checked={bChecked} onChange={() => toggleButton(cat.id, btn.id)}
                                style={{ cursor: bIsLast ? "not-allowed" : "pointer", flexShrink: 0 }} />
                              <span style={{
                                width: 20, height: 20, borderRadius: "50%", background: btn.color, flexShrink: 0,
                                display: "inline-flex", alignItems: "center", justifyContent: "center",
                                fontSize: 9, fontWeight: 800, color: "#fff", fontFamily: FONT_MONO }}>
                                {btn.id}
                              </span>
                              <span style={{ fontSize: 12, color: bChecked ? C.ink2 : C.muted2, flex: 1 }}>{btn.name}</span>
                              <span style={{ fontSize: 10, color: C.muted, fontFamily: FONT_MONO }}>{btn.key.toUpperCase()}</span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <p style={{ fontSize: 11, color: C.muted, margin: "6px 0 0" }}>
              Desmarca botones para ocultarlos en este ejercicio concreto.
            </p>
          </div>
        )}

        <hr style={{ ...S.divider, margin: "28px 0" }} />

        {/* ══ Interactivo: Clave de corrección ════════════════════════ */}
        {model !== "cuestionario" && (
          <>
            <p style={SECTION_STYLE}>Clave de corrección</p>
            {isCreating ? (
              <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.6, margin: 0 }}>
                Crea el ejercicio para poder grabar la clave de corrección.
              </p>
            ) : (
              <>
                <div style={{ marginBottom: 16 }}>
                  {categoriesOf(exercise).map(cat => {
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
                  color: recorded === 0 ? C.paper : C.ink,
                  border: recorded === 0 ? `1px solid ${C.ink}` : `1.5px solid ${C.line}`,
                  borderRadius: 12, padding: "13px 18px", cursor: "pointer", fontSize: 15, fontWeight: 600,
                }}>
                  <span>{recorded === 0 ? "Grabar clave" : recorded < total ? "Grabar resto" : "Regrabar clave"}</span>
                  <span style={{ fontSize: 18, opacity: 0.55, fontWeight: 300 }}>→</span>
                </button>
              </>
            )}
          </>
        )}

        {/* ══ Cuestionario: Preguntas (solo tras crear) ════════════════ */}
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
              color: exQs.length === 0 ? C.paper : C.ink,
              border: exQs.length === 0 ? `1px solid ${C.ink}` : `1.5px solid ${C.line}`,
              borderRadius: 12, padding: "13px 18px", cursor: "pointer", fontSize: 15, fontWeight: 600,
            }}>
              <span>{exQs.length === 0 ? "Crear preguntas" : "Editar preguntas"}</span>
              <span style={{ fontSize: 18, opacity: 0.55, fontWeight: 300 }}>→</span>
            </button>
          </>
        )}

        {/* ══ Sección: Opciones para el alumno (interactivo, solo tras crear) */}
        {!isCreating && model !== "cuestionario" && (
          <>
            <hr style={{ ...S.divider, margin: "28px 0" }} />
            <p style={SECTION_STYLE}>Opciones para el alumno</p>
            <label style={{ display: "flex", alignItems: "flex-start", gap: 14, cursor: "pointer", userSelect: "none" }}>
              <input
                type="checkbox"
                checked={!!exercise.showHint}
                onChange={e => onUpdate({ showHint: e.target.checked })}
                style={{ width: 16, height: 16, marginTop: 2, accentColor: C.fnT, flexShrink: 0 }}
              />
              <div>
                <div style={{ fontSize: 14, fontWeight: 500, color: C.ink, marginBottom: 3 }}>Mostrar guía de tiempo</div>
                <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5 }}>
                  Muestra los bloques de función como barras apagadas — una pista sin revelar la solución.
                </div>
              </div>
            </label>
          </>
        )}

        {/* ══ Zona de peligro ═════════════════════════════════════════ */}
        {!isCreating && (
          <div style={{ marginTop: 40, paddingTop: 20, borderTop: `1px solid ${C.line}` }}>
            <button
              onClick={() => setShowConfirmDel(true)}
              style={{ ...S.btnDanger, width: "100%", padding: "10px", fontSize: 13, textAlign: "center" }}
            >
              Eliminar ejercicio
            </button>
          </div>
        )}
      </div>

      {showConfirmDel && (
        <ConfirmModal
          message={`¿Eliminar el ejercicio "${exercise?.title}"?\n\nSe perderán también las respuestas guardadas de los alumnos.`}
          onConfirm={onDelete}
          onCancel={() => setShowConfirmDel(false)}
        />
      )}
    </div>
  );
}

// ─── CourseFormModal ──────────────────────────────────────────────────────────
function CourseFormModal({ initial, onSave, onClose }) {
  const [name, setName]             = useState(initial?.name || "");
  const [description, setDescription] = useState(initial?.description || "");
  const canSave = name.trim().length > 0;
  const handleSave = () => {
    if (!canSave) return;
    onSave({ id: initial?.id || `course-${Date.now()}`, name: name.trim(), description: description.trim(), unitIds: initial?.unitIds || [] });
  };
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(26,25,21,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
      <div style={{ ...S.card, width: 480, maxWidth: "92vw", marginBottom: 0 }}>
        <h2 style={S.h2}>{initial ? "Editar curso" : "Nuevo curso"}</h2>
        <label style={S.label}>Nombre del curso</label>
        <input style={{ ...S.input, marginBottom: 14 }} value={name} onChange={e => setName(e.target.value)} placeholder="Ej: Armonía I" autoFocus />
        <label style={S.label}>Descripción (opcional)</label>
        <textarea style={{ ...S.input, minHeight: 72, resize: "vertical", fontFamily: FONT_SANS, lineHeight: 1.5, marginBottom: 18 }} value={description} onChange={e => setDescription(e.target.value)} placeholder="Breve descripción del curso…" />
        <div style={{ ...S.row, gap: 10 }}>
          <button onClick={onClose} style={{ ...S.btn, flex: 1 }}>Cancelar</button>
          <button onClick={handleSave} disabled={!canSave} style={{ ...S.btnPrimary, flex: 1, opacity: canSave ? 1 : 0.45, cursor: canSave ? "pointer" : "not-allowed" }}>
            {initial ? "Guardar cambios" : "Crear curso"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── UnitFormModal ────────────────────────────────────────────────────────────
function UnitFormModal({ initial, onSave, onClose }) {
  const [name, setName]             = useState(initial?.name || "");
  const [description, setDescription] = useState(initial?.description || "");
  const canSave = name.trim().length > 0;
  const handleSave = () => {
    if (!canSave) return;
    onSave({ id: initial?.id || `unit-${Date.now()}`, name: name.trim(), description: description.trim(), exerciseIds: initial?.exerciseIds || [] });
  };
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(26,25,21,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
      <div style={{ ...S.card, width: 480, maxWidth: "92vw", marginBottom: 0 }}>
        <h2 style={S.h2}>{initial ? "Editar unidad" : "Nueva unidad didáctica"}</h2>
        <label style={S.label}>Nombre de la unidad</label>
        <input style={{ ...S.input, marginBottom: 14 }} value={name} onChange={e => setName(e.target.value)} placeholder="Ej: Unidad 1 – Cadencias" autoFocus />
        <label style={S.label}>Descripción (opcional)</label>
        <textarea style={{ ...S.input, minHeight: 72, resize: "vertical", fontFamily: FONT_SANS, lineHeight: 1.5, marginBottom: 18 }} value={description} onChange={e => setDescription(e.target.value)} placeholder="Objetivos o contenidos de la unidad…" />
        <div style={{ ...S.row, gap: 10 }}>
          <button onClick={onClose} style={{ ...S.btn, flex: 1 }}>Cancelar</button>
          <button onClick={handleSave} disabled={!canSave} style={{ ...S.btnPrimary, flex: 1, opacity: canSave ? 1 : 0.45, cursor: canSave ? "pointer" : "not-allowed" }}>
            {initial ? "Guardar cambios" : "Crear unidad"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── ExercisePickerModal ──────────────────────────────────────────────────────
// Lets the teacher pick exercises from the global pool to add to a unit.
// Also has a "+ Nuevo ejercicio" shortcut that calls onCreate and then auto-adds the id.
function ExercisePickerModal({ exercises, alreadyInUnit, onAdd, onClose }) {
  const available = exercises.filter(ex => !alreadyInUnit.includes(ex.id));
  const [selected, setSelected] = useState(new Set());
  const toggle = (id) => setSelected(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const handleAdd = () => { if (selected.size) onAdd([...selected]); };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(26,25,21,0.55)", display: "flex", alignItems: "flex-start", justifyContent: "center", zIndex: 200, overflowY: "auto", padding: "32px 16px" }}>
      <div style={{ ...S.card, width: 540, maxWidth: "92vw", marginBottom: 0 }}>
        <h2 style={{ ...S.h2, marginBottom: 4 }}>Añadir ejercicios a la unidad</h2>
        <p style={{ fontSize: 12, color: C.muted, margin: "0 0 16px" }}>Selecciona uno o varios ejercicios del banco global.</p>
        {available.length === 0
          ? <p style={{ color: C.muted, textAlign: "center", padding: "1.5rem" }}>Todos los ejercicios ya están en esta unidad.</p>
          : <div style={{ maxHeight: 340, overflowY: "auto", border: `1px solid ${C.line}`, borderRadius: 10, marginBottom: 16 }}>
              {available.map((ex, i) => {
                const isSel  = selected.has(ex.id);
                const isQuiz = modelOf(ex) === "cuestionario";
                return (
                  <label key={ex.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", cursor: "pointer", background: isSel ? "rgba(26,25,21,0.04)" : "transparent", borderBottom: i < available.length - 1 ? `1px solid ${C.line}` : "none" }}>
                    <input type="checkbox" checked={isSel} onChange={() => toggle(ex.id)} style={{ accentColor: C.ink, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 500, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ex.title}</div>
                      <div style={{ ...S.row, gap: 6, marginTop: 3, flexWrap: "wrap" }}>
                        <span style={{ ...S.badge, background: C.line, color: C.muted }}>{fmt(ex.duration)}</span>
                        <span style={{ ...S.badge, background: isQuiz ? "rgba(47,111,184,0.12)" : "rgba(63,155,91,0.10)", color: isQuiz ? C.quiz : C.fnT }}>{isQuiz ? "Cuestionario" : "Interactivo"}</span>
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>}
        <div style={{ ...S.row, gap: 10 }}>
          <button onClick={onClose} style={{ ...S.btn, flex: 1 }}>Cancelar</button>
          <button onClick={handleAdd} disabled={selected.size === 0} style={{ ...S.btnPrimary, flex: 1, opacity: selected.size ? 1 : 0.45, cursor: selected.size ? "pointer" : "not-allowed" }}>
            Añadir {selected.size > 0 ? `(${selected.size})` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── TeacherDash ──────────────────────────────────────────────────────────────
function TeacherDash({ exercises, onUpdateExercise, onDeleteExercise, students, onAddStudent, onRemoveStudent, results, margin, onMargin, onRecord, onAdd, onLogout, categories, onAddCategory, onUpdateCategory, onDeleteCategory, courses, units, onAddCourse, onUpdateCourse, onDeleteCourse, onAddUnit, onUpdateUnit, onDeleteUnit, onAddExercisesToUnit, onRemoveExerciseFromUnit }) {
  const [tab, setTab]                     = useState("exercises");
  const [selectedExerciseId, setSelectedExerciseId] = useState(null);
  const [editingCategory, setEditingCategory]       = useState(null);
  const [newStudentName, setNewStudentName]         = useState("");
  const [confirmState, setConfirmState]             = useState(null);

  // ── Course accordion state ──────────────────────────────────────────
  const [openCourseIds, setOpenCourseIds]     = useState(new Set());
  const [openUnitIds,   setOpenUnitIds]       = useState(new Set());
  const [showCourseForm, setShowCourseForm]   = useState(false);
  const [editingCourse, setEditingCourse]     = useState(null);
  const [showUnitForm, setShowUnitForm]       = useState(false);
  const [editingUnit, setEditingUnit]         = useState(null);
  const [unitFormCourseId, setUnitFormCourseId] = useState(null);
  const [showExPicker, setShowExPicker]       = useState(false);
  const [exPickerUnitId, setExPickerUnitId]   = useState(null);
  const [newExInUnit, setNewExInUnit]         = useState(null); // unitId awaiting new exercise

  const askConfirm = (message, onConfirm, confirmLabel = "Eliminar") =>
    setConfirmState({ message, confirmLabel, onConfirm: () => { onConfirm(); setConfirmState(null); } });

  const tryAddStudent = () => {
    const name = newStudentName.trim(); if (!name) return;
    const dup  = students.some((s) => s.name.toLowerCase() === name.toLowerCase());
    if (dup) { if (typeof window !== "undefined") window.alert("Ya existe un alumno con ese nombre."); return; }
    onAddStudent(name); setNewStudentName("");
  };

  // ── Exercise detail sub-view (edit or create) ──
  const lastCreatedExRef = useRef(null);

  // When creating an exercise in the context of a unit, auto-add after creation
  const handleExerciseCreated = (newEx, unitId) => {
    lastCreatedExRef.current = newEx;
    onAdd(newEx);
    if (unitId) onAddExercisesToUnit(unitId, [newEx.id]);
    setSelectedExerciseId(newEx.id);
    setNewExInUnit(null);
  };

  if (selectedExerciseId === "new") {
    return (
      <ExerciseDetailView
        exercise={null}
        onBack={() => { setSelectedExerciseId(null); }}
        onRecord={() => {}}
        onUpdate={() => {}}
        onCreate={(newEx) => handleExerciseCreated(newEx, newExInUnit)}
        onDelete={() => {}}
        categories={categories}
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
      />
    );
  }

  return (
    <div style={S.app}>
      <div style={S.page}>
        <div style={{ ...S.row, justifyContent: "space-between", marginBottom: 20 }}>
          <h1 style={{ ...S.h1, fontSize: 22 }}>Panel del Profesor</h1>
          <button onClick={onLogout} style={S.btn}>Salir</button>
        </div>
        <div style={{ ...S.row, marginBottom: 20, gap: 8, flexWrap: "wrap" }}>
          {["exercises","courses","students","categories","settings"].map((t) => (
            <button key={t} onClick={() => setTab(t)} style={{ ...S.btn, background: tab === t ? C.ink : C.paper, border: tab === t ? `1px solid ${C.ink}` : `1px solid ${C.line}`, color: tab === t ? C.paper : C.ink2 }}>
              {{ exercises: "Ejercicios", courses: "Cursos", students: "Alumnos", categories: "Categorías", settings: "Ajustes" }[t]}
            </button>
          ))}
        </div>

        {/* ── Exercises tab — minimal list ── */}
        {tab === "exercises" && (
          <>
            <button onClick={() => setSelectedExerciseId("new")} style={{ ...S.btnPrimary, marginBottom: 20 }}>
              + Nuevo ejercicio
            </button>

            {exercises.length === 0 && (
              <p style={{ color: C.muted, textAlign: "center", padding: "3rem 1rem" }}>
                Aún no hay ejercicios.
              </p>
            )}

            {exercises.map((ex) => {
              const isQuiz = modelOf(ex) === "cuestionario";
              const exQs   = questionsOf(ex);
              const { recorded, total } = isQuiz ? { recorded: 0, total: 0 } : answerStats(ex);
              const keyDone    = isQuiz ? exQs.length > 0 : (recorded === total && total > 0);
              const keyPartial = !isQuiz && recorded > 0 && recorded < total;
              const dotColor   = keyDone ? C.fnT : keyPartial ? C.fnD : C.muted2;
              const dotLabel   = isQuiz
                ? (exQs.length === 0 ? "Sin preguntas" : `${exQs.length} ${exQs.length === 1 ? "pregunta" : "preguntas"}`)
                : recorded === 0 ? "Sin clave"
                : recorded === total ? "Clave completa"
                : `${recorded}/${total} claves`;

              return (
                <div
                  key={ex.id}
                  onClick={() => setSelectedExerciseId(ex.id)}
                  style={{
                    background: C.paper, border: `1px solid ${C.line}`, borderRadius: 14,
                    padding: "14px 18px", marginBottom: 8, cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
                    transition: "border-color .12s, box-shadow .12s",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = C.muted2; e.currentTarget.style.boxShadow = "0 2px 8px rgba(26,25,21,0.06)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = C.line; e.currentTarget.style.boxShadow = "none"; }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    {/* Title */}
                    <div style={{ fontWeight: 600, fontSize: 15, color: C.ink, marginBottom: 7, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {ex.title}
                    </div>
                    {/* Meta row */}
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <span style={{ ...S.badge, background: C.paper2, color: C.muted, fontFamily: FONT_MONO }}>
                        {fmt(ex.duration)}
                      </span>
                      <span style={{ ...S.badge,
                        background: isQuiz ? "rgba(47,111,184,0.12)" : "rgba(63,155,91,0.10)",
                        color: isQuiz ? C.quiz : C.fnT }}>
                        {isQuiz ? "Cuestionario" : "Interactivo"}
                      </span>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: keyDone ? C.fnT : keyPartial ? C.fnD : C.muted }}>
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: dotColor, flexShrink: 0, display: "inline-block" }} />
                        {dotLabel}
                      </span>
                    </div>
                  </div>
                  {/* Chevron */}
                  <span style={{ color: C.muted2, fontSize: 22, fontWeight: 300, flexShrink: 0, lineHeight: 1 }}>›</span>
                </div>
              );
            })}
          </>
        )}

        {tab === "courses" && (
          <>
            <button onClick={() => setShowCourseForm(true)} style={{ ...S.btnPrimary, marginBottom: 20 }}>+ Nuevo curso</button>
            {courses.length === 0
              ? <p style={{ color: C.muted, textAlign: "center", padding: "3rem 1rem" }}>Aún no hay cursos. Crea el primero para organizar tus ejercicios.</p>
              : courses.map(course => {
                  const courseUnits = units.filter(u => course.unitIds.includes(u.id));
                  const exCount = courseUnits.reduce((s, u) => s + u.exerciseIds.length, 0);
                  const isCourseOpen = openCourseIds.has(course.id);
                  return (
                    <div key={course.id} style={{ marginBottom: 10 }}>
                      {/* ── Course header ── */}
                      <div
                        onClick={() => setOpenCourseIds(prev => { const n = new Set(prev); if (n.has(course.id)) n.delete(course.id); else n.add(course.id); return n; })}
                        style={{ background: C.paper, border: `1px solid ${isCourseOpen ? C.ink2 : C.line}`, borderRadius: isCourseOpen ? "14px 14px 0 0" : 14, padding: "14px 18px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, transition: "border-color .15s" }}>
                        <span style={{ fontSize: 18, color: C.muted2, fontWeight: 300, display: "inline-block", transition: "transform .2s", transform: isCourseOpen ? "rotate(90deg)" : "rotate(0deg)", lineHeight: 1 }}>›</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 15, color: C.ink, marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{course.name}</div>
                          {course.description && <div style={{ fontSize: 13, color: C.muted, marginBottom: 5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{course.description}</div>}
                          <div style={{ display: "flex", gap: 8 }}>
                            <span style={{ ...S.badge, background: C.paper2, color: C.muted }}>{courseUnits.length} {courseUnits.length === 1 ? "unidad" : "unidades"}</span>
                            <span style={{ ...S.badge, background: C.paper2, color: C.muted }}>{exCount} {exCount === 1 ? "ejercicio" : "ejercicios"}</span>
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 6, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                          <button onClick={() => { setEditingCourse(course); setShowCourseForm(true); }} style={{ ...S.btn, padding: "5px 10px", fontSize: 12 }}>Editar</button>
                          <button onClick={() => askConfirm(`¿Eliminar el curso "${course.name}"?\n\nLas unidades y ejercicios no se eliminarán.`, () => onDeleteCourse(course.id))} style={{ ...S.btnDanger, padding: "5px 10px", fontSize: 12 }}>Eliminar</button>
                        </div>
                      </div>

                      {/* ── Course body ── */}
                      {isCourseOpen && (
                        <div style={{ border: `1px solid ${C.ink2}`, borderTop: "none", borderRadius: "0 0 14px 14px", background: C.paper2, padding: "16px 18px 14px" }}>
                          {courseUnits.length === 0
                            ? <p style={{ color: C.muted, fontSize: 13, textAlign: "center", padding: "10px 0 6px" }}>Este curso no tiene unidades todavía.</p>
                            : courseUnits.map(unit => {
                                const isUnitOpen = openUnitIds.has(unit.id);
                                const unitExercises = unit.exerciseIds.map(id => exercises.find(e => e.id === id)).filter(Boolean);
                                return (
                                  <div key={unit.id} style={{ marginBottom: 8 }}>
                                    {/* ── Unit header ── */}
                                    <div
                                      onClick={() => setOpenUnitIds(prev => { const n = new Set(prev); if (n.has(unit.id)) n.delete(unit.id); else n.add(unit.id); return n; })}
                                      style={{ background: C.paper, border: `1px solid ${isUnitOpen ? C.muted2 : C.line}`, borderRadius: isUnitOpen ? "10px 10px 0 0" : 10, padding: "10px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, transition: "border-color .15s" }}>
                                      <span style={{ fontSize: 14, color: C.muted, display: "inline-block", transition: "transform .2s", transform: isUnitOpen ? "rotate(90deg)" : "rotate(0deg)", lineHeight: 1 }}>›</span>
                                      <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontWeight: 600, fontSize: 14, color: C.ink, marginBottom: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{unit.name}</div>
                                        {unit.description && <div style={{ fontSize: 12, color: C.muted, marginBottom: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{unit.description}</div>}
                                        <span style={{ ...S.badge, background: C.line, color: C.muted }}>{unit.exerciseIds.length} {unit.exerciseIds.length === 1 ? "ejercicio" : "ejercicios"}</span>
                                      </div>
                                      <div style={{ display: "flex", gap: 6, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                                        <button onClick={() => { setEditingUnit(unit); setShowUnitForm(true); }} style={{ ...S.btn, padding: "4px 8px", fontSize: 11 }}>Editar</button>
                                        <button onClick={() => askConfirm(`¿Eliminar la unidad "${unit.name}"?\n\nLos ejercicios no se eliminarán del banco global.`, () => onDeleteUnit(unit.id, course.id))} style={{ ...S.btnDanger, padding: "4px 8px", fontSize: 11 }}>Eliminar</button>
                                      </div>
                                    </div>

                                    {/* ── Unit body ── */}
                                    {isUnitOpen && (
                                      <div style={{ border: `1px solid ${C.muted2}`, borderTop: "none", borderRadius: "0 0 10px 10px", background: C.bg, padding: "12px 14px 10px" }}>
                                        {unit.description && <p style={{ color: C.muted, fontSize: 12, margin: "0 0 10px" }}>{unit.description}</p>}
                                        {unitExercises.length === 0
                                          ? <p style={{ color: C.muted, fontSize: 12, textAlign: "center", padding: "8px 0" }}>No hay ejercicios en esta unidad.</p>
                                          : unitExercises.map(ex => {
                                              const isQuiz = modelOf(ex) === "cuestionario";
                                              const exQs   = questionsOf(ex);
                                              const { recorded, total } = isQuiz ? { recorded: 0, total: 0 } : answerStats(ex);
                                              const keyDone = isQuiz ? exQs.length > 0 : (recorded === total && total > 0);
                                              return (
                                                <div key={ex.id} style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 10, padding: "10px 14px", marginBottom: 6, display: "flex", alignItems: "center", gap: 10 }}>
                                                  <div style={{ flex: 1, minWidth: 0, cursor: "pointer" }} onClick={() => setSelectedExerciseId(ex.id)}>
                                                    <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ex.title}</div>
                                                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                                      <span style={{ ...S.badge, background: C.paper2, color: C.muted, fontFamily: FONT_MONO }}>{fmt(ex.duration)}</span>
                                                      <span style={{ ...S.badge, background: isQuiz ? "rgba(47,111,184,0.12)" : "rgba(63,155,91,0.10)", color: isQuiz ? C.quiz : C.fnT }}>{isQuiz ? "Cuestionario" : "Interactivo"}</span>
                                                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: keyDone ? C.fnT : C.muted }}>
                                                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: keyDone ? C.fnT : C.muted2, display: "inline-block" }} />
                                                        {isQuiz ? (exQs.length === 0 ? "Sin preguntas" : `${exQs.length} preguntas`) : (recorded === 0 ? "Sin clave" : "Clave grabada")}
                                                      </span>
                                                    </div>
                                                  </div>
                                                  <button onClick={() => askConfirm(`¿Quitar "${ex.title}" de esta unidad?\n\nEl ejercicio permanecerá en el banco global.`, () => onRemoveExerciseFromUnit(unit.id, ex.id))} style={{ ...S.btnDanger, fontSize: 11, padding: "4px 10px", flexShrink: 0 }}>Quitar</button>
                                                </div>
                                              );
                                            })}
                                        <div style={{ ...S.row, gap: 8, marginTop: 10 }}>
                                          <button onClick={() => { setExPickerUnitId(unit.id); setShowExPicker(true); }} style={{ ...S.btn, fontSize: 12, padding: "7px 12px" }}>+ Añadir del banco</button>
                                          <button onClick={() => { setNewExInUnit(unit.id); setSelectedExerciseId("new"); }} style={{ ...S.btnPrimary, fontSize: 12, padding: "7px 12px" }}>+ Nuevo ejercicio</button>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                          <button
                            onClick={() => { setEditingUnit(null); setUnitFormCourseId(course.id); setShowUnitForm(true); }}
                            style={{ ...S.btn, width: "100%", marginTop: 8, fontSize: 12 }}>
                            + Nueva unidad didáctica
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}

            {/* ── Modals ── */}
            {showCourseForm && (
              <CourseFormModal
                initial={editingCourse}
                onSave={(c) => { if (editingCourse) onUpdateCourse(c); else onAddCourse(c); setShowCourseForm(false); setEditingCourse(null); }}
                onClose={() => { setShowCourseForm(false); setEditingCourse(null); }}
              />
            )}
            {showUnitForm && (
              <UnitFormModal
                initial={editingUnit}
                onSave={(newUnit) => {
                  if (editingUnit) { onUpdateUnit(newUnit); }
                  else { onAddUnit(newUnit, unitFormCourseId); }
                  setShowUnitForm(false); setEditingUnit(null); setUnitFormCourseId(null);
                }}
                onClose={() => { setShowUnitForm(false); setEditingUnit(null); setUnitFormCourseId(null); }}
              />
            )}
            {showExPicker && (
              <ExercisePickerModal
                exercises={exercises}
                alreadyInUnit={exPickerUnitId ? (units.find(u => u.id === exPickerUnitId)?.exerciseIds || []) : []}
                onAdd={(ids) => { if (exPickerUnitId) onAddExercisesToUnit(exPickerUnitId, ids); setShowExPicker(false); setExPickerUnitId(null); }}
                onClose={() => { setShowExPicker(false); setExPickerUnitId(null); }}
              />
            )}
          </>
        )}

        {tab === "students" && (
          <>
            <div style={S.card}>
              <label style={S.label}>Añadir alumno</label>
              <div style={{ ...S.row, gap: 8 }}>
                <input style={{ ...S.input, flex: 1 }} value={newStudentName} onChange={(e) => setNewStudentName(e.target.value)} placeholder="Nombre y apellidos" onKeyDown={(e) => { if (e.key === "Enter") tryAddStudent(); }} />
                <button onClick={tryAddStudent} disabled={!newStudentName.trim()} style={{ ...S.btnPrimary, opacity: newStudentName.trim() ? 1 : 0.45, cursor: newStudentName.trim() ? "pointer" : "not-allowed" }}>Añadir</button>
              </div>
              <p style={{ fontSize: 12, color: C.muted, margin: "10px 0 0" }}>{students.length} {students.length === 1 ? "alumno" : "alumnos"} en total</p>
            </div>
            {students.length === 0 && <p style={{ color: C.muted, textAlign: "center", padding: 24 }}>Aún no hay alumnos.</p>}
            {students.map((s) => {
              const sRes = results[s.id] || {};
              return (
                <div key={s.id} style={S.card}>
                  <div style={{ ...S.row, justifyContent: "space-between", marginBottom: 10, gap: 10 }}>
                    <div style={{ fontWeight: 600 }}>{s.name}</div>
                    <button onClick={() => askConfirm(`¿Eliminar al alumno "${s.name}"?\n\nSe borrarán también todas sus respuestas guardadas.`, () => onRemoveStudent(s.id))} style={S.btnDanger}>Eliminar</button>
                  </div>
                  {exercises.map((ex) => {
                    const r = sRes[ex.id];
                    return (
                      <div key={ex.id} style={{ ...S.row, justifyContent: "space-between", paddingBottom: 6, borderBottom: `1px solid ${C.line}`, marginBottom: 6 }}>
                        <span style={{ fontSize: 13, color: C.muted2 }}>{ex.title}</span>
                        {r ? <span style={{ ...S.badge, background: r.score == null ? C.line : r.score >= 80 ? "rgba(63,155,91,0.16)" : r.score >= 50 ? "rgba(199,122,26,0.20)" : "rgba(184,74,58,0.16)", color: r.score == null ? C.muted : r.score >= 80 ? C.fnT : r.score >= 50 ? C.fnD : "#B84A3A" }}>{r.score == null ? "Enviado" : `${r.score}%`}</span>
                          : <span style={{ ...S.badge, background: C.line, color: C.muted2 }}>—</span>}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </>
        )}

        {tab === "categories" && (
          <>
            <button onClick={() => setEditingCategory("new")} style={{ ...S.btnPrimary, marginBottom: 16 }}>+ Crear categoría</button>
            <p style={{ color: C.muted, fontSize: 12, marginTop: -8, marginBottom: 16 }}>Las categorías definen los botones del modelo Interactivo. Editar o eliminar una categoría no afecta a los ejercicios ya creados.</p>
            {categories.map((m) => (
              <div key={m.id} style={S.card}>
                <div style={{ ...S.row, justifyContent: "space-between", marginBottom: 6, gap: 12, flexWrap: "wrap" }}>
                  <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                    <div style={{ ...S.row, gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 600 }}>{m.name}</span>
                      {m.builtIn && <span style={{ ...S.badge, background: C.line, color: C.muted }}>Predeterminada</span>}
                    </div>
                    <div style={{ ...S.row, gap: 6, flexWrap: "wrap" }}>
                      {m.buttons.map((b) => <span key={b.id} style={{ ...S.badge, background: b.color, color: textOn(b.color), fontSize: 10 }}>{b.id} · {b.name} [{b.key.toUpperCase()}]</span>)}
                    </div>
                  </div>
                  {!m.builtIn && (
                    <div style={{ ...S.row, gap: 6 }}>
                      <button onClick={() => setEditingCategory(m)} style={S.btn}>Editar</button>
                      <button onClick={() => askConfirm(`¿Eliminar la categoría "${m.name}"?\n\nLos ejercicios que ya la usan conservarán su copia.`, () => onDeleteCategory(m.id))} style={S.btnDanger}>Eliminar</button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </>
        )}

        {tab === "settings" && (
          <div style={S.card}>
            <label style={S.label}>Margen de error (segundos) — para ejercicios Interactivos</label>
            <div style={S.row}>
              <input type="range" min={0} max={3} step={0.5} value={margin} onChange={(e) => onMargin(Number(e.target.value))} style={{ flex: 1 }} />
              <span style={{ minWidth: 40, textAlign: "center", fontWeight: 600, color: C.fnD }}>{margin}s</span>
            </div>
            <p style={{ color: C.muted, fontSize: 12, marginTop: 8 }}>Por defecto: 1 segundo.</p>
          </div>
        )}

        {editingCategory !== null && (
          <CategoryEditorModal
            initialCategory={editingCategory === "new" ? null : editingCategory}
            onSave={(category) => { if (editingCategory === "new") onAddCategory(category); else onUpdateCategory(category); setEditingCategory(null); }}
            onClose={() => setEditingCategory(null)}
          />
        )}
        {confirmState && (
          <ConfirmModal
            message={confirmState.message}
            confirmLabel={confirmState.confirmLabel}
            onConfirm={confirmState.onConfirm}
            onCancel={() => setConfirmState(null)}
          />
        )}
      </div>
    </div>
  );
}

// ─── useAudioPlayer ───────────────────────────────────────────────────────────
// Shared audio logic for ExerciseView, QuestionManagerView, QuestionnaireView.
// loopRegionRef: optional ref whose .current is { audioStart, audioEnd } | null
//   (used by QuestionnaireView to loop within a question's segment).
// onWaveform: optional callback(waveformData) called once audio is decoded.
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
    if (sourceRef.current) { try { sourceRef.current.stop(); } catch {} sourceRef.current = null; }
  };

  const startSource = (offset) => {
    const ctx = ctxRef.current; if (!ctx || !bufferRef.current) return;
    const src = ctx.createBufferSource();
    src.buffer = bufferRef.current; src.connect(ctx.destination);
    src.onended = () => {
      const lq = loopRegionRef?.current;
      if (!lq && playingRef.current) { playOffsetRef.current = dur; setPlaying(false); }
    };
    src.start(0, Math.min(offset, bufferRef.current.duration));
    sourceRef.current = src; startCtxTimeRef.current = ctx.currentTime;
  };

  // Load and decode audio whenever exercise changes
  useEffect(() => {
    setTime(0); setPlaying(false); setAudioReady(false); setAudioError(null);
    playOffsetRef.current = 0;
    bufferRef.current = null;
    if (!hasAudio) return;
    let cancelled = false;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) { setAudioError("Tu navegador no soporta Web Audio API"); return; }
    const ctx = new AudioCtx(); ctxRef.current = ctx;
    (async () => {
      try {
        const decoded = await ctx.decodeAudioData(dataUrlToBuffer(audioUrl));
        if (cancelled) return;
        bufferRef.current = decoded; setAudioReady(true);
        onWaveform?.(buildWaveformFromPCM(decoded.getChannelData(0), decoded.duration));
      } catch { if (!cancelled) setAudioError("Error al decodificar el audio"); }
    })();
    return () => { cancelled = true; stopSource(); ctx.close(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exercise.id]);

  // Simulated timer for exercises without real audio
  const timerRef = useRef(null);
  useEffect(() => {
    if (playing && !hasAudio) {
      timerRef.current = setInterval(() => {
        if (scrubbingRef.current) return;
        setTime(t => {
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

  // RAF-based tick for real audio
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
          const t = Math.min(dur, rawT); setTime(t);
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
    if (!hasAudio || !bufferRef.current) { setPlaying(p => !p); return; }
    const ctx = ctxRef.current;
    ctx.resume().then(() => {
      if (playingRef.current) {
        stopSource();
        playOffsetRef.current = Math.min(dur, playOffsetRef.current + (ctx.currentTime - startCtxTimeRef.current));
        setPlaying(false);
      } else {
        startSource(playOffsetRef.current); setPlaying(true);
      }
    });
  };

  const seekTo = (t) => {
    const c = Math.max(0, Math.min(dur, t));
    playOffsetRef.current = c; setTime(c);
    if (playingRef.current && bufferRef.current && ctxRef.current) { stopSource(); startSource(c); }
  };

  // Seek and immediately start playing (used by QuestionnaireView)
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

// ─── WaveformDisplay ──────────────────────────────────────────────────────────
function WaveformDisplay({ time, duration, allIntervals, exerciseId, waveformData, colorByFn, questionRegion, onSeek, onScrubBegin, onScrubTo, onScrubEnd }) {
  const canvasRef = useRef(null);
  const waveData  = useMemo(() => waveformData || generateWaveform(exerciseId * 13 + 997, Math.max(400, Math.ceil(duration * 30))), [waveformData, exerciseId, duration]);
  const stateRef  = useRef({});
  Object.assign(stateRef.current, { time, allIntervals, waveData, duration, colorByFn, questionRegion, onSeek, onScrubBegin, onScrubTo, onScrubEnd });

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const NUM_BARS = 90, secPerBar = VISIBLE_SECS / NUM_BARS, halfBars = NUM_BARS / 2;
    const resize = () => {
      const dpr = window.devicePixelRatio || 1, rect = canvas.getBoundingClientRect();
      canvas.width  = Math.max(1, Math.floor(rect.width  * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      canvas.getContext("2d").setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
    if (ro) ro.observe(canvas); window.addEventListener("resize", resize);
    let rafId; const ctx = canvas.getContext("2d");
    const drawPill = (x, y, w, h) => {
      if (typeof ctx.roundRect === "function") { const r = Math.min(w, h) / 2; ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill(); }
      else ctx.fillRect(x, y, w, h);
    };
    const draw = () => {
      const { time: t, allIntervals: ivs, waveData: wd, duration: dur, colorByFn: cmap, questionRegion: qr } = stateRef.current;
      const rect = canvas.getBoundingClientRect(), W = rect.width, H = rect.height, mid = H / 2;
      const barW = W / NUM_BARS, drawW = barW * 0.7, offsetX = barW * 0.15;
      const pxPerSec = W / VISIBLE_SECS, centerK = Math.floor(t / secPerBar);
      const kMin = centerK - halfBars - 1, kMax = centerK + halfBars + 1;
      ctx.fillStyle = C.paper2; ctx.fillRect(0, 0, W, H);
      for (let k = kMin; k <= kMax; k++) {
        const barTime = k * secPerBar, xLeft = (barTime - t) * pxPerSec + W / 2 + offsetX;
        if (barTime < 0 || barTime > dur) { ctx.fillStyle = "rgba(26,25,21,0.12)"; ctx.fillRect(xLeft, mid - 2, drawW, 4); continue; }
        const si = Math.min(Math.round((barTime / dur) * (wd.length - 1)), wd.length - 1);
        const h  = Math.max(1.5, wd[si] * (mid - 4));
        let fn = null;
        for (let j = 0; j < ivs.length; j++) { const iv = ivs[j]; if (barTime >= iv.start && barTime < iv.end) { fn = iv.fn; break; } }
        ctx.fillStyle = (fn && cmap && cmap[fn]) ? cmap[fn] : "rgba(26,25,21,0.28)";
        drawPill(xLeft, mid - h, drawW, h * 2);
      }
      if (qr) {
        const x1 = (qr.start - t) * pxPerSec + W / 2, x2 = (qr.end - t) * pxPerSec + W / 2;
        if (x2 > 0 && x1 < W) {
          const col = qr.color || C.quiz;
          ctx.fillStyle = col + "30";
          ctx.fillRect(Math.max(0, x1), 0, Math.min(W, x2) - Math.max(0, x1), H);
          ctx.fillStyle = col + "BB";
          if (x1 > 0 && x1 < W) ctx.fillRect(x1 - 1, 0, 2, H);
          if (x2 > 0 && x2 < W) ctx.fillRect(x2 - 1, 0, 2, H);
        }
      }
      ctx.fillStyle = "rgba(26,25,21,0.85)"; ctx.fillRect(W / 2 - 1, 3, 2, H - 6);
      rafId = requestAnimationFrame(draw);
    };
    rafId = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(rafId); if (ro) ro.disconnect(); window.removeEventListener("resize", resize); };
  }, []);

  const handlePointerDown = (e) => {
    const canvas = canvasRef.current; if (!canvas) return;
    const rect = canvas.getBoundingClientRect(); let anchorX = 0, anchorTime = 0;
    startPointerDrag(e, {
      onStart: (ev, getX) => { anchorX = getX(ev); anchorTime = stateRef.current.time; stateRef.current.onScrubBegin(); },
      onMove:  (ev, getX) => { const delta = (getX(ev) - anchorX) * VISIBLE_SECS / rect.width; stateRef.current.onScrubTo(anchorTime - delta); },
      onEnd:   () => stateRef.current.onScrubEnd(),
    });
  };
  return <canvas ref={canvasRef} style={{ display: "block", width: "100%", height: 80, cursor: "crosshair", borderRadius: 8, touchAction: "none", userSelect: "none" }} onMouseDown={handlePointerDown} onTouchStart={handlePointerDown} />;
}

// ─── ExerciseView ─────────────────────────────────────────────────────────────
function ExerciseView({ exercise, mode, onSubmit, onBack }) {
  const dur = exercise.duration;
  const exCategories = categoriesOf(exercise);
  const initialCategoryId = useMemo(() => {
    if (mode === "record") { const empty = exCategories.find((m) => answerFor(exercise, m.id).length === 0); if (empty) return empty.id; }
    return exCategories[0]?.id || DEFAULT_CATEGORY.id;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exercise.id]);
  const [currentCategoryId, setCurrentCategoryId] = useState(initialCategoryId);
  const exCategory = exCategories.find((m) => m.id === currentCategoryId) || exCategories[0];
  const colorByFn  = useMemo(() => { const m = {}; exCategory.buttons.forEach((b) => { m[b.id] = b.color; }); return m; }, [exCategory]);

  const [intervalsByCategory, setIntervalsByCategory] = useState({});
  const [pressing, setPressing] = useState(null);
  const [selected, setSelected] = useState(null);
  const [waveformData, setWaveformData] = useState(exercise.waveformData || null);

  // ── Audio player (shared hook) ───────────────────────────────────────
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

  const switchCategory = (newId) => {
    if (newId === currentCategoryId) return;
    if (pressing) {
      const end = timeRef.current;
      if (end - pressing.start > 0.1) {
        setIntervalsByCategory((prev) => {
          const cur = prev[currentCategoryId] || [];
          return { ...prev, [currentCategoryId]: [...cur, { id: Date.now() + Math.random(), fn: pressing.fn, start: pressing.start, end }] };
        });
      }
      setPressing(null);
    }
    setSelected(null); setCurrentCategoryId(newId);
  };

  const togglePlayRef = useRef(togglePlay);
  useEffect(() => { togglePlayRef.current = togglePlay; });
  useEffect(() => {
    const down = (e) => {
      if (e.repeat) return;
      const btn = exCategory.buttons.find((b) => b.key === e.key.toLowerCase());
      if (btn) {
        setPressing(p => {
          const now = timeRef.current;
          if (p && p.fn === btn.id) return p;
          if (p && now - p.start > 0.1) { const newIv = { id: Date.now() + Math.random(), fn: p.fn, start: p.start, end: now }; setIntervals(prev => [...resolveOverlap(prev, newIv), newIv]); }
          return { fn: btn.id, start: now };
        });
      }
      if (e.key === " ") { e.preventDefault(); togglePlayRef.current(); }
    };
    const up = (e) => {
      const btn = exCategory.buttons.find((b) => b.key === e.key.toLowerCase());
      if (btn) setPressing(p => { if (!p || p.fn !== btn.id) return p; const end = timeRef.current; if (end - p.start > 0.1) { const newIv = { id: Date.now() + Math.random(), fn: btn.id, start: p.start, end }; setIntervals(prev => [...resolveOverlap(prev, newIv), newIv]); } return null; });
    };
    window.addEventListener("keydown", down); window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exCategory]);

  const handleFnDown = (fn) => setPressing(p => { const now = timeRef.current; if (p && p.fn === fn) return p; if (p && now - p.start > 0.1) { const newIv = { id: Date.now() + Math.random(), fn: p.fn, start: p.start, end: now }; setIntervals(prev => [...resolveOverlap(prev, newIv), newIv]); } return { fn, start: now }; });
  const handleFnUp   = (fn) => setPressing(p => { if (!p || p.fn !== fn) return p; const end = timeRef.current; if (end - p.start > 0.1) { const newIv = { id: Date.now() + Math.random(), fn, start: p.start, end }; setIntervals(prev => [...resolveOverlap(prev, newIv), newIv]); } return null; });

  const handleSubmit = () => {
    let byCategory = intervalsByCategory;
    if (pressing) { const end = timeRef.current, cur = byCategory[currentCategoryId] || [], newIv = { id: Date.now() + Math.random(), fn: pressing.fn, start: pressing.start, end }; byCategory = { ...byCategory, [currentCategoryId]: [...resolveOverlap(cur, newIv), newIv] }; }
    const touched = Object.entries(byCategory), source = touched.length > 0 ? touched : [[currentCategoryId, []]];
    onSubmit({ entries: source.map(([categoryId, ivs]) => ({ categoryId, intervals: ivs.map(({ fn, start, end }) => ({ fn, start, end })) })), currentCategoryId });
  };
  const deleteSelected = () => { setIntervals(p => p.filter(iv => iv.id !== selected)); setSelected(null); };

  const beginDragEdge = (e, ivId, which) => {
    e.stopPropagation(); setSelected(ivId);
    const tl = timelineRef.current; if (!tl) return;
    const rect = tl.getBoundingClientRect(), xToTime = (x) => Math.max(0, Math.min(dur, ((x - rect.left) / rect.width) * dur));
    const origIvs = intervals, origIv = origIvs.find(iv => iv.id === ivId); if (!origIv) return;
    startPointerDrag(e, { onMove: (ev, getX) => { const t = xToTime(getX(ev)); const updated = which === "start" ? { ...origIv, start: Math.min(origIv.end - 0.1, t) } : { ...origIv, end: Math.max(origIv.start + 0.1, t) }; setIntervals([...resolveOverlap(origIvs.filter(iv => iv.id !== ivId), updated), updated]); } });
  };
  const beginDragBody = (e, ivId) => {
    e.stopPropagation();
    const tl = timelineRef.current; if (!tl) return;
    const rect = tl.getBoundingClientRect(), origIvs = intervals, iv0 = origIvs.find(iv => iv.id === ivId); if (!iv0) return;
    const len = iv0.end - iv0.start; let startX = 0, moved = false;
    startPointerDrag(e, {
      onStart: (ev, getX) => { startX = getX(ev); },
      onMove:  (ev, getX) => { const cx = getX(ev); if (!moved && Math.abs(cx - startX) > 3) moved = true; if (!moved) return; const ns = Math.max(0, Math.min(dur - len, iv0.start + ((cx - startX) / rect.width) * dur)); const updated = { ...iv0, start: ns, end: ns + len }; setIntervals([...resolveOverlap(origIvs.filter(iv => iv.id !== ivId), updated), updated]); },
      onEnd:   () => { if (!moved) setSelected(s => s === ivId ? null : ivId); },
    });
  };

  const pct  = (t) => `${(t / dur) * 100}%`;
  const allIv = pressing ? [...intervals, { id: "live", fn: pressing.fn, start: pressing.start, end: Math.min(timeRef.current, dur) }] : intervals;
  const selectedIv = intervals.find(iv => iv.id === selected);
  const showSwitch = exCategories.length > 1, SWITCH_W = 14, SWITCH_GAP = 8, gutter = showSwitch ? SWITCH_W + SWITCH_GAP : 0;

  const renderStrip = (m, isActive) => {
    const ivs    = isActive ? allIv : (intervalsByCategory[m.id] || (mode === "record" ? answerFor(exercise, m.id) : []));
    const stripH = isActive ? 44 : 18;
    const isFnStyle = m.id === "default";
    return (
      <div key={m.id} style={{ marginTop: 8, marginLeft: gutter, marginRight: gutter, opacity: isActive ? 1 : 0.55 }}>
        <div style={{ fontFamily: FONT_MONO, fontSize: 9, letterSpacing: 1.2, color: isActive ? C.ink2 : C.muted, textTransform: "uppercase", marginBottom: 2, lineHeight: 1, paddingLeft: 2, userSelect: "none" }}>{m.name.split(" ")[0]}</div>
        <div ref={isActive ? timelineRef : null} style={{ position: "relative", height: stripH, borderRadius: 6, background: "rgba(26,25,21,0.04)", display: "flex", alignItems: "center", userSelect: "none", touchAction: isActive ? "none" : "auto", overflow: "hidden" }}>
          {ivs.map((iv, i) => {
            const b = btnOf(m, iv.fn), isSel = isActive && selected === iv.id, isLive = isActive && iv.id === "live";
            if (isFnStyle) {
              const dotSize = isActive ? 22 : 12, fontSize = isActive ? 11 : 8, lineH = isActive ? 2 : 1.5;
              return (
                <div key={iv.id || `${iv.fn}-${i}`} onMouseDown={isActive && !isLive ? (e) => beginDragBody(e, iv.id) : undefined} onTouchStart={isActive && !isLive ? (e) => beginDragBody(e, iv.id) : undefined}
                  style={{ position: "absolute", top: 2, bottom: 2, left: pct(iv.start), width: pct(Math.max(0, Math.min(iv.end, dur) - iv.start)), background: isSel ? `${b.color}1F` : "transparent", opacity: isLive ? 0.5 : 1, border: isSel ? `1.5px solid ${b.color}` : `1px solid ${C.line}`, borderRadius: 4, cursor: isActive && !isLive ? "grab" : "default", display: "flex", alignItems: "center", justifyContent: "flex-start", overflow: "hidden", boxSizing: "border-box", paddingLeft: isActive ? 4 : 2, paddingRight: 2, zIndex: isSel ? 2 : 1 }} title={`${iv.fn} · ${fmt(iv.start)}–${fmt(iv.end)}`}>
                  {isActive && !isLive && <div onMouseDown={(e) => beginDragEdge(e, iv.id, "start")} onTouchStart={(e) => beginDragEdge(e, iv.id, "start")} style={{ position: "absolute", left: -4, top: -2, bottom: -2, width: 10, cursor: "ew-resize", zIndex: 3 }} />}
                  <div style={{ flex: `0 0 ${dotSize}px`, width: dotSize, height: dotSize, borderRadius: "50%", background: b.color, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT_MONO, fontWeight: 700, fontSize, color: C.paper, pointerEvents: "none", lineHeight: 1 }}>{iv.fn}</div>
                  <div style={{ flex: "1 1 auto", height: lineH, marginLeft: isActive ? 4 : 2, background: b.color, borderRadius: lineH, alignSelf: "center", transform: `translateY(${fontSize * 0.32}px)`, pointerEvents: "none" }} />
                  {isActive && !isLive && <div onMouseDown={(e) => beginDragEdge(e, iv.id, "end")} onTouchStart={(e) => beginDragEdge(e, iv.id, "end")} style={{ position: "absolute", right: -4, top: -2, bottom: -2, width: 10, cursor: "ew-resize", zIndex: 3 }} />}
                </div>
              );
            }
            return (
              <div key={iv.id || `${iv.fn}-${i}`} onMouseDown={isActive && !isLive ? (e) => beginDragBody(e, iv.id) : undefined} onTouchStart={isActive && !isLive ? (e) => beginDragBody(e, iv.id) : undefined}
                style={{ position: "absolute", top: 2, bottom: 2, left: pct(iv.start), width: pct(Math.max(0, Math.min(iv.end, dur) - iv.start)), background: b.color, opacity: isLive ? 0.5 : (isSel ? 1 : 0.86), border: isSel ? `1.5px solid ${C.ink}` : "none", borderRadius: 4, cursor: isActive && !isLive ? "grab" : "default", display: "flex", alignItems: "center", justifyContent: "center", fontSize: isActive ? 12 : 9, fontFamily: FONT_MONO, fontWeight: 700, color: C.paper, overflow: "hidden", boxSizing: "border-box" }} title={`${iv.fn} · ${fmt(iv.start)}–${fmt(iv.end)}`}>
                {isActive && !isLive && <div onMouseDown={(e) => beginDragEdge(e, iv.id, "start")} onTouchStart={(e) => beginDragEdge(e, iv.id, "start")} style={{ position: "absolute", left: -4, top: -2, bottom: -2, width: 10, cursor: "ew-resize", zIndex: 3 }} />}
                <span style={{ pointerEvents: "none", padding: "0 6px" }}>{iv.fn}</span>
                {isActive && !isLive && <div onMouseDown={(e) => beginDragEdge(e, iv.id, "end")} onTouchStart={(e) => beginDragEdge(e, iv.id, "end")} style={{ position: "absolute", right: -4, top: -2, bottom: -2, width: 10, cursor: "ew-resize", zIndex: 3 }} />}
              </div>
            );
          })}
          {isActive && selected && (() => {
            const selIv = ivs.find((iv) => iv.id === selected); if (!selIv || selIv.id === "live") return null;
            const selBtn = btnOf(m, selIv.fn), handleBg = isFnStyle ? selBtn.color : C.paper, handleShadow = isFnStyle ? `0 0 0 1.5px ${C.paper}, 0 0 0 2.5px ${selBtn.color}` : `0 0 0 1.5px ${C.ink}`;
            const Handle = ({ side }) => (<div style={{ position: "absolute", top: 0, bottom: 0, left: `calc(${pct(side === "start" ? selIv.start : selIv.end)} - 3px)`, width: 6, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none", zIndex: 4 }}><div style={{ width: 4, height: "70%", background: handleBg, borderRadius: 2, boxShadow: handleShadow }} /></div>);
            return <><Handle side="start" /><Handle side="end" /></>;
          })()}
          <div style={{ position: "absolute", top: 0, bottom: 0, left: pct(time), width: 1.5, background: C.ink, opacity: 0.55, pointerEvents: "none", zIndex: 2 }} />
        </div>
      </div>
    );
  };

  return (
    <div style={S.app} onMouseDown={() => { if (selected !== null) setSelected(null); }}>
      <div style={{ ...S.page, paddingTop: "1.25rem" }}>
        <div style={{ ...S.row, justifyContent: "space-between", marginBottom: 18 }}>
          <button onClick={onBack} style={{ ...S.btn, padding: "6px 14px", fontSize: 13 }}>← Volver</button>
          <div style={{ fontWeight: 600, color: C.ink, fontSize: 15, textAlign: "center", flex: 1 }}>{exercise.title}</div>
          <div style={{ width: 70 }} />
        </div>
        {hasAudio && !audioReady && !audioError && <div style={{ textAlign: "center", color: C.muted, fontSize: 12, marginBottom: 10 }}>Cargando audio…</div>}
        {audioError && <div style={{ textAlign: "center", color: "#B84A3A", fontSize: 12, marginBottom: 10 }}>{audioError}</div>}

        <section style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 18, padding: "14px 14px 12px", marginBottom: 16 }}>
          <div style={{ marginLeft: gutter, marginRight: gutter, background: C.paper2, borderRadius: 10, overflow: "hidden", border: `1px solid ${C.line}` }}>
            <WaveformDisplay time={time} duration={dur} allIntervals={allIv} exerciseId={exercise.id} waveformData={waveformData} colorByFn={colorByFn} onSeek={seekTo} onScrubBegin={scrubBegin} onScrubTo={scrubTo} onScrubEnd={scrubEnd} />
          </div>
          <div style={{ position: "relative" }}>
            {showSwitch && (
              <div role="tablist" style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: SWITCH_W, display: "flex", flexDirection: "column", background: C.paper2, border: `1px solid ${C.line}`, borderRadius: 999, overflow: "hidden", padding: 2, gap: 2, boxSizing: "border-box" }}>
                {exCategories.map((m) => { const isActive = m.id === currentCategoryId; return <button key={m.id} type="button" role="tab" aria-selected={isActive} onClick={() => switchCategory(m.id)} title={m.name} style={{ flex: "1 1 0", minHeight: 0, border: "none", padding: 0, borderRadius: 999, background: isActive ? C.ink : "transparent", cursor: "pointer" }} />; })}
              </div>
            )}
            {exCategories.map((m) => renderStrip(m, m.id === currentCategoryId))}
          </div>
          {mode === "student" && exercise.showHint && answerFor(exercise, currentCategoryId).length > 0 && (
            <div style={{ position: "relative", height: 6, marginTop: 6, marginLeft: gutter, marginRight: gutter }}>
              {answerFor(exercise, currentCategoryId).map((iv, i) => <div key={i} style={{ position: "absolute", top: 0, bottom: 0, left: pct(iv.start), width: pct(iv.end - iv.start), background: C.muted2, opacity: 0.45, borderRadius: 2 }} />)}
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 12, marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.line}` }}>
            <div />
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button onClick={() => seekTo(Math.max(0, time - 5))} style={{ width: 42, height: 42, borderRadius: "50%", background: "transparent", border: `1px solid ${C.line}`, color: C.ink2, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontFamily: FONT_MONO }}>−5s</button>
              <button onClick={togglePlay} disabled={hasAudio && !audioReady && !audioError} style={{ width: 48, height: 48, borderRadius: "50%", background: C.ink, border: `1px solid ${C.ink}`, color: C.paper, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 700, opacity: hasAudio && !audioReady && !audioError ? 0.4 : 1 }} title={playing ? "Pausa (Espacio)" : "Reproducir (Espacio)"}>{playing ? "❚❚" : "▶"}</button>
              <button onClick={() => seekTo(Math.min(dur, time + 5))} style={{ width: 42, height: 42, borderRadius: "50%", background: "transparent", border: `1px solid ${C.line}`, color: C.ink2, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontFamily: FONT_MONO }}>+5s</button>
            </div>
            <div style={{ textAlign: "right", fontFamily: FONT_MONO, fontVariantNumeric: "tabular-nums", fontSize: 22, fontWeight: 600, color: C.ink, letterSpacing: -0.5 }}>{fmt(time)}<span style={{ color: C.muted2, fontWeight: 400 }}>/{fmt(dur)}</span></div>
          </div>
        </section>

        {selected && selectedIv && (
          <div onMouseDown={(e) => e.stopPropagation()} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginBottom: 14, padding: "8px 4px" }}>
            <span style={{ fontSize: 11, color: C.muted, fontFamily: FONT_MONO, textTransform: "uppercase", letterSpacing: 1 }}>Fragmento</span>
            {exCategory.buttons.map((b) => { const isSel = selectedIv.fn === b.id; return <button key={b.id} onClick={() => setIntervals(prev => prev.map(iv => iv.id === selected ? { ...iv, fn: b.id } : iv))} style={{ background: isSel ? b.color : C.paper, color: isSel ? C.paper : b.color, border: `1.5px solid ${b.color}`, borderRadius: 999, padding: "4px 12px", cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: FONT_MONO }}>{b.id}</button>; })}
            <span style={{ fontSize: 11, color: C.muted2, fontFamily: FONT_MONO, marginLeft: 4 }}>{fmt(selectedIv.start)} → {fmt(selectedIv.end)}</span>
            <button onClick={deleteSelected} style={{ ...S.btnDanger, marginLeft: "auto", padding: "4px 12px", fontSize: 12 }}>Eliminar</button>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(exCategory.buttons.length, 3)}, 1fr)`, gap: 12, marginBottom: 14 }}>
          {exCategory.buttons.map((b) => { const isActive = pressing?.fn === b.id; return (
            <button key={b.id} onMouseDown={() => handleFnDown(b.id)} onMouseUp={() => handleFnUp(b.id)} onMouseLeave={() => { if (pressing?.fn === b.id) handleFnUp(b.id); }} onTouchStart={(e) => { e.preventDefault(); handleFnDown(b.id); }} onTouchEnd={(e) => { e.preventDefault(); handleFnUp(b.id); }}
              style={{ background: isActive ? b.color : C.paper, border: isActive ? `1.5px solid ${b.color}` : `1.5px solid ${C.line}`, color: isActive ? C.paper : b.color, borderRadius: 14, padding: "16px 8px", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, transition: "background .08s, color .08s, border-color .08s, transform .08s", transform: isActive ? "translateY(1px)" : "translateY(0)", userSelect: "none", touchAction: "none" }}>
              <span style={{ fontSize: 28, fontWeight: 800, fontFamily: FONT_MONO, letterSpacing: -1, color: isActive ? C.paper : b.color, lineHeight: 1 }}>{b.id}</span>
              <span style={{ fontSize: 12, fontWeight: 500, color: isActive ? C.paper : C.ink2 }}>{b.name}</span>
              <span style={{ fontSize: 10, fontFamily: FONT_MONO, color: isActive ? C.paper : C.muted, opacity: 0.85, marginTop: 1 }}>{b.key.toUpperCase()}</span>
            </button>
          ); })}
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginTop: 6 }}>
          <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.5, flex: "1 1 240px", minWidth: 200 }}>Mantén pulsado el botón (o tecla) mientras suena · Espacio = Play/Pausa</div>
          <button onClick={handleSubmit} style={{ background: C.ink, color: C.paper, border: `1px solid ${C.ink}`, borderRadius: 999, padding: "10px 16px 10px 20px", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 10 }}>
            {mode === "record" ? "Guardar como respuesta correcta" : "Corregir ejercicio"}
            <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 22, height: 22, borderRadius: "50%", background: "rgba(251,250,246,0.18)", fontSize: 12 }}>→</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── CorrectionView ───────────────────────────────────────────────────────────
function CorrectionView({ exercise, result, margin, onBack }) {
  const dur = exercise.duration;

  if (result.type === "cuestionario") {
    const questions = questionsOf(exercise);
    const sc        = result.score;
    const scoreColor = sc == null ? C.muted : sc >= 80 ? C.fnT : sc >= 50 ? C.fnD : "#B84A3A";
    const testQs    = questions.filter(q => q.type === "test" && q.correctOptionId);
    const correctN  = testQs.filter(q => result.answers?.[q.id] === q.correctOptionId).length;
    return (
      <div style={S.app}>
        <div style={S.page}>
          <button onClick={onBack} style={{ ...S.btn, marginBottom: 24 }}>← Mis ejercicios</button>
          <h2 style={S.h2}>Corrección: {exercise.title}</h2>
          <div style={{ ...S.card, textAlign: "center", marginBottom: 20 }}>
            {sc == null ? (
              <div style={{ color: C.muted, lineHeight: 1.6 }}>
                {testQs.length === 0 ? <>Respuestas enviadas al profesor para revisión.<br /><span style={{ fontSize: 12 }}>Las preguntas de desarrollo se corrigen manualmente.</span></> : "Sin puntuación automática."}
              </div>
            ) : (
              <>
                <div style={{ fontSize: 64, fontWeight: 900, color: scoreColor, lineHeight: 1 }}>{sc}%</div>
                <div style={{ color: C.muted, fontSize: 14, marginTop: 4 }}>{correctN} de {testQs.length} {testQs.length === 1 ? "pregunta" : "preguntas"} correctas</div>
                <div style={{ fontSize: 14, marginTop: 12, color: scoreColor }}>{sc >= 80 ? "Excelente análisis." : sc >= 50 ? "Bien, pero hay margen de mejora." : "Sigue practicando."}</div>
              </>
            )}
          </div>
          {questions.map((q, idx) => {
            const studentAnswer = result.answers?.[q.id];
            const isCorrect = q.type === "test" && studentAnswer === q.correctOptionId;
            const isWrong   = q.type === "test" && !!studentAnswer && studentAnswer !== q.correctOptionId;
            return (
              <div key={q.id} style={{ ...S.card, border: q.type !== "test" ? `1px solid ${C.line}` : `1.5px solid ${isCorrect ? C.fnT : isWrong ? "#B84A3A" : C.line}` }}>
                <div style={{ ...S.row, gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                  <span style={{ ...S.badge, background: C.line, color: C.muted }}>P{idx + 1}</span>
                  <span style={{ ...S.badge, background: q.type === "test" ? "rgba(63,155,91,0.12)" : "rgba(47,111,184,0.12)", color: q.type === "test" ? C.fnT : C.quiz }}>{q.type === "test" ? "Test" : "Desarrollo"}</span>
                  <span style={{ ...S.badge, background: C.paper2, color: C.muted, fontFamily: FONT_MONO }}>{fmt(q.audioStart)}–{fmt(q.audioEnd)}</span>
                  {q.type === "test" && <span style={{ ...S.badge, background: isCorrect ? "rgba(63,155,91,0.16)" : isWrong ? "rgba(184,74,58,0.16)" : C.line, color: isCorrect ? C.fnT : isWrong ? "#B84A3A" : C.muted }}>{!studentAnswer ? "Sin respuesta" : isCorrect ? "✓ Correcta" : "✗ Incorrecta"}</span>}
                </div>
                <div style={{ fontSize: 14, color: C.ink, marginBottom: 12 }}>{q.text}</div>
                {q.type === "test" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {q.options.map(opt => {
                      const isPick    = opt.id === studentAnswer;
                      const isCorrectOpt = opt.id === q.correctOptionId;
                      return (
                        <div key={opt.id} style={{ ...S.row, gap: 10, padding: "8px 12px", borderRadius: 8, background: isCorrectOpt ? "rgba(63,155,91,0.10)" : isPick && !isCorrectOpt ? "rgba(184,74,58,0.10)" : C.paper2, border: `1.5px solid ${isCorrectOpt ? C.fnT : isPick && !isCorrectOpt ? "#B84A3A" : C.line}`, color: isCorrectOpt ? C.fnT : isPick && !isCorrectOpt ? "#B84A3A" : C.muted }}>
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
                    <div style={{ background: C.paper2, border: `1px solid ${C.line}`, borderRadius: 8, padding: "10px 12px", fontSize: 14, color: C.ink, whiteSpace: "pre-wrap", minHeight: 40, lineHeight: 1.5 }}>{studentAnswer || <span style={{ color: C.muted2, fontStyle: "italic" }}>Sin respuesta</span>}</div>
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

  const exCategories = categoriesOf(exercise);
  const resultCategoryId = result.categoryId ?? result.modeId;
  const exCategory   = exCategories.find((m) => m.id === resultCategoryId) || exCategories[0];
  const teacherAns   = answerFor(exercise, exCategory.id);
  const studentAns   = result.intervals;
  const sc           = result.score;
  const scoreColor   = sc === null ? C.muted : sc >= 80 ? C.fnT : sc >= 50 ? C.fnD : "#B84A3A";
  const pct = (t) => `${(t / dur) * 100}%`;
  return (
    <div style={S.app}>
      <div style={S.page}>
        <button onClick={onBack} style={{ ...S.btn, marginBottom: 24 }}>← Mis ejercicios</button>
        <h2 style={S.h2}>Corrección: {exercise.title}</h2>
        {exCategories.length > 1 && <div style={{ marginBottom: 16, color: C.muted, fontSize: 13 }}>Categoría: <span style={{ color: C.fnI, fontWeight: 600 }}>{exCategory.name}</span></div>}
        <div style={{ ...S.card, textAlign: "center", marginBottom: 20 }}>
          {sc === null ? <div style={{ color: C.muted }}>Este ejercicio no tiene clave de corrección aún.</div> : (
            <>
              <div style={{ fontSize: 64, fontWeight: 900, color: scoreColor, lineHeight: 1 }}>{sc}%</div>
              <div style={{ color: C.muted, fontSize: 14, marginTop: 4 }}>de acierto · margen ±{margin}s</div>
              <div style={{ fontSize: 14, marginTop: 12, color: scoreColor }}>{sc >= 80 ? "Excelente análisis armónico." : sc >= 50 ? "Bien, pero hay margen de mejora." : "Sigue practicando."}</div>
            </>
          )}
        </div>
        {Array.isArray(result.extras) && result.extras.length > 0 && (
          <div style={{ ...S.card, marginBottom: 20 }}>
            <div style={{ fontSize: 13, color: C.muted, marginBottom: 10 }}>También has practicado:</div>
            {result.extras.map((ex2) => { const ex2Cat = ex2.categoryId ?? ex2.modeId; const m = exCategories.find((mm) => mm.id === ex2Cat); if (!m) return null; const c = ex2.score === null ? C.muted : ex2.score >= 80 ? C.fnT : ex2.score >= 50 ? C.fnD : "#B84A3A"; return <div key={ex2Cat} style={{ ...S.row, justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${C.line}` }}><span style={{ fontSize: 13, color: C.muted2 }}>{m.name}</span><span style={{ ...S.badge, background: C.line, color: c }}>{ex2.score === null ? "—" : `${ex2.score}%`}</span></div>; })}
          </div>
        )}
        {sc !== null && (
          <div style={S.card}>
            <div style={{ fontSize: 13, color: C.muted, marginBottom: 12 }}>Comparación visual (margen ±{margin}s aplicado)</div>
            <div style={{ fontSize: 11, ...S.row, gap: 12, marginBottom: 8, flexWrap: "wrap" }}>
              {exCategory.buttons.map((b) => <span key={b.id} style={{ ...S.row, gap: 4 }}><span style={{ width: 10, height: 10, background: b.color, borderRadius: 2, display: "inline-block" }} /><span style={{ color: C.muted2 }}>{b.id} = {b.name}</span></span>)}
            </div>
            {[{ label: "Clave", ivs: teacherAns }, { label: "Tu respuesta", ivs: studentAns }].map(({ label, ivs }) => (
              <div key={label} style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>{label}</div>
                <div style={{ background: C.paper2, borderRadius: 6, height: 36, position: "relative" }}>
                  {ivs.map((iv, i) => { const b = btnOf(exCategory, iv.fn); return <div key={i} style={{ position: "absolute", top: "10%", height: "80%", left: pct(iv.start), width: pct(iv.end - iv.start), background: b.color, borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>{(iv.end - iv.start) / dur > 0.06 && <span style={{ fontSize: 10, fontWeight: 700, color: textOn(b.color) }}>{iv.fn}</span>}</div>; })}
                </div>
              </div>
            ))}
            <div style={{ ...S.row, justifyContent: "space-between", fontSize: 10, color: C.muted2 }}>
              {Array.from({ length: Math.floor(dur / 5) + 1 }, (_, i) => i * 5).map((t) => <span key={t}>{fmt(t)}</span>)}
            </div>
          </div>
        )}
        <button onClick={onBack} style={{ ...S.btnPrimary, width: "100%", marginTop: 8, padding: 14, borderRadius: 12 }}>Volver a mis ejercicios</button>
      </div>
    </div>
  );
}

// ─── QuestionEditorModal ──────────────────────────────────────────────────────
function QuestionEditorModal({ initial, defaultStart, audioDuration, onSave, onClose }) {
  const isEdit = !!initial;
  const [text, setText]   = useState(initial?.text || "");
  const [type, setType]   = useState(initial?.type || "test");
  const [audioStart, setAudioStart] = useState(initial != null ? initial.audioStart : Math.max(0, Math.min(audioDuration - 1, defaultStart ?? 0)));
  const [audioEnd,   setAudioEnd]   = useState(initial != null ? initial.audioEnd   : Math.min(audioDuration, (defaultStart ?? 0) + 10));
  const [options, setOptions] = useState(
    initial?.options?.length > 0
      ? initial.options.map(o => ({ ...o }))
      : [{ id: "A", text: "" }, { id: "B", text: "" }, { id: "C", text: "" }]
  );
  const [correctOptionId, setCorrectOptionId] = useState(initial?.correctOptionId || "A");

  const updateOption = (idx, patch) => setOptions(prev => prev.map((o, i) => i === idx ? { ...o, ...patch } : o));
  const addOption    = () => {
    const usedIds = new Set(options.map(o => o.id));
    const id = ["A","B","C","D","E","F"].find(l => !usedIds.has(l)) || `O${options.length}`;
    setOptions(prev => [...prev, { id, text: "" }]);
  };
  const removeOption = (idx) => {
    const newOpts = options.filter((_, i) => i !== idx);
    setOptions(newOpts);
    if (newOpts.length > 0 && !newOpts.find(o => o.id === correctOptionId)) setCorrectOptionId(newOpts[0].id);
  };

  const startN = parseFloat(audioStart) || 0, endN = parseFloat(audioEnd) || 0;
  const validRange   = startN >= 0 && endN > startN && endN <= audioDuration;
  const validOptions = type !== "test" || (options.length >= 2 && options.every(o => o.text.trim().length > 0) && options.some(o => o.id === correctOptionId));
  const canSave      = text.trim().length > 0 && validRange && validOptions;

  const handleSave = () => {
    if (!canSave) return;
    onSave({ id: initial?.id || `q-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, text: text.trim(), type, audioStart: startN, audioEnd: endN, options: type === "test" ? options.map(o => ({ id: o.id, text: o.text.trim() })) : [], correctOptionId: type === "test" ? correctOptionId : null });
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(26,25,21,0.55)", display: "flex", alignItems: "flex-start", justifyContent: "center", zIndex: 200, overflowY: "auto", padding: "32px 16px" }}>
      <div style={{ ...S.card, width: 500, maxWidth: "92vw", marginBottom: 0 }}>
        <h2 style={S.h2}>{isEdit ? "Editar pregunta" : "Nueva pregunta"}</h2>

        <label style={S.label}>Tipo de pregunta</label>
        <div style={{ ...S.row, gap: 8, marginBottom: 16 }}>
          {[{ id: "test", label: "Tipo test" }, { id: "desarrollo", label: "Desarrollo" }].map(t => (
            <button key={t.id} type="button" onClick={() => setType(t.id)} style={{ ...S.btn, flex: 1, fontSize: 13, padding: "8px 10px", background: type === t.id ? C.ink : C.paper, color: type === t.id ? C.paper : C.ink2, border: type === t.id ? `1px solid ${C.ink}` : `1px solid ${C.line}` }}>{t.label}</button>
          ))}
        </div>

        <label style={S.label}>Enunciado de la pregunta</label>
        <textarea style={{ ...S.input, minHeight: 68, resize: "vertical", marginBottom: 16, fontFamily: FONT_SANS, lineHeight: 1.5 }} value={text} onChange={e => setText(e.target.value)} placeholder="Ej: ¿Qué función armónica predomina en este fragmento?" autoFocus />

        <label style={S.label}>Fragmento de audio — el alumno escuchará este tramo en bucle</label>
        <div style={{ ...S.row, gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 90px", minWidth: 80 }}>
            <label style={{ ...S.label, fontSize: 11 }}>Inicio (s)</label>
            <input type="number" min={0} max={audioDuration} step={0.5} style={S.input} value={audioStart} onChange={e => setAudioStart(e.target.value)} />
          </div>
          <div style={{ flex: "1 1 90px", minWidth: 80 }}>
            <label style={{ ...S.label, fontSize: 11 }}>Fin (s)</label>
            <input type="number" min={0} max={audioDuration} step={0.5} style={S.input} value={audioEnd} onChange={e => setAudioEnd(e.target.value)} />
          </div>
          <div style={{ flex: "1 1 70px", minWidth: 60 }}>
            <label style={{ ...S.label, fontSize: 11 }}>Duración</label>
            <div style={{ ...S.input, color: endN > startN ? C.fnT : C.muted, background: C.paper2 }}>{endN > startN ? fmt(endN - startN) : "—"}</div>
          </div>
        </div>
        {!validRange && (startN || endN) && (
          <p style={{ fontSize: 11, color: "#B84A3A", margin: "0 0 12px" }}>{endN <= startN ? "El fin debe ser posterior al inicio." : `El fin supera la duración total (${fmt(audioDuration)}).`}</p>
        )}
        {validRange && <div style={{ marginBottom: 12 }} />}

        {type === "test" && (
          <>
            <label style={S.label}>Opciones (2–6) — haz clic en el círculo para marcar la correcta</label>
            {options.map((opt, idx) => (
              <div key={opt.id} style={{ ...S.row, gap: 8, marginBottom: 8 }}>
                <button type="button" onClick={() => setCorrectOptionId(opt.id)} title="Marcar como correcta" style={{ width: 28, height: 28, borderRadius: "50%", flexShrink: 0, background: correctOptionId === opt.id ? C.fnT : "transparent", border: `2px solid ${correctOptionId === opt.id ? C.fnT : C.line}`, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, fontFamily: FONT_MONO, color: correctOptionId === opt.id ? C.paper : C.muted, transition: "all .12s" }}>{opt.id}</button>
                <input style={{ ...S.input, flex: 1 }} placeholder={`Texto de la opción ${opt.id}`} value={opt.text} onChange={e => updateOption(idx, { text: e.target.value })} />
                <button onClick={() => removeOption(idx)} disabled={options.length <= 2} style={{ ...S.btnDanger, padding: "6px 10px", opacity: options.length <= 2 ? 0.3 : 1, cursor: options.length <= 2 ? "not-allowed" : "pointer" }}>×</button>
              </div>
            ))}
            <button onClick={addOption} disabled={options.length >= 6} style={{ ...S.btn, width: "100%", marginBottom: 14, opacity: options.length >= 6 ? 0.4 : 1 }}>+ Añadir opción</button>
          </>
        )}

        {!canSave && text.trim() && <p style={{ fontSize: 11, color: "#B84A3A", margin: "0 0 10px" }}>{!validRange ? "Revisa el rango del fragmento." : !validOptions ? "Completa las opciones y marca la respuesta correcta." : ""}</p>}
        <div style={{ ...S.row, gap: 10 }}>
          <button onClick={onClose} style={{ ...S.btn, flex: 1 }}>Cancelar</button>
          <button onClick={handleSave} disabled={!canSave} style={{ ...S.btnPrimary, flex: 1, opacity: canSave ? 1 : 0.45, cursor: canSave ? "pointer" : "not-allowed" }}>{isEdit ? "Guardar cambios" : "Añadir pregunta"}</button>
        </div>
      </div>
    </div>
  );
}

// ─── QuestionManagerView ──────────────────────────────────────────────────────
function QuestionManagerView({ exercise, onSave, onBack }) {
  const dur = exercise.duration;
  const [questions, setQuestions] = useState(questionsOf(exercise));
  const [editingQ, setEditingQ]   = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [selectedQId, setSelectedQId] = useState(null);
  const minimapRef = useRef(null);

  // ── Audio player (shared hook) ───────────────────────────────────────
  // QMV uses exercise.waveformData directly — no onWaveform callback needed.
  const {
    time, playing, audioReady, audioError, hasAudio,
    togglePlay, seekTo, scrubBegin, scrubTo, scrubEnd,
  } = useAudioPlayer(exercise);

  const togglePlayRef = useRef(togglePlay);
  useEffect(() => { togglePlayRef.current = togglePlay; });
  useEffect(() => {
    const down = (e) => { if (e.key === " " && !["INPUT","TEXTAREA","BUTTON"].includes(e.target.tagName)) { e.preventDefault(); togglePlayRef.current(); } };
    window.addEventListener("keydown", down); return () => window.removeEventListener("keydown", down);
  }, []);

  const beginDragQBody = (e, qId) => {
    e.stopPropagation();
    const el = minimapRef.current; if (!el) return;
    const rect = el.getBoundingClientRect();
    const origQs = questions;
    const origQ  = origQs.find(q => q.id === qId); if (!origQ) return;
    const len    = origQ.audioEnd - origQ.audioStart;
    let startX = 0, moved = false;
    startPointerDrag(e, {
      onStart: (_ev, getX) => { startX = getX(_ev); setSelectedQId(qId); },
      onMove: (_ev, getX) => {
        const cx = getX(_ev);
        if (!moved && Math.abs(cx - startX) > 3) moved = true;
        if (!moved) return;
        const ns = Math.max(0, Math.min(dur - len, origQ.audioStart + ((cx - startX) / rect.width) * dur));
        const s  = parseFloat(ns.toFixed(2)), f = parseFloat((ns + len).toFixed(2));
        setQuestions(prev => prev.map(q => q.id === qId ? { ...q, audioStart: s, audioEnd: f } : q));
      },
      onEnd: () => { if (!moved) { seekTo(origQ.audioStart); } },
    });
  };

  const beginDragQEdge = (e, qId, which) => {
    e.stopPropagation();
    const el = minimapRef.current; if (!el) return;
    const rect = el.getBoundingClientRect();
    const xToTime = (x) => Math.max(0, Math.min(dur, ((x - rect.left) / rect.width) * dur));
    const origQ = questions.find(q => q.id === qId); if (!origQ) return;
    setSelectedQId(qId);
    startPointerDrag(e, {
      onMove: (_ev, getX) => {
        const t = xToTime(getX(_ev));
        const updated = which === "start"
          ? { ...origQ, audioStart: parseFloat(Math.min(origQ.audioEnd - 0.5, Math.max(0, t)).toFixed(2)) }
          : { ...origQ, audioEnd:   parseFloat(Math.max(origQ.audioStart + 0.5, Math.min(dur, t)).toFixed(2)) };
        setQuestions(prev => prev.map(q => q.id === qId ? updated : q));
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
          {audioError && <div style={{ textAlign: "center", color: "#B84A3A", fontSize: 12, marginBottom: 8 }}>{audioError}</div>}
          <div style={{ background: C.paper2, borderRadius: 10, overflow: "hidden", border: `1px solid ${C.line}`, marginBottom: 6 }}>
            {(() => {
              const selQ = questions.find(q => q.id === selectedQId);
              const qRegion = selQ ? { start: selQ.audioStart, end: selQ.audioEnd, color: C.quiz } : null;
              return <WaveformDisplay time={time} duration={dur} allIntervals={[]} exerciseId={exercise.id} waveformData={exercise.waveformData || null} colorByFn={{}} questionRegion={qRegion} onSeek={seekTo} onScrubBegin={scrubBegin} onScrubTo={scrubTo} onScrubEnd={scrubEnd} />;
            })()}
          </div>
          <div ref={minimapRef} onMouseDown={() => setSelectedQId(null)}
            style={{ position: "relative", height: 36, marginBottom: 4, background: C.paper2, borderRadius: 6, border: `1px solid ${C.line}`, overflow: "hidden", touchAction: "none", userSelect: "none", cursor: "default" }}>
            {questions.map((q, idx) => {
              const isSel  = selectedQId === q.id;
              const qLeft  = `${(q.audioStart / dur) * 100}%`;
              const qWidth = `${Math.max(0, (q.audioEnd - q.audioStart) / dur) * 100}%`;
              return (
                <div key={q.id}
                  onMouseDown={(e) => beginDragQBody(e, q.id)}
                  onTouchStart={(e) => beginDragQBody(e, q.id)}
                  title={`P${idx + 1}: ${fmt(q.audioStart)} – ${fmt(q.audioEnd)}`}
                  style={{ position: "absolute", top: 3, bottom: 3, left: qLeft, width: qWidth, background: C.quiz, opacity: isSel ? 1 : 0.7, borderRadius: 3, cursor: "grab", display: "flex", alignItems: "center", justifyContent: "center", border: isSel ? `1.5px solid rgba(255,255,255,0.85)` : "none", boxSizing: "border-box", overflow: "hidden", zIndex: isSel ? 2 : 1 }}>
                  <div onMouseDown={(e) => { e.stopPropagation(); beginDragQEdge(e, q.id, "start"); }} onTouchStart={(e) => { e.stopPropagation(); beginDragQEdge(e, q.id, "start"); }} style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 10, cursor: "ew-resize", zIndex: 3, background: isSel ? "rgba(255,255,255,0.22)" : "transparent" }} />
                  <span style={{ fontSize: 8, color: C.paper, fontWeight: 700, fontFamily: FONT_MONO, pointerEvents: "none", padding: "0 12px", overflow: "hidden", whiteSpace: "nowrap" }}>P{idx + 1}</span>
                  <div onMouseDown={(e) => { e.stopPropagation(); beginDragQEdge(e, q.id, "end"); }} onTouchStart={(e) => { e.stopPropagation(); beginDragQEdge(e, q.id, "end"); }} style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 10, cursor: "ew-resize", zIndex: 3, background: isSel ? "rgba(255,255,255,0.22)" : "transparent" }} />
                </div>
              );
            })}
            <div style={{ position: "absolute", top: 0, bottom: 0, left: `${(time / dur) * 100}%`, width: 1.5, background: C.ink, opacity: 0.75, pointerEvents: "none", zIndex: 5 }} />
          </div>

          {selectedQId && (() => {
            const selQ  = questions.find(q => q.id === selectedQId);
            const selIdx = questions.findIndex(q => q.id === selectedQId);
            if (!selQ) return null;
            return (
              <div onMouseDown={e => e.stopPropagation()}
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
              <button onClick={() => seekTo(Math.max(0, time - 5))} style={{ width: 36, height: 36, borderRadius: "50%", background: "transparent", border: `1px solid ${C.line}`, color: C.ink2, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontFamily: FONT_MONO }}>−5s</button>
              <button onClick={togglePlay} disabled={hasAudio && !audioReady && !audioError} style={{ width: 42, height: 42, borderRadius: "50%", background: C.ink, border: `1px solid ${C.ink}`, color: C.paper, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, opacity: hasAudio && !audioReady && !audioError ? 0.4 : 1 }}>{playing ? "❚❚" : "▶"}</button>
              <button onClick={() => seekTo(Math.min(dur, time + 5))} style={{ width: 36, height: 36, borderRadius: "50%", background: "transparent", border: `1px solid ${C.line}`, color: C.ink2, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontFamily: FONT_MONO }}>+5s</button>
            </div>
            <div style={{ textAlign: "right", fontFamily: FONT_MONO, fontVariantNumeric: "tabular-nums", fontSize: 18, fontWeight: 600, color: C.ink }}>
              {fmt(time)}<span style={{ color: C.muted2, fontWeight: 400 }}>/{fmt(dur)}</span>
            </div>
          </div>
        </section>

        <div style={{ ...S.row, justifyContent: "space-between", marginBottom: 8 }}>
          <h2 style={{ ...S.h2, margin: 0 }}>Preguntas ({questions.length})</h2>
          <button onClick={() => setEditingQ({ _new: true, defaultStart: timeRef.current })} style={S.btnPrimary}>+ Añadir aquí</button>
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
                    {q.options.map(opt => <span key={opt.id} style={{ ...S.badge, fontSize: 11, background: opt.id === q.correctOptionId ? "rgba(63,155,91,0.14)" : C.paper2, color: opt.id === q.correctOptionId ? C.fnT : C.muted, border: opt.id === q.correctOptionId ? `1px solid ${C.fnT}` : `1px solid transparent` }}>{opt.id}) {opt.text}{opt.id === q.correctOptionId ? " ✓" : ""}</span>)}
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

        <button onClick={() => onSave(questions)} style={{ ...S.btnPrimary, width: "100%", marginTop: 8, padding: 14, borderRadius: 12 }}>Guardar preguntas</button>
      </div>

      {editingQ && (
        <QuestionEditorModal
          initial={editingQ._new ? null : editingQ}
          defaultStart={editingQ._new ? editingQ.defaultStart : undefined}
          audioDuration={dur}
          onSave={(q) => { if (editingQ._new) setQuestions(prev => [...prev, q]); else setQuestions(prev => prev.map(x => x.id === q.id ? q : x)); setEditingQ(null); }}
          onClose={() => setEditingQ(null)}
        />
      )}
      {confirmDel && (
        <ConfirmModal
          message={`¿Eliminar la pregunta "${confirmDel.text.slice(0, 60)}${confirmDel.text.length > 60 ? "…" : ""}"?`}
          onConfirm={() => { setQuestions(prev => prev.filter(x => x.id !== confirmDel.id)); setConfirmDel(null); }}
          onCancel={() => setConfirmDel(null)}
        />
      )}
    </div>
  );
}

// ─── QuestionnaireView ────────────────────────────────────────────────────────
function QuestionnaireView({ exercise, onSubmit, onBack }) {
  const dur       = exercise.duration;
  const questions = questionsOf(exercise);

  const [answers, setAnswers] = useState({});
  const [expandedId, setExpandedId]         = useState(null);
  const [lockedQuestion, setLockedQuestion] = useState(null);
  const [waveformData, setWaveformData]     = useState(exercise.waveformData || null);

  // loopRegionRef is kept in sync each render and passed to the hook so that
  // the RAF and timer loops know when to wrap around a question's segment.
  const loopRegionRef = useRef(null);
  loopRegionRef.current = lockedQuestion;  // { audioStart, audioEnd } | null

  // ── Audio player (shared hook) ───────────────────────────────────────
  const onWaveform = exercise.waveformData ? null : (wd) => setWaveformData(wd);
  const {
    time, playing, audioReady, audioError, hasAudio,
    togglePlay, seekTo, playFrom, scrubBegin, scrubTo, scrubEnd,
  } = useAudioPlayer(exercise, { onWaveform, loopRegionRef });

  const selectQuestion   = (q) => { setLockedQuestion(q); setExpandedId(q.id); seekTo(q.audioStart); };
  const listenToQuestion = (q) => { setLockedQuestion(q); setExpandedId(q.id); playFrom(q.audioStart); };
  const unlockAudio      = () => { setLockedQuestion(null); };

  const answeredCount = questions.filter(q => answers[q.id] !== undefined && answers[q.id] !== "").length;

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
        {audioError && <div style={{ textAlign: "center", color: "#B84A3A", fontSize: 12, marginBottom: 10 }}>{audioError}</div>}

        <section style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 18, padding: "14px 14px 12px", marginBottom: 16 }}>
          <div style={{ background: C.paper2, borderRadius: 10, overflow: "hidden", border: `1px solid ${C.line}`, marginBottom: 6 }}>
            <WaveformDisplay time={time} duration={dur} allIntervals={[]} exerciseId={exercise.id} waveformData={waveformData} colorByFn={{}} questionRegion={questionRegion} onSeek={seekTo} onScrubBegin={scrubBegin} onScrubTo={scrubTo} onScrubEnd={scrubEnd} />
          </div>

          <div style={{ position: "relative", height: 28, marginBottom: 4, background: C.paper2, borderRadius: 6, border: `1px solid ${C.line}`, overflow: "hidden", userSelect: "none" }}>
            {questions.map((q, idx) => {
              const isLock = lockedQuestion?.id === q.id;
              return (
                <div key={q.id}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={() => selectQuestion(q)}
                  title={`P${idx + 1}: ${fmt(q.audioStart)} – ${fmt(q.audioEnd)}`}
                  style={{ position: "absolute", top: 3, bottom: 3, left: `${(q.audioStart / dur) * 100}%`, width: `${Math.max(0, (q.audioEnd - q.audioStart) / dur) * 100}%`, background: C.quiz, opacity: isLock ? 1 : 0.45, borderRadius: 3, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", border: isLock ? `1.5px solid rgba(255,255,255,0.85)` : "none", boxSizing: "border-box", overflow: "hidden", transition: "opacity .15s" }}>
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
              <button onClick={() => seekTo(Math.max(lockedQuestion ? lockedQuestion.audioStart : 0, time - 5))} style={{ width: 42, height: 42, borderRadius: "50%", background: "transparent", border: `1px solid ${C.line}`, color: C.ink2, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontFamily: FONT_MONO }}>−5s</button>
              <button onClick={togglePlay} disabled={hasAudio && !audioReady && !audioError} style={{ width: 48, height: 48, borderRadius: "50%", background: C.ink, border: `1px solid ${C.ink}`, color: C.paper, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 700, opacity: hasAudio && !audioReady && !audioError ? 0.4 : 1 }} title={playing ? "Pausa (Espacio)" : "Reproducir (Espacio)"}>{playing ? "❚❚" : "▶"}</button>
              <button onClick={() => seekTo(Math.min(lockedQuestion ? lockedQuestion.audioEnd : dur, time + 5))} style={{ width: 42, height: 42, borderRadius: "50%", background: "transparent", border: `1px solid ${C.line}`, color: C.ink2, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontFamily: FONT_MONO }}>+5s</button>
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
            <div key={q.id} onMouseDown={(e) => e.stopPropagation()} style={{ ...S.card, border: isLocked ? `1.5px solid ${C.quiz}` : `1px solid ${C.line}`, transition: "border-color .15s" }}>
              <div style={{ cursor: "pointer" }} onClick={() => { if (isExpanded) { setExpandedId(null); } else { selectQuestion(q); } }}>
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
                      {q.options.map(opt => {
                        const isSel = answers[q.id] === opt.id;
                        return (
                          <button key={opt.id} onClick={() => setAnswers(prev => ({ ...prev, [q.id]: opt.id }))}
                            style={{ background: isSel ? C.ink : C.paper, color: isSel ? C.paper : C.ink2, border: `1.5px solid ${isSel ? C.ink : C.line}`, borderRadius: 10, padding: "10px 14px", cursor: "pointer", textAlign: "left", fontSize: 14, transition: "all .12s", display: "flex", alignItems: "center", gap: 10 }}>
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
                      onChange={(e) => setAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
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
          <button onClick={handleSubmit} style={{ background: C.ink, color: C.paper, border: `1px solid ${C.ink}`, borderRadius: 999, padding: "10px 16px 10px 20px", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 10 }}>
            Entregar respuestas
            <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 22, height: 22, borderRadius: "50%", background: "rgba(251,250,246,0.18)", fontSize: 12 }}>→</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── CategoryEditorModal ──────────────────────────────────────────────────────
function CategoryEditorModal({ initialCategory, onSave, onClose }) {
  const isEdit = !!initialCategory;
  const [name, setName] = useState(initialCategory?.name || "");
  const [buttons, setButtons] = useState(initialCategory?.buttons ? initialCategory.buttons.map((b) => ({ ...b })) : [{ id: "B1", name: "", color: CATEGORY_COLORS[0], key: KEY_SEQUENCE[0] }]);

  const updateBtn = (i, patch) => setButtons((prev) => prev.map((b, idx) => (idx === i ? { ...b, ...patch } : b)));
  const addBtn    = () => {
    const usedKeys   = new Set(buttons.map((b) => b.key));
    const usedColors = new Set(buttons.map((b) => b.color));
    const usedIds    = new Set(buttons.map((b) => b.id));
    const key    = KEY_SEQUENCE.find((k) => !usedKeys.has(k)) || "x";
    const color  = CATEGORY_COLORS.find((c) => !usedColors.has(c)) || CATEGORY_COLORS[buttons.length % CATEGORY_COLORS.length];
    const id     = ["A","B","C","D","E","F","G","H","I","J","K","L","M","N"].find((c) => !usedIds.has(c)) || `X${buttons.length}`;
    setButtons((prev) => [...prev, { id, name: "", color, key }]);
  };
  const removeBtn = (i) => setButtons((prev) => prev.filter((_, idx) => idx !== i));

  const ids = buttons.map((b) => b.id.trim()), keys = buttons.map((b) => b.key);
  const canSave = name.trim().length > 0 && buttons.length >= 1 && buttons.length <= 8 &&
    buttons.every((b) => b.name.trim().length > 0 && b.id.trim().length > 0 && /^[a-z]$/.test(b.key)) &&
    new Set(ids).size === ids.length && new Set(keys).size === keys.length;

  const handleSave = () => {
    if (!canSave) return;
    onSave({ id: initialCategory?.id || `category-${Date.now()}`, name: name.trim(), buttons: buttons.map((b) => ({ id: b.id.trim().toUpperCase(), name: b.name.trim(), color: b.color, key: b.key })) });
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(26,25,21,0.55)", display: "flex", alignItems: "flex-start", justifyContent: "center", zIndex: 200, overflowY: "auto", padding: "32px 16px" }}>
      <div style={{ ...S.card, width: 520, maxWidth: "92vw", marginBottom: 0 }}>
        <h2 style={S.h2}>{isEdit ? "Editar categoría" : "Nueva categoría"}</h2>
        <label style={S.label}>Nombre de la categoría</label>
        <input style={{ ...S.input, marginBottom: 18 }} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Grados (I, IV, V)" autoFocus />
        <label style={S.label}>Botones ({buttons.length}/8)</label>
        <div style={{ marginBottom: 12 }}>
          {buttons.map((b, i) => (
            <div key={i} style={{ background: C.paper2, border: `1px solid ${C.line}`, borderRadius: 10, padding: 10, marginBottom: 8 }}>
              <div style={{ ...S.row, gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                <input style={{ ...S.input, flex: "2 1 140px" }} placeholder="Nombre (ej: Tónica)" value={b.name} onChange={(e) => updateBtn(i, { name: e.target.value })} />
                <input style={{ ...S.input, width: 70, textAlign: "center", textTransform: "uppercase", flex: "0 0 70px" }} placeholder="ID" value={b.id} onChange={(e) => updateBtn(i, { id: e.target.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 3) })} maxLength={3} title="ID corto visible para el alumno (ej: T, I, IV)" />
                <input style={{ ...S.input, width: 50, textAlign: "center", textTransform: "uppercase", flex: "0 0 50px" }} placeholder="K" value={b.key.toUpperCase()} onChange={(e) => { const v = e.target.value.toLowerCase().replace(/[^a-z]/g, "").slice(-1); if (v) updateBtn(i, { key: v }); }} maxLength={1} title="Tecla del teclado" />
                <button onClick={() => removeBtn(i)} disabled={buttons.length <= 1} style={{ ...S.btnDanger, padding: "6px 10px", opacity: buttons.length <= 1 ? 0.3 : 1, cursor: buttons.length <= 1 ? "not-allowed" : "pointer" }} title="Eliminar botón">×</button>
              </div>
              <div style={{ ...S.row, gap: 6, flexWrap: "wrap" }}>
                {CATEGORY_COLORS.map((c) => <button key={c} onClick={() => updateBtn(i, { color: c })} style={{ width: 24, height: 24, borderRadius: 6, border: b.color === c ? `2px solid ${C.ink}` : "2px solid transparent", background: c, cursor: "pointer", padding: 0 }} title={c} />)}
              </div>
            </div>
          ))}
        </div>
        <button onClick={addBtn} disabled={buttons.length >= 8} style={{ ...S.btn, width: "100%", marginBottom: 16, opacity: buttons.length >= 8 ? 0.4 : 1, cursor: buttons.length >= 8 ? "not-allowed" : "pointer" }}>+ Añadir botón</button>
        {!canSave && <p style={{ fontSize: 11, color: "#B84A3A", margin: "0 0 10px" }}>Cada botón necesita un nombre, un ID único y una letra distinta del resto.</p>}
        <div style={{ ...S.row, gap: 10 }}>
          <button onClick={onClose} style={{ ...S.btn, flex: 1 }}>Cancelar</button>
          <button onClick={handleSave} disabled={!canSave} style={{ ...S.btnPrimary, flex: 1, opacity: canSave ? 1 : 0.45, cursor: canSave ? "pointer" : "not-allowed" }}>Guardar categoría</button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//   APP ROOT
// ═══════════════════════════════════════════════════════════════════════════
export default function App() {
  const [exercises, setExercises] = usePersistentState("fa_exercises", INIT_EXERCISES, {
    transformLoaded: (parsed) =>
      Array.isArray(parsed) && parsed.length
        ? parsed.map((e) => ({ ...e, audioUrl: null, model: e.model || DEFAULT_MODEL_ID }))
        : INIT_EXERCISES,
    transformSaved: (list) => list.map(({ audioUrl, ...rest }) => rest), // eslint-disable-line no-unused-vars
  });

  const [students, setStudents] = usePersistentState("fa_students", DEMO_STUDENTS, {
    transformLoaded: (parsed) => Array.isArray(parsed) ? parsed : DEMO_STUDENTS,
  });

  const [results, setResults] = usePersistentState("fa_results", {}, {
    transformLoaded: (parsed) => (parsed && typeof parsed === "object") ? parsed : {},
  });

  const [margin, setMargin] = usePersistentState("fa_margin", 1, {
    transformLoaded: (parsed) => { const n = Number(parsed); return Number.isNaN(n) ? 1 : n; },
  });

  const [categories, setCategories] = usePersistentState("fa_modes", [DEFAULT_CATEGORY], {
    transformLoaded: (parsed) => { const customs = Array.isArray(parsed) ? parsed.filter((m) => !m.builtIn && m.id !== "default") : []; return [DEFAULT_CATEGORY, ...customs]; },
    transformSaved: (list) => list.filter((m) => !m.builtIn),
  });

  const [courses, setCourses] = usePersistentState("fa_courses", INIT_COURSES, {
    transformLoaded: (parsed) => Array.isArray(parsed) ? parsed : INIT_COURSES,
  });

  const [units, setUnits] = usePersistentState("fa_units", INIT_UNITS, {
    transformLoaded: (parsed) => Array.isArray(parsed) ? parsed : INIT_UNITS,
  });

  // ── Course CRUD ──────────────────────────────────────────────────────
  const addCourse    = (c) => setCourses(prev => [...prev, c]);
  const updateCourse = (c) => setCourses(prev => prev.map(x => x.id === c.id ? c : x));
  const deleteCourse = (id) => setCourses(prev => prev.filter(c => c.id !== id));

  // ── Unit CRUD ────────────────────────────────────────────────────────
  const addUnit = (unit, courseId) => {
    setUnits(prev => [...prev, unit]);
    setCourses(prev => prev.map(c => c.id === courseId ? { ...c, unitIds: [...c.unitIds, unit.id] } : c));
  };
  const updateUnit = (unit) => setUnits(prev => prev.map(u => u.id === unit.id ? unit : u));
  const deleteUnit = (unitId, courseId) => {
    setUnits(prev => prev.filter(u => u.id !== unitId));
    setCourses(prev => prev.map(c => c.id === courseId ? { ...c, unitIds: c.unitIds.filter(id => id !== unitId) } : c));
  };
  const addExercisesToUnit = (unitId, exerciseIds) =>
    setUnits(prev => prev.map(u => u.id === unitId ? { ...u, exerciseIds: [...new Set([...u.exerciseIds, ...exerciseIds])] } : u));
  const removeExerciseFromUnit = (unitId, exerciseId) =>
    setUnits(prev => prev.map(u => u.id === unitId ? { ...u, exerciseIds: u.exerciseIds.filter(id => id !== exerciseId) } : u));


  const [user, setUser]         = useState(null);
  const [view, setView]         = useState("home");
  const [exCtx, setExCtx]       = useState(null);
  const [qmCtx, setQmCtx]       = useState(null);
  const [lastResult, setLastResult] = useState(null);

  const addCategory    = (c)  => setCategories((prev) => [...prev, c]);
  const updateCategory = (c)  => setCategories((prev) => prev.map((x) => (x.id === c.id ? c : x)));
  const deleteCategory = (id) => setCategories((prev) => prev.filter((x) => x.id !== id || x.builtIn));
  const logout         = ()   => { setUser(null); setView("home"); };

  const openEx = (exercise, mode = "student") => {
    setExCtx({ exercise, mode });
    if (mode === "student" && modelOf(exercise) === "cuestionario") {
      setView("questionnaire");
    } else {
      setView("exercise");
    }
  };

  const openQM = (exercise) => { setQmCtx({ exercise }); setView("question-manager"); };

  const submitAnswer = (data) => {
    const ex = exCtx.exercise;

    if (data.type === "cuestionario") {
      const result = { type: "cuestionario", answers: data.answers, score: data.score };
      setResults((prev) => ({ ...prev, [user.id]: { ...(prev[user.id] || {}), [ex.id]: result } }));
      setLastResult({ exercise: ex, result, margin });
      setView("correction");
      return;
    }

    const { entries, currentCategoryId } = data;
    if (exCtx.mode === "record") {
      setExercises((prev) => prev.map((e) => {
        if (e.id !== ex.id) return e;
        const seed = e.answers ? { ...e.answers } : (Array.isArray(e.answer) && e.answer.length ? { [(e.mode?.id) || DEFAULT_CATEGORY.id]: e.answer } : {});
        for (const { categoryId, intervals } of entries) seed[categoryId] = intervals;
        // eslint-disable-next-line no-unused-vars
        const { answer: _drop, ...rest } = e;
        return { ...rest, answers: seed };
      }));
      setView("teacher-dash");
    } else {
      const scored = entries.map(({ categoryId, intervals }) => {
        const teacherAns = answerFor(ex, categoryId);
        const score      = calcScore(teacherAns, intervals, ex.duration, margin);
        return { categoryId, intervals, score };
      });
      const primary = scored.find((s) => s.categoryId === currentCategoryId) || scored[0];
      const extras  = scored.filter((s) => s !== primary);
      const result  = { intervals: primary.intervals, score: primary.score, categoryId: primary.categoryId, extras };
      setResults((prev) => ({ ...prev, [user.id]: { ...(prev[user.id] || {}), [ex.id]: result } }));
      setLastResult({ exercise: ex, result, margin });
      setView("correction");
    }
  };

  const addExercise    = (newEx) => setExercises((prev) => [...prev, newEx]);
  const updateExercise = (id, patch) => setExercises((prev) => prev.map((e) => e.id === id ? { ...e, ...patch } : e));
  const deleteExercise = (id) => {
    setExercises((prev) => prev.filter((e) => e.id !== id));
    setResults((prev) => { const next = {}; for (const [uid, exs] of Object.entries(prev)) { const { [id]: _drop, ...rest } = exs; next[uid] = rest; } return next; }); // eslint-disable-line no-unused-vars
  };
  const addStudent    = (name) => { const clean = (name || "").trim(); if (!clean) return; setStudents((prev) => [...prev, { id: Date.now(), name: clean }]); };
  const removeStudent = (id)   => { setStudents((prev) => prev.filter((s) => s.id !== id)); setResults((prev) => { const { [id]: _drop, ...rest } = prev; return rest; }); }; // eslint-disable-line no-unused-vars
  const freshExercise = useCallback((ex) => exercises.find((e) => e.id === ex.id) || ex, [exercises]);

  if (view === "home")
    return <HomeView onStudent={() => setView("student-list")} onTeacher={() => { setUser({ id: 100, name: "Prof. Martínez", role: "teacher" }); setView("teacher-dash"); }} />;

  if (view === "student-list")
    return <StudentList students={students} onSelect={(s) => { setUser({ ...s, role: "student" }); setView("student-dash"); }} onBack={() => setView("home")} />;

  if (view === "student-dash")
    return <StudentDash user={user} exercises={exercises} results={results[user?.id] || {}} courses={courses} units={units} onExercise={(ex) => openEx(ex, "student")} onLogout={logout} />;

  if (view === "teacher-dash")
    return <TeacherDash
      exercises={exercises} onUpdateExercise={updateExercise} onDeleteExercise={deleteExercise}
      students={students} onAddStudent={addStudent} onRemoveStudent={removeStudent}
      results={results} margin={margin} onMargin={setMargin}
      onRecord={(ex) => { if (modelOf(ex) === "cuestionario") openQM(ex); else openEx(ex, "record"); }}
      onAdd={addExercise} onLogout={logout}
      categories={categories} onAddCategory={addCategory} onUpdateCategory={updateCategory} onDeleteCategory={deleteCategory}
      courses={courses} units={units}
      onAddCourse={addCourse} onUpdateCourse={updateCourse} onDeleteCourse={deleteCourse}
      onAddUnit={addUnit} onUpdateUnit={updateUnit} onDeleteUnit={deleteUnit}
      onAddExercisesToUnit={addExercisesToUnit} onRemoveExerciseFromUnit={removeExerciseFromUnit}
    />;

  if (view === "exercise" && exCtx)
    return <ExerciseView exercise={freshExercise(exCtx.exercise)} mode={exCtx.mode} onSubmit={submitAnswer} onBack={() => setView(user?.role === "teacher" ? "teacher-dash" : "student-dash")} />;

  if (view === "questionnaire" && exCtx)
    return <QuestionnaireView exercise={freshExercise(exCtx.exercise)} onSubmit={submitAnswer} onBack={() => setView("student-dash")} />;

  if (view === "question-manager" && qmCtx)
    return <QuestionManagerView
      exercise={freshExercise(qmCtx.exercise)}
      onSave={(questions) => { updateExercise(qmCtx.exercise.id, { questions }); setView("teacher-dash"); }}
      onBack={() => setView("teacher-dash")}
    />;

  if (view === "correction" && lastResult)
    return <CorrectionView {...lastResult} onBack={() => setView("student-dash")} />;

  return null;
}
