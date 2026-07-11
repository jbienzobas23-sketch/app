// ═══ BLOCKDETAILPANEL ═════════════════════════════════════════════════════════
// Panel de selección/detalle de bloque (o de repetición, o el vacío por
// defecto) + el área de texto/observaciones del nivel 4. Extraído de
// SchemaExerciseView.tsx (C4.3b): sin acoplamiento con el motor de drag
// (dragRef/trackSegRefs) — solo lee/escribe blocks y el bloque/repetición
// seleccionados, igual que antes.
import type { RefObject, CSSProperties } from "react";
import { C, S, FONT_SANS, FONT_SERIF } from "../../theme/tokens.js";
import type { Block, Rep } from "../../lib/repeats.js";
import { fmtClock } from "../../lib/time.js";
import { harmonyBlockColors } from "../../lib/harmony.js";
import { schemaBlockColor } from "../../lib/palette.js";
import { SCHEMA_LEVELS, type SchemaLevel } from "../../lib/schema.js";

interface BlockDetailPanelProps {
  selBlock: Block | null | undefined;
  selLv: SchemaLevel | null | undefined;
  selected: string | null;
  selectedRepId: string | null;
  localReps: Rep[];
  blocks: Block[];
  schemaPalette: string;
  colorInputRef: RefObject<HTMLInputElement | null>;
  setBlocks: (updater: (prev: Block[]) => Block[]) => void;
  setHistory: (updater: (prev: Block[][]) => Block[][]) => void;
  blocksRef: RefObject<Block[]>;
  setSelected: (id: string | null) => void;
  setSelectedRepId: (id: string | null) => void;
  setEditId: (id: string | null) => void;
  setEditVal: (val: string) => void;
  deleteRepeat: (repId: string) => void;
}

export function BlockDetailPanel({
  selBlock, selLv, selected, selectedRepId, localReps, blocks, schemaPalette, colorInputRef,
  setBlocks, setHistory, blocksRef, setSelected, setSelectedRepId, setEditId, setEditVal, deleteRepeat,
}: BlockDetailPanelProps) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      {selBlock && !selBlock.isPreview && selLv ? (
        <div style={{ background: C.paper, border: `1px solid ${selLv.color}40`, borderRadius: 12, padding: "10px 14px", display: "flex", alignItems: "center", gap: 9, flex: 1, minWidth: 0, flexWrap: "wrap" }}
          onMouseDown={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: selLv.color, flexShrink: 0 }} />
          <span style={{ fontFamily: FONT_SERIF, fontSize: 16, fontWeight: 700, color: C.ink }}>{selBlock.label}</span>
          <span style={{ fontSize: 11, color: C.muted, flex: 1, minWidth: 90 }}>
            {selLv.sub} · {fmtClock(selBlock.start)}–{fmtClock(selBlock.end)} · dur.&nbsp;{fmtClock(selBlock.end - selBlock.start)}
          </span>
          {/* Selector de color */}
          {selBlock.level !== 4 && (() => {
            const { bg: swatchBg } = selBlock.customColor
              ? harmonyBlockColors(null, selBlock.customColor)
              : selLv.id === 3 ? harmonyBlockColors(selBlock.label, selLv.color)
              : (selLv.id === 1 || selLv.id === 2) ? schemaBlockColor(selBlock, blocks, schemaPalette)
              : { bg: selLv.color };
            return (
              <span title="Cambiar color" style={{ position: "relative", display: "inline-flex", alignItems: "center", flexShrink: 0 }}>
                <span onClick={() => colorInputRef.current?.click()}
                  style={{ display: "inline-block", width: 22, height: 22, borderRadius: 5, background: swatchBg, border: `2px solid ${C.line}`, boxShadow: "inset 0 1px 2px rgba(0,0,0,0.12)", cursor: "pointer" }} />
                <input ref={colorInputRef} type="color" value={swatchBg}
                  onChange={e => { const hex = e.target.value; setBlocks(prev => prev.map(b => {
                    if (b.id === selected) return { ...b, customColor: hex };
                    if (prev.find(x => x.id === selected)?.pass === "first" && b.mirrorId === selected) return { ...b, customColor: hex };
                    return b;
                  })); }}
                  style={{ position: "absolute", opacity: 0, width: "100%", height: "100%", top: 0, left: 0, cursor: "pointer", border: "none", padding: 0 }} />
              </span>
            );
          })()}
          {selBlock.level !== 4 && selBlock.customColor && (
            <button title="Restablecer color automático" aria-label="Restablecer color automático" className="fa-pressable"
              onClick={() => setBlocks(prev => { const selB = prev.find(b => b.id === selected); return prev.map(b => { if (b.id === selected) return { ...b, customColor: undefined }; if (selB?.pass === "first" && b.mirrorId === selected) return { ...b, customColor: undefined }; return b; }); })}
              style={{ border: `1px solid ${C.line}`, background: C.paper2, borderRadius: 7, padding: "6px 9px", fontSize: 11, cursor: "pointer", color: C.muted, lineHeight: 1 }}>↺</button>
          )}
          {selBlock.pass !== "second" && (
            <button onClick={() => { setEditId(selected); setEditVal(selBlock.label ?? ""); }} className="fa-pressable"
              style={{ border: `1px solid ${C.line}`, background: C.paper2, borderRadius: 7, padding: "6px 12px", fontSize: 11.5, fontWeight: 500, cursor: "pointer", color: C.ink2 }}>Renombrar</button>
          )}
          {selBlock.pass === "second" && (
            <span style={{ fontSize: 10, color: C.muted, fontStyle: "italic" }}>texto igual al original</span>
          )}
          <button onClick={() => { setHistory(prev => [...prev, blocksRef.current]); setBlocks(prev => prev.filter(b => b.id !== selected)); setSelected(null); }} className="fa-pressable"
            style={{ border: `1px solid ${C.danger}`, background: "transparent", borderRadius: 7, padding: "6px 12px", fontSize: 11.5, fontWeight: 500, cursor: "pointer", color: C.danger }}>Eliminar</button>
        </div>
      ) : selectedRepId ? (() => {
        const rep = localReps.find(r => r.id === selectedRepId);
        if (!rep) return null;
        return (
          <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap", background: C.paper, border: `1px solid ${C.fnS}40`, borderRadius: 12, padding: "10px 14px" }}
            onMouseDown={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: C.fnS, display: "inline-block", flexShrink: 0 }} />
            <span style={{ fontFamily: FONT_SERIF, fontSize: 16, fontWeight: 700, color: C.ink }}>Repetición</span>
            <span style={{ fontSize: 11, color: C.muted, flex: 1, minWidth: 90 }}>
              {fmtClock(rep.first.start)}–{fmtClock(rep.first.end)} · {fmtClock(rep.second.start)}–{fmtClock(rep.second.end)}
            </span>
            <button className="fa-pressable"
              onClick={() => { deleteRepeat(selectedRepId); setSelectedRepId(null); }}
              style={{ border: `1px solid ${C.danger}`, background: "transparent", borderRadius: 7, padding: "6px 12px", fontSize: 11.5, fontWeight: 500, cursor: "pointer", color: C.danger }}>
              Eliminar
            </button>
          </div>
        );
      })() : (
        <div style={{ flex: 1, fontSize: 12.5, color: C.muted, padding: "8px 10px", lineHeight: 1.5 }}>
          {blocks.filter(b => !b.isPreview).length === 0
            ? "Arrastra sobre cualquier pista para crear un bloque · doble toque para renombrar."
            : `${blocks.filter(b => !b.isPreview).length} bloque${blocks.filter(b => !b.isPreview).length !== 1 ? "s" : ""} · selecciona uno para editarlo.`}
        </div>
      )}

      {/* Área de texto (nivel 4) — ancho completo bajo el panel de selección */}
      {selBlock?.level === 4 && !selBlock.isPreview && (
        <div style={{ width: "100%", marginTop: 4 }}
          onMouseDown={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()}>
          <label style={{ ...(S.label as CSSProperties), marginBottom: 4, color: SCHEMA_LEVELS[3].color }}>
            Texto / Observaciones
            {selBlock.pass !== "second"
              ? <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}> — solo visible al seleccionar el bloque</span>
              : <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0, color: C.muted }}> — sincronizado del original (solo lectura)</span>}
          </label>
          {selBlock.pass === "second" ? (
            <div style={{ ...(S.input as CSSProperties), minHeight: 60, lineHeight: 1.6, fontSize: 13, color: selBlock.bodyText ? C.ink : C.muted2, fontStyle: selBlock.bodyText ? "normal" : "italic", background: C.paper2, opacity: 0.75, pointerEvents: "none", userSelect: "none" }}>
              {selBlock.bodyText || "Sin texto en el original"}
            </div>
          ) : (
            <textarea
              style={{ ...(S.input as CSSProperties), minHeight: 100, resize: "vertical", fontFamily: FONT_SANS, lineHeight: 1.6, fontSize: 13 }}
              placeholder="Escribe aquí el texto completo para este bloque… (solo tú lo verás al seleccionarlo)"
              value={selBlock.bodyText || ""}
              onChange={e => {
                const newText = e.target.value;
                setBlocks(prev => prev.map(b => {
                  if (b.id === selected) return { ...b, bodyText: newText };
                  // Propagar el texto al bloque espejo de la 2ª vez
                  if (b.mirrorId === selected) return { ...b, bodyText: newText };
                  return b;
                }));
              }}
              onClick={e => e.stopPropagation()} />
          )}
        </div>
      )}
    </div>
  );
}
