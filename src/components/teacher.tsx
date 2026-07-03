// ═══ VISTAS DEL PROFESOR ══════════════════════════════════════════════════════
// Dashboard del profesor, pestañas (ejercicios, cursos, alumnos, categorías,
// audios, ajustes, usuarios), vista de cursos, ExerciseDetailView y
// QuestionManagerView. Extraídas de App.jsx (Fase 2). TODO: subdividir en teacher/ y courses/.
import { useState, useRef, useMemo } from "react";
import type { Exercise, Category, Course, Unit, Group, ExerciseResult } from "../lib/types.js";
import { C, F, S, FONT_SANS, FONT_MONO, SECTION_STYLE } from "../theme/tokens.js";
import { textOn } from "../lib/color.js";
import { fmt } from "../lib/ids.js";
import { SCHEMA_PALETTES, SCHEMA_PALETTE_DEFAULT, effectivePaletteId, applyPaletteToExercise } from "../lib/palette.js";
import { categoriesOf, modelsOf, audioComposers, audioTags, resultStatusOf, keyReadyOf, durationOf, questionsCountOf } from "../lib/domain.js";
import { modelMeta } from "../lib/modelMeta.js";
import { useIsMobile } from "../hooks/useIsMobile.js";
import { rowButtonProps } from "../lib/a11y.js";
import { ConfirmModal, TabBar, ScoreBadge, Chevron, StatusCircle, CategoryDots, EyeButton, EditIconButton, DeleteIconButton, FilterDropdown, TeacherFilterBar, Overline, GhostButton, CtaButton, MetaItem } from "./primitives.jsx";
import { ExercisePlate } from "./TypePlate.jsx";
import { CorrectionView } from "./CorrectionView.jsx";
import { CategoryEditorModal, GroupEditorModal, CourseFormModal, UnitFormModal, ExercisePickerModal, AddUserModal, ResetCredentialModal, AudioLibraryFormModal, type AudioItem } from "./modals.js";
import { CoursesTab } from "./courses.js";
import { ExerciseDetailView } from "./ExerciseDetailView.js";

// ── Tipos compartidos de las vistas del profesor ─────────────────────────────
// El id de ejercicio es opcional en el modelo (semillas/datos), así que lo
// reflejamos aquí para no esparcir aserciones por todas las vistas.
type ExId = string | number | undefined;
type AskConfirm = (message: string, onConfirm: () => void, confirmLabel?: string) => void;
// Perfil de usuario (profesor/alumno/admin) tal como lo consumen estas vistas.
interface User {
  id: string;
  displayName?: string;
  username?: string;
  role?: string;
  credType?: string;
  teacherId?: string;
  createdBy?: string;
  defaultPalette?: string;
  [k: string]: unknown;
}

