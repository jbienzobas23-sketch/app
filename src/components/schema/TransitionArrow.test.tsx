// Un bloque cuya etiqueta es «puente»/«transición»/«enlace»/«retransición» se
// dibuja como una FLECHA de izquierda a derecha en vez de un bloque relleno.
// La palabra va encima SOLO si cabe ENTERA (medición real, nada de «pue…»).
// jsdom no tiene layout (todos los anchos son 0), así que aquí se simulan
// `clientWidth` (contenedor) y `offsetWidth` (medidor de texto) por prototipo.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Exercise } from "../../lib/types.js";
import { TransitionArrow } from "./TransitionArrow.js";
import { SchemaCorrection } from "../correccion/SchemaCorrection.js";

// Anchos simulados: el contenedor mide 200px; `textW` es el ancho natural del
// texto del medidor — cada test lo ajusta para que la palabra quepa o no.
// Se SOMBREAN los getters en HTMLElement.prototype (los reales viven más
// arriba en la cadena — clientWidth en Element.prototype) y en afterEach se
// borra la sombra; vitest aísla cada fichero, así que no contamina a otros.
let textW = 50;
beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get() { return 200; } });
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", { configurable: true, get() { return textW; } });
  textW = 50;
});
afterEach(() => {
  delete (HTMLElement.prototype as unknown as Record<string, unknown>).clientWidth;
  delete (HTMLElement.prototype as unknown as Record<string, unknown>).offsetWidth;
});

// El span VISIBLE de la etiqueta (el medidor lleva aria-hidden).
const visibleLabel = (container: HTMLElement) =>
  [...container.querySelectorAll("span:not([aria-hidden])")];

describe("TransitionArrow", () => {
  it("dibuja una flecha (svg) siempre", () => {
    const { container } = render(<TransitionArrow color="#c00" label="puente" />);
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("muestra la palabra encima cuando cabe entera", () => {
    textW = 50; // 50 ≤ 200 − 2·8 → cabe
    const { container } = render(<TransitionArrow color="#c00" label="puente" />);
    expect(visibleLabel(container).map((s) => s.textContent)).toContain("puente");
  });

  it("si la palabra NO cabe entera, no se ve nada de texto — solo la flecha", () => {
    textW = 500; // 500 > 200 − 16 → no cabe
    const { container } = render(<TransitionArrow color="#c00" label="puente" />);
    expect(visibleLabel(container)).toHaveLength(0);
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("sin etiqueta no pinta texto (ni medidor)", () => {
    const { container } = render(<TransitionArrow color="#c00" />);
    expect(container.querySelector("span")).toBeNull();
    expect(container.querySelector("svg")).toBeInTheDocument();
  });
});

describe("SchemaCorrection — bloque de transición como flecha", () => {
  const exercise = {
    id: "ex-t", title: "Esquema", duration: 60, model: "esquema",
    schemaKey: [{ id: "k1", level: 1, start: 0, end: 30, label: "A" }],
  } as unknown as Exercise;
  const result = {
    type: "esquema",
    blocks: [
      { id: "b1", level: 1, start: 0, end: 30, label: "A" },
      { id: "b2", level: 2, start: 6, end: 16, label: "retransición" },
    ],
    placementScore: 100, score: 100, status: "pendiente" as const,
  };

  it("un bloque «retransición» se pinta como flecha (data-transition), un «A» no", () => {
    const { container } = render(
      <SchemaCorrection exercise={exercise} result={result} onBack={() => {}} isTeacherMode
        student={{ id: "s1", displayName: "Ana" }} onSaveCorrection={vi.fn()} />,
    );
    const arrows = [...container.querySelectorAll<HTMLElement>('[data-transition="true"]')];
    expect(arrows.length).toBeGreaterThan(0);
    expect(arrows.some((a) => a.querySelector("svg"))).toBe(true);
    // Con sitio (anchos simulados), la palabra completa es visible encima.
    expect(arrows.some((a) => visibleLabel(a).some((s) => s.textContent === "retransición"))).toBe(true);
    // El bloque normal «A» sigue siendo bloque, no flecha.
    const aBlock = container.querySelector('[title="A"]');
    expect(aBlock).not.toBeNull();
    expect(aBlock!.getAttribute("data-transition")).toBeNull();
  });
});
