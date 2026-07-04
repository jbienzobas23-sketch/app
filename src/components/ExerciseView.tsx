// ═══ EXERCISEVIEW (SESIÓN INTERACTIVA) ═══════════════════════════════════════
// Vista de sesión del modelo interactivo + RepeatManagerModal. Extraídas de
// App.jsx (Fase 2) sin cambiar su lógica.
import { useState, useEffect, useRef, useMemo, type ReactNode } from "react";
import type { Exercise } from "../lib/types.js";
import { C, F, S, FONT_SANS } from "../theme/tokens.js";
import { uid } from "../lib/ids.js";
import { fmtClock } from "../lib/time.js";
import { FIG_GROUPS, isTriadFig, quadGroupsForDegree } from "../lib/figures.js";
import type { FigItem } from "../lib/figures.js";
import { SCHEMA_MIN_DUR } from "../lib/schema.js";
import { resolveOverlap } from "../lib/scoring.js";
import { answerFor } from "../lib/domain.js";
import { startPointerDrag } from "../lib/pointer.js";
import { VISIBLE_SECS, EMPTY_IVS } from "../lib/sessionConstants.js";
import { DEFAULT_CATEGORY } from "../seed.js";
import { useAudioPlayer } from "../hooks/useAudioPlayer.js";
import { ModalShell, CircleButton, AudioLoadingOverlay, SessionHeader, SessionHint, StickyActionBar, BarSubmitButton } from "./primitives.jsx";
import { WaveformDisplay, AudioScrubber, FigureLabel, FunctionButtons } from "./session.js";

// ── Tipos locales de la sesión interactiva ───────────────────────────────────
// Intervalo marcado por el alumno/profesor sobre la onda.
interface IV { id: string; fn: string; start: number; end: number; fig?: string | null; _anim?: number; }
// Pulsación en curso (función + inicio; end cuando se congela).
interface Pressing { fn: string; start: number; end?: number | null; }
// Botón de función (grado) y categoría con sus botones garantizados.
interface FnButton { id: string; name?: string; color?: string; key?: string; }
interface ExCategory { id: string; name?: string; hasFigures?: boolean; buttons: FnButton[]; }

type SharedAudioPlayer = ReturnType<typeof useAudioPlayer> & { waveformData?: number[] | null };

interface ExerciseSubmit {
  entries: Array<{ categoryId: string; intervals: Array<{ fn: string; start: number; end: number }> }>;
  currentCategoryId: string;
}

// Borrador por categoría — mismo formato que consume/produce esta vista y que
// MultiPartSessionView (F4, T4.3) eleva a drafts[partId][modelId] para que
// cambiar de parte (o de modelo en un híbrido) nunca destruya trabajo.
export type InteractivoDraft = Record<string, IV[]>;

interface ExerciseViewProps {
  exercise: Exercise;
  mode: string;
  onSubmit: (result: ExerciseSubmit) => void;
  onBack: () => void;
  modelToggleNode?: ReactNode;
  sharedAudioPlayer?: SharedAudioPlayer | null;
  initialDraft?: InteractivoDraft | null;
  onDraftChange?: (draft: InteractivoDraft) => void;
}

