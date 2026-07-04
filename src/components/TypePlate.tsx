// ═══ PLACA DE TIPO DE EJERCICIO ══════════════════════════════════════════════
// "Placa": cuadrado redondeado con fondo teñido + icono del tipo en el color de
// acento (currentColor). Es el lenguaje visual central del rediseño de la vista
// de cursos/ejercicios — identifica de un vistazo si el ejercicio es
// Interactivo (onda, verde) · Cuestionario (lista, azul) · Esquema (bloques, ámbar).
import { useId, type CSSProperties } from "react";
import type { Exercise } from "../lib/types.js";
import { modelsOf, partsOf } from "../lib/domain.js";
import { MODEL_META } from "../lib/modelMeta.js";
import { C, FONT_SANS } from "../theme/tokens.js";

interface IconProps { model: string; plateSize: number; }

// Glifo de líneas por tipo — solo las formas (M2.5), sin <svg> propio, para
// poder posicionarlo con translate/scale tanto en un solo modelo (ExerciseTypeIcon,
// viewBox propio) como en una placa combinada (ModelPlate, viewBox 48×48 común).
// Hereda el color del acento vía currentColor en ambos casos.
function Glyph({ model }: { model: string }) {
  if (model === "cuestionario") {
    return (
      <g fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <path d="M7 4.5h7.5M7 9h7.5M7 13.5h7.5" />
        <circle cx="3.4" cy="4.5"  r="1.1" fill="currentColor" stroke="none" />
        <circle cx="3.4" cy="9"    r="1.1" fill="currentColor" stroke="none" />
        <circle cx="3.4" cy="13.5" r="1.1" fill="currentColor" stroke="none" />
      </g>
    );
  }
  if (model === "esquema") {
    return (
      <g fill="currentColor">
        <rect x="2" y="3"   width="14"  height="3.4" rx="1.2" />
        <rect x="2" y="7.5" width="8.6" height="3.4" rx="1.2" opacity=".6" />
        <rect x="2" y="12"  width="11"  height="3.4" rx="1.2" opacity=".38" />
      </g>
    );
  }
  // interactivo (por defecto): onda de 5 barras
  return (
    <g fill="currentColor">
      <rect x="1"    y="6"   width="1.7" height="4"  rx=".85" />
      <rect x="4.6"  y="3"   width="1.7" height="10" rx=".85" />
      <rect x="8.2"  y="1.5" width="1.7" height="13" rx=".85" />
      <rect x="11.8" y="4.5" width="1.7" height="7"  rx=".85" />
      <rect x="15.4" y="6.5" width="1.7" height="3"  rx=".85" />
    </g>
  );
}

