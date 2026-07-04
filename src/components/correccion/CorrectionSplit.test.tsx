// M3.4: humo de las tres vistas de corrección troceadas. Verifica que el
// despachador de CorrectionView monta cada una sin romperse (imports, refs) y
// muestra su contenido característico. La corrección de esquema (profesor→
// alumno) ya tiene cobertura de flujo en integration.test.tsx; aquí cubrimos
// que las tres ramas rinden tras el troceo.
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CorrectionView } from "../CorrectionView.js";
import type { Exercise, ExerciseResult } from "../../lib/types.js";

const mk = (o: Partial<Exercise>): Exercise => ({ audioUrl: null, showHint: false, ...o } as Exercise);

describe("CorrectionView — despachador troceado (M3.4)", () => {
  it("cuestionario: monta QuizCorrection y muestra la puntuación automática", () => {
    const exercise = mk({
      id: "q-1", title: "Cuestionario demo", duration: 30, model: "cuestionario", categories: [],
      questions: [
        { id: "q1", type: "test", text: "¿Primera?", options: [{ id: "A", text: "Sí" }, { id: "B", text: "No" }], correctOptionId: "A", audioStart: 0, audioEnd: 10 },
      ],
    });
    const result: ExerciseResult = { type: "cuestionario", answers: { q1: "A" }, score: 100 };
    render(<CorrectionView exercise={exercise} result={result} onBack={() => {}} />);
    expect(screen.getByText("¿Primera?")).toBeInTheDocument();
    expect(screen.getAllByText(/100%/).length).toBeGreaterThan(0);
  });

  it("interactivo: monta InteractiveCorrection y muestra el porcentaje de acierto", () => {
    const exercise = mk({
      id: "i-1", title: "Interactivo demo", duration: 20, model: "interactivo",
      categories: [{ id: "default", name: "T/S/D", buttons: [{ id: "T", name: "Tónica", color: "#3F9B5B" }] }],
      answers: { default: [{ fn: "T", start: 0, end: 20 }] },
    });
    const result: ExerciseResult = { type: "interactivo", categoryId: "default", intervals: [{ fn: "T", start: 0, end: 20 }], score: 88 };
    render(<CorrectionView exercise={exercise} result={result} onBack={() => {}} />);
    expect(screen.getAllByText(/88%/).length).toBeGreaterThan(0);
  });

  it("esquema (alumno): monta SchemaCorrection y muestra la nota de colocación", () => {
    const exercise = mk({ id: "s-1", title: "Esquema demo", duration: 40, model: "esquema", categories: [] });
    const result: ExerciseResult = { type: "esquema", blocks: [{ id: "b1", level: 1, start: 0, end: 10, label: "A" }], placementScore: 75, score: 75 };
    render(<CorrectionView exercise={exercise} result={result} onBack={() => {}} />);
    expect(screen.getAllByText(/75%/).length).toBeGreaterThan(0);
  });
});
