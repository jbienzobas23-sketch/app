// ═══ QUESTIONMANAGERVIEW (EDICIÓN DE PREGUNTAS) ══════════════════════════════
// Extraída de teacher.jsx (Fase 2, subdivisión).
import { useState, useEffect, useRef } from "react";
import type { Exercise, Question } from "../lib/types.js";
import { C, S, FONT_SANS } from "../theme/tokens.js";
import { fmt, uid } from "../lib/ids.js";
import { questionsOf } from "../lib/domain.js";
import { startPointerDrag } from "../lib/pointer.js";
import { useAudioPlayer } from "../hooks/useAudioPlayer.js";
import { ConfirmModal, CircleButton } from "./primitives.jsx";
import { WaveformDisplay } from "./session.js";
import { QuestionEditorModal } from "./modals.js";

// En el gestor de preguntas cada pregunta tiene fragmento (start/end) definido.
type QuizQuestion = Question & { audioStart: number; audioEnd: number };
// Estado de edición: una pregunta existente o un marcador de "nueva".
type EditingQ = QuizQuestion | { _new: true; defaultStart: number } | null;

interface QuestionManagerViewProps {
  exercise: Exercise;
  onSave: (questions: QuizQuestion[]) => void;
  onBack: () => void;
}

// ═══ 13. QUESTION MANAGER VIEW (profesor edita preguntas) ═══════════════════
export function QuestionManagerView({ exercise, onSave, onBack }: QuestionManagerViewProps) {
  const dur = exercise.duration as number;
  const [questions,   setQuestions]   = useState<QuizQuestion[]>(questionsOf(exercise) as QuizQuestion[]);
  const [editingQ,    setEditingQ]    = useState<EditingQ>(null);
  const [confirmDel,  setConfirmDel]  = useState<{ id: string; text: string } | null>(null);
  const [selectedQId, setSelectedQId] = useState<string | null>(null);
  const [confirmBack, setConfirmBack] = useState(false);
  const minimapRef = useRef<HTMLDivElement | null>(null);

  const isDirty = JSON.stringify(questions) !== JSON.stringify(questionsOf(exercise));
  const guardedOnBack = () => { if (isDirty) setConfirmBack(true); else onBack(); };

  // QMV usa exercise.waveformData directamente — sin callback de onWaveform
  const {
    time, playing, audioReady, audioError, hasAudio,
    togglePlay, seekTo, scrubBegin, scrubTo, scrubEnd, audioDuration,
  } = useAudioPlayer(exercise);

  // Espacio = Play/Pausa (excepto si hay un input/textarea/button con foco)
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

  // Orden y duplicado (F5, T5.3) — mueven/copian dentro del array local;
  // el orden se persiste al pulsar "Guardar preguntas", como el resto de cambios.
  const moveQuestion = (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= questions.length) return;
    setQuestions((prev) => {
      const next = [...prev];
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  };
  const sortByTime = () => setQuestions((prev) => [...prev].sort((a, b) => a.audioStart - b.audioStart));
  const duplicateQuestion = (q: QuizQuestion) => {
    const shift = 0.5;
    const dup: QuizQuestion = {
      ...q,
      id: uid("q"),
      audioStart: Math.min(dur, q.audioStart + shift),
      audioEnd:   Math.min(dur, q.audioEnd + shift),
    };
    setQuestions((prev) => {
      const idx = prev.findIndex((x) => x.id === q.id);
      const next = [...prev];
      next.splice(idx + 1, 0, dup);
      return next;
    });
  };

  // Drag del cuerpo de una pregunta en el minimapa
  const beginDragQBody = (e: any, qId: string) => {
    e.stopPropagation();
    const el = minimapRef.current;
    if (!el) return;
    const rect  = el.getBoundingClientRect();
    const origQ = questions.find((q) => q.id === qId);
    if (!origQ) return;
    const len = origQ.audioEnd - origQ.audioStart;
    let startX = 0, moved = false;
    startPointerDrag(e, {
      onStart: (ev, getX) => { startX = getX(ev); setSelectedQId(qId); },
      onMove:  (ev, getX) => {
        const cx = getX(ev);
        if (!moved && Math.abs(cx - startX) > 3) moved = true;
        if (!moved) return;
        const ns = Math.max(0, Math.min(dur - len, origQ.audioStart + ((cx - startX) / rect.width) * dur));
        const s = parseFloat(ns.toFixed(2)), f = parseFloat((ns + len).toFixed(2));
        setQuestions((prev) => prev.map((q) => q.id === qId ? { ...q, audioStart: s, audioEnd: f } : q));
      },
      onEnd: () => { if (!moved) seekTo(origQ.audioStart); },
    });
  };

  // Drag de los bordes de una pregunta (resize)
  const beginDragQEdge = (e: any, qId: string, which: "start" | "end") => {
    e.stopPropagation();
    const el = minimapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const xToTime = (x: number) => Math.max(0, Math.min(dur, ((x - rect.left) / rect.width) * dur));
    const origQ = questions.find((q) => q.id === qId);
    if (!origQ) return;
    setSelectedQId(qId);
    startPointerDrag(e, {
      onMove: (ev, getX) => {
        const t = xToTime(getX(ev));
        const updated = which === "start"
          ? { ...origQ, audioStart: parseFloat(Math.min(origQ.audioEnd - 0.5, Math.max(0, t)).toFixed(2)) }
          : { ...origQ, audioEnd:   parseFloat(Math.max(origQ.audioStart + 0.5, Math.min(dur, t)).toFixed(2)) };
        setQuestions((prev) => prev.map((q) => q.id === qId ? updated : q));
      },
    });
  };

  return (
    <div style={S.app}>
      <div style={S.page}>
        <div style={{ ...S.row, justifyContent: "space-between", marginBottom: 18 }}>
          <button onClick={guardedOnBack} style={{ ...S.btn, padding: "6px 14px", fontSize: 13 }}>← Volver</button>
          <div style={{ fontWeight: 600, color: C.ink, fontSize: 15, textAlign: "center", flex: 1 }}>{exercise.title} — Preguntas</div>
          <button onClick={() => onSave(questions)} style={S.btnPrimary}>Guardar</button>
        </div>

        <section style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 18, padding: "14px 14px 12px", marginBottom: 20 }}>
          {hasAudio && !audioReady && !audioError && <div style={{ textAlign: "center", color: C.muted, fontSize: 12, marginBottom: 8 }}>Cargando audio…</div>}
          {audioError && <div style={{ textAlign: "center", color: C.danger, fontSize: 12, marginBottom: 8 }}>{audioError}</div>}

          <div style={{ background: C.paper2, borderRadius: 10, overflow: "hidden", border: `1px solid ${C.line}`, marginBottom: 6 }}>
            {(() => {
              const selQ    = questions.find((q) => q.id === selectedQId);
              const qRegion = selQ ? { start: selQ.audioStart, end: selQ.audioEnd, color: C.quiz } : null;
              return (
                <WaveformDisplay time={time} duration={dur} waveformDuration={audioDuration} allIntervals={[]}
                  exerciseId={exercise.id} waveformData={exercise.waveformData || null}
                  colorByFn={{}} questionRegion={qRegion}
                  onScrubBegin={scrubBegin} onScrubTo={scrubTo} onScrubEnd={scrubEnd} />
              );
            })()}
          </div>

          {/* Minimapa de preguntas (draggable) */}
          <div ref={minimapRef} onMouseDown={() => setSelectedQId(null)}
            style={{ position: "relative", height: 36, marginBottom: 4, background: C.paper2, borderRadius: 6, border: `1px solid ${C.line}`, overflow: "hidden", touchAction: "none", userSelect: "none", cursor: "default" }}>
            {questions.map((q, idx) => {
              const isSel  = selectedQId === q.id;
              const qLeft  = `${(q.audioStart / dur) * 100}%`;
              const qWidth = `${Math.max(0, (q.audioEnd - q.audioStart) / dur) * 100}%`;
              return (
                <div key={q.id}
                  onMouseDown ={(e) => beginDragQBody(e, q.id)}
                  onTouchStart={(e) => beginDragQBody(e, q.id)}
                  title={`P${idx + 1}: ${fmt(q.audioStart)} – ${fmt(q.audioEnd)}`}
                  style={{
                    position: "absolute", top: 3, bottom: 3, left: qLeft, width: qWidth,
                    background: C.quiz, opacity: isSel ? 1 : 0.7,
                    borderRadius: 3, cursor: "grab",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    border: isSel ? `1.5px solid rgba(255,255,255,0.85)` : "none",
                    boxSizing: "border-box", overflow: "hidden", zIndex: isSel ? 2 : 1,
                  }}>
                  <div onMouseDown ={(e) => { e.stopPropagation(); beginDragQEdge(e, q.id, "start"); }}
                       onTouchStart={(e) => { e.stopPropagation(); beginDragQEdge(e, q.id, "start"); }}
                       style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 10, cursor: "ew-resize", zIndex: 3, background: isSel ? "rgba(255,255,255,0.22)" : "transparent" }} />
                  <span style={{ fontSize: 8, color: C.paper, fontWeight: 700, fontFamily: FONT_SANS, pointerEvents: "none", padding: "0 12px", overflow: "hidden", whiteSpace: "nowrap" }}>P{idx + 1}</span>
                  <div onMouseDown ={(e) => { e.stopPropagation(); beginDragQEdge(e, q.id, "end"); }}
                       onTouchStart={(e) => { e.stopPropagation(); beginDragQEdge(e, q.id, "end"); }}
                       style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 10, cursor: "ew-resize", zIndex: 3, background: isSel ? "rgba(255,255,255,0.22)" : "transparent" }} />
                </div>
              );
            })}
            <div style={{ position: "absolute", top: 0, bottom: 0, left: `${(time / dur) * 100}%`, width: 2, background: C.ink, opacity: 0.75, pointerEvents: "none", zIndex: 5 }} />
          </div>

          {selectedQId && (() => {
            const selQ   = questions.find((q) => q.id === selectedQId);
            const selIdx = questions.findIndex((q) => q.id === selectedQId);
            if (!selQ) return null;
            return (
              <div onMouseDown={(e) => e.stopPropagation()}
                style={{ ...S.row, gap: 8, flexWrap: "wrap", alignItems: "center", padding: "5px 4px", marginBottom: 6, fontSize: 11 }}>
                <span style={{ fontFamily: FONT_SANS, fontWeight: 700, color: C.quiz }}>P{selIdx + 1}</span>
                <span style={{ fontFamily: FONT_SANS, color: C.ink2, fontVariantNumeric: "tabular-nums" }}>{fmt(selQ.audioStart)} → {fmt(selQ.audioEnd)}</span>
                <span style={{ ...S.badge, background: "rgba(47,111,184,0.10)", color: C.quiz }}>{fmt(selQ.audioEnd - selQ.audioStart)}</span>
                <span style={{ color: C.muted, fontSize: 10, flex: "1 1 160px" }}>Arrastra el bloque para mover · arrastra los bordes para ajustar</span>
                <button onClick={() => { setEditingQ(selQ); setSelectedQId(null); }} style={{ ...S.btn, padding: "3px 10px", fontSize: 11 }}>Editar contenido</button>
              </div>
            );
          })()}

          <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 12 }}>
            <div />
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <CircleButton onClick={() => seekTo(Math.max(0, time - 5))} size={36} fontSize={10}>−5s</CircleButton>
              <CircleButton onClick={togglePlay} disabled={hasAudio && !audioReady && !audioError}
                primary size={42} fontSize={14}>{playing ? "❚❚" : "▶"}</CircleButton>
              <CircleButton onClick={() => seekTo(Math.min(dur, time + 5))} size={36} fontSize={10}>+5s</CircleButton>
            </div>
            <div style={{ textAlign: "right", fontFamily: FONT_SANS, fontVariantNumeric: "tabular-nums", fontSize: 18, fontWeight: 600, color: C.ink }}>
              {fmt(time)}<span style={{ color: C.muted2, fontWeight: 400 }}>/{fmt(dur)}</span>
            </div>
          </div>
        </section>

        <div style={{ ...S.row, justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
          <h2 style={{ ...S.h2, margin: 0 }}>Preguntas ({questions.length})</h2>
          <div style={{ ...S.row, gap: 8 }}>
            {questions.length > 1 && (
              <button onClick={sortByTime} style={{ ...S.btn, fontSize: 12.5 }} title="Reordena las preguntas según su inicio en el audio">
                Ordenar por tiempo
              </button>
            )}
            {/* BUG FIX: el original usaba timeRef.current (undefined en este componente).
                Ahora se pasa `time` directamente, que ya está disponible del hook. */}
            <button onClick={() => setEditingQ({ _new: true, defaultStart: time })} style={S.btnPrimary}>
              + Añadir aquí
            </button>
          </div>
        </div>
        <p style={{ color: C.muted, fontSize: 12, margin: "0 0 14px" }}>
          Sitúate en el punto del audio deseado y pulsa "+ Añadir aquí" para usar ese instante como inicio sugerido del fragmento.
        </p>

        {questions.length === 0 && (
          <div style={{ ...S.card, textAlign: "center", color: C.muted, padding: "2rem" }}>
            Aún no hay preguntas. Crea la primera con el botón de arriba.
          </div>
        )}

        {questions.map((q, idx) => (
          <div key={q.id} style={S.card}>
            <div style={{ ...S.row, justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                <div style={{ ...S.row, gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                  <span style={{ ...S.badge, background: C.line, color: C.muted }}>P{idx + 1}</span>
                  <span style={{ ...S.badge, background: q.type === "test" ? "rgba(63,155,91,0.12)" : q.type === "corta" ? "rgba(154,79,184,0.12)" : "rgba(47,111,184,0.12)", color: q.type === "test" ? C.fnT : q.type === "corta" ? C.fnI : C.quiz }}>{q.type === "test" ? "Test" : q.type === "corta" ? "Corta" : "Desarrollo"}</span>
                  <span style={{ ...S.badge, background: C.paper2, color: C.muted, fontFamily: FONT_SANS, fontVariantNumeric: "tabular-nums" }}>{fmt(q.audioStart)} – {fmt(q.audioEnd)}</span>
                  {q.type === "test" && (q.points ?? 1) !== 1 && (
                    <span style={{ ...S.badge, background: C.paper2, color: C.muted }}>{q.points} pts</span>
                  )}
                </div>
                <div style={{ fontSize: 14, color: C.ink, marginBottom: q.type === "desarrollo" ? 0 : 6 }}>{q.text}</div>
                {q.type === "test" && (
                  <div style={{ ...S.row, gap: 6, flexWrap: "wrap" }}>
                    {(q.options ?? []).map((opt) => (
                      <span key={opt.id} style={{
                        ...S.badge, fontSize: 11,
                        background: opt.id === q.correctOptionId ? "rgba(63,155,91,0.14)" : C.paper2,
                        color:      opt.id === q.correctOptionId ? C.fnT : C.muted,
                        border:     opt.id === q.correctOptionId ? `1px solid ${C.fnT}` : `1px solid transparent`,
                      }}>
                        {opt.id}) {opt.text}{opt.id === q.correctOptionId ? " ✓" : ""}
                      </span>
                    ))}
                  </div>
                )}
                {q.type === "corta" && (
                  <div style={{ fontSize: 12, color: C.muted }}>
                    Aceptadas: {(q.accepted ?? []).join(" · ") || "—"}
                  </div>
                )}
              </div>
              <div style={{ ...S.row, gap: 6 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <button onClick={() => moveQuestion(idx, -1)} disabled={idx === 0}
                    style={{ ...S.btn, padding: "1px 8px", fontSize: 11, lineHeight: 1.4, opacity: idx === 0 ? 0.4 : 1, cursor: idx === 0 ? "default" : "pointer" }}
                    title="Subir">↑</button>
                  <button onClick={() => moveQuestion(idx, 1)} disabled={idx === questions.length - 1}
                    style={{ ...S.btn, padding: "1px 8px", fontSize: 11, lineHeight: 1.4, opacity: idx === questions.length - 1 ? 0.4 : 1, cursor: idx === questions.length - 1 ? "default" : "pointer" }}
                    title="Bajar">↓</button>
                </div>
                <button onClick={() => seekTo(q.audioStart)} style={{ ...S.btn, padding: "6px 10px", fontSize: 12 }} title={`Ir a ${fmt(q.audioStart)}`}>▶ {fmt(q.audioStart)}</button>
                <button onClick={() => setEditingQ(q)} style={S.btn}>Editar</button>
                <button onClick={() => duplicateQuestion(q)} style={{ ...S.btn, fontSize: 12 }} title="Duplicar esta pregunta">⧉ Duplicar</button>
                <button onClick={() => setConfirmDel({ id: q.id, text: q.text ?? "" })} style={S.btnDanger}>Eliminar</button>
              </div>
            </div>
          </div>
        ))}

        <button onClick={() => onSave(questions)} style={{ ...S.btnPrimary, width: "100%", marginTop: 8, padding: 14, borderRadius: 12 }}>
          Guardar preguntas
        </button>
      </div>

      {editingQ && (() => {
        const isNewQ = "_new" in editingQ;
        return (
          <QuestionEditorModal
            initial={isNewQ ? null : (editingQ as QuizQuestion)}
            defaultStart={isNewQ ? (editingQ as { defaultStart: number }).defaultStart : undefined}
            audioDuration={dur}
            audioUrl={exercise.audioUrl}
            onSave={(q: Question) => {
              const qq = q as QuizQuestion;
              if (isNewQ) setQuestions((prev) => [...prev, qq]);
              else        setQuestions((prev) => prev.map((x) => x.id === qq.id ? qq : x));
              setEditingQ(null);
            }}
            onClose={() => setEditingQ(null)} />
        );
      })()}
      {confirmDel && (
        <ConfirmModal
          message={`¿Eliminar la pregunta "${confirmDel.text.slice(0, 60)}${confirmDel.text.length > 60 ? "…" : ""}"?`}
          onConfirm={() => { setQuestions((prev) => prev.filter((x) => x.id !== confirmDel.id)); setConfirmDel(null); }}
          onCancel={() => setConfirmDel(null)} />
      )}
      {confirmBack && (
        <ConfirmModal
          message={"Tienes cambios sin guardar.\n\n¿Quieres descartarlos y continuar?"}
          confirmLabel="Descartar y continuar"
          onConfirm={() => { setConfirmBack(false); onBack(); }}
          onCancel={() => setConfirmBack(false)} />
      )}
    </div>
  );
}