export function ExerciseView({ exercise, mode, onSubmit, onBack, modelToggleNode = null, sharedAudioPlayer = null, initialDraft = null, onDraftChange }: ExerciseViewProps) {
  const dur          = exercise.duration as number;
  const exCategories = useMemo(() => exercise.categories ?? [], [exercise.categories]);
  const initialCategoryId = useMemo(() => {
    if (mode === "record") {
      const empty = exCategories.find((m) => answerFor(exercise, m.id).length === 0);
      if (empty) return empty.id;
    }
    return exCategories[0]?.id || DEFAULT_CATEGORY.id;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exercise.id]);

  const [currentCategoryId, setCurrentCategoryId] = useState(initialCategoryId);
  // Categoría activa con `buttons` garantizado (la sesión siempre opera sobre una).
  // Memoizada para que `colorByFn` (que la usa como dependencia) no se recree en cada render.
  const exCategory = useMemo(
    () => ((exCategories.find((m) => m.id === currentCategoryId) || exCategories[0]) ?? { id: "", buttons: [] }) as ExCategory,
    [exCategories, currentCategoryId],
  );
  const colorByFn  = useMemo(() => {
    const m: Record<string, string> = {};
    exCategory.buttons.forEach((b) => { m[b.id] = b.color ?? C.ink; });
    return m;
  }, [exCategory]);

  const [intervalsByCategory, setIntervalsByCategory] = useState<Record<string, IV[]>>(() => initialDraft || {});
  const [pressing,     setPressing]     = useState<Pressing | null>(null);
  const [selected,     setSelected]     = useState<string | null>(null);
  const [paintFn,      setPaintFn]      = useState<string | null>(null);   // grado activo como pincel (modo colorear)
  // Refs siempre-frescos para leer desde handlers/timers sin closures stale.
  const selectedRef = useRef<string | null>(null); selectedRef.current = selected;
  const paintFnRef  = useRef<string | null>(null); paintFnRef.current  = paintFn;
  const playingRef2 = useRef(false);
  const [localWaveformData, setLocalWaveformData] = useState<number[] | null>(exercise.waveformData || null);
  const waveformData = sharedAudioPlayer?.waveformData ?? localWaveformData;

  // Cuando hay reproductor compartido, se omite la carga propia de audio
  const localOnWaveform = (!sharedAudioPlayer && !exercise.waveformData) ? (wd: number[]) => setLocalWaveformData(wd) : null;
  const localPlayer = useAudioPlayer(
    sharedAudioPlayer ? { id: exercise.id, duration: exercise.duration, audioUrl: null } : exercise,
    { onWaveform: localOnWaveform }
  );
  const {
    time, playing, audioReady, audioError, hasAudio,
    timeRef, togglePlay, seekTo, scrubBegin, scrubTo, scrubEnd, audioDuration,
  } = sharedAudioPlayer || localPlayer;
  playingRef2.current = playing;

  // Memoizado: referencia estable cuando el contenido no cambia. Evita que
  // WaveformDisplay (React.memo) se re-renderice en cada tick de tiempo solo
  // porque `|| []` crea un array nuevo cada render.
  const intervals = useMemo(
    () => intervalsByCategory[currentCategoryId] || EMPTY_IVS,
    [intervalsByCategory, currentCategoryId]
  );
  // Pistas (clave del profesor) memoizadas con referencia estable.
  const hintIntervals = useMemo(
    () => (mode === "student" && exercise.showHint ? (answerFor(exercise, currentCategoryId) || EMPTY_IVS) : EMPTY_IVS),
    [mode, exercise, currentCategoryId]
  );
  const setIntervals = (updater: IV[] | ((cur: IV[]) => IV[])) => setIntervalsByCategory((prev) => {
    const cur  = prev[currentCategoryId] || [];
    const next = typeof updater === "function" ? updater(cur) : updater;
    return { ...prev, [currentCategoryId]: next };
  });

  useEffect(() => { setIntervalsByCategory(initialDraft || {}); setPressing(null); setSelected(null); setPaintFn(null); }, [exercise.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // Eleva el borrador al padre (MultiPartSessionView, F4/T4.3) en cada cambio,
  // para que saltar de parte o de modelo dentro de un híbrido no pierda nada.
  useEffect(() => { onDraftChange?.(intervalsByCategory); }, [intervalsByCategory]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cambio de categoría: cierra el intervalo en curso de la actual
  const switchCategory = (newId: string) => {
    if (newId === currentCategoryId) return;
    setPaintFn(null);
    if (pressing) {
      const end = timeRef.current;
      if (end - pressing.start > 0.1) {
        setIntervalsByCategory((prev) => {
          const cur = prev[currentCategoryId] || [];
          return { ...prev, [currentCategoryId]: [...cur, { id: uid("iv"), fn: pressing.fn, start: pressing.start, end }] };
        });
      }
      setPressing(null);
    }
    setSelected(null);
    setCurrentCategoryId(newId);
  };

  // Helper para añadir un intervalo nuevo (cerrando el actual).
  // opts.anim marca el intervalo con un timestamp para animar su aparición
  // (relleno) en el canvas — se usa al hacer snap sobre una pista.
  const commitInterval = (fn: string, start: number, end: number, opts?: { fig?: string | null; anim?: boolean }) => {
    const newIv: IV = { id: uid("iv"), fn, start, end };
    if (opts?.fig != null) newIv.fig = opts.fig;
    if (opts?.anim) newIv._anim = (typeof performance !== "undefined" ? performance.now() : Date.now());
    setIntervals((prev) => [...(resolveOverlap(prev, newIv) as IV[]), newIv]);
  };

  // Ref siempre-fresco para detecting si el tiempo actual cae sobre una pista.
  const snapHintRef = useRef<(t: number) => IV | null>(() => null);
  snapHintRef.current = (t: number) => {
    if (!exercise.showHint) return null;
    return (answerFor(exercise, currentCategoryId) as IV[]).find((h) => t >= h.start && t <= h.end) || null;
  };

  // Ref síncrono del estado de pressing. Se actualiza ANTES de llamar a setState,
  // por lo que el canvas lo lee sin esperar el ciclo de re-render de React (~16 ms).
  // Esto elimina el salto visual de 1 frame al pisar o soltar un botón.
  const pressingRef = useRef<Pressing | null>(null);

  // Teclado (mantén pulsada la tecla mientras suena)
  const togglePlayRef = useRef(togglePlay);
  useEffect(() => { togglePlayRef.current = togglePlay; });
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const btn = exCategory.buttons.find((b) => b.key === e.key.toLowerCase());
      if (btn) {
        // En modo colorear, la tecla cambia el pincel; con bloque seleccionado, su grado.
        if (paintFnRef.current) { setPaintFn(btn.id); return; }
        if (selectedRef.current) { const id = selectedRef.current; setIntervals((prev) => prev.map((iv) => iv.id === id ? { ...iv, fn: btn.id } : iv)); return; }
        const now  = timeRef.current;
        const hint = snapHintRef.current?.(now);
        if (hint) {
          const p = pressingRef.current;
          pressingRef.current = null; setPressing(null);
          if (p && now - p.start > 0.1) commitInterval(p.fn, p.start, now);
          commitInterval(btn.id, hint.start, hint.end, { anim: true, fig: hint.fig });
        } else {
          const p = pressingRef.current;
          if (p && p.fn === btn.id) return;       // ya pulsado
          const newP = { fn: btn.id, start: now };
          pressingRef.current = newP; setPressing(newP);
          if (p && now - p.start > 0.1) commitInterval(p.fn, p.start, now);
        }
      }
      if (e.key === " ") { e.preventDefault(); togglePlayRef.current(); }
    };
    const up = (e: KeyboardEvent) => {
      const btn = exCategory.buttons.find((b) => b.key === e.key.toLowerCase());
      if (!btn) return;
      const p = pressingRef.current;
      if (!p || p.fn !== btn.id || p.end != null) return;
      const end = timeRef.current;
      setPressing(null);
      if (end - p.start > 0.1) {
        pressingRef.current = { fn: p.fn, start: p.start, end }; // congelar
        commitInterval(btn.id, p.start, end);
      } else {
        pressingRef.current = null;
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup",   up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exCategory]);

  // Entrar/salir del modo colorear (desde el botón del banner inferior).
  // Al entrar: pincel = grado actualmente activo (o el primero); si reproduce, pausa.
  const togglePaintMode = () => {
    if (paintFnRef.current) { setPaintFn(null); return; }
    pressingRef.current = null; setPressing(null);
    if (playingRef2.current) togglePlay();   // detener música al entrar en colorear
    setPaintFn(exCategory.buttons[0]?.id || null);
  };

  const handleFnDown = (fn: string) => {
    // En modo colorear, pulsar un grado cambia el pincel (no marca).
    if (paintFnRef.current) { setPaintFn(fn); return; }
    // Con un bloque seleccionado, los botones lo EDITAN (no marcan en vivo):
    // el cambio de grado se aplica al soltar (tap). No iniciamos pressing.
    if (selectedRef.current) return;
    const now  = timeRef.current;
    const hint = snapHintRef.current?.(now);
    if (hint) {
      const p = pressingRef.current;
      pressingRef.current = null; setPressing(null);
      if (p && now - p.start > 0.1) commitInterval(p.fn, p.start, now);
      commitInterval(fn, hint.start, hint.end, { anim: true, fig: hint.fig });
      return;
    }
    const p = pressingRef.current;
    if (p && p.fn === fn) return;
    const newP = { fn, start: now };
    pressingRef.current = newP; setPressing(newP);
    if (p && now - p.start > 0.1) commitInterval(p.fn, p.start, now);
  };
  const handleFnUp = (fn: string) => {
    if (paintFnRef.current) return;            // en colorear, el down ya cambió el pincel
    // Tap con un bloque seleccionado → cambiar su grado.
    if (selectedRef.current) {
      const id = selectedRef.current;
      setIntervals((prev) => prev.map((iv) => iv.id === id ? { ...iv, fn } : iv));
      return;
    }
    const p = pressingRef.current;
    if (!p || p.fn !== fn || p.end != null) return;
    const end = timeRef.current;
    setPressing(null);
    if (end - p.start > 0.1) {
      pressingRef.current = { fn: p.fn, start: p.start, end }; // congelar
      commitInterval(fn, p.start, end);
    } else {
      pressingRef.current = null;
    }
  };
  // Commit desde el pincel (modo colorear): crea un bloque del grado actual.
  const handlePaintCommit = (t0: number, t1: number) => {
    if (paintFnRef.current) commitInterval(paintFnRef.current, t0, t1);
  };

  const handleSubmit = () => {
    let byCategory = intervalsByCategory;
    const p = pressingRef.current;
    if (p && p.end == null) {   // solo si activo, no si congelado
      const end = timeRef.current;
      const cur = byCategory[currentCategoryId] || [];
      const newIv: IV = { id: uid("iv"), fn: p.fn, start: p.start, end };
      byCategory = { ...byCategory, [currentCategoryId]: [...(resolveOverlap(cur, newIv) as IV[]), newIv] };
    }
    const touched = Object.entries(byCategory) as Array<[string, IV[]]>;
    const source: Array<[string, IV[]]> = touched.length > 0 ? touched : [[currentCategoryId, []]];
    onSubmit({
      entries: source.map(([categoryId, ivs]) => ({
        categoryId,
        intervals: ivs.map(({ fn, start, end }) => ({ fn, start, end })),
      })),
      currentCategoryId,
    });
  };

  const deleteSelected = () => { setIntervals((p) => p.filter((iv) => iv.id !== selected)); setSelected(null); };

  // Drag de borde de intervalo desde la banda del canvas (resize)
  const beginDragEdgeCanvas = (e: any, ivId: string, which: "start" | "end", rect: DOMRect) => {
    setSelected(ivId);
    const origIvs = intervals;
    const origIv  = origIvs.find((iv) => iv.id === ivId);
    if (!origIv) return;
    const W = rect.width;
    startPointerDrag(e, {
      onMove: (ev, getX) => {
        const xRel = getX(ev) - rect.left;
        const t = Math.max(0, Math.min(dur, timeRef.current + (xRel - W / 2) * VISIBLE_SECS / W));
        const updated: IV = which === "start"
          ? { ...origIv, start: Math.min(origIv.end - 0.1, t) }
          : { ...origIv, end:   Math.max(origIv.start + 0.1, t) };
        setIntervals([...(resolveOverlap(origIvs.filter((iv) => iv.id !== ivId), updated) as IV[]), updated]);
      },
    });
  };

  // Drag del cuerpo de intervalo desde la banda del canvas (mover)
  const beginDragBodyCanvas = (e: any, ivId: string, rect: DOMRect) => {
    setSelected(ivId);
    const origIvs = intervals;
    const iv0     = origIvs.find((iv) => iv.id === ivId);
    if (!iv0) return;
    const len = iv0.end - iv0.start;
    const W   = rect.width;
    let x0 = 0, moved = false;
    startPointerDrag(e, {
      onStart: (ev, getX) => { x0 = getX(ev); },
      onMove:  (ev, getX) => {
        const x = getX(ev);
        if (!moved && Math.abs(x - x0) > 3) moved = true;
        if (!moved) return;
        const dt = (x - x0) * VISIBLE_SECS / W;
        const ns = Math.max(0, Math.min(dur - len, iv0.start + dt));
        const movedIv: IV = { ...iv0, start: ns, end: ns + len };
        setIntervals([...(resolveOverlap(origIvs.filter((iv) => iv.id !== ivId), movedIv) as IV[]), movedIv]);
      },
      // La selección persiste tras soltar (igual que los bloques del esquema):
      // no se hace toggle; para deseleccionar, pulsar en una zona vacía.
    });
  };

  // Dispatcher de clicks/drag en la zona de banda de la onda
  const handleBandPointerDown = (e: any, clientX: number, rect: DOMRect) => {
    const W       = rect.width;
    const pxPerSec = W / VISIBLE_SECS;
    const t       = timeRef.current;
    const xRel    = clientX - rect.left;
    const timeAtClick = Math.max(0, Math.min(dur, t + (xRel - W / 2) * VISIBLE_SECS / W));
    const EDGE_PX = 14;

    // ¿Cerca del borde de un intervalo seleccionado?
    if (selected) {
      const selIv = intervals.find((iv) => iv.id === selected);
      if (selIv && selIv.id !== "live") {
        const sx = (selIv.start - t) * pxPerSec + W / 2;
        const ex = (Math.min(selIv.end, dur) - t) * pxPerSec + W / 2;
        if (Math.abs(xRel - sx) < EDGE_PX) { beginDragEdgeCanvas(e, selected, "start", rect); return; }
        if (Math.abs(xRel - ex) < EDGE_PX) { beginDragEdgeCanvas(e, selected, "end",   rect); return; }
      }
    }

    // ¿Click sobre el cuerpo de algún intervalo?
    const clicked = intervals.find((iv) => iv.id !== "live" && timeAtClick >= iv.start && timeAtClick <= iv.end);
    if (clicked) { beginDragBodyCanvas(e, clicked.id, rect); }
    else         { setSelected(null); }
  };

  // Render
  const selectedIv = intervals.find((iv) => iv.id === selected);

  // Conteo de fragmentos marcados (todas las categorías) para la barra de acción
  const markedCount = Object.values(intervalsByCategory).reduce((n, arr) => n + (arr?.length || 0), 0) + (pressing ? 1 : 0);
  const submitLabel = mode === "record" ? "Guardar clave" : mode === "preview" ? "Ver resultado" : "Entregar";

  return (
    <div style={{ ...S.app, display: "flex", flexDirection: "column" }} onMouseDown={() => { if (selected !== null) setSelected(null); }}>
      <SessionHeader exercise={exercise} onBack={onBack} modelId="interactivo" />
      <div style={{ maxWidth: 980, width: "100%", margin: "0 auto", padding: "16px 16px 24px", flex: 1 }}>

        {modelToggleNode}

        {hasAudio && !audioReady && !audioError && <AudioLoadingOverlay />}
        {audioError && <div style={{ textAlign: "center", color: C.danger, fontSize: 12, marginBottom: 10 }}>{audioError}</div>}

        {mode === "student" && <SessionHint modelId="interactivo" extra={<>Pulsa <b>Espacio</b> para reproducir o pausar.</>} />}

        <section style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 16, padding: "14px 14px 12px", marginBottom: 12 }}>
          <div style={{ background: C.paper2, borderRadius: 10, overflow: "hidden", border: `1px solid ${C.line}`, marginBottom: 8 }}>
            <WaveformDisplay time={time} timeRef={timeRef} duration={dur} waveformDuration={audioDuration} allIntervals={intervals}
              exerciseId={exercise.id} waveformData={waveformData}
              colorByFn={colorByFn} answerBand
              selectedIvId={selected} pressingRef={pressingRef}
              hintIntervals={hintIntervals}
              paintFn={paintFn} onPaintCommit={handlePaintCommit}
              onBandPointerDown={handleBandPointerDown}
              onScrubBegin={scrubBegin} onScrubTo={scrubTo} onScrubEnd={scrubEnd} />
          </div>

          <AudioScrubber
            timeRef={timeRef} duration={dur}
            intervals={intervals} pressingRef={pressingRef}
            colorByFn={colorByFn} onSeek={seekTo} />

          <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 12, marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.line}` }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              {exCategories.length > 1 ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {exCategories.map((m) => {
                    const isAct = m.id === currentCategoryId;
                    return (
                      <button key={m.id} onClick={() => switchCategory(m.id)}
                        style={{ padding: "3px 10px", fontSize: 10.5, fontFamily: FONT_SANS, fontWeight: 600, borderRadius: 999,
                          border: `1.5px solid ${isAct ? C.ink : C.line}`, background: isAct ? C.ink : "transparent",
                          color: isAct ? C.paper : C.muted, cursor: "pointer", whiteSpace: "nowrap" }}>
                        {m.name}
                      </button>
                    );
                  })}
                </div>
              ) : <span />}
              <CircleButton onClick={() => seekTo(0)} title="Volver al inicio">⏮</CircleButton>
            </div>
            <CircleButton onClick={togglePlay} disabled={hasAudio && !audioReady && !audioError}
              primary size={52} title={playing ? "Pausa (Espacio)" : "Reproducir (Espacio)"}>
              {playing ? "❚❚" : "▶"}
            </CircleButton>
            <div style={{ textAlign: "right", fontFamily: F.sans, fontVariantNumeric: "tabular-nums", fontSize: 22, fontWeight: 600, color: C.ink, letterSpacing: -0.5 }}>
              {fmtClock(time)}<span style={{ color: C.muted, fontWeight: 400 }}>/{fmtClock(dur)}</span>
            </div>
          </div>
        </section>

        {/* Banner de edición para categorías normales (sin cifrado): grados + eliminar */}
        {selected && selectedIv && !exCategory.hasFigures && (
          <div onMouseDown={(e) => e.stopPropagation()} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginBottom: 14, padding: "10px 12px", background: C.paper, border: `1px solid ${C.line}`, borderRadius: 12 }}>
            {exCategory.buttons.map((b) => {
              const isSel = selectedIv.fn === b.id;
              return (
                <button key={b.id} className="fa-pressable"
                  onClick={() => setIntervals((prev) => prev.map((iv) => iv.id === selected ? { ...iv, fn: b.id } : iv))}
                  style={{ background: isSel ? b.color : C.paper, color: isSel ? C.paper : b.color, border: `1.5px solid ${b.color}`, borderRadius: 999, padding: "5px 13px", cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: FONT_SANS }}>
                  {b.id}
                </button>
              );
            })}
            <button onClick={deleteSelected} className="fa-pressable" title="Eliminar fragmento"
              style={{ ...S.btnDanger, marginLeft: "auto", padding: "5px 9px", fontSize: 14, lineHeight: 1 }}>✕</button>
          </div>
        )}

        {paintFn && (
          <div className="fa-pop" style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, padding: "9px 12px", background: `${(colorByFn[paintFn] || C.ink)}14`, border: `1.5px solid ${colorByFn[paintFn] || C.ink}`, borderRadius: 12 }}>
            <span style={{ fontSize: 16 }}>🖌️</span>
            <span style={{ flex: 1, minWidth: 0, fontFamily: F.sans, fontSize: 13, color: C.ink }}>
              <b>Modo colorear</b> · arrastra sobre la onda para pintar el grado <b style={{ fontFamily: FONT_SANS }}>{paintFn}</b>
            </span>
            <button onClick={() => setPaintFn(null)} className="fa-pressable"
              style={{ ...S.btn, padding: "5px 14px", fontSize: 12, flexShrink: 0 }}>Salir</button>
          </div>
        )}

        <FunctionButtons buttons={exCategory.buttons} pressing={pressing} onDown={handleFnDown} onUp={handleFnUp} grados={!!exCategory.hasFigures} hideNames={!!exCategory.hasFigures} paintFn={paintFn} />

        {/* Control de cifrado (categorías de grados): debajo de los botones.
            Switch compacto Tríada/Cuatríada + tiles de inversión por familia. */}
        {selected && selectedIv && exCategory.hasFigures && (() => {
          const setFig = (figId: string) => setIntervals((prev) => prev.map((iv) => iv.id === selected ? { ...iv, fig: figId } : iv));
          const curFig = selectedIv.fig;
          const isQuad = curFig != null && !isTriadFig(curFig);
          // Tile compacto de cifrado, teñido con el acento de su familia.
          const FigTile = ({ item, accent, i = 0 }: { item: FigItem; accent: string; i?: number }) => {
            const isSel = curFig === item.id;
            return (
              <button key={item.id} className="fa-pressable fa-opt-in" onClick={() => setFig(item.id)}
                style={{ width: 52, height: 46, flexShrink: 0, background: isSel ? accent : C.paper,
                  border: `1.5px solid ${isSel ? accent : accent + "44"}`, borderRadius: 10, padding: 0,
                  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                  animationDelay: `${i * 30}ms`, transform: isSel ? "translateY(-1px)" : "none",
                  boxShadow: isSel ? `0 2px 8px ${accent}44` : "none",
                  transition: "background .16s ease, border-color .16s ease, box-shadow .16s ease, transform .12s cubic-bezier(.34,1.5,.64,1)" }}>
                <FigureLabel item={item} color={isSel ? C.paper : accent} size={17} />
              </button>
            );
          };
          // Grupo de cifras de una familia: solo la fila de tiles (sin título; el
          // acento de color ya distingue la familia). Tríada y cuatríada comparten
          // esta estructura → misma altura, sin saltos al alternar el switch.
          const FigGroup = ({ accent, items }: { accent: string; items: FigItem[] }) => (
            <div style={{ display: "flex", gap: 6 }}>
              {items.map((it, i) => <FigTile key={it.id} item={it} accent={accent} i={i} />)}
            </div>
          );
          // Familias a mostrar según el switch (misma estructura en ambos modos).
          const families = isQuad
            ? quadGroupsForDegree(selectedIv.fn).map((gk) => ({ key: gk, accent: FIG_GROUPS[gk].accent, items: FIG_GROUPS[gk].items }))
            : [{ key: "triada", accent: FIG_GROUPS.triada.accent, items: FIG_GROUPS.triada.items }];
          return (
            <div onMouseDown={(e) => e.stopPropagation()} className="fa-fade-in"
              style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap",
                background: C.paper, border: `1px solid ${C.line}`, borderRadius: 12, padding: "10px 14px" }}>
              {/* Switch compacto Tríada / Cuatríada (pastilla deslizante) */}
              <div style={{ position: "relative", display: "flex", width: 200, flexShrink: 0, background: C.paper2, border: `1px solid ${C.line}`, borderRadius: 999, padding: 4 }}>
                {/* Indicador deslizante */}
                <div style={{ position: "absolute", top: 4, bottom: 4, left: 4, width: "calc(50% - 4px)", borderRadius: 999, background: C.ink, transform: isQuad ? "translateX(100%)" : "translateX(0)", transition: "transform .22s cubic-bezier(.4,0,.2,1)" }} />
                {[{ k: "triada", label: "Tríada" }, { k: "quad", label: "Cuatríada" }].map(({ k, label }) => {
                  const active = k === "triada" ? !isQuad : isQuad;
                  return (
                    <button key={k}
                      onClick={() => setFig(k === "triada" ? "t0" : FIG_GROUPS[quadGroupsForDegree(selectedIv.fn)[0]].items[0].id)}
                      style={{ position: "relative", zIndex: 1, flex: 1, padding: "7px 0", fontSize: 13, fontFamily: FONT_SANS, fontWeight: 600, borderRadius: 999, border: "none", background: "transparent", color: active ? C.paper : C.muted, cursor: "pointer", transition: "color .2s" }}>
                      {label}
                    </button>
                  );
                })}
              </div>

              {/* Cifras alineadas con el switch (sin título). En cuatríada las familias
                  se reparten por el ancho; en tríada se pegan a la izquierda. */}
              <div style={{ flex: 1, minWidth: 220, display: "flex", justifyContent: isQuad ? "space-evenly" : "flex-start", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
                {families.map((f) => <FigGroup key={f.key} accent={f.accent} items={f.items} />)}
              </div>

              {/* Eliminar fragmento, al final de la fila */}
              <button onClick={deleteSelected} className="fa-pressable" title="Eliminar fragmento"
                style={{ ...S.btnDanger, width: 36, height: 36, padding: 0, fontSize: 14, lineHeight: 1, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
            </div>
          );
        })()}
      </div>

      <StickyActionBar
        secondary={
          <button onClick={togglePaintMode} className="fa-pressable" title="Pintar respuestas a mano sobre la onda"
            style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 14px", borderRadius: 999, cursor: "pointer", flexShrink: 0,
              fontFamily: F.sans, fontSize: 13, fontWeight: 600, whiteSpace: "nowrap",
              border: `1.5px solid ${paintFn ? C.ink : C.line}`, background: paintFn ? C.ink : C.paper, color: paintFn ? C.paper : C.ink2,
              transition: "background .15s, color .15s, border-color .15s" }}>
            🖌️ {paintFn ? "Coloreando" : "Colorear"}
          </button>
        }
        info={
          <>
            <span style={{ fontFamily: F.sans, fontSize: 13, fontWeight: 600, color: C.ink }}>
              {markedCount === 0 ? "Sin marcas todavía" : `${markedCount} ${markedCount === 1 ? "fragmento marcado" : "fragmentos marcados"}`}
            </span>
            <span style={{ fontFamily: F.sans, fontSize: 11, color: C.muted }}>{paintFn ? "Arrastra sobre la onda para pintar" : "Mantén pulsada la función mientras suena"}</span>
          </>
        }>
        <BarSubmitButton onClick={handleSubmit}>{submitLabel}</BarSubmitButton>
      </StickyActionBar>
    </div>
  );
}



// ─── Modal de gestión de repeticiones (solo modo "record") ───────────────────
interface RepSegment { start: number; end: number; }
interface Repetition { id: string; label?: string; first: RepSegment; second: RepSegment; }
interface RepeatManagerModalProps {
  exercise: Exercise;
  duration: number;
  onSave: (reps: Repetition[]) => void;
  onClose: () => void;
}
export function RepeatManagerModal({ exercise, duration, onSave, onClose }: RepeatManagerModalProps) {
  const [reps, setReps] = useState<Repetition[]>(
    ((exercise.repetitions as Repetition[] | undefined) || []).map(r => ({ ...r, first: { ...r.first }, second: { ...r.second } }))
  );
  const [err, setErr] = useState("");

  const addRep = () => {
    if (!Number.isFinite(duration) || duration <= 0) {
      setErr("El ejercicio no tiene duración válida. Sube el audio antes de añadir repeticiones.");
      return;
    }
    const sorted  = [...reps].sort((a, b) => a.second.end - b.second.end);
    const lastEnd = sorted[sorted.length - 1]?.second.end ?? 0;
    const avail   = duration - lastEnd;
    if (avail < SCHEMA_MIN_DUR * 2) {
      setErr("No queda espacio suficiente al final del audio para otra repetición.");
      return;
    }
    const d       = Math.max(SCHEMA_MIN_DUR, Math.min(Math.round(Math.min(avail / 2.5, 30) * 10) / 10, 20));
    const start   = lastEnd;
    setReps(prev => [...prev, {
      id: uid("rep"), label: "",
      first:  { start, end: start + d },
      second: { start: start + d, end: Math.min(start + d * 2, duration) },
    }]);
  };

  const validate = () => {
    for (const r of reps) {
      if ((r.first.end - r.first.start) < 1) return "La 1ª vez debe durar al menos 1 s.";
      if ((r.second.end - r.first.end)   < 1) return "La 2ª vez debe durar al menos 1 s.";
      if (r.second.end > duration + 0.5)      return `La 2ª vez supera la duración del audio (${fmtClock(duration)}).`;
    }
    const sorted = [...reps].sort((a, b) => a.first.start - b.first.start);
    for (let i = 0; i < sorted.length - 1; i++) {
      if (sorted[i].second.end > sorted[i + 1].first.start + 0.01)
        return `Las repeticiones #${i + 1} y #${i + 2} se solapan. Ajusta los tiempos.`;
    }
    return "";
  };

  // Cuando cambia first.end, propaga a second.start
  const updFirst = (id: string, field: "start" | "end", raw: string) => {
    setErr("");
    const v = Math.max(0, parseFloat(raw) || 0);
    setReps(p => p.map(r => {
      if (r.id !== id) return r;
      const newFirst = { ...r.first, [field]: v };
      // second.start siempre = first.end; second.end se ajusta proporcionalmente
      const origFD = (r.first.end - r.first.start) || 1;
      const origSD = (r.second.end - r.second.start) || 1;
      const ratio  = origSD / origFD;
      const newSD  = field === "end" ? Math.max(1, (newFirst.end - newFirst.start) * ratio) : origSD;
      const newSecond = { ...r.second, start: newFirst.end, end: newFirst.end + newSD };
      return { ...r, first: newFirst, second: newSecond };
    }));
  };
  const updSecondEnd = (id: string, raw: string) => {
    setErr("");
    const v = Math.max(0, parseFloat(raw) || 0);
    setReps(p => p.map(r => r.id === id ? { ...r, second: { ...r.second, end: v } } : r));
  };

  const handleSave = () => {
    const e = validate(); if (e) { setErr(e); return; }
    // Garantizar second.start = first.end antes de guardar
    onSave(reps.map(r => ({ ...r, second: { ...r.second, start: r.first.end } })));
  };

  return (
    <ModalShell width={520} align="top" zIndex={250}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <h3 style={{ ...S.h2, margin: 0, fontSize: 16 }}>Gestionar repeticiones</h3>
        <button onClick={onClose} style={{ ...S.btn, padding: "4px 10px", fontSize: 12 }}>Cancelar</button>
      </div>
      <p style={{ fontSize: 12, color: C.muted, margin: "0 0 14px", lineHeight: 1.6 }}>
        La 2ª vez empieza obligatoriamente donde termina la 1ª. Solo indica los tiempos de inicio, fin de 1ª vez y fin de 2ª vez.
      </p>

      {reps.length === 0 && (
        <div style={{ textAlign: "center", color: C.muted, fontSize: 13, padding: "14px 0" }}>Sin repeticiones definidas.</div>
      )}

      {reps.map((r, i) => (
        <div key={r.id} style={{ background: C.paper2, border: `1px solid ${C.line}`, borderRadius: 10, padding: "12px 14px", marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.ink2, minWidth: 22 }}>#{i + 1}</span>
            <input style={{ ...S.input, flex: 1, padding: "5px 8px", fontSize: 12 }}
              placeholder="Etiqueta opcional (p.ej. «A», «Estribillo»)"
              value={r.label || ""}
              onChange={e => setReps(p => p.map(x => x.id === r.id ? { ...x, label: e.target.value } : x))} />
            <button onClick={() => setReps(p => p.filter(x => x.id !== r.id))}
              style={{ ...S.btnDanger, padding: "4px 10px", fontSize: 11 }}>✕</button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto 1fr auto 1fr", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 11, color: C.fnS, fontWeight: 700 }}>Inicio</span>
            <input type="number" min={0} max={duration} step={0.5}
              style={{ ...S.input, padding: "5px 8px", fontSize: 12 }}
              value={r.first.start}
              onChange={e => updFirst(r.id, "start", e.target.value)} />

            <span style={{ fontSize: 11, color: C.fnS, fontWeight: 700 }}>Fin 1ª</span>
            <input type="number" min={0} max={duration} step={0.5}
              style={{ ...S.input, padding: "5px 8px", fontSize: 12 }}
              value={r.first.end}
              onChange={e => updFirst(r.id, "end", e.target.value)} />

            <span style={{ fontSize: 11, color: C.fnT, fontWeight: 700 }}>Fin 2ª</span>
            <input type="number" min={0} max={duration} step={0.5}
              style={{ ...S.input, padding: "5px 8px", fontSize: 12 }}
              value={r.second.end}
              onChange={e => updSecondEnd(r.id, e.target.value)} />
          </div>
          <div style={{ fontSize: 10, color: C.muted, marginTop: 6, fontFamily: FONT_SANS, fontVariantNumeric: "tabular-nums" }}>
            {fmtClock(r.first.start)} → {fmtClock(r.first.end)} → {fmtClock(r.second.end)}
            &nbsp;·&nbsp;1ª: {fmtClock(r.first.end - r.first.start)} · 2ª: {fmtClock(Math.max(0, r.second.end - r.first.end))}
          </div>
        </div>
      ))}

      {err && <p style={{ color: C.danger, fontSize: 12, margin: "6px 0 10px" }}>{err}</p>}

      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button onClick={addRep} style={{ ...S.btn, fontSize: 12 }}>+ Añadir repetición</button>
        <div style={{ flex: 1 }} />
        <button onClick={handleSave} style={{ ...S.btnPrimary }}>Guardar</button>
      </div>
    </ModalShell>
  );
}
