// ═══ VISTAS DEL PROFESOR ══════════════════════════════════════════════════════
// Dashboard del profesor, pestañas (ejercicios, cursos, alumnos, categorías,
// audios, ajustes, usuarios), vista de cursos, ExerciseDetailView y
// QuestionManagerView. Extraídas de App.jsx (Fase 2). TODO: subdividir en teacher/ y courses/.
import { useState, useEffect, useRef, useMemo } from "react";
import { C, F, S, FONT_SANS, FONT_MONO, SECTION_STYLE } from "../theme/tokens.js";
import { textOn } from "../lib/color.js";
import { fmt } from "../lib/ids.js";
import { SCHEMA_PALETTES, SCHEMA_PALETTE_DEFAULT, getSchemaPalette, effectivePaletteId, applyPaletteToExercise } from "../lib/palette.js";
import { categoriesOf, modelOf, modelsOf, answerStats, questionsOf, audioComposers, audioTags } from "../lib/domain.js";
import { MODEL_META, modelMeta } from "../lib/modelMeta.js";
import { useIsMobile } from "../hooks/useIsMobile.js";
import { ConfirmModal, TabBar, ScoreBadge, Chevron, StatusCircle, ProgressRing, CategoryDots, EyeButton, EditIconButton, DeleteIconButton, RemoveIconButton, FilterDropdown, TeacherFilterBar, Overline, GhostButton, CtaButton, MetaItem } from "./primitives.jsx";
import { ExerciseRow } from "./student.jsx";
import { CorrectionView } from "./CorrectionView.jsx";
import { CategoryEditorModal, GroupEditorModal, CourseFormModal, UnitFormModal, ExercisePickerModal, AddUserModal, ResetCredentialModal, AudioLibraryFormModal } from "./modals.jsx";

// ── Pestaña: Ejercicios ────────────────────────────────────────────────────
export function TeacherExerciseRow({ ex, onSelect, onDelete, onToggleVisibility, composerName }) {
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

export function ExercisesTab({ exercises, audioLibrary = [], onNew, onSelect, onToggleVisibility, askConfirm, onDelete }) {
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
export function ArrowRightIcon({ size = 14, color = "currentColor" }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block", flexShrink: 0 }}><path d="M3 8h9M8.5 4l4 4-4 4" /></svg>;
}
export function ChevronLeftIcon({ size = 14, color = "currentColor" }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block", flexShrink: 0 }}><path d="M10 3L5 8l5 5" /></svg>;
}
export function ChevronRightIcon({ size = 15, color = C.chevron }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block", flexShrink: 0 }}><path d="M6 3l5 5-5 5" /></svg>;
}

// — Insignia de visibilidad del curso (solo profesor) —
export function CourseVisBadge({ course, groups = [] }) {
  const vis = course.visibility || "teacher";
  if (vis === "public") return <span style={{ ...S.badge, background: "rgba(63,155,91,0.12)", color: C.fnT, fontSize: 10 }}>Público</span>;
  if (vis === "group") {
    const g = groups.find((x) => x.id === course.visibilityGroupId);
    return <span style={{ ...S.badge, background: "rgba(47,111,184,0.10)", color: C.quiz, fontSize: 10 }}>{g ? g.name : "Grupo"}</span>;
  }
  return <span style={{ ...S.badge, background: C.line, color: C.muted, fontSize: 10 }}>Mis alumnos</span>;
}

// — Botón "añadir" de borde punteado, ancho completo —
export function DashedAddButton({ children, onClick }) {
  return (
    <button onClick={onClick} style={{ width: "100%", boxSizing: "border-box", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, background: "transparent", border: `1.5px dashed ${C.rail}`, color: "#555", borderRadius: 10, padding: "12px", fontFamily: F.sans, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>{children}</button>
  );
}

// — Barra de progreso fina (curso / unidad) —
export function CourseProgressBar({ num, total, width = 120, accent = C.ink }) {
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
export function CourseCard({ course, units, exercises, role, results, groups, onOpen }) {
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

export function CoursesLanding({ role, courses, units, exercises, results, groups, onOpen, onCreateCourse }) {
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
export function CourseDropdown({ courses, currentId, role, units, exercises, results, onSwitch }) {
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
export function TeacherExCard({ ex, isMobile, unitId, onSelectExercise, onRemoveExFromUnit, askConfirm }) {
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

export function EmptyExercises({ role }) {
  return (
    <div style={{ padding: "44px 20px", textAlign: "center", border: `1px dashed ${C.rail}`, borderRadius: 12 }}>
      <div style={{ fontFamily: F.serif, fontSize: 18, color: C.ink2 }}>{role === "student" ? "Aún no hay ejercicios" : "Unidad sin ejercicios"}</div>
      <div style={{ fontFamily: F.sans, fontSize: 12.5, color: C.muted, marginTop: 3 }}>{role === "student" ? "Tu profesor los publicará pronto." : "Añade uno desde el banco o crea uno nuevo."}</div>
    </div>
  );
}

// — Panel de ejercicios de la unidad seleccionada (profesor: tarjetas; alumno: filas) —
export function CourseExercisesPanel({
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
export function UnitsList({ course, units, exercises, role, results, selUnitId, onSelectUnit, onCreateUnit }) {
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
export function CourseDetail({
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
export function MobileTopBar({ title, onBack }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, paddingBottom: 12, marginBottom: 14, borderBottom: `1px solid ${C.line}` }}>
      {onBack && <button onClick={onBack} style={{ width: 34, height: 34, borderRadius: 8, border: `1px solid ${C.line}`, background: C.paper, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, color: C.ink }}><ChevronLeftIcon /></button>}
      <span style={{ flex: 1, minWidth: 0, fontFamily: F.sans, fontSize: 13, fontWeight: 600, color: "#555", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</span>
    </div>
  );
}

export function MobileCoursesScreen({ role, courses, units, exercises, results, groups, onOpenCourse, onCreateCourse }) {
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

export function MobileUnitsScreen({
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

export function MobileExercisesScreen({ role, course, unit, exercises, results, onBack, panelProps }) {
  return (
    <div style={{ fontFamily: F.sans }}>
      <MobileTopBar title={course.name} onBack={onBack} />
      <div style={{ border: `1px solid ${C.line}`, borderRadius: 14, background: C.paper, overflow: "hidden" }}>
        <CourseExercisesPanel unit={unit} course={course} exercises={exercises} role={role} results={results} isMobile {...panelProps} />
      </div>
    </div>
  );
}

export function MobileCoursesFlow(props) {
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
export function CoursesPages(props) {
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
export function CoursesTab(props) {
  return <CoursesPages role="teacher" {...props} />;
}

// ── Pestaña: Alumnos ──────────────────────────────────────────────────────
export function StudentsTab({ students, exercises, results, groups, onAddStudent, onResetCred, onRemove, askConfirm, onViewAnswer, onEditGroup, onDeleteGroup }) {
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
export function CategoriesTab({ categories, isAdmin, onAdd, onEdit, onDelete, onToggleGlobal, askConfirm }) {
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
export function AudiosTab({ audioLibrary, isAdmin, onAdd, onEdit, onDelete, askConfirm }) {
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
export function SettingsTab({ margin, onMargin, currentUser, onUpdateUser }) {
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
export function PalettePreferenceCard({ current, onSelect }) {
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
export function PaletteMenuButton({ current, onSelect, label = "Paleta" }) {
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
export function UsersTab({ currentUser, teachers, onAddTeacher, onResetCred, onRemove, askConfirm }) {
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

export function TeacherDash({
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

import { ExerciseDetailView } from "./ExerciseDetailView.jsx";
