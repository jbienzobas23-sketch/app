// ═══ CORRECTIONVIEW (CORRECCIÓN / REVISIÓN) ══════════════════════════════════
// CorrectionView (alumno y profesor). Extraída de App.jsx (Fase 2).
import { useState } from "react";
import type { Exercise } from "../lib/types.js";
import { C, S, FONT_SANS } from "../theme/tokens.js";
import { scoreColor } from "../lib/color.js";
import { partsOf, partToExercise, modelsOf, resultPartsOf } from "../lib/domain.js";
import { aggregateParts, nota10 } from "../lib/scoring.js";
import { parseHashQuery, setHashQuery } from "../lib/routing.js";

// ── Tipos y piezas troceadas (M3.4) ──────────────────────────────────────────
// La corrección de UNA parte se troceó en tres vistas autónomas bajo correccion/;
// este archivo conserva el despachador, el envoltorio multiparte y el export
// público. TeacherCorrection se re-exporta para App.tsx (tipa saveCorrection
// sin `any`, F7 T7.2).
import type { CorrectionResult, CorrectionViewProps, TeacherCorrection } from "./correccion/shared.js";
import { SchemaCorrection } from "./correccion/SchemaCorrection.js";
import { QuizCorrection } from "./correccion/QuizCorrection.js";
import { InteractiveCorrection } from "./correccion/InteractiveCorrection.js";
export type { TeacherCorrection } from "./correccion/shared.js";

// Corrección de UNA parte con UN modelo (M3.4): despachador puro por modelo.
// Cada vista (SchemaCorrection / QuizCorrection / InteractiveCorrection) es
// autónoma — monta sus propios hooks (audio, estado de corrección). El
// envoltorio multiparte reutiliza este despachador una vez por parte y modelo.
// backLabel por defecto contextual (F7, T7.5): en modo profesor "Volver".
function CorrectionViewSingle(props: CorrectionViewProps) {
  const t = props.result.type;
  if (t === "esquema") return <SchemaCorrection {...props} />;
  if (t === "cuestionario") return <QuizCorrection {...props} />;
  return <InteractiveCorrection {...props} />;
}

// Nota/estado efectivos de una parte+modelo: la corrección manual (si existe
// y está marcada `corrected`) sustituye a la nota automática — mismo criterio
// que ya aplicaba saveCorrection a nivel de ejercicio (T1), ahora por modelo.
function effectiveModelResult(
  raw: CorrectionResult | undefined,
  corr: TeacherCorrection | undefined,
): { score: number | null; status: "auto" | "pendiente" | "corregido" } {
  if (corr?.corrected) {
    let score = raw?.score ?? (raw as { placementScore?: number | null } | undefined)?.placementScore ?? null;
    if (corr.totalScore != null) {
      const n = Number(corr.totalScore);
      if (!Number.isNaN(n)) score = n <= 10 ? n * 10 : n;
    }
    return { score, status: "corregido" };
  }
  return {
    score: raw?.score ?? (raw as { placementScore?: number | null } | undefined)?.placementScore ?? null,
    status: (raw?.status as "auto" | "pendiente" | "corregido" | undefined) ?? "auto",
  };
}

