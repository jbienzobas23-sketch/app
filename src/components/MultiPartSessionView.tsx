// ═══ MULTIPARTSESSIONVIEW (SESIÓN MULTIPARTE) ════════════════════════════════
// Envoltorio para ejercicios con más de una parte (F4, T4.3): tira de chips de
// parte, borradores elevados por (parte, modelo) — así saltar de parte o de
// modelo dentro de un híbrido nunca destruye trabajo —, y una sola entrega con
// guardia de partes incompletas. App enruta aquí toda sesión de alumno con más
// de una parte; con una parte, sigue el camino de siempre (este componente ni
// se monta). Ver plan_ejercicios_multiparte.md §3.
//
// Memoria de audio: solo la parte activa está montada (las demás se desmontan),
// así que cada cambio de parte decodifica de nuevo — una LRU de 1, más
// conservadora que la LRU de 2 buffers que sugiere el plan. Se acepta el coste
// (recargar el audio de una parte ya visitada) a cambio de reutilizar tal cual
// el ciclo de vida de useAudioPlayer en las cuatro vistas hijas, sin una caché
// de buffers compartidos entre tipos de parte (simple/híbrida) que añadiría
// riesgo desproporcionado para el caso de uso real (baterías de pocos audios).
import { useState, useMemo, lazy, Suspense } from "react";
import type { Exercise, Part } from "../lib/types.js";
import type { Block } from "../lib/repeats.js";
import { C, F, S, FONT_SANS } from "../theme/tokens.js";
import { partsOf, partToExercise, modelsOf, questionsOf, categoriesOf } from "../lib/domain.js";
import { parseHashQuery, setHashQuery } from "../lib/routing.js";
import { ConfirmModal } from "./primitives.jsx";
import { ExerciseView, type InteractivoDraft } from "./ExerciseView.js";
import { QuestionnaireView } from "./QuestionnaireView.js";
import { MultiModelSessionView } from "./MultiModelSessionView.js";

const SchemaExerciseView = lazy(() => import("./SchemaExerciseView.js").then((m) => ({ default: m.SchemaExerciseView })));
const schemaFallback = <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#b0b0a8", fontSize: 14 }}>Cargando…</div>;

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
// mínima razonable para la guardia de "partes incompletas" — no exige agotar
// el ejercicio (ningún modelo suelto lo exige tampoco), solo haber tocado algo.
function isModelStarted(modelId: string, draft: unknown, projected: Exercise): boolean {
  if (modelId === "cuestionario") {
    const qs = questionsOf(projected);
    const ans = (draft as Record<string, string>) || {};
    return qs.length > 0 && qs.every((q) => ans[q.id] !== undefined && ans[q.id] !== "");
  }
  if (modelId === "esquema") return Array.isArray(draft) && (draft as Block[]).length > 0;
  const byCategory = (draft as Record<string, unknown[]>) || {};
  return Object.values(byCategory).some((ivs) => Array.isArray(ivs) && ivs.length > 0);
}

// Traduce el borrador elevado al formato de payload "en bruto" que ya produce
// cada vista al entregar — App.submitAnswer puntúa desde aquí, igual que hoy
// puntúa desde el payload de una sesión de una sola parte.
function draftToPayload(modelId: string, draft: unknown, projected: Exercise): unknown {
  if (modelId === "cuestionario") return { answers: (draft as Record<string, string>) || {} };
  if (modelId === "esquema") return { blocks: (draft as Block[]) || [], schemaPalette: projected.schemaPalette };
  const byCategory = (draft as Record<string, Array<{ fn: string; start: number; end: number }>>) || {};
  const entries = Object.entries(byCategory).map(([categoryId, ivs]) => ({
    categoryId,
    intervals: (ivs || []).map(({ fn, start, end }) => ({ fn, start, end })),
  }));
  const currentCategoryId = entries[0]?.categoryId || categoriesOf(projected)[0]?.id;
  return { entries, currentCategoryId };
}

