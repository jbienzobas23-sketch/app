// ═══ TRANSITIONARROW ══════════════════════════════════════════════════════════
// Un bloque de esquema cuya etiqueta es «puente» / «transición» / «enlace» /
// «retransición» (isTransitionLabel) no es una sección sino un pasaje
// conectivo: se dibuja como una FLECHA horizontal de izquierda a derecha en vez
// de un bloque relleno. Componente presentacional puro y COMPARTIDO por las
// tres vistas que pintan esquema (SegBlocks en el editor, SchemaStrip en la
// corrección, la miniatura de clave de PasoClaves) para que la flecha sea
// idéntica en todas.
//
// Rellena su contenedor (width/height 100%) → durante el arrastre en vivo el
// nodo se redimensiona por ref (paintBlockPos) y la flecha lo acompaña sin
// recalcular nada. `pointer-events:none` para que el clic/arrastre lo capture
// el bloque contenedor.
//
// La palabra va ENCIMA de la flecha y SOLO si cabe ENTERA (Jon, 2026-07-16:
// nada de «pue…» recortado — si no cabe completa, solo la flecha). El ajuste
// se MIDE de verdad: un medidor oculto da el ancho natural del texto y se
// compara con el ancho disponible; el ResizeObserver re-evalúa en vivo cuando
// el bloque cambia de tamaño por ref durante un arrastre, sin pasar por React.
import { useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { FONT_SANS } from "../../theme/tokens.js";
import { markOnLight } from "../../lib/color.js";

interface TransitionArrowProps {
  color: string;                 // color identitario del bloque (su relleno normal)
  label?: string;                // etiqueta; se muestra encima solo si cabe entera
  thickness?: number;            // grosor del trazo de la flecha (px)
  headW?: number;                // ancho de la punta (px); alto = headW·12/9
  labelSize?: number;            // tamaño de la palabra (px)
  gap?: number;                  // separación palabra↔flecha (px)
  pad?: number;                  // margen horizontal interior (px)
}

export function TransitionArrow({
  color, label, thickness = 2, headW = 9, labelSize = 11, gap = 2, pad = 8,
}: TransitionArrowProps) {
  const headH = Math.round((headW * 12) / 9);
  // El color identitario del bloque, oscurecido lo justo para leer sobre el
  // carril casi blanco (los grises de Partes/Texto quedaban por debajo del
  // contraste mínimo); los colores ya oscuros no se tocan.
  const c = markOnLight(color);

  const rootRef    = useRef<HTMLDivElement | null>(null);
  const measureRef = useRef<HTMLSpanElement | null>(null);
  const [fits, setFits] = useState(false);
  useLayoutEffect(() => {
    const root = rootRef.current, meas = measureRef.current;
    if (!root || !meas || !label) { setFits(false); return; }
    const check = () => setFits(meas.offsetWidth <= root.clientWidth - pad * 2);
    check();
    if (typeof ResizeObserver === "undefined") return; // jsdom (tests): solo la medición inicial
    const ro = new ResizeObserver(check);
    ro.observe(root);
    return () => ro.disconnect();
  }, [label, labelSize, pad]);
  const withLabel = fits && !!label;

  const labelFont: CSSProperties = { fontSize: labelSize, fontWeight: 600, whiteSpace: "nowrap", fontFamily: FONT_SANS };
  const root: CSSProperties = {
    position: "relative", width: "100%", height: "100%", alignSelf: "stretch",
    display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "stretch",
    gap: withLabel ? gap : 0, padding: `0 ${pad}px`, boxSizing: "border-box",
    pointerEvents: "none", overflow: "hidden",
  };
  return (
    <div ref={rootRef} style={root}>
      {/* Medidor oculto: el ancho natural de la palabra completa, sin recortes */}
      {label && (
        <span ref={measureRef} aria-hidden="true" style={{ ...labelFont, position: "absolute", visibility: "hidden", left: 0, top: 0 }}>
          {label}
        </span>
      )}
      {withLabel && (
        <span style={{ ...labelFont, color: c, textAlign: "center", overflow: "hidden", lineHeight: 1.05 }}>
          {label}
        </span>
      )}
      <div aria-hidden="true" style={{ display: "flex", alignItems: "center", width: "100%" }}>
        <div style={{ flex: 1, minWidth: 0, height: thickness, background: c, borderRadius: thickness / 2 }} />
        <svg width={headW} height={headH} viewBox="0 0 9 12" fill="none" style={{ display: "block", marginLeft: -1, flexShrink: 0 }}>
          <path d="M3 2 L6.7 6 L3 10" stroke={c} strokeWidth={thickness} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  );
}
