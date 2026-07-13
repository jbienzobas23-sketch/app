// ═══ VIEWMODETOGGLE ═══════════════════════════════════════════════════════════
// Interruptor Completa/Resumida de la vista de repetición. Extraído de
// SchemaExerciseView.tsx (C4.3c): solo depende de viewMode/onChange, sin
// ningún acoplamiento con el motor de drag.
// `compact` (Jon, 2026-07-12): en móvil las dos píldoras + la etiqueta no
// caben en la columna izquierda del transporte (junto a ⏮) y cualquier fila
// extra empuja los controles hacia abajo — en compacto se colapsa a UNA
// píldora-desplegable ("Resumida ▾", primitivo Menu) de la misma altura (26px)
// que el interruptor normal, así la sección de audio mide lo mismo haya o no
// repeticiones.
import { C, FONT_SANS } from "../../theme/tokens.js";
import { Menu } from "../primitives.jsx";
import type { CSSProperties } from "react";

interface ViewModeToggleProps {
  viewMode: string;
  onChange: (mode: string) => void;
  compact?: boolean;
}

const MODES: [string, string][] = [["completa", "Completa"], ["resumida", "Resumida"]];

const COMPACT_ITEM: CSSProperties = { display: "block", width: "100%", boxSizing: "border-box", textAlign: "left", padding: "8px 10px", borderRadius: 7, border: "none", background: "transparent", cursor: "pointer", fontFamily: FONT_SANS, fontSize: 12.5, color: C.ink2 };

export function ViewModeToggle({ viewMode, onChange, compact = false }: ViewModeToggleProps) {
  if (compact) {
    const currentLabel = MODES.find(([v]) => v === viewMode)?.[1] ?? viewMode;
    return (
      <Menu ariaLabel="Vista de repetición" panelStyle={{ minWidth: 150 }}
        trigger={({ open, toggle, triggerRef }) => (
          <button ref={triggerRef} type="button" onClick={toggle}
            aria-haspopup="menu" aria-expanded={open} title="Vista de repetición"
            style={{
              display: "flex", alignItems: "center", gap: 5, height: 26,
              background: C.paper2, border: `1px solid ${C.line}`, borderRadius: 999,
              padding: "0 10px", fontSize: 11, fontWeight: 600, color: C.ink2,
              cursor: "pointer", fontFamily: FONT_SANS, whiteSpace: "nowrap", boxSizing: "border-box",
            }}>
            {currentLabel}
            <svg aria-hidden="true" width="8" height="8" viewBox="0 0 10 10" fill="none" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .12s" }}>
              <path d="M2 3.5 L5 6.5 L8 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}>
        {({ close }) => (<>
          <div style={{ padding: "6px 10px 4px", fontSize: 9, color: C.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.9, fontFamily: FONT_SANS }}>Vista de repetición</div>
          {MODES.map(([v, label]) => (
            <button key={v} type="button" role="menuitemradio" aria-checked={viewMode === v}
              onClick={() => { close(); onChange(v); }}
              style={{ ...COMPACT_ITEM, fontWeight: viewMode === v ? 700 : 400, color: viewMode === v ? C.ink : C.ink2 }}>
              {viewMode === v ? "✓ " : ""}{label}
            </button>
          ))}
        </>)}
      </Menu>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4 }}>
      <span style={{ fontSize: 9, color: C.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.9, fontFamily: FONT_SANS, paddingLeft: 2 }}>Vista de repetición</span>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <div role="tablist"
          style={{ display: "flex", flexDirection: "row", background: C.paper2, border: `1px solid ${C.line}`, borderRadius: 999, overflow: "hidden", padding: 2, gap: 2, height: 26, boxSizing: "border-box" }}>
          {MODES.map(([v, label]) => (
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
