// ═══ HELPERS DE FORMA DE DOMINIO ═════════════════════════════════════════════
// Lectores tolerantes del modelo de ejercicio (formato nuevo `categories`/`answers`
// y heredado `mode`/`answer`), modelos y combos, y listas del almacén de audios.
// Extraídos de App.jsx (Fase 0). Migrado a TypeScript (Fase 3).
import { DEFAULT_CATEGORY } from "../seed.js";
import type { Exercise, Category, Button, Question, Course, Unit, Role, ExerciseResult } from "./types.js";

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

export const btnOf       = (category: { buttons: Button[] }, id: string): Button => category.buttons.find((b) => b.id === id) || category.buttons[0];
export const questionsOf = (exercise?: Exercise | null): Question[] => (Array.isArray(exercise?.questions) ? exercise.questions : []);

// Estado vigente de una entrega. "Pendiente" cubre los modelos que no se
// pueden autocorregir con una fórmula (esquema siempre, cuestionario si
// tiene alguna pregunta de desarrollo) — hasta que el profesor los revisa
// manualmente, mostrar una nota sería mostrar un cero engañoso.
export const resultStatusOf = (result: ExerciseResult | null | undefined, exercise: Exercise | null | undefined): "auto" | "pendiente" | "corregido" => {
  if (result?.teacherCorrection?.corrected) return "corregido";
  const models = modelsOf(exercise);
  if (models.includes("esquema")) return "pendiente";
  if (models.includes("cuestionario") && questionsOf(exercise).some((q) => q.type === "desarrollo")) return "pendiente";
  return "auto";
};

// Listas únicas y ordenadas de compositores / etiquetas del almacén de audios.
// Centralizadas aquí porque se usaban (con ligeras inconsistencias) en varias
// pestañas y modales.
export const audioComposers = (audioLibrary?: Array<{ composer?: string }> | null): string[] =>
  [...new Set((audioLibrary || []).map((a) => a.composer).filter((c): c is string => Boolean(c)))].sort();
export const audioTags      = (audioLibrary?: Array<{ tags?: string[] }> | null): string[] =>
  [...new Set((audioLibrary || []).flatMap((a) => a.tags || []).filter((t): t is string => Boolean(t)))].sort();
