// ═══ CUADERNO DEL CURSO (N5) ══════════════════════════════════════════════════
// Dominio puro del cuaderno de calificaciones: tabla alumnos × unidades
// (expandible a ejercicios) + medias de clase + exportación CSV. Las medias
// por alumno son EXACTAMENTE las de N1 — misma función (unitAverage/
// courseAverage sobre ponderar) y mismos lectores de pesos — calculadas con
// rol "student": la nota de un alumno se agrega sobre lo que el alumno ve
// (unidades y ejercicios ocultos fuera), idéntica a la cabecera de su propio
// curso. Ver PLAN_CALIFICACION.md §N5.
import type { Course, Unit, Exercise, Group, ResultsMap, ExerciseResult } from "./types.js";
import { courseUnitList, unitExList, unitAverage, courseAverage, resultStatusOf, type MediaStatus } from "./domain.js";
import { ponderar, pesosDeCurso } from "./calificacion.js";
import { nota10 } from "./scoring.js";

// Lo mínimo que el cuaderno necesita saber de un alumno (evita acoplarse al
// tipo User local de teacher.tsx).
export interface AlumnoCuaderno { id: string; displayName?: string; username?: string; }

// Alumnos a los que aplica un curso, según su visibilidad: "group" → los del
// grupo; "public" y "teacher" (mis alumnos) → todos los alumnos del profesor
// (la lista que llega ya viene filtrada por profesor en TeacherDash).
export function alumnosDeCurso<A extends AlumnoCuaderno>(
  course: Course,
  students: A[],
  groups: Group[] | undefined,
): A[] {
  if ((course.visibility || "teacher") === "group") {
    const g = groups?.find((x) => x.id === course.visibilityGroupId);
    const ids = new Set(g?.studentIds ?? []);
    return students.filter((s) => ids.has(s.id));
  }
  return students;
}

// La NOTA de cada celda es exactamente la media de N1; el ESTADO se deriva de
// los ejercicios porque mediaStatusOf no distingue «todo automático» de «todo
// corregido» (marcaría ● una unidad completa aún sin corregir, y la leyenda
// del mockup reserva ● para lo corregido y ◐ para lo automático).
export interface CuadernoMedia { nota: number | null; pendientes: number; total: number; estado: MediaStatus; }
export interface CuadernoFila {
  alumno: AlumnoCuaderno;
  porUnidad: Record<string, CuadernoMedia>;
  media: CuadernoMedia;
}
export interface Cuaderno {
  unidades: Unit[];
  // Reparto normalizado (%) de cada unidad en la media del curso — el mismo
  // texto que enseña PesoEditor (regla de oro 4).
  repartoUnidades: Record<string, number>;
  filas: CuadernoFila[];
  // Media de clase: equitativa entre alumnos (entre personas no hay pesos).
  mediaClasePorUnidad: Record<string, number | null>;
  mediaClaseCurso: number | null;
}

export function cuadernoDeCurso(
  course: Course,
  units: Unit[],
  exercises: Exercise[],
  students: AlumnoCuaderno[],
  resultsPorAlumno: Record<string, ResultsMap>,
  groups?: Group[],
): Cuaderno {
  const alumnos = alumnosDeCurso(course, students, groups);
  const unidades = courseUnitList(course, units, "student");
  const pesos = pesosDeCurso(course, unidades.map((u) => u.id));
  const totalPeso = pesos.reduce((s, p) => s + p.peso, 0);
  const repartoUnidades = Object.fromEntries(
    pesos.map((p) => [p.id, totalPeso > 0 ? Math.round((p.peso / totalPeso) * 100) : 0]),
  );
  const filas: CuadernoFila[] = alumnos.map((alumno) => {
    const res = resultsPorAlumno[alumno.id] || {};
    const porUnidad = Object.fromEntries(unidades.map((u) => {
      const media = unitAverage(u, exercises, res, "student");
      const celdas = unitExList(u, exercises, "student").map((ex) => celdaEjercicio(ex, res[String(ex.id)]));
      const estado: MediaStatus = media.nota == null
        ? "pendiente"
        : celdas.every((c) => c.estado === "corregido") ? "corregido" : "provisional";
      return [u.id, { ...media, estado }];
    }));
    const mediaCurso = courseAverage(course, units, exercises, res, "student");
    const estado: MediaStatus = mediaCurso.nota == null
      ? "pendiente"
      : unidades.every((u) => porUnidad[u.id].estado === "corregido") ? "corregido" : "provisional";
    return { alumno, porUnidad, media: { ...mediaCurso, estado } };
  });
  const mediaClasePorUnidad = Object.fromEntries(unidades.map((u) => [
    u.id,
    ponderar(filas.map((f) => ({ nota: f.porUnidad[u.id]?.nota ?? null, peso: 1 }))),
  ]));
  const mediaClaseCurso = ponderar(filas.map((f) => ({ nota: f.media.nota, peso: 1 })));
  return { unidades, repartoUnidades, filas, mediaClasePorUnidad, mediaClaseCurso };
}

