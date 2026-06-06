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

export interface Question {
  id: string;
  type?: string;
  correctOptionId?: string | null;
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
  [k: string]: unknown;
}
