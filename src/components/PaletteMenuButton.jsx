// ═══ PALETTEMENUBUTTON ═══════════════════════════════════════════════════════
// Botón con desplegable para elegir la paleta de color por defecto. Vive en su
// propio módulo (extraído de teacher.jsx, Fase 6) para que StudentDash pueda
// usarlo SIN arrastrar todo el subsistema de profesor al bundle del alumno
// (lo que anulaba el code-splitting de TeacherDash).
import { useState, useEffect, useRef } from "react";
import { C, F } from "../theme/tokens.js";
import { SCHEMA_PALETTES, SCHEMA_PALETTE_DEFAULT, getSchemaPalette } from "../lib/palette.js";
import { Chevron } from "./primitives.jsx";

export function PaletteMenuButton({ current, onSelect, label = "Paleta" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("touchstart", onDown); };
  }, [open]);
  const cur = getSchemaPalette(current) || SCHEMA_PALETTES[0];
  return (
    <div ref={ref} style={{ position: "relative", flexShrink: 0 }}>
      <button type="button" onClick={() => setOpen(o => !o)} className="fa-pressable"
        title="Paleta de color por defecto"
        style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "6px 9px", borderRadius: 7, cursor: "pointer", background: C.paper, border: `1px solid ${C.rail}`, fontFamily: F.sans }}>
        <span style={{ display: "inline-flex", borderRadius: 3, overflow: "hidden", border: "1px solid rgba(0,0,0,0.08)" }}>
          {cur.parts.map((c, i) => <span key={i} style={{ width: 9, height: 12, background: c, display: "block" }} />)}
        </span>
        <Chevron open={open} size={11} color={C.muted} />
      </button>
      {open && (
        <div className="fa-pop" style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 40, background: C.paper, border: `1px solid ${C.line}`, borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.12)", padding: 6, display: "flex", flexDirection: "column", gap: 2, minWidth: 172 }}>
          <div style={{ fontFamily: F.sans, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: C.muted, padding: "4px 8px 6px" }}>{label}</div>
          {SCHEMA_PALETTES.map((pal) => {
            const active = (current || SCHEMA_PALETTE_DEFAULT) === pal.id;
            return (
              <button key={pal.id} type="button" onClick={() => { onSelect(pal.id); setOpen(false); }}
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
