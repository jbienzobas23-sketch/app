// Paso 1 — Identidad (M5.2): título + categorías (interactivo) + interruptor
// "Mostrar compositor al alumno". El compositor se indica en cada audio (paso 3).
import { C, S, FONT_SANS } from "../../theme/tokens.js";
import type { EditorApi } from "./useExerciseEditor.js";
import { StepHead, Switch } from "./editorUi.js";

export function Paso1Identidad({ ed }: { ed: EditorApi; goStep: (n: number) => void }) {
  const { title, setTitle, selectedModels, categories, selectedCategoryIds, selectedButtonIds, toggleCategory, toggleButton, showComposer, setShowComposer } = ed;
  const hasInteractivo = selectedModels.includes("interactivo");
  return (
    <>
      <StepHead n={1} title="Identidad" desc="Título y etiquetas del ejercicio." />
      <div style={{ ...S.card, marginBottom: 0 }}>
        <div style={{ marginBottom: 15 }}>
          <label style={S.label} htmlFor="ed-title">Título</label>
          <input id="ed-title" value={title} onChange={(e) => setTitle(e.target.value)} autoComplete="off"
            placeholder="P. ej. Cadencias — tres audios"
            style={{ ...S.input, fontFamily: "'Cormorant Garamond',Georgia,serif", fontWeight: 700, fontSize: 22, padding: "10px 12px" }} />
        </div>

        <div style={{ display: "grid", gap: 16, gridTemplateColumns: "1fr", ...(hasInteractivo ? {} : {}) }}>
          {hasInteractivo && (
            <div>
              <label style={{ ...S.label, marginBottom: 8 }}>Categorías y botones</label>
              <div style={{ background: C.paper2, border: `1px solid ${C.line}`, borderRadius: 10, padding: 8, maxHeight: 320, overflowY: "auto" }}>
                {categories.map((cat) => {
                  const checked  = selectedCategoryIds.has(cat.id);
                  const isLast   = checked && selectedCategoryIds.size === 1;
                  const selBtns  = selectedButtonIds.get(cat.id) || new Set();
                  const allCount = cat.buttons.length;
                  const selCount = checked ? [...cat.buttons].filter((b) => selBtns.has(b.id)).length : 0;
                  return (
                    <div key={cat.id} style={{ marginBottom: checked ? 6 : 2 }}>
                      <label style={{ ...S.row, gap: 10, padding: "6px 8px", borderRadius: 6, cursor: isLast ? "not-allowed" : "pointer", background: checked ? "rgba(26,25,21,0.04)" : "transparent" }}>
                        <input type="checkbox" checked={checked} onChange={() => toggleCategory(cat.id)} style={{ cursor: isLast ? "not-allowed" : "pointer", flexShrink: 0 }} />
                        <span style={{ fontSize: 13, fontWeight: 500, color: checked ? C.ink : C.muted2, flex: 1 }}>{cat.name}</span>
                        <span style={{ fontSize: 11, color: C.muted, fontFamily: FONT_SANS, fontVariantNumeric: "tabular-nums" }}>{checked ? `${selCount}/${allCount}` : `${allCount} btn`}</span>
                      </label>
                      {checked && (
                        <div style={{ paddingLeft: 28, paddingBottom: 4, paddingTop: 2, display: "flex", flexDirection: "column", gap: 1 }}>
                          {cat.buttons.map((btn) => {
                            const bChecked = selBtns.has(btn.id);
                            const bIsLast  = bChecked && selCount === 1;
                            return (
                              <label key={btn.id} style={{ ...S.row, gap: 8, padding: "4px 8px", borderRadius: 6, cursor: bIsLast ? "not-allowed" : "pointer", opacity: bChecked ? 1 : 0.45 }}>
                                <input type="checkbox" checked={bChecked} onChange={() => toggleButton(cat.id, btn.id)} style={{ cursor: bIsLast ? "not-allowed" : "pointer", flexShrink: 0 }} />
                                <span style={{ width: 20, height: 20, borderRadius: "50%", background: btn.color, flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 800, color: "#fff", fontFamily: FONT_SANS }}>{btn.id}</span>
                                <span style={{ fontSize: 13, color: C.ink2 }}>{btn.name}</span>
                                <span style={{ fontSize: 10, color: C.muted, fontFamily: FONT_SANS, marginLeft: "auto" }}>[{(btn.key ?? "").toUpperCase()}]</span>
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, paddingTop: hasInteractivo ? 4 : 0 }}>
            <div>
              <div style={{ fontSize: 13, color: C.ink }}>Mostrar compositor al alumno</div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>El compositor se indica en cada audio (paso 3)</div>
            </div>
            <Switch on={showComposer} onToggle={() => setShowComposer((v) => !v)} label="Mostrar compositor al alumno" />
          </div>
        </div>
      </div>
    </>
  );
}
