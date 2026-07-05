// Paso Identidad (M5.8): título + modelo de ejercicio en una sola pantalla
// (reordenación pedida por Jon 2026-07-05). El modelo, botones sencillos (no
// tarjetas con descripción — Jon 2026-07-05): nombre + muestra de color, el
// activo en tinta. Las categorías (solo interactivo) pasan a su propio paso y el
// interruptor de compositor baja a Audios. La lógica de combos (MODEL_COMBOS/
// comboId) es la misma; solo cambia dónde y cómo se muestra.
import { C, F, S, FONT_SANS } from "../../theme/tokens.js";
import { MODEL_COMBOS } from "../../lib/domain.js";
import { MODEL_META } from "../../lib/modelMeta.js";
import type { EditorApi } from "./useExerciseEditor.js";
import { StepHead } from "./editorUi.js";

function ComboSwatch({ colors, active }: { colors: string[]; active: boolean }) {
  const border = active ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.15)";
  if (colors.length === 1) {
    return <span style={{ width: 10, height: 10, borderRadius: 3, background: colors[0], border: `1px solid ${border}`, flexShrink: 0 }} />;
  }
  return (
    <span style={{ display: "flex", borderRadius: 3, overflow: "hidden", border: `1px solid ${border}`, flexShrink: 0 }}>
      {colors.map((c, i) => <span key={i} style={{ width: 6, height: 10, background: c }} />)}
    </span>
  );
}

export function PasoIdentidad({ ed, num, total }: { ed: EditorApi; goStep: (k: string) => void; num: number; total: number }) {
  const { title, setTitle, comboId, setComboId } = ed;
  return (
    <>
      <StepHead num={num} total={total} title="Identidad" />

      <div style={{ ...S.card, marginBottom: 14 }}>
        <label style={S.label} htmlFor="ed-title">Título</label>
        <input id="ed-title" value={title} onChange={(e) => setTitle(e.target.value)} autoComplete="off"
          placeholder="P. ej. Cadencias — tres audios"
          style={{ ...S.input, fontFamily: F.serif, fontWeight: 700, fontSize: 22, padding: "10px 12px" }} />
      </div>

      <label style={{ ...S.label, margin: "0 2px 8px" }}>Modelo de ejercicio</label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {MODEL_COMBOS.map((c) => {
          const isActive = comboId === c.id;
          const colors = c.models.map((m) => MODEL_META[m]?.color || C.muted);
          return (
            <button key={c.id} type="button" onClick={() => setComboId(c.id)} aria-pressed={isActive}
              style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "9px 14px", borderRadius: 999, cursor: "pointer",
                border: `1px solid ${isActive ? C.ink : C.line}`, background: isActive ? C.ink : C.paper, color: isActive ? C.paper : C.ink2,
                fontFamily: FONT_SANS, fontSize: 13, fontWeight: 600 }}>
              <ComboSwatch colors={colors} active={isActive} />
              {c.name}
            </button>
          );
        })}
      </div>
    </>
  );
}
