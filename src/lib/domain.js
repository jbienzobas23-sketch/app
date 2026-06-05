// ═══ HELPERS DE FORMA DE DOMINIO ═════════════════════════════════════════════
// Lectores tolerantes del modelo de ejercicio (formato nuevo `categories`/`answers`
// y heredado `mode`/`answer`), modelos y combos, y listas del almacén de audios.
// Extraídos de App.jsx (Fase 0) sin cambiar su lógica.
import { DEFAULT_CATEGORY } from "../seed.js";

export const DEFAULT_MODEL_ID = "interactivo";

// Opciones de combinación de modelos para el editor (incluye modelos individuales + combos dobles)
export const MODEL_COMBOS = [
  { id: "interactivo",              models: ["interactivo"],                name: "Interactivo",                description: "El alumno marca categorías en vivo durante el audio." },
  { id: "cuestionario",             models: ["cuestionario"],               name: "Cuestionario",               description: "Preguntas ancladas a fragmentos concretos del audio." },
  { id: "esquema",                  models: ["esquema"],                    name: "Esquema",                    description: "El alumno dibuja bloques de forma musical en una línea de tiempo." },
  { id: "interactivo+cuestionario", models: ["interactivo","cuestionario"], name: "Interactivo + Cuestionario", description: "El alumno puede alternar entre marcado en vivo y cuestionario de preguntas." },
  { id: "esquema+cuestionario",     models: ["esquema","cuestionario"],     name: "Esquema + Cuestionario",     description: "El alumno puede alternar entre el esquema formal y el cuestionario." },
];

// Devuelve el comboId a partir de un array de modelos (para inicializar el editor)
export function comboIdFromModels(models) {
  if (!Array.isArray(models) || models.length === 0) return DEFAULT_MODEL_ID;
  if (models.length === 1) return models[0];
  const has = (m) => models.includes(m);
  if (has("interactivo") && has("cuestionario")) return "interactivo+cuestionario";
  if (has("esquema")     && has("cuestionario")) return "esquema+cuestionario";
  return models[0];
}

export const categoriesOf = (exercise) => {
  if (Array.isArray(exercise?.categories) && exercise.categories.length > 0) return exercise.categories;
  if (Array.isArray(exercise?.modes)      && exercise.modes.length > 0)      return exercise.modes;
  if (exercise?.mode) return [exercise.mode];
  return [DEFAULT_CATEGORY];
};

export const modelOf = (exercise) => exercise?.model || DEFAULT_MODEL_ID;

// Devuelve el array de modelos de un ejercicio (puede tener 1 ó 2 modelos)
export const modelsOf = (exercise) => {
  if (Array.isArray(exercise?.models) && exercise.models.length > 0) return exercise.models;
  return [modelOf(exercise)];
};

export const answerFor = (exercise, categoryId) => {
  if (exercise?.answers && Array.isArray(exercise.answers[categoryId])) return exercise.answers[categoryId];
  if (Array.isArray(exercise?.answer)) {
    const legacyCategoryId = exercise.mode?.id || DEFAULT_CATEGORY.id;
    if (categoryId === legacyCategoryId) return exercise.answer;
  }
  return [];
};

export const answerStats = (exercise) => {
  const cats = categoriesOf(exercise);
  const recorded = cats.filter((c) => answerFor(exercise, c.id).length > 0).length;
  return { recorded, total: cats.length };
};

export const btnOf       = (category, id) => category.buttons.find((b) => b.id === id) || category.buttons[0];
export const questionsOf = (exercise)      => (Array.isArray(exercise?.questions) ? exercise.questions : []);

// Listas únicas y ordenadas de compositores / etiquetas del almacén de audios.
// Centralizadas aquí porque se usaban (con ligeras inconsistencias) en varias
// pestañas y modales.
export const audioComposers = (audioLibrary) => [...new Set((audioLibrary || []).map((a) => a.composer).filter(Boolean))].sort();
export const audioTags      = (audioLibrary) => [...new Set((audioLibrary || []).flatMap((a) => a.tags || []).filter(Boolean))].sort();
