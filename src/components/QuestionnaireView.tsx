// ═══ QUESTIONNAIREVIEW (CUESTIONARIO) ════════════════════════════════════════
// Vista del alumno para ejercicios tipo cuestionario. Extraída de App.jsx (Fase 2).
import { useState, useRef, useEffect, type ReactNode } from "react";
import type { Exercise, Question } from "../lib/types.js";
import { C, F, S } from "../theme/tokens.js";
import { fmt } from "../lib/ids.js";
import { calcQuestionnaireScore } from "../lib/scoring.js";
import { questionsOf } from "../lib/domain.js";
import { useAudioPlayer } from "../hooks/useAudioPlayer.js";
import { CircleButton, AudioLoadingOverlay, SessionHeader, SessionHint, StickyActionBar, BarSubmitButton, Chevron } from "./primitives.jsx";
import { WaveformDisplay } from "./session.js";

// El player compartido (MultiModelSessionView) es el valor de useAudioPlayer
// ampliado con la waveform decodificada una sola vez.
type SharedAudioPlayer = ReturnType<typeof useAudioPlayer> & { waveformData?: number[] | null };

// En un cuestionario cada pregunta tiene fragmento de audio (start/end) definido.
type QuizQuestion = Question & { audioStart: number; audioEnd: number };

interface QuestionnaireResult { type: "cuestionario"; answers: Record<string, string>; score: number | null; }

// Borrador de respuestas — mismo formato que produce esta vista y que
// MultiPartSessionView (F4, T4.3) eleva a drafts[partId][modelId].
type CuestionarioDraft = Record<string, string>;

interface QuestionnaireViewProps {
  exercise: Exercise;
  onSubmit: (result: QuestionnaireResult) => void;
  onBack: () => void;
  modelToggleNode?: ReactNode;
  sharedAudioPlayer?: SharedAudioPlayer | null;
  loopRegionRef?: { current: Question | null } | null;
  initialDraft?: CuestionarioDraft | null;
  onDraftChange?: (draft: CuestionarioDraft) => void;
}

