// ═══ CORRECTIONVIEW (CORRECCIÓN / REVISIÓN) ══════════════════════════════════
// SchemaPlayhead + CorrectionView (alumno y profesor). Extraídas de App.jsx (Fase 2).
import React, { useState, useEffect, useRef } from "react";
import type { Exercise } from "../lib/types.js";
import { C, S, FONT_SANS, FONT_SERIF, FONT_MONO } from "../theme/tokens.js";
import { textOn, scoreColor } from "../lib/color.js";
import { fmt } from "../lib/ids.js";
import { SCHEMA_LEVELS } from "../lib/schema.js";
import { SCHEMA_PALETTE_DEFAULT, schemaBlockColor } from "../lib/palette.js";
import { categoriesOf, answerFor, btnOf, questionsOf } from "../lib/domain.js";
import { useAudioPlayer } from "../hooks/useAudioPlayer.js";
import { ScoreBadge } from "./primitives.jsx";

// ── Tipos locales de corrección ──────────────────────────────────────────────
interface TeacherCorrection {
  corrected?: boolean;
  levelComments?: Record<string, string>;
  blockComments?: Record<string, string>;
  questionComments?: Record<string, string>;
  globalComment?: string;
  totalScore?: number | null;
  [k: string]: unknown;
}
interface SchemaBlock { id: string; level: number; start: number; end: number; label?: string; bodyText?: string; [k: string]: unknown; }
interface CorrectionIv { fn: string; start: number; end: number; [k: string]: unknown; }
interface CorrectionResult {
  type?: string;
  teacherCorrection?: TeacherCorrection;
  blocks?: SchemaBlock[];
  placementScore?: number | null;
  schemaPalette?: string;
  score?: number | null;
  answers?: Record<string, string>;
  categoryId?: string;
  modeId?: string;
  intervals?: CorrectionIv[];
  extras?: Array<{ categoryId?: string; modeId?: string; score?: number | null }>;
  [k: string]: unknown;
}
interface CorrectionStudent { id: string; displayName?: string; name?: string; [k: string]: unknown; }
type SaveCorrection = (studentId: string | undefined, exerciseId: Exercise["id"], correction: TeacherCorrection) => void;
// Valor de los inputs de puntuación: vacío ("") o número/cadena del campo.
type ScoreInput = string | number;

interface SchemaPlayheadProps { timeRef: { current: number }; duration: number; }