// Ejercicios de una unidad tal como los ve el alumno (columna expandida).
export const ejerciciosDeCuaderno = (unit: Unit, exercises: Exercise[]): Exercise[] =>
  unitExList(unit, exercises, "student");

// Celda de un ejercicio concreto: la nota vigente del resultado (preliminar
// si auto, final si corregida — result.score YA es esa) y su estado.
export interface CuadernoCeldaEj { nota: number | null; estado: MediaStatus; }
export function celdaEjercicio(exercise: Exercise, result: ExerciseResult | undefined): CuadernoCeldaEj {
  if (!result) return { nota: null, estado: "pendiente" };
  const status = resultStatusOf(result, exercise);
  return {
    nota: result.score ?? null,
    estado: result.score == null ? "pendiente" : status === "corregido" ? "corregido" : "provisional",
  };
}

// Vocabulario del cuaderno (leyenda del mockup): mismo texto en la tabla y en
// el CSV — el glifo nunca va solo (regla 9).
export const GLIFO_ESTADO: Record<MediaStatus, string> = { corregido: "●", provisional: "◐", pendiente: "○" };
export const ESTADO_TEXTO: Record<MediaStatus, string> = {
  corregido: "corregida",
  provisional: "automática",
  pendiente: "pendiente",
};

// ─── N5.2: exportación CSV (Excel es-ES) ─────────────────────────────────────
// Separador «;» (el es-ES usa la coma como decimal), BOM para que Excel
// detecte UTF-8, CRLF, medias incluidas y estados como TEXTO (nunca solo un
// glifo). Las notas van en 0-10 con coma (nota10), como en toda la app.

const celdaCsv = (media: CuadernoMedia): string =>
  media.nota == null ? `— (${ESTADO_TEXTO.pendiente})` : `${nota10(media.nota)} (${ESTADO_TEXTO[media.estado]})`;

// Comillas solo cuando hacen falta (contiene ; " o salto de línea).
const escapaCsv = (v: string): string => (/[;"\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export function csvDeCuaderno(cuaderno: Cuaderno, course: Course): string {
  const { unidades, repartoUnidades, filas, mediaClasePorUnidad, mediaClaseCurso } = cuaderno;
  const lineas: string[][] = [];
  lineas.push([`Calificaciones — ${course.name ?? ""}`]);
  lineas.push([
    "Alumno",
    ...unidades.map((u) => `${u.name ?? u.id} (${repartoUnidades[u.id] ?? 0} %)`),
    "Media",
  ]);
  for (const f of filas) {
    lineas.push([
      f.alumno.displayName || f.alumno.username || f.alumno.id,
      ...unidades.map((u) => celdaCsv(f.porUnidad[u.id] ?? { nota: null, pendientes: 0, total: 0, estado: "pendiente" })),
      celdaCsv(f.media),
    ]);
  }
  lineas.push([
    "Media de la clase",
    ...unidades.map((u) => { const n = mediaClasePorUnidad[u.id]; return n == null ? "—" : nota10(n)!; }),
    mediaClaseCurso == null ? "—" : nota10(mediaClaseCurso)!,
  ]);
  // BOM (U+FEFF) por delante: sin él, Excel es-ES abre el UTF-8 como ANSI y
  // rompe tildes y «—».
  return "\uFEFF" + lineas.map((l) => l.map(escapaCsv).join(";")).join("\r\n") + "\r\n";
}