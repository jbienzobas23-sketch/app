// Paso Audios (M5.3 + M5.7 + M5.8): el audio, el fragmento y el compositor de
// cada parte. Un solo audio → editor plano (campos planos); «+ Añadir audio»
// convierte el ejercicio en multiparte. En multiparte se edita UNA parte a la
// vez (pestañas 1/2/3/+, según docs/demo_editor_ejercicio_v3.html): cabecera
// «Parte i de N» + menú ⋯ (mover/duplicar/eliminar), onda con fragmento, y
// nombre + compositor de esa parte. El interruptor «Mostrar compositor al
// alumno» vive aquí (M5.8, antes en Identidad). El guardado vive en
// useExerciseEditor, byte-idéntico.
import { useState } from "react";
import { C, S, FONT_SANS } from "../../theme/tokens.js";
import { fmtClock } from "../../lib/time.js";
import { seedFromId } from "../../lib/audio.js";
import { AudioWaveIcon } from "../primitives.jsx";
import { Menu } from "../primitives.jsx";
import { FragmentRangeSelector } from "../session.js";
import { MAX_PARTS, type EditorApi } from "./useExerciseEditor.js";
import { StepHead, Switch } from "./editorUi.js";

export function PasoAudios({ ed, num, total }: { ed: EditorApi; goStep: (k: string) => void; num: number; total: number }) {
  const {
    isCreating, isMultiPart, selectedModels, audioLibrary, exercise,
    audioUrl, audioName, audioDuration, waveformData, hasExistingAudio, totalAudioDuration, effDuration,
    fragStart, setFragStart, fragEnd, setFragEnd, manualDuration, setManualDuration,
    handleUrlInput, audioUrlError, clearAudio, setShowLibraryPicker, addMultiPart,
    parts, updatePartField, handlePartUrlInput, partAudioUrlErrors, movePart, duplicatePart, addEmptyPart,
    setConfirmDeletePart, setLibraryPickerForPart,
    showComposer, setShowComposer,
  } = ed;
  const showFragment = selectedModels.includes("cuestionario") || selectedModels.includes("interactivo");

  // Parte activa (multiparte): una sola pestaña visible a la vez.
  const [selectedPartId, setSelectedPartId] = useState<string | null>(null);
  const selPart = isMultiPart ? (parts.find((p) => p.id === selectedPartId) || parts[0]) : null;
  const selIdx  = selPart ? parts.findIndex((p) => p.id === selPart.id) : -1;

  const handleAddPart = () => { const id = addEmptyPart(); if (id) setSelectedPartId(id); };
  const handleDuplicate = (partId: string) => { const id = duplicatePart(partId); if (id) setSelectedPartId(id); };

  // Pestañas de parte (1 · 2 · 3 · +): comparten la fila de la cabecera (como el
  // `.shrow` de la demo) para no dejar un hueco vacío en su propia fila.
  const pseg = isMultiPart && selPart ? (
    <div style={{ display: "inline-flex", border: `1px solid ${C.line}`, borderRadius: 10, overflow: "hidden", background: C.paper, boxShadow: "0 1px 2px rgba(26,26,26,0.05)", flexShrink: 0 }}>
      {parts.map((p, i) => {
        const active = p.id === selPart.id;
        return (
          <button key={p.id} type="button" onClick={() => setSelectedPartId(p.id)} title={p.title || `Parte ${i + 1}`}
            style={{ minWidth: 38, padding: "8px 12px", fontSize: 13, fontWeight: 600, cursor: "pointer",
              border: "none", borderLeft: i > 0 ? `1px solid ${C.line}` : "none",
              background: active ? C.ink : "transparent", color: active ? "#fff" : C.ink2, fontFamily: FONT_SANS }}>
            {i + 1}
          </button>
        );
      })}
      <button type="button" onClick={handleAddPart} disabled={parts.length >= MAX_PARTS}
        title={parts.length >= MAX_PARTS ? `Máximo ${MAX_PARTS} partes` : "Añadir otra parte"}
        style={{ minWidth: 34, padding: "8px 12px", fontSize: 16, lineHeight: 1, fontWeight: 500,
          border: "none", borderLeft: `1px solid ${C.line}`, background: "transparent",
          color: parts.length >= MAX_PARTS ? C.chevron : C.muted, cursor: parts.length >= MAX_PARTS ? "default" : "pointer" }}>
        +
      </button>
    </div>
  ) : undefined;

  return (
    <>
      <StepHead num={num} total={total} title={isMultiPart ? "Audios" : "Audio"} right={pseg} />

      {!isMultiPart ? (
        <div style={{ ...S.card, marginBottom: 0 }}>
          <label style={S.label}>Audio</label>
          {hasExistingAudio ? (
            /* Fila única cuando ya hay audio */
            <div style={{ ...S.row, gap: 8, padding: "8px 10px", background: C.paper2, border: `1px solid ${C.line}`, borderRadius: 8, marginBottom: 4 }}>
              <AudioWaveIcon size={15} color={C.ink2} />
              <span style={{ flex: 1, fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {audioName}
              </span>
              <span style={{ fontSize: 12, color: C.muted, fontFamily: FONT_SANS, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
                {fmtClock(effDuration)}
              </span>
              {audioLibrary.length > 0 && (
                <button type="button" onClick={() => setShowLibraryPicker(true)}
                  style={{ ...S.btn, padding: "3px 10px", fontSize: 12, flexShrink: 0 }}>
                  Cambiar
                </button>
              )}
              <button type="button" onClick={clearAudio}
                style={{ ...S.btnDanger, padding: "3px 10px", fontSize: 12, flexShrink: 0 }}>
                Quitar
              </button>
            </div>
          ) : (
            /* Selección cuando no hay audio: almacén + URL en una fila */
            <div style={{ marginBottom: 4 }}>
              <div style={{ ...S.row, gap: 8, marginBottom: 0 }}>
                {audioLibrary.length > 0 && (
                  <button type="button" onClick={() => setShowLibraryPicker(true)}
                    style={{ ...S.btn, padding: "8px 12px", fontSize: 13, flexShrink: 0, display: "flex", alignItems: "center", gap: 6 }}>
                    <AudioWaveIcon size={13} color="#555" />
                    Almacén
                  </button>
                )}
                <input type="url" style={{ ...S.input, fontSize: 13 }}
                  value={audioUrl || ""} onChange={(e) => handleUrlInput(e.target.value)}
                  placeholder={audioLibrary.length > 0 ? "O pega una URL de audio" : "URL pública de audio"} />
              </div>
              {audioUrlError && <p style={{ fontSize: 11, color: C.danger, margin: "6px 0 0" }}>{audioUrlError}</p>}
              <div style={{ ...S.row, gap: 10, marginTop: 8, flexWrap: "wrap" }}>
                <label style={{ ...S.label, margin: 0, whiteSpace: "nowrap" }}>Sin audio · duración manual (s)</label>
                <input type="number" min={1} style={{ ...S.input, width: 90, flex: "0 0 auto" }}
                  value={manualDuration} onChange={(e) => setManualDuration(e.target.value)} placeholder="30" />
              </div>
            </div>
          )}
          {hasExistingAudio && audioDuration !== null && (
            <p style={{ fontSize: 11, color: C.fnT, margin: "2px 0 0" }}>Duración detectada: {fmtClock(audioDuration)}</p>
          )}
          {hasExistingAudio && audioDuration === null && (
            <p style={{ fontSize: 11, color: C.muted, margin: "2px 0 0" }}>Duración no detectada — se usará la actual.</p>
          )}

          {/* Fragmento — separado por un divisor interno */}
          {hasExistingAudio && totalAudioDuration && showFragment && (
            <div style={{ borderTop: `1px solid ${C.line}`, marginTop: 14, paddingTop: 14 }}>
              <p style={{ ...S.label, margin: "0 0 10px", display: "flex", alignItems: "center", gap: 8 }}>
                Fragmento
                {fragStart !== null && (
                  <span style={{ fontFamily: FONT_SANS, fontSize: 10, color: C.quiz, fontWeight: 600,
                    textTransform: "none", letterSpacing: 0, background: "rgba(47,111,184,0.1)",
                    padding: "1px 6px", borderRadius: 4, fontVariantNumeric: "tabular-nums" }}>
                    {fmtClock(fragStart ?? 0)} – {fmtClock(fragEnd ?? 0)}
                  </span>
                )}
              </p>
              <FragmentRangeSelector
                totalDuration={totalAudioDuration}
                start={fragStart}
                end={fragEnd}
                onChange={({ start, end }: { start: number; end: number }) => { setFragStart(start); setFragEnd(end); }}
                onClear={() => { setFragStart(null); setFragEnd(null); }}
                onDefine={() => { setFragStart(0); setFragEnd(totalAudioDuration); }}
                audioUrl={audioUrl}
                waveformData={waveformData}
                waveformSeed={seedFromId(exercise?.id ?? "single")}
                height={72}
              />
            </div>
          )}

          {!isCreating && (
            <button type="button" onClick={addMultiPart}
              style={{ ...S.btn, marginTop: 14, width: "100%", fontSize: 12.5, padding: "8px 12px" }}>
              + Añadir audio (ejercicio multiparte)
            </button>
          )}
        </div>
      ) : selPart ? (
        <>
          {/* ── Panel de la parte activa ── */}
          {(() => {
            const partHasAudio  = !!selPart.audioUrl;
            const partTotalDur  = selPart.audioTotalDuration || selPart.duration || 0;
            const partFragStart = selPart.audioFragmentStart ?? null;
            const partFragEnd   = selPart.audioFragmentEnd ?? null;
            return (
              <div style={{ ...S.card, marginBottom: 0 }}>
                <div style={{ ...S.row, justifyContent: "space-between", marginBottom: 10 }}>
                  <span style={{ fontFamily: FONT_SANS, fontSize: 9.5, letterSpacing: "1.2px", textTransform: "uppercase", color: C.muted, fontWeight: 600 }}>
                    Parte {selIdx + 1} de {parts.length}{partHasAudio && partTotalDur > 0 ? ` · ${fmtClock(partTotalDur)}` : ""}
                  </span>
                  <Menu align="right" ariaLabel="Acciones de la parte" panelStyle={{ minWidth: 200 }}
                    trigger={({ open, toggle, triggerRef }) => (
                      <button ref={triggerRef} onClick={toggle} aria-haspopup="menu" aria-expanded={open} aria-label="Acciones de la parte"
                        style={{ ...S.btn, padding: "5px 9px", fontSize: 14, lineHeight: 1 }}>⋯</button>
                    )}>
                    {({ close }) => {
                      const moveItems: { label: string; onClick: () => void }[] = [];
                      if (selIdx > 0) moveItems.push({ label: "Subir en el orden", onClick: () => movePart(selPart.id, -1) });
                      if (selIdx < parts.length - 1) moveItems.push({ label: "Bajar en el orden", onClick: () => movePart(selPart.id, 1) });
                      if (parts.length < MAX_PARTS) moveItems.push({ label: "Duplicar parte", onClick: () => handleDuplicate(selPart.id) });
                      const canDelete = parts.length > 1;
                      return [
                        ...moveItems.map((it, i) => (
                          <button key={i} role="menuitem" onClick={() => { close(); it.onClick(); }}
                            style={{ display: "block", width: "100%", boxSizing: "border-box", textAlign: "left", padding: "8px 10px", borderRadius: 7, border: "none", background: "transparent", cursor: "pointer", fontFamily: FONT_SANS, fontSize: 12.5, color: C.ink2 }}>
                            {it.label}
                          </button>
                        )),
                        moveItems.length > 0 && <hr key="hr" style={{ border: "none", borderTop: `1px solid ${C.line}`, margin: "4px 6px" }} />,
                        <button key="del" role="menuitem" disabled={!canDelete}
                          onClick={() => { if (canDelete) { close(); setConfirmDeletePart(selPart.id); } }}
                          title={canDelete ? undefined : "Debe quedar al menos una parte"}
                          style={{ display: "block", width: "100%", boxSizing: "border-box", textAlign: "left", padding: "8px 10px", borderRadius: 7, border: "none", background: "transparent", fontFamily: FONT_SANS, fontSize: 12.5, color: canDelete ? C.danger : C.muted, cursor: canDelete ? "pointer" : "default", opacity: canDelete ? 1 : 0.6 }}>
                          Eliminar parte
                        </button>,
                      ];
                    }}
                  </Menu>
                </div>

                <label style={S.label}>Audio</label>
                {partHasAudio ? (
                  <div style={{ ...S.row, gap: 8, padding: "8px 10px", background: C.paper2, border: `1px solid ${C.line}`, borderRadius: 8, marginBottom: 8 }}>
                    <AudioWaveIcon size={14} color={C.ink2} />
                    <span style={{ flex: 1, fontSize: 12.5, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selPart.audioName}</span>
                    <span style={{ fontSize: 11, color: C.muted, fontFamily: FONT_SANS, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>{fmtClock(partTotalDur)}</span>
                    {audioLibrary.length > 0 && (
                      <button type="button" onClick={() => setLibraryPickerForPart(selPart.id)} style={{ ...S.btn, padding: "2px 8px", fontSize: 11, flexShrink: 0 }}>Cambiar audio…</button>
                    )}
                  </div>
                ) : (
                  <div style={{ ...S.row, gap: 8, marginBottom: 8 }}>
                    {audioLibrary.length > 0 && (
                      <button type="button" onClick={() => setLibraryPickerForPart(selPart.id)}
                        style={{ ...S.btn, padding: "7px 10px", fontSize: 12.5, flexShrink: 0, display: "flex", alignItems: "center", gap: 6 }}>
                        <AudioWaveIcon size={12} color="#555" /> Almacén
                      </button>
                    )}
                    <input type="url" style={{ ...S.input, fontSize: 12.5 }}
                      placeholder="O pega una URL de audio"
                      onChange={(e) => handlePartUrlInput(selPart.id, e.target.value)} />
                  </div>
                )}
                {partAudioUrlErrors[selPart.id] && <p style={{ fontSize: 11, color: C.danger, margin: "0 0 8px" }}>{partAudioUrlErrors[selPart.id]}</p>}

                {partHasAudio && partTotalDur > 0 && showFragment && (
                  <div style={{ borderTop: `1px solid ${C.line}`, marginTop: 4, paddingTop: 14, marginBottom: 4 }}>
                    <p style={{ ...S.label, margin: "0 0 10px", display: "flex", alignItems: "center", gap: 8 }}>
                      Fragmento
                      {partFragStart !== null && (
                        <span style={{ fontFamily: FONT_SANS, fontSize: 10, color: C.quiz, fontWeight: 600,
                          textTransform: "none", letterSpacing: 0, background: "rgba(47,111,184,0.1)",
                          padding: "1px 6px", borderRadius: 4, fontVariantNumeric: "tabular-nums" }}>
                          {fmtClock(partFragStart ?? 0)} – {fmtClock(partFragEnd ?? 0)}
                        </span>
                      )}
                    </p>
                    <FragmentRangeSelector
                      totalDuration={partTotalDur}
                      start={partFragStart}
                      end={partFragEnd}
                      onChange={({ start, end }: { start: number; end: number }) => updatePartField(selPart.id, { audioFragmentStart: start, audioFragmentEnd: end })}
                      onClear={() => updatePartField(selPart.id, { audioFragmentStart: undefined, audioFragmentEnd: undefined })}
                      onDefine={() => updatePartField(selPart.id, { audioFragmentStart: 0, audioFragmentEnd: partTotalDur })}
                      audioUrl={selPart.audioUrl}
                      waveformData={selPart.waveformData ?? null}
                      waveformSeed={seedFromId(selPart.id)}
                      height={72}
                    />
                  </div>
                )}

                <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", borderTop: `1px solid ${C.line}`, paddingTop: 14, marginTop: partHasAudio && showFragment ? 0 : 14 }}>
                  <div>
                    <label style={S.label} htmlFor={`pt-name-${selPart.id}`}>Nombre de la parte</label>
                    <input id={`pt-name-${selPart.id}`} style={S.input} value={selPart.title || ""} placeholder={`Parte ${selIdx + 1}`}
                      onChange={(e) => updatePartField(selPart.id, { title: e.target.value || undefined })} />
                  </div>
                  <div>
                    <label style={S.label} htmlFor={`pt-comp-${selPart.id}`}>Compositor de esta parte</label>
                    <input id={`pt-comp-${selPart.id}`} style={S.input} value={selPart.composerName || ""} placeholder="Ej: Bach"
                      onChange={(e) => updatePartField(selPart.id, { composerName: e.target.value || undefined })} />
                  </div>
                </div>
              </div>
            );
          })()}
        </>
      ) : null}

      {/* Mostrar compositor al alumno (M5.8: baja aquí desde Identidad, junto a
          los propios compositores). */}
      <div style={{ ...S.card, marginTop: 14, marginBottom: 0, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div style={{ fontSize: 13, color: C.ink }}>Mostrar compositor al alumno</div>
        <Switch on={showComposer} onToggle={() => setShowComposer((v) => !v)} label="Mostrar compositor al alumno" />
      </div>
    </>
  );
}
