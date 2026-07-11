// ═══ HELPERS DE FORMA DE DOMINIO ═════════════════════════════════════════════
// Lectores tolerantes del modelo de ejercicio (formato nuevo `categories`/`answers`
// y heredado `mode`/`answer`), modelos y combos, y listas del almacén de audios.
// Extraídos de App.jsx (Fase 0). Migrado a TypeScript (Fase 3).
import { DEFAULT_CATEGORY } from "../seed.js";
import type { Exercise, Category, Button, Question, Course, Unit, Role, ExerciseResult, Part } from "./types.js";

export const DEFAULT_MODEL_ID = "interactivo";

export interface ModelCombo { id: string; models: string[]; name: string; description: string; }

// Opciones de combinación de modelos para el editor (incluye modelos individuales + combos dobles)
export const MODEL_COMBOS: ModelCombo[] = [
  { id: "interactivo",              models: ["interactivo"],                name: "Interactivo",                description: "El alumno marca categorías en vivo durante el audio." },
  { id: "cuestionario",             models: ["cuestionario"],               name: "Cuestionario",               description: "Preguntas ancladas a fragmentos concretos del audio." },
  { id: "esquema",                  models: ["esquema"],                    name: "Esquema",                    description: "El alumno dibuja bloques de forma musical en una línea de tiempo." },
  { id: "interactivo+cuestionario", models: ["interactivo","cuestionario"], name: "Interactivo + Cuestionario", description: "El alumno puede alternar entre marcado en vivo y cuestionario de preguntas." },
  { id: "esquema+cuestionario",     models: ["esquema","cuestionario"],     name: "Esquema + Cuestionario",     description: "El alumno puede alternar entre el esquema formal y el cuestionario." },
];

// Devuelve el comboId a partir de un array de modelos (para inicializar el editor)
export function comboIdFromModels(models: string[] | null | undefined): string {
  if (!Array.isArray(models) || models.length === 0) return DEFAULT_MODEL_ID;
  if (models.length === 1) return models[0];
  const has = (m: string) => models.includes(m);
  if (has("interactivo") && has("cuestionario")) return "interactivo+cuestionario";
  if (has("esquema")     && has("cuestionario")) return "esquema+cuestionario";
  return models[0];
}

export const categoriesOf = (exercise?: Exercise | null): Category[] => {
  if (Array.isArray(exercise?.categories) && exercise.categories.length > 0) return exercise.categories;
  if (Array.isArray(exercise?.modes)      && exercise.modes.length > 0)      return exercise.modes;
  if (exercise?.mode) return [exercise.mode];
  return [DEFAULT_CATEGORY];
};

export const modelOf = (exercise?: Exercise | null): string => exercise?.model || DEFAULT_MODEL_ID;

// Devuelve el array de modelos de un ejercicio (puede tener 1 ó 2 modelos)
export const modelsOf = (exercise?: Exercise | null): string[] => {
  if (Array.isArray(exercise?.models) && exercise.models.length > 0) return exercise.models;
  return [modelOf(exercise)];
};

export const answerFor = (exercise: Exercise | null | undefined, categoryId: string): unknown[] => {
  if (exercise?.answers && Array.isArray(exercise.answers[categoryId])) return exercise.answers[categoryId];
  if (Array.isArray(exercise?.answer)) {
    const legacyCategoryId = (exercise.mode as Category | undefined)?.id || DEFAULT_CATEGORY.id;
    if (categoryId === legacyCategoryId) return exercise.answer;
  }
  return [];
};

export const answerStats = (exercise?: Exercise | null): { recorded: number; total: number } => {
  const cats = categoriesOf(exercise);
  const recorded = cats.filter((c) => answerFor(exercise, c.id).length > 0).length;
  return { recorded, total: cats.length };
};

export interface SerializedInterval { fn: string; start: number; end: number; fig?: string | null; }

