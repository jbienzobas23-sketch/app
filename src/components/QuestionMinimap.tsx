// ═══ QUESTIONMINIMAP (M3.2) ═══════════════════════════════════════════════════
// Línea de tiempo con un bloque por pregunta, posicionado por su fragmento
// (audioStart/audioEnd). Compartida por el gestor de preguntas (editable:
// arrastrar el cuerpo mueve, arrastrar los bordes ajusta) y por la sesión del
// alumno (solo lectura: tocar un bloque salta/fija su fragmento). El aspecto se
// conserva idéntico al de ambas versiones previas vía `inactiveOpacity`,
// `blockFill`, el label y la altura, que cada llamador aporta.
//
// Bandeja «Obra» (M3.2, para M6): prop `obraQuestions` — preguntas SIN fragmento
// (ámbito "obra completa") que no caben en la línea de tiempo; se muestran como
// chips debajo. Hasta M6 llega vacía, pero la API ya la contempla.
import type { Ref } from "react";
import { C, FONT_SANS } from "../theme/tokens.js";
import { fmtClock } from "../lib/time.js";

export interface MinimapQuestion { id: string; audioStart?: number; audioEnd?: number; [k: string]: unknown; }

interface QuestionMinimapProps<Q extends MinimapQuestion> {
  questions: Q[];
  duration: number;
  time: number;                 // posición del playhead (s)
  editable?: boolean;
  height?: number;
  // Estado visual por bloque. `active` = seleccionado (gestor) o fijado/bucle
  // (sesión): opacidad plena + borde blanco. `fill` = color de fondo.
  blockState: (q: Q, idx: number) => { fill: string; active: boolean };
  inactiveOpacity?: number;     // 0.7 gestor · 0.5 sesión
  label?: (idx: number) => string;   // "P{n}" gestor · "{n}" sesión
  // Solo lectura: clic en un bloque.
  onSelect?: (q: Q) => void;
  // Editable: el gestor inyecta sus handlers de arrastre.
  onDragBody?: (e: React.MouseEvent | React.TouchEvent, q: Q) => void;
  onDragEdge?: (e: React.MouseEvent | React.TouchEvent, q: Q, which: "start" | "end") => void;
  onBackgroundDown?: () => void;
  minimapRef?: Ref<HTMLDivElement>;
  // Bandeja «Obra» (M6): chips de preguntas de obra completa, bajo la línea.
  obraQuestions?: Q[];
  onSelectObra?: (q: Q) => void;
  obraActiveId?: string | null;
}

export function QuestionMinimap<Q extends MinimapQuestion>({
  questions, duration, time, editable = false, height = editable ? 36 : 30,
  blockState, inactiveOpacity = editable ? 0.7 : 0.5, label = (i) => `${i + 1}`,
  onSelect, onDragBody, onDragEdge, onBackgroundDown, minimapRef,
  obraQuestions = [], onSelectObra, obraActiveId = null,
}: QuestionMinimapProps<Q>) {
  const dur = duration || 1;
  return (
    <>
      <div ref={minimapRef} onMouseDown={onBackgroundDown ? () => onBackgroundDown() : undefined}
        style={{ position: "relative", height, marginBottom: 4, background: C.paper2, borderRadius: 6, border: `1px solid ${C.line}`, overflow: "hidden", ...(editable ? { touchAction: "none" as const, userSelect: "none" as const, cursor: "default" as const } : { userSelect: "none" as const }) }}>
        {questions.map((q, idx) => {
          const start = q.audioStart ?? 0;
          const end   = q.audioEnd ?? 0;
          const { fill, active } = blockState(q, idx);
          const left  = `${(start / dur) * 100}%`;
          const width = `${Math.max(0, (end - start) / dur) * 100}%`;
          return (
            <div key={q.id}
              onMouseDown={editable ? (e) => onDragBody?.(e, q) : (e) => e.stopPropagation()}
              onTouchStart={editable ? (e) => onDragBody?.(e, q) : undefined}
              onClick={editable ? undefined : () => onSelect?.(q)}
              title={`P${idx + 1}: ${fmtClock(start)} – ${fmtClock(end)}`}
              style={{
                position: "absolute", top: 3, bottom: 3, left, width,
                background: fill, opacity: active ? 1 : inactiveOpacity,
                borderRadius: 3, cursor: editable ? "grab" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                border: active ? `1.5px solid rgba(255,255,255,0.85)` : "none",
                boxSizing: "border-box", overflow: "hidden", zIndex: active ? 2 : 1,
              }}>
              {editable && (
                <div onMouseDown={(e) => { e.stopPropagation(); onDragEdge?.(e, q, "start"); }}
                     onTouchStart={(e) => { e.stopPropagation(); onDragEdge?.(e, q, "start"); }}
                     style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 10, cursor: "ew-resize", zIndex: 3, background: active ? "rgba(255,255,255,0.22)" : "transparent" }} />
              )}
              <span style={{ fontSize: 8, color: C.paper, fontWeight: 700, fontFamily: FONT_SANS, pointerEvents: "none", ...(editable ? { padding: "0 12px", overflow: "hidden" as const, whiteSpace: "nowrap" as const } : {}) }}>{label(idx)}</span>
              {editable && (
                <div onMouseDown={(e) => { e.stopPropagation(); onDragEdge?.(e, q, "end"); }}
                     onTouchStart={(e) => { e.stopPropagation(); onDragEdge?.(e, q, "end"); }}
                     style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 10, cursor: "ew-resize", zIndex: 3, background: active ? "rgba(255,255,255,0.22)" : "transparent" }} />
              )}
            </div>
          );
        })}
        <div style={{ position: "absolute", top: 0, bottom: 0, left: `${(time / dur) * 100}%`, width: editable ? 2 : 1.5, background: C.ink, opacity: 0.75, pointerEvents: "none", zIndex: 5 }} />
      </div>

      {obraQuestions.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
          <span style={{ fontFamily: FONT_SANS, fontSize: 9.5, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: C.muted, alignSelf: "center" }}>Obra</span>
          {obraQuestions.map((q, idx) => {
            const active = obraActiveId === q.id;
            return (
              <button key={q.id} type="button" onClick={() => onSelectObra?.(q)}
                style={{ fontFamily: FONT_SANS, fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 999, cursor: "pointer",
                  background: active ? C.quiz : `${C.quiz}12`, color: active ? C.paper : C.quiz, border: "none" }}>
                Obra {idx + 1}
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}
