import React, { useState, useEffect, useRef, useMemo } from "react";

/* ═══════════════════════════════════════════════════════════════════════════
   FUNCIONES ARMÓNICAS · APP ROOT
   ───────────────────────────────────────────────────────────────────────────
   Funciones puras, constantes de dominio, tokens y datos semilla viven ahora en
   módulos bajo src/lib, src/theme y src/seed.js (extraídos en la Fase 0). Este
   archivo conserva los componentes React y el estado global de App().
   ═══════════════════════════════════════════════════════════════════════════ */

import { TEACHER_TAB_PATH, useHashRoute } from "./lib/routing.js";
import { C, F, S, FONT_SANS, FONT_SERIF, FONT_MONO, SECTION_STYLE, disabledStyle } from "./theme/tokens.js";
import { DEFAULT_CATEGORY, CATEGORY_COLORS, KEY_SEQUENCE, INIT_EXERCISES, INIT_AUDIO_LIBRARY } from "./seed.js";
import { DEFAULT_MODEL_ID, MODEL_COMBOS, comboIdFromModels, categoriesOf, modelOf, modelsOf, answerFor, answerStats, btnOf, questionsOf, audioComposers, audioTags } from "./lib/domain.js";
import { SCHEMA_LEVELS, SCHEMA_DEFAULT_LABELS, SCHEMA_SNAP_THR, SCHEMA_MIN_DUR, SCHEMA_CLICK_MS, SCHEMA_CLICK_MOVE_THR, SCHEMA_CLICK_DUR_FRAC, SCHEMA_HND_VISUAL_W } from "./lib/schema.js";
import { SCHEMA_PALETTES, SCHEMA_PALETTE_DEFAULT, getSchemaPalette, effectivePaletteId, applyPaletteToExercise, partColorFromPalette, phraseColorFromPalette, schemaBlockColor, snapToNearest } from "./lib/palette.js";
import { harmonyBlockColors } from "./lib/harmony.js";
import { textOn, scoreColor } from "./lib/color.js";
import { calcScore, calcQuestionnaireScore, calcSchemaPlacementScore } from "./lib/scoring.js";
import { fmt, uid, toggleInSet } from "./lib/ids.js";
import { buildWaveformFromPCM, fetchAudioBuffer } from "./lib/audio.js";

import { startPointerDrag } from "./lib/pointer.js";

import { generateSalt, hashCredential } from "./auth/crypto.js";


// ═══ 5. PRIMITIVOS UI COMPARTIDOS ═══════════════════════════════════════════

import { useInjectFonts } from "./theme/fonts.js";
import { useIsMobile } from "./hooks/useIsMobile.js";
import { ModalShell, ConfirmModal, ErrorMsg, TabBar, ScoreBadge, CredentialInput, CircleButton, AudioLoadingOverlay, ModalFooter, SessionHeader, SessionHint, StickyActionBar, BarSubmitButton, BarIconButton, Chevron, StatusCircle, ProgressRing, CategoryDots, SuggestInput, TagInput, AudioWaveIcon, EyeButton, EditIconButton, DeleteIconButton, RemoveIconButton, FilterDropdown, TeacherFilterBar, StudentFilterBar, Overline, GhostButton, CtaButton, FieldLabel, MetaItem } from "./components/primitives.jsx";

// ═══ 6. VISTAS DE AUTENTICACIÓN ═════════════════════════════════════════════

import { SetupView, LoginView, HomeView, ForgotPinView, ResetPinView, TeacherPickerView } from "./components/auth.jsx";

// ═══ 7. VISTAS DE ALUMNO ════════════════════════════════════════════════════

import { MODEL_META, modelMeta } from "./lib/modelMeta.js";

import { ModelToggleBar, ExerciseRow } from "./components/student.jsx";

// Dashboard del alumno — cabecera editorial + pestañas + riel de cursos
function StudentDash({ user, exercises, results, courses, units, groups = [], onExercise, onViewCorrection, onLogout, onChangeTeacher, onUpdatePalette, tab = "all", onTab }) {
  const isMobile = useIsMobile();
  const view    = tab;             // controlado por la URL
  const setView = onTab || (() => {});
  const [filterModel,   setFilterModel]   = useState("all");
  const [filterDone,    setFilterDone]    = useState("all");

  const teacherCourses = useMemo(() => {
    const studentGroupIds = new Set(groups.filter((g) => g.studentIds?.includes(user.id)).map((g) => g.id));
    return courses.filter((c) => {
      if (c.hidden) return false;
      const vis = c.visibility ?? "teacher";
      if (vis === "public")  return true;
      if (vis === "group")   return studentGroupIds.has(c.visibilityGroupId);
      // "teacher" (default): cursos del profesor asignado
      if (!c.ownerId) return true;
      return c.ownerId === user.teacherId;
    });
  }, [courses, groups, user.id, user.teacherId]);

  const filteredExercises = useMemo(() => {
    return exercises.filter((ex) => {
      if (ex.hidden) return false;
      if (filterModel !== "all" && !modelsOf(ex).includes(filterModel)) return false;
      if (filterDone === "done"    && !results[ex.id]) return false;
      if (filterDone === "notdone" &&  results[ex.id]) return false;
      return true;
    });
  }, [exercises, filterModel, filterDone, results]);

  return (
    <div style={S.app}>
      <div style={{ ...S.page, padding: isMobile ? "calc(18px + env(safe-area-inset-top,0px)) 14px 40px" : S.page.padding }}>
        {user.isGuest && (
          <div style={{ background: C.noteBg, border: `1px solid rgba(199,122,26,0.28)`, borderRadius: 8, padding: "8px 14px", marginBottom: 20, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontFamily: F.sans, fontSize: 12, fontWeight: 600, color: C.noteInk }}>Modo invitado</span>
            <span style={{ fontFamily: F.sans, fontSize: 12, color: C.muted }}>· Los resultados no se guardan al salir</span>
          </div>
        )}

        {/* Cabecera editorial */}
        <div style={{ marginBottom: isMobile ? 18 : 24, paddingBottom: isMobile ? 14 : 20, borderBottom: `2px solid ${C.ink}`, display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <Overline>Alumno</Overline>
            <h1 style={{ ...S.h1, fontSize: isMobile ? 24 : 32, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.displayName}</h1>
          </div>
          <div style={{ display: "flex", gap: 8, flexShrink: 0, alignItems: "center" }}>
            {onUpdatePalette && (
              <PaletteMenuButton current={user.defaultPalette || SCHEMA_PALETTE_DEFAULT} onSelect={onUpdatePalette} />
            )}
            {!user.isGuest && onChangeTeacher && (
              <GhostButton onClick={onChangeTeacher}>{isMobile ? "Profesor" : "Cambiar profesor"}</GhostButton>
            )}
            <GhostButton onClick={onLogout}>Salir</GhostButton>
          </div>
        </div>

        {/* Pestañas */}
        <div className="fa-noscroll" style={{ display: "flex", borderBottom: `1px solid ${C.line}`, marginBottom: 22, overflowX: "auto", flexWrap: "nowrap", WebkitOverflowScrolling: "touch", scrollbarWidth: "none" }}>
          <TabBar tabs={[{ id: "all", label: "Todos los ejercicios" }, { id: "courses", label: "Por cursos" }]} value={view} onChange={setView} />
        </div>

        {/* ── Todos los ejercicios ── */}
        {view === "all" && (
          <>
            <StudentFilterBar
              filterModel={filterModel} setFilterModel={setFilterModel}
              filterDone={filterDone}   setFilterDone={setFilterDone}
            />
            {filteredExercises.length === 0
              ? <p style={{ color: C.muted, fontFamily: F.sans, textAlign: "center", padding: "2rem 1rem", fontSize: 13 }}>
                  {exercises.length === 0
                    ? "Tu profesor aún no ha publicado ejercicios."
                    : "Ningún ejercicio coincide con los filtros."}
                </p>
              : <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  {filteredExercises.map((ex) => (
                    <ExerciseRow key={ex.id} ex={ex} result={results[ex.id]} onOpen={onExercise} onViewCorrection={onViewCorrection} />
                  ))}
                </div>
            }
          </>
        )}

        {/* ── Por cursos (rediseño en páginas) ── */}
        {view === "courses" && (
          <CoursesPages
            role="student"
            courses={teacherCourses}
            units={units}
            exercises={exercises}
            groups={groups}
            results={results}
            onExercise={onExercise}
            onViewCorrection={onViewCorrection}
          />
        )}
      </div>
    </div>
  );
}

// ═══ 8. REPRODUCTOR DE AUDIO COMPARTIDO ════════════════════════════════════

// Hook compartido por ExerciseView, QuestionManagerView y QuestionnaireView.
//   onWaveform:      callback(waveformData) tras decodificar el audio.
//   loopRegionRef:   ref con { audioStart, audioEnd } | null para bucle en
//                    fragmentos (QuestionnaireView).
import { useAudioPlayer } from "./hooks/useAudioPlayer.js";


import { FragmentRangeSelector, WaveformDisplay } from "./components/session.jsx";
import { ExerciseView, RepeatManagerModal } from "./components/ExerciseView.jsx";
import { buildRepeatSegments, buildCompleteViewSegments, syncSecondPassBlocks, getSegBounds, REPEAT_BARLINE_W, rulerTicksForSeg } from "./lib/repeats.js";

// ═══ 9b. SCHEMA EXERCISE VIEW (modelo Esquema) ══════════════════════════════

function SchemaExerciseView({ exercise, mode, onSubmit, onBack, modelToggleNode = null, sharedAudioPlayer = null }) {
  const duration = exercise.duration;
  const [localWaveformData, setLocalWaveformData] = useState(exercise.waveformData || null);
  const waveformData = sharedAudioPlayer?.waveformData ?? localWaveformData;

  const localOnWaveform = (!sharedAudioPlayer && !exercise.waveformData) ? wd => setLocalWaveformData(wd) : null;
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

  const [blocks,       setBlocks]       = useState(exercise.blocks || []);
  const [history,      setHistory]      = useState([]);
  const [selected,     setSelected]     = useState(null);
  const [selectedRepId, setSelectedRepId] = useState(null); // rep seleccionada en la banda
  const [editId,       setEditId]       = useState(null);
  const [editVal,      setEditVal]      = useState("");
  const [guides,       setGuides]       = useState([]);
  const [localReps,    setLocalReps]    = useState(exercise.repetitions || []);
  const [showRepModal, setShowRepModal] = useState(false);
  // selectedPass: { [repId]: "first"|"second" } — qué vez mostrar cuando no está sonando
  const [selectedPass]    = useState({});
  const repResizeRef    = useRef(null);   // drag de resize de zona de repetición
  const [repResizeGuide, setRepResizeGuide] = useState(null); // null | { xFrac, color }
  const localRepsRef = useRef(localReps);
  localRepsRef.current = localReps;

  const listenOnly = !!exercise.listenOnly;
  const [playCount,   setPlayCount]   = useState(0);
  const [schemaMarks, setSchemaMarks] = useState([]);
  const schemaMarksRef = useRef([]);
  schemaMarksRef.current = schemaMarks;

  // ── Zoom y desplazamiento horizontal del esquema ─────────────────────────
  const [schemaZoom,       setSchemaZoom]       = useState(1);
  const [schemaScrollFrac, setSchemaScrollFrac] = useState(0);
  const schemaOuterRef = useRef(null);
  const pinchRef       = useRef(null);

  // ── Modo de vista: "completa" (edición secuencial, sin doble altura)
  //               | "resumida" (doble altura, solo lectura)
  const [viewMode, setViewMode] = useState("completa");
  const viewModeRef = useRef("completa");
  viewModeRef.current = viewMode;

  // ── Paleta de color elegida por el alumno para los bloques del esquema ──────
  // "p1".."p5" = paletas de Adobe.
  const [schemaPalette, setSchemaPalette] = useState(exercise.schemaPalette || SCHEMA_PALETTE_DEFAULT);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const paletteRef = useRef(null);
  useEffect(() => {
    if (!paletteOpen) return;
    const onDown = (e) => { if (paletteRef.current && !paletteRef.current.contains(e.target)) setPaletteOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("touchstart", onDown); };
  }, [paletteOpen]);

  // ── Estado de la banda de repetición ────────────────────────────────────
  // bandDrag = null
  //   | { type:"create", startT, curT }          — arrastrando para crear
  //   | { type:"handle", handle, origRep }        — arrastrando asa de borde
  const [bandDrag, setBandDrag] = useState(null);
  const bandRef    = useRef(null);

  const segments    = useMemo(() =>
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

  // ── History helpers ──────────────────────────────────────────────────────
  const setBlocksSnap = updater => {
    setHistory(p => [...p, blocksRef.current]);
    setBlocks(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      // En vista completa, sincronizar la 2ª vez a partir de la 1ª
      if (viewMode === "completa" && localRepsRef.current.length > 0) {
        return syncSecondPassBlocks(next, localRepsRef.current);
      }
      return next;
    });
  };
  const undo = () => setHistory(p => {
    if (!p.length) return p;
    setBlocks(p[p.length - 1]);
    setSelected(null); setEditId(null); setEditVal("");
    return p.slice(0, -1);
  });
  const resetAll = () => { setHistory([]); setBlocks([]); setLocalReps([]); setSelected(null); setEditId(null); setEditVal(""); };

  // ── Refs ─────────────────────────────────────────────────────────────────
  // trackSegRefs: key = `${lvId}_${segIndex}_${pass}`  ("pass" = "normal"|"first"|"second")
  // ruler refs:   key = `ruler_${segIndex}_${pass}`
  const trackSegRefs  = useRef({});
  const dragRef       = useRef(null);
  const blocksRef     = useRef(blocks);
  const colorInputRef = useRef(null);
  blocksRef.current   = blocks;

  // Ruler container width (para calcular densidad de marcas)
  const [rulerW, setRulerW] = useState(600);
  const rulerContainerRef   = useRef(null);
  useEffect(() => {
    const el = rulerContainerRef.current; if (!el) return;
    setRulerW(el.getBoundingClientRect().width);
    const ro = new ResizeObserver(([e]) => setRulerW(e.contentRect.width));
    ro.observe(el); return () => ro.disconnect();
  }, []);

  // ── Rueda del ratón → zoom (listener no-pasivo para poder preventDefault) ──
  useEffect(() => {
    const outer = schemaOuterRef.current; if (!outer) return;
    const handler = e => {
      e.preventDefault();
      const rect    = outer.getBoundingClientRect();
      const curFrac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const factor  = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      setSchemaZoom(prevZoom => {
        const nextZoom = Math.min(8, Math.max(1, prevZoom * factor));
        if (nextZoom !== prevZoom) {
          setSchemaScrollFrac(prevSf => {
            if (nextZoom === 1) return 0;
            const newSf = (((prevSf * (prevZoom - 1)) + curFrac) * (nextZoom / prevZoom) - curFrac) / (nextZoom - 1);
            return Math.max(0, Math.min(1, newSf));
          });
        }
        return nextZoom;
      });
    };
    outer.addEventListener('wheel', handler, { passive: false });
    return () => outer.removeEventListener('wheel', handler);
   
  }, []);

  // ── Guardar repeticiones desde el modal ─────────────────────────────────
  const handleSaveRepetitions = newReps => {
    setShowRepModal(false);
    const oldIds = new Set(localRepsRef.current.map(r => r.id));
    const newIds = new Set(newReps.map(r => r.id));
    setBlocksSnap(prev => {
      let upd = [...prev];
      // Eliminar etiquetas de repeticiones borradas
      const removed = [...oldIds].filter(id => !newIds.has(id));
      upd = upd.map(b => removed.includes(b.repeatId) ? { ...b, repeatId: null, pass: null } : b);
      upd = upd.filter(b => !(removed.includes(b.repeatId) && b.pass === "second"));
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
  const recToVisX = t => {
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
  const recToVisXResumed = t => {
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
  const deleteRepeat = repId => handleSaveRepetitions(localRepsRef.current.filter(r => r.id !== repId));

  // ── Banda de repetición: helpers y handlers ──────────────────────────────
  // En vista completa la fracción es lineal: frac = t / duration
  const timeToFrac = t  => Math.max(0, Math.min(1, t / duration));
  const fracToTime = f  => f * duration;   // sin redondeo para movimiento suave

  const getBandClientX = ev =>
    ev.touches?.[0]?.clientX ?? ev.changedTouches?.[0]?.clientX ?? ev.clientX;

  const getBandFrac = ev => {
    const el = bandRef.current; if (!el) return 0;
    const r  = el.getBoundingClientRect();
    return Math.max(0, Math.min(1, (getBandClientX(ev) - r.left) / r.width));
  };

  // Iniciar drag de creación — funciona aunque ya haya repeticiones
  const handleBandCreateDown = e => {
    if (e.target.closest("button") || e.target.closest("[data-band-handle]")) return;
    e.preventDefault();
    const BAND_SNAP  = Math.max(0.3, duration * 0.02);
    const AUTOSNAP_S = 5;
    const snapT = raw => {
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
    const mv = ev => {
      if (ev.cancelable) ev.preventDefault();
      setBandDrag(p => p ? { ...p, curT: snapT(fracToTime(getBandFrac(ev))) } : null);
    };
    const up = () => {
      setBandDrag(prev => {
        if (!prev) return null;
        const s  = Math.min(prev.startT, prev.curT);
        const e2 = Math.max(prev.startT, prev.curT);
        const d  = e2 - s;
        if (d >= SCHEMA_MIN_DUR) {
          let fs = s < 3 ? 0 : s;
          for (const r of localRepsRef.current) {
            if (fs > r.second.end - 0.1 && fs <= r.second.end + AUTOSNAP_S) { fs = r.second.end; break; }
          }
          const fe = fs + d, se = Math.min(duration, fe + d);
          handleSaveRepetitions([
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
    window.addEventListener("mouseup",   up);
    window.addEventListener("touchmove", mv, { passive: false });
    window.addEventListener("touchend",  up);
  };

  // Iniciar drag de asa de borde
  // handle: "first.start" | "junction" (first.end = second.start) | "second.end"
  const handleBandHandleDown = (e, rep, handle) => {
    e.preventDefault(); e.stopPropagation();

    const BAND_SNAP = Math.max(0.3, duration * 0.02);
    const snapT = raw => {
      const candidates = [0, duration, ...blocksRef.current.filter(b => !b.isPreview).flatMap(b => [b.start, b.end])];
      let best = raw, bestDist = BAND_SNAP;
      for (const c of candidates) { const dd = Math.abs(raw - c); if (dd < bestDist) { bestDist = dd; best = c; } }
      return best;
    };

    const calcNewRep = raw => {
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
        const ratio  = origSD / origFD;
        r.first.end    = jt;
        r.second.start = jt;
        r.second.end   = Math.min(duration, jt + (jt - r.first.start) * ratio);
      } else {
        r.second.end = Math.max(r.second.start + SCHEMA_MIN_DUR, Math.min(t, duration));
      }
      return r;
    };

    const mv = ev => {
      if (ev.cancelable) ev.preventDefault();
      const newRep = calcNewRep(fracToTime(getBandFrac(ev)));
      setLocalReps(prev => prev.map(r => r.id === rep.id ? newRep : r));
    };
    const up = ev => {
      const newRep = calcNewRep(fracToTime(getBandFrac(ev)));
      handleSaveRepetitions(localRepsRef.current.map(r => r.id === rep.id ? newRep : r));
      setBandDrag(null);
      window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up);
      window.removeEventListener("touchmove", mv); window.removeEventListener("touchend", up);
    };
    window.addEventListener("mousemove", mv);
    window.addEventListener("mouseup",   up);
    window.addEventListener("touchmove", mv, { passive: false });
    window.addEventListener("touchend",  up);
  };

  // Delete / Backspace — borrar bloque o repetición seleccionada
  useEffect(() => {
    const onKey = e => {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      const tag = e.target?.tagName;
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
  }, [selected, selectedRepId]);

  // ── Resize de barras de repetición arrastrando en la regla ─────────────
  const RESIZE_PX = 22; // zona de detección de borde (px desde cada extremo de la fila)

  const handleRepZoneRulerDown = (e, seg, pass) => {
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

    const toXFrac = ev => Math.max(0, Math.min(1, (getClientX(ev) - rulerRect.left) / rulerRect.width));
    setRepResizeGuide({ xFrac: toXFrac(e), color: "black" });

    const mv = ev => {
      if (ev.cancelable) ev.preventDefault();
      setRepResizeGuide({ xFrac: toXFrac(ev), color: "black" });
    };
    const up = ev => {
      const d = repResizeRef.current; if (!d) return;
      const xFrac      = toXFrac(ev);
      const xInSeg     = (xFrac - d.seg.vStart) / Math.max(0.001, d.seg.vEnd - d.seg.vStart);
      const cf         = Math.max(0, Math.min(1, xInSeg));
      const { rep: origRep } = d;
      let f = { ...origRep.first }, s = { ...origRep.second };
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
  const handleRepRowMouseMove = (e, rowEl) => {
    if (!rowEl) return;
    const rect  = rowEl.getBoundingClientRect();
    const distL = getClientX(e) - rect.left;
    const distR = rect.right - getClientX(e);
    const edgePx = Math.min(RESIZE_PX, rect.width * 0.28);
    rowEl.style.cursor = (distL < edgePx || distR < edgePx) ? "ew-resize" : "default";
  };

  // ── Navegador de la regla ────────────────────────────────────────────────
  const getClientX = e => e.touches?.[0]?.clientX ?? e.changedTouches?.[0]?.clientX ?? e.clientX;

  // Igual que containerXToRec pero, para segmentos "repeat" (vista resumida),
  // puede mapear a la 1ª O la 2ª vez según el parámetro `pass`.
  // Esto permite arrastrar de forma continua a través de todos los segmentos.
  const containerXToRecForPass = (xFrac, pass) => {
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
  const handleDoubleRowRulerDown = (e, seg, outerEl) => {
    if (listenOnly) return;
    e.preventDefault();
    const containerEl = rulerContainerRef.current; if (!containerEl) return;
    const getFrac = ev => {
      const r = containerEl.getBoundingClientRect();
      return Math.max(0, Math.min(1, (getClientX(ev) - r.left) / r.width));
    };
    const getPass = ev => {
      if (!outerEl) return "first";
      const r   = outerEl.getBoundingClientRect();
      const y   = ev.touches?.[0]?.clientY ?? ev.changedTouches?.[0]?.clientY ?? ev.clientY;
      return (y - r.top) > r.height / 2 ? "second" : "first";
    };
    const seek = ev => seekTo(containerXToRecForPass(getFrac(ev), getPass(ev)));
    seek(e);
    const mv = ev => { if (ev.cancelable) ev.preventDefault(); seek(ev); };
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
  const handleSegRulerDown = (e, seg, pass) => {
    if (e.touches && e.touches.length > 1) return; // pinch-to-zoom → ignorar
    if (listenOnly) return;
    e.preventDefault();
    const containerEl = rulerContainerRef.current; if (!containerEl) return;
    const getFrac = ev => {
      const r = containerEl.getBoundingClientRect();
      return Math.max(0, Math.min(1, (getClientX(ev) - r.left) / r.width));
    };
    // Al entrar en la zona de repetición (vista resumida), determinar la fila
    // por la posición vertical del puntero, no por el pass inicial.
    const resolvePass = (xFrac, ev) => {
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
    const mv = ev => {
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

  // ── Marcas (listen-only): mapeo visual → tiempo grabación ───────────────
  const containerXToRec = xFrac => {
    const segs = segmentsRef.current;
    for (const sg of segs) {
      if (xFrac >= sg.vStart - 0.001 && xFrac <= sg.vEnd + 0.001) {
        const f = sg.vEnd > sg.vStart
          ? Math.max(0, Math.min(1, (xFrac - sg.vStart) / (sg.vEnd - sg.vStart))) : 0;
        if (sg.type === "normal") return sg.recStart + f * sg.canonDur;
        if (sg.type === "repeat-first")  return sg.recStart + f * sg.canonDur;
        if (sg.type === "repeat-second") return sg.recStart + f * sg.canonDur;
        return sg.rep.first.start + f * (sg.rep.first.end - sg.rep.first.start);
      }
    }
    return 0;
  };
  const handleMarksContainerDown = e => {
    if (e.target.closest("[data-mark]")) return;
    const el = rulerContainerRef.current; if (!el) return;
    e.preventDefault();
    const rect = el.getBoundingClientRect();
    const t = containerXToRec(Math.max(0, Math.min(1, (getClientX(e) - rect.left) / rect.width)));
    setSchemaMarks(prev => [...prev, t].sort((a, b) => a - b));
  };
  const handleMarkDown = (e, idx) => {
    e.stopPropagation(); e.preventDefault();
    const el = rulerContainerRef.current; if (!el) return;
    const rect = el.getBoundingClientRect();
    const startX = getClientX(e);
    let moved = false;
    const mv = ev => {
      if (ev.cancelable) ev.preventDefault();
      const x = getClientX(ev);
      if (!moved && Math.abs(x - startX) > 3) moved = true;
      if (moved) {
        const t = containerXToRec(Math.max(0, Math.min(1, (x - rect.left) / rect.width)));
        setSchemaMarks(prev => { const n = [...prev]; n[idx] = t; return n; });
      }
    };
    const up = () => {
      if (!moved) setSchemaMarks(prev => prev.filter((_, i) => i !== idx));
      window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up);
      window.removeEventListener("touchmove", mv); window.removeEventListener("touchend", up);
    };
    window.addEventListener("mousemove", mv); window.addEventListener("mouseup", up);
    window.addEventListener("touchmove", mv, { passive: false }); window.addEventListener("touchend", up);
  };

  // ── Drag principal (crear / mover / redimensionar bloques) ───────────────
  useEffect(() => {
    // pixToTime vive dentro del efecto para acceder a los refs sin clausura vieja
    const pixToTime = e => {
      const d = dragRef.current; if (!d) return 0;
      const el = trackSegRefs.current[d.segKey]; if (!el) return d.anchor;
      const r = el.getBoundingClientRect();
      const x = e.touches?.[0]?.clientX ?? e.changedTouches?.[0]?.clientX ?? e.clientX;
      return d.segMin + Math.max(0, Math.min(1, (x - r.left) / r.width)) * (d.segMax - d.segMin);
    };

    const onMove = e => {
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
      const snap = v => {
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
      const snapBounds = v => {
        const cascadedIds = new Set((d.cascadeIds ?? []).map(c => c.id));
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
      const cascadeBoundary = (arr, newT) => {
        if (!d.cascadeIds?.length) return arr;
        return arr.map(b => {
          const ci = d.cascadeIds.find(c => c.id === b.id);
          if (!ci) return b;
          return ci.side === "start" ? { ...b, start: newT } : { ...b, end: newT };
        });
      };
      const cl = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

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
        const xb = [d.segMin, d.segMax,
          ...schemaMarksRef.current.filter(m => m >= d.segMin - 0.1 && m <= d.segMax + 0.1),
          ...all.filter(b => b.id !== d.bid && b.level !== d.level && b.repeatId === d.repeatId && b.pass === d.pass && !b.isPreview).flatMap(b => [b.start, b.end]),
        ];
        let snapped = false;
        for (const bv of xb) { if (Math.abs(ns - bv) < SCHEMA_SNAP_THR) { ns = bv; ne = bv + dur2; snapped = true; break; } }
        if (!snapped) { for (const bv of xb) { if (Math.abs(ne - bv) < SCHEMA_SNAP_THR) { ne = bv; ns = bv - dur2; break; } } }
        for (const nb of ctx.filter(b => b.level === d.level && b.id !== d.bid)) {
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
        const ns = cl(snapBounds(t), minNs, d.oe - SCHEMA_MIN_DUR);
        setGuides([ns]);
        setBlocks(prev => cascadeBoundary(
          prev.map(b => b.id === d.bid ? { ...b, start: ns } : b),
          ns));
        return;
      }

      if (d.type === "resize-r") {
        const rightNb = d.rightId ? all.find(b => b.id === d.rightId) : null;
        const maxNe   = rightNb ? rightNb.start : d.segMax;
        const ne = cl(snapBounds(t), d.os + SCHEMA_MIN_DUR, maxNe);
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

    const onUp = upEvt => {
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
   
  }, [duration]);

  // ── Edición de etiquetas ─────────────────────────────────────────────────
  const commitEdit = () => {
    if (!editId) return;
    setBlocks(prev => {
      const edited = prev.find(b => b.id === editId);
      return prev.map(b => {
        if (b.id === editId) return { ...b, label: editVal };
        // Propagar el nuevo label al bloque espejo de la 2ª vez
        if (edited?.pass === "first" && b.mirrorId === editId) return { ...b, label: editVal };
        return b;
      });
    });
    setEditId(null); setEditVal("");
  };

  // ── Inicio de drag en pista (crear bloque) ───────────────────────────────
  const handleTrackSegDown = (e, lvId, seg, pass) => {
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
  const handleBlockDown = (e, block, type = "move") => {
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
    let cascadeIds = [];
    if (cascadeLvs.length > 0 && (type === "resize-r" || type === "resize-l")) {
      const boundaryT = type === "resize-r" ? block.end : block.start;
      const EPS = 0.05;
      cascadeIds = blocksRef.current
        .filter(b => cascadeLvs.includes(b.level) && !b.isPreview &&
          (b.repeatId ?? null) === (block.repeatId ?? null) &&
          (b.pass    ?? null) === (block.pass    ?? null))
        .flatMap(b => {
          const hits = [];
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
  const handleSharedHandleDown = (e, leftBlock, rightBlock) => {
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
    let cascadeIds2 = [];
    if (cascadeLvs2.length > 0) {
      const boundaryT = leftBlock.end;
      const EPS = 0.05;
      cascadeIds2 = blocksRef.current
        .filter(b => cascadeLvs2.includes(b.level) && !b.isPreview &&
          (b.repeatId ?? null) === (leftBlock.repeatId ?? null) &&
          (b.pass    ?? null) === (leftBlock.pass    ?? null))
        .flatMap(b => {
          const hits = [];
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

  const SCHEMA_HND_W   = 18;

  const activeLevels = SCHEMA_LEVELS.filter(lv =>
    !exercise.schemaLevels || exercise.schemaLevels.length === 0 || exercise.schemaLevels.includes(lv.id)
  );

  // Lookup de bloques activos (según el cursor de reproducción + contexto de repetición)
  const activeAt = {};
  for (const b of blocks) {
    if (b.isPreview || time < b.start || time >= b.end) continue;
    if (!b.repeatId) { activeAt[b.level] = b.id; continue; }
    if (activeRepeatPass && b.repeatId === activeRepeatPass.repId && b.pass === activeRepeatPass.pass)
      activeAt[b.level] = b.id;
  }
  const selBlock = selected ? blocks.find(b => b.id === selected) : null;
  const selLv    = selBlock ? SCHEMA_LEVELS.find(l => l.id === selBlock.level) : null;

  // ── Renderizado de bloques dentro de un segmento+fila ───────────────────
  const renderSegBlocks = (seg, pass, lvId) => {
    const lv = SCHEMA_LEVELS.find(l => l.id === lvId);
    const bounds = getSegBounds(seg, pass);
    const segDur = (bounds.max - bounds.min) || 1;

    const segBlocks = blocks.filter(b => {
      if (b.level !== lvId) return false;
      if (seg.type === "normal") return !b.repeatId && b.end > bounds.min - 0.01 && b.start < bounds.max + 0.01;
      if (seg.type === "repeat-first")  return b.repeatId === seg.rep.id && b.pass === "first";
      if (seg.type === "repeat-second") return b.repeatId === seg.rep.id && b.pass === "second";
      return b.repeatId === seg.rep.id && b.pass === pass;
    });
    const real = segBlocks.filter(b => !b.isPreview).sort((a, b) => a.start - b.start);
    const adjPairs = [];
    for (let i = 0; i < real.length - 1; i++) {
      if (Math.abs(real[i].end - real[i + 1].start) < 0.5)
        adjPairs.push({ left: real[i], right: real[i + 1] });
    }
    const adjLIds = new Set(adjPairs.map(p => p.right.id));
    const adjRIds = new Set(adjPairs.map(p => p.left.id));

    // Posición del cursor de reproducción en esta fila
    let phPct = null;
    if (seg.type === "normal" && time >= seg.recStart && time < seg.recEnd)
      phPct = ((time - seg.recStart) / seg.canonDur) * 100;
    else if (seg.type === "repeat") {
      if (pass === "first" && time >= seg.rep.first.start && time < seg.rep.first.end)
        phPct = ((time - seg.rep.first.start) / (seg.rep.first.end - seg.rep.first.start)) * 100;
      else if (pass === "second" && time >= seg.rep.second.start && time < seg.rep.second.end)
        phPct = ((time - seg.rep.second.start) / (seg.rep.second.end - seg.rep.second.start)) * 100;
    }

    // Altura real del bloque por nivel: la pista mide 62 (Partes) / 52 (Frases)
    // / 44 (resto) y el bloque va con top:6 bottom:6, así que su alto = pista − 12.
    const _trackH    = lvId === 1 ? 62 : lvId === 2 ? 52 : 44;
    const _blockH    = lvId >= 3 ? 32 : _trackH - 12;
    const _hndH      = Math.round(_blockH * 2 / 3);
    const _hndTop    = 6 + Math.round((_blockH - _hndH) / 2);
    const hStyle = { position: "absolute", top: _hndTop, width: SCHEMA_HND_W, height: _hndH, background: "transparent", cursor: "ew-resize", zIndex: 10, display: "flex", alignItems: "center", justifyContent: "center" };
    const vis    = { width: SCHEMA_HND_VISUAL_W, height: "100%", background: "rgba(255,255,255,0.88)", borderRadius: 5, boxShadow: "0 1px 4px rgba(0,0,0,0.16)", pointerEvents: "none" };

    return (<>
      {/* Cuadrícula de fondo — paso fijo global para que la densidad
          sea la misma en todos los segmentos independientemente de su duración */}
      {(() => {
        const GRID_STEPS = [1, 2, 5, 10, 15, 20, 30, 60, 120, 300];
        const gridTarget = duration / 10; // ~10 divisiones en toda la pieza
        const step = GRID_STEPS.find(s => s >= gridTarget) ?? GRID_STEPS[GRID_STEPS.length - 1];
        const lines = [];
        const t0 = Math.ceil(bounds.min / step) * step;
        for (let t = t0; t < bounds.max - step * 0.05; t += step)
          lines.push((t - bounds.min) / segDur);
        return lines.map((f, i) => (
          <div key={i} style={{ position: "absolute", top: 0, left: `${f * 100}%`, width: 1, height: "100%", background: "rgba(0,0,0,0.04)", pointerEvents: "none" }} />
        ));
      })()}
      {/* Marcas listen-only */}
      {listenOnly && schemaMarks.filter(mt => mt >= bounds.min && mt < bounds.max).map((mt, i) => (
        <div key={i} style={{ position: "absolute", top: 0, left: `${((mt - bounds.min) / segDur) * 100}%`, width: 1, height: "100%", background: "rgba(184,74,58,0.28)", pointerEvents: "none", zIndex: 7 }} />
      ))}
      {/* Guías de snap */}
      {guides.filter(g => g >= bounds.min && g <= bounds.max).map((g, i) => (
        <div key={i} style={{ position: "absolute", top: 0, left: `${((g - bounds.min) / segDur) * 100}%`, width: 1, height: "100%", background: "rgba(210,55,55,0.45)", pointerEvents: "none", zIndex: 8 }} />
      ))}
      {/* Cursor de reproducción */}
      {phPct !== null && (
        <div style={{ position: "absolute", top: 0, left: `${phPct}%`, width: 1, height: "100%", background: C.danger, opacity: 0.5, pointerEvents: "none", zIndex: 6 }} />
      )}
      {/* Bloques */}
      {segBlocks.map(block => {
        const isActive = activeAt[lvId] === block.id, isSel = selected === block.id;
        // En vista resumida los bloques sin repeatId pueden cruzar la zona de
        // repetición (la parte abarca tanto la 1ª como la 2ª vez). Usamos
        // recToVisXResumed para que su anchura visual sea correcta.
        let lPct, wPct;
        if (viewMode === "resumida" && seg.type === "normal" && !block.repeatId) {
          const segVW = (seg.vEnd - seg.vStart) || 1;
          const visS  = recToVisX(block.start);
          const visE  = recToVisXResumed(block.end);
          lPct = Math.max(0, (visS - seg.vStart) / segVW) * 100;
          wPct = Math.max(0, (visE - visS) / segVW) * 100;
        } else {
          lPct = Math.max(0, ((block.start - bounds.min) / segDur) * 100);
          wPct = Math.max(0, ((block.end - block.start) / segDur) * 100);
        }
        const { bg: bBg, textColor: bTx } = block.isPreview
          ? { bg: lv.color, textColor: "#FFFFFF" }
          : block.customColor ? harmonyBlockColors(null, block.customColor)
          : lv.id === 3 ? harmonyBlockColors(block.label, lv.color)
          : lv.id === 1 ? harmonyBlockColors(null, partColorFromPalette(block.label, schemaPalette))
          : lv.id === 2 ? (() => {
              const partB = blocks.find(b => b.level === 1 && !b.isPreview &&
                b.start <= block.start + 0.01 && b.end > block.start + 0.01 &&
                (block.repeatId ? b.repeatId === block.repeatId && b.pass === block.pass : !b.repeatId));
              const parentColor = partB ? (partB.customColor || partColorFromPalette(partB.label, schemaPalette)) : lv.color;
              return harmonyBlockColors(null, phraseColorFromPalette(block.label, parentColor, schemaPalette));
            })()
          : { bg: lv.color, textColor: "#FFFFFF" };

        // ── Nivel 3 (Armonía): píldora de color + línea horizontal ─────────
        if (lvId === 3) {
          const pillBg = block.isPreview ? `${bBg}60` : bBg;
          return (
            <div key={block.id} data-block="true" style={{
              position: "absolute", top: 6, bottom: 6, left: `${lPct}%`, width: `${wPct}%`,
              background: "transparent",
              borderRadius: 999,
              boxShadow: "none",
              display: "flex", alignItems: "center",
              overflow: "hidden",
              cursor: (block.isPreview || viewMode === "resumida") ? "default" : "grab",
              zIndex: isSel ? 7 : isActive ? 4 : 3,
              boxSizing: "border-box",
            }}
              onMouseDown={e => !(block.isPreview || viewMode === "resumida") && handleBlockDown(e, block, "move")}
              onTouchStart={e => !(block.isPreview || viewMode === "resumida") && handleBlockDown(e, block, "move")}
              onDoubleClick={() => { if (!(block.isPreview || viewMode === "resumida" || block.pass === "second")) { setEditId(block.id); setEditVal(block.label); } }}>
              {/* Píldora izquierda */}
              {editId === block.id ? (
                <div style={{ alignSelf: "center", background: pillBg, borderRadius: 999, display: "flex", alignItems: "center", padding: "5px 8px", flexShrink: 0 }}>
                  <input autoFocus value={editVal} onChange={e => setEditVal(e.target.value)}
                    onBlur={commitEdit} onKeyDown={e => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") setEditId(null); }}
                    onClick={e => e.stopPropagation()}
                    style={{ width: 60, background: "transparent", border: "none", borderBottom: "1.5px solid rgba(255,255,255,0.8)", color: bTx, fontSize: 11, fontWeight: 700, textAlign: "center", outline: "none", padding: "2px 2px", fontFamily: FONT_SANS, borderRadius: 2 }} />
                </div>
              ) : (
                <div style={{ alignSelf: "center", background: pillBg, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", padding: "5px 11px", flexShrink: 0, boxSizing: "border-box" }}>
                  {wPct >= 2 && (
                    <span style={{ fontSize: wPct < 5 ? 9 : 11, fontWeight: 700, color: bTx, textShadow: bTx === "#FFFFFF" ? "0 1px 3px rgba(0,0,0,0.28)" : "none", fontFamily: FONT_SANS, whiteSpace: "nowrap", pointerEvents: "none" }}>
                      {block.label}
                    </span>
                  )}
                </div>
              )}
              {/* Línea horizontal hasta el borde derecho */}
              {wPct >= 3 && (
                <div style={{ flex: 1, minWidth: 0, height: 2.5, background: pillBg, opacity: 0.55, marginLeft: 4, borderRadius: 1.5, flexShrink: 1 }} />
              )}
            </div>
          );
        }

        // ── Nivel 4 (Texto): píldora de ancho completo, sin línea ───────────
        if (lvId === 4) {
          const pillBg = block.isPreview ? `${bBg}60` : bBg;
          return (
            <div key={block.id} data-block="true" style={{
              position: "absolute", top: 6, bottom: 6, left: `${lPct}%`, width: `${wPct}%`,
              display: "flex", alignItems: "stretch",
              overflow: "hidden",
              cursor: (block.isPreview || viewMode === "resumida") ? "default" : "grab",
              zIndex: isSel ? 7 : isActive ? 4 : 3,
              boxSizing: "border-box",
            }}
              onMouseDown={e => !(block.isPreview || viewMode === "resumida") && handleBlockDown(e, block, "move")}
              onTouchStart={e => !(block.isPreview || viewMode === "resumida") && handleBlockDown(e, block, "move")}
              onDoubleClick={() => { if (!(block.isPreview || viewMode === "resumida" || block.pass === "second")) { setEditId(block.id); setEditVal(block.label); } }}>
              {editId === block.id ? (
                <div style={{ flex: 1, background: pillBg, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 11px", overflow: "hidden" }}>
                  <input autoFocus value={editVal} onChange={e => setEditVal(e.target.value)}
                    onBlur={commitEdit} onKeyDown={e => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") setEditId(null); }}
                    onClick={e => e.stopPropagation()}
                    style={{ width: "82%", background: "transparent", border: "none", borderBottom: "1.5px solid rgba(255,255,255,0.8)", color: bTx, fontSize: 11, fontWeight: 500, textAlign: "center", outline: "none", padding: "2px 4px", fontFamily: FONT_SANS, borderRadius: 2 }} />
                </div>
              ) : (
                <div style={{ flex: 1, background: pillBg, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", padding: "5px 11px", overflow: "hidden" }}>
                  <span style={{ fontSize: wPct < 3.5 ? 0 : wPct < 6 ? 9 : 11, fontWeight: 500, color: bTx, textShadow: bTx === "#FFFFFF" ? "0 1px 3px rgba(0,0,0,0.28)" : "none", maxWidth: "90%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: FONT_SANS, pointerEvents: "none" }}>
                    {block.label}
                  </span>
                </div>
              )}
            </div>
          );
        }

        // ── Resto de niveles: rectángulo relleno (estilo original) ──────────
        return (
          <div key={block.id} data-block="true" style={{
            position: "absolute", top: 6, bottom: 6, left: `${lPct}%`, width: `${wPct}%`,
            background: block.isPreview ? `${bBg}38` : bBg, borderRadius: 5,
            border: isSel ? `2px solid ${C.ink}` : isActive ? `2px solid rgba(255,255,255,0.75)` : `1px solid rgba(255,255,255,0.22)`,
            boxShadow: isSel ? "0 2px 10px rgba(0,0,0,0.22)" : "none",
            display: "flex", alignItems: "center", justifyContent: "center",
            overflow: "hidden", cursor: (block.isPreview || viewMode === "resumida") ? "default" : "grab",
            zIndex: isSel ? 7 : isActive ? 4 : 3, boxSizing: "border-box",
          }}
            onMouseDown={e => !(block.isPreview || viewMode === "resumida") && handleBlockDown(e, block, "move")}
            onTouchStart={e => !(block.isPreview || viewMode === "resumida") && handleBlockDown(e, block, "move")}
            onDoubleClick={() => { if (!(block.isPreview || viewMode === "resumida" || block.pass === "second")) { setEditId(block.id); setEditVal(block.label); } }}>
            {editId === block.id ? (
              <input autoFocus value={editVal} onChange={e => setEditVal(e.target.value)}
                onBlur={commitEdit} onKeyDown={e => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") setEditId(null); }}
                onClick={e => e.stopPropagation()}
                style={{ width: "82%", background: "rgba(0,0,0,0.18)", border: "none", borderBottom: "1.5px solid rgba(255,255,255,0.85)", color: "white", fontSize: 12, fontWeight: lvId === 1 ? 700 : 500, textAlign: "center", outline: "none", padding: "2px 4px", fontFamily: FONT_SANS, borderRadius: 2 }} />
            ) : (
              <span style={{ fontSize: wPct < 3.5 ? 0 : wPct < 6 ? 9 : 12, fontWeight: lvId === 1 ? 700 : 500, color: bTx, textShadow: bTx === "#FFFFFF" ? "0 1px 3px rgba(0,0,0,0.28)" : "none", maxWidth: "84%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: FONT_SANS, pointerEvents: "none" }}>
                {block.label}
              </span>
            )}
          </div>
        );
      })}
      {/* Asas de borde libre — ocultas en modo resumida y en bordes bloqueados */}
      {viewMode !== "resumida" && real.flatMap(block => {
        const lPct = ((block.start - bounds.min) / segDur) * 100;
        const rPct = ((block.end   - bounds.min) / segDur) * 100;
        const out = [];
        // Ocultar el asa izquierda si el bloque está bloqueado al borde de zona
        if (!adjLIds.has(block.id) && !block._lockedStart) out.push(
          <div key={`hl-${block.id}`} data-block="true"
            style={{ ...hStyle, left: `calc(${lPct}% - ${SCHEMA_HND_W / 2}px)` }}
            onMouseDown={e => { e.stopPropagation(); handleBlockDown(e, block, "resize-l"); }}
            onTouchStart={e => { e.stopPropagation(); handleBlockDown(e, block, "resize-l"); }}>
            <div style={vis} />
          </div>
        );
        // Ocultar el asa derecha si el bloque está bloqueado al borde de zona
        if (!adjRIds.has(block.id) && !block._lockedEnd) out.push(
          <div key={`hr-${block.id}`} data-block="true"
            style={{ ...hStyle, left: `calc(${rPct}% - ${SCHEMA_HND_W / 2}px)` }}
            onMouseDown={e => { e.stopPropagation(); handleBlockDown(e, block, "resize-r"); }}
            onTouchStart={e => { e.stopPropagation(); handleBlockDown(e, block, "resize-r"); }}>
            <div style={vis} />
          </div>
        );
        return out;
      })}
      {/* Asas de borde compartido — ocultas en modo resumida */}
      {viewMode !== "resumida" && adjPairs.map(({ left, right }) => {
        const pct = ((left.end - bounds.min) / segDur) * 100;
        return (
          <div key={`sh-${left.id}-${right.id}`} data-block="true"
            style={{ position: "absolute", top: _hndTop, width: SCHEMA_HND_W, height: _hndH, left: `calc(${pct}% - ${SCHEMA_HND_W / 2}px)`, background: "transparent", cursor: "col-resize", zIndex: 11, display: "flex", alignItems: "center", justifyContent: "center" }}
            onMouseDown={e => handleSharedHandleDown(e, left, right)}
            onTouchStart={e => handleSharedHandleDown(e, left, right)}>
            <div style={{ width: SCHEMA_HND_VISUAL_W, height: "100%", background: "rgba(255,255,255,0.88)", borderRadius: 5, boxShadow: "0 1px 4px rgba(0,0,0,0.16)", pointerEvents: "none" }} />
          </div>
        );
      })}
    </>);
  };

  // ── Pinch-to-zoom (móvil) ─────────────────────────────────────────────────
  const handleSchemaPinchStart = e => {
    if (e.touches.length !== 2) return;
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    pinchRef.current = { dist: Math.hypot(dx, dy), zoom: schemaZoom, sf: schemaScrollFrac };
  };
  const handleSchemaPinchMove = e => {
    if (e.touches.length !== 2 || !pinchRef.current) return;
    const dx  = e.touches[0].clientX - e.touches[1].clientX;
    const dy  = e.touches[0].clientY - e.touches[1].clientY;
    const newZoom = Math.min(8, Math.max(1, pinchRef.current.zoom * (Math.hypot(dx, dy) / pinchRef.current.dist)));
    setSchemaZoom(newZoom);
    if (e.cancelable) e.preventDefault();
  };
  const handleSchemaPinchEnd = () => { pinchRef.current = null; };

  // ── Drag de la barra de scroll personalizada ──────────────────────────────
  // El drag es RELATIVO: el desplazamiento es proporcional al movimiento del ratón/dedo,
  // sin saltar a la posición absoluta del clic.
  const handleScrollbarTrackDown = e => {
    e.preventDefault();
    const track   = e.currentTarget;
    const startX  = e.touches?.[0]?.clientX ?? e.clientX;
    const startSf = schemaScrollFrac;
    const move = ev => {
      const rect     = track.getBoundingClientRect();
      const x        = ev.touches?.[0]?.clientX ?? ev.clientX;
      const deltaX   = x - startX;
      const deltaFrac = deltaX / rect.width;
      // El thumb ocupa 1/zoom del track; el rango de movimiento del thumb es (1 - 1/zoom)
      const thumbRange = 1 - 1 / Math.max(1, schemaZoom);
      const newSf    = thumbRange > 0 ? startSf + deltaFrac / thumbRange : 0;
      setSchemaScrollFrac(Math.max(0, Math.min(1, newSf)));
    };
    const up = () => {
      window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up);
      window.removeEventListener('touchmove', move); window.removeEventListener('touchend', up);
    };
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
    window.addEventListener('touchmove', move, { passive: false }); window.addEventListener('touchend', up);
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
        onMouseDown={e => { if (!e.target.closest("[data-block]") && !e.target.closest("button") && !e.target.closest("input")) { setSelected(null); setSelectedRepId(null); } }}
        onTouchStart={e => { if (!e.target.closest("[data-block]") && !e.target.closest("button") && !e.target.closest("input")) { setSelected(null); setSelectedRepId(null); } }}>

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
                  {fmt(time)}<span style={{ color: C.muted, fontWeight: 400 }}>/{fmt(duration)}</span>
                </div>
              </div>
              {playCount > 0 && <div style={{ textAlign: "center", fontFamily: F.sans, fontSize: 11, color: C.muted, marginTop: 8 }}>Reproducido {playCount} {playCount === 1 ? "vez" : "veces"} desde el inicio</div>}
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 12, paddingTop: 10, borderTop: `1px solid ${C.line}` }}>
              {/* Columna izq: switch (si hay repeticiones) + ⏮ a la derecha */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                {hasRepeats ? (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4 }}>
                    <span style={{ fontSize: 9, color: C.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.9, fontFamily: FONT_SANS, paddingLeft: 2 }}>Vista de repetición</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div role="tablist"
                        style={{ display: "flex", flexDirection: "row", background: C.paper2, border: `1px solid ${C.line}`, borderRadius: 999, overflow: "hidden", padding: 2, gap: 2, height: 26, boxSizing: "border-box" }}>
                        {[["completa", "Completa"], ["resumida", "Resumida"]].map(([v, label]) => (
                          <button key={v} type="button" role="tab" aria-selected={viewMode === v}
                            onClick={() => setViewMode(v)}
                            title={v === "completa" ? "Vista secuencial editable" : "Vista comprimida (solo lectura)"}
                            style={{
                              flex: "1 1 0", border: "none", borderRadius: 999,
                              background: viewMode === v ? C.ink : "transparent",
                              color: viewMode === v ? C.paper : C.muted,
                              padding: "0 10px", fontSize: 11, fontWeight: viewMode === v ? 600 : 400,
                              cursor: "pointer", transition: "all .12s", fontFamily: FONT_SANS,
                              whiteSpace: "nowrap",
                            }}>
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : <div />}
                <CircleButton onClick={() => seekTo(0)} title="Volver al inicio">⏮</CircleButton>
              </div>
              {/* Columna central: ▶ centrado */}
              <CircleButton onClick={() => { if (time >= duration) seekTo(0); togglePlay(); }} primary size={48} disabled={hasAudio && !audioReady && !audioError}>
                {playing ? "❚❚" : "▶"}
              </CircleButton>
              <div style={{ textAlign: "right", fontFamily: F.sans, fontVariantNumeric: "tabular-nums", fontSize: 22, fontWeight: 600, color: C.ink, letterSpacing: -0.5 }}>
                {fmt(time)}<span style={{ color: C.muted, fontWeight: 400 }}>/{fmt(duration)}</span>
              </div>
            </div>
          )}
        </section>

        {/* Selector de paleta — discreto y desplegable. Solo si hay nivel de
            Partes o Frases activo (afecta a esos niveles, no a Armonía/Texto). */}
        {!listenOnly && activeLevels.some(lv => lv.id === 1 || lv.id === 2) && (
          <div ref={paletteRef} style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10, position: "relative" }}
            onMouseDown={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()}>
            {(() => { const cur = getSchemaPalette(schemaPalette) || SCHEMA_PALETTES[0]; return (
              <button type="button" onClick={() => setPaletteOpen(o => !o)} className="fa-pressable"
                title="Cambiar paleta de color"
                style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "4px 9px 4px 8px", borderRadius: 8, cursor: "pointer", background: C.paper2, border: `1px solid ${C.line}`, fontFamily: F.sans }}>
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: C.muted }}>Paleta</span>
                <span style={{ display: "inline-flex", borderRadius: 3, overflow: "hidden", border: "1px solid rgba(0,0,0,0.08)", flexShrink: 0 }}>
                  {cur.parts.map((c, i) => <span key={i} style={{ width: 9, height: 12, background: c, display: "block" }} />)}
                </span>
                <Chevron open={paletteOpen} size={11} color={C.muted} />
              </button>
            ); })()}
            {paletteOpen && (
              <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 30, background: C.paper, border: `1px solid ${C.line}`, borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.12)", padding: 6, display: "flex", flexDirection: "column", gap: 2, minWidth: 168 }}>
                {SCHEMA_PALETTES.map(pal => {
                  const active = schemaPalette === pal.id;
                  return (
                    <button key={pal.id} type="button" onClick={() => { setSchemaPalette(pal.id); setPaletteOpen(false); }}
                      style={{ display: "flex", alignItems: "center", gap: 9, padding: "6px 8px", borderRadius: 7, cursor: "pointer", background: active ? C.paper2 : "transparent", border: "none", fontFamily: F.sans, textAlign: "left", width: "100%" }}>
                      <span style={{ display: "inline-flex", borderRadius: 4, overflow: "hidden", border: "1px solid rgba(0,0,0,0.08)", flexShrink: 0 }}>
                        {pal.parts.map((c, i) => <span key={i} style={{ width: 13, height: 16, background: c, display: "block" }} />)}
                      </span>
                      <span style={{ flex: 1, fontSize: 12.5, fontWeight: active ? 700 : 500, color: active ? C.ink : C.ink2 }}>{pal.name}</span>
                      {active && <span style={{ fontSize: 12, color: C.ink, flexShrink: 0 }}>✓</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
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
            <div style={{ borderTop: `1px solid rgba(47,111,184,0.18)`, borderBottom: `1px solid ${C.line}`, position: "relative", overflow: "visible" }}>
              <div
                ref={bandRef}
                style={{ height: 26, position: "relative", userSelect: "none", touchAction: "none", cursor: "crosshair", background: "rgba(47,111,184,0.055)" }}
                onMouseDown={handleBandCreateDown}
                onTouchStart={handleBandCreateDown}>

                {/* Zonas de repetición */}
                {localReps.map(rep => {
                  const fS  = timeToFrac(rep.first.start)  * 100;
                  const fE  = timeToFrac(rep.first.end)    * 100;
                  const sE  = timeToFrac(rep.second.end)   * 100;
                  const fW  = fE - fS;
                  const sW  = sE - fE;
                  return (
                    <React.Fragment key={rep.id}>
                      {/* Zona "original" — clicable para seleccionar la repetición */}
                      <div
                        onMouseDown={e => { e.stopPropagation(); setSelectedRepId(r => r === rep.id ? null : rep.id); setSelected(null); }}
                        onTouchStart={e => { e.stopPropagation(); setSelectedRepId(r => r === rep.id ? null : rep.id); setSelected(null); }}
                        style={{ position: "absolute", top: 3, bottom: 3, left: `${fS}%`, width: `${fW}%`, background: selectedRepId === rep.id ? `${C.fnS}45` : `${C.fnS}28`, borderRadius: 4, border: selectedRepId === rep.id ? `1.5px solid ${C.fnS}` : `1px solid ${C.fnS}60`, boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", cursor: "pointer", zIndex: 5 }}>
                        <span style={{ fontSize: 9, fontWeight: 700, color: C.fnS, letterSpacing: 0.6, textTransform: "uppercase", whiteSpace: "nowrap", pointerEvents: "none" }}>original</span>
                      </div>
                      {/* Zona "repetición" — clicable para seleccionar la repetición */}
                      <div
                        onMouseDown={e => { e.stopPropagation(); setSelectedRepId(r => r === rep.id ? null : rep.id); setSelected(null); }}
                        onTouchStart={e => { e.stopPropagation(); setSelectedRepId(r => r === rep.id ? null : rep.id); setSelected(null); }}
                        style={{ position: "absolute", top: 3, bottom: 3, left: `${fE}%`, width: `${sW}%`, background: selectedRepId === rep.id ? `${C.fnT}38` : `${C.fnT}22`, borderRadius: 4, border: selectedRepId === rep.id ? `1.5px solid ${C.fnT}` : `1px solid ${C.fnT}55`, boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", cursor: "pointer", zIndex: 5 }}>
                        <span style={{ fontSize: 9, fontWeight: 700, color: C.fnT, letterSpacing: 0.6, textTransform: "uppercase", whiteSpace: "nowrap", pointerEvents: "none" }}>repetición</span>
                      </div>
                      {/* Asa: inicio del original */}
                      <div onMouseDown={e => handleBandHandleDown(e, rep, "first.start")} onTouchStart={e => handleBandHandleDown(e, rep, "first.start")}
                        title={`Inicio original: ${fmt(rep.first.start)}`}
                        style={{ position: "absolute", top: 0, bottom: 0, left: `calc(${fS}% - 5px)`, width: 10, cursor: "ew-resize", zIndex: 10, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <div style={{ width: 3, height: 16, borderRadius: 2, background: C.fnS, boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
                      </div>
                      {/* Asa: unión original/repetición */}
                      <div onMouseDown={e => handleBandHandleDown(e, rep, "junction")} onTouchStart={e => handleBandHandleDown(e, rep, "junction")}
                        title={`Fin original / inicio repetición: ${fmt(rep.first.end)}`}
                        style={{ position: "absolute", top: 0, bottom: 0, left: `calc(${fE}% - 6px)`, width: 12, cursor: "ew-resize", zIndex: 10, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <div style={{ width: 4, height: 20, borderRadius: 2, background: C.ink2, boxShadow: "0 1px 4px rgba(0,0,0,0.25)" }} />
                      </div>
                      {/* Asa: fin de la repetición */}
                      <div onMouseDown={e => handleBandHandleDown(e, rep, "second.end")} onTouchStart={e => handleBandHandleDown(e, rep, "second.end")}
                        title={`Fin repetición: ${fmt(rep.second.end)}`}
                        style={{ position: "absolute", top: 0, bottom: 0, left: `calc(${sE}% - 5px)`, width: 10, cursor: "ew-resize", zIndex: 10, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <div style={{ width: 3, height: 16, borderRadius: 2, background: C.fnT, boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
                      </div>
                      {/* Botón eliminar */}
                      <button onMouseDown={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()}
                        onClick={() => deleteRepeat(rep.id)} title="Eliminar repetición"
                        style={{ position: "absolute", top: 3, right: 4, zIndex: 20, background: "rgba(255,255,255,0.85)", border: `1px solid ${C.line}`, borderRadius: 3, padding: "0px 5px", fontSize: 9, cursor: "pointer", color: C.muted, lineHeight: 1.6 }}>
                        ✕
                      </button>
                    </React.Fragment>
                  );
                })}

                {/* Preview mientras se arrastra para crear */}
                {bandDrag?.type === "create" && (() => {
                  const s  = Math.min(bandDrag.startT, bandDrag.curT);
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
                    ref={el => trackSegRefs.current[`ruler_${si}_normal`] = el}
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
                          <span style={{ fontSize: 8, color: C.danger, fontFamily: FONT_MONO, position: "relative", zIndex: 1, lineHeight: 1.2, marginTop: 1, pointerEvents: "none" }}>{fmt(mt)}</span>
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
                    ref={el => trackSegRefs.current[`ruler_${si}_${pass}`] = el}
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
                  <div ref={el => trackSegRefs.current[`ruler_${si}_first`] = el}
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
                  <div ref={el => trackSegRefs.current[`ruler_${si}_second`] = el}
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
                const bounds = seg.type === "repeat-first" ? { min: seg.rep.first.start, max: seg.rep.first.end }
                             : seg.type === "repeat-second" ? { min: seg.rep.second.start, max: seg.rep.second.end }
                             : { min: 0, max: duration };
                const segWidthPx = rulerW * (seg.vEnd - seg.vStart);
                const ticks = rulerTicksForSeg(bounds.min, bounds.max, segWidthPx);
                return (
                  <div key={si} style={{ flex: seg.canonDur, position: "relative", height: "100%", borderRight: si < segments.length - 1 ? `1px solid ${C.line}` : "none" }}>
                    {ticks.map(({ t, frac }) => (
                      <div key={t} style={{ position: "absolute", top: 0, bottom: 0, left: `${frac * 100}%`, display: "flex", flexDirection: "column", alignItems: "center" }}>
                        <div style={{ width: 1, height: 5, background: C.muted, opacity: 0.5 }} />
                        <span style={{ fontSize: 8, color: C.muted, fontFamily: FONT_MONO, fontWeight: 500, transform: "translateX(-50%)", whiteSpace: "nowrap", lineHeight: 1, marginTop: 1 }}>{fmt(t)}</span>
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
                      ref={el => trackSegRefs.current[`${lv.id}_${si}_normal`] = el}
                      style={{ flex: seg.canonDur, position: "relative", height: lv.id === 1 ? 62 : lv.id === 2 ? 52 : 44, background: C.paper, cursor: "crosshair", userSelect: "none", touchAction: "none" }}
                      onMouseDown={e => handleTrackSegDown(e, lv.id, seg, "normal")}
                      onTouchStart={e => handleTrackSegDown(e, lv.id, seg, "normal")}>
                      {/* Etiqueta del nivel (solo en el primer segmento) */}
                      {si === 0 && (
                        <div style={{ position: "absolute", top: 4, left: 6, zIndex: 1, pointerEvents: "none" }}>
                          <span style={{ fontSize: 9, fontWeight: 700, color: lv.color, letterSpacing: 0.3, opacity: 0.35, fontFamily: FONT_SANS }}>{lv.sub}</span>
                        </div>
                      )}
                      {renderSegBlocks(seg, "normal", lv.id)}
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
                        ref={el => trackSegRefs.current[`${lv.id}_${si}_${pass}`] = el}
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
                        {renderSegBlocks(seg, pass, lv.id)}
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
                      {renderSegBlocks(seg, displayPass, lv.id)}
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
            const D=(extra)=>({position:"absolute",width:DW,height:DW,borderRadius:"50%",background:"rgba(0,0,0,0.70)",...extra});
            const V=(extra)=>({position:"absolute",top:0,bottom:0,background:"rgba(0,0,0,0.72)",...extra});
            const Vt=(extra)=>({position:"absolute",top:0,bottom:0,background:"rgba(0,0,0,0.28)",...extra});

            // Todas las repeticiones cubren todos los niveles activos.
            // top=0, bottom=0 → span completo del contenedor PISTAS.
            const ev = new Map();
            const kv = v => v.toFixed(5);
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
                <div style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", fontSize: 9, color: C.muted2, fontFamily: FONT_MONO, fontWeight: 600, pointerEvents: "none", letterSpacing: 0.3 }}>
                  ×{schemaZoom.toFixed(1)}
                </div>
              </div>

            </div>
          );
        })()}

        {/* Panel de selección de bloque */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {selBlock && !selBlock.isPreview && selLv ? (
            <div style={{ background: C.paper, border: `1px solid ${selLv.color}40`, borderRadius: 12, padding: "10px 14px", display: "flex", alignItems: "center", gap: 9, flex: 1, minWidth: 0, flexWrap: "wrap" }}
              onMouseDown={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: selLv.color, flexShrink: 0 }} />
              <span style={{ fontFamily: FONT_SERIF, fontSize: 16, fontWeight: 700, color: C.ink }}>{selBlock.label}</span>
              <span style={{ fontSize: 11, color: C.muted, flex: 1, minWidth: 90 }}>
                {selLv.sub} · {fmt(selBlock.start)}–{fmt(selBlock.end)} · dur.&nbsp;{fmt(selBlock.end - selBlock.start)}
              </span>
              {/* Selector de color */}
              {selBlock.level !== 4 && (() => {
                const { bg: swatchBg } = selBlock.customColor
                  ? harmonyBlockColors(null, selBlock.customColor)
                  : selLv.id === 3 ? harmonyBlockColors(selBlock.label, selLv.color)
                  : (selLv.id === 1 || selLv.id === 2) ? schemaBlockColor(selBlock, blocks, schemaPalette)
                  : { bg: selLv.color };
                return (
                  <span title="Cambiar color" style={{ position: "relative", display: "inline-flex", alignItems: "center", flexShrink: 0 }}>
                    <span onClick={() => colorInputRef.current?.click()}
                      style={{ display: "inline-block", width: 22, height: 22, borderRadius: 5, background: swatchBg, border: `2px solid ${C.line}`, boxShadow: "inset 0 1px 2px rgba(0,0,0,0.12)", cursor: "pointer" }} />
                    <input ref={colorInputRef} type="color" value={swatchBg}
                      onChange={e => { const hex = e.target.value; setBlocks(prev => prev.map(b => {
                        if (b.id === selected) return { ...b, customColor: hex };
                        if (prev.find(x => x.id === selected)?.pass === "first" && b.mirrorId === selected) return { ...b, customColor: hex };
                        return b;
                      })); }}
                      style={{ position: "absolute", opacity: 0, width: "100%", height: "100%", top: 0, left: 0, cursor: "pointer", border: "none", padding: 0 }} />
                  </span>
                );
              })()}
              {selBlock.level !== 4 && selBlock.customColor && (
                <button title="Restablecer color automático" className="fa-pressable"
                  onClick={() => setBlocks(prev => { const selB = prev.find(b => b.id === selected); return prev.map(b => { if (b.id === selected) return { ...b, customColor: undefined }; if (selB?.pass === "first" && b.mirrorId === selected) return { ...b, customColor: undefined }; return b; }); })}
                  style={{ border: `1px solid ${C.line}`, background: C.paper2, borderRadius: 7, padding: "6px 9px", fontSize: 11, cursor: "pointer", color: C.muted, lineHeight: 1 }}>↺</button>
              )}
              {selBlock.pass !== "second" && (
                <button onClick={() => { setEditId(selected); setEditVal(selBlock.label); }} className="fa-pressable"
                  style={{ border: `1px solid ${C.line}`, background: C.paper2, borderRadius: 7, padding: "6px 12px", fontSize: 11.5, fontWeight: 500, cursor: "pointer", color: C.ink2 }}>Renombrar</button>
              )}
              {selBlock.pass === "second" && (
                <span style={{ fontSize: 10, color: C.muted, fontStyle: "italic" }}>texto igual al original</span>
              )}
              <button onClick={() => { setHistory(prev => [...prev, blocksRef.current]); setBlocks(prev => prev.filter(b => b.id !== selected)); setSelected(null); }} className="fa-pressable"
                style={{ border: `1px solid ${C.danger}`, background: "transparent", borderRadius: 7, padding: "6px 12px", fontSize: 11.5, fontWeight: 500, cursor: "pointer", color: C.danger }}>Eliminar</button>
            </div>
          ) : selectedRepId ? (() => {
            const rep = localReps.find(r => r.id === selectedRepId);
            if (!rep) return null;
            return (
              <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap", background: C.paper, border: `1px solid ${C.fnS}40`, borderRadius: 12, padding: "10px 14px" }}
                onMouseDown={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: C.fnS, display: "inline-block", flexShrink: 0 }} />
                <span style={{ fontFamily: FONT_SERIF, fontSize: 16, fontWeight: 700, color: C.ink }}>Repetición</span>
                <span style={{ fontSize: 11, color: C.muted, flex: 1, minWidth: 90 }}>
                  {fmt(rep.first.start)}–{fmt(rep.first.end)} · {fmt(rep.second.start)}–{fmt(rep.second.end)}
                </span>
                <button className="fa-pressable"
                  onClick={() => { deleteRepeat(selectedRepId); setSelectedRepId(null); }}
                  style={{ border: `1px solid ${C.danger}`, background: "transparent", borderRadius: 7, padding: "6px 12px", fontSize: 11.5, fontWeight: 500, cursor: "pointer", color: C.danger }}>
                  Eliminar
                </button>
              </div>
            );
          })() : (
            <div style={{ flex: 1, fontSize: 12.5, color: C.muted, padding: "8px 10px", lineHeight: 1.5 }}>
              {blocks.filter(b => !b.isPreview).length === 0
                ? "Arrastra sobre cualquier pista para crear un bloque · doble toque para renombrar."
                : `${blocks.filter(b => !b.isPreview).length} bloque${blocks.filter(b => !b.isPreview).length !== 1 ? "s" : ""} · selecciona uno para editarlo.`}
            </div>
          )}

          {/* Área de texto (nivel 4) — ancho completo bajo el panel de selección */}
          {selBlock?.level === 4 && !selBlock.isPreview && (
            <div style={{ width: "100%", marginTop: 4 }}
              onMouseDown={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()}>
              <label style={{ ...S.label, marginBottom: 4, color: SCHEMA_LEVELS[3].color }}>
                Texto / Observaciones
                {selBlock.pass !== "second"
                  ? <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}> — solo visible al seleccionar el bloque</span>
                  : <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0, color: C.muted }}> — sincronizado del original (solo lectura)</span>}
              </label>
              {selBlock.pass === "second" ? (
                <div style={{ ...S.input, minHeight: 60, lineHeight: 1.6, fontSize: 13, color: selBlock.bodyText ? C.ink : C.muted2, fontStyle: selBlock.bodyText ? "normal" : "italic", background: C.paper2, opacity: 0.75, pointerEvents: "none", userSelect: "none" }}>
                  {selBlock.bodyText || "Sin texto en el original"}
                </div>
              ) : (
                <textarea
                  style={{ ...S.input, minHeight: 100, resize: "vertical", fontFamily: FONT_SANS, lineHeight: 1.6, fontSize: 13 }}
                  placeholder="Escribe aquí el texto completo para este bloque… (solo tú lo verás al seleccionarlo)"
                  value={selBlock.bodyText || ""}
                  onChange={e => {
                    const newText = e.target.value;
                    setBlocks(prev => prev.map(b => {
                      if (b.id === selected) return { ...b, bodyText: newText };
                      // Propagar el texto al bloque espejo de la 2ª vez
                      if (b.mirrorId === selected) return { ...b, bodyText: newText };
                      return b;
                    }));
                  }}
                  onClick={e => e.stopPropagation()} />
              )}
            </div>
          )}
        </div>


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

// ═══ 10. CORRECTION VIEW · QUESTIONNAIRE VIEW ═══════════════════════════════

// Línea vertical animada a 60 fps sobre el timeline del esquema (sin re-renders de React)
function SchemaPlayhead({ timeRef, duration }) {
  const lineRef = useRef(null);
  useEffect(() => {
    let raf;
    const tick = () => {
      if (lineRef.current && duration > 0) {
        const pct = Math.min(100, (timeRef.current / duration) * 100);
        lineRef.current.style.left = `${pct}%`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [timeRef, duration]);
  return (
    <div ref={lineRef} style={{
      position: "absolute", top: 0, left: 0, width: 2, height: "100%",
      background: C.danger, opacity: 0.75, pointerEvents: "none", zIndex: 10,
      transform: "translateX(-50%)", borderRadius: 1,
    }} />
  );
}

function CorrectionView({ exercise, result, margin, onBack, backLabel = "← Mis ejercicios", isTeacherMode = false, student = null, onSaveCorrection = null }) {
  const dur = exercise.duration;
  const tc  = result.teacherCorrection;

  // Hooks siempre en el mismo orden (reglas de React)
  const [lvComments,   setLvComments]   = useState(() => tc?.levelComments   || {});
  const [blkComments,  setBlkComments]  = useState(() => tc?.blockComments   || {});
  const [schemaGlobal, setSchemaGlobal] = useState(tc?.globalComment || "");
  const [schemaScore,  setSchemaScore]  = useState(tc?.totalScore ?? "");
  const [showBlkForm,  setShowBlkForm]  = useState(false);
  const [qComments,    setQComments]    = useState(() => tc?.questionComments || {});
  const [quizGlobal,   setQuizGlobal]   = useState(tc?.globalComment || "");
  const [quizScore,    setQuizScore]    = useState(tc?.totalScore ?? "");

  // Audio — siempre incondicional (reglas de hooks)
  const { time, timeRef: audioTimeRef, playing, audioReady, hasAudio, togglePlay, seekTo } = useAudioPlayer(exercise);

  // Modelo esquema — corrección semiautomática
  if (result.type === "esquema") {
    const blocks      = result.blocks || [];
    const schemaKey   = exercise.schemaKey || [];
    const hasKey      = schemaKey.length > 0;
    const ps          = result.placementScore ?? null;
    const studentPalette = result.schemaPalette || SCHEMA_PALETTE_DEFAULT;   // paleta elegida por el alumno
    const keyPalette     = exercise.schemaPalette || SCHEMA_PALETTE_DEFAULT;  // paleta de la clave (profesor)
    const activeLevels = SCHEMA_LEVELS.filter((lv) =>
      !exercise.schemaLevels || exercise.schemaLevels.length === 0 || exercise.schemaLevels.includes(lv.id)
    );

    const handleTimelineClick = (e) => {
      const rect = e.currentTarget.getBoundingClientRect();
      seekTo(((e.clientX - rect.left) / rect.width) * exercise.duration);
    };

    const SchemaStrip = ({ title: stripTitle, bks, paletteId = studentPalette }) => (
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: C.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 10 }}>{stripTitle}</div>
        {activeLevels.map((lv) => {
          const lvBlocks = bks.filter((b) => b.level === lv.id).sort((a, b) => a.start - b.start);
          if (lvBlocks.length === 0) return null;
          return (
            <div key={lv.id} style={{ marginBottom: lv.id === 4 ? 14 : 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: lv.color, minWidth: 56, textTransform: "uppercase", letterSpacing: 0.5 }}>{lv.sub}</span>
                <div
                  onClick={hasAudio ? handleTimelineClick : undefined}
                  style={{ flex: 1, position: "relative", height: 40, background: C.paper2, borderRadius: 6, overflow: "hidden", cursor: hasAudio ? "pointer" : "default" }}>
                  {lvBlocks.map((b, i) => {
                    const lPct = (b.start / exercise.duration) * 100;
                    const wPct = Math.max(((b.end - b.start) / exercise.duration) * 100, 0.5);
                    const { bg, textColor } = schemaBlockColor(b, bks, paletteId);
                    if (lv.id === 3) {
                      return (
                        <div key={i} style={{ position: "absolute", top: 6, bottom: 6, left: `${lPct}%`, width: `${wPct}%`, display: "flex", alignItems: "center", overflow: "hidden", pointerEvents: "none" }}>
                          <div style={{ background: bg, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", padding: "4px 10px", flexShrink: 0, minWidth: 0 }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: textColor, fontFamily: FONT_SANS, whiteSpace: "nowrap" }}>{b.label}</span>
                          </div>
                          {wPct >= 4 && <div style={{ flex: 1, height: 2.5, background: bg, opacity: 0.55, marginLeft: 4, borderRadius: 1.5 }} />}
                        </div>
                      );
                    }
                    if (lv.id === 4) {
                      return (
                        <div key={i} style={{ position: "absolute", top: 4, bottom: 4, left: `${lPct}%`, width: `${wPct}%`, background: bg, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 10px", overflow: "hidden", pointerEvents: "none" }}>
                          <span style={{ fontSize: 11, fontWeight: 500, color: textColor, fontFamily: FONT_SANS, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{b.label}</span>
                        </div>
                      );
                    }
                    return (
                      <div key={i} style={{ position: "absolute", top: 3, bottom: 3, left: `${lPct}%`, width: `${wPct}%`, background: bg, borderRadius: 4, border: "1px solid rgba(255,255,255,0.22)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", pointerEvents: "none" }}>
                        <span style={{ fontSize: 11, fontWeight: lv.id === 1 ? 700 : 500, color: textColor, fontFamily: FONT_SANS, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "84%", padding: "0 3px" }}>{b.label}</span>
                      </div>
                    );
                  })}
                  {hasAudio && <SchemaPlayhead timeRef={audioTimeRef} duration={exercise.duration} />}
                </div>
              </div>
              {lv.id === 4 && lvBlocks.some(b => b.bodyText) && (
                <div style={{ paddingLeft: 66, marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
                  {lvBlocks.filter(b => b.bodyText).map((b, i) => {
                    const { bg } = schemaBlockColor(b, bks, paletteId);
                    return (
                      <div key={i} style={{ background: C.paper2, border: `1px solid ${C.line}`, borderRadius: 8, padding: "10px 14px", borderLeft: `3px solid ${bg}` }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                          <span style={{ fontFamily: FONT_SANS, fontWeight: 700, fontSize: 13, color: bg }}>{b.label}</span>
                          <span style={{ fontSize: 11, color: C.muted, fontFamily: FONT_MONO }}>{fmt(b.start)}–{fmt(b.end)}</span>
                        </div>
                        <div style={{ fontSize: 13, color: C.ink, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{b.bodyText}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );

    const AudioBar = () => hasAudio ? (
      <div style={{ ...S.card, marginBottom: 16, padding: "12px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            onClick={togglePlay}
            disabled={!audioReady}
            style={{ width: 36, height: 36, borderRadius: "50%", border: "none", background: audioReady ? C.ink : C.line, color: C.paper, cursor: audioReady ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0, transition: "background .15s" }}>
            {playing ? "⏸" : "▶"}
          </button>
          <div
            onClick={handleTimelineClick}
            style={{ flex: 1, position: "relative", height: 6, background: C.paper2, borderRadius: 3, cursor: "pointer", overflow: "visible" }}>
            <div style={{ position: "absolute", top: 0, left: 0, height: "100%", width: `${(time / exercise.duration) * 100}%`, background: C.fnS, borderRadius: 3, transition: "width .1s linear" }} />
          </div>
          <span style={{ fontSize: 12, fontFamily: FONT_MONO, color: C.muted, flexShrink: 0 }}>{fmt(time)} / {fmt(exercise.duration)}</span>
        </div>
      </div>
    ) : null;

    // ── Vista del profesor ────────────────────────────────────────────────────
    if (isTeacherMode) {
      const handleSave = () => onSaveCorrection?.(student?.id, exercise.id, {
        levelComments: lvComments,
        blockComments: Object.fromEntries(Object.entries(blkComments).filter(([, v]) => v?.trim())),
        globalComment: schemaGlobal.trim(),
        totalScore:    schemaScore !== "" ? Number(schemaScore) : null,
      });
      return (
        <div style={S.app}>
          <div style={S.page}>
            <button onClick={onBack} style={{ ...S.btn, marginBottom: 20, fontSize: 12, padding: "6px 12px" }}>{backLabel}</button>
            <h1 style={{ ...S.h1, marginBottom: 4 }}>Corrección: {exercise.title}</h1>
            {student && <p style={{ color: C.muted, fontSize: 13, margin: "0 0 20px" }}>Alumno: <strong>{student.displayName}</strong></p>}

            {ps != null && (
              <div style={{ ...S.card, textAlign: "center", marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>Colocación automática (margen ±3 s)</div>
                <div style={{ fontSize: 48, fontWeight: 900, color: scoreColor(ps), lineHeight: 1 }}>{ps}%</div>
                <div style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>de bloques dentro del margen</div>
              </div>
            )}

            <AudioBar />

            {(blocks.length > 0 || hasKey) && (
              <div style={{ ...S.card, marginBottom: 16 }}>
                {hasKey && <><SchemaStrip title="Referencia (profesor)" bks={schemaKey} paletteId={keyPalette} /><hr style={{ ...S.divider, margin: "10px 0 14px" }} /></>}
                {blocks.length > 0 && <SchemaStrip title="Esquema del alumno" bks={blocks} />}
              </div>
            )}

            <div style={{ ...S.card, border: `1.5px solid rgba(47,111,184,0.3)` }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.quiz, marginBottom: 16 }}>
                {tc?.corrected ? "Editar corrección" : "Añadir corrección manual"}
              </div>

              {activeLevels.map((lv) => (
                <div key={lv.id} style={{ marginBottom: 14 }}>
                  <label style={{ ...S.label, color: lv.color }}>{lv.sub} — comentario (opcional)</label>
                  <textarea value={lvComments[lv.id] || ""}
                    onChange={(e) => setLvComments((p) => ({ ...p, [lv.id]: e.target.value }))}
                    placeholder={`Valoración del nivel ${lv.sub}…`}
                    style={{ ...S.input, minHeight: 56, resize: "vertical", fontFamily: FONT_SANS }} />
                </div>
              ))}

              {blocks.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <button onClick={() => setShowBlkForm(!showBlkForm)} style={{ ...S.btn, fontSize: 12, marginBottom: 8 }}>
                    {showBlkForm ? "▲ Ocultar comentarios por bloque" : "▼ Comentarios por bloque (opcional)"}
                  </button>
                  {showBlkForm && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {blocks.map((b) => {
                        const lv = SCHEMA_LEVELS.find((l) => l.id === b.level);
                        return (
                          <div key={b.id} style={{ background: C.paper2, border: `1px solid ${C.line}`, borderRadius: 8, padding: "8px 12px" }}>
                            <div style={{ ...S.row, gap: 6, marginBottom: 6 }}>
                              <span style={{ fontFamily: FONT_SERIF, fontWeight: 700, fontSize: 12, color: lv?.color }}>{b.label}</span>
                              <span style={{ fontSize: 11, color: C.muted, fontFamily: FONT_MONO }}>{fmt(b.start)}–{fmt(b.end)}</span>
                              <span style={{ fontSize: 10, background: (lv?.color || C.muted) + "20", color: lv?.color || C.muted, padding: "1px 6px", borderRadius: 3 }}>{lv?.sub}</span>
                            </div>
                            <textarea value={blkComments[b.id] || ""}
                              onChange={(e) => setBlkComments((p) => ({ ...p, [b.id]: e.target.value }))}
                              placeholder="Comentario sobre este bloque…" rows={2}
                              style={{ ...S.input, resize: "vertical", fontFamily: FONT_SANS, fontSize: 12 }} />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              <div style={{ marginBottom: 14 }}>
                <label style={S.label}>Comentario general</label>
                <textarea value={schemaGlobal} onChange={(e) => setSchemaGlobal(e.target.value)}
                  placeholder="Observaciones generales sobre el esquema…"
                  style={{ ...S.input, minHeight: 70, resize: "vertical", fontFamily: FONT_SANS }} />
              </div>

              <div style={{ marginBottom: 18 }}>
                <label style={S.label}>Puntuación total (0–10, opcional)</label>
                <input type="number" min={0} max={10} step={0.5} value={schemaScore}
                  onChange={(e) => setSchemaScore(e.target.value)} placeholder="Ej: 7.5"
                  style={{ ...S.input, width: 120 }} />
              </div>

              <button onClick={handleSave} style={{ ...S.btnPrimary, width: "100%" }}>
                {tc?.corrected ? "Actualizar corrección" : "Guardar corrección"}
              </button>
            </div>
            <div style={{ height: 32 }} />
          </div>
        </div>
      );
    }

    // ── Vista del alumno ──────────────────────────────────────────────────────
    const showRefSchema = exercise.immediateSchemaFeedback && hasKey;
    return (
      <div style={S.app}>
        <div style={S.page}>
          <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "var(--f-sans, Outfit)", fontSize: 13, color: "#888", padding: 0, marginBottom: 20 }}>← Volver</button>
          <h1 style={{ ...S.h1, marginBottom: 20 }}>Esquema entregado: {exercise.title}</h1>

          <div style={{ ...S.card, textAlign: "center", marginBottom: 20 }}>
            {ps != null ? (
              <>
                <div style={{ fontSize: 56, fontWeight: 900, color: scoreColor(ps), lineHeight: 1 }}>{ps}%</div>
                <div style={{ color: C.muted, fontSize: 13, marginTop: 4 }}>de bloques colocados correctamente (margen ±3 s)</div>
              </>
            ) : (
              <div style={{ color: C.muted, lineHeight: 1.6 }}>
                Esquema enviado al profesor para revisión.<br />
                <span style={{ fontSize: 12 }}>{blocks.length} {blocks.length === 1 ? "bloque dibujado" : "bloques dibujados"}.</span>
              </div>
            )}
          </div>

          <AudioBar />

          {(blocks.length > 0 || showRefSchema) && (
            <div style={S.card}>
              {showRefSchema && <><SchemaStrip title="Esquema de referencia (profesor)" bks={schemaKey} paletteId={keyPalette} /><hr style={{ ...S.divider, margin: "10px 0 14px" }} /></>}
              {!showRefSchema && hasKey && (
                <p style={{ textAlign: "center", color: C.muted, fontSize: 12, margin: "0 0 14px" }}>
                  El esquema de referencia estará disponible cuando el profesor corrija el ejercicio.
                </p>
              )}
              {blocks.length > 0 && <SchemaStrip title="Tu esquema" bks={blocks} />}
            </div>
          )}

          {tc?.corrected && (
            <div style={{ ...S.card, border: `1.5px solid rgba(47,111,184,0.35)`, marginTop: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.quiz, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 12 }}>Corrección del profesor</div>
              {tc.totalScore != null && (
                <div style={{ textAlign: "center", marginBottom: 14 }}>
                  <span style={{ fontSize: 48, fontWeight: 900, color: C.quiz, lineHeight: 1 }}>{tc.totalScore}</span>
                  <span style={{ fontSize: 18, color: C.quiz }}>/10</span>
                </div>
              )}
              {activeLevels.filter((lv) => tc.levelComments?.[lv.id]).map((lv) => (
                <div key={lv.id} style={{ marginBottom: 10, padding: "10px 12px", background: C.paper2, borderRadius: 8, borderLeft: `3px solid ${lv.color}` }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: lv.color, marginBottom: 4 }}>{lv.sub}</div>
                  <div style={{ fontSize: 13, color: C.ink, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{tc.levelComments[lv.id]}</div>
                </div>
              ))}
              {tc.blockComments && Object.entries(tc.blockComments).filter(([, v]) => v).map(([blockId, comment]) => {
                const block = blocks.find((b) => b.id === blockId);
                if (!block) return null;
                const lv = SCHEMA_LEVELS.find((l) => l.id === block.level);
                return (
                  <div key={blockId} style={{ marginBottom: 6, padding: "8px 10px", background: C.paper2, borderRadius: 8 }}>
                    <div style={{ ...S.row, gap: 6, marginBottom: 4 }}>
                      <span style={{ fontFamily: FONT_SERIF, fontWeight: 700, fontSize: 12, color: lv?.color }}>{block.label}</span>
                      <span style={{ fontSize: 11, color: C.muted, fontFamily: FONT_MONO }}>{fmt(block.start)}–{fmt(block.end)}</span>
                    </div>
                    <div style={{ fontSize: 13, color: C.ink, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{comment}</div>
                  </div>
                );
              })}
              {tc.globalComment && (
                <div style={{ padding: "10px 12px", background: "rgba(47,111,184,0.06)", border: `1px solid rgba(47,111,184,0.2)`, borderRadius: 8, marginTop: 6 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.quiz, marginBottom: 4 }}>Comentario general</div>
                  <div style={{ fontSize: 13, color: C.ink, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{tc.globalComment}</div>
                </div>
              )}
            </div>
          )}

          <button onClick={onBack} style={{ ...S.btnPrimary, width: "100%", marginTop: 16, padding: 14, borderRadius: 12 }}>{backLabel}</button>
        </div>
      </div>
    );
  }

  // Modelo cuestionario
  if (result.type === "cuestionario") {
    const questions = questionsOf(exercise);
    const sc        = result.score;
    const testQs    = questions.filter((q) => q.type === "test" && q.correctOptionId);
    const devQs     = questions.filter((q) => q.type === "desarrollo");
    const correctN  = testQs.filter((q) => result.answers?.[q.id] === q.correctOptionId).length;
    const col       = scoreColor(sc);

    const handleSaveQuiz = () => {
      const correction = {
        corrected: true,
        questionComments: qComments,
        globalComment: quizGlobal,
        totalScore: quizScore === "" ? null : Number(quizScore),
      };
      onSaveCorrection(student.id, exercise.id, correction);
    };

    if (isTeacherMode) {
      return (
        <div style={S.app}>
          <div style={S.page}>
            <button onClick={onBack} style={{ ...S.btn, marginBottom: 24, fontSize: 12, padding: "6px 12px" }}>{backLabel}</button>
            <h1 style={{ ...S.h1, marginBottom: 4 }}>Corrección: {exercise.title}</h1>
            {student && <p style={{ color: C.muted, fontSize: 13, marginBottom: 20 }}>Alumno: <strong>{student.name}</strong></p>}

            {sc != null && (
              <div style={{ ...S.card, textAlign: "center", marginBottom: 20 }}>
                <div style={{ fontSize: 48, fontWeight: 900, color: col, lineHeight: 1 }}>{sc}%</div>
                <div style={{ color: C.muted, fontSize: 13, marginTop: 4 }}>{correctN} de {testQs.length} {testQs.length === 1 ? "pregunta test" : "preguntas test"} correctas (automático)</div>
              </div>
            )}

            {questions.map((q, idx) => {
              const studentAnswer = result.answers?.[q.id];
              const isCorrect = q.type === "test" && studentAnswer === q.correctOptionId;
              const isWrong   = q.type === "test" && !!studentAnswer && studentAnswer !== q.correctOptionId;
              return (
                <div key={q.id} style={{ ...S.card, marginBottom: 16, border: q.type !== "test" ? `1.5px solid ${C.quiz}33` : `1.5px solid ${isCorrect ? C.fnT : isWrong ? C.danger : C.line}` }}>
                  <div style={{ ...S.row, gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                    <span style={{ ...S.badge, background: C.line, color: C.muted }}>P{idx + 1}</span>
                    <span style={{ ...S.badge, background: q.type === "test" ? "rgba(63,155,91,0.12)" : "rgba(47,111,184,0.12)", color: q.type === "test" ? C.fnT : C.quiz }}>{q.type === "test" ? "Test" : "Desarrollo"}</span>
                    <span style={{ ...S.badge, background: C.paper2, color: C.muted, fontFamily: FONT_MONO }}>{fmt(q.audioStart)}–{fmt(q.audioEnd)}</span>
                    {q.type === "test" && (
                      <span style={{ ...S.badge, background: isCorrect ? "rgba(63,155,91,0.16)" : isWrong ? "rgba(184,74,58,0.16)" : C.line, color: isCorrect ? C.fnT : isWrong ? C.danger : C.muted }}>
                        {!studentAnswer ? "Sin respuesta" : isCorrect ? "✓ Correcta" : "✗ Incorrecta"}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 14, color: C.ink, marginBottom: 12 }}>{q.text}</div>

                  {q.type === "test" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {q.options.map((opt) => {
                        const isPick       = opt.id === studentAnswer;
                        const isCorrectOpt = opt.id === q.correctOptionId;
                        return (
                          <div key={opt.id} style={{
                            ...S.row, gap: 10, padding: "8px 12px", borderRadius: 8,
                            background: isCorrectOpt ? "rgba(63,155,91,0.10)" : isPick && !isCorrectOpt ? "rgba(184,74,58,0.10)" : C.paper2,
                            border:     `1.5px solid ${isCorrectOpt ? C.fnT : isPick && !isCorrectOpt ? C.danger : C.line}`,
                            color:      isCorrectOpt ? C.fnT : isPick && !isCorrectOpt ? C.danger : C.muted,
                          }}>
                            <span style={{ fontFamily: FONT_MONO, fontWeight: 700, fontSize: 12, minWidth: 20 }}>{opt.id}</span>
                            <span style={{ flex: 1, fontSize: 13 }}>{opt.text}</span>
                            {isCorrectOpt && <span style={{ fontSize: 11, fontWeight: 700 }}>✓ Correcta</span>}
                            {isPick && !isCorrectOpt && <span style={{ fontSize: 11, fontWeight: 700 }}>Resp. alumno</span>}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {q.type === "desarrollo" && (
                    <div>
                      <div style={{ fontSize: 11, color: C.muted, marginBottom: 6 }}>Respuesta del alumno:</div>
                      <div style={{ background: C.paper2, border: `1px solid ${C.line}`, borderRadius: 8, padding: "10px 12px", fontSize: 14, color: C.ink, whiteSpace: "pre-wrap", minHeight: 40, lineHeight: 1.5, marginBottom: 12 }}>
                        {studentAnswer || <span style={{ color: C.muted2, fontStyle: "italic" }}>Sin respuesta</span>}
                      </div>
                      <div style={{ fontSize: 11, color: C.muted, marginBottom: 6 }}>Comentario del profesor:</div>
                      <textarea
                        value={qComments[q.id] || ""}
                        onChange={(e) => setQComments((prev) => ({ ...prev, [q.id]: e.target.value }))}
                        placeholder="Escribe un comentario para esta respuesta..."
                        rows={3}
                        style={{ width: "100%", fontFamily: "Outfit, sans-serif", fontSize: 13, background: C.paper2, border: `1px solid ${C.line}`, borderRadius: 8, padding: "10px 12px", color: C.ink, resize: "vertical", boxSizing: "border-box" }}
                      />
                    </div>
                  )}
                </div>
              );
            })}

            {devQs.length > 0 && (
              <div style={{ ...S.card, marginBottom: 16 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: C.ink, marginBottom: 12 }}>Corrección global</div>
                <div style={{ fontSize: 11, color: C.muted, marginBottom: 6 }}>Comentario global:</div>
                <textarea
                  value={quizGlobal}
                  onChange={(e) => setQuizGlobal(e.target.value)}
                  placeholder="Comentario general sobre el cuestionario..."
                  rows={3}
                  style={{ width: "100%", fontFamily: "Outfit, sans-serif", fontSize: 13, background: C.paper2, border: `1px solid ${C.line}`, borderRadius: 8, padding: "10px 12px", color: C.ink, resize: "vertical", boxSizing: "border-box", marginBottom: 12 }}
                />
                <div style={{ ...S.row, gap: 12, alignItems: "center" }}>
                  <label style={{ fontSize: 13, color: C.muted }}>Puntuación total (0–10):</label>
                  <input
                    type="number" min={0} max={10} step={0.5}
                    value={quizScore}
                    onChange={(e) => setQuizScore(e.target.value)}
                    style={{ width: 80, fontFamily: "Outfit, sans-serif", fontSize: 14, background: C.paper2, border: `1px solid ${C.line}`, borderRadius: 8, padding: "6px 10px", color: C.ink, textAlign: "center" }}
                  />
                </div>
              </div>
            )}

            <button
              onClick={handleSaveQuiz}
              disabled={devQs.length === 0}
              style={{ ...S.btnPrimary, width: "100%", padding: 14, borderRadius: 12, marginBottom: 8, opacity: devQs.length === 0 ? 0.4 : 1 }}
            >
              {tc?.corrected ? "Actualizar corrección" : "Guardar corrección"}
            </button>
            <button onClick={onBack} style={{ ...S.btn, width: "100%", padding: 14, borderRadius: 12 }}>{backLabel}</button>
          </div>
        </div>
      );
    }

    // Student mode
    return (
      <div style={S.app}>
        <div style={S.page}>
          <button onClick={onBack} style={{ ...S.btn, marginBottom: 24, fontSize: 12, padding: "6px 12px" }}>{backLabel}</button>
          <h1 style={{ ...S.h1, marginBottom: 20 }}>Corrección: {exercise.title}</h1>

          <div style={{ ...S.card, textAlign: "center", marginBottom: 20 }}>
            {tc?.corrected && tc?.totalScore != null ? (
              <>
                <div style={{ fontSize: 64, fontWeight: 900, color: scoreColor(tc.totalScore * 10), lineHeight: 1 }}>{tc.totalScore}<span style={{ fontSize: 28 }}>/10</span></div>
                <div style={{ color: C.muted, fontSize: 13, marginTop: 4 }}>Puntuación del profesor</div>
                {sc != null && <div style={{ color: C.muted, fontSize: 12, marginTop: 8 }}>{correctN} de {testQs.length} preguntas test correctas ({sc}% automático)</div>}
              </>
            ) : sc != null ? (
              <>
                <div style={{ fontSize: 64, fontWeight: 900, color: col, lineHeight: 1 }}>{sc}%</div>
                <div style={{ color: C.muted, fontSize: 14, marginTop: 4 }}>{correctN} de {testQs.length} {testQs.length === 1 ? "pregunta" : "preguntas"} correctas</div>
                <div style={{ fontSize: 14, marginTop: 12, color: col }}>
                  {sc >= 80 ? "Excelente análisis." : sc >= 50 ? "Bien, pero hay margen de mejora." : "Sigue practicando."}
                </div>
              </>
            ) : (
              <div style={{ color: C.muted, lineHeight: 1.6 }}>
                {devQs.length > 0
                  ? <>Respuestas enviadas al profesor para revisión.<br /><span style={{ fontSize: 12 }}>Las preguntas de desarrollo se corrigen manualmente.</span></>
                  : "Sin puntuación automática."}
              </div>
            )}
          </div>

          {questions.map((q, idx) => {
            const studentAnswer = result.answers?.[q.id];
            const isCorrect = q.type === "test" && studentAnswer === q.correctOptionId;
            const isWrong   = q.type === "test" && !!studentAnswer && studentAnswer !== q.correctOptionId;
            const teacherComment = tc?.corrected ? tc?.questionComments?.[q.id] : null;
            return (
              <div key={q.id} style={{ ...S.card, border: q.type !== "test" ? `1px solid ${C.line}` : `1.5px solid ${isCorrect ? C.fnT : isWrong ? C.danger : C.line}` }}>
                <div style={{ ...S.row, gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                  <span style={{ ...S.badge, background: C.line, color: C.muted }}>P{idx + 1}</span>
                  <span style={{ ...S.badge, background: q.type === "test" ? "rgba(63,155,91,0.12)" : "rgba(47,111,184,0.12)", color: q.type === "test" ? C.fnT : C.quiz }}>{q.type === "test" ? "Test" : "Desarrollo"}</span>
                  <span style={{ ...S.badge, background: C.paper2, color: C.muted, fontFamily: FONT_MONO }}>{fmt(q.audioStart)}–{fmt(q.audioEnd)}</span>
                  {q.type === "test" && (
                    <span style={{ ...S.badge, background: isCorrect ? "rgba(63,155,91,0.16)" : isWrong ? "rgba(184,74,58,0.16)" : C.line, color: isCorrect ? C.fnT : isWrong ? C.danger : C.muted }}>
                      {!studentAnswer ? "Sin respuesta" : isCorrect ? "✓ Correcta" : "✗ Incorrecta"}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 14, color: C.ink, marginBottom: 12 }}>{q.text}</div>

                {q.type === "test" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {q.options.map((opt) => {
                      const isPick       = opt.id === studentAnswer;
                      const isCorrectOpt = opt.id === q.correctOptionId;
                      return (
                        <div key={opt.id} style={{
                          ...S.row, gap: 10, padding: "8px 12px", borderRadius: 8,
                          background: isCorrectOpt ? "rgba(63,155,91,0.10)" : isPick && !isCorrectOpt ? "rgba(184,74,58,0.10)" : C.paper2,
                          border:     `1.5px solid ${isCorrectOpt ? C.fnT : isPick && !isCorrectOpt ? C.danger : C.line}`,
                          color:      isCorrectOpt ? C.fnT : isPick && !isCorrectOpt ? C.danger : C.muted,
                        }}>
                          <span style={{ fontFamily: FONT_MONO, fontWeight: 700, fontSize: 12, minWidth: 20 }}>{opt.id}</span>
                          <span style={{ flex: 1, fontSize: 13 }}>{opt.text}</span>
                          {isCorrectOpt && <span style={{ fontSize: 11, fontWeight: 700 }}>✓ Correcta</span>}
                          {isPick && !isCorrectOpt && <span style={{ fontSize: 11, fontWeight: 700 }}>Tu resp.</span>}
                        </div>
                      );
                    })}
                  </div>
                )}

                {q.type === "desarrollo" && (
                  <div>
                    <div style={{ fontSize: 11, color: C.muted, marginBottom: 6 }}>Tu respuesta:</div>
                    <div style={{ background: C.paper2, border: `1px solid ${C.line}`, borderRadius: 8, padding: "10px 12px", fontSize: 14, color: C.ink, whiteSpace: "pre-wrap", minHeight: 40, lineHeight: 1.5 }}>
                      {studentAnswer || <span style={{ color: C.muted2, fontStyle: "italic" }}>Sin respuesta</span>}
                    </div>
                    {teacherComment ? (
                      <div style={{ marginTop: 10, background: "rgba(47,111,184,0.06)", border: `1px solid ${C.quiz}55`, borderRadius: 8, padding: "10px 12px" }}>
                        <div style={{ fontSize: 11, color: C.quiz, fontWeight: 700, marginBottom: 4 }}>Comentario del profesor:</div>
                        <div style={{ fontSize: 13, color: C.ink, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{teacherComment}</div>
                      </div>
                    ) : (
                      <p style={{ fontSize: 11, color: C.muted2, margin: "6px 0 0" }}>Pendiente de revisión por el profesor.</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {tc?.corrected && tc?.globalComment && (
            <div style={{ ...S.card, background: "rgba(47,111,184,0.06)", border: `1px solid ${C.quiz}55`, marginBottom: 8 }}>
              <div style={{ fontSize: 12, color: C.quiz, fontWeight: 700, marginBottom: 6 }}>Comentario global del profesor</div>
              <div style={{ fontSize: 14, color: C.ink, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{tc.globalComment}</div>
            </div>
          )}

          <button onClick={onBack} style={{ ...S.btnPrimary, width: "100%", marginTop: 8, padding: 14, borderRadius: 12 }}>{backLabel}</button>
        </div>
      </div>
    );
  }

  // Modelo interactivo
  const exCategories     = categoriesOf(exercise);
  const resultCategoryId = result.categoryId ?? result.modeId;
  const exCategory       = exCategories.find((m) => m.id === resultCategoryId) || exCategories[0];
  const teacherAns       = answerFor(exercise, exCategory.id);
  const studentAns       = result.intervals;
  const sc               = result.score;
  const col              = scoreColor(sc);
  const pct = (t) => `${(t / dur) * 100}%`;

  return (
    <div style={S.app}>
      <div style={S.page}>
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "Outfit, sans-serif", fontSize: 13, color: "#888", padding: 0, marginBottom: 20 }}>{backLabel}</button>
        <h1 style={{ ...S.h1, marginBottom: 20 }}>Corrección: {exercise.title}</h1>

        {exCategories.length > 1 && (
          <div style={{ marginBottom: 16, color: C.muted, fontSize: 13 }}>
            Categoría: <span style={{ color: C.fnI, fontWeight: 600 }}>{exCategory.name}</span>
          </div>
        )}

        <div style={{ ...S.card, textAlign: "center", marginBottom: 20 }}>
          {sc == null ? (
            <div style={{ color: C.muted }}>Este ejercicio no tiene clave de corrección aún.</div>
          ) : (
            <>
              <div style={{ fontSize: 64, fontWeight: 900, color: col, lineHeight: 1 }}>{sc}%</div>
              <div style={{ color: C.muted, fontSize: 14, marginTop: 4 }}>de acierto · margen ±{margin}s</div>
              <div style={{ fontSize: 14, marginTop: 12, color: col }}>
                {sc >= 80 ? "Excelente análisis armónico." : sc >= 50 ? "Bien, pero hay margen de mejora." : "Sigue practicando."}
              </div>
            </>
          )}
        </div>

        {Array.isArray(result.extras) && result.extras.length > 0 && (
          <div style={{ ...S.card, marginBottom: 20 }}>
            <div style={{ fontSize: 13, color: C.muted, marginBottom: 10 }}>También has practicado:</div>
            {result.extras.map((ex2) => {
              const catId = ex2.categoryId ?? ex2.modeId;
              const m = exCategories.find((mm) => mm.id === catId);
              if (!m) return null;
              return (
                <div key={catId} style={{ ...S.row, justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${C.line}` }}>
                  <span style={{ fontSize: 13, color: C.muted2 }}>{m.name}</span>
                  <ScoreBadge score={ex2.score} />
                </div>
              );
            })}
          </div>
        )}

        {sc != null && (
          <div style={S.card}>
            <div style={{ fontSize: 13, color: C.muted, marginBottom: 12 }}>Comparación visual (margen ±{margin}s aplicado)</div>
            <div style={{ fontSize: 11, ...S.row, gap: 12, marginBottom: 8, flexWrap: "wrap" }}>
              {exCategory.buttons.map((b) => (
                <span key={b.id} style={{ ...S.row, gap: 4 }}>
                  <span style={{ width: 10, height: 10, background: b.color, borderRadius: 2, display: "inline-block" }} />
                  <span style={{ color: C.muted2 }}>{b.id} = {b.name}</span>
                </span>
              ))}
            </div>
            {[{ label: "Clave", ivs: teacherAns }, { label: "Tu respuesta", ivs: studentAns }].map(({ label, ivs }) => (
              <div key={label} style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>{label}</div>
                <div style={{ background: C.paper2, borderRadius: 6, height: 36, position: "relative" }}>
                  {ivs.map((iv, i) => {
                    const b = btnOf(exCategory, iv.fn);
                    return (
                      <div key={i} style={{ position: "absolute", top: "10%", height: "80%", left: pct(iv.start), width: pct(iv.end - iv.start), background: b.color, borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                        {(iv.end - iv.start) / dur > 0.06 && (
                          <span style={{ fontSize: 10, fontWeight: 700, color: textOn(b.color) }}>{iv.fn}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            <div style={{ ...S.row, justifyContent: "space-between", fontSize: 10, color: C.muted2 }}>
              {Array.from({ length: Math.floor(dur / 5) + 1 }, (_, i) => i * 5).map((t) => <span key={t}>{fmt(t)}</span>)}
            </div>
          </div>
        )}

        <button onClick={onBack} style={{ ...S.btnPrimary, width: "100%", marginTop: 8, padding: 14, borderRadius: 12 }}>
          {backLabel}
        </button>
      </div>
    </div>
  );
}

// Vista del alumno para ejercicios tipo "cuestionario"
function QuestionnaireView({ exercise, onSubmit, onBack, modelToggleNode = null, sharedAudioPlayer = null, loopRegionRef: externalLoopRef = null }) {
  const dur       = exercise.duration;
  const questions = questionsOf(exercise);

  const [answers,        setAnswers]        = useState({});
  const [expandedId,     setExpandedId]     = useState(null);
  const [lockedQuestion, setLockedQuestion] = useState(null);
  const [localWaveformData, setLocalWaveformData] = useState(exercise.waveformData || null);
  const waveformData = sharedAudioPlayer?.waveformData ?? localWaveformData;

  // Ref de bucle: usa el externo (del padre) si está disponible, para que el
  // reproductor compartido vea los cambios de fragmento bloqueado
  const ownLoopRegionRef = useRef(null);
  const loopRegionRef    = externalLoopRef || ownLoopRegionRef;
  loopRegionRef.current  = lockedQuestion;   // sincronizado cada render

  const localOnWaveform = (!sharedAudioPlayer && !exercise.waveformData) ? (wd) => setLocalWaveformData(wd) : null;
  const localPlayer = useAudioPlayer(
    sharedAudioPlayer ? { id: exercise.id, duration: exercise.duration, audioUrl: null } : exercise,
    { onWaveform: localOnWaveform, loopRegionRef: sharedAudioPlayer ? null : loopRegionRef }
  );
  const {
    time, playing, audioReady, audioError, hasAudio,
    timeRef, togglePlay, seekTo, playFrom, scrubBegin, scrubTo, scrubEnd, audioDuration,
  } = sharedAudioPlayer || localPlayer;

  const selectQuestion = (q) => { setLockedQuestion(q); setExpandedId(q.id); seekTo(q.audioStart); };
  const unlockAudio    = ()  => { setLockedQuestion(null); };
  // playFrom queda disponible si más adelante se quiere un botón "escuchar este fragmento" desde la card de pregunta.
   
  const _playFromAvailable = playFrom;

  const answeredCount = questions.filter((q) => answers[q.id] !== undefined && answers[q.id] !== "").length;

  const handleSubmit = () => {
    const score = calcQuestionnaireScore(questions, answers);
    onSubmit({ type: "cuestionario", answers, score });
  };

  const questionRegion = lockedQuestion
    ? { start: lockedQuestion.audioStart, end: lockedQuestion.audioEnd, color: C.quiz }
    : null;

  if (questions.length === 0) {
    return (
      <div style={S.app}>
        <SessionHeader exercise={exercise} onBack={onBack} modelId="cuestionario" />
        <div style={S.page}>
          <div style={{ ...S.card, textAlign: "center", color: C.muted, padding: "3rem 1rem", lineHeight: 1.8, borderRadius: 16 }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
            <div>Este ejercicio aún no tiene preguntas configuradas.</div>
            <div style={{ fontSize: 13 }}>El profesor las añadirá pronto.</div>
          </div>
        </div>
      </div>
    );
  }

  const allAnswered = answeredCount === questions.length;

  return (
    <div style={{ ...S.app, display: "flex", flexDirection: "column" }} onMouseDown={() => { if (lockedQuestion) unlockAudio(); }}>
      <SessionHeader exercise={exercise} onBack={onBack} modelId="cuestionario" />
      <div style={{ maxWidth: 980, width: "100%", margin: "0 auto", padding: "16px 16px 24px", flex: 1 }}>

        {modelToggleNode}

        {hasAudio && !audioReady && !audioError && <AudioLoadingOverlay />}
        {audioError && <div style={{ textAlign: "center", color: C.danger, fontSize: 12, marginBottom: 10 }}>{audioError}</div>}

        <SessionHint modelId="cuestionario" />

        <section style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 16, padding: "14px 14px 12px", marginBottom: 12 }}>
          <div style={{ background: C.paper2, borderRadius: 10, overflow: "hidden", border: `1px solid ${C.line}`, marginBottom: 8 }}>
            <WaveformDisplay time={time} timeRef={timeRef} duration={dur} waveformDuration={audioDuration} allIntervals={[]}
              exerciseId={exercise.id} waveformData={waveformData}
              colorByFn={{}} questionRegion={questionRegion}
              onScrubBegin={scrubBegin} onScrubTo={scrubTo} onScrubEnd={scrubEnd} />
          </div>

          {/* Minimapa de preguntas — toca un bloque para saltar a su fragmento */}
          <div style={{ position: "relative", height: 30, marginBottom: 4, background: C.paper2, borderRadius: 6, border: `1px solid ${C.line}`, overflow: "hidden", userSelect: "none" }}>
            {questions.map((q, idx) => {
              const isLock = lockedQuestion?.id === q.id;
              const answered = answers[q.id] !== undefined && answers[q.id] !== "";
              return (
                <div key={q.id}
                  onMouseDown={(e) => e.stopPropagation()} onClick={() => selectQuestion(q)}
                  title={`P${idx + 1}: ${fmt(q.audioStart)} – ${fmt(q.audioEnd)}`}
                  style={{ position: "absolute", top: 3, bottom: 3, left: `${(q.audioStart / dur) * 100}%`, width: `${Math.max(0, (q.audioEnd - q.audioStart) / dur) * 100}%`, background: answered ? C.fnT : C.quiz, opacity: isLock ? 1 : 0.5, borderRadius: 3, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", border: isLock ? `1.5px solid rgba(255,255,255,0.9)` : "none", boxSizing: "border-box", overflow: "hidden" }}>
                  <span style={{ fontSize: 8, color: "#fff", fontWeight: 700, fontFamily: F.sans, pointerEvents: "none" }}>{idx + 1}</span>
                </div>
              );
            })}
            <div style={{ position: "absolute", top: 0, bottom: 0, left: `${(time / dur) * 100}%`, width: 1.5, background: C.ink, opacity: 0.75, pointerEvents: "none" }} />
          </div>

          {lockedQuestion ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center", fontSize: 12, color: C.quiz, margin: "8px 0", flexWrap: "wrap" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, background: `${C.quiz}12`, borderRadius: 999, padding: "4px 12px", fontWeight: 600 }}>
                🔒 Fragmento {fmt(lockedQuestion.audioStart)} – {fmt(lockedQuestion.audioEnd)} · bucle
              </span>
              <button onClick={unlockAudio} className="fa-pressable" style={{ ...S.btn, padding: "4px 12px", fontSize: 11 }}>Liberar</button>
            </div>
          ) : <div style={{ height: 8 }} />}

          <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 12, paddingTop: 10, borderTop: `1px solid ${C.line}` }}>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <CircleButton onClick={() => seekTo(lockedQuestion ? lockedQuestion.audioStart : 0)} title="Volver al inicio">⏮</CircleButton>
            </div>
            <CircleButton onClick={togglePlay} disabled={hasAudio && !audioReady && !audioError}
              primary size={52} title={playing ? "Pausa (Espacio)" : "Reproducir (Espacio)"}>
              {playing ? "❚❚" : "▶"}
            </CircleButton>
            <div style={{ textAlign: "right", fontFamily: F.sans, fontVariantNumeric: "tabular-nums", fontSize: 22, fontWeight: 600, color: C.ink, letterSpacing: -0.5 }}>
              {fmt(time)}<span style={{ color: C.muted, fontWeight: 400 }}>/{fmt(dur)}</span>
            </div>
          </div>
        </section>

        {questions.map((q, idx) => {
          const isExpanded = expandedId === q.id;
          const isLocked   = lockedQuestion?.id === q.id;
          const answered   = answers[q.id] !== undefined && answers[q.id] !== "";
          return (
            <div key={q.id} onMouseDown={(e) => e.stopPropagation()}
              style={{ background: C.paper, border: isLocked ? `1.5px solid ${C.quiz}` : `1px solid ${C.line}`, borderRadius: 12, marginBottom: 8, padding: "14px 16px", transition: "border-color .15s" }}>
              <div style={{ cursor: "pointer" }}
                onClick={() => { if (isExpanded) setExpandedId(null); else selectQuestion(q); }}>
                {/* Fila de metadatos — número + estado + chevron */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 22, height: 22, borderRadius: "50%", background: answered ? C.fnT : `${C.quiz}1A`, color: answered ? C.paper : C.quiz, fontFamily: F.sans, fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                    {answered ? "✓" : idx + 1}
                  </span>
                  <span style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 500, color: C.muted }}>
                    {q.type === "test" ? "Opción múltiple" : "Respuesta abierta"} · {fmt(q.audioStart)}–{fmt(q.audioEnd)}
                  </span>
                  <div style={{ marginLeft: "auto" }}><Chevron open={isExpanded} /></div>
                </div>
                {/* Texto de la pregunta — serif grande */}
                <div style={{ fontFamily: F.serif, fontSize: 20, fontWeight: 600, letterSpacing: "-0.01em", lineHeight: 1.35, color: C.ink }}>{q.text}</div>
              </div>

              <div className={`fa-expand${isExpanded ? " fa-open" : ""}`}>
                <div className="fa-expand-inner">
                  <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${C.line}` }}>
                    {q.type === "test" && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                        {q.options.map((opt) => {
                          const isSel = answers[q.id] === opt.id;
                          return (
                            <button key={opt.id} className="fa-pressable"
                              onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: opt.id }))}
                              style={{ background: isSel ? C.ink : C.bg, color: isSel ? "#fff" : C.ink, border: `1.5px solid ${isSel ? C.ink : C.line}`, borderRadius: 10, padding: "12px 14px", cursor: "pointer", textAlign: "left", fontSize: 13.5, lineHeight: 1.4, display: "flex", alignItems: "center", gap: 12 }}>
                              <span style={{ fontFamily: F.sans, fontWeight: 700, fontSize: 12, color: isSel ? "rgba(255,255,255,0.6)" : C.muted, minWidth: 18, flexShrink: 0 }}>{opt.id}</span>
                              {opt.text}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {q.type === "desarrollo" && (
                      <textarea style={{ ...S.input, minHeight: 96, resize: "vertical", lineHeight: 1.5, fontSize: 14 }}
                        placeholder="Escribe tu respuesta aquí…"
                        value={answers[q.id] || ""}
                        onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                        onClick={(e) => e.stopPropagation()} />
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <StickyActionBar
        info={
          <>
            <span style={{ fontFamily: F.sans, fontSize: 13, fontWeight: 600, color: allAnswered ? C.fnT : C.ink }}>
              {answeredCount} / {questions.length} {allAnswered ? "· completo" : "respondidas"}
            </span>
            <div style={{ height: 4, background: C.line, borderRadius: 2, overflow: "hidden", marginTop: 3, maxWidth: 160 }}>
              <div style={{ height: "100%", width: `${questions.length ? (answeredCount / questions.length) * 100 : 0}%`, background: allAnswered ? C.fnT : C.quiz, borderRadius: 2, transition: "width .3s" }} />
            </div>
          </>
        }>
        <BarSubmitButton onClick={handleSubmit} accent={C.quiz}>Entregar</BarSubmitButton>
      </StickyActionBar>
    </div>
  );
}

// ═══ 11. DASHBOARD DEL PROFESOR ═════════════════════════════════════════════

// ── Pestaña: Ejercicios ────────────────────────────────────────────────────
function TeacherExerciseRow({ ex, onSelect, onDelete, onToggleVisibility, composerName }) {
  const [open, setOpen] = useState(false);
  const meta    = modelMeta(ex);
  const exModels= modelsOf(ex);
  const isQuiz  = modelOf(ex) === "cuestionario";
  const isSchema= modelOf(ex) === "esquema";
  const exQs    = questionsOf(ex);
  const allBtns = categoriesOf(ex).flatMap((c) => c.buttons || []);
  const { recorded, total } = (isQuiz || isSchema) ? { recorded: 0, total: 0 } : answerStats(ex);
  const keyReady = isQuiz ? exQs.length > 0 : isSchema ? true : (recorded === total && total > 0);
  const isHidden = !!ex.hidden;

  return (
    <div style={{ display: "flex", flex: 1, minWidth: 0, background: C.paper, border: `1px solid ${C.line}`, borderRadius: 8, overflow: "hidden", opacity: isHidden ? 0.55 : 1, transition: "opacity .2s" }}>
      {exModels.length > 1 ? (
        <div style={{ width: 5, flexShrink: 0, display: "flex", flexDirection: "column" }}>
          <div style={{ flex: 1, background: MODEL_META[exModels[0]]?.color || meta.color }} />
          <div style={{ flex: 1, background: MODEL_META[exModels[1]]?.color || meta.color }} />
        </div>
      ) : (
        <div style={{ width: 5, flexShrink: 0, background: meta.color }} />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div onClick={() => setOpen((o) => !o)}
          style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", cursor: "pointer", userSelect: "none" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: F.sans, fontSize: 15, fontWeight: 500, color: isHidden ? C.muted : C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ex.title}</div>
            {composerName && (
              <div style={{ fontSize: 11, color: C.fnS, fontWeight: 500, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{composerName}</div>
            )}
          </div>
          {isHidden && <span style={{ fontSize: 10, color: C.muted, fontFamily: FONT_SANS, fontWeight: 600, letterSpacing: "0.08em", flexShrink: 0 }}>OCULTO</span>}
          <Chevron open={open} />
          <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <EyeButton visible={!isHidden} onClick={() => onToggleVisibility(ex)} />
            <EditIconButton onClick={() => onSelect(ex.id)} title={`Editar "${ex.title}"`} />
          </div>
        </div>
        <div className={`fa-expand${open ? " fa-open" : ""}`}>
          <div className="fa-expand-inner">
            <div style={{ borderTop: `1px solid ${C.line}`, padding: "10px 14px 12px", display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: "12px 24px", background: C.bg }}>
              <MetaItem label="Tipo"><span style={{ width: 7, height: 7, borderRadius: "50%", background: meta.color }} />{meta.label}</MetaItem>
              <MetaItem label="Duración">{fmt(ex.duration)}</MetaItem>
              {isQuiz ? <MetaItem label="Preguntas">{exQs.length || "—"}</MetaItem>
                : allBtns.length > 0 && <MetaItem label="Categorías"><CategoryDots buttons={allBtns} /></MetaItem>}
              <MetaItem label="Clave de corrección">
                <StatusCircle done={keyReady} size={13} />
                <span style={{ color: keyReady ? C.ink : C.muted }}>{keyReady ? "Configurada" : "Pendiente"}</span>
              </MetaItem>
              <MetaItem label="Visible para alumnos">
                <span style={{ color: isHidden ? C.danger : C.fnT }}>{isHidden ? "No" : "Sí"}</span>
              </MetaItem>
              <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
                <DeleteIconButton onClick={() => onDelete(ex)} title={`Eliminar "${ex.title}"`} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ExercisesTab({ exercises, audioLibrary = [], onNew, onSelect, onToggleVisibility, askConfirm, onDelete }) {
  const [filterModel,     setFilterModel]     = useState("all");
  const [filterComposers, setFilterComposers] = useState([]);
  const [filterTags,      setFilterTags]      = useState([]);

  // Derivar compositores y etiquetas únicas de la biblioteca de audios
  const allComposers = useMemo(() => audioComposers(audioLibrary), [audioLibrary]);
  const allTags      = useMemo(() => audioTags(audioLibrary),      [audioLibrary]);
  // Mapa rápido URL → audio
  const audioByUrl = useMemo(() => {
    const m = {};
    audioLibrary.forEach((a) => { if (a.url) m[a.url] = a; });
    return m;
  }, [audioLibrary]);

  const filtered = useMemo(() => {
    return exercises.filter((ex) => {
      if (filterModel !== "all" && !modelsOf(ex).includes(filterModel)) return false;
      if (filterComposers.length > 0 || filterTags.length > 0) {
        const audio = ex.audioUrl ? audioByUrl[ex.audioUrl] : null;
        if (filterComposers.length > 0 && (!audio || !filterComposers.includes(audio.composer))) return false;
        if (filterTags.length > 0) {
          const audioTags = audio?.tags || [];
          if (!filterTags.every((t) => audioTags.includes(t))) return false;
        }
      }
      return true;
    })
    // Los ejercicios ocultos se muestran siempre por debajo de los visibles
    // (orden estable: conservan su orden relativo dentro de cada grupo).
    .sort((a, b) => (a.hidden ? 1 : 0) - (b.hidden ? 1 : 0));
  }, [exercises, filterModel, filterComposers, filterTags, audioByUrl]);

  // La barra de filtros se muestra siempre que haya ejercicios.
  const showFilterBar = exercises.length > 0;

  return (
    <>
      <div style={{ marginBottom: 14 }}>
        <CtaButton onClick={onNew}>+ Nuevo ejercicio</CtaButton>
      </div>
      {showFilterBar && (
        <TeacherFilterBar
          filterModel={filterModel}       setFilterModel={setFilterModel}
          allComposers={allComposers}     filterComposers={filterComposers} setFilterComposers={setFilterComposers}
          allTags={allTags}               filterTags={filterTags}           setFilterTags={setFilterTags}
        />
      )}
      {exercises.length === 0
        ? <p style={{ color: C.muted, fontFamily: F.sans, textAlign: "center", padding: "3rem 1rem" }}>Aún no hay ejercicios.</p>
        : filtered.length === 0
          ? <p style={{ color: C.muted, fontFamily: F.sans, textAlign: "center", padding: "2rem 1rem" }}>
              Ningún ejercicio coincide con los filtros.{" "}
              <button onClick={() => { setFilterModel("all"); setFilterComposers([]); setFilterTags([]); }}
                style={{ background: "none", border: "none", color: C.fnS, cursor: "pointer", fontSize: 13, textDecoration: "underline", padding: 0 }}>
                Limpiar filtros
              </button>
            </p>
          : <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {filtered.map((ex) => (
                <TeacherExerciseRow key={ex.id} ex={ex} onSelect={onSelect}
                  composerName={ex.audioUrl ? (audioByUrl[ex.audioUrl]?.composer || null) : null}
                  onToggleVisibility={onToggleVisibility}
                  onDelete={(e) => askConfirm(`¿Eliminar "${e.title}"?`, () => onDelete(e.id))} />
              ))}
            </div>}
    </>
  );
}

// ── Pestaña: Cursos ────────────────────────────────────────────────────────
// ═══ Vista de Cursos — rediseño en dos páginas ══════════════════════════════
// Lista (rejilla de tarjetas) → detalle (unidades en vertical + ejercicios de
// la unidad seleccionada), con desplegable para cambiar de curso sin salir.
// En móvil se convierte en un flujo de 3 niveles (Cursos → Unidades → Ejercicios).
// Un único componente `CoursesPages` sirve a profesor y alumno (prop `role`):
//   · profesor → edición completa, progreso = "claves listas".
//   · alumno   → sin edición, progreso = ejercicios completados.

// — Helpers de forma/progreso, conscientes del rol —
function courseUnitList(course, units, role) {
  const ordered = (course?.unitIds || []).map((id) => units.find((u) => u.id === id)).filter(Boolean);
  return role === "student" ? ordered.filter((u) => !u.hidden) : ordered;
}
function unitExList(unit, exercises, role) {
  const ordered = (unit?.exerciseIds || []).map((id) => exercises.find((e) => e.id === id)).filter(Boolean);
  return role === "student" ? ordered.filter((e) => !e.hidden) : ordered;
}
// ¿La clave del ejercicio está lista? (misma lógica que el acordeón anterior)
function exKeyReady(ex) {
  const isQuiz = modelOf(ex) === "cuestionario";
  const exQs   = questionsOf(ex);
  const { recorded, total } = isQuiz ? { recorded: 0, total: 0 } : answerStats(ex);
  return isQuiz ? exQs.length > 0 : (recorded === total && total > 0);
}
// Progreso de una unidad → { num, total }. Profesor: claves listas. Alumno: hechos.
function unitProgress(unit, exercises, role, results) {
  const exs = unitExList(unit, exercises, role);
  const num = role === "student"
    ? exs.filter((e) => results?.[e.id] != null).length
    : exs.filter(exKeyReady).length;
  return { num, total: exs.length };
}
// Progreso agregado de un curso → { num, total, units }.
function courseProgress(course, units, exercises, role, results) {
  const cu = courseUnitList(course, units, role);
  let num = 0, total = 0;
  cu.forEach((u) => { const s = unitProgress(u, exercises, role, results); num += s.num; total += s.total; });
  return { num, total, units: cu.length };
}

// — Iconos de línea (mismo lenguaje gráfico que la app) —
function ArrowRightIcon({ size = 14, color = "currentColor" }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block", flexShrink: 0 }}><path d="M3 8h9M8.5 4l4 4-4 4" /></svg>;
}
function ChevronLeftIcon({ size = 14, color = "currentColor" }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block", flexShrink: 0 }}><path d="M10 3L5 8l5 5" /></svg>;
}
function ChevronRightIcon({ size = 15, color = C.chevron }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block", flexShrink: 0 }}><path d="M6 3l5 5-5 5" /></svg>;
}

// — Insignia de visibilidad del curso (solo profesor) —
function CourseVisBadge({ course, groups = [] }) {
  const vis = course.visibility || "teacher";
  if (vis === "public") return <span style={{ ...S.badge, background: "rgba(63,155,91,0.12)", color: C.fnT, fontSize: 10 }}>Público</span>;
  if (vis === "group") {
    const g = groups.find((x) => x.id === course.visibilityGroupId);
    return <span style={{ ...S.badge, background: "rgba(47,111,184,0.10)", color: C.quiz, fontSize: 10 }}>{g ? g.name : "Grupo"}</span>;
  }
  return <span style={{ ...S.badge, background: C.line, color: C.muted, fontSize: 10 }}>Mis alumnos</span>;
}

// — Botón "añadir" de borde punteado, ancho completo —
function DashedAddButton({ children, onClick }) {
  return (
    <button onClick={onClick} style={{ width: "100%", boxSizing: "border-box", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, background: "transparent", border: `1.5px dashed ${C.rail}`, color: "#555", borderRadius: 10, padding: "12px", fontFamily: F.sans, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>{children}</button>
  );
}

// — Barra de progreso fina (curso / unidad) —
function CourseProgressBar({ num, total, width = 120, accent = C.ink }) {
  const pct  = total ? (num / total) * 100 : 0;
  const done = total > 0 && num === total;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <span style={{ width, height: 6, borderRadius: 3, background: C.line, overflow: "hidden", display: "inline-block" }}>
        <span style={{ display: "block", width: `${pct}%`, height: "100%", background: done ? C.fnT : accent, borderRadius: 3, transition: "width .3s" }} />
      </span>
      <span style={{ fontFamily: F.sans, fontSize: 11.5, fontWeight: 600, color: C.muted, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{num}/{total}</span>
    </span>
  );
}

// ── Página 1 · Tarjeta de curso (rejilla) ────────────────────────────────────
function CourseCard({ course, units, exercises, role, results, groups, onOpen }) {
  const [hover, setHover] = useState(false);
  const cs   = courseProgress(course, units, exercises, role, results);
  const pct  = cs.total ? (cs.num / cs.total) * 100 : 0;
  const done = cs.total > 0 && cs.num === cs.total;
  return (
    <button onClick={onOpen} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ font: "inherit", textAlign: "left", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 14, background: C.paper, border: `1px solid ${C.line}`, borderRadius: 14, padding: "20px 20px 18px", cursor: "pointer", boxShadow: hover ? "0 10px 30px rgba(0,0,0,0.08)" : "none", transform: hover ? "translateY(-2px)" : "none", transition: "box-shadow .18s, transform .18s" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <h3 style={{ fontFamily: F.serif, fontSize: 24, fontWeight: 600, color: C.ink, margin: "0 0 6px", lineHeight: 1.08, letterSpacing: "-0.01em", wordBreak: "break-word" }}>{course.name}</h3>
          {role === "teacher"
            ? <CourseVisBadge course={course} groups={groups} />
            : (course.description ? <span style={{ fontFamily: F.sans, fontSize: 12.5, color: "#888" }}>{course.description}</span> : null)}
        </div>
        <span style={{ display: "flex", alignItems: "center", gap: 5, color: hover ? C.ink : C.muted, fontFamily: F.sans, fontSize: 12.5, fontWeight: 600, flexShrink: 0, transition: "color .15s" }}>Abrir <ArrowRightIcon color={hover ? C.ink : C.muted} /></span>
      </div>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
          <span style={{ flex: 1, height: 5, borderRadius: 3, background: C.line, overflow: "hidden" }}><span style={{ display: "block", width: `${pct}%`, height: "100%", background: done ? C.fnT : C.ink }} /></span>
          <span style={{ fontFamily: F.sans, fontSize: 11.5, fontWeight: 600, color: C.muted, fontVariantNumeric: "tabular-nums" }}>{cs.num}/{cs.total}</span>
        </div>
        <div style={{ fontFamily: F.sans, fontSize: 12.5, color: C.muted }}>
          {cs.units} {cs.units === 1 ? "unidad" : "unidades"} · {cs.total} {cs.total === 1 ? "ejercicio" : "ejercicios"}{role === "student" ? ` · ${cs.num} completados` : ` · ${cs.num} con clave`}
        </div>
      </div>
    </button>
  );
}

function CoursesLanding({ role, courses, units, exercises, results, groups, onOpen, onCreateCourse }) {
  return (
    <div style={{ fontFamily: F.sans }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, paddingBottom: 16, marginBottom: 20, borderBottom: `2px solid ${C.ink}` }}>
        <div>
          <Overline>{role === "student" ? "Mis cursos" : "Gestión"}</Overline>
          <h2 style={{ fontFamily: F.serif, fontSize: 34, fontWeight: 600, color: C.ink, margin: 0, lineHeight: 1, letterSpacing: "-0.01em" }}>Cursos</h2>
        </div>
        {role === "teacher" && <CtaButton onClick={onCreateCourse}>+ Nuevo curso</CtaButton>}
      </div>
      {courses.length === 0
        ? <p style={{ color: C.muted, fontFamily: F.sans, textAlign: "center", padding: "3rem 1rem" }}>{role === "student" ? "El profesor aún no ha creado ningún curso." : "Aún no hay cursos. Crea el primero para organizar tus ejercicios."}</p>
        : <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
            {courses.map((c) => <CourseCard key={c.id} course={c} units={units} exercises={exercises} role={role} results={results} groups={groups} onOpen={() => onOpen(c.id)} />)}
          </div>}
    </div>
  );
}

// — Desplegable para cambiar de curso sin salir del detalle —
function CourseDropdown({ courses, currentId, role, units, exercises, results, onSwitch }) {
  const [open, setOpen] = useState(false);
  const course = courses.find((c) => c.id === currentId);
  if (!course) return null;
  return (
    <div style={{ position: "relative", minWidth: 0 }}>
      <button onClick={() => setOpen((o) => !o)}
        style={{ font: "inherit", display: "flex", alignItems: "center", gap: 10, maxWidth: "100%", background: open ? C.field : "transparent", border: `1px solid ${open ? C.rail : "transparent"}`, borderRadius: 10, padding: "6px 12px 6px 10px", cursor: "pointer" }}>
        <h3 style={{ fontFamily: F.serif, fontSize: 30, fontWeight: 600, color: C.ink, margin: 0, lineHeight: 1.05, letterSpacing: "-0.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{course.name}</h3>
        <span style={{ marginTop: 4, flexShrink: 0 }}><Chevron open={open} size={16} /></span>
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 30 }} />
          <div style={{ position: "absolute", top: "100%", left: 0, marginTop: 6, zIndex: 31, background: C.paper, border: `1px solid ${C.line}`, borderRadius: 12, boxShadow: "0 14px 40px rgba(0,0,0,0.16)", padding: 6, minWidth: 300, maxWidth: 380, maxHeight: 420, overflowY: "auto", boxSizing: "border-box" }}>
            <div style={{ fontFamily: F.sans, fontSize: 10, fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase", color: C.muted, padding: "6px 10px 7px" }}>Cambiar de curso</div>
            {courses.map((c) => {
              const cs  = courseProgress(c, units, exercises, role, results);
              const cur = c.id === currentId;
              return (
                <button key={c.id} onClick={() => { onSwitch(c.id); setOpen(false); }}
                  style={{ font: "inherit", width: "100%", boxSizing: "border-box", textAlign: "left", display: "flex", alignItems: "center", gap: 11, padding: "9px 10px", borderRadius: 9, border: "none", cursor: "pointer", background: cur ? C.field : "transparent" }}>
                  <ProgressRing ready={cs.num} total={cs.total} size={32} stroke={3} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontFamily: F.serif, fontSize: 16.5, fontWeight: 600, color: C.ink, lineHeight: 1.1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
                    <span style={{ display: "block", fontFamily: F.sans, fontSize: 11, color: C.muted, marginTop: 1 }}>{cs.units} {cs.units === 1 ? "unidad" : "unidades"} · {cs.num}/{cs.total} {role === "student" ? "hechos" : "listas"}</span>
                  </span>
                  {cur && <svg width="14" height="12" viewBox="0 0 7 6" fill="none" style={{ flexShrink: 0 }}><path d="M1 2.8L3 4.8L6 1" stroke={C.fnT} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// — Tarjeta de ejercicio (profesor, "versión B") —
function TeacherExCard({ ex, isMobile, unitId, onSelectExercise, onRemoveExFromUnit, askConfirm }) {
  const [hover, setHover] = useState(false);
  const meta     = modelMeta(ex);
  const keyReady = exKeyReady(ex);
  const show     = hover || isMobile;
  return (
    <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ position: "relative", boxSizing: "border-box", background: C.paper, border: `1px solid ${C.line}`, borderTop: `3px solid ${meta.color}`, borderRadius: 10, padding: "13px 13px 12px", boxShadow: hover ? "0 6px 18px rgba(0,0,0,0.07)" : "none", transition: "box-shadow .15s" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 9 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, background: `${meta.color}14`, color: meta.color, borderRadius: 999, padding: "3px 9px", fontFamily: F.sans, fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: meta.color }} />{meta.label}
        </span>
        <StatusCircle done={keyReady} size={16} />
      </div>
      <div onClick={() => onSelectExercise(ex.id)} style={{ fontFamily: F.sans, fontSize: 14, fontWeight: 600, color: C.ink, lineHeight: 1.25, minHeight: 36, cursor: "pointer" }}>{ex.title}</div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 11 }}>
        <span style={{ fontFamily: F.sans, fontSize: 11.5, fontWeight: 600, color: keyReady ? C.fnT : C.muted }}>{keyReady ? "Clave lista" : "Sin clave"}</span>
        <div style={{ display: "flex", gap: 6, opacity: show ? 1 : 0, pointerEvents: show ? "auto" : "none", transition: "opacity .12s" }}>
          <EditIconButton onClick={() => onSelectExercise(ex.id)} title={`Editar "${ex.title}"`} />
          <RemoveIconButton onClick={() => askConfirm(`¿Quitar "${ex.title}" de esta unidad?\n\nEl ejercicio permanecerá en el banco global.`, () => onRemoveExFromUnit(unitId, ex.id))} title={`Quitar "${ex.title}" de la unidad`} />
        </div>
      </div>
    </div>
  );
}

function EmptyExercises({ role }) {
  return (
    <div style={{ padding: "44px 20px", textAlign: "center", border: `1px dashed ${C.rail}`, borderRadius: 12 }}>
      <div style={{ fontFamily: F.serif, fontSize: 18, color: C.ink2 }}>{role === "student" ? "Aún no hay ejercicios" : "Unidad sin ejercicios"}</div>
      <div style={{ fontFamily: F.sans, fontSize: 12.5, color: C.muted, marginTop: 3 }}>{role === "student" ? "Tu profesor los publicará pronto." : "Añade uno desde el banco o crea uno nuevo."}</div>
    </div>
  );
}

// — Panel de ejercicios de la unidad seleccionada (profesor: tarjetas; alumno: filas) —
function CourseExercisesPanel({
  unit, course, exercises, role, results, isMobile,
  onExercise, onViewCorrection,
  onPickFromBank, onCreateNewExInUnit, onRemoveExFromUnit, onSelectExercise,
  onEditUnit, onUpdateUnit, onDeleteUnit, onAfterDeleteUnit, askConfirm,
}) {
  if (!unit) {
    return <div style={{ padding: "56px 20px", textAlign: "center", fontFamily: F.serif, fontSize: 19, color: C.ink2 }}>Selecciona una unidad</div>;
  }
  const exs = unitExList(unit, exercises, role);

  if (role === "teacher") {
    return (
      <>
        <div style={{ padding: "16px 18px 14px", borderBottom: `1px solid ${C.line}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ minWidth: 0, flex: "1 1 180px" }}>
            <h4 style={{ fontFamily: F.serif, fontSize: 23, fontWeight: 600, color: C.ink, margin: "0 0 3px", letterSpacing: "-0.01em", display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{unit.name}</span>
              {unit.hidden && <span style={{ ...S.badge, background: C.line, color: C.muted, fontSize: 10 }}>Oculta</span>}
            </h4>
            <span style={{ fontFamily: F.sans, fontSize: 12.5, color: C.muted }}>{exs.length} {exs.length === 1 ? "ejercicio" : "ejercicios"}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, flexWrap: "wrap" }}>
            <EyeButton visible={!unit.hidden} onClick={() => onUpdateUnit({ ...unit, hidden: !unit.hidden })} />
            <EditIconButton onClick={() => onEditUnit(unit)} title={`Editar unidad "${unit.name}"`} />
            <DeleteIconButton onClick={() => askConfirm(`¿Eliminar la unidad "${unit.name}"?\n\nLos ejercicios no se eliminarán del banco global.`, () => { onDeleteUnit(unit.id, course.id); onAfterDeleteUnit && onAfterDeleteUnit(); })} title={`Eliminar unidad "${unit.name}"`} />
            <span style={{ width: 1, height: 22, background: C.line, margin: "0 2px" }} />
            <GhostButton onClick={() => onPickFromBank(unit.id)}>+ Del banco</GhostButton>
            <CtaButton onClick={() => onCreateNewExInUnit(unit.id)}>+ Nuevo</CtaButton>
          </div>
        </div>
        <div style={{ padding: 16 }}>
          {exs.length
            ? <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 12 }}>
                {exs.map((ex) => <TeacherExCard key={ex.id} ex={ex} isMobile={isMobile} unitId={unit.id} onSelectExercise={onSelectExercise} onRemoveExFromUnit={onRemoveExFromUnit} askConfirm={askConfirm} />)}
              </div>
            : <EmptyExercises role={role} />}
        </div>
      </>
    );
  }

  // alumno
  const s = unitProgress(unit, exercises, role, results);
  return (
    <>
      <div style={{ padding: "18px 22px 14px", borderBottom: `1px solid ${C.line}`, display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 14 }}>
        <h4 style={{ fontFamily: F.serif, fontSize: 23, fontWeight: 600, color: C.ink, margin: 0, letterSpacing: "-0.01em", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{unit.name}</h4>
        <span style={{ fontFamily: F.sans, fontSize: 12.5, color: C.muted, whiteSpace: "nowrap", flexShrink: 0 }}>{s.num}/{s.total} completados</span>
      </div>
      <div style={{ padding: "14px 18px" }}>
        {exs.length
          ? <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>{exs.map((ex) => <ExerciseRow key={ex.id} ex={ex} result={results[ex.id]} onOpen={onExercise} onViewCorrection={onViewCorrection} />)}</div>
          : <EmptyExercises role={role} />}
      </div>
    </>
  );
}

// — Panel izquierdo: lista vertical de unidades con anillo de progreso —
function UnitsList({ course, units, exercises, role, results, selUnitId, onSelectUnit, onCreateUnit }) {
  const cu = courseUnitList(course, units, role);
  return (
    <div>
      <div style={{ fontFamily: F.sans, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase", color: C.muted, padding: "2px 4px 10px" }}>Unidades didácticas</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {cu.length === 0
          ? <p style={{ fontFamily: F.sans, fontSize: 13, color: C.muted, margin: "2px 4px 8px" }}>Este curso no tiene unidades todavía.</p>
          : cu.map((u, i) => {
              const s  = unitProgress(u, exercises, role, results);
              const on = u.id === selUnitId;
              return (
                <button key={u.id} onClick={() => onSelectUnit(u.id)}
                  style={{ font: "inherit", boxSizing: "border-box", width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 11, border: `1px solid ${on ? C.rail : "transparent"}`, cursor: "pointer", background: on ? C.paper : "transparent", boxShadow: on ? "0 2px 10px rgba(0,0,0,0.05)" : "none" }}>
                  <ProgressRing ready={s.num} total={s.total} size={40} stroke={4} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontFamily: F.serif, fontSize: 10.5, fontWeight: 700, color: C.muted, letterSpacing: "0.04em" }}>UNIDAD {i + 1}{u.hidden ? " · oculta" : ""}</span>
                    <span style={{ display: "block", fontFamily: F.serif, fontSize: 17, fontWeight: 600, color: on ? C.ink : C.ink2, lineHeight: 1.12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.name}</span>
                  </span>
                  {on && <ArrowRightIcon size={13} color={C.muted} />}
                </button>
              );
            })}
        {role === "teacher" && <div style={{ marginTop: 4 }}><DashedAddButton onClick={() => onCreateUnit(course.id)}>+ Nueva unidad</DashedAddButton></div>}
      </div>
    </div>
  );
}

// ── Página 2 · Detalle del curso (escritorio): barra + dos paneles ───────────
function CourseDetail({
  role, courses, courseId, units, exercises, results, groups,
  selUnitId, setSelUnitId, onBack, onSwitch,
  onUpdateCourse, onEditCourse, onDeleteCourse,
  onCreateUnit, onEditUnit, onDeleteUnit, onUpdateUnit,
  onPickFromBank, onCreateNewExInUnit, onRemoveExFromUnit, onSelectExercise,
  onExercise, onViewCorrection, askConfirm,
}) {
  const course = courses.find((c) => c.id === courseId);
  if (!course) return null;
  const cu   = courseUnitList(course, units, role);
  const unit = cu.find((u) => u.id === selUnitId) || cu[0] || null;
  const cs   = courseProgress(course, units, exercises, role, results);

  return (
    <div style={{ fontFamily: F.sans }}>
      {/* Barra superior: volver + desplegable + acciones */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, paddingBottom: 14, marginBottom: course.description ? 12 : 18, borderBottom: `2px solid ${C.ink}` }}>
        <button onClick={onBack} style={{ font: "inherit", display: "inline-flex", alignItems: "center", gap: 6, background: "transparent", border: `1px solid ${C.line}`, color: "#555", borderRadius: 8, padding: "8px 13px", fontFamily: F.sans, fontSize: 12.5, fontWeight: 600, cursor: "pointer", flexShrink: 0 }}>
          <ChevronLeftIcon /> Cursos
        </button>
        <CourseDropdown courses={courses} currentId={courseId} role={role} units={units} exercises={exercises} results={results} onSwitch={onSwitch} />
        {role === "teacher" && <CourseVisBadge course={course} groups={groups} />}
        <span style={{ flex: 1 }} />
        {role === "teacher"
          ? <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
              <EyeButton visible={!course.hidden} onClick={() => onUpdateCourse({ ...course, hidden: !course.hidden })} />
              <EditIconButton onClick={() => onEditCourse(course)} title={`Editar curso "${course.name}"`} />
              <DeleteIconButton onClick={() => askConfirm(`¿Eliminar el curso "${course.name}"?\n\nLas unidades y ejercicios no se eliminarán.`, () => { onDeleteCourse(course.id); onBack(); })} title={`Eliminar curso "${course.name}"`} />
            </div>
          : <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
              <CourseProgressBar num={cs.num} total={cs.total} width={110} accent={C.fnT} />
              <span style={{ fontFamily: F.sans, fontSize: 12.5, color: C.muted, whiteSpace: "nowrap" }}>completados</span>
            </div>}
      </div>
      {course.description && <div style={{ fontFamily: F.sans, fontSize: 13, color: "#888", margin: "-4px 0 18px" }}>{course.description}</div>}

      {/* Dos paneles: unidades (vertical) + ejercicios */}
      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 22, alignItems: "start" }}>
        <UnitsList course={course} units={units} exercises={exercises} role={role} results={results} selUnitId={unit?.id ?? null} onSelectUnit={setSelUnitId} onCreateUnit={onCreateUnit} />
        <div style={{ minWidth: 0, border: `1px solid ${C.line}`, borderRadius: 14, background: C.paper, overflow: "hidden" }}>
          <CourseExercisesPanel
            unit={unit} course={course} exercises={exercises} role={role} results={results} isMobile={false}
            onExercise={onExercise} onViewCorrection={onViewCorrection}
            onPickFromBank={onPickFromBank} onCreateNewExInUnit={onCreateNewExInUnit} onRemoveExFromUnit={onRemoveExFromUnit} onSelectExercise={onSelectExercise}
            onEditUnit={onEditUnit} onUpdateUnit={onUpdateUnit} onDeleteUnit={onDeleteUnit} onAfterDeleteUnit={() => setSelUnitId(null)} askConfirm={askConfirm} />
        </div>
      </div>
    </div>
  );
}

// ── Móvil: flujo de 3 niveles (push) ─────────────────────────────────────────
function MobileTopBar({ title, onBack }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, paddingBottom: 12, marginBottom: 14, borderBottom: `1px solid ${C.line}` }}>
      {onBack && <button onClick={onBack} style={{ width: 34, height: 34, borderRadius: 8, border: `1px solid ${C.line}`, background: C.paper, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, color: C.ink }}><ChevronLeftIcon /></button>}
      <span style={{ flex: 1, minWidth: 0, fontFamily: F.sans, fontSize: 13, fontWeight: 600, color: "#555", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</span>
    </div>
  );
}

function MobileCoursesScreen({ role, courses, units, exercises, results, groups, onOpenCourse, onCreateCourse }) {
  return (
    <div style={{ fontFamily: F.sans }}>
      <div style={{ paddingBottom: 14, marginBottom: 14, borderBottom: `2px solid ${C.ink}` }}>
        <Overline>{role === "student" ? "Mis cursos" : "Gestión"}</Overline>
        <h2 style={{ fontFamily: F.serif, fontSize: 26, fontWeight: 600, color: C.ink, margin: 0, lineHeight: 1.02, letterSpacing: "-0.01em" }}>Cursos</h2>
      </div>
      {courses.length === 0
        ? <p style={{ color: C.muted, fontFamily: F.sans, textAlign: "center", padding: "2.5rem 1rem" }}>{role === "student" ? "El profesor aún no ha creado ningún curso." : "Aún no hay cursos. Crea el primero."}</p>
        : <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            {courses.map((c) => {
              const cs = courseProgress(c, units, exercises, role, results);
              return (
                <button key={c.id} onClick={() => onOpenCourse(c.id)}
                  style={{ font: "inherit", boxSizing: "border-box", width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 13, padding: "14px 14px", borderRadius: 13, border: `1px solid ${C.line}`, background: C.paper, cursor: "pointer" }}>
                  <ProgressRing ready={cs.num} total={cs.total} size={44} stroke={4} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontFamily: F.serif, fontSize: 19, fontWeight: 600, color: C.ink, lineHeight: 1.08, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
                    <span style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 5, flexWrap: "wrap" }}>
                      {role === "teacher" && <CourseVisBadge course={c} groups={groups} />}
                      <span style={{ fontFamily: F.sans, fontSize: 11.5, color: C.muted }}>{cs.units} ud · {cs.num}/{cs.total} {role === "student" ? "hechos" : "listas"}</span>
                    </span>
                  </span>
                  <ChevronRightIcon />
                </button>
              );
            })}
            {role === "teacher" && <DashedAddButton onClick={onCreateCourse}>+ Nuevo curso</DashedAddButton>}
          </div>}
    </div>
  );
}

function MobileUnitsScreen({
  role, course, units, exercises, results, groups,
  onBack, onOpenUnit, onCreateUnit,
  onUpdateCourse, onEditCourse, onDeleteCourse, onAfterDeleteCourse, askConfirm,
}) {
  const cu = courseUnitList(course, units, role);
  const cs = courseProgress(course, units, exercises, role, results);
  return (
    <div style={{ fontFamily: F.sans }}>
      <MobileTopBar title="Cursos" onBack={onBack} />
      <div style={{ paddingBottom: 14, marginBottom: 14, borderBottom: `1px solid ${C.line}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
          <h3 style={{ fontFamily: F.serif, fontSize: 24, fontWeight: 600, color: C.ink, margin: 0, lineHeight: 1.06, letterSpacing: "-0.01em" }}>{course.name}</h3>
          {role === "teacher" && <CourseVisBadge course={course} groups={groups} />}
        </div>
        <CourseProgressBar num={cs.num} total={cs.total} width={150} accent={role === "student" ? C.fnT : C.ink} />
        {role === "teacher" && (
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <EyeButton visible={!course.hidden} onClick={() => onUpdateCourse({ ...course, hidden: !course.hidden })} />
            <EditIconButton onClick={() => onEditCourse(course)} title={`Editar curso "${course.name}"`} />
            <DeleteIconButton onClick={() => askConfirm(`¿Eliminar el curso "${course.name}"?\n\nLas unidades y ejercicios no se eliminarán.`, () => { onDeleteCourse(course.id); onAfterDeleteCourse && onAfterDeleteCourse(); })} title={`Eliminar curso "${course.name}"`} />
          </div>
        )}
      </div>
      <div style={{ fontFamily: F.sans, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase", color: C.muted, padding: "2px 2px 10px" }}>Unidades didácticas</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
        {cu.length === 0
          ? <p style={{ fontFamily: F.sans, fontSize: 13, color: C.muted, margin: "2px 2px 8px" }}>Este curso no tiene unidades todavía.</p>
          : cu.map((u, i) => {
              const s = unitProgress(u, exercises, role, results);
              return (
                <button key={u.id} onClick={() => onOpenUnit(u.id)}
                  style={{ font: "inherit", boxSizing: "border-box", width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 12, padding: "13px 14px", borderRadius: 12, border: `1px solid ${C.line}`, background: C.paper, cursor: "pointer" }}>
                  <ProgressRing ready={s.num} total={s.total} size={40} stroke={4} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontFamily: F.serif, fontSize: 11, fontWeight: 700, color: C.muted }}>UNIDAD {i + 1}{u.hidden ? " · oculta" : ""}</span>
                    <span style={{ display: "block", fontFamily: F.serif, fontSize: 18, fontWeight: 600, color: C.ink, lineHeight: 1.1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.name}</span>
                    <span style={{ display: "block", fontFamily: F.sans, fontSize: 11.5, color: C.muted, marginTop: 2 }}>{s.total} {s.total === 1 ? "ejercicio" : "ejercicios"}</span>
                  </span>
                  <ChevronRightIcon />
                </button>
              );
            })}
        {role === "teacher" && <DashedAddButton onClick={() => onCreateUnit(course.id)}>+ Nueva unidad</DashedAddButton>}
      </div>
    </div>
  );
}

function MobileExercisesScreen({ role, course, unit, exercises, results, onBack, panelProps }) {
  return (
    <div style={{ fontFamily: F.sans }}>
      <MobileTopBar title={course.name} onBack={onBack} />
      <div style={{ border: `1px solid ${C.line}`, borderRadius: 14, background: C.paper, overflow: "hidden" }}>
        <CourseExercisesPanel unit={unit} course={course} exercises={exercises} role={role} results={results} isMobile {...panelProps} />
      </div>
    </div>
  );
}

function MobileCoursesFlow(props) {
  const { role, courses, units, exercises, results, groups } = props;
  const [nav, setNav] = useState({ level: "courses", courseId: null, unitId: null });
  const course = nav.courseId ? courses.find((c) => c.id === nav.courseId) : null;
  const goCourses = () => setNav({ level: "courses", courseId: null, unitId: null });

  if (nav.level === "courses" || !course) {
    return <MobileCoursesScreen role={role} courses={courses} units={units} exercises={exercises} results={results} groups={groups}
      onOpenCourse={(courseId) => setNav({ level: "units", courseId, unitId: null })} onCreateCourse={props.onCreateCourse} />;
  }
  if (nav.level === "units") {
    return <MobileUnitsScreen role={role} course={course} units={units} exercises={exercises} results={results} groups={groups}
      onBack={goCourses} onOpenUnit={(unitId) => setNav({ ...nav, level: "exercises", unitId })} onCreateUnit={props.onCreateUnit}
      onUpdateCourse={props.onUpdateCourse} onEditCourse={props.onEditCourse} onDeleteCourse={props.onDeleteCourse} onAfterDeleteCourse={goCourses} askConfirm={props.askConfirm} />;
  }
  const cu   = courseUnitList(course, units, role);
  const unit = cu.find((u) => u.id === nav.unitId) || cu[0] || null;
  return <MobileExercisesScreen role={role} course={course} unit={unit} exercises={exercises} results={results}
    onBack={() => setNav({ ...nav, level: "units", unitId: null })}
    panelProps={{
      onExercise: props.onExercise, onViewCorrection: props.onViewCorrection,
      onPickFromBank: props.onPickFromBank, onCreateNewExInUnit: props.onCreateNewExInUnit, onRemoveExFromUnit: props.onRemoveExFromUnit, onSelectExercise: props.onSelectExercise,
      onEditUnit: props.onEditUnit, onUpdateUnit: props.onUpdateUnit, onDeleteUnit: props.onDeleteUnit, onAfterDeleteUnit: () => setNav({ ...nav, level: "units", unitId: null }), askConfirm: props.askConfirm,
    }} />;
}

// — Orquestador: páginas (escritorio) o flujo de niveles (móvil) —
function CoursesPages(props) {
  const { role, courses, units } = props;
  const isMobile = useIsMobile();
  const [page, setPage]           = useState({ name: "list", courseId: null });
  const [selUnitId, setSelUnitId] = useState(null);

  const openCourse = (courseId) => {
    const c  = courses.find((x) => x.id === courseId);
    const cu = c ? courseUnitList(c, units, role) : [];
    setSelUnitId(cu[0]?.id ?? null);
    setPage({ name: "detail", courseId });
  };

  if (isMobile) return <MobileCoursesFlow {...props} />;

  const current = courses.find((c) => c.id === page.courseId);
  if (page.name === "list" || !current) {
    return <CoursesLanding role={role} courses={courses} units={units} exercises={props.exercises} results={props.results} groups={props.groups}
      onOpen={openCourse} onCreateCourse={props.onCreateCourse} />;
  }
  return <CourseDetail {...props} courseId={page.courseId} selUnitId={selUnitId} setSelUnitId={setSelUnitId}
    onBack={() => setPage({ name: "list", courseId: null })} onSwitch={openCourse} />;
}

// ── Pestaña: Cursos (profesor) — ahora delega en CoursesPages ────────────────
function CoursesTab(props) {
  return <CoursesPages role="teacher" {...props} />;
}

// ── Pestaña: Alumnos ──────────────────────────────────────────────────────
function StudentsTab({ students, exercises, results, groups, onAddStudent, onResetCred, onRemove, askConfirm, onViewAnswer, onEditGroup, onDeleteGroup }) {
  const [expandedStudents, setExpandedStudents] = useState(new Set());
  const [expandedGroups,   setExpandedGroups]   = useState(() => new Set(groups.map((g) => g.id)));
  const toggleExpand = (id) =>
    setExpandedStudents((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleGroup = (id) =>
    setExpandedGroups((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const renderStudentCard = (s) => {
    const sRes    = results[s.id] || {};
    const isOpen  = expandedStudents.has(s.id);
    const doneExs = exercises.filter((ex) => sRes[ex.id]);
    return (
      <div
        key={s.id}
        onClick={() => exercises.length > 0 && toggleExpand(s.id)}
        style={{ ...S.card, cursor: exercises.length > 0 ? "pointer" : "default", userSelect: "none" }}>
        {/* Cabecera siempre visible */}
        <div style={{ ...S.row, justifyContent: "space-between", gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {s.displayName}
          </div>
          <div style={{ ...S.row, gap: 6, flexShrink: 0 }}>
            {exercises.length > 0 && <Chevron open={isOpen} rotate90WhenClosed size={13} />}
            <button
              onClick={(e) => { e.stopPropagation(); askConfirm(`¿Eliminar al alumno "${s.displayName}"?\n\nSe borrarán también todas sus respuestas guardadas.`, () => onRemove(s.id)); }}
              title={`Eliminar alumno "${s.displayName}"`}
              style={{ ...S.btnDanger, padding: "4px 8px", fontSize: 13 }}>✕</button>
          </div>
        </div>

        {/* Detalle: solo visible al desplegar (altura animada) */}
        <div className={`fa-expand${isOpen ? " fa-open" : ""}`}>
          <div className="fa-expand-inner">
            <div onClick={(e) => e.stopPropagation()} style={{ marginTop: 12, borderTop: `1px solid ${C.line}`, paddingTop: 12 }}>
              <div style={{ ...S.row, gap: 6, flexWrap: "wrap", marginBottom: doneExs.length > 0 ? 12 : 4 }}>
                <span style={{ ...S.badge, background: C.paper2, color: C.muted, fontFamily: FONT_MONO, fontSize: 10 }}>@{s.username}</span>
                <span style={{ ...S.badge, background: s.credType === "pin" ? "rgba(47,111,184,0.12)" : "rgba(63,155,91,0.10)", color: s.credType === "pin" ? C.quiz : C.fnT }}>
                  {s.credType === "pin" ? "PIN" : "Contraseña"}
                </span>
                {exercises.length > 0 && (
                  <span style={{ ...S.badge, background: C.line, color: C.muted, fontSize: 10 }}>
                    {doneExs.length}/{exercises.length} ejs.
                  </span>
                )}
                <button onClick={() => onResetCred(s)} style={{ ...S.btn, fontSize: 11, padding: "2px 9px" }}>Resetear</button>
              </div>
              {doneExs.length === 0
                ? <p style={{ fontFamily: F.sans, fontSize: 13, color: C.muted, margin: 0 }}>Ningún ejercicio entregado todavía.</p>
                : doneExs.map((ex) => {
                    const r = sRes[ex.id];
                    const needsCorrection = r && !r.teacherCorrection?.corrected && (
                      r.type === "esquema" ||
                      (r.type === "cuestionario" && questionsOf(ex).some((q) => q.type === "desarrollo"))
                    );
                    return (
                      <div key={ex.id} style={{ ...S.row, justifyContent: "space-between", paddingBottom: 6, borderBottom: `1px solid ${C.line}`, marginBottom: 6 }}>
                        <span style={{ fontSize: 13, color: C.muted2, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingRight: 8 }}>{ex.title}</span>
                        <div style={{ ...S.row, gap: 6, flexShrink: 0 }}>
                          {needsCorrection && (
                            <span style={{ ...S.badge, background: "rgba(212,120,0,0.12)", color: "#d47800", fontSize: 10 }}>Pendiente</span>
                          )}
                          <ScoreBadge score={r.score} />
                          <button onClick={() => onViewAnswer(s, ex, r)} style={{ ...S.btn, fontSize: 11, padding: "2px 9px", color: C.fnS, borderColor: C.fnS }}>Ver</button>
                        </div>
                      </div>
                    );
                  })
              }
            </div>
          </div>
        </div>
      </div>
    );
  };

  const assignedStudentIds = new Set(groups.flatMap((g) => g.studentIds || []));
  const ungrouped = students.filter((s) => !assignedStudentIds.has(s.id));

  return (
    <>
      <div style={{ ...S.row, justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
        <p style={{ color: C.muted, fontSize: 13, margin: 0 }}>
          {students.length} {students.length === 1 ? "alumno" : "alumnos"} · {groups.length} {groups.length === 1 ? "grupo" : "grupos"}
        </p>
        <div style={{ ...S.row, gap: 8 }}>
          <button onClick={() => onEditGroup(null)} style={S.btn}>+ Nuevo grupo</button>
          <button onClick={onAddStudent} style={S.btnPrimary}>+ Crear alumno</button>
        </div>
      </div>

      {students.length === 0 && groups.length === 0 && (
        <div style={{ ...S.card, textAlign: "center", color: C.muted, padding: "2rem 1rem", lineHeight: 1.8 }}>
          <div>Aún no hay alumnos.</div>
          <div style={{ fontSize: 13 }}>Crea el primero con el botón de arriba.</div>
        </div>
      )}

      {groups.map((group) => {
        const groupStudents = students.filter((s) => (group.studentIds || []).includes(s.id));
        const isGroupOpen   = expandedGroups.has(group.id);
        return (
          <div key={group.id} style={{ marginBottom: 28 }}>
            <div
              onClick={() => toggleGroup(group.id)}
              style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: isGroupOpen ? 12 : 0, paddingBottom: 10, borderBottom: `2px solid ${C.ink}`, flexWrap: "wrap", cursor: "pointer", userSelect: "none" }}>
              <span style={{ fontFamily: F.serif, fontSize: 20, fontWeight: 700, flex: 1, minWidth: 120 }}>{group.name}</span>
              <span style={{ fontSize: 12, color: C.muted, flexShrink: 0 }}>{groupStudents.length} {groupStudents.length === 1 ? "alumno" : "alumnos"}</span>
              <Chevron open={isGroupOpen} rotate90WhenClosed size={14} />
              <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", gap: 6 }}>
                <button onClick={() => onEditGroup(group)} style={{ ...S.btn, fontSize: 12, padding: "4px 10px" }}>Editar</button>
                <button
                  onClick={() => askConfirm(`¿Eliminar el grupo "${group.name}"?\n\nLos alumnos no se eliminarán.`, () => onDeleteGroup(group.id))}
                  title={`Eliminar grupo "${group.name}"`}
                  style={{ ...S.btnDanger, padding: "4px 8px", fontSize: 13 }}>✕</button>
              </div>
            </div>
            {isGroupOpen && (
              groupStudents.length === 0
                ? <p style={{ color: C.muted, fontSize: 13, margin: 0 }}>Este grupo no tiene alumnos. Edítalo para añadir.</p>
                : groupStudents.map(renderStudentCard)
            )}
          </div>
        );
      })}

      {ungrouped.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          {groups.length > 0 && (
            <div style={{ paddingBottom: 10, marginBottom: 12, borderBottom: `2px solid ${C.line}` }}>
              <span style={{ fontFamily: F.serif, fontSize: 20, fontWeight: 700, color: C.muted }}>Sin grupo</span>
            </div>
          )}
          {ungrouped.map(renderStudentCard)}
        </div>
      )}
    </>
  );
}

// ── Pestaña: Categorías ───────────────────────────────────────────────────
function CategoriesTab({ categories, isAdmin, onAdd, onEdit, onDelete, onToggleGlobal, askConfirm }) {
  return (
    <>
      <button onClick={onAdd} style={{ ...S.btnPrimary, marginBottom: 16 }}>+ Crear categoría</button>
      <p style={{ color: C.muted, fontSize: 12, marginTop: -8, marginBottom: 16 }}>
        Las categorías definen los botones del modelo Interactivo. Editar o eliminar una categoría no afecta a los ejercicios ya creados.
      </p>

      {categories.map((m) => {
        const isGlobal = m.builtIn || m.global;
        const canEdit  = isAdmin || !isGlobal;
        const canDel   = isAdmin ? m.id !== "default" : !isGlobal;
        return (
          <div key={m.id} style={S.card}>
            <div style={{ ...S.row, justifyContent: "space-between", marginBottom: 6, gap: 12, flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                <div style={{ ...S.row, gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 600 }}>{m.name}</span>
                  {isGlobal && (
                    <span style={{ ...S.badge, background: "#e8f0fe", color: "#1a56db", border: "1px solid #bfcfef" }}>
                      ⭐ Predeterminada
                    </span>
                  )}
                </div>
                <div style={{ ...S.row, gap: 6, flexWrap: "wrap" }}>
                  {m.buttons.map((b) => (
                    <span key={b.id} style={{ ...S.badge, background: b.color, color: textOn(b.color), fontSize: 10 }}>
                      {b.id} · {b.name} [{b.key.toUpperCase()}]
                    </span>
                  ))}
                </div>
              </div>
              <div style={{ ...S.row, gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                {isAdmin && !m.builtIn && (
                  <button
                    onClick={() => onToggleGlobal(m.id)}
                    title={m.global ? "Quitar de predeterminadas" : "Establecer como predeterminada para todos los profesores"}
                    style={{ ...S.btn, fontSize: 12, color: m.global ? "#1a56db" : C.muted }}
                  >
                    {m.global ? "⭐ Predeterminada" : "☆ Predeterminar"}
                  </button>
                )}
                {canEdit && (
                  <button onClick={() => onEdit(m)} style={S.btn}>Editar</button>
                )}
                {canDel && (
                  <button
                    onClick={() => askConfirm(
                      `¿Eliminar la categoría "${m.name}"?\n\nLos ejercicios que ya la usan conservarán su copia.`,
                      () => onDelete(m.id)
                    )}
                    style={S.btnDanger}
                  >Eliminar</button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}

// ── Pestaña: Audios (almacén) ─────────────────────────────────────────────
function AudiosTab({ audioLibrary, isAdmin, onAdd, onEdit, onDelete, askConfirm }) {
  const [openId,          setOpenId]          = useState(null);
  const [previewId,       setPreviewId]       = useState(null);
  const [filterComposers, setFilterComposers] = useState([]);
  const [filterTags,      setFilterTags]      = useState([]);

  // Opciones únicas para los dropdowns
  const allComposers = useMemo(() => audioComposers(audioLibrary), [audioLibrary]);
  const allTags      = useMemo(() => audioTags(audioLibrary),      [audioLibrary]);

  // Lista filtrada
  const filtered = useMemo(() => {
    if (filterComposers.length === 0 && filterTags.length === 0) return audioLibrary;
    return audioLibrary.filter((a) => {
      if (filterComposers.length > 0 && !filterComposers.includes(a.composer)) return false;
      if (filterTags.length > 0) {
        const aTags = a.tags || [];
        if (!filterTags.every((t) => aTags.includes(t))) return false;
      }
      return true;
    });
  }, [audioLibrary, filterComposers, filterTags]);

  const hasFilters = filterComposers.length > 0 || filterTags.length > 0;

  const toggleComposer = (val) => setFilterComposers((p) => p.includes(val) ? p.filter((x) => x !== val) : [...p, val]);
  const toggleTag      = (val) => setFilterTags((p) => p.includes(val) ? p.filter((x) => x !== val) : [...p, val]);

  return (
    <>
      {isAdmin && (
        <button onClick={onAdd} style={{ ...S.btnPrimary, marginBottom: 16 }}>+ Añadir audio</button>
      )}
      {!isAdmin && (
        <p style={{ color: C.muted, fontSize: 13, margin: "0 0 16px" }}>Solo el administrador puede añadir o editar audios del almacén.</p>
      )}

      {/* ── Barra de filtros ── */}
      {audioLibrary.length > 0 && (
        <div style={{ marginBottom: 16, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <FilterDropdown
            label="Compositor"
            options={allComposers}
            selected={filterComposers}
            onToggle={toggleComposer}
            onClear={() => setFilterComposers([])}
            accent="#2F6FB8"
          />
          <FilterDropdown
            label="Etiquetas"
            options={allTags}
            selected={filterTags}
            onToggle={toggleTag}
            onClear={() => setFilterTags([])}
            accent={C.fnI}
          />
          {hasFilters && (
            <button
              onClick={() => { setFilterComposers([]); setFilterTags([]); }}
              style={{ padding: "5px 11px", borderRadius: 20, border: "1.5px solid rgba(184,74,58,0.35)", background: "transparent", color: C.danger, cursor: "pointer", fontFamily: FONT_SANS, fontSize: 12 }}
            >✕ Limpiar</button>
          )}
        </div>
      )}

      {audioLibrary.length === 0 && (
        <div style={{ ...S.card, textAlign: "center", color: C.muted, padding: "2.5rem 1rem", lineHeight: 1.8 }}>
          <div>El almacén está vacío.</div>
          {isAdmin && <div style={{ fontSize: 13 }}>Añade el primer audio con el botón de arriba.</div>}
        </div>
      )}

      {audioLibrary.length > 0 && filtered.length === 0 && (
        <div style={{ ...S.card, textAlign: "center", color: C.muted, padding: "2rem 1rem" }}>
          No hay audios que coincidan con los filtros seleccionados.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {filtered.map((audio) => {
          const isOpen = openId === audio.id;
          const isPrev = previewId === audio.id;
          return (
            <div key={audio.id} style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 8, overflow: "hidden" }}>
              {/* ── Cabecera siempre visible ── */}
              <div
                onClick={() => setOpenId(isOpen ? null : audio.id)}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", cursor: "pointer", userSelect: "none" }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: F.sans, fontSize: 15, fontWeight: 500, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {audio.title}
                  </div>
                  {audio.composer && (
                    <div style={{ fontSize: 11, color: C.fnS, fontWeight: 500, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {audio.composer}
                    </div>
                  )}
                </div>
                <Chevron open={isOpen} />
                <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <button onClick={() => { setPreviewId(isPrev ? null : audio.id); if (!isOpen) setOpenId(audio.id); }}
                    style={{ ...S.btn, padding: "5px 11px", fontSize: 12 }}>
                    {isPrev ? "⏹" : "▶"}
                  </button>
                  {isAdmin && (
                    <>
                      <button onClick={() => onEdit(audio)} style={{ ...S.btn, padding: "5px 10px", fontSize: 12 }}>Editar</button>
                      <button onClick={() => askConfirm(`¿Eliminar "${audio.title}" del almacén?\n\nLos ejercicios que ya lo usan conservarán su enlace.`, () => onDelete(audio.id))}
                        style={{ ...S.btnDanger, padding: "5px 10px", fontSize: 12 }}>Eliminar</button>
                    </>
                  )}
                </div>
              </div>

              {/* ── Detalle expandido ── */}
              {isOpen && (
                <div style={{ borderTop: `1px solid ${C.line}`, padding: "10px 14px 14px", background: C.bg }}>
                  {audio.description && (
                    <p style={{ margin: "0 0 10px", fontSize: 13, color: C.muted, lineHeight: 1.5 }}>{audio.description}</p>
                  )}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: isPrev ? 12 : 0 }}>
                    <span style={{ ...S.badge, background: C.line, color: C.muted, fontFamily: FONT_MONO }}>{fmt(audio.duration)}</span>
                    <span style={{ ...S.badge, background: C.paper2, color: C.muted, fontSize: 10, maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{audio.url}</span>
                    {(audio.tags || []).map((tag) => (
                      <span key={tag} style={{ ...S.badge, background: "rgba(154,79,184,0.10)", color: C.fnI, fontSize: 10 }}>{tag}</span>
                    ))}
                  </div>
                  {isPrev && (
                    <audio key={audio.id} src={audio.url} controls autoPlay style={{ width: "100%", marginTop: 10, height: 36 }} />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

// ── Pestaña: Ajustes ──────────────────────────────────────────────────────
function SettingsTab({ margin, onMargin, currentUser, onUpdateUser }) {
  const current = currentUser?.defaultPalette || SCHEMA_PALETTE_DEFAULT;
  const setPalette = (id) => { if (currentUser) onUpdateUser({ ...currentUser, defaultPalette: id }); };
  return (
    <>
      <div style={S.card}>
        <label style={S.label}>Margen de error (segundos) — para ejercicios Interactivos</label>
        <div style={S.row}>
          <input type="range" min={0} max={3} step={0.5} value={margin}
            onChange={(e) => onMargin(Number(e.target.value))} style={{ flex: 1 }} />
          <span style={{ minWidth: 40, textAlign: "center", fontWeight: 600, color: C.fnD }}>{margin}s</span>
        </div>
        <p style={{ color: C.muted, fontSize: 12, marginTop: 8 }}>Por defecto: 1 segundo.</p>
      </div>
      <PalettePreferenceCard current={current} onSelect={setPalette} />
    </>
  );
}

// Tarjeta reutilizable de selección de paleta por defecto (profesor y alumno).
function PalettePreferenceCard({ current, onSelect }) {
  return (
    <div style={{ ...S.card, marginTop: 14 }}>
      <label style={S.label}>Paleta de color por defecto</label>
      <p style={{ color: C.muted, fontSize: 12, margin: "0 0 12px" }}>
        Define los colores de los bloques del esquema y de los botones de categorías en tus ejercicios. Por defecto: Paleta 1.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {SCHEMA_PALETTES.map((pal) => {
          const active = (current || SCHEMA_PALETTE_DEFAULT) === pal.id;
          return (
            <button key={pal.id} type="button" onClick={() => onSelect(pal.id)} className="fa-pressable"
              style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 12px", borderRadius: 10, cursor: "pointer", background: active ? C.paper2 : C.paper, border: `1.5px solid ${active ? C.ink : C.line}`, transition: "all .12s", fontFamily: F.sans, textAlign: "left", width: "100%" }}>
              <span style={{ display: "inline-flex", borderRadius: 5, overflow: "hidden", border: "1px solid rgba(0,0,0,0.08)", flexShrink: 0 }}>
                {pal.parts.map((c, i) => <span key={i} style={{ width: 22, height: 22, background: c, display: "block" }} />)}
              </span>
              <span style={{ flex: 1, fontSize: 13.5, fontWeight: active ? 700 : 500, color: active ? C.ink : C.ink2 }}>{pal.name}</span>
              {active && <span style={{ fontSize: 14, color: C.ink, flexShrink: 0 }}>✓</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Botón compacto con desplegable para elegir la paleta por defecto (cabeceras).
function PaletteMenuButton({ current, onSelect, label = "Paleta" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("touchstart", onDown); };
  }, [open]);
  const cur = getSchemaPalette(current) || SCHEMA_PALETTES[0];
  return (
    <div ref={ref} style={{ position: "relative", flexShrink: 0 }}>
      <button type="button" onClick={() => setOpen(o => !o)} className="fa-pressable"
        title="Paleta de color por defecto"
        style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "6px 9px", borderRadius: 7, cursor: "pointer", background: C.paper, border: `1px solid ${C.rail}`, fontFamily: F.sans }}>
        <span style={{ display: "inline-flex", borderRadius: 3, overflow: "hidden", border: "1px solid rgba(0,0,0,0.08)" }}>
          {cur.parts.map((c, i) => <span key={i} style={{ width: 9, height: 12, background: c, display: "block" }} />)}
        </span>
        <Chevron open={open} size={11} color={C.muted} />
      </button>
      {open && (
        <div className="fa-pop" style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 40, background: C.paper, border: `1px solid ${C.line}`, borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.12)", padding: 6, display: "flex", flexDirection: "column", gap: 2, minWidth: 172 }}>
          <div style={{ fontFamily: F.sans, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: C.muted, padding: "4px 8px 6px" }}>{label}</div>
          {SCHEMA_PALETTES.map((pal) => {
            const active = (current || SCHEMA_PALETTE_DEFAULT) === pal.id;
            return (
              <button key={pal.id} type="button" onClick={() => { onSelect(pal.id); setOpen(false); }}
                style={{ display: "flex", alignItems: "center", gap: 9, padding: "6px 8px", borderRadius: 7, cursor: "pointer", background: active ? C.paper2 : "transparent", border: "none", fontFamily: F.sans, textAlign: "left", width: "100%" }}>
                <span style={{ display: "inline-flex", borderRadius: 4, overflow: "hidden", border: "1px solid rgba(0,0,0,0.08)", flexShrink: 0 }}>
                  {pal.parts.map((c, i) => <span key={i} style={{ width: 13, height: 16, background: c, display: "block" }} />)}
                </span>
                <span style={{ flex: 1, fontSize: 12.5, fontWeight: active ? 700 : 500, color: active ? C.ink : C.ink2 }}>{pal.name}</span>
                {active && <span style={{ fontSize: 12, color: C.ink, flexShrink: 0 }}>✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Pestaña: Usuarios (admin) ─────────────────────────────────────────────
function UsersTab({ currentUser, teachers, onAddTeacher, onResetCred, onRemove, askConfirm }) {
  return (
    <>
      <div style={{ ...S.row, justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <p style={{ ...SECTION_STYLE, margin: 0 }}>Profesores ({teachers.length})</p>
        <button onClick={onAddTeacher} style={S.btnPrimary}>+ Crear profesor</button>
      </div>

      {teachers.length === 0 && (
        <div style={{ ...S.card, textAlign: "center", color: C.muted, padding: "1.5rem" }}>
          Aún no hay profesores. Crea el primero con el botón de arriba.
        </div>
      )}

      {teachers.map((t) => (
        <div key={t.id} style={S.card}>
          <div style={{ ...S.row, justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>{t.displayName}</div>
              <span style={{ ...S.badge, background: C.paper2, color: C.muted, fontFamily: FONT_MONO, fontSize: 10 }}>@{t.username}</span>
            </div>
            <div style={{ ...S.row, gap: 6 }}>
              <button onClick={() => onResetCred(t)} style={{ ...S.btn, fontSize: 12, padding: "5px 11px" }}>Resetear contraseña</button>
              <button onClick={() => askConfirm(`¿Eliminar la cuenta del profesor "${t.displayName}"?\n\nSus alumnos y resultados se conservarán.`, () => onRemove(t.id))} style={S.btnDanger}>Eliminar</button>
            </div>
          </div>
        </div>
      ))}

      <hr style={{ ...S.divider, margin: "28px 0" }} />
      <p style={SECTION_STYLE}>Administrador</p>
      <div style={S.card}>
        <div style={{ ...S.row, justifyContent: "space-between", gap: 10 }}>
          <div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>{currentUser.displayName}</div>
            <div style={{ ...S.row, gap: 6 }}>
              <span style={{ ...S.badge, background: C.paper2, color: C.muted, fontFamily: FONT_MONO, fontSize: 10 }}>@{currentUser.username}</span>
              <span style={{ ...S.badge, background: "rgba(154,79,184,0.12)", color: C.fnI }}>Admin</span>
            </div>
          </div>
          <button onClick={() => onResetCred(currentUser)} style={{ ...S.btn, fontSize: 12, padding: "5px 11px" }}>Cambiar mi contraseña</button>
        </div>
      </div>
    </>
  );
}

function TeacherDash({
  currentUser,
  users, onAddUser, onRemoveUser, onUpdateUser,
  exercises, onUpdateExercise, onDeleteExercise,
  results, margin, onMargin,
  onRecord, onPreview, onManageQuestions, onAdd, onLogout,
  categories, onAddCategory, onUpdateCategory, onDeleteCategory, onToggleGlobalCategory,
  courses, units,
  onAddCourse, onUpdateCourse, onDeleteCourse,
  onAddUnit, onUpdateUnit, onDeleteUnit,
  onAddExercisesToUnit, onRemoveExerciseFromUnit,
  groups = [], onAddGroup, onUpdateGroup, onDeleteGroup,
  onSaveCorrection,
  audioLibrary = [], onAddAudio, onUpdateAudio, onDeleteAudio,
  tab = "exercises", onTab, detailExId = null, onSelectExercise,
}) {
  const isAdmin = currentUser?.role === "admin" || currentUser?.username === "jonb";
  const isMobile = useIsMobile();

  const students = useMemo(() =>
    (users || []).filter((u) => u.role === "student" && (isAdmin || u.createdBy === currentUser?.id || u.teacherId === currentUser?.id)),
    [users, currentUser, isAdmin]
  );
  const teachers      = useMemo(() => (users || []).filter((u) => u.role === "teacher"), [users]);
  const teacherGroups = useMemo(() =>
    (groups || []).filter((g) => isAdmin || g.teacherId === currentUser?.id),
    [groups, currentUser, isAdmin]
  );

  const setTab = onTab || (() => {});
  // Detalle de ejercicio controlado por la URL ("new" para creación)
  const selectedExerciseId = detailExId;
  const setSelectedExerciseId = onSelectExercise || (() => {});
  // Para que el profesor vea la respuesta detallada de un alumno en un ejercicio
  const [viewingAnswer, setViewingAnswer] = useState(null); // null | { student, exercise, result }

  // Modal state
  const [editingCategory, setEditingCategory] = useState(null);    // null | "new" | category
  const [confirmState,    setConfirmState]    = useState(null);
  const [editingAudio,    setEditingAudio]    = useState(null);    // null | "new" | audio
  const [showAddUser,     setShowAddUser]     = useState(false);
  const [addingUserRole,  setAddingUserRole]  = useState("student");
  const [showResetCred,   setShowResetCred]   = useState(false);
  const [resetCredTarget, setResetCredTarget] = useState(null);
  const [editingGroup,    setEditingGroup]    = useState(undefined); // undefined=closed, null=new, group=edit

  // Course/unit modal state
  const [openUnitIds,      setOpenUnitIds]      = useState(new Set());
  const [editingCourse,    setEditingCourse]    = useState(null);  // null | "new" | course
  const [editingUnit,      setEditingUnit]      = useState(null);  // null | unit
  const [unitFormCourseId, setUnitFormCourseId] = useState(null);
  const [exPickerUnitId,   setExPickerUnitId]   = useState(null);
  const [newExInUnit,      setNewExInUnit]      = useState(null);

  const askConfirm = (message, onConfirm, confirmLabel = "Eliminar") =>
    setConfirmState({ message, confirmLabel, onConfirm: () => { onConfirm(); setConfirmState(null); } });

  // Tras crear un ejercicio dentro de una unidad, lo añadimos automáticamente
  const lastCreatedExRef = useRef(null);
  const handleExerciseCreated = (newEx, unitId) => {
    lastCreatedExRef.current = newEx;
    onAdd(newEx);
    if (unitId) onAddExercisesToUnit(unitId, [newEx.id]);
    setSelectedExerciseId(newEx.id);
    setNewExInUnit(null);
  };

  // Vista de respuesta de un alumno
  if (viewingAnswer) {
    const { student, exercise: va_ex, result: va_result } = viewingAnswer;
    const freshVa      = exercises.find((e) => e.id === va_ex.id) || va_ex;
    const freshResult  = (results[student.id] || {})[va_ex.id] || va_result;
    // El profesor ve los colores con la paleta que usó el alumno al entregar.
    const vaPalette    = effectivePaletteId({ schemaPalette: freshResult?.schemaPalette }, null);
    const freshVaPal   = applyPaletteToExercise(freshVa, vaPalette);
    return (
      <div style={S.app}>
        <div style={{ background: C.paper, borderBottom: `1px solid ${C.line}`, padding: "10px 20px", display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={() => setViewingAnswer(null)} style={{ ...S.btn, fontSize: 12, padding: "5px 12px" }}>← Volver a alumnos</button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: 12, color: C.muted }}>Respuesta de </span>
            <span style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{student.displayName}</span>
          </div>
        </div>
        <CorrectionView
          key={JSON.stringify(freshResult.teacherCorrection)}
          exercise={freshVaPal}
          result={freshResult}
          margin={margin}
          onBack={() => setViewingAnswer(null)}
          backLabel="← Volver a alumnos"
          isTeacherMode={true}
          student={student}
          onSaveCorrection={onSaveCorrection}
        />
      </div>
    );
  }

  // Vista de detalle/creación
  if (selectedExerciseId === "new") {
    return (
      <ExerciseDetailView
        exercise={null}
        onBack={() => setSelectedExerciseId(null)}
        onRecord={() => {}}
        onUpdate={() => {}}
        onCreate={(newEx) => handleExerciseCreated(newEx, newExInUnit)}
        onDelete={() => {}}
        categories={categories}
        audioLibrary={audioLibrary}
      />
    );
  }

  const selectedExercise = selectedExerciseId != null
    ? (exercises.find((e) => String(e.id) === String(selectedExerciseId)) || lastCreatedExRef.current)
    : null;

  if (selectedExercise) {
    return (
      <ExerciseDetailView
        exercise={selectedExercise}
        onBack={() => setSelectedExerciseId(null)}
        onRecord={onRecord}
        onPreview={onPreview}
        onManageQuestions={onManageQuestions}
        onUpdate={(patch) => onUpdateExercise(selectedExercise.id, patch)}
        onCreate={() => {}}
        onDelete={() => { onDeleteExercise(selectedExercise.id); setSelectedExerciseId(null); }}
        categories={categories}
        audioLibrary={audioLibrary}
      />
    );
  }

  const primaryTabs = [
    { id: "exercises", label: "Ejercicios" },
    { id: "courses",   label: "Cursos" },
    { id: "students",  label: "Alumnos" },
  ];
  const secondaryTabs = [
    { id: "categories", label: "Categorías" },
    { id: "audios",     label: "Audios" },
    { id: "settings",   label: "Ajustes" },
    ...(isAdmin ? [{ id: "users", label: "Usuarios" }] : []),
  ];

  return (
    <div style={S.app}>
      <div style={{ ...S.page, padding: isMobile ? "calc(18px + env(safe-area-inset-top,0px)) 14px 40px" : S.page.padding }}>
        {/* Cabecera editorial */}
        <div style={{ marginBottom: isMobile ? 18 : 24, paddingBottom: isMobile ? 14 : 20, borderBottom: `2px solid ${C.ink}`, display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <Overline>{isAdmin ? "Administrador" : "Profesor"}</Overline>
            <h1 style={{ ...S.h1, fontSize: isMobile ? 24 : 32, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{currentUser?.displayName}</h1>
          </div>
          <div style={{ flexShrink: 0 }}><GhostButton onClick={onLogout}>Salir</GhostButton></div>
        </div>

        {isMobile ? (
          // Móvil: una sola tira de pestañas con scroll horizontal (sin separador
          // que colapse ni pestañas recortadas). El borde inferior se mantiene.
          <div className="fa-noscroll" style={{
            display: "flex", alignItems: "flex-end", borderBottom: `1px solid ${C.line}`,
            marginBottom: 22, gap: 0, overflowX: "auto", flexWrap: "nowrap",
            WebkitOverflowScrolling: "touch", scrollbarWidth: "none",
          }}>
            <TabBar tabs={primaryTabs}   value={tab} onChange={setTab} variant="primary" />
            <TabBar tabs={secondaryTabs} value={tab} onChange={setTab} variant="secondary" />
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "flex-end", borderBottom: `1px solid ${C.line}`, marginBottom: 26, gap: 0 }}>
            <TabBar tabs={primaryTabs}   value={tab} onChange={setTab} variant="primary" />
            <div style={{ flex: 1 }} />
            <TabBar tabs={secondaryTabs} value={tab} onChange={setTab} variant="secondary" />
          </div>
        )}

        {tab === "exercises" && (
          <ExercisesTab exercises={exercises} audioLibrary={audioLibrary}
            onNew={() => setSelectedExerciseId("new")}
            onSelect={setSelectedExerciseId}
            onToggleVisibility={(ex) => onUpdateExercise(ex.id, { hidden: !ex.hidden })}
            onDelete={(id) => { onDeleteExercise(id); setSelectedExerciseId(null); }}
            askConfirm={askConfirm} />
        )}

        {tab === "courses" && (
          <CoursesTab
            courses={courses} units={units} exercises={exercises} groups={teacherGroups}
            openUnitIds={openUnitIds} setOpenUnitIds={setOpenUnitIds}
            onCreateCourse={() => setEditingCourse("new")}
            onEditCourse={(c) => setEditingCourse(c)}
            onDeleteCourse={onDeleteCourse}
            onUpdateCourse={onUpdateCourse}
            onCreateUnit={(courseId) => { setEditingUnit(null); setUnitFormCourseId(courseId); }}
            onEditUnit={(u) => setEditingUnit(u)}
            onDeleteUnit={onDeleteUnit}
            onUpdateUnit={onUpdateUnit}
            onPickFromBank={(unitId) => setExPickerUnitId(unitId)}
            onCreateNewExInUnit={(unitId) => { setNewExInUnit(unitId); setSelectedExerciseId("new"); }}
            onRemoveExFromUnit={onRemoveExerciseFromUnit}
            onSelectExercise={setSelectedExerciseId}
            askConfirm={askConfirm}
          />
        )}

        {tab === "students" && (
          <StudentsTab
            students={students} exercises={exercises} results={results}
            groups={teacherGroups}
            onAddStudent={() => { setAddingUserRole("student"); setShowAddUser(true); }}
            onResetCred={(s) => { setResetCredTarget(s); setShowResetCred(true); }}
            onRemove={onRemoveUser} askConfirm={askConfirm}
            onViewAnswer={(student, exercise, result) => setViewingAnswer({ student, exercise, result })}
            onEditGroup={(g) => setEditingGroup(g === null ? null : g)}
            onDeleteGroup={onDeleteGroup}
          />
        )}

        {tab === "categories" && (
          <CategoriesTab categories={categories}
            isAdmin={isAdmin}
            onAdd={() => setEditingCategory("new")}
            onEdit={(m) => setEditingCategory(m)}
            onDelete={onDeleteCategory}
            onToggleGlobal={onToggleGlobalCategory}
            askConfirm={askConfirm} />
        )}

        {tab === "audios" && (
          <AudiosTab audioLibrary={audioLibrary} isAdmin={isAdmin}
            onAdd={() => setEditingAudio("new")}
            onEdit={(a) => setEditingAudio(a)}
            onDelete={onDeleteAudio}
            askConfirm={askConfirm} />
        )}

        {tab === "settings" && <SettingsTab margin={margin} onMargin={onMargin} currentUser={currentUser} onUpdateUser={onUpdateUser} />}

        {tab === "users" && isAdmin && (
          <UsersTab currentUser={currentUser} teachers={teachers}
            onAddTeacher={() => { setAddingUserRole("teacher"); setShowAddUser(true); }}
            onResetCred={(t) => { setResetCredTarget(t); setShowResetCred(true); }}
            onRemove={onRemoveUser}
            askConfirm={askConfirm} />
        )}

        {/* Modales */}
        {editingCategory !== null && (
          <CategoryEditorModal
            initialCategory={editingCategory === "new" ? null : editingCategory}
            onSave={(c) => { if (editingCategory === "new") onAddCategory(c); else onUpdateCategory(c); setEditingCategory(null); }}
            onClose={() => setEditingCategory(null)} />
        )}

        {editingCourse !== null && (
          <CourseFormModal
            initial={editingCourse === "new" ? null : editingCourse}
            groups={teacherGroups}
            onSave={(c) => { if (editingCourse === "new") onAddCourse({ ...c, ownerId: currentUser.id }); else onUpdateCourse(c); setEditingCourse(null); }}
            onClose={() => setEditingCourse(null)} />
        )}

        {(editingUnit !== null || unitFormCourseId !== null) && (
          <UnitFormModal
            initial={editingUnit}
            onSave={(newUnit) => {
              if (editingUnit) onUpdateUnit(newUnit);
              else onAddUnit(newUnit, unitFormCourseId);
              setEditingUnit(null); setUnitFormCourseId(null);
            }}
            onClose={() => { setEditingUnit(null); setUnitFormCourseId(null); }} />
        )}

        {exPickerUnitId !== null && (
          <ExercisePickerModal
            exercises={exercises}
            alreadyInUnit={units.find((u) => u.id === exPickerUnitId)?.exerciseIds || []}
            onAdd={(ids) => { onAddExercisesToUnit(exPickerUnitId, ids); setExPickerUnitId(null); }}
            onClose={() => setExPickerUnitId(null)} />
        )}

        {showAddUser && (
          <AddUserModal forRole={addingUserRole} currentUserId={currentUser.id}
            existingUsernames={(users || []).map((u) => u.username)}
            onSave={(newUser) => { onAddUser(newUser); setShowAddUser(false); }}
            onClose={() => setShowAddUser(false)} />
        )}

        {showResetCred && resetCredTarget && (
          <ResetCredentialModal targetUser={resetCredTarget}
            onSave={(updated) => { onUpdateUser(updated); setShowResetCred(false); setResetCredTarget(null); }}
            onClose={() => { setShowResetCred(false); setResetCredTarget(null); }} />
        )}

        {editingAudio !== null && (
          <AudioLibraryFormModal
            initial={editingAudio === "new" ? null : editingAudio}
            allTags={audioTags(audioLibrary)}
            allComposers={audioComposers(audioLibrary)}
            onSave={(a) => { if (editingAudio === "new") onAddAudio(a); else onUpdateAudio(a); setEditingAudio(null); }}
            onClose={() => setEditingAudio(null)} />
        )}

        {editingGroup !== undefined && (
          <GroupEditorModal
            initial={editingGroup}
            students={students}
            currentUserId={currentUser.id}
            onSave={(g) => {
              if (editingGroup === null) onAddGroup(g); else onUpdateGroup(g);
              setEditingGroup(undefined);
            }}
            onClose={() => setEditingGroup(undefined)}
          />
        )}

        {confirmState && (
          <ConfirmModal {...confirmState} onCancel={() => setConfirmState(null)} />
        )}
      </div>
    </div>
  );
}

// ═══ 12. EXERCISE DETAIL VIEW (creación/edición de ejercicio) ═══════════════
function ExerciseDetailView({ exercise, onBack, onRecord, onPreview, onManageQuestions, onUpdate, onCreate, onDelete, categories, audioLibrary = [] }) {
  const isCreating = exercise == null;

  // Estado del formulario
  const [title, setTitle] = useState(isCreating ? "" : exercise.title);
  // comboId: id de MODEL_COMBOS — puede ser un solo modelo o un combo doble
  const [comboId, setComboId] = useState(() =>
    isCreating ? DEFAULT_MODEL_ID : comboIdFromModels(modelsOf(exercise))
  );
  const activeCombo   = MODEL_COMBOS.find((c) => c.id === comboId) || MODEL_COMBOS[0];
  const selectedModels = activeCombo.models;          // ej. ["interactivo","cuestionario"]
  const model          = selectedModels[0];           // modelo primario (backward compat)

  const initialCatIds = useMemo(() => {
    if (isCreating) return new Set([categories[0]?.id || "default"]);
    const exIds = new Set(categoriesOf(exercise).map((m) => m.id));
    const valid = categories.filter((m) => exIds.has(m.id)).map((m) => m.id);
    return new Set(valid.length ? valid : [categories[0]?.id || "default"]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Map<catId, Set<btnId>>
  const initialBtnIds = useMemo(() => {
    const map = new Map();
    categories.forEach((cat) => {
      const exCat = isCreating ? null : categoriesOf(exercise).find((c) => c.id === cat.id);
      map.set(cat.id, new Set(exCat ? exCat.buttons.map((b) => b.id) : cat.buttons.map((b) => b.id)));
    });
    return map;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [selectedCategoryIds, setSelectedCategoryIds] = useState(initialCatIds);
  const [selectedButtonIds,   setSelectedButtonIds]   = useState(initialBtnIds);

  const [audioUrl,       setAudioUrl]       = useState(isCreating ? null : (exercise.audioUrl || null));
  const [audioName,      setAudioName]      = useState(isCreating ? null : (exercise.audioName || null));
  const [audioDuration,  setAudioDuration]  = useState(() => {
    if (isCreating) return null;
    const lib = (exercise.audioUrl || null)
      ? audioLibrary.find(a => a.url === exercise.audioUrl)
      : null;
    return lib?.duration || exercise.audioTotalDuration || null;
  });
  const [waveformData,   setWaveformData]   = useState(isCreating ? null : (exercise.waveformData || null));
  // Fragmento de audio: inicio y fin en el audio completo (segundos), o null = sin fragmento
  const [fragStart,      setFragStart]      = useState(isCreating ? null : (exercise.audioFragmentStart ?? null));
  const [fragEnd,        setFragEnd]        = useState(isCreating ? null : (exercise.audioFragmentEnd   ?? null));
  const [manualDuration, setManualDuration] = useState(
    !isCreating && !exercise.audioName && exercise.duration ? String(exercise.duration) : ""
  );
  const [showConfirmDel,    setShowConfirmDel]    = useState(false);
  const [showLibraryPicker, setShowLibraryPicker] = useState(false);
  const [listenOnly,                setListenOnly]                = useState(isCreating ? false : (exercise.listenOnly ?? false));
  const [immediateSchemaFeedback,   setImmediateSchemaFeedback]   = useState(isCreating ? false : (exercise.immediateSchemaFeedback ?? false));
  const [showComposer,              setShowComposer]              = useState(isCreating ? true  : (exercise.showComposer ?? true));
  const [schemaLevels,      setSchemaLevels]      = useState(
    () => new Set(isCreating ? [1,2,3,4] : (exercise.schemaLevels ?? [1,2,3,4]))
  );
  const toggleSchemaLevel = (id) => setSchemaLevels(prev => {
    const n = new Set(prev);
    if (n.has(id)) { if (n.size > 1) n.delete(id); } else n.add(id);
    return n;
  });

  const toggleCategory = (id) => setSelectedCategoryIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) { if (next.size > 1) next.delete(id); return next; }
    // Categorías de grados con cifrado: son exclusivas (van solas). Al activar
    // una, se deselecciona el resto; al activar otra categoría, se quita esta.
    const cat = categories.find((c) => c.id === id);
    if (cat?.hasFigures) return new Set([id]);
    // Si había una categoría de grados activa, quitarla al añadir una normal.
    for (const cid of next) {
      const c = categories.find((x) => x.id === cid);
      if (c?.hasFigures) next.delete(cid);
    }
    next.add(id);
    return next;
  });

  const toggleButton = (catId, btnId) => setSelectedButtonIds((prev) => {
    const next = new Map(prev);
    const btns = new Set(next.get(catId) || []);
    if (btns.has(btnId)) { if (btns.size > 1) btns.delete(btnId); } else btns.add(btnId);
    next.set(catId, btns);
    return next;
  });

  // BUG FIX: cancelación de detecciones de audio obsoletas cuando el usuario
  // pega otra URL antes de que termine la primera decodificación.
  const urlReqRef = useRef(0);
  const handleUrlInput = (rawUrl) => {
    const url = rawUrl.trim();
    setAudioUrl(url || null);
    setAudioName(url ? url.split("/").pop().split("?")[0] || "audio" : null);
    setAudioDuration(null);
    setWaveformData(null);
    setFragStart(null);
    setFragEnd(null);
    if (!url) return;

    const reqId    = ++urlReqRef.current;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    fetchAudioBuffer(url)
      .then((buf) => ctx.decodeAudioData(buf))
      .then((decoded) => {
        ctx.close();
        if (reqId !== urlReqRef.current) return;   // petición obsoleta
        setAudioDuration(Math.ceil(decoded.duration));
        setWaveformData(buildWaveformFromPCM(decoded.getChannelData(0), decoded.duration));
      })
      .catch(() => { try { ctx.close(); } catch {} });
  };

  const clearAudio = () => {
    setAudioUrl(null); setAudioName(null);
    setAudioDuration(null); setWaveformData(null);
    setFragStart(null); setFragEnd(null);
    urlReqRef.current++;
  };

  const handlePickFromLibrary = (audio) => {
    urlReqRef.current++;                        // descarta cualquier carga en curso
    setAudioUrl(audio.url);
    setAudioName(audio.title);
    setAudioDuration(audio.duration);
    setWaveformData(null);                      // se recalcula al reproducir
    setManualDuration(String(audio.duration));
    setFragStart(null);                         // reset fragmento al cambiar audio
    setFragEnd(null);
    setShowLibraryPicker(false);
  };

  const hasExistingAudio = !!audioName;
  // Duración total del audio del almacén (sin recortar), para la barra de fragmento
  const totalAudioDuration = audioDuration
    || (!audioUrl ? null : audioLibrary.find(a => a.url === audioUrl)?.duration)
    || (!isCreating && !exercise.audioFragmentStart ? exercise.duration : null)
    || null;
  // Duración efectiva del ejercicio (del fragmento si está definido, del audio completo si no)
  const effDuration = hasExistingAudio
    ? (fragStart != null && fragEnd != null
        ? Math.round((fragEnd - fragStart) * 10) / 10
        : (audioDuration || (!isCreating ? exercise.duration : 0)))
    : (parseInt(manualDuration) || 0);

  // Compositor del audio actualmente seleccionado (para el toggle)
  const activeComposer = useMemo(() => {
    if (!audioUrl) return null;
    return audioLibrary.find((a) => a.url === audioUrl)?.composer || null;
  }, [audioUrl, audioLibrary]);

  // Detección de cambios (solo en edición)
  const isDirty = useMemo(() => {
    if (isCreating) return false;
    if (title.trim() !== exercise.title) return true;
    // Comparar array de modelos
    const exModelsArr = modelsOf(exercise);
    if (selectedModels.join(",") !== exModelsArr.join(",")) return true;
    if (audioUrl !== (exercise.audioUrl || null)) return true;
    if (!audioName && exercise.audioName) return true;
    if (selectedModels.includes("esquema") && (exercise.listenOnly ?? false) !== listenOnly) return true;
    if (selectedModels.includes("esquema") && (exercise.immediateSchemaFeedback ?? false) !== immediateSchemaFeedback) return true;
    if ((exercise.showComposer ?? true) !== showComposer) return true;
    if (selectedModels.includes("esquema")) {
      const exLvs = new Set(exercise.schemaLevels ?? [1,2,3,4]);
      if (schemaLevels.size !== exLvs.size || [...schemaLevels].some(id => !exLvs.has(id))) return true;
    }

    if (selectedModels.includes("interactivo")) {
      const exCats = categoriesOf(exercise);
      const exIds  = new Set(exCats.map((m) => m.id));
      if (selectedCategoryIds.size !== exIds.size) return true;
      for (const id of selectedCategoryIds) {
        if (!exIds.has(id)) return true;
        const exCat    = exCats.find((c) => c.id === id);
        const selBtns  = selectedButtonIds.get(id) || new Set();
        const exBtnIds = new Set((exCat?.buttons || []).map((b) => b.id));
        if (selBtns.size !== exBtnIds.size) return true;
        for (const bid of selBtns) if (!exBtnIds.has(bid)) return true;
      }
    }
    if (!hasExistingAudio && !exercise.audioName) {
      const manual = parseInt(manualDuration) || 0;
      if (manual !== exercise.duration) return true;
    }
    if ((fragStart ?? null) !== (exercise.audioFragmentStart ?? null)) return true;
    if ((fragEnd   ?? null) !== (exercise.audioFragmentEnd   ?? null)) return true;
    return false;
  }, [isCreating, title, selectedModels, audioUrl, audioName, selectedCategoryIds, selectedButtonIds, manualDuration, exercise, hasExistingAudio, listenOnly, immediateSchemaFeedback, showComposer, schemaLevels, fragStart, fragEnd]);

  const canSave = title.trim().length > 0 && effDuration > 0 && (isCreating || isDirty);
  const SEC = { background: C.paper, border: `1px solid ${C.line}`, borderRadius: 16, padding: "16px 18px", marginBottom: 14 };

  const handleSave = () => {
    if (!canSave) return;
    const hasInteractivo = selectedModels.includes("interactivo");
    const hasEsquema     = selectedModels.includes("esquema");
    const hasCuestionario = selectedModels.includes("cuestionario");
    const chosen = hasInteractivo ? categories.filter((m) => selectedCategoryIds.has(m.id)) : [];

    const applyBtnFilter = (cat) => {
      const selBtns = selectedButtonIds.get(cat.id);
      const btns    = selBtns ? cat.buttons.filter((b) => selBtns.has(b.id)) : cat.buttons;
      return { ...cat, buttons: btns.length >= 1 ? btns : cat.buttons };
    };
    const safe = (chosen.length ? chosen : (hasInteractivo ? [DEFAULT_CATEGORY] : [])).map(applyBtnFilter);
    // Las categorías de grados con cifrado requieren pistas visibles (el alumno
    // rellena sobre los huecos de la clave). Se fuerza showHint = true.
    const forceHint = hasInteractivo && safe.some((c) => c.hasFigures);

    if (isCreating) {
      onCreate({
        id: Date.now(),
        title: title.trim(),
        duration: effDuration,
        model,                     // modelo primario (backward compat)
        models: selectedModels,    // array completo de modelos
        audioUrl:            audioUrl     || null,
        audioName:           audioName    || null,
        waveformData:        waveformData || null,
        audioFragmentStart:  fragStart    ?? null,
        audioFragmentEnd:    fragEnd      ?? null,
        audioTotalDuration:  totalAudioDuration || null,
        showHint: forceHint,
        categories: hasInteractivo ? safe : [],
        answers:    {},
        ...(hasCuestionario ? { questions: [] } : {}),
        ...(hasEsquema ? { listenOnly, immediateSchemaFeedback, schemaLevels: [...schemaLevels] } : {}),
        showComposer,
        composerName: activeComposer || null,
      });
      return;
    }

    const patch = { title: title.trim(), duration: effDuration, model, models: selectedModels };
    if (hasInteractivo) {
      const keepIds = new Set(safe.map((m) => m.id));
      const prev    = exercise.answers || {};
      patch.categories = safe;
      patch.modes      = undefined;
      patch.answers    = Object.fromEntries(Object.entries(prev).filter(([id]) => keepIds.has(id)));
      if (forceHint) patch.showHint = true;
    } else {
      patch.categories = [];
      patch.answers    = {};
    }
    patch.audioUrl            = audioUrl     || null;
    patch.audioName           = audioName    || null;
    patch.waveformData        = waveformData || null;
    patch.audioFragmentStart  = fragStart    ?? null;
    patch.audioFragmentEnd    = fragEnd      ?? null;
    patch.audioTotalDuration  = totalAudioDuration || null;
    if (hasEsquema) { patch.listenOnly = listenOnly; patch.immediateSchemaFeedback = immediateSchemaFeedback; patch.schemaLevels = [...schemaLevels]; }
    patch.showComposer = showComposer;
    patch.composerName = activeComposer || null;
    if (!audioName && exercise.audioName) {
      patch.audioUrl = null; patch.audioName = null; patch.waveformData = null;
      patch.audioFragmentStart = null; patch.audioFragmentEnd = null;
    }
    onUpdate(patch);
  };

  // Estado derivado del ejercicio guardado
  const isQuizSaved = !isCreating && modelsOf(exercise).includes("cuestionario");
  const exQs        = isCreating ? [] : questionsOf(exercise);
  const { recorded, total } = (isCreating || isQuizSaved) ? { recorded: 0, total: 0 } : answerStats(exercise);

  return (
    <div style={S.app}>
      <div style={S.page}>
        {/* Cabecera */}
        <div style={{ marginBottom: 20 }}>
          <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: F.sans, fontSize: 13, color: "#888", padding: 0, marginBottom: 14 }}>← Ejercicios</button>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
            <h1 style={{ ...S.h1 }}>{isCreating ? "Nuevo ejercicio" : title || "Sin título"}</h1>
            {(isCreating || isDirty) && (
              <CtaButton onClick={handleSave} disabled={!canSave}>
                {isCreating ? "Crear ejercicio" : "Guardar cambios"}
              </CtaButton>
            )}
          </div>
        </div>

        {/* ══ 1. INFORMACIÓN ══════════════════════════════════════════════════ */}
        <section style={SEC}>
          <p style={{ ...SECTION_STYLE, margin: "0 0 14px" }}>Información</p>

          <label style={S.label}>Nombre del ejercicio</label>
          <input style={{ ...S.input, marginBottom: 14, fontSize: 15, fontWeight: 500 }}
            value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej: Coral nº 4 – Bach" />

          <label style={S.label}>Audio</label>
          {hasExistingAudio ? (
            /* Fila única cuando ya hay audio */
            <div style={{ ...S.row, gap: 8, padding: "8px 10px", background: C.paper2, border: `1px solid ${C.line}`, borderRadius: 8, marginBottom: 4 }}>
              <AudioWaveIcon size={15} color={C.ink2} />
              <span style={{ flex: 1, fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {audioName}
              </span>
              <span style={{ fontSize: 12, color: C.muted, fontFamily: FONT_MONO, flexShrink: 0 }}>
                {fmt(effDuration)}
              </span>
              {audioLibrary.length > 0 && (
                <button type="button" onClick={() => setShowLibraryPicker(true)}
                  style={{ ...S.btn, padding: "3px 10px", fontSize: 12, flexShrink: 0 }}>
                  Cambiar
                </button>
              )}
              <button type="button" onClick={clearAudio}
                style={{ ...S.btnDanger, padding: "3px 10px", fontSize: 12, flexShrink: 0 }}>
                Quitar
              </button>
            </div>
          ) : (
            /* Selección cuando no hay audio: almacén + URL en una fila */
            <div style={{ marginBottom: 4 }}>
              <div style={{ ...S.row, gap: 8, marginBottom: 0 }}>
                {audioLibrary.length > 0 && (
                  <button type="button" onClick={() => setShowLibraryPicker(true)}
                    style={{ ...S.btn, padding: "8px 12px", fontSize: 13, flexShrink: 0, display: "flex", alignItems: "center", gap: 6 }}>
                    <AudioWaveIcon size={13} color="#555" />
                    Almacén
                  </button>
                )}
                <input type="url" style={{ ...S.input, fontSize: 13 }}
                  value={audioUrl || ""} onChange={(e) => handleUrlInput(e.target.value)}
                  placeholder={audioLibrary.length > 0 ? "O pega una URL de audio" : "URL pública de audio"} />
              </div>
              <div style={{ ...S.row, gap: 10, marginTop: 8, flexWrap: "wrap" }}>
                <label style={{ ...S.label, margin: 0, whiteSpace: "nowrap" }}>Sin audio · duración manual (s)</label>
                <input type="number" min={1} style={{ ...S.input, width: 90, flex: "0 0 auto" }}
                  value={manualDuration} onChange={(e) => setManualDuration(e.target.value)} placeholder="30" />
              </div>
            </div>
          )}
          {hasExistingAudio && audioDuration !== null && (
            <p style={{ fontSize: 11, color: C.fnT, margin: "2px 0 0" }}>Duración detectada: {fmt(audioDuration)}</p>
          )}
          {hasExistingAudio && audioDuration === null && (
            <p style={{ fontSize: 11, color: C.muted, margin: "2px 0 0" }}>Duración no detectada — se usará la actual.</p>
          )}

          {/* Fragmento — separado por un divisor interno */}
          {hasExistingAudio && totalAudioDuration && (
            selectedModels.includes("cuestionario") || selectedModels.includes("interactivo")
          ) && (
            <div style={{ borderTop: `1px solid ${C.line}`, marginTop: 14, paddingTop: 14 }}>
              <p style={{ ...SECTION_STYLE, margin: "0 0 10px", display: "flex", alignItems: "center", gap: 8 }}>
                Fragmento
                {fragStart !== null && (
                  <span style={{ fontFamily: FONT_MONO, fontSize: 10, color: C.quiz, fontWeight: 600,
                    textTransform: "none", letterSpacing: 0, background: "rgba(47,111,184,0.1)",
                    padding: "1px 6px", borderRadius: 4 }}>
                    {fmt(fragStart)} – {fmt(fragEnd)}
                  </span>
                )}
              </p>
              <FragmentRangeSelector
                totalDuration={totalAudioDuration}
                start={fragStart}
                end={fragEnd}
                onChange={({ start, end }) => { setFragStart(start); setFragEnd(end); }}
                onClear={() => { setFragStart(null); setFragEnd(null); }}
                onDefine={() => { setFragStart(0); setFragEnd(totalAudioDuration); }}
                audioUrl={audioUrl}
              />
              {fragStart === null && (
                <p style={{ fontSize: 11, color: C.muted, margin: "6px 0 0", lineHeight: 1.5 }}>
                  Escucha el audio y define un fragmento para que el ejercicio use solo ese tramo.
                </p>
              )}
            </div>
          )}
        </section>

        {/* ══ 2. MODELO ═══════════════════════════════════════════════════════ */}
        <section style={SEC}>
          <p style={{ ...SECTION_STYLE, margin: "0 0 14px" }}>Modelo de ejercicio</p>

          {/* Fila 1: modelos individuales */}
          <div style={{ ...S.row, gap: 8, marginBottom: 6 }}>
            {MODEL_COMBOS.slice(0, 3).map((c) => {
              const isActive = comboId === c.id;
              const dotColor = MODEL_META[c.models[0]]?.color || C.muted;
              return (
                <button key={c.id} type="button" onClick={() => setComboId(c.id)} title={c.description}
                  style={{
                    ...S.btn, flex: 1, fontSize: 13, padding: "8px 10px",
                    background: isActive ? C.ink : C.paper2,
                    color:      isActive ? C.paper : C.ink2,
                    border:     `1px solid ${isActive ? C.ink : C.line}`,
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: isActive ? "rgba(255,255,255,0.55)" : dotColor, flexShrink: 0 }} />
                  {c.name}
                </button>
              );
            })}
          </div>
          {/* Fila 2: combos dobles */}
          <div style={{ ...S.row, gap: 8, marginBottom: 10 }}>
            {MODEL_COMBOS.slice(3).map((c) => {
              const isActive = comboId === c.id;
              return (
                <button key={c.id} type="button" onClick={() => setComboId(c.id)} title={c.description}
                  style={{
                    ...S.btn, flex: 1, fontSize: 12, padding: "8px 10px",
                    background: isActive ? C.ink : C.paper2,
                    color:      isActive ? C.paper : C.ink2,
                    border:     `1px solid ${isActive ? C.ink : C.line}`,
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  }}>
                  <span style={{ display: "flex", borderRadius: 999, overflow: "hidden", flexShrink: 0 }}>
                    <span style={{ width: 8, height: 8, background: MODEL_META[c.models[0]]?.color || C.muted }} />
                    <span style={{ width: 8, height: 8, background: MODEL_META[c.models[1]]?.color || C.muted }} />
                  </span>
                  {c.name}
                </button>
              );
            })}
          </div>
          {selectedModels.includes("cuestionario") && (
            <p style={{ fontSize: 11, color: C.quiz, margin: "0 0 4px", padding: "6px 10px", background: "rgba(47,111,184,0.08)", borderRadius: 8 }}>
              {selectedModels.length > 1
                ? "Incluye cuestionario: las preguntas se configuran en la sección de abajo."
                : "Las preguntas se configuran en la sección de abajo."}
            </p>
          )}
          {selectedModels.length > 1 && (
            <p style={{ fontSize: 11, color: C.muted, margin: "4px 0 0", padding: "6px 10px", background: C.paper2, borderRadius: 8, lineHeight: 1.5 }}>
              El alumno podrá alternar entre los dos modos durante la práctica del ejercicio.
            </p>
          )}

          {/* Categorías — solo interactivo */}
          {selectedModels.includes("interactivo") && (
            <div style={{ marginTop: 14, borderTop: `1px solid ${C.line}`, paddingTop: 14 }}>
              <label style={{ ...S.label, marginBottom: 8 }}>Categorías y botones</label>
              <div style={{ background: C.paper2, border: `1px solid ${C.line}`, borderRadius: 10, padding: 8, maxHeight: 300, overflowY: "auto" }}>
                {categories.map((cat) => {
                  const checked  = selectedCategoryIds.has(cat.id);
                  const isLast   = checked && selectedCategoryIds.size === 1;
                  const selBtns  = selectedButtonIds.get(cat.id) || new Set();
                  const allCount = cat.buttons.length;
                  const selCount = checked ? [...cat.buttons].filter((b) => selBtns.has(b.id)).length : 0;
                  return (
                    <div key={cat.id} style={{ marginBottom: checked ? 6 : 2 }}>
                      <label style={{ ...S.row, gap: 10, padding: "6px 8px", borderRadius: 6, cursor: isLast ? "not-allowed" : "pointer", background: checked ? "rgba(26,25,21,0.04)" : "transparent" }}>
                        <input type="checkbox" checked={checked} onChange={() => toggleCategory(cat.id)}
                          style={{ cursor: isLast ? "not-allowed" : "pointer", flexShrink: 0 }} />
                        <span style={{ fontSize: 13, fontWeight: 500, color: checked ? C.ink : C.muted2, flex: 1 }}>{cat.name}</span>
                        <span style={{ fontSize: 11, color: C.muted, fontFamily: FONT_MONO }}>
                          {checked ? `${selCount}/${allCount}` : `${allCount} btn`}
                        </span>
                      </label>
                      {checked && (
                        <div style={{ paddingLeft: 28, paddingBottom: 4, paddingTop: 2, display: "flex", flexDirection: "column", gap: 1 }}>
                          {cat.buttons.map((btn) => {
                            const bChecked = selBtns.has(btn.id);
                            const bIsLast  = bChecked && selCount === 1;
                            return (
                              <label key={btn.id} style={{ ...S.row, gap: 8, padding: "4px 8px", borderRadius: 6, cursor: bIsLast ? "not-allowed" : "pointer", opacity: bChecked ? 1 : 0.45 }}>
                                <input type="checkbox" checked={bChecked} onChange={() => toggleButton(cat.id, btn.id)}
                                  style={{ cursor: bIsLast ? "not-allowed" : "pointer", flexShrink: 0 }} />
                                <span style={{ width: 20, height: 20, borderRadius: "50%", background: btn.color, flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 800, color: "#fff", fontFamily: FONT_MONO }}>{btn.id}</span>
                                <span style={{ fontSize: 13, color: C.ink2 }}>{btn.name}</span>
                                <span style={{ fontSize: 10, color: C.muted, fontFamily: FONT_MONO, marginLeft: "auto" }}>[{btn.key.toUpperCase()}]</span>
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        {/* ══ 3. CLAVE DE CORRECCIÓN (interactivo) ════════════════════════════ */}
        {selectedModels.includes("interactivo") && (
          <section style={SEC}>
            <p style={{ ...SECTION_STYLE, margin: "0 0 14px" }}>Clave de corrección</p>
            {isCreating ? (
              <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.6, margin: 0 }}>
                Crea el ejercicio para poder grabar la clave de corrección.
              </p>
            ) : (
              <>
                <div style={{ marginBottom: 14 }}>
                  {categoriesOf(exercise).map((cat) => {
                    const hasKey = answerFor(exercise, cat.id).length > 0;
                    return (
                      <div key={cat.id} style={{ ...S.row, justifyContent: "space-between", padding: "8px 12px", borderRadius: 8, background: hasKey ? "rgba(63,155,91,0.07)" : C.paper2, border: `1px solid ${hasKey ? "rgba(63,155,91,0.22)" : C.line}`, marginBottom: 6 }}>
                        <span style={{ fontSize: 13, color: C.ink2, fontWeight: 500 }}>{cat.name}</span>
                        <span style={{ ...S.row, gap: 5, fontSize: 12, color: hasKey ? C.fnT : C.muted, fontWeight: 600 }}>
                          <span style={{ width: 7, height: 7, borderRadius: "50%", background: hasKey ? C.fnT : C.muted2, flexShrink: 0 }} />
                          {hasKey ? "Clave grabada" : "Sin clave"}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <button onClick={() => onRecord(exercise)} style={{
                  width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                  background: recorded === 0 ? C.ink : C.paper2,
                  color:      recorded === 0 ? C.paper : C.ink,
                  border:     recorded === 0 ? `1px solid ${C.ink}` : `1.5px solid ${C.line}`,
                  borderRadius: 12, padding: "13px 18px", cursor: "pointer", fontSize: 15, fontWeight: 600,
                }}>
                  <span>{recorded === 0 ? "Grabar clave" : recorded < total ? "Grabar resto" : "Regrabar clave"}</span>
                  <span style={{ fontSize: 18, opacity: 0.55, fontWeight: 300 }}>→</span>
                </button>
              </>
            )}
          </section>
        )}

        {/* ══ 4. ESQUEMA FORMAL ═══════════════════════════════════════════════ */}
        {selectedModels.includes("esquema") && !isCreating && (
          <section style={SEC}>
            <p style={{ ...SECTION_STYLE, margin: "0 0 14px" }}>Esquema formal</p>
            <div style={{ background: `${C.fnD}10`, border: `1px solid ${C.fnD}30`, borderRadius: 10, padding: "10px 14px", marginBottom: 14, fontSize: 13, color: C.ink2, lineHeight: 1.6 }}>
              El alumno dibuja bloques de forma musical sobre una línea de tiempo multinivel. Graba un esquema de referencia para mostrarlo durante la corrección.
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ ...S.label, marginBottom: 8 }}>Niveles que verá el alumno</label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {SCHEMA_LEVELS.map(lv => {
                  const active = schemaLevels.has(lv.id);
                  const isLast = active && schemaLevels.size === 1;
                  return (
                    <button key={lv.id} type="button"
                      onClick={() => !isLast && toggleSchemaLevel(lv.id)}
                      title={isLast ? "Debe haber al menos un nivel activo" : undefined}
                      style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 14px", borderRadius: 9, cursor: isLast ? "not-allowed" : "pointer", border: `1.5px solid ${active ? lv.color : C.line}`, background: active ? lv.color + "18" : C.paper2, transition: "all .12s", opacity: isLast ? 0.6 : 1, fontFamily: FONT_SANS }}>
                      <span style={{ width: 10, height: 10, borderRadius: 2, background: active ? lv.color : C.muted2, flexShrink: 0, transition: "background .12s" }} />
                      <span style={{ fontSize: 12, fontWeight: active ? 600 : 400, color: active ? lv.color : C.muted, transition: "all .12s" }}>{lv.sub}</span>
                      {active && <span style={{ fontSize: 10, color: lv.color, opacity: 0.7, marginLeft: 1 }}>✓</span>}
                    </button>
                  );
                })}
              </div>
              {schemaLevels.size < SCHEMA_LEVELS.length && (
                <p style={{ fontSize: 11, color: C.muted, margin: "6px 0 0" }}>Los niveles desactivados no aparecen al alumno.</p>
              )}
            </div>
            <div style={{ marginBottom: 14, padding: "12px 14px", background: C.paper2, border: `1px solid ${listenOnly ? C.fnD + "55" : C.line}`, borderRadius: 10, transition: "border-color .15s" }}>
              <label style={{ display: "flex", alignItems: "flex-start", gap: 14, cursor: "pointer", userSelect: "none" }}>
                <input type="checkbox" checked={listenOnly} onChange={e => setListenOnly(e.target.checked)}
                  style={{ marginTop: 3, flexShrink: 0, cursor: "pointer" }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.ink, marginBottom: 3 }}>Reproducción sin navegación</div>
                  <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.55 }}>El alumno solo puede dar al play/pausa y a «Empezar de nuevo». No puede saltar en la línea de tiempo.</div>
                </div>
              </label>
            </div>
            <div style={{ marginBottom: 14, padding: "12px 14px", background: C.paper2, border: `1px solid ${immediateSchemaFeedback ? C.quiz + "55" : C.line}`, borderRadius: 10, transition: "border-color .15s" }}>
              <label style={{ display: "flex", alignItems: "flex-start", gap: 14, cursor: "pointer", userSelect: "none" }}>
                <input type="checkbox" checked={immediateSchemaFeedback} onChange={e => setImmediateSchemaFeedback(e.target.checked)}
                  style={{ marginTop: 3, flexShrink: 0, cursor: "pointer" }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.ink, marginBottom: 3 }}>Retroalimentación inmediata</div>
                  <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.55 }}>Al entregar el ejercicio, el alumno verá el esquema de referencia del profesor antes de que corrija manualmente.</div>
                </div>
              </label>
            </div>
            {(() => {
              const key = exercise.schemaKey;
              const hasKey = Array.isArray(key) && key.length > 0;
              const keyLevels = SCHEMA_LEVELS.filter(lv => !exercise.schemaLevels || exercise.schemaLevels.length === 0 || exercise.schemaLevels.includes(lv.id));
              const byLevel = hasKey ? keyLevels.map(lv => ({ lv, blocks: key.filter(b => b.level === lv.id) })).filter(x => x.blocks.length > 0) : [];
              return (
                <div style={{ border: `1px solid ${hasKey ? C.fnT + "55" : C.line}`, borderRadius: 10, padding: "10px 14px", marginBottom: 14, background: hasKey ? `rgba(63,155,91,0.05)` : C.paper2 }}>
                  <div style={{ ...S.row, gap: 8, marginBottom: hasKey ? 10 : 0 }}>
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: hasKey ? C.fnT : C.muted2, flexShrink: 0, display: "inline-block" }} />
                    <span style={{ fontSize: 13, color: hasKey ? C.fnT : C.muted, fontWeight: 600 }}>
                      {hasKey ? `Clave grabada · ${key.length} ${key.length === 1 ? "bloque" : "bloques"}` : "Sin clave de corrección"}
                    </span>
                  </div>
                  {hasKey && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {byLevel.map(({ lv, blocks }) => (
                        <div key={lv.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: lv.color, minWidth: 48, textTransform: "uppercase", letterSpacing: 0.5 }}>{lv.sub}</span>
                          <div style={{ flex: 1, position: "relative", height: 28, background: "rgba(26,25,21,0.05)", borderRadius: 4, overflow: "hidden" }}>
                            {blocks.map((b, i) => {
                              const lPct = (b.start / exercise.duration) * 100;
                              const wPct = Math.max(((b.end - b.start) / exercise.duration) * 100, 0.5);
                              const { bg, textColor } = schemaBlockColor(b, key, exercise.schemaPalette || SCHEMA_PALETTE_DEFAULT);
                              if (lv.id === 3) {
                                return (
                                  <div key={i} style={{ position: "absolute", top: 4, bottom: 4, left: `${lPct}%`, width: `${wPct}%`, display: "flex", alignItems: "center", overflow: "hidden" }}>
                                    <div style={{ background: bg, borderRadius: 999, display: "flex", alignItems: "center", padding: "2px 7px", flexShrink: 0 }}>
                                      <span style={{ fontSize: 9, fontWeight: 700, color: textColor, fontFamily: FONT_SANS, whiteSpace: "nowrap" }}>{b.label}</span>
                                    </div>
                                    {wPct >= 4 && <div style={{ flex: 1, height: 2, background: bg, opacity: 0.5, marginLeft: 3, borderRadius: 1 }} />}
                                  </div>
                                );
                              }
                              if (lv.id === 4) {
                                return (
                                  <div key={i} style={{ position: "absolute", top: 3, bottom: 3, left: `${lPct}%`, width: `${wPct}%`, background: bg, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                                    <span style={{ fontSize: 9, fontWeight: 500, color: textColor, fontFamily: FONT_SANS, whiteSpace: "nowrap", padding: "0 4px", overflow: "hidden", textOverflow: "ellipsis" }}>{b.label}</span>
                                  </div>
                                );
                              }
                              return (
                                <div key={i} style={{ position: "absolute", top: 2, bottom: 2, left: `${lPct}%`, width: `${wPct}%`, background: bg, borderRadius: 3, border: "1px solid rgba(255,255,255,0.22)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                                  <span style={{ fontSize: 9, fontWeight: lv.id === 1 ? 700 : 500, color: textColor, fontFamily: FONT_SANS, whiteSpace: "nowrap", padding: "0 2px", overflow: "hidden", textOverflow: "ellipsis" }}>{b.label}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => onRecord(exercise)} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "space-between", background: !exercise.schemaKey?.length ? C.ink : C.paper2, color: !exercise.schemaKey?.length ? C.paper : C.ink, border: !exercise.schemaKey?.length ? `1px solid ${C.ink}` : `1.5px solid ${C.line}`, borderRadius: 12, padding: "13px 18px", cursor: "pointer", fontSize: 14, fontWeight: 600 }}>
                <span>{exercise.schemaKey?.length ? "Regrabar clave" : "Grabar clave"}</span>
                <span style={{ fontSize: 18, opacity: 0.55, fontWeight: 300 }}>→</span>
              </button>
              {onPreview && (
                <button onClick={() => onPreview(exercise)} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "space-between", background: C.paper2, color: C.ink, border: `1.5px solid ${C.line}`, borderRadius: 12, padding: "13px 18px", cursor: "pointer", fontSize: 14, fontWeight: 600 }}>
                  <span>Probar ejercicio</span>
                  <span style={{ fontSize: 18, opacity: 0.55, fontWeight: 300 }}>›</span>
                </button>
              )}
            </div>
          </section>
        )}

        {/* ══ 5. PREGUNTAS (cuestionario) ══════════════════════════════════════ */}
        {selectedModels.includes("cuestionario") && !isCreating && (
          <section style={SEC}>
            <p style={{ ...SECTION_STYLE, margin: "0 0 14px" }}>Preguntas</p>
            <div style={{ ...S.row, justifyContent: "space-between", padding: "8px 12px", borderRadius: 8, background: exQs.length > 0 ? "rgba(47,111,184,0.07)" : C.paper2, border: `1px solid ${exQs.length > 0 ? "rgba(47,111,184,0.22)" : C.line}`, marginBottom: 14 }}>
              <span style={{ fontSize: 13, color: C.ink2, fontWeight: 500 }}>Preguntas configuradas</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: exQs.length > 0 ? C.quiz : C.muted }}>
                {exQs.length > 0 ? `${exQs.length} ${exQs.length === 1 ? "pregunta" : "preguntas"}` : "Ninguna todavía"}
              </span>
            </div>
            <button onClick={() => (onManageQuestions || onRecord)(exercise)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", background: exQs.length === 0 ? C.ink : C.paper2, color: exQs.length === 0 ? C.paper : C.ink, border: exQs.length === 0 ? `1px solid ${C.ink}` : `1.5px solid ${C.line}`, borderRadius: 12, padding: "13px 18px", cursor: "pointer", fontSize: 15, fontWeight: 600 }}>
              <span>{exQs.length === 0 ? "Crear preguntas" : "Editar preguntas"}</span>
              <span style={{ fontSize: 18, opacity: 0.55, fontWeight: 300 }}>→</span>
            </button>
            {selectedModels.length > 1 && onPreview && (
              <button onClick={() => onPreview(exercise)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", background: "transparent", color: C.ink2, border: `1px solid ${C.line}`, borderRadius: 12, padding: "10px 18px", cursor: "pointer", fontSize: 13, fontWeight: 500, marginTop: 8 }}>
                <span>Probar ejercicio completo</span>
                <span style={{ fontSize: 16, opacity: 0.45, fontWeight: 300 }}>→</span>
              </button>
            )}
          </section>
        )}

        {/* ══ 6. OPCIONES PARA EL ALUMNO ══════════════════════════════════════ */}
        {(!isCreating && selectedModels.includes("interactivo")) || activeComposer ? (
          <section style={SEC}>
            <p style={{ ...SECTION_STYLE, margin: "0 0 14px" }}>Opciones para el alumno</p>
            {!isCreating && selectedModels.includes("interactivo") && (
              <label style={{ display: "flex", alignItems: "flex-start", gap: 14, cursor: "pointer", userSelect: "none", marginBottom: activeComposer ? 14 : 0 }}>
                <input type="checkbox" checked={!!exercise.showHint}
                  onChange={(e) => onUpdate({ showHint: e.target.checked })}
                  style={{ width: 16, height: 16, marginTop: 2, accentColor: C.fnT, flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: C.ink, marginBottom: 3 }}>Mostrar guía de tiempo</div>
                  <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5 }}>Muestra los bloques de función como barras apagadas — una pista sin revelar la solución.</div>
                </div>
              </label>
            )}
            {activeComposer && (
              <label style={{ display: "flex", alignItems: "flex-start", gap: 14, cursor: "pointer", userSelect: "none" }}>
                <input type="checkbox" checked={showComposer}
                  onChange={(e) => setShowComposer(e.target.checked)}
                  style={{ width: 16, height: 16, marginTop: 2, accentColor: C.fnT, flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: C.ink, marginBottom: 3 }}>Mostrar nombre del compositor</div>
                  <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5 }}>
                    Muestra <em style={{ fontStyle: "normal", color: C.fnS }}>{activeComposer}</em> debajo del título en la vista del alumno.
                  </div>
                </div>
              </label>
            )}
          </section>
        ) : null}

        {/* Zona de peligro */}
        {!isCreating && (
          <div style={{ marginTop: 8, textAlign: "center" }}>
            <button onClick={() => setShowConfirmDel(true)} style={{ ...S.btnDanger, padding: "8px 20px", fontSize: 12 }}>
              Eliminar ejercicio
            </button>
          </div>
        )}
      </div>

      {showConfirmDel && (
        <ConfirmModal
          message={`¿Eliminar el ejercicio "${exercise?.title}"?\n\nSe perderán también las respuestas guardadas de los alumnos.`}
          onConfirm={onDelete}
          onCancel={() => setShowConfirmDel(false)} />
      )}
      {showLibraryPicker && (
        <AudioLibraryPickerModal
          library={audioLibrary}
          onPick={handlePickFromLibrary}
          onClose={() => setShowLibraryPicker(false)} />
      )}
    </div>
  );
}

// ═══ 13. QUESTION MANAGER VIEW (profesor edita preguntas) ═══════════════════
function QuestionManagerView({ exercise, onSave, onBack }) {
  const dur = exercise.duration;
  const [questions,   setQuestions]   = useState(questionsOf(exercise));
  const [editingQ,    setEditingQ]    = useState(null);
  const [confirmDel,  setConfirmDel]  = useState(null);
  const [selectedQId, setSelectedQId] = useState(null);
  const minimapRef = useRef(null);

  // QMV usa exercise.waveformData directamente — sin callback de onWaveform
  const {
    time, playing, audioReady, audioError, hasAudio,
    togglePlay, seekTo, scrubBegin, scrubTo, scrubEnd, audioDuration,
  } = useAudioPlayer(exercise);

  // Espacio = Play/Pausa (excepto si hay un input/textarea/button con foco)
  const togglePlayRef = useRef(togglePlay);
  useEffect(() => { togglePlayRef.current = togglePlay; });
  useEffect(() => {
    const down = (e) => {
      if (e.key === " " && !["INPUT", "TEXTAREA", "BUTTON"].includes(e.target.tagName)) {
        e.preventDefault();
        togglePlayRef.current();
      }
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, []);

  // Drag del cuerpo de una pregunta en el minimapa
  const beginDragQBody = (e, qId) => {
    e.stopPropagation();
    const el = minimapRef.current;
    if (!el) return;
    const rect  = el.getBoundingClientRect();
    const origQ = questions.find((q) => q.id === qId);
    if (!origQ) return;
    const len = origQ.audioEnd - origQ.audioStart;
    let startX = 0, moved = false;
    startPointerDrag(e, {
      onStart: (ev, getX) => { startX = getX(ev); setSelectedQId(qId); },
      onMove:  (ev, getX) => {
        const cx = getX(ev);
        if (!moved && Math.abs(cx - startX) > 3) moved = true;
        if (!moved) return;
        const ns = Math.max(0, Math.min(dur - len, origQ.audioStart + ((cx - startX) / rect.width) * dur));
        const s = parseFloat(ns.toFixed(2)), f = parseFloat((ns + len).toFixed(2));
        setQuestions((prev) => prev.map((q) => q.id === qId ? { ...q, audioStart: s, audioEnd: f } : q));
      },
      onEnd: () => { if (!moved) seekTo(origQ.audioStart); },
    });
  };

  // Drag de los bordes de una pregunta (resize)
  const beginDragQEdge = (e, qId, which) => {
    e.stopPropagation();
    const el = minimapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const xToTime = (x) => Math.max(0, Math.min(dur, ((x - rect.left) / rect.width) * dur));
    const origQ = questions.find((q) => q.id === qId);
    if (!origQ) return;
    setSelectedQId(qId);
    startPointerDrag(e, {
      onMove: (ev, getX) => {
        const t = xToTime(getX(ev));
        const updated = which === "start"
          ? { ...origQ, audioStart: parseFloat(Math.min(origQ.audioEnd - 0.5, Math.max(0, t)).toFixed(2)) }
          : { ...origQ, audioEnd:   parseFloat(Math.max(origQ.audioStart + 0.5, Math.min(dur, t)).toFixed(2)) };
        setQuestions((prev) => prev.map((q) => q.id === qId ? updated : q));
      },
    });
  };

  return (
    <div style={S.app}>
      <div style={S.page}>
        <div style={{ ...S.row, justifyContent: "space-between", marginBottom: 18 }}>
          <button onClick={onBack} style={{ ...S.btn, padding: "6px 14px", fontSize: 13 }}>← Volver</button>
          <div style={{ fontWeight: 600, color: C.ink, fontSize: 15, textAlign: "center", flex: 1 }}>{exercise.title} — Preguntas</div>
          <button onClick={() => onSave(questions)} style={S.btnPrimary}>Guardar</button>
        </div>

        <section style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 18, padding: "14px 14px 12px", marginBottom: 20 }}>
          {hasAudio && !audioReady && !audioError && <div style={{ textAlign: "center", color: C.muted, fontSize: 12, marginBottom: 8 }}>Cargando audio…</div>}
          {audioError && <div style={{ textAlign: "center", color: C.danger, fontSize: 12, marginBottom: 8 }}>{audioError}</div>}

          <div style={{ background: C.paper2, borderRadius: 10, overflow: "hidden", border: `1px solid ${C.line}`, marginBottom: 6 }}>
            {(() => {
              const selQ    = questions.find((q) => q.id === selectedQId);
              const qRegion = selQ ? { start: selQ.audioStart, end: selQ.audioEnd, color: C.quiz } : null;
              return (
                <WaveformDisplay time={time} duration={dur} waveformDuration={audioDuration} allIntervals={[]}
                  exerciseId={exercise.id} waveformData={exercise.waveformData || null}
                  colorByFn={{}} questionRegion={qRegion}
                  onScrubBegin={scrubBegin} onScrubTo={scrubTo} onScrubEnd={scrubEnd} />
              );
            })()}
          </div>

          {/* Minimapa de preguntas (draggable) */}
          <div ref={minimapRef} onMouseDown={() => setSelectedQId(null)}
            style={{ position: "relative", height: 36, marginBottom: 4, background: C.paper2, borderRadius: 6, border: `1px solid ${C.line}`, overflow: "hidden", touchAction: "none", userSelect: "none", cursor: "default" }}>
            {questions.map((q, idx) => {
              const isSel  = selectedQId === q.id;
              const qLeft  = `${(q.audioStart / dur) * 100}%`;
              const qWidth = `${Math.max(0, (q.audioEnd - q.audioStart) / dur) * 100}%`;
              return (
                <div key={q.id}
                  onMouseDown ={(e) => beginDragQBody(e, q.id)}
                  onTouchStart={(e) => beginDragQBody(e, q.id)}
                  title={`P${idx + 1}: ${fmt(q.audioStart)} – ${fmt(q.audioEnd)}`}
                  style={{
                    position: "absolute", top: 3, bottom: 3, left: qLeft, width: qWidth,
                    background: C.quiz, opacity: isSel ? 1 : 0.7,
                    borderRadius: 3, cursor: "grab",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    border: isSel ? `1.5px solid rgba(255,255,255,0.85)` : "none",
                    boxSizing: "border-box", overflow: "hidden", zIndex: isSel ? 2 : 1,
                  }}>
                  <div onMouseDown ={(e) => { e.stopPropagation(); beginDragQEdge(e, q.id, "start"); }}
                       onTouchStart={(e) => { e.stopPropagation(); beginDragQEdge(e, q.id, "start"); }}
                       style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 10, cursor: "ew-resize", zIndex: 3, background: isSel ? "rgba(255,255,255,0.22)" : "transparent" }} />
                  <span style={{ fontSize: 8, color: C.paper, fontWeight: 700, fontFamily: FONT_MONO, pointerEvents: "none", padding: "0 12px", overflow: "hidden", whiteSpace: "nowrap" }}>P{idx + 1}</span>
                  <div onMouseDown ={(e) => { e.stopPropagation(); beginDragQEdge(e, q.id, "end"); }}
                       onTouchStart={(e) => { e.stopPropagation(); beginDragQEdge(e, q.id, "end"); }}
                       style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 10, cursor: "ew-resize", zIndex: 3, background: isSel ? "rgba(255,255,255,0.22)" : "transparent" }} />
                </div>
              );
            })}
            <div style={{ position: "absolute", top: 0, bottom: 0, left: `${(time / dur) * 100}%`, width: 2, background: C.ink, opacity: 0.75, pointerEvents: "none", zIndex: 5 }} />
          </div>

          {selectedQId && (() => {
            const selQ   = questions.find((q) => q.id === selectedQId);
            const selIdx = questions.findIndex((q) => q.id === selectedQId);
            if (!selQ) return null;
            return (
              <div onMouseDown={(e) => e.stopPropagation()}
                style={{ ...S.row, gap: 8, flexWrap: "wrap", alignItems: "center", padding: "5px 4px", marginBottom: 6, fontSize: 11 }}>
                <span style={{ fontFamily: FONT_MONO, fontWeight: 700, color: C.quiz }}>P{selIdx + 1}</span>
                <span style={{ fontFamily: FONT_MONO, color: C.ink2 }}>{fmt(selQ.audioStart)} → {fmt(selQ.audioEnd)}</span>
                <span style={{ ...S.badge, background: "rgba(47,111,184,0.10)", color: C.quiz }}>{fmt(selQ.audioEnd - selQ.audioStart)}</span>
                <span style={{ color: C.muted, fontSize: 10, flex: "1 1 160px" }}>Arrastra el bloque para mover · arrastra los bordes para ajustar</span>
                <button onClick={() => { setEditingQ(selQ); setSelectedQId(null); }} style={{ ...S.btn, padding: "3px 10px", fontSize: 11 }}>Editar contenido</button>
              </div>
            );
          })()}

          <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 12 }}>
            <div />
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <CircleButton onClick={() => seekTo(Math.max(0, time - 5))} size={36} fontSize={10}>−5s</CircleButton>
              <CircleButton onClick={togglePlay} disabled={hasAudio && !audioReady && !audioError}
                primary size={42} fontSize={14}>{playing ? "❚❚" : "▶"}</CircleButton>
              <CircleButton onClick={() => seekTo(Math.min(dur, time + 5))} size={36} fontSize={10}>+5s</CircleButton>
            </div>
            <div style={{ textAlign: "right", fontFamily: FONT_MONO, fontVariantNumeric: "tabular-nums", fontSize: 18, fontWeight: 600, color: C.ink }}>
              {fmt(time)}<span style={{ color: C.muted2, fontWeight: 400 }}>/{fmt(dur)}</span>
            </div>
          </div>
        </section>

        <div style={{ ...S.row, justifyContent: "space-between", marginBottom: 8 }}>
          <h2 style={{ ...S.h2, margin: 0 }}>Preguntas ({questions.length})</h2>
          {/* BUG FIX: el original usaba timeRef.current (undefined en este componente).
              Ahora se pasa `time` directamente, que ya está disponible del hook. */}
          <button onClick={() => setEditingQ({ _new: true, defaultStart: time })} style={S.btnPrimary}>
            + Añadir aquí
          </button>
        </div>
        <p style={{ color: C.muted, fontSize: 12, margin: "0 0 14px" }}>
          Sitúate en el punto del audio deseado y pulsa "+ Añadir aquí" para usar ese instante como inicio sugerido del fragmento.
        </p>

        {questions.length === 0 && (
          <div style={{ ...S.card, textAlign: "center", color: C.muted, padding: "2rem" }}>
            Aún no hay preguntas. Crea la primera con el botón de arriba.
          </div>
        )}

        {questions.map((q, idx) => (
          <div key={q.id} style={S.card}>
            <div style={{ ...S.row, justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                <div style={{ ...S.row, gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                  <span style={{ ...S.badge, background: C.line, color: C.muted }}>P{idx + 1}</span>
                  <span style={{ ...S.badge, background: q.type === "test" ? "rgba(63,155,91,0.12)" : "rgba(47,111,184,0.12)", color: q.type === "test" ? C.fnT : C.quiz }}>{q.type === "test" ? "Test" : "Desarrollo"}</span>
                  <span style={{ ...S.badge, background: C.paper2, color: C.muted, fontFamily: FONT_MONO }}>{fmt(q.audioStart)} – {fmt(q.audioEnd)}</span>
                </div>
                <div style={{ fontSize: 14, color: C.ink, marginBottom: q.type === "test" ? 6 : 0 }}>{q.text}</div>
                {q.type === "test" && (
                  <div style={{ ...S.row, gap: 6, flexWrap: "wrap" }}>
                    {q.options.map((opt) => (
                      <span key={opt.id} style={{
                        ...S.badge, fontSize: 11,
                        background: opt.id === q.correctOptionId ? "rgba(63,155,91,0.14)" : C.paper2,
                        color:      opt.id === q.correctOptionId ? C.fnT : C.muted,
                        border:     opt.id === q.correctOptionId ? `1px solid ${C.fnT}` : `1px solid transparent`,
                      }}>
                        {opt.id}) {opt.text}{opt.id === q.correctOptionId ? " ✓" : ""}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ ...S.row, gap: 6 }}>
                <button onClick={() => seekTo(q.audioStart)} style={{ ...S.btn, padding: "6px 10px", fontSize: 12 }} title={`Ir a ${fmt(q.audioStart)}`}>▶ {fmt(q.audioStart)}</button>
                <button onClick={() => setEditingQ(q)} style={S.btn}>Editar</button>
                <button onClick={() => setConfirmDel({ id: q.id, text: q.text })} style={S.btnDanger}>Eliminar</button>
              </div>
            </div>
          </div>
        ))}

        <button onClick={() => onSave(questions)} style={{ ...S.btnPrimary, width: "100%", marginTop: 8, padding: 14, borderRadius: 12 }}>
          Guardar preguntas
        </button>
      </div>

      {editingQ && (
        <QuestionEditorModal
          initial={editingQ._new ? null : editingQ}
          defaultStart={editingQ._new ? editingQ.defaultStart : undefined}
          audioDuration={dur}
          onSave={(q) => {
            if (editingQ._new) setQuestions((prev) => [...prev, q]);
            else               setQuestions((prev) => prev.map((x) => x.id === q.id ? q : x));
            setEditingQ(null);
          }}
          onClose={() => setEditingQ(null)} />
      )}
      {confirmDel && (
        <ConfirmModal
          message={`¿Eliminar la pregunta "${confirmDel.text.slice(0, 60)}${confirmDel.text.length > 60 ? "…" : ""}"?`}
          onConfirm={() => { setQuestions((prev) => prev.filter((x) => x.id !== confirmDel.id)); setConfirmDel(null); }}
          onCancel={() => setConfirmDel(null)} />
      )}
    </div>
  );
}

// ═══ 14. MODALES ═══════════════════════════════════════════════════════════

// Editor de categoría (nuevo o existente)
function CategoryEditorModal({ initialCategory, onSave, onClose }) {
  const isNew = !initialCategory;
  const [name,    setName]    = useState(initialCategory?.name || "");
  const [hasFigures, setHasFigures] = useState(initialCategory?.hasFigures ?? false);
  const [buttons, setButtons] = useState(initialCategory?.buttons || [
    { id: "A", name: "Botón A", color: CATEGORY_COLORS[0], key: KEY_SEQUENCE[0] },
    { id: "B", name: "Botón B", color: CATEGORY_COLORS[1], key: KEY_SEQUENCE[1] },
  ]);
  const maxBtns = hasFigures ? 8 : 6;

  const updateBtn = (i, patch) => setButtons((prev) => prev.map((b, idx) => idx === i ? { ...b, ...patch } : b));
  const addBtn = () => {
    if (buttons.length >= maxBtns) return;
    const i = buttons.length;
    setButtons((prev) => [...prev, {
      id: String.fromCharCode(65 + i),
      name: `Botón ${String.fromCharCode(65 + i)}`,
      color: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
      key:   KEY_SEQUENCE[i % KEY_SEQUENCE.length],
    }]);
  };
  const removeBtn = (i) => { if (buttons.length > 2) setButtons((prev) => prev.filter((_, idx) => idx !== i)); };

  const canSave = name.trim() && buttons.length >= 2 && buttons.every((b) => b.id.trim() && b.name.trim() && b.key.trim().length === 1);

  const handleSave = () => {
    if (!canSave) return;
    onSave({
      id:      initialCategory?.id || uid("cat"),
      name:    name.trim(),
      builtIn: initialCategory?.builtIn ?? false,
      global:  initialCategory?.global  ?? false,
      hasFigures,
      buttons: buttons.map((b) => ({ ...b, id: b.id.trim().toUpperCase(), name: b.name.trim(), key: b.key.trim().toLowerCase() })),
    });
  };

  return (
    <ModalShell width={520} align="top">
      <h3 style={{ margin: "0 0 18px", fontSize: 16, fontWeight: 600, color: C.ink }}>
        {isNew ? "Nueva categoría" : "Editar categoría"}
      </h3>

      <label style={S.label}>Nombre de la categoría</label>
      <input style={{ ...S.input, marginBottom: 14 }} value={name}
        onChange={(e) => setName(e.target.value)} placeholder="Ej: Cadencias" autoFocus />

      <label className="fa-pressable" style={{ display: "flex", alignItems: "flex-start", gap: 9, cursor: "pointer", marginBottom: 18, padding: "9px 11px", borderRadius: 8, border: `1px solid ${hasFigures ? C.ink : C.line}`, background: hasFigures ? `${C.ink}08` : C.paper2 }}>
        <input type="checkbox" checked={hasFigures} onChange={(e) => setHasFigures(e.target.checked)} style={{ marginTop: 1, flexShrink: 0 }} />
        <span style={{ minWidth: 0 }}>
          <span style={{ display: "block", fontSize: 13, fontWeight: 600, color: C.ink }}>Grados con cifrado / inversiones</span>
          <span style={{ display: "block", fontSize: 11.5, color: C.muted, lineHeight: 1.4, marginTop: 2 }}>
            Los botones son grados (I, II, V…) y el alumno puede asignar el cifrado de bajo (6, ⁶₄, 7, ⁶₅…) a cada fragmento al seleccionarlo.
          </span>
        </span>
      </label>

      <label style={S.label}>{hasFigures ? "Grados" : "Botones"} ({buttons.length}/{maxBtns})</label>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
        {buttons.map((b, i) => (
          <div key={i} style={{ ...S.row, gap: 8, background: C.paper2, padding: "8px 10px", borderRadius: 8 }}>
            <input type="color" value={b.color} onChange={(e) => updateBtn(i, { color: e.target.value })}
              style={{ width: 36, height: 32, border: `1px solid ${C.line}`, borderRadius: 6, cursor: "pointer", padding: 0, background: "transparent", flexShrink: 0 }} />
            <input value={b.id} onChange={(e) => updateBtn(i, { id: e.target.value.slice(0, 4) })}
              style={{ ...S.input, width: 50, fontFamily: FONT_MONO, fontWeight: 700, textAlign: "center", padding: "6px 4px", flexShrink: 0 }}
              maxLength={4} placeholder="ID" />
            <input value={b.name} onChange={(e) => updateBtn(i, { name: e.target.value })}
              style={{ ...S.input, flex: 1, padding: "6px 10px", minWidth: 0 }} placeholder="Nombre" />
            <input value={b.key} onChange={(e) => updateBtn(i, { key: e.target.value.slice(0, 1) })}
              style={{ ...S.input, width: 36, fontFamily: FONT_MONO, textAlign: "center", padding: "6px 4px", flexShrink: 0 }}
              maxLength={1} placeholder="t" />
            <button onClick={() => removeBtn(i)} disabled={buttons.length <= 2}
              style={{ ...S.btnDanger, padding: "4px 8px", fontSize: 11, ...disabledStyle(buttons.length > 2), flexShrink: 0 }}>×</button>
          </div>
        ))}
      </div>

      <button onClick={addBtn} disabled={buttons.length >= maxBtns}
        style={{ ...S.btn, width: "100%", marginBottom: 18, ...disabledStyle(buttons.length < maxBtns) }}>
        + Añadir {hasFigures ? "grado" : "botón"}
      </button>

      <ModalFooter onCancel={onClose} onSave={handleSave} canSave={canSave} saveLabel={isNew ? "Crear" : "Guardar"} />
    </ModalShell>
  );
}

// Formulario de curso
function GroupEditorModal({ initial, students, currentUserId, onSave, onClose }) {
  const [name,       setName]       = useState(initial?.name || "");
  const [studentIds, setStudentIds] = useState(() => new Set(initial?.studentIds || []));

  const toggleStudent = (id) => setStudentIds((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const canSave = name.trim().length > 0;

  const handleSave = () => {
    if (!canSave) return;
    onSave({
      id:         initial?.id || uid("group"),
      name:       name.trim(),
      teacherId:  currentUserId,
      studentIds: [...studentIds],
      createdAt:  initial?.createdAt || Date.now(),
    });
  };

  return (
    <ModalShell width={480} align="top">
      <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 600, color: C.ink }}>
        {initial ? "Editar grupo" : "Nuevo grupo"}
      </h3>

      <label style={S.label}>Nombre del grupo</label>
      <input style={{ ...S.input, marginBottom: 18 }} value={name} autoFocus
        onChange={(e) => setName(e.target.value)} placeholder="Ej: Grupo A, 2º Bachillerato…" />

      {students.length > 0 && (
        <>
          <label style={{ ...S.label, marginBottom: 8 }}>Alumnos del grupo</label>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 18, maxHeight: 240, overflowY: "auto", border: `1px solid ${C.line}`, borderRadius: 8, padding: "8px 12px" }}>
            {students.map((s) => (
              <label key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontFamily: FONT_SANS, fontSize: 13, color: C.ink }}>
                <input type="checkbox" checked={studentIds.has(s.id)} onChange={() => toggleStudent(s.id)}
                  style={{ accentColor: C.ink, width: 15, height: 15, cursor: "pointer" }} />
                <span style={{ flex: 1 }}>{s.displayName}</span>
                <span style={{ color: C.muted, fontSize: 11, fontFamily: FONT_MONO }}>@{s.username}</span>
              </label>
            ))}
          </div>
        </>
      )}

      <ModalFooter onCancel={onClose} onSave={handleSave} canSave={canSave} saveLabel={initial ? "Guardar" : "Crear grupo"} />
    </ModalShell>
  );
}

function CourseFormModal({ initial, groups = [], onSave, onClose }) {
  const [name,              setName]              = useState(initial?.name || "");
  const [desc,              setDesc]              = useState(initial?.description || "");
  const [visibility,        setVisibility]        = useState(initial?.visibility || "teacher");
  const [visibilityGroupId, setVisibilityGroupId] = useState(initial?.visibilityGroupId || "");

  const canSave = name.trim().length > 0 && (visibility !== "group" || visibilityGroupId !== "");

  const handleSave = () => {
    if (!canSave) return;
    onSave({
      id:                initial?.id || uid("course"),
      name:              name.trim(),
      description:       desc.trim(),
      unitIds:           initial?.unitIds || [],
      visibility,
      visibilityGroupId: visibility === "group" ? visibilityGroupId : null,
      createdAt:         initial?.createdAt || Date.now(),
    });
  };

  const VIS_OPTIONS = [
    { id: "teacher", label: "Mis alumnos",      desc: "Solo los alumnos asignados a ti" },
    { id: "public",  label: "Público",           desc: "Todos los alumnos de la aplicación" },
    { id: "group",   label: "Grupo específico",  desc: "Solo los alumnos de un grupo" },
  ];

  return (
    <ModalShell width={480}>
      <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 600, color: C.ink }}>{initial ? "Editar curso" : "Nuevo curso"}</h3>

      <label style={S.label}>Nombre del curso</label>
      <input style={{ ...S.input, marginBottom: 14 }} value={name} autoFocus
        onChange={(e) => setName(e.target.value)} placeholder="Ej: 2º Bachillerato — Armonía" />

      <label style={S.label}>Descripción (opcional)</label>
      <textarea style={{ ...S.input, marginBottom: 18, minHeight: 60, resize: "vertical", fontFamily: FONT_SANS }}
        value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Breve descripción del curso…" />

      <label style={{ ...S.label, marginBottom: 8 }}>Visibilidad</label>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: visibility === "group" ? 10 : 20 }}>
        {VIS_OPTIONS.map((opt) => (
          <label key={opt.id} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", padding: "9px 12px", borderRadius: 8, border: `1.5px solid ${visibility === opt.id ? C.ink : C.line}`, background: visibility === opt.id ? C.paper2 : "transparent", fontFamily: FONT_SANS }}>
            <input type="radio" name="visibility" value={opt.id} checked={visibility === opt.id} onChange={() => setVisibility(opt.id)}
              style={{ accentColor: C.ink, width: 15, height: 15, cursor: "pointer", flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{opt.label}</div>
              <div style={{ fontSize: 11, color: C.muted }}>{opt.desc}</div>
            </div>
          </label>
        ))}
      </div>

      {visibility === "group" && (
        <div style={{ marginBottom: 18 }}>
          {groups.length === 0
            ? <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>Aún no tienes grupos. Créalos desde la pestaña Alumnos.</p>
            : <select value={visibilityGroupId} onChange={(e) => setVisibilityGroupId(e.target.value)}
                style={{ ...S.input, cursor: "pointer" }}>
                <option value="">— Selecciona un grupo —</option>
                {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
          }
        </div>
      )}

      <ModalFooter onCancel={onClose} onSave={handleSave} canSave={canSave} saveLabel={initial ? "Guardar" : "Crear"} />
    </ModalShell>
  );
}

// Formulario de unidad
function UnitFormModal({ initial, onSave, onClose }) {
  const [name, setName] = useState(initial?.name || "");
  const [desc, setDesc] = useState(initial?.description || "");
  const canSave = name.trim().length > 0;

  const handleSave = () => {
    if (!canSave) return;
    onSave({
      id:          initial?.id || uid("unit"),
      name:        name.trim(),
      description: desc.trim(),
      exerciseIds: initial?.exerciseIds || [],
      createdAt:   initial?.createdAt || Date.now(),
    });
  };

  return (
    <ModalShell width={440}>
      <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 600, color: C.ink }}>{initial ? "Editar unidad" : "Nueva unidad didáctica"}</h3>
      <label style={S.label}>Nombre de la unidad</label>
      <input style={{ ...S.input, marginBottom: 14 }} value={name} autoFocus
        onChange={(e) => setName(e.target.value)} placeholder="Ej: Tema 3 — Cadencias" />
      <label style={S.label}>Descripción (opcional)</label>
      <textarea style={{ ...S.input, marginBottom: 18, minHeight: 60, resize: "vertical", fontFamily: FONT_SANS }}
        value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Objetivos y contenido…" />
      <ModalFooter onCancel={onClose} onSave={handleSave} canSave={canSave} saveLabel={initial ? "Guardar" : "Crear"} />
    </ModalShell>
  );
}

// Picker de ejercicios del banco (para asignar a una unidad)
function ExercisePickerModal({ exercises, alreadyInUnit, onAdd, onClose }) {
  const [selected, setSelected] = useState(new Set());
  const inUnit    = new Set(alreadyInUnit);
  const available = exercises.filter((e) => !inUnit.has(e.id));
  const toggle    = (id) => setSelected((s) => toggleInSet(s, id));

  return (
    <ModalShell width={520} align="top">
      <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 600, color: C.ink }}>Añadir ejercicios desde el banco</h3>

      {available.length === 0 ? (
        <p style={{ color: C.muted, textAlign: "center", padding: "1.5rem 0", fontSize: 13 }}>
          {exercises.length === 0
            ? "Aún no hay ejercicios en el banco. Crea uno desde la pestaña Ejercicios."
            : "Todos los ejercicios del banco ya están en esta unidad."}
        </p>
      ) : (
        <div style={{ maxHeight: 380, overflowY: "auto", border: `1px solid ${C.line}`, borderRadius: 8, padding: 6, marginBottom: 16 }}>
          {available.map((ex) => {
            const isSel = selected.has(ex.id);
            return (
              <label key={ex.id}
                style={{ ...S.row, gap: 10, padding: "10px 12px", borderRadius: 6, cursor: "pointer", background: isSel ? "rgba(26,25,21,0.04)" : "transparent" }}>
                <input type="checkbox" checked={isSel} onChange={() => toggle(ex.id)} style={{ cursor: "pointer", flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 4 }}>{ex.title}</div>
                  <div style={{ ...S.row, gap: 6 }}>
                    <span style={{ ...S.badge, background: C.line, color: C.muted, fontFamily: FONT_MONO }}>{fmt(ex.duration)}</span>
                    {(() => {
                      const isQuiz = modelOf(ex) === "cuestionario";
                      return <span style={{ ...S.badge, background: isQuiz ? "rgba(47,111,184,0.10)" : "rgba(63,155,91,0.08)", color: isQuiz ? C.quiz : C.fnT }}>{isQuiz ? "Cuestionario" : "Interactivo"}</span>;
                    })()}
                  </div>
                </div>
              </label>
            );
          })}
        </div>
      )}

      <ModalFooter onCancel={onClose} onSave={() => onAdd([...selected])} canSave={selected.size > 0}
        saveLabel={<>Añadir {selected.size > 0 && `(${selected.size})`}</>} />
    </ModalShell>
  );
}

// Crear un alumno o profesor con credencial PIN o contraseña
function AddUserModal({ forRole, currentUserId, existingUsernames, onSave, onClose }) {
  const [displayName, setDisplayName] = useState("");
  const [username,    setUsername]    = useState("");
  const [credType,    setCredType]    = useState(forRole === "student" ? "pin" : "password");
  const [credValue,   setCredValue]   = useState("");
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState("");

  const isPin   = credType === "pin";
  const minLen  = isPin ? 4 : 6;
  const taken   = username.trim() && existingUsernames.includes(username.trim().toLowerCase());
  const canSave = displayName.trim() && username.trim() && credValue.length >= minLen && !taken && !loading;

  const handleSave = async () => {
    if (!canSave) return;
    setLoading(true); setError("");
    try {
      const salt = generateSalt();
      const hash = await hashCredential(credValue, salt);
      onSave({
        id:           uid(forRole),
        username:     username.trim().toLowerCase(),
        displayName:  displayName.trim(),
        role:         forRole,
        credType,
        passwordHash: hash,
        salt,
        ...(forRole === "student" ? { teacherId: currentUserId } : {}),
        createdBy:    currentUserId,
        createdAt:    Date.now(),
      });
    } catch { setError("Error al crear la cuenta."); }
    finally  { setLoading(false); }
  };

  const roleLabel = forRole === "teacher" ? "profesor" : "alumno";

  return (
    <ModalShell width={420}>
      <h3 style={{ margin: "0 0 18px", fontSize: 16, fontWeight: 600, color: C.ink }}>Crear cuenta de {roleLabel}</h3>

      <label style={S.label}>Nombre visible</label>
      <input style={{ ...S.input, marginBottom: 14 }} value={displayName} autoFocus
        onChange={(e) => setDisplayName(e.target.value)} placeholder={`Ej: ${forRole === "teacher" ? "Prof. García" : "Juan García"}`} />

      <label style={S.label}>Nombre de usuario</label>
      <input style={{ ...S.input, marginBottom: taken ? 4 : 14, borderColor: taken ? C.danger : undefined }}
        autoComplete="off"
        value={username} onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s/g, ""))}
        placeholder="usuario.unico" />
      {taken && <ErrorMsg style={{ marginBottom: 14 }}>Este nombre de usuario ya existe</ErrorMsg>}

      <label style={S.label}>Tipo de credencial</label>
      <div style={{ ...S.row, gap: 8, marginBottom: 14 }}>
        {[{ id: "pin", label: "PIN (4-6 dígitos)" }, { id: "password", label: "Contraseña" }].map((opt) => (
          <button key={opt.id} type="button" onClick={() => { setCredType(opt.id); setCredValue(""); }}
            style={{
              ...S.btn, flex: 1, fontSize: 12,
              background: credType === opt.id ? C.ink   : C.paper,
              color:      credType === opt.id ? C.paper : C.ink2,
              border:     `1px solid ${credType === opt.id ? C.ink : C.line}`,
            }}>
            {opt.label}
          </button>
        ))}
      </div>

      <label style={S.label}>{isPin ? "PIN inicial" : "Contraseña inicial"} (mín. {minLen} caracteres)</label>
      <CredentialInput
        kind={isPin ? "pin" : "password"}
        value={credValue}
        onChange={setCredValue}
        marginBottom={22}
        onSubmit={handleSave}
      />

      <ErrorMsg style={{ marginTop: -14, marginBottom: 14 }}>{error}</ErrorMsg>

      <ModalFooter onCancel={onClose} onSave={handleSave} canSave={canSave} saveLabel={loading ? "Creando…" : "Crear cuenta"} />
    </ModalShell>
  );
}

// Resetear PIN/contraseña de un usuario existente
function ResetCredentialModal({ targetUser, onSave, onClose }) {
  const [credType,  setCredType]  = useState(targetUser.credType || "pin");
  const [credValue, setCredValue] = useState("");
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState("");
  const isPin   = credType === "pin";
  const minLen  = isPin ? 4 : 6;
  const canSave = credValue.length >= minLen && !loading;

  const handleSave = async () => {
    if (!canSave) return;
    setLoading(true); setError("");
    try {
      const salt = generateSalt();
      const hash = await hashCredential(credValue, salt);
      onSave({ ...targetUser, credType, passwordHash: hash, salt });
    } catch { setError("Error al actualizar la credencial."); }
    finally  { setLoading(false); }
  };

  return (
    <ModalShell width={420}>
      <h3 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 600, color: C.ink }}>Resetear acceso</h3>
      <p style={{ color: C.muted, fontSize: 13, margin: "0 0 18px" }}>
        Usuario: <strong style={{ color: C.ink }}>{targetUser.displayName}</strong>
      </p>

      <label style={S.label}>Tipo de credencial</label>
      <div style={{ ...S.row, gap: 8, marginBottom: 14 }}>
        {[{ id: "pin", label: "PIN" }, { id: "password", label: "Contraseña" }].map((opt) => (
          <button key={opt.id} type="button" onClick={() => { setCredType(opt.id); setCredValue(""); }}
            style={{
              ...S.btn, flex: 1, fontSize: 12,
              background: credType === opt.id ? C.ink   : C.paper,
              color:      credType === opt.id ? C.paper : C.ink2,
              border:     `1px solid ${credType === opt.id ? C.ink : C.line}`,
            }}>
            {opt.label}
          </button>
        ))}
      </div>

      <label style={S.label}>Nuevo {isPin ? "PIN" : "contraseña"} (mín. {minLen})</label>
      <CredentialInput
        kind={isPin ? "pin" : "password"}
        value={credValue}
        onChange={setCredValue}
        autoFocus
        marginBottom={22}
        onSubmit={handleSave}
      />

      <ErrorMsg style={{ marginTop: -14, marginBottom: 14 }}>{error}</ErrorMsg>

      <ModalFooter onCancel={onClose} onSave={handleSave} canSave={canSave} saveLabel={loading ? "Actualizando…" : "Resetear"} />
    </ModalShell>
  );
}

// Modal para configurar el correo de recuperación en el primer login
function RecoveryEmailModal({ onSave, onSkip }) {
  const [email,   setEmail]   = useState("");
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const handleSave = async () => {
    if (!valid || loading) return;
    setLoading(true); setError("");
    try { await onSave(email.trim().toLowerCase()); }
    catch { setError("Error al guardar el correo. Inténtalo de nuevo."); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ ...S.app, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ maxWidth: 400, width: "100%" }}>
        <div style={{ marginBottom: 30, paddingBottom: 20, borderBottom: `2px solid ${C.ink}` }}>
          <Overline>Primer acceso</Overline>
          <h1 style={{ ...S.h1 }}>Correo de recuperación</h1>
        </div>
        <p style={{ fontFamily: F.sans, fontSize: 14, color: C.ink2, lineHeight: 1.6, marginBottom: 24 }}>
          Añade un correo para poder recuperar tu acceso si olvidas tu PIN. Puedes saltarte este paso, pero no podrás recuperar tu cuenta sin ayuda del profesor.
        </p>
        <div style={{ marginBottom: 8 }}>
          <FieldLabel>Correo electrónico</FieldLabel>
          <input
            type="email"
            style={{ ...S.input }}
            value={email}
            autoFocus
            onChange={(e) => { setEmail(e.target.value); setError(""); }}
            placeholder="correo@ejemplo.com"
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
          />
        </div>
        {error && <ErrorMsg style={{ marginBottom: 12 }}>{error}</ErrorMsg>}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 24 }}>
          <CtaButton full lg onClick={handleSave} disabled={!valid || loading}>
            {loading ? "Guardando…" : "Guardar y continuar →"}
          </CtaButton>
          <GhostButton full lg onClick={onSkip}>Ahora no</GhostButton>
        </div>
      </div>
    </div>
  );
}

// Picker para elegir un audio del almacén
function AudioLibraryPickerModal({ library, onPick, onClose }) {
  const [previewId, setPreviewId] = useState(null);
  return (
    <ModalShell width={560} align="top">
      <h3 style={{ margin: "0 0 14px", fontSize: 16, fontWeight: 600, color: C.ink }}>Elegir audio del almacén</h3>

      {library.length === 0 ? (
        <div style={{ textAlign: "center", padding: "2rem 1rem", color: C.muted, fontSize: 13, lineHeight: 1.6 }}>
          
          <div>El almacén está vacío.</div>
          <div style={{ fontSize: 12 }}>Pide al administrador que añada audios.</div>
        </div>
      ) : (
        <div style={{ maxHeight: 420, overflowY: "auto", border: `1px solid ${C.line}`, borderRadius: 8, padding: 6, marginBottom: 16 }}>
          {library.map((audio) => {
            const isPrev = previewId === audio.id;
            return (
              <div key={audio.id} style={{ padding: "8px 10px", borderRadius: 6, marginBottom: 4, background: isPrev ? "rgba(26,25,21,0.04)" : "transparent", transition: "background .1s" }}>
                <div style={{ ...S.row, gap: 10, justifyContent: "space-between" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500, fontSize: 14, color: C.ink, marginBottom: audio.composer ? 1 : (audio.description ? 2 : 4), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{audio.title}</div>
                    {audio.composer && <div style={{ fontSize: 11, color: C.fnS, fontWeight: 500, marginBottom: audio.description ? 2 : 4 }}>{audio.composer}</div>}
                    {audio.description && <div style={{ fontSize: 12, color: C.muted, marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{audio.description}</div>}
                    <span style={{ ...S.badge, background: C.line, color: C.muted, fontFamily: FONT_MONO }}>{fmt(audio.duration)}</span>
                  </div>
                  <div style={{ ...S.row, gap: 6, flexShrink: 0 }}>
                    <button onClick={() => setPreviewId(isPrev ? null : audio.id)} style={{ ...S.btn, padding: "5px 9px", fontSize: 11 }}>
                      {isPrev ? "⏹" : "▶"}
                    </button>
                    <button onClick={() => onPick(audio)} style={{ ...S.btnPrimary, padding: "5px 11px", fontSize: 12 }}>Elegir</button>
                  </div>
                </div>
                {isPrev && (
                  <audio src={audio.url} controls autoPlay style={{ width: "100%", marginTop: 8, height: 34 }} />
                )}
              </div>
            );
          })}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button onClick={onClose} style={S.btn}>Cancelar</button>
      </div>
    </ModalShell>
  );
}

// Crear/editar un audio en el almacén
function AudioLibraryFormModal({ initial, allTags = [], allComposers = [], onSave, onClose }) {
  const [title,       setTitle]       = useState(initial?.title || "");
  const [composer,    setComposer]    = useState(initial?.composer || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [tags,        setTags]        = useState(initial?.tags || []);
  const [url,         setUrl]         = useState(initial?.url || "");
  const [duration,    setDuration]    = useState(initial?.duration || null);
  const [detecting,   setDetecting]   = useState(false);
  const [error,       setError]       = useState("");

  // BUG FIX: cancelación de detecciones obsoletas también aquí
  const urlReqRef = useRef(0);
  const handleUrlChange = (newUrl) => {
    const trimmed = newUrl.trim();
    setUrl(trimmed);
    setError("");
    if (!trimmed) { setDuration(null); urlReqRef.current++; return; }

    setDetecting(true);
    const reqId    = ++urlReqRef.current;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) { setDetecting(false); return; }
    const ctx = new AudioCtx();
    fetchAudioBuffer(trimmed)
      .then((buf) => ctx.decodeAudioData(buf))
      .then((decoded) => {
        ctx.close();
        if (reqId !== urlReqRef.current) return;
        setDuration(Math.ceil(decoded.duration));
        setDetecting(false);
      })
      .catch(() => {
        try { ctx.close(); } catch {}
        if (reqId !== urlReqRef.current) return;
        setError("No se pudo verificar la URL del audio.");
        setDetecting(false);
      });
  };

  const canSave = title.trim() && url.trim() && duration && !detecting;

  const handleSave = () => {
    if (!canSave) return;
    onSave({
      id:          initial?.id || uid("audio"),
      title:       title.trim(),
      composer:    composer.trim(),
      description: description.trim(),
      tags,
      url:         url.trim(),
      duration,
      createdAt:   initial?.createdAt || Date.now(),
    });
  };

  return (
    <ModalShell width={480} align="top">
      <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 600, color: C.ink }}>{initial ? "Editar audio" : "Añadir audio al almacén"}</h3>

      <label style={S.label}>Título</label>
      <input style={{ ...S.input, marginBottom: 14 }} value={title} autoFocus
        onChange={(e) => setTitle(e.target.value)} placeholder="Ej: Coral nº 4 — Bach (BWV 28)" />

      <label style={S.label}>Compositor</label>
      <SuggestInput
        value={composer}
        onChange={setComposer}
        suggestions={allComposers}
        placeholder="Ej: Johann Sebastian Bach"
        style={{ ...S.input, marginBottom: 14 }}
      />

      <label style={S.label}>Descripción (opcional)</label>
      <textarea style={{ ...S.input, marginBottom: 14, minHeight: 60, resize: "vertical", fontFamily: FONT_SANS }}
        value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Tonalidad, contexto histórico…" />

      <label style={{ ...S.label, marginBottom: 4 }}>Etiquetas internas <span style={{ fontWeight: 400, color: C.muted }}>(solo visibles para el profesor)</span></label>
      <div style={{ marginBottom: 14 }}>
        <TagInput tags={tags} onChange={setTags} suggestions={allTags} />
        <div style={{ fontSize: 11, color: C.muted, marginTop: 5 }}>Pulsa Intro o coma para añadir · Ej: "Forma sonata", "Modulación cromática"</div>
      </div>

      <label style={S.label}>URL del audio</label>
      <input type="url" style={{ ...S.input, marginBottom: 6 }}
        value={url} onChange={(e) => handleUrlChange(e.target.value)} placeholder="https://res.cloudinary.com/…" />
      {detecting && <p style={{ fontSize: 12, color: C.muted, margin: "0 0 14px" }}>Verificando audio…</p>}
      {duration && !detecting && <p style={{ fontSize: 12, color: C.fnT, margin: "0 0 14px" }}>✓ Duración detectada: {fmt(duration)}</p>}
      <ErrorMsg>{error}</ErrorMsg>
      <div style={{ marginBottom: 8 }} />

      <ModalFooter onCancel={onClose} onSave={handleSave} canSave={canSave} saveLabel={initial ? "Guardar" : "Añadir"} />
    </ModalShell>
  );
}

// Editor de pregunta (test o desarrollo)
function QuestionEditorModal({ initial, defaultStart, audioDuration, onSave, onClose }) {
  const [text,            setText]            = useState(initial?.text || "");
  const [type,            setType]            = useState(initial?.type || "test");
  const [audioStart,      setAudioStart]      = useState(initial?.audioStart ?? defaultStart ?? 0);
  const [audioEnd,        setAudioEnd]        = useState(initial?.audioEnd   ?? Math.min(audioDuration, (defaultStart ?? 0) + 10));
  const [options,         setOptions]         = useState(initial?.options || [
    { id: "A", text: "" }, { id: "B", text: "" }, { id: "C", text: "" },
  ]);
  const [correctOptionId, setCorrectOptionId] = useState(initial?.correctOptionId || "A");

  const updateOpt = (i, txt) => setOptions((prev) => prev.map((o, idx) => idx === i ? { ...o, text: txt } : o));
  const addOpt = () => {
    if (options.length >= 6) return;
    setOptions((prev) => [...prev, { id: String.fromCharCode(65 + prev.length), text: "" }]);
  };
  const removeOpt = (i) => {
    if (options.length <= 2) return;
    setOptions((prev) => {
      const next = prev.filter((_, idx) => idx !== i).map((o, idx) => ({ ...o, id: String.fromCharCode(65 + idx) }));
      if (correctOptionId && !next.some((o) => o.id === correctOptionId)) setCorrectOptionId(next[0].id);
      return next;
    });
  };

  const canSave =
    text.trim() &&
    audioEnd > audioStart &&
    (type !== "test" || (options.every((o) => o.text.trim()) && correctOptionId));

  const handleSave = () => {
    if (!canSave) return;
    onSave({
      id:         initial?.id || uid("q"),
      text:       text.trim(),
      type,
      audioStart: parseFloat(audioStart),
      audioEnd:   parseFloat(audioEnd),
      options:    type === "test" ? options.map((o) => ({ ...o, text: o.text.trim() })) : [],
      correctOptionId: type === "test" ? correctOptionId : null,
    });
  };

  return (
    <ModalShell width={560} align="top">
      <h3 style={{ margin: "0 0 18px", fontSize: 16, fontWeight: 600, color: C.ink }}>{initial ? "Editar pregunta" : "Nueva pregunta"}</h3>

      <label style={S.label}>Tipo</label>
      <div style={{ ...S.row, gap: 8, marginBottom: 14 }}>
        {[{ id: "test", label: "Tipo test" }, { id: "desarrollo", label: "Desarrollo" }].map((opt) => (
          <button key={opt.id} type="button" onClick={() => setType(opt.id)}
            style={{
              ...S.btn, flex: 1, fontSize: 12,
              background: type === opt.id ? C.ink   : C.paper,
              color:      type === opt.id ? C.paper : C.ink2,
              border:     `1px solid ${type === opt.id ? C.ink : C.line}`,
            }}>
            {opt.label}
          </button>
        ))}
      </div>

      <label style={S.label}>Pregunta</label>
      <textarea style={{ ...S.input, marginBottom: 14, minHeight: 60, resize: "vertical", fontFamily: FONT_SANS }}
        value={text} onChange={(e) => setText(e.target.value)}
        placeholder="¿Qué función armónica predomina en este fragmento?" autoFocus />

      <div style={{ ...S.row, gap: 10, marginBottom: 14 }}>
        <div style={{ flex: 1 }}>
          <label style={S.label}>Inicio (s)</label>
          <input type="number" min={0} max={audioDuration} step={0.1} style={S.input}
            value={audioStart} onChange={(e) => setAudioStart(parseFloat(e.target.value) || 0)} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={S.label}>Fin (s)</label>
          <input type="number" min={0} max={audioDuration} step={0.1} style={S.input}
            value={audioEnd} onChange={(e) => setAudioEnd(parseFloat(e.target.value) || 0)} />
        </div>
      </div>

      {type === "test" && (
        <>
          <label style={S.label}>Opciones (marca la correcta)</label>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
            {options.map((opt, i) => {
              const isCorrect = correctOptionId === opt.id;
              return (
                <div key={opt.id} style={{ ...S.row, gap: 8 }}>
                  <button type="button" onClick={() => setCorrectOptionId(opt.id)}
                    title={isCorrect ? "Esta es la opción correcta" : "Marcar como correcta"}
                    style={{
                      width: 32, height: 32, borderRadius: "50%",
                      background: isCorrect ? C.fnT : C.paper,
                      border:     `1.5px solid ${isCorrect ? C.fnT : C.line}`,
                      color:      isCorrect ? C.paper : C.muted,
                      cursor: "pointer", fontWeight: 700, fontSize: 13, fontFamily: FONT_MONO,
                      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                    }}>
                    {opt.id}
                  </button>
                  <input style={{ ...S.input, flex: 1 }} value={opt.text}
                    onChange={(e) => updateOpt(i, e.target.value)} placeholder={`Texto de la opción ${opt.id}`} />
                  <button onClick={() => removeOpt(i)} disabled={options.length <= 2}
                    style={{ ...S.btnDanger, padding: "5px 9px", fontSize: 11, ...disabledStyle(options.length > 2), flexShrink: 0 }}>×</button>
                </div>
              );
            })}
          </div>
          <button onClick={addOpt} disabled={options.length >= 6}
            style={{ ...S.btn, width: "100%", marginBottom: 18, fontSize: 12, ...disabledStyle(options.length < 6) }}>
            + Añadir opción
          </button>
        </>
      )}

      <ModalFooter onCancel={onClose} onSave={handleSave} canSave={canSave} saveLabel={initial ? "Guardar" : "Crear"} />
    </ModalShell>
  );
}

// ═══ 14b. MULTI-MODEL SESSION VIEW ══════════════════════════════════════════
// Wrapper para ejercicios con dos modelos: gestiona el estado de alternancia
// y pasa la barra de toggle a cada vista como prop.
// El audio se decodifica UNA SOLA VEZ aquí y se comparte con todas las vistas
// para que cambiar de modelo no recargue ni re-decodifique el audio.
function MultiModelSessionView({ exercise, mode, onSubmit, onBack }) {
  const models = modelsOf(exercise);
  const [activeIdx, setActiveIdx] = useState(0);
  const activeModel = models[activeIdx] || models[0];

  // Audio compartido: decodificado una vez, persiste entre cambios de modelo
  const [sharedWaveformData, setSharedWaveformData] = useState(exercise.waveformData || null);
  const loopRegionRef = useRef(null);   // QuestionnaireView lo actualiza con su lockedQuestion
  const onWaveform    = sharedWaveformData ? null : (wd) => setSharedWaveformData(wd);
  const rawPlayer     = useAudioPlayer(exercise, { onWaveform, loopRegionRef });
  const sharedAudioPlayer = { ...rawPlayer, waveformData: sharedWaveformData };

  // Al cambiar de modelo, cancelar cualquier bucle de fragmento activo
  useEffect(() => { loopRegionRef.current = null; }, [activeModel]);

  const toggleNode = models.length > 1 ? (
    <ModelToggleBar models={models} activeIdx={activeIdx} onSwitch={setActiveIdx} />
  ) : null;

  // Cada vista tiene su propio estado de UI; al cambiar de modelo se desmonta
  // y vuelve a montar (React detecta el cambio de key). El audio, sin embargo,
  // vive aquí y se pasa como sharedAudioPlayer para no re-decodificar.
  if (activeModel === "esquema") {
    return (
      <div key={`schema-${exercise.id}`}>
        <SchemaExerciseView
          exercise={exercise}
          mode={mode}
          onSubmit={onSubmit}
          onBack={onBack}
          modelToggleNode={toggleNode}
          sharedAudioPlayer={sharedAudioPlayer}
        />
      </div>
    );
  }
  if (activeModel === "cuestionario") {
    return (
      <div key={`quiz-${exercise.id}`}>
        <QuestionnaireView
          exercise={exercise}
          onSubmit={onSubmit}
          onBack={onBack}
          modelToggleNode={toggleNode}
          sharedAudioPlayer={sharedAudioPlayer}
          loopRegionRef={loopRegionRef}
        />
      </div>
    );
  }
  return (
    <div key={`interactive-${exercise.id}`}>
      <ExerciseView
        exercise={exercise}
        mode={mode}
        onSubmit={onSubmit}
        onBack={onBack}
        modelToggleNode={toggleNode}
        sharedAudioPlayer={sharedAudioPlayer}
      />
    </div>
  );
}

// ═══ 15. APP ROOT ═══════════════════════════════════════════════════════════
export default function App() {
  useInjectFonts();

  // Ref al cliente Supabase — se carga dinámicamente; null en el visor de artefactos
  const supabaseRef = useRef(null);
  // Contador de escrituras en vuelo hacia Supabase.
  const pendingSavesRef = useRef(0);

  // Estado global
  const [exercises,    setExercises]    = useState(INIT_EXERCISES);
  const [users,        setUsers]        = useState([]);
  const [results,      setResults]      = useState({});   // { userId: { exerciseId: result } }
  const [margin,       setMargin]       = useState(1);
  const [categories,   setCategories]   = useState([DEFAULT_CATEGORY]);
  const [courses,      setCourses]      = useState([]);
  const [units,        setUnits]        = useState([]);
  const [groups,       setGroups]       = useState([]);
  const [audioLibrary, setAudioLibrary] = useState(INIT_AUDIO_LIBRARY);

  const [dbReady, setDbReady] = useState(false);
  const [user,    setUser]    = useState(null);

  // Navegación — la URL (#/…) es la fuente de verdad
  const { route, navigate } = useHashRoute();
  const [lastResult,   setLastResult]     = useState(null);
  const [guestResults, setGuestResults]   = useState({});
  const [pickingTeacher, setPickingTeacher] = useState(false);
  const redirectAfterLogin = useRef(null);   // enlace profundo a recuperar tras login

  const [pendingLoginUser, setPendingLoginUser] = useState(null); // alumno esperando configurar correo de recuperación
  const [showForgotPin,    setShowForgotPin]    = useState(false);
  const [resetSession,     setResetSession]     = useState(null);  // sesión Supabase Auth desde magic link

  // Ejercicio referenciado por la URL (reconstruido desde el id)
  const routeExercise = useMemo(() => {
    const exId = route.params?.exId;
    if (!exId || exId === "nuevo") return null;
    // Los ids de la URL son texto; los del modelo pueden ser numéricos → comparar como texto
    return (exercises || []).find((e) => String(e.id) === String(exId)) || null;
  }, [route, exercises]);
  const exCtx = routeExercise
    ? { exercise: routeExercise, mode: route.params?.mode || "student" }
    : null;
  const qmCtx = routeExercise ? { exercise: routeExercise } : null;
  const loginRole = route.name === "login" ? route.params.role : null;

  // ─── Carga inicial desde Supabase (import dinámico) ─────────────────────
  // En la web, el import resuelve y carga datos reales.
  // En el visor de artefactos de Claude, el import falla silenciosamente y
  // la app arranca en modo "en memoria" con los datos semilla (INIT_EXERCISES).
  useEffect(() => {
    (async () => {
      try {
        // Intentar cargar el cliente de Supabase dinámicamente
        try {
          const mod = await import("./supabase.js");
          supabaseRef.current = mod.supabase;
          // Detectar sesión desde magic link de recuperación de PIN
          const { data: { session: magicSession } } = await mod.supabase.auth.getSession();
          if (magicSession) {
            setResetSession(magicSession);
            window.history.replaceState(null, "", "#/");
          }
        } catch {
          // Entorno de previsualización: sin backend — modo en memoria.
          // El `finally` de abajo marca dbReady; basta con salir aquí.
          return;
        }

        const sb = supabaseRef.current;
        const [
          exRes, userRes, catRes, courseRes, unitRes,
          resultRes, settingsRes, audioRes, groupRes,
        ] = await Promise.all([
          sb.from("fa_exercises").select("*"),
          sb.from("fa_users").select("*"),
          sb.from("fa_categories").select("*"),
          sb.from("fa_courses").select("*"),
          sb.from("fa_units").select("*"),
          sb.from("fa_results").select("*"),
          sb.from("fa_settings").select("*"),
          sb.from("fa_audio_library").select("*"),
          sb.from("fa_groups").select("*"),
        ]);

        if (exRes.data?.length)     setExercises(exRes.data.map((r) => r.data));
        if (userRes.data?.length)   setUsers(userRes.data.map((r) => r.data));
        if (catRes.data?.length) {
          const loaded = catRes.data.map((r) => r.data);
          // Asegura que la categoría por defecto esté presente
          if (!loaded.find((c) => c.id === "default")) setCategories([DEFAULT_CATEGORY, ...loaded]);
          else setCategories(loaded);
        }
        if (courseRes.data?.length) setCourses(courseRes.data.map((r) => r.data));
        if (unitRes.data?.length)   setUnits(unitRes.data.map((r) => r.data));
        if (audioRes.data?.length)  setAudioLibrary(audioRes.data.map((r) => r.data));
        if (groupRes.data?.length)  setGroups(groupRes.data.map((r) => r.data));

        if (resultRes.data?.length) {
          const byUser = {};
          resultRes.data.forEach((row) => {
            if (!byUser[row.user_id]) byUser[row.user_id] = {};
            byUser[row.user_id][row.exercise_id] = row.data;
          });
          setResults(byUser);
        }

        if (settingsRes.data?.length) {
          const m = settingsRes.data.find((s) => s.key === "margin");
          if (m?.value != null) setMargin(Number(m.value));
        }
      } catch (e) {
        console.error("Error cargando datos de Supabase:", e);
      } finally {
        setDbReady(true);
      }
    })();
  }, []);

  // Advierte al usuario si recarga mientras hay escrituras en vuelo.
  useEffect(() => {
    const handler = (e) => {
      if (pendingSavesRef.current > 0) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  // ─── Helpers de upsert ───────────────────────────────────────────────────
  // Todos los helpers comprueban si el cliente existe; si no (modo en memoria),
  // simplemente retornan sin hacer nada: el estado React ya se actualizó.

  const dbUpsertExercise = async (ex) => {
    const sb = supabaseRef.current; if (!sb) return;
    // El waveform decodificado puede pesar mucho; no se guarda en Supabase.
    // eslint-disable-next-line no-unused-vars
    const { waveformData, ...rest } = ex;
    pendingSavesRef.current++;
    const { error } = await sb.from("fa_exercises").upsert({ id: ex.id, data: rest });
    pendingSavesRef.current--;
    if (error) console.error("[fa_exercises] Error al guardar:", error.message, ex.id);
  };
  const dbDeleteExercise = async (id) => { const sb = supabaseRef.current; if (!sb) return; await sb.from("fa_exercises").delete().eq("id", id); };

  const dbUpsertUser   = async (u)  => { const sb = supabaseRef.current; if (!sb) return; const { error } = await sb.from("fa_users").upsert({ id: u.id, data: u }); if (error) console.error("[fa_users] Error al guardar:", error.message); };
  const dbDeleteUser   = async (id) => { const sb = supabaseRef.current; if (!sb) return; await sb.from("fa_users").delete().eq("id", id); };

  const dbUpsertCategory = async (c)  => { const sb = supabaseRef.current; if (!sb) return; const { error } = await sb.from("fa_categories").upsert({ id: c.id, data: c }); if (error) console.error("[fa_categories] Error al guardar:", error.message); };
  const dbDeleteCategory = async (id) => { const sb = supabaseRef.current; if (!sb) return; await sb.from("fa_categories").delete().eq("id", id); };

  const dbUpsertCourse = async (c)  => { const sb = supabaseRef.current; if (!sb) return; const { error } = await sb.from("fa_courses").upsert({ id: c.id, data: c }); if (error) console.error("[fa_courses] Error al guardar:", error.message); };
  const dbDeleteCourse = async (id) => { const sb = supabaseRef.current; if (!sb) return; await sb.from("fa_courses").delete().eq("id", id); };

  const dbUpsertUnit = async (u)  => { const sb = supabaseRef.current; if (!sb) return; const { error } = await sb.from("fa_units").upsert({ id: u.id, data: u }); if (error) console.error("[fa_units] Error al guardar:", error.message); };
  const dbDeleteUnit = async (id) => { const sb = supabaseRef.current; if (!sb) return; await sb.from("fa_units").delete().eq("id", id); };

  const dbUpsertResult = async (userId, exerciseId, data) => {
    const sb = supabaseRef.current; if (!sb) return;
    await sb.from("fa_results").upsert({ user_id: userId, exercise_id: exerciseId, data });
  };
  const dbDeleteResultsForUser     = async (userId)     => { const sb = supabaseRef.current; if (!sb) return; await sb.from("fa_results").delete().eq("user_id", userId); };
  const dbDeleteResultsForExercise = async (exerciseId) => { const sb = supabaseRef.current; if (!sb) return; await sb.from("fa_results").delete().eq("exercise_id", exerciseId); };

  const dbUpsertSetting = async (key, value) => { const sb = supabaseRef.current; if (!sb) return; await sb.from("fa_settings").upsert({ key, value }); };

  const dbUpsertAudio = async (a)  => { const sb = supabaseRef.current; if (!sb) return; await sb.from("fa_audio_library").upsert({ id: a.id, data: a }); };
  const dbDeleteAudio = async (id) => { const sb = supabaseRef.current; if (!sb) return; await sb.from("fa_audio_library").delete().eq("id", id); };

  const dbUpsertGroup = async (g)  => { const sb = supabaseRef.current; if (!sb) return; await sb.from("fa_groups").upsert({ id: g.id, data: g }); };
  const dbDeleteGroup = async (id) => { const sb = supabaseRef.current; if (!sb) return; await sb.from("fa_groups").delete().eq("id", id); };

  // ─── Users ───────────────────────────────────────────────────────────────
  const addUser = (newUser) => {
    setUsers((prev) => [...prev, newUser]);
    dbUpsertUser(newUser);
  };

  const removeUser = (userId) => {
    setUsers((prev) => prev.filter((u) => u.id !== userId));
    setResults((prev) => { const next = { ...prev }; delete next[userId]; return next; });
    setGroups((prev) => prev.map((g) =>
      g.studentIds?.includes(userId) ? { ...g, studentIds: g.studentIds.filter((id) => id !== userId) } : g
    ));
    // Persistir los grupos afectados desde el estado actual (closure), no dentro
    // del updater de setGroups (correría en render → array vacío al guardar).
    groups
      .filter((g) => g.studentIds?.includes(userId))
      .forEach((g) => dbUpsertGroup({ ...g, studentIds: g.studentIds.filter((id) => id !== userId) }));
    dbDeleteUser(userId);
    dbDeleteResultsForUser(userId);
  };

  const updateUser = (updatedUser) => {
    setUsers((prev) => prev.map((u) => u.id === updatedUser.id ? updatedUser : u));
    if (user?.id === updatedUser.id) setUser(updatedUser);
    dbUpsertUser(updatedUser);
  };

  // ─── Correction save ─────────────────────────────────────────────────────
  const saveCorrection = (studentId, exerciseId, correction) => {
    // El objeto a persistir se calcula ANTES de setState (a partir del estado
    // actual en el closure). Antes se asignaba dentro del updater de setResults
    // y se leía justo después; como React ejecuta ese updater en la fase de
    // render (no de forma síncrona), `saved` seguía siendo null al llamar a
    // dbUpsertResult → la corrección del profesor no se guardaba en Supabase.
    const existing = (results[studentId] || {})[exerciseId] || {};
    const updated  = { ...existing, teacherCorrection: { ...correction, corrected: true } };
    setResults((prev) => ({ ...prev, [studentId]: { ...(prev[studentId] || {}), [exerciseId]: updated } }));
    dbUpsertResult(studentId, exerciseId, updated);
  };

  // ─── Groups ──────────────────────────────────────────────────────────────
  const addGroup    = (g) => { setGroups((prev) => [...prev, g]); dbUpsertGroup(g); };
  const updateGroup = (g) => { setGroups((prev) => prev.map((x) => x.id === g.id ? g : x)); dbUpsertGroup(g); };
  const deleteGroup = (id) => { setGroups((prev) => prev.filter((g) => g.id !== id)); dbDeleteGroup(id); };

  // ─── Setup inicial (primer admin) ────────────────────────────────────────
  const handleSetup = (adminUser) => {
    setUsers([adminUser]);
    setUser(adminUser);
    navigate("/profesor");
    dbUpsertUser(adminUser);
  };

  // ─── Exercises ───────────────────────────────────────────────────────────
  const addExercise = (newEx) => {
    setExercises((prev) => [...prev, newEx]);
    dbUpsertExercise(newEx);
  };

  const updateExercise = (id, patch) => {
    const current = exercises.find((e) => e.id === id);
    setExercises((prev) => prev.map((e) => e.id === id ? { ...e, ...patch } : e));
    if (current) dbUpsertExercise({ ...current, ...patch });
  };

  const deleteExercise = (id) => {
    setExercises((prev) => prev.filter((e) => e.id !== id));
    setUnits((prev) => prev.map((u) =>
      u.exerciseIds.includes(id) ? { ...u, exerciseIds: u.exerciseIds.filter((eid) => eid !== id) } : u
    ));
    // Persistir las unidades afectadas. Se calculan desde el estado actual
    // (closure `units`), NO dentro del updater de setUnits: React ejecuta ese
    // updater en la fase de render, así que un array capturado dentro seguiría
    // vacío aquí y las unidades no se guardarían (referencias colgantes al
    // ejercicio borrado tras recargar).
    units
      .filter((u) => u.exerciseIds.includes(id))
      .forEach((u) => dbUpsertUnit({ ...u, exerciseIds: u.exerciseIds.filter((eid) => eid !== id) }));
    setResults((prev) => {
      const next = {};
      for (const uid of Object.keys(prev)) {
        const sub = { ...prev[uid] };
        delete sub[id];
        next[uid] = sub;
      }
      return next;
    });
    dbDeleteExercise(id);
    dbDeleteResultsForExercise(id);
  };

  // ─── Categories ──────────────────────────────────────────────────────────
  const addCategory = (newCat) => {
    setCategories((prev) => [...prev, newCat]);
    dbUpsertCategory(newCat);
  };
  const updateCategory = (updatedCat) => {
    setCategories((prev) => prev.map((c) => c.id === updatedCat.id ? updatedCat : c));
    dbUpsertCategory(updatedCat);
  };
  const deleteCategory = (id) => {
    if (id === "default") return;
    setCategories((prev) => prev.filter((c) => c.id !== id));
    dbDeleteCategory(id);
  };
  const toggleGlobalCategory = (id) => {
    // Calcular el objeto a persistir desde el estado actual (closure), no dentro
    // del updater: el updater corre en render y `cat` seguiría null al guardar.
    const cat = categories.find((c) => c.id === id);
    if (!cat) return;
    const updated = { ...cat, global: !cat.global };
    setCategories((prev) => prev.map((c) => c.id === id ? updated : c));
    dbUpsertCategory(updated);
  };

  // ─── Courses ─────────────────────────────────────────────────────────────
  const addCourse = (newCourse) => {
    setCourses((prev) => [...prev, newCourse]);
    dbUpsertCourse(newCourse);
  };
  const updateCourse = (updated) => {
    setCourses((prev) => prev.map((c) => c.id === updated.id ? updated : c));
    dbUpsertCourse(updated);
  };
  const deleteCourse = (id) => {
    setCourses((prev) => prev.filter((c) => c.id !== id));
    dbDeleteCourse(id);
  };

  // ─── Units ───────────────────────────────────────────────────────────────
  const addUnit = (newUnit, courseId) => {
    const existingCourse = courses.find((c) => c.id === courseId);
    setUnits((prev) => [...prev, newUnit]);
    setCourses((prev) => prev.map((c) => c.id === courseId ? { ...c, unitIds: [...c.unitIds, newUnit.id] } : c));
    if (existingCourse) dbUpsertCourse({ ...existingCourse, unitIds: [...existingCourse.unitIds, newUnit.id] });
    dbUpsertUnit(newUnit);
  };

  const updateUnit = (updated) => {
    setUnits((prev) => prev.map((u) => u.id === updated.id ? updated : u));
    dbUpsertUnit(updated);
  };

  const deleteUnit = (unitId, courseId) => {
    const existingCourse = courses.find((c) => c.id === courseId);
    setUnits((prev) => prev.filter((u) => u.id !== unitId));
    setCourses((prev) => prev.map((c) => c.id === courseId ? { ...c, unitIds: c.unitIds.filter((id) => id !== unitId) } : c));
    if (existingCourse) dbUpsertCourse({ ...existingCourse, unitIds: existingCourse.unitIds.filter((id) => id !== unitId) });
    dbDeleteUnit(unitId);
  };

  const addExercisesToUnit = (unitId, exIds) => {
    const existingUnit = units.find((u) => u.id === unitId);
    setUnits((prev) => prev.map((u) => {
      if (u.id !== unitId) return u;
      const merged = [...u.exerciseIds, ...exIds.filter((id) => !u.exerciseIds.includes(id))];
      return { ...u, exerciseIds: merged };
    }));
    if (existingUnit) {
      const merged = [...existingUnit.exerciseIds, ...exIds.filter((id) => !existingUnit.exerciseIds.includes(id))];
      dbUpsertUnit({ ...existingUnit, exerciseIds: merged });
    }
  };

  const removeExerciseFromUnit = (unitId, exId) => {
    const existingUnit = units.find((u) => u.id === unitId);
    setUnits((prev) => prev.map((u) => u.id === unitId ? { ...u, exerciseIds: u.exerciseIds.filter((id) => id !== exId) } : u));
    if (existingUnit) dbUpsertUnit({ ...existingUnit, exerciseIds: existingUnit.exerciseIds.filter((id) => id !== exId) });
  };

  // ─── Audio library ───────────────────────────────────────────────────────
  const addAudio = (a) => {
    setAudioLibrary((prev) => [...prev, a]);
    dbUpsertAudio(a);
  };
  const updateAudio = (a) => {
    setAudioLibrary((prev) => prev.map((x) => x.id === a.id ? a : x));
    dbUpsertAudio(a);
  };
  const deleteAudio = (id) => {
    setAudioLibrary((prev) => prev.filter((x) => x.id !== id));
    dbDeleteAudio(id);
  };

  // ─── Margin (settings) ───────────────────────────────────────────────────
  const updateMargin = (m) => { setMargin(m); dbUpsertSetting("margin", m); };

  // ─── Navegación helpers ──────────────────────────────────────────────────
  const freshExercise = (ex) => exercises.find((e) => e.id === ex.id) || ex;

  // Si entras sin sesión a una ruta protegida, recuérdala para volver tras login
  useEffect(() => {
    if (user) return;
    const open = route.name === "home" || route.name === "login" || route.name === "setup";
    if (!open) {
      redirectAfterLogin.current = window.location.hash.replace(/^#/, "") || null;
    }
  }, [user, route]);

  const openCorrection = (ex) => {
    // Calcular el resultado almacenado de forma local: no depende del `const
    // userResults` declarado más abajo en el cuerpo del componente, lo que
    // evita una referencia frágil en la zona muerta temporal (TDZ).
    const stored = user?.isGuest
      ? guestResults[ex.id]
      : (results[user?.id] || {})[ex.id];
    if (!stored) return;
    setLastResult(stored);
    navigate(`/alumno/ejercicio/${ex.id}/correccion`);
  };

  const openEx = (ex, mode = "student") => {
    if (mode === "record") {
      // El cuestionario puro se "graba" desde el gestor de preguntas.
      // Los híbridos tienen su propio botón onManageQuestions; aquí se graba la clave interactiva.
      if (modelsOf(ex).join(",") === "cuestionario") navigate(`/profesor/ejercicio/${ex.id}/preguntas`);
      else navigate(`/profesor/ejercicio/${ex.id}/grabar`);
    } else {
      navigate(`/alumno/ejercicio/${ex.id}`);
    }
  };


  // Finalizar el login una vez que el alumno ya tiene (o ha saltado) el correo de recuperación
  const completeLogin = (u) => {
    setUser(u);
    const dest = redirectAfterLogin.current;
    redirectAfterLogin.current = null;
    if (u.role === "student") {
      const hasTeacher = (users || []).some((x) => x.role === "teacher" && x.id === u.teacherId);
      if (!u.teacherId || !hasTeacher) { setPickingTeacher(true); return; }
      navigate(dest && dest.startsWith("/alumno") ? dest : "/alumno");
    } else {
      navigate(dest && dest.startsWith("/profesor") ? dest : "/profesor");
    }
  };

  // ─── Submit de respuestas (alumno entrega ejercicio) ────────────────────
  const submitAnswer = (payload) => {
    if (!exCtx) return;
    const ex      = freshExercise(exCtx.exercise);
    const isGuest = user?.isGuest;
    const activePalette = effectivePaletteId(ex, user?.defaultPalette);

    // Cuestionario
    if (payload?.type === "cuestionario") {
      const data = { type: "cuestionario", answers: payload.answers, score: payload.score, schemaPalette: activePalette, timestamp: Date.now() };
      if (isGuest) {
        setGuestResults((prev) => ({ ...prev, [ex.id]: data }));
      } else if (user) {
        setResults((prev) => ({ ...prev, [user.id]: { ...(prev[user.id] || {}), [ex.id]: data } }));
        dbUpsertResult(user.id, ex.id, data);
      }
      setLastResult(data);
      navigate(`/alumno/ejercicio/${ex.id}/correccion`);
      return;
    }

    // Esquema
    if (payload?.type === "esquema") {
      if (payload.mode === "record") {
        // El profesor guarda el esquema como modelo de referencia (con su paleta)
        updateExercise(ex.id, { schemaKey: payload.blocks, schemaPalette: payload.schemaPalette ?? SCHEMA_PALETTE_DEFAULT });
        navigate("/profesor");
        return;
      }
      // Modo preview (profesor prueba) o alumno: ambos van a CorrectionView
      const placementScore = calcSchemaPlacementScore(ex.schemaKey, payload.blocks);
      const data = { type: "esquema", blocks: payload.blocks, placementScore, schemaPalette: payload.schemaPalette ?? SCHEMA_PALETTE_DEFAULT, timestamp: Date.now() };
      if (payload.mode !== "preview") {
        // Solo guardar si es un alumno real
        if (isGuest) {
          setGuestResults((prev) => ({ ...prev, [ex.id]: data }));
        } else if (user) {
          setResults((prev) => ({ ...prev, [user.id]: { ...(prev[user.id] || {}), [ex.id]: data } }));
          dbUpsertResult(user.id, ex.id, data);
        }
      }
      setLastResult(data);
      navigate(payload.mode === "preview"
        ? `/profesor/ejercicio/${ex.id}/correccion`
        : `/alumno/ejercicio/${ex.id}/correccion`);
      return;
    }

    // Interactivo: payload = { entries: [{ categoryId, intervals }], currentCategoryId }
    const entries          = payload.entries || [];
    const currentCategoryId = payload.currentCategoryId || entries[0]?.categoryId || "default";

    const scoreFor = (categoryId, intervals) => {
      const key = answerFor(ex, categoryId);
      if (!key.length) return null;
      return calcScore(key, intervals, ex.duration, margin);
    };

    if (exCtx.mode === "record") {
      // Guardar como clave del profesor
      const patchAnswers = { ...(ex.answers || {}) };
      entries.forEach(({ categoryId, intervals }) => { patchAnswers[categoryId] = intervals; });
      updateExercise(ex.id, { answers: patchAnswers });
      navigate("/profesor");
      return;
    }

    // Modo alumno: el "principal" es el currentCategoryId
    const mainEntry  = entries.find((e) => e.categoryId === currentCategoryId) || entries[0];
    const mainIvs    = mainEntry?.intervals || [];
    const mainScore  = scoreFor(currentCategoryId, mainIvs);

    const extras = entries
      .filter((e) => e.categoryId !== currentCategoryId)
      .map((e) => ({
        categoryId: e.categoryId,
        intervals:  e.intervals,
        score:      scoreFor(e.categoryId, e.intervals),
      }));

    const data = {
      categoryId: currentCategoryId,
      intervals:  mainIvs,
      score:      mainScore,
      extras,
      schemaPalette: activePalette,
      timestamp:  Date.now(),
    };

    if (isGuest) {
      setGuestResults((prev) => ({ ...prev, [ex.id]: data }));
    } else if (user) {
      setResults((prev) => ({ ...prev, [user.id]: { ...(prev[user.id] || {}), [ex.id]: data } }));
      dbUpsertResult(user.id, ex.id, data);
    }
    setLastResult(data);
    navigate(`/alumno/ejercicio/${ex.id}/correccion`);
  };

  // ─── Routing ─────────────────────────────────────────────────────────────
  if (!dbReady) {
    return (
      <div style={{ ...S.app, display: "flex", alignItems: "center", justifyContent: "center", color: C.muted, fontSize: 14 }}>
        Cargando…
      </div>
    );
  }

  // Setup inicial: aún no hay admin
  const hasAdmin = (users || []).some((u) => u.role === "admin");
  if (!hasAdmin) return <SetupView onSetup={handleSetup} />;

  // Selección de profesor para alumno (al primer login o desde "Cambiar profesor")
  if ((pickingTeacher || route.name === "pick-teacher") && user?.role === "student") {
    const teacherList = (users || []).filter((u) => u.role === "teacher");
    return (
      <TeacherPickerView
        teachers={teacherList}
        currentTeacherId={user.teacherId}
        onPick={(t) => { const upd = { ...user, teacherId: t.id }; updateUser(upd); setPickingTeacher(false); navigate("/alumno"); }}
        onLogout={() => { setUser(null); setPickingTeacher(false); navigate("/"); }}
      />
    );
  }

  // Login flow
  if (!user) {
    // 1. Recuperar acceso desde magic link enviado por correo
    if (resetSession) {
      return (
        <ResetPinView
          users={users}
          supabaseSession={resetSession}
          onReset={async (updatedUser) => {
            updateUser(updatedUser);
            const sb = supabaseRef.current;
            if (sb) await sb.auth.signOut();
            setResetSession(null);
            navigate("/");
          }}
          onBack={async () => {
            const sb = supabaseRef.current;
            if (sb) await sb.auth.signOut();
            setResetSession(null);
            navigate("/");
          }}
        />
      );
    }

    // 2. Primer login de alumno sin correo de recuperación configurado
    if (pendingLoginUser) {
      return (
        <RecoveryEmailModal
          onSave={async (email) => {
            const updated = { ...pendingLoginUser, recoveryEmail: email };
            setUsers((prev) => prev.map((u) => u.id === updated.id ? updated : u));
            await dbUpsertUser(updated);
            setPendingLoginUser(null);
            completeLogin(updated);
          }}
          onSkip={() => {
            setPendingLoginUser(null);
            completeLogin(pendingLoginUser);
          }}
        />
      );
    }

    // 3. Vista "He olvidado mi PIN"
    if (showForgotPin) {
      return (
        <ForgotPinView
          users={users}
          supabaseRef={supabaseRef}
          onBack={() => setShowForgotPin(false)}
        />
      );
    }

    const finishLogin = (u) => {
      if (u.role === "student" && !u.recoveryEmail) {
        setPendingLoginUser(u);
        return;
      }
      completeLogin(u);
    };

    if (loginRole) {
      const labels = { admin: "administrador", teacher: "profesor", student: "alumno" };
      return (
        <LoginView
          roleLabel={labels[loginRole]}
          filterRole={loginRole}
          users={users}
          onLogin={finishLogin}
          onBack={() => navigate("/")}
          onForgotPin={loginRole === "student" ? () => setShowForgotPin(true) : null}
          onGuest={loginRole === "student" ? () => {
            const guest = { id: `guest-${Date.now()}`, displayName: "Invitado", role: "student", isGuest: true };
            setUser(guest); navigate("/alumno");
          } : null}
        />
      );
    }
    return (
      <HomeView
        onTeacher={() => navigate("/entrar/profesor")}
        onStudent={() => navigate("/entrar/alumno")}
      />
    );
  }

  // Vistas autenticadas
  const onLogout = () => { setUser(null); setGuestResults({}); navigate("/"); };
  const userResults = user.isGuest ? guestResults : (results[user.id] || {});
  const isStudent = user.role === "student";

  // Mensaje cuando el ejercicio referenciado por la URL no existe (o no cargó)
  const NotFound = ({ to }) => (
    <div style={{ ...S.app, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, color: C.muted, fontSize: 14, padding: 24, textAlign: "center" }}>
      <span>No se encontró este ejercicio.</span>
      <button style={S.btn} onClick={() => navigate(to)}>← Volver</button>
    </div>
  );

  // ── Sesión de ejercicio (interactivo / esquema / cuestionario) ──
  if (route.name === "session") {
    const back = isStudent ? "/alumno" : "/profesor";
    // Un alumno no puede entrar a modos de profesor
    if (isStudent && exCtx?.mode !== "student") { navigate("/alumno"); return null; }
    if (!exCtx) return <NotFound to={back} />;
    const exModels = modelsOf(exCtx.exercise);
    const onBack = () => navigate(exCtx.mode === "record" || exCtx.mode === "preview" ? "/profesor" : "/alumno");
    // Paleta efectiva = la del ejercicio, o la preferida por el usuario, o P1.
    const sessionPalette = effectivePaletteId(exCtx.exercise, user?.defaultPalette);
    const sessionExercise = applyPaletteToExercise(exCtx.exercise, sessionPalette);
    // Ejercicio con dos modelos: wrapper de alternancia (alumno y preview del profesor)
    if (exModels.length > 1 && (exCtx.mode === "student" || exCtx.mode === "preview")) {
      return <MultiModelSessionView exercise={sessionExercise} mode={exCtx.mode} onSubmit={submitAnswer} onBack={onBack} />;
    }
    // Ejercicio de un solo modelo (o modo record/preview con el modelo primario)
    const m = exModels[0];
    if (m === "esquema") {
      return <SchemaExerciseView exercise={sessionExercise} mode={exCtx.mode} onSubmit={submitAnswer} onBack={onBack} />;
    }
    if (exCtx.mode === "student" && m === "cuestionario") {
      return <QuestionnaireView exercise={sessionExercise} onSubmit={submitAnswer} onBack={onBack} />;
    }
    return <ExerciseView exercise={sessionExercise} mode={exCtx.mode} onSubmit={submitAnswer} onBack={onBack} />;
  }

  // ── Gestor de preguntas (cuestionario) ──
  if (route.name === "question-manager") {
    if (isStudent) { navigate("/alumno"); return null; }
    if (!qmCtx) return <NotFound to="/profesor" />;
    return (
      <QuestionManagerView
        exercise={qmCtx.exercise}
        onSave={(questions) => { updateExercise(qmCtx.exercise.id, { questions }); navigate("/profesor"); }}
        onBack={() => navigate("/profesor")}
      />
    );
  }

  // ── Corrección (depende del resultado recién entregado) ──
  if (route.name === "correction") {
    const back = route.params.from === "teacher" ? "/profesor" : "/alumno";
    if (!exCtx) return <NotFound to={back} />;
    if (!lastResult) {
      // La corrección no se puede reconstruir desde un enlace pegado/recargado
      return <NotFound to={exCtx ? `/alumno/ejercicio/${exCtx.exercise.id}` : back} />;
    }
    const wasPreview = route.params.from === "teacher";
    const corrPalette = effectivePaletteId({ schemaPalette: lastResult?.schemaPalette }, user?.defaultPalette);
    return (
      <CorrectionView
        exercise={applyPaletteToExercise(freshExercise(exCtx.exercise), corrPalette)}
        result={lastResult} margin={margin}
        onBack={() => { setLastResult(null); navigate(wasPreview ? "/profesor" : "/alumno"); }}
      />
    );
  }

  // ── Panel del alumno ──
  if (isStudent) {
    const visibleExercises = exercises; // (heurística actual: banco completo)
    return (
      <StudentDash
        user={user}
        exercises={visibleExercises}
        results={userResults}
        courses={courses}
        units={units}
        groups={groups}
        tab={route.name === "student" ? route.params.tab : "all"}
        onTab={(t) => navigate(t === "courses" ? "/alumno/cursos" : "/alumno")}
        onExercise={(ex) => openEx(ex, "student")}
        onViewCorrection={openCorrection}
        onLogout={onLogout}
        onChangeTeacher={user.isGuest ? null : () => navigate("/alumno/elegir-profesor")}
        onUpdatePalette={(id) => updateUser({ ...user, defaultPalette: id })}
      />
    );
  }

  // ── Panel del profesor / admin ──
  return (
    <TeacherDash
      currentUser={user}
      users={users}
      onAddUser={addUser}
      onRemoveUser={removeUser}
      onUpdateUser={updateUser}
      exercises={exercises}
      onUpdateExercise={updateExercise}
      onDeleteExercise={deleteExercise}
      results={results}
      margin={margin} onMargin={updateMargin}
      tab={route.name === "teacher" ? route.params.tab : "exercises"}
      onTab={(t) => navigate(TEACHER_TAB_PATH[t] || "/profesor")}
      detailExId={route.name === "teacher-detail" ? (route.params.exId === "nuevo" ? "new" : route.params.exId) : null}
      onSelectExercise={(id) => {
        if (id == null) navigate(route.name === "teacher" ? (TEACHER_TAB_PATH[route.params.tab] || "/profesor") : "/profesor");
        else if (id === "new") navigate("/profesor/ejercicio/nuevo");
        else navigate(`/profesor/ejercicio/${id}`);
      }}
      onRecord={(ex) => openEx(freshExercise(ex), "record")}
      onManageQuestions={(ex) => navigate(`/profesor/ejercicio/${ex.id}/preguntas`)}
      onPreview={(ex) => navigate(`/profesor/ejercicio/${ex.id}/previsualizar`)}
      onAdd={addExercise}
      onLogout={onLogout}
      categories={categories}
      onAddCategory={addCategory}
      onUpdateCategory={updateCategory}
      onDeleteCategory={deleteCategory}
      onToggleGlobalCategory={toggleGlobalCategory}
      courses={courses} units={units}
      onAddCourse={addCourse} onUpdateCourse={updateCourse} onDeleteCourse={deleteCourse}
      onAddUnit={addUnit} onUpdateUnit={updateUnit} onDeleteUnit={deleteUnit}
      onAddExercisesToUnit={addExercisesToUnit}
      onRemoveExerciseFromUnit={removeExerciseFromUnit}
      groups={groups} onAddGroup={addGroup} onUpdateGroup={updateGroup} onDeleteGroup={deleteGroup}
      onSaveCorrection={saveCorrection}
      audioLibrary={audioLibrary}
      onAddAudio={addAudio} onUpdateAudio={updateAudio} onDeleteAudio={deleteAudio}
    />
  );
}