// Icono de línea por tipo. El tamaño se deriva del lado de la placa para
// respetar las proporciones del handoff (onda ≈ 0.41·placa de alto;
// lista/bloques ≈ 0.47·placa de lado).
export function ExerciseTypeIcon({ model, plateSize }: IconProps) {
  if (model === "cuestionario" || model === "esquema") {
    const s = Math.round(plateSize * 0.47);
    return (
      <svg width={s} height={s} viewBox="0 0 18 18" aria-hidden="true" focusable="false" style={{ display: "block" }}>
        <Glyph model={model} />
      </svg>
    );
  }
  const h = Math.round(plateSize * 0.41);
  const w = Math.round(h * 1.2);
  return (
    <svg width={w} height={h} viewBox="0 0 20 16" aria-hidden="true" focusable="false" style={{ display: "block" }}>
      <Glyph model={model} />
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

// Etiqueta de tipo compuesta, para aria-label de ModelPlate y para quien
// necesite el texto ("Interactivo + Cuestionario") sin la placa.
const modelLabel = (models: string[]): string => {
  const labels = models.map((m) => MODEL_META[m]?.label || m);
  if (labels.length <= 1) return labels[0] ?? "";
  return `${labels.slice(0, -1).join(", ")} y ${labels[labels.length - 1]}`;
};

// Caja de diseño nativa de cada glifo (la onda dibuja en 20×16; lista y
// bloques en 18×18) — para poder CENTRAR un glifo en (cx,cy) a escala k.
const glyphBox = (m: string) => (m === "cuestionario" || m === "esquema") ? { w: 18, h: 18 } : { w: 20, h: 16 };
const glyphAt = (m: string, cx: number, cy: number, k: number) => {
  const { w, h } = glyphBox(m);
  return `translate(${cx - (w * k) / 2} ${cy - (h * k) / 2}) scale(${k})`;
};

// Placa combinada (M2.5, rediseñada según la maqueta de Jon 2026-07-04): UNA
// sola placa cuyo fondo es el tinte del modelo principal, con una "baldosa"
// redondeada del tinte secundario asomando por la esquina inferior derecha
// (sin costura blanca: los tintes se tocan en una curva suave). El glifo
// principal va grande arriba-izquierda; el secundario, menor, centrado en su
// baldosa — jerarquía clara y ambos legibles, nada de sectores con glifos
// enanos. Con 3 modelos (puerta M7): baldosas arriba-derecha y abajo.
interface ModelPlateProps { models: string[]; size?: number; radius?: number; style?: CSSProperties; }
export function ModelPlate({ models, size = 36, radius = 10, style }: ModelPlateProps) {
  // Mínimo 36px: por debajo, el glifo secundario deja de leerse.
  const s = Math.max(36, size);
  const clipId = useId();
  const rx = (radius * 48) / s;
  const tint   = (m: string) => MODEL_META[m]?.plateBg || MODEL_META.interactivo.plateBg;
  const accent = (m: string) => MODEL_META[m]?.color   || MODEL_META.interactivo.color;
  const [m0, m1, m2] = models;
  return (
    <svg width={s} height={s} viewBox="0 0 48 48" role="img" aria-label={modelLabel(models)}
      style={{ display: "block", flexShrink: 0, ...style }}>
      <defs><clipPath id={clipId}><rect width="48" height="48" rx={rx} /></clipPath></defs>
      <g clipPath={`url(#${clipId})`}>
        <rect width="48" height="48" fill={tint(m0)} />
        {models.length >= 3 ? (
          <>
            <rect x="25" y="-9" width="33" height="33" rx="12" fill={tint(m1)} />
            <rect x="15" y="27" width="42" height="30" rx="12" fill={tint(m2)} />
            <g transform={glyphAt(m0, 13, 12, 0.8)}    style={{ color: accent(m0) }}><Glyph model={m0} /></g>
            <g transform={glyphAt(m1, 37, 10.5, 0.58)} style={{ color: accent(m1) }}><Glyph model={m1} /></g>
            <g transform={glyphAt(m2, 33.5, 38.5, 0.58)} style={{ color: accent(m2) }}><Glyph model={m2} /></g>
          </>
        ) : (
          <>
            <rect x="23" y="23" width="34" height="34" rx="12" fill={tint(m1)} />
            <g transform={glyphAt(m0, 15.5, 14.5, 0.95)} style={{ color: accent(m0) }}><Glyph model={m0} /></g>
            <g transform={glyphAt(m1, 35.5, 35.5, 0.72)} style={{ color: accent(m1) }}><Glyph model={m1} /></g>
          </>
        )}
      </g>
    </svg>
  );
}

// Conveniencia: placa a partir del ejercicio (uno o varios modelos: combo →
// ModelPlate, M2.5). Multiparte (F4, T4.5): insignia «×N» textual en la
// esquina — el número de partes va siempre acompañado del texto (nunca solo
// un color) y se repite, en detalle, en el MetaItem de Duración de cada tarjeta.
export function ExercisePlate({ ex, size = 36, radius, style }: { ex: Exercise; size?: number; radius?: number; style?: CSSProperties }) {
  const models = modelsOf(ex);
  const isCombo = models.length >= 2;
  const plate = isCombo
    ? <ModelPlate models={models} size={size} radius={radius} style={style} />
    : <TypePlate model={models[0]} size={size} radius={radius} style={style} />;
  const partsN = partsOf(ex).length;
  if (partsN <= 1) return plate;
  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      {plate}
      <span style={{
        // En placa combinada la esquina inferior derecha la ocupa la baldosa del
        // modelo secundario → la insignia sube a la superior, que queda libre.
        position: "absolute", right: -4, ...(isCombo ? { top: -4 } : { bottom: -4 }),
        background: C.ink, color: C.paper, fontFamily: FONT_SANS, fontSize: Math.max(9, Math.round(size * 0.26)),
        fontWeight: 700, lineHeight: 1, padding: "2px 4px", borderRadius: 999, border: `1.5px solid ${C.paper}`,
      }}>×{partsN}</span>
    </div>
  );
}
