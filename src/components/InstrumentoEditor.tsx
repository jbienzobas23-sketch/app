// ═══ INSTRUMENTOEDITOR (N3.1) ═════════════════════════════════════════════════
// Editor de instrumentos de evaluación (lista de control / escala estimativa /
// rúbrica): un componente único con tres presentaciones, según el tipo. La
// anatomía de la vista previa (rejilla ítems × niveles con celda ✓) es la del
// mockup de corrección (docs/mockups_calificacion.html) — la misma que verá el
// profesor al corregir (N4), para que lo que se construye aquí se lea igual
// que donde se usará. La nota en vivo sale de notaInstrumento (calificacion.ts).
//
// InstrumentoEditor es controlado (value/onChange) y NO persiste nada: quien
// persiste es InstrumentoEditorModal, que edita un borrador local y solo
// confirma al pulsar «Guardar» — escribir en Supabase por cada tecla fue el
// bug B de la revisión de N1 (PesoChip) y aquí hay muchos más inputs de texto.
import { useState } from "react";
import { C, S, F, FONT_SANS } from "../theme/tokens.js";
import { uid } from "../lib/ids.js";
import { nota10 } from "../lib/scoring.js";
import { cambiaTipoInstrumento, notaInstrumento, type Instrumento } from "../lib/calificacion.js";
import { ModalShell, ModalFooter, PesoChip } from "./primitives.jsx";

const TIPOS: { id: Instrumento["tipo"]; label: string }[] = [
  { id: "lista", label: "Lista de control" },
  { id: "escala", label: "Escala estimativa" },
  { id: "rubrica", label: "Rúbrica" },
];

// Valores 0..1 con coma española ("0,5"), como el resto de cifras de la app.
const fmtValor = (v: number): string => String(v).replace(".", ",");

const filaStyle = { display: "flex", alignItems: "center", gap: 8, marginBottom: 6 } as const;
const quitarStyle = { ...S.btnDanger, padding: "5px 9px", fontSize: 11, flexShrink: 0 } as const;

export interface InstrumentoEditorProps {
  value: Instrumento;
  onChange: (instrumento: Instrumento) => void;
}

