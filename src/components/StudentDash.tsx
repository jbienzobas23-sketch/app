// ═══ STUDENTDASH (DASHBOARD DEL ALUMNO) ══════════════════════════════════════
// Cabecera, pestañas (todos los ejercicios / por cursos) y filtros. Extraída (Fase 2).
import { useState, useMemo } from "react";
import type { Exercise, ExerciseResult, Unit } from "../lib/types.js";
import { C, F, S } from "../theme/tokens.js";
import { SCHEMA_PALETTE_DEFAULT } from "../lib/palette.js";
import { modelsOf } from "../lib/domain.js";
import { useIsMobile } from "../hooks/useIsMobile.js";
import { TabBar, StudentFilterBar, Overline, GhostButton } from "./primitives.jsx";
import { ExerciseRow } from "./student.jsx";
import { CoursesPages } from "./courses.jsx";
import { PaletteMenuButton } from "./PaletteMenuButton.jsx";

// ── Interfaces de props ──────────────────────────────────────────────────────
interface StudentUser { id: string; teacherId?: string; displayName: string; isGuest?: boolean; defaultPalette?: string; [k: string]: unknown; }
interface CourseItem { id: string; hidden?: boolean; visibility?: string; visibilityGroupId?: string; ownerId?: string; [k: string]: unknown; }
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
}

export function StudentDash({ user, exercises, results, courses, units, groups = [], onExercise, onViewCorrection, onLogout, onChangeTeacher, onUpdatePalette, tab = "all", onTab }: StudentDashProps) {
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
      if (vis === "group")   return studentGroupIds.has(c.visibilityGroupId ?? "");
      // "teacher" (default): cursos del profesor asignado
      if (!c.ownerId) return true;
      return c.ownerId === user.teacherId;
    });
  }, [courses, groups, user.id, user.teacherId]);

  const filteredExercises = useMemo(() => {
    return exercises.filter((ex) => {
      if (ex.hidden) return false;
      if (filterModel !== "all" && !modelsOf(ex).includes(filterModel)) return false;
      if (filterDone === "done"    && !results[String(ex.id ?? "")]) return false;
      if (filterDone === "notdone" &&  results[String(ex.id ?? "")]) return false;
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
                    <ExerciseRow key={String(ex.id ?? "")} ex={ex} result={results[String(ex.id ?? "")]} onOpen={onExercise} onViewCorrection={onViewCorrection} />
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