export function MultiPartSessionView({ exercise, mode, onSubmit, onBack }: Props) {
  const parts = useMemo(() => partsOf(exercise), [exercise]);

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
      const pModels = modelsOf(projected);
      const byModel: Record<string, unknown> = {};
      pModels.forEach((m) => { byModel[m] = draftToPayload(m, drafts[p.id]?.[m], projected); });
      byPart[p.id] = { points: p.points ?? 1, byModel };
    });
    onSubmit({ type: "multi", parts: byPart });
  };

  const attemptFinalize = () => {
    const incomplete = parts.filter((p) => !isPartComplete(p));
    if (incomplete.length > 0) { setIncompleteWarning(incomplete); return; }
    finalize();
  };

  // Entregar de una parte (botón propio de cada vista hija, sin cambios): en
  // sesión multiparte significa "guardar esta parte y continuar" — avanza a la
  // primera pendiente, o intenta la entrega final si ya no queda ninguna.
  const handlePartSubmit = () => {
    const nextIdx = parts.findIndex((p, i) => i !== activeIdx && !isPartComplete(p));
    if (nextIdx === -1) { attemptFinalize(); return; }
    goToPart(nextIdx);
  };

  const completeCount = parts.filter(isPartComplete).length;

  let progressText = `Parte ${activeIdx + 1}/${parts.length}`;
  if (activePart.title) progressText += ` · ${activePart.title}`;
  if (activePart.composerName) progressText += ` — ${activePart.composerName}`;
  if (partModels.length === 1 && partModels[0] === "cuestionario") {
    const qs = questionsOf(partExercise);
    const ans = (drafts[activePart.id]?.cuestionario as Record<string, string>) || {};
    const done = qs.filter((q) => ans[q.id] !== undefined && ans[q.id] !== "").length;
    progressText += ` · ${done}/${qs.length} respondidas`;
  }

  const partNav = (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
        {parts.map((p, i) => {
          const complete = isPartComplete(p);
          const isActive = i === activeIdx;
          const stateLabel = complete ? "✓" : isActive ? "actual" : "—";
          return (
            <button key={p.id} type="button" onClick={() => goToPart(i)}
              title={`${p.title || `Parte ${i + 1}`} · ${stateLabel}`}
              style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                padding: "5px 12px", borderRadius: 999,
                border: `1.5px solid ${isActive ? C.ink : complete ? C.fnT : C.line}`,
                background: isActive ? C.ink : complete ? `${C.fnT}14` : "transparent",
                color: isActive ? C.paper : complete ? C.fnT : C.muted,
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

  const commonDraftProps = {
    onDraftChange: (d: unknown) => setPartDraft(activePart.id, partModels[0], d),
  };

  let child;
  if (partModels.length > 1) {
    child = (
      <MultiModelSessionView
        key={activePart.id}
        exercise={partExercise}
        mode={mode}
        onSubmit={handlePartSubmit}
        onBack={onBack}
        initialDraft={drafts[activePart.id]}
        onDraftChange={(modelId, d) => setPartDraft(activePart.id, modelId, d)}
        extraToggleNode={partNav}
      />
    );
  } else {
    const m = partModels[0];
    if (m === "esquema") {
      child = (
        <Suspense key={activePart.id} fallback={schemaFallback}>
          <SchemaExerciseView exercise={partExercise} mode={mode} onSubmit={handlePartSubmit} onBack={onBack}
            modelToggleNode={partNav}
            initialDraft={drafts[activePart.id]?.[m] as Block[] | undefined}
            {...commonDraftProps} />
        </Suspense>
      );
    } else if (m === "cuestionario") {
      child = (
        <QuestionnaireView key={activePart.id} exercise={partExercise} onSubmit={handlePartSubmit} onBack={onBack}
          modelToggleNode={partNav}
          initialDraft={drafts[activePart.id]?.[m] as Record<string, string> | undefined}
          {...commonDraftProps} />
      );
    } else {
      child = (
        <ExerciseView key={activePart.id} exercise={partExercise} mode={mode} onSubmit={handlePartSubmit} onBack={onBack}
          modelToggleNode={partNav}
          initialDraft={drafts[activePart.id]?.[m] as InteractivoDraft | undefined}
          {...commonDraftProps} />
      );
    }
  }

  return (
    <>
      {child}
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