// Línea vertical animada a 60 fps sobre el timeline del esquema (sin re-renders de React)
export function SchemaPlayhead({ timeRef, duration }: SchemaPlayheadProps) {
  const lineRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    let raf: number;
    const tick = () => {
      if (lineRef.current && duration > 0) {
        const pct = Math.min(100, (timeRef.current / duration) * 100);
        lineRef.current.style.left = `${pct}%`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [timeRef, duration]);
  return (
    <div ref={lineRef} style={{
      position: "absolute", top: 0, left: 0, width: 2, height: "100%",
      background: C.danger, opacity: 0.75, pointerEvents: "none", zIndex: 10,
      transform: "translateX(-50%)", borderRadius: 1,
    }} />
  );
}

interface CorrectionViewProps {
  exercise: Exercise;
  result: CorrectionResult;
  margin?: number;
  onBack: () => void;
  backLabel?: string;
  isTeacherMode?: boolean;
  student?: CorrectionStudent | null;
  onSaveCorrection?: SaveCorrection | null;
}

export function CorrectionView({ exercise, result, margin, onBack, backLabel = "← Mis ejercicios", isTeacherMode = false, student = null, onSaveCorrection = null }: CorrectionViewProps) {
  const dur = exercise.duration as number;
  const tc  = result.teacherCorrection;

  // Hooks siempre en el mismo orden (reglas de React)
  const [lvComments,   setLvComments]   = useState<Record<string, string>>(() => tc?.levelComments   || {});
  const [blkComments,  setBlkComments]  = useState<Record<string, string>>(() => tc?.blockComments   || {});
  const [schemaGlobal, setSchemaGlobal] = useState(tc?.globalComment || "");
  const [schemaScore,  setSchemaScore]  = useState<ScoreInput>(tc?.totalScore ?? "");
  const [showBlkForm,  setShowBlkForm]  = useState(false);
  const [qComments,    setQComments]    = useState<Record<string, string>>(() => tc?.questionComments || {});
  const [quizGlobal,   setQuizGlobal]   = useState(tc?.globalComment || "");
  const [quizScore,    setQuizScore]    = useState<ScoreInput>(tc?.totalScore ?? "");

  // Audio — siempre incondicional (reglas de hooks)
  const { time, timeRef: audioTimeRef, playing, audioReady, hasAudio, togglePlay, seekTo } = useAudioPlayer(exercise);

  // Modelo esquema — corrección semiautomática
  if (result.type === "esquema") {
    const blocks      = result.blocks || [];
    const schemaKey   = (exercise.schemaKey as SchemaBlock[] | undefined) || [];
    const hasKey      = schemaKey.length > 0;
    const ps          = result.placementScore ?? null;
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
                          <span style={{ fontSize: 11, color: C.muted, fontFamily: FONT_MONO }}>{fmt(b.start)}–{fmt(b.end)}</span>
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
      <div style={{ ...S.card, marginBottom: 16, padding: "12px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            onClick={togglePlay}
            disabled={!audioReady}
            style={{ width: 36, height: 36, borderRadius: "50%", border: "none", background: audioReady ? C.ink : C.line, color: C.paper, cursor: audioReady ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0, transition: "background .15s" }}>
            {playing ? "⏸" : "▶"}
          </button>
          <div
            onClick={handleTimelineClick}
            style={{ flex: 1, position: "relative", height: 6, background: C.paper2, borderRadius: 3, cursor: "pointer", overflow: "visible" }}>
            <div style={{ position: "absolute", top: 0, left: 0, height: "100%", width: `${(time / dur) * 100}%`, background: C.fnS, borderRadius: 3, transition: "width .1s linear" }} />
          </div>
          <span style={{ fontSize: 12, fontFamily: FONT_MONO, color: C.muted, flexShrink: 0 }}>{fmt(time)} / {fmt(dur)}</span>
        </div>
      </div>
    ) : null;

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

            {ps != null && (
              <div style={{ ...S.card, textAlign: "center", marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>Colocación automática (margen ±3 s)</div>
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
                              <span style={{ fontSize: 11, color: C.muted, fontFamily: FONT_MONO }}>{fmt(b.start)}–{fmt(b.end)}</span>
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
                <label style={S.label}>Puntuación total (0–10, opcional)</label>
                <input type="number" min={0} max={10} step={0.5} value={schemaScore}
                  onChange={(e) => setSchemaScore(e.target.value)} placeholder="Ej: 7.5"
                  style={{ ...S.input, width: 120 }} />
              </div>

              <button onClick={handleSave} style={{ ...S.btnPrimary, width: "100%" }}>
                {tc?.corrected ? "Actualizar corrección" : "Guardar corrección"}
              </button>
            </div>
            <div style={{ height: 32 }} />
          </div>
        </div>
      );
    }

    // ── Vista del alumno ──────────────────────────────────────────────────────
    const showRefSchema = Boolean(exercise.immediateSchemaFeedback) && hasKey;
    return (
      <div style={S.app}>
        <div style={S.page}>
          <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "var(--f-sans, Outfit)", fontSize: 13, color: "#888", padding: 0, marginBottom: 20 }}>← Volver</button>
          <h1 style={{ ...S.h1, marginBottom: 20 }}>Esquema entregado: {exercise.title}</h1>

          <div style={{ ...S.card, textAlign: "center", marginBottom: 20 }}>
            {ps != null ? (
              <>
                <div style={{ fontSize: 56, fontWeight: 900, color: scoreColor(ps), lineHeight: 1 }}>{ps}%</div>
                <div style={{ color: C.muted, fontSize: 13, marginTop: 4 }}>de bloques colocados correctamente (margen ±3 s)</div>
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

          {tc?.corrected && (
            <div style={{ ...S.card, border: `1.5px solid rgba(47,111,184,0.35)`, marginTop: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.quiz, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 12 }}>Corrección del profesor</div>
              {tc.totalScore != null && (
                <div style={{ textAlign: "center", marginBottom: 14 }}>
                  <span style={{ fontSize: 48, fontWeight: 900, color: C.quiz, lineHeight: 1 }}>{tc.totalScore}</span>
                  <span style={{ fontSize: 18, color: C.quiz }}>/10</span>
                </div>
              )}
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
                      <span style={{ fontSize: 11, color: C.muted, fontFamily: FONT_MONO }}>{fmt(block.start)}–{fmt(block.end)}</span>
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

  // Modelo cuestionario
  if (result.type === "cuestionario") {
    const questions = questionsOf(exercise);
    const sc        = result.score;
    const testQs    = questions.filter((q) => q.type === "test" && q.correctOptionId);
    const devQs     = questions.filter((q) => q.type === "desarrollo");
    const correctN  = testQs.filter((q) => result.answers?.[q.id] === q.correctOptionId).length;
    const col       = scoreColor(sc);

    const handleSaveQuiz = () => {
      const correction = {
        corrected: true,
        questionComments: qComments,
        globalComment: quizGlobal,
        totalScore: quizScore === "" ? null : Number(quizScore),
      };
      onSaveCorrection?.(student?.id, exercise.id, correction);
    };

    if (isTeacherMode) {
      return (
        <div style={S.app}>
          <div style={S.page}>
            <button onClick={onBack} style={{ ...S.btn, marginBottom: 24, fontSize: 12, padding: "6px 12px" }}>{backLabel}</button>
            <h1 style={{ ...S.h1, marginBottom: 4 }}>Corrección: {exercise.title}</h1>
            {student && <p style={{ color: C.muted, fontSize: 13, marginBottom: 20 }}>Alumno: <strong>{student.name}</strong></p>}

            {sc != null && (
              <div style={{ ...S.card, textAlign: "center", marginBottom: 20 }}>
                <div style={{ fontSize: 48, fontWeight: 900, color: col, lineHeight: 1 }}>{sc}%</div>
                <div style={{ color: C.muted, fontSize: 13, marginTop: 4 }}>{correctN} de {testQs.length} {testQs.length === 1 ? "pregunta test" : "preguntas test"} correctas (automático)</div>
              </div>
            )}

            {questions.map((q, idx) => {
              const studentAnswer = result.answers?.[q.id];
              const isCorrect = q.type === "test" && studentAnswer === q.correctOptionId;
              const isWrong   = q.type === "test" && !!studentAnswer && studentAnswer !== q.correctOptionId;
              return (
                <div key={q.id} style={{ ...S.card, marginBottom: 16, border: q.type !== "test" ? `1.5px solid ${C.quiz}33` : `1.5px solid ${isCorrect ? C.fnT : isWrong ? C.danger : C.line}` }}>
                  <div style={{ ...S.row, gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                    <span style={{ ...S.badge, background: C.line, color: C.muted }}>P{idx + 1}</span>
                    <span style={{ ...S.badge, background: q.type === "test" ? "rgba(63,155,91,0.12)" : "rgba(47,111,184,0.12)", color: q.type === "test" ? C.fnT : C.quiz }}>{q.type === "test" ? "Test" : "Desarrollo"}</span>
                    <span style={{ ...S.badge, background: C.paper2, color: C.muted, fontFamily: FONT_MONO }}>{fmt(q.audioStart ?? 0)}–{fmt(q.audioEnd ?? 0)}</span>
                    {q.type === "test" && (
                      <span style={{ ...S.badge, background: isCorrect ? "rgba(63,155,91,0.16)" : isWrong ? "rgba(184,74,58,0.16)" : C.line, color: isCorrect ? C.fnT : isWrong ? C.danger : C.muted }}>
                        {!studentAnswer ? "Sin respuesta" : isCorrect ? "✓ Correcta" : "✗ Incorrecta"}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 14, color: C.ink, marginBottom: 12 }}>{q.text}</div>

                  {q.type === "test" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {(q.options ?? []).map((opt) => {
                        const isPick       = opt.id === studentAnswer;
                        const isCorrectOpt = opt.id === q.correctOptionId;
                        return (
                          <div key={opt.id} style={{
                            ...S.row, gap: 10, padding: "8px 12px", borderRadius: 8,
                            background: isCorrectOpt ? "rgba(63,155,91,0.10)" : isPick && !isCorrectOpt ? "rgba(184,74,58,0.10)" : C.paper2,
                            border:     `1.5px solid ${isCorrectOpt ? C.fnT : isPick && !isCorrectOpt ? C.danger : C.line}`,
                            color:      isCorrectOpt ? C.fnT : isPick && !isCorrectOpt ? C.danger : C.muted,
                          }}>
                            <span style={{ fontFamily: FONT_MONO, fontWeight: 700, fontSize: 12, minWidth: 20 }}>{opt.id}</span>
                            <span style={{ flex: 1, fontSize: 13 }}>{opt.text}</span>
                            {isCorrectOpt && <span style={{ fontSize: 11, fontWeight: 700 }}>✓ Correcta</span>}
                            {isPick && !isCorrectOpt && <span style={{ fontSize: 11, fontWeight: 700 }}>Resp. alumno</span>}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {q.type === "desarrollo" && (
                    <div>
                      <div style={{ fontSize: 11, color: C.muted, marginBottom: 6 }}>Respuesta del alumno:</div>
                      <div style={{ background: C.paper2, border: `1px solid ${C.line}`, borderRadius: 8, padding: "10px 12px", fontSize: 14, color: C.ink, whiteSpace: "pre-wrap", minHeight: 40, lineHeight: 1.5, marginBottom: 12 }}>
                        {studentAnswer || <span style={{ color: C.muted2, fontStyle: "italic" }}>Sin respuesta</span>}
                      </div>
                      <div style={{ fontSize: 11, color: C.muted, marginBottom: 6 }}>Comentario del profesor:</div>
                      <textarea
                        value={qComments[q.id] || ""}
                        onChange={(e) => setQComments((prev) => ({ ...prev, [q.id]: e.target.value }))}
                        placeholder="Escribe un comentario para esta respuesta..."
                        rows={3}
                        style={{ width: "100%", fontFamily: "Outfit, sans-serif", fontSize: 13, background: C.paper2, border: `1px solid ${C.line}`, borderRadius: 8, padding: "10px 12px", color: C.ink, resize: "vertical", boxSizing: "border-box" }}
                      />
                    </div>
                  )}
                </div>
              );
            })}

            {devQs.length > 0 && (
              <div style={{ ...S.card, marginBottom: 16 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: C.ink, marginBottom: 12 }}>Corrección global</div>
                <div style={{ fontSize: 11, color: C.muted, marginBottom: 6 }}>Comentario global:</div>
                <textarea
                  value={quizGlobal}
                  onChange={(e) => setQuizGlobal(e.target.value)}
                  placeholder="Comentario general sobre el cuestionario..."
                  rows={3}
                  style={{ width: "100%", fontFamily: "Outfit, sans-serif", fontSize: 13, background: C.paper2, border: `1px solid ${C.line}`, borderRadius: 8, padding: "10px 12px", color: C.ink, resize: "vertical", boxSizing: "border-box", marginBottom: 12 }}
                />
                <div style={{ ...S.row, gap: 12, alignItems: "center" }}>
                  <label style={{ fontSize: 13, color: C.muted }}>Puntuación total (0–10):</label>
                  <input
                    type="number" min={0} max={10} step={0.5}
                    value={quizScore}
                    onChange={(e) => setQuizScore(e.target.value)}
                    style={{ width: 80, fontFamily: "Outfit, sans-serif", fontSize: 14, background: C.paper2, border: `1px solid ${C.line}`, borderRadius: 8, padding: "6px 10px", color: C.ink, textAlign: "center" }}
                  />
                </div>
              </div>
            )}

            <button
              onClick={handleSaveQuiz}
              disabled={devQs.length === 0}
              style={{ ...S.btnPrimary, width: "100%", padding: 14, borderRadius: 12, marginBottom: 8, opacity: devQs.length === 0 ? 0.4 : 1 }}
            >
              {tc?.corrected ? "Actualizar corrección" : "Guardar corrección"}
            </button>
            <button onClick={onBack} style={{ ...S.btn, width: "100%", padding: 14, borderRadius: 12 }}>{backLabel}</button>
          </div>
        </div>
      );
    }

    // Student mode
    return (
      <div style={S.app}>
        <div style={S.page}>
          <button onClick={onBack} style={{ ...S.btn, marginBottom: 24, fontSize: 12, padding: "6px 12px" }}>{backLabel}</button>
          <h1 style={{ ...S.h1, marginBottom: 20 }}>Corrección: {exercise.title}</h1>

          <div style={{ ...S.card, textAlign: "center", marginBottom: 20 }}>
            {tc?.corrected && tc?.totalScore != null ? (
              <>
                <div style={{ fontSize: 64, fontWeight: 900, color: scoreColor(tc.totalScore * 10), lineHeight: 1 }}>{tc.totalScore}<span style={{ fontSize: 28 }}>/10</span></div>
                <div style={{ color: C.muted, fontSize: 13, marginTop: 4 }}>Puntuación del profesor</div>
                {sc != null && <div style={{ color: C.muted, fontSize: 12, marginTop: 8 }}>{correctN} de {testQs.length} preguntas test correctas ({sc}% automático)</div>}
              </>
            ) : sc != null ? (
              <>
                <div style={{ fontSize: 64, fontWeight: 900, color: col, lineHeight: 1 }}>{sc}%</div>
                <div style={{ color: C.muted, fontSize: 14, marginTop: 4 }}>{correctN} de {testQs.length} {testQs.length === 1 ? "pregunta" : "preguntas"} correctas</div>
                <div style={{ fontSize: 14, marginTop: 12, color: col }}>
                  {sc >= 80 ? "Excelente análisis." : sc >= 50 ? "Bien, pero hay margen de mejora." : "Sigue practicando."}
                </div>
              </>
            ) : (
              <div style={{ color: C.muted, lineHeight: 1.6 }}>
                {devQs.length > 0
                  ? <>Respuestas enviadas al profesor para revisión.<br /><span style={{ fontSize: 12 }}>Las preguntas de desarrollo se corrigen manualmente.</span></>
                  : "Sin puntuación automática."}
              </div>
            )}
          </div>

          {questions.map((q, idx) => {
            const studentAnswer = result.answers?.[q.id];
            const isCorrect = q.type === "test" && studentAnswer === q.correctOptionId;
            const isWrong   = q.type === "test" && !!studentAnswer && studentAnswer !== q.correctOptionId;
            const teacherComment = tc?.corrected ? tc?.questionComments?.[q.id] : null;
            return (
              <div key={q.id} style={{ ...S.card, border: q.type !== "test" ? `1px solid ${C.line}` : `1.5px solid ${isCorrect ? C.fnT : isWrong ? C.danger : C.line}` }}>
                <div style={{ ...S.row, gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                  <span style={{ ...S.badge, background: C.line, color: C.muted }}>P{idx + 1}</span>
                  <span style={{ ...S.badge, background: q.type === "test" ? "rgba(63,155,91,0.12)" : "rgba(47,111,184,0.12)", color: q.type === "test" ? C.fnT : C.quiz }}>{q.type === "test" ? "Test" : "Desarrollo"}</span>
                  <span style={{ ...S.badge, background: C.paper2, color: C.muted, fontFamily: FONT_MONO }}>{fmt(q.audioStart ?? 0)}–{fmt(q.audioEnd ?? 0)}</span>
                  {q.type === "test" && (
                    <span style={{ ...S.badge, background: isCorrect ? "rgba(63,155,91,0.16)" : isWrong ? "rgba(184,74,58,0.16)" : C.line, color: isCorrect ? C.fnT : isWrong ? C.danger : C.muted }}>
                      {!studentAnswer ? "Sin respuesta" : isCorrect ? "✓ Correcta" : "✗ Incorrecta"}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 14, color: C.ink, marginBottom: 12 }}>{q.text}</div>

                {q.type === "test" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {(q.options ?? []).map((opt) => {
                      const isPick       = opt.id === studentAnswer;
                      const isCorrectOpt = opt.id === q.correctOptionId;
                      return (
                        <div key={opt.id} style={{
                          ...S.row, gap: 10, padding: "8px 12px", borderRadius: 8,
                          background: isCorrectOpt ? "rgba(63,155,91,0.10)" : isPick && !isCorrectOpt ? "rgba(184,74,58,0.10)" : C.paper2,
                          border:     `1.5px solid ${isCorrectOpt ? C.fnT : isPick && !isCorrectOpt ? C.danger : C.line}`,
                          color:      isCorrectOpt ? C.fnT : isPick && !isCorrectOpt ? C.danger : C.muted,
                        }}>
                          <span style={{ fontFamily: FONT_MONO, fontWeight: 700, fontSize: 12, minWidth: 20 }}>{opt.id}</span>
                          <span style={{ flex: 1, fontSize: 13 }}>{opt.text}</span>
                          {isCorrectOpt && <span style={{ fontSize: 11, fontWeight: 700 }}>✓ Correcta</span>}
                          {isPick && !isCorrectOpt && <span style={{ fontSize: 11, fontWeight: 700 }}>Tu resp.</span>}
                        </div>
                      );
                    })}
                  </div>
                )}

                {q.type === "desarrollo" && (
                  <div>
                    <div style={{ fontSize: 11, color: C.muted, marginBottom: 6 }}>Tu respuesta:</div>
                    <div style={{ background: C.paper2, border: `1px solid ${C.line}`, borderRadius: 8, padding: "10px 12px", fontSize: 14, color: C.ink, whiteSpace: "pre-wrap", minHeight: 40, lineHeight: 1.5 }}>
                      {studentAnswer || <span style={{ color: C.muted2, fontStyle: "italic" }}>Sin respuesta</span>}
                    </div>
                    {teacherComment ? (
                      <div style={{ marginTop: 10, background: "rgba(47,111,184,0.06)", border: `1px solid ${C.quiz}55`, borderRadius: 8, padding: "10px 12px" }}>
                        <div style={{ fontSize: 11, color: C.quiz, fontWeight: 700, marginBottom: 4 }}>Comentario del profesor:</div>
                        <div style={{ fontSize: 13, color: C.ink, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{teacherComment}</div>
                      </div>
                    ) : (
                      <p style={{ fontSize: 11, color: C.muted2, margin: "6px 0 0" }}>Pendiente de revisión por el profesor.</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {tc?.corrected && tc?.globalComment && (
            <div style={{ ...S.card, background: "rgba(47,111,184,0.06)", border: `1px solid ${C.quiz}55`, marginBottom: 8 }}>
              <div style={{ fontSize: 12, color: C.quiz, fontWeight: 700, marginBottom: 6 }}>Comentario global del profesor</div>
              <div style={{ fontSize: 14, color: C.ink, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{tc.globalComment}</div>
            </div>
          )}

          <button onClick={onBack} style={{ ...S.btnPrimary, width: "100%", marginTop: 8, padding: 14, borderRadius: 12 }}>{backLabel}</button>
        </div>
      </div>
    );
  }

  // Modelo interactivo
  const exCategories     = categoriesOf(exercise);
  const resultCategoryId = result.categoryId ?? result.modeId;
  const exCategory       = (exCategories.find((m) => m.id === resultCategoryId) || exCategories[0]) as { id: string; name?: string; buttons: import("../lib/types.js").Button[] };
  const teacherAns       = answerFor(exercise, exCategory.id) as CorrectionIv[];
  const studentAns       = result.intervals;
  const sc               = result.score;
  const col              = scoreColor(sc);
  const pct = (t: number) => `${(t / dur) * 100}%`;

  return (
    <div style={S.app}>
      <div style={S.page}>
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "Outfit, sans-serif", fontSize: 13, color: "#888", padding: 0, marginBottom: 20 }}>{backLabel}</button>
        <h1 style={{ ...S.h1, marginBottom: 20 }}>Corrección: {exercise.title}</h1>

        {exCategories.length > 1 && (
          <div style={{ marginBottom: 16, color: C.muted, fontSize: 13 }}>
            Categoría: <span style={{ color: C.fnI, fontWeight: 600 }}>{exCategory.name}</span>
          </div>
        )}

        <div style={{ ...S.card, textAlign: "center", marginBottom: 20 }}>
          {sc == null ? (
            <div style={{ color: C.muted }}>Este ejercicio no tiene clave de corrección aún.</div>
          ) : (
            <>
              <div style={{ fontSize: 64, fontWeight: 900, color: col, lineHeight: 1 }}>{sc}%</div>
              <div style={{ color: C.muted, fontSize: 14, marginTop: 4 }}>de acierto · margen ±{margin}s</div>
              <div style={{ fontSize: 14, marginTop: 12, color: col }}>
                {sc >= 80 ? "Excelente análisis armónico." : sc >= 50 ? "Bien, pero hay margen de mejora." : "Sigue practicando."}
              </div>
            </>
          )}
        </div>

        {Array.isArray(result.extras) && result.extras.length > 0 && (
          <div style={{ ...S.card, marginBottom: 20 }}>
            <div style={{ fontSize: 13, color: C.muted, marginBottom: 10 }}>También has practicado:</div>
            {result.extras.map((ex2) => {
              const catId = ex2.categoryId ?? ex2.modeId;
              const m = exCategories.find((mm) => mm.id === catId);
              if (!m) return null;
              return (
                <div key={catId} style={{ ...S.row, justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${C.line}` }}>
                  <span style={{ fontSize: 13, color: C.muted2 }}>{m.name}</span>
                  <ScoreBadge score={ex2.score} />
                </div>
              );
            })}
          </div>
        )}

        {sc != null && (
          <div style={S.card}>
            <div style={{ fontSize: 13, color: C.muted, marginBottom: 12 }}>Comparación visual (margen ±{margin}s aplicado)</div>
            <div style={{ fontSize: 11, ...S.row, gap: 12, marginBottom: 8, flexWrap: "wrap" }}>
              {exCategory.buttons.map((b) => (
                <span key={b.id} style={{ ...S.row, gap: 4 }}>
                  <span style={{ width: 10, height: 10, background: b.color, borderRadius: 2, display: "inline-block" }} />
                  <span style={{ color: C.muted2 }}>{b.id} = {b.name}</span>
                </span>
              ))}
            </div>
            {[{ label: "Clave", ivs: teacherAns }, { label: "Tu respuesta", ivs: studentAns }].map(({ label, ivs }) => (
              <div key={label} style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>{label}</div>
                <div style={{ background: C.paper2, borderRadius: 6, height: 36, position: "relative" }}>
                  {(ivs ?? []).map((iv, i) => {
                    const b = btnOf(exCategory, iv.fn);
                    return (
                      <div key={i} style={{ position: "absolute", top: "10%", height: "80%", left: pct(iv.start), width: pct(iv.end - iv.start), background: b.color, borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                        {(iv.end - iv.start) / dur > 0.06 && (
                          <span style={{ fontSize: 10, fontWeight: 700, color: textOn(b.color) }}>{iv.fn}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            <div style={{ ...S.row, justifyContent: "space-between", fontSize: 10, color: C.muted2 }}>
              {Array.from({ length: Math.floor(dur / 5) + 1 }, (_, i) => i * 5).map((t) => <span key={t}>{fmt(t)}</span>)}
            </div>
          </div>
        )}

        <button onClick={onBack} style={{ ...S.btnPrimary, width: "100%", marginTop: 8, padding: 14, borderRadius: 12 }}>
          {backLabel}
        </button>
      </div>
    </div>
  );
}
