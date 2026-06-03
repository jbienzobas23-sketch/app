import { useState, useEffect, useRef, useMemo } from "react";

/* ═══════════════════════════════════════════════════════════════════════════
   FUNCIONES ARMÓNICAS · APP ROOT
   ───────────────────────────────────────────────────────────────────────────
   Funciones puras, constantes de dominio, tokens y datos semilla viven ahora en
   módulos bajo src/lib, src/theme y src/seed.js (extraídos en la Fase 0). Este
   archivo conserva los componentes React y el estado global de App().
   ═══════════════════════════════════════════════════════════════════════════ */

import { TEACHER_TAB_PATH, useHashRoute } from "./lib/routing.js";
import { C, F, S, FONT_SANS, FONT_MONO, SECTION_STYLE } from "./theme/tokens.js";
import { DEFAULT_CATEGORY, INIT_EXERCISES, INIT_AUDIO_LIBRARY } from "./seed.js";
import { DEFAULT_MODEL_ID, MODEL_COMBOS, comboIdFromModels, categoriesOf, modelOf, modelsOf, answerFor, answerStats, questionsOf, audioComposers, audioTags } from "./lib/domain.js";
import { SCHEMA_LEVELS } from "./lib/schema.js";
import { SCHEMA_PALETTES, SCHEMA_PALETTE_DEFAULT, getSchemaPalette, effectivePaletteId, applyPaletteToExercise, schemaBlockColor } from "./lib/palette.js";
import { textOn } from "./lib/color.js";
import { calcScore, calcSchemaPlacementScore } from "./lib/scoring.js";
import { fmt } from "./lib/ids.js";
import { buildWaveformFromPCM, fetchAudioBuffer } from "./lib/audio.js";

import { startPointerDrag } from "./lib/pointer.js";



// ═══ 5. PRIMITIVOS UI COMPARTIDOS ═══════════════════════════════════════════

import { useInjectFonts } from "./theme/fonts.js";
import { useIsMobile } from "./hooks/useIsMobile.js";
import { ConfirmModal, TabBar, ScoreBadge, CircleButton, Chevron, StatusCircle, ProgressRing, CategoryDots, AudioWaveIcon, EyeButton, EditIconButton, DeleteIconButton, RemoveIconButton, FilterDropdown, TeacherFilterBar, StudentFilterBar, Overline, GhostButton, CtaButton, MetaItem } from "./components/primitives.jsx";

// ═══ 6. VISTAS DE AUTENTICACIÓN ═════════════════════════════════════════════

import { SetupView, LoginView, HomeView, ForgotPinView, ResetPinView, TeacherPickerView } from "./components/auth.jsx";

// ═══ 7. VISTAS DE ALUMNO ════════════════════════════════════════════════════

import { MODEL_META, modelMeta } from "./lib/modelMeta.js";

import { ModelToggleBar, ExerciseRow } from "./components/student.jsx";

