// ═══ USESUBMITANSWER (A2.3) ═══════════════════════════════════════════════════
// Entrega de respuestas del alumno (y guardado de claves en modo record):
// puntúa con los puntuadores puros de lib/scoring, conserva intentos
// (addAttempt), persiste y navega a la corrección. Extraído VERBATIM de App
// (era ~215 líneas de su cuerpo); App solo aporta las dependencias — no hay
// cambio de comportamiento.
import type { Exercise, ExerciseResult, UserProfile } from "../lib/types.js";
import { parseHashQuery, getLastPanelPath } from "../lib/routing.js";
import { DEFAULT_MARGIN, DEFAULT_SCHEMA_MARGIN } from "../lib/sessionConstants.js";
import { modelsOf, answerFor, resultStatusOf, partsOf, partToExercise, updatePart, questionsOf, addAttempt } from "../lib/domain.js";
import { SCHEMA_PALETTE_DEFAULT, effectivePaletteId } from "../lib/palette.js";
import { calcScore, calcSchemaPlacementScore, calcQuestionnaireScore, aggregateParts, type Interval, type SchemaBlock } from "../lib/scoring.js";
import { createDb } from "../data/db.js";

// Payload que entregan las vistas de sesión al entregar un ejercicio (F7,
// T7.2 — antes `any` en submitAnswer). `entries`/`intervals` son el formato
// "en bruto" del interactivo, igual en modo una-parte que dentro de cada
// `parts[partId].byModel[modelo]` del multiparte — de ahí que
// ModelAnswerPayload cubra los cuatro modelos con campos todos opcionales.
interface AnswerEntry { categoryId: string; intervals: Interval[]; }
interface ModelAnswerPayload {
  answers?: Record<string, string>;
  blocks?: SchemaBlock[];
  schemaPalette?: string;
  entries?: AnswerEntry[];
  currentCategoryId?: string;
}
export interface SubmitPayload extends ModelAnswerPayload {
  type?: string;
  mode?: string;
  score?: number | null;
  parts?: Record<string, { byModel?: Record<string, ModelAnswerPayload> }>;
}

type Db = ReturnType<typeof createDb>;

interface UseSubmitAnswerArgs {
  exCtx: { exercise: Exercise; mode: string } | null;
  routePartId: string | undefined;   // segmento /parte/:pid heredado (M4.2)
  user: UserProfile | null;
  results: Record<string, Record<string, ExerciseResult>>;
  setResults: React.Dispatch<React.SetStateAction<Record<string, Record<string, ExerciseResult>>>>;
  dbUpsertResult: Db["dbUpsertResult"];
  updateExercise: (id: Exercise["id"], patch: Record<string, unknown>) => void;
  freshExercise: (ex: Exercise) => Exercise;
  setLastResult: (r: ExerciseResult | null) => void;
  navigate: (to: string, opts?: { replace?: boolean }) => void;
}

