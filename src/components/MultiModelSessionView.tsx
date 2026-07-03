// ═══ MULTIMODELSESSIONVIEW ════════════════════════════════════════════════════
// Wrapper para ejercicios con dos modelos: gestiona la alternancia y comparte el
// audio decodificado entre las vistas. Extraída de App.jsx (Fase 2).
import { useState, useEffect, useRef, lazy, Suspense, type ReactNode } from "react";
import { C } from "../theme/tokens.js";
import { modelsOf } from "../lib/domain.js";
import { useAudioPlayer } from "../hooks/useAudioPlayer.js";
import type { Exercise } from "../lib/types.js";
// Componentes hijo ya tipados (.tsx): se consumen directamente.
import { ModelToggleBar } from "./student.js";
import { ExerciseView } from "./ExerciseView.js";
import { QuestionnaireView } from "./QuestionnaireView.js";

interface Props {
  exercise: Exercise;
  mode: string;
  onSubmit: (r: unknown) => void;
  onBack: () => void;
  // Borrador por modelo (F4, T4.3): MultiPartSessionView lo eleva un nivel más
  // como drafts[partId][modelId] — aquí solo se pasa a través, por modelo.
  initialDraft?: Record<string, unknown> | null;
  onDraftChange?: (modelId: string, draft: unknown) => void;
  // Contenido adicional a mostrar junto al selector de modelo (F4, T4.3): la
  // tira de chips de parte de MultiPartSessionView, cuando envuelve una parte
  // híbrida. Va antes del propio selector de modelo.
  extraToggleNode?: ReactNode;
}

// Vista de esquema diferida (code-splitting, Fase 6): ~2k líneas que no hacen
// falta hasta que se abre un ejercicio de ese modelo.
const SchemaExerciseView = lazy(() => import("./SchemaExerciseView.js").then((m) => ({ default: m.SchemaExerciseView })));
const schemaFallback = <div style={{ minHeight: "100dvh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", color: C.muted, fontSize: 14 }}>Cargando…</div>;

export function MultiModelSessionView({ exercise, mode, onSubmit, onBack, initialDraft = null, onDraftChange, extraToggleNode = null }: Props) {
  const models = modelsOf(exercise);
  const [activeIdx, setActiveIdx] = useState(0);
  const activeModel = models[activeIdx] || models[0];

  // Borrador por modelo, con estado PROPIO (no solo pasarela): así alternar
  // entre modelos de un híbrido nunca destruye el trabajo del otro — el
  // "toggle destructivo" documentado — tanto si este componente se usa suelto
  // (ejercicio de una parte) como si un padre (MultiPartSessionView, T4.3) lo
  // envuelve para elevar el borrador un nivel más arriba.
  const [drafts, setDrafts] = useState<Record<string, unknown>>(() => initialDraft || {});
  const handleDraftChange = (modelId: string, draft: unknown) => {
    setDrafts((prev) => ({ ...prev, [modelId]: draft }));
    onDraftChange?.(modelId, draft);
  };

  // Audio compartido: decodificado una vez, persiste entre cambios de modelo
  const [sharedWaveformData, setSharedWaveformData] = useState(exercise.waveformData || null);
  const loopRegionRef = useRef<any>(null);   // QuestionnaireView lo actualiza con su lockedQuestion
  const onWaveform    = sharedWaveformData ? null : (wd: number[]) => setSharedWaveformData(wd);
  const rawPlayer     = useAudioPlayer(exercise, { onWaveform, loopRegionRef });
  const sharedAudioPlayer = { ...rawPlayer, waveformData: sharedWaveformData };

  // Al cambiar de modelo, cancelar cualquier bucle de fragmento activo
  useEffect(() => { loopRegionRef.current = null; }, [activeModel]);

  const toggleNode: ReactNode = (
    <>
      {extraToggleNode}
      {models.length > 1 && <ModelToggleBar models={models} activeIdx={activeIdx} onSwitch={setActiveIdx} />}
    </>
  );

  // Cada vista tiene su propio estado de UI; al cambiar de modelo se desmonta
  // y vuelve a montar (React detecta el cambio de key). El audio, sin embargo,
  // vive aquí y se pasa como sharedAudioPlayer para no re-decodificar.
  if (activeModel === "esquema") {
    return (
      <div key={`schema-${exercise.id}`}>
        <Suspense fallback={schemaFallback}>
          <SchemaExerciseView
            exercise={exercise}
            mode={mode}
            onSubmit={onSubmit}
            onBack={onBack}
            modelToggleNode={toggleNode}
            sharedAudioPlayer={sharedAudioPlayer}
            initialDraft={drafts[activeModel] as any}
            onDraftChange={(d) => handleDraftChange(activeModel, d)}
          />
        </Suspense>
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
          initialDraft={drafts[activeModel] as any}
          onDraftChange={(d) => handleDraftChange(activeModel, d)}
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
        initialDraft={drafts[activeModel] as any}
        onDraftChange={(d) => handleDraftChange(activeModel, d)}
      />
    </div>
  );
}
