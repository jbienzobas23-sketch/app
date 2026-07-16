// ═══ NOTA — utilidades de corrección (no-componentes) ════════════════════════
// Separadas de NotaInput.tsx para que ese fichero exporte SOLO el componente
// (react-refresh). Parseo/saneado de la nota 0–10 (texto ↔ número), la fuente
// de la nota (N4.1) y el hook del scrollbar autoocultable compartido por las
// vistas de corrección.
import { useRef } from "react";
import type { UIEvent } from "react";
import { notaInstrumento, type Instrumento } from "../../lib/calificacion.js";
import { nota10 } from "../../lib/scoring.js";

// Valor numérico 0–10 de lo escrito. null si vacío o incompleto (p. ej. "1,").
export const parseNota10 = (v: string): number | null => {
  if (v === "") return null;
  const n = Number(v.replace(",", "."));
  return Number.isNaN(n) ? null : n;
};

// Sanea la entrada: dígitos + una sola coma/punto, máx 2 decimales, tope 10.
export const sanitizeNota10 = (raw: string): string => {
  const m = raw.match(/^(\d{0,2})([.,]?)(\d{0,2})/);
  let next = m ? m[1] + m[2] + m[3] : "";
  const n = Number(next.replace(",", "."));
  if (!Number.isNaN(n) && n > 10) next = "10";
  return next;
};

// ─── N4.1: fuente de la nota ─────────────────────────────────────────────────
// Estado local del panel de fuente en una vista de corrección: qué fuente está
// elegida, el texto de la nota directa (0–10, como NotaInput) y las respuestas
// del instrumento (una elección de nivel por ítem).
export interface FuenteNotaState {
  fuente: "auto" | "instrumento" | "directa";
  directa: string;
  respuestas: Record<string, string>;
}

// Nota final 0–100 que produce el estado actual del panel: la preliminar tal
// cual (auto), la del instrumento relleno, o la directa parseada. null cuando
// la fuente elegida aún no produce nota (directa vacía, instrumento sin ningún
// ítem respondido, auto sin preliminar) — el llamador decide si eso bloquea el
// guardado o simplemente no sustituye la nota.
export function notaDeFuente(
  state: FuenteNotaState,
  preliminar: number | null | undefined,
  instrumento: Instrumento | undefined,
): number | null {
  if (state.fuente === "directa") {
    const n = parseNota10(state.directa);
    return n == null ? null : Math.round(n * 10);
  }
  if (state.fuente === "instrumento") {
    return instrumento ? notaInstrumento(instrumento, state.respuestas) : null;
  }
  return preliminar ?? null;
}

// Estado inicial del panel al abrir una corrección ya guardada: repone la
// fuente, el texto de la directa y las respuestas del instrumento desde el
// sobre `calificacion`; sin sobre (corrección legada), una nota guardada se
// trata como directa — que es lo que era: el número que tecleó el profesor.
export function fuenteInicial(
  calificacion: { fuente?: string; nota?: number | null; instrumento?: { respuestas?: Record<string, string> } } | null | undefined,
  legacyNota100: number | null,
): FuenteNotaState {
  const fuente = (calificacion?.fuente === "instrumento" || calificacion?.fuente === "directa")
    ? calificacion.fuente
    : legacyNota100 != null ? "directa" : "auto";
  return {
    fuente,
    directa: fuente === "directa" ? (nota10(calificacion?.nota ?? legacyNota100) ?? "") : "",
    respuestas: calificacion?.instrumento?.respuestas ?? {},
  };
}

// Scrollbar que solo aparece al moverla o al pasar el ratón (CSS en
// theme/fonts.ts, .fa-autohide-scroll): este hook devuelve el onScroll que
// marca el contenedor "en uso" y lo desmarca 700ms después del último scroll.
// WeakMap por elemento: índice y columna de contenido scrollean por separado.
export function useAutoHideScroll() {
  const timersRef = useRef<WeakMap<Element, number>>(new WeakMap());
  return (e: UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    el.classList.add("fa-scrolling");
    const prev = timersRef.current.get(el);
    if (prev) window.clearTimeout(prev);
    timersRef.current.set(el, window.setTimeout(() => el.classList.remove("fa-scrolling"), 700));
  };
}
