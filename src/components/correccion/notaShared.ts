// ═══ NOTA — utilidades de corrección (no-componentes) ════════════════════════
// Separadas de NotaInput.tsx para que ese fichero exporte SOLO el componente
// (react-refresh). Parseo/saneado de la nota 0–10 (texto ↔ número) y el hook del
// scrollbar autoocultable compartido por las vistas de corrección.
import { useRef } from "react";
import type { UIEvent } from "react";

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
