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
import { useRef } from "react";
import type { Ref } from "react";
import { C, FONT_SANS } from "../theme/tokens.js";
import { fmtClock } from "../lib/time.js";
import { startPointerDrag } from "../lib/pointer.js";
import { rowButtonProps } from "../lib/a11y.js";

export interface MinimapQuestion { id: string; audioStart?: number; audioEnd?: number; [k: string]: unknown; }

interface QuestionMinimapProps<Q extends MinimapQuestion> {
  questions: Q[];
  duration: number;
  time: number;                 // posición del playhead (s)
  editable?: boolean;
  height?: number;
  // Estado visual por bloque. `active` = seleccionado (gestor) o fijado/bucle
  // (sesión): opacidad plena + borde blanco. `fill` = color de fondo. `answered`
  // (A5-05, opcional): respondida — el bloque lleva además un ✓, no solo el
  // tono, para no depender solo del color (CVD).
  blockState: (q: Q, idx: number) => { fill: string; active: boolean; answered?: boolean };
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
  // Navegación por toda la obra (2026-07-06): clic/arrastre en cualquier punto
  // vacío de la línea (fuera de un bloque) salta ahí — como el navegador de
  // audio del modo esquema, pero sobre la línea entera de una vez (sin ventana
  // deslizante). Solo lectura (sesión del alumno); el gestor sigue usando
  // onBackgroundDown para deseleccionar. `showRuler` añade marcas de tiempo
  // (M:SS) bajo la línea para orientarse en obras largas.
  onSeek?: (t: number) => void;
  showRuler?: boolean;
}

// Paso "bonito" (5/10/15/30/60/90/120/180/300/600s…) que da ~5 marcas para la
// duración dada — sin medir el ancho real del contenedor (mismo criterio en
// cualquier tamaño de pantalla; una marca de más o de menos no importa aquí).
const NICE_STEPS = [5, 10, 15, 30, 60, 90, 120, 180, 300, 600, 900, 1800];
function tickStep(duration: number): number {
  const target = duration / 5;
  return NICE_STEPS.find((s) => s >= target) ?? NICE_STEPS[NICE_STEPS.length - 1];
}

