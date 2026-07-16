// ═══ TESTS DE INTEGRACIÓN (F7, T7.3) ═════════════════════════════════════════
// Cuatro escenarios del plan, cada uno a través del componente real más
// pequeño que ejercita la integración pedida — sin montar <App/> completa (que
// exigiría simular login/Supabase/routing sin aportar más confianza que estos
// límites) y sin snapshots de estilos.
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SessionShell } from "./components/SessionShell.jsx";
import { QuestionnaireView } from "./components/QuestionnaireView.jsx";
import { ExerciseItem } from "./components/ExerciseItem.jsx";
import { CorrectionView } from "./components/CorrectionView.jsx";
import type { Exercise, ExerciseResult } from "./lib/types.js";

const mk = (o: Partial<Exercise>): Exercise => ({ audioUrl: null, showHint: false, ...o } as Exercise);

// ── 1. Borradores multiparte sobreviven a cambio de parte y de modelo ────────
describe("Borradores multiparte (F4, T4.3)", () => {
  it("cambiar de parte no pierde la respuesta ya dada en otra parte", () => {
    const exercise = mk({
      id: "multi-1", title: "Dos cuestionarios", duration: 0, model: "cuestionario", categories: [], answers: {},
      parts: [
        { id: "p1", title: "Parte 1", audioUrl: null, duration: 0, points: 1,
          questions: [{ id: "q1", type: "test", text: "¿Pregunta 1?", options: [{ id: "A", text: "Sí" }, { id: "B", text: "No" }], correctOptionId: "A" }] },
        { id: "p2", title: "Parte 2", audioUrl: null, duration: 0, points: 1,
          questions: [{ id: "q2", type: "test", text: "¿Pregunta 2?", options: [{ id: "A", text: "Sí" }, { id: "B", text: "No" }], correctOptionId: "B" }] },
      ],
    });
    render(<SessionShell exercise={exercise} mode="student" onSubmit={() => {}} onBack={() => {}} />);

    // Responder la parte 1 (expandir la pregunta, elegir una opción).
    fireEvent.click(screen.getByText("¿Pregunta 1?"));
    fireEvent.click(screen.getByRole("button", { name: /Sí/ }));

    // Ir a la parte 2 (chip "2" de la tira de navegación) y responderla también.
    fireEvent.click(screen.getByRole("button", { name: /^2/ }));
    fireEvent.click(screen.getByText("¿Pregunta 2?"));
    fireEvent.click(screen.getByRole("button", { name: /No/ }));

    // Volver a la parte 1: su respuesta debe seguir ahí (chip "1" marcado con
    // ✓ como completo, y la pregunta con su propio ✓ de respondida).
    fireEvent.click(screen.getByRole("button", { name: /^1/ }));
    expect(screen.getAllByText("✓").length).toBeGreaterThanOrEqual(2);
  });

  it("cambiar de modelo dentro de una parte híbrida no pierde el borrador del cuestionario", () => {
    const exercise = mk({
      id: "hybrid-1", title: "Parte híbrida", duration: 0, model: "interactivo",
      models: ["cuestionario", "interactivo"], categories: [], answers: {},
      questions: [{ id: "q1", type: "test", text: "¿Qué función es?", options: [{ id: "A", text: "Tónica" }, { id: "B", text: "Dominante" }], correctOptionId: "A" }],
    });
    render(<SessionShell exercise={exercise} mode="student" onSubmit={() => {}} onBack={() => {}} />);

    fireEvent.click(screen.getByText("¿Qué función es?"));
    fireEvent.click(screen.getByRole("button", { name: /Tónica/ }));
    // "Parte 1/1 · …" del navegador de partes también contiene "1/1"; el
    // contador propio de respondidas se distingue por su sufijo "completo".
    expect(screen.getAllByText(/completo/).length).toBeGreaterThan(0);

    // Alternar al modelo Interactivo y de vuelta a Cuestionario.
    fireEvent.click(screen.getByRole("button", { name: "Interactivo" }));
    fireEvent.click(screen.getByRole("button", { name: "Cuestionario" }));

    // La respuesta sigue contando como dada — el "toggle destructivo" (F4) no reaparece.
    // "Parte 1/1 · …" del navegador de partes también contiene "1/1"; el
    // contador propio de respondidas se distingue por su sufijo "completo".
    expect(screen.getAllByText(/completo/).length).toBeGreaterThan(0);
  });
});

