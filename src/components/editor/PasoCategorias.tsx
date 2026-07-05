// Paso Categorías (M5.8): árbol de categorías y botones que el alumno marcará
// sobre el audio. Solo existe cuando el modelo incluye «interactivo» (por eso el
// asistente tiene 5 pasos en interactivo y 4 en cuestionario/esquema). Extraído
// del antiguo paso Identidad. Ancho acotado (Jon: «demasiado espacio
// horizontal») y opción de crear una categoría nueva sin salir del asistente.
import { useState } from "react";
import { C, S, FONT_SANS } from "../../theme/tokens.js";
import type { Category } from "../../lib/types.js";
import { CategoryEditorModal } from "../modals.js";
import type { EditorApi } from "./useExerciseEditor.js";
import { StepHead } from "./editorUi.js";

export function PasoCategorias({ ed, num, total, onAddCategory }: {
  ed: EditorApi; goStep: (k: string) => void; num: number; total: number;
  onAddCategory?: (c: Category) => void;
}) {
  const { categories, selectedCategoryIds, selectedButtonIds, toggleCategory, toggleButton, selectNewCategory } = ed;
  const [showNewCat, setShowNewCat] = useState(false);
  return (
    <>
      <StepHead num={num} total={total} title="Categorías" />
      {/* El ancho lo acota el paso en EditorShell (contentMax) para que el panel
          y el pie de navegación queden alineados; aquí el panel llena la columna. */}
      <div style={{ ...S.card, marginBottom: 0 }}>
        <label style={{ ...S.label, marginBottom: 8 }}>Categorías y botones</label>
        <div style={{ background: C.paper2, border: `1px solid ${C.line}`, borderRadius: 10, padding: 8 }}>
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

        {onAddCategory && (
          <button type="button" onClick={() => setShowNewCat(true)}
            style={{ width: "100%", marginTop: 8, padding: "9px 12px", borderRadius: 10, border: `1.5px dashed ${C.rail}`, background: "transparent", cursor: "pointer", fontFamily: FONT_SANS, fontSize: 12.5, fontWeight: 600, color: C.ink2 }}>
            + Nueva categoría
          </button>
        )}
      </div>

      {showNewCat && onAddCategory && (
        <CategoryEditorModal
          onSave={(c) => { onAddCategory(c); selectNewCategory(c); setShowNewCat(false); }}
          onClose={() => setShowNewCat(false)}
        />
      )}
    </>
  );
}
