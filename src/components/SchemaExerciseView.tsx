// ═══ SCHEMAEXERCISEVIEW (MODELO ESQUEMA) ═════════════════════════════════════
// Vista de sesión del modelo Esquema (timeline de bloques, repeticiones, paletas).
// Extraída de App.jsx (Fase 2). Troceo (F7, T7.1): zoom/pinch/scroll en
// useSchemaZoom, bloques/historial/selección/etiquetas en useSchemaEditor, banda
// de repetición en RepeatBand.
//
// SchemaTimeline (la 4ª extracción del plan) NO se separó como conjunto: la
// régla y las pistas siguen tejidas con la física de arrastre a través de
// refs mutables compartidos (dragRef, trackSegRefs) y el useEffect de
// arrastre. Un corte fiel de ESE conjunto obligaría a mover esa física —el
// comportamiento más frágil y menos testeable de la app— o a un componente de
// ~40 props (indirección sin reducir el acoplamiento). renderSegBlocks SÍ se
// extrajo aparte (C4.3e → components/schema/SegBlocks.tsx): no toca los refs
// de drag directamente, solo invoca handleBlockDown/handleSharedHandleDown
// (ya cerrados sobre ellos en este fichero), así que salió sin ese riesgo.
import React, { useState, useEffect, useRef, useMemo, type ReactNode } from "react";
import type { Exercise } from "../lib/types.js";
import type { Block, Rep } from "../lib/repeats.js";
import { C, F, S, FONT_SANS } from "../theme/tokens.js";
import { uid } from "../lib/ids.js";
import { fmtClock } from "../lib/time.js";
import { SCHEMA_LEVELS, SCHEMA_DEFAULT_LABELS, SCHEMA_SNAP_THR, SCHEMA_MIN_DUR, SCHEMA_CLICK_MS, SCHEMA_CLICK_MOVE_THR, SCHEMA_CLICK_DUR_FRAC } from "../lib/schema.js";
import { SCHEMA_PALETTE_DEFAULT, snapToNearest } from "../lib/palette.js";
import { buildRepeatSegments, buildCompleteViewSegments, syncSecondPassBlocks, getSegBounds, REPEAT_BARLINE_W, rulerTicksForSeg } from "../lib/repeats.js";
import { useAudioPlayer } from "../hooks/useAudioPlayer.js";
import { useSchemaZoom } from "../hooks/useSchemaZoom.js";
import { useSchemaEditor } from "../hooks/useSchemaEditor.js";
import { useListenOnlyMarks } from "../hooks/useListenOnlyMarks.js";
import { CircleButton, AudioLoadingOverlay, SessionHeader, SessionHint, StickyActionBar, BarSubmitButton, BarIconButton } from "./primitives.jsx";
import { WaveformDisplay } from "./session.js";
import { RepeatManagerModal } from "./ExerciseView.js";
import { RepeatBand } from "./schema/RepeatBand.js";
import { SchemaPalettePicker } from "./schema/SchemaPalettePicker.js";
import { BlockDetailPanel } from "./schema/BlockDetailPanel.js";
import { ViewModeToggle } from "./schema/ViewModeToggle.js";
import { SegBlocks } from "./schema/SegBlocks.js";

// ── Tipos locales del editor de esquema ──────────────────────────────────────
// Block y Rep se reutilizan de repeats.ts (forma compartida con los helpers).
type Repetition = Rep;
type SharedAudioPlayer = ReturnType<typeof useAudioPlayer> & { waveformData?: number[] | null };

interface SchemaSubmit { type: "esquema"; blocks: Block[]; schemaPalette: string; placementScore?: number | null; [k: string]: unknown; }

// Borrador de bloques — mismo formato que produce esta vista y que
// SessionShell (M4.1) eleva a drafts[partId][modelId].
type EsquemaDraft = Block[];

interface SchemaExerciseViewProps {
  exercise: Exercise;
  mode: string;
  onSubmit: (result: SchemaSubmit) => void;
  onBack: () => void;
  modelToggleNode?: ReactNode;
  sharedAudioPlayer?: SharedAudioPlayer | null;
  initialDraft?: EsquemaDraft | null;
  onDraftChange?: (draft: EsquemaDraft) => void;
  // M4.1: false cuando la vista está montada pero oculta (combo keep-mounted).
  active?: boolean;
}

