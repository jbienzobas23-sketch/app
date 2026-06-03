// ═══ METADATOS POR MODELO DE EJERCICIO ═══════════════════════════════════════
// Color de franja + etiqueta por modelo (interactivo/cuestionario/esquema).
// Extraído de App.jsx (Fase 2).
import { modelOf } from "./domain.js";

// Metadatos por modelo de ejercicio (color de franja + etiqueta)
export const MODEL_META = {
  interactivo:  { color: "#3F9B5B", label: "Interactivo"  },
  cuestionario: { color: "#2F6FB8", label: "Cuestionario" },
  esquema:      { color: "#C77A1A", label: "Esquema"      },
};
export const modelMeta = (ex) => MODEL_META[modelOf(ex)] || MODEL_META.interactivo;
