// ═══ METADATOS POR MODELO DE EJERCICIO ═══════════════════════════════════════
// Color de franja + etiqueta por modelo (interactivo/cuestionario/esquema).
// Extraído de App.jsx (Fase 2). Migrado a TypeScript (Fase 3).
import { modelOf } from "./domain.js";
import type { Exercise } from "./types.js";

export interface ModelMeta { color: string; label: string; plateBg: string; }

// Metadatos por modelo de ejercicio: color de acento (icono/franja), etiqueta y
// fondo teñido de la "placa" de tipo (icono en color de acento sobre fondo suave).
export const MODEL_META: Record<string, ModelMeta> = {
  interactivo:  { color: "#3F9B5B", label: "Interactivo",  plateBg: "#edf5ef" },
  cuestionario: { color: "#2F6FB8", label: "Cuestionario", plateBg: "#eef3f9" },
  esquema:      { color: "#C77A1A", label: "Esquema",      plateBg: "#f8f1e6" },
};
export const modelMeta = (ex?: Exercise | null): ModelMeta => MODEL_META[modelOf(ex)] || MODEL_META.interactivo;
