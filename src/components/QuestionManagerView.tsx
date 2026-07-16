// ═══ QUESTIONMANAGERVIEW (EDICIÓN DE PREGUNTAS) ══════════════════════════════
// Extraída de teacher.jsx (Fase 2, subdivisión).
import { useState, useEffect, useRef, type CSSProperties } from "react";
import type { Exercise, Question } from "../lib/types.js";
import type { Instrumento } from "../lib/calificacion.js";
import { C, S, F, FONT_SANS } from "../theme/tokens.js";
import { uid } from "../lib/ids.js";
import { fmtClock } from "../lib/time.js";
import { startPointerDrag } from "../lib/pointer.js";
import { questionScopeOf } from "../lib/domain.js";
import { useAudioPlayer } from "../hooks/useAudioPlayer.js";
import { ConfirmModal, CircleButton, Menu } from "./primitives.jsx";
import { WaveformDisplay } from "./session.js";
import { QuestionMinimap } from "./QuestionMinimap.js";
import { QuestionEditorModal } from "./modals.js";

// Ítem del menú ⋯ de cada pregunta (mover/duplicar/eliminar).
const MENU_ITEM: CSSProperties = { display: "block", width: "100%", boxSizing: "border-box", textAlign: "left", padding: "8px 10px", borderRadius: 7, border: "none", background: "transparent", cursor: "pointer", fontFamily: FONT_SANS, fontSize: 12.5, color: C.ink2 };

// En el gestor de preguntas cada pregunta tiene fragmento (start/end) definido.
type QuizQuestion = Question & { audioStart: number; audioEnd: number };
// Estado de edición: una pregunta existente o un marcador de "nueva".
type EditingQ = QuizQuestion | { _new: true; defaultStart: number } | null;

interface QuestionManagerViewProps {
  exercise: Exercise;
  onSave: (questions: QuizQuestion[]) => void;
  onBack: () => void;
  // N3.3: biblioteca de plantillas de instrumento del profesor, para las
  // preguntas de desarrollo (se pasa tal cual al editor de pregunta).
  plantillasInstrumento?: Instrumento[];
  onChangePlantillasInstrumento?: (next: Instrumento[]) => void;
}