export function InstrumentoEditor({ value, onChange }: InstrumentoEditorProps) {
  // Respuestas de ejemplo de la vista previa: estado local (no se guardan; solo
  // existen para ver moverse la nota). Re-clicar una celda la des-selecciona —
  // así también se ve que un ítem sin responder queda fuera de la ponderación.
  const [respuestas, setRespuestas] = useState<Record<string, string>>({});
  const esLista = value.tipo === "lista";
  const esRubrica = value.tipo === "rubrica";

  const setItems = (items: Instrumento["items"]) => onChange({ ...value, items });
  const setNiveles = (niveles: Instrumento["niveles"]) => onChange({ ...value, niveles });
  const updateItem = (id: string, patch: Partial<Instrumento["items"][number]>) =>
    setItems(value.items.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  const updateNivel = (id: string, patch: Partial<Instrumento["niveles"][number]>) =>
    setNiveles(value.niveles.map((n) => (n.id === id ? { ...n, ...patch } : n)));

  const totalPeso = value.items.reduce((s, it) => s + it.peso, 0);
  const notaPreview = notaInstrumento(value, respuestas);

  return (
    <div>
      {/* ── Tipo ── */}
      <label style={S.label}>Tipo</label>
      <div style={{ ...S.row, gap: 8, marginBottom: 14 }}>
        {TIPOS.map((t) => (
          <button key={t.id} type="button" onClick={() => onChange(cambiaTipoInstrumento(value, t.id))}
            style={{
              ...S.btn, flex: 1, fontSize: 12,
              background: value.tipo === t.id ? C.ink : C.paper,
              color:      value.tipo === t.id ? C.paper : C.ink2,
              border:     `1px solid ${value.tipo === t.id ? C.ink : C.line}`,
            }}>
            {t.label}
          </button>
        ))}
      </div>

      <label style={S.label}>Título</label>
      <input style={{ ...S.input, marginBottom: 14 }} value={value.titulo ?? ""}
        onChange={(e) => onChange({ ...value, titulo: e.target.value })}
        placeholder="Ej: Análisis de una modulación" />

      {/* ── Niveles ── */}
      <label style={S.label}>Niveles</label>
      {esLista ? (
        // La lista de control tiene los niveles fijos Sí=1/No=0 (§2 del plan):
        // se muestran como dato, sin inputs que sugieran que pueden cambiarse.
        <div style={{ fontSize: 13, color: C.ink2, marginBottom: 14, fontVariantNumeric: "tabular-nums" }}>
          {value.niveles.map((n) => `${n.etiqueta} = ${fmtValor(n.valor)}`).join(" · ")}
        </div>
      ) : (
        <div style={{ marginBottom: 14 }}>
          {value.niveles.map((n) => (
            <div key={n.id} style={filaStyle}>
              <input style={{ ...S.input, flex: 1 }} value={n.etiqueta} aria-label="Etiqueta del nivel"
                onChange={(e) => updateNivel(n.id, { etiqueta: e.target.value })} placeholder="Etiqueta" />
              <input type="number" min={0} max={1} step={0.05} value={n.valor} aria-label="Valor del nivel (0 a 1)"
                onChange={(e) => updateNivel(n.id, { valor: Math.max(0, Math.min(1, Number(e.target.value) || 0)) })}
                style={{ ...S.input, width: 74, textAlign: "right" }} />
              <button type="button" aria-label={`Quitar nivel ${n.etiqueta}`} disabled={value.niveles.length <= 2}
                onClick={() => setNiveles(value.niveles.filter((x) => x.id !== n.id))}
                style={{ ...quitarStyle, opacity: value.niveles.length <= 2 ? 0.4 : 1 }}>×</button>
            </div>
          ))}
          <button type="button" disabled={value.niveles.length >= 6}
            onClick={() => setNiveles([...value.niveles, { id: uid("nv"), etiqueta: "", valor: 1 }])}
            style={{ ...S.btn, width: "100%", fontSize: 12, opacity: value.niveles.length >= 6 ? 0.4 : 1 }}>
            + Añadir nivel
          </button>
        </div>
      )}

      {/* ── Ítems ── */}
      <label style={S.label}>Ítems</label>
      <div style={{ marginBottom: 4 }}>
        {value.items.map((it) => (
          <div key={it.id} style={{ border: `1px solid ${C.line}`, borderRadius: 10, padding: "10px 12px", marginBottom: 8, background: C.paper2 }}>
            <div style={{ ...filaStyle, marginBottom: esRubrica ? 8 : 0 }}>
              <input style={{ ...S.input, flex: 1 }} value={it.texto} aria-label="Texto del ítem"
                onChange={(e) => updateItem(it.id, { texto: e.target.value })} placeholder="Qué se valora en este ítem" />
              <PesoChip value={it.peso} editable onChange={(n) => updateItem(it.id, { peso: n })} />
              <button type="button" aria-label="Quitar ítem" disabled={value.items.length <= 1}
                onClick={() => setItems(value.items.filter((x) => x.id !== it.id))}
                style={{ ...quitarStyle, opacity: value.items.length <= 1 ? 0.4 : 1 }}>×</button>
            </div>
            {esRubrica && (
              <div style={{ display: "grid", gridTemplateColumns: `repeat(${value.niveles.length}, 1fr)`, gap: 6 }}>
                {value.niveles.map((n) => (
                  <textarea key={n.id} rows={2} aria-label={`Descriptor de «${it.texto || "ítem"}» para ${n.etiqueta}`}
                    value={it.descriptores?.[n.id] ?? ""}
                    onChange={(e) => updateItem(it.id, { descriptores: { ...(it.descriptores ?? {}), [n.id]: e.target.value } })}
                    placeholder={n.etiqueta}
                    style={{ ...S.input, resize: "vertical", fontSize: 12, minHeight: 44 }} />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      <button type="button" onClick={() => setItems([...value.items, { id: uid("it"), texto: "", peso: 1 }])}
        style={{ ...S.btn, width: "100%", fontSize: 12, marginBottom: 6 }}>
        + Añadir ítem
      </button>
      <div style={{ fontSize: 12, color: C.muted, marginBottom: 16 }}>
        {totalPeso > 0 ? value.items.map((it) => `${Math.round((it.peso / totalPeso) * 100)} %`).join(" · ") : "—"}
      </div>

      {/* ── Vista previa (nota en vivo con respuestas de ejemplo) ── */}
      <div style={{ border: `1px solid ${C.line}`, borderRadius: 10, padding: "12px 14px", background: C.paper }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
          <span style={S.label}>Vista previa</span>
          <span style={{ fontFamily: F.serif, fontSize: 24, fontWeight: 600, color: C.ink, fontVariantNumeric: "tabular-nums" }}>
            {nota10(notaPreview) ?? "—"}
          </span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: `1.15fr repeat(${value.niveles.length}, 1fr)`, gap: 6, alignItems: "stretch" }}>
          {/* Cabecera solo en rúbrica: ahí la celda lleva el descriptor y la
              etiqueta·valor tiene que vivir arriba; en lista/escala la propia
              celda ya dice el nivel. */}
          {esRubrica && (
            <>
              <div />
              {value.niveles.map((n) => (
                <div key={n.id} style={{ fontSize: 11.5, color: C.muted, textAlign: "center", alignSelf: "end", paddingBottom: 2, fontFamily: FONT_SANS }}>
                  {n.etiqueta} · {fmtValor(n.valor)}
                </div>
              ))}
            </>
          )}
          {value.items.map((it) => {
            const elegido = respuestas[it.id];
            return [
              <div key={`${it.id}-t`} style={{ fontSize: 13, display: "flex", flexDirection: "column", gap: 3, justifyContent: "center" }}>
                <span style={{ color: C.ink }}>{it.texto || "—"}</span>
                <span style={{ ...S.badge, background: C.paper2, border: `1px solid ${C.line}`, color: C.ink2, alignSelf: "flex-start", fontWeight: 500 }}>
                  {totalPeso > 0 ? `${Math.round((it.peso / totalPeso) * 100)} %` : "—"}
                </span>
              </div>,
              ...value.niveles.map((n) => {
                const on = elegido === n.id;
                return (
                  <button key={`${it.id}-${n.id}`} type="button" aria-pressed={on}
                    aria-label={`${it.texto || "ítem"}: ${n.etiqueta}`}
                    onClick={() => setRespuestas((prev) => {
                      const next = { ...prev };
                      if (on) delete next[it.id]; else next[it.id] = n.id;
                      return next;
                    })}
                    style={{
                      border: `1px solid ${on ? C.ink : C.line}`, background: C.paper, borderRadius: 8,
                      padding: "8px 6px", fontFamily: FONT_SANS, fontSize: 12, textAlign: "center",
                      color: on ? C.ink : C.ink2, fontWeight: on ? 600 : 400, cursor: "pointer",
                    }}>
                    {on ? "✓ " : ""}{esRubrica ? (it.descriptores?.[n.id] || n.etiqueta) : `${n.etiqueta} · ${fmtValor(n.valor)}`}
                  </button>
                );
              }),
            ];
          })}
        </div>
      </div>
    </div>
  );
}

// ── Modal: borrador local + «Guardar» ────────────────────────────────────────
export function InstrumentoEditorModal({ initial, onSave, onClose }: {
  initial: Instrumento;
  onSave: (instrumento: Instrumento) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Instrumento>(initial);
  // Un instrumento se puede guardar cuando todo lo que pondera tiene nombre:
  // cada ítem con texto y (fuera de lista) cada nivel con etiqueta.
  const canSave =
    draft.items.length > 0 &&
    draft.items.every((it) => it.texto.trim()) &&
    draft.niveles.every((n) => n.etiqueta.trim());
  return (
    <ModalShell width={620} align="top" onClose={onClose} label="Instrumento de evaluación">
      <h3 style={{ margin: "0 0 18px", fontSize: 16, fontWeight: 600, color: C.ink }}>Instrumento de evaluación</h3>
      <InstrumentoEditor value={draft} onChange={setDraft} />
      <div style={{ marginTop: 18 }}>
        <ModalFooter onCancel={onClose} onSave={() => canSave && onSave(draft)} canSave={canSave} />
      </div>
    </ModalShell>
  );
}