// Serializa intervalos para el submit/las claves conservando `fig` (cifrado/
// inversión) cuando está presente, sin añadir la clave si no lo está (evita
// `fig: undefined` explícito en el JSONB). A2-01: los dos submits (interactivo
// suelto y SessionShell) lo hacían inline con un map que descartaba `fig`.
export function serializeIntervals(ivs: Array<{ fn: string; start: number; end: number; fig?: string | null }>): SerializedInterval[] {
  return ivs.map(({ fn, start, end, fig }) =>
    fig !== undefined ? { fn, start, end, fig } : { fn, start, end });
}

// ── Resolución de referencias curso→unidad→ejercicio ─────────────────────────
// Los ids se comparan SIEMPRE normalizados a texto: el id de un ejercicio puede
// ser numérico (creado con Date.now()) mientras que unit.exerciseIds se guarda
// como texto (addExercisesToUnit hace .map(String)). Sin normalizar, un `===`
// estricto falla (1779 !== "1779") y el ejercicio "desaparece" de la unidad.
export const courseUnitList = (course: Course | null | undefined, units: Unit[], role: Role): Unit[] => {
  const ordered = (course?.unitIds || [])
    .map((id) => units.find((u) => String(u.id) === String(id)))
    .filter(Boolean) as Unit[];
  return role === "student" ? ordered.filter((u) => !u.hidden) : ordered;
};
export const unitExList = (unit: Unit | null | undefined, exercises: Exercise[], role: Role): Exercise[] => {
  const ordered = (unit?.exerciseIds || [])
    .map((id) => exercises.find((e) => String(e.id) === String(id)))
    .filter(Boolean) as Exercise[];
  return role === "student" ? ordered.filter((e) => !e.hidden) : ordered;
};

// A3-08: `fa_categories` se asigna cruda del JSONB — una fila sin `buttons`
// (o con `buttons` no-array) no debe lanzar en pleno render de sesión.
export const btnOf = (category: { buttons?: Button[] } | null | undefined, id: string): Button | undefined => {
  const btns = Array.isArray(category?.buttons) ? category.buttons : [];
  return btns.find((b) => b.id === id) || btns[0];
};
export const questionsOf = (exercise?: Exercise | null): Question[] => (Array.isArray(exercise?.questions) ? exercise.questions : []);

// Lector tolerante de las preguntas de una entrega ya hecha (F5, T5.5): si el
// resultado trae `questionsSnapshot` (congelado al entregar), son esas — tal
// como las vio el alumno, aunque el profesor las haya editado, reordenado o
// borrado después. Sin instantánea (resultados de antes de T5.5), cae a las
// preguntas vigentes del ejercicio — el comportamiento de siempre.
export const questionsSnapshotOf = (result: ExerciseResult | null | undefined, exercise?: Exercise | null): Question[] =>
  (result as { questionsSnapshot?: Question[] } | null | undefined)?.questionsSnapshot ?? questionsOf(exercise);

// Estado vigente de una entrega. "Pendiente" cubre los modelos que no se
// pueden autocorregir con una fórmula (esquema siempre, cuestionario si
// tiene alguna pregunta de desarrollo) — hasta que el profesor los revisa
// manualmente, mostrar una nota sería mostrar un cero engañoso. El chequeo de
// desarrollo lee la instantánea de la entrega, no las preguntas vigentes.
export const resultStatusOf = (result: ExerciseResult | null | undefined, exercise: Exercise | null | undefined): "auto" | "pendiente" | "corregido" => {
  if (result?.teacherCorrection?.corrected) return "corregido";
  const models = modelsOf(exercise);
  if (models.includes("esquema")) return "pendiente";
  if (models.includes("cuestionario") && questionsSnapshotOf(result, exercise).some((q) => q.type === "desarrollo")) return "pendiente";
  return "auto";
};

