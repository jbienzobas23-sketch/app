// ═══ STUDENTDASH (DASHBOARD DEL ALUMNO) ══════════════════════════════════════
// Cabecera y UNA sola página (Jon, 2026-07-04): sección "Cursos" primero y
// "Todos los ejercicios" debajo, colapsable — ya no hay pestañas.
import { useState, useMemo } from "react";
import type { Exercise, ExerciseResult, Unit } from "../lib/types.js";
import { C, F, S } from "../theme/tokens.js";
import { SCHEMA_PALETTE_DEFAULT } from "../lib/palette.js";
import { modelsOf, composersOf } from "../lib/domain.js";
import { useIsMobile } from "../hooks/useIsMobile.js";
import { rowButtonProps } from "../lib/a11y.js";
import { parseHashQuery, setHashQuery } from "../lib/routing.js";
import { Chevron, StudentFilterBar, Overline, GhostButton, MobileHeaderMenu } from "./primitives.jsx";
import { ExerciseItem } from "./ExerciseItem.jsx";
import { CoursesPages } from "./courses.jsx";
import { PaletteMenuButton } from "./PaletteMenuButton.jsx";

// ── Interfaces de props ──────────────────────────────────────────────────────
// Exportado para que App.tsx tipe su cast de UserProfile (F7, T7.2).
export interface StudentUser { id: string; teacherId?: string; displayName: string; isGuest?: boolean; defaultPalette?: string; [k: string]: unknown; }
interface CourseItem { id: string; hidden?: boolean; visibility?: string; visibilityGroupId?: string | null; ownerId?: string; [k: string]: unknown; }
interface GroupItem { id: string; studentIds?: string[]; [k: string]: unknown; }
interface StudentDashProps {
  user: StudentUser;
  exercises: Exercise[];
  results: Record<string, ExerciseResult>;
  courses: CourseItem[];
  units: Unit[];
  groups?: GroupItem[];
  onExercise: (ex: Exercise) => void;
  onViewCorrection?: (ex: Exercise) => void;
  onLogout: () => void;
  onChangeTeacher?: () => void;
  onUpdatePalette?: (palette: string) => void;
  tab?: string;
  onTab?: (tab: string) => void;
  cursoId?: string | null;
  unidadId?: string | null;
  onNavigateCourses?: (cursoId?: string | null, unidadId?: string | null) => void;
}

