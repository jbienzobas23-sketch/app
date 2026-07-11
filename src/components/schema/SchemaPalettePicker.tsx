// ═══ SCHEMAPALETTEPICKER ══════════════════════════════════════════════════════
// Selector de paleta de color del esquema — discreto y desplegable. Extraído
// de SchemaExerciseView.tsx (C4.3a): estado y ciclo de vida (abierto/cerrado,
// cierre al hacer clic fuera) son enteramente locales a este control; lo único
// que el padre necesita es la paleta elegida y notificar el cambio.
import { useEffect, useRef, useState } from "react";
import { C, F } from "../../theme/tokens.js";
import { SCHEMA_PALETTES, getSchemaPalette } from "../../lib/palette.js";
import { Chevron } from "../primitives.jsx";

interface SchemaPalettePickerProps {
  schemaPalette: string;
  onChange: (paletteId: string) => void;
}

export function SchemaPalettePicker({ schemaPalette, onChange }: SchemaPalettePickerProps) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const paletteRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!paletteOpen) return;
    const onDown = (e: Event) => { if (paletteRef.current && !paletteRef.current.contains(e.target as Node)) setPaletteOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("touchstart", onDown); };
  }, [paletteOpen]);

  return (
    <div ref={paletteRef} style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10, position: "relative" }}
      onMouseDown={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()}>
      {(() => { const cur = getSchemaPalette(schemaPalette) || SCHEMA_PALETTES[0]; return (
        <button type="button" onClick={() => setPaletteOpen(o => !o)} className="fa-pressable"
          title="Cambiar paleta de color"
          style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "4px 9px 4px 8px", borderRadius: 8, cursor: "pointer", background: C.paper2, border: `1px solid ${C.line}`, fontFamily: F.sans }}>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: C.muted }}>Paleta</span>
          <span style={{ display: "inline-flex", borderRadius: 3, overflow: "hidden", border: "1px solid rgba(0,0,0,0.08)", flexShrink: 0 }}>
            {cur.parts.map((c, i) => <span key={i} style={{ width: 9, height: 12, background: c, display: "block" }} />)}
          </span>
          <Chevron open={paletteOpen} size={11} color={C.muted} />
        </button>
      ); })()}
      {paletteOpen && (
        <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 30, background: C.paper, border: `1px solid ${C.line}`, borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.12)", padding: 6, display: "flex", flexDirection: "column", gap: 2, minWidth: 168 }}>
          {SCHEMA_PALETTES.map(pal => {
            const active = schemaPalette === pal.id;
            return (
              <button key={pal.id} type="button" onClick={() => { onChange(pal.id); setPaletteOpen(false); }}
                style={{ display: "flex", alignItems: "center", gap: 9, padding: "6px 8px", borderRadius: 7, cursor: "pointer", background: active ? C.paper2 : "transparent", border: "none", fontFamily: F.sans, textAlign: "left", width: "100%" }}>
                <span style={{ display: "inline-flex", borderRadius: 4, overflow: "hidden", border: "1px solid rgba(0,0,0,0.08)", flexShrink: 0 }}>
                  {pal.parts.map((c, i) => <span key={i} style={{ width: 13, height: 16, background: c, display: "block" }} />)}
                </span>
                <span style={{ flex: 1, fontSize: 12.5, fontWeight: active ? 700 : 500, color: active ? C.ink : C.ink2 }}>{pal.name}</span>
                {active && <span style={{ fontSize: 12, color: C.ink, flexShrink: 0 }}>✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
