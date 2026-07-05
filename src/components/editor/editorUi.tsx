// Piezas de UI compartidas por los pasos del asistente (M5): cabecera de paso y
// el interruptor del sistema. Estilos = tokens del sistema (la demo v3 define el
// comportamiento; el aspecto es el de la app).
import type { ReactNode } from "react";
import { C, F, FONT_SANS } from "../../theme/tokens.js";

// Cabecera de paso. `num`/`total` rotulan «Paso N de M» (el total es dinámico:
// el paso Categorías solo existe en interactivo). La descripción va en Cormorant
// itálica — la misma tipografía con la que la app rotula subtítulos bajo un
// título serif (descripción de curso, compositor de un audio…), no sans-serif.
// `right` (Paso Audios con varias partes): acompañante en la MISMA fila que el
// título (el selector de partes), como el `.shrow` de la demo — evita el hueco
// vacío que deja un elemento en su propia fila alineado a la derecha.
export function StepHead({ num, total, title, desc, right }: { num: number; total: number; title: string; desc?: string; right?: ReactNode }) {
  const head = (
    <>
      <span style={{ display: "block", fontSize: 9.5, letterSpacing: "1.4px", textTransform: "uppercase", color: C.muted, fontWeight: 600, marginBottom: 2, fontFamily: FONT_SANS }}>Paso {num} de {total}</span>
      <h1 style={{ fontFamily: F.serif, fontWeight: 700, fontSize: 25, margin: 0, color: C.ink }}>{title}</h1>
      {desc && <p style={{ fontFamily: F.serif, fontStyle: "italic", fontSize: 14.5, color: C.ink2, marginTop: 4, maxWidth: 560, lineHeight: 1.4 }}>{desc}</p>}
    </>
  );
  if (!right) return <div style={{ margin: "4px 2px 14px" }}>{head}</div>;
  return (
    <div style={{ margin: "4px 2px 14px", display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
      <div style={{ flex: "1 1 260px", minWidth: 0 }}>{head}</div>
      {right}
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