// ── 2. El "sobre" que produce la sesión es el contrato que espera submitAnswer ──
// submitAnswer vive dentro de App.tsx (closure con estado/routing/Supabase) y no
// se exporta; se prueba aquí la frontera real que consume — el payload que cada
// vista de sesión entrega — para los dos casos del plan. La puntuación y el
// sobre final (addAttempt/aggregateParts/calcQuestionnaireScore) ya están
// cubiertos en domain.test.js y scoring.test.js.
describe('El payload de sesión es el "sobre correcto" que espera submitAnswer', () => {
  it("una-parte legacy (cuestionario): payload = { type, answers, score }", () => {
    const exercise = mk({
      id: "legacy-1", title: "Cuestionario legacy", duration: 30, model: "cuestionario", categories: [], answers: {},
      // Textos de opción distintos entre preguntas: QuestionnaireView renderiza
      // TODAS las preguntas a la vez (el acordeón solo colapsa por CSS, no
      // desmonta), así que un mismo texto en dos preguntas sería ambiguo aquí.
      questions: [
        { id: "q1", type: "test", text: "¿Primera?", options: [{ id: "A", text: "Sí" }, { id: "B", text: "No" }], correctOptionId: "A", audioStart: 0, audioEnd: 10 },
        { id: "q2", type: "test", text: "¿Segunda?", options: [{ id: "A", text: "Verdadero" }, { id: "B", text: "Falso" }], correctOptionId: "B", audioStart: 10, audioEnd: 20 },
      ],
    });
    let submitted: unknown = null;
    render(<QuestionnaireView exercise={exercise} onSubmit={(r) => { submitted = r; }} onBack={() => {}} />);

    fireEvent.click(screen.getByText("¿Primera?"));
    fireEvent.click(screen.getByRole("button", { name: /Sí/ }));
    fireEvent.click(screen.getByText("¿Segunda?"));
    fireEvent.click(screen.getByRole("button", { name: /Falso/ }));
    fireEvent.click(screen.getByText("Entregar"));

    expect(submitted).toEqual({ type: "cuestionario", answers: { q1: "A", q2: "B" }, score: 100 });
  });

  it("multiparte: payload = { type: \"multi\", parts: { [partId]: { points, byModel } } }", () => {
    const exercise = mk({
      id: "multi-2", title: "Multiparte", duration: 0, model: "cuestionario", categories: [], answers: {},
      parts: [
        { id: "p1", title: "P1", audioUrl: null, duration: 0, points: 2,
          questions: [{ id: "q1", type: "test", text: "¿P1?", options: [{ id: "A", text: "Sí" }, { id: "B", text: "No" }], correctOptionId: "A" }] },
        { id: "p2", title: "P2", audioUrl: null, duration: 0, points: 1,
          questions: [{ id: "q2", type: "test", text: "¿P2?", options: [{ id: "A", text: "Sí" }, { id: "B", text: "No" }], correctOptionId: "B" }] },
      ],
    });
    let submitted: { type: string; parts: Record<string, { points: number; byModel: Record<string, unknown> }> } | null = null;
    render(<SessionShell exercise={exercise} mode="student" onSubmit={(r) => { submitted = r as typeof submitted; }} onBack={() => {}} />);

    fireEvent.click(screen.getByText("¿P1?"));
    fireEvent.click(screen.getByRole("button", { name: /Sí/ }));
    fireEvent.click(screen.getByRole("button", { name: /^2/ }));
    fireEvent.click(screen.getByText("¿P2?"));
    fireEvent.click(screen.getByRole("button", { name: /No/ }));
    fireEvent.click(screen.getByText(/Finalizar entrega/));

    expect(submitted!.type).toBe("multi");
    expect(submitted!.parts.p1).toEqual({ points: 2, byModel: { cuestionario: { answers: { q1: "A" } } } });
    expect(submitted!.parts.p2).toEqual({ points: 1, byModel: { cuestionario: { answers: { q2: "B" } } } });
  });
});

