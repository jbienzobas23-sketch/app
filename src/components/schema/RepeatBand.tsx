// ═══ REPEATBAND — BANDA DE REPETICIÓN DEL ESQUEMA ═══════════════════════════
// Extraído de SchemaExerciseView (F7, T7.1) sin cambio de comportamiento: la
// franja bajo la regla donde se crea una repetición arrastrando, y las tres
// asas para ajustar sus bordes (inicio del original, unión, fin de la
// repetición). El componente no conoce `blocks` como dato propio — solo los
// usa para los puntos de imantación al crear/ajustar — y delega toda
// escritura real en las props que le pasa el padre:
//   - `setLocalReps` para la vista previa en vivo durante el arrastre (sin
//     recalcular la 2ª vez de los bloques en cada frame, igual que antes),
//   - `onSaveRepetitions` para el commit final al soltar (con historial y
//     sincronización de bloques — hoy sigue siendo `handleSaveRepetitions`
//     en el componente padre).
import { Fragment, useRef, useState } from "react";
import type { Block, Rep } from "../../lib/repeats.js";
import { C } from "../../theme/tokens.js";
import { uid } from "../../lib/ids.js";
import { fmtClock } from "../../lib/time.js";
import { SCHEMA_MIN_DUR } from "../../lib/schema.js";

type BandDrag =
  | { type: "create"; startT: number; curT: number }
  | { type: "handle"; handle: string; origRep: Rep };

// Entrada sintética de React o evento nativo de window durante un arrastre —
// getBandClientX acepta ambos.
type BandPointerEvent = React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent;

interface RepeatBandProps {
  duration: number;
  blocks: Block[];
  localReps: Rep[];
  setLocalReps: React.Dispatch<React.SetStateAction<Rep[]>>;
  onSaveRepetitions: (newReps: Rep[]) => void;
  onDeleteRepeat: (repId: string) => void;
  selectedRepId: string | null;
  setSelectedRepId: React.Dispatch<React.SetStateAction<string | null>>;
  onDeselectBlock: () => void;
}

