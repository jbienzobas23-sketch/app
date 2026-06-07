// ═══ EXERCISEDETAILVIEW (CREACIÓN/EDICIÓN DE EJERCICIO) ══════════════════════
// Extraída de teacher.jsx (Fase 2, subdivisión).
import { useState, useRef, useMemo, type ComponentType } from "react";
import type { Exercise, Category, Button } from "../lib/types.js";
import { C, F, S, FONT_SANS, FONT_MONO, SECTION_STYLE } from "../theme/tokens.js";
import { fmt } from "../lib/ids.js";
import { buildWaveformFromPCM, fetchAudioBuffer } from "../lib/audio.js";
import { SCHEMA_LEVELS } from "../lib/schema.js";
import { SCHEMA_PALETTE_DEFAULT, schemaBlockColor } from "../lib/palette.js";
import { DEFAULT_MODEL_ID, MODEL_COMBOS, comboIdFromModels, categoriesOf, modelsOf, answerFor, answerStats, questionsOf } from "../lib/domain.js";
import { MODEL_META } from "../lib/modelMeta.js";
import { DEFAULT_CATEGORY } from "../seed.js";
import { ConfirmModal, AudioWaveIcon, CtaButton } from "./primitives.jsx";
import { FragmentRangeSelector as _FragmentRangeSelector } from "./session.jsx";
import { AudioLibraryPickerModal, type AudioItem } from "./modals.js";

// session.jsx aún sin tipar; el cast permite consumirlo desde TSX.
const FragmentRangeSelector = _FragmentRangeSelector as ComponentType<any>;

// Categoría con botones garantizados (las que llegan por props siempre los tienen).
type CatWithButtons = Category & { buttons: Button[] };
// Bloque del esquema de referencia (clave) almacenado en el ejercicio.
interface KeyBlock { level: number; start: number; end: number; label?: string; [k: string]: unknown; }

interface ExerciseDetailViewProps {
  exercise: Exercise | null;
  onBack: () => void;
  onRecord: (ex: Exercise) => void;
  onPreview?: (ex: Exercise) => void;
  onManageQuestions?: (ex: Exercise) => void;
  onUpdate: (patch: Record<string, unknown>) => void;
  onCreate: (ex: Record<string, unknown>) => void;
  onDelete: () => void;
  categories: Category[];
  audioLibrary?: AudioItem[];
}