export function StudentDash({ user, exercises, results, courses, units, groups = [], onExercise, onViewCorrection, onLogout, onChangeTeacher, onUpdatePalette, cursoId = null, unidadId = null, onNavigateCourses }: StudentDashProps) {
  const isMobile = useIsMobile();
  // "Todos los ejercicios" colapsable, persistido en la query (?todos=0) igual
  // que los filtros (T3.6): sobrevive a entrar en un ejercicio y volver.
  const [allOpen, setAllOpenState] = useState(() => parseHashQuery().todos !== "0");
  const toggleAllOpen = () => { const v = !allOpen; setAllOpenState(v); setHashQuery({ todos: v ? null : "0" }); };
  // Con un curso (o unidad móvil) abierto, la página profunda del curso ocupa
  // todo; la página raíz unificada solo se muestra sin curso seleccionado.
  const inCourseDetail = cursoId != null || unidadId != null;
  // Filtros persistidos en la query (T3.6): sobreviven a entrar a un
  // ejercicio y volver, porque StudentDash se desmonta al navegar a la sesión
  // y al remontar vuelve a leer ?tipo=/?estado= de la URL.
  const [filterModel, setFilterModelState] = useState(() => parseHashQuery().tipo   || "all");
  const [filterDone,  setFilterDoneState]  = useState(() => parseHashQuery().estado || "all");
  const setFilterModel = (v: string) => { setFilterModelState(v); setHashQuery({ tipo: v === "all" ? null : v }); };
  const setFilterDone  = (v: string) => { setFilterDoneState(v);  setHashQuery({ estado: v === "all" ? null : v }); };
  // Buscador (Jon, 2026-07-04): mismo comportamiento que el del profesor —
  // título o compositor, sin persistir en la URL (es efímero por naturaleza).
  const [searchQuery, setSearchQuery] = useState("");

  const teacherCourses = useMemo(() => {
    const studentGroupIds = new Set(groups.filter((g) => g.studentIds?.includes(user.id)).map((g) => g.id));
    return courses.filter((c) => {
      if (c.hidden) return false;
      const vis = c.visibility ?? "teacher";
      if (vis === "public")  return true;
      if (vis === "group")   return studentGroupIds.has(c.visibilityGroupId ?? "");
      // "teacher" (default): cursos del profesor asignado
      if (!c.ownerId) return true;
      return c.ownerId === user.teacherId;
    });
  }, [courses, groups, user.id, user.teacherId]);

  // Menos ruido (Jon, 2026-07-04): los filtros solo aparecen cuando hay
  // volumen suficiente para necesitarlos (>6 visibles) — igual que la vista
  // del profesor. Con la barra oculta, los filtros NO se aplican (aunque la
  // URL traiga ?tipo=/?estado=): sin barra no habría forma de limpiarlos.
  const visibleCount  = useMemo(() => exercises.filter((ex) => !ex.hidden).length, [exercises]);
  const showFilterBar = visibleCount > 6;

  const filteredExercises = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return exercises.filter((ex) => {
      if (ex.hidden) return false;
      if (!showFilterBar) return true;
      if (filterModel !== "all" && !modelsOf(ex).includes(filterModel)) return false;
      if (filterDone === "done"    && !results[String(ex.id ?? "")]) return false;
      if (filterDone === "notdone" &&  results[String(ex.id ?? "")]) return false;
      if (q) {
        const haystack = [ex.title, ...composersOf(ex)].filter(Boolean).join(" ").toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [exercises, filterModel, filterDone, results, showFilterBar, searchQuery]);

  return (
    <div style={S.app}>
      <div style={{ ...S.page, padding: isMobile ? "calc(18px + env(safe-area-inset-top,0px)) 14px 40px" : S.page.padding }}>
        {user.isGuest && (
          <div style={{ background: C.noteBg, border: `1px solid rgba(199,122,26,0.28)`, borderRadius: 8, padding: "8px 14px", marginBottom: 20, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontFamily: F.sans, fontSize: 12, fontWeight: 600, color: C.noteInk }}>Modo invitado</span>
            <span style={{ fontFamily: F.sans, fontSize: 12, color: C.muted }}>· Los resultados no se guardan al salir</span>
          </div>
        )}

        {/* Cabecera: mismo filete de separación que el profesor (Jon,
            2026-07-04) — filete fino C.rail + sombra suave, sin la línea negra
            gruesa. */}
        <div style={{ marginBottom: isMobile ? 20 : 26, paddingBottom: isMobile ? 14 : 18, borderBottom: `1px solid ${C.rail}`, boxShadow: "0 10px 16px -14px rgba(26,25,21,0.22)", display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <Overline>Alumno</Overline>
            <h1 style={{ ...S.h1, fontSize: isMobile ? 24 : 32, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.displayName}</h1>
          </div>
          {/* Móvil (Jon, 2026-07-05): paleta + cambiar profesor + salir se
              pliegan en el menú «☰»; en escritorio siguen sueltos. */}
          {isMobile ? (
            <MobileHeaderMenu
              ariaLabel="Menú de cuenta"
              palette={onUpdatePalette ? { current: user.defaultPalette || SCHEMA_PALETTE_DEFAULT, onSelect: onUpdatePalette } : undefined}
              items={[
                ...(!user.isGuest && onChangeTeacher ? [{ label: "Cambiar profesor", onClick: onChangeTeacher }] : []),
                { label: "Salir", onClick: onLogout },
              ]}
            />
          ) : (
            <div style={{ display: "flex", gap: 8, flexShrink: 0, alignItems: "center" }}>
              {onUpdatePalette && (
                <PaletteMenuButton current={user.defaultPalette || SCHEMA_PALETTE_DEFAULT} onSelect={onUpdatePalette} />
              )}
              {!user.isGuest && onChangeTeacher && (
                <GhostButton onClick={onChangeTeacher}>Cambiar profesor</GhostButton>
              )}
              <GhostButton onClick={onLogout}>Salir</GhostButton>
            </div>
          )}
        </div>

        {/* ── Página única (Jon, 2026-07-04): Cursos primero, "Todos los
            ejercicios" debajo y colapsable. Con un curso abierto, su página
            profunda ocupa todo (se vuelve con "‹ Volver a cursos"). ── */}
        {inCourseDetail ? (
          <CoursesPages
            role="student"
            courses={teacherCourses}
            units={units}
            exercises={exercises}
            groups={groups}
            results={results}
            onExercise={onExercise}
            onViewCorrection={onViewCorrection}
            cursoId={cursoId}
            unidadId={unidadId}
            onNavigate={onNavigateCourses || (() => {})}
          />
        ) : (
          <>
            {teacherCourses.length > 0 && (
              <section style={{ marginBottom: 34 }}>
                {/* Título de sección en versalitas Outfit + filete (Jon,
                    2026-07-04): registro tipográfico distinto del nombre serif
                    del encabezado, para que no compitan. */}
                <h2 style={{ display: "flex", alignItems: "center", gap: 12, fontFamily: F.sans, fontSize: 13, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: C.ink, margin: "0 0 16px" }}>
                  Cursos
                  <span aria-hidden="true" style={{ flex: 1, height: 1, background: C.line }} />
                </h2>
                <CoursesPages
                  role="student"
                  courses={teacherCourses}
                  units={units}
                  exercises={exercises}
                  groups={groups}
                  results={results}
                  onExercise={onExercise}
                  onViewCorrection={onViewCorrection}
                  cursoId={null}
                  unidadId={null}
                  onNavigate={onNavigateCourses || (() => {})}
                />
              </section>
            )}

            <section>
              {/* Cabecera colapsable solo si hay cursos encima; sin cursos, la
                  lista es la página entera y el pliegue sería ruido. */}
              {teacherCourses.length > 0 ? (
                <div onClick={toggleAllOpen} {...rowButtonProps(toggleAllOpen)} aria-expanded={allOpen}
                  style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer", userSelect: "none", marginBottom: allOpen ? 16 : 0 }}>
                  <h2 style={{ display: "flex", alignItems: "center", gap: 9, fontFamily: F.sans, fontSize: 13, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: C.ink, margin: 0 }}>
                    Todos los ejercicios
                    <Chevron open={allOpen} size={14} />
                  </h2>
                  <span aria-hidden="true" style={{ flex: 1, height: 1, background: C.line }} />
                </div>
              ) : null}
              {(teacherCourses.length === 0 || allOpen) && (
                <>
                  {showFilterBar && (
                    <StudentFilterBar
                      filterModel={filterModel} setFilterModel={setFilterModel}
                      filterDone={filterDone}   setFilterDone={setFilterDone}
                      searchQuery={searchQuery} setSearchQuery={setSearchQuery}
                    />
                  )}
                  {filteredExercises.length === 0
                    ? <p style={{ color: C.muted, fontFamily: F.sans, textAlign: "center", padding: "2rem 1rem", fontSize: 13 }}>
                        {exercises.length === 0
                          ? "Tu profesor aún no ha publicado ejercicios."
                          : "Ningún ejercicio coincide con los filtros."}
                      </p>
                    : isMobile
                      ? <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          {filteredExercises.map((ex) => (
                            <ExerciseItem key={String(ex.id ?? "")} ex={ex} role="student" variant="row" compact
                              result={results[String(ex.id ?? "")]} onOpen={onExercise} onViewCorrection={onViewCorrection} />
                          ))}
                        </div>
                      : <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16, alignItems: "start" }}>
                          {filteredExercises.map((ex) => (
                            <ExerciseItem key={String(ex.id ?? "")} ex={ex} role="student" variant="grid"
                              result={results[String(ex.id ?? "")]} onOpen={onExercise} onViewCorrection={onViewCorrection} />
                          ))}
                        </div>
                  }
                </>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
