// ═══ METADATOS POR MODELO DE EJERCICIO ═══════════════════════════════════════
// Color de franja + etiqueta por modelo (interactivo/cuestionario/esquema).
// Extraído de App.jsx (Fase 2). Migrado a TypeScript (Fase 3).
import { modelOf } from "./domain.js";
import type { Exercise } from "./types.js";

export interface ModelMeta { color: string; label: string; }

// Metadatos por modelo de ejercicio (color de franja + etiqueta)
export const MODEL_META: Record<string, ModelMeta> = {
  interactivo:  { color: "#3F9B5B", label: "Interactivo"  },
  cuestionario: { color: "#2F6FB8", label: "Cuestionario" },
  esquema:      { color: "#C77A1A", label: "Esquema"      },
};
export const modelMeta = (ex?: Exercise | null): ModelMeta => MODEL_META[modelOf(ex)] || MODEL_META.interactivo;
