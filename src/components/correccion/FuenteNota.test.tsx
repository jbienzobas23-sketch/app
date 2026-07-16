// N4.1: fuente de la nota — helpers puros (notaDeFuente/fuenteInicial), panel
// FuenteNota y el circuito completo en SchemaCorrection (elegir instrumento,
// rellenarlo y guardar un sobre con la nota 0-100 EXACTA — la heurística
// legada «totalScore ≤ 10 ⇒ escala 0-10» habría convertido un 5 % en 50).
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useState } from "react";
import type { Exercise } from "../../lib/types.js";
import type { Instrumento } from "../../lib/calificacion.js";
import { notaDeFuente, fuenteInicial, type FuenteNotaState } from "./notaShared.js";
import { FuenteNotaPanel } from "./FuenteNota.js";
import { SchemaCorrection } from "./SchemaCorrection.js";
import { QuizCorrection } from "./QuizCorrection.js";

const instrumento: Instrumento = {
  tipo: "escala",
  niveles: [
    { id: "n0", etiqueta: "Insuficiente", valor: 0 },
    { id: "n1", etiqueta: "Adecuado", valor: 0.5 },
    { id: "n2", etiqueta: "Notable", valor: 1 },
  ],
  items: [
    { id: "a", texto: "Identifica secciones", peso: 1 },
    { id: "b", texto: "Justifica cadencias", peso: 3 },
  ],
};

const estado = (patch: Partial<FuenteNotaState>): FuenteNotaState =>
  ({ fuente: "auto", directa: "", respuestas: {}, ...patch });

describe("notaDeFuente", () => {
  it("auto → la preliminar tal cual (o null si no hay)", () => {
    expect(notaDeFuente(estado({}), 62, instrumento)).toBe(62);
    expect(notaDeFuente(estado({}), null, instrumento)).toBeNull();
  });
  it("directa → parsea 0-10 con coma a 0-100; vacía → null", () => {
    expect(notaDeFuente(estado({ fuente: "directa", directa: "7,5" }), 62, instrumento)).toBe(75);
    expect(notaDeFuente(estado({ fuente: "directa", directa: "" }), 62, instrumento)).toBeNull();
  });
  it("instrumento → notaInstrumento con las respuestas; sin instrumento → null", () => {
    // (100·1 + 50·3) / 4 = 62,5 → 63
    expect(notaDeFuente(estado({ fuente: "instrumento", respuestas: { a: "n2", b: "n1" } }), null, instrumento)).toBe(63);
    expect(notaDeFuente(estado({ fuente: "instrumento", respuestas: { a: "n2" } }), null, undefined)).toBeNull();
  });
  it("una nota baja real se conserva exacta (5 = 0,5/10, no 50)", () => {
    const casiTodoMal = estado({ fuente: "instrumento", respuestas: { a: "n0", b: "n0" } });
    expect(notaDeFuente(casiTodoMal, null, instrumento)).toBe(0);
    expect(notaDeFuente(estado({ fuente: "directa", directa: "0,5" }), null, instrumento)).toBe(5);
  });
});

describe("fuenteInicial", () => {
  it("sin sobre y sin nota legada → automática", () => {
    expect(fuenteInicial(undefined, null)).toEqual({ fuente: "auto", directa: "", respuestas: {} });
  });
  it("una nota legada tecleada se repone como directa (que es lo que era)", () => {
    expect(fuenteInicial(undefined, 75)).toEqual({ fuente: "directa", directa: "7,5", respuestas: {} });
  });
  it("un sobre de instrumento repone la fuente y sus respuestas", () => {
    const st = fuenteInicial({ fuente: "instrumento", nota: 63, instrumento: { respuestas: { a: "n2" } } }, 63);
    expect(st.fuente).toBe("instrumento");
    expect(st.respuestas).toEqual({ a: "n2" });
  });
});

function PanelControlado({ preliminar, conAuto = true }: { preliminar: number | null; conAuto?: boolean }) {
  const [state, setState] = useState<FuenteNotaState>(estado({}));
  return <FuenteNotaPanel state={state} onChange={setState} preliminar={preliminar} instrumento={instrumento} conAuto={conAuto} />;
}