export function RepeatBand({
  duration, blocks, localReps, setLocalReps, onSaveRepetitions, onDeleteRepeat,
  selectedRepId, setSelectedRepId, onDeselectBlock,
}: RepeatBandProps) {
  const [bandDrag, setBandDrag] = useState<BandDrag | null>(null);
  const bandRef = useRef<HTMLDivElement | null>(null);
  const blocksRef = useRef(blocks);
  blocksRef.current = blocks;
  const localRepsRef = useRef(localReps);
  localRepsRef.current = localReps;

  // En vista completa la fracción es lineal: frac = t / duration
  const timeToFrac = (t: number) => Math.max(0, Math.min(1, t / duration));
  const fracToTime = (f: number) => f * duration; // sin redondeo para movimiento suave

  // Entrada (onMouseDown/onTouchStart, sintéticos de React) y los listeners de
  // window durante el arrastre (nativos) comparten esta forma de acceso.
  const getBandClientX = (ev: BandPointerEvent) => {
    const native = ("nativeEvent" in ev ? ev.nativeEvent : ev) as MouseEvent & TouchEvent;
    return native.touches?.[0]?.clientX ?? native.changedTouches?.[0]?.clientX ?? native.clientX;
  };

  const getBandFrac = (ev: BandPointerEvent) => {
    const el = bandRef.current; if (!el) return 0;
    const r = el.getBoundingClientRect();
    return Math.max(0, Math.min(1, (getBandClientX(ev) - r.left) / r.width));
  };

  // Iniciar drag de creación — funciona aunque ya haya repeticiones
  const handleBandCreateDown = (e: React.MouseEvent | React.TouchEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest("button") || target.closest("[data-band-handle]")) return;
    e.preventDefault();
    const BAND_SNAP = Math.max(0.3, duration * 0.02);
    const AUTOSNAP_S = 5;
    const snapT = (raw: number) => {
      const pts = [0, duration,
        ...blocksRef.current.filter(b => !b.isPreview).flatMap(b => [b.start, b.end]),
        ...localRepsRef.current.flatMap(r => [r.first.start, r.first.end, r.second.end]),
      ];
      let best = raw, bestDist = BAND_SNAP;
      for (const c of pts) { const d = Math.abs(raw - c); if (d < bestDist) { bestDist = d; best = c; } }
      return best;
    };
    const startT = snapT(fracToTime(getBandFrac(e)));
    setBandDrag({ type: "create", startT, curT: startT });
    const mv = (ev: MouseEvent | TouchEvent) => {
      if (ev.cancelable) ev.preventDefault();
      setBandDrag(p => p?.type === "create" ? { ...p, curT: snapT(fracToTime(getBandFrac(ev))) } : p);
    };
    const up = () => {
      setBandDrag(prev => {
        if (prev?.type !== "create") return null;
        const s = Math.min(prev.startT, prev.curT);
        const e2 = Math.max(prev.startT, prev.curT);
        const d = e2 - s;
        if (d >= SCHEMA_MIN_DUR) {
          let fs = s < 3 ? 0 : s;
          for (const r of localRepsRef.current) {
            if (fs > r.second.end - 0.1 && fs <= r.second.end + AUTOSNAP_S) { fs = r.second.end; break; }
          }
          const fe = fs + d, se = Math.min(duration, fe + d);
          onSaveRepetitions([
            ...localRepsRef.current,
            { id: uid("rep"), label: "", first: { start: fs, end: fe }, second: { start: fe, end: se } },
          ]);
        }
        return null;
      });
      window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up);
      window.removeEventListener("touchmove", mv); window.removeEventListener("touchend", up);
    };
    window.addEventListener("mousemove", mv);
    window.addEventListener("mouseup", up);
    window.addEventListener("touchmove", mv, { passive: false });
    window.addEventListener("touchend", up);
  };

  // Iniciar drag de asa de borde
  // handle: "first.start" | "junction" (first.end = second.start) | "second.end"
  const handleBandHandleDown = (e: React.MouseEvent | React.TouchEvent, rep: Rep, handle: string) => {
    e.preventDefault(); e.stopPropagation();

    const BAND_SNAP = Math.max(0.3, duration * 0.02);
    const snapT = (raw: number) => {
      const candidates = [0, duration, ...blocksRef.current.filter(b => !b.isPreview).flatMap(b => [b.start, b.end])];
      let best = raw, bestDist = BAND_SNAP;
      for (const c of candidates) { const dd = Math.abs(raw - c); if (dd < bestDist) { bestDist = dd; best = c; } }
      return best;
    };

    const calcNewRep = (raw: number) => {
      const t = snapT(raw);
      const r = { ...rep, first: { ...rep.first }, second: { ...rep.second } };
      if (handle === "first.start") {
        r.first.start = Math.max(0, Math.min(t, r.first.end - SCHEMA_MIN_DUR));
      } else if (handle === "junction") {
        // Mover juntos: fin del original = inicio de la repetición
        const jt = Math.max(r.first.start + SCHEMA_MIN_DUR, Math.min(t, duration - SCHEMA_MIN_DUR));
        // La 2ª vez se ajusta proporcionalmente: si el original crece/encoge, la repetición también
        const origFD = rep.first.end - rep.first.start || 1;
        const origSD = rep.second.end - rep.second.start || 1;
        const ratio = origSD / origFD;
        r.first.end = jt;
        r.second.start = jt;
        r.second.end = Math.min(duration, jt + (jt - r.first.start) * ratio);
      } else {
        r.second.end = Math.max(r.second.start + SCHEMA_MIN_DUR, Math.min(t, duration));
      }
      return r;
    };

    const mv = (ev: MouseEvent | TouchEvent) => {
      if (ev.cancelable) ev.preventDefault();
      const newRep = calcNewRep(fracToTime(getBandFrac(ev)));
      setLocalReps(prev => prev.map(r => r.id === rep.id ? newRep : r));
    };
    const up = (ev: MouseEvent | TouchEvent) => {
      const newRep = calcNewRep(fracToTime(getBandFrac(ev)));
      onSaveRepetitions(localRepsRef.current.map(r => r.id === rep.id ? newRep : r));
      setBandDrag(null);
      window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up);
      window.removeEventListener("touchmove", mv); window.removeEventListener("touchend", up);
    };
    window.addEventListener("mousemove", mv); window.addEventListener("mouseup", up);
    window.addEventListener("touchmove", mv, { passive: false }); window.addEventListener("touchend", up);
  };

  return (
    <div style={{ borderTop: `1px solid rgba(47,111,184,0.18)`, borderBottom: `1px solid ${C.line}`, position: "relative", overflow: "visible" }}>
      <div
        ref={bandRef}
        style={{ height: 26, position: "relative", userSelect: "none", touchAction: "none", cursor: "crosshair", background: "rgba(47,111,184,0.055)" }}
        onMouseDown={handleBandCreateDown}
        onTouchStart={handleBandCreateDown}>

        {/* Zonas de repetición */}
        {localReps.map(rep => {
          const fS = timeToFrac(rep.first.start) * 100;
          const fE = timeToFrac(rep.first.end) * 100;
          const sE = timeToFrac(rep.second.end) * 100;
          const fW = fE - fS;
          const sW = sE - fE;
          return (
            <Fragment key={rep.id}>
              {/* Zona "original" — clicable para seleccionar la repetición */}
              <div
                onMouseDown={e => { e.stopPropagation(); setSelectedRepId(r => r === rep.id ? null : (rep.id ?? null)); onDeselectBlock(); }}
                onTouchStart={e => { e.stopPropagation(); setSelectedRepId(r => r === rep.id ? null : (rep.id ?? null)); onDeselectBlock(); }}
                style={{ position: "absolute", top: 3, bottom: 3, left: `${fS}%`, width: `${fW}%`, background: selectedRepId === rep.id ? `${C.fnS}45` : `${C.fnS}28`, borderRadius: 4, border: selectedRepId === rep.id ? `1.5px solid ${C.fnS}` : `1px solid ${C.fnS}60`, boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", cursor: "pointer", zIndex: 5 }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: C.fnS, letterSpacing: 0.6, textTransform: "uppercase", whiteSpace: "nowrap", pointerEvents: "none" }}>original</span>
              </div>
              {/* Zona "repetición" — clicable para seleccionar la repetición */}
              <div
                onMouseDown={e => { e.stopPropagation(); setSelectedRepId(r => r === rep.id ? null : (rep.id ?? null)); onDeselectBlock(); }}
                onTouchStart={e => { e.stopPropagation(); setSelectedRepId(r => r === rep.id ? null : (rep.id ?? null)); onDeselectBlock(); }}
                style={{ position: "absolute", top: 3, bottom: 3, left: `${fE}%`, width: `${sW}%`, background: selectedRepId === rep.id ? `${C.fnT}38` : `${C.fnT}22`, borderRadius: 4, border: selectedRepId === rep.id ? `1.5px solid ${C.fnT}` : `1px solid ${C.fnT}55`, boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", cursor: "pointer", zIndex: 5 }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: C.fnT, letterSpacing: 0.6, textTransform: "uppercase", whiteSpace: "nowrap", pointerEvents: "none" }}>repetición</span>
              </div>
              {/* Asa: inicio del original */}
              <div onMouseDown={e => handleBandHandleDown(e, rep, "first.start")} onTouchStart={e => handleBandHandleDown(e, rep, "first.start")}
                title={`Inicio original: ${fmtClock(rep.first.start)}`}
                style={{ position: "absolute", top: 0, bottom: 0, left: `calc(${fS}% - 5px)`, width: 10, cursor: "ew-resize", zIndex: 10, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{ width: 3, height: 16, borderRadius: 2, background: C.fnS, boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
              </div>
              {/* Asa: unión original/repetición */}
              <div onMouseDown={e => handleBandHandleDown(e, rep, "junction")} onTouchStart={e => handleBandHandleDown(e, rep, "junction")}
                title={`Fin original / inicio repetición: ${fmtClock(rep.first.end)}`}
                style={{ position: "absolute", top: 0, bottom: 0, left: `calc(${fE}% - 6px)`, width: 12, cursor: "ew-resize", zIndex: 10, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{ width: 4, height: 20, borderRadius: 2, background: C.ink2, boxShadow: "0 1px 4px rgba(0,0,0,0.25)" }} />
              </div>
              {/* Asa: fin de la repetición */}
              <div onMouseDown={e => handleBandHandleDown(e, rep, "second.end")} onTouchStart={e => handleBandHandleDown(e, rep, "second.end")}
                title={`Fin repetición: ${fmtClock(rep.second.end)}`}
                style={{ position: "absolute", top: 0, bottom: 0, left: `calc(${sE}% - 5px)`, width: 10, cursor: "ew-resize", zIndex: 10, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{ width: 3, height: 16, borderRadius: 2, background: C.fnT, boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
              </div>
              {/* Botón eliminar */}
              <button onMouseDown={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()}
                onClick={() => onDeleteRepeat(rep.id ?? "")} title="Eliminar repetición"
                style={{ position: "absolute", top: 3, right: 4, zIndex: 20, background: "rgba(255,255,255,0.85)", border: `1px solid ${C.line}`, borderRadius: 3, padding: "0px 5px", fontSize: 9, cursor: "pointer", color: C.muted, lineHeight: 1.6 }}>
                ✕
              </button>
            </Fragment>
          );
        })}

        {/* Preview mientras se arrastra para crear */}
        {bandDrag?.type === "create" && (() => {
          const s = Math.min(bandDrag.startT, bandDrag.curT);
          const e2 = Math.max(bandDrag.startT, bandDrag.curT);
          const fS = timeToFrac(s) * 100, fW = timeToFrac(e2) * 100 - fS;
          return fW > 0.5 ? (
            <div style={{ position: "absolute", top: 3, bottom: 3, left: `${fS}%`, width: `${fW}%`, background: `${C.fnS}40`, borderRadius: 4, border: `2px solid ${C.fnS}`, boxSizing: "border-box", pointerEvents: "none", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: 8, fontWeight: 700, color: C.fnS }}>original</span>
            </div>
          ) : null;
        })()}

        {/* Hint cuando no hay repetición */}
        {localReps.length === 0 && !bandDrag && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
            <span style={{ fontSize: 10, color: C.muted, letterSpacing: 0.3 }}>Arrastra aquí para crear una repetición</span>
          </div>
        )}
      </div>
    </div>
  );
}
