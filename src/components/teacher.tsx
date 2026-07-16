// ═══ VISTAS DEL PROFESOR ══════════════════════════════════════════════════════
// Dashboard del profesor, pestañas (ejercicios, cursos, alumnos, categorías,
// audios, ajustes, usuarios), vista de cursos, ExerciseDetailView y
// QuestionManagerView. Extraídas de App.jsx (Fase 2). TODO: subdividir en teacher/ y courses/.
import { useState, useRef, useMemo } from "react";
import type { ReactNode } from "react";
import type { Exercise, Category, Course, Unit, Group, ExerciseResult } from "../lib/types.js";
import type { Instrumento } from "../lib/calificacion.js";
import { C, F, S, FONT_SANS, SECTION_STYLE } from "../theme/tokens.js";
import { textOn } from "../lib/color.js";
import { fmtClock } from "../lib/time.js";
import { SCHEMA_PALETTES, SCHEMA_PALETTE_DEFAULT, effectivePaletteId, applyPaletteToExercise } from "../lib/palette.js";
import { modelsOf, audioComposers, audioTags, resultStatusOf, composersOf } from "../lib/domain.js";
import { useIsMobile } from "../hooks/useIsMobile.js";
import { rowButtonProps } from "../lib/a11y.js";
import { ConfirmModal, TabBar, ScoreBadge, Chevron, FilterDropdown, TeacherFilterBar, Overline, GhostButton, CtaButton, GearIcon, MobileHeaderMenu, Fab } from "./primitives.jsx";
import { CorrectionView } from "./CorrectionView.jsx";
import { CategoryEditorModal, GroupEditorModal, CourseFormModal, UnitFormModal, ExercisePickerModal, AddUserModal, ResetCredentialModal, AudioLibraryFormModal, BookFormModal, type AudioItem } from "./modals.js";
import { CoursesTab } from "./courses.js";
import { KebabMenu } from "./KebabMenu.js";
import { EditorShell } from "./editor/EditorShell.js";
import { ExerciseItem } from "./ExerciseItem.js";

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
interface ExercisesTabProps {
  exercises: Exercise[];
  audioLibrary?: AudioItem[];
  results?: Record<string, Record<string, ExerciseResult>>;
  onNew: () => void;
  onSelect: (id: ExId) => void;
  onPreview?: (ex: Exercise) => void;
  onToggleVisibility: (ex: Exercise) => void;
  onDuplicate?: (ex: Exercise) => void;
  onCorrect?: (ex: Exercise) => void;
  askConfirm: AskConfirm;
  onDelete: (id: ExId) => void;
}
export function ExercisesTab({ exercises, audioLibrary = [], results = {}, onNew, onSelect, onPreview, onToggleVisibility, onDuplicate, onCorrect, askConfirm, onDelete }: ExercisesTabProps) {
  const isMobile = useIsMobile();
  const [filterModel,     setFilterModel]     = useState("all");
  const [filterComposers, setFilterComposers] = useState<string[]>([]);
  const [filterTags,      setFilterTags]      = useState<string[]>([]);
  // Buscador de texto (F7, T7.5): filtra por título o compositor, junto a
  // los filtros de tipo/compositor/etiqueta — no los sustituye.
  const [searchQuery,     setSearchQuery]     = useState("");

  // Derivar compositores y etiquetas únicas de la biblioteca de audios
  const allComposers = useMemo(() => audioComposers(audioLibrary), [audioLibrary]);
  const allTags      = useMemo(() => audioTags(audioLibrary),      [audioLibrary]);
  // Mapa rápido URL → audio
  const audioByUrl = useMemo(() => {
    const m: Record<string, AudioItem> = {};
    audioLibrary.forEach((a) => { if (a.url) m[a.url] = a; });
    return m;
  }, [audioLibrary]);
  // Entregas y pendientes por ejercicio, sobre `results` (F6, T6.1) — un
  // recorrido de todos los alumnos por ejercicio, no por alumno.
  const submissionStats = useMemo(() => {
    const stats: Record<string, { total: number; pending: number }> = {};
    exercises.forEach((ex) => { stats[String(ex.id)] = { total: 0, pending: 0 }; });
    Object.values(results).forEach((studentResults) => {
      Object.entries(studentResults || {}).forEach(([exId, r]) => {
        if (!stats[exId]) return; // ejercicio borrado — su entrega histórica no cuenta
        stats[exId].total++;
        const ex = exercises.find((e) => String(e.id) === exId);
        if (ex && resultStatusOf(r, ex) === "pendiente") stats[exId].pending++;
      });
    });
    return stats;
  }, [exercises, results]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
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
      if (q) {
        const audioComposer = ex.audioUrl ? audioByUrl[ex.audioUrl as string]?.composer : null;
        const haystack = [ex.title, ...composersOf(ex), audioComposer].filter(Boolean).join(" ").toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    })
    // Los ejercicios ocultos se muestran siempre por debajo de los visibles
    // (orden estable: conservan su orden relativo dentro de cada grupo).
    .sort((a, b) => (a.hidden ? 1 : 0) - (b.hidden ? 1 : 0));
  }, [exercises, filterModel, filterComposers, filterTags, searchQuery, audioByUrl]);

  // Menos ruido para usuarios nuevos (Jon, 2026-07-04): sin línea de conteo, y
  // el buscador+filtros solo aparecen cuando el banco tiene volumen suficiente
  // para necesitarlos (>6). Con pocos ejercicios: solo la lista y "+ Nuevo".
  // El buscador vive DENTRO de la fila de filtros (una sola fila, no tres).
  const showFilterBar = exercises.length > 6;

  return (
    <>
      {showFilterBar
        ? <TeacherFilterBar
            filterModel={filterModel}       setFilterModel={setFilterModel}
            allComposers={allComposers}     filterComposers={filterComposers} setFilterComposers={setFilterComposers}
            allTags={allTags}               filterTags={filterTags}           setFilterTags={setFilterTags}
            trailing={
              <>
                {/* En móvil el buscador se estira para llenar su fila (la barra
                    lo coloca junto a «+ Nuevo» a todo el ancho); en escritorio
                    conserva su ancho fijo al final de la fila de filtros. */}
                <div style={{ position: "relative", ...(isMobile ? { flex: 1, minWidth: 0 } : {}) }}>
                  <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Buscar…" title="Buscar por título o compositor"
                    style={{ ...S.input, width: isMobile ? "100%" : 180, boxSizing: "border-box", paddingRight: searchQuery ? 30 : undefined }} />
                  {searchQuery && (
                    <button onClick={() => setSearchQuery("")} aria-label="Borrar búsqueda"
                      style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: C.muted, fontSize: 13, padding: 4, lineHeight: 1 }}>
                      ✕
                    </button>
                  )}
                </div>
                {/* En móvil el "+ Nuevo" vive en el Fab (Jon, 2026-07-12). */}
                {!isMobile && <CtaButton onClick={onNew}>+ Nuevo ejercicio</CtaButton>}
              </>
            }
          />
        : !isMobile && <div style={{ marginBottom: 14, display: "flex", justifyContent: "flex-end" }}><CtaButton onClick={onNew}>+ Nuevo ejercicio</CtaButton></div>}
      {isMobile && <Fab actions={[{ label: "Nuevo ejercicio", onClick: onNew }]} />}
      {exercises.length === 0
        ? <p style={{ color: C.muted, fontFamily: F.sans, textAlign: "center", padding: "3rem 1rem" }}>Aún no hay ejercicios.</p>
        : filtered.length === 0
          ? <p style={{ color: C.muted, fontFamily: F.sans, textAlign: "center", padding: "2rem 1rem" }}>
              Ningún ejercicio coincide con los filtros.{" "}
              <button onClick={() => { setFilterModel("all"); setFilterComposers([]); setFilterTags([]); setSearchQuery(""); }}
                style={{ background: "none", border: "none", color: C.fnS, cursor: "pointer", fontSize: 13, textDecoration: "underline", padding: 0 }}>
                Limpiar filtros
              </button>
            </p>
          : isMobile
            ? <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {filtered.map((ex) => (
                  <ExerciseItem key={String(ex.id)} ex={ex} role="teacher" variant="row"
                    onEdit={(e) => onSelect(e.id as ExId)}
                    onPreview={onPreview}
                    onToggleVisibility={onToggleVisibility}
                    onDuplicate={onDuplicate}
                    onCorrect={onCorrect}
                    submissionsCount={submissionStats[String(ex.id)]?.total ?? 0}
                    pendingCount={submissionStats[String(ex.id)]?.pending ?? 0}
                    onDelete={(e) => onDelete(e.id as ExId)}
                    askConfirm={askConfirm} />
                ))}
              </div>
            : <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16, alignItems: "start" }}>
                {filtered.map((ex) => (
                  <ExerciseItem key={String(ex.id)} ex={ex} role="teacher" variant="grid"
                    onEdit={(e) => onSelect(e.id as ExId)}
                    onPreview={onPreview}
                    onToggleVisibility={onToggleVisibility}
                    onDuplicate={onDuplicate}
                    onCorrect={onCorrect}
                    submissionsCount={submissionStats[String(ex.id)]?.total ?? 0}
                    pendingCount={submissionStats[String(ex.id)]?.pending ?? 0}
                    onDelete={(e) => onDelete(e.id as ExId)}
                    askConfirm={askConfirm} />
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
  // Bandeja de correcciones pendientes (TeacherDash), o null si no hay ninguna
  // — en escritorio comparte fila con «+Nuevo grupo»/«+Crear alumno» (Jon,
  // 2026-07-12); en móvil va en su propia fila encima (ver más abajo).
  inboxBar?: ReactNode;
}
export function StudentsTab({ students, exercises, results, groups, onAddStudent, onResetCred, onRemove, askConfirm, onViewAnswer, onEditGroup, onDeleteGroup, inboxBar = null }: StudentsTabProps) {
  const isMobile = useIsMobile();
  const [expandedStudents, setExpandedStudents] = useState<Set<string>>(new Set());
  const [expandedGroups,   setExpandedGroups]   = useState<Set<string>>(() => new Set(groups.map((g) => g.id)));
  const toggleExpand = (id: string) =>
    setExpandedStudents((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleGroup = (id: string) =>
    setExpandedGroups((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  // Entregas de un alumno, con su nota vigente y estado — fecha descendente.
  // (El antiguo filtro "Solo pendientes" y el contador rojo se retiraron el
  // 2026-07-04: lo pendiente vive SOLO en la bandeja única de TeacherDash.)
  const studentEntries = (s: User): Array<{ ex: Exercise; r: ExerciseResult }> => {
    const sRes = results[s.id] || {};
    return exercises
      .map((ex) => ({ ex, r: sRes[String(ex.id)] }))
      .filter((e): e is { ex: Exercise; r: ExerciseResult } => Boolean(e.r))
      .sort((a, b) => (b.r.timestamp ?? 0) - (a.r.timestamp ?? 0));
  };

  const renderStudentCard = (s: User) => {
    const isOpen   = expandedStudents.has(s.id);
    const allExs   = studentEntries(s);
    const hasPending = allExs.some(({ ex, r }) => resultStatusOf(r, ex) === "pendiente");
    return (
      <div
        key={s.id}
        onClick={() => exercises.length > 0 && toggleExpand(s.id)}
        {...(exercises.length > 0 ? { ...rowButtonProps(() => toggleExpand(s.id)), "aria-expanded": isOpen } : {})}
        style={{ ...S.card, borderRadius: 14, padding: "13px 16px", marginBottom: 0, cursor: exercises.length > 0 ? "pointer" : "default", userSelect: "none" }}>
        {/* Cabecera: nombre en serif (misma voz que los títulos de ejercicio,
            Jon 2026-07-05). Borrar/resetear se pliegan al ⋯ (Jon, 2026-07-04:
            una ✕ roja permanente por fila era ruido y un peligro al alcance
            de un clic). Sin nº de entregas (Jon, 2026-07-12: ruido — un punto
            rojo, mismo aviso que la pestaña «Alumnos», basta para señalar que
            hay algo pendiente de corregir). */}
        <div style={{ ...S.row, justifyContent: "space-between", gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0, fontFamily: F.serif, fontSize: 17, fontWeight: 600, color: C.ink, lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {s.displayName}
          </div>
          <div style={{ ...S.row, gap: 8, flexShrink: 0 }}>
            {hasPending && (
              <span aria-hidden="true" title="Hay entregas por corregir" style={{ width: 6, height: 6, borderRadius: "50%", background: C.danger, flexShrink: 0 }} />
            )}
            <span onClick={(e) => e.stopPropagation()}>
              <KebabMenu title={`Acciones de ${s.displayName}`} items={[
                { label: "Resetear credencial", onClick: () => onResetCred(s) },
                { label: "Eliminar alumno", danger: true, onClick: () => askConfirm(`¿Eliminar al alumno "${s.displayName}"?\n\nSe borrarán también todas sus respuestas guardadas.`, () => onRemove(s.id)) },
              ]} />
            </span>
            {exercises.length > 0 && <Chevron open={isOpen} rotate90WhenClosed size={13} />}
          </div>
        </div>

        {/* Detalle: solo visible al desplegar (altura animada) */}
        <div className={`fa-expand${isOpen ? " fa-open" : ""}`}>
          <div className="fa-expand-inner">
            <div onClick={(e) => e.stopPropagation()} style={{ marginTop: 12, borderTop: `1px solid ${C.line}`, paddingTop: 12 }}>
              <div style={{ ...S.row, gap: 6, flexWrap: "wrap", marginBottom: allExs.length > 0 ? 12 : 4 }}>
                <span style={{ ...S.badge, background: C.paper2, color: C.muted, fontFamily: FONT_SANS, fontSize: 10 }}>@{s.username}</span>
                <span style={{ ...S.badge, background: s.credType === "pin" ? "rgba(47,111,184,0.12)" : "rgba(63,155,91,0.10)", color: s.credType === "pin" ? C.quiz : C.fnT }}>
                  {s.credType === "pin" ? "PIN" : "Contraseña"}
                </span>
                {exercises.length > 0 && (
                  <span style={{ ...S.badge, background: C.line, color: C.muted, fontSize: 10 }}>
                    {allExs.length}/{exercises.length} ejs.
                  </span>
                )}
              </div>
              {allExs.length === 0
                ? <p style={{ fontFamily: F.sans, fontSize: 13, color: C.muted, margin: 0 }}>Ningún ejercicio entregado todavía.</p>
                : allExs.map(({ ex, r }) => (
                    <div key={ex.id} style={{ ...S.row, justifyContent: "space-between", paddingBottom: 6, borderBottom: `1px solid ${C.line}`, marginBottom: 6 }}>
                      <span style={{ fontSize: 13, color: C.muted2, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingRight: 8 }}>{ex.title}</span>
                      <div style={{ ...S.row, gap: 6, flexShrink: 0 }}>
                        <ScoreBadge score={r.score} status={resultStatusOf(r, ex)} />
                        <button onClick={() => onViewAnswer(s, ex, r)} style={{ ...S.btn, fontSize: 11, padding: "2px 9px", color: C.fnS, borderColor: C.fnS }}>Ver</button>
                      </div>
                    </div>
                  ))
              }
            </div>
          </div>
        </div>
      </div>
    );
  };

  const assignedStudentIds = new Set(groups.flatMap((g) => g.studentIds || []));
  const ungrouped = students.filter((s) => !assignedStudentIds.has(s.id));

  // Rejilla de alumnos (Jon, 2026-07-05): en escritorio hasta DOS tarjetas por
  // fila — como ejercicios/audios — para no dejar medio ancho muerto; en móvil,
  // una columna. `alignItems: start` evita que una tarjeta desplegada estire a
  // su vecina de fila; el espaciado lo pone el gap (la tarjeta ya no lleva
  // marginBottom).
  const studentsGrid: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))",
    gap: isMobile ? 7 : 12,
    alignItems: "start",
  };

  return (
    <>
      {/* Cabecera de la pestaña. Sin línea de conteo (Jon, 2026-07-12: ruido —
          fuera también de los encabezados de grupo/"Sin grupo" más abajo). En
          escritorio, la bandeja de correcciones (si hay) comparte esta misma
          fila con los botones — antes quedaba en una fila propia justo
          encima, a distinta altura (Jon, 2026-07-12). En móvil sigue en su
          propia fila arriba del todo (aquí los botones ya no existen, viven
          en el Fab). */}
      {inboxBar && isMobile && <div style={{ marginBottom: 18 }}>{inboxBar}</div>}
      <div style={{ display: "flex", alignItems: "center", justifyContent: (inboxBar && !isMobile) ? "space-between" : "flex-end", gap: 12, marginBottom: 18, flexWrap: "wrap" }}>
        {inboxBar && !isMobile && <div style={{ flex: 1, minWidth: 280 }}>{inboxBar}</div>}
        {/* En móvil, crear alumno/grupo vive en el Fab (Jon, 2026-07-12). */}
        {!isMobile && (
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            <GhostButton onClick={() => onEditGroup(null)}>+ Nuevo grupo</GhostButton>
            <CtaButton onClick={onAddStudent}>+ Crear alumno</CtaButton>
          </div>
        )}
      </div>
      {isMobile && <Fab actions={[
        { label: "Crear alumno", onClick: onAddStudent },
        { label: "Nuevo grupo", onClick: () => onEditGroup(null) },
      ]} />}

      {students.length === 0 && groups.length === 0 && (
        <div style={{ ...S.card, textAlign: "center", color: C.muted, padding: "2rem 1rem", lineHeight: 1.8 }}>
          <div>Aún no hay alumnos.</div>
          <div style={{ fontSize: 13 }}>{isMobile ? "Crea el primero con el botón +." : "Crea el primero con el botón de arriba."}</div>
        </div>
      )}

      {groups.map((group) => {
        const groupStudents = students.filter((s) => (group.studentIds || []).includes(s.id));
        const isGroupOpen   = expandedGroups.has(group.id);
        return (
          <div key={group.id} style={{ marginBottom: 28 }}>
            {/* Cabecera de grupo (Jon, 2026-07-05): filete fino C.line en vez de
                la línea negra gruesa de 2px (retirada del resto de la app). */}
            <div
              onClick={() => toggleGroup(group.id)} {...rowButtonProps(() => toggleGroup(group.id))} aria-expanded={isGroupOpen}
              style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: isGroupOpen ? 12 : 0, paddingBottom: 9, borderBottom: `1px solid ${C.line}`, flexWrap: "wrap", cursor: "pointer", userSelect: "none" }}>
              <span style={{ fontFamily: F.serif, fontSize: 19, fontWeight: 600, letterSpacing: "-0.01em", color: C.ink, flex: 1, minWidth: 120 }}>{group.name}</span>
              {/* Acciones del grupo plegadas al ⋯ (mismo criterio que las filas
                  de alumno: sin ✕ roja permanente a un clic). */}
              <span onClick={(e) => e.stopPropagation()}>
                <KebabMenu title={`Acciones del grupo "${group.name}"`} items={[
                  { label: "Editar grupo", onClick: () => onEditGroup(group) },
                  { label: "Eliminar grupo", danger: true, onClick: () => askConfirm(`¿Eliminar el grupo "${group.name}"?\n\nLos alumnos no se eliminarán.`, () => onDeleteGroup(group.id)) },
                ]} />
              </span>
              <Chevron open={isGroupOpen} rotate90WhenClosed size={14} />
            </div>
            {isGroupOpen && (
              groupStudents.length === 0
                ? <p style={{ color: C.muted, fontSize: 13, margin: 0 }}>Este grupo no tiene alumnos. Edítalo para añadir.</p>
                : <div style={studentsGrid}>{groupStudents.map(renderStudentCard)}</div>
            )}
          </div>
        );
      })}

      {ungrouped.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          {groups.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, paddingBottom: 9, marginBottom: 12, borderBottom: `1px solid ${C.line}` }}>
              <span style={{ fontFamily: F.serif, fontSize: 19, fontWeight: 600, letterSpacing: "-0.01em", color: C.muted, flex: 1 }}>Sin grupo</span>
            </div>
          )}
          <div style={studentsGrid}>{ungrouped.map(renderStudentCard)}</div>
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
  // Libros (Jon, 2026-07-06): crear/editar/borrar un libro y añadir un audio
  // ya preseleccionado a un libro concreto.
  onAddBook: () => void;
  onEditBook: (b: AudioItem) => void;
  onDeleteBook: (b: AudioItem) => void;
  onAddAudioToBook: (bookId: string) => void;
}
// Tarjeta de audio (Jon, 2026-07-06: MISMA estética en escritorio y móvil —
// antes eran dos implementaciones distintas con fuentes/tamaños/paddings
// diferentes). Resumen MINIMO (título + compositor + flecha, sin duración ni
// botones) y detalle completo al desplegar (duración, etiquetas, reproductor
// nativo y, si es administrador, editar/eliminar). El reproductor nativo YA
// trae su propio botón de play — no hace falta un ▶ aparte en la cabecera.
interface AudioCardProps {
  audio: AudioItem;
  isAdmin: boolean;
  isOpen: boolean;
  onToggleOpen: () => void;
  onEdit: (a: AudioItem) => void;
  onDelete: (id: string) => void;
  askConfirm: AskConfirm;
  // Dentro de un libro (Jon, 2026-07-06): suaviza el marco y compacta la
  // tarjeta para que la pieza se lea como parte del conjunto.
  nested?: boolean;
}
function AudioCard({ audio, isAdmin, isOpen, onToggleOpen, onEdit, onDelete, askConfirm, nested = false }: AudioCardProps) {
  // Animaciones (Jon, 2026-07-12), calcadas de ExerciseItem: hover con borde+
  // sombra (solo tarjetas de nivel superior — dentro de un libro sería ruido)
  // y despliegue animado fa-expand en vez del montaje seco {isOpen && …}.
  const [hover, setHover] = useState(false);
  return (
    <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ display: "flex", flexDirection: "column", boxSizing: "border-box", background: C.paper,
        border: `1px solid ${hover && !nested ? C.rail : C.line}`, borderRadius: nested ? 10 : 14, overflow: "hidden",
        boxShadow: hover && !nested ? "0 6px 20px rgba(26,25,21,0.09)" : "none",
        transition: "box-shadow .18s, border-color .18s" }}>
      <div onClick={onToggleOpen} {...rowButtonProps(onToggleOpen)} aria-expanded={isOpen}
        style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: nested ? "12px 14px" : "16px 16px 15px", cursor: "pointer", userSelect: "none" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Sin compositor en la tarjeta (Jon, 2026-07-12): en el almacén los
              audios van SIEMPRE bajo su apartado de compositor — repetirlo
              dentro era redundante (y anidado ya lo cubría el libro). */}
          <div style={{ fontFamily: F.serif, fontSize: nested ? 17 : 19, fontWeight: 600, color: C.ink, lineHeight: 1.18, letterSpacing: "-0.01em", overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{audio.title}</div>
        </div>
        <div style={{ flexShrink: 0, marginTop: 2 }}><Chevron open={isOpen} /></div>
      </div>
      <div className={`fa-expand${isOpen ? " fa-open" : ""}`}>
        <div className="fa-expand-inner">
          <div style={{ borderTop: `1px solid ${C.line}`, padding: nested ? "10px 14px 13px" : "12px 16px 15px", background: C.bg }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
              <span style={{ ...S.badge, background: C.line, color: C.muted, fontFamily: FONT_SANS, fontVariantNumeric: "tabular-nums" }}>{fmtClock(audio.duration ?? 0)}</span>
              {(audio.tags || []).map((tag) => (
                <span key={tag} style={{ ...S.badge, background: "rgba(154,79,184,0.10)", color: C.fnI, fontSize: 10 }}>{tag}</span>
              ))}
            </div>
            {/* preload="none": con fa-expand el <audio> queda SIEMPRE montado
                (antes solo al abrir) — sin esto, cada tarjeta descargaría los
                metadatos de su audio nada más pintar la pestaña. */}
            <audio src={audio.url} controls preload="none" style={{ width: "100%", height: 36, display: "block", marginBottom: isAdmin ? 12 : 0 }} />
            {isAdmin && (
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => onEdit(audio)} style={{ ...S.btn, padding: "5px 10px", fontSize: 12 }}>Editar</button>
                <button onClick={() => askConfirm(`¿Eliminar "${audio.title}" del almacén?\n\nLos ejercicios que ya lo usan conservarán su enlace.`, () => onDelete(audio.id))}
                  style={{ ...S.btnDanger, padding: "5px 10px", fontSize: 12 }}>Eliminar</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Tarjeta de LIBRO (Jon, 2026-07-06): colección de audios con estética algo más
// azul que un audio suelto (marco/etiqueta en el azul `quiz`). Resumen: eyebrow
// «LIBRO · N piezas», título y compositor. Al desplegar, sus audios anidados +
// (admin) añadir audio / editar / eliminar el libro.
interface BookCardProps {
  book: AudioItem;
  children: AudioItem[];
  isAdmin: boolean;
  isOpen: boolean;
  onToggleOpen: () => void;
  openAudioId: string | null;
  onToggleAudio: (id: string) => void;
  onAddAudio: (bookId: string) => void;
  onEditBook: (b: AudioItem) => void;
  onDeleteBook: (b: AudioItem) => void;
  onEditAudio: (a: AudioItem) => void;
  onDeleteAudio: (id: string) => void;
  askConfirm: AskConfirm;
}
function BookCard({ book, children, isAdmin, isOpen, onToggleOpen, openAudioId, onToggleAudio, onAddAudio, onEditBook, onDeleteBook, onEditAudio, onDeleteAudio, askConfirm }: BookCardProps) {
  const n = children.length;
  const BLUE = C.quiz;
  // Animaciones (Jon, 2026-07-12): mismo hover + fa-expand que AudioCard,
  // con el realce en la gama azul propia del libro.
  const [hover, setHover] = useState(false);
  return (
    <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ display: "flex", flexDirection: "column", boxSizing: "border-box", background: "rgba(47,111,184,0.035)",
        border: `1px solid rgba(47,111,184,${hover ? 0.5 : 0.30})`, borderRadius: 14, overflow: "hidden",
        boxShadow: hover ? "0 6px 20px rgba(26,25,21,0.09)" : "none",
        transition: "box-shadow .18s, border-color .18s" }}>
      <div onClick={onToggleOpen} {...rowButtonProps(onToggleOpen)} aria-expanded={isOpen}
        style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "16px 16px 15px", cursor: "pointer", userSelect: "none" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Sin eyebrow "LIBRO · N piezas" ni emoji (Jon, 2026-07-06: como
              siempre, sin metadatos ni emoticonos) — el azul de la tarjeta YA
              distingue un libro de un audio suelto, no hace falta rotularlo. */}
          {/* Sin compositor (Jon, 2026-07-12): redundante con el apartado de
              compositor bajo el que va la tarjeta — ver AudioCard. */}
          <div style={{ fontFamily: F.serif, fontSize: 19, fontWeight: 600, color: C.ink, lineHeight: 1.18, letterSpacing: "-0.01em", overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{book.title}</div>
        </div>
        <div style={{ flexShrink: 0, marginTop: 2 }}><Chevron open={isOpen} /></div>
      </div>
      <div className={`fa-expand${isOpen ? " fa-open" : ""}`}>
        <div className="fa-expand-inner">
          <div style={{ borderTop: `1px solid rgba(47,111,184,0.22)`, padding: "12px 16px 15px", background: "rgba(47,111,184,0.02)" }}>
            {n === 0 ? (
              <p style={{ margin: "2px 0 12px", fontSize: 13, color: C.muted, lineHeight: 1.5 }}>Este libro aún no tiene audios.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: isAdmin ? 12 : 0 }}>
                {children.map((audio) => (
                  <AudioCard key={audio.id} audio={audio} isAdmin={isAdmin} nested
                    isOpen={openAudioId === audio.id}
                    onToggleOpen={() => onToggleAudio(audio.id)}
                    onEdit={onEditAudio} onDelete={onDeleteAudio} askConfirm={askConfirm} />
                ))}
              </div>
            )}
            {isAdmin && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                <button onClick={() => onAddAudio(book.id)} style={{ ...S.btn, padding: "5px 10px", fontSize: 12, color: BLUE, borderColor: `${BLUE}55` }}>+ Añadir audio</button>
                <button onClick={() => onEditBook(book)} style={{ ...S.btn, padding: "5px 10px", fontSize: 12 }}>Editar libro</button>
                <button onClick={() => askConfirm(`¿Eliminar el libro "${book.title}"?\n\nSus ${n} ${n === 1 ? "audio" : "audios"} NO se borran: pasan a ser audios sueltos.`, () => onDeleteBook(book))}
                  style={{ ...S.btnDanger, padding: "5px 10px", fontSize: 12 }}>Eliminar libro</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function AudiosTab({ audioLibrary, isAdmin, onAdd, onEdit, onDelete, askConfirm, onAddBook, onEditBook, onDeleteBook, onAddAudioToBook }: AudiosTabProps) {
  const isMobile = useIsMobile();
  const [openId,          setOpenId]          = useState<string | null>(null);   // libro o audio suelto abierto
  const [openChildId,     setOpenChildId]     = useState<string | null>(null);   // audio abierto DENTRO de un libro
  const [filterComposers, setFilterComposers] = useState<string[]>([]);
  const [filterTags,      setFilterTags]      = useState<string[]>([]);

  // Opciones únicas para los dropdowns
  const allComposers = useMemo(() => audioComposers(audioLibrary), [audioLibrary]);
  const allTags      = useMemo(() => audioTags(audioLibrary),      [audioLibrary]);

  // Libros y audios sueltos (Jon, 2026-07-06). Un libro es `kind:"book"`; un
  // audio con `bookId` que resuelve a un libro existente va ANIDADO dentro de
  // él (no en el nivel superior); si su bookId no existe, se trata como suelto
  // para que ningún audio desaparezca. Los hijos se ordenan por createdAt (el
  // orden en que se fueron añadiendo: I, II, III… de forma natural).
  const books         = useMemo(() => audioLibrary.filter((a) => a.kind === "book"), [audioLibrary]);
  const bookIds       = useMemo(() => new Set(books.map((b) => b.id)), [books]);
  const childrenOf    = (bookId: string) => audioLibrary
    .filter((a) => a.kind !== "book" && a.bookId === bookId)
    .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
  // Elementos de nivel superior: libros + audios sin libro (o con libro
  // inexistente). Cada uno lleva `.composer` para agrupar igual que antes.
  const topLevel = useMemo(() => audioLibrary.filter((a) =>
    a.kind === "book" || !(a.bookId && bookIds.has(a.bookId))), [audioLibrary, bookIds]);

  // Filtro (compositor/etiquetas) aplicado al nivel superior. Un libro se filtra
  // por SUS propios metadatos (compositor/etiquetas del libro).
  const filtered = useMemo(() => {
    if (filterComposers.length === 0 && filterTags.length === 0) return topLevel;
    return topLevel.filter((a) => {
      if (filterComposers.length > 0 && !filterComposers.includes(a.composer ?? "")) return false;
      if (filterTags.length > 0) {
        const aTags = a.tags || [];
        if (!filterTags.every((t) => aTags.includes(t))) return false;
      }
      return true;
    });
  }, [topLevel, filterComposers, filterTags]);

  const hasFilters = filterComposers.length > 0 || filterTags.length > 0;

  const toggleComposer = (val: string) => setFilterComposers((p) => p.includes(val) ? p.filter((x) => x !== val) : [...p, val]);
  const toggleTag      = (val: string) => setFilterTags((p) => p.includes(val) ? p.filter((x) => x !== val) : [...p, val]);

  // Organizado por compositor, en apartados (Jon, 2026-07-04): un grupo por
  // compositor, ordenados por APELLIDO (última palabra del nombre — "Ludwig
  // van Beethoven" ordena por "Beethoven", no por "Ludwig"), «Sin compositor»
  // al final. Respeta el filtrado vigente — un grupo desaparece si queda vacío.
  const groupedByComposer = useMemo(() => {
    const byComposer = new Map<string, AudioItem[]>();
    filtered.forEach((a) => {
      const key = a.composer || "Sin compositor";
      if (!byComposer.has(key)) byComposer.set(key, []);
      byComposer.get(key)!.push(a);
    });
    const surname = (fullName: string) => fullName.trim().split(/\s+/).pop() || fullName;
    const withComposer = [...byComposer.keys()].filter((k) => k !== "Sin compositor")
      .sort((a, b) => surname(a).localeCompare(surname(b), "es", { sensitivity: "base" }));
    const groups = withComposer.map((composer) => ({ composer, items: byComposer.get(composer)! }));
    if (byComposer.has("Sin compositor")) groups.push({ composer: "Sin compositor", items: byComposer.get("Sin compositor")! });
    return groups;
  }, [filtered]);

  // El nivel superior expandido cierra los demás; un audio dentro de un libro
  // lleva su propio estado (openChildId) para poder tener el libro abierto y
  // una de sus piezas también.
  const toggleTop   = (id: string) => setOpenId((cur) => (cur === id ? null : id));
  const toggleChild = (id: string) => setOpenChildId((cur) => (cur === id ? null : id));

  return (
    <>
      {!isAdmin && (
        <p style={{ color: C.muted, fontSize: 13, margin: "0 0 16px" }}>Solo el administrador puede añadir o editar audios y libros del almacén.</p>
      )}

      {/* ── Barra de filtros (+ "Añadir libro"/"Añadir audio" a la derecha) ── */}
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
          {/* En móvil, añadir audio/libro vive en el Fab (Jon, 2026-07-12). */}
          {isAdmin && !isMobile && (
            <>
              <span style={{ flex: 1 }} />
              <button onClick={onAddBook} style={{ ...S.btn, color: C.quiz, borderColor: `${C.quiz}55` }}>+ Añadir libro</button>
              <button onClick={onAdd} style={{ ...S.btnPrimary }}>+ Añadir audio</button>
            </>
          )}
        </div>
      )}
      {audioLibrary.length === 0 && isAdmin && !isMobile && (
        <div style={{ marginBottom: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={onAddBook} style={{ ...S.btn, color: C.quiz, borderColor: `${C.quiz}55` }}>+ Añadir libro</button>
          <button onClick={onAdd} style={{ ...S.btnPrimary }}>+ Añadir audio</button>
        </div>
      )}
      {isAdmin && isMobile && <Fab actions={[
        { label: "Añadir audio", onClick: onAdd },
        { label: "Añadir libro", onClick: onAddBook },
      ]} />}

      {audioLibrary.length === 0 && (
        <div style={{ ...S.card, textAlign: "center", color: C.muted, padding: "2.5rem 1rem", lineHeight: 1.8 }}>
          <div>El almacén está vacío.</div>
          {isAdmin && <div style={{ fontSize: 13 }}>{isMobile ? "Añade el primer audio o libro con el botón +." : "Añade el primer audio o libro con los botones de arriba."}</div>}
        </div>
      )}

      {audioLibrary.length > 0 && filtered.length === 0 && (
        <div style={{ ...S.card, textAlign: "center", color: C.muted, padding: "2rem 1rem" }}>
          No hay audios que coincidan con los filtros seleccionados.
        </div>
      )}

      {/* Apartados por compositor (Jon, 2026-07-04): un grupo alfabético por
          compositor, «Sin compositor» al final. El nombre destaca — serif
          grande en tinta — porque aquí SÍ es la jerarquía principal de la
          página (a diferencia de «Cursos»/«Todos los ejercicios», que llevan
          versalitas por competir con el nombre del encabezado; Audios no
          tiene ese título propio). Sin conteo al lado (Jon, 2026-07-12): ruido
          — el compositor ya organiza, no hace falta anunciar cuántos hay. */}
      {groupedByComposer.map(({ composer, items }) => (
        <div key={composer} style={{ marginBottom: 30 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 14, paddingBottom: 9, borderBottom: `1px solid ${C.line}` }}>
            <h3 style={{ fontFamily: F.serif, fontSize: 21, fontWeight: 700, color: C.ink, letterSpacing: "-0.01em", margin: 0 }}>{composer}</h3>
          </div>
          {/* Misma tarjeta en escritorio y móvil (Jon, 2026-07-06) — solo
              cambia el contenedor: rejilla de dos columnas vs. lista de una. */}
          <div style={isMobile
            ? { display: "flex", flexDirection: "column", gap: 8 }
            : { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 14, alignItems: "start" }}>
            {items.map((item) => item.kind === "book" ? (
              <BookCard key={item.id} book={item} children={childrenOf(item.id)} isAdmin={isAdmin}
                isOpen={openId === item.id} onToggleOpen={() => toggleTop(item.id)}
                openAudioId={openChildId} onToggleAudio={toggleChild}
                onAddAudio={onAddAudioToBook} onEditBook={onEditBook} onDeleteBook={onDeleteBook}
                onEditAudio={onEdit} onDeleteAudio={onDelete} askConfirm={askConfirm} />
            ) : (
              <AudioCard key={item.id} audio={item} isAdmin={isAdmin}
                isOpen={openId === item.id} onToggleOpen={() => toggleTop(item.id)}
                onEdit={onEdit} onDelete={onDelete} askConfirm={askConfirm} />
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

// ── Pestaña: Ajustes ──────────────────────────────────────────────────────
interface SettingsTabProps {
  currentUser: User | null;
  onUpdateUser: (u: User) => void;
}
export function SettingsTab({ currentUser, onUpdateUser }: SettingsTabProps) {
  const current = currentUser?.defaultPalette || SCHEMA_PALETTE_DEFAULT;
  const setPalette = (id: string) => { if (currentUser) onUpdateUser({ ...currentUser, defaultPalette: id }); };
  return <PalettePreferenceCard current={current} onSelect={setPalette} />;
}

// Sección con título de la página de Ajustes (Categorías / Preferencias /
// Usuarios) — versalitas Outfit + filete, el mismo registro de sección que la
// página del alumno (Jon, 2026-07-04): distinto del nombre serif de la cabecera.
function SettingsSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ marginBottom: 34 }}>
      <h2 style={{ display: "flex", alignItems: "center", gap: 12, fontFamily: F.sans, fontSize: 13, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: C.ink, margin: "0 0 14px" }}>
        {title}
        <span aria-hidden="true" style={{ flex: 1, height: 1, background: C.line }} />
      </h2>
      {children}
    </section>
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
              <span style={{ ...S.badge, background: C.paper2, color: C.muted, fontFamily: FONT_SANS, fontSize: 10 }}>@{t.username}</span>
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
              <span style={{ ...S.badge, background: C.paper2, color: C.muted, fontFamily: FONT_SANS, fontSize: 10 }}>@{currentUser.username}</span>
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
  onRecord: (ex: Exercise, partId?: string) => void;
  onPreview: (ex: Exercise, partId?: string) => void;
  onManageQuestions: (ex: Exercise, partId?: string) => void;
  onAdd: (ex: Record<string, unknown>) => void;
  onDuplicateExercise?: (ex: Exercise) => void;
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
  results,
  onRecord, onPreview, onManageQuestions, onAdd, onDuplicateExercise, onLogout,
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
  // Primer alumno pendiente de un ejercicio (M2, "→ Corregir" desde la lista):
  // mismo criterio que pendingQueue más abajo (fecha de entrega descendente),
  // pero por ejercicio en vez de por el ejercicio que ya se está corrigiendo.
  const findFirstPendingStudent = (ex: Exercise): string | undefined => {
    const pending = students
      .map((s) => ({ id: s.id, r: (results[s.id] || {})[String(ex.id)] }))
      .filter((e): e is { id: string; r: ExerciseResult } => Boolean(e.r) && resultStatusOf(e.r, ex) === "pendiente")
      .sort((a, b) => (b.r.timestamp ?? 0) - (a.r.timestamp ?? 0));
    return pending[0]?.id;
  };
  const onCorrectExercise = (ex: Exercise) => {
    const sid = findFirstPendingStudent(ex);
    if (sid && onViewStudentAnswer) onViewStudentAnswer(sid, ex.id);
  };
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

  // Bandeja única (Jon, 2026-07-04): TODAS las entregas pendientes de
  // corrección (alumno × ejercicio), en fecha de entrega descendente. Alimenta
  // el aviso sobre el panel y la cola de corrección — «Siguiente» recorre ahora
  // todo el trabajo pendiente, cruzando de ejercicio si hace falta (sustituye
  // a la cola por-ejercicio de T6.2: una sola puerta, un solo recorrido).
  const pendingQueue = useMemo(() =>
    students
      .flatMap((s) => exercises.map((ex) => ({ student: s, exercise: ex, r: (results[s.id] || {})[String(ex.id)] })))
      .filter((e): e is { student: User; exercise: Exercise; r: ExerciseResult } =>
        Boolean(e.r) && resultStatusOf(e.r, e.exercise) === "pendiente")
      .sort((a, b) => (b.r.timestamp ?? 0) - (a.r.timestamp ?? 0)),
  [students, exercises, results]);
  const queueIdx = pendingQueue.findIndex((e) => e.student.id === viewingStudentId && String(e.exercise.id) === String(viewingExId));
  const queueLabel = queueIdx >= 0 ? `${queueIdx + 1}/${pendingQueue.length}` : null;
  const goToQueueIdx = (idx: number) => {
    const target = pendingQueue[idx];
    if (target && onViewStudentAnswer) onViewStudentAnswer(target.student.id, target.exercise.id);
  };
  // El aviso de la bandeja puede cerrarse durante la sesión del navegador
  // (sessionStorage: reaparece al cerrar y volver a entrar), SALVO en la
  // pestaña Alumnos, donde se muestra siempre que haya pendientes (Jon,
  // 2026-07-04). El punto rojo de la pestaña Alumnos no se cierra nunca.
  const [inboxDismissed, setInboxDismissed] = useState<boolean>(() => {
    try { return sessionStorage.getItem("fa-inbox-dismissed") === "1"; } catch { return false; }
  });
  const dismissInbox = () => {
    setInboxDismissed(true);
    try { sessionStorage.setItem("fa-inbox-dismissed", "1"); } catch { /* sin storage: solo estado */ }
  };
  const showInbox = pendingQueue.length > 0 && (tab === "students" || !inboxDismissed);
  // JSX de la bandeja, extraído para poder colocarla en dos sitios distintos
  // según la pestaña (ver el bloque de render más abajo): sola en el resto de
  // pestañas, o compartiendo fila con los botones de Alumnos en escritorio.
  const inboxBar = showInbox ? (
    <div style={{ display: "flex", alignItems: "center", gap: 12, background: "rgba(212,120,0,0.07)", border: "1px solid rgba(212,120,0,0.25)", borderRadius: 12, padding: "12px 16px" }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#d47800", flexShrink: 0 }} aria-hidden="true" />
      <span style={{ fontFamily: F.sans, fontSize: 13.5, color: C.ink, flex: 1, minWidth: 0 }}>
        <b>{pendingQueue.length}</b> {pendingQueue.length === 1 ? "entrega por corregir" : "entregas por corregir"}
      </span>
      <button onClick={() => goToQueueIdx(0)} className="fa-pressable" style={{ ...S.btnPrimary, padding: "8px 16px", fontSize: 12.5, flexShrink: 0 }}>
        Corregir →
      </button>
      {tab !== "students" && (
        <button onClick={dismissInbox} title="Ocultar este aviso durante la sesión" aria-label="Cerrar aviso"
          style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, fontSize: 14, lineHeight: 1, padding: "4px 2px", flexShrink: 0 }}>
          ✕
        </button>
      )}
    </div>
  ) : null;

  // Modal state
  const [editingCategory, setEditingCategory] = useState<Category | "new" | null>(null);
  const [confirmState,    setConfirmState]    = useState<{ message: string; confirmLabel: string; onConfirm: () => void } | null>(null);
  const [editingAudio,    setEditingAudio]    = useState<AudioItem | "new" | null>(null);
  // Libro en edición ("new" = crear vacío) + libro preseleccionado al añadir un
  // audio desde dentro de un libro (Jon, 2026-07-06).
  const [editingBook,     setEditingBook]     = useState<AudioItem | "new" | null>(null);
  const [addAudioBookId,  setAddAudioBookId]  = useState<string | null>(null);
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
      // Sin barra superior propia (Jon, 2026-07-05): duplicaba el «← Volver a
      // alumnos» y el nombre del alumno que CorrectionView ya pinta en su
      // cabecera («Corrección: título» + «Alumno: nombre»).
      <div style={S.app}>
        <CorrectionView
          key={JSON.stringify(freshResult.teacherCorrection)}
          exercise={freshVaPal}
          result={freshResult}
          onBack={backFromAnswer}
          backLabel="← Volver a alumnos"
          isTeacherMode={true}
          student={student}
          onSaveCorrection={onSaveCorrection}
          queueLabel={queueLabel}
          onPrev={queueIdx > 0 ? () => goToQueueIdx(queueIdx - 1) : null}
          onNext={queueIdx >= 0 && queueIdx < pendingQueue.length - 1 ? () => goToQueueIdx(queueIdx + 1) : null}
        />
      </div>
    );
  }

  // Vista de detalle/creación
  if (selectedExerciseId === "new") {
    return (
      <EditorShell
        key={String(selectedExerciseId ?? "new")}
        exercise={null}
        onBack={() => setSelectedExerciseId(null)}
        onRecord={() => {}}
        onUpdate={() => {}}
        onCreate={(newEx) => handleExerciseCreated(newEx, newExInUnit)}
        onDelete={() => {}}
        categories={categories}
        onAddCategory={onAddCategory}
        audioLibrary={audioLibrary}
        units={units}
      />
    );
  }

  const selectedExercise = selectedExerciseId != null
    ? (exercises.find((e) => String(e.id) === String(selectedExerciseId)) || lastCreatedExRef.current)
    : null;

  if (selectedExercise) {
    return (
      <EditorShell
        key={String(selectedExerciseId ?? "new")}
        exercise={selectedExercise}
        onBack={() => setSelectedExerciseId(null)}
        onRecord={onRecord}
        onPreview={onPreview}
        onManageQuestions={onManageQuestions}
        onUpdate={(patch) => onUpdateExercise(selectedExercise.id, patch)}
        onCreate={() => {}}
        onDelete={() => { onDeleteExercise(selectedExercise.id); setSelectedExerciseId(null); }}
        categories={categories}
        onAddCategory={onAddCategory}
        audioLibrary={audioLibrary}
        units={units}
        onToggleVisibility={() => onUpdateExercise(selectedExercise.id, { hidden: !selectedExercise.hidden })}
        onAddToUnit={(unitId) => onAddExercisesToUnit(unitId, [selectedExercise.id as ExId])}
        onRemoveFromUnit={(unitId) => onRemoveExerciseFromUnit(unitId, String(selectedExercise.id))}
        plantillasInstrumento={(currentUser?.instrumentos as Instrumento[] | undefined) ?? []}
        onChangePlantillasInstrumento={(next) => { if (currentUser) onUpdateUser({ ...currentUser, instrumentos: next }); }}
      />
    );
  }

  // Pestañas principales, centradas en el encabezado (Jon, 2026-07-04):
  // Ejercicios · Cursos · Alumnos · Audios. Categorías y Usuarios se anidan
  // dentro de Ajustes, que se abre con el engranaje a la izquierda de «Salir».
  const primaryTabs = [
    { id: "exercises", label: "Ejercicios" },
    { id: "courses",   label: "Cursos" },
    // Punto rojo mientras quede algo por corregir (no se puede cerrar).
    { id: "students",  label: "Alumnos", dot: pendingQueue.length > 0 },
    { id: "audios",    label: "Audios" },
  ];

  return (
    <div style={S.app}>
      {/* El padding inferior móvil (96px) reserva sitio para el Fab (+) fijo:
          sin él, el botón taparía las acciones de la última fila de la lista. */}
      <div style={{ ...S.page, padding: isMobile ? "calc(18px + env(safe-area-inset-top,0px)) 14px 96px" : S.page.padding }}>
        {/* Barra superior única (Jon, 2026-07-04): pestañas arriba del todo,
            centradas; identidad a la izquierda; engranaje (Ajustes) + Salir a
            la derecha. Sin la línea negra gruesa — un filete fino basta. */}
        {(() => {
          const settingsBtn = (
            <button onClick={() => setTab("settings")} title="Ajustes" aria-label="Ajustes"
              style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 36, height: 36, borderRadius: 9, border: `1px solid ${tab === "settings" ? C.ink : C.line}`, background: tab === "settings" ? C.paper2 : "transparent", color: tab === "settings" ? C.ink : "#666", cursor: "pointer", flexShrink: 0 }}>
              <GearIcon size={18} />
            </button>
          );
          const tabsStrip = (
            // Móvil (Jon, 2026-07-05): las pestañas ocupan todo el ancho con
            // `space-between`. El margen -8 compensa solo la mitad del padding
            // horizontal (16px) del primer/último botón: así el texto de las
            // pestañas externas respira ~8px respecto al borde del contenido en
            // vez de quedar al ras de la pantalla.
            <div className="fa-noscroll" style={{ display: "flex", alignItems: "flex-end", justifyContent: isMobile ? "space-between" : "center", overflowX: "auto", flexWrap: "nowrap", WebkitOverflowScrolling: "touch", scrollbarWidth: "none", ...(isMobile ? { marginLeft: -8, marginRight: -8 } : {}) }}>
              <TabBar tabs={primaryTabs} value={tab} onChange={setTab} variant="primary" />
            </div>
          );
          const identity = (
            <div style={{ minWidth: 0 }}>
              <Overline style={{ marginBottom: 2 }}>{isAdmin ? "Administrador" : "Profesor"}</Overline>
              {/* lineHeight algo mayor evita que overflow:hidden recorte los
                  descendentes (g/j/p/q/y) de nombres largos, sin tocar el
                  truncado con ellipsis. */}
              <div style={{ fontFamily: F.serif, fontWeight: 700, fontSize: isMobile ? 22 : 24, letterSpacing: "-0.01em", color: C.ink, lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{currentUser?.displayName}</div>
            </div>
          );
          const actions = (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6, flexShrink: 0 }}>
              {/* Móvil (Jon, 2026-07-05): Ajustes + Salir se pliegan en el menú
                  «☰»; en escritorio siguen sueltos (engranaje + botón Salir). */}
              {isMobile
                ? <MobileHeaderMenu ariaLabel="Menú de cuenta" items={[
                    { label: "Ajustes", onClick: () => setTab("settings") },
                    { label: "Salir", onClick: onLogout },
                  ]} />
                : <>{settingsBtn}<GhostButton onClick={onLogout}>Salir</GhostButton></>}
            </div>
          );
          // Separación encabezado/cuerpo (Jon, 2026-07-04): filete algo más
          // presente (C.rail) + sombra suave hacia abajo — sin volver a la
          // línea negra gruesa.
          const headerSep = { borderBottom: `1px solid ${C.rail}`, boxShadow: "0 10px 16px -14px rgba(26,25,21,0.22)" };
          return isMobile ? (
            <div style={{ ...headerSep, marginBottom: 22 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, marginBottom: 8 }}>
                {identity}{actions}
              </div>
              {tabsStrip}
            </div>
          ) : (
            // Sin paddingBottom en el grid: así el subrayado de la pestaña
            // activa (2px tinta) cae JUSTO sobre el filete de separación, como
            // un tramo grueso de esa misma línea (Jon, 2026-07-04). La identidad
            // y las acciones llevan su propio padding para no tocar la línea.
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "flex-end", gap: 20, ...headerSep, marginBottom: 28 }}>
              <div style={{ paddingBottom: 14 }}>{identity}</div>
              {tabsStrip}
              <div style={{ paddingBottom: 12 }}>{actions}</div>
            </div>
          );
        })()}

        {/* Bandeja única de correcciones (Jon, 2026-07-04): el único lugar donde
            se anuncia lo pendiente — las tarjetas y las filas quedan limpias.
            «Corregir» abre la cola global y se recorre con Siguiente. Se puede
            cerrar durante la sesión salvo en Alumnos (ahí sale siempre). En
            escritorio, en Alumnos comparte fila con «+Nuevo grupo»/«+Crear
            alumno» (Jon, 2026-07-12) — StudentsTab la coloca; aquí solo se
            renderiza sola para el resto de pestañas. */}
        {showInbox && tab !== "students" && (
          <div style={{ marginBottom: 20 }}>{inboxBar}</div>
        )}

        {tab === "exercises" && (
          <ExercisesTab exercises={exercises} audioLibrary={audioLibrary} results={results}
            onNew={() => setSelectedExerciseId("new")}
            onSelect={setSelectedExerciseId}
            onPreview={onPreview}
            onToggleVisibility={(ex) => onUpdateExercise(ex.id, { hidden: !ex.hidden })}
            onDuplicate={onDuplicateExercise}
            onCorrect={onCorrectExercise}
            onDelete={(id) => { onDeleteExercise(id); setSelectedExerciseId(null); }}
            askConfirm={askConfirm} />
        )}

        {tab === "courses" && (
          <CoursesTab
            courses={courses} units={units} exercises={exercises} groups={teacherGroups}
            results={{}}
            students={students}
            resultsPorAlumno={results}
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
            onToggleVisibility={(ex) => onUpdateExercise(ex.id, { hidden: !ex.hidden })}
            onPreview={onPreview}
            onDuplicate={onDuplicateExercise}
            onDeleteExercise={(ex) => onDeleteExercise(ex.id)}
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
            inboxBar={inboxBar}
          />
        )}

        {tab === "audios" && (
          <AudiosTab audioLibrary={audioLibrary} isAdmin={isAdmin}
            onAdd={() => { setAddAudioBookId(null); setEditingAudio("new"); }}
            onEdit={(a) => setEditingAudio(a)}
            onDelete={onDeleteAudio}
            askConfirm={askConfirm}
            onAddBook={() => setEditingBook("new")}
            onEditBook={(b) => setEditingBook(b)}
            onDeleteBook={(b) => {
              // Borrar un libro NO borra sus audios: se desligan (bookId fuera)
              // y quedan como sueltos; después se borra el libro.
              audioLibrary.filter((a) => a.bookId === b.id).forEach((a) => {
                const { bookId: _drop, ...rest } = a; void _drop;
                onUpdateAudio(rest as AudioItem);
              });
              onDeleteAudio(b.id);
            }}
            onAddAudioToBook={(bookId) => { setAddAudioBookId(bookId); setEditingAudio("new"); }} />
        )}

        {/* Ajustes (Jon, 2026-07-04): página con secciones — Categorías,
            preferencias (paleta) y, para el admin, Usuarios. */}
        {tab === "settings" && (
          <>
            <SettingsSection title="Categorías">
              <CategoriesTab categories={categories}
                isAdmin={isAdmin}
                onAdd={() => setEditingCategory("new")}
                onEdit={(m) => setEditingCategory(m)}
                onDelete={onDeleteCategory}
                onToggleGlobal={onToggleGlobalCategory}
                askConfirm={askConfirm} />
            </SettingsSection>
            <SettingsSection title="Preferencias">
              <SettingsTab currentUser={currentUser} onUpdateUser={onUpdateUser} />
            </SettingsSection>
            {isAdmin && (
              <SettingsSection title="Usuarios">
                <UsersTab currentUser={currentUser} teachers={teachers}
                  onAddTeacher={() => { setAddingUserRole("teacher"); setShowAddUser(true); }}
                  onResetCred={(t) => { setResetCredTarget(t); setShowResetCred(true); }}
                  onRemove={onRemoveUser}
                  askConfirm={askConfirm} />
              </SettingsSection>
            )}
          </>
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
            units={units}
            onSave={(c) => { if (editingCourse === "new") onAddCourse({ ...c, ownerId: currentUser.id }); else onUpdateCourse(c); setEditingCourse(null); }}
            onClose={() => setEditingCourse(null)} />
        )}

        {(editingUnit !== null || unitFormCourseId !== null) && (
          <UnitFormModal
            initial={editingUnit}
            exercises={exercises}
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
            books={audioLibrary.filter((a) => a.kind === "book")}
            initialBookId={editingAudio === "new" ? addAudioBookId : null}
            allTags={audioTags(audioLibrary)}
            allComposers={audioComposers(audioLibrary)}
            onSave={(a, newBook) => {
              // Libro nuevo creado desde el propio audio: se persiste primero.
              if (newBook) onAddAudio(newBook);
              if (editingAudio === "new") onAddAudio(a); else onUpdateAudio(a);
              setEditingAudio(null); setAddAudioBookId(null);
            }}
            onClose={() => { setEditingAudio(null); setAddAudioBookId(null); }} />
        )}

        {editingBook !== null && (
          <BookFormModal
            initial={editingBook === "new" ? null : editingBook}
            allComposers={audioComposers(audioLibrary)}
            onSave={(b) => { if (editingBook === "new") onAddAudio(b); else onUpdateAudio(b); setEditingBook(null); }}
            onClose={() => setEditingBook(null)} />
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
