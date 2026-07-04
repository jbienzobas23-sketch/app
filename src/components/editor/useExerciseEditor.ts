// ═══ useExerciseEditor (M5) ═══════════════════════════════════════════════════
// Estado, guardado, isDirty, guardias y derivados del editor de ejercicios —
// EXTRAÍDOS VERBATIM de ExerciseDetailView (sin cambiar la lógica ni la forma
// del guardado). El asistente de 5 pasos (EditorShell + Paso1…Paso5) es solo
// una reorganización de la presentación por encima de este hook, de modo que un
// ejercicio se guarda EXACTAMENTE igual que antes (byte-idéntico): una parte →
// campos planos; dos o más → parts[]. Ver PLAN_MAESTRO_2 M5 y la decisión de
// producto de conservar la forma de guardado.
import { useState, useRef, useMemo } from "react";
import type { Exercise, Category, Button, Part } from "../../lib/types.js";
import { buildWaveformFromPCM, fetchAudioBuffer } from "../../lib/audio.js";
import { DEFAULT_MODEL_ID, MODEL_COMBOS, comboIdFromModels, modelsOf, answerStats, partsOf } from "../../lib/domain.js";
import { DEFAULT_CATEGORY } from "../../seed.js";
import { DEFAULT_MARGIN, DEFAULT_SCHEMA_MARGIN } from "../../lib/sessionConstants.js";
import type { AudioItem } from "../modals.js";

export const MAX_PARTS = 8;
type CatWithButtons = Category & { buttons: Button[] };

export interface ExerciseEditorProps {
  exercise: Exercise | null;
  onBack: () => void;
  onRecord: (ex: Exercise, partId?: string) => void;
  onPreview?: (ex: Exercise, partId?: string) => void;
  onManageQuestions?: (ex: Exercise, partId?: string) => void;
  onUpdate: (patch: Record<string, unknown>) => void;
  onCreate: (ex: Record<string, unknown>) => void;
  onDelete: () => void;
  categories: Category[];
  audioLibrary?: AudioItem[];
}

