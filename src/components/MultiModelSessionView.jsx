// ═══ MULTIMODELSESSIONVIEW ════════════════════════════════════════════════════
// Wrapper para ejercicios con dos modelos: gestiona la alternancia y comparte el
// audio decodificado entre las vistas. Extraída de App.jsx (Fase 2).
import { useState, useEffect, useRef, lazy, Suspense } from "react";
import { modelsOf } from "../lib/domain.js";
import { useAudioPlayer } from "../hooks/useAudioPlayer.js";
import { ModelToggleBar } from "./student.jsx";
import { ExerciseView } from "./ExerciseView.jsx";
import { QuestionnaireView } from "./QuestionnaireView.jsx";

// Vista de esquema diferida (code-splitting, Fase 6): ~2k líneas que no hacen
// falta hasta que se abre un ejercicio de ese modelo.
const SchemaExerciseView = lazy(() => import("./SchemaExerciseView.jsx").then((m) => ({ default: m.SchemaExerciseView })));
const schemaFallback = <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#b0b0a8", fontSize: 14 }}>Cargando…</div>;

export function MultiModelSessionView({ exercise, mode, onSubmit, onBack }) {
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
        <Suspense fallback={schemaFallback}>
          <SchemaExerciseView
            exercise={exercise}
            mode={mode}
            onSubmit={onSubmit}
            onBack={onBack}
            modelToggleNode={toggleNode}
            sharedAudioPlayer={sharedAudioPlayer}
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