// ── Ejercicios multiparte (F4) ────────────────────────────────────────────────
// Partes embebidas, no ejercicios enlazados: un solo documento, una entrega,
// instantánea por construcción. La proyección (partsOf/partToExercise) es la
// pieza que hace todo lo demás barato — ver PLAN_MAESTRO.md F4 y
// plan_ejercicios_multiparte.md. Con las vistas grandes (ExerciseView,
// SchemaExerciseView, QuestionnaireView, QuestionManagerView, CorrectionView)
// sin tocar por dentro: reciben el ejercicio proyectado de la parte activa,
// igual que hoy reciben el proyectado de paleta (applyPaletteToExercise).

const SINGLE_PART_ID = "p1";
// Campos que definen una parte — exactamente el subconjunto de Exercise que
// depende del audio y de la clave (ver Part en types.ts).
export const PART_FIELDS = [
  "title", "composerName", "showComposer",
  "audioUrl", "audioName", "duration",
  "audioFragmentStart", "audioFragmentEnd", "audioTotalDuration", "waveformData",
  "answers", "schemaKey", "repetitions", "questions",
] as const;

// Si `parts` trae más de una parte, lo devuelve tal cual (multiparte genuino).
// Con una parte (o sin `parts`), sintetiza/refresca esa única parte a partir
// de los campos planos actuales: todo ejercicio existente es, automáticamente,
// un multiparte de una parte — cero migración de datos. Refrescar en vez de
// devolver la parte guardada tal cual importa: App.tsx guarda esquema/
// interactivo/cuestionario en los campos planos (nunca en `parts`) mientras
// el ejercicio tenga una sola parte (ver isMultiPart/qmIsMultiPart), así que
// una `parts[0]` congelada desde la creación quedaría obsoleta y, vía
// partToExercise, taparía los datos frescos (p. ej. preguntas de cuestionario
// que "desaparecían" en híbridos de una parte).
export const partsOf = (exercise?: Exercise | null): Part[] => {
  if (!exercise) return [];
  if (Array.isArray(exercise.parts) && exercise.parts.length > 1) return exercise.parts;
  const base: Part = exercise.parts?.[0] ?? { id: SINGLE_PART_ID, points: 1 };
  const synthesized: Part = { ...base };
  for (const field of PART_FIELDS) (synthesized as Record<string, unknown>)[field] = exercise[field];
  return [synthesized];
};

// A2-02: al pasar de multiparte a una única parte superviviente (removePart
// 2→1), el guardado escribía `parts:[A]` sin tocar los campos planos del
// ejercicio (obsoletos desde que se hizo multiparte) — partsOf(), con
// length===1, sintetiza SIEMPRE desde esos planos, así que el audio/clave/
// preguntas de A quedaban enmascarados. Aplicar esto ANTES de guardar copia
// los PART_FIELDS de la parte superviviente a los planos y quita `parts`, de
// modo que partsOf() vuelve a sintetizar correctamente. Idempotente con
// ejercicios sin `parts` o con ≥2 partes (los devuelve intactos).
export function flattenSinglePart(exercise: Exercise): Exercise {
  if (!Array.isArray(exercise.parts) || exercise.parts.length !== 1) return exercise;
  const [only] = exercise.parts;
  const flat: Record<string, unknown> = { ...exercise };
  for (const field of PART_FIELDS) flat[field] = (only as Record<string, unknown>)[field];
  delete flat.parts;
  return flat as Exercise;
}

