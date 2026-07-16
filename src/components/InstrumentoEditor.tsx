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
import { C, S, F } from "../theme/tokens.js";
import { uid } from "../lib/ids.js";
import { nota10 } from "../lib/scoring.js";
import { cambiaTipoInstrumento, clonaInstrumento, notaInstrumento, nuevoInstrumento, TIPO_INSTRUMENTO_LABEL, type Instrumento } from "../lib/calificacion.js";
import { ModalShell, ModalFooter, PesoChip } from "./primitives.jsx";
import { InstrumentoRespuestas } from "./InstrumentoRespuestas.jsx";

const TIPOS = (["lista", "escala", "rubrica"] as const).map((id) => ({ id, label: TIPO_INSTRUMENTO_LABEL[id] }));

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
        {/* La rejilla es InstrumentoRespuestas (N4.1) — la misma pieza con la
            que el profesor rellenará el instrumento al corregir. */}
        <InstrumentoRespuestas instrumento={value} respuestas={respuestas} onChange={setRespuestas} />
      </div>
    </div>
  );
}

// ── Modal: borrador local + «Guardar» ────────────────────────────────────────
export function InstrumentoEditorModal({ initial, onSave, onGuardarPlantilla, onClose }: {
  initial: Instrumento;
  onSave: (instrumento: Instrumento) => void;
  // N3.2: guarda el borrador en la biblioteca del profesor (fa_users.data
  // .instrumentos) sin cerrar el modal — se puede seguir editando la copia local.
  onGuardarPlantilla?: (instrumento: Instrumento) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Instrumento>(initial);
  const [plantillaGuardada, setPlantillaGuardada] = useState(false);
  // Un instrumento se puede guardar cuando todo lo que pondera tiene nombre:
  // cada ítem con texto y (fuera de lista) cada nivel con etiqueta.
  const canSave =
    draft.items.length > 0 &&
    draft.items.every((it) => it.texto.trim()) &&
    draft.niveles.every((n) => n.etiqueta.trim());
  return (
    <ModalShell width={620} align="top" onClose={onClose} label="Instrumento de evaluación">
      <h3 style={{ margin: "0 0 18px", fontSize: 16, fontWeight: 600, color: C.ink }}>Instrumento de evaluación</h3>
      <InstrumentoEditor value={draft} onChange={(i) => { setDraft(i); setPlantillaGuardada(false); }} />
      {onGuardarPlantilla && (
        <div style={{ marginTop: 14 }}>
          <button type="button" disabled={!canSave || plantillaGuardada}
            onClick={() => { onGuardarPlantilla(clonaInstrumento(draft)); setPlantillaGuardada(true); }}
            style={{ ...S.btn, fontSize: 12, opacity: canSave && !plantillaGuardada ? 1 : 0.5 }}>
            {plantillaGuardada ? "Plantilla guardada ✓" : "Guardar como plantilla"}
          </button>
        </div>
      )}
      <div style={{ marginTop: 18 }}>
        <ModalFooter onCancel={onClose} onSave={() => canSave && onSave(draft)} canSave={canSave} />
      </div>
    </ModalShell>
  );
}

// ── Punto de adjuntado (N3.3) ────────────────────────────────────────────────
// Bloque compartido por los tres sitios donde se adjunta un instrumento
// (pregunta de desarrollo, interactivo libre y esquema): resumen del adjunto
// + Crear / Desde plantilla / Editar / Quitar, con sus dos modales. El
// llamador solo aporta dónde se escribe (onChange; undefined = quitar) y, si
// tiene a mano el perfil del profesor, la biblioteca de plantillas.
export function InstrumentoAttach({ instrumento, onChange, plantillas, onChangePlantillas }: {
  instrumento?: Instrumento;
  onChange: (instrumento: Instrumento | undefined) => void;
  plantillas?: Instrumento[];
  onChangePlantillas?: (next: Instrumento[]) => void;
}) {
  const [editando, setEditando] = useState<Instrumento | null>(null);
  const [bibliotecaAbierta, setBibliotecaAbierta] = useState(false);
  const conBiblioteca = plantillas != null && onChangePlantillas != null;
  return (
    <div>
      {instrumento ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {instrumento.titulo?.trim() || TIPO_INSTRUMENTO_LABEL[instrumento.tipo]}
            </div>
            <div style={{ fontSize: 11.5, color: C.muted }}>
              {TIPO_INSTRUMENTO_LABEL[instrumento.tipo]} · {instrumento.items.length} {instrumento.items.length === 1 ? "ítem" : "ítems"}
            </div>
          </div>
          <button type="button" onClick={() => setEditando(clonaInstrumento(instrumento))} style={{ ...S.btn, padding: "5px 12px", fontSize: 12 }}>Editar</button>
          <button type="button" onClick={() => onChange(undefined)} style={{ ...S.btnDanger, padding: "5px 12px", fontSize: 12 }}>Quitar</button>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={() => setEditando(nuevoInstrumento("lista"))} style={{ ...S.btn, flex: 1, fontSize: 12.5 }}>Crear instrumento</button>
          {conBiblioteca && (
            <button type="button" onClick={() => setBibliotecaAbierta(true)} style={{ ...S.btn, flex: 1, fontSize: 12.5 }}>Desde plantilla</button>
          )}
        </div>
      )}
      {editando && (
        <InstrumentoEditorModal
          initial={editando}
          onSave={(i) => { onChange(i); setEditando(null); }}
          onGuardarPlantilla={conBiblioteca ? (i) => onChangePlantillas([...plantillas, i]) : undefined}
          onClose={() => setEditando(null)} />
      )}
      {bibliotecaAbierta && conBiblioteca && (
        <InstrumentoBibliotecaModal
          plantillas={plantillas}
          onAdjuntar={(i) => { onChange(i); setBibliotecaAbierta(false); }}
          onChangePlantillas={onChangePlantillas}
          onClose={() => setBibliotecaAbierta(false)} />
      )}
    </div>
  );
}

