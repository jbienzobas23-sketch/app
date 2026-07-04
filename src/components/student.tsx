// ═══ COMPONENTES DE ALUMNO ═══════════════════════════════════════════════════
// Barra de alternancia de modelos. Extraído (Fase 2). La tarjeta/fila de
// ejercicio del alumno vive ahora en ExerciseItem.tsx (M2) — sustituye a
// ExerciseCard/ExerciseRow, que se retiran de aquí.
import { C, F } from "../theme/tokens.js";
import { MODEL_META } from "../lib/modelMeta.js";

// ── Interfaces de props ──────────────────────────────────────────────────────
interface ModelToggleBarProps { models: string[]; activeIdx: number; onSwitch: (idx: number) => void; }

// Barra de alternancia entre modelos (se inyecta entre título y waveform en sesiones con 2 modelos)
export function ModelToggleBar({ models, activeIdx, onSwitch }: ModelToggleBarProps) {
  if (!models || models.length < 2) return null;
  return (
    <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
      <div style={{
        display: "inline-flex",
        background: C.paper2,
        border: `1px solid ${C.line}`,
        borderRadius: 999,
        padding: 3,
        gap: 3,
      }}>
        {models.map((modelId, idx) => {
          const meta = MODEL_META[modelId] || MODEL_META.interactivo;
          const isActive = activeIdx === idx;
          return (
            <button
              key={modelId}
              type="button"
              onClick={() => onSwitch(idx)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "5px 16px",
                borderRadius: 999,
                border: "none",
                background: isActive ? C.ink : "transparent",
                color: isActive ? C.paper : C.ink2,
                cursor: "pointer",
                fontFamily: F.sans,
                fontSize: 12,
                fontWeight: isActive ? 600 : 400,
                transition: "background .15s, color .15s",
                whiteSpace: "nowrap",
              }}
            >
              <span style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: isActive ? "rgba(255,255,255,0.55)" : meta.color,
                flexShrink: 0,
                transition: "background .15s",
              }} />
              {meta.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