// ── Frontera de datos (M1.1) ──────────────────────────────────────────────────
// Aplica de una vez, en la frontera (carga desde Supabase, escrituras y
// semillas), el trabajo de forma que hoy hacían categoriesOf/modelOf/
// questionsOf/partsOf en cada lectura dispersa por los componentes. El
// resultado trae categories/models/questions/parts ya poblados — los
// componentes los leen como campos directos (M1.2) sin repetir la detección
// de formas heredadas en cada render. Idempotente: los cuatro lectores ya
// devuelven su propio campo canónico sin más trabajo cuando ya está poblado,
// así que normalizeExercise(normalizeExercise(ex)) === normalizeExercise(ex).
// Cada parte normaliza también su `questions` a array (nunca undefined): las
// vistas de sesión multiparte proyectan con partToExercise y leen `.questions`
// directo de esa proyección.
export const normalizeExercise = (exercise: Exercise): Exercise => ({
  ...exercise,
  categories: categoriesOf(exercise),
  models: modelsOf(exercise),
  questions: questionsOf(exercise),
  parts: partsOf(exercise).map((p) => (Array.isArray(p.questions) ? p : { ...p, questions: [] })),
});

// Mezcla una parte sobre el ejercicio: el resultado tiene la forma plana que
// hoy consumen las vistas (useAudioPlayer, ExerciseView, SchemaExerciseView,
// QuestionnaireView, QuestionManagerView, CorrectionView). `id` siempre es el
// del ejercicio (no el de la parte); `composerName` cae al del ejercicio si
// la parte no trae uno propio.
export const partToExercise = (exercise: Exercise, part: Part): Exercise => ({
  ...exercise,
  ...part,
  id: exercise.id,
  composerName: part.composerName || exercise.composerName,
});

// Duración total del ejercicio: suma de sus partes.
export const durationOf = (exercise?: Exercise | null): number =>
  partsOf(exercise).reduce((sum, p) => sum + (p.duration || 0), 0);

// Número total de preguntas del ejercicio: suma de sus partes (con una parte
// sintetizada, coincide con questionsOf(exercise).length).
export const questionsCountOf = (exercise?: Exercise | null): number =>
  partsOf(exercise).reduce((sum, p) => sum + (p.questions?.length ?? 0), 0);

// Ámbito de una pregunta (M6): el campo explícito `scope` manda; si falta (datos
// antiguos), se infiere de los tiempos — con audioStart Y audioEnd numéricos es
// de fragmento; sin ellos, de obra. Así, una pregunta legada con tiempos sigue
// siendo de fragmento y una sin tiempos pasa a tratarse como de obra, que es
// como ya se reproducía (desde 0, sin acotar).
export const questionScopeOf = (q?: Question | null): "fragmento" | "obra" => {
  if (q?.scope === "fragmento" || q?.scope === "obra") return q.scope;
  return (typeof q?.audioStart === "number" && typeof q?.audioEnd === "number") ? "fragmento" : "obra";
};

// ¿Esta parte concreta tiene lista la clave de todos los modelos del combo?
// Extraído para que keyReadyOf (todas las partes) y quien necesite apuntar a
// la primera parte incompleta (p.ej. el botón "Grabar clave" genérico) usen
// exactamente el mismo criterio por parte.
export const partKeyReadyOf = (exercise: Exercise, part: Part, models: string[]): boolean => {
  const projected = partToExercise(exercise, part);
  return models.every((m) => {
    if (m === "cuestionario") return questionsOf(projected).length > 0;
    if (m === "esquema") return Array.isArray(projected.schemaKey) && (projected.schemaKey as unknown[]).length > 0;
    const { recorded, total } = answerStats(projected);
    return total > 0 && recorded === total;
  });
};

// La clave está lista si TODAS las partes tienen clave lista para TODOS los
// modelos del combo (v1: mismo combo para todas las partes). Sustituye a los
// cálculos ad-hoc de keyReady dispersos por las vistas — algunos de los
// cuales daban "Configurada" a un esquema sin schemaKey, o ignoraban el
// segundo modelo de un combo (el agujero de los híbridos ya documentado).
export const keyReadyOf = (exercise?: Exercise | null): boolean => {
  const models = modelsOf(exercise);
  const parts = partsOf(exercise);
  if (parts.length === 0) return false;
  return parts.every((part) => partKeyReadyOf(exercise as Exercise, part, models));
};