export function SchemaExerciseView({ exercise, mode, onSubmit, onBack, modelToggleNode = null, sharedAudioPlayer = null, initialDraft = null, onDraftChange, active = true }: SchemaExerciseViewProps) {
  const duration = exercise.duration as number;
  const [localWaveformData, setLocalWaveformData] = useState<number[] | null>(exercise.waveformData || null);
  const waveformData = sharedAudioPlayer?.waveformData ?? localWaveformData;

  const localOnWaveform = (!sharedAudioPlayer && !exercise.waveformData) ? (wd: number[]) => setLocalWaveformData(wd) : null;
  const localPlayer = useAudioPlayer(
    sharedAudioPlayer ? { id: exercise.id, duration: exercise.duration, audioUrl: null } : exercise,
    { onWaveform: localOnWaveform }
  );
  const {
    time, playing, audioReady, audioError, hasAudio,
    togglePlay, seekTo, scrubBegin, scrubTo, scrubEnd,
    timeRef: audioTimeRef, audioDuration,
  } = sharedAudioPlayer || localPlayer;

  const timeRef = useRef(0);
  timeRef.current = time;

  const [selectedRepId, setSelectedRepId] = useState<string | null>(null); // rep seleccionada en la banda
  const [guides,       setGuides]       = useState<number[]>([]);
  const [localReps,    setLocalReps]    = useState<Repetition[]>((exercise.repetitions as Repetition[] | undefined) || []);
  const [showRepModal, setShowRepModal] = useState(false);
  // selectedPass: { [repId]: "first"|"second" } — qué vez mostrar cuando no está sonando
  const [selectedPass]    = useState<Record<string, "first" | "second">>({});
  const repResizeRef    = useRef<any>(null);   // drag de resize de zona de repetición
  const [repResizeGuide, setRepResizeGuide] = useState<{ xFrac: number; color: string } | null>(null);
  const localRepsRef = useRef(localReps);
  localRepsRef.current = localReps;

  const listenOnly = !!exercise.listenOnly;
  const [playCount,   setPlayCount]   = useState(0);

  // ── Zoom y desplazamiento horizontal del esquema (F7, T7.1) ──────────────
  const {
    schemaZoom, schemaScrollFrac, schemaOuterRef,
    handleSchemaPinchStart, handleSchemaPinchMove, handleSchemaPinchEnd,
    handleScrollbarTrackDown,
  } = useSchemaZoom();

  // ── Modo de vista: "completa" (edición secuencial, sin doble altura)
  //               | "resumida" (doble altura, solo lectura)
  const [viewMode, setViewMode] = useState("completa");
  const viewModeRef = useRef("completa");
  viewModeRef.current = viewMode;

  // ── Bloques, historial, selección, edición de etiqueta (F7, T7.1) ────────
  const {
    blocks, setBlocks, blocksRef,
    history, setHistory,
    selected, setSelected,
    editId, setEditId, editVal, setEditVal,
    setBlocksSnap, undo, resetBlocks, commitEdit,
  } = useSchemaEditor(initialDraft ?? (exercise.blocks as Block[] | undefined) ?? [], viewMode, localReps, onDraftChange);
  const resetAll = () => { resetBlocks(); setLocalReps([]); };

  // ── Paleta de color elegida por el alumno para los bloques del esquema ──────
  // "p1".."p5" = paletas de Adobe. El selector (UI + estado de abierto/cerrado)
  // vive en SchemaPalettePicker (C4.3a); aquí solo el valor elegido, que
  // consumen los niveles 1/2 al colorear bloques.
  const [schemaPalette, setSchemaPalette] = useState(exercise.schemaPalette || SCHEMA_PALETTE_DEFAULT);

  const segments: any[] = useMemo(() =>
    viewMode === "resumida"
      ? buildRepeatSegments(duration, localReps)
      : buildCompleteViewSegments(duration, localReps),
    [duration, localReps, viewMode]);
  const segmentsRef = useRef(segments);
  segmentsRef.current = segments;
  const hasRepeats = localReps.length > 0;

  // ¿En qué repetición y qué vez estamos reproduciendo ahora?
  const activeRepeatPass = useMemo(() => {
    for (const r of localReps) {
      if (time >= r.first.start  && time < r.first.end)  return { repId: r.id, pass: "first"  };
      if (time >= r.second.start && time < r.second.end) return { repId: r.id, pass: "second" };
    }
    return null;
  }, [time, localReps]);

  // ── Sync 2ª vez al activar vista completa o al cambiar repeticiones ─────
  useEffect(() => {
    if (viewMode === "completa" && localReps.length > 0) {
      setBlocks(prev => syncSecondPassBlocks(prev, localReps));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, localReps.length]);

  // ── Refs ─────────────────────────────────────────────────────────────────
  // trackSegRefs: key = `${lvId}_${segIndex}_${pass}`  ("pass" = "normal"|"first"|"second")
  // ruler refs:   key = `ruler_${segIndex}_${pass}`
  const trackSegRefs  = useRef<Record<string, HTMLElement | null>>({});
  const dragRef       = useRef<any>(null);
  const colorInputRef = useRef<HTMLInputElement | null>(null);

  // Ruler container width (para calcular densidad de marcas)
  const [rulerW, setRulerW] = useState(600);
  const rulerContainerRef   = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = rulerContainerRef.current; if (!el) return;
    setRulerW(el.getBoundingClientRect().width);
    const ro = new ResizeObserver(([e]) => setRulerW(e.contentRect.width));
    ro.observe(el); return () => ro.disconnect();
  }, []);

  // ── Guardar repeticiones desde el modal ─────────────────────────────────
  const handleSaveRepetitions = (newReps: Repetition[]) => {
    setShowRepModal(false);
    const oldIds = new Set(localRepsRef.current.map(r => r.id));
    const newIds = new Set(newReps.map(r => r.id));
    setBlocksSnap(prev => {
      let upd = [...prev];
      // Eliminar etiquetas de repeticiones borradas
      const removed = [...oldIds].filter(id => !newIds.has(id));
      upd = upd.map(b => removed.includes(b.repeatId as string) ? { ...b, repeatId: null, pass: null } : b);
      upd = upd.filter(b => !(removed.includes(b.repeatId as string) && b.pass === "second"));
      // Procesar repeticiones nuevas
      for (const rep of newReps.filter(r => !oldIds.has(r.id))) {
        // Etiquetar bloques existentes que caen dentro de la 1ª vez
        upd = upd.map(b => {
          if (b.repeatId) return b;
          if (b.start >= rep.first.start - 0.01 && b.end <= rep.first.end + 0.01)
            return { ...b, repeatId: rep.id, pass: "first" };
          return b;
        });
        // Crear copias espejadas para la 2ª vez (mismos bloques, escalados a la duración de la 2ª vez)
        const fd = (rep.first.end  - rep.first.start)  || 1;
        const sd = (rep.second.end - rep.second.start) || 1;
        const firstBlocks = upd.filter(b => b.repeatId === rep.id && b.pass === "first");
        upd = [...upd, ...firstBlocks.map(b => ({
          ...b,
          id:    uid("sb"),
          pass:  "second",
          start: rep.second.start + ((b.start - rep.first.start) / fd) * sd,
          end:   rep.second.start + ((b.end   - rep.first.start) / fd) * sd,
        }))];
      }
      // Escalar bloques de repeticiones actualizadas proporcionalmente a la nueva zona
      for (const newRep of newReps.filter(r => oldIds.has(r.id))) {
        const oldRep = localRepsRef.current.find(r => r.id === newRep.id);
        if (!oldRep) continue;
        if (oldRep.first.start === newRep.first.start && oldRep.first.end === newRep.first.end &&
            oldRep.second.start === newRep.second.start && oldRep.second.end === newRep.second.end) continue;
        const oldFD = (oldRep.first.end  - oldRep.first.start)  || 1;
        const newFD = (newRep.first.end  - newRep.first.start)  || 1;
        const oldSD = (oldRep.second.end - oldRep.second.start) || 1;
        const newSD = (newRep.second.end - newRep.second.start) || 1;
        upd = upd.map(b => {
          if (b.repeatId !== newRep.id) return b;
          if (b.pass === "first") {
            // Escalar dentro de la nueva 1ª zona
            const relS = (b.start - oldRep.first.start) / oldFD;
            const relE = (b.end   - oldRep.first.start) / oldFD;
            return { ...b, start: newRep.first.start + relS * newFD, end: newRep.first.start + relE * newFD };
          } else {
            // Escalar dentro de la nueva 2ª zona (todos: overridden y no overridden)
            const relS = (b.start - oldRep.second.start) / oldSD;
            const relE = (b.end   - oldRep.second.start) / oldSD;
            return { ...b, start: newRep.second.start + relS * newSD, end: newRep.second.start + relE * newSD };
          }
        }).filter(b => !(b.repeatId === newRep.id && b.end - b.start < 0.1));
      }
      return upd;
    });
    setLocalReps(newReps);
  };

  // ── Mapeo tiempo→posición visual (para bandas del overlay de dibujo) ─────
  const recToVisX = (t: number) => {
    for (const seg of segmentsRef.current) {
      if (seg.type === "normal" && t >= seg.recStart - 0.01 && t <= seg.recEnd + 0.01)
        return seg.vStart + Math.max(0, Math.min(1, (t - seg.recStart) / (seg.canonDur || 1))) * (seg.vEnd - seg.vStart);
      if (seg.type === "repeat-first" && t >= seg.recStart - 0.01 && t <= seg.recEnd + 0.01)
        return seg.vStart + Math.max(0, Math.min(1, (t - seg.recStart) / (seg.canonDur || 1))) * (seg.vEnd - seg.vStart);
      if (seg.type === "repeat-second" && t >= seg.recStart - 0.01 && t <= seg.recEnd + 0.01)
        return seg.vStart + Math.max(0, Math.min(1, (t - seg.recStart) / (seg.canonDur || 1))) * (seg.vEnd - seg.vStart);
      if (seg.type === "repeat") {
        const fp = seg.rep.first, fd = (fp.end - fp.start) || 1;
        if (t >= fp.start - 0.01 && t <= fp.end + 0.01)
          return seg.vStart + Math.max(0, Math.min(1, (t - fp.start) / fd)) * (seg.vEnd - seg.vStart);
      }
    }
    return t <= 0 ? 0 : 1;
  };

  // Igual que recToVisX pero, para segmentos "repeat" (vista resumida), mapea
  // la 2ª vez TAMBIÉN de forma proporcional dentro del mismo segmento visual.
  // Esto permite que bloques sin repeatId cuyo end cae en la 2ª ocurrencia
  // calculen su anchura visual correctamente (en vez de devolver siempre 1.0).
  const recToVisXResumed = (t: number) => {
    for (const seg of segmentsRef.current) {
      if (seg.type === "normal" && t >= seg.recStart - 0.01 && t <= seg.recEnd + 0.01)
        return seg.vStart + Math.max(0, Math.min(1, (t - seg.recStart) / (seg.canonDur || 1))) * (seg.vEnd - seg.vStart);
      if (seg.type === "repeat-first" && t >= seg.recStart - 0.01 && t <= seg.recEnd + 0.01)
        return seg.vStart + Math.max(0, Math.min(1, (t - seg.recStart) / (seg.canonDur || 1))) * (seg.vEnd - seg.vStart);
      if (seg.type === "repeat-second" && t >= seg.recStart - 0.01 && t <= seg.recEnd + 0.01)
        return seg.vStart + Math.max(0, Math.min(1, (t - seg.recStart) / (seg.canonDur || 1))) * (seg.vEnd - seg.vStart);
      if (seg.type === "repeat") {
        const fp = seg.rep.first, sp = seg.rep.second;
        const fd = (fp.end - fp.start) || 1;
        const sd = (sp.end - sp.start) || 1;
        // 1ª vez: igual que recToVisX
        if (t >= fp.start - 0.01 && t <= fp.end + 0.01)
          return seg.vStart + Math.max(0, Math.min(1, (t - fp.start) / fd)) * (seg.vEnd - seg.vStart);
        // 2ª vez: mapeo proporcional dentro del mismo rango visual
        if (t >= sp.start - 0.01 && t <= sp.end + 0.01)
          return seg.vStart + Math.max(0, Math.min(1, (t - sp.start) / sd)) * (seg.vEnd - seg.vStart);
      }
    }
    return t <= 0 ? 0 : 1;
  };

  // ── Eliminar una repetición por id ───────────────────────────────────────
  const deleteRepeat = (repId: string) => handleSaveRepetitions(localRepsRef.current.filter(r => r.id !== repId));

  // Delete / Backspace — borrar bloque o repetición seleccionada
  useEffect(() => {
    if (!active) return;   // M4.1: vista oculta → sin escucha de teclado
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (selected) {
        setHistory(prev => [...prev, blocksRef.current]);
        setBlocks(prev => prev.filter(b => b.id !== selected));
        setSelected(null);
        e.preventDefault();
      } else if (selectedRepId) {
        deleteRepeat(selectedRepId);
        setSelectedRepId(null);
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // deleteRepeat lee localRepsRef.current (siempre actualizado); no necesita estar en deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, selectedRepId, active]);

  // ── Resize de barras de repetición arrastrando en la regla ─────────────
  const RESIZE_PX = 22; // zona de detección de borde (px desde cada extremo de la fila)

  const handleRepZoneRulerDown = (e: any, seg: any, pass: string) => {
    if (listenOnly) return;
    const rowKey = `ruler_${seg.index}_${pass}`;
    const rowEl  = trackSegRefs.current[rowKey]; if (!rowEl) return;
    const rowRect  = rowEl.getBoundingClientRect();
    const rulerEl  = rulerContainerRef.current; if (!rulerEl) return;
    const rulerRect = rulerEl.getBoundingClientRect();
    const mouseX   = getClientX(e);
    const distL = mouseX - rowRect.left;
    const distR = rowRect.right - mouseX;
    const edgePx = Math.min(RESIZE_PX, rowRect.width * 0.28);
    const isLeft  = distL < edgePx;
    const isRight = distR < edgePx;

    if (!isLeft && !isRight) { handleSegRulerDown(e, seg, pass); return; }

    e.preventDefault();
    const { rep } = seg;
    // Ambos bordes del centro son la "junction" (first.end = second.start)
    const field = pass === "first"
      ? (isLeft ? "first.start" : "junction")
      : (isLeft ? "junction"    : "second.end");
    repResizeRef.current = { repId: rep.id, field, rulerRect, seg, rep: { ...rep, first: { ...rep.first }, second: { ...rep.second } } };

    const toXFrac = (ev: any) => Math.max(0, Math.min(1, (getClientX(ev) - rulerRect.left) / rulerRect.width));
    setRepResizeGuide({ xFrac: toXFrac(e), color: "black" });

    const mv = (ev: any) => {
      if (ev.cancelable) ev.preventDefault();
      setRepResizeGuide({ xFrac: toXFrac(ev), color: "black" });
    };
    const up = (ev: any) => {
      const d = repResizeRef.current; if (!d) return;
      const xFrac      = toXFrac(ev);
      const xInSeg     = (xFrac - d.seg.vStart) / Math.max(0.001, d.seg.vEnd - d.seg.vStart);
      const cf         = Math.max(0, Math.min(1, xInSeg));
      const { rep: origRep } = d;
      const f = { ...origRep.first }, s = { ...origRep.second };
      const fd = f.end - f.start || 1, sd = s.end - s.start || 1;
      if (d.field === "first.start") {
        f.start = Math.min(f.end - 1, origRep.first.start + cf * fd);
        // Snap al inicio si < 5 s
        if (f.start < 5) f.start = 0;
      } else if (d.field === "junction") {
        // Mueve first.end y second.start juntos; second.end se ajusta en proporción
        const origSD = origRep.second.end - origRep.second.start || 1;
        const ratio  = origSD / fd;
        const newJunction = origRep.first.start + cf * fd;
        f.end   = Math.max(f.start + 1, Math.min(duration - 1, newJunction));
        s.start = f.end;
        const newFD = f.end - f.start;
        s.end = Math.min(duration, f.end + newFD * ratio);
      } else {
        s.end = Math.max(s.start + 1, origRep.second.start + cf * sd);
      }
      f.start = Math.max(0, f.start); f.end = Math.min(duration, f.end);
      s.start = f.end;               s.end = Math.min(duration, s.end);
      const newRep  = { ...origRep, first: f, second: s };
      const newReps = localRepsRef.current.map(r => r.id === d.repId ? newRep : r);
      handleSaveRepetitions(newReps);
      setRepResizeGuide(null);
      repResizeRef.current = null;
      window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up);
      window.removeEventListener("touchmove", mv); window.removeEventListener("touchend", up);
    };
    window.addEventListener("mousemove", mv); window.addEventListener("mouseup", up);
    window.addEventListener("touchmove", mv, { passive: false }); window.addEventListener("touchend", up);
  };

  // Cursor ew-resize al pasar por los bordes (sin asa visible)
  const handleRepRowMouseMove = (e: any, rowEl: any) => {
    if (!rowEl) return;
    const rect  = rowEl.getBoundingClientRect();
    const distL = getClientX(e) - rect.left;
    const distR = rect.right - getClientX(e);
    const edgePx = Math.min(RESIZE_PX, rect.width * 0.28);
    rowEl.style.cursor = (distL < edgePx || distR < edgePx) ? "ew-resize" : "default";
  };

  // ── Navegador de la regla ────────────────────────────────────────────────
  const getClientX = (e: any) => e.touches?.[0]?.clientX ?? e.changedTouches?.[0]?.clientX ?? e.clientX;

  // Igual que containerXToRec pero, para segmentos "repeat" (vista resumida),
  // puede mapear a la 1ª O la 2ª vez según el parámetro `pass`.
  // Esto permite arrastrar de forma continua a través de todos los segmentos.
  const containerXToRecForPass = (xFrac: number, pass: string) => {
    const segs = segmentsRef.current;
    for (const sg of segs) {
      if (xFrac >= sg.vStart - 0.001 && xFrac <= sg.vEnd + 0.001) {
        const f = sg.vEnd > sg.vStart
          ? Math.max(0, Math.min(1, (xFrac - sg.vStart) / (sg.vEnd - sg.vStart))) : 0;
        if (sg.type === "normal")        return sg.recStart + f * sg.canonDur;
        if (sg.type === "repeat-first")  return sg.recStart + f * sg.canonDur;
        if (sg.type === "repeat-second") return sg.recStart + f * sg.canonDur;
        // Segmento "repeat" (vista resumida): mapear a 1ª o 2ª vez según pass
        if (pass === "second")
          return sg.rep.second.start + f * (sg.rep.second.end - sg.rep.second.start);
        return sg.rep.first.start + f * (sg.rep.first.end - sg.rep.first.start);
      }
    }
    return 0;
  };

  // Drag continuo que abarca AMBAS FILAS del segmento de repetición en vista resumida.
  // Determina la vez (1ª o 2ª) según la posición vertical del puntero en cada momento,
  // permitiendo pasar de una fila a la otra sin soltar el botón del ratón.
  const handleDoubleRowRulerDown = (e: any, seg: any, outerEl: any) => {
    if (listenOnly) return;
    e.preventDefault();
    const containerEl = rulerContainerRef.current; if (!containerEl) return;
    const getFrac = (ev: any) => {
      const r = containerEl.getBoundingClientRect();
      return Math.max(0, Math.min(1, (getClientX(ev) - r.left) / r.width));
    };
    const getPass = (ev: any) => {
      if (!outerEl) return "first";
      const r   = outerEl.getBoundingClientRect();
      const y   = ev.touches?.[0]?.clientY ?? ev.changedTouches?.[0]?.clientY ?? ev.clientY;
      return (y - r.top) > r.height / 2 ? "second" : "first";
    };
    const seek = (ev: any) => seekTo(containerXToRecForPass(getFrac(ev), getPass(ev)));
    seek(e);
    const mv = (ev: any) => { if (ev.cancelable) ev.preventDefault(); seek(ev); };
    const up = () => {
      window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up);
      window.removeEventListener("touchmove", mv); window.removeEventListener("touchend", up);
    };
    window.addEventListener("mousemove", mv); window.addEventListener("mouseup", up);
    window.addEventListener("touchmove", mv, { passive: false }); window.addEventListener("touchend", up);
  };

  // Drag del navegador: usa el contenedor COMPLETO de la regla para que la bola
  // se pueda mover de forma continua a través de todos los segmentos sin pararse
  // en los bordes de cada uno.
  const handleSegRulerDown = (e: any, seg: any, pass: string) => {
    if (e.touches && e.touches.length > 1) return; // pinch-to-zoom → ignorar
    if (listenOnly) return;
    e.preventDefault();
    const containerEl = rulerContainerRef.current; if (!containerEl) return;
    const getFrac = (ev: any) => {
      const r = containerEl.getBoundingClientRect();
      return Math.max(0, Math.min(1, (getClientX(ev) - r.left) / r.width));
    };
    // Al entrar en la zona de repetición (vista resumida), determinar la fila
    // por la posición vertical del puntero, no por el pass inicial.
    const resolvePass = (xFrac: number, ev: any) => {
      for (const sg of segmentsRef.current) {
        if (sg.type === "repeat" && xFrac >= sg.vStart - 0.001 && xFrac <= sg.vEnd + 0.001) {
          const r = containerEl.getBoundingClientRect();
          const y = ev.touches?.[0]?.clientY ?? ev.changedTouches?.[0]?.clientY ?? ev.clientY;
          return (y - r.top) > r.height / 2 ? "second" : "first";
        }
      }
      return pass;
    };
    seekTo(containerXToRecForPass(getFrac(e), resolvePass(getFrac(e), e)));
    const mv = (ev: any) => {
      if (ev.cancelable) ev.preventDefault();
      const f = getFrac(ev);
      seekTo(containerXToRecForPass(f, resolvePass(f, ev)));
    };
    const up = () => {
      window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up);
      window.removeEventListener("touchmove", mv); window.removeEventListener("touchend", up);
    };
    window.addEventListener("mousemove", mv); window.addEventListener("mouseup", up);
    window.addEventListener("touchmove", mv, { passive: false }); window.addEventListener("touchend", up);
  };

  // ── Marcas (listen-only): estado + handlers en su propio hook (C4.3d) ────
  const { schemaMarks, schemaMarksRef, handleMarksContainerDown, handleMarkDown } =
    useListenOnlyMarks(rulerContainerRef, segmentsRef, getClientX);

  // ── Drag principal (crear / mover / redimensionar bloques) ───────────────
  useEffect(() => {
    // pixToTime vive dentro del efecto para acceder a los refs sin clausura vieja
    const pixToTime = (e: any) => {
      const d = dragRef.current; if (!d) return 0;
      const el = trackSegRefs.current[d.segKey]; if (!el) return d.anchor;
      const r = el.getBoundingClientRect();
      const x = e.touches?.[0]?.clientX ?? e.changedTouches?.[0]?.clientX ?? e.clientX;
      return d.segMin + Math.max(0, Math.min(1, (x - r.left) / r.width)) * (d.segMax - d.segMin);
    };

    const onMove = (e: any) => {
      // Si el usuario junta un segundo dedo (pinch) durante el drag, abortar
      if (e.touches && e.touches.length > 1) {
        const d = dragRef.current;
        if (d) {
          if (d.type === "create") {
            setHistory(prev => prev.slice(0, -1));
            setBlocks(prev => prev.filter(b => b.id !== d.pid));
          }
          setGuides([]); dragRef.current = null;
        }
        return;
      }
      const d = dragRef.current; if (!d) return;
      const t   = pixToTime(e);
      const all = blocksRef.current;
      const ph  = timeRef.current;
      // Bloques del mismo contexto (misma repetición + misma vez)
      const ctx = all.filter(b => b.repeatId === d.repeatId && b.pass === d.pass && !b.isPreview);
      // Puntos de snap: límites del segmento + bordes de zona de repetición + marcas + bordes de bloques del contexto
      const repBounds = localRepsRef.current.flatMap(r => [r.first.start, r.first.end, r.second.start, r.second.end]);
      const snap = (v: number) => {
        const pts = [d.segMin, d.segMax,
          ...repBounds.filter(p => p >= d.segMin - 0.1 && p <= d.segMax + 0.1),
          ...schemaMarksRef.current.filter(m => m >= d.segMin - 0.1 && m <= d.segMax + 0.1),
          ...ctx.filter(b => b.id !== d.pid && b.id !== d.bid).flatMap(b => [b.start, b.end]),
          ph,
        ];
        return snapToNearest(v, pts);
      };
      // Para resize y shared-edge: snap a puntos estructurales + otros niveles fijos (imantación vertical)
      // Se excluyen: mismo nivel (evita cuadrícula) y bloques en cascada (se mueven junto al drag)
      const snapBounds = (v: number) => {
        const cascadedIds = new Set((d.cascadeIds ?? []).map((c: any) => c.id));
        const pts = [d.segMin, d.segMax,
          ...repBounds.filter(p => p >= d.segMin - 0.1 && p <= d.segMax + 0.1),
          ...schemaMarksRef.current.filter(m => m >= d.segMin - 0.1 && m <= d.segMax + 0.1),
          ...ctx.filter(b => b.level !== d.level && !cascadedIds.has(b.id))
                .flatMap(b => [b.start, b.end]),
          ph,
        ];
        return snapToNearest(v, pts);
      };
      // Cascada vertical: aplica los bloques pre-identificados al inicio del drag
      const cascadeBoundary = (arr: Block[], newT: number) => {
        if (!d.cascadeIds?.length) return arr;
        return arr.map((b: Block) => {
          const ci = d.cascadeIds.find((c: any) => c.id === b.id);
          if (!ci) return b;
          return ci.side === "start" ? { ...b, start: newT } : { ...b, end: newT };
        });
      };
      const cl = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

      if (d.type === "create") {
        let s  = cl(Math.min(d.anchor, t), d.segMin, d.segMax);
        let e2 = cl(Math.max(d.anchor, t), d.segMin, d.segMax);
        s = cl(snap(s), d.segMin, d.segMax); e2 = cl(snap(e2), d.segMin, d.segMax);
        d.ps = s; d.pe = e2;
        const ng = [s, e2].filter(v => v > d.segMin + 0.1 && v < d.segMax - 0.1);
        setGuides(ng);
        setBlocks(prev => [...prev.filter(b => b.id !== d.pid),
          { id: d.pid, level: d.level, start: s, end: e2, label: "…", isPreview: true, repeatId: d.repeatId, pass: d.pass }]);
        return;
      }

      if (d.type === "move") {
        const delta = t - d.anchor, dur2 = d.oe - d.os;
        let ns = cl(d.os + delta, d.segMin, d.segMax - dur2), ne = ns + dur2;
        // Puntos generales de imantación (límites del segmento, marcas y bordes
        // de OTROS niveles — alineación vertical).
        const general = [d.segMin, d.segMax,
          ...schemaMarksRef.current.filter(m => m >= d.segMin - 0.1 && m <= d.segMax + 0.1),
          ...all.filter(b => b.id !== d.bid && b.level !== d.level && b.repeatId === d.repeatId && b.pass === d.pass && !b.isPreview).flatMap(b => [b.start, b.end]),
        ];
        // Vecinos del MISMO nivel (Jon, 2026-07-06): al mover el bloque entero
        // también hay que imantar a ellos, no solo evitar el solape. El INICIO
        // se pega al FIN de un vecino (queda a su derecha); el FIN se pega al
        // INICIO de un vecino (queda a su izquierda). Antes se excluían del
        // imán, así que acercar sin solapar dejaba un hueco.
        const sameLevel = ctx.filter(b => b.level === d.level && b.id !== d.bid && !b.isPreview);
        let snapped = false;
        for (const bv of [...general, ...sameLevel.map(b => b.end)]) { if (Math.abs(ns - bv) < SCHEMA_SNAP_THR) { ns = bv; ne = bv + dur2; snapped = true; break; } }
        if (!snapped) { for (const bv of [...general, ...sameLevel.map(b => b.start)]) { if (Math.abs(ne - bv) < SCHEMA_SNAP_THR) { ne = bv; ns = bv - dur2; break; } } }
        for (const nb of sameLevel) {
          if (ns < nb.end - 0.05 && ne > nb.start + 0.05) {
            if (d.os >= nb.end - 0.3) { ns = nb.end; ne = ns + dur2; }
            else                       { ne = nb.start; ns = ne - dur2; }
          }
        }
        ns = cl(ns, d.segMin, d.segMax - dur2); ne = ns + dur2;
        setGuides([ns, ne]);
        setBlocks(prev => prev.map(b => b.id === d.bid ? { ...b, start: ns, end: ne } : b));
        return;
      }

      if (d.type === "resize-l") {
        const leftNb = d.leftId ? all.find(b => b.id === d.leftId) : null;
        const minNs  = leftNb ? leftNb.end : d.segMin;
        let ns = cl(snapBounds(t), minNs, d.oe - SCHEMA_MIN_DUR);
        // Imán al vecino inmediato del MISMO nivel (Jon, 2026-07-06): snapBounds
        // excluye el propio nivel (para no imantar a cada borde y crear una
        // cuadrícula), así que dos bloques solos NO se pegaban al acercarlos —
        // solo el asa se detenía en el tope. Aquí sí atraemos el borde al canto
        // del vecino contiguo cuando queda a menos del umbral: se imantan.
        if (leftNb && Math.abs(ns - leftNb.end) < SCHEMA_SNAP_THR) ns = leftNb.end;
        setGuides([ns]);
        setBlocks(prev => cascadeBoundary(
          prev.map(b => b.id === d.bid ? { ...b, start: ns } : b),
          ns));
        return;
      }

      if (d.type === "resize-r") {
        const rightNb = d.rightId ? all.find(b => b.id === d.rightId) : null;
        const maxNe   = rightNb ? rightNb.start : d.segMax;
        let ne = cl(snapBounds(t), d.os + SCHEMA_MIN_DUR, maxNe);
        // Imán al vecino inmediato del mismo nivel (ver resize-l).
        if (rightNb && Math.abs(ne - rightNb.start) < SCHEMA_SNAP_THR) ne = rightNb.start;
        setGuides([ne]);
        setBlocks(prev => cascadeBoundary(
          prev.map(b => b.id === d.bid ? { ...b, end: ne } : b),
          ne));
        return;
      }

      if (d.type === "shared-edge") {
        const ns = cl(snapBounds(t), d.leftStart + SCHEMA_MIN_DUR, d.rightEnd - SCHEMA_MIN_DUR);
        setGuides([ns]);
        setBlocks(prev => cascadeBoundary(
          prev.map(b =>
            b.id === d.leftId  ? { ...b, end:   ns } :
            b.id === d.rightId ? { ...b, start: ns } : b),
          ns));
      }
    };

    const onUp = (upEvt: any) => {
      const d = dragRef.current; if (!d) return;
      if (d.type === "create") {
        const dur2    = (d.pe ?? d.anchor) - (d.ps ?? d.anchor);
        const elapsed = Date.now() - (d.downTime ?? 0);
        const movedPx = Math.abs((upEvt?.changedTouches?.[0]?.clientX ?? upEvt?.clientX ?? d.downX) - (d.downX ?? 0));
        const isClick = elapsed < SCHEMA_CLICK_MS && movedPx < SCHEMA_CLICK_MOVE_THR;
        // Bloques creados manualmente en la 2ª vez se marcan overridden
        const overrideFlag = d.pass === "second" ? { overridden: true } : {};

        if (dur2 >= SCHEMA_MIN_DUR || isClick) {
          const ctx   = blocksRef.current.filter(b => b.repeatId === d.repeatId && b.pass === d.pass && !b.isPreview);
          const n     = ctx.filter(b => b.level === d.level).length;
          const label = SCHEMA_DEFAULT_LABELS[d.level]?.[n] ?? String(n + 1);

          if (isClick && dur2 < SCHEMA_MIN_DUR) {
            const segDur = d.segMax - d.segMin;
            const defDur = Math.max(SCHEMA_MIN_DUR * 2, segDur * SCHEMA_CLICK_DUR_FRAC);
            let ns = Math.max(d.segMin, d.anchor - defDur / 2), ne = ns + defDur;
            if (ne > d.segMax) { ne = d.segMax; ns = Math.max(d.segMin, ne - defDur); }
            for (const nb of ctx.filter(b => b.level === d.level)) {
              if (ns < nb.end && ne > nb.start) {
                if (nb.end + defDur <= d.segMax) { ns = nb.end; ne = ns + defDur; }
                else if (nb.start - defDur >= d.segMin) { ne = nb.start; ns = ne - defDur; }
              }
            }
            setBlocks(prev => [...prev.filter(b => b.id !== d.pid),
              { id: d.pid, level: d.level, start: ns, end: ne, label, isPreview: false, repeatId: d.repeatId, pass: d.pass, ...overrideFlag }]);
          } else {
            setBlocks(prev => prev.map(b => b.id === d.pid
              ? { ...b, label, isPreview: false, repeatId: d.repeatId, pass: d.pass, ...overrideFlag } : b));
          }
          setSelected(d.pid);
        } else {
          setHistory(prev => prev.slice(0, -1));
          setBlocks(prev => prev.filter(b => b.id !== d.pid));
        }
      }
      // Si se movió/redimensionó un bloque de 2ª vez, marcarlo como overridden
      if ((d.type === "move" || d.type === "resize-l" || d.type === "resize-r" || d.type === "shared-edge") && d.pass === "second") {
        setBlocks(prev => prev.map(b => {
          if (d.type === "shared-edge") {
            if (b.id === d.leftId || b.id === d.rightId) return { ...b, overridden: true };
          } else {
            if (b.id === d.bid) return { ...b, overridden: true };
          }
          return b;
        }));
      }
      // Si se editó la 1ª vez (o zona normal), re-sincronizar la 2ª vez
      if (viewModeRef.current === "completa" && localRepsRef.current.length > 0 &&
          (d.pass === "first" || d.pass === null)) {
        setBlocks(prev => syncSecondPassBlocks(prev, localRepsRef.current));
      }
      setGuides([]); dragRef.current = null;
    };

    window.addEventListener("mousemove", onMove);  window.addEventListener("mouseup",      onUp);
    window.addEventListener("touchmove", onMove, { passive: false }); window.addEventListener("touchend",   onUp);
    window.addEventListener("touchcancel", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup",     onUp);
      window.removeEventListener("touchmove", onMove); window.removeEventListener("touchend",    onUp);
      window.removeEventListener("touchcancel", onUp);
    };
    // blocksRef/setBlocks/setHistory/setSelected vienen de useSchemaEditor (F7,
    // T7.1) y schemaMarksRef de useListenOnlyMarks (C4.3d), pero siguen siendo
    // la misma referencia estable de useState/useRef de siempre — añadidos al
    // array tras cada troceo, sin cambiar cuándo se reinstala el efecto (nunca
    // cambian de identidad).
  }, [duration, blocksRef, setBlocks, setHistory, setSelected, schemaMarksRef]);

  // ── Inicio de drag en pista (crear bloque) ───────────────────────────────
  const handleTrackSegDown = (e: any, lvId: number, seg: any, pass: string) => {
    if (e.touches && e.touches.length > 1) return; // pinch-to-zoom → ignorar
    if (editId) commitEdit();
    if (e.target.closest("[data-block]")) return;
    const sk = `${lvId}_${seg.index}_${pass}`;
    const el = trackSegRefs.current[sk]; if (!el) return;
    const r = el.getBoundingClientRect();
    const bounds = getSegBounds(seg, pass);
    const t = bounds.min + Math.max(0, Math.min(1, (getClientX(e) - r.left) / r.width)) * (bounds.max - bounds.min);
    setHistory(prev => [...prev, blocksRef.current]);
    // Para segmentos de tipo repeat-first/repeat-second usamos el rep.id y el pass inferido
    const repeatId = seg.type === "repeat" ? seg.rep.id
                   : seg.type === "repeat-first"  ? seg.rep.id
                   : seg.type === "repeat-second" ? seg.rep.id
                   : null;
    const infPass  = seg.type === "repeat"        ? pass
                   : seg.type === "repeat-first"  ? "first"
                   : seg.type === "repeat-second" ? "second"
                   : null;
    dragRef.current = {
      type: "create", level: lvId, anchor: t, pid: uid("sb"),
      ps: t, pe: t, downTime: Date.now(), downX: getClientX(e),
      segKey: sk, segMin: bounds.min, segMax: bounds.max,
      repeatId, pass: infPass,
    };
    setSelected(null); e.preventDefault();
  };

  // ── Inicio de drag en bloque existente (mover / redimensionar) ───────────
  const handleBlockDown = (e: any, block: Block, type = "move") => {
    if (editId) commitEdit();
    if (type === "move" && editId === block.id) return;
    setHistory(prev => [...prev, blocksRef.current]);
    e.stopPropagation(); setSelected(block.id);

    const seg = segmentsRef.current.find(sg => {
      if (sg.type === "normal") return !block.repeatId && block.start >= sg.recStart - 0.01 && block.start < sg.recEnd + 0.01;
      if (sg.type === "repeat-first")  return block.repeatId === sg.rep.id && block.pass === "first";
      if (sg.type === "repeat-second") return block.repeatId === sg.rep.id && block.pass === "second";
      return block.repeatId === sg.rep.id; // legacy "repeat" type
    });
    if (!seg) return;
    const pass = block.pass || "normal";
    const sk   = `${block.level}_${seg.index}_${pass}`;
    const el   = trackSegRefs.current[sk]; if (!el) return;
    const r = el.getBoundingClientRect();
    const bounds = getSegBounds(seg, pass);
    const t = bounds.min + Math.max(0, Math.min(1, (getClientX(e) - r.left) / r.width)) * (bounds.max - bounds.min);

    const ctx = blocksRef.current.filter(b =>
      b.level === block.level && b.id !== block.id &&
      b.repeatId === block.repeatId && b.pass === block.pass && !b.isPreview
    );
    let extra = {};
    if (type === "resize-r") {
      const rn = ctx.filter(b => b.start >= block.end - 0.5).sort((a, b) => a.start - b.start)[0];
      extra = { rightId: rn?.id, rightEnd: rn?.end };
    } else if (type === "resize-l") {
      const ln = ctx.filter(b => b.end <= block.start + 0.5).sort((a, b) => b.end - a.end)[0];
      extra = { leftId: ln?.id, leftStart: ln?.start };
    }
    const cascadeLvs = block.level === 1 ? [2, 3] : block.level === 2 ? [3] : [];
    let cascadeIds: { id: string; side: string }[] = [];
    if (cascadeLvs.length > 0 && (type === "resize-r" || type === "resize-l")) {
      const boundaryT = type === "resize-r" ? block.end : block.start;
      const EPS = 0.05;
      cascadeIds = blocksRef.current
        .filter(b => cascadeLvs.includes(b.level ?? -1) && !b.isPreview &&
          (b.repeatId ?? null) === (block.repeatId ?? null) &&
          (b.pass    ?? null) === (block.pass    ?? null))
        .flatMap(b => {
          const hits: { id: string; side: string }[] = [];
          if (Math.abs(b.start - boundaryT) < EPS) hits.push({ id: b.id, side: "start" });
          if (Math.abs(b.end   - boundaryT) < EPS) hits.push({ id: b.id, side: "end" });
          return hits;
        });
    }
    dragRef.current = {
      type, level: block.level, bid: block.id, anchor: t, os: block.start, oe: block.end,
      segKey: sk, segMin: bounds.min, segMax: bounds.max,
      repeatId: block.repeatId, pass: block.pass, cascadeIds, ...extra,
    };
    e.preventDefault();
  };

  // ── Asa de borde compartido ──────────────────────────────────────────────
  const handleSharedHandleDown = (e: any, leftBlock: Block, rightBlock: Block) => {
    if (editId) commitEdit();
    setHistory(prev => [...prev, blocksRef.current]);
    e.stopPropagation();
    const seg = segmentsRef.current.find(sg => {
      if (sg.type === "normal") return !leftBlock.repeatId;
      if (sg.type === "repeat-first")  return leftBlock.repeatId === sg.rep.id && leftBlock.pass === "first";
      if (sg.type === "repeat-second") return leftBlock.repeatId === sg.rep.id && leftBlock.pass === "second";
      return leftBlock.repeatId === sg.rep.id;
    });
    if (!seg) return;
    const pass = leftBlock.pass || "normal";
    const sk   = `${leftBlock.level}_${seg.index}_${pass}`;
    const el   = trackSegRefs.current[sk]; if (!el) return;
    const r = el.getBoundingClientRect();
    const bounds = getSegBounds(seg, pass);
    const t = bounds.min + Math.max(0, Math.min(1, (getClientX(e) - r.left) / r.width)) * (bounds.max - bounds.min);
    const cascadeLvs2 = leftBlock.level === 1 ? [2, 3] : leftBlock.level === 2 ? [3] : [];
    let cascadeIds2: { id: string; side: string }[] = [];
    if (cascadeLvs2.length > 0) {
      const boundaryT = leftBlock.end;
      const EPS = 0.05;
      cascadeIds2 = blocksRef.current
        .filter(b => cascadeLvs2.includes(b.level ?? -1) && !b.isPreview &&
          (b.repeatId ?? null) === (leftBlock.repeatId ?? null) &&
          (b.pass    ?? null) === (leftBlock.pass    ?? null))
        .flatMap(b => {
          const hits: { id: string; side: string }[] = [];
          if (Math.abs(b.start - boundaryT) < EPS) hits.push({ id: b.id, side: "start" });
          if (Math.abs(b.end   - boundaryT) < EPS) hits.push({ id: b.id, side: "end" });
          return hits;
        });
    }
    dragRef.current = {
      type: "shared-edge", level: leftBlock.level,
      leftId: leftBlock.id, rightId: rightBlock.id,
      leftStart: leftBlock.start, rightEnd: rightBlock.end,
      anchor: t, os: leftBlock.end,
      segKey: sk, segMin: bounds.min, segMax: bounds.max,
      repeatId: leftBlock.repeatId, pass: leftBlock.pass,
      cascadeIds: cascadeIds2,
    };
    e.preventDefault();
  };

  const exSchemaLevels = exercise.schemaLevels as number[] | undefined;
  const activeLevels = SCHEMA_LEVELS.filter(lv =>
    !exSchemaLevels || exSchemaLevels.length === 0 || exSchemaLevels.includes(lv.id)
  );

  // Lookup de bloques activos (según el cursor de reproducción + contexto de repetición)
  const activeAt: Record<number, string> = {};
  for (const b of blocks) {
    if (b.isPreview || time < b.start || time >= b.end) continue;
    if (!b.repeatId) { activeAt[b.level as number] = b.id; continue; }
    if (activeRepeatPass && b.repeatId === activeRepeatPass.repId && b.pass === activeRepeatPass.pass)
      activeAt[b.level as number] = b.id;
  }
  const selBlock = selected ? blocks.find(b => b.id === selected) : null;
  const selLv    = selBlock ? SCHEMA_LEVELS.find(l => l.id === selBlock.level) : null;

  // Props comunes a las 3 invocaciones de <SegBlocks> (normal/repeat-first-second/repeat) —
  // solo cambian seg/pass/lvId en cada sitio de uso.
  const segBlocksCommon = {
    blocks, duration, listenOnly, schemaMarks, guides, time, activeAt, selected, viewMode,
    schemaPalette, editId, editVal, setEditId, setEditVal, commitEdit,
    recToVisX, recToVisXResumed, handleBlockDown, handleSharedHandleDown,
  };

  const handleSubmit = () => onSubmit({ type: "esquema", blocks: blocks.filter(b => !b.isPreview), mode, repetitions: localReps, schemaPalette });

  // ── JSX principal ────────────────────────────────────────────────────────
  return (
    <div style={{ ...S.app, display: "flex", flexDirection: "column" }}>
      <SessionHeader exercise={exercise} onBack={onBack} modelId="esquema" />

      {showRepModal && (
        <RepeatManagerModal
          exercise={{ ...exercise, repetitions: localReps }}
          duration={duration}
          onSave={handleSaveRepetitions}
          onClose={() => setShowRepModal(false)} />
      )}

      <div style={{ maxWidth: 980, width: "100%", margin: "0 auto", padding: "16px 16px 24px", flex: 1 }}
        onMouseDown={e => { const tg = e.target as HTMLElement; if (!tg.closest("[data-block]") && !tg.closest("button") && !tg.closest("input")) { setSelected(null); setSelectedRepId(null); } }}
        onTouchStart={e => { const tg = e.target as HTMLElement; if (!tg.closest("[data-block]") && !tg.closest("button") && !tg.closest("input")) { setSelected(null); setSelectedRepId(null); } }}>

        {modelToggleNode}

        {!listenOnly && mode === "student" && <SessionHint modelId="esquema" />}

        {/* Sección de audio */}
        <section style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 16, padding: "14px 14px 12px", marginBottom: 12 }}>
          {hasAudio && !audioReady && !audioError && <AudioLoadingOverlay />}
          {audioError && <div style={{ textAlign: "center", color: C.danger, fontSize: 12, marginBottom: 8 }}>{audioError}</div>}
          <div style={{ background: C.paper2, borderRadius: 10, overflow: "hidden", border: `1px solid ${C.line}`, marginBottom: 8 }}>
            <WaveformDisplay time={time} timeRef={audioTimeRef} duration={duration} waveformDuration={audioDuration} allIntervals={[]} exerciseId={exercise.id}
              waveformData={waveformData} colorByFn={{}} questionRegion={null}
              onScrubBegin={listenOnly ? () => {} : scrubBegin}
              onScrubTo={listenOnly   ? () => {} : scrubTo}
              onScrubEnd={listenOnly  ? () => {} : scrubEnd} />
          </div>
          {listenOnly ? (
            <div style={{ paddingTop: 10, borderTop: `1px solid ${C.line}` }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 12 }}>
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <CircleButton onClick={() => { seekTo(0); setPlayCount(p => p + 1); }} title="Volver al inicio">⏮</CircleButton>
                </div>
                <CircleButton onClick={togglePlay} primary size={48} disabled={hasAudio && !audioReady && !audioError} title={playing ? "Pausa" : "Reproducir"}>
                  {playing ? "❚❚" : "▶"}
                </CircleButton>
                <div style={{ textAlign: "right", fontFamily: F.sans, fontVariantNumeric: "tabular-nums", fontSize: 22, fontWeight: 600, color: C.ink, letterSpacing: -0.5 }}>
                  {fmtClock(time)}<span style={{ color: C.muted, fontWeight: 400 }}>/{fmtClock(duration)}</span>
                </div>
              </div>
              {playCount > 0 && <div style={{ textAlign: "center", fontFamily: F.sans, fontSize: 11, color: C.muted, marginTop: 8 }}>Reproducido {playCount} {playCount === 1 ? "vez" : "veces"} desde el inicio</div>}
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 12, paddingTop: 10, borderTop: `1px solid ${C.line}` }}>
              {/* Columna izq: switch (si hay repeticiones) + ⏮ a la derecha */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                {hasRepeats ? <ViewModeToggle viewMode={viewMode} onChange={setViewMode} /> : <div />}
                <CircleButton onClick={() => seekTo(0)} title="Volver al inicio">⏮</CircleButton>
              </div>
              {/* Columna central: ▶ centrado */}
              <CircleButton onClick={() => { if (time >= duration) seekTo(0); togglePlay(); }} primary size={48} disabled={hasAudio && !audioReady && !audioError} title={playing ? "Pausar" : "Reproducir"}>
                {playing ? "❚❚" : "▶"}
              </CircleButton>
              <div style={{ textAlign: "right", fontFamily: F.sans, fontVariantNumeric: "tabular-nums", fontSize: 22, fontWeight: 600, color: C.ink, letterSpacing: -0.5 }}>
                {fmtClock(time)}<span style={{ color: C.muted, fontWeight: 400 }}>/{fmtClock(duration)}</span>
              </div>
            </div>
          )}
        </section>

        {/* Selector de paleta — discreto y desplegable. Solo si hay nivel de
            Partes o Frases activo (afecta a esos niveles, no a Armonía/Texto). */}
        {!listenOnly && activeLevels.some(lv => lv.id === 1 || lv.id === 2) && (
          <SchemaPalettePicker schemaPalette={schemaPalette} onChange={setSchemaPalette} />
        )}

        {/* Regla + pistas (layout flex-segmentado) */}
        <div ref={schemaOuterRef} style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 12, overflow: "hidden", marginBottom: schemaZoom > 1 ? 4 : 12, position: "relative" }}
          onTouchStart={handleSchemaPinchStart}
          onTouchMove={handleSchemaPinchMove}
          onTouchEnd={handleSchemaPinchEnd}
        >
          {/* Contenedor de escala: width = zoom*100% con translateX para desplazamiento */}
          <div style={{
            width: schemaZoom > 1 ? `${schemaZoom * 100}%` : "100%",
            position: "relative",
            transform: schemaZoom > 1
              ? `translateX(-${schemaScrollFrac * (1 - 1 / schemaZoom) * 100}%)`
              : "none",
            willChange: schemaZoom > 1 ? "transform" : "auto",
          }}>

          {/* ── BANDA DE REPETICIÓN — dentro del wrapper de zoom para que
               las marcas estén siempre alineadas con la regla y las pistas ── */}
          {viewMode === "completa" && (
            <RepeatBand
              duration={duration}
              blocks={blocks}
              localReps={localReps}
              setLocalReps={setLocalReps}
              onSaveRepetitions={handleSaveRepetitions}
              onDeleteRepeat={deleteRepeat}
              selectedRepId={selectedRepId}
              setSelectedRepId={setSelectedRepId}
              onDeselectBlock={() => setSelected(null)}
            />
          )}

          {/* ── REGLA ── */}
          <div ref={rulerContainerRef}
            style={{ display: "flex", borderBottom: `1px solid ${C.line}`, userSelect: "none", touchAction: "none", overflow: "hidden", position: "relative" }}
            {...(listenOnly ? { onMouseDown: handleMarksContainerDown, onTouchStart: handleMarksContainerDown } : {})}>

            {/* ── Playhead global: línea + bola a lo largo de TODA la regla ──
                 Se calcula con recToVisX para que sea continuo entre segmentos.
                 En la doble fila (segmento "repeat", vista resumida) la bola se
                 posiciona en la fila correcta (arriba = 1ª vez, abajo = 2ª vez).
                 zIndex 30 para aparecer por encima de todo lo demás en la regla. */}
            {!listenOnly && (() => {
              // Determinar posición horizontal y vertical de la bola
              let xPct = recToVisX(time) * 100;
              // En resumida: bola en fila superior (y=25%) durante la 1ª vez,
              // y en fila inferior (y=75%) durante la 2ª vez y en secciones normales.
              // La x se calcula dentro del rango insetado por REPEAT_BARLINE_W en
              // ambos extremos, igual que la línea vertical del esquema.
              let yPct = viewMode === "resumida" && hasRepeats ? 75 : 50;
              for (const sg of segments) {
                if (sg.type !== "repeat") continue;
                const fp = sg.rep.first, sp = sg.rep.second;
                if (time < fp.start || time >= sp.end) continue; // este segmento no contiene el tiempo actual
                const fd = (fp.end - fp.start) || 1;
                const sd = (sp.end - sp.start) || 1;
                const barFrac = rulerW > 0 ? REPEAT_BARLINE_W / rulerW : 0;
                const segVW   = sg.vEnd - sg.vStart;
                const innerVW = segVW - 2 * barFrac;
                if (time >= fp.start && time < fp.end) {
                  xPct = (sg.vStart + barFrac + (time - fp.start) / fd * innerVW) * 100;
                  yPct = 25; // centro de la fila 1ª (14 px de 57 px = 24.6 %)
                } else if (time >= sp.start && time < sp.end) {
                  xPct = (sg.vStart + barFrac + (time - sp.start) / sd * innerVW) * 100;
                  yPct = 75; // centro de la fila 2ª
                }
                break; // segmento encontrado
              }
              return (
                <div style={{ position: "absolute", top: `${yPct}%`, left: `${xPct}%`, transform: "translate(-50%,-50%)", width: 14, height: 14, borderRadius: "50%", background: C.danger, border: `2px solid ${C.paper}`, boxShadow: "0 1px 4px rgba(0,0,0,0.25)", pointerEvents: "none", zIndex: 31 }} />
              );
            })()}

            {/* ── Guía de resize de barra de repetición ── */}
            {repResizeGuide && (
              <div style={{ position: "absolute", top: 0, bottom: 0, left: `${repResizeGuide.xFrac * 100}%`, width: 1.5, background: repResizeGuide.color, transform: "translateX(-50%)", pointerEvents: "none", zIndex: 28 }} />
            )}

            {/* ── Overlay de dibujo de repetición ── */}
            {segments.map((seg, si) => {
              if (seg.type === "normal") {
                const bounds  = getSegBounds(seg, "normal");
                const segDur  = (bounds.max - bounds.min) || 1;
                return (
                  <div key={si}
                    ref={el => { trackSegRefs.current[`ruler_${si}_normal`] = el; }}
                    style={{ flex: seg.canonDur, position: "relative", height: viewMode === "resumida" && hasRepeats ? 57 : 28, background: C.paper2, cursor: listenOnly ? "crosshair" : "pointer", overflow: "hidden" }}
                    {...(!listenOnly ? { onMouseDown: e => handleSegRulerDown(e, seg, "normal"), onTouchStart: e => handleSegRulerDown(e, seg, "normal") } : {})}>
                    {/* Pista horizontal — en resumida alineada con el centro de la 2ª vez */}
                    <div style={{ position: "absolute", top: viewMode === "resumida" && hasRepeats ? "75%" : "50%", left: 0, right: 0, height: 2.5, background: `${C.muted}55`, transform: "translateY(-50%)", pointerEvents: "none", zIndex: 3 }} />
                    {/* Marcas listen-only */}
                    {listenOnly && schemaMarks.filter(mt => mt >= bounds.min && mt < bounds.max).map((mt, mi) => {
                      const pct = ((mt - bounds.min) / segDur) * 100;
                      const globalIdx = schemaMarks.indexOf(mt);
                      return (
                        <div key={mi} data-mark="true"
                          style={{ position: "absolute", top: 0, left: `${pct}%`, width: 28, height: "100%", transform: "translateX(-50%)", zIndex: 15, cursor: "grab", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start" }}
                          onMouseDown={e => handleMarkDown(e, globalIdx)} onTouchStart={e => handleMarkDown(e, globalIdx)}>
                          <div style={{ width: 2, height: "100%", background: "rgba(184,74,58,0.6)", position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", pointerEvents: "none" }} />
                          <div style={{ width: 12, height: 12, borderRadius: "50%", background: C.danger, border: "2px solid white", marginTop: 4, boxShadow: "0 1px 3px rgba(0,0,0,0.3)", position: "relative", zIndex: 1, flexShrink: 0 }} />
                          <span style={{ fontSize: 8, color: C.danger, fontFamily: FONT_SANS, position: "relative", zIndex: 1, lineHeight: 1.2, marginTop: 1, pointerEvents: "none", fontVariantNumeric: "tabular-nums" }}>{fmtClock(mt)}</span>
                        </div>
                      );
                    })}
                    {/* Ayuda listen-only (en el último segmento normal) */}
                    {listenOnly && si === segments.length - 1 && (
                      <div style={{ position: "absolute", top: 0, right: 0, bottom: 0, display: "flex", alignItems: "center", paddingRight: 6, pointerEvents: "none", zIndex: 12 }}>
                        <span style={{ fontSize: 8, color: C.muted, fontFamily: FONT_SANS, background: C.paper2, padding: "2px 5px", borderRadius: 4, border: `1px solid ${C.line}` }}>clic = añadir marca · arrastrar = mover · clic en marca = borrar</span>
                      </div>
                    )}
                  </div>
                );
              }

              // ── Segmento de repetición en vista completa: regla continua ──
              if (seg.type === "repeat-first" || seg.type === "repeat-second") {
                const isFirst = seg.type === "repeat-first";
                const pass    = isFirst ? "first" : "second";
                const bounds  = getSegBounds(seg, pass);
                const isActive = time >= bounds.min && time < bounds.max;
                const zoneBg  = C.paper2;
                return (
                  <div key={si}
                    ref={el => { trackSegRefs.current[`ruler_${si}_${pass}`] = el; }}
                    style={{ flex: seg.canonDur, position: "relative", height: 28, background: isActive ? `${isFirst ? C.fnS : C.fnT}12` : zoneBg, cursor: listenOnly ? "default" : "pointer", overflow: "hidden" }}
                    {...(!listenOnly ? {
                      onMouseDown:  e => handleSegRulerDown(e, seg, pass),
                      onTouchStart: e => handleSegRulerDown(e, seg, pass),
                    } : {})}>
                    {/* Pista horizontal continua */}
                    <div style={{ position: "absolute", top: "50%", left: 0, right: 0, height: 2.5, background: isActive ? `${isFirst ? C.fnS : C.fnT}55` : `${C.muted}40`, transform: "translateY(-50%)", pointerEvents: "none", zIndex: 3, transition: "background .15s" }} />
                  </div>
                );
              }

              // ── Segmento de repetición en la regla (doble altura) ──────────
              const { rep } = seg;
              const isFA = time >= rep.first.start  && time < rep.first.end;
              const isSA = time >= rep.second.start && time < rep.second.end;
              return (
                <div key={si} style={{ flex: seg.canonDur, position: "relative", display: "flex", flexDirection: "column" }}>
                  {/* Sin barras SVG aquí: el overlay del card exterior las pinta de forma continua */}

                  {/* Overlay de navegación continua (resumida): cubre ambas filas,
                      determina la vez por posición vertical del puntero */}
                  {viewMode === "resumida" && !listenOnly && (
                    <div style={{ position: "absolute", inset: 0, zIndex: 22, cursor: "pointer" }}
                      onMouseDown={e => handleDoubleRowRulerDown(e, seg, e.currentTarget.parentElement)}
                      onTouchStart={e => handleDoubleRowRulerDown(e, seg, e.currentTarget.parentElement)} />
                  )}

                  {/* ── Fila 1ª vez ── */}
                  <div ref={el => { trackSegRefs.current[`ruler_${si}_first`] = el; }}
                    style={{ flexShrink: 0, height: 28, position: "relative", background: isFA ? `${C.fnS}10` : C.paper2, cursor: listenOnly ? "default" : "pointer", overflow: "hidden", transition: "background .15s" }}
                    onMouseDown={!listenOnly && viewMode !== "resumida" ? (e => handleRepZoneRulerDown(e, seg, "first")) : undefined}
                    onTouchStart={!listenOnly && viewMode !== "resumida" ? (e => handleRepZoneRulerDown(e, seg, "first")) : undefined}
                    onMouseMove={!listenOnly && viewMode !== "resumida" ? (e => handleRepRowMouseMove(e, trackSegRefs.current[`ruler_${si}_first`])) : undefined}
                    onMouseLeave={!listenOnly && viewMode !== "resumida" ? (() => { const el = trackSegRefs.current[`ruler_${si}_first`]; if (el) el.style.cursor = ""; }) : undefined}>
                    {/* Franja + etiqueta + línea en flex */}
                    <div style={{ display: "flex", alignItems: "center", position: "absolute", inset: 0, pointerEvents: "none", zIndex: 4 }}>
                      <span style={{ fontSize: 11, fontWeight: 800, fontFamily: FONT_SANS, color: isFA ? C.fnS : `${C.fnS}80`, paddingLeft: 8, paddingRight: 3, flexShrink: 0, letterSpacing: -0.3, lineHeight: 1, transition: "color .15s" }}>1ª</span>
                      <div style={{ flex: 1, height: 2.5, marginRight: 18, background: isFA ? `${C.fnS}55` : `${C.muted}40`, transition: "background .15s" }} />
                    </div>
                    {/* Barra de repetición de cierre — alineada con la de las pistas */}
                    {(() => {
                      const THICK = 3.5, THIN = 1.3, GAP = 2.5, DOT_R = 1.3;
                      const col = isFA ? C.fnS : `${C.fnS}88`;
                      return (
                        <div style={{ position: "absolute", top: 0, bottom: 0, right: 0, width: REPEAT_BARLINE_W, pointerEvents: "none", zIndex: 6 }}>
                          {/* Dots */}
                          <div style={{ position: "absolute", top: "33%", left: 1.5, width: DOT_R * 2, height: DOT_R * 2, borderRadius: "50%", background: col, transform: "translateY(-50%)", transition: "background .15s" }} />
                          <div style={{ position: "absolute", top: "67%", left: 1.5, width: DOT_R * 2, height: DOT_R * 2, borderRadius: "50%", background: col, transform: "translateY(-50%)", transition: "background .15s" }} />
                          {/* Barra fina */}
                          <div style={{ position: "absolute", top: 0, bottom: 0, right: THICK + GAP + 0.5, width: THIN, background: col, opacity: 0.55, transition: "background .15s" }} />
                          {/* Barra gruesa */}
                          <div style={{ position: "absolute", top: 0, bottom: 0, right: 0.5, width: THICK, background: col, opacity: 0.9, transition: "background .15s" }} />
                        </div>
                      );
                    })()}
                  </div>

                  {/* ── Separador entre filas ─────────────────────────────────── */}
                  <div style={{ flexShrink: 0, height: 1, background: C.line, marginLeft: 8, pointerEvents: "none", zIndex: 6 }} />

                  {/* ── Fila 2ª vez ── */}
                  <div ref={el => { trackSegRefs.current[`ruler_${si}_second`] = el; }}
                    style={{ flexShrink: 0, height: 28, position: "relative", background: isSA ? `${C.fnT}10` : C.paper2, cursor: listenOnly ? "default" : "pointer", overflow: "hidden", transition: "background .15s" }}
                    onMouseDown={!listenOnly && viewMode !== "resumida" ? (e => handleRepZoneRulerDown(e, seg, "second")) : undefined}
                    onTouchStart={!listenOnly && viewMode !== "resumida" ? (e => handleRepZoneRulerDown(e, seg, "second")) : undefined}
                    onMouseMove={!listenOnly && viewMode !== "resumida" ? (e => handleRepRowMouseMove(e, trackSegRefs.current[`ruler_${si}_second`])) : undefined}
                    onMouseLeave={!listenOnly && viewMode !== "resumida" ? (() => { const el = trackSegRefs.current[`ruler_${si}_second`]; if (el) el.style.cursor = ""; }) : undefined}>
                    {/* Franja + etiqueta + línea en flex */}
                    <div style={{ display: "flex", alignItems: "center", position: "absolute", inset: 0, pointerEvents: "none", zIndex: 4 }}>
                      <span style={{ fontSize: 11, fontWeight: 800, fontFamily: FONT_SANS, color: isSA ? C.fnT : `${C.fnT}80`, paddingLeft: 8, paddingRight: 3, flexShrink: 0, letterSpacing: -0.3, lineHeight: 1, transition: "color .15s" }}>2ª</span>
                      <div style={{ flex: 1, height: 2.5, background: isSA ? `${C.fnT}55` : `${C.muted}40`, transition: "background .15s" }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── Separador visual entre regla de navegación y pistas del esquema ── */}
          <div style={{ height: 6, background: C.bg, flexShrink: 0 }} />

          {/* ── Fila de timestamps — solo en vista completa ── */}
          {viewMode !== "resumida" && (
            <div style={{ display: "flex", borderBottom: `1px solid ${C.line}`, background: C.paper, height: 18, flexShrink: 0, overflow: "hidden", userSelect: "none", pointerEvents: "none" }}>
              {segments.map((seg, si) => {
                // Un segmento "normal" usa SUS PROPIOS límites (Jon,
                // 2026-07-07) — antes caía siempre en {0, duration} sin
                // importar dónde empezaba de verdad. Con una repetición que
                // no llega al final (o con un hueco entre el original y la
                // repetición), el "normal" siguiente/intermedio arrancaba en
                // recStart>0 pero su regla se pintaba como si arrancara en 0,
                // reiniciando los timestamps a mitad de la pieza.
                const bounds = seg.type === "repeat-first" ? { min: seg.rep.first.start, max: seg.rep.first.end }
                             : seg.type === "repeat-second" ? { min: seg.rep.second.start, max: seg.rep.second.end }
                             : { min: seg.recStart ?? 0, max: seg.recEnd ?? duration };
                const segWidthPx = rulerW * (seg.vEnd - seg.vStart);
                const ticks = rulerTicksForSeg(bounds.min, bounds.max, segWidthPx);
                return (
                  <div key={si} style={{ flex: seg.canonDur, position: "relative", height: "100%", borderRight: si < segments.length - 1 ? `1px solid ${C.line}` : "none" }}>
                    {ticks.map(({ t, frac }) => (
                      <div key={t} style={{ position: "absolute", top: 0, bottom: 0, left: `${frac * 100}%`, display: "flex", flexDirection: "column", alignItems: "center" }}>
                        <div style={{ width: 1, height: 5, background: C.muted, opacity: 0.5 }} />
                        <span style={{ fontSize: 8, color: C.muted, fontFamily: FONT_SANS, fontWeight: 500, transform: "translateX(-50%)", whiteSpace: "nowrap", lineHeight: 1, marginTop: 1, fontVariantNumeric: "tabular-nums" }}>{fmtClock(t)}</span>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}

          {/* ── PISTAS POR NIVEL con barras de repetición por nivel ── */}
          <div style={{ position: "relative" }}>
          {activeLevels.map((lv, li) => (
            <div key={lv.id} style={{ display: "flex", position: "relative", borderBottom: li < activeLevels.length - 1 ? `2px solid ${C.line}` : "none" }}>
              {/* Franja de color del nivel — posición absoluta para no afectar al layout flex */}
              <div style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: 3, background: lv.color, zIndex: 2, pointerEvents: "none" }} />
              {segments.map((seg, si) => {
                if (seg.type === "normal") {
                  return (
                    <div key={si}
                      ref={el => { trackSegRefs.current[`${lv.id}_${si}_normal`] = el; }}
                      style={{ flex: seg.canonDur, position: "relative", height: lv.id === 1 ? 62 : lv.id === 2 ? 52 : 44, background: C.paper, cursor: "crosshair", userSelect: "none", touchAction: "none" }}
                      onMouseDown={e => handleTrackSegDown(e, lv.id, seg, "normal")}
                      onTouchStart={e => handleTrackSegDown(e, lv.id, seg, "normal")}>
                      {/* Etiqueta del nivel (solo en el primer segmento) */}
                      {si === 0 && (
                        <div style={{ position: "absolute", top: 4, left: 6, zIndex: 1, pointerEvents: "none" }}>
                          <span style={{ fontSize: 9, fontWeight: 700, color: lv.color, letterSpacing: 0.3, opacity: 0.35, fontFamily: FONT_SANS }}>{lv.sub}</span>
                        </div>
                      )}
                      <SegBlocks seg={seg} pass="normal" lvId={lv.id} {...segBlocksCommon} />
                    </div>
                  );
                }

                // ── Segmentos de repetición en vista completa (fila única, continua) ──
                if (seg.type === "repeat-first" || seg.type === "repeat-second") {
                  const isFirst = seg.type === "repeat-first";
                  const pass    = isFirst ? "first" : "second";
                  return (
                    <div key={si} style={{ flex: seg.canonDur, position: "relative", height: lv.id === 1 ? 62 : lv.id === 2 ? 52 : 44, background: C.paper, cursor: "crosshair", userSelect: "none", touchAction: "none" }}>
                      <div
                        ref={el => { trackSegRefs.current[`${lv.id}_${si}_${pass}`] = el; }}
                        style={{ position: "absolute", inset: 0 }}
                        onMouseDown={e => handleTrackSegDown(e, lv.id, seg, pass)}
                        onTouchStart={e => handleTrackSegDown(e, lv.id, seg, pass)}>
                        {si === 0 && (
                          <div style={{ position: "absolute", top: 4, left: 6, zIndex: 1, pointerEvents: "none" }}>
                            <span style={{ fontSize: 9, fontWeight: 700, color: lv.color, letterSpacing: 0.3, opacity: 0.35, fontFamily: FONT_SANS }}>{lv.sub}</span>
                          </div>
                        )}
                        {/* Indicador visual sutil de zona de repetición en 2ª vez */}
                        {!isFirst && (
                          <div style={{ position: "absolute", inset: 0, background: `${lv.color}09`, pointerEvents: "none", zIndex: 0 }} />
                        )}
                        <SegBlocks seg={seg} pass={pass} lvId={lv.id} {...segBlocksCommon} />
                      </div>
                    </div>
                  );
                }

                // ── Segmento de repetición en la pista (fila única activa) ──────
                const { rep } = seg;
                const isFA = time >= rep.first.start  && time < rep.first.end;
                const isSA = time >= rep.second.start && time < rep.second.end;
                // Qué vez mostrar: la que suena, o la seleccionada manualmente
                const displayPass = isFA ? "first" : isSA ? "second" : (selectedPass[rep.id] || "first");
                // Barlines en todos los niveles del esquema
                const barInset = REPEAT_BARLINE_W;

                return (
                  <div key={si} style={{ flex: seg.canonDur, position: "relative", height: lv.id === 1 ? 62 : lv.id === 2 ? 52 : 44, background: C.paper, cursor: "crosshair", userSelect: "none", touchAction: "none" }}>
                    {/* Zona de interacción — insetada barInset px para los niveles que llevan barras */}
                    <div
                      ref={el => {
                        trackSegRefs.current[`${lv.id}_${si}_first`]  = el;
                        trackSegRefs.current[`${lv.id}_${si}_second`] = el;
                      }}
                      style={{ position: "absolute", top: 0, bottom: 0, left: barInset, right: barInset }}
                      {...(viewMode !== "resumida" ? {
                        onMouseDown:  e => handleTrackSegDown(e, lv.id, seg, displayPass),
                        onTouchStart: e => handleTrackSegDown(e, lv.id, seg, displayPass),
                      } : {})}>
                      {si === 0 && (
                        <div style={{ position: "absolute", top: 4, left: 4, zIndex: 1, pointerEvents: "none" }}>
                          <span style={{ fontSize: 9, fontWeight: 700, color: lv.color, letterSpacing: 0.3, opacity: 0.35, fontFamily: FONT_SANS }}>{lv.sub}</span>
                        </div>
                      )}
                      <SegBlocks seg={seg} pass={displayPass} lvId={lv.id} {...segBlocksCommon} />
                    </div>
                  </div>
                );
              })}
            </div>
          ))}

          {/* ── Barras de repetición — solo niveles 1 y 2, condicionadas por tamaño ──
               position:absolute relativo al contenedor PISTAS (position:relative).
               Si la sección repetida coincide con un bloque de nivel 1 (Parte),
               la barra abarca niveles 1+2. Si solo coincide con frases, solo nivel 2. ── */}
          {viewMode === "resumida" && (() => {
            const THICK=3, THIN=1, GAP=2, SPACE=3, DOT_R=2.3, DOT_GAP=8;
            const DW = DOT_R*2;
            const BW_S = THICK + GAP + THIN + SPACE + DW + 1;
            const BW_C = DW + SPACE + THIN + GAP + THICK + GAP + THIN + SPACE + DW;
            const dt1=`calc(50% - ${DOT_GAP+DOT_R}px)`, dt2=`calc(50% + ${DOT_GAP-DOT_R}px)`;
            const D=(extra: React.CSSProperties): React.CSSProperties=>({position:"absolute",width:DW,height:DW,borderRadius:"50%",background:"rgba(0,0,0,0.70)",...extra});
            const V=(extra: React.CSSProperties): React.CSSProperties=>({position:"absolute",top:0,bottom:0,background:"rgba(0,0,0,0.72)",...extra});
            const Vt=(extra: React.CSSProperties): React.CSSProperties=>({position:"absolute",top:0,bottom:0,background:"rgba(0,0,0,0.28)",...extra});

            // Todas las repeticiones cubren todos los niveles activos.
            // top=0, bottom=0 → span completo del contenedor PISTAS.
            const ev = new Map();
            const kv = (v: number) => v.toFixed(5);
            segments.filter(s => s.type === "repeat").forEach(seg => {
              const ks = kv(seg.vStart);
              if (!ev.has(ks)) ev.set(ks, { v: seg.vStart, isStart: false, isEnd: false });
              ev.get(ks).isStart = true;
              const ke = kv(seg.vEnd);
              if (!ev.has(ke)) ev.set(ke, { v: seg.vEnd, isStart: false, isEnd: false });
              ev.get(ke).isEnd = true;
            });

            return [...ev.values()].map(({ v, isStart, isEnd }, bi) => {
              if (isStart && isEnd) {
                const cx = BW_C/2;
                return (
                  <div key={bi} style={{ position:"absolute", top:0, bottom:0, left:`${v*100}%`, width:BW_C, transform:"translateX(-50%)", pointerEvents:"none", zIndex:18 }}>
                    <div style={D({left:0, top:dt1})} /><div style={D({left:0, top:dt2})} />
                    <div style={Vt({left:DW+SPACE, width:THIN})} />
                    <div style={V({left:cx-THICK/2, width:THICK})} />
                    <div style={Vt({right:DW+SPACE, width:THIN})} />
                    <div style={D({right:0, top:dt1})} /><div style={D({right:0, top:dt2})} />
                  </div>
                );
              } else if (isStart) {
                const dL = THICK+GAP+THIN+SPACE;
                return (
                  <div key={bi} style={{ position:"absolute", top:0, bottom:0, left:`${v*100}%`, width:BW_S, pointerEvents:"none", zIndex:18 }}>
                    <div style={V({left:0.5, width:THICK})} />
                    <div style={Vt({left:THICK+GAP+0.5, width:THIN})} />
                    <div style={D({left:dL, top:dt1})} /><div style={D({left:dL, top:dt2})} />
                  </div>
                );
              } else {
                const dR = THICK+GAP+THIN+SPACE;
                return (
                  <div key={bi} style={{ position:"absolute", top:0, bottom:0, left:`${v*100}%`, width:BW_S, transform:"translateX(-100%)", pointerEvents:"none", zIndex:18 }}>
                    <div style={D({right:dR, top:dt1})} /><div style={D({right:dR, top:dt2})} />
                    <div style={Vt({right:THICK+GAP+0.5, width:THIN})} />
                    <div style={V({right:0.5, width:THICK})} />
                  </div>
                );
              }
            });
          })()}
          </div>
          </div>{/* /contenedor de escala */}
        </div>

        {/* ── Barra de desplazamiento horizontal del esquema ─────────────────
             Aparece debajo del esquema cuando el zoom es > 1.
             En ordenador: usar la rueda del ratón para hacer zoom.
             En móvil: pellizcar con dos dedos para hacer zoom.  ── */}
        {schemaZoom > 1 && (() => {
          const thumbW  = Math.max(4, 100 / schemaZoom);
          const thumbL  = schemaScrollFrac * (100 - thumbW);
          return (
            <div style={{ marginBottom: 12, marginTop: 0 }}>
              {/* Track */}
              <div
                style={{ height: 14, background: C.paper, border: `1px solid ${C.line}`, borderRadius: 7, position: "relative", cursor: "pointer", userSelect: "none", overflow: "hidden", touchAction: "none" }}
                onMouseDown={handleScrollbarTrackDown}
                onTouchStart={handleScrollbarTrackDown}
              >
                {/* Thumb */}
                <div style={{
                  position: "absolute", top: 2, bottom: 2,
                  left: `${thumbL}%`, width: `${thumbW}%`,
                  background: C.muted, borderRadius: 5, pointerEvents: "none",
                  transition: "background .12s",
                }} />
                {/* Indicador de zoom */}
                <div style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", fontSize: 9, color: C.muted2, fontFamily: FONT_SANS, fontWeight: 600, pointerEvents: "none", letterSpacing: 0.3 }}>
                  ×{schemaZoom.toFixed(1)}
                </div>
              </div>

            </div>
          );
        })()}

        {/* Panel de selección de bloque (C4.3b) */}
        <BlockDetailPanel
          selBlock={selBlock} selLv={selLv} selected={selected} selectedRepId={selectedRepId}
          localReps={localReps} blocks={blocks} schemaPalette={schemaPalette} colorInputRef={colorInputRef}
          setBlocks={setBlocks} setHistory={setHistory} blocksRef={blocksRef}
          setSelected={setSelected} setSelectedRepId={setSelectedRepId}
          setEditId={setEditId} setEditVal={setEditVal} deleteRepeat={deleteRepeat}
        />


      </div>

      <StickyActionBar
        secondary={listenOnly ? null : (
          <div style={{ display: "flex", gap: 8 }} onMouseDown={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()}>
            <BarIconButton onClick={undo} disabled={history.length === 0} title="Deshacer">↩</BarIconButton>
            <BarIconButton onClick={resetAll} disabled={blocks.filter(b => !b.isPreview).length === 0} title="Borrar todo" danger>✕</BarIconButton>
          </div>
        )}
        info={
          listenOnly ? (
            <>
              <span style={{ fontFamily: F.sans, fontSize: 13, fontWeight: 600, color: C.ink }}>
                {(() => { const n = schemaMarks.length; return n === 0 ? "Sin marcas todavía" : `${n} ${n === 1 ? "marca" : "marcas"}`; })()}
              </span>
              <span style={{ fontFamily: F.sans, fontSize: 11, color: C.muted }}>Toca la regla para añadir una marca</span>
            </>
          ) : (
            <>
              <span style={{ fontFamily: F.sans, fontSize: 13, fontWeight: 600, color: C.ink }}>
                {(() => { const n = blocks.filter(b => !b.isPreview).length; return n === 0 ? "Sin bloques todavía" : `${n} ${n === 1 ? "bloque" : "bloques"}`; })()}
              </span>
              <span style={{ fontFamily: F.sans, fontSize: 11, color: C.muted }}>Arrastra en una pista para crear</span>
            </>
          )
        }>
        <BarSubmitButton onClick={handleSubmit} accent={C.fnD}>
          {mode === "record" ? "Guardar clave" : mode === "preview" ? "Ver resultado" : "Entregar"}
        </BarSubmitButton>
      </StickyActionBar>
    </div>
  );
}
