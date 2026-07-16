// N3.4: retirada de «corta» de la autoría. La decisión (Jon, 2026-07-13)
// revierte parte de la protección de PLAN_MAESTRO_2 §1: no se crean cortas
// nuevas, pero los datos y la corrección de las existentes quedan intactos
// (gradeShort/QuizCorrection sin tocar) — aquí se verifica la mitad de autoría:
// el selector no ofrece «corta» en preguntas nuevas y una corta legada sigue
// siendo editable sin perder su tipo.
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QuestionEditorModal } from "./modals.js";
import type { Question } from "../lib/types.js";

describe("QuestionEditorModal — retirada de «corta» (N3.4)", () => {
  it("pregunta nueva: el selector ofrece solo Tipo test y Desarrollo", () => {
    render(<QuestionEditorModal initial={null} audioDuration={60} onSave={() => {}} onClose={() => {}} />);
    expect(screen.getByRole("button", { name: "Tipo test" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Desarrollo" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Respuesta corta" })).not.toBeInTheDocument();
  });

  it("editar una pregunta test tampoco ofrece «corta»", () => {
    const test: Question = { id: "q1", type: "test", text: "¿Modo?", options: [{ id: "A", text: "Mayor" }, { id: "B", text: "Menor" }], correctOptionId: "A", audioStart: 0, audioEnd: 10 };
    render(<QuestionEditorModal initial={test} audioDuration={60} onSave={() => {}} onClose={() => {}} />);
    expect(screen.queryByRole("button", { name: "Respuesta corta" })).not.toBeInTheDocument();
  });

  it("una corta legada conserva su opción en el selector y sigue siendo editable sin cambiar de tipo", () => {
    const legada: Question = { id: "q2", type: "corta", text: "¿Qué cadencia suena?", accepted: ["Semicadencia"], audioStart: 0, audioEnd: 10, points: 1 };
    const onSave = vi.fn();
    render(<QuestionEditorModal initial={legada} audioDuration={60} onSave={onSave} onClose={() => {}} />);
    expect(screen.getByRole("button", { name: "Respuesta corta" })).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText(/^Semicadencia/), {
      target: { value: "Semicadencia\nCadencia suspensiva" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0].type).toBe("corta");
    expect(onSave.mock.calls[0][0].accepted).toEqual(["Semicadencia", "Cadencia suspensiva"]);
  });

  it("desarrollo: la sección «Instrumento de corrección» está y el guardado lleva el sobre (N3.3)", () => {
    const onSave = vi.fn();
    render(<QuestionEditorModal initial={null} defaultStart={0} audioDuration={60} onSave={onSave} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Desarrollo" }));
    fireEvent.change(screen.getByPlaceholderText("¿Qué función armónica predomina en este fragmento?"), {
      target: { value: "Analiza la modulación" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Crear instrumento" }));
    fireEvent.change(screen.getByLabelText("Texto del ítem"), { target: { value: "Identifica tonalidades" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    fireEvent.click(screen.getByRole("button", { name: "Crear" }));
    const guardada = onSave.mock.calls[0][0] as Question;
    expect(guardada.type).toBe("desarrollo");
    expect(guardada.evaluacion?.instrumento?.items[0].texto).toBe("Identifica tonalidades");
  });
});