// Fusiona `patch` sobre la parte `partId` (materializa `parts` a partir de
// partsOf() si el ejercicio aún no lo tenía — así una edición cualquiera de
// un ejercicio de una parte no pierde el resto de campos). No muta el original.
export const updatePart = (exercise: Exercise, partId: string, patch: Partial<Part>): Exercise => ({
  ...exercise,
  parts: partsOf(exercise).map((p) => (p.id === partId ? { ...p, ...patch } : p)),
});

export interface PartResultEnvelope { byModel: Record<string, ExerciseResult>; }

// El gemelo tolerante de partsOf, para resultados: si el result ya trae
// `parts` (sobre compuesto, F4), lo devuelve tal cual; si no (resultado plano
// heredado, de antes de esta fase), lo envuelve como una única parte con un
// único modelo — el que indica `result.type`. CorrectionView y las listas
// leen siempre a través de este lector, sin ramas legacy propias.
export const resultPartsOf = (result: ExerciseResult | null | undefined): Record<string, PartResultEnvelope> => {
  const parts = (result as { parts?: unknown } | null | undefined)?.parts;
  if (parts && typeof parts === "object") return parts as Record<string, PartResultEnvelope>;
  if (!result) return {};
  const modelId = (result as { type?: string }).type || "interactivo";
  return { [SINGLE_PART_ID]: { byModel: { [modelId]: result } } };
};

// ── Intentos (F6, T6.3) ────────────────────────────────────────────────────
// Lista de intentos de una entrega, más reciente al final. Lectura tolerante:
// sin `attempts` (entregas de antes de esta fase, o la primera entrega de
// siempre), el propio result ES el único intento.
export const attemptsOf = (result: ExerciseResult | null | undefined): ExerciseResult[] =>
  result?.attempts?.length ? result.attempts : (result ? [result] : []);

// Añade `newAttempt` (el sobre completo que ya construye submitAnswer, sin
// tocar) al historial de intentos — nunca sobrescribe. El resultado de nivel
// superior es un espejo del ÚLTIMO intento (mismo type/answers/parts/status/
// teacherCorrection: todo lector existente que lea esos campos directamente
// del result sigue funcionando sin cambios) con dos añadidos: `score` pasa a
// ser el MEJOR de todos los intentos, y `attempts` guarda el historial
// completo — decisiones cerradas del plan (score = mejor, status = del
// último). "Repetir" llama a esto en vez de sobrescribir.
export const addAttempt = (existing: ExerciseResult | null | undefined, newAttempt: ExerciseResult): ExerciseResult => {
  const attempts = [...attemptsOf(existing), newAttempt];
  const scores = attempts.map((a) => a?.score).filter((s): s is number => s != null);
  return {
    ...newAttempt,
    score: scores.length ? Math.max(...scores) : null,
    attempts,
  };
};

// Compositores únicos de las partes de un ejercicio, en orden de aparición
// (F4, T4.5) — con una parte sintetizada, equivale a [exercise.composerName]
// si lo hay. Las listas usan esto para «Compositor: X» (una parte) frente a
// «Compositores: varios» (partes con compositores distintos).
export const composersOf = (exercise?: Exercise | null): string[] =>
  [...new Set(partsOf(exercise).map((p) => p.composerName).filter((c): c is string => Boolean(c)))];

// Listas únicas y ordenadas de compositores / etiquetas del almacén de audios.
// Centralizadas aquí porque se usaban (con ligeras inconsistencias) en varias
// pestañas y modales.
export const audioComposers = (audioLibrary?: Array<{ composer?: string }> | null): string[] =>
  [...new Set((audioLibrary || []).map((a) => a.composer).filter((c): c is string => Boolean(c)))].sort();
export const audioTags      = (audioLibrary?: Array<{ tags?: string[] }> | null): string[] =>
  [...new Set((audioLibrary || []).flatMap((a) => a.tags || []).filter((t): t is string => Boolean(t)))].sort();
