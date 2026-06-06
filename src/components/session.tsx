// ═══ INFRAESTRUCTURA DE SESIÓN (ONDA / SCRUBBER / BOTONES) ═══════════════════
// FragmentRangeSelector, WaveformDisplay, AudioScrubber, FigureLabel y
// FunctionButtons. Extraídos de App.jsx (Fase 2) sin cambiar su lógica.
import React, { useState, useEffect, useRef, useMemo, useLayoutEffect } from "react";
import { C, S, FONT_MONO } from "../theme/tokens.js";
import { startPointerDrag } from "../lib/pointer.js";
import { VISIBLE_SECS, IV_BAND_H, IV_BAND_GAP } from "../lib/sessionConstants.js";
import { fmt } from "../lib/ids.js";
import { generateWaveform } from "../lib/audio.js";
import { figureOf } from "../lib/figures.js";
import { SCHEMA_HND_VISUAL_W } from "../lib/schema.js";
import { useIsMobile } from "../hooks/useIsMobile.js";

// ── Tipos locales de la infraestructura de sesión ────────────────────────────
// Intervalo dibujable (clave/marcado/bloque). `id` opcional: "live"/"tmp-commit".
interface Iv { id?: string; fn: string; start: number; end: number; fig?: string | null; _anim?: number; [k: string]: unknown; }
// Pulsación en curso leída de forma síncrona desde un ref.
interface Pressing { fn: string; start: number; end?: number | null; }
type ColorMap = Record<string, string>;
interface FnBtn { id: string; name?: string; color?: string; key?: string; }
interface QuestionRegion { start: number; end: number; color?: string; }
// Glifo de cifrado (subconjunto consumido por el canvas).
interface Glyph { d: string; pre?: string; strike?: boolean; }

interface FragmentRangeSelectorProps {
  totalDuration: number;
  start: number | null;
  end: number | null;
  onChange: (range: { start: number; end: number }) => void;
  onClear: () => void;
  onDefine: () => void;
  audioUrl?: string | null;
}

