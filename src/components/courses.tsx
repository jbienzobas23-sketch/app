// ═══ VISTA DE CURSOS ═════════════════════════════════════════════════════════
// Lista + detalle de cursos/unidades (profesor y alumno), incl. flujo móvil.
// Extraída de teacher.jsx (Fase 2, subdivisión). Los modales los gestiona el
// componente padre (TeacherDash) vía callbacks.
import { useState } from "react";
import type { ReactNode } from "react";
import type { Course, Unit, Exercise, Group, ResultsMap, Role } from "../lib/types.js";
import { C, F, S } from "../theme/tokens.js";
import { modelOf, answerStats, questionsOf, courseUnitList, unitExList } from "../lib/domain.js";
import { modelMeta } from "../lib/modelMeta.js";
import { fmt } from "../lib/ids.js";
import { useIsMobile } from "../hooks/useIsMobile.js";
import { Chevron, StatusCircle, ProgressRing, EyeButton, EditIconButton, DeleteIconButton, RemoveIconButton, GhostButton, CtaButton, MetaItem } from "./primitives.jsx";
import { ExerciseRow } from "./student.jsx";
import { ExercisePlate } from "./TypePlate.jsx";

// ── Tipos auxiliares de callbacks compartidos por las vistas de cursos ────────
type AskConfirm = (message: string, onConfirm: () => void) => void;
interface UnitStats { num: number; total: number; }
interface CourseStats { num: number; total: number; units: number; }

// Conjunto de datos común que reciben casi todas las vistas de cursos.
interface CoursesData {
  role: Role;
  courses: Course[];
  units: Unit[];
  exercises: Exercise[];
  results: ResultsMap;
  groups?: Group[];
}

// Callbacks de edición/navegación que fluyen desde TeacherDash hasta los paneles.
interface CoursesCallbacks {
  onExercise?: (ex: Exercise) => void;
  onViewCorrection?: (ex: Exercise) => void;
  onPickFromBank?: (unitId: string) => void;
  onCreateNewExInUnit?: (unitId: string) => void;
  onRemoveExFromUnit?: (unitId: string, exId: string) => void;
  onSelectExercise?: (exId: string) => void;
  onEditUnit?: (unit: Unit) => void;
  onUpdateUnit?: (unit: Unit) => void;
  onDeleteUnit?: (unitId: string, courseId: string) => void;
  onCreateUnit?: (courseId: string) => void;
  onUpdateCourse?: (course: Course) => void;
  onEditCourse?: (course: Course) => void;
  onDeleteCourse?: (courseId: string) => void;
  onCreateCourse?: () => void;
  askConfirm?: AskConfirm;
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
// courseUnitList / unitExList viven en lib/domain.ts (comparan ids normalizados
// a texto para tolerar ids de ejercicio numéricos vs. exerciseIds de texto).
// ¿La clave del ejercicio está lista? (misma lógica que el acordeón anterior)
function exKeyReady(ex: Exercise): boolean {
  const isQuiz = modelOf(ex) === "cuestionario";
  const exQs   = questionsOf(ex);
  const { recorded, total } = isQuiz ? { recorded: 0, total: 0 } : answerStats(ex);
  return isQuiz ? exQs.length > 0 : (recorded === total && total > 0);
}
// Progreso de una unidad → { num, total }. Profesor: claves listas. Alumno: hechos.
function unitProgress(unit: Unit, exercises: Exercise[], role: Role, results: ResultsMap): UnitStats {
  const exs = unitExList(unit, exercises, role);
  const num = role === "student"
    ? exs.filter((e) => results?.[String(e.id)] != null).length
    : exs.filter(exKeyReady).length;
  return { num, total: exs.length };
}
// Progreso agregado de un curso → { num, total, units }.
function courseProgress(course: Course, units: Unit[], exercises: Exercise[], role: Role, results: ResultsMap): CourseStats {
  const cu = courseUnitList(course, units, role);
  let num = 0, total = 0;
  cu.forEach((u) => { const s = unitProgress(u, exercises, role, results); num += s.num; total += s.total; });
  return { num, total, units: cu.length };
}

// — Iconos de línea (mismo lenguaje gráfico que la app) —
interface IconProps { size?: number; color?: string; }
export function ArrowRightIcon({ size = 14, color = "currentColor" }: IconProps) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block", flexShrink: 0 }}><path d="M3 8h9M8.5 4l4 4-4 4" /></svg>;
}
export function ChevronLeftIcon({ size = 14, color = "currentColor" }: IconProps) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block", flexShrink: 0 }}><path d="M10 3L5 8l5 5" /></svg>;
}
export function ChevronRightIcon({ size = 15, color = C.chevron }: IconProps) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block", flexShrink: 0 }}><path d="M6 3l5 5-5 5" /></svg>;
}