// ── 3. Flujo de estado: esquema entregado → reloj → corregir → ✓ sin nota ────
// Rediseño de 2026-07-04 (Jon): la lista del alumno no muestra la nota — un
// RELOJ mientras la entrega espera corrección y un ✓ cuando ya está corregida;
// el número vive solo en la vista de corrección.
describe("Flujo de estado de una entrega de esquema", () => {
  it("reloj (pendiente) en la lista del alumno; tras corregir, ✓ y sigue sin nota", () => {
    const exercise = mk({ id: "sch-1", title: "Esquema demo", duration: 40, model: "esquema", categories: [] });
    const submitted: ExerciseResult = { type: "esquema", blocks: [{ id: "b1", level: 1, start: 0, end: 10, label: "A" }], score: null };

    // Entregado (aún sin corregir): reloj de espera, sin "Pendiente" ni nota.
    const { rerender } = render(<ExerciseItem ex={exercise} role="student" variant="row" result={submitted} onOpen={() => {}} onViewCorrection={() => {}} />);
    expect(screen.getByLabelText("Entregado, pendiente de corrección")).toBeInTheDocument();
    expect(screen.queryByText("Pendiente")).not.toBeInTheDocument();

    // El profesor corrige (CorrectionView, modo profesor) y guarda una puntuación.
    let saved: { studentId?: string; exerciseId: unknown; correction: { totalScore: number | null } } | null = null;
    render(
      <CorrectionView
        exercise={exercise} result={submitted} onBack={() => {}}
        isTeacherMode student={{ id: "s1", displayName: "Alumno de prueba" }}
        onSaveCorrection={(studentId, exerciseId, correction) => { saved = { studentId, exerciseId, correction: correction as { totalScore: number | null } }; }}
      />
    );
    // N4.1: la nota manual es ahora una FUENTE — se elige «Nota directa» y se
    // introduce en 0–10 (NotaInput, admite coma); se ALMACENA en 0–100 (×10),
    // con el sobre calificacion llevando la nota exacta.
    fireEvent.click(screen.getByRole("button", { name: "Nota directa" }));
    fireEvent.change(screen.getByLabelText("Nota final (0–10)"), { target: { value: "8,5" } });
    fireEvent.click(screen.getByText("Guardar corrección"));

    expect(saved).not.toBeNull();
    expect(saved!.correction.totalScore).toBe(85);
    expect((saved!.correction as { calificacion?: { fuente?: string; nota?: number } }).calificacion).toMatchObject({ fuente: "directa", nota: 85 });

    // Mismo merge que saveCorrection en App.tsx (no exportado): la corrección
    // se añade — el reloj pasa a ✓ pero la LISTA sigue sin mostrar la nota
    // (vive en la corrección); la puerta es "Ver corrección ✓".
    const corrected: ExerciseResult = { ...submitted, teacherCorrection: { ...saved!.correction, corrected: true }, score: 85 };
    rerender(<ExerciseItem ex={exercise} role="student" variant="row" result={corrected} onOpen={() => {}} onViewCorrection={() => {}} />);
    expect(screen.getByLabelText("Corregido")).toBeInTheDocument();
    expect(screen.queryByLabelText("Entregado, pendiente de corrección")).not.toBeInTheDocument();
    expect(screen.queryByText(/85%/)).not.toBeInTheDocument();
    expect(screen.getByText("Ver corrección ✓")).toBeInTheDocument();
    expect(screen.queryByText("Pendiente")).not.toBeInTheDocument();
  });
});

// ── 4. "corta": entrada del alumno → auto-corrección con normalización ───────
describe('Pregunta tipo "corta" (F5, T5.6)', () => {
  it("acepta con distinta mayúscula/minúscula, tildes y espacios de sobra", () => {
    const exercise = mk({
      id: "corta-1", title: "Cuestionario con corta", duration: 30, model: "cuestionario", categories: [], answers: {},
      questions: [
        { id: "q1", type: "corta", text: "¿Qué tipo de cadencia es esta?", accepted: ["Semicadencia"], audioStart: 0, audioEnd: 10 },
      ] as never,
    });
    let submitted: { score: number | null } | null = null;
    render(<QuestionnaireView exercise={exercise} onSubmit={(r) => { submitted = r as { score: number | null }; }} onBack={() => {}} />);

    fireEvent.click(screen.getByText("¿Qué tipo de cadencia es esta?"));
    fireEvent.change(screen.getByPlaceholderText("Escribe tu respuesta…"), { target: { value: "  SEMICADÉNCIA  " } });
    fireEvent.click(screen.getByText("Entregar"));

    expect(submitted!.score).toBe(100);
  });

  it("una respuesta que no coincide (ni normalizada) no se autocorrige como válida", () => {
    const exercise = mk({
      id: "corta-2", title: "Cuestionario con corta", duration: 30, model: "cuestionario", categories: [], answers: {},
      questions: [
        { id: "q1", type: "corta", text: "¿Qué tipo de cadencia es esta?", accepted: ["Semicadencia"], audioStart: 0, audioEnd: 10 },
      ] as never,
    });
    let submitted: { score: number | null } | null = null;
    render(<QuestionnaireView exercise={exercise} onSubmit={(r) => { submitted = r as { score: number | null }; }} onBack={() => {}} />);

    fireEvent.click(screen.getByText("¿Qué tipo de cadencia es esta?"));
    fireEvent.change(screen.getByPlaceholderText("Escribe tu respuesta…"), { target: { value: "cadencia rota" } });
    fireEvent.click(screen.getByText("Entregar"));

    expect(submitted!.score).toBe(0);
  });
});
