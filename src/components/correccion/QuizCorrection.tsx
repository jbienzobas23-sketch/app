// ═══ QUIZCORRECTION (M3.4) ════════════════════════════════════════════════════
// Corrección del modelo cuestionario (profesor: forma por pregunta + candado de
// región; alumno: respuestas + feedback). Extraída de CorrectionView.tsx sin
// cambio de comportamiento — antes era la rama `result.type === "cuestionario"`.
import { useState, useRef } from "react";
import type { ExerciseResult } from "../../lib/types.js";
import { C, S, FONT_SANS } from "../../theme/tokens.js";
import { scoreColor } from "../../lib/color.js";
import { fmtClock } from "../../lib/time.js";
import { questionsSnapshotOf } from "../../lib/domain.js";
import { gradeShort } from "../../lib/scoring.js";
import { useAudioPlayer } from "../../hooks/useAudioPlayer.js";
import { CorrectionAudioBar } from "../primitives.jsx";
import { normalizeScore100, type CorrectionViewProps } from "./shared.js";
import { AttemptBanner } from "./AttemptBanner.js";

export function QuizCorrection({ exercise, result, onBack, isTeacherMode = false, backLabel = isTeacherMode ? "← Volver" : "← Mis ejercicios", student = null, onSaveCorrection = null, extraHeaderContent = null, queueLabel = null, onPrev = null, onNext = null }: CorrectionViewProps) {
  const dur = exercise.duration as number;
  const tc  = result.teacherCorrection;
  const [qComments,  setQComments]  = useState<Record<string, string>>(() => tc?.questionComments || {});
  const [quizGlobal, setQuizGlobal] = useState(tc?.globalComment || "");
  const [quizScore,  setQuizScore]  = useState<string | number>(() => normalizeScore100(tc?.totalScore) ?? "");
  // Audio + candado de región (M3.3): el bucle de «▶ Fragmento» por pregunta.
  const loopRegionRef = useRef<{ audioStart: number; audioEnd: number } | null>(null);
  const { time, timeRef: audioTimeRef, playing, audioReady, hasAudio, togglePlay, seekTo, playFrom } = useAudioPlayer(exercise, { loopRegionRef });
  const [activeFragmentQId, setActiveFragmentQId] = useState<string | null>(null);
  const playQuestionFragment = (q: { id: string; audioStart?: number; audioEnd?: number }) => {
    if (activeFragmentQId === q.id && playing) { togglePlay(); return; }
    loopRegionRef.current = { audioStart: q.audioStart ?? 0, audioEnd: q.audioEnd ?? (exercise.duration as number) };
    setActiveFragmentQId(q.id);
    playFrom(q.audioStart ?? 0);
  };
  const releaseFragment = () => {
    if (loopRegionRef.current) { loopRegionRef.current = null; setActiveFragmentQId(null); }
  };

    // Instantánea (F5, T5.5): las preguntas TAL COMO ERAN al entregar, no las
    // vigentes del ejercicio — si el profesor las editó/reordenó/borró después,
    // la corrección de una entrega pasada no se descoloca.
    const questions = questionsSnapshotOf(result as unknown as ExerciseResult, exercise);
    const sc        = result.score;
    const testQs    = questions.filter((q) => q.type === "test" && q.correctOptionId);
    // "corta" (F5, T5.6): autocorregible como test, comparando con gradeShort.
    const cortaQs   = questions.filter((q) => q.type === "corta" && q.accepted?.length);
    const devQs     = questions.filter((q) => q.type === "desarrollo");
    const gradableQs = testQs.length + cortaQs.length;
    const correctN  = testQs.filter((q) => result.answers?.[q.id] === q.correctOptionId).length
                     + cortaQs.filter((q) => gradeShort(result.answers?.[q.id], q.accepted)).length;
    const col       = scoreColor(sc);
    // ¿Es correcta la respuesta a UNA pregunta autocorregible (test o corta)?
    // null = no autocorregible (desarrollo, o "corta" sin aceptadas configuradas).
    const isQGraded = (q: (typeof questions)[number], ans: string | undefined): boolean | null => {
      if (q.type === "test") return ans === q.correctOptionId;
      if (q.type === "corta" && q.accepted?.length) return gradeShort(ans, q.accepted);
      return null;
    };

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
            {(queueLabel || onPrev || onNext) && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 16 }}>
                <button onClick={() => onPrev?.()} disabled={!onPrev} style={{ ...S.btn, fontSize: 12, padding: "5px 12px", opacity: onPrev ? 1 : 0.4, cursor: onPrev ? "pointer" : "default" }}>‹ Anterior</button>
                {queueLabel && <span style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>{queueLabel}</span>}
                <button onClick={() => onNext?.()} disabled={!onNext} style={{ ...S.btn, fontSize: 12, padding: "5px 12px", opacity: onNext ? 1 : 0.4, cursor: onNext ? "pointer" : "default" }}>Siguiente ›</button>
              </div>
            )}
            {extraHeaderContent}
            <AttemptBanner result={result} />

            {sc != null && (
              <div style={{ ...S.card, textAlign: "center", marginBottom: 20 }}>
                <div style={{ fontSize: 48, fontWeight: 900, color: col, lineHeight: 1 }}>{sc}%</div>
                <div style={{ color: C.muted, fontSize: 13, marginTop: 4 }}>{correctN} de {gradableQs} {gradableQs === 1 ? "pregunta correcta" : "preguntas correctas"} (automático)</div>
              </div>
            )}

            {/* Barra de audio compartida + candado de región (M3.3): los «▶
                Fragmento» de cada pregunta fijan su bucle en esta misma barra;
                la píldora muestra el bucle activo y permite liberarlo. */}
            {hasAudio && (
              <div style={{ marginBottom: 20 }}>
                <CorrectionAudioBar time={time} timeRef={audioTimeRef} duration={dur} playing={playing} audioReady={audioReady}
                  togglePlay={togglePlay} onSeek={(e) => { const r = e.currentTarget.getBoundingClientRect(); seekTo(((e.clientX - r.left) / r.width) * dur); }} />
                {activeFragmentQId && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center", fontSize: 12, color: C.quiz, marginTop: 8, flexWrap: "wrap" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, background: `${C.quiz}12`, borderRadius: 999, padding: "4px 12px", fontWeight: 600 }}>
                      🔒 Fragmento P{questions.findIndex((q) => q.id === activeFragmentQId) + 1} · bucle
                    </span>
                    <button onClick={releaseFragment} className="fa-pressable" style={{ ...S.btn, padding: "4px 12px", fontSize: 11 }}>Liberar</button>
                  </div>
                )}
              </div>
            )}

            {questions.map((q, idx) => {
              const studentAnswer = result.answers?.[q.id];
              const graded    = isQGraded(q, studentAnswer);
              const isCorrect = graded === true;
              const isWrong   = graded === false && !!studentAnswer;
              return (
                <div key={q.id} style={{ ...S.card, marginBottom: 16, border: q.type === "desarrollo" ? `1.5px solid ${C.quiz}33` : `1.5px solid ${isCorrect ? C.fnT : isWrong ? C.danger : C.line}` }}>
                  <div style={{ ...S.row, gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                    <span style={{ ...S.badge, background: C.line, color: C.muted }}>P{idx + 1}</span>
                    <span style={{ ...S.badge, background: q.type === "test" ? "rgba(63,155,91,0.12)" : q.type === "corta" ? "rgba(154,79,184,0.12)" : "rgba(47,111,184,0.12)", color: q.type === "test" ? C.fnT : q.type === "corta" ? C.fnI : C.quiz }}>{q.type === "test" ? "Test" : q.type === "corta" ? "Corta" : "Desarrollo"}</span>
                    <span style={{ ...S.badge, background: C.paper2, color: C.muted, fontFamily: FONT_SANS, fontVariantNumeric: "tabular-nums" }}>{fmtClock(q.audioStart ?? 0)}–{fmtClock(q.audioEnd ?? 0)}</span>
                    {hasAudio && (
                      <button onClick={() => playQuestionFragment(q)} className="fa-pressable"
                        style={{ ...S.badge, background: activeFragmentQId === q.id && playing ? C.quiz : "transparent", color: activeFragmentQId === q.id && playing ? "#fff" : C.quiz, border: `1px solid ${C.quiz}55`, cursor: "pointer" }}>
                        {activeFragmentQId === q.id && playing ? "❚❚ Fragmento" : "▶ Fragmento"}
                      </button>
                    )}
                    {(q.type === "test" || q.type === "corta") && (
                      <span style={{ ...S.badge, background: isCorrect ? "rgba(63,155,91,0.16)" : isWrong ? "rgba(184,74,58,0.16)" : C.line, color: isCorrect ? C.fnT : isWrong ? C.danger : C.muted }}>
                        {!studentAnswer ? "Sin respuesta" : isCorrect ? "✓ Correcta" : "✗ Incorrecta"}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 14, color: C.ink, marginBottom: 12 }}>{q.text}</div>

                  {q.explanation && (
                    <div style={{ marginBottom: 12, padding: "8px 12px", background: "rgba(47,111,184,0.06)", border: `1px solid ${C.quiz}33`, borderRadius: 8 }}>
                      <div style={{ fontSize: 10.5, color: C.quiz, fontWeight: 700, marginBottom: 3 }}>Tu explicación</div>
                      <div style={{ fontSize: 13, color: C.ink2, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{q.explanation}</div>
                    </div>
                  )}

                  {q.type === "corta" && (
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 11, color: C.muted, marginBottom: 6 }}>Respuesta del alumno:</div>
                      <div style={{ background: C.paper2, border: `1.5px solid ${isCorrect ? C.fnT : isWrong ? C.danger : C.line}`, borderRadius: 8, padding: "10px 12px", fontSize: 14, color: C.ink, marginBottom: 8 }}>
                        {studentAnswer || <span style={{ color: C.muted2, fontStyle: "italic" }}>Sin respuesta</span>}
                      </div>
                      <div style={{ fontSize: 11, color: C.muted }}>Aceptadas: {(q.accepted ?? []).join(" · ") || "—"}</div>
                      <div style={{ marginTop: 10 }}>
                        <div style={{ fontSize: 11, color: C.muted, marginBottom: 6 }}>Comentario del profesor (opcional):</div>
                        <textarea
                          value={qComments[q.id] || ""}
                          onChange={(e) => setQComments((prev) => ({ ...prev, [q.id]: e.target.value }))}
                          placeholder="Escribe un comentario para esta respuesta..."
                          rows={2}
                          style={{ width: "100%", fontFamily: "Outfit, sans-serif", fontSize: 13, background: C.paper2, border: `1px solid ${C.line}`, borderRadius: 8, padding: "10px 12px", color: C.ink, resize: "vertical", boxSizing: "border-box" }}
                        />
                      </div>
                    </div>
                  )}

                  {q.type === "test" && (
                    <>
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
                              <span style={{ fontFamily: FONT_SANS, fontWeight: 700, fontSize: 12, minWidth: 20 }}>{opt.id}</span>
                              <span style={{ flex: 1, fontSize: 13 }}>{opt.text}</span>
                              {isCorrectOpt && <span style={{ fontSize: 11, fontWeight: 700 }}>✓ Correcta</span>}
                              {isPick && !isCorrectOpt && <span style={{ fontSize: 11, fontWeight: 700 }}>Resp. alumno</span>}
                            </div>
                          );
                        })}
                      </div>
                      <div style={{ marginTop: 12 }}>
                        <div style={{ fontSize: 11, color: C.muted, marginBottom: 6 }}>Comentario del profesor (opcional):</div>
                        <textarea
                          value={qComments[q.id] || ""}
                          onChange={(e) => setQComments((prev) => ({ ...prev, [q.id]: e.target.value }))}
                          placeholder="Escribe un comentario para esta respuesta..."
                          rows={2}
                          style={{ width: "100%", fontFamily: "Outfit, sans-serif", fontSize: 13, background: C.paper2, border: `1px solid ${C.line}`, borderRadius: 8, padding: "10px 12px", color: C.ink, resize: "vertical", boxSizing: "border-box" }}
                        />
                      </div>
                    </>
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
                <label style={{ fontSize: 13, color: C.muted }}>Puntuación total %:</label>
                <input
                  type="number" min={0} max={100} step={5}
                  value={quizScore}
                  onChange={(e) => setQuizScore(e.target.value)}
                  placeholder={sc != null ? String(sc) : undefined}
                  style={{ width: 80, fontFamily: "Outfit, sans-serif", fontSize: 14, background: C.paper2, border: `1px solid ${C.line}`, borderRadius: 8, padding: "6px 10px", color: C.ink, textAlign: "center" }}
                />
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <button
                onClick={handleSaveQuiz}
                style={{ ...S.btnPrimary, flex: 1, padding: 14, borderRadius: 12 }}
              >
                {tc?.corrected ? "Actualizar corrección" : "Guardar corrección"}
              </button>
              {onNext && (
                <button onClick={() => { handleSaveQuiz(); onNext(); }} style={{ ...S.btnPrimary, flex: 1, padding: 14, borderRadius: 12, background: C.fnT, borderColor: C.fnT }}>
                  Guardar y siguiente
                </button>
              )}
            </div>
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
          {extraHeaderContent}
          <AttemptBanner result={result} />

          <div style={{ ...S.card, textAlign: "center", marginBottom: 20 }}>
            {tc?.corrected && tc?.totalScore != null ? (() => {
              const pct100 = normalizeScore100(tc.totalScore);
              return (
                <>
                  <div style={{ fontSize: 64, fontWeight: 900, color: scoreColor(pct100), lineHeight: 1 }}>{pct100}%</div>
                  <div style={{ color: C.muted, fontSize: 13, marginTop: 4 }}>Puntuación del profesor</div>
                  {sc != null && <div style={{ color: C.muted, fontSize: 12, marginTop: 8 }}>{correctN} de {gradableQs} preguntas correctas ({sc}% automático)</div>}
                </>
              );
            })() : sc != null ? (
              <>
                <div style={{ fontSize: 64, fontWeight: 900, color: col, lineHeight: 1 }}>{sc}%</div>
                <div style={{ color: C.muted, fontSize: 14, marginTop: 4 }}>{correctN} de {gradableQs} {gradableQs === 1 ? "pregunta" : "preguntas"} correctas</div>
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
            const graded    = isQGraded(q, studentAnswer);
            const isCorrect = graded === true;
            const isWrong   = graded === false && !!studentAnswer;
            const teacherComment = tc?.corrected ? tc?.questionComments?.[q.id] : null;
            return (
              <div key={q.id} style={{ ...S.card, border: q.type === "desarrollo" ? `1px solid ${C.line}` : `1.5px solid ${isCorrect ? C.fnT : isWrong ? C.danger : C.line}` }}>
                <div style={{ ...S.row, gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                  <span style={{ ...S.badge, background: C.line, color: C.muted }}>P{idx + 1}</span>
                  <span style={{ ...S.badge, background: q.type === "test" ? "rgba(63,155,91,0.12)" : q.type === "corta" ? "rgba(154,79,184,0.12)" : "rgba(47,111,184,0.12)", color: q.type === "test" ? C.fnT : q.type === "corta" ? C.fnI : C.quiz }}>{q.type === "test" ? "Test" : q.type === "corta" ? "Corta" : "Desarrollo"}</span>
                  <span style={{ ...S.badge, background: C.paper2, color: C.muted, fontFamily: FONT_SANS, fontVariantNumeric: "tabular-nums" }}>{fmtClock(q.audioStart ?? 0)}–{fmtClock(q.audioEnd ?? 0)}</span>
                  {(q.type === "test" || q.type === "corta") && (
                    <span style={{ ...S.badge, background: isCorrect ? "rgba(63,155,91,0.16)" : isWrong ? "rgba(184,74,58,0.16)" : C.line, color: isCorrect ? C.fnT : isWrong ? C.danger : C.muted }}>
                      {!studentAnswer ? "Sin respuesta" : isCorrect ? "✓ Correcta" : "✗ Incorrecta"}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 14, color: C.ink, marginBottom: 12 }}>{q.text}</div>

                {(q.type === "test" || q.type === "corta") && q.explanation && (
                  <div style={{ marginBottom: 12, padding: "8px 12px", background: "rgba(47,111,184,0.06)", border: `1px solid ${C.quiz}33`, borderRadius: 8 }}>
                    <div style={{ fontSize: 10.5, color: C.quiz, fontWeight: 700, marginBottom: 3 }}>Explicación</div>
                    <div style={{ fontSize: 13, color: C.ink2, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{q.explanation}</div>
                  </div>
                )}

                {q.type === "corta" && (
                  <div>
                    <div style={{ fontSize: 11, color: C.muted, marginBottom: 6 }}>Tu respuesta:</div>
                    <div style={{ background: C.paper2, border: `1.5px solid ${isCorrect ? C.fnT : isWrong ? C.danger : C.line}`, borderRadius: 8, padding: "10px 12px", fontSize: 14, color: C.ink, marginBottom: 8 }}>
                      {studentAnswer || <span style={{ color: C.muted2, fontStyle: "italic" }}>Sin respuesta</span>}
                    </div>
                    {/* Aceptadas visibles tras entregar (F5, T5.6) — esta vista solo se monta con un resultado ya guardado. */}
                    <div style={{ fontSize: 12, color: C.muted, marginBottom: teacherComment ? 10 : 0 }}>Aceptadas: {(q.accepted ?? []).join(" · ") || "—"}</div>
                    {teacherComment && (
                      <div style={{ background: "rgba(47,111,184,0.06)", border: `1px solid ${C.quiz}55`, borderRadius: 8, padding: "10px 12px" }}>
                        <div style={{ fontSize: 11, color: C.quiz, fontWeight: 700, marginBottom: 4 }}>Comentario del profesor:</div>
                        <div style={{ fontSize: 13, color: C.ink, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{teacherComment}</div>
                      </div>
                    )}
                  </div>
                )}

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
                          <span style={{ fontFamily: FONT_SANS, fontWeight: 700, fontSize: 12, minWidth: 20 }}>{opt.id}</span>
                          <span style={{ flex: 1, fontSize: 13 }}>{opt.text}</span>
                          {isCorrectOpt && <span style={{ fontSize: 11, fontWeight: 700 }}>✓ Correcta</span>}
                          {isPick && !isCorrectOpt && <span style={{ fontSize: 11, fontWeight: 700 }}>Tu resp.</span>}
                        </div>
                      );
                    })}
                    {teacherComment && (
                      <div style={{ marginTop: 10, background: "rgba(47,111,184,0.06)", border: `1px solid ${C.quiz}55`, borderRadius: 8, padding: "10px 12px" }}>
                        <div style={{ fontSize: 11, color: C.quiz, fontWeight: 700, marginBottom: 4 }}>Comentario del profesor:</div>
                        <div style={{ fontSize: 13, color: C.ink, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{teacherComment}</div>
                      </div>
                    )}
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