// — Insignia de visibilidad del curso (solo profesor) —
export function CourseVisBadge({ course, groups = [] }: { course: Course; groups?: Group[] }) {
  const vis = course.visibility || "teacher";
  if (vis === "public") return <span style={{ ...S.badge, background: "rgba(63,155,91,0.12)", color: C.fnT, fontSize: 10 }}>Público</span>;
  if (vis === "group") {
    const g = groups.find((x) => x.id === course.visibilityGroupId);
    return <span style={{ ...S.badge, background: "rgba(47,111,184,0.10)", color: C.quiz, fontSize: 10 }}>{g ? g.name : "Grupo"}</span>;
  }
  return <span style={{ ...S.badge, background: C.line, color: C.muted, fontSize: 10 }}>Mis alumnos</span>;
}

// — Botón "añadir" de borde punteado, ancho completo —
export function DashedAddButton({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return (
    <button onClick={onClick} style={{ width: "100%", boxSizing: "border-box", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, background: "transparent", border: `1.5px dashed ${C.rail}`, color: "#555", borderRadius: 10, padding: "12px", fontFamily: F.sans, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>{children}</button>
  );
}

// — Barra de progreso fina (curso / unidad) —
export function CourseProgressBar({ num, total, width = 120, accent = C.ink }: { num: number; total: number; width?: number; accent?: string }) {
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
export function CourseCard({ course, units, exercises, role, results, groups, onOpen }: Omit<CoursesData, "courses"> & { course: Course; onOpen: () => void }) {
  const [hover, setHover] = useState(false);
  const cs   = courseProgress(course, units, exercises, role, results);
  const pct  = cs.total ? (cs.num / cs.total) * 100 : 0;
  const done = cs.total > 0 && cs.num === cs.total;
  return (
    <button onClick={onOpen} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ font: "inherit", textAlign: "left", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 13, background: C.paper, border: `1px solid ${hover ? C.rail : C.line}`, borderRadius: 14, padding: "18px 18px 16px", cursor: "pointer", boxShadow: hover ? "0 6px 20px rgba(26,25,21,0.09)" : "none", transition: "box-shadow .18s, border-color .18s" }}>
      <div style={{ minWidth: 0 }}>
        <h3 style={{ fontFamily: F.serif, fontSize: 21, fontWeight: 600, color: C.ink, margin: "0 0 4px", lineHeight: 1.1, letterSpacing: "-0.01em", wordBreak: "break-word" }}>{course.name}</h3>
        {role === "teacher"
          ? <CourseVisBadge course={course} groups={groups} />
          : (course.description ? <span style={{ fontFamily: F.sans, fontSize: 12, color: "#888" }}>{course.description}</span> : null)}
      </div>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <span style={{ flex: 1, height: 5, borderRadius: 3, background: C.line, overflow: "hidden" }}><span style={{ display: "block", width: `${pct}%`, height: "100%", background: done ? C.fnT : C.ink }} /></span>
          <span style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 600, color: C.muted, fontVariantNumeric: "tabular-nums" }}>{cs.num}/{cs.total}</span>
        </div>
        <div style={{ fontFamily: F.sans, fontSize: 12, color: C.muted }}>
          {cs.units} {cs.units === 1 ? "unidad" : "unidades"} · {cs.num}/{cs.total} {role === "student" ? "completados" : "con clave"}
        </div>
      </div>
    </button>
  );
}