// ── Biblioteca de plantillas del profesor (N3.2) ─────────────────────────────
// Adjuntar entrega una COPIA (clonaInstrumento): la instantánea que pide §2
// del plan — editar la plantilla después no reescribe lo adjuntado. Duplicar y
// eliminar operan por índice (las plantillas no llevan id propio) y persisten
// vía onChangePlantillas (el llamador escribe el array entero en el perfil).
export function InstrumentoBibliotecaModal({ plantillas, onAdjuntar, onChangePlantillas, onClose }: {
  plantillas: Instrumento[];
  onAdjuntar: (instrumento: Instrumento) => void;
  onChangePlantillas: (next: Instrumento[]) => void;
  onClose: () => void;
}) {
  const duplicar = (idx: number) => {
    const copia = clonaInstrumento(plantillas[idx]);
    copia.titulo = `${copia.titulo?.trim() || TIPO_INSTRUMENTO_LABEL[copia.tipo]} (copia)`;
    const next = [...plantillas];
    next.splice(idx + 1, 0, copia);
    onChangePlantillas(next);
  };
  return (
    <ModalShell width={520} align="top" onClose={onClose} label="Plantillas de instrumento">
      <h3 style={{ margin: "0 0 14px", fontSize: 16, fontWeight: 600, color: C.ink }}>Plantillas de instrumento</h3>
      {plantillas.length === 0 && (
        <p style={{ fontSize: 13, color: C.muted, margin: "0 0 4px" }}>
          No hay plantillas guardadas. Al editar un instrumento, «Guardar como plantilla» lo añade aquí.
        </p>
      )}
      {plantillas.map((p, idx) => (
        <div key={idx} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderTop: idx > 0 ? `1px solid ${C.line}` : "none" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: F.serif, fontSize: 15.5, fontWeight: 600, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {p.titulo?.trim() || TIPO_INSTRUMENTO_LABEL[p.tipo]}
            </div>
            <div style={{ fontSize: 11.5, color: C.muted }}>
              {TIPO_INSTRUMENTO_LABEL[p.tipo]} · {p.items.length} {p.items.length === 1 ? "ítem" : "ítems"}
            </div>
          </div>
          <button type="button" onClick={() => onAdjuntar(clonaInstrumento(p))} style={{ ...S.btnPrimary, padding: "5px 12px", fontSize: 12 }}>Adjuntar</button>
          <button type="button" onClick={() => duplicar(idx)} style={{ ...S.btn, padding: "5px 10px", fontSize: 12 }}>Duplicar</button>
          <button type="button" aria-label={`Eliminar plantilla ${p.titulo?.trim() || TIPO_INSTRUMENTO_LABEL[p.tipo]}`}
            onClick={() => onChangePlantillas(plantillas.filter((_, j) => j !== idx))}
            style={{ ...S.btnDanger, padding: "5px 9px", fontSize: 11 }}>×</button>
        </div>
      ))}
      <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
        <button type="button" onClick={onClose} style={{ ...S.btn }}>Cerrar</button>
      </div>
    </ModalShell>
  );
}
