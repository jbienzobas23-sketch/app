// M2.5: ModelPlate — placas combinadas (dos o tres modelos). Verifica lo que
// el plan pide comprobar (combinaciones, mínimo 36px, aria-label leído por
// lector de pantalla) en lo que un test de render puede cubrir sin un
// dispositivo real: la geometría exacta se comprobó visualmente (harness).
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { ModelPlate, ExercisePlate } from "./TypePlate.js";
import type { Exercise } from "../lib/types.js";

describe("ModelPlate", () => {
  it("combo de dos modelos: aria-label compuesto con 'y'", () => {
    const { getByRole } = render(<ModelPlate models={["interactivo", "cuestionario"]} />);
    expect(getByRole("img", { name: "Interactivo y Cuestionario" })).toBeInTheDocument();
  });
  it("combo de tres modelos: aria-label con comas y 'y' final", () => {
    const { getByRole } = render(<ModelPlate models={["interactivo", "cuestionario", "esquema"]} />);
    expect(getByRole("img", { name: "Interactivo, Cuestionario y Esquema" })).toBeInTheDocument();
  });
  it("nunca baja de 36px, aunque se pida un tamaño menor (T2.5, filas compactas)", () => {
    const { container } = render(<ModelPlate models={["interactivo", "cuestionario"]} size={30} />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("width")).toBe("36");
    expect(svg.getAttribute("height")).toBe("36");
  });
  it("un tamaño mayor a 36 sí se respeta", () => {
    const { container } = render(<ModelPlate models={["interactivo", "cuestionario"]} size={44} />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("width")).toBe("44");
  });
  it("dos modelos: dos sectores (triángulos) sin costura de sector central", () => {
    const { container } = render(<ModelPlate models={["interactivo", "esquema"]} />);
    const paths = container.querySelectorAll("path[fill]");
    expect(paths.length).toBe(2);
  });
  it("tres modelos: tres sectores, uno por modelo", () => {
    const { container } = render(<ModelPlate models={["interactivo", "cuestionario", "esquema"]} />);
    const paths = container.querySelectorAll("path[fill]");
    expect(paths.length).toBe(3);
  });
});

describe("ExercisePlate — delega en ModelPlate para combos (M2.5)", () => {
  it("un solo modelo: sigue usando TypePlate (svg simple, sin role=img de combo)", () => {
    const ex = { id: 1, models: ["interactivo"] } as unknown as Exercise;
    const { queryByRole } = render(<ExercisePlate ex={ex} />);
    expect(queryByRole("img")).not.toBeInTheDocument();
  });
  it("dos modelos: delega en ModelPlate (role=img con el combo)", () => {
    const ex = { id: 2, models: ["interactivo", "cuestionario"] } as unknown as Exercise;
    const { getByRole } = render(<ExercisePlate ex={ex} />);
    expect(getByRole("img", { name: "Interactivo y Cuestionario" })).toBeInTheDocument();
  });
});