export function useSubmitAnswer({ exCtx, routePartId, user, results, setResults, dbUpsertResult, updateExercise, freshExercise, setLastResult, navigate }: UseSubmitAnswerArgs) {
  // Recibe `unknown` porque cada vista de sesión (ExerciseView, Questionnaire-
  // View, SchemaExerciseView, SessionShell) tiene su propio tipo de onSubmit —
  // SubmitPayload es la forma común que asume el cuerpo.
  const submitAnswer = (rawPayload: unknown) => {
    const payload = rawPayload as SubmitPayload;
    if (!exCtx) return;
    const ex      = freshExercise(exCtx.exercise);
    const exId    = String(ex.id);
    // Intentos (F6, T6.3): "Repetir" no debe sobrescribir la entrega anterior
    // — addAttempt la conserva en `attempts` y expone score = mejor de todos.
    // Ninguno de los cuatro sitios donde se guarda más abajo es modo "record"
    // (ese siempre escribe en el ejercicio, no en `results`, y ya ha vuelto
    // antes de llegar aquí en sus propias ramas).
    const existingResult = user ? (results[user.id] || {})[exId] : undefined;
    const activePalette = effectivePaletteId(ex, user?.defaultPalette);
    // Autoría por parte (F4, T4.2): grabar clave (esquema/interactivo) escribe
    // en la parte de la URL cuando el ejercicio es genuinamente multiparte —
    // un ejercicio de una sola parte sigue escribiendo en los campos planos,
    // sin materializar `parts` (la UI se mantiene idéntica a hoy).
    const isMultiPart = Array.isArray(ex.parts) && ex.parts.length > 1;
    const recordParts = partsOf(ex);
    // M4.2: la parte activa se lee de `?parte=` (única convención emitida); el
    // segmento /parte/:pid heredado (route.params.partId) se sigue aceptando.
    const urlPartId = parseHashQuery().parte || routePartId;
    const recordPartId = (urlPartId && recordParts.some((p) => p.id === urlPartId))
      ? urlPartId
      : recordParts[0]?.id;

    // Sesión multiparte (F4, T4.3 / M4.1): SessionShell entrega TODAS las
    // partes en un solo payload — { parts: { [partId]: { points, byModel } } },
    // con el payload "en bruto" de cada modelo (mismo formato que produciría
    // ese modelo en una sesión de una sola parte). Puntuamos aquí reutilizando
    // exactamente los mismos puntuadores puros que las ramas de abajo, una vez
    // por parte y modelo, y agregamos con aggregateParts (T4.1). El sobre
    // compuesto completo (status por parte, corrección con navegador de
    // partes) es T4.4 — aquí se guarda ya con la forma final para que esa fase
    // no tenga que reescribir el payload, solo enriquecer cómo se lee.
    if (payload?.type === "multi") {
      const parts = partsOf(ex);
      const partScores: Array<number | null> = [];
      const partPoints: number[] = [];
      const partsEnvelope: Record<string, { byModel: Record<string, unknown> }> = {};
      let anyPending = false;
      parts.forEach((p) => {
        const partPayload = payload.parts?.[p.id];
        const projected = partToExercise(ex, p);
        const pModels = modelsOf(projected);
        const byModel: Record<string, unknown> = {};
        const modelScores: number[] = [];
        pModels.forEach((m) => {
          const raw: ModelAnswerPayload = partPayload?.byModel?.[m] || {};
          const status = resultStatusOf(null, projected);
          if (status === "pendiente") anyPending = true;
          if (m === "cuestionario") {
            const score = calcQuestionnaireScore(questionsOf(projected), raw.answers);
            byModel[m] = { type: "cuestionario", answers: raw.answers || {}, score, status, schemaPalette: activePalette, timestamp: Date.now(), questionsSnapshot: questionsOf(projected) };
            if (score != null) modelScores.push(score);
          } else if (m === "esquema") {
            const score = calcSchemaPlacementScore(projected.schemaKey as SchemaBlock[], raw.blocks || [], projected.schemaMargin ?? DEFAULT_SCHEMA_MARGIN);
            byModel[m] = { type: "esquema", blocks: raw.blocks || [], placementScore: score, score, status, schemaPalette: raw.schemaPalette ?? activePalette, timestamp: Date.now() };
            if (score != null) modelScores.push(score);
          } else {
            const entries = raw.entries || [];
            const currentCategoryId = raw.currentCategoryId || entries[0]?.categoryId || "default";
            const scoreFor = (categoryId: string, intervals: Interval[]) => {
              const key = answerFor(projected, categoryId) as Interval[];
              return key.length ? calcScore(key, intervals, projected.duration as number, projected.margin ?? DEFAULT_MARGIN) : null;
            };
            const mainEntry = entries.find((e) => e.categoryId === currentCategoryId) || entries[0];
            const mainIvs   = mainEntry?.intervals || [];
            const mainScore = scoreFor(currentCategoryId, mainIvs);
            const extras = entries
              .filter((e) => e.categoryId !== currentCategoryId)
              .map((e) => ({ categoryId: e.categoryId, intervals: e.intervals, score: scoreFor(e.categoryId, e.intervals) }));
            byModel[m] = { categoryId: currentCategoryId, intervals: mainIvs, score: mainScore, extras, status, schemaPalette: activePalette, timestamp: Date.now() };
            if (mainScore != null) modelScores.push(mainScore);
          }
        });
        partsEnvelope[p.id] = { byModel };
        partScores.push(modelScores.length ? aggregateParts(modelScores) : null);
        partPoints.push(p.points ?? 1);
      });
      const data = addAttempt(existingResult, {
        type: "multi",
        score: aggregateParts(partScores, partPoints),
        status: (anyPending ? "pendiente" : "auto") as "pendiente" | "auto",
        timestamp: Date.now(),
        parts: partsEnvelope,
      });
      if (user) {
        setResults((prev) => ({ ...prev, [user.id]: { ...(prev[user.id] || {}), [exId]: data } }));
        dbUpsertResult(user.id, exId, data);
      }
      setLastResult(data);
      navigate(`/alumno/ejercicio/${ex.id}/correccion`);
      return;
    }

    // Cuestionario
    if (payload?.type === "cuestionario") {
      // Instantánea de las preguntas al entregar (F5, T5.5): la corrección y
      // resultStatusOf la leen en vez de las preguntas vigentes del ejercicio,
      // así una edición posterior del profesor no descoloca entregas pasadas.
      const data = { type: "cuestionario" as const, answers: payload.answers, score: payload.score, status: resultStatusOf(null, ex), schemaPalette: activePalette, timestamp: Date.now(), questionsSnapshot: questionsOf(ex) };
      if (payload.mode !== "preview") {
        // La previsualización del profesor NUNCA se mezcla con el historial
        // real (mismo criterio que esquema, más arriba).
        const savedData = addAttempt(existingResult, data);
        if (user) {
          setResults((prev) => ({ ...prev, [user.id]: { ...(prev[user.id] || {}), [exId]: savedData } }));
          dbUpsertResult(user.id, exId, savedData);
        }
        setLastResult(savedData);
      } else {
        setLastResult(data);
      }
      navigate(payload.mode === "preview"
        ? `/profesor/ejercicio/${ex.id}/correccion`
        : `/alumno/ejercicio/${ex.id}/correccion`);
      return;
    }

    // Esquema
    if (payload?.type === "esquema") {
      if (payload.mode === "record") {
        // El profesor guarda el esquema como modelo de referencia (con su paleta)
        if (isMultiPart) {
          updateExercise(ex.id, {
            parts: updatePart(ex, recordPartId, { schemaKey: payload.blocks }).parts,
            schemaPalette: payload.schemaPalette ?? SCHEMA_PALETTE_DEFAULT,
          });
        } else {
          updateExercise(ex.id, { schemaKey: payload.blocks, schemaPalette: payload.schemaPalette ?? SCHEMA_PALETTE_DEFAULT });
        }
        navigate(getLastPanelPath("/profesor"));
        return;
      }
      // Modo preview (profesor prueba) o alumno: ambos van a CorrectionView
      const placementScore = calcSchemaPlacementScore(ex.schemaKey as SchemaBlock[], payload.blocks || [], ex.schemaMargin ?? DEFAULT_SCHEMA_MARGIN);
      const data = { type: "esquema", blocks: payload.blocks, placementScore, score: placementScore, status: resultStatusOf(null, ex), schemaPalette: payload.schemaPalette ?? SCHEMA_PALETTE_DEFAULT, timestamp: Date.now() };
      if (payload.mode !== "preview") {
        // Solo guardar si es un alumno real. Intentos (F6, T6.3): la
        // previsualización del profesor NUNCA se mezcla con el historial real.
        const savedData = addAttempt(existingResult, data);
        if (user) {
          setResults((prev) => ({ ...prev, [user.id]: { ...(prev[user.id] || {}), [exId]: savedData } }));
          dbUpsertResult(user.id, exId, savedData);
        }
        setLastResult(savedData);
      } else {
        setLastResult(data);
      }
      navigate(payload.mode === "preview"
        ? `/profesor/ejercicio/${ex.id}/correccion`
        : `/alumno/ejercicio/${ex.id}/correccion`);
      return;
    }

    // Interactivo: payload = { entries: [{ categoryId, intervals }], currentCategoryId }
    const entries          = payload.entries || [];
    const currentCategoryId = payload.currentCategoryId || entries[0]?.categoryId || "default";

    const scoreFor = (categoryId: string, intervals: Interval[]) => {
      const key = answerFor(ex, categoryId) as Interval[];
      if (!key.length) return null;
      return calcScore(key, intervals, ex.duration as number, ex.margin ?? DEFAULT_MARGIN);
    };

    if (exCtx.mode === "record") {
      // Guardar como clave del profesor
      if (isMultiPart) {
        const activePart = recordParts.find((p) => p.id === recordPartId);
        const patchAnswers: Record<string, Interval[]> = { ...(activePart?.answers || {}) } as Record<string, Interval[]>;
        entries.forEach(({ categoryId, intervals }) => { patchAnswers[categoryId] = intervals; });
        updateExercise(ex.id, { parts: updatePart(ex, recordPartId, { answers: patchAnswers }).parts });
      } else {
        const patchAnswers: Record<string, Interval[]> = { ...(ex.answers || {}) } as Record<string, Interval[]>;
        entries.forEach(({ categoryId, intervals }) => { patchAnswers[categoryId] = intervals; });
        updateExercise(ex.id, { answers: patchAnswers });
      }
      navigate(getLastPanelPath("/profesor"));
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

    const data = addAttempt(existingResult, {
      categoryId: currentCategoryId,
      intervals:  mainIvs,
      score:      mainScore,
      extras,
      status:     resultStatusOf(null, ex),
      schemaPalette: activePalette,
      timestamp:  Date.now(),
    });

    if (user) {
      setResults((prev) => ({ ...prev, [user.id]: { ...(prev[user.id] || {}), [exId]: data } }));
      dbUpsertResult(user.id, exId, data);
    }
    setLastResult(data);
    navigate(`/alumno/ejercicio/${ex.id}/correccion`);
  };

  return submitAnswer;
}
