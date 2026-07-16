// ═══ FUENTENOTA (N4.1) ════════════════════════════════════════════════════════
// Selector de la FUENTE de la nota en una corrección: Automática (preliminar) /
// Instrumento (si el ejercicio o la pregunta lo lleva adjunto, N3.3) / Nota
// directa. Es la misma pieza para un ejercicio simple (esquema, interactivo)
// y para una pregunta de desarrollo (cuestionario, N4.2). La preliminar queda
// SIEMPRE visible como referencia aunque se elija otra fuente (regla de oro 3);
// la nota que produce el estado actual la calcula notaDeFuente (notaShared.ts)
// — el llamador la lee con esa misma función al guardar.
import { C, FONT_SANS } from "../../theme/tokens.js";
import { scoreColor } from "../../lib/color.js";
import { nota10 } from "../../lib/scoring.js";
import type { Instrumento } from "../../lib/calificacion.js";
import { InstrumentoRespuestas } from "../InstrumentoRespuestas.jsx";
import { NotaInput } from "./NotaInput.js";
import { notaDeFuente, type FuenteNotaState } from "./notaShared.js";

const FUENTE_LABEL: Record<FuenteNotaState["fuente"], string> = {
  auto: "Automática",
  instrumento: "Instrumento",
  directa: "Nota directa",
};

export interface FuenteNotaPanelProps {
  state: FuenteNotaState;
  onChange: (next: FuenteNotaState) => void;
  preliminar: number | null;
  // Rótulo de la preliminar («colocación de bloques», «cobertura — no mide
  // acierto»…); el llamador sabe qué mide la suya.
  preliminarLabel?: string;
  instrumento?: Instrumento;
  // false = sin opción «Automática» (una pregunta de desarrollo no tiene
  // preliminar propia que certificar).
  conAuto?: boolean;
  // false = el panel muestra solo la nota del instrumento y el llamador pinta
  // la rejilla (InstrumentoRespuestas, mismo estado) donde quepa — el panel
  // lateral de esquema/interactivo mide 232 px y una rúbrica no cabe ahí.
  rejillaEnPanel?: boolean;
}

export function FuenteNotaPanel({ state, onChange, preliminar, preliminarLabel, instrumento, conAuto = true, rejillaEnPanel = true }: FuenteNotaPanelProps) {
  const fuentes: FuenteNotaState["fuente"][] = [
    ...(conAuto ? ["auto" as const] : []),
    ...(instrumento ? ["instrumento" as const] : []),
    "directa",
  ];
  const nota = notaDeFuente(state, preliminar, instrumento);
  return (
    <div>
      {fuentes.length > 1 && (
        <div style={{ display: "inline-flex", border: `1px solid ${C.line}`, borderRadius: 8, overflow: "hidden", marginBottom: 10 }}>
          {fuentes.map((f, i) => (
            <button key={f} type="button" aria-pressed={state.fuente === f}
              onClick={() => onChange({ ...state, fuente: f })}
              style={{
                background: state.fuente === f ? C.paper2 : C.paper, border: "none",
                borderLeft: i > 0 ? `1px solid ${C.line}` : "none",
                padding: "5px 10px", fontFamily: FONT_SANS, fontSize: 12, fontWeight: 500,
                color: state.fuente === f ? C.ink : C.muted, cursor: "pointer",
              }}>
              {FUENTE_LABEL[f]}
            </button>
          ))}
        </div>
      )}

      {state.fuente === "auto" && (
        <div style={{ display: "flex", alignItems: "baseline", gap: 3 }}>
          <span style={{ fontSize: 42, fontWeight: 800, color: preliminar != null ? scoreColor(preliminar) : C.muted, lineHeight: 1, fontVariantNumeric: "tabular-nums", fontFamily: FONT_SANS }}>
            {nota10(preliminar) ?? "—"}
          </span>
          <span style={{ fontSize: 16, fontWeight: 700, color: C.muted2 }}>/10</span>
        </div>
      )}

      {state.fuente === "directa" && (
        <NotaInput value={state.directa} onChange={(v) => onChange({ ...state, directa: v })} auto100={preliminar} />
      )}

      {state.fuente === "instrumento" && instrumento && (
        <div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 3, marginBottom: rejillaEnPanel ? 10 : 0 }}>
            <span style={{ fontSize: 42, fontWeight: 800, color: nota != null ? scoreColor(nota) : C.muted, lineHeight: 1, fontVariantNumeric: "tabular-nums", fontFamily: FONT_SANS }}>
              {nota10(nota) ?? "—"}
            </span>
            <span style={{ fontSize: 16, fontWeight: 700, color: C.muted2 }}>/10</span>
          </div>
          {rejillaEnPanel && (
            <InstrumentoRespuestas instrumento={instrumento} respuestas={state.respuestas}
              onChange={(respuestas) => onChange({ ...state, respuestas })} />
          )}
        </div>
      )}

      {/* La preliminar de referencia, siempre a la vista cuando la fuente
          elegida es otra (regla de oro 3). */}
      {state.fuente !== "auto" && preliminar != null && (
        <div style={{ fontSize: 10.5, color: C.muted, marginTop: 8, lineHeight: 1.5 }}>
          Automática: <strong style={{ color: C.ink2, fontVariantNumeric: "tabular-nums" }}>{nota10(preliminar)}</strong>
          {preliminarLabel ? ` · ${preliminarLabel}` : ""}
        </div>
      )}
      {state.fuente === "auto" && preliminarLabel && (
        <div style={{ fontSize: 10.5, color: C.muted, marginTop: 6, lineHeight: 1.5 }}>{preliminarLabel}</div>
      )}
    </div>
  );
}