// ── Pestaña: Ejercicios ────────────────────────────────────────────────────
interface TeacherExerciseRowProps {
  ex: Exercise;
  onSelect: (id: ExId) => void;
  onDelete: (ex: Exercise) => void;
  onToggleVisibility: (ex: Exercise) => void;
  composerName?: string | null;
}
export function TeacherExerciseRow({ ex, onSelect, onDelete, onToggleVisibility, composerName }: TeacherExerciseRowProps) {
  const [open, setOpen] = useState(false);
  const meta    = modelMeta(ex);
  const hasQuiz = modelsOf(ex).includes("cuestionario");
  const exQsN   = questionsCountOf(ex);
  const allBtns = categoriesOf(ex).flatMap((c) => c.buttons || []);
  const keyReady = keyReadyOf(ex);
  const isHidden = !!ex.hidden;

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0, background: C.paper, border: `1px solid ${C.line}`, borderRadius: 14, overflow: "hidden", opacity: isHidden ? 0.55 : 1, transition: "opacity .2s" }}>
      <div onClick={() => setOpen((o) => !o)} {...rowButtonProps(() => setOpen((o) => !o))} aria-expanded={open}
        style={{ display: "flex", alignItems: "center", gap: 14, minHeight: 66, boxSizing: "border-box", padding: "12px 16px", cursor: "pointer", userSelect: "none" }}>
        <ExercisePlate ex={ex} size={36} radius={10} />
        <div style={{ flex: 1, minWidth: 0, fontFamily: F.serif, fontSize: 17, fontWeight: 600, color: isHidden ? C.muted : C.ink, lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{ex.title}</div>
        {isHidden && <span style={{ fontSize: 10, color: C.muted, fontFamily: FONT_SANS, fontWeight: 600, letterSpacing: "0.08em", flexShrink: 0 }}>OCULTO</span>}
        <Chevron open={open} />
      </div>
      <div className={`fa-expand${open ? " fa-open" : ""}`}>
        <div className="fa-expand-inner">
          <div style={{ borderTop: `1px solid ${C.line}`, padding: "11px 16px 14px", display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: "12px 22px", background: C.bg }}>
            <MetaItem label="Tipo"><span style={{ width: 7, height: 7, borderRadius: "50%", background: meta.color }} />{meta.label}</MetaItem>
            <MetaItem label="Duración">{fmt(durationOf(ex))}</MetaItem>
            {hasQuiz && <MetaItem label="Preguntas">{exQsN || "—"}</MetaItem>}
            {allBtns.length > 0 && <MetaItem label="Categorías"><CategoryDots buttons={allBtns} /></MetaItem>}
            {composerName && <MetaItem label="Compositor"><span style={{ fontStyle: "italic" }}>{composerName}</span></MetaItem>}
            <MetaItem label="Clave de corrección">
              <StatusCircle done={keyReady} size={13} />
              <span style={{ color: keyReady ? C.ink : C.muted }}>{keyReady ? "Configurada" : "Pendiente"}</span>
            </MetaItem>
            <MetaItem label="Visible para alumnos">
              <span style={{ color: isHidden ? C.danger : C.fnT }}>{isHidden ? "No" : "Sí"}</span>
            </MetaItem>
            {/* Acciones (mostrar/ocultar, editar, eliminar) dentro del desplegable */}
            <div onClick={(e) => e.stopPropagation()} style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
              <EyeButton visible={!isHidden} onClick={() => onToggleVisibility(ex)} />
              <EditIconButton onClick={() => onSelect(ex.id)} title={`Editar "${ex.title}"`} />
              <DeleteIconButton onClick={() => onDelete(ex)} title={`Eliminar "${ex.title}"`} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Versión "tarjeta" de la fila de ejercicio para la vista de ordenador (rejilla).
// Mismo contenido y comportamiento que TeacherExerciseRow, pero dispuesto como
// tarjeta. El tipo del ejercicio se comunica con la placa (icono + color).
export function TeacherExerciseCard({ ex, onSelect, onDelete, onToggleVisibility, composerName }: TeacherExerciseRowProps) {
  const [open, setOpen]   = useState(false);
  const [hover, setHover] = useState(false);
  const meta    = modelMeta(ex);
  const hasQuiz = modelsOf(ex).includes("cuestionario");
  const exQsN   = questionsCountOf(ex);
  const allBtns = categoriesOf(ex).flatMap((c) => c.buttons || []);
  const keyReady = keyReadyOf(ex);
  const isHidden = !!ex.hidden;

  // Alto mínimo de la cabecera → rejilla regular (placa + título + estado).
  const HEAD_H = 76;

  return (
    <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ display: "flex", flexDirection: "column", boxSizing: "border-box", background: C.paper, border: `1px solid ${hover ? C.rail : C.line}`, borderRadius: 14, overflow: "hidden", opacity: isHidden ? 0.6 : 1, boxShadow: hover ? "0 6px 20px rgba(26,25,21,0.09)" : "none", transition: "box-shadow .18s, border-color .18s, opacity .2s" }}>
      <div onClick={() => setOpen((o) => !o)} {...rowButtonProps(() => setOpen((o) => !o))} aria-expanded={open}
        style={{ display: "flex", alignItems: "center", gap: 12, minHeight: HEAD_H, boxSizing: "border-box", padding: "14px 16px", cursor: "pointer", userSelect: "none" }}>
        <ExercisePlate ex={ex} size={38} radius={10} />
        <div style={{ flex: 1, minWidth: 0, fontFamily: F.serif, fontSize: 17, fontWeight: 600, color: isHidden ? C.muted : C.ink, lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{ex.title}</div>
        {isHidden && <span style={{ fontSize: 10, color: C.muted, fontFamily: FONT_SANS, fontWeight: 600, letterSpacing: "0.08em", flexShrink: 0 }}>OCULTO</span>}
        <Chevron open={open} />
      </div>
      <div className={`fa-expand${open ? " fa-open" : ""}`}>
        <div className="fa-expand-inner">
          <div style={{ borderTop: `1px solid ${C.line}`, padding: "11px 18px 14px", display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: "12px 22px", background: C.bg }}>
            <MetaItem label="Tipo"><span style={{ width: 7, height: 7, borderRadius: "50%", background: meta.color }} />{meta.label}</MetaItem>
            <MetaItem label="Duración">{fmt(durationOf(ex))}</MetaItem>
            {hasQuiz && <MetaItem label="Preguntas">{exQsN || "—"}</MetaItem>}
            {allBtns.length > 0 && <MetaItem label="Categorías"><CategoryDots buttons={allBtns} /></MetaItem>}
            {composerName && <MetaItem label="Compositor"><span style={{ fontStyle: "italic" }}>{composerName}</span></MetaItem>}
            <MetaItem label="Clave de corrección">
              <StatusCircle done={keyReady} size={13} />
              <span style={{ color: keyReady ? C.ink : C.muted }}>{keyReady ? "Configurada" : "Pendiente"}</span>
            </MetaItem>
            <MetaItem label="Visible para alumnos">
              <span style={{ color: isHidden ? C.danger : C.fnT }}>{isHidden ? "No" : "Sí"}</span>
            </MetaItem>
            {/* Acciones (mostrar/ocultar, editar, eliminar) dentro del desplegable */}
            <div onClick={(e) => e.stopPropagation()} style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
              <EyeButton visible={!isHidden} onClick={() => onToggleVisibility(ex)} />
              <EditIconButton onClick={() => onSelect(ex.id)} title={`Editar "${ex.title}"`} />
              <DeleteIconButton onClick={() => onDelete(ex)} title={`Eliminar "${ex.title}"`} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface ExercisesTabProps {
  exercises: Exercise[];
  audioLibrary?: AudioItem[];
  onNew: () => void;
  onSelect: (id: ExId) => void;
  onToggleVisibility: (ex: Exercise) => void;
  askConfirm: AskConfirm;
  onDelete: (id: ExId) => void;
}
export function ExercisesTab({ exercises, audioLibrary = [], onNew, onSelect, onToggleVisibility, askConfirm, onDelete }: ExercisesTabProps) {
  const isMobile = useIsMobile();
  const [filterModel,     setFilterModel]     = useState("all");
  const [filterComposers, setFilterComposers] = useState<string[]>([]);
  const [filterTags,      setFilterTags]      = useState<string[]>([]);

  // Derivar compositores y etiquetas únicas de la biblioteca de audios
  const allComposers = useMemo(() => audioComposers(audioLibrary), [audioLibrary]);
  const allTags      = useMemo(() => audioTags(audioLibrary),      [audioLibrary]);
  // Mapa rápido URL → audio
  const audioByUrl = useMemo(() => {
    const m: Record<string, AudioItem> = {};
    audioLibrary.forEach((a) => { if (a.url) m[a.url] = a; });
    return m;
  }, [audioLibrary]);

  const filtered = useMemo(() => {
    return exercises.filter((ex) => {
      if (filterModel !== "all" && !modelsOf(ex).includes(filterModel)) return false;
      if (filterComposers.length > 0 || filterTags.length > 0) {
        const audio = ex.audioUrl ? audioByUrl[ex.audioUrl as string] : null;
        if (filterComposers.length > 0 && (!audio || !filterComposers.includes(audio.composer ?? ""))) return false;
        if (filterTags.length > 0) {
          const aTags = audio?.tags || [];
          if (!filterTags.every((t) => aTags.includes(t))) return false;
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
  const hiddenCount   = useMemo(() => exercises.filter((e) => e.hidden).length, [exercises]);

  return (
    <>
      {exercises.length > 0 && (
        <div style={{ fontFamily: F.sans, fontSize: 12.5, color: C.muted, marginBottom: 12 }}>
          {exercises.length} {exercises.length === 1 ? "ejercicio" : "ejercicios"}
          {hiddenCount > 0 && ` · ${hiddenCount} ${hiddenCount === 1 ? "oculto" : "ocultos"}`}
        </div>
      )}
      {showFilterBar
        ? <TeacherFilterBar
            filterModel={filterModel}       setFilterModel={setFilterModel}
            allComposers={allComposers}     filterComposers={filterComposers} setFilterComposers={setFilterComposers}
            allTags={allTags}               filterTags={filterTags}           setFilterTags={setFilterTags}
            trailing={<CtaButton onClick={onNew}>+ Nuevo ejercicio</CtaButton>}
          />
        : <div style={{ marginBottom: 14 }}><CtaButton onClick={onNew}>+ Nuevo ejercicio</CtaButton></div>}
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
          : isMobile
            ? <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {filtered.map((ex) => (
                  <TeacherExerciseRow key={String(ex.id)} ex={ex} onSelect={onSelect}
                    composerName={ex.audioUrl ? (audioByUrl[ex.audioUrl as string]?.composer || null) : null}
                    onToggleVisibility={onToggleVisibility}
                    onDelete={(e) => askConfirm(`¿Eliminar "${e.title}"?`, () => onDelete(e.id as ExId))} />
                ))}
              </div>
            : <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16, alignItems: "start" }}>
                {filtered.map((ex) => (
                  <TeacherExerciseCard key={String(ex.id)} ex={ex} onSelect={onSelect}
                    composerName={ex.audioUrl ? (audioByUrl[ex.audioUrl as string]?.composer || null) : null}
                    onToggleVisibility={onToggleVisibility}
                    onDelete={(e) => askConfirm(`¿Eliminar "${e.title}"?`, () => onDelete(e.id as ExId))} />
                ))}
              </div>}
    </>
  );
}

// ── Pestaña: Alumnos ──────────────────────────────────────────────────────
interface StudentsTabProps {
  students: User[];
  exercises: Exercise[];
  results: Record<string, Record<string, ExerciseResult>>;
  groups: Group[];
  onAddStudent: () => void;
  onResetCred: (s: User) => void;
  onRemove: (id: string) => void;
  askConfirm: AskConfirm;
  onViewAnswer: (student: User, exercise: Exercise, result: ExerciseResult) => void;
  onEditGroup: (g: Group | null) => void;
  onDeleteGroup: (id: string) => void;
}
export function StudentsTab({ students, exercises, results, groups, onAddStudent, onResetCred, onRemove, askConfirm, onViewAnswer, onEditGroup, onDeleteGroup }: StudentsTabProps) {
  const [expandedStudents, setExpandedStudents] = useState<Set<string>>(new Set());
  const [expandedGroups,   setExpandedGroups]   = useState<Set<string>>(() => new Set(groups.map((g) => g.id)));
  const toggleExpand = (id: string) =>
    setExpandedStudents((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleGroup = (id: string) =>
    setExpandedGroups((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const renderStudentCard = (s: User) => {
    const sRes    = results[s.id] || {};
    const isOpen  = expandedStudents.has(s.id);
    const doneExs = exercises.filter((ex) => sRes[String(ex.id)]);
    return (
      <div
        key={s.id}
        onClick={() => exercises.length > 0 && toggleExpand(s.id)}
        {...(exercises.length > 0 ? { ...rowButtonProps(() => toggleExpand(s.id)), "aria-expanded": isOpen } : {})}
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
                    const r = sRes[String(ex.id)];
                    return (
                      <div key={ex.id} style={{ ...S.row, justifyContent: "space-between", paddingBottom: 6, borderBottom: `1px solid ${C.line}`, marginBottom: 6 }}>
                        <span style={{ fontSize: 13, color: C.muted2, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingRight: 8 }}>{ex.title}</span>
                        <div style={{ ...S.row, gap: 6, flexShrink: 0 }}>
                          <ScoreBadge score={r.score} status={resultStatusOf(r, ex)} />
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
              onClick={() => toggleGroup(group.id)} {...rowButtonProps(() => toggleGroup(group.id))} aria-expanded={isGroupOpen}
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
interface CategoriesTabProps {
  categories: Category[];
  isAdmin: boolean;
  onAdd: () => void;
  onEdit: (m: Category) => void;
  onDelete: (id: string) => void;
  onToggleGlobal: (id: string) => void;
  askConfirm: AskConfirm;
}
export function CategoriesTab({ categories, isAdmin, onAdd, onEdit, onDelete, onToggleGlobal, askConfirm }: CategoriesTabProps) {
  const isMobile = useIsMobile();
  const renderCategory = (m: Category, asCard: boolean) => {
    const isGlobal = Boolean(m.builtIn || m.global);
    const canEdit  = isAdmin || !isGlobal;
    const canDel   = isAdmin ? m.id !== "default" : !isGlobal;
    const cardStyle = asCard
      ? { boxSizing: "border-box" as const, background: C.paper, border: `1px solid ${C.line}`, borderRadius: 14, padding: "16px 18px 14px", display: "flex", flexDirection: "column" as const, gap: 12 }
      : S.card;
    return (
      <div key={m.id} style={cardStyle}>
        <div style={{ ...S.row, justifyContent: "space-between", marginBottom: asCard ? 0 : 6, gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 200px", minWidth: 0 }}>
            <div style={{ ...S.row, gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
              <span style={{ fontFamily: asCard ? F.serif : F.sans, fontSize: asCard ? 19 : 15, fontWeight: 600, letterSpacing: asCard ? "-0.01em" : undefined }}>{m.name}</span>
              {isGlobal && (
                <span style={{ ...S.badge, background: "#e8f0fe", color: "#1a56db", border: "1px solid #bfcfef" }}>
                  ⭐ Predeterminada
                </span>
              )}
            </div>
            <div style={{ ...S.row, gap: 6, flexWrap: "wrap" }}>
              {(m.buttons || []).map((b) => (
                <span key={b.id} style={{ ...S.badge, background: b.color, color: textOn(b.color), fontSize: 10 }}>
                  {b.id} · {b.name} [{(b.key ?? "").toUpperCase()}]
                </span>
              ))}
            </div>
          </div>
          <div style={{ ...S.row, gap: 6, flexWrap: "wrap", justifyContent: asCard ? "flex-start" : "flex-end", marginTop: asCard ? 4 : 0 }}>
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
  };
  return (
    <>
      <button onClick={onAdd} style={{ ...S.btnPrimary, marginBottom: 16 }}>+ Crear categoría</button>
      <p style={{ color: C.muted, fontSize: 12, marginTop: -8, marginBottom: 16 }}>
        Las categorías definen los botones del modelo Interactivo. Editar o eliminar una categoría no afecta a los ejercicios ya creados.
      </p>

      {isMobile
        ? categories.map((m) => renderCategory(m, false))
        : <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14, alignItems: "start" }}>
            {categories.map((m) => renderCategory(m, true))}
          </div>}
    </>
  );
}

// ── Pestaña: Audios (almacén) ─────────────────────────────────────────────
interface AudiosTabProps {
  audioLibrary: AudioItem[];
  isAdmin: boolean;
  onAdd: () => void;
  onEdit: (a: AudioItem) => void;
  onDelete: (id: string) => void;
  askConfirm: AskConfirm;
}
// Tarjeta de audio para la vista de ordenador (rejilla). Equivale a la fila de
// audio pero en formato tarjeta, con título en serif y compositor en cursiva.
interface AudioCardProps {
  audio: AudioItem;
  isAdmin: boolean;
  isOpen: boolean;
  isPrev: boolean;
  onToggleOpen: () => void;
  onTogglePrev: () => void;
  onEdit: (a: AudioItem) => void;
  onDelete: (id: string) => void;
  askConfirm: AskConfirm;
}
function AudioCard({ audio, isAdmin, isOpen, isPrev, onToggleOpen, onTogglePrev, onEdit, onDelete, askConfirm }: AudioCardProps) {
  const [hover, setHover] = useState(false);
  return (
    <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ display: "flex", flexDirection: "column", boxSizing: "border-box", background: C.paper, border: `1px solid ${hover ? C.rail : C.line}`, borderRadius: 14, overflow: "hidden", boxShadow: hover ? "0 6px 20px rgba(26,25,21,0.09)" : "none", transition: "box-shadow .18s, border-color .18s" }}>
      <div onClick={onToggleOpen} {...rowButtonProps(onToggleOpen)} aria-expanded={isOpen}
        style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "16px 16px 15px", cursor: "pointer", userSelect: "none" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: F.serif, fontSize: 21, fontWeight: 600, color: C.ink, lineHeight: 1.12, letterSpacing: "-0.01em", overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{audio.title}</div>
          {audio.composer && (
            <div style={{ fontFamily: F.serif, fontStyle: "italic", fontSize: 14, color: C.ink2, marginTop: 8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{audio.composer}</div>
          )}
          <div style={{ fontFamily: F.sans, fontSize: 11.5, color: C.muted, marginTop: 6 }}>{fmt(audio.duration ?? 0)}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <button onClick={() => { onTogglePrev(); if (!isOpen) onToggleOpen(); }} style={{ ...S.btn, padding: "5px 11px", fontSize: 12 }}>{isPrev ? "⏹" : "▶"}</button>
            {isAdmin && hover && (
              <>
                <button onClick={() => onEdit(audio)} style={{ ...S.btn, padding: "5px 10px", fontSize: 12 }}>Editar</button>
                <button onClick={() => askConfirm(`¿Eliminar "${audio.title}" del almacén?\n\nLos ejercicios que ya lo usan conservarán su enlace.`, () => onDelete(audio.id))}
                  style={{ ...S.btnDanger, padding: "5px 10px", fontSize: 12 }}>Eliminar</button>
              </>
            )}
          </div>
          <Chevron open={isOpen} />
        </div>
      </div>
      {isOpen && (
        <div style={{ borderTop: `1px solid ${C.line}`, padding: "11px 16px 14px", background: C.bg }}>
          {audio.description && (
            <p style={{ margin: "0 0 10px", fontSize: 13, color: C.muted, lineHeight: 1.5 }}>{audio.description}</p>
          )}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            <span style={{ ...S.badge, background: C.paper2, color: C.muted, fontSize: 10, maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{audio.url}</span>
            {(audio.tags || []).map((tag) => (
              <span key={tag} style={{ ...S.badge, background: "rgba(154,79,184,0.10)", color: C.fnI, fontSize: 10 }}>{tag}</span>
            ))}
          </div>
          {isPrev && (
            <audio key={audio.id} src={audio.url} controls autoPlay style={{ width: "100%", marginTop: 12, height: 36 }} />
          )}
        </div>
      )}
    </div>
  );
}

export function AudiosTab({ audioLibrary, isAdmin, onAdd, onEdit, onDelete, askConfirm }: AudiosTabProps) {
  const isMobile = useIsMobile();
  const [openId,          setOpenId]          = useState<string | null>(null);
  const [previewId,       setPreviewId]       = useState<string | null>(null);
  const [filterComposers, setFilterComposers] = useState<string[]>([]);
  const [filterTags,      setFilterTags]      = useState<string[]>([]);

  // Opciones únicas para los dropdowns
  const allComposers = useMemo(() => audioComposers(audioLibrary), [audioLibrary]);
  const allTags      = useMemo(() => audioTags(audioLibrary),      [audioLibrary]);

  // Lista filtrada
  const filtered = useMemo(() => {
    if (filterComposers.length === 0 && filterTags.length === 0) return audioLibrary;
    return audioLibrary.filter((a) => {
      if (filterComposers.length > 0 && !filterComposers.includes(a.composer ?? "")) return false;
      if (filterTags.length > 0) {
        const aTags = a.tags || [];
        if (!filterTags.every((t) => aTags.includes(t))) return false;
      }
      return true;
    });
  }, [audioLibrary, filterComposers, filterTags]);

  const hasFilters = filterComposers.length > 0 || filterTags.length > 0;

  const toggleComposer = (val: string) => setFilterComposers((p) => p.includes(val) ? p.filter((x) => x !== val) : [...p, val]);
  const toggleTag      = (val: string) => setFilterTags((p) => p.includes(val) ? p.filter((x) => x !== val) : [...p, val]);

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

      {!isMobile ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14, alignItems: "start" }}>
          {filtered.map((audio) => (
            <AudioCard key={audio.id} audio={audio} isAdmin={isAdmin}
              isOpen={openId === audio.id} isPrev={previewId === audio.id}
              onToggleOpen={() => setOpenId(openId === audio.id ? null : audio.id)}
              onTogglePrev={() => setPreviewId(previewId === audio.id ? null : audio.id)}
              onEdit={onEdit} onDelete={onDelete} askConfirm={askConfirm} />
          ))}
        </div>
      ) : (
      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {filtered.map((audio) => {
          const isOpen = openId === audio.id;
          const isPrev = previewId === audio.id;
          return (
            <div key={audio.id} style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 8, overflow: "hidden" }}>
              {/* ── Cabecera siempre visible ── */}
              <div
                onClick={() => setOpenId(isOpen ? null : audio.id)} {...rowButtonProps(() => setOpenId(isOpen ? null : audio.id))} aria-expanded={isOpen}
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
                    <span style={{ ...S.badge, background: C.line, color: C.muted, fontFamily: FONT_MONO }}>{fmt(audio.duration ?? 0)}</span>
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
      )}
    </>
  );
}

// ── Pestaña: Ajustes ──────────────────────────────────────────────────────
interface SettingsTabProps {
  margin: number;
  onMargin: (v: number) => void;
  currentUser: User | null;
  onUpdateUser: (u: User) => void;
}
export function SettingsTab({ margin, onMargin, currentUser, onUpdateUser }: SettingsTabProps) {
  const current = currentUser?.defaultPalette || SCHEMA_PALETTE_DEFAULT;
  const setPalette = (id: string) => { if (currentUser) onUpdateUser({ ...currentUser, defaultPalette: id }); };
  return (
    <>
      <div style={S.card}>
        <label style={S.label}>Margen de error (segundos) — para ejercicios Interactivos (valor por defecto para nuevos ejercicios)</label>
        <div style={S.row}>
          <input type="range" min={0} max={3} step={0.5} value={margin}
            onChange={(e) => onMargin(Number(e.target.value))} style={{ flex: 1 }} />
          <span style={{ minWidth: 40, textAlign: "center", fontWeight: 600, color: C.fnD }}>{margin}s</span>
        </div>
        <p style={{ color: C.muted, fontSize: 12, marginTop: 8 }}>Por defecto: 1 segundo. Cada ejercicio puede definir su propio margen en su edición.</p>
      </div>
      <PalettePreferenceCard current={current} onSelect={setPalette} />
    </>
  );
}

// Tarjeta reutilizable de selección de paleta por defecto (profesor y alumno).
export function PalettePreferenceCard({ current, onSelect }: { current?: string; onSelect: (id: string) => void }) {
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
// PaletteMenuButton se movió a ./PaletteMenuButton.jsx (Fase 6) para que
// StudentDash lo use sin arrastrar este módulo de profesor al bundle del alumno.

// ── Pestaña: Usuarios (admin) ─────────────────────────────────────────────
interface UsersTabProps {
  currentUser: User;
  teachers: User[];
  onAddTeacher: () => void;
  onResetCred: (t: User) => void;
  onRemove: (id: string) => void;
  askConfirm: AskConfirm;
}
export function UsersTab({ currentUser, teachers, onAddTeacher, onResetCred, onRemove, askConfirm }: UsersTabProps) {
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

interface TeacherDashProps {
  currentUser: User;
  users: User[];
  onAddUser: (u: unknown) => void;
  onRemoveUser: (id: string) => void;
  onUpdateUser: (u: User) => void;
  exercises: Exercise[];
  onUpdateExercise: (id: ExId, patch: Record<string, unknown>) => void;
  onDeleteExercise: (id: ExId) => void;
  results: Record<string, Record<string, ExerciseResult>>;
  margin: number;
  onMargin: (v: number) => void;
  onRecord: (ex: Exercise, partId?: string) => void;
  onPreview: (ex: Exercise, partId?: string) => void;
  onManageQuestions: (ex: Exercise, partId?: string) => void;
  onAdd: (ex: Record<string, unknown>) => void;
  onLogout: () => void;
  categories: Category[];
  onAddCategory: (c: Category) => void;
  onUpdateCategory: (c: Category) => void;
  onDeleteCategory: (id: string) => void;
  onToggleGlobalCategory: (id: string) => void;
  courses: Course[];
  units: Unit[];
  onAddCourse: (c: Course) => void;
  onUpdateCourse: (c: Course) => void;
  onDeleteCourse: (id: string) => void;
  onAddUnit: (u: Unit, courseId: string | null) => void;
  onUpdateUnit: (u: Unit) => void;
  onDeleteUnit: (unitId: string, courseId: string) => void;
  onAddExercisesToUnit: (unitId: string, ids: ExId[]) => void;
  onRemoveExerciseFromUnit: (unitId: string, exId: string) => void;
  groups?: Group[];
  onAddGroup: (g: Group) => void;
  onUpdateGroup: (g: Group) => void;
  onDeleteGroup: (id: string) => void;
  onSaveCorrection: (studentId: string | undefined, exerciseId: ExId, correction: Record<string, unknown>) => void;
  audioLibrary?: AudioItem[];
  onAddAudio: (a: AudioItem) => void;
  onUpdateAudio: (a: AudioItem) => void;
  onDeleteAudio: (id: string) => void;
  tab?: string;
  onTab?: (t: string) => void;
  cursoId?: string | null;
  unidadId?: string | null;
  onNavigateCourses?: (cursoId?: string | null, unidadId?: string | null) => void;
  detailExId?: ExId | "new" | null;
  onSelectExercise?: (id: ExId | "new" | null) => void;
  viewingStudentId?: string | null;
  viewingExId?: ExId | null;
  onViewStudentAnswer?: (studentId: string, exId: ExId) => void;
  onBackFromAnswer?: () => void;
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
  tab = "exercises", onTab, cursoId = null, unidadId = null, onNavigateCourses,
  detailExId = null, onSelectExercise,
  viewingStudentId = null, viewingExId = null, onViewStudentAnswer, onBackFromAnswer,
}: TeacherDashProps) {
  const isAdmin = currentUser?.role === "admin";
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
  // Respuesta de un alumno en un ejercicio, derivada de la URL (T3.4) en vez
  // de estado local: recargar o compartir el enlace conserva la pantalla,
  // porque students/exercises/results vienen del backend, no de memoria efímera.
  const viewingAnswer: { student: User; exercise: Exercise; result: ExerciseResult } | null =
    viewingStudentId != null && viewingExId != null
      ? (() => {
          const student  = students.find((s) => s.id === viewingStudentId);
          const exercise = exercises.find((e) => String(e.id) === String(viewingExId));
          const result   = (results[viewingStudentId] || {})[String(viewingExId)];
          return student && exercise && result ? { student, exercise, result } : null;
        })()
      : null;
  const backFromAnswer = onBackFromAnswer || (() => {});

  // Modal state
  const [editingCategory, setEditingCategory] = useState<Category | "new" | null>(null);
  const [confirmState,    setConfirmState]    = useState<{ message: string; confirmLabel: string; onConfirm: () => void } | null>(null);
  const [editingAudio,    setEditingAudio]    = useState<AudioItem | "new" | null>(null);
  const [showAddUser,     setShowAddUser]     = useState(false);
  const [addingUserRole,  setAddingUserRole]  = useState("student");
  const [showResetCred,   setShowResetCred]   = useState(false);
  const [resetCredTarget, setResetCredTarget] = useState<User | null>(null);
  const [editingGroup,    setEditingGroup]    = useState<Group | null | undefined>(undefined); // undefined=closed, null=new, group=edit

  // Course/unit modal state
  const [editingCourse,    setEditingCourse]    = useState<Course | "new" | null>(null);
  const [editingUnit,      setEditingUnit]      = useState<Unit | null>(null);
  const [unitFormCourseId, setUnitFormCourseId] = useState<string | null>(null);
  const [exPickerUnitId,   setExPickerUnitId]   = useState<string | null>(null);
  const [newExInUnit,      setNewExInUnit]      = useState<string | null>(null);

  const askConfirm: AskConfirm = (message, onConfirm, confirmLabel = "Eliminar") =>
    setConfirmState({ message, confirmLabel, onConfirm: () => { onConfirm(); setConfirmState(null); } });

  // Tras crear un ejercicio dentro de una unidad, lo añadimos automáticamente
  const lastCreatedExRef = useRef<Exercise | null>(null);
  const handleExerciseCreated = (newEx: Record<string, unknown>, unitId: string | null) => {
    lastCreatedExRef.current = newEx as Exercise;
    onAdd(newEx);
    if (unitId) onAddExercisesToUnit(unitId, [newEx.id as ExId]);
    setSelectedExerciseId(newEx.id as ExId);
    setNewExInUnit(null);
  };

  // Vista de respuesta de un alumno
  if (viewingAnswer) {
    const { student, exercise: va_ex, result: va_result } = viewingAnswer;
    const freshVa      = exercises.find((e) => e.id === va_ex.id) || va_ex;
    const freshResult  = (results[student.id] || {})[String(va_ex.id ?? "")] || va_result;
    // El profesor ve los colores con la paleta que usó el alumno al entregar.
    const vaPalette    = effectivePaletteId({ schemaPalette: freshResult?.schemaPalette as string | undefined }, null);
    const freshVaPal   = applyPaletteToExercise(freshVa, vaPalette) || freshVa;
    return (
      <div style={S.app}>
        <div style={{ background: C.paper, borderBottom: `1px solid ${C.line}`, padding: "10px 20px", display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={backFromAnswer} style={{ ...S.btn, fontSize: 12, padding: "5px 12px" }}>← Volver a alumnos</button>
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
          onBack={backFromAnswer}
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
        globalMargin={margin}
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
        globalMargin={margin}
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
            results={{}}
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
            cursoId={cursoId}
            unidadId={unidadId}
            onNavigate={onNavigateCourses || (() => {})}
          />
        )}

        {tab === "students" && (
          <StudentsTab
            students={students} exercises={exercises} results={results}
            groups={teacherGroups}
            onAddStudent={() => { setAddingUserRole("student"); setShowAddUser(true); }}
            onResetCred={(s) => { setResetCredTarget(s); setShowResetCred(true); }}
            onRemove={onRemoveUser} askConfirm={askConfirm}
            onViewAnswer={(student, exercise) => onViewStudentAnswer?.(student.id, exercise.id)}
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
            existingUsernames={(users || []).map((u) => u.username ?? "")}
            onSave={(newUser) => { onAddUser(newUser); setShowAddUser(false); }}
            onClose={() => setShowAddUser(false)} />
        )}

        {showResetCred && resetCredTarget && (
          <ResetCredentialModal targetUser={resetCredTarget}
            onSave={(updated) => { onUpdateUser(updated as User); setShowResetCred(false); setResetCredTarget(null); }}
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
