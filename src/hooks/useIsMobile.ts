// ═══ HOOK RESPONSIVE ═════════════════════════════════════════════════════════
// Extraído de App.jsx (Fase 2). Migrado a TypeScript (Fase 3).
import { useState, useEffect } from "react";

// Hook responsive: devuelve true cuando el viewport es estrecho (móvil).
// La app usa estilos en línea (no CSS/media queries), así que las vistas
// ramifican su layout leyendo este valor. Usa matchMedia y se resuscribe a
// los cambios de tamaño/orientación.
export function useIsMobile(maxWidth = 640): boolean {
  const query = `(max-width: ${maxWidth}px)`;
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia(query).matches;
  });
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia(query);
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    setIsMobile(mql.matches);
    // addEventListener es el API moderno; addListener para Safari antiguo
    if (mql.addEventListener) mql.addEventListener("change", onChange);
    else mql.addListener(onChange);
    return () => {
      if (mql.removeEventListener) mql.removeEventListener("change", onChange);
      else mql.removeListener(onChange);
    };
  }, [query]);
  return isMobile;
}
