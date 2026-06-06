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
  // Campos de presentación — usados en tarjetas y cabeceras de sesión
  composerName?: string;
  showComposer?: boolean;
  [k: string]: unknown;
}

// Resultado de un ejercicio (respuesta del alumno almacenada en Supabase)
export interface ExerciseResult {
  score?: number | null;
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