// Selector visual de fragmento (barra de rango con handles arrastrables)
export function FragmentRangeSelector({ totalDuration, start, end, onChange, onClear, onDefine, audioUrl }: FragmentRangeSelectorProps) {
  const barRef    = useRef<HTMLDivElement | null>(null);
  const audioRef  = useRef<HTMLAudioElement | null>(null);
  const rafRef    = useRef<number>(0);
  const [playing,      setPlaying]      = useState(false);
  const [currentTime,  setCurrentTime]  = useState(start ?? 0);
  // fragPlayMode: si true, la reproducción se limita al fragmento; si false, reproduce libre
  const [fragPlayMode, setFragPlayMode] = useState(false);

  // Refs para acceder a valores actuales dentro del RAF sin causar re-renders
  const startRef        = useRef(start);
  const endRef          = useRef(end);
  const fragPlayModeRef = useRef(false);
  startRef.current        = start;
  endRef.current          = end;
  fragPlayModeRef.current = fragPlayMode;

  // RAF: actualiza el playhead y, en modo fragmento, para al llegar al fin
  useEffect(() => {
    if (!playing) { cancelAnimationFrame(rafRef.current); return; }
    const tick = () => {
      const audio = audioRef.current;
      if (!audio) { rafRef.current = requestAnimationFrame(tick); return; }
      const t = audio.currentTime;
      setCurrentTime(t);
      const e = endRef.current;
      const s = startRef.current;
      // Parar al final del fragmento solo en fragPlayMode
      if (fragPlayModeRef.current && e != null && t >= e) {
        audio.pause();
        audio.currentTime = s ?? 0;
        setCurrentTime(s ?? 0);
        setPlaying(false);
        setFragPlayMode(false);
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing]);

  // Cleanup: parar audio al desmontar el componente
  useEffect(() => () => {
    cancelAnimationFrame(rafRef.current);
    if (audioRef.current) audioRef.current.pause();
  }, []);

  // Si el fragmento cambia y el cursor queda fuera, recolocarlo
  useEffect(() => {
    if (audioRef.current && !playing) {
      if (start != null && (currentTime < start || (end != null && currentTime > end))) {
        audioRef.current.currentTime = start;
        setCurrentTime(start);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start, end]);

  const getT = (clientX: number) => {
    const r = barRef.current?.getBoundingClientRect();
    if (!r || r.width === 0) return 0;
    return Math.max(0, Math.min(totalDuration, ((clientX - r.left) / r.width) * totalDuration));
  };

  // Clic/arrastre en la barra para seek (ratón + touch, con limpieza garantizada)
  const beginSeek = (e: any) => {
    startPointerDrag(e, {
      onStart: (ev, getX) => {
        const t = getT(getX(ev));
        if (audioRef.current) audioRef.current.currentTime = t;
        setCurrentTime(t);
      },
      onMove: (ev, getX) => {
        const tv = getT(getX(ev));
        if (audioRef.current) audioRef.current.currentTime = tv;
        setCurrentTime(tv);
      },
    });
  };

  // Arrastre de handles de fragmento (ratón + touch, con limpieza garantizada)
  const beginDrag = (e: any, which: "start" | "end") => {
    e.stopPropagation();
    const s = start ?? 0, en = end ?? totalDuration;
    startPointerDrag(e, {
      onMove: (ev, getX) => {
        const raw = Math.round(getT(getX(ev)) * 10) / 10;
        if (which === "start") onChange({ start: Math.max(0, Math.min(raw, en - 0.5)), end: en });
        else                   onChange({ start: s, end: Math.max(s + 0.5, Math.min(raw, totalDuration)) });
      },
    });
  };

  // Reproducción libre (sin límite de fragmento)
  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
      setFragPlayMode(false);
    } else {
      setFragPlayMode(false);
      // Si el audio llegó al final, rebobinar antes de reproducir de nuevo
      if (audio.ended || audio.currentTime >= (audio.duration || totalDuration)) {
        audio.currentTime = 0;
        setCurrentTime(0);
      }
      audio.play().catch(() => {});
      setPlaying(true);
    }
  };

  // Reproducción solo del fragmento (fragStart → fragEnd)
  const playFragment = () => {
    const audio = audioRef.current;
    if (!audio || start == null) return;
    if (playing && fragPlayMode) {
      audio.pause();
      setPlaying(false);
      setFragPlayMode(false);
      return;
    }
    if (playing) audio.pause();
    audio.currentTime = start;
    setCurrentTime(start);
    setFragPlayMode(true);
    audio.play().catch(() => {});
    setPlaying(true);
  };

  const startPct    = start != null ? (start / totalDuration) * 100 : null;
  const endPct      = end   != null ? (end   / totalDuration) * 100 : null;
  const playheadPct = Math.min(100, (currentTime / totalDuration) * 100);

  const HANDLE_W = 12;
  const handleStyle = (pct: number): React.CSSProperties => ({
    position: "absolute", top: 0, bottom: 0,
    left: `calc(${pct}% - ${HANDLE_W / 2}px)`, width: HANDLE_W,
    background: C.quiz, borderRadius: 3, cursor: "ew-resize",
    display: "flex", alignItems: "center", justifyContent: "center", zIndex: 3,
  });

  // Formato M:SS.d para mayor precisión en el contador
  const fmtP = (s: number) => {
    const m  = Math.floor(s / 60);
    const ss = (s % 60).toFixed(1).padStart(4, "0");
    return `${m}:${ss}`;
  };

  return (
    <div>
      {/* Audio element oculto */}
      {audioUrl && <audio ref={audioRef} src={audioUrl} preload="auto" style={{ display: "none" }} />}

      {/* Fila de controles: play + tiempo + botones de fragmento */}
      <div style={{ ...S.row, gap: 8, marginBottom: 10, alignItems: "center" }}>
        {/* ▶ Reproducir desde posición actual (libre) */}
        <button type="button" onClick={togglePlay} disabled={!audioUrl}
          title="Reproducir desde aquí"
          style={{
            ...S.btn, width: 34, height: 34, padding: 0, flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 14, borderRadius: "50%",
            background: (playing && !fragPlayMode) ? C.ink : C.paper,
            color:      (playing && !fragPlayMode) ? C.paper : C.ink2,
            border: `1px solid ${(playing && !fragPlayMode) ? C.ink : C.line}`,
          }}>
          {(playing && !fragPlayMode) ? "⏸" : "▶"}
        </button>

        {/* Contador de tiempo */}
        <span style={{ fontFamily: FONT_MONO, fontSize: 12, color: C.ink2, minWidth: 70 }}>
          {fmtP(currentTime)}
          {totalDuration ? <span style={{ color: C.muted }}> / {fmt(totalDuration)}</span> : null}
        </span>

        <div style={{ flex: 1 }} />

        {/* ▶ Solo fragmento (solo cuando fragmento definido) / + Definir */}
        {start !== null ? (
          <button type="button" onClick={playFragment} disabled={!audioUrl}
            title="Reproducir solo el fragmento seleccionado"
            style={{
              ...S.btn, padding: "4px 10px", fontSize: 12, flexShrink: 0,
              display: "flex", alignItems: "center", gap: 5,
              background: fragPlayMode ? C.quiz : "rgba(47,111,184,0.08)",
              color:      fragPlayMode ? "#fff"  : C.quiz,
              border: `1px solid ${fragPlayMode ? C.quiz : "rgba(47,111,184,0.35)"}`,
            }}>
            <span style={{ fontSize: 11 }}>{fragPlayMode ? "⏸" : "▶"}</span>
            <span>Solo fragmento</span>
          </button>
        ) : (
          <button type="button" onClick={onDefine}
            style={{ ...S.btn, padding: "4px 10px", fontSize: 12, flexShrink: 0 }}>
            + Definir fragmento
          </button>
        )}
      </div>

      {/* Barra integrada: seek + región de fragmento + handles + playhead */}
      <div style={{ position: "relative", paddingTop: start != null ? 20 : 6, marginBottom: 12, userSelect: "none" }}>
        {/* Etiquetas sobre los handles */}
        {start != null && startPct != null && (
          <div style={{ position: "absolute", top: 0, left: `clamp(0px, calc(${startPct}% - 22px), calc(100% - 44px))`, fontSize: 10, color: C.quiz, fontFamily: FONT_MONO, whiteSpace: "nowrap", pointerEvents: "none" }}>
            {fmt(start)}
          </div>
        )}
        {end != null && endPct != null && (
          <div style={{ position: "absolute", top: 0, left: `clamp(22px, calc(${endPct}% - 22px), calc(100% - 0px))`, fontSize: 10, color: C.quiz, fontFamily: FONT_MONO, whiteSpace: "nowrap", pointerEvents: "none" }}>
            {fmt(end)}
          </div>
        )}

        {/* La barra principal (clicable para seek) */}
        <div ref={barRef} onMouseDown={beginSeek} onTouchStart={beginSeek}
          style={{ position: "relative", height: 32, background: C.paper2, border: `1px solid ${C.line}`, borderRadius: 6, cursor: "crosshair", overflow: "visible" }}>

          {/* Región del fragmento */}
          {start != null && startPct != null && endPct != null && (
            <div style={{
              position: "absolute", top: 3, bottom: 3,
              left: `${startPct}%`, width: `${Math.max(0, endPct - startPct)}%`,
              background: "rgba(47,111,184,0.18)", border: "1px solid rgba(47,111,184,0.4)", borderRadius: 3, pointerEvents: "none",
            }} />
          )}

          {/* Zona fuera del fragmento (oscurecida) */}
          {start != null && startPct != null && startPct > 0 && (
            <div style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: `${startPct}%`, background: "rgba(26,25,21,0.07)", borderRadius: "6px 0 0 6px", pointerEvents: "none" }} />
          )}
          {end != null && endPct != null && endPct < 100 && (
            <div style={{ position: "absolute", top: 0, bottom: 0, left: `${endPct}%`, right: 0, background: "rgba(26,25,21,0.07)", borderRadius: "0 6px 6px 0", pointerEvents: "none" }} />
          )}

          {/* Playhead */}
          <div style={{
            position: "absolute", top: -3, bottom: -3,
            left: `${playheadPct}%`, width: 2, marginLeft: -1,
            background: C.fnT, borderRadius: 1, pointerEvents: "none", zIndex: 4,
          }}>
            <div style={{ position: "absolute", top: 0, left: -3, width: 8, height: 8, borderRadius: "50%", background: C.fnT }} />
          </div>

          {/* Handle izquierdo */}
          {start != null && startPct != null && (
            <div onMouseDown={(e) => beginDrag(e, "start")} onTouchStart={(e) => beginDrag(e, "start")} style={handleStyle(startPct)}>
              <span style={{ width: 2, height: 14, background: "rgba(255,255,255,0.7)", borderRadius: 1, display: "block" }} />
            </div>
          )}
          {/* Handle derecho */}
          {end != null && endPct != null && (
            <div onMouseDown={(e) => beginDrag(e, "end")} onTouchStart={(e) => beginDrag(e, "end")} style={handleStyle(endPct)}>
              <span style={{ width: 2, height: 14, background: "rgba(255,255,255,0.7)", borderRadius: 1, display: "block" }} />
            </div>
          )}
        </div>
      </div>

      {/* Inputs numéricos (solo cuando hay fragmento) */}
      {start != null && end != null && (
        <div style={{ ...S.row, gap: 8, marginBottom: 10, alignItems: "flex-end" }}>
          <div style={{ flex: 1 }}>
            <label style={{ ...S.label, fontSize: 11, marginBottom: 3 }}>Inicio (s)</label>
            <input type="number" min={0} max={end - 0.5} step={0.1}
              style={{ ...S.input, fontFamily: FONT_MONO, fontSize: 13 }}
              value={start}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (!isNaN(v)) onChange({ start: Math.max(0, Math.min(v, end - 0.5)), end });
              }} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ ...S.label, fontSize: 11, marginBottom: 3 }}>Fin (s)</label>
            <input type="number" min={start + 0.5} max={totalDuration} step={0.1}
              style={{ ...S.input, fontFamily: FONT_MONO, fontSize: 13 }}
              value={end}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (!isNaN(v)) onChange({ start, end: Math.max(start + 0.5, Math.min(v, totalDuration)) });
              }} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ ...S.label, fontSize: 11, marginBottom: 3 }}>Duración</label>
            <div style={{ ...S.input, fontFamily: FONT_MONO, fontSize: 13, background: C.paper2, color: C.ink2, display: "flex", alignItems: "center" }}>
              {fmt(Math.max(0, end - start))}
            </div>
          </div>
        </div>
      )}

      {/* Botón quitar fragmento */}
      {start !== null && (
        <button type="button" onClick={onClear}
          style={{ ...S.btn, width: "100%", fontSize: 12, color: C.muted, padding: "6px 10px" }}>
          Usar audio completo
        </button>
      )}
    </div>
  );
}