// ═══ 12. EXERCISE DETAIL VIEW (creación/edición de ejercicio) ═══════════════
export function ExerciseDetailView({ exercise: exerciseProp, onBack, onRecord, onPreview, onManageQuestions, onUpdate, onCreate, onDelete, categories: categoriesProp, audioLibrary = [] }: ExerciseDetailViewProps) {
  // Las categorías reales siempre traen `buttons`; lo garantizamos para el formulario.
  const categories = categoriesProp as CatWithButtons[];
  const isCreating = exerciseProp == null;
  // En modo creación no se accede a los campos de `exercise` (todo va guardado
  // por `isCreating`); el cast evita propagar `| null` por todo el componente.
  const exercise = exerciseProp as Exercise;

  // Estado del formulario
  const [title, setTitle] = useState(isCreating ? "" : (exercise.title ?? ""));
  // comboId: id de MODEL_COMBOS — puede ser un solo modelo o un combo doble
  const [comboId, setComboId] = useState(() =>
    isCreating ? DEFAULT_MODEL_ID : comboIdFromModels(modelsOf(exercise))
  );
  const activeCombo   = MODEL_COMBOS.find((c) => c.id === comboId) || MODEL_COMBOS[0];
  const selectedModels = activeCombo.models;          // ej. ["interactivo","cuestionario"]
  const model          = selectedModels[0];           // modelo primario (backward compat)

  const initialCatIds = useMemo<Set<string>>(() => {
    if (isCreating) return new Set([categories[0]?.id || "default"]);
    const exIds = new Set(categoriesOf(exercise).map((m) => m.id));
    const valid = categories.filter((m) => exIds.has(m.id)).map((m) => m.id);
    return new Set(valid.length ? valid : [categories[0]?.id || "default"]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Map<catId, Set<btnId>>
  const initialBtnIds = useMemo<Map<string, Set<string>>>(() => {
    const map = new Map<string, Set<string>>();
    categories.forEach((cat) => {
      const exCat = isCreating ? null : categoriesOf(exercise).find((c) => c.id === cat.id);
      map.set(cat.id, new Set((exCat ? (exCat.buttons ?? []) : cat.buttons).map((b) => b.id)));
    });
    return map;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [selectedCategoryIds, setSelectedCategoryIds] = useState<Set<string>>(initialCatIds);
  const [selectedButtonIds,   setSelectedButtonIds]   = useState<Map<string, Set<string>>>(initialBtnIds);

  const [audioUrl,       setAudioUrl]       = useState<string | null>(isCreating ? null : (exercise.audioUrl || null));
  const [audioName,      setAudioName]      = useState<string | null>(isCreating ? null : ((exercise.audioName as string | undefined) || null));
  const [audioDuration,  setAudioDuration]  = useState<number | null>(() => {
    if (isCreating) return null;
    const lib = (exercise.audioUrl || null)
      ? audioLibrary.find(a => a.url === exercise.audioUrl)
      : null;
    return lib?.duration || (exercise.audioTotalDuration as number | undefined) || null;
  });
  const [waveformData,   setWaveformData]   = useState<number[] | null>(isCreating ? null : (exercise.waveformData || null));
  // Fragmento de audio: inicio y fin en el audio completo (segundos), o null = sin fragmento
  const [fragStart,      setFragStart]      = useState<number | null>(isCreating ? null : (exercise.audioFragmentStart ?? null));
  const [fragEnd,        setFragEnd]        = useState<number | null>(isCreating ? null : (exercise.audioFragmentEnd   ?? null));
  const [manualDuration, setManualDuration] = useState(
    !isCreating && !exercise.audioName && exercise.duration ? String(exercise.duration) : ""
  );
  const [showConfirmDel,    setShowConfirmDel]    = useState(false);
  const [showLibraryPicker, setShowLibraryPicker] = useState(false);
  const [listenOnly,                setListenOnly]                = useState<boolean>(isCreating ? false : Boolean(exercise.listenOnly ?? false));
  const [immediateSchemaFeedback,   setImmediateSchemaFeedback]   = useState<boolean>(isCreating ? false : Boolean(exercise.immediateSchemaFeedback ?? false));
  const [showComposer,              setShowComposer]              = useState(isCreating ? true  : (exercise.showComposer ?? true));
  const [schemaLevels,      setSchemaLevels]      = useState<Set<number>>(
    () => new Set(isCreating ? [1,2,3,4] : ((exercise.schemaLevels as number[] | undefined) ?? [1,2,3,4]))
  );
  const toggleSchemaLevel = (id: number) => setSchemaLevels(prev => {
    const n = new Set(prev);
    if (n.has(id)) { if (n.size > 1) n.delete(id); } else n.add(id);
    return n;
  });

  const toggleCategory = (id: string) => setSelectedCategoryIds((prev) => {
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

  const toggleButton = (catId: string, btnId: string) => setSelectedButtonIds((prev) => {
    const next = new Map(prev);
    const btns = new Set(next.get(catId) || []);
    if (btns.has(btnId)) { if (btns.size > 1) btns.delete(btnId); } else btns.add(btnId);
    next.set(catId, btns);
    return next;
  });

  // BUG FIX: cancelación de detecciones de audio obsoletas cuando el usuario
  // pega otra URL antes de que termine la primera decodificación.
  const urlReqRef = useRef(0);
  const handleUrlInput = (rawUrl: string) => {
    const url = rawUrl.trim();
    setAudioUrl(url || null);
    setAudioName(url ? (url.split("/").pop()?.split("?")[0] || "audio") : null);
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

  const handlePickFromLibrary = (audio: AudioItem) => {
    urlReqRef.current++;                        // descarta cualquier carga en curso
    setAudioUrl(audio.url ?? null);
    setAudioName(audio.title ?? null);
    setAudioDuration(audio.duration ?? null);
    setWaveformData(null);                      // se recalcula al reproducir
    setManualDuration(String(audio.duration ?? ""));
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
  const effDuration: number = hasExistingAudio
    ? (fragStart != null && fragEnd != null
        ? Math.round((fragEnd - fragStart) * 10) / 10
        : (audioDuration || (!isCreating ? (exercise.duration ?? 0) : 0)))
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
      const exLvs = new Set((exercise.schemaLevels as number[] | undefined) ?? [1,2,3,4]);
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

    const applyBtnFilter = (cat: CatWithButtons): CatWithButtons => {
      const selBtns = selectedButtonIds.get(cat.id);
      const btns    = selBtns ? cat.buttons.filter((b) => selBtns.has(b.id)) : cat.buttons;
      return { ...cat, buttons: btns.length >= 1 ? btns : cat.buttons };
    };
    const safe = (chosen.length ? chosen : (hasInteractivo ? [DEFAULT_CATEGORY as CatWithButtons] : [])).map(applyBtnFilter);
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

    const patch: Record<string, unknown> = { title: title.trim(), duration: effDuration, model, models: selectedModels };
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
                    {fmt(fragStart ?? 0)} – {fmt(fragEnd ?? 0)}
                  </span>
                )}
              </p>
              <FragmentRangeSelector
                totalDuration={totalAudioDuration}
                start={fragStart}
                end={fragEnd}
                onChange={({ start, end }: { start: number; end: number }) => { setFragStart(start); setFragEnd(end); }}
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
                                <span style={{ fontSize: 10, color: C.muted, fontFamily: FONT_MONO, marginLeft: "auto" }}>[{(btn.key ?? "").toUpperCase()}]</span>
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
              const key = (exercise.schemaKey as KeyBlock[] | undefined) ?? [];
              const hasKey = key.length > 0;
              const keyLvls = exercise.schemaLevels as number[] | undefined;
              const keyLevels = SCHEMA_LEVELS.filter(lv => !keyLvls || keyLvls.length === 0 || keyLvls.includes(lv.id));
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
                              const exDur = exercise.duration || 1;
                              const lPct = (b.start / exDur) * 100;
                              const wPct = Math.max(((b.end - b.start) / exDur) * 100, 0.5);
                              const { bg, textColor } = schemaBlockColor(b, key, (exercise.schemaPalette as string | undefined) || SCHEMA_PALETTE_DEFAULT);
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
              <button onClick={() => onRecord(exercise)} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "space-between", background: !(exercise.schemaKey as unknown[] | undefined)?.length ? C.ink : C.paper2, color: !(exercise.schemaKey as unknown[] | undefined)?.length ? C.paper : C.ink, border: !(exercise.schemaKey as unknown[] | undefined)?.length ? `1px solid ${C.ink}` : `1.5px solid ${C.line}`, borderRadius: 12, padding: "13px 18px", cursor: "pointer", fontSize: 14, fontWeight: 600 }}>
                <span>{(exercise.schemaKey as unknown[] | undefined)?.length ? "Regrabar clave" : "Grabar clave"}</span>
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