// Vista del alumno para ejercicios tipo "cuestionario"
export function QuestionnaireView({ exercise, onSubmit, onBack, modelToggleNode = null, sharedAudioPlayer = null, loopRegionRef: externalLoopRef = null, initialDraft = null, onDraftChange }: QuestionnaireViewProps) {
  const dur       = exercise.duration as number;
  const questions = questionsOf(exercise) as QuizQuestion[];

  const [answers,        setAnswers]        = useState<Record<string, string>>(() => initialDraft || {});
  const [expandedId,     setExpandedId]     = useState<string | null>(null);
  const [lockedQuestion, setLockedQuestion] = useState<QuizQuestion | null>(null);
  const [localWaveformData, setLocalWaveformData] = useState<number[] | null>(exercise.waveformData || null);
  const waveformData = sharedAudioPlayer?.waveformData ?? localWaveformData;

  // Ref de bucle: usa el externo (del padre) si está disponible, para que el
  // reproductor compartido vea los cambios de fragmento bloqueado
  const ownLoopRegionRef = useRef<Question | null>(null);
  const loopRegionRef    = externalLoopRef || ownLoopRegionRef;
  loopRegionRef.current  = lockedQuestion;   // sincronizado cada render

  const localOnWaveform = (!sharedAudioPlayer && !exercise.waveformData) ? (wd: number[]) => setLocalWaveformData(wd) : null;
  const localPlayer = useAudioPlayer(
    sharedAudioPlayer ? { id: exercise.id, duration: exercise.duration, audioUrl: null } : exercise,
    // La pregunta bloqueada siempre tiene audioStart/audioEnd; el ref encaja con
    // la región de bucle que espera el reproductor.
    { onWaveform: localOnWaveform, loopRegionRef: sharedAudioPlayer ? null : (loopRegionRef as { current: { audioStart: number; audioEnd: number } | null }) }
  );
  const {
    time, playing, audioReady, audioError, hasAudio,
    timeRef, togglePlay, seekTo, playFrom, scrubBegin, scrubTo, scrubEnd, audioDuration,
  } = sharedAudioPlayer || localPlayer;

  const selectQuestion = (q: QuizQuestion) => {
    setLockedQuestion(q);
    setExpandedId(q.id);
    if (playing) seekTo(q.audioStart); else playFrom(q.audioStart);
  };
  const unlockAudio    = ()  => { setLockedQuestion(null); };

  // Espacio = Play/Pausa (excepto si hay un input/textarea/button con foco) — mismo guard que QuestionManagerView.
  const togglePlayRef = useRef(togglePlay);
  useEffect(() => { togglePlayRef.current = togglePlay; });
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === " " && !["INPUT", "TEXTAREA", "BUTTON"].includes((e.target as HTMLElement).tagName)) {
        e.preventDefault();
        togglePlayRef.current();
      }
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, []);

  // Eleva el borrador al padre (MultiPartSessionView, F4/T4.3) en cada cambio.
  useEffect(() => { onDraftChange?.(answers); }, [answers]); // eslint-disable-line react-hooks/exhaustive-deps

  const answeredCount = questions.filter((q) => answers[q.id] !== undefined && answers[q.id] !== "").length;

  const handleSubmit = () => {
    const score = calcQuestionnaireScore(questions, answers);
    onSubmit({ type: "cuestionario", answers, score });
  };

  const questionRegion = lockedQuestion
    ? { start: lockedQuestion.audioStart, end: lockedQuestion.audioEnd, color: C.quiz }
    : null;

  if (questions.length === 0) {
    return (
      <div style={S.app}>
        <SessionHeader exercise={exercise} onBack={onBack} modelId="cuestionario" />
        <div style={S.page}>
          <div style={{ ...S.card, textAlign: "center", color: C.muted, padding: "3rem 1rem", lineHeight: 1.8, borderRadius: 16 }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
            <div>Este ejercicio aún no tiene preguntas configuradas.</div>
            <div style={{ fontSize: 13 }}>El profesor las añadirá pronto.</div>
          </div>
        </div>
      </div>
    );
  }

  const allAnswered = answeredCount === questions.length;

  return (
    <div style={{ ...S.app, display: "flex", flexDirection: "column" }} onMouseDown={() => { if (lockedQuestion) unlockAudio(); }}>
      <SessionHeader exercise={exercise} onBack={onBack} modelId="cuestionario" />
      <div style={{ maxWidth: 980, width: "100%", margin: "0 auto", padding: "16px 16px 24px", flex: 1 }}>

        {modelToggleNode}

        {hasAudio && !audioReady && !audioError && <AudioLoadingOverlay />}
        {audioError && <div style={{ textAlign: "center", color: C.danger, fontSize: 12, marginBottom: 10 }}>{audioError}</div>}

        <SessionHint modelId="cuestionario" />

        <section onMouseDown={(e) => e.stopPropagation()}
          style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 16, padding: "14px 14px 12px", marginBottom: 12 }}>
          <div style={{ background: C.paper2, borderRadius: 10, overflow: "hidden", border: `1px solid ${C.line}`, marginBottom: 8 }}>
            <WaveformDisplay time={time} timeRef={timeRef} duration={dur} waveformDuration={audioDuration} allIntervals={[]}
              exerciseId={exercise.id} waveformData={waveformData}
              colorByFn={{}} questionRegion={questionRegion}
              onScrubBegin={scrubBegin} onScrubTo={scrubTo} onScrubEnd={scrubEnd} />
          </div>

          {/* Minimapa de preguntas — toca un bloque para saltar a su fragmento */}
          <div style={{ position: "relative", height: 30, marginBottom: 4, background: C.paper2, borderRadius: 6, border: `1px solid ${C.line}`, overflow: "hidden", userSelect: "none" }}>
            {questions.map((q, idx) => {
              const isLock = lockedQuestion?.id === q.id;
              const answered = answers[q.id] !== undefined && answers[q.id] !== "";
              return (
                <div key={q.id}
                  onMouseDown={(e) => e.stopPropagation()} onClick={() => selectQuestion(q)}
                  title={`P${idx + 1}: ${fmt(q.audioStart)} – ${fmt(q.audioEnd)}`}
                  style={{ position: "absolute", top: 3, bottom: 3, left: `${(q.audioStart / dur) * 100}%`, width: `${Math.max(0, (q.audioEnd - q.audioStart) / dur) * 100}%`, background: answered ? C.fnT : C.quiz, opacity: isLock ? 1 : 0.5, borderRadius: 3, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", border: isLock ? `1.5px solid rgba(255,255,255,0.9)` : "none", boxSizing: "border-box", overflow: "hidden" }}>
                  <span style={{ fontSize: 8, color: "#fff", fontWeight: 700, fontFamily: F.sans, pointerEvents: "none" }}>{idx + 1}</span>
                </div>
              );
            })}
            <div style={{ position: "absolute", top: 0, bottom: 0, left: `${(time / dur) * 100}%`, width: 1.5, background: C.ink, opacity: 0.75, pointerEvents: "none" }} />
          </div>

          {lockedQuestion ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center", fontSize: 12, color: C.quiz, margin: "8px 0", flexWrap: "wrap" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, background: `${C.quiz}12`, borderRadius: 999, padding: "4px 12px", fontWeight: 600 }}>
                🔒 Fragmento {fmt(lockedQuestion.audioStart)} – {fmt(lockedQuestion.audioEnd)} · bucle
              </span>
              <button onClick={unlockAudio} className="fa-pressable" style={{ ...S.btn, padding: "4px 12px", fontSize: 11 }}>Liberar</button>
            </div>
          ) : <div style={{ height: 8 }} />}

          <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 12, paddingTop: 10, borderTop: `1px solid ${C.line}` }}>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <CircleButton onClick={() => seekTo(lockedQuestion ? lockedQuestion.audioStart : 0)} title="Volver al inicio">⏮</CircleButton>
            </div>
            <CircleButton onClick={togglePlay} disabled={hasAudio && !audioReady && !audioError}
              primary size={52} title={playing ? "Pausa (Espacio)" : "Reproducir (Espacio)"}>
              {playing ? "❚❚" : "▶"}
            </CircleButton>
            <div style={{ textAlign: "right", fontFamily: F.sans, fontVariantNumeric: "tabular-nums", fontSize: 22, fontWeight: 600, color: C.ink, letterSpacing: -0.5 }}>
              {fmt(time)}<span style={{ color: C.muted, fontWeight: 400 }}>/{fmt(dur)}</span>
            </div>
          </div>
        </section>

        {questions.map((q, idx) => {
          const isExpanded = expandedId === q.id;
          const isLocked   = lockedQuestion?.id === q.id;
          const answered   = answers[q.id] !== undefined && answers[q.id] !== "";
          return (
            <div key={q.id} onMouseDown={(e) => e.stopPropagation()}
              style={{ background: C.paper, border: isLocked ? `1.5px solid ${C.quiz}` : `1px solid ${C.line}`, borderRadius: 12, marginBottom: 8, padding: "14px 16px", transition: "border-color .15s" }}>
              <div style={{ cursor: "pointer" }}
                onClick={() => { if (isExpanded) setExpandedId(null); else selectQuestion(q); }}>
                {/* Fila de metadatos — número + estado + chevron */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 22, height: 22, borderRadius: "50%", background: answered ? C.fnT : `${C.quiz}1A`, color: answered ? C.paper : C.quiz, fontFamily: F.sans, fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                    {answered ? "✓" : idx + 1}
                  </span>
                  <span style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 500, color: C.muted }}>
                    {q.type === "test" ? "Opción múltiple" : q.type === "corta" ? "Respuesta corta" : "Respuesta abierta"} · {fmt(q.audioStart)}–{fmt(q.audioEnd)}
                  </span>
                  <div style={{ marginLeft: "auto" }}><Chevron open={isExpanded} /></div>
                </div>
                {/* Texto de la pregunta — serif grande */}
                <div style={{ fontFamily: F.serif, fontSize: 20, fontWeight: 600, letterSpacing: "-0.01em", lineHeight: 1.35, color: C.ink }}>{q.text}</div>
              </div>

              <div className={`fa-expand${isExpanded ? " fa-open" : ""}`}>
                <div className="fa-expand-inner">
                  <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${C.line}` }}>
                    {q.type === "test" && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                        {(q.options ?? []).map((opt) => {
                          const isSel = answers[q.id] === opt.id;
                          return (
                            <button key={opt.id} className="fa-pressable"
                              onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: opt.id }))}
                              style={{ background: isSel ? C.ink : C.bg, color: isSel ? "#fff" : C.ink, border: `1.5px solid ${isSel ? C.ink : C.line}`, borderRadius: 10, padding: "12px 14px", cursor: "pointer", textAlign: "left", fontSize: 13.5, lineHeight: 1.4, display: "flex", alignItems: "center", gap: 12 }}>
                              <span style={{ fontFamily: F.sans, fontWeight: 700, fontSize: 12, color: isSel ? "rgba(255,255,255,0.6)" : C.muted, minWidth: 18, flexShrink: 0 }}>{opt.id}</span>
                              {opt.text}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {q.type === "corta" && (
                      <input type="text" style={{ ...S.input, fontSize: 14 }}
                        placeholder="Escribe tu respuesta…"
                        value={answers[q.id] || ""}
                        onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                        onClick={(e) => e.stopPropagation()} />
                    )}
                    {q.type === "desarrollo" && (
                      <textarea style={{ ...S.input, minHeight: 96, resize: "vertical", lineHeight: 1.5, fontSize: 14 }}
                        placeholder="Escribe tu respuesta aquí…"
                        value={answers[q.id] || ""}
                        onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                        onClick={(e) => e.stopPropagation()} />
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <StickyActionBar
        info={
          <>
            <span style={{ fontFamily: F.sans, fontSize: 13, fontWeight: 600, color: allAnswered ? C.fnT : C.ink }}>
              {answeredCount} / {questions.length} {allAnswered ? "· completo" : "respondidas"}
            </span>
            <div style={{ height: 4, background: C.line, borderRadius: 2, overflow: "hidden", marginTop: 3, maxWidth: 160 }}>
              <div style={{ height: "100%", width: `${questions.length ? (answeredCount / questions.length) * 100 : 0}%`, background: allAnswered ? C.fnT : C.quiz, borderRadius: 2, transition: "width .3s" }} />
            </div>
          </>
        }>
        <BarSubmitButton onClick={handleSubmit} accent={C.quiz}>Entregar</BarSubmitButton>
      </StickyActionBar>
    </div>
  );
}