export function useExerciseEditor({ exercise: exerciseProp, onBack, onRecord, onPreview, onManageQuestions, onUpdate, onCreate, onDelete, categories: categoriesProp, audioLibrary = [] }: ExerciseEditorProps) {
  const categories = categoriesProp as CatWithButtons[];
  const isCreating = exerciseProp == null;
  const exercise = exerciseProp as Exercise;

  // ── Estado del formulario ──────────────────────────────────────────────────
  const [title, setTitle] = useState(isCreating ? "" : (exercise.title ?? ""));
  const [comboId, setComboId] = useState(() =>
    isCreating ? DEFAULT_MODEL_ID : comboIdFromModels(modelsOf(exercise))
  );
  const activeCombo    = MODEL_COMBOS.find((c) => c.id === comboId) || MODEL_COMBOS[0];
  const selectedModels = activeCombo.models;
  const model          = selectedModels[0];

  const initialCatIds = useMemo<Set<string>>(() => {
    if (isCreating) return new Set([categories[0]?.id || "default"]);
    const exIds = new Set((exercise.categories ?? []).map((m) => m.id));
    const valid = categories.filter((m) => exIds.has(m.id)).map((m) => m.id);
    return new Set(valid.length ? valid : [categories[0]?.id || "default"]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const initialBtnIds = useMemo<Map<string, Set<string>>>(() => {
    const map = new Map<string, Set<string>>();
    categories.forEach((cat) => {
      const exCat = isCreating ? null : (exercise.categories ?? []).find((c) => c.id === cat.id);
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
    const lib = (exercise.audioUrl || null) ? audioLibrary.find(a => a.url === exercise.audioUrl) : null;
    return lib?.duration || (exercise.audioTotalDuration as number | undefined) || null;
  });
  const [waveformData,   setWaveformData]   = useState<number[] | null>(isCreating ? null : (exercise.waveformData || null));
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
  const [exMargin,       setExMargin]       = useState<number>(isCreating ? DEFAULT_MARGIN : (exercise.margin ?? DEFAULT_MARGIN));
  const [exSchemaMargin, setExSchemaMargin] = useState<number>(isCreating ? DEFAULT_SCHEMA_MARGIN : (exercise.schemaMargin ?? DEFAULT_SCHEMA_MARGIN));
  const toggleSchemaLevel = (id: number) => setSchemaLevels(prev => {
    const n = new Set(prev);
    if (n.has(id)) { if (n.size > 1) n.delete(id); } else n.add(id);
    return n;
  });

  // ── Partes (F4, T4.2) ───────────────────────────────────────────────────────
  const initialParts = useMemo<Part[]>(
    () => (!isCreating && partsOf(exercise).length > 1) ? partsOf(exercise) : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  const [parts, setParts] = useState<Part[]>(initialParts);
  const isMultiPart = parts.length > 0;
  const [libraryPickerForPart, setLibraryPickerForPart] = useState<string | null>(null);
  const [confirmDeletePart,    setConfirmDeletePart]    = useState<string | null>(null);

  const addMultiPart = () => {
    const part1: Part = {
      id: "p1",
      audioUrl: audioUrl ?? undefined, audioName: audioName ?? undefined,
      duration: effDuration,
      audioFragmentStart: fragStart ?? undefined, audioFragmentEnd: fragEnd ?? undefined,
      audioTotalDuration: totalAudioDuration ?? undefined, waveformData: waveformData ?? undefined,
      answers: exercise.answers as Record<string, unknown[]> | undefined,
      schemaKey: exercise.schemaKey as unknown[] | undefined,
      questions: exercise.questions,
      composerName: activeComposer || undefined,
      points: 1,
    };
    const part2: Part = { id: `p${Date.now()}`, points: 1 };
    setParts([part1, part2]);
  };
  const updatePartField = (partId: string, patch: Partial<Part>) =>
    setParts((prev) => prev.map((p) => (p.id === partId ? { ...p, ...patch } : p)));
  const movePart = (partId: string, dir: -1 | 1) =>
    setParts((prev) => {
      const idx = prev.findIndex((p) => p.id === partId);
      const swapIdx = idx + dir;
      if (idx < 0 || swapIdx < 0 || swapIdx >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
      return next;
    });
  const duplicatePart = (partId: string) =>
    setParts((prev) => {
      if (prev.length >= MAX_PARTS) return prev;
      const idx = prev.findIndex((p) => p.id === partId);
      if (idx < 0) return prev;
      const clone: Part = { ...prev[idx], id: `p${Date.now()}` };
      const next = [...prev];
      next.splice(idx + 1, 0, clone);
      return next;
    });
  const removePart = (partId: string) =>
    setParts((prev) => (prev.length > 1 ? prev.filter((p) => p.id !== partId) : prev));
  const addEmptyPart = () =>
    setParts((prev) => prev.length < MAX_PARTS ? [...prev, { id: `p${Date.now()}`, points: 1 }] : prev);
  const pickAudioForPart = (partId: string, audio: AudioItem) => {
    updatePartField(partId, {
      audioUrl: audio.url ?? null, audioName: audio.title ?? null,
      duration: audio.duration ?? undefined, audioTotalDuration: audio.duration ?? undefined,
      waveformData: undefined, audioFragmentStart: undefined, audioFragmentEnd: undefined,
    });
    setLibraryPickerForPart(null);
  };

  const toggleCategory = (id: string) => setSelectedCategoryIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) { if (next.size > 1) next.delete(id); return next; }
    const cat = categories.find((c) => c.id === id);
    if (cat?.hasFigures) return new Set([id]);
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
        if (reqId !== urlReqRef.current) return;
        setAudioDuration(Math.ceil(decoded.duration));
        setWaveformData(buildWaveformFromPCM(decoded.getChannelData(0), decoded.duration));
      })
      .catch(() => { try { ctx.close(); } catch { /* ignora */ } });
  };

  const clearAudio = () => {
    setAudioUrl(null); setAudioName(null);
    setAudioDuration(null); setWaveformData(null);
    setFragStart(null); setFragEnd(null);
    urlReqRef.current++;
  };

  const handlePickFromLibrary = (audio: AudioItem) => {
    urlReqRef.current++;
    setAudioUrl(audio.url ?? null);
    setAudioName(audio.title ?? null);
    setAudioDuration(audio.duration ?? null);
    setWaveformData(null);
    setManualDuration(String(audio.duration ?? ""));
    setFragStart(null);
    setFragEnd(null);
    setShowLibraryPicker(false);
  };

  const hasExistingAudio = !!audioName;
  const totalAudioDuration = audioDuration
    || (!audioUrl ? null : audioLibrary.find(a => a.url === audioUrl)?.duration)
    || (!isCreating && !exercise.audioFragmentStart ? exercise.duration : null)
    || null;
  const effDuration: number = hasExistingAudio
    ? (fragStart != null && fragEnd != null
        ? Math.round((fragEnd - fragStart) * 10) / 10
        : (audioDuration || (!isCreating ? (exercise.duration ?? 0) : 0)))
    : (parseInt(manualDuration) || 0);

  const activeComposer = useMemo(() => {
    if (!audioUrl) return null;
    return audioLibrary.find((a) => a.url === audioUrl)?.composer || null;
  }, [audioUrl, audioLibrary]);

  // ── Detección de cambios (solo en edición) ─────────────────────────────────
  const isDirty = useMemo(() => {
    if (isCreating) return false;
    if (isMultiPart && JSON.stringify(parts) !== JSON.stringify(initialParts)) return true;
    if (title.trim() !== exercise.title) return true;
    const exModelsArr = modelsOf(exercise);
    if (selectedModels.join(",") !== exModelsArr.join(",")) return true;
    if (!isMultiPart) {
      if (audioUrl !== (exercise.audioUrl || null)) return true;
      if (!audioName && exercise.audioName) return true;
    }
    if (selectedModels.includes("esquema") && (exercise.listenOnly ?? false) !== listenOnly) return true;
    if (selectedModels.includes("esquema") && (exercise.immediateSchemaFeedback ?? false) !== immediateSchemaFeedback) return true;
    if ((exercise.showComposer ?? true) !== showComposer) return true;
    if (selectedModels.includes("esquema")) {
      const exLvs = new Set((exercise.schemaLevels as number[] | undefined) ?? [1,2,3,4]);
      if (schemaLevels.size !== exLvs.size || [...schemaLevels].some(id => !exLvs.has(id))) return true;
      if ((exercise.schemaMargin ?? DEFAULT_SCHEMA_MARGIN) !== exSchemaMargin) return true;
    }
    if (selectedModels.includes("interactivo")) {
      if ((exercise.margin ?? DEFAULT_MARGIN) !== exMargin) return true;
      const exCats = exercise.categories ?? [];
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
    if (!isMultiPart) {
      if (!hasExistingAudio && !exercise.audioName) {
        const manual = parseInt(manualDuration) || 0;
        if (manual !== exercise.duration) return true;
      }
      if ((fragStart ?? null) !== (exercise.audioFragmentStart ?? null)) return true;
      if ((fragEnd   ?? null) !== (exercise.audioFragmentEnd   ?? null)) return true;
    }
    return false;
  }, [isCreating, title, selectedModels, audioUrl, audioName, selectedCategoryIds, selectedButtonIds, manualDuration, exercise, hasExistingAudio, listenOnly, immediateSchemaFeedback, showComposer, schemaLevels, fragStart, fragEnd, exMargin, exSchemaMargin, isMultiPart, parts, initialParts]);

  const canSave = title.trim().length > 0 && (isMultiPart || effDuration > 0) && (isCreating || isDirty);

  // ── Guardias de cambios sin guardar ────────────────────────────────────────
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const guardIfDirty = (action: () => void) => () => { if (isDirty) setPendingAction(() => action); else action(); };
  const guardedOnBack             = guardIfDirty(onBack);
  const guardedOnRecord           = guardIfDirty(() => onRecord(exercise));
  const guardedOnPreview          = onPreview ? guardIfDirty(() => onPreview(exercise)) : undefined;
  const guardedOnManageOrRecord   = guardIfDirty(() => (onManageQuestions || onRecord)(exercise));
  const guardedOnRecordPart    = (partId: string) => guardIfDirty(() => onRecord(exercise, partId))();
  const guardedOnPreviewPart   = (partId: string) => onPreview && guardIfDirty(() => onPreview(exercise, partId))();
  const guardedOnQuestionsPart = (partId: string) => guardIfDirty(() => (onManageQuestions || onRecord)(exercise, partId))();

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
    const forceHint = hasInteractivo && safe.some((c) => c.hasFigures);

    if (isCreating) {
      onCreate({
        id: Date.now(),
        title: title.trim(),
        duration: effDuration,
        model,
        models: selectedModels,
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

    const patch: Record<string, unknown> = { title: title.trim(), model, models: selectedModels };
    if (isMultiPart) {
      patch.parts = parts;
    } else {
      patch.duration = effDuration;
    }
    if (hasInteractivo) {
      const keepIds = new Set(safe.map((m) => m.id));
      const prev    = exercise.answers || {};
      patch.categories = safe;
      patch.modes      = undefined;
      if (!isMultiPart) patch.answers = Object.fromEntries(Object.entries(prev).filter(([id]) => keepIds.has(id)));
      if (forceHint) patch.showHint = true;
      patch.margin = exMargin;
    } else {
      patch.categories = [];
      if (!isMultiPart) patch.answers = {};
    }
    if (!isMultiPart) {
      patch.audioUrl            = audioUrl     || null;
      patch.audioName           = audioName    || null;
      patch.waveformData        = waveformData || null;
      patch.audioFragmentStart  = fragStart    ?? null;
      patch.audioFragmentEnd    = fragEnd      ?? null;
      patch.audioTotalDuration  = totalAudioDuration || null;
    }
    if (hasEsquema) { patch.listenOnly = listenOnly; patch.immediateSchemaFeedback = immediateSchemaFeedback; patch.schemaLevels = [...schemaLevels]; patch.schemaMargin = exSchemaMargin; }
    patch.showComposer = showComposer;
    if (!isMultiPart) patch.composerName = activeComposer || null;
    if (!isMultiPart && !audioName && exercise.audioName) {
      patch.audioUrl = null; patch.audioName = null; patch.waveformData = null;
      patch.audioFragmentStart = null; patch.audioFragmentEnd = null;
    }
    onUpdate(patch);
  };

  // Estado derivado del ejercicio guardado
  const isQuizSaved = !isCreating && modelsOf(exercise).includes("cuestionario");
  const exQs        = isCreating ? [] : (exercise.questions ?? []);
  const answerStatsSaved = (isCreating || isQuizSaved) ? { recorded: 0, total: 0 } : answerStats(exercise);

  return {
    // datos base
    categories, isCreating, exercise, audioLibrary,
    onBack, onRecord, onPreview, onManageQuestions, onDelete, onUpdate,
    // modelo
    comboId, setComboId, selectedModels, model,
    // identidad
    title, setTitle,
    // categorías interactivo
    selectedCategoryIds, selectedButtonIds, toggleCategory, toggleButton,
    // audio / fragmento (single-part)
    audioUrl, audioName, audioDuration, waveformData, fragStart, setFragStart, fragEnd, setFragEnd,
    manualDuration, setManualDuration, handleUrlInput, clearAudio, handlePickFromLibrary,
    showLibraryPicker, setShowLibraryPicker,
    hasExistingAudio, totalAudioDuration, effDuration, activeComposer,
    // esquema
    listenOnly, setListenOnly, immediateSchemaFeedback, setImmediateSchemaFeedback,
    schemaLevels, toggleSchemaLevel,
    // márgenes
    exMargin, setExMargin, exSchemaMargin, setExSchemaMargin,
    // compositor
    showComposer, setShowComposer,
    // partes
    parts, isMultiPart, addMultiPart, updatePartField, movePart, duplicatePart, removePart, addEmptyPart,
    pickAudioForPart, libraryPickerForPart, setLibraryPickerForPart, confirmDeletePart, setConfirmDeletePart,
    // guardado / dirty / guardias
    isDirty, canSave, handleSave, pendingAction, setPendingAction,
    guardedOnBack, guardedOnRecord, guardedOnPreview, guardedOnManageOrRecord,
    guardedOnRecordPart, guardedOnPreviewPart, guardedOnQuestionsPart,
    // borrar
    showConfirmDel, setShowConfirmDel,
    // derivados guardados
    isQuizSaved, exQs, answerStatsSaved,
  };
}

export type EditorApi = ReturnType<typeof useExerciseEditor>;