// Compara props "estructurales" de WaveformDisplay. Ignora `time` y los
// callbacks: el canvas redibuja en su propio bucle rAF leyendo timeRef, así que
// un cambio de tiempo (hasta ~10 fps de React durante la reproducción) no
// necesita re-render. Memoizar evita que el árbol se repinte 10 veces/seg y
// elimina los tirones de la onda y de la banda de respuestas en vivo.
interface WaveformDisplayProps {
  time: number;
  timeRef?: { current: number } | null;
  duration: number;
  waveformDuration?: number;
  allIntervals: Iv[];
  exerciseId: string | number;
  waveformData: number[] | null;
  colorByFn: ColorMap;
  questionRegion?: QuestionRegion | null;
  answerBand?: boolean;
  selectedIvId?: string | null;
  onBandPointerDown?: ((e: any, clientX: number, rect: DOMRect) => void) | null;
  pressingRef?: { current: Pressing | null } | null;
  hintIntervals?: Iv[];
  paintFn?: string | null;
  onPaintCommit?: ((start: number, end: number) => void) | null;
  onScrubBegin: () => void;
  onScrubTo: (t: number) => void;
  onScrubEnd: () => void;
}

function waveformPropsEqual(a: WaveformDisplayProps, b: WaveformDisplayProps) {
  return a.allIntervals === b.allIntervals
    && a.duration === b.duration
    && a.waveformDuration === b.waveformDuration
    && a.exerciseId === b.exerciseId
    && a.waveformData === b.waveformData
    && a.colorByFn === b.colorByFn
    && a.answerBand === b.answerBand
    && a.selectedIvId === b.selectedIvId
    && a.hintIntervals === b.hintIntervals
    && a.paintFn === b.paintFn
    && a.questionRegion === b.questionRegion;
  // pressing ya no se comprueba: el canvas lo lee de pressingRef (síncrono),
  // así WaveformDisplay no se re-renderiza al pisar/soltar un botón.
}