// ═══ ENVOLTORIO MULTIPARTE (F4, T4.4) ════════════════════════════════════════
// Con más de una parte: navegador de chips (nota agregada arriba, mini-nota
// por parte en cada chip) — cada parte renderiza su rama existente SIN
// CAMBIOS vía CorrectionViewSingle, alimentada por el ejercicio proyectado
// (partToExercise) y el resultado plano de esa parte/modelo, desglosados del
// sobre compuesto con resultPartsOf (tolerante: también envuelve un resultado
// plano heredado como una única parte, si algún día hiciera falta). Solo la
// parte activa está montada — mismo criterio de LRU-1 que SessionShell (M4.1):
// un único useAudioPlayer vivo a la vez, sin cachés de audio nuevas.
// teacherCorrection.parts[partId][modelId] anida la forma manual de cada
// modelo tal cual la produce CorrectionViewSingle — sin tocarla.
function MultiPartCorrectionShell({ exercise, result, onBack, isTeacherMode = false, backLabel = isTeacherMode ? "← Volver" : "← Mis ejercicios", student = null, onSaveCorrection = null }: CorrectionViewProps) {
  const parts = partsOf(exercise);
  const resultParts = resultPartsOf(result);
  const teacherPartsCorrection = ((result.teacherCorrection as { parts?: Record<string, Record<string, TeacherCorrection>> } | undefined)?.parts) || {};

  const [activeIdx, setActiveIdx] = useState(() => {
    const n = parseInt(parseHashQuery().parte || "1", 10);
    return Number.isFinite(n) && n >= 1 && n <= parts.length ? n - 1 : 0;
  });
  const activePart = parts[activeIdx] || parts[0];
  const goToPart = (idx: number) => { setActiveIdx(idx); setHashQuery({ parte: String(idx + 1) }); };

  // Agregado de UNA parte: media de sus modelos (mismo criterio que la nota
  // de ejercicio agrega sus partes — aggregateParts, sin pesos por modelo).
  const partAggregate = (partId: string) => {
    const p = parts.find((x) => x.id === partId);
    if (!p) return { score: null, pending: false };
    const projected = partToExercise(exercise, p);
    const pModels = modelsOf(projected);
    const results = pModels.map((m) => effectiveModelResult(resultParts[partId]?.byModel?.[m], teacherPartsCorrection[partId]?.[m]));
    const scores = results.map((r) => r.score).filter((s): s is number => s != null);
    return { score: scores.length ? aggregateParts(scores) : null, pending: results.some((r) => r.status === "pendiente") };
  };

  const partAggregates = parts.map((p) => partAggregate(p.id));
  const overallScore  = aggregateParts(partAggregates.map((a) => a.score), parts.map((p) => p.points ?? 1));
  const overallPending = partAggregates.some((a) => a.pending);
  const col = scoreColor(overallScore);

  // Guarda la corrección de UN modelo de la parte activa: fusiona sobre
  // teacherCorrection.parts (sin pisar el resto de partes/modelos ya
  // corregidos) y recalcula la nota/estado agregados del ejercicio entero —
  // "saveCorrection recalcula score/status agregados" (plan, T4.4).
  const saveForModel = (modelId: string) => (studentId: string | undefined, exerciseId: Exercise["id"], correction: TeacherCorrection) => {
    const mergedParts = {
      ...teacherPartsCorrection,
      [activePart.id]: { ...(teacherPartsCorrection[activePart.id] || {}), [modelId]: { ...correction, corrected: true } },
    };
    let anyPending = false;
    const partScores = parts.map((p) => {
      const projected = partToExercise(exercise, p);
      const pModels = modelsOf(projected);
      const scores = pModels.map((m) => {
        const r = effectiveModelResult(resultParts[p.id]?.byModel?.[m], mergedParts[p.id]?.[m]);
        if (r.status === "pendiente") anyPending = true;
        return r.score;
      }).filter((s): s is number => s != null);
      return scores.length ? aggregateParts(scores) : null;
    });
    onSaveCorrection?.(studentId, exerciseId, {
      parts: mergedParts,
      totalScore: aggregateParts(partScores, parts.map((p) => p.points ?? 1)),
      status: anyPending ? "pendiente" : "corregido",
    } as unknown as TeacherCorrection);
  };

  const chips = (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 20 }}>
      {parts.map((p, i) => {
        const agg = partAggregates[i];
        const isActive = i === activeIdx;
        const label = agg.pending ? "pendiente" : nota10(agg.score) ?? "—";
        return (
          <button key={p.id} type="button" onClick={() => goToPart(i)}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 999,
              border: `1.5px solid ${isActive ? C.ink : C.line}`,
              background: isActive ? C.ink : "transparent",
              color: isActive ? C.paper : C.ink2,
              fontFamily: FONT_SANS, fontSize: 12.5, fontWeight: 700, cursor: "pointer",
            }}>
            <span>{i + 1}</span>
            <span style={{ fontWeight: 600, opacity: 0.85 }}>{p.title || `Parte ${i + 1}`}</span>
            <span style={{ fontSize: 10.5, opacity: 0.75 }}>{label}</span>
          </button>
        );
      })}
    </div>
  );

  const extraHeaderContent = (
    <>
      {overallScore != null && (
        // Franja compacta (Jon, 2026-07-05): nota + descripción en línea, sin
        // el tarjetón centrado que dejaba medio ancho vacío a cada lado.
        <div style={{ ...S.card, display: "flex", alignItems: "baseline", gap: 12, padding: "12px 18px", marginBottom: 16 }}>
          <span style={{ fontSize: 32, fontWeight: 800, color: col, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{nota10(overallScore)}</span>
          <span style={{ color: C.muted, fontSize: 13 }}>
            Nota agregada de {parts.length} partes{overallPending ? " · con partes pendientes de corrección" : ""}
          </span>
        </div>
      )}
      {chips}
    </>
  );

  const projected = partToExercise(exercise, activePart);
  const pModels = modelsOf(projected);
  const modelsWithResult = pModels.filter((m) => resultParts[activePart.id]?.byModel?.[m]);

  if (modelsWithResult.length === 0) {
    return (
      <div style={S.app}>
        <div style={S.page}>
          <button onClick={onBack} style={{ ...S.btn, marginBottom: 20, fontSize: 12, padding: "6px 12px" }}>{backLabel}</button>
          <h1 style={{ ...S.h1, marginBottom: 4 }}>Corrección: {exercise.title}</h1>
          {student && <p style={{ color: C.muted, fontSize: 13, margin: "0 0 16px" }}>Alumno: <strong>{student.displayName || student.name}</strong></p>}
          {extraHeaderContent}
          <p style={{ color: C.muted, fontSize: 13 }}>Esta parte todavía no tiene entrega.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {modelsWithResult.map((m, i) => {
        const raw  = resultParts[activePart.id]!.byModel[m];
        const corr = teacherPartsCorrection[activePart.id]?.[m];
        const flatResult: CorrectionResult = { ...raw, type: (raw.type as string | undefined) ?? m, teacherCorrection: corr };
        return (
          <CorrectionViewSingle
            key={m}
            exercise={projected}
            result={flatResult}
            onBack={onBack}
            backLabel={backLabel}
            isTeacherMode={isTeacherMode}
            student={student}
            onSaveCorrection={isTeacherMode ? saveForModel(m) : null}
            // El navegador de chips + nota agregada solo se inserta una vez —
            // en el primer modelo de la parte activa (el caso común, una
            // parte con un solo modelo, no repite nada; una parte híbrida
            // muestra el navegador junto al primer modelo y el resto debajo).
            extraHeaderContent={i === 0 ? extraHeaderContent : null}
          />
        );
      })}
    </>
  );
}

// ═══ CORRECTIONVIEW (punto de entrada) ═══════════════════════════════════════
// Con una parte, delega tal cual en CorrectionViewSingle — un ejercicio
// antiguo (o cualquiera de una sola parte) se corrige exactamente como
// siempre. Con más de una parte, monta el envoltorio de arriba.
export function CorrectionView(props: CorrectionViewProps) {
  const parts = partsOf(props.exercise);
  if (parts.length > 1) return <MultiPartCorrectionShell {...props} />;
  return <CorrectionViewSingle {...props} />;
}
