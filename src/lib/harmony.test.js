import { describe, it, expect } from "vitest";
import { parseHarmonyLabel, harmonyBlockColors } from "./harmony.js";

describe("parseHarmonyLabel", () => {
  it("acepta 'Mayor'/'menor' con cualquier caja", () => {
    expect(parseHarmonyLabel("Do Mayor")).toEqual({ tonica: "do", modo: "mayor" });
    expect(parseHarmonyLabel("do mayor")).toEqual({ tonica: "do", modo: "mayor" });
    expect(parseHarmonyLabel("Sib menor")).toEqual({ tonica: "sib", modo: "menor" });
    expect(parseHarmonyLabel("reb menor")).toEqual({ tonica: "reb", modo: "menor" });
  });
  it("admite espacio antes del bemol y la abreviatura", () => {
    expect(parseHarmonyLabel("Sol b Mayor")).toEqual({ tonica: "solb", modo: "mayor" });
    expect(parseHarmonyLabel("Fa# m")).toEqual({ tonica: "fa#", modo: "menor" });
  });
  it("admite abreviaturas M / m como último carácter significativo", () => {
    expect(parseHarmonyLabel("Do M")).toEqual({ tonica: "do", modo: "mayor" });
    expect(parseHarmonyLabel("La m")).toEqual({ tonica: "la", modo: "menor" });
  });
  it("normaliza símbolos ♭ / ♯", () => {
    expect(parseHarmonyLabel("Si♭ Mayor")).toEqual({ tonica: "sib", modo: "mayor" });
    expect(parseHarmonyLabel("Fa♯ menor")).toEqual({ tonica: "fa#", modo: "menor" });
  });
  it("reduce enarmónicos a la forma canónica del mapa", () => {
    expect(parseHarmonyLabel("re# menor")).toEqual({ tonica: "mib", modo: "menor" });
    expect(parseHarmonyLabel("mi# Mayor")).toEqual({ tonica: "fa", modo: "mayor" });
    expect(parseHarmonyLabel("la# menor")).toEqual({ tonica: "sib", modo: "menor" });
    expect(parseHarmonyLabel("si# Mayor")).toEqual({ tonica: "do", modo: "mayor" });
  });
  it("devuelve null para entradas inválidas o sin modo", () => {
    expect(parseHarmonyLabel("")).toBeNull();
    expect(parseHarmonyLabel(null)).toBeNull();
    expect(parseHarmonyLabel("Do")).toBeNull();
    expect(parseHarmonyLabel("xyz")).toBeNull();
  });
});

describe("harmonyBlockColors", () => {
  it("Fa# menor y Solb menor devuelven HOY el MISMO color (clase de altura)", () => {
    // Fase 0 fija este comportamiento; la Fase 7 puede cambiarlo conscientemente.
    expect(harmonyBlockColors("Fa# menor")).toEqual(harmonyBlockColors("Solb menor"));
    expect(harmonyBlockColors("Fa# menor").bg).toBe("#E6A05A");
  });
  it("calcula el color de texto por luminancia", () => {
    expect(harmonyBlockColors("Do Mayor").textColor).toBe("#1C1A14"); // fondo claro
    expect(harmonyBlockColors("Mib menor").textColor).toBe("#FFFFFF"); // fondo oscuro
  });
  it("usa el color de respaldo cuando el label no es tonal", () => {
    expect(harmonyBlockColors(null, "#123456").bg).toBe("#123456");
    expect(harmonyBlockColors("sin tonalidad", "rojo")).toEqual({ bg: "rojo", textColor: "#FFFFFF" });
  });
});
