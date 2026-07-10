// ═══ SESSIONSHELL (M4.1) ══════════════════════════════════════════════════════
// Envoltorio único de sesión del alumno: sustituye a las dos vistas de sesión
// previas (una para multiparte, otra para el alternador de modelo — ambas
// borradas). Dos ejes de navegación como nodos del mismo shell: chips de
// parte (multiparte) y alternador de modelo (combo). Con una parte y un
// modelo el shell es transparente (solo la vista, sin cromo).
//
// Sin remontaje al alternar de MODELO (el pestañeo que arreglaba M4): las vistas
// de los modelos del combo de la parte activa se montan UNA vez y el toggle
// alterna `style.display` — cero construcción/parpadeo. La vista oculta recibe
// active=false (pausa su rAF de dibujo, ignora el teclado, no fija loopRegion).
// El cambio de PARTE sí remonta (LRU-1: solo la parte activa montada), vía la
// `key` de PartRunner — mismo criterio que la LRU-1 de la MultiPart previa.
//
// Precalentamiento del chunk de esquema: al montar un combo que lo incluye, la
// vista de esquema (lazy) se monta oculta y su chunk carga de inmediato — así
// el primer toggle a esquema es instantáneo (ya está en memoria), sin blanco.
import { useState, useEffect, useMemo, useRef, lazy, Suspense, type ReactNode } from "react";
import type { Exercise, Part } from "../lib/types.js";
import type { Block } from "../lib/repeats.js";
import { C, F, S, FONT_SANS } from "../theme/tokens.js";
import { partsOf, partToExercise, modelsOf, serializeIntervals } from "../lib/domain.js";
import { parseHashQuery, setHashQuery } from "../lib/routing.js";
import { useAudioPlayer } from "../hooks/useAudioPlayer.js";
import { ConfirmModal } from "./primitives.jsx";
import { ModelToggleBar } from "./student.js";
import { ExerciseView } from "./ExerciseView.js";
import { QuestionnaireView } from "./QuestionnaireView.js";

const SchemaExerciseView = lazy(() => import("./SchemaExerciseView.js").then((m) => ({ default: m.SchemaExerciseView })));
const schemaFallback = <div style={{ minHeight: "100dvh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", color: C.muted, fontSize: 14 }}>Cargando…</div>;

interface Props {
  exercise: Exercise;
  mode: string;
  onSubmit: (r: unknown) => void;
  onBack: () => void;
}

// drafts[partId][modelId] = borrador en el mismo formato que produce/consume
// cada vista hija (Record<catId,IV[]> · Record<qId,respuesta> · Block[]).
type Drafts = Record<string, Record<string, unknown>>;

// ¿El alumno ha empezado a responder esta parte con este modelo? Definición
// mínima para la guardia de "partes incompletas" — solo haber tocado algo.
function isModelStarted(modelId: string, draft: unknown, projected: Exercise): boolean {
  if (modelId === "cuestionario") {
    const qs = projected.questions ?? [];
    const ans = (draft as Record<string, string>) || {};
    return qs.length > 0 && qs.every((q) => ans[q.id] !== undefined && ans[q.id] !== "");
  }
  if (modelId === "esquema") return Array.isArray(draft) && (draft as Block[]).length > 0;
  const byCategory = (draft as Record<string, unknown[]>) || {};
  return Object.values(byCategory).some((ivs) => Array.isArray(ivs) && ivs.length > 0);
}

// Traduce el borrador al payload "en bruto" que ya produce cada vista al
// entregar — App.submitAnswer puntúa desde aquí igual que en una sola parte.
function draftToPayload(modelId: string, draft: unknown, projected: Exercise): unknown {
  if (modelId === "cuestionario") return { answers: (draft as Record<string, string>) || {} };
  if (modelId === "esquema") return { blocks: (draft as Block[]) || [], schemaPalette: projected.schemaPalette };
  const byCategory = (draft as Record<string, Array<{ fn: string; start: number; end: number; fig?: string | null }>>) || {};
  const entries = Object.entries(byCategory).map(([categoryId, ivs]) => ({
    categoryId,
    intervals: serializeIntervals(ivs || []),
  }));
  const currentCategoryId = entries[0]?.categoryId || (projected.categories ?? [])[0]?.id;
  return { entries, currentCategoryId };
}