// Canvas con forma de onda + cursor central + intervalos coloreados
export const WaveformDisplay = React.memo(function WaveformDisplay({
  time, timeRef: timeRefProp, duration, waveformDuration,
  allIntervals, exerciseId, waveformData,
  colorByFn, questionRegion, answerBand = false,
  selectedIvId = null, onBandPointerDown = null,
  pressingRef: pressingRefProp = null,
  hintIntervals = [],
  paintFn = null, onPaintCommit = null,
  onScrubBegin, onScrubTo, onScrubEnd,
}: WaveformDisplayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const paintPreviewRef = useRef<{ fn: string; start: number; end: number } | null>(null);   // mientras se pinta
  const waveData  = useMemo(
    // Si `duration` es undefined/NaN (p. ej. ejercicio sin audio aún), Math.ceil
    // da NaN y `new Array(NaN)` lanzaría "Invalid array length". El `|| 0` lo
    // neutraliza y Math.max garantiza el mínimo de 400 muestras.
    () => waveformData || generateWaveform((exerciseId as number) * 13 + 997, Math.max(400, Math.ceil(duration * 30) || 0)),
    [waveformData, exerciseId, duration]
  );
  const stateRef = useRef<any>({});
  Object.assign(stateRef.current, {
    time, timeRef: timeRefProp, allIntervals, waveData, duration, waveformDuration,
    colorByFn, questionRegion, answerBand, selectedIvId, onBandPointerDown,
    pressingRef: pressingRefProp, hintIntervals, paintFn, onPaintCommit,
    onScrubBegin, onScrubTo, onScrubEnd,
  });

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const NUM_BARS = 120;
    const secPerBar = VISIBLE_SECS / NUM_BARS;
    const halfBars  = NUM_BARS / 2;
    const BAND_H = IV_BAND_H, BAND_GAP = IV_BAND_GAP;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width  = Math.max(1, Math.floor(rect.width  * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      canvas.getContext("2d")!.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
    if (ro) ro.observe(canvas);
    window.addEventListener("resize", resize);

    let rafId: number;
    const FRAME_MS = 1000 / 75;          // cap a 75 fps
    let lastFrameTime = -FRAME_MS;       // garantiza que el primer frame siempre dibuja
    const ctx = canvas.getContext("2d")!;
    const drawPill = (x: number, y: number, w: number, h: number) => {
      if (typeof ctx.roundRect === "function") {
        const r = Math.min(w, h) / 2;
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, r);
        ctx.fill();
      } else {
        ctx.fillRect(x, y, w, h);
      }
    };

    // Dibuja un glifo de cifrado { d, pre, strike } centrado verticalmente en cy,
    // con su borde izquierdo en x. Devuelve el ancho dibujado. fs = font size.
    const drawGlyph = (glyph: Glyph | null, x: number, cy: number, fs: number) => {
      if (!glyph) return 0;
      ctx.font = `700 ${fs}px ${FONT_MONO}`;
      ctx.textAlign = "left"; ctx.textBaseline = "middle";
      let gx = x;
      if (glyph.pre) { ctx.fillText(glyph.pre, gx, cy); gx += ctx.measureText(glyph.pre).width + 0.5; }
      const dw = ctx.measureText(glyph.d).width;
      ctx.fillText(glyph.d, gx, cy);
      if (glyph.strike) {
        ctx.save();
        ctx.strokeStyle = ctx.fillStyle;
        ctx.lineWidth = Math.max(0.8, fs / 9);
        ctx.beginPath(); ctx.moveTo(gx - 0.5, cy + fs * 0.18); ctx.lineTo(gx + dw + 0.5, cy - fs * 0.18); ctx.stroke();
        ctx.restore();
      }
      return (gx - x) + dw;
    };

    const draw = (ts: number = 0) => {
      if (ts - lastFrameTime < FRAME_MS) { rafId = requestAnimationFrame(draw); return; }
      lastFrameTime = ts;
      const { time: tState, timeRef: tRef, allIntervals: ivsBase, waveData: wd, duration: dur, waveformDuration: wDur, colorByFn: cmap, questionRegion: qr, answerBand: ab, selectedIvId: selId, pressingRef: pRef, hintIntervals: hints } = stateRef.current;
      const t = tRef?.current ?? tState;
      // pressingRef puede tener tres estados:
      //   null              → sin marcado
      //   { fn, start }     → activo, intervalo crece en tiempo real
      //   { fn, start, end }→ "congelado": tecla soltada, esperando que React
      //                       confirme el intervalo en ivsBase (evita el salto
      //                       de 1-2 frames entre "en vivo" y "comprometido").
      const pr = pRef?.current ?? null;
      let ivsForDraw = ivsBase;
      if (pr && pr.end != null) {
        // Estado congelado: comprobamos si React ya puso el intervalo en ivsBase
        if (ivsBase.some((iv: any) => iv.fn === pr.fn && iv.start === pr.start)) {
          pRef.current = null;          // React al día → limpiamos
        } else {
          ivsForDraw = [...ivsBase, { id: "tmp-commit", fn: pr.fn, start: pr.start, end: pr.end }];
        }
      }
      const ivs = (pr && pr.end == null)
        ? [...ivsForDraw, { id: "live", fn: pr.fn, start: pr.start, end: Math.min(t, dur) }]
        : ivsForDraw;
      const rect = canvas.getBoundingClientRect();
      const W = rect.width, H = rect.height;
      const waveAreaH = ab ? H - (BAND_H + BAND_GAP) : H;
      const mid = waveAreaH / 2;
      const barW = W / NUM_BARS, drawW = barW * 0.7, offsetX = barW * 0.15;
      const pxPerSec = W / VISIBLE_SECS;
      const centerK  = Math.floor(t / secPerBar);
      const kMin = centerK - halfBars - 1, kMax = centerK + halfBars + 1;
      // wDur: duración real del audio; dur: duración del ejercicio (para eventos/bloques)
      const effectiveWDur = wDur || dur;

      ctx.fillStyle = C.paper2;
      ctx.fillRect(0, 0, W, H);

      for (let k = kMin; k <= kMax; k++) {
        const barTime = k * secPerBar;
        const xLeft   = (barTime - t) * pxPerSec + W / 2 + offsetX;
        if (barTime < 0 || barTime > dur) {
          ctx.fillStyle = "rgba(26,25,21,0.12)";
          ctx.fillRect(xLeft, mid - 2, drawW, 4);
          continue;
        }
        const si = Math.min(Math.round((barTime / effectiveWDur) * (wd.length - 1)), wd.length - 1);
        const h  = Math.max(1.5, wd[si] * (mid - 4));
        let fn = null;
        for (let j = 0; j < ivs.length; j++) {
          const iv = ivs[j];
          if (barTime >= iv.start && barTime < iv.end) { fn = iv.fn; break; }
        }
        ctx.fillStyle = (fn && cmap && cmap[fn]) ? cmap[fn] : "rgba(26,25,21,0.28)";
        drawPill(xLeft, mid - h, drawW, h * 2);
      }

      // Banda de respuesta: bloques coloreados alineados con la onda, en la misma
      // coordenada de scroll (cursor centrado), de modo que se mueven con ella.
      if (ab) {
        const bandTop = waveAreaH + BAND_GAP;
        // Fondo de la banda: esquinas superiores planas (pegadas a la onda),
        // esquinas inferiores redondeadas al mismo radio que el canvas (8px).
        ctx.fillStyle = "rgba(26,25,21,0.06)";
        if (typeof ctx.roundRect === "function") {
          ctx.beginPath(); ctx.roundRect(0, bandTop, W, BAND_H, [0, 0, 8, 8]); ctx.fill();
        } else {
          ctx.fillRect(0, bandTop, W, BAND_H);
        }

        // Pistas: misma forma que los bloques de respuesta (drawPill, altura
        // completa BAND_H, mismo radio). Solo difieren en color (más oscuras).
        if (hints && hints.length) {
          const GAP = 2.5; // separación horizontal entre bloques
          for (let j = 0; j < hints.length; j++) {
            const hv = hints[j];
            const hx1 = (hv.start - t) * pxPerSec + W / 2 + GAP;
            const hx2 = (Math.min(hv.end, dur) - t) * pxPerSec + W / 2 - GAP;
            if (hx2 <= 0 || hx1 >= W) continue;
            const cx1 = Math.max(0, hx1), cx2 = Math.min(W, hx2), bw = cx2 - cx1;
            if (bw < 1) continue;
            ctx.fillStyle = "rgba(26,25,21,0.16)";
            drawPill(cx1, bandTop, bw, BAND_H);
          }
        }

        const nowMs = (typeof performance !== "undefined" ? performance.now() : Date.now());
        const ANIM_MS = 260;
        ctx.font = `700 10px ${FONT_MONO}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        for (let j = 0; j < ivs.length; j++) {
          const iv = ivs[j];
          const x1 = (iv.start - t) * pxPerSec + W / 2;
          const x2 = (Math.min(iv.end, dur) - t) * pxPerSec + W / 2;
          if (x2 <= 0 || x1 >= W) continue;

          // Relleno animado (snap sobre pista): revela el bloque de izquierda a
          // derecha y sube la opacidad con easeOutCubic. Sin _anim → instantáneo.
          let animAlpha = 1, rightAbs = x2;
          if (iv._anim) {
            const prog = Math.min(1, (nowMs - iv._anim) / ANIM_MS);
            const e = 1 - Math.pow(1 - prog, 3);
            animAlpha = 0.3 + 0.7 * e;
            rightAbs = x1 + (x2 - x1) * e;
          }

          const cx1 = Math.max(0, x1), cx2 = Math.min(W, rightAbs), bw = cx2 - cx1;
          if (bw < 0.5) continue;
          ctx.globalAlpha = (iv.id === "live" ? 0.5 : 1) * animAlpha;
          ctx.fillStyle = (cmap && cmap[iv.fn]) || "rgba(26,25,21,0.4)";
          drawPill(cx1, bandTop, bw, BAND_H);
          // Etiqueta solo cuando el bloque ya está casi/totalmente revelado
          const fullBw = Math.min(W, x2) - Math.max(0, x1);
          if (fullBw > 14 && (!iv._anim || animAlpha > 0.85)) {
            ctx.globalAlpha = iv.id === "live" ? 0.75 : 1;
            ctx.fillStyle = C.paper;
            const cx = (Math.max(0, x1) + Math.min(W, x2)) / 2;
            const cy = bandTop + BAND_H / 2 + 0.5;
            const fg = iv.fig != null ? figureOf(iv.fig) : null;
            if (fg && fg.top) {
              // Romano + cifrado de bajo apilado a la derecha (estilo análisis).
              // El conjunto se centra: romano a la izquierda, dígitos a la derecha.
              const fs = 9;
              ctx.font = `700 13px ${FONT_MONO}`;
              const romW = ctx.measureText(iv.fn).width;
              const figW = 11;                        // ancho aproximado del bloque de cifra
              const totalW = romW + 1.5 + figW;
              const startX = cx - totalW / 2;
              ctx.textAlign = "left"; ctx.textBaseline = "middle";
              ctx.fillText(iv.fn, startX, cy);
              const fx = startX + romW + 1.5;
              if (fg.bot) {
                drawGlyph(fg.top, fx, cy - 5, fs);
                drawGlyph(fg.bot, fx, cy + 5, fs);
              } else {
                drawGlyph(fg.top, fx, cy, fs);
              }
            } else {
              ctx.textAlign = "center"; ctx.textBaseline = "middle";
              ctx.font = `700 13px ${FONT_MONO}`;
              ctx.fillText(iv.fn, cx, cy);
            }
          }
          ctx.globalAlpha = 1;
        }
        ctx.textAlign = "start";
        ctx.textBaseline = "alphabetic";

        // Preview del pincel (modo colorear): rectángulo translúcido en curso.
        const pp = paintPreviewRef.current;
        if (pp) {
          const px1 = (pp.start - t) * pxPerSec + W / 2;
          const px2 = (Math.min(pp.end, dur) - t) * pxPerSec + W / 2;
          const a = Math.max(0, px1), bX = Math.min(W, px2);
          if (bX > a) {
            ctx.save();
            ctx.globalAlpha = 0.55;
            ctx.fillStyle = (cmap && cmap[pp.fn]) || "rgba(26,25,21,0.4)";
            drawPill(a, bandTop, bX - a, BAND_H);
            ctx.restore();
          }
        }

        // Asas del intervalo seleccionado: mismo aspecto que los bloques del
        // esquema (barra blanca redondeada con sombra). Solo visibles si hay
        // selección; ocupan toda la altura de la banda.
        if (selId) {
          const selIv = ivs.find((iv: any) => iv.id === selId);
          if (selIv && selIv.id !== "live") {
            const sx = (selIv.start - t) * pxPerSec + W / 2;
            const ex = (Math.min(selIv.end, dur) - t) * pxPerSec + W / 2;
            const bandTop = waveAreaH + BAND_GAP;
            const hw = SCHEMA_HND_VISUAL_W, hh = BAND_H, hTop = bandTop;
            for (const hx of [sx, ex]) {
              if (hx < -hw || hx > W + hw) continue;
              ctx.save();
              ctx.fillStyle = "rgba(255,255,255,0.92)";
              ctx.shadowColor = "rgba(0,0,0,0.20)";
              ctx.shadowBlur = 4;
              ctx.shadowOffsetY = 1;
              if (typeof ctx.roundRect === "function") {
                ctx.beginPath(); ctx.roundRect(hx - hw / 2, hTop, hw, hh, 5); ctx.fill();
              } else {
                ctx.fillRect(hx - hw / 2, hTop, hw, hh);
              }
              ctx.restore();
            }
          }
        }
      }

      if (qr) {
        const x1 = (qr.start - t) * pxPerSec + W / 2;
        const x2 = (qr.end   - t) * pxPerSec + W / 2;
        if (x2 > 0 && x1 < W) {
          const col = qr.color || C.quiz;
          ctx.fillStyle = col + "30";
          ctx.fillRect(Math.max(0, x1), 0, Math.min(W, x2) - Math.max(0, x1), H);
          ctx.fillStyle = col + "BB";
          if (x1 > 0 && x1 < W) ctx.fillRect(x1 - 1, 0, 2, H);
          if (x2 > 0 && x2 < W) ctx.fillRect(x2 - 1, 0, 2, H);
        }
      }

      ctx.fillStyle = "rgba(26,25,21,0.85)";
      ctx.fillRect(W / 2 - 1, 3, 2, H - 6);

      rafId = requestAnimationFrame(draw);
    };
    draw();  // primer frame síncrono: evita el destello blanco al montar

    return () => { cancelAnimationFrame(rafId); if (ro) ro.disconnect(); window.removeEventListener("resize", resize); };
  }, []);

  const handlePointerDown = (e: any) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();

    // Modo colorear: pintar a mano sobre la onda. Desactiva scroll y selección.
    const st = stateRef.current;
    if (st.paintFn) {
      e.stopPropagation();
      const W = rect.width;
      const tAt = (clientX: number) => {
        const t0 = (st.timeRef?.current ?? st.time);
        return Math.max(0, Math.min(st.duration, t0 + ((clientX - rect.left) - W / 2) * VISIBLE_SECS / W));
      };
      const startT = tAt(e.touches ? e.touches[0].clientX : e.clientX);
      paintPreviewRef.current = { fn: st.paintFn, start: startT, end: startT };
      startPointerDrag(e, {
        onMove: (ev, getX) => {
          const tt = tAt(getX(ev));
          paintPreviewRef.current = { fn: st.paintFn, start: Math.min(startT, tt), end: Math.max(startT, tt) };
        },
        onEnd: () => {
          const p = paintPreviewRef.current;
          paintPreviewRef.current = null;
          if (p && p.end - p.start > 0.05 && st.onPaintCommit) st.onPaintCommit(p.start, p.end);
        },
      });
      return;
    }

    // Detectar si el puntero está en la zona de la banda de respuesta
    const { answerBand: ab, onBandPointerDown: obpd } = stateRef.current;
    if (ab && obpd) {
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      const y = clientY - rect.top;
      if (y >= rect.height - IV_BAND_H - IV_BAND_GAP) {
        e.stopPropagation();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        obpd(e, clientX, rect);
        return;
      }
    }

    let anchorX = 0, anchorTime = 0;
    startPointerDrag(e, {
      onStart: (ev, getX) => { anchorX = getX(ev); anchorTime = stateRef.current.timeRef?.current ?? stateRef.current.time; stateRef.current.onScrubBegin(); },
      onMove:  (ev, getX) => { const delta = (getX(ev) - anchorX) * VISIBLE_SECS / rect.width; stateRef.current.onScrubTo(anchorTime - delta); },
      onEnd:   () => stateRef.current.onScrubEnd(),
    });
  };

  return (
    <canvas ref={canvasRef}
      style={{ display: "block", width: "100%", height: answerBand ? 80 + IV_BAND_GAP + IV_BAND_H : 80, cursor: "crosshair", borderRadius: 8, touchAction: "none", userSelect: "none" }}
      onMouseDown={handlePointerDown}
      onTouchStart={handlePointerDown}
    />
  );
}, waveformPropsEqual);

// ═══ 9. EXERCISE VIEW (sesión interactiva) ══════════════════════════════════

// Barra navegadora: muestra toda la duración del audio, los intervalos
// marcados como bloques de color y el cursor de posición actual.
// Click o arrastre → seek inmediato.
// Barra navegadora de audio: track + fill + thumb circular (estilo tradicional).
// El thumb, el fill y el bloque "en vivo" se posicionan vía rAF leyendo timeRef
// directamente (60 fps), no la `time` de React (throttled ~10 fps): así el
// reproductor se mueve fluido y sin saltitos durante el marcado.
// pressingRef: el mismo ref síncrono de ExerciseView (nunca stale, sin delay de React).
interface AudioScrubberProps {
  timeRef?: { current: number } | null;
  duration: number;
  intervals: Iv[];
  pressingRef: { current: Pressing | null };
  colorByFn: ColorMap;
  onSeek: (t: number) => void;
}

export function AudioScrubber({ timeRef, duration, intervals, pressingRef, colorByFn, onSeek }: AudioScrubberProps) {
  const barRef   = useRef<HTMLDivElement | null>(null);
  const fillRef  = useRef<HTMLDivElement | null>(null);
  const thumbRef = useRef<HTMLDivElement | null>(null);
  const liveRef  = useRef<HTMLDivElement | null>(null);
  const colorRef = useRef(colorByFn); colorRef.current = colorByFn;
  const pct = (t: number) => `${Math.max(0, Math.min(100, (t / duration) * 100))}`;

  const handlePointerDown = (e: any) => {
    const bar = barRef.current;
    if (!bar) return;
    const rect = bar.getBoundingClientRect();
    const getT = (ev: any) => {
      const x = ev.touches ? ev.touches[0].clientX : ev.clientX;
      return Math.max(0, Math.min(duration, ((x - rect.left) / rect.width) * duration));
    };
    startPointerDrag(e, {
      onStart: (ev) => onSeek(getT(ev)),
      onMove:  (ev) => onSeek(getT(ev)),
    });
  };

  // Bucle rAF: actualiza thumb/fill/live directamente sobre el DOM
  useEffect(() => {
    let raf: number;
    const clamp = (t: number) => Math.max(0, Math.min(100, (t / duration) * 100));
    const tick = () => {
      const t = timeRef?.current || 0;
      const p = clamp(t);
      if (fillRef.current)  fillRef.current.style.width = p + "%";
      if (thumbRef.current) thumbRef.current.style.left = p + "%";
      const pr = pressingRef.current, el = liveRef.current;
      if (el) {
        if (pr) {
          const s = clamp(pr.start);
          const w = Math.max(0, clamp(Math.min(t, duration)) - s);
          el.style.opacity = "0.5";
          el.style.left = s + "%";
          el.style.width = w + "%";
          el.style.background = (colorRef.current && colorRef.current[pr.fn]) || "rgba(26,25,21,0.3)";
        } else {
          el.style.opacity = "0";
        }
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [duration, timeRef]);

  const TRACK_H = 8;   // altura del track (px)
  const THUMB_D = 16;  // diámetro del thumb (px)

  return (
    <div ref={barRef}
      onMouseDown={handlePointerDown} onTouchStart={handlePointerDown}
      style={{ userSelect: "none", touchAction: "none", cursor: "pointer" }}>

      {/* ── Track + thumb ──────────────────────────────────────────── */}
      <div style={{ position: "relative", height: THUMB_D + 4, display: "flex", alignItems: "center" }}>
        {/* Track */}
        <div style={{ position: "absolute", left: 0, right: 0,
          height: TRACK_H, borderRadius: TRACK_H / 2,
          background: "rgba(26,25,21,0.08)", overflow: "hidden" }}>
          {/* Fill (tiempo transcurrido) — width exclusivamente vía rAF;
              no se incluye en JSX para que React no la resetee en re-renders */}
          <div ref={fillRef} style={{ position: "absolute", top: 0, bottom: 0, left: 0,
            background: "rgba(26,25,21,0.18)", borderRadius: TRACK_H / 2 }} />
          {/* Intervalos marcados por el alumno */}
          {intervals.map((iv) => {
            const color = (colorByFn && colorByFn[iv.fn]) || "rgba(26,25,21,0.3)";
            return (
              <div key={iv.id} style={{
                position: "absolute", top: 0, bottom: 0,
                left: `${pct(iv.start)}%`,
                width: `${pct(Math.max(0, Math.min(iv.end, duration) - iv.start))}%`,
                background: color, opacity: 0.85, borderRadius: 3,
              }} />
            );
          })}
          {/* Bloque "en vivo" — left/width/opacity exclusivamente vía rAF */}
          <div ref={liveRef} style={{ position: "absolute", top: 0, bottom: 0,
            opacity: 0, borderRadius: 3 }} />
        </div>
        {/* Thumb — left exclusivamente vía rAF */}
        <div ref={thumbRef} style={{
          position: "absolute",
          transform: "translateX(-50%)",
          width: THUMB_D, height: THUMB_D,
          borderRadius: "50%",
          background: C.paper,
          border: `2px solid rgba(26,25,21,0.75)`,
          boxShadow: "0 1px 4px rgba(0,0,0,0.22)",
          pointerEvents: "none",
          zIndex: 1,
        }} />
      </div>
    </div>
  );
}

// Compara props de FunctionButtons. Ignora la identidad de onDown/onUp (los
// handlers se recrean en cada render pero su comportamiento solo depende de la
// categoría activa, cuyos `buttons` cambian de referencia al cambiar de tab).
// Así la botonera no se repinta con cada tick de tiempo (~10 fps).
interface FunctionButtonsProps {
  buttons: FnBtn[];
  pressing: Pressing | null;
  onDown: (id: string) => void;
  onUp: (id: string) => void;
  twoRows?: boolean;
  hideNames?: boolean;
  paintFn?: string | null;
}

function fnButtonsEqual(a: FunctionButtonsProps, b: FunctionButtonsProps) {
  return a.buttons === b.buttons && a.pressing === b.pressing && a.twoRows === b.twoRows
    && a.hideNames === b.hideNames && a.paintFn === b.paintFn;
}

// Renderiza un cifrado (item de FIG_GROUPS) como glifos apilados, con soporte
// de prefijo (+/♭) y dígito tachado. Para botones del banner de edición.
interface FigureLabelProps { item?: { top?: Glyph | null; bot?: Glyph | null } | null; color?: string; size?: number; }
export function FigureLabel({ item, color = "currentColor", size = 13 }: FigureLabelProps) {
  if (!item || (!item.top && !item.bot)) return <span style={{ color, fontSize: size }}>—</span>;
  const Glyph = ({ glyph }: { glyph?: Glyph | null }) => {
    if (!glyph) return null;
    return (
      <span style={{ display: "inline-flex", alignItems: "center", lineHeight: 1 }}>
        {glyph.pre && <span style={{ fontSize: size * 0.82 }}>{glyph.pre}</span>}
        <span style={{ position: "relative", display: "inline-block" }}>
          {glyph.d}
          {glyph.strike && <span style={{ position: "absolute", left: -1, right: -1, top: "48%", height: Math.max(1, size / 11), background: color, transform: "rotate(-18deg)" }} />}
        </span>
      </span>
    );
  };
  return (
    <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", justifyContent: "center", lineHeight: 0.95, fontFamily: FONT_MONO, fontWeight: 700, fontSize: size, color }}>
      {item.top && <Glyph glyph={item.top} />}
      {item.bot && <Glyph glyph={item.bot} />}
    </span>
  );
}

// Botonera de funciones (T/S/D…) pulsables con tecla.
// hideNames: oculta el nombre bajo el botón (redundante en grados).
// paintFn: id del botón activo como pincel (modo colorear) → se resalta.
// twoRows: reparte los botones en exactamente 2 filas que ocupan todo el ancho
//   (cada fila con flex:1), aunque los botones no queden alineados verticalmente.
export const FunctionButtons = React.memo(function FunctionButtons({ buttons, pressing, onDown, onUp, twoRows = false, hideNames = false, paintFn = null }: FunctionButtonsProps) {
  const isMobile = useIsMobile();

  const renderBtn = (b: FnBtn) => {
    const isActive = pressing?.fn === b.id || paintFn === b.id;
    return (
      <button key={b.id}
        onMouseDown={(e) => { e.stopPropagation(); onDown(b.id); }}
        onMouseUp  ={() => onUp(b.id)}
        onMouseLeave={() => { if (pressing?.fn === b.id) onUp(b.id); }}
        onTouchStart={(e) => { e.preventDefault(); e.stopPropagation(); onDown(b.id); }}
        onTouchEnd  ={(e) => { e.preventDefault(); onUp(b.id); }}
        style={{
          flex: 1, minWidth: 0,
          background: isActive ? b.color : C.paper,
          border:     `1.5px solid ${isActive ? b.color : C.line}`,
          color:      isActive ? C.paper : b.color,
          borderRadius: 16, padding: isMobile ? "20px 8px" : "18px 8px", cursor: "pointer",
          display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
          transition: "background .08s, color .08s, border-color .08s, transform .08s, box-shadow .08s",
          transform: isActive ? "scale(0.97)" : "scale(1)",
          boxShadow: isActive ? `0 0 0 4px ${b.color}26` : "none",
          userSelect: "none", touchAction: "none", WebkitTapHighlightColor: "transparent",
        }}>
        <span style={{ fontSize: isMobile ? 32 : 30, fontWeight: 800, fontFamily: FONT_MONO, letterSpacing: -1, color: isActive ? C.paper : b.color, lineHeight: 1 }}>{b.id}</span>
        {!hideNames && <span style={{ fontSize: 12.5, fontWeight: 500, color: isActive ? C.paper : C.ink2 }}>{b.name}</span>}
        {!isMobile && <span style={{ fontSize: 10, fontFamily: FONT_MONO, color: isActive ? C.paper : C.muted, opacity: 0.85, marginTop: 1 }}>tecla {(b.key ?? "").toUpperCase()}</span>}
      </button>
    );
  };

  if (twoRows) {
    const half = Math.ceil(buttons.length / 2);
    const row1 = buttons.slice(0, half), row2 = buttons.slice(half);
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 4 }}>
        <div style={{ display: "flex", gap: 10 }}>{row1.map(renderBtn)}</div>
        <div style={{ display: "flex", gap: 10 }}>{row2.map(renderBtn)}</div>
      </div>
    );
  }
  const cols = Math.min(buttons.length, 3);
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 10, marginBottom: 4 }}>
      {buttons.map(renderBtn)}
    </div>
  );
}, fnButtonsEqual);

