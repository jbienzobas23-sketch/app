// ═══ VIEWMODETOGGLE ═══════════════════════════════════════════════════════════
// Interruptor Completa/Resumida de la vista de repetición. Extraído de
// SchemaExerciseView.tsx (C4.3c): solo depende de viewMode/onChange, sin
// ningún acoplamiento con el motor de drag.
import { C, FONT_SANS } from "../../theme/tokens.js";

interface ViewModeToggleProps {
  viewMode: string;
  onChange: (mode: string) => void;
}

export function ViewModeToggle({ viewMode, onChange }: ViewModeToggleProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4 }}>
      <span style={{ fontSize: 9, color: C.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.9, fontFamily: FONT_SANS, paddingLeft: 2 }}>Vista de repetición</span>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <div role="tablist"
          style={{ display: "flex", flexDirection: "row", background: C.paper2, border: `1px solid ${C.line}`, borderRadius: 999, overflow: "hidden", padding: 2, gap: 2, height: 26, boxSizing: "border-box" }}>
          {[["completa", "Completa"], ["resumida", "Resumida"]].map(([v, label]) => (
            <button key={v} type="button" role="tab" aria-selected={viewMode === v}
              onClick={() => onChange(v)}
              title={v === "completa" ? "Vista secuencial editable" : "Vista comprimida (solo lectura)"}
              style={{
                flex: "1 1 0", border: "none", borderRadius: 999,
                background: viewMode === v ? C.ink : "transparent",
                color: viewMode === v ? C.paper : C.muted,
                padding: "0 10px", fontSize: 11, fontWeight: viewMode === v ? 600 : 400,
                cursor: "pointer", transition: "all .12s", fontFamily: FONT_SANS,
                whiteSpace: "nowrap",
              }}>
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