export function QuestionMinimap<Q extends MinimapQuestion>({
  questions, duration, time, editable = false, height = editable ? 36 : 30,
  blockState, inactiveOpacity = editable ? 0.7 : 0.5, label = (i) => `${i + 1}`,
  onSelect, onDragBody, onDragEdge, onBackgroundDown, minimapRef,
  obraQuestions = [], onSelectObra, obraActiveId = null,
  onSeek, showRuler = false,
}: QuestionMinimapProps<Q>) {
  const dur = duration || 1;
  const ownRef = useRef<HTMLDivElement | null>(null);
  const setRefs = (node: HTMLDivElement | null) => {
    ownRef.current = node;
    if (typeof minimapRef === "function") minimapRef(node);
    else if (minimapRef) (minimapRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
  };

  const handleBackgroundDown = (e: React.MouseEvent | React.TouchEvent) => {
    onBackgroundDown?.();
    if (editable || !onSeek) return;
    const el = ownRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const getT = (clientX: number) => Math.max(0, Math.min(dur, ((clientX - rect.left) / rect.width) * dur));
    startPointerDrag(e, {
      onStart: (ev, getX) => onSeek(getT(getX(ev))),
      onMove:  (ev, getX) => onSeek(getT(getX(ev))),
    });
  };

  return (
    <>
      <div ref={setRefs} onMouseDown={handleBackgroundDown} onTouchStart={!editable && onSeek ? handleBackgroundDown : undefined}
        style={{ position: "relative", height, marginBottom: 4, background: C.paper2, borderRadius: 6, border: `1px solid ${C.line}`, overflow: "hidden", ...(editable ? { touchAction: "none" as const, userSelect: "none" as const, cursor: "default" as const } : { userSelect: "none" as const, cursor: onSeek ? "pointer" : undefined, ...(onSeek ? { touchAction: "none" as const } : {}) }) }}>
        {questions.map((q, idx) => {
          const start = q.audioStart ?? 0;
          const end   = q.audioEnd ?? 0;
          const { fill, active, answered } = blockState(q, idx);
          const left  = `${(start / dur) * 100}%`;
          const width = `${Math.max(0, (end - start) / dur) * 100}%`;
          // Con onSeek activo (sesión del alumno, 2026-07-06): el bloque es un
          // MARCADOR VISUAL inerte (pointerEvents:none) — el clic/arrastre lo
          // recoge la barra de fondo y salta a ese instante, aunque caiga sobre
          // un bloque. Así navegar y "abrir pregunta" (que se hace desde su
          // tarjeta de la lista) dejan de competir por el mismo pixel.
          const marker = !editable && !!onSeek;
          // Modo lectura (gestor, sin onSeek): el bloque es accionable — foco y
          // teclado además del clic (A5-10).
          const readSelectable = !editable && !marker;
          return (
            <div key={q.id}
              onMouseDown={editable ? (e) => onDragBody?.(e, q) : marker ? undefined : (e) => e.stopPropagation()}
              onTouchStart={editable ? (e) => onDragBody?.(e, q) : marker ? undefined : (e) => e.stopPropagation()}
              onClick={editable || marker ? undefined : () => onSelect?.(q)}
              {...(readSelectable ? rowButtonProps(() => onSelect?.(q)) : {})}
              title={`P${idx + 1}${answered ? " · respondida" : ""}: ${fmtClock(start)} – ${fmtClock(end)}`}
              style={{
                position: "absolute", top: 3, bottom: 3, left, width,
                background: fill, opacity: active ? 1 : inactiveOpacity,
                borderRadius: 3, cursor: editable ? "grab" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                border: active ? `1.5px solid rgba(255,255,255,0.85)` : "none",
                boxSizing: "border-box", overflow: "hidden", zIndex: active ? 2 : 1,
                ...(marker ? { pointerEvents: "none" as const } : {}),
              }}>
              {editable && (
                <div onMouseDown={(e) => { e.stopPropagation(); onDragEdge?.(e, q, "start"); }}
                     onTouchStart={(e) => { e.stopPropagation(); onDragEdge?.(e, q, "start"); }}
                     style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 10, cursor: "ew-resize", zIndex: 3, background: active ? "rgba(255,255,255,0.22)" : "transparent" }} />
              )}
              <span style={{ fontSize: 8, color: C.paper, fontWeight: 700, fontFamily: FONT_SANS, pointerEvents: "none", display: "flex", alignItems: "center", gap: 2, ...(editable ? { padding: "0 12px", overflow: "hidden" as const, whiteSpace: "nowrap" as const } : {}) }}>
                {answered && <span aria-hidden="true">✓</span>}{label(idx)}
              </span>
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

      {/* Regla de tiempo (obras largas, Jon 2026-07-06): marcas M:SS a paso
          "bonito" para orientarse y saltar directamente a cualquier punto sin
          tener que arrastrar por tramos — como el navegador de línea completa
          del modo esquema, aquí sobre la obra entera de una vez. */}
      {showRuler && (() => {
        const step = tickStep(dur);
        const ticks: number[] = [];
        for (let t = 0; t <= dur - step / 2; t += step) ticks.push(t);
        if (dur - ticks[ticks.length - 1] > step * 0.3) ticks.push(dur);
        return (
          <div style={{ position: "relative", height: 12, marginTop: -2, marginBottom: 6 }}>
            {ticks.map((t) => (
              <span key={t} style={{
                position: "absolute", left: `${(t / dur) * 100}%`,
                transform: t === 0 ? "translateX(0)" : t === dur ? "translateX(-100%)" : "translateX(-50%)",
                fontSize: 9, color: C.muted, fontFamily: FONT_SANS, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap",
              }}>{fmtClock(t)}</span>
            ))}
          </div>
        );
      })()}

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
