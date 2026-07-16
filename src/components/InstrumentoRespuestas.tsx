// ═══ INSTRUMENTORESPUESTAS (N4.1) ═════════════════════════════════════════════
// La rejilla ítems × niveles de un instrumento con una elección por ítem — la
// anatomía del mockup de corrección (celda clicable con ✓, cabecera
// etiqueta·valor en rúbrica). Es LA MISMA pieza en la vista previa del editor
// (N3.1) y en el panel de corrección (N4.1): lo que el profesor construye se
// lee idéntico donde se usa. Controlada: respuestas/onChange del llamador;
// re-clicar una celda la des-selecciona (el ítem queda fuera de la ponderación).
import { C, S, FONT_SANS } from "../theme/tokens.js";
import type { Instrumento } from "../lib/calificacion.js";

// Valores 0..1 con coma española ("0,5"), como el resto de cifras de la app.
const fmtValor = (v: number): string => String(v).replace(".", ",");

export interface InstrumentoRespuestasProps {
  instrumento: Instrumento;
  respuestas: Record<string, string>;
  onChange?: (next: Record<string, string>) => void;   // ausente = solo lectura
}

export function InstrumentoRespuestas({ instrumento, respuestas, onChange }: InstrumentoRespuestasProps) {
  const esRubrica = instrumento.tipo === "rubrica";
  const totalPeso = instrumento.items.reduce((s, it) => s + it.peso, 0);
  const elegir = (itemId: string, nivelId: string) => {
    if (!onChange) return;
    const next = { ...respuestas };
    if (next[itemId] === nivelId) delete next[itemId]; else next[itemId] = nivelId;
    onChange(next);
  };
  return (
    <div style={{ display: "grid", gridTemplateColumns: `1.15fr repeat(${instrumento.niveles.length}, 1fr)`, gap: 6, alignItems: "stretch" }}>
      {/* Cabecera solo en rúbrica: ahí la celda lleva el descriptor y la
          etiqueta·valor tiene que vivir arriba; en lista/escala la propia
          celda ya dice el nivel. */}
      {esRubrica && (
        <>
          <div />
          {instrumento.niveles.map((n) => (
            <div key={n.id} style={{ fontSize: 11.5, color: C.muted, textAlign: "center", alignSelf: "end", paddingBottom: 2, fontFamily: FONT_SANS }}>
              {n.etiqueta} · {fmtValor(n.valor)}
            </div>
          ))}
        </>
      )}
      {instrumento.items.map((it) => {
        const elegido = respuestas[it.id];
        return [
          <div key={`${it.id}-t`} style={{ fontSize: 13, display: "flex", flexDirection: "column", gap: 3, justifyContent: "center" }}>
            <span style={{ color: C.ink }}>{it.texto || "—"}</span>
            <span style={{ ...S.badge, background: C.paper2, border: `1px solid ${C.line}`, color: C.ink2, alignSelf: "flex-start", fontWeight: 500 }}>
              {totalPeso > 0 ? `${Math.round((it.peso / totalPeso) * 100)} %` : "—"}
            </span>
          </div>,
          ...instrumento.niveles.map((n) => {
            const on = elegido === n.id;
            return (
              <button key={`${it.id}-${n.id}`} type="button" aria-pressed={on} disabled={!onChange}
                aria-label={`${it.texto || "ítem"}: ${n.etiqueta}`}
                onClick={() => elegir(it.id, n.id)}
                style={{
                  border: `1px solid ${on ? C.ink : C.line}`, background: C.paper, borderRadius: 8,
                  padding: "8px 6px", fontFamily: FONT_SANS, fontSize: 12, textAlign: "center",
                  color: on ? C.ink : C.ink2, fontWeight: on ? 600 : 400,
                  cursor: onChange ? "pointer" : "default",
                }}>
                {on ? "✓ " : ""}{esRubrica ? (it.descriptores?.[n.id] || n.etiqueta) : `${n.etiqueta} · ${fmtValor(n.valor)}`}
              </button>
            );
          }),
        ];
      })}
    </div>
  );
}
