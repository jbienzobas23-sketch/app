// Paso 3 — Audios (M5.3): el audio, el fragmento y el compositor de cada parte.
// Un solo audio → editor plano (campos planos); «+ Añadir audio» convierte el
// ejercicio en multiparte y a partir de ahí se gestiona por tarjetas de parte.
// La UI y la lógica se reutilizan verbatim de ExerciseDetailView (el guardado
// vive en useExerciseEditor, byte-idéntico).
import { C, S, FONT_SANS } from "../../theme/tokens.js";
import { fmtClock } from "../../lib/time.js";
import { AudioWaveIcon } from "../primitives.jsx";
import { FragmentRangeSelector } from "../session.js";
import { MAX_PARTS, type EditorApi } from "./useExerciseEditor.js";
import { StepHead } from "./editorUi.js";

export function Paso3Audios({ ed }: { ed: EditorApi; goStep: (n: number) => void }) {
  const {
    isCreating, isMultiPart, selectedModels, audioLibrary,
    audioUrl, audioName, audioDuration, hasExistingAudio, totalAudioDuration, effDuration,
    fragStart, setFragStart, fragEnd, setFragEnd, manualDuration, setManualDuration,
    handleUrlInput, clearAudio, setShowLibraryPicker, addMultiPart,
    parts, updatePartField, movePart, duplicatePart, setConfirmDeletePart, setLibraryPickerForPart, addEmptyPart,
  } = ed;
  const showFragment = selectedModels.includes("cuestionario") || selectedModels.includes("interactivo");

  return (
    <>
      <StepHead n={3} title={isMultiPart ? "Audios" : "Audio"} desc={isMultiPart
        ? "Cada parte tiene su propio audio y su propio fragmento; el alumno las resuelve todas en una sola sesión."
        : "El audio que escuchará el alumno, con un fragmento opcional."} />

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
              />
              {fragStart === null && (
                <p style={{ fontSize: 11, color: C.muted, margin: "6px 0 0", lineHeight: 1.5 }}>
                  Escucha el audio y define un fragmento para que el ejercicio use solo ese tramo.
                </p>
              )}
            </div>
          )}

          {!isCreating && (
            <button type="button" onClick={addMultiPart}
              style={{ ...S.btn, marginTop: 14, width: "100%", fontSize: 12.5, padding: "8px 12px" }}>
              + Añadir audio (ejercicio multiparte)
            </button>
          )}
        </div>
      ) : (
        <div style={{ ...S.card, marginBottom: 0 }}>
          {parts.map((part, idx) => {
            const partHasAudio = !!part.audioUrl;
            const partTotalDur = part.audioTotalDuration || part.duration || 0;
            const partFragStart = part.audioFragmentStart ?? null;
            const partFragEnd   = part.audioFragmentEnd ?? null;
            return (
              <div key={part.id} style={{ border: `1px solid ${C.line}`, borderRadius: 12, padding: "12px 14px", marginBottom: 10, background: C.paper2 }}>
                <div style={{ ...S.row, justifyContent: "space-between", marginBottom: 10 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>Parte {idx + 1}</span>
                  <div style={{ ...S.row, gap: 4 }}>
                    <button type="button" disabled={idx === 0} onClick={() => movePart(part.id, -1)} title="Subir"
                      style={{ ...S.btn, padding: "3px 8px", fontSize: 12, opacity: idx === 0 ? 0.35 : 1 }}>↑</button>
                    <button type="button" disabled={idx === parts.length - 1} onClick={() => movePart(part.id, 1)} title="Bajar"
                      style={{ ...S.btn, padding: "3px 8px", fontSize: 12, opacity: idx === parts.length - 1 ? 0.35 : 1 }}>↓</button>
                    <button type="button" disabled={parts.length >= MAX_PARTS} onClick={() => duplicatePart(part.id)} title="Duplicar"
                      style={{ ...S.btn, padding: "3px 8px", fontSize: 12, opacity: parts.length >= MAX_PARTS ? 0.35 : 1 }}>⧉</button>
                    <button type="button" disabled={parts.length <= 1} onClick={() => setConfirmDeletePart(part.id)} title="Eliminar parte"
                      style={{ ...S.btnDanger, padding: "3px 8px", fontSize: 12, opacity: parts.length <= 1 ? 0.35 : 1 }}>✕</button>
                  </div>
                </div>

                <label style={S.label}>Audio</label>
                {partHasAudio ? (
                  <div style={{ ...S.row, gap: 8, padding: "8px 10px", background: C.paper, border: `1px solid ${C.line}`, borderRadius: 8, marginBottom: 8 }}>
                    <AudioWaveIcon size={14} color={C.ink2} />
                    <span style={{ flex: 1, fontSize: 12.5, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{part.audioName}</span>
                    <span style={{ fontSize: 11, color: C.muted, fontFamily: FONT_SANS, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>{fmtClock(partTotalDur)}</span>
                    {audioLibrary.length > 0 && (
                      <button type="button" onClick={() => setLibraryPickerForPart(part.id)} style={{ ...S.btn, padding: "2px 8px", fontSize: 11, flexShrink: 0 }}>Cambiar</button>
                    )}
                  </div>
                ) : (
                  <div style={{ ...S.row, gap: 8, marginBottom: 8 }}>
                    {audioLibrary.length > 0 && (
                      <button type="button" onClick={() => setLibraryPickerForPart(part.id)}
                        style={{ ...S.btn, padding: "7px 10px", fontSize: 12.5, flexShrink: 0, display: "flex", alignItems: "center", gap: 6 }}>
                        <AudioWaveIcon size={12} color="#555" /> Almacén
                      </button>
                    )}
                    <input type="url" style={{ ...S.input, fontSize: 12.5 }}
                      placeholder="O pega una URL de audio"
                      onChange={(e) => {
                        const url = e.target.value.trim();
                        updatePartField(part.id, {
                          audioUrl: url || null,
                          audioName: url ? (url.split("/").pop()?.split("?")[0] || "audio") : null,
                        });
                      }} />
                  </div>
                )}

                {partHasAudio && partTotalDur > 0 && (
                  <div style={{ marginBottom: 10 }}>
                    <FragmentRangeSelector
                      totalDuration={partTotalDur}
                      start={partFragStart}
                      end={partFragEnd}
                      onChange={({ start, end }: { start: number; end: number }) => updatePartField(part.id, { audioFragmentStart: start, audioFragmentEnd: end })}
                      onClear={() => updatePartField(part.id, { audioFragmentStart: undefined, audioFragmentEnd: undefined })}
                      onDefine={() => updatePartField(part.id, { audioFragmentStart: 0, audioFragmentEnd: partTotalDur })}
                      audioUrl={part.audioUrl}
                    />
                  </div>
                )}

                <div>
                  <label style={{ ...S.label, margin: "0 0 4px" }}>Compositor (opcional)</label>
                  <input style={{ ...S.input, fontSize: 12.5 }} value={part.composerName || ""}
                    onChange={(e) => updatePartField(part.id, { composerName: e.target.value || undefined })}
                    placeholder="Ej: Bach" />
                </div>
              </div>
            );
          })}
          <button type="button" disabled={parts.length >= MAX_PARTS} onClick={addEmptyPart}
            style={{ ...S.btn, width: "100%", fontSize: 12.5, padding: "8px 12px", opacity: parts.length >= MAX_PARTS ? 0.5 : 1 }}>
            {parts.length >= MAX_PARTS ? `Máximo ${MAX_PARTS} partes` : "+ Añadir otra parte"}
          </button>
        </div>
      )}
    </>
  );
}
