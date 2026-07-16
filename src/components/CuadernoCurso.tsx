// ═══ CUADERNOCURSO (N5) ═══════════════════════════════════════════════════════
// Pestaña «Calificaciones» del detalle de curso (profesor): tabla alumnos ×
// unidades con la anatomía del mockup (.tb) — celda = nota 0-10 + glifo de
// estado (con su palabra en title y leyenda textual) + ▾ cuando es inferior a
// 5; una unidad se EXPANDE a sus ejercicios pulsando su cabecera. Fila y
// columna de medias salen de ponderar con los mismos lectores que las
// cabeceras de N1 (idénticas por construcción — todo vive en lib/cuaderno.ts).
// N5.3: el cuaderno entero se memoiza por (curso, unidades, ejercicios,
// alumnos, resultados) — nada recalcula por render, como UnitStats.
import { useMemo, useState } from "react";
import type { Course, Unit, Exercise, Group, ResultsMap } from "../lib/types.js";
import { C, F, S } from "../theme/tokens.js";
import { nota10 } from "../lib/scoring.js";
import type { MediaStatus } from "../lib/domain.js";
import {
  cuadernoDeCurso, csvDeCuaderno, ejerciciosDeCuaderno, celdaEjercicio,
  GLIFO_ESTADO, ESTADO_TEXTO, type AlumnoCuaderno,
} from "../lib/cuaderno.js";

const th = { font: `600 9.5px ${F.sans}`, letterSpacing: "1.1px", textTransform: "uppercase" as const, color: C.muted, textAlign: "right" as const, padding: "6px 8px", whiteSpace: "nowrap" as const, borderBottom: `1px solid ${C.line}` };
const td = { borderTop: `1px solid ${C.line}`, padding: "8px 8px", textAlign: "right" as const, whiteSpace: "nowrap" as const, fontVariantNumeric: "tabular-nums" as const, fontSize: 13.5 };

// Celda de nota: cifra + ▾ (inferior a 5, en rojo) + glifo de estado. La
// palabra del estado va en el title (la leyenda de pie la da en texto).
function CeldaNota({ nota, estado }: { nota: number | null; estado: MediaStatus }) {
  const suspensa = nota != null && nota < 50;
  return (
    <span title={ESTADO_TEXTO[estado]}>
      <span style={{ color: suspensa ? C.danger : C.ink, fontWeight: suspensa ? 600 : 400 }}>
        {nota10(nota) ?? "—"}{suspensa ? " ▾" : ""}
      </span>
      <span aria-hidden="true" style={{ color: C.muted2, marginLeft: 5 }}>{GLIFO_ESTADO[estado]}</span>
    </span>
  );
}

export interface CuadernoCursoProps {
  course: Course;
  units: Unit[];
  exercises: Exercise[];
  students: AlumnoCuaderno[];
  resultsPorAlumno: Record<string, ResultsMap>;
  groups?: Group[];
}

