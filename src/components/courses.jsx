// ═══ VISTA DE CURSOS ═════════════════════════════════════════════════════════
// Lista + detalle de cursos/unidades (profesor y alumno), incl. flujo móvil.
// Extraída de teacher.jsx (Fase 2, subdivisión). Los modales los gestiona el
// componente padre (TeacherDash) vía callbacks.
import { useState } from "react";
import { C, F, S } from "../theme/tokens.js";
import { modelOf, answerStats, questionsOf } from "../lib/domain.js";
import { modelMeta } from "../lib/modelMeta.js";
import { useIsMobile } from "../hooks/useIsMobile.js";
import { Chevron, StatusCircle, ProgressRing, EyeButton, EditIconButton, DeleteIconButton, RemoveIconButton, Overline, GhostButton, CtaButton } from "./primitives.jsx";
import { ExerciseRow } from "./student.jsx";

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