// ═══ 13. QUESTION MANAGER VIEW (profesor edita preguntas) ═══════════════════
export function QuestionManagerView({ exercise, onSave, onBack, plantillasInstrumento, onChangePlantillasInstrumento }: QuestionManagerViewProps) {
  const dur = exercise.duration as number;
  const [questions,   setQuestions]   = useState<QuizQuestion[]>((exercise.questions ?? []) as QuizQuestion[]);
  const [editingQ,    setEditingQ]    = useState<EditingQ>(null);
  const [confirmDel,  setConfirmDel]  = useState<{ id: string; text: string } | null>(null);
  const [selectedQId, setSelectedQId] = useState<string | null>(null);
  const [confirmBack, setConfirmBack] = useState(false);
  const minimapRef = useRef<HTMLDivElement | null>(null);

  const isDirty = JSON.stringify(questions) !== JSON.stringify(exercise.questions ?? []);
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
  const duplicateQuestion = (q: QuizQuestion) => {
    const shift = 0.5;
    const isObra = questionScopeOf(q) === "obra";
    const dup: QuizQuestion = {
      ...q,
      id: uid("q"),
      // La copia de una pregunta de obra conserva su ámbito (sin tiempos).
      audioStart: isObra ? q.audioStart : Math.min(dur, q.audioStart + shift),
      audioEnd:   isObra ? q.audioEnd   : Math.min(dur, q.audioEnd + shift),
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
      {/* Clic fuera de las tarjetas (y fuera del área de audio) → deselecciona
          la pregunta que estuviera activa (Jon 2026-07-06). Las tarjetas y la
          sección de audio cortan la propagación para conservar su propia lógica. */}
      <div style={S.page} onClick={() => setSelectedQId(null)}>
        <div style={{ ...S.row, justifyContent: "space-between", marginBottom: 18 }}>
          <button onClick={guardedOnBack} style={{ ...S.btn, padding: "6px 14px", fontSize: 13 }}>← Volver</button>
          <div style={{ fontWeight: 600, color: C.ink, fontSize: 15, textAlign: "center", flex: 1 }}>{exercise.title} — Preguntas</div>
          <button onClick={() => onSave(questions)} style={S.btnPrimary}>Guardar</button>
        </div>

        <section onClick={(e) => e.stopPropagation()} style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 18, padding: "14px 14px 12px", marginBottom: 20 }}>
          {hasAudio && !audioReady && !audioError && <div style={{ textAlign: "center", color: C.muted, fontSize: 12, marginBottom: 8 }}>Cargando audio…</div>}
          {audioError && <div style={{ textAlign: "center", color: C.danger, fontSize: 12, marginBottom: 8 }}>{audioError}</div>}

          <div style={{ background: C.paper2, borderRadius: 10, overflow: "hidden", border: `1px solid ${C.line}`, marginBottom: 6 }}>
            {(() => {
              const selQ    = questions.find((q) => q.id === selectedQId);
              // Solo las de fragmento pintan región en la onda; las de obra, no.
              const qRegion = selQ && questionScopeOf(selQ) === "fragmento" ? { start: selQ.audioStart, end: selQ.audioEnd, color: C.quiz } : null;
              return (
                <WaveformDisplay time={time} duration={dur} waveformDuration={audioDuration} allIntervals={[]}
                  exerciseId={exercise.id} waveformData={exercise.waveformData || null}
                  colorByFn={{}} questionRegion={qRegion}
                  onScrubBegin={scrubBegin} onScrubTo={scrubTo} onScrubEnd={scrubEnd} />
              );
            })()}
          </div>

          {/* Minimapa de preguntas (editable — arrastrar mueve, bordes ajustan).
              Las de fragmento van en la línea; las de obra, en la bandeja «Obra»
              bajo ella (M6). La numeración P{n} es la global (orden de la lista). */}
          {(() => {
            const fragmentQs = questions.filter((q) => questionScopeOf(q) === "fragmento");
            const obraQs      = questions.filter((q) => questionScopeOf(q) === "obra");
            const pOf = (id: string) => questions.findIndex((q) => q.id === id) + 1;
            return (
              <QuestionMinimap editable minimapRef={minimapRef} questions={fragmentQs} duration={dur} time={time}
                onBackgroundDown={() => setSelectedQId(null)}
                blockState={(q) => ({ fill: C.quiz, active: selectedQId === q.id })}
                label={(i) => `P${pOf(fragmentQs[i].id)}`}
                onDragBody={(e, q) => beginDragQBody(e, q.id)}
                onDragEdge={(e, q, which) => beginDragQEdge(e, q.id, which)}
                obraQuestions={obraQs}
                onSelectObra={(q) => setSelectedQId(q.id)}
                obraActiveId={selectedQId} />
            );
          })()}

          <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 12 }}>
            <div />
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <CircleButton onClick={() => seekTo(Math.max(0, time - 5))} size={36} fontSize={10}>−5s</CircleButton>
              <CircleButton onClick={togglePlay} disabled={hasAudio && !audioReady && !audioError}
                primary size={42} fontSize={14} title={playing ? "Pausar" : "Reproducir"}>{playing ? "❚❚" : "▶"}</CircleButton>
              <CircleButton onClick={() => seekTo(Math.min(dur, time + 5))} size={36} fontSize={10}>+5s</CircleButton>
            </div>
            <div style={{ textAlign: "right", fontFamily: FONT_SANS, fontVariantNumeric: "tabular-nums", fontSize: 18, fontWeight: 600, color: C.ink }}>
              {fmtClock(time)}<span style={{ color: C.muted2, fontWeight: 400 }}>/{fmtClock(dur)}</span>
            </div>
          </div>
        </section>

        <div style={{ ...S.row, justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
          <h2 style={{ ...S.h2, margin: 0 }}>Preguntas</h2>
          {/* BUG FIX: el original usaba timeRef.current (undefined en este componente).
              Ahora se pasa `time` directamente, que ya está disponible del hook. */}
          <button onClick={() => setEditingQ({ _new: true, defaultStart: time })} style={S.btnPrimary}>
            + Nueva pregunta
          </button>
        </div>

        {questions.length === 0 && (
          <div style={{ ...S.card, textAlign: "center", color: C.muted, padding: "2rem" }}>
            Aún no hay preguntas. Crea la primera con el botón de arriba.
          </div>
        )}

        {questions.map((q, idx) => {
          const isObra = questionScopeOf(q) === "obra";
          const selected = selectedQId === q.id;
          // Seleccionar una pregunta la resalta (onda + minimapa) y, SOLO si tiene
          // fragmento, lleva el reproductor a su inicio; las de obra (sin
          // fragmento) no mueven la reproducción — sin saltos (Jon 2026-07-06).
          const select = () => { setSelectedQId(q.id); if (!isObra) seekTo(q.audioStart); };
          return (
            <div key={q.id} onClick={(e) => e.stopPropagation()}
              style={{ ...S.card, border: `1px solid ${selected ? C.quiz : C.line}`, background: selected ? "rgba(47,111,184,0.04)" : C.paper, transition: "border-color .12s, background .12s" }}>
              <div style={{ ...S.row, justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
                {/* El enunciado es el protagonista (serif grande). Toda esta zona
                    es clicable: selecciona la pregunta y coloca el reproductor. */}
                <div role="button" tabIndex={0} onClick={select}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(); } }}
                  style={{ flex: "1 1 240px", minWidth: 0, cursor: "pointer", display: "flex", gap: 12, alignItems: "baseline" }}>
                  <span style={{ fontFamily: FONT_SANS, fontSize: 11.5, fontWeight: 700, color: selected ? C.quiz : C.chevron, flexShrink: 0 }}>P{idx + 1}</span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontFamily: F.serif, fontSize: 17, fontWeight: 600, color: C.ink, lineHeight: 1.28, marginBottom: q.type === "desarrollo" ? 0 : 8 }}>{q.text}</div>
                    {q.type === "test" && (
                      <div style={{ display: "flex", gap: 16, rowGap: 3, flexWrap: "wrap", fontSize: 12.5 }}>
                        {(q.options ?? []).map((opt) => {
                          const correct = opt.id === q.correctOptionId;
                          return (
                            <span key={opt.id} style={{ color: correct ? C.fnT : C.muted, fontWeight: correct ? 600 : 400 }}>
                              {opt.id}) {opt.text}{correct ? " ✓" : ""}
                            </span>
                          );
                        })}
                      </div>
                    )}
                    {q.type === "corta" && (
                      <div style={{ fontSize: 12, color: C.muted }}>
                        Aceptadas: {(q.accepted ?? []).join(" · ") || "—"}
                      </div>
                    )}
                  </div>
                </div>
                {/* Acciones mínimas: Editar; el resto (mover/duplicar/eliminar)
                    al menú ⋯. El «▶ tiempo» se quitó: seleccionar la tarjeta ya
                    coloca el reproductor (Jon 2026-07-06). */}
                <div style={{ ...S.row, gap: 6, flexShrink: 0 }}>
                  <button onClick={() => setEditingQ(q)} style={{ ...S.btn, fontSize: 12.5 }}>Editar</button>
                  <Menu align="right" ariaLabel="Más acciones" panelStyle={{ minWidth: 170 }}
                    trigger={({ open, toggle, triggerRef }) => (
                      <button ref={triggerRef} onClick={toggle} aria-haspopup="menu" aria-expanded={open} aria-label="Más acciones"
                        style={{ ...S.btn, padding: "6px 10px", fontSize: 15, lineHeight: 1 }}>⋯</button>
                    )}>
                    {({ close }) => [
                      ...(idx > 0 ? [<button key="up" role="menuitem" onClick={() => { close(); moveQuestion(idx, -1); }} style={MENU_ITEM}>Subir</button>] : []),
                      ...(idx < questions.length - 1 ? [<button key="dn" role="menuitem" onClick={() => { close(); moveQuestion(idx, 1); }} style={MENU_ITEM}>Bajar</button>] : []),
                      <button key="dup" role="menuitem" onClick={() => { close(); duplicateQuestion(q); }} style={MENU_ITEM}>Duplicar</button>,
                      <hr key="hr" style={{ border: "none", borderTop: `1px solid ${C.line}`, margin: "4px 6px" }} />,
                      <button key="del" role="menuitem" onClick={() => { close(); setConfirmDel({ id: q.id, text: q.text ?? "" }); }} style={{ ...MENU_ITEM, color: C.danger }}>Eliminar</button>,
                    ]}
                  </Menu>
                </div>
              </div>
            </div>
          );
        })}

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
            plantillasInstrumento={plantillasInstrumento}
            onChangePlantillasInstrumento={onChangePlantillasInstrumento}
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
