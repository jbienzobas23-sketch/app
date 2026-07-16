// N5: cuaderno del curso — el dominio puro (tabla, medias de clase, CSV).
// La invariante clave: las medias por alumno son LAS MISMAS que las cabeceras
// de N1 (unitAverage/courseAverage) por construcción — aquí se verifica
// explícitamente contra esas funciones.
import { describe, it, expect } from "vitest";
import type { Course, Unit, Exercise, ResultsMap } from "./types.js";
import { unitAverage, courseAverage } from "./domain.js";
import { alumnosDeCurso, cuadernoDeCurso, celdaEjercicio, csvDeCuaderno } from "./cuaderno.js";

const exercises = [
  { id: "e1", title: "Coral", model: "interactivo" },
  { id: "e2", title: "Dictado; armónico", model: "interactivo" },
] as unknown as Exercise[];
const units: Unit[] = [
  { id: "u1", name: "Cadencias", exerciseIds: ["e1"] },
  { id: "u2", name: "Formas", exerciseIds: ["e2"] },
];
const course: Course = { id: "c1", name: "Armonía I", unitIds: ["u1", "u2"], evaluacion: { modo: "personalizada", pesos: { u1: 1, u2: 3 } } };
const students = [
  { id: "ana", displayName: "Ana" },
  { id: "ben", displayName: "Ben" },
];
const resultsPorAlumno: Record<string, ResultsMap> = {
  // Ana: u1 corregida (80), u2 automática (60).
  ana: {
    e1: { score: 80, status: "corregido", teacherCorrection: { corrected: true } },
    e2: { score: 60, status: "auto" },
  },
  // Ben: u1 automática (40, suspensa), u2 sin entrega.
  ben: { e1: { score: 40, status: "auto" } },
};

describe("alumnosDeCurso (N5.1)", () => {
  it("visibilidad de grupo: solo los miembros; público/mis alumnos: todos", () => {
    const grupos = [{ id: "g1", studentIds: ["ben"] }];
    expect(alumnosDeCurso({ ...course, visibility: "group", visibilityGroupId: "g1" }, students, grupos).map((s) => s.id)).toEqual(["ben"]);
    expect(alumnosDeCurso({ ...course, visibility: "public" }, students, grupos)).toHaveLength(2);
    expect(alumnosDeCurso(course, students, grupos)).toHaveLength(2);
  });
});

describe("cuadernoDeCurso (N5.1)", () => {
  const cuaderno = cuadernoDeCurso(course, units, exercises, students, resultsPorAlumno);

  it("las medias por alumno son EXACTAMENTE las de N1 (misma función, mismos lectores)", () => {
    const ana = cuaderno.filas.find((f) => f.alumno.id === "ana")!;
    expect(ana.porUnidad.u1).toMatchObject(unitAverage(units[0], exercises, resultsPorAlumno.ana, "student"));
    expect(ana.media).toMatchObject(courseAverage(course, units, exercises, resultsPorAlumno.ana, "student"));
    // Con pesos 1/3: (80·1 + 60·3) / 4 = 65.
    expect(ana.media.nota).toBe(65);
  });

  it("estado de celda según el mockup: ● solo corregido; ◐ con nota automática; ○ sin nota", () => {
    const ana = cuaderno.filas.find((f) => f.alumno.id === "ana")!;
    const ben = cuaderno.filas.find((f) => f.alumno.id === "ben")!;
    expect(ana.porUnidad.u1.estado).toBe("corregido");
    expect(ana.porUnidad.u2.estado).toBe("provisional");
    expect(ana.media.estado).toBe("provisional");
    expect(ben.porUnidad.u2.estado).toBe("pendiente");
  });

  it("reparto normalizado de los pesos del curso (1/3 → 25 % · 75 %)", () => {
    expect(cuaderno.repartoUnidades).toEqual({ u1: 25, u2: 75 });
  });

  it("media de la clase: equitativa entre alumnos; los null quedan fuera", () => {
    // u1: Ana 80, Ben 40 → 60. u2: Ana 60, Ben sin entrega (null fuera) → 60.
    expect(cuaderno.mediaClasePorUnidad).toEqual({ u1: 60, u2: 60 });
    // Curso: Ana 65, Ben 40 (su u2 null queda fuera de SU media) → 53 (52,5 redondeado).
    expect(cuaderno.mediaClaseCurso).toBe(53);
  });
});

describe("celdaEjercicio (N5.1)", () => {
  const ex = exercises[0];
  it("sin entrega → pendiente; automática con nota → provisional; corregida → corregida", () => {
    expect(celdaEjercicio(ex, undefined)).toEqual({ nota: null, estado: "pendiente" });
    expect(celdaEjercicio(ex, { score: 60, status: "auto" })).toEqual({ nota: 60, estado: "provisional" });
    expect(celdaEjercicio(ex, { score: 80, status: "corregido", teacherCorrection: { corrected: true } })).toEqual({ nota: 80, estado: "corregido" });
  });
  it("entrega sin nota utilizable (el libre) → pendiente", () => {
    expect(celdaEjercicio(ex, { score: null, status: "auto" })).toEqual({ nota: null, estado: "pendiente" });
  });
});

describe("csvDeCuaderno (N5.2)", () => {
  const csv = csvDeCuaderno(cuadernoDeCurso(course, units, exercises, students, resultsPorAlumno), course);

  it("BOM + separador «;» + CRLF (Excel es-ES)", () => {
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain(";");
    expect(csv).toContain("\r\n");
  });
  it("cabecera con el reparto, notas 0-10 con coma y estados como texto", () => {
    expect(csv).toContain("Alumno;Cadencias (25 %);Formas (75 %);Media");
    expect(csv).toContain("Ana;8 (corregida);6 (automática);6,5 (automática)");
    expect(csv).toContain("Ben;4 (automática);— (pendiente);4 (automática)");
  });
  it("fila final con las medias de la clase", () => {
    expect(csv).toContain("Media de la clase;6;6;5,3");
  });
});
