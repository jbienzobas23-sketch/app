// ═══ PLACA DE TIPO DE EJERCICIO ══════════════════════════════════════════════
// "Placa": cuadrado redondeado con fondo teñido + icono del tipo en el color de
// acento (currentColor). Es el lenguaje visual central del rediseño de la vista
// de cursos/ejercicios — identifica de un vistazo si el ejercicio es
// Interactivo (onda, verde) · Cuestionario (lista, azul) · Esquema (bloques, ámbar).
import type { CSSProperties } from "react";
import type { Exercise } from "../lib/types.js";
import { modelOf, partsOf } from "../lib/domain.js";
import { MODEL_META } from "../lib/modelMeta.js";
import { C, FONT_SANS } from "../theme/tokens.js";

interface IconProps { model: string; plateSize: number; }

// Icono de línea por tipo. Hereda el color del acento vía currentColor. El tamaño
// se deriva del lado de la placa para respetar las proporciones del handoff
// (onda ≈ 0.41·placa de alto; lista/bloques ≈ 0.47·placa de lado).
export function ExerciseTypeIcon({ model, plateSize }: IconProps) {
  if (model === "cuestionario") {
    const s = Math.round(plateSize * 0.47);
    return (
      <svg width={s} height={s} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true" focusable="false" style={{ display: "block" }}>
        <path d="M7 4.5h7.5M7 9h7.5M7 13.5h7.5" />
        <circle cx="3.4" cy="4.5"  r="1.1" fill="currentColor" stroke="none" />
        <circle cx="3.4" cy="9"    r="1.1" fill="currentColor" stroke="none" />
        <circle cx="3.4" cy="13.5" r="1.1" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  if (model === "esquema") {
    const s = Math.round(plateSize * 0.47);
    return (
      <svg width={s} height={s} viewBox="0 0 18 18" fill="currentColor" aria-hidden="true" focusable="false" style={{ display: "block" }}>
        <rect x="2" y="3"   width="14"  height="3.4" rx="1.2" />
        <rect x="2" y="7.5" width="8.6" height="3.4" rx="1.2" opacity=".6" />
        <rect x="2" y="12"  width="11"  height="3.4" rx="1.2" opacity=".38" />
      </svg>
    );
  }
  // interactivo (por defecto): onda de 5 barras
  const h = Math.round(plateSize * 0.41);
  const w = Math.round(h * 1.2);
  return (
    <svg width={w} height={h} viewBox="0 0 20 16" fill="currentColor" aria-hidden="true" focusable="false" style={{ display: "block" }}>
      <rect x="1"    y="6"   width="1.7" height="4"  rx=".85" />
      <rect x="4.6"  y="3"   width="1.7" height="10" rx=".85" />
      <rect x="8.2"  y="1.5" width="1.7" height="13" rx=".85" />
      <rect x="11.8" y="4.5" width="1.7" height="7"  rx=".85" />
      <rect x="15.4" y="6.5" width="1.7" height="3"  rx=".85" />
    </svg>
  );
}

interface PlateProps { model: string; size?: number; radius?: number; style?: CSSProperties; }

// Placa a partir de un id de modelo.
export function TypePlate({ model, size = 36, radius = 10, style }: PlateProps) {
  const meta = MODEL_META[model] || MODEL_META.interactivo;
  return (
    <div aria-hidden="true" style={{ width: size, height: size, borderRadius: radius, background: meta.plateBg, color: meta.color, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, ...style }}>
      <ExerciseTypeIcon model={model} plateSize={size} />
    </div>
  );
}

// Conveniencia: placa a partir del ejercicio (usa su modelo principal).
// Multiparte (F4, T4.5): insignia «×N» textual en la esquina — el número de
// partes va siempre acompañado del texto (nunca solo un color) y se repite,
// en detalle, en el MetaItem de Duración de cada tarjeta.
export function ExercisePlate({ ex, size = 36, radius, style }: { ex: Exercise; size?: number; radius?: number; style?: CSSProperties }) {
  const plate = <TypePlate model={modelOf(ex)} size={size} radius={radius} style={style} />;
  const partsN = partsOf(ex).length;
  if (partsN <= 1) return plate;
  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      {plate}
      <span style={{
        position: "absolute", bottom: -4, right: -4,
        background: C.ink, color: C.paper, fontFamily: FONT_SANS, fontSize: Math.max(9, Math.round(size * 0.26)),
        fontWeight: 700, lineHeight: 1, padding: "2px 4px", borderRadius: 999, border: `1.5px solid ${C.paper}`,
      }}>×{partsN}</span>
    </div>
  );
}