export function CoursesLanding({ role, courses, units, exercises, results, groups, onOpen, onCreateCourse }: CoursesData & { onOpen: (courseId: string) => void; onCreateCourse?: () => void }) {
  return (
    <div style={{ fontFamily: F.sans }}>
      {/* Sin segundo encabezado "Cursos": la cabecera del panel + pestañas ya dan
          contexto. Aquí solo una línea de conteo (+ acción de crear en profesor). */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 18 }}>
        <span style={{ fontFamily: F.sans, fontSize: 12.5, color: C.muted }}>{courses.length} {courses.length === 1 ? "curso" : "cursos"}</span>
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
export function CourseDropdown({ courses, currentId, role, units, exercises, results, onSwitch }: { courses: Course[]; currentId: string; role: Role; units: Unit[]; exercises: Exercise[]; results: ResultsMap; onSwitch: (courseId: string) => void }) {
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

// — Fila de ejercicio a ancho completo (profesor, dentro de una unidad) —
// Placa de tipo + título; al desplegar, metadatos y acciones (editar el
// ejercicio / quitarlo de la unidad). La clave de corrección queda visible en el
// desplegable (el profesor no lleva insignia de estado en la cabecera).
export function TeacherExCard({ ex, isMobile, unitId, onSelectExercise, onRemoveExFromUnit, askConfirm }: { ex: Exercise; isMobile: boolean; unitId: string; onSelectExercise: (exId: string) => void; onRemoveExFromUnit: (unitId: string, exId: string) => void; askConfirm: AskConfirm }) {
  const [open, setOpen]   = useState(false);
  const meta     = modelMeta(ex);
  const isQuiz   = modelOf(ex) === "cuestionario";
  const exQs     = questionsOf(ex);
  const keyReady = exKeyReady(ex);
  return (
    <div style={{ display: "flex", flexDirection: "column", boxSizing: "border-box", background: C.paper, border: `1px solid ${C.line}`, borderRadius: isMobile ? 10 : 14, overflow: "hidden" }}>
      <div onClick={() => setOpen((o) => !o)} role="button" tabIndex={0} aria-expanded={open}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen((o) => !o); } }}
        style={{ display: "flex", alignItems: "center", gap: isMobile ? 9 : 14, ...(isMobile ? {} : { minHeight: 66 }), boxSizing: "border-box", padding: isMobile ? "11px 13px" : "12px 16px", cursor: "pointer", userSelect: "none" }}>
        <ExercisePlate ex={ex} size={isMobile ? 30 : 36} radius={isMobile ? 9 : 10} />
        <div style={{ flex: 1, minWidth: 0, fontFamily: F.serif, fontSize: isMobile ? 16 : 17, fontWeight: 600, color: C.ink, lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", ...(isMobile ? { whiteSpace: "nowrap" as const } : { display: "-webkit-box" as const, WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const }) }}>{ex.title}</div>
        <Chevron open={open} />
      </div>
      <div className={`fa-expand${open ? " fa-open" : ""}`}>
        <div className="fa-expand-inner">
          <div style={{ borderTop: `1px solid ${C.line}`, padding: "11px 16px 14px", display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: "12px 22px", background: C.bg }}>
            <MetaItem label="Tipo"><span style={{ width: 7, height: 7, borderRadius: "50%", background: meta.color }} />{meta.label}</MetaItem>
            <MetaItem label="Duración">{fmt(ex.duration ?? 0)}</MetaItem>
            {isQuiz && <MetaItem label="Preguntas">{exQs.length || "—"}</MetaItem>}
            <MetaItem label="Clave de corrección">
              <StatusCircle done={keyReady} size={13} />
              <span style={{ color: keyReady ? C.ink : C.muted }}>{keyReady ? "Configurada" : "Pendiente"}</span>
            </MetaItem>
            {/* Acciones: editar el ejercicio o quitarlo de esta unidad */}
            <div onClick={(e) => e.stopPropagation()} style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
              <EditIconButton onClick={() => onSelectExercise(String(ex.id))} title={`Editar "${ex.title}"`} />
              <RemoveIconButton onClick={() => askConfirm(`¿Quitar "${ex.title}" de esta unidad?\n\nEl ejercicio permanecerá en el banco global.`, () => onRemoveExFromUnit(unitId, String(ex.id)))} title={`Quitar "${ex.title}" de la unidad`} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function EmptyExercises({ role }: { role: Role }) {
  return (
    <div style={{ padding: "44px 20px", textAlign: "center", border: `1px dashed ${C.rail}`, borderRadius: 12 }}>
      <div style={{ fontFamily: F.serif, fontSize: 18, color: C.ink2 }}>{role === "student" ? "Aún no hay ejercicios" : "Unidad sin ejercicios"}</div>
      <div style={{ fontFamily: F.sans, fontSize: 12.5, color: C.muted, marginTop: 3 }}>{role === "student" ? "Tu profesor los publicará pronto." : "Añade uno desde el banco o crea uno nuevo."}</div>
    </div>
  );
}

// — Panel de ejercicios de la unidad seleccionada (profesor: tarjetas; alumno: filas) —
interface CourseExercisesPanelProps {
  unit: Unit | null;
  course: Course;
  exercises: Exercise[];
  role: Role;
  results: ResultsMap;
  isMobile: boolean;
  onExercise?: (ex: Exercise) => void;
  onViewCorrection?: (ex: Exercise) => void;
  onPickFromBank?: (unitId: string) => void;
  onCreateNewExInUnit?: (unitId: string) => void;
  onRemoveExFromUnit?: (unitId: string, exId: string) => void;
  onSelectExercise?: (exId: string) => void;
  onEditUnit?: (unit: Unit) => void;
  onUpdateUnit?: (unit: Unit) => void;
  onDeleteUnit?: (unitId: string, courseId: string) => void;
  onAfterDeleteUnit?: () => void;
  askConfirm?: AskConfirm;
}
const noop = () => {};
// Eyebrow de conteo (Outfit versalitas) que encabeza la pila de ejercicios.
const exEyebrow = { fontFamily: F.sans, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase" as const, color: C.muted, padding: "2px 4px 10px" };
export function CourseExercisesPanel({
  unit, exercises, role, results, isMobile,
  onExercise, onViewCorrection,
  onPickFromBank = noop, onCreateNewExInUnit = noop, onRemoveExFromUnit = noop, onSelectExercise = noop,
  askConfirm = noop,
}: CourseExercisesPanelProps) {
  if (!unit) {
    return <div style={{ padding: "56px 20px", textAlign: "center", fontFamily: F.serif, fontSize: 19, color: C.ink2 }}>Selecciona una unidad</div>;
  }
  const exs = unitExList(unit, exercises, role);

  if (role === "teacher") {
    // Sin cabecera de unidad (el nombre ya está en la barra lateral): solo la
    // eyebrow de conteo, la pila de filas y los "añadir" al final.
    return (
      <div>
        <div style={exEyebrow}>{exs.length} {exs.length === 1 ? "ejercicio" : "ejercicios"}{unit.hidden ? " · unidad oculta" : ""}</div>
        {exs.length
          ? <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 10 }}>
              {exs.map((ex) => <TeacherExCard key={ex.id} ex={ex} isMobile={isMobile} unitId={unit.id} onSelectExercise={onSelectExercise} onRemoveExFromUnit={onRemoveExFromUnit} askConfirm={askConfirm} />)}
            </div>
          : <div style={{ marginBottom: 10 }}><EmptyExercises role={role} /></div>}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <DashedAddButton onClick={() => onCreateNewExInUnit(unit.id)}>+ Nuevo ejercicio</DashedAddButton>
          <GhostButton full onClick={() => onPickFromBank(unit.id)}>+ Añadir del banco</GhostButton>
        </div>
      </div>
    );
  }

  // alumno
  const s = unitProgress(unit, exercises, role, results);
  return (
    <div>
      <div style={exEyebrow}>{exs.length} {exs.length === 1 ? "ejercicio" : "ejercicios"} · {s.num} {s.num === 1 ? "completado" : "completados"}</div>
      {exs.length
        ? <div style={{ display: "flex", flexDirection: "column", gap: isMobile ? 9 : 10 }}>
            {exs.map((ex) => <ExerciseRow key={String(ex.id)} ex={ex} result={results[String(ex.id)]} onOpen={onExercise!} onViewCorrection={onViewCorrection} compact={isMobile} />)}
          </div>
        : <EmptyExercises role={role} />}
    </div>
  );
}

// — Menú "⋯" reutilizable (acciones de curso / unidad) —
interface KebabItem { label: string; onClick: () => void; danger?: boolean; }
export function KebabMenu({ items, size = 28, title = "Acciones" }: { items: KebabItem[]; size?: number; title?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "relative", flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
      <button onClick={() => setOpen((o) => !o)} title={title} aria-label={title} aria-haspopup="menu" aria-expanded={open}
        style={{ width: size, height: size, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", background: open ? C.field : "transparent", border: `1px solid ${open ? C.rail : "transparent"}`, color: "#888", cursor: "pointer" }}>
        <svg width={Math.round(size * 0.55)} height={Math.round(size * 0.55)} viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="4" cy="10" r="1.7" fill="currentColor" /><circle cx="10" cy="10" r="1.7" fill="currentColor" /><circle cx="16" cy="10" r="1.7" fill="currentColor" /></svg>
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
          <div role="menu" style={{ position: "absolute", top: "100%", right: 0, marginTop: 5, zIndex: 41, background: C.paper, border: `1px solid ${C.line}`, borderRadius: 10, boxShadow: "0 10px 30px rgba(0,0,0,0.14)", padding: 5, minWidth: 178, boxSizing: "border-box" }}>
            {items.map((it, i) => (
              <button key={i} role="menuitem" onClick={() => { setOpen(false); it.onClick(); }}
                style={{ width: "100%", boxSizing: "border-box", textAlign: "left", display: "block", padding: "8px 10px", borderRadius: 7, border: "none", background: "transparent", cursor: "pointer", fontFamily: F.sans, fontSize: 13, fontWeight: 500, color: it.danger ? C.danger : C.ink2 }}>
                {it.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// — Panel izquierdo: lista vertical de unidades con anillo de progreso —
// Solo el nombre de unidad (sin eyebrow "UNIDAD n"); las acciones de la unidad
// seleccionada (profesor) viven en su menú ⋯ (no en la cabecera del panel).
interface UnitsListProps {
  course: Course; units: Unit[]; exercises: Exercise[]; role: Role; results: ResultsMap;
  selUnitId: string | null; onSelectUnit: (unitId: string) => void; onCreateUnit?: (courseId: string) => void;
  onEditUnit?: (unit: Unit) => void; onUpdateUnit?: (unit: Unit) => void; onDeleteUnit?: (unitId: string, courseId: string) => void;
  onAfterDeleteUnit?: () => void; askConfirm?: AskConfirm;
}
export function UnitsList({ course, units, exercises, role, results, selUnitId, onSelectUnit, onCreateUnit = noop, onEditUnit = noop, onUpdateUnit = noop, onDeleteUnit = noop, onAfterDeleteUnit, askConfirm = noop }: UnitsListProps) {
  const cu = courseUnitList(course, units, role);
  return (
    <div>
      <div style={{ fontFamily: F.sans, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase", color: C.muted, padding: "2px 4px 10px" }}>Unidades</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {cu.length === 0
          ? <p style={{ fontFamily: F.sans, fontSize: 13, color: C.muted, margin: "2px 4px 8px" }}>Este curso no tiene unidades todavía.</p>
          : cu.map((u) => {
              const s  = unitProgress(u, exercises, role, results);
              const on = u.id === selUnitId;
              const select = () => onSelectUnit(u.id);
              return (
                <div key={u.id} onClick={select} role="button" tabIndex={0}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(); } }}
                  style={{ boxSizing: "border-box", width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "9px 10px", borderRadius: 11, border: `1px solid ${on ? C.rail : "transparent"}`, cursor: "pointer", background: on ? C.paper : "transparent", boxShadow: on ? "0 2px 10px rgba(0,0,0,0.05)" : "none" }}>
                  <ProgressRing ready={s.num} total={s.total} size={34} stroke={3.5} />
                  <span style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontFamily: F.serif, fontSize: 16, fontWeight: 600, color: on ? C.ink : C.ink2, lineHeight: 1.15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.name}</span>
                    {u.hidden && <span style={{ fontFamily: F.sans, fontSize: 9.5, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: C.muted, flexShrink: 0 }}>oculta</span>}
                  </span>
                  {role === "teacher" && on && (
                    <KebabMenu size={26} title={`Acciones de la unidad "${u.name}"`} items={[
                      { label: u.hidden ? "Mostrar a alumnos" : "Ocultar para alumnos", onClick: () => onUpdateUnit({ ...u, hidden: !u.hidden }) },
                      { label: "Editar unidad", onClick: () => onEditUnit(u) },
                      { label: "Eliminar unidad", danger: true, onClick: () => askConfirm(`¿Eliminar la unidad "${u.name}"?\n\nLos ejercicios no se eliminarán del banco global.`, () => { onDeleteUnit(u.id, course.id); onAfterDeleteUnit?.(); }) },
                    ]} />
                  )}
                </div>
              );
            })}
        {role === "teacher" && <div style={{ marginTop: 4 }}><DashedAddButton onClick={() => onCreateUnit(course.id)}>+ Nueva unidad</DashedAddButton></div>}
      </div>
    </div>
  );
}

// ── Página 2 · Detalle del curso (escritorio): barra + dos paneles ───────────
interface CourseDetailProps extends CoursesCallbacks {
  role: Role;
  courses: Course[];
  courseId: string;
  units: Unit[];
  exercises: Exercise[];
  results: ResultsMap;
  groups?: Group[];
  selUnitId: string | null;
  setSelUnitId: (id: string | null) => void;
  onBack: () => void;
  onSwitch: (courseId: string) => void;
}
export function CourseDetail({
  role, courses, courseId, units, exercises, results, groups,
  selUnitId, setSelUnitId, onBack, onSwitch,
  onUpdateCourse = noop, onEditCourse = noop, onDeleteCourse = noop,
  onCreateUnit = noop, onEditUnit, onDeleteUnit, onUpdateUnit,
  onPickFromBank, onCreateNewExInUnit, onRemoveExFromUnit, onSelectExercise,
  onExercise, onViewCorrection, askConfirm = noop,
}: CourseDetailProps) {
  const course = courses.find((c) => c.id === courseId);
  if (!course) return null;
  const cu   = courseUnitList(course, units, role);
  const unit = cu.find((u) => u.id === selUnitId) || cu[0] || null;
  return (
    <div style={{ fontFamily: F.sans }}>
      {/* Barra de título: nombre del curso (izq) + "Volver a cursos" (der). Sin
          borde 2px ni barra de progreso; las acciones del curso van en el menú ⋯. */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: course.description ? 10 : 20 }}>
        <CourseDropdown courses={courses} currentId={courseId} role={role} units={units} exercises={exercises} results={results} onSwitch={onSwitch} />
        {role === "teacher" && <CourseVisBadge course={course} groups={groups} />}
        <span style={{ flex: 1 }} />
        {role === "teacher" && (
          <KebabMenu title={`Acciones del curso "${course.name}"`} items={[
            { label: course.hidden ? "Mostrar a alumnos" : "Ocultar para alumnos", onClick: () => onUpdateCourse({ ...course, hidden: !course.hidden }) },
            { label: "Editar curso", onClick: () => onEditCourse(course) },
            { label: "Eliminar curso", danger: true, onClick: () => askConfirm(`¿Eliminar el curso "${course.name}"?\n\nLas unidades y ejercicios no se eliminarán.`, () => { onDeleteCourse(course.id); onBack(); }) },
          ]} />
        )}
        <button onClick={onBack} style={{ font: "inherit", display: "inline-flex", alignItems: "center", gap: 5, background: "transparent", border: "none", padding: 0, color: "#888", fontFamily: F.sans, fontSize: 13, fontWeight: 600, cursor: "pointer", flexShrink: 0 }}>
          <ChevronLeftIcon size={13} color="#888" /> Volver a cursos
        </button>
      </div>
      {course.description && <div style={{ fontFamily: F.sans, fontSize: 13, color: "#888", margin: "-4px 0 18px" }}>{course.description}</div>}

      {/* Dos columnas: barra lateral de unidades (210px) + pila de ejercicios (sin tarjeta) */}
      <div style={{ display: "grid", gridTemplateColumns: "210px 1fr", gap: 18, alignItems: "start" }}>
        <UnitsList course={course} units={units} exercises={exercises} role={role} results={results} selUnitId={unit?.id ?? null} onSelectUnit={setSelUnitId} onCreateUnit={onCreateUnit}
          onEditUnit={onEditUnit} onUpdateUnit={onUpdateUnit} onDeleteUnit={onDeleteUnit} onAfterDeleteUnit={() => setSelUnitId(null)} askConfirm={askConfirm} />
        <div style={{ minWidth: 0 }}>
          <CourseExercisesPanel
            unit={unit} course={course} exercises={exercises} role={role} results={results} isMobile={false}
            onExercise={onExercise} onViewCorrection={onViewCorrection}
            onPickFromBank={onPickFromBank} onCreateNewExInUnit={onCreateNewExInUnit} onRemoveExFromUnit={onRemoveExFromUnit} onSelectExercise={onSelectExercise}
            askConfirm={askConfirm} />
        </div>
      </div>
    </div>
  );
}

// ── Móvil: flujo de 3 niveles (push) ─────────────────────────────────────────
export function MobileTopBar({ title, onBack }: { title: string; onBack?: () => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, paddingBottom: 12, marginBottom: 14, borderBottom: `1px solid ${C.line}` }}>
      {onBack && <button onClick={onBack} aria-label="Volver" style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${C.line}`, background: C.paper, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, color: C.ink }}><ChevronLeftIcon size={12} /></button>}
      <span style={{ flex: 1, minWidth: 0, fontFamily: F.sans, fontSize: 13, fontWeight: 600, color: "#555", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</span>
    </div>
  );
}

export function MobileCoursesScreen({ role, courses, units, exercises, results, groups, onOpenCourse, onCreateCourse }: CoursesData & { onOpenCourse: (courseId: string) => void; onCreateCourse?: () => void }) {
  return (
    <div style={{ fontFamily: F.sans }}>
      {/* Sin segundo encabezado "Cursos" (la cabecera + pestañas ya dan contexto). */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
        <span style={{ fontFamily: F.sans, fontSize: 12.5, color: C.muted }}>{courses.length} {courses.length === 1 ? "curso" : "cursos"}</span>
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

interface MobileUnitsScreenProps {
  role: Role;
  course: Course;
  units: Unit[];
  exercises: Exercise[];
  results: ResultsMap;
  groups?: Group[];
  onBack: () => void;
  onOpenUnit: (unitId: string) => void;
  onCreateUnit?: (courseId: string) => void;
  onUpdateCourse?: (course: Course) => void;
  onEditCourse?: (course: Course) => void;
  onDeleteCourse?: (courseId: string) => void;
  onAfterDeleteCourse?: () => void;
  askConfirm?: AskConfirm;
}
export function MobileUnitsScreen({
  role, course, units, exercises, results, groups,
  onBack, onOpenUnit, onCreateUnit = noop,
  onUpdateCourse = noop, onEditCourse = noop, onDeleteCourse = noop, onAfterDeleteCourse, askConfirm = noop,
}: MobileUnitsScreenProps) {
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
            <DeleteIconButton onClick={() => askConfirm(`¿Eliminar el curso "${course.name}"?\n\nLas unidades y ejercicios no se eliminarán.`, () => { onDeleteCourse(course.id); onAfterDeleteCourse?.(); })} title={`Eliminar curso "${course.name}"`} />
          </div>
        )}
      </div>
      <div style={{ fontFamily: F.sans, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase", color: C.muted, padding: "2px 2px 10px" }}>Unidades</div>
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

type PanelCallbacks = Omit<CourseExercisesPanelProps, "unit" | "course" | "exercises" | "role" | "results" | "isMobile" | "onEditUnit" | "onUpdateUnit" | "onDeleteUnit" | "onAfterDeleteUnit">;
interface MobileExercisesScreenProps {
  role: Role; course: Course; unit: Unit | null; units: Unit[]; exercises: Exercise[]; results: ResultsMap;
  onBack: () => void; onOpenUnit: (unitId: string) => void; panelProps: PanelCallbacks;
  onEditUnit?: (unit: Unit) => void; onUpdateUnit?: (unit: Unit) => void; onDeleteUnit?: (unitId: string, courseId: string) => void; onAfterDeleteUnit?: () => void; askConfirm?: AskConfirm;
}
export function MobileExercisesScreen({ role, course, unit, units, exercises, results, onBack, onOpenUnit, panelProps, onEditUnit = noop, onUpdateUnit = noop, onDeleteUnit = noop, onAfterDeleteUnit, askConfirm = noop }: MobileExercisesScreenProps) {
  const cu = courseUnitList(course, units, role);
  return (
    <div style={{ fontFamily: F.sans }}>
      {/* Breadcrumb Curso ⟩ Unidad + (profesor) acciones de la unidad en ⋯ */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, paddingBottom: 12, marginBottom: 6, borderBottom: `1px solid ${C.line}` }}>
        <button onClick={onBack} aria-label="Volver" style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${C.line}`, background: C.paper, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, color: C.ink }}><ChevronLeftIcon size={12} /></button>
        <span style={{ flex: 1, minWidth: 0, fontFamily: F.sans, fontSize: 12.5, fontWeight: 600, color: "#555", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {course.name}{unit ? <> <span style={{ color: "#d8d8d2" }}>⟩</span> {unit.name}</> : null}
        </span>
        {role === "teacher" && unit && (
          <KebabMenu size={28} title={`Acciones de la unidad "${unit.name}"`} items={[
            { label: unit.hidden ? "Mostrar a alumnos" : "Ocultar para alumnos", onClick: () => onUpdateUnit({ ...unit, hidden: !unit.hidden }) },
            { label: "Editar unidad", onClick: () => onEditUnit(unit) },
            { label: "Eliminar unidad", danger: true, onClick: () => askConfirm(`¿Eliminar la unidad "${unit.name}"?\n\nLos ejercicios no se eliminarán del banco global.`, () => { onDeleteUnit(unit.id, course.id); onAfterDeleteUnit?.(); }) },
          ]} />
        )}
      </div>
      {/* Chips de unidades (scroll horizontal): cambia de unidad sin volver atrás */}
      {cu.length > 1 && (
        <div className="fa-noscroll" style={{ display: "flex", gap: 6, overflowX: "auto", padding: "12px 0 14px", WebkitOverflowScrolling: "touch", scrollbarWidth: "none" }}>
          {cu.map((u) => {
            const s = unitProgress(u, exercises, role, results);
            const on = !!unit && u.id === unit.id;
            const done = s.total > 0 && s.num === s.total;
            const label = (role === "student" && done && !on) ? `✓ ${u.name}` : `${u.name} · ${s.num}/${s.total}`;
            return (
              <button key={u.id} onClick={() => onOpenUnit(u.id)}
                style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 20, background: on ? C.ink : C.paper2, color: on ? "#fff" : "#555", border: "none", fontFamily: F.sans, fontSize: 11.5, fontWeight: on ? 600 : 500, whiteSpace: "nowrap", cursor: "pointer" }}>
                {label}
              </button>
            );
          })}
        </div>
      )}
      <CourseExercisesPanel unit={unit} course={course} exercises={exercises} role={role} results={results} isMobile {...panelProps} />
    </div>
  );
}

// Props del orquestador de cursos (recibe datos + todos los callbacks del padre).
type CoursesPagesProps = CoursesData & CoursesCallbacks;

type MobileNav = { level: "courses" | "units" | "exercises"; courseId: string | null; unitId: string | null };

export function MobileCoursesFlow(props: CoursesPagesProps) {
  const { role, courses, units, exercises, results, groups } = props;
  const [nav, setNav] = useState<MobileNav>({ level: "courses", courseId: null, unitId: null });
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
  return <MobileExercisesScreen role={role} course={course} unit={unit} units={units} exercises={exercises} results={results}
    onBack={() => setNav({ ...nav, level: "units", unitId: null })}
    onOpenUnit={(unitId) => setNav({ ...nav, level: "exercises", unitId })}
    onEditUnit={props.onEditUnit} onUpdateUnit={props.onUpdateUnit} onDeleteUnit={props.onDeleteUnit}
    onAfterDeleteUnit={() => setNav({ ...nav, level: "units", unitId: null })} askConfirm={props.askConfirm}
    panelProps={{
      onExercise: props.onExercise, onViewCorrection: props.onViewCorrection,
      onPickFromBank: props.onPickFromBank, onCreateNewExInUnit: props.onCreateNewExInUnit, onRemoveExFromUnit: props.onRemoveExFromUnit, onSelectExercise: props.onSelectExercise,
      askConfirm: props.askConfirm,
    }} />;
}

// — Orquestador: páginas (escritorio) o flujo de niveles (móvil) —
export function CoursesPages(props: CoursesPagesProps) {
  const { role, courses, units } = props;
  const isMobile = useIsMobile();
  const [page, setPage]           = useState<{ name: "list" | "detail"; courseId: string | null }>({ name: "list", courseId: null });
  const [selUnitId, setSelUnitId] = useState<string | null>(null);

  const openCourse = (courseId: string) => {
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
  return <CourseDetail {...props} courseId={current.id} selUnitId={selUnitId} setSelUnitId={setSelUnitId}
    onBack={() => setPage({ name: "list", courseId: null })} onSwitch={openCourse} />;
}

// ── Pestaña: Cursos (profesor) — ahora delega en CoursesPages ────────────────
export function CoursesTab(props: Omit<CoursesPagesProps, "role">) {
  return <CoursesPages role="teacher" {...props} />;
}
