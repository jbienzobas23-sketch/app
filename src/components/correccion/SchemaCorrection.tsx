// ═══ SCHEMACORRECTION (M3.4) ══════════════════════════════════════════════════
// Corrección del modelo esquema (profesor: forma de corrección manual; alumno:
// esquema entregado + referencia + feedback). Extraída de CorrectionView.tsx sin
// cambio de comportamiento — antes era la rama `result.type === "esquema"`.
import React, { useState } from "react";
import { C, S, FONT_SANS, FONT_SERIF } from "../../theme/tokens.js";
import { scoreColor } from "../../lib/color.js";
import { fmtClock } from "../../lib/time.js";
import { SCHEMA_LEVELS } from "../../lib/schema.js";
import { SCHEMA_PALETTE_DEFAULT, schemaBlockColor } from "../../lib/palette.js";
import { schemaDiagnostics } from "../../lib/scoring.js";
import { useAudioPlayer } from "../../hooks/useAudioPlayer.js";
import { SchemaPlayhead, CorrectionAudioBar } from "../primitives.jsx";
import { normalizeScore100, type CorrectionViewProps, type SchemaBlock } from "./shared.js";
import { AttemptBanner } from "./AttemptBanner.js";

export function SchemaCorrection({ exercise, result, onBack, isTeacherMode = false, backLabel = isTeacherMode ? "← Volver" : "← Mis ejercicios", student = null, onSaveCorrection = null, extraHeaderContent = null, queueLabel = null, onPrev = null, onNext = null }: CorrectionViewProps) {
  const dur = exercise.duration as number;
  const tc  = result.teacherCorrection;
  const [lvComments,   setLvComments]   = useState<Record<string, string>>(() => tc?.levelComments || {});
  const [blkComments,  setBlkComments]  = useState<Record<string, string>>(() => tc?.blockComments || {});
  const [schemaGlobal, setSchemaGlobal] = useState(tc?.globalComment || "");
  const [schemaScore,  setSchemaScore]  = useState<string | number>(() => normalizeScore100(tc?.totalScore) ?? "");
  const [showBlkForm,  setShowBlkForm]  = useState(false);
  const { time, timeRef: audioTimeRef, playing, audioReady, hasAudio, togglePlay, seekTo } = useAudioPlayer(exercise);

  const blocks      = result.blocks || [];
  const schemaKey   = (exercise.schemaKey as SchemaBlock[] | undefined) || [];
  const hasKey      = schemaKey.length > 0;
  const ps          = result.placementScore ?? null;
  const effSchemaMargin = (exercise.schemaMargin as number | undefined) ?? 3;
  // Diagnóstico por bloque (T2.5): NO toca la nota — `ps` (colocación) sigue
  // siendo la fuente de verdad. Separa "¿lo colocó bien?" de "¿lo llamó bien?".
  const diag = schemaDiagnostics(schemaKey, blocks, effSchemaMargin);
  const nombresPct = diag && diag.bloques.length > 0
    ? Math.round((diag.bloques.filter((b) => b.etiquetaOk).length / diag.bloques.length) * 100)
    : null;
  const studentPalette = result.schemaPalette || SCHEMA_PALETTE_DEFAULT;   // paleta elegida por el alumno
  const keyPalette     = exercise.schemaPalette || SCHEMA_PALETTE_DEFAULT;  // paleta de la clave (profesor)
  const schemaLevels = exercise.schemaLevels as number[] | undefined;
  const activeLevels = SCHEMA_LEVELS.filter((lv) =>
    !schemaLevels || schemaLevels.length === 0 || schemaLevels.includes(lv.id)
  );

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    seekTo(((e.clientX - rect.left) / rect.width) * dur);
  };

  const SchemaStrip = ({ title: stripTitle, bks, paletteId = studentPalette }: { title: string; bks: SchemaBlock[]; paletteId?: string }) => (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 12, color: C.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 10 }}>{stripTitle}</div>
      {activeLevels.map((lv) => {
        const lvBlocks = bks.filter((b) => b.level === lv.id).sort((a, b) => a.start - b.start);
        if (lvBlocks.length === 0) return null;
        return (
          <div key={lv.id} style={{ marginBottom: lv.id === 4 ? 14 : 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: lv.color, minWidth: 56, textTransform: "uppercase", letterSpacing: 0.5 }}>{lv.sub}</span>
              <div
                onClick={hasAudio ? handleTimelineClick : undefined}
                style={{ flex: 1, position: "relative", height: 40, background: C.paper2, borderRadius: 6, overflow: "hidden", cursor: hasAudio ? "pointer" : "default" }}>
                {lvBlocks.map((b, i) => {
                  const lPct = (b.start / dur) * 100;
                  const wPct = Math.max(((b.end - b.start) / dur) * 100, 0.5);
                  const { bg, textColor } = schemaBlockColor(b, bks, paletteId);
                  if (lv.id === 3) {
                    return (
                      <div key={i} style={{ position: "absolute", top: 6, bottom: 6, left: `${lPct}%`, width: `${wPct}%`, display: "flex", alignItems: "center", overflow: "hidden", pointerEvents: "none" }}>
                        <div style={{ background: bg, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", padding: "4px 10px", flexShrink: 0, minWidth: 0 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: textColor, fontFamily: FONT_SANS, whiteSpace: "nowrap" }}>{b.label}</span>
                        </div>
                        {wPct >= 4 && <div style={{ flex: 1, height: 2.5, background: bg, opacity: 0.55, marginLeft: 4, borderRadius: 1.5 }} />}
                      </div>
                    );
                  }
                  if (lv.id === 4) {
                    return (
                      <div key={i} style={{ position: "absolute", top: 4, bottom: 4, left: `${lPct}%`, width: `${wPct}%`, background: bg, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 10px", overflow: "hidden", pointerEvents: "none" }}>
                        <span style={{ fontSize: 11, fontWeight: 500, color: textColor, fontFamily: FONT_SANS, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{b.label}</span>
                      </div>
                    );
                  }
                  return (
                    <div key={i} style={{ position: "absolute", top: 3, bottom: 3, left: `${lPct}%`, width: `${wPct}%`, background: bg, borderRadius: 4, border: "1px solid rgba(255,255,255,0.22)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", pointerEvents: "none" }}>
                      <span style={{ fontSize: 11, fontWeight: lv.id === 1 ? 700 : 500, color: textColor, fontFamily: FONT_SANS, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "84%", padding: "0 3px" }}>{b.label}</span>
                    </div>
                  );
                })}
                {hasAudio && <SchemaPlayhead timeRef={audioTimeRef} duration={dur} />}
              </div>
            </div>
            {lv.id === 4 && lvBlocks.some(b => b.bodyText) && (
              <div style={{ paddingLeft: 66, marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
                {lvBlocks.filter(b => b.bodyText).map((b, i) => {
                  const { bg } = schemaBlockColor(b, bks, paletteId);
                  return (
                    <div key={i} style={{ background: C.paper2, border: `1px solid ${C.line}`, borderRadius: 8, padding: "10px 14px", borderLeft: `3px solid ${bg}` }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        <span style={{ fontFamily: FONT_SANS, fontWeight: 700, fontSize: 13, color: bg }}>{b.label}</span>
                        <span style={{ fontSize: 11, color: C.muted, fontFamily: FONT_SANS, fontVariantNumeric: "tabular-nums" }}>{fmtClock(b.start)}–{fmtClock(b.end)}</span>
                      </div>
                      <div style={{ fontSize: 13, color: C.ink, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{b.bodyText}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  const AudioBar = () => hasAudio ? (
    <CorrectionAudioBar time={time} timeRef={audioTimeRef} duration={dur} playing={playing} audioReady={audioReady}
      togglePlay={togglePlay} onSeek={handleTimelineClick} />
  ) : null;

  const DiagnosticsCard = () => !diag ? null : (
    <div style={{ ...S.card, marginBottom: 16 }}>
      <div style={{ fontSize: 13, color: C.muted, marginBottom: 10 }}>Diagnóstico por bloque</div>
      <div style={{ fontSize: 13, color: C.ink2, marginBottom: 12 }}>
        Colocación {ps ?? 0}% · Nombres {nombresPct ?? 0}%
      </div>
      {diag.bloques.map((b, i) => (
        <div key={b.id ?? i} style={{ ...S.row, justifyContent: "space-between", fontSize: 13, padding: "5px 0", borderBottom: `1px solid ${C.line}` }}>
          <span style={{ color: C.ink }}>
            {b.label || "—"} — {b.estado}
            {b.estado === "desplazado" && b.delta != null && ` ${b.delta > 0 ? "+" : ""}${b.delta}s`}
          </span>
          <span style={{ color: b.etiquetaOk ? C.fnT : C.danger, fontSize: 12 }}>
            etiqueta {b.etiquetaOk ? "✓" : "✗"}
          </span>
        </div>
      ))}
      {diag.sobrantes.length > 0 && (
        <div style={{ marginTop: 10, fontSize: 12, color: C.muted }}>
          + {diag.sobrantes.length} {diag.sobrantes.length === 1 ? "bloque sobrante sin clave" : "bloques sobrantes sin clave"}
        </div>
      )}
    </div>
  );

  // ── Vista del profesor ────────────────────────────────────────────────────
  if (isTeacherMode) {
    const handleSave = () => onSaveCorrection?.(student?.id, exercise.id, {
      levelComments: lvComments,
      blockComments: Object.fromEntries(Object.entries(blkComments).filter(([, v]) => v?.trim())),
      globalComment: schemaGlobal.trim(),
      totalScore:    schemaScore !== "" ? Number(schemaScore) : null,
    });
    return (
      <div style={S.app}>
        <div style={S.page}>
          <button onClick={onBack} style={{ ...S.btn, marginBottom: 20, fontSize: 12, padding: "6px 12px" }}>{backLabel}</button>
          <h1 style={{ ...S.h1, marginBottom: 4 }}>Corrección: {exercise.title}</h1>
          {student && <p style={{ color: C.muted, fontSize: 13, margin: "0 0 20px" }}>Alumno: <strong>{student.displayName}</strong></p>}
          {(queueLabel || onPrev || onNext) && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 16 }}>
              <button onClick={() => onPrev?.()} disabled={!onPrev} style={{ ...S.btn, fontSize: 12, padding: "5px 12px", opacity: onPrev ? 1 : 0.4, cursor: onPrev ? "pointer" : "default" }}>‹ Anterior</button>
              {queueLabel && <span style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>{queueLabel}</span>}
              <button onClick={() => onNext?.()} disabled={!onNext} style={{ ...S.btn, fontSize: 12, padding: "5px 12px", opacity: onNext ? 1 : 0.4, cursor: onNext ? "pointer" : "default" }}>Siguiente ›</button>
            </div>
          )}
          {extraHeaderContent}
          <AttemptBanner result={result} />

          {ps != null && (
            <div style={{ ...S.card, textAlign: "center", marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>Colocación automática (margen ±{effSchemaMargin} s)</div>
              <div style={{ fontSize: 48, fontWeight: 900, color: scoreColor(ps), lineHeight: 1 }}>{ps}%</div>
              <div style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>de bloques dentro del margen</div>
            </div>
          )}

          <AudioBar />

          {(blocks.length > 0 || hasKey) && (
            <div style={{ ...S.card, marginBottom: 16 }}>
              {hasKey && <><SchemaStrip title="Referencia (profesor)" bks={schemaKey} paletteId={keyPalette} /><hr style={{ ...S.divider, margin: "10px 0 14px" }} /></>}
              {blocks.length > 0 && <SchemaStrip title="Esquema del alumno" bks={blocks} />}
            </div>
          )}

          <DiagnosticsCard />

          <div style={{ ...S.card, border: `1.5px solid rgba(47,111,184,0.3)` }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.quiz, marginBottom: 16 }}>
              {tc?.corrected ? "Editar corrección" : "Añadir corrección manual"}
            </div>

            {activeLevels.map((lv) => (
              <div key={lv.id} style={{ marginBottom: 14 }}>
                <label style={{ ...S.label, color: lv.color }}>{lv.sub} — comentario (opcional)</label>
                <textarea value={lvComments[lv.id] || ""}
                  onChange={(e) => setLvComments((p) => ({ ...p, [lv.id]: e.target.value }))}
                  placeholder={`Valoración del nivel ${lv.sub}…`}
                  style={{ ...S.input, minHeight: 56, resize: "vertical", fontFamily: FONT_SANS }} />
              </div>
            ))}

            {blocks.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <button onClick={() => setShowBlkForm(!showBlkForm)} style={{ ...S.btn, fontSize: 12, marginBottom: 8 }}>
                  {showBlkForm ? "▲ Ocultar comentarios por bloque" : "▼ Comentarios por bloque (opcional)"}
                </button>
                {showBlkForm && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {blocks.map((b) => {
                      const lv = SCHEMA_LEVELS.find((l) => l.id === b.level);
                      return (
                        <div key={b.id} style={{ background: C.paper2, border: `1px solid ${C.line}`, borderRadius: 8, padding: "8px 12px" }}>
                          <div style={{ ...S.row, gap: 6, marginBottom: 6 }}>
                            <span style={{ fontFamily: FONT_SERIF, fontWeight: 700, fontSize: 12, color: lv?.color }}>{b.label}</span>
                            <span style={{ fontSize: 11, color: C.muted, fontFamily: FONT_SANS, fontVariantNumeric: "tabular-nums" }}>{fmtClock(b.start)}–{fmtClock(b.end)}</span>
                            <span style={{ fontSize: 10, background: (lv?.color || C.muted) + "20", color: lv?.color || C.muted, padding: "1px 6px", borderRadius: 3 }}>{lv?.sub}</span>
                          </div>
                          <textarea value={blkComments[b.id] || ""}
                            onChange={(e) => setBlkComments((p) => ({ ...p, [b.id]: e.target.value }))}
                            placeholder="Comentario sobre este bloque…" rows={2}
                            style={{ ...S.input, resize: "vertical", fontFamily: FONT_SANS, fontSize: 12 }} />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            <div style={{ marginBottom: 14 }}>
              <label style={S.label}>Comentario general</label>
              <textarea value={schemaGlobal} onChange={(e) => setSchemaGlobal(e.target.value)}
                placeholder="Observaciones generales sobre el esquema…"
                style={{ ...S.input, minHeight: 70, resize: "vertical", fontFamily: FONT_SANS }} />
            </div>

            <div style={{ marginBottom: 18 }}>
              <label style={S.label}>Puntuación total % (opcional)</label>
              <input type="number" min={0} max={100} step={5} value={schemaScore}
                onChange={(e) => setSchemaScore(e.target.value)} placeholder={ps != null ? String(ps) : "Ej: 75"}
                style={{ ...S.input, width: 120 }} />
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={handleSave} style={{ ...S.btnPrimary, flex: 1 }}>
                {tc?.corrected ? "Actualizar corrección" : "Guardar corrección"}
              </button>
              {onNext && (
                <button onClick={() => { handleSave(); onNext(); }} style={{ ...S.btnPrimary, flex: 1, background: C.fnT, borderColor: C.fnT }}>
                  Guardar y siguiente
                </button>
              )}
            </div>
          </div>
          <div style={{ height: 32 }} />
        </div>
      </div>
    );
  }

  // ── Vista del alumno ──────────────────────────────────────────────────────
  const showRefSchema = (Boolean(exercise.immediateSchemaFeedback) || Boolean(tc?.corrected)) && hasKey;
  return (
    <div style={S.app}>
      <div style={S.page}>
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "var(--f-sans, Outfit)", fontSize: 13, color: "#888", padding: 0, marginBottom: 20 }}>← Volver</button>
        <h1 style={{ ...S.h1, marginBottom: 20 }}>Esquema entregado: {exercise.title}</h1>
        {extraHeaderContent}
        <AttemptBanner result={result} />

        <div style={{ ...S.card, textAlign: "center", marginBottom: 20 }}>
          {ps != null ? (
            <>
              <div style={{ fontSize: 56, fontWeight: 900, color: scoreColor(ps), lineHeight: 1 }}>{ps}%</div>
              <div style={{ color: C.muted, fontSize: 13, marginTop: 4 }}>de bloques colocados correctamente (margen ±{effSchemaMargin} s)</div>
            </>
          ) : (
            <div style={{ color: C.muted, lineHeight: 1.6 }}>
              Esquema enviado al profesor para revisión.<br />
              <span style={{ fontSize: 12 }}>{blocks.length} {blocks.length === 1 ? "bloque dibujado" : "bloques dibujados"}.</span>
            </div>
          )}
        </div>

        <AudioBar />

        {(blocks.length > 0 || showRefSchema) && (
          <div style={S.card}>
            {showRefSchema && <><SchemaStrip title="Esquema de referencia (profesor)" bks={schemaKey} paletteId={keyPalette} /><hr style={{ ...S.divider, margin: "10px 0 14px" }} /></>}
            {!showRefSchema && hasKey && (
              <p style={{ textAlign: "center", color: C.muted, fontSize: 12, margin: "0 0 14px" }}>
                El esquema de referencia estará disponible cuando el profesor corrija el ejercicio.
              </p>
            )}
            {blocks.length > 0 && <SchemaStrip title="Tu esquema" bks={blocks} />}
          </div>
        )}

        {showRefSchema && <DiagnosticsCard />}

        {tc?.corrected && (
          <div style={{ ...S.card, border: `1.5px solid rgba(47,111,184,0.35)`, marginTop: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.quiz, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 12 }}>Corrección del profesor</div>
            {tc.totalScore != null && (() => {
              const pct100 = normalizeScore100(tc.totalScore);
              return (
                <div style={{ textAlign: "center", marginBottom: 14 }}>
                  <span style={{ fontSize: 48, fontWeight: 900, color: scoreColor(pct100), lineHeight: 1 }}>{pct100}</span>
                  <span style={{ fontSize: 18, color: scoreColor(pct100) }}>%</span>
                </div>
              );
            })()}
            {activeLevels.filter((lv) => tc.levelComments?.[lv.id]).map((lv) => (
              <div key={lv.id} style={{ marginBottom: 10, padding: "10px 12px", background: C.paper2, borderRadius: 8, borderLeft: `3px solid ${lv.color}` }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: lv.color, marginBottom: 4 }}>{lv.sub}</div>
                <div style={{ fontSize: 13, color: C.ink, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{tc.levelComments?.[lv.id]}</div>
              </div>
            ))}
            {tc.blockComments && Object.entries(tc.blockComments).filter(([, v]) => v).map(([blockId, comment]) => {
              const block = blocks.find((b) => b.id === blockId);
              if (!block) return null;
              const lv = SCHEMA_LEVELS.find((l) => l.id === block.level);
              return (
                <div key={blockId} style={{ marginBottom: 6, padding: "8px 10px", background: C.paper2, borderRadius: 8 }}>
                  <div style={{ ...S.row, gap: 6, marginBottom: 4 }}>
                    <span style={{ fontFamily: FONT_SERIF, fontWeight: 700, fontSize: 12, color: lv?.color }}>{block.label}</span>
                    <span style={{ fontSize: 11, color: C.muted, fontFamily: FONT_SANS, fontVariantNumeric: "tabular-nums" }}>{fmtClock(block.start)}–{fmtClock(block.end)}</span>
                  </div>
                  <div style={{ fontSize: 13, color: C.ink, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{comment}</div>
                </div>
              );
            })}
            {tc.globalComment && (
              <div style={{ padding: "10px 12px", background: "rgba(47,111,184,0.06)", border: `1px solid rgba(47,111,184,0.2)`, borderRadius: 8, marginTop: 6 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.quiz, marginBottom: 4 }}>Comentario general</div>
                <div style={{ fontSize: 13, color: C.ink, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{tc.globalComment}</div>
              </div>
            )}
          </div>
        )}

        <button onClick={onBack} style={{ ...S.btnPrimary, width: "100%", marginTop: 16, padding: 14, borderRadius: 12 }}>{backLabel}</button>
      </div>
    </div>
  );
}
