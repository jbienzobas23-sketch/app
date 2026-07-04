// Piezas de UI compartidas por los pasos del asistente (M5): cabecera de paso y
// el interruptor del sistema. Estilos = tokens del sistema (la demo v3 define el
// comportamiento; el aspecto es el de la app).
import { C, F, FONT_SANS } from "../../theme/tokens.js";

export function StepHead({ n, title, desc }: { n: number; title: string; desc?: string }) {
  return (
    <div style={{ margin: "4px 2px 14px" }}>
      <span style={{ display: "block", fontSize: 9.5, letterSpacing: "1.4px", textTransform: "uppercase", color: C.muted, fontWeight: 600, marginBottom: 2, fontFamily: FONT_SANS }}>Paso {n} de 5</span>
      <h1 style={{ fontFamily: F.serif, fontWeight: 700, fontSize: 25, margin: 0, color: C.ink }}>{title}</h1>
      {desc && <p style={{ fontSize: 12.5, color: C.muted, marginTop: 3, maxWidth: 560, lineHeight: 1.5 }}>{desc}</p>}
    </div>
  );
}

export function Switch({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={onToggle}
      style={{ width: 38, height: 22, borderRadius: 999, background: on ? C.fnT : "#d6d6d1", position: "relative", flex: "none", transition: "background .15s", border: "none", cursor: "pointer", padding: 0 }}>
      <span style={{ position: "absolute", width: 18, height: 18, borderRadius: "50%", background: "#fff", top: 2, left: on ? 18 : 2, boxShadow: "0 1px 3px rgba(0,0,0,0.25)", transition: "left .15s" }} />
    </button>
  );
}
