import { describe, it, expect } from "vitest";
import { routeFromSegments, coursesPath } from "./routing.js";

describe("routeFromSegments — parte/:pid (F4, T4.2)", () => {
  it("grabar/previsualizar/preguntas sin parte: sin partId en params", () => {
    expect(routeFromSegments(["profesor", "ejercicio", "e1", "grabar"]))
      .toEqual({ name: "session", params: { exId: "e1", mode: "record" } });
    expect(routeFromSegments(["profesor", "ejercicio", "e1", "preguntas"]))
      .toEqual({ name: "question-manager", params: { exId: "e1" } });
  });
  it("con parte/:pid, el partId viaja en los params", () => {
    expect(routeFromSegments(["profesor", "ejercicio", "e1", "parte", "p2", "grabar"]))
      .toEqual({ name: "session", params: { exId: "e1", partId: "p2", mode: "record" } });
    expect(routeFromSegments(["profesor", "ejercicio", "e1", "parte", "p2", "previsualizar"]))
      .toEqual({ name: "session", params: { exId: "e1", partId: "p2", mode: "preview" } });
    expect(routeFromSegments(["profesor", "ejercicio", "e1", "parte", "p2", "preguntas"]))
      .toEqual({ name: "question-manager", params: { exId: "e1", partId: "p2" } });
    expect(routeFromSegments(["profesor", "ejercicio", "e1", "parte", "p2", "correccion"]))
      .toEqual({ name: "correction", params: { exId: "e1", partId: "p2", from: "teacher" } });
  });
  it("parte sin acción reconocida cae al detalle del ejercicio", () => {
    expect(routeFromSegments(["profesor", "ejercicio", "e1", "parte", "p2"]))
      .toEqual({ name: "teacher-detail", params: { exId: "e1" } });
  });
});

describe("coursesPath", () => {
  it("sin curso, la ruta base del rol", () => {
    expect(coursesPath("student")).toBe("/alumno/cursos");
    expect(coursesPath("teacher")).toBe("/profesor/cursos");
  });
  it("con curso, sin unidad", () => {
    expect(coursesPath("student", "c1")).toBe("/alumno/cursos/c1");
  });
  it("con curso y unidad", () => {
    expect(coursesPath("teacher", "c1", "u1")).toBe("/profesor/cursos/c1/u1");
  });
});