// Dashboard del alumno — cabecera editorial + pestañas + riel de cursos
function StudentDash({ user, exercises, results, courses, units, groups = [], onExercise, onViewCorrection, onLogout, onChangeTeacher, onUpdatePalette, tab = "all", onTab }) {
  const isMobile = useIsMobile();
  const view    = tab;             // controlado por la URL
  const setView = onTab || (() => {});
  const [filterModel,   setFilterModel]   = useState("all");
  const [filterDone,    setFilterDone]    = useState("all");

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

        {/* ── Por cursos (rediseño en páginas) ── */}
        {view === "courses" && (
          <CoursesPages
            role="student"
            courses={teacherCourses}
            units={units}
            exercises={exercises}
            groups={groups}
            results={results}
            onExercise={onExercise}
            onViewCorrection={onViewCorrection}
          />
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
import { useAudioPlayer } from "./hooks/useAudioPlayer.js";


import { FragmentRangeSelector, WaveformDisplay } from "./components/session.jsx";
import { ExerciseView } from "./components/ExerciseView.jsx";

import { SchemaExerciseView } from "./components/SchemaExerciseView.jsx";
import { CorrectionView } from "./components/CorrectionView.jsx";
import { QuestionnaireView } from "./components/QuestionnaireView.jsx";

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
            <EditIconButton onClick={() => onSelect(ex.id)} title={`Editar "${ex.title}"`} />
          </div>
        </div>
        <div className={`fa-expand${open ? " fa-open" : ""}`}>
          <div className="fa-expand-inner">
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
                <DeleteIconButton onClick={() => onDelete(ex)} title={`Eliminar "${ex.title}"`} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ExercisesTab({ exercises, audioLibrary = [], onNew, onSelect, onToggleVisibility, askConfirm, onDelete }) {
  const [filterModel,     setFilterModel]     = useState("all");
  const [filterComposers, setFilterComposers] = useState([]);
  const [filterTags,      setFilterTags]      = useState([]);

  // Derivar compositores y etiquetas únicas de la biblioteca de audios
  const allComposers = useMemo(() => audioComposers(audioLibrary), [audioLibrary]);
  const allTags      = useMemo(() => audioTags(audioLibrary),      [audioLibrary]);
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

  // La barra de filtros se muestra siempre que haya ejercicios.
  const showFilterBar = exercises.length > 0;

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
// ═══ Vista de Cursos — rediseño en dos páginas ══════════════════════════════
// Lista (rejilla de tarjetas) → detalle (unidades en vertical + ejercicios de
// la unidad seleccionada), con desplegable para cambiar de curso sin salir.
// En móvil se convierte en un flujo de 3 niveles (Cursos → Unidades → Ejercicios).
// Un único componente `CoursesPages` sirve a profesor y alumno (prop `role`):
//   · profesor → edición completa, progreso = "claves listas".
//   · alumno   → sin edición, progreso = ejercicios completados.

// — Helpers de forma/progreso, conscientes del rol —
function courseUnitList(course, units, role) {
  const ordered = (course?.unitIds || []).map((id) => units.find((u) => u.id === id)).filter(Boolean);
  return role === "student" ? ordered.filter((u) => !u.hidden) : ordered;
}
function unitExList(unit, exercises, role) {
  const ordered = (unit?.exerciseIds || []).map((id) => exercises.find((e) => e.id === id)).filter(Boolean);
  return role === "student" ? ordered.filter((e) => !e.hidden) : ordered;
}
// ¿La clave del ejercicio está lista? (misma lógica que el acordeón anterior)
function exKeyReady(ex) {
  const isQuiz = modelOf(ex) === "cuestionario";
  const exQs   = questionsOf(ex);
  const { recorded, total } = isQuiz ? { recorded: 0, total: 0 } : answerStats(ex);
  return isQuiz ? exQs.length > 0 : (recorded === total && total > 0);
}
// Progreso de una unidad → { num, total }. Profesor: claves listas. Alumno: hechos.
function unitProgress(unit, exercises, role, results) {
  const exs = unitExList(unit, exercises, role);
  const num = role === "student"
    ? exs.filter((e) => results?.[e.id] != null).length
    : exs.filter(exKeyReady).length;
  return { num, total: exs.length };
}
// Progreso agregado de un curso → { num, total, units }.
function courseProgress(course, units, exercises, role, results) {
  const cu = courseUnitList(course, units, role);
  let num = 0, total = 0;
  cu.forEach((u) => { const s = unitProgress(u, exercises, role, results); num += s.num; total += s.total; });
  return { num, total, units: cu.length };
}

// — Iconos de línea (mismo lenguaje gráfico que la app) —
function ArrowRightIcon({ size = 14, color = "currentColor" }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block", flexShrink: 0 }}><path d="M3 8h9M8.5 4l4 4-4 4" /></svg>;
}
function ChevronLeftIcon({ size = 14, color = "currentColor" }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block", flexShrink: 0 }}><path d="M10 3L5 8l5 5" /></svg>;
}
function ChevronRightIcon({ size = 15, color = C.chevron }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block", flexShrink: 0 }}><path d="M6 3l5 5-5 5" /></svg>;
}

// — Insignia de visibilidad del curso (solo profesor) —
function CourseVisBadge({ course, groups = [] }) {
  const vis = course.visibility || "teacher";
  if (vis === "public") return <span style={{ ...S.badge, background: "rgba(63,155,91,0.12)", color: C.fnT, fontSize: 10 }}>Público</span>;
  if (vis === "group") {
    const g = groups.find((x) => x.id === course.visibilityGroupId);
    return <span style={{ ...S.badge, background: "rgba(47,111,184,0.10)", color: C.quiz, fontSize: 10 }}>{g ? g.name : "Grupo"}</span>;
  }
  return <span style={{ ...S.badge, background: C.line, color: C.muted, fontSize: 10 }}>Mis alumnos</span>;
}

// — Botón "añadir" de borde punteado, ancho completo —
function DashedAddButton({ children, onClick }) {
  return (
    <button onClick={onClick} style={{ width: "100%", boxSizing: "border-box", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, background: "transparent", border: `1.5px dashed ${C.rail}`, color: "#555", borderRadius: 10, padding: "12px", fontFamily: F.sans, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>{children}</button>
  );
}

// — Barra de progreso fina (curso / unidad) —
function CourseProgressBar({ num, total, width = 120, accent = C.ink }) {
  const pct  = total ? (num / total) * 100 : 0;
  const done = total > 0 && num === total;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <span style={{ width, height: 6, borderRadius: 3, background: C.line, overflow: "hidden", display: "inline-block" }}>
        <span style={{ display: "block", width: `${pct}%`, height: "100%", background: done ? C.fnT : accent, borderRadius: 3, transition: "width .3s" }} />
      </span>
      <span style={{ fontFamily: F.sans, fontSize: 11.5, fontWeight: 600, color: C.muted, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{num}/{total}</span>
    </span>
  );
}

// ── Página 1 · Tarjeta de curso (rejilla) ────────────────────────────────────
function CourseCard({ course, units, exercises, role, results, groups, onOpen }) {
  const [hover, setHover] = useState(false);
  const cs   = courseProgress(course, units, exercises, role, results);
  const pct  = cs.total ? (cs.num / cs.total) * 100 : 0;
  const done = cs.total > 0 && cs.num === cs.total;
  return (
    <button onClick={onOpen} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ font: "inherit", textAlign: "left", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 14, background: C.paper, border: `1px solid ${C.line}`, borderRadius: 14, padding: "20px 20px 18px", cursor: "pointer", boxShadow: hover ? "0 10px 30px rgba(0,0,0,0.08)" : "none", transform: hover ? "translateY(-2px)" : "none", transition: "box-shadow .18s, transform .18s" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <h3 style={{ fontFamily: F.serif, fontSize: 24, fontWeight: 600, color: C.ink, margin: "0 0 6px", lineHeight: 1.08, letterSpacing: "-0.01em", wordBreak: "break-word" }}>{course.name}</h3>
          {role === "teacher"
            ? <CourseVisBadge course={course} groups={groups} />
            : (course.description ? <span style={{ fontFamily: F.sans, fontSize: 12.5, color: "#888" }}>{course.description}</span> : null)}
        </div>
        <span style={{ display: "flex", alignItems: "center", gap: 5, color: hover ? C.ink : C.muted, fontFamily: F.sans, fontSize: 12.5, fontWeight: 600, flexShrink: 0, transition: "color .15s" }}>Abrir <ArrowRightIcon color={hover ? C.ink : C.muted} /></span>
      </div>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
          <span style={{ flex: 1, height: 5, borderRadius: 3, background: C.line, overflow: "hidden" }}><span style={{ display: "block", width: `${pct}%`, height: "100%", background: done ? C.fnT : C.ink }} /></span>
          <span style={{ fontFamily: F.sans, fontSize: 11.5, fontWeight: 600, color: C.muted, fontVariantNumeric: "tabular-nums" }}>{cs.num}/{cs.total}</span>
        </div>
        <div style={{ fontFamily: F.sans, fontSize: 12.5, color: C.muted }}>
          {cs.units} {cs.units === 1 ? "unidad" : "unidades"} · {cs.total} {cs.total === 1 ? "ejercicio" : "ejercicios"}{role === "student" ? ` · ${cs.num} completados` : ` · ${cs.num} con clave`}
        </div>
      </div>
    </button>
  );
}

function CoursesLanding({ role, courses, units, exercises, results, groups, onOpen, onCreateCourse }) {
  return (
    <div style={{ fontFamily: F.sans }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, paddingBottom: 16, marginBottom: 20, borderBottom: `2px solid ${C.ink}` }}>
        <div>
          <Overline>{role === "student" ? "Mis cursos" : "Gestión"}</Overline>
          <h2 style={{ fontFamily: F.serif, fontSize: 34, fontWeight: 600, color: C.ink, margin: 0, lineHeight: 1, letterSpacing: "-0.01em" }}>Cursos</h2>
        </div>
        {role === "teacher" && <CtaButton onClick={onCreateCourse}>+ Nuevo curso</CtaButton>}
      </div>
      {courses.length === 0
        ? <p style={{ color: C.muted, fontFamily: F.sans, textAlign: "center", padding: "3rem 1rem" }}>{role === "student" ? "El profesor aún no ha creado ningún curso." : "Aún no hay cursos. Crea el primero para organizar tus ejercicios."}</p>
        : <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
            {courses.map((c) => <CourseCard key={c.id} course={c} units={units} exercises={exercises} role={role} results={results} groups={groups} onOpen={() => onOpen(c.id)} />)}
          </div>}
    </div>
  );
}

// — Desplegable para cambiar de curso sin salir del detalle —
function CourseDropdown({ courses, currentId, role, units, exercises, results, onSwitch }) {
  const [open, setOpen] = useState(false);
  const course = courses.find((c) => c.id === currentId);
  if (!course) return null;
  return (
    <div style={{ position: "relative", minWidth: 0 }}>
      <button onClick={() => setOpen((o) => !o)}
        style={{ font: "inherit", display: "flex", alignItems: "center", gap: 10, maxWidth: "100%", background: open ? C.field : "transparent", border: `1px solid ${open ? C.rail : "transparent"}`, borderRadius: 10, padding: "6px 12px 6px 10px", cursor: "pointer" }}>
        <h3 style={{ fontFamily: F.serif, fontSize: 30, fontWeight: 600, color: C.ink, margin: 0, lineHeight: 1.05, letterSpacing: "-0.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{course.name}</h3>
        <span style={{ marginTop: 4, flexShrink: 0 }}><Chevron open={open} size={16} /></span>
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 30 }} />
          <div style={{ position: "absolute", top: "100%", left: 0, marginTop: 6, zIndex: 31, background: C.paper, border: `1px solid ${C.line}`, borderRadius: 12, boxShadow: "0 14px 40px rgba(0,0,0,0.16)", padding: 6, minWidth: 300, maxWidth: 380, maxHeight: 420, overflowY: "auto", boxSizing: "border-box" }}>
            <div style={{ fontFamily: F.sans, fontSize: 10, fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase", color: C.muted, padding: "6px 10px 7px" }}>Cambiar de curso</div>
            {courses.map((c) => {
              const cs  = courseProgress(c, units, exercises, role, results);
              const cur = c.id === currentId;
              return (
                <button key={c.id} onClick={() => { onSwitch(c.id); setOpen(false); }}
                  style={{ font: "inherit", width: "100%", boxSizing: "border-box", textAlign: "left", display: "flex", alignItems: "center", gap: 11, padding: "9px 10px", borderRadius: 9, border: "none", cursor: "pointer", background: cur ? C.field : "transparent" }}>
                  <ProgressRing ready={cs.num} total={cs.total} size={32} stroke={3} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontFamily: F.serif, fontSize: 16.5, fontWeight: 600, color: C.ink, lineHeight: 1.1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
                    <span style={{ display: "block", fontFamily: F.sans, fontSize: 11, color: C.muted, marginTop: 1 }}>{cs.units} {cs.units === 1 ? "unidad" : "unidades"} · {cs.num}/{cs.total} {role === "student" ? "hechos" : "listas"}</span>
                  </span>
                  {cur && <svg width="14" height="12" viewBox="0 0 7 6" fill="none" style={{ flexShrink: 0 }}><path d="M1 2.8L3 4.8L6 1" stroke={C.fnT} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// — Tarjeta de ejercicio (profesor, "versión B") —
function TeacherExCard({ ex, isMobile, unitId, onSelectExercise, onRemoveExFromUnit, askConfirm }) {
  const [hover, setHover] = useState(false);
  const meta     = modelMeta(ex);
  const keyReady = exKeyReady(ex);
  const show     = hover || isMobile;
  return (
    <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ position: "relative", boxSizing: "border-box", background: C.paper, border: `1px solid ${C.line}`, borderTop: `3px solid ${meta.color}`, borderRadius: 10, padding: "13px 13px 12px", boxShadow: hover ? "0 6px 18px rgba(0,0,0,0.07)" : "none", transition: "box-shadow .15s" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 9 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, background: `${meta.color}14`, color: meta.color, borderRadius: 999, padding: "3px 9px", fontFamily: F.sans, fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: meta.color }} />{meta.label}
        </span>
        <StatusCircle done={keyReady} size={16} />
      </div>
      <div onClick={() => onSelectExercise(ex.id)} style={{ fontFamily: F.sans, fontSize: 14, fontWeight: 600, color: C.ink, lineHeight: 1.25, minHeight: 36, cursor: "pointer" }}>{ex.title}</div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 11 }}>
        <span style={{ fontFamily: F.sans, fontSize: 11.5, fontWeight: 600, color: keyReady ? C.fnT : C.muted }}>{keyReady ? "Clave lista" : "Sin clave"}</span>
        <div style={{ display: "flex", gap: 6, opacity: show ? 1 : 0, pointerEvents: show ? "auto" : "none", transition: "opacity .12s" }}>
          <EditIconButton onClick={() => onSelectExercise(ex.id)} title={`Editar "${ex.title}"`} />
          <RemoveIconButton onClick={() => askConfirm(`¿Quitar "${ex.title}" de esta unidad?\n\nEl ejercicio permanecerá en el banco global.`, () => onRemoveExFromUnit(unitId, ex.id))} title={`Quitar "${ex.title}" de la unidad`} />
        </div>
      </div>
    </div>
  );
}

function EmptyExercises({ role }) {
  return (
    <div style={{ padding: "44px 20px", textAlign: "center", border: `1px dashed ${C.rail}`, borderRadius: 12 }}>
      <div style={{ fontFamily: F.serif, fontSize: 18, color: C.ink2 }}>{role === "student" ? "Aún no hay ejercicios" : "Unidad sin ejercicios"}</div>
      <div style={{ fontFamily: F.sans, fontSize: 12.5, color: C.muted, marginTop: 3 }}>{role === "student" ? "Tu profesor los publicará pronto." : "Añade uno desde el banco o crea uno nuevo."}</div>
    </div>
  );
}

// — Panel de ejercicios de la unidad seleccionada (profesor: tarjetas; alumno: filas) —
function CourseExercisesPanel({
  unit, course, exercises, role, results, isMobile,
  onExercise, onViewCorrection,
  onPickFromBank, onCreateNewExInUnit, onRemoveExFromUnit, onSelectExercise,
  onEditUnit, onUpdateUnit, onDeleteUnit, onAfterDeleteUnit, askConfirm,
}) {
  if (!unit) {
    return <div style={{ padding: "56px 20px", textAlign: "center", fontFamily: F.serif, fontSize: 19, color: C.ink2 }}>Selecciona una unidad</div>;
  }
  const exs = unitExList(unit, exercises, role);

  if (role === "teacher") {
    return (
      <>
        <div style={{ padding: "16px 18px 14px", borderBottom: `1px solid ${C.line}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ minWidth: 0, flex: "1 1 180px" }}>
            <h4 style={{ fontFamily: F.serif, fontSize: 23, fontWeight: 600, color: C.ink, margin: "0 0 3px", letterSpacing: "-0.01em", display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{unit.name}</span>
              {unit.hidden && <span style={{ ...S.badge, background: C.line, color: C.muted, fontSize: 10 }}>Oculta</span>}
            </h4>
            <span style={{ fontFamily: F.sans, fontSize: 12.5, color: C.muted }}>{exs.length} {exs.length === 1 ? "ejercicio" : "ejercicios"}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, flexWrap: "wrap" }}>
            <EyeButton visible={!unit.hidden} onClick={() => onUpdateUnit({ ...unit, hidden: !unit.hidden })} />
            <EditIconButton onClick={() => onEditUnit(unit)} title={`Editar unidad "${unit.name}"`} />
            <DeleteIconButton onClick={() => askConfirm(`¿Eliminar la unidad "${unit.name}"?\n\nLos ejercicios no se eliminarán del banco global.`, () => { onDeleteUnit(unit.id, course.id); onAfterDeleteUnit && onAfterDeleteUnit(); })} title={`Eliminar unidad "${unit.name}"`} />
            <span style={{ width: 1, height: 22, background: C.line, margin: "0 2px" }} />
            <GhostButton onClick={() => onPickFromBank(unit.id)}>+ Del banco</GhostButton>
            <CtaButton onClick={() => onCreateNewExInUnit(unit.id)}>+ Nuevo</CtaButton>
          </div>
        </div>
        <div style={{ padding: 16 }}>
          {exs.length
            ? <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 12 }}>
                {exs.map((ex) => <TeacherExCard key={ex.id} ex={ex} isMobile={isMobile} unitId={unit.id} onSelectExercise={onSelectExercise} onRemoveExFromUnit={onRemoveExFromUnit} askConfirm={askConfirm} />)}
              </div>
            : <EmptyExercises role={role} />}
        </div>
      </>
    );
  }

  // alumno
  const s = unitProgress(unit, exercises, role, results);
  return (
    <>
      <div style={{ padding: "18px 22px 14px", borderBottom: `1px solid ${C.line}`, display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 14 }}>
        <h4 style={{ fontFamily: F.serif, fontSize: 23, fontWeight: 600, color: C.ink, margin: 0, letterSpacing: "-0.01em", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{unit.name}</h4>
        <span style={{ fontFamily: F.sans, fontSize: 12.5, color: C.muted, whiteSpace: "nowrap", flexShrink: 0 }}>{s.num}/{s.total} completados</span>
      </div>
      <div style={{ padding: "14px 18px" }}>
        {exs.length
          ? <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>{exs.map((ex) => <ExerciseRow key={ex.id} ex={ex} result={results[ex.id]} onOpen={onExercise} onViewCorrection={onViewCorrection} />)}</div>
          : <EmptyExercises role={role} />}
      </div>
    </>
  );
}

// — Panel izquierdo: lista vertical de unidades con anillo de progreso —
function UnitsList({ course, units, exercises, role, results, selUnitId, onSelectUnit, onCreateUnit }) {
  const cu = courseUnitList(course, units, role);
  return (
    <div>
      <div style={{ fontFamily: F.sans, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase", color: C.muted, padding: "2px 4px 10px" }}>Unidades didácticas</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {cu.length === 0
          ? <p style={{ fontFamily: F.sans, fontSize: 13, color: C.muted, margin: "2px 4px 8px" }}>Este curso no tiene unidades todavía.</p>
          : cu.map((u, i) => {
              const s  = unitProgress(u, exercises, role, results);
              const on = u.id === selUnitId;
              return (
                <button key={u.id} onClick={() => onSelectUnit(u.id)}
                  style={{ font: "inherit", boxSizing: "border-box", width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 11, border: `1px solid ${on ? C.rail : "transparent"}`, cursor: "pointer", background: on ? C.paper : "transparent", boxShadow: on ? "0 2px 10px rgba(0,0,0,0.05)" : "none" }}>
                  <ProgressRing ready={s.num} total={s.total} size={40} stroke={4} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontFamily: F.serif, fontSize: 10.5, fontWeight: 700, color: C.muted, letterSpacing: "0.04em" }}>UNIDAD {i + 1}{u.hidden ? " · oculta" : ""}</span>
                    <span style={{ display: "block", fontFamily: F.serif, fontSize: 17, fontWeight: 600, color: on ? C.ink : C.ink2, lineHeight: 1.12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.name}</span>
                  </span>
                  {on && <ArrowRightIcon size={13} color={C.muted} />}
                </button>
              );
            })}
        {role === "teacher" && <div style={{ marginTop: 4 }}><DashedAddButton onClick={() => onCreateUnit(course.id)}>+ Nueva unidad</DashedAddButton></div>}
      </div>
    </div>
  );
}

// ── Página 2 · Detalle del curso (escritorio): barra + dos paneles ───────────
function CourseDetail({
  role, courses, courseId, units, exercises, results, groups,
  selUnitId, setSelUnitId, onBack, onSwitch,
  onUpdateCourse, onEditCourse, onDeleteCourse,
  onCreateUnit, onEditUnit, onDeleteUnit, onUpdateUnit,
  onPickFromBank, onCreateNewExInUnit, onRemoveExFromUnit, onSelectExercise,
  onExercise, onViewCorrection, askConfirm,
}) {
  const course = courses.find((c) => c.id === courseId);
  if (!course) return null;
  const cu   = courseUnitList(course, units, role);
  const unit = cu.find((u) => u.id === selUnitId) || cu[0] || null;
  const cs   = courseProgress(course, units, exercises, role, results);

  return (
    <div style={{ fontFamily: F.sans }}>
      {/* Barra superior: volver + desplegable + acciones */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, paddingBottom: 14, marginBottom: course.description ? 12 : 18, borderBottom: `2px solid ${C.ink}` }}>
        <button onClick={onBack} style={{ font: "inherit", display: "inline-flex", alignItems: "center", gap: 6, background: "transparent", border: `1px solid ${C.line}`, color: "#555", borderRadius: 8, padding: "8px 13px", fontFamily: F.sans, fontSize: 12.5, fontWeight: 600, cursor: "pointer", flexShrink: 0 }}>
          <ChevronLeftIcon /> Cursos
        </button>
        <CourseDropdown courses={courses} currentId={courseId} role={role} units={units} exercises={exercises} results={results} onSwitch={onSwitch} />
        {role === "teacher" && <CourseVisBadge course={course} groups={groups} />}
        <span style={{ flex: 1 }} />
        {role === "teacher"
          ? <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
              <EyeButton visible={!course.hidden} onClick={() => onUpdateCourse({ ...course, hidden: !course.hidden })} />
              <EditIconButton onClick={() => onEditCourse(course)} title={`Editar curso "${course.name}"`} />
              <DeleteIconButton onClick={() => askConfirm(`¿Eliminar el curso "${course.name}"?\n\nLas unidades y ejercicios no se eliminarán.`, () => { onDeleteCourse(course.id); onBack(); })} title={`Eliminar curso "${course.name}"`} />
            </div>
          : <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
              <CourseProgressBar num={cs.num} total={cs.total} width={110} accent={C.fnT} />
              <span style={{ fontFamily: F.sans, fontSize: 12.5, color: C.muted, whiteSpace: "nowrap" }}>completados</span>
            </div>}
      </div>
      {course.description && <div style={{ fontFamily: F.sans, fontSize: 13, color: "#888", margin: "-4px 0 18px" }}>{course.description}</div>}

      {/* Dos paneles: unidades (vertical) + ejercicios */}
      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 22, alignItems: "start" }}>
        <UnitsList course={course} units={units} exercises={exercises} role={role} results={results} selUnitId={unit?.id ?? null} onSelectUnit={setSelUnitId} onCreateUnit={onCreateUnit} />
        <div style={{ minWidth: 0, border: `1px solid ${C.line}`, borderRadius: 14, background: C.paper, overflow: "hidden" }}>
          <CourseExercisesPanel
            unit={unit} course={course} exercises={exercises} role={role} results={results} isMobile={false}
            onExercise={onExercise} onViewCorrection={onViewCorrection}
            onPickFromBank={onPickFromBank} onCreateNewExInUnit={onCreateNewExInUnit} onRemoveExFromUnit={onRemoveExFromUnit} onSelectExercise={onSelectExercise}
            onEditUnit={onEditUnit} onUpdateUnit={onUpdateUnit} onDeleteUnit={onDeleteUnit} onAfterDeleteUnit={() => setSelUnitId(null)} askConfirm={askConfirm} />
        </div>
      </div>
    </div>
  );
}

// ── Móvil: flujo de 3 niveles (push) ─────────────────────────────────────────
function MobileTopBar({ title, onBack }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, paddingBottom: 12, marginBottom: 14, borderBottom: `1px solid ${C.line}` }}>
      {onBack && <button onClick={onBack} style={{ width: 34, height: 34, borderRadius: 8, border: `1px solid ${C.line}`, background: C.paper, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, color: C.ink }}><ChevronLeftIcon /></button>}
      <span style={{ flex: 1, minWidth: 0, fontFamily: F.sans, fontSize: 13, fontWeight: 600, color: "#555", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</span>
    </div>
  );
}

function MobileCoursesScreen({ role, courses, units, exercises, results, groups, onOpenCourse, onCreateCourse }) {
  return (
    <div style={{ fontFamily: F.sans }}>
      <div style={{ paddingBottom: 14, marginBottom: 14, borderBottom: `2px solid ${C.ink}` }}>
        <Overline>{role === "student" ? "Mis cursos" : "Gestión"}</Overline>
        <h2 style={{ fontFamily: F.serif, fontSize: 26, fontWeight: 600, color: C.ink, margin: 0, lineHeight: 1.02, letterSpacing: "-0.01em" }}>Cursos</h2>
      </div>
      {courses.length === 0
        ? <p style={{ color: C.muted, fontFamily: F.sans, textAlign: "center", padding: "2.5rem 1rem" }}>{role === "student" ? "El profesor aún no ha creado ningún curso." : "Aún no hay cursos. Crea el primero."}</p>
        : <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            {courses.map((c) => {
              const cs = courseProgress(c, units, exercises, role, results);
              return (
                <button key={c.id} onClick={() => onOpenCourse(c.id)}
                  style={{ font: "inherit", boxSizing: "border-box", width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 13, padding: "14px 14px", borderRadius: 13, border: `1px solid ${C.line}`, background: C.paper, cursor: "pointer" }}>
                  <ProgressRing ready={cs.num} total={cs.total} size={44} stroke={4} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontFamily: F.serif, fontSize: 19, fontWeight: 600, color: C.ink, lineHeight: 1.08, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
                    <span style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 5, flexWrap: "wrap" }}>
                      {role === "teacher" && <CourseVisBadge course={c} groups={groups} />}
                      <span style={{ fontFamily: F.sans, fontSize: 11.5, color: C.muted }}>{cs.units} ud · {cs.num}/{cs.total} {role === "student" ? "hechos" : "listas"}</span>
                    </span>
                  </span>
                  <ChevronRightIcon />
                </button>
              );
            })}
            {role === "teacher" && <DashedAddButton onClick={onCreateCourse}>+ Nuevo curso</DashedAddButton>}
          </div>}
    </div>
  );
}

function MobileUnitsScreen({
  role, course, units, exercises, results, groups,
  onBack, onOpenUnit, onCreateUnit,
  onUpdateCourse, onEditCourse, onDeleteCourse, onAfterDeleteCourse, askConfirm,
}) {
  const cu = courseUnitList(course, units, role);
  const cs = courseProgress(course, units, exercises, role, results);
  return (
    <div style={{ fontFamily: F.sans }}>
      <MobileTopBar title="Cursos" onBack={onBack} />
      <div style={{ paddingBottom: 14, marginBottom: 14, borderBottom: `1px solid ${C.line}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
          <h3 style={{ fontFamily: F.serif, fontSize: 24, fontWeight: 600, color: C.ink, margin: 0, lineHeight: 1.06, letterSpacing: "-0.01em" }}>{course.name}</h3>
          {role === "teacher" && <CourseVisBadge course={course} groups={groups} />}
        </div>
        <CourseProgressBar num={cs.num} total={cs.total} width={150} accent={role === "student" ? C.fnT : C.ink} />
        {role === "teacher" && (
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <EyeButton visible={!course.hidden} onClick={() => onUpdateCourse({ ...course, hidden: !course.hidden })} />
            <EditIconButton onClick={() => onEditCourse(course)} title={`Editar curso "${course.name}"`} />
            <DeleteIconButton onClick={() => askConfirm(`¿Eliminar el curso "${course.name}"?\n\nLas unidades y ejercicios no se eliminarán.`, () => { onDeleteCourse(course.id); onAfterDeleteCourse && onAfterDeleteCourse(); })} title={`Eliminar curso "${course.name}"`} />
          </div>
        )}
      </div>
      <div style={{ fontFamily: F.sans, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase", color: C.muted, padding: "2px 2px 10px" }}>Unidades didácticas</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
        {cu.length === 0
          ? <p style={{ fontFamily: F.sans, fontSize: 13, color: C.muted, margin: "2px 2px 8px" }}>Este curso no tiene unidades todavía.</p>
          : cu.map((u, i) => {
              const s = unitProgress(u, exercises, role, results);
              return (
                <button key={u.id} onClick={() => onOpenUnit(u.id)}
                  style={{ font: "inherit", boxSizing: "border-box", width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 12, padding: "13px 14px", borderRadius: 12, border: `1px solid ${C.line}`, background: C.paper, cursor: "pointer" }}>
                  <ProgressRing ready={s.num} total={s.total} size={40} stroke={4} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontFamily: F.serif, fontSize: 11, fontWeight: 700, color: C.muted }}>UNIDAD {i + 1}{u.hidden ? " · oculta" : ""}</span>
                    <span style={{ display: "block", fontFamily: F.serif, fontSize: 18, fontWeight: 600, color: C.ink, lineHeight: 1.1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.name}</span>
                    <span style={{ display: "block", fontFamily: F.sans, fontSize: 11.5, color: C.muted, marginTop: 2 }}>{s.total} {s.total === 1 ? "ejercicio" : "ejercicios"}</span>
                  </span>
                  <ChevronRightIcon />
                </button>
              );
            })}
        {role === "teacher" && <DashedAddButton onClick={() => onCreateUnit(course.id)}>+ Nueva unidad</DashedAddButton>}
      </div>
    </div>
  );
}

function MobileExercisesScreen({ role, course, unit, exercises, results, onBack, panelProps }) {
  return (
    <div style={{ fontFamily: F.sans }}>
      <MobileTopBar title={course.name} onBack={onBack} />
      <div style={{ border: `1px solid ${C.line}`, borderRadius: 14, background: C.paper, overflow: "hidden" }}>
        <CourseExercisesPanel unit={unit} course={course} exercises={exercises} role={role} results={results} isMobile {...panelProps} />
      </div>
    </div>
  );
}

function MobileCoursesFlow(props) {
  const { role, courses, units, exercises, results, groups } = props;
  const [nav, setNav] = useState({ level: "courses", courseId: null, unitId: null });
  const course = nav.courseId ? courses.find((c) => c.id === nav.courseId) : null;
  const goCourses = () => setNav({ level: "courses", courseId: null, unitId: null });

  if (nav.level === "courses" || !course) {
    return <MobileCoursesScreen role={role} courses={courses} units={units} exercises={exercises} results={results} groups={groups}
      onOpenCourse={(courseId) => setNav({ level: "units", courseId, unitId: null })} onCreateCourse={props.onCreateCourse} />;
  }
  if (nav.level === "units") {
    return <MobileUnitsScreen role={role} course={course} units={units} exercises={exercises} results={results} groups={groups}
      onBack={goCourses} onOpenUnit={(unitId) => setNav({ ...nav, level: "exercises", unitId })} onCreateUnit={props.onCreateUnit}
      onUpdateCourse={props.onUpdateCourse} onEditCourse={props.onEditCourse} onDeleteCourse={props.onDeleteCourse} onAfterDeleteCourse={goCourses} askConfirm={props.askConfirm} />;
  }
  const cu   = courseUnitList(course, units, role);
  const unit = cu.find((u) => u.id === nav.unitId) || cu[0] || null;
  return <MobileExercisesScreen role={role} course={course} unit={unit} exercises={exercises} results={results}
    onBack={() => setNav({ ...nav, level: "units", unitId: null })}
    panelProps={{
      onExercise: props.onExercise, onViewCorrection: props.onViewCorrection,
      onPickFromBank: props.onPickFromBank, onCreateNewExInUnit: props.onCreateNewExInUnit, onRemoveExFromUnit: props.onRemoveExFromUnit, onSelectExercise: props.onSelectExercise,
      onEditUnit: props.onEditUnit, onUpdateUnit: props.onUpdateUnit, onDeleteUnit: props.onDeleteUnit, onAfterDeleteUnit: () => setNav({ ...nav, level: "units", unitId: null }), askConfirm: props.askConfirm,
    }} />;
}

// — Orquestador: páginas (escritorio) o flujo de niveles (móvil) —
function CoursesPages(props) {
  const { role, courses, units } = props;
  const isMobile = useIsMobile();
  const [page, setPage]           = useState({ name: "list", courseId: null });
  const [selUnitId, setSelUnitId] = useState(null);

  const openCourse = (courseId) => {
    const c  = courses.find((x) => x.id === courseId);
    const cu = c ? courseUnitList(c, units, role) : [];
    setSelUnitId(cu[0]?.id ?? null);
    setPage({ name: "detail", courseId });
  };

  if (isMobile) return <MobileCoursesFlow {...props} />;

  const current = courses.find((c) => c.id === page.courseId);
  if (page.name === "list" || !current) {
    return <CoursesLanding role={role} courses={courses} units={units} exercises={props.exercises} results={props.results} groups={props.groups}
      onOpen={openCourse} onCreateCourse={props.onCreateCourse} />;
  }
  return <CourseDetail {...props} courseId={page.courseId} selUnitId={selUnitId} setSelUnitId={setSelUnitId}
    onBack={() => setPage({ name: "list", courseId: null })} onSwitch={openCourse} />;
}

// ── Pestaña: Cursos (profesor) — ahora delega en CoursesPages ────────────────
function CoursesTab(props) {
  return <CoursesPages role="teacher" {...props} />;
}

// ── Pestaña: Alumnos ──────────────────────────────────────────────────────
function StudentsTab({ students, exercises, results, groups, onAddStudent, onResetCred, onRemove, askConfirm, onViewAnswer, onEditGroup, onDeleteGroup }) {
  const [expandedStudents, setExpandedStudents] = useState(new Set());
  const [expandedGroups,   setExpandedGroups]   = useState(() => new Set(groups.map((g) => g.id)));
  const toggleExpand = (id) =>
    setExpandedStudents((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleGroup = (id) =>
    setExpandedGroups((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const renderStudentCard = (s) => {
    const sRes    = results[s.id] || {};
    const isOpen  = expandedStudents.has(s.id);
    const doneExs = exercises.filter((ex) => sRes[ex.id]);
    return (
      <div
        key={s.id}
        onClick={() => exercises.length > 0 && toggleExpand(s.id)}
        style={{ ...S.card, cursor: exercises.length > 0 ? "pointer" : "default", userSelect: "none" }}>
        {/* Cabecera siempre visible */}
        <div style={{ ...S.row, justifyContent: "space-between", gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {s.displayName}
          </div>
          <div style={{ ...S.row, gap: 6, flexShrink: 0 }}>
            {exercises.length > 0 && <Chevron open={isOpen} rotate90WhenClosed size={13} />}
            <button
              onClick={(e) => { e.stopPropagation(); askConfirm(`¿Eliminar al alumno "${s.displayName}"?\n\nSe borrarán también todas sus respuestas guardadas.`, () => onRemove(s.id)); }}
              title={`Eliminar alumno "${s.displayName}"`}
              style={{ ...S.btnDanger, padding: "4px 8px", fontSize: 13 }}>✕</button>
          </div>
        </div>

        {/* Detalle: solo visible al desplegar (altura animada) */}
        <div className={`fa-expand${isOpen ? " fa-open" : ""}`}>
          <div className="fa-expand-inner">
            <div onClick={(e) => e.stopPropagation()} style={{ marginTop: 12, borderTop: `1px solid ${C.line}`, paddingTop: 12 }}>
              <div style={{ ...S.row, gap: 6, flexWrap: "wrap", marginBottom: doneExs.length > 0 ? 12 : 4 }}>
                <span style={{ ...S.badge, background: C.paper2, color: C.muted, fontFamily: FONT_MONO, fontSize: 10 }}>@{s.username}</span>
                <span style={{ ...S.badge, background: s.credType === "pin" ? "rgba(47,111,184,0.12)" : "rgba(63,155,91,0.10)", color: s.credType === "pin" ? C.quiz : C.fnT }}>
                  {s.credType === "pin" ? "PIN" : "Contraseña"}
                </span>
                {exercises.length > 0 && (
                  <span style={{ ...S.badge, background: C.line, color: C.muted, fontSize: 10 }}>
                    {doneExs.length}/{exercises.length} ejs.
                  </span>
                )}
                <button onClick={() => onResetCred(s)} style={{ ...S.btn, fontSize: 11, padding: "2px 9px" }}>Resetear</button>
              </div>
              {doneExs.length === 0
                ? <p style={{ fontFamily: F.sans, fontSize: 13, color: C.muted, margin: 0 }}>Ningún ejercicio entregado todavía.</p>
                : doneExs.map((ex) => {
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
                          <ScoreBadge score={r.score} />
                          <button onClick={() => onViewAnswer(s, ex, r)} style={{ ...S.btn, fontSize: 11, padding: "2px 9px", color: C.fnS, borderColor: C.fnS }}>Ver</button>
                        </div>
                      </div>
                    );
                  })
              }
            </div>
          </div>
        </div>
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
        const isGroupOpen   = expandedGroups.has(group.id);
        return (
          <div key={group.id} style={{ marginBottom: 28 }}>
            <div
              onClick={() => toggleGroup(group.id)}
              style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: isGroupOpen ? 12 : 0, paddingBottom: 10, borderBottom: `2px solid ${C.ink}`, flexWrap: "wrap", cursor: "pointer", userSelect: "none" }}>
              <span style={{ fontFamily: F.serif, fontSize: 20, fontWeight: 700, flex: 1, minWidth: 120 }}>{group.name}</span>
              <span style={{ fontSize: 12, color: C.muted, flexShrink: 0 }}>{groupStudents.length} {groupStudents.length === 1 ? "alumno" : "alumnos"}</span>
              <Chevron open={isGroupOpen} rotate90WhenClosed size={14} />
              <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", gap: 6 }}>
                <button onClick={() => onEditGroup(group)} style={{ ...S.btn, fontSize: 12, padding: "4px 10px" }}>Editar</button>
                <button
                  onClick={() => askConfirm(`¿Eliminar el grupo "${group.name}"?\n\nLos alumnos no se eliminarán.`, () => onDeleteGroup(group.id))}
                  title={`Eliminar grupo "${group.name}"`}
                  style={{ ...S.btnDanger, padding: "4px 8px", fontSize: 13 }}>✕</button>
              </div>
            </div>
            {isGroupOpen && (
              groupStudents.length === 0
                ? <p style={{ color: C.muted, fontSize: 13, margin: 0 }}>Este grupo no tiene alumnos. Edítalo para añadir.</p>
                : groupStudents.map(renderStudentCard)
            )}
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
  const allComposers = useMemo(() => audioComposers(audioLibrary), [audioLibrary]);
  const allTags      = useMemo(() => audioTags(audioLibrary),      [audioLibrary]);

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
        <div className="fa-pop" style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 40, background: C.paper, border: `1px solid ${C.line}`, borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.12)", padding: 6, display: "flex", flexDirection: "column", gap: 2, minWidth: 172 }}>
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
            allTags={audioTags(audioLibrary)}
            allComposers={audioComposers(audioLibrary)}
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
    if (next.has(id)) { if (next.size > 1) next.delete(id); return next; }
    // Categorías de grados con cifrado: son exclusivas (van solas). Al activar
    // una, se deselecciona el resto; al activar otra categoría, se quita esta.
    const cat = categories.find((c) => c.id === id);
    if (cat?.hasFigures) return new Set([id]);
    // Si había una categoría de grados activa, quitarla al añadir una normal.
    for (const cid of next) {
      const c = categories.find((x) => x.id === cid);
      if (c?.hasFigures) next.delete(cid);
    }
    next.add(id);
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
    // Las categorías de grados con cifrado requieren pistas visibles (el alumno
    // rellena sobre los huecos de la clave). Se fuerza showHint = true.
    const forceHint = hasInteractivo && safe.some((c) => c.hasFigures);

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
        showHint: forceHint,
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
      if (forceHint) patch.showHint = true;
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

import { CategoryEditorModal, GroupEditorModal, CourseFormModal, UnitFormModal, ExercisePickerModal, AddUserModal, ResetCredentialModal, RecoveryEmailModal, AudioLibraryPickerModal, AudioLibraryFormModal, QuestionEditorModal } from "./components/modals.jsx";
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
  // Contador de escrituras en vuelo hacia Supabase.
  const pendingSavesRef = useRef(0);

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
          // Entorno de previsualización: sin backend — modo en memoria.
          // El `finally` de abajo marca dbReady; basta con salir aquí.
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

  // Advierte al usuario si recarga mientras hay escrituras en vuelo.
  useEffect(() => {
    const handler = (e) => {
      if (pendingSavesRef.current > 0) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  // ─── Helpers de upsert ───────────────────────────────────────────────────
  // Todos los helpers comprueban si el cliente existe; si no (modo en memoria),
  // simplemente retornan sin hacer nada: el estado React ya se actualizó.

  const dbUpsertExercise = async (ex) => {
    const sb = supabaseRef.current; if (!sb) return;
    // El waveform decodificado puede pesar mucho; no se guarda en Supabase.
    // eslint-disable-next-line no-unused-vars
    const { waveformData, ...rest } = ex;
    pendingSavesRef.current++;
    const { error } = await sb.from("fa_exercises").upsert({ id: ex.id, data: rest });
    pendingSavesRef.current--;
    if (error) console.error("[fa_exercises] Error al guardar:", error.message, ex.id);
  };
  const dbDeleteExercise = async (id) => { const sb = supabaseRef.current; if (!sb) return; await sb.from("fa_exercises").delete().eq("id", id); };

  const dbUpsertUser   = async (u)  => { const sb = supabaseRef.current; if (!sb) return; const { error } = await sb.from("fa_users").upsert({ id: u.id, data: u }); if (error) console.error("[fa_users] Error al guardar:", error.message); };
  const dbDeleteUser   = async (id) => { const sb = supabaseRef.current; if (!sb) return; await sb.from("fa_users").delete().eq("id", id); };

  const dbUpsertCategory = async (c)  => { const sb = supabaseRef.current; if (!sb) return; const { error } = await sb.from("fa_categories").upsert({ id: c.id, data: c }); if (error) console.error("[fa_categories] Error al guardar:", error.message); };
  const dbDeleteCategory = async (id) => { const sb = supabaseRef.current; if (!sb) return; await sb.from("fa_categories").delete().eq("id", id); };

  const dbUpsertCourse = async (c)  => { const sb = supabaseRef.current; if (!sb) return; const { error } = await sb.from("fa_courses").upsert({ id: c.id, data: c }); if (error) console.error("[fa_courses] Error al guardar:", error.message); };
  const dbDeleteCourse = async (id) => { const sb = supabaseRef.current; if (!sb) return; await sb.from("fa_courses").delete().eq("id", id); };

  const dbUpsertUnit = async (u)  => { const sb = supabaseRef.current; if (!sb) return; const { error } = await sb.from("fa_units").upsert({ id: u.id, data: u }); if (error) console.error("[fa_units] Error al guardar:", error.message); };
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
    setGroups((prev) => prev.map((g) =>
      g.studentIds?.includes(userId) ? { ...g, studentIds: g.studentIds.filter((id) => id !== userId) } : g
    ));
    // Persistir los grupos afectados desde el estado actual (closure), no dentro
    // del updater de setGroups (correría en render → array vacío al guardar).
    groups
      .filter((g) => g.studentIds?.includes(userId))
      .forEach((g) => dbUpsertGroup({ ...g, studentIds: g.studentIds.filter((id) => id !== userId) }));
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
    // El objeto a persistir se calcula ANTES de setState (a partir del estado
    // actual en el closure). Antes se asignaba dentro del updater de setResults
    // y se leía justo después; como React ejecuta ese updater en la fase de
    // render (no de forma síncrona), `saved` seguía siendo null al llamar a
    // dbUpsertResult → la corrección del profesor no se guardaba en Supabase.
    const existing = (results[studentId] || {})[exerciseId] || {};
    const updated  = { ...existing, teacherCorrection: { ...correction, corrected: true } };
    setResults((prev) => ({ ...prev, [studentId]: { ...(prev[studentId] || {}), [exerciseId]: updated } }));
    dbUpsertResult(studentId, exerciseId, updated);
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
    const current = exercises.find((e) => e.id === id);
    setExercises((prev) => prev.map((e) => e.id === id ? { ...e, ...patch } : e));
    if (current) dbUpsertExercise({ ...current, ...patch });
  };

  const deleteExercise = (id) => {
    setExercises((prev) => prev.filter((e) => e.id !== id));
    setUnits((prev) => prev.map((u) =>
      u.exerciseIds.includes(id) ? { ...u, exerciseIds: u.exerciseIds.filter((eid) => eid !== id) } : u
    ));
    // Persistir las unidades afectadas. Se calculan desde el estado actual
    // (closure `units`), NO dentro del updater de setUnits: React ejecuta ese
    // updater en la fase de render, así que un array capturado dentro seguiría
    // vacío aquí y las unidades no se guardarían (referencias colgantes al
    // ejercicio borrado tras recargar).
    units
      .filter((u) => u.exerciseIds.includes(id))
      .forEach((u) => dbUpsertUnit({ ...u, exerciseIds: u.exerciseIds.filter((eid) => eid !== id) }));
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
    // Calcular el objeto a persistir desde el estado actual (closure), no dentro
    // del updater: el updater corre en render y `cat` seguiría null al guardar.
    const cat = categories.find((c) => c.id === id);
    if (!cat) return;
    const updated = { ...cat, global: !cat.global };
    setCategories((prev) => prev.map((c) => c.id === id ? updated : c));
    dbUpsertCategory(updated);
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

  // ─── Units ───────────────────────────────────────────────────────────────
  const addUnit = (newUnit, courseId) => {
    const existingCourse = courses.find((c) => c.id === courseId);
    setUnits((prev) => [...prev, newUnit]);
    setCourses((prev) => prev.map((c) => c.id === courseId ? { ...c, unitIds: [...c.unitIds, newUnit.id] } : c));
    if (existingCourse) dbUpsertCourse({ ...existingCourse, unitIds: [...existingCourse.unitIds, newUnit.id] });
    dbUpsertUnit(newUnit);
  };

  const updateUnit = (updated) => {
    setUnits((prev) => prev.map((u) => u.id === updated.id ? updated : u));
    dbUpsertUnit(updated);
  };

  const deleteUnit = (unitId, courseId) => {
    const existingCourse = courses.find((c) => c.id === courseId);
    setUnits((prev) => prev.filter((u) => u.id !== unitId));
    setCourses((prev) => prev.map((c) => c.id === courseId ? { ...c, unitIds: c.unitIds.filter((id) => id !== unitId) } : c));
    if (existingCourse) dbUpsertCourse({ ...existingCourse, unitIds: existingCourse.unitIds.filter((id) => id !== unitId) });
    dbDeleteUnit(unitId);
  };

  const addExercisesToUnit = (unitId, exIds) => {
    const existingUnit = units.find((u) => u.id === unitId);
    setUnits((prev) => prev.map((u) => {
      if (u.id !== unitId) return u;
      const merged = [...u.exerciseIds, ...exIds.filter((id) => !u.exerciseIds.includes(id))];
      return { ...u, exerciseIds: merged };
    }));
    if (existingUnit) {
      const merged = [...existingUnit.exerciseIds, ...exIds.filter((id) => !existingUnit.exerciseIds.includes(id))];
      dbUpsertUnit({ ...existingUnit, exerciseIds: merged });
    }
  };

  const removeExerciseFromUnit = (unitId, exId) => {
    const existingUnit = units.find((u) => u.id === unitId);
    setUnits((prev) => prev.map((u) => u.id === unitId ? { ...u, exerciseIds: u.exerciseIds.filter((id) => id !== exId) } : u));
    if (existingUnit) dbUpsertUnit({ ...existingUnit, exerciseIds: existingUnit.exerciseIds.filter((id) => id !== exId) });
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