// ── PartRunner: los modelos del combo de UNA parte, keep-mounted ──────────────
// Owns el reproductor de audio compartido de la parte (decodificado una vez), el
// modelo activo y el montaje simultáneo de las vistas del combo (display toggle).
interface PartRunnerProps {
  partExercise: Exercise;
  mode: string;
  onSubmit: (r: unknown) => void;
  onBack: () => void;
  partDrafts: Record<string, unknown>;
  onModelDraftChange: (modelId: string, draft: unknown) => void;
  extraToggleNode?: ReactNode;   // chips de parte (multiparte); antes del selector de modelo
}
function PartRunner({ partExercise, mode, onSubmit, onBack, partDrafts, onModelDraftChange, extraToggleNode = null }: PartRunnerProps) {
  const models = modelsOf(partExercise);
  const [activeModelIdx, setActiveModelIdx] = useState(0);

  // Audio compartido: decodificado una vez, persiste entre cambios de modelo.
  // loopRegionRef lo actualiza QuestionnaireView con su lockedQuestion; se pasa
  // tal cual tanto al reproductor como a la vista de cuestionario (misma ref).
  const [sharedWaveformData, setSharedWaveformData] = useState(partExercise.waveformData || null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const loopRegionRef = useRef<any>(null);
  const onWaveform    = sharedWaveformData ? null : (wd: number[]) => setSharedWaveformData(wd);
  // stopAtLoopEnd: solo lo activa QuestionnaireView (única que fija loopRegionRef
  // aquí); sin efecto para los demás modelos del combo, que nunca lo tocan.
  const rawPlayer     = useAudioPlayer(partExercise, { onWaveform, loopRegionRef, stopAtLoopEnd: true });
  const sharedAudioPlayer = { ...rawPlayer, waveformData: sharedWaveformData };

  // Al alternar de modelo: cancelar cualquier bucle de fragmento activo, y
  // reset de scroll instantáneo (sin animación) — la vista nueva empieza arriba.
  useEffect(() => {
    loopRegionRef.current = null;
    window.scrollTo(0, 0);
  }, [activeModelIdx]);

  const toggleNode: ReactNode = (
    <>
      {extraToggleNode}
      {models.length > 1 && <ModelToggleBar models={models} activeIdx={activeModelIdx} onSwitch={setActiveModelIdx} />}
    </>
  );

  return (
    <>
      {models.map((m, i) => {
        const isActive = i === activeModelIdx;
        const common = {
          exercise: partExercise, onBack, active: isActive,
          modelToggleNode: toggleNode, sharedAudioPlayer,
          initialDraft: partDrafts[m] as never,
          onDraftChange: (d: unknown) => onModelDraftChange(m, d),
        };
        let view: ReactNode;
        if (m === "esquema") {
          view = (
            <Suspense fallback={schemaFallback}>
              <SchemaExerciseView {...common} mode={mode} onSubmit={onSubmit} />
            </Suspense>
          );
        } else if (m === "cuestionario") {
          view = <QuestionnaireView {...common} onSubmit={onSubmit} loopRegionRef={loopRegionRef} />;
        } else {
          view = <ExerciseView {...common} mode={mode} onSubmit={onSubmit} />;
        }
        return <div key={m} style={{ display: isActive ? "block" : "none" }}>{view}</div>;
      })}
    </>
  );
}

export function SessionShell({ exercise, mode, onSubmit, onBack }: Props) {
  const parts = useMemo(() => partsOf(exercise), [exercise]);
  const isMultiPart = parts.length > 1;

  // Posición inicial desde `?parte=n` (T3.6): recargar conserva la parte activa.
  const [activeIdx, setActiveIdx] = useState(() => {
    const n = parseInt(parseHashQuery().parte || "1", 10);
    return Number.isFinite(n) && n >= 1 && n <= parts.length ? n - 1 : 0;
  });
  const [drafts, setDrafts] = useState<Drafts>({});
  const [incompleteWarning, setIncompleteWarning] = useState<Part[] | null>(null);

  const activePart = parts[activeIdx] || parts[0];
  const partExercise = useMemo(() => partToExercise(exercise, activePart), [exercise, activePart]);
  const partModels = modelsOf(partExercise);

  const goToPart = (idx: number) => {
    setActiveIdx(idx);
    setHashQuery({ parte: String(idx + 1) });
    window.scrollTo(0, 0);
  };

  const setPartDraft = (partId: string, modelId: string, draft: unknown) => {
    setDrafts((prev) => ({ ...prev, [partId]: { ...(prev[partId] || {}), [modelId]: draft } }));
  };

  const isPartComplete = (part: Part): boolean => {
    const projected = partToExercise(exercise, part);
    const models = modelsOf(projected);
    const partDrafts = drafts[part.id] || {};
    return models.every((m) => isModelStarted(m, partDrafts[m], projected));
  };

  const finalize = () => {
    const byPart: Record<string, { points: number; byModel: Record<string, unknown> }> = {};
    parts.forEach((p) => {
      const projected = partToExercise(exercise, p);
      const byModel: Record<string, unknown> = {};
      modelsOf(projected).forEach((m) => { byModel[m] = draftToPayload(m, drafts[p.id]?.[m], projected); });
      byPart[p.id] = { points: p.points ?? 1, byModel };
    });
    onSubmit({ type: "multi", parts: byPart });
  };

  const attemptFinalize = () => {
    const incomplete = parts.filter((p) => !isPartComplete(p));
    if (incomplete.length > 0) { setIncompleteWarning(incomplete); return; }
    finalize();
  };

  // Entregar de una parte (botón propio de cada vista): en multiparte significa
  // "guardar esta parte y continuar" — avanza a la primera pendiente, o intenta
  // la entrega final. En una sola parte, va directo al onSubmit real.
  const handlePartSubmit = () => {
    const nextIdx = parts.findIndex((p, i) => i !== activeIdx && !isPartComplete(p));
    if (nextIdx === -1) { attemptFinalize(); return; }
    goToPart(nextIdx);
  };

  // Sesión de una sola parte: el shell es transparente (sin chips ni finalize);
  // el submit de la vista va directo al onSubmit real. La única navegación es el
  // alternador de modelo (si el ejercicio es un combo), dentro de PartRunner.
  if (!isMultiPart) {
    return (
      <PartRunner
        key={activePart.id}
        partExercise={partExercise}
        mode={mode}
        onSubmit={onSubmit}
        onBack={onBack}
        partDrafts={drafts[activePart.id] || {}}
        onModelDraftChange={(m, d) => setPartDraft(activePart.id, m, d)}
      />
    );
  }

  // ── Multiparte: chips de parte + progreso + finalizar ─────────────────────────
  const completeCount = parts.filter(isPartComplete).length;
  let progressText = `Parte ${activeIdx + 1}/${parts.length}`;
  if (activePart.title) progressText += ` · ${activePart.title}`;
  if (activePart.composerName) progressText += ` — ${activePart.composerName}`;
  if (partModels.length === 1 && partModels[0] === "cuestionario") {
    const qs = partExercise.questions ?? [];
    const ans = (drafts[activePart.id]?.cuestionario as Record<string, string>) || {};
    const done = qs.filter((q) => ans[q.id] !== undefined && ans[q.id] !== "").length;
    progressText += ` · ${done}/${qs.length} respondidas`;
  }

  const partNav = (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
        {parts.map((p, i) => {
          const complete = isPartComplete(p);
          const isActivePart = i === activeIdx;
          const stateLabel = complete ? "✓" : isActivePart ? "actual" : "—";
          return (
            <button key={p.id} type="button" onClick={() => goToPart(i)}
              title={`${p.title || `Parte ${i + 1}`} · ${stateLabel}`}
              style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                padding: "5px 12px", borderRadius: 999,
                border: `1.5px solid ${isActivePart ? C.ink : complete ? C.fnT : C.line}`,
                background: isActivePart ? C.ink : complete ? `${C.fnT}14` : "transparent",
                color: isActivePart ? C.paper : complete ? C.fnT : C.muted,
                fontFamily: FONT_SANS, fontSize: 12, fontWeight: 700, cursor: "pointer",
              }}>
              <span>{i + 1}</span>
              <span style={{ fontSize: 10, fontWeight: 600 }}>{stateLabel}</span>
            </button>
          );
        })}
      </div>
      <div style={{ textAlign: "center", fontFamily: F.sans, fontSize: 12, color: C.muted, marginBottom: 8 }}>
        {progressText}
      </div>
      <div style={{ display: "flex", justifyContent: "center" }}>
        <button type="button" onClick={attemptFinalize} className="fa-pressable"
          style={{ ...S.btn, fontSize: 12, padding: "6px 16px" }}>
          Finalizar entrega ({completeCount}/{parts.length} completas)
        </button>
      </div>
    </div>
  );

  return (
    <>
      <PartRunner
        key={activePart.id}
        partExercise={partExercise}
        mode={mode}
        onSubmit={handlePartSubmit}
        onBack={onBack}
        partDrafts={drafts[activePart.id] || {}}
        onModelDraftChange={(m, d) => setPartDraft(activePart.id, m, d)}
        extraToggleNode={partNav}
      />
      {incompleteWarning && (
        <ConfirmModal
          message={
            `Faltan ${incompleteWarning.length} ${incompleteWarning.length === 1 ? "parte" : "partes"} por responder:\n\n` +
            incompleteWarning.map((p) => `· Parte ${parts.findIndex((x) => x.id === p.id) + 1}${p.title ? ` — ${p.title}` : ""}`).join("\n") +
            `\n\nSe te llevará a la primera parte pendiente.`
          }
          confirmLabel="Ir a la primera pendiente"
          onConfirm={() => {
            const idx = parts.findIndex((p) => p.id === incompleteWarning[0].id);
            setIncompleteWarning(null);
            goToPart(idx);
          }}
          onCancel={() => setIncompleteWarning(null)}
        />
      )}
    </>
  );
}
