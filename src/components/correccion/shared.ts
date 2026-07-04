// ═══ CORRECCIÓN — TIPOS Y NORMALIZACIÓN DE NOTA (M3.4) ═══════════════════════
// Tipos y helper de nota compartidos por las tres vistas de corrección troceadas
// (InteractiveCorrection, SchemaCorrection, QuizCorrection) y por el contenedor
// CorrectionView. La cabecera de intentos vive en AttemptBanner.tsx (componente).
import type React from "react";
import type { Exercise } from "../../lib/types.js";

// ── Tipos locales de corrección ──────────────────────────────────────────────
// TeacherCorrection se re-exporta desde CorrectionView.tsx para que App.tsx
// tipe saveCorrection sin `any` (F7, T7.2) — tipo permisivo (índice abierto).
export interface TeacherCorrection {
  corrected?: boolean;
  // Solo la presente en corrección multiparte (T4.4): con partes aún sin
  // corregir, el sobre sigue "pendiente" aunque esta parte concreta ya se
  // haya guardado.
  status?: "pendiente" | "corregido";
  levelComments?: Record<string, string>;
  blockComments?: Record<string, string>;
  questionComments?: Record<string, string>;
  globalComment?: string;
  totalScore?: number | null;
  [k: string]: unknown;
}
export interface SchemaBlock { id: string; level: number; start: number; end: number; label?: string; bodyText?: string; [k: string]: unknown; }
export interface CorrectionIv { fn: string; start: number; end: number; [k: string]: unknown; }
export interface CorrectionResult {
  type?: string;
  teacherCorrection?: TeacherCorrection;
  blocks?: SchemaBlock[];
  placementScore?: number | null;
  schemaPalette?: string;
  score?: number | null;
  answers?: Record<string, string>;
  categoryId?: string;
  modeId?: string;
  intervals?: CorrectionIv[];
  extras?: Array<{ categoryId?: string; modeId?: string; score?: number | null }>;
  [k: string]: unknown;
}
export interface CorrectionStudent { id: string; displayName?: string; name?: string; [k: string]: unknown; }
export type SaveCorrection = (studentId: string | undefined, exerciseId: Exercise["id"], correction: TeacherCorrection) => void;
// Valor de los inputs de puntuación: vacío ("") o número/cadena del campo.
export type ScoreInput = string | number;

export interface CorrectionViewProps {
  exercise: Exercise;
  result: CorrectionResult;
  onBack: () => void;
  backLabel?: string;
  isTeacherMode?: boolean;
  student?: CorrectionStudent | null;
  onSaveCorrection?: SaveCorrection | null;
  // Contenido extra bajo el título (F4, T4.4): el navegador de chips de parte
  // + nota agregada que añade el envoltorio multiparte. null en el uso normal.
  extraHeaderContent?: React.ReactNode;
  // Cola de pendientes (F6, T6.2): navegador «‹ Anterior · N/M · Siguiente ›».
  queueLabel?: string | null;
  onPrev?: (() => void) | null;
  onNext?: (() => void) | null;
}

// Antes la nota manual del profesor se editaba en 0–10; ahora en 0–100 (la
// escala que consume scoreColor/ScoreBadge). Las correcciones guardadas en la
// escala antigua se leen tolerantemente: un totalScore <= 10 se interpreta como
// 0–10 y se multiplica por 10 al mostrarlo y al precargar el input de edición.
export const normalizeScore100 = (v: number | null | undefined): number | null =>
  v == null ? null : (v <= 10 ? v * 10 : v);