describe("FuenteNotaPanel", () => {
  it("la preliminar queda visible como referencia al elegir otra fuente (regla de oro 3)", () => {
    render(<PanelControlado preliminar={62} />);
    fireEvent.click(screen.getByRole("button", { name: "Nota directa" }));
    expect(screen.getByText(/Automática:/)).toBeInTheDocument();
    expect(screen.getByText("6,2")).toBeInTheDocument();
  });
  it("instrumento: rellenar celdas mueve la nota en vivo", () => {
    render(<PanelControlado preliminar={null} conAuto={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Instrumento" }));
    fireEvent.click(screen.getByRole("button", { name: "Identifica secciones: Notable" }));
    fireEvent.click(screen.getByRole("button", { name: "Justifica cadencias: Adecuado" }));
    expect(screen.getByText("6,3")).toBeInTheDocument();
  });
  it("sin opción automática cuando conAuto=false (pregunta de desarrollo)", () => {
    render(<PanelControlado preliminar={null} conAuto={false} />);
    expect(screen.queryByRole("button", { name: "Automática" })).not.toBeInTheDocument();
  });
});

describe("QuizCorrection (profesor) — pool final y cierre (N4.2)", () => {
  it("Guardar se bloquea hasta calificar el desarrollo; al cerrar envía el pool por points y porPregunta", () => {
    const exercise = {
      id: "q-ex", title: "Cuestionario demo", duration: 30, model: "cuestionario", categories: [], audioUrl: null, showHint: false,
      questions: [
        { id: "t1", type: "test", text: "¿Modo?", options: [{ id: "A", text: "Mayor" }, { id: "B", text: "Menor" }], correctOptionId: "A", points: 1, audioStart: 0, audioEnd: 10 },
        { id: "d1", type: "desarrollo", text: "Analiza la modulación", points: 2, audioStart: 10, audioEnd: 20 },
      ],
    } as unknown as Exercise;
    const result = { type: "cuestionario", answers: { t1: "A", d1: "Va de La menor a Do mayor" }, score: 100, status: "pendiente" as const };
    const onSave = vi.fn();
    render(<QuizCorrection exercise={exercise} result={result} onBack={() => {}} isTeacherMode
      student={{ id: "s1", displayName: "Marco" }} onSaveCorrection={onSave} />);

    // La final aparece sin nota de desarrollo: preliminar 100 en el pool y
    // 1 pendiente → Guardar bloqueado.
    expect(screen.getByText("✎ 1 de desarrollo sin nota")).toBeInTheDocument();
    const guardar = screen.getByRole("button", { name: "Guardar corrección" });
    fireEvent.click(guardar);
    expect(onSave).not.toHaveBeenCalled();

    // Nota directa 6 al desarrollo → pool = (100·1 + 60·2) / 3 = 73.
    fireEvent.change(screen.getByLabelText("Nota final (0–10)"), { target: { value: "6" } });
    fireEvent.click(guardar);
    expect(onSave).toHaveBeenCalledTimes(1);
    const correction = onSave.mock.calls[0][2];
    expect(correction.totalScore).toBe(73);
    expect(correction.calificacion).toMatchObject({ fuente: "auto", nota: 73 });
    expect(correction.calificacion.porPregunta.d1).toEqual({ fuente: "directa", nota: 60 });
  });
});

describe("SchemaCorrection (profesor) — guardar con fuente instrumento", () => {
  it("envía el sobre calificacion con la nota exacta y conserva la preliminar de referencia", () => {
    const exercise = {
      id: "ex-1", title: "Esquema demo", duration: 60, model: "esquema",
      schemaKey: [{ id: "k1", level: 1, start: 0, end: 30, label: "A" }],
      evaluacion: { etiquetaCuenta: false, instrumento },
    } as unknown as Exercise;
    const result = {
      type: "esquema",
      blocks: [{ id: "b1", level: 1, start: 0, end: 30, label: "A" }],
      placementScore: 100, score: 100, status: "pendiente" as const,
    };
    const onSave = vi.fn();
    render(<SchemaCorrection exercise={exercise} result={result} onBack={() => {}} isTeacherMode
      student={{ id: "s1", displayName: "Lucía" }} onSaveCorrection={onSave} />);
    fireEvent.click(screen.getByRole("button", { name: "Instrumento" }));
    fireEvent.click(screen.getByRole("button", { name: "Identifica secciones: Insuficiente" }));
    fireEvent.click(screen.getByRole("button", { name: "Justifica cadencias: Insuficiente" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar corrección" }));
    const correction = onSave.mock.calls[0][2];
    // Nota exacta 0 (todo Insuficiente) — no pasa por la heurística ≤10.
    expect(correction.calificacion).toMatchObject({ fuente: "instrumento", nota: 0 });
    expect(correction.calificacion.instrumento.respuestas).toEqual({ a: "n0", b: "n0" });
    expect(correction.totalScore).toBe(0);
  });
});
