// Paso 2 — Modelo (M5.2): elegir modelo o combo (MODEL_COMBOS). Se conserva la
// selección por comboId del editor previo (una sola fuente para el guardado).
import { C, S } from "../../theme/tokens.js";
import { MODEL_COMBOS } from "../../lib/domain.js";
import { MODEL_META } from "../../lib/modelMeta.js";
import type { EditorApi } from "./useExerciseEditor.js";
import { StepHead } from "./editorUi.js";

export function Paso2Modelo({ ed }: { ed: EditorApi; goStep: (n: number) => void }) {
  const { comboId, setComboId, selectedModels } = ed;
  return (
    <>
      <StepHead n={2} title="Modelo de ejercicio" desc="Un modelo, o un combo de dos entre los que el alumno alterna." />
      <div style={{ ...S.card, marginBottom: 0 }}>
        <div style={{ ...S.row, gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
          {MODEL_COMBOS.slice(0, 3).map((c) => {
            const isActive = comboId === c.id;
            const dotColor = MODEL_META[c.models[0]]?.color || C.muted;
            return (
              <button key={c.id} type="button" onClick={() => setComboId(c.id)} title={c.description}
                style={{ ...S.btn, flex: "1 1 30%", fontSize: 13, padding: "10px 10px", background: isActive ? C.ink : C.paper2, color: isActive ? C.paper : C.ink2, border: `1px solid ${isActive ? C.ink : C.line}`, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: isActive ? "rgba(255,255,255,0.55)" : dotColor, flexShrink: 0 }} />
                {c.name}
              </button>
            );
          })}
        </div>
        <div style={{ ...S.row, gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
          {MODEL_COMBOS.slice(3).map((c) => {
            const isActive = comboId === c.id;
            return (
              <button key={c.id} type="button" onClick={() => setComboId(c.id)} title={c.description}
                style={{ ...S.btn, flex: "1 1 45%", fontSize: 12, padding: "10px 10px", background: isActive ? C.ink : C.paper2, color: isActive ? C.paper : C.ink2, border: `1px solid ${isActive ? C.ink : C.line}`, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                <span style={{ display: "flex", borderRadius: 999, overflow: "hidden", flexShrink: 0 }}>
                  <span style={{ width: 8, height: 8, background: MODEL_META[c.models[0]]?.color || C.muted }} />
                  <span style={{ width: 8, height: 8, background: MODEL_META[c.models[1]]?.color || C.muted }} />
                </span>
                {c.name}
              </button>
            );
          })}
        </div>
        <p style={{ fontSize: 11.5, color: C.muted, marginTop: 12, lineHeight: 1.5 }}>Al cambiar de modelo, las claves ya grabadas de cada parte se conservan.</p>
        {selectedModels.length > 1 && (
          <p style={{ fontSize: 11, color: C.muted, margin: "4px 0 0", padding: "6px 10px", background: C.paper2, borderRadius: 8, lineHeight: 1.5 }}>
            El alumno podrá alternar entre los dos modos durante la práctica del ejercicio.
          </p>
        )}
      </div>
    </>
  );
}
