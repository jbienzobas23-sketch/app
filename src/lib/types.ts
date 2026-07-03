// ═══ TIPOS DE DOMINIO COMPARTIDOS ════════════════════════════════════════════
// Modelo del ejercicio y sus piezas. Tipos PERMISIVOS (campos conocidos tipados +
// índice abierto) para una migración gradual: el objeto exercise tiene muchos
// campos usados por toda la app; aquí se tipan los que consumen los módulos ya
// migrados, sin romper el acceso a los demás. Se irán afinando.

export interface Button {
  id: string;
  name?: string;
  color?: string;
  key?: string;
  [k: string]: unknown;
}

export interface Category {
  id: string;
  name?: string;
  buttons?: Button[];
  hasFigures?: boolean;
  [k: string]: unknown;
}

export interface QuestionOption {
  id: string;
  text?: string;
  [k: string]: unknown;
}

export interface Question {
  id: string;
  type?: string;
  text?: string;
  options?: QuestionOption[];
  correctOptionId?: string | null;
  audioStart?: number;
  audioEnd?: number;
  // Explicación del profesor (F5, T5.1): en test se muestra siempre tras
  // entregar (alumno y profesor); en desarrollo, solo al profesor — sirve de
  // pauta de corrección, no de respuesta que el alumno pueda ver antes de hora.
  explanation?: string;
  [k: string]: unknown;
}

// Una parte de un ejercicio multiparte (F4): exactamente el subconjunto de
// campos del Exercise plano que depende del audio y de la clave. El resto
// (modelo/combo, categorías, paleta, niveles…) queda a nivel de ejercicio,
// compartido por todas las partes (v1: mismo modelo para todas — ver
// PLAN_MAESTRO.md F4). Ver partsOf/partToExercise en domain.ts.
export interface Part {
  id: string;
  title?: string;
  composerName?: string;
  showComposer?: boolean;
  audioUrl?: string | null;
  audioName?: string | null;
  duration?: number;
  audioFragmentStart?: number;
  audioFragmentEnd?: number | null;
  audioTotalDuration?: number | null;
  waveformData?: number[] | null;
  answers?: Record<string, unknown[]>;
  schemaKey?: unknown[];
  repetitions?: unknown[];
  questions?: Question[];
  points?: number;
  [k: string]: unknown;
}

export interface Exercise {
  id?: string | number; // Las semillas usan number; los datos reales usan string
  title?: string;
  hidden?: boolean;
  model?: string;
  models?: string[];
  mode?: Category;
  modes?: Category[];
  categories?: Category[];
  answers?: Record<string, unknown[]>;
  answer?: unknown[];
  questions?: Question[];
  schemaPalette?: string;
  duration?: number;
  audioUrl?: string | null;
  audioFragmentStart?: number;
  audioFragmentEnd?: number | null;
  waveformData?: number[] | null;
  // Tolerancias propias del ejercicio; si faltan, se usa el margen global
  // (interactivo) o ±3s fijo (esquema) — ver calcScore/calcSchemaPlacementScore.
  margin?: number;
  schemaMargin?: number;
  // Campos de presentación — usados en tarjetas y cabeceras de sesión
  composerName?: string;
  showComposer?: boolean;
  // Ejercicio multiparte (F4): varias partes, cada una con su audio y su
  // clave, resueltas en una sola sesión con una sola entrega. Si falta o
  // está vacío, partsOf() sintetiza una única parte desde los campos planos
  // de arriba — todo ejercicio existente es, automáticamente, un multiparte
  // de una parte (sin migración).
  parts?: Part[];
  [k: string]: unknown;
}

// Resultado de un ejercicio (respuesta del alumno almacenada en Supabase)
export interface ExerciseResult {
  score?: number | null;
  status?: "auto" | "pendiente" | "corregido";
  teacherCorrection?: { corrected?: boolean; [k: string]: unknown };
  [k: string]: unknown;
}

// ── Organización: cursos, unidades didácticas y grupos de alumnos ─────────────
export interface Unit {
  id: string;
  name?: string;
  description?: string;
  exerciseIds?: string[];
  hidden?: boolean;
  [k: string]: unknown;
}

export interface Course {
  id: string;
  name?: string;
  description?: string;
  unitIds?: string[];
  hidden?: boolean;
  ownerId?: string;
  visibility?: string;
  visibilityGroupId?: string | null;
  [k: string]: unknown;
}

export interface Group {
  id: string;
  name?: string;
  studentIds?: string[];
  [k: string]: unknown;
}

// Mapa de resultados de un alumno indexado por id de ejercicio
export type ResultsMap = Record<string, ExerciseResult>;

// Rol del consumidor de las vistas de cursos
export type Role = "teacher" | "student";
