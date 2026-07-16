// N3.1: InstrumentoEditor — las tres presentaciones y la vista previa en vivo.
// La aritmética de notaInstrumento ya está cubierta en calificacion.test.ts;
// aquí se verifica que la UI la refleja (celdas → nota) y que cada tipo
// muestra/oculta lo suyo (niveles fijos de lista, descriptores de rúbrica).
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useState } from "react";
import { InstrumentoEditor, InstrumentoEditorModal, InstrumentoBibliotecaModal, InstrumentoAttach } from "./InstrumentoEditor.js";
import { nuevoInstrumento, NIVELES_ESCALA_DEFECTO, type Instrumento } from "../lib/calificacion.js";

// Envoltorio con estado, como lo usa el modal: value/onChange de verdad.
function Controlado({ inicial, onChange }: { inicial: Instrumento; onChange?: (i: Instrumento) => void }) {
  const [value, setValue] = useState(inicial);
  return <InstrumentoEditor value={value} onChange={(i) => { setValue(i); onChange?.(i); }} />;
}

const escalaDemo: Instrumento = {
  tipo: "escala",
  niveles: [
    { id: "n0", etiqueta: "Insuficiente", valor: 0 },
    { id: "n2", etiqueta: "Notable", valor: 1 },
  ],
  items: [
    { id: "a", texto: "Afinación", peso: 1 },
    { id: "b", texto: "Ritmo", peso: 1 },
  ],
};

