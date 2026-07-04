// ═══ FORMATEO DE TIEMPO ══════════════════════════════════════════════════════
// Dos formatos de reloj para segundos, con nombres que dicen su precisión (M3.1):
//   fmtClock   → M:SS   (contadores, badges, rangos de fragmento)
//   fmtPrecise → M:SS.d  (un decimal — contador en vivo del scrubber, donde
//                         la décima se percibe al arrastrar)
// Antes: fmt (en lib/ids.ts, mezclado con generación de IDs) y un fmtP local
// dentro de FragmentRangeSelector (session.tsx). Centralizados aquí.

// Formatea segundos como M:SS.
export const fmtClock = (s: number): string => {
  const m   = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
};

// Formatea segundos como M:SS.d (un decimal). El padStart(4) cubre "SS.d"
// (p. ej. 3s → "0:03.0", 12.4s → "0:12.4").
export const fmtPrecise = (s: number): string => {
  const m  = Math.floor(s / 60);
  const ss = (s % 60).toFixed(1).padStart(4, "0");
  return `${m}:${ss}`;
};