export function CuadernoCurso({ course, units, exercises, students, resultsPorAlumno, groups }: CuadernoCursoProps) {
  const cuaderno = useMemo(
    () => cuadernoDeCurso(course, units, exercises, students, resultsPorAlumno, groups),
    [course, units, exercises, students, resultsPorAlumno, groups],
  );
  // Unidad expandida a sus ejercicios (una a la vez: la tabla ya es ancha).
  const [unidadAbierta, setUnidadAbierta] = useState<string | null>(null);
  const { unidades, repartoUnidades, filas, mediaClasePorUnidad, mediaClaseCurso } = cuaderno;

  const exportarCsv = () => {
    const blob = new Blob([csvDeCuaderno(cuaderno, course)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `calificaciones-${(course.name || "curso").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-")}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (filas.length === 0 || unidades.length === 0) {
    return (
      <div style={{ ...S.card, textAlign: "center", color: C.muted, padding: "2rem", fontFamily: F.sans, fontSize: 13 }}>
        {unidades.length === 0 ? "El curso aún no tiene unidades visibles para los alumnos." : "Este curso aún no tiene alumnos."}
      </div>
    );
  }

  return (
    <div style={{ ...S.card, fontFamily: F.sans }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <span style={{ fontFamily: F.serif, fontSize: 17, fontWeight: 600, color: C.ink }}>Calificaciones</span>
        <span style={{ flex: 1 }} />
        <button type="button" onClick={exportarCsv} style={{ ...S.btn, fontSize: 12.5 }}>Exportar CSV</button>
      </div>
      {/* La tabla scrollea dentro de su propio contenedor; la página, nunca. */}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: "left", paddingLeft: 0 }}>Alumno</th>
              {unidades.map((u) => {
                const abierta = unidadAbierta === u.id;
                const ejercicios = abierta ? ejerciciosDeCuaderno(u, exercises) : [];
                return [
                  <th key={u.id} style={th}>
                    <button type="button" onClick={() => setUnidadAbierta(abierta ? null : u.id)}
                      title={abierta ? "Contraer los ejercicios de la unidad" : "Expandir a sus ejercicios"}
                      style={{ font: "inherit", letterSpacing: "inherit", textTransform: "inherit", color: "inherit", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                      {abierta ? "▾" : "▸"} {u.name || u.id} · {repartoUnidades[u.id] ?? 0} %
                    </button>
                  </th>,
                  ...ejercicios.map((ex) => (
                    <th key={`${u.id}-${ex.id}`} style={{ ...th, fontWeight: 500, color: C.muted2, maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis" }}>
                      {ex.title}
                    </th>
                  )),
                ];
              })}
              <th style={th}>Media</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.alumno.id}>
                <td style={{ ...td, textAlign: "left", paddingLeft: 0, fontWeight: 600, color: C.ink }}>
                  {f.alumno.displayName || f.alumno.username || f.alumno.id}
                </td>
                {unidades.map((u) => {
                  const abierta = unidadAbierta === u.id;
                  const ejercicios = abierta ? ejerciciosDeCuaderno(u, exercises) : [];
                  const media = f.porUnidad[u.id] ?? { nota: null, pendientes: 0, total: 0, estado: "pendiente" as const };
                  return [
                    <td key={u.id} style={td}><CeldaNota nota={media.nota} estado={media.estado} /></td>,
                    ...ejercicios.map((ex) => {
                      const celda = celdaEjercicio(ex, resultsPorAlumno[f.alumno.id]?.[String(ex.id)]);
                      return <td key={`${u.id}-${ex.id}`} style={{ ...td, background: C.paper2 }}><CeldaNota nota={celda.nota} estado={celda.estado} /></td>;
                    }),
                  ];
                })}
                <td style={{ ...td, fontWeight: 700 }}><CeldaNota nota={f.media.nota} estado={f.media.estado} /></td>
              </tr>
            ))}
            {/* Columna de medias del mockup: la media de la CLASE por unidad y
                del curso — equitativa entre alumnos, vía ponderar. */}
            <tr>
              <td style={{ ...td, textAlign: "left", paddingLeft: 0, color: C.muted, fontWeight: 600 }}>Media de la clase</td>
              {unidades.map((u) => {
                const abierta = unidadAbierta === u.id;
                const ejercicios = abierta ? ejerciciosDeCuaderno(u, exercises) : [];
                return [
                  <td key={u.id} style={{ ...td, color: C.ink2, fontWeight: 600 }}>{nota10(mediaClasePorUnidad[u.id]) ?? "—"}</td>,
                  ...ejercicios.map((ex) => <td key={`${u.id}-${ex.id}`} style={{ ...td, background: C.paper2, color: C.muted }}>·</td>),
                ];
              })}
              <td style={{ ...td, color: C.ink2, fontWeight: 700 }}>{nota10(mediaClaseCurso) ?? "—"}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 11.5, color: C.muted, marginTop: 10 }}>
        ● corregida · ◐ automática · ○ pendiente · ▾ inferior a 5
      </div>
    </div>
  );
}