describe("InstrumentoEditor", () => {
  it("lista de control: niveles fijos como texto (sin inputs ni «Añadir nivel»)", () => {
    render(<Controlado inicial={nuevoInstrumento("lista")} />);
    expect(screen.getByText("Sí = 1 · No = 0")).toBeInTheDocument();
    expect(screen.queryByText("+ Añadir nivel")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Etiqueta del nivel")).not.toBeInTheDocument();
  });

  it("escala: niveles editables con etiqueta y valor", () => {
    render(<Controlado inicial={nuevoInstrumento("escala")} />);
    expect(screen.getAllByLabelText("Etiqueta del nivel")).toHaveLength(3);
    expect(screen.getByText("+ Añadir nivel")).toBeInTheDocument();
  });

  it("cambiar el tipo pasa por cambiaTipoInstrumento (lista → escala repone la escala por defecto)", () => {
    const onChange = vi.fn();
    render(<Controlado inicial={nuevoInstrumento("lista")} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Escala estimativa" }));
    expect(onChange.mock.lastCall![0].tipo).toBe("escala");
    expect(onChange.mock.lastCall![0].niveles).toEqual(NIVELES_ESCALA_DEFECTO);
  });

  it("rúbrica: un descriptor editable por (ítem, nivel), reflejado en la celda de la vista previa", () => {
    const rubrica = { ...escalaDemo, tipo: "rubrica" as const, items: [{ id: "a", texto: "Afinación", peso: 1 }] };
    render(<Controlado inicial={rubrica} />);
    const descriptor = screen.getByLabelText("Descriptor de «Afinación» para Notable");
    fireEvent.change(descriptor, { target: { value: "Impecable en todo el pasaje" } });
    // La celda clicable de la vista previa muestra el descriptor, no la etiqueta.
    expect(screen.getByRole("button", { name: "Afinación: Notable" })).toHaveTextContent("Impecable en todo el pasaje");
  });

  it("vista previa en vivo: elegir celdas mueve la nota; re-clicar des-selecciona y el ítem sale de la media", () => {
    render(<Controlado inicial={escalaDemo} />);
    expect(screen.getByText("—")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Afinación: Notable" }));
    expect(screen.getByText("10")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ritmo: Insuficiente" }));
    expect(screen.getByText("5")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ritmo: Insuficiente" }));
    expect(screen.getByText("10")).toBeInTheDocument();
  });

  it("quitar está bloqueado en los mínimos: 1 ítem y 2 niveles", () => {
    const minimo = { ...escalaDemo, items: [{ id: "a", texto: "Único", peso: 1 }] };
    render(<Controlado inicial={minimo} />);
    expect(screen.getByLabelText("Quitar ítem")).toBeDisabled();
    expect(screen.getByLabelText("Quitar nivel Insuficiente")).toBeDisabled();
  });
});

describe("InstrumentoEditorModal", () => {
  it("no deja guardar con ítems sin texto; al completarlos, guarda el borrador editado", () => {
    const onSave = vi.fn();
    render(<InstrumentoEditorModal initial={nuevoInstrumento("lista")} onSave={onSave} onClose={() => {}} />);
    const guardar = screen.getByRole("button", { name: "Guardar" });
    fireEvent.click(guardar);
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Texto del ítem"), { target: { value: "Marca el pulso" } });
    fireEvent.click(guardar);
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0].items[0].texto).toBe("Marca el pulso");
  });

  it("«Guardar como plantilla» (N3.2): guarda una copia, confirma en el botón y se rearma al editar", () => {
    const onGuardarPlantilla = vi.fn();
    render(<InstrumentoEditorModal initial={escalaDemo} onSave={() => {}} onGuardarPlantilla={onGuardarPlantilla} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Guardar como plantilla" }));
    expect(onGuardarPlantilla).toHaveBeenCalledTimes(1);
    // Copia profunda: no es el mismo objeto que el borrador inicial.
    expect(onGuardarPlantilla.mock.calls[0][0]).toEqual(escalaDemo);
    expect(onGuardarPlantilla.mock.calls[0][0]).not.toBe(escalaDemo);
    expect(screen.getByRole("button", { name: "Plantilla guardada ✓" })).toBeInTheDocument();
    // Editar el borrador rearma el botón (la plantilla guardada ya no coincide).
    fireEvent.change(screen.getByPlaceholderText("Ej: Análisis de una modulación"), { target: { value: "Otra cosa" } });
    expect(screen.getByRole("button", { name: "Guardar como plantilla" })).toBeInTheDocument();
  });

  it("sin onGuardarPlantilla (sin biblioteca a mano) el botón no existe", () => {
    render(<InstrumentoEditorModal initial={escalaDemo} onSave={() => {}} onClose={() => {}} />);
    expect(screen.queryByRole("button", { name: "Guardar como plantilla" })).not.toBeInTheDocument();
  });
});

describe("InstrumentoAttach (N3.3) — el punto de adjuntado compartido", () => {
  it("sin instrumento: «Crear instrumento» y, solo con biblioteca a mano, «Desde plantilla»", () => {
    const { rerender } = render(<InstrumentoAttach onChange={() => {}} />);
    expect(screen.getByRole("button", { name: "Crear instrumento" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Desde plantilla" })).not.toBeInTheDocument();
    rerender(<InstrumentoAttach onChange={() => {}} plantillas={[]} onChangePlantillas={() => {}} />);
    expect(screen.getByRole("button", { name: "Desde plantilla" })).toBeInTheDocument();
  });

  it("crear: abre el editor y al guardar entrega el instrumento completado", () => {
    const onChange = vi.fn();
    render(<InstrumentoAttach onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Crear instrumento" }));
    fireEvent.change(screen.getByLabelText("Texto del ítem"), { target: { value: "Afina la sensible" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].items[0].texto).toBe("Afina la sensible");
    // El modal se cierra al guardar.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("con instrumento: resumen + Editar/Quitar; quitar entrega undefined", () => {
    const onChange = vi.fn();
    render(<InstrumentoAttach instrumento={{ ...escalaDemo, titulo: "Rúbrica de fraseo" }} onChange={onChange} />);
    expect(screen.getByText("Rúbrica de fraseo")).toBeInTheDocument();
    expect(screen.getByText("Escala estimativa · 2 ítems")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Quitar" }));
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it("editar trabaja sobre una copia: cancelar no muta el instrumento adjunto", () => {
    const adjunto = { ...escalaDemo, titulo: "Original" };
    render(<InstrumentoAttach instrumento={adjunto} onChange={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    fireEvent.change(screen.getByPlaceholderText("Ej: Análisis de una modulación"), { target: { value: "Cambiado" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(adjunto.titulo).toBe("Original");
  });

  it("desde plantilla: adjuntar entrega la copia y cierra la biblioteca", () => {
    const onChange = vi.fn();
    render(<InstrumentoAttach onChange={onChange} plantillas={[{ ...escalaDemo, titulo: "Modulaciones" }]} onChangePlantillas={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Desde plantilla" }));
    fireEvent.click(screen.getByRole("button", { name: "Adjuntar" }));
    expect(onChange.mock.calls[0][0].titulo).toBe("Modulaciones");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("InstrumentoBibliotecaModal (N3.2)", () => {
  const plantillas: Instrumento[] = [
    { ...escalaDemo, titulo: "Modulaciones" },
    nuevoInstrumento("lista"),
  ];

  it("lista las plantillas con título (o el tipo como respaldo) y recuento de ítems", () => {
    render(<InstrumentoBibliotecaModal plantillas={plantillas} onAdjuntar={() => {}} onChangePlantillas={() => {}} onClose={() => {}} />);
    expect(screen.getByText("Modulaciones")).toBeInTheDocument();
    expect(screen.getByText("Escala estimativa · 2 ítems")).toBeInTheDocument();
    // La lista sin título usa la etiqueta del tipo como nombre.
    expect(screen.getByText("Lista de control · 1 ítem")).toBeInTheDocument();
  });

  it("adjuntar entrega una copia profunda: mutarla no toca la plantilla", () => {
    const onAdjuntar = vi.fn();
    render(<InstrumentoBibliotecaModal plantillas={plantillas} onAdjuntar={onAdjuntar} onChangePlantillas={() => {}} onClose={() => {}} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Adjuntar" })[0]);
    const copia = onAdjuntar.mock.calls[0][0] as Instrumento;
    expect(copia).toEqual(plantillas[0]);
    copia.items[0].texto = "mutado";
    expect(plantillas[0].items[0].texto).toBe("Afinación");
  });

  it("duplicar inserta la copia «(copia)» justo detrás; eliminar la quita", () => {
    const onChangePlantillas = vi.fn();
    render(<InstrumentoBibliotecaModal plantillas={plantillas} onAdjuntar={() => {}} onChangePlantillas={onChangePlantillas} onClose={() => {}} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Duplicar" })[0]);
    let next = onChangePlantillas.mock.calls[0][0] as Instrumento[];
    expect(next).toHaveLength(3);
    expect(next[1].titulo).toBe("Modulaciones (copia)");
    fireEvent.click(screen.getByLabelText("Eliminar plantilla Modulaciones"));
    next = onChangePlantillas.mock.lastCall![0] as Instrumento[];
    expect(next).toHaveLength(1);
    expect(next[0].tipo).toBe("lista");
  });
});
