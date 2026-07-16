// ═══ QUIZCORRECTION (M3.4) ════════════════════════════════════════════════════
// Corrección del modelo cuestionario (profesor: forma por pregunta + candado de
// región; alumno: respuestas + feedback). Extraída de CorrectionView.tsx sin
// cambio de comportamiento — antes era la rama `result.type === "cuestionario"`.
import { useState, useRef } from "react";
import type { CSSProperties } from "react";
import type { ExerciseResult } from "../../lib/types.js";
import { C, S, F, FONT_SANS } from "../../theme/tokens.js";
import { scoreColor } from "../../lib/color.js";
import { fmtClock } from "../../lib/time.js";
import { questionsSnapshotOf, questionScopeOf, questionsOf } from "../../lib/domain.js";
import { calcQuestionnaireFinal, calcQuestionnaireScore, gradeShort, nota10 } from "../../lib/scoring.js";
import { instrumentoDe, type CalificacionCorreccion } from "../../lib/calificacion.js";
import { useAudioPlayer } from "../../hooks/useAudioPlayer.js";
import { useIsMobile } from "../../hooks/useIsMobile.js";
import { CorrectionAudioBar } from "../primitives.jsx";
import { InstrumentoRespuestas } from "../InstrumentoRespuestas.jsx";
import { normalizeScore100, type CorrectionViewProps } from "./shared.js";
import { FuenteNotaPanel } from "./FuenteNota.js";
import { notaDeFuente, useAutoHideScroll, type FuenteNotaState } from "./notaShared.js";
import { AttemptBanner } from "./AttemptBanner.js";

export function QuizCorrection({ exercise, result, onBack, isTeacherMode = false, backLabel = isTeacherMode ? "← Volver" : "← Mis ejercicios", student = null, onSaveCorrection = null, extraHeaderContent = null, queueLabel = null, onPrev = null, onNext = null }: CorrectionViewProps) {
  const dur = exercise.duration as number;
  const tc  = result.teacherCorrection;
  const [qComments,  setQComments]  = useState<Record<string, string>>(() => tc?.questionComments || {});
  const [quizGlobal, setQuizGlobal] = useState(tc?.globalComment || "");
  const califCorreccion = tc?.calificacion as CalificacionCorreccion | undefined;
  // Comentario por pregunta plegado (Jon, 2026-07-05): el textarea siempre
  // visible en test/corta engordaba cada tarjeta sin aportar hasta que el
  // profesor decide comentar — se abre bajo demanda (o si ya hay comentario).
  const [openComments, setOpenComments] = useState<Set<string>>(
    () => new Set(Object.entries(tc?.questionComments || {}).filter(([, v]) => (v || "").trim()).map(([k]) => k))
  );
  const openComment = (qId: string) => setOpenComments((s) => new Set(s).add(qId));
  // Anclas de las tarjetas de pregunta: el índice lateral hace scroll a ellas.
  const qRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const isMobile = useIsMobile();
  const handleAutoHideScroll = useAutoHideScroll();
  // Audio + candado de región (M3.3): el bucle de «▶ Fragmento» por pregunta.
  const loopRegionRef = useRef<{ audioStart: number; audioEnd: number } | null>(null);
  const { time, timeRef: audioTimeRef, playing, audioReady, hasAudio, togglePlay, seekTo, playFrom } = useAudioPlayer(exercise, { loopRegionRef });
  const [activeFragmentQId, setActiveFragmentQId] = useState<string | null>(null);
  const playQuestionFragment = (q: { id: string; audioStart?: number; audioEnd?: number; scope?: "fragmento" | "obra" }) => {
    if (activeFragmentQId === q.id && playing) { togglePlay(); return; }
    if (!audioReady) return;   // sin audio decodado aún: no marcar fragmento en falso
    // M6: una pregunta de obra se escucha entera desde 0, sin candado de región.
    if (questionScopeOf(q) === "obra") { loopRegionRef.current = null; setActiveFragmentQId(q.id); playFrom(0); return; }
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

    // ── N4.2: fuente y nota POR PREGUNTA de desarrollo ──────────────────────
    // El total del cuestionario ya no se teclea: sale de calcQuestionnaireFinal
    // (un solo pool por points con test + corta legada + desarrollo). Cada
    // desarrollo se califica con su propia fuente (instrumento adjunto, N3.3,
    // o nota directa); una corrección guardada se repone desde porPregunta.
    // El instrumento de una pregunta: el de la VIGENTE si sigue existiendo
    // (el profesor pudo adjuntarlo después de la entrega; la instantánea no lo
    // tendría), con la instantánea como respaldo si la pregunta se borró.
    const vigentes = questionsOf(exercise);
    const instrumentoDeQ = (q: { id: string }) => instrumentoDe(vigentes.find((x) => x.id === q.id) ?? questions.find((x) => x.id === q.id));
    const [fuentesDev, setFuentesDev] = useState<Record<string, FuenteNotaState>>(() =>
      Object.fromEntries(devQs.map((q) => {
        const pp = califCorreccion?.porPregunta?.[q.id];
        const fuente: FuenteNotaState["fuente"] = pp?.fuente ?? (instrumentoDeQ(q) ? "instrumento" : "directa");
        return [q.id, {
          fuente,
          directa: pp?.fuente === "directa" && pp.nota != null ? (nota10(pp.nota) ?? "") : "",
          respuestas: pp?.instrumento?.respuestas ?? {},
        }];
      })),
    );
    const setFuenteDev = (qId: string, next: FuenteNotaState) => setFuentesDev((prev) => ({ ...prev, [qId]: next }));
    const notasManuales = Object.fromEntries(devQs.map((q) => {
      const st = fuentesDev[q.id];
      return [q.id, st ? notaDeFuente(st, null, instrumentoDeQ(q)) : null];
    }));
    const final = calcQuestionnaireFinal(questions, result.answers, notasManuales);
    // La PRELIMINAR de referencia se recalcula en puro (test + corta sobre la
    // instantánea) en vez de leer result.score: tras guardar, score pasa a ser
    // la FINAL (saveCorrection la sustituye) y el rótulo «automática» mentiría
    // (regla de oro 3: la preliminar nunca se pierde — aquí, recomputándola).
    const preliminarQuiz = calcQuestionnaireScore(questions, result.answers);
    // ¿Es correcta la respuesta a UNA pregunta autocorregible (test o corta)?
    // null = no autocorregible (desarrollo, o "corta" sin aceptadas configuradas).
    const isQGraded = (q: (typeof questions)[number], ans: string | undefined): boolean | null => {
      if (q.type === "test") return ans === q.correctOptionId;
      if (q.type === "corta" && q.accepted?.length) return gradeShort(ans, q.accepted);
      return null;
    };

    // Cerrar exige todas las de desarrollo con nota (N4.2): mientras falte
    // alguna, el intento sigue "pendiente" con la preliminar visible — no se
    // guarda un corregido a medias. Sin desarrollo, siempre se puede cerrar
    // (la final es exactamente la preliminar: mismo pool, mismos pesos).
    const puedeCerrar = final.pendientes === 0;
    const handleSaveQuiz = () => {
      if (!puedeCerrar) return;
      const correction = {
        corrected: true,
        questionComments: qComments,
        globalComment: quizGlobal,
        totalScore: final.nota,
        calificacion: {
          // La fuente del TOTAL es el pool automático (las fuentes elegidas
          // viven en porPregunta); nota 0-100 exacta, sin heurística ≤10.
          fuente: "auto",
          nota: final.nota,
          porPregunta: Object.fromEntries(devQs.map((q) => {
            const st = fuentesDev[q.id];
            const n = notasManuales[q.id] ?? null;
            const fuenteQ = st?.fuente === "instrumento" ? "instrumento" as const : "directa" as const;
            return [q.id, { fuente: fuenteQ, nota: n, ...(fuenteQ === "instrumento" && st ? { instrumento: { respuestas: st.respuestas, nota: n } } : {}) }];
          })),
        } satisfies CalificacionCorreccion,
      };
      onSaveCorrection?.(student?.id, exercise.id, correction);
    };

    // ── Veredicto por pregunta (Jon, 2026-07-06: MISMO lenguaje visual para
    // profesor y alumno) ─────────────────────────────────────────────────────
    // Compartido por las dos ramas: el índice lateral, el chip de cabecera y el
    // resaltado de opciones usan el mismo símbolo+color en ambos modos.
    type Veredicto = { symbol: string; word: string; color: string; bg: string };
    const veredictoDe = (q: (typeof questions)[number]): Veredicto => {
      if (q.type === "desarrollo") {
        // N4.2: el veredicto de un desarrollo es su NOTA — para el profesor la
        // del panel en vivo; para el alumno la guardada en porPregunta.
        const notaDev = isTeacherMode ? notasManuales[q.id] : (califCorreccion?.porPregunta?.[q.id]?.nota ?? null);
        const word = notaDev != null
          ? (isTeacherMode ? "Calificada" : "Corregida")
          : (isTeacherMode ? "Sin nota" : (qComments[q.id]?.trim() ? "Comentada" : "Pendiente de revisión"));
        return { symbol: "✎", word, color: C.quiz, bg: "rgba(47,111,184,0.08)" };
      }
      const ans = result.answers?.[q.id];
      if (!ans) return { symbol: "—", word: "Sin respuesta", color: C.muted, bg: C.paper2 };
      return isQGraded(q, ans)
        ? { symbol: "✓", word: "Correcta", color: C.fnT, bg: "rgba(63,155,91,0.09)" }
        : { symbol: "✗", word: "Incorrecta", color: C.danger, bg: "rgba(184,74,58,0.08)" };
    };
    const alumnoNombre = (student?.displayName || student?.name || "el alumno") as string;
    const alumnoCorto  = alumnoNombre.split(" ")[0];
    // Etiqueta de autoría sobre la opción/respuesta elegida: en modo profesor
    // identifica al alumno; en modo alumno es simplemente «TU» — la ÚNICA marca
    // de autoría, la corrección la dan el ✓/✗ y el color de la fila.
    const tagAlumno = (colr: string) => (
      <span style={{ flexShrink: 0, fontFamily: FONT_SANS, fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: colr, border: `1px solid ${colr}55`, borderRadius: 999, padding: "2px 8px" }}>
        {isTeacherMode ? alumnoCorto : "TU"}
      </span>
    );

    if (isTeacherMode) {
      // ── Rediseño de la corrección (Jon, 2026-07-05) ─────────────────────────
      // Dos columnas como el detalle de curso: índice lateral fijo (preguntas
      // con su veredicto + bloque de nota + guardar, siempre a la vista) y a la
      // derecha las preguntas en una sola columna de lectura. El veredicto se
      // comunica con símbolo+color en el borde y el índice — sin chips
      // «Correcta/Incorrecta/Resp. alumno» repetidos por tarjeta.

      const comentarioBloque = (qId: string, siempre = false) => (
        (siempre || openComments.has(qId)) ? (
          <textarea
            value={qComments[qId] || ""}
            onChange={(e) => setQComments((prev) => ({ ...prev, [qId]: e.target.value }))}
            placeholder="Escribe un comentario para esta respuesta…"
            rows={2} autoFocus={!siempre}
            style={{ width: "100%", fontFamily: FONT_SANS, fontSize: 13, background: C.field, border: `1px solid ${C.line}`, borderRadius: 8, padding: "9px 12px", color: C.ink, resize: "vertical", boxSizing: "border-box", marginTop: 10 }}
          />
        ) : (
          <button onClick={() => openComment(qId)} className="fa-pressable"
            style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: FONT_SANS, fontSize: 12, color: C.muted, textDecoration: "underline", textUnderlineOffset: 2, marginTop: 10 }}>
            + Comentario
          </button>
        )
      );

      // Layout de escritorio (Jon, 2026-07-05): la página no scrollea; el panel
      // izquierdo queda FIJO y solo la columna de preguntas tiene su propio
      // scroll. En móvil se conserva el scroll normal de página (columnas
      // apiladas). `minHeight:0` en el track de la rejilla permite que los hijos
      // con overflow scrolleen dentro de la altura de viewport.
      const split = !isMobile;
      const pageStyle: CSSProperties = split
        ? { maxWidth: 980, margin: "0 auto", padding: "22px 24px 0", height: "100vh", boxSizing: "border-box", display: "flex", flexDirection: "column" }
        : S.page;
      const gridStyle: CSSProperties = split
        ? { display: "grid", gridTemplateColumns: "248px minmax(0, 1fr)", gridTemplateRows: "minmax(0, 1fr)", gap: 18, flex: 1, minHeight: 0 }
        : { display: "grid", gridTemplateColumns: "1fr", gap: 18, alignItems: "start" };
      const asideStyle: CSSProperties = split
        ? { overflowY: "auto", minHeight: 0, paddingRight: 2, paddingBottom: 8 }
        : {};
      const rightColStyle: CSSProperties = split
        ? { minWidth: 0, overflowY: "auto", minHeight: 0, paddingRight: 6, paddingBottom: 24 }
        : { minWidth: 0 };

      return (
        <div style={S.app}>
          <div style={pageStyle}>
           <div style={split ? { flexShrink: 0 } : undefined}>
            {/* Fila superior: volver (izq) + navegación de cola (der) */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
              <button onClick={onBack} style={{ ...S.btn, fontSize: 12, padding: "6px 12px" }}>{backLabel}</button>
              <span style={{ flex: 1 }} />
              {(queueLabel || onPrev || onNext) && (
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <button onClick={() => onPrev?.()} disabled={!onPrev} style={{ ...S.btn, fontSize: 12, padding: "5px 12px", opacity: onPrev ? 1 : 0.4, cursor: onPrev ? "pointer" : "default" }}>‹ Anterior</button>
                  {queueLabel && <span style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>{queueLabel}</span>}
                  <button onClick={() => onNext?.()} disabled={!onNext} style={{ ...S.btn, fontSize: 12, padding: "5px 12px", opacity: onNext ? 1 : 0.4, cursor: onNext ? "pointer" : "default" }}>Siguiente ›</button>
                </div>
              )}
            </div>
            {/* El nombre del alumno LIDERA el subtítulo (Jon, 2026-07-06),
                igual que en la corrección de esquema. */}
            <h1 style={{ ...S.h1, marginBottom: 4 }}>{exercise.title}</h1>
            <p style={{ fontSize: 13, color: C.muted, margin: "0 0 20px" }}>
              <strong style={{ color: C.ink2, fontSize: 14 }}>{alumnoNombre}</strong> · corrección de la entrega
            </p>
            {extraHeaderContent}
            <AttemptBanner result={result} />
           </div>

            {/* Dos columnas: índice/nota FIJOS (izq) + preguntas con scroll propio */}
            <div style={gridStyle}>

              {/* ── Índice lateral (fijo; scrollea solo si no cabe) ── */}
              <aside style={asideStyle} className="fa-autohide-scroll" onScroll={handleAutoHideScroll}>
                {/* Bloque de nota (N4.2): la FINAL calculada en vivo con el pool
                    único (test + corta legada + desarrollo con nota manual).
                    La preliminar automática queda debajo como referencia
                    (regla de oro 3); las de desarrollo se califican en su
                    propia tarjeta, no aquí. */}
                <div style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 14, padding: "14px 16px", marginBottom: 14 }}>
                  <div style={{ fontFamily: FONT_SANS, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase", color: C.muted, marginBottom: 4 }}>Nota final</div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 3 }}>
                    <span style={{ fontSize: 42, fontWeight: 800, color: final.nota != null ? scoreColor(final.nota) : C.muted, lineHeight: 1, fontVariantNumeric: "tabular-nums", fontFamily: FONT_SANS }}>
                      {nota10(final.nota) ?? "—"}
                    </span>
                    <span style={{ fontSize: 16, fontWeight: 700, color: C.muted2 }}>/10</span>
                  </div>
                  <div style={{ fontSize: 10.5, color: C.muted, marginTop: 6, lineHeight: 1.5 }}>
                    {preliminarQuiz != null && <>Automática (test y corta): <strong style={{ color: C.ink2, fontVariantNumeric: "tabular-nums" }}>{nota10(preliminarQuiz)}</strong></>}
                    {final.pendientes > 0 && (
                      <span style={{ display: "block", color: C.fnD, fontWeight: 600 }}>
                        ✎ {final.pendientes} de desarrollo sin nota
                      </span>
                    )}
                  </div>
                </div>

                {/* Índice de preguntas: veredicto + número + inicio del texto.
                    Clic → scroll a la tarjeta. Símbolo SIEMPRE junto al color
                    (regla 9 del proyecto, daltonismo). SOLO en escritorio (Jon,
                    2026-07-06): en móvil las preguntas están apiladas justo
                    debajo (sin scroll propio de columna), así que el índice
                    duplica lo que ya se ve al seguir bajando — puro ruido. */}
                {split && (
                  <>
                    <div style={{ fontFamily: FONT_SANS, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase", color: C.muted, padding: "2px 2px 8px" }}>Preguntas</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
                      {questions.map((q, i) => {
                        const v = veredictoDe(q);
                        return (
                          // Sin la palabra del veredicto (Jon, 2026-07-05): el círculo
                          // ✓/✗/✎/— ya lo dice; `title` la conserva para hover/lector.
                          <button key={q.id} onClick={() => qRefs.current[q.id]?.scrollIntoView({ behavior: "smooth", block: "start" })}
                            title={`P${i + 1} · ${v.word}`}
                            style={{ font: "inherit", display: "flex", alignItems: "center", gap: 9, width: "100%", boxSizing: "border-box", textAlign: "left", background: C.paper, border: `1px solid ${C.line}`, borderRadius: 10, padding: "8px 10px", cursor: "pointer" }}>
                            <span style={{ flex: 1, minWidth: 0 }}>
                              <span style={{ display: "block", fontFamily: FONT_SANS, fontSize: 12, fontWeight: 700, color: C.ink }}>P{i + 1}</span>
                              <span style={{ display: "block", fontFamily: FONT_SANS, fontSize: 11, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{q.text}</span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}

                {/* Comentario global + guardar: el cierre de la corrección vive
                    junto a la nota, siempre a mano. */}
                <textarea
                  value={quizGlobal}
                  onChange={(e) => setQuizGlobal(e.target.value)}
                  placeholder="Comentario global para el alumno…"
                  rows={3}
                  style={{ width: "100%", boxSizing: "border-box", fontFamily: FONT_SANS, fontSize: 12.5, background: C.paper, border: `1px solid ${C.line}`, borderRadius: 10, padding: "9px 11px", color: C.ink, resize: "vertical", marginBottom: 8 }}
                />
                <button onClick={handleSaveQuiz} disabled={!puedeCerrar} title={puedeCerrar ? undefined : "Faltan preguntas de desarrollo por calificar"}
                  style={{ ...S.btnPrimary, width: "100%", padding: 12, borderRadius: 10, fontSize: 13, marginBottom: 6, opacity: puedeCerrar ? 1 : 0.5, cursor: puedeCerrar ? "pointer" : "default" }}>
                  {tc?.corrected ? "Actualizar corrección" : "Guardar corrección"}
                </button>
                {onNext && (
                  <button onClick={() => { if (!puedeCerrar) return; handleSaveQuiz(); onNext(); }} disabled={!puedeCerrar}
                    style={{ ...S.btnPrimary, width: "100%", padding: 12, borderRadius: 10, fontSize: 13, background: C.fnT, borderColor: C.fnT, opacity: puedeCerrar ? 1 : 0.5, cursor: puedeCerrar ? "pointer" : "default" }}>
                    Guardar y siguiente
                  </button>
                )}
              </aside>

              {/* ── Columna de preguntas (scroll propio en escritorio) ── */}
              <div style={rightColStyle} className="fa-autohide-scroll" onScroll={handleAutoHideScroll}>
                {/* Barra de audio compartida + candado de región (M3.3) */}
                {hasAudio && (
                  <div style={{ marginBottom: 16 }}>
                    <CorrectionAudioBar time={time} timeRef={audioTimeRef} duration={dur} playing={playing} audioReady={audioReady}
                      togglePlay={togglePlay} onSeek={(e) => { const r = e.currentTarget.getBoundingClientRect(); releaseFragment(); seekTo(((e.clientX - r.left) / r.width) * dur); }} />
                    {activeFragmentQId && (() => {
                      const aq   = questions.find((q) => q.id === activeFragmentQId);
                      const aIdx = questions.findIndex((q) => q.id === activeFragmentQId);
                      const isObra = !!aq && questionScopeOf(aq) === "obra";
                      return (
                        <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center", fontSize: 12, color: C.quiz, marginTop: 8, flexWrap: "wrap" }}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, background: `${C.quiz}12`, borderRadius: 999, padding: "4px 12px", fontWeight: 600 }}>
                            {isObra ? `📖 Obra completa · P${aIdx + 1}` : `🔒 Fragmento P${aIdx + 1} · bucle`}
                          </span>
                          <button onClick={releaseFragment} className="fa-pressable" style={{ ...S.btn, padding: "4px 12px", fontSize: 11 }}>Liberar</button>
                        </div>
                      );
                    })()}
                  </div>
                )}

                <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
                  {questions.map((q, idx) => {
                    const studentAnswer = result.answers?.[q.id];
                    const v = veredictoDe(q);
                    return (
                      // El encabezado «Pregunta N · veredicto» va FUERA de la
                      // tarjeta (como los títulos de sección de audio/unidades);
                      // la tarjeta ya no lleva canto de color a la izquierda.
                      <div key={q.id} ref={(el) => { qRefs.current[q.id] = el; }} style={{ scrollMarginTop: 8 }}>
                        {/* Jerarquía en tres niveles (Jon, 2026-07-06):
                            (1) «PREGUNTA N» = etiqueta pequeña, sans, en
                            mayúsculas y apagada (locator, no protagonista);
                            (2) el enunciado domina — serif grande en tinta;
                            (3) las respuestas, sans, claramente subordinadas.
                            La insignia de veredicto (símbolo+color) va junto a
                            la etiqueta. */}
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, padding: "0 2px" }}>
                          {/* Chip NEUTRO (Jon, 2026-07-06): «Pregunta N» primero en
                              tinta, y el veredicto DESPUÉS como insignia de color
                              — el chip no se tiñe, así el color queda solo en el
                              punto de estado, no en todo el bloque. */}
                          <span title={v.word} style={{ display: "inline-flex", alignItems: "center", padding: "4px 12px", borderRadius: 999, background: C.paper2, border: `1px solid ${C.line}` }}>
                            <span style={{ fontFamily: FONT_SANS, fontSize: 12.5, fontWeight: 700, color: C.ink, letterSpacing: "0.01em" }}>Pregunta {idx + 1}</span>
                          </span>
                          <span style={{ flex: 1 }} />
                          {hasAudio && (
                            <button onClick={() => playQuestionFragment(q)} className="fa-pressable"
                              style={{ ...S.badge, background: activeFragmentQId === q.id && playing ? C.quiz : "transparent", color: activeFragmentQId === q.id && playing ? "#fff" : C.quiz, border: `1px solid ${C.quiz}55`, cursor: "pointer", fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
                              {questionScopeOf(q) === "obra"
                                ? (activeFragmentQId === q.id && playing ? "❚❚ Obra completa" : "▸ Obra completa")
                                : (activeFragmentQId === q.id && playing ? `❚❚ ${fmtClock(q.audioStart ?? 0)}–${fmtClock(q.audioEnd ?? 0)}` : `▶ ${fmtClock(q.audioStart ?? 0)}–${fmtClock(q.audioEnd ?? 0)}`)}
                            </button>
                          )}
                        </div>
                        <div style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 12, padding: "18px 20px" }}>
                        <div style={{ fontFamily: F.serif, fontSize: 22, fontWeight: 600, color: C.ink, lineHeight: 1.22, marginBottom: 16 }}>{q.text}</div>

                        {q.type === "test" && (
                          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                            {(q.options ?? []).map((opt) => {
                              const isPick       = opt.id === studentAnswer;
                              const isCorrectOpt = opt.id === q.correctOptionId;
                              const destacada    = isCorrectOpt || isPick;
                              const colOpt       = isCorrectOpt ? C.fnT : C.danger;
                              return (
                                // Opciones: solo la correcta y la elegida hablan
                                // (símbolo delante + tinta); el resto se apaga.
                                <div key={opt.id} style={{
                                  display: "flex", alignItems: "center", gap: 9,
                                  padding: destacada ? "8px 12px" : "5px 12px", borderRadius: 8,
                                  background: isCorrectOpt ? "rgba(63,155,91,0.09)" : isPick ? "rgba(184,74,58,0.08)" : "transparent",
                                  border: destacada ? `1px solid ${colOpt}44` : "1px solid transparent",
                                }}>
                                  <span aria-hidden="true" style={{ width: 16, textAlign: "center", fontSize: 13, fontWeight: 800, color: destacada ? colOpt : "transparent", flexShrink: 0 }}>
                                    {isCorrectOpt ? "✓" : isPick ? "✗" : "·"}
                                  </span>
                                  <span style={{ fontFamily: FONT_SANS, fontWeight: 700, fontSize: 11.5, color: destacada ? colOpt : C.muted2, flexShrink: 0 }}>{opt.id}</span>
                                  <span style={{ flex: 1, minWidth: 0, fontSize: destacada ? 13.5 : 12.5, fontWeight: destacada ? 600 : 400, color: destacada ? C.ink : C.muted }}>{opt.text}</span>
                                  {isPick && tagAlumno(colOpt)}
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {q.type === "corta" && (
                          <div>
                            {/* Respuesta como cita con canto del color del veredicto; el
                                canto de color va reforzado por glifo+palabra (A5-01): el
                                veredicto no puede depender solo del color. */}
                            <div style={{ display: "flex", alignItems: "center", gap: 9, borderLeft: `3px solid ${v.color}`, background: C.paper2, borderRadius: "0 8px 8px 0", padding: "9px 12px" }}>
                              <span aria-hidden="true" style={{ fontSize: 15, fontWeight: 800, color: v.color, flexShrink: 0 }}>{v.symbol}</span>
                              <span style={{ fontFamily: FONT_SANS, fontSize: 10, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: v.color, flexShrink: 0 }}>{v.word}</span>
                              <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, color: studentAnswer ? C.ink : C.muted2, fontStyle: studentAnswer ? "normal" : "italic" }}>
                                {studentAnswer || "Sin respuesta"}
                              </span>
                              {studentAnswer && tagAlumno(v.color)}
                            </div>
                            <div style={{ fontSize: 11.5, color: C.muted, marginTop: 6 }}>Se aceptaba: {(q.accepted ?? []).join(" · ") || "—"}</div>
                          </div>
                        )}

                        {q.type === "desarrollo" && (
                          <div>
                            <div style={{ display: "flex", alignItems: "center", gap: 9, borderLeft: `3px solid ${v.color}`, background: C.paper2, borderRadius: "0 8px 8px 0", padding: "9px 12px" }}>
                              <span style={{ flex: 1, minWidth: 0, fontSize: 14, color: studentAnswer ? C.ink : C.muted2, whiteSpace: "pre-wrap", lineHeight: 1.5, fontStyle: studentAnswer ? "normal" : "italic" }}>
                                {studentAnswer || "Sin respuesta"}
                              </span>
                              {studentAnswer && tagAlumno(v.color)}
                            </div>
                            {/* N4.2: la nota de ESTA pregunta, con su fuente
                                (instrumento adjunto o directa) — entra en el
                                pool de la nota final ponderada por sus puntos. */}
                            {fuentesDev[q.id] && (
                              <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.line}` }}>
                                <div style={{ fontFamily: FONT_SANS, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase", color: C.muted, marginBottom: 6 }}>
                                  Nota de esta pregunta · {q.points ?? 1} {(q.points ?? 1) === 1 ? "punto" : "puntos"}
                                </div>
                                <FuenteNotaPanel state={fuentesDev[q.id]} onChange={(next) => setFuenteDev(q.id, next)}
                                  preliminar={null} conAuto={false} instrumento={instrumentoDeQ(q)} />
                              </div>
                            )}
                          </div>
                        )}

                        {/* Guía de corrección (la explicación que escribiste al
                            crear la pregunta): referencia discreta, no un cartel. */}
                        {q.explanation && (
                          <div style={{ fontSize: 12, color: C.muted, fontStyle: "italic", marginTop: 10 }}>
                            Guía: {q.explanation}
                          </div>
                        )}

                        {comentarioBloque(q.id, q.type === "desarrollo")}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    // ── Vista del alumno (Jon, 2026-07-06: MISMO lenguaje visual que el
    // profesor) ──────────────────────────────────────────────────────────────
    // Mismo esqueleto de dos columnas: panel de nota + índice de preguntas
    // FIJO a la izquierda (sin controles de edición: nota estática, sin
    // textareas ni botones de guardar) y las preguntas de lectura a la
    // derecha, con el mismo veredicto símbolo+color y resaltado de opciones.
    const split = !isMobile;
    const pageStyle: CSSProperties = split
      ? { maxWidth: 980, margin: "0 auto", padding: "22px 24px 0", height: "100vh", boxSizing: "border-box", display: "flex", flexDirection: "column" }
      : S.page;
    const gridStyle: CSSProperties = split
      ? { display: "grid", gridTemplateColumns: "248px minmax(0, 1fr)", gridTemplateRows: "minmax(0, 1fr)", gap: 18, flex: 1, minHeight: 0 }
      : { display: "grid", gridTemplateColumns: "1fr", gap: 18, alignItems: "start" };
    const asideStyle: CSSProperties = split
      ? { overflowY: "auto", minHeight: 0, paddingRight: 2, paddingBottom: 8 }
      : {};
    const rightColStyle: CSSProperties = split
      ? { minWidth: 0, overflowY: "auto", minHeight: 0, paddingRight: 6, paddingBottom: 24 }
      : { minWidth: 0 };
    const eyebrow: CSSProperties = { fontFamily: FONT_SANS, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase", color: C.muted, marginBottom: 4 };

    return (
      <div style={S.app}>
        <div style={pageStyle}>
         <div style={split ? { flexShrink: 0 } : undefined}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
            <button onClick={onBack} style={{ ...S.btn, fontSize: 12, padding: "6px 12px" }}>{backLabel}</button>
          </div>
          <h1 style={{ ...S.h1, marginBottom: 4 }}>{exercise.title}</h1>
          <p style={{ fontSize: 13, color: C.muted, margin: "0 0 20px" }}>Corrección de tu entrega</p>
          {extraHeaderContent}
          <AttemptBanner result={result} />
         </div>

          <div style={gridStyle}>

            {/* ── Panel lateral (fijo; nota de solo lectura + índice) ── */}
            <aside style={asideStyle} className="fa-autohide-scroll" onScroll={handleAutoHideScroll}>
              <div style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 14, padding: "14px 16px", marginBottom: 14 }}>
                <div style={eyebrow}>Nota</div>
                {tc?.corrected && (califCorreccion?.nota != null || tc?.totalScore != null) ? (() => {
                  // N4.2: el sobre trae la nota 0-100 exacta; el totalScore
                  // legado pasa por el umbral tolerante de siempre.
                  const pct100 = califCorreccion?.nota ?? normalizeScore100(tc.totalScore);
                  return (
                    <>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 3 }}>
                        <span style={{ fontSize: 42, fontWeight: 800, color: scoreColor(pct100), lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{nota10(pct100)}</span>
                        <span style={{ fontSize: 16, fontWeight: 700, color: C.muted2 }}>/10</span>
                      </div>
                      <div style={{ fontSize: 10.5, color: C.muted, marginTop: 6, lineHeight: 1.5 }}>Corregido por el profesor{preliminarQuiz != null && ` · automática: ${nota10(preliminarQuiz)}`}</div>
                    </>
                  );
                })() : sc != null ? (
                  <>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 3 }}>
                      <span style={{ fontSize: 42, fontWeight: 800, color: col, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{nota10(sc)}</span>
                      <span style={{ fontSize: 16, fontWeight: 700, color: C.muted2 }}>/10</span>
                    </div>
                    <div style={{ fontSize: 10.5, color: C.muted, marginTop: 6, lineHeight: 1.5 }}>
                      Automática · {correctN} de {gradableQs} {gradableQs === 1 ? "autocorregible" : "autocorregibles"}
                      {devQs.length > 0 && ` · ${devQs.length} de desarrollo pendiente${devQs.length === 1 ? "" : "s"}`}
                    </div>
                  </>
                ) : (
                  <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.5 }}>
                    {devQs.length > 0
                      ? "Enviadas al profesor para revisión."
                      : "Sin puntuación automática."}
                  </div>
                )}
              </div>

              {/* Índice de preguntas SOLO en escritorio (Jon, 2026-07-06): en
                  móvil las preguntas están apiladas justo debajo, así que el
                  índice duplica lo que ya se ve al seguir bajando. */}
              {split && (
                <>
                  <div style={eyebrow}>Preguntas</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
                    {questions.map((q, i) => {
                      const v = veredictoDe(q);
                      return (
                        <button key={q.id} onClick={() => qRefs.current[q.id]?.scrollIntoView({ behavior: "smooth", block: "start" })}
                          title={`P${i + 1} · ${v.word}`}
                          style={{ font: "inherit", display: "flex", alignItems: "center", gap: 9, width: "100%", boxSizing: "border-box", textAlign: "left", background: C.paper, border: `1px solid ${C.line}`, borderRadius: 10, padding: "8px 10px", cursor: "pointer" }}>
                          <span style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ display: "block", fontFamily: FONT_SANS, fontSize: 12, fontWeight: 700, color: C.ink }}>P{i + 1}</span>
                            <span style={{ display: "block", fontFamily: FONT_SANS, fontSize: 11, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{q.text}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}

              {tc?.corrected && tc?.globalComment && (
                <div style={{ background: "rgba(47,111,184,0.06)", border: `1px solid ${C.quiz}55`, borderRadius: 10, padding: "10px 12px" }}>
                  <div style={{ fontSize: 11, color: C.quiz, fontWeight: 700, marginBottom: 4 }}>Comentario del profesor</div>
                  <div style={{ fontSize: 12.5, color: C.ink, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{tc.globalComment}</div>
                </div>
              )}
            </aside>

            {/* ── Columna de preguntas (scroll propio en escritorio) ── */}
            <div style={rightColStyle} className="fa-autohide-scroll" onScroll={handleAutoHideScroll}>
              {hasAudio && (
                <div style={{ marginBottom: 16 }}>
                  <CorrectionAudioBar time={time} timeRef={audioTimeRef} duration={dur} playing={playing} audioReady={audioReady}
                    togglePlay={togglePlay} onSeek={(e) => { const r = e.currentTarget.getBoundingClientRect(); releaseFragment(); seekTo(((e.clientX - r.left) / r.width) * dur); }} />
                  {activeFragmentQId && (() => {
                    const aq   = questions.find((q) => q.id === activeFragmentQId);
                    const aIdx = questions.findIndex((q) => q.id === activeFragmentQId);
                    const isObra = !!aq && questionScopeOf(aq) === "obra";
                    return (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center", fontSize: 12, color: C.quiz, marginTop: 8, flexWrap: "wrap" }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, background: `${C.quiz}12`, borderRadius: 999, padding: "4px 12px", fontWeight: 600 }}>
                          {isObra ? `📖 Obra completa · P${aIdx + 1}` : `🔒 Fragmento P${aIdx + 1} · bucle`}
                        </span>
                        <button onClick={releaseFragment} className="fa-pressable" style={{ ...S.btn, padding: "4px 12px", fontSize: 11 }}>Liberar</button>
                      </div>
                    );
                  })()}
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
                {questions.map((q, idx) => {
                  const studentAnswer = result.answers?.[q.id];
                  const v = veredictoDe(q);
                  const teacherComment = tc?.corrected ? tc?.questionComments?.[q.id] : null;
                  return (
                    <div key={q.id} ref={(el) => { qRefs.current[q.id] = el; }} style={{ scrollMarginTop: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, padding: "0 2px" }}>
                        <span title={v.word} style={{ display: "inline-flex", alignItems: "center", padding: "4px 12px", borderRadius: 999, background: C.paper2, border: `1px solid ${C.line}` }}>
                          <span style={{ fontFamily: FONT_SANS, fontSize: 12.5, fontWeight: 700, color: C.ink, letterSpacing: "0.01em" }}>Pregunta {idx + 1}</span>
                        </span>
                        <span style={{ flex: 1 }} />
                        {hasAudio && (
                          <button onClick={() => playQuestionFragment(q)} className="fa-pressable"
                            style={{ ...S.badge, background: activeFragmentQId === q.id && playing ? C.quiz : "transparent", color: activeFragmentQId === q.id && playing ? "#fff" : C.quiz, border: `1px solid ${C.quiz}55`, cursor: "pointer", fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
                            {questionScopeOf(q) === "obra"
                              ? (activeFragmentQId === q.id && playing ? "❚❚ Obra completa" : "▸ Obra completa")
                              : (activeFragmentQId === q.id && playing ? `❚❚ ${fmtClock(q.audioStart ?? 0)}–${fmtClock(q.audioEnd ?? 0)}` : `▶ ${fmtClock(q.audioStart ?? 0)}–${fmtClock(q.audioEnd ?? 0)}`)}
                          </button>
                        )}
                      </div>
                      <div style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 12, padding: "18px 20px" }}>
                      <div style={{ fontFamily: F.serif, fontSize: 22, fontWeight: 600, color: C.ink, lineHeight: 1.22, marginBottom: 16 }}>{q.text}</div>

                      {q.type === "test" && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                          {(q.options ?? []).map((opt) => {
                            const isPick       = opt.id === studentAnswer;
                            const isCorrectOpt = opt.id === q.correctOptionId;
                            const destacada    = isCorrectOpt || isPick;
                            const colOpt       = isCorrectOpt ? C.fnT : C.danger;
                            return (
                              <div key={opt.id} style={{
                                display: "flex", alignItems: "center", gap: 9,
                                padding: destacada ? "8px 12px" : "5px 12px", borderRadius: 8,
                                background: isCorrectOpt ? "rgba(63,155,91,0.09)" : isPick ? "rgba(184,74,58,0.08)" : "transparent",
                                border: destacada ? `1px solid ${colOpt}44` : "1px solid transparent",
                              }}>
                                <span aria-hidden="true" style={{ width: 16, textAlign: "center", fontSize: 13, fontWeight: 800, color: destacada ? colOpt : "transparent", flexShrink: 0 }}>
                                  {isCorrectOpt ? "✓" : isPick ? "✗" : "·"}
                                </span>
                                <span style={{ fontFamily: FONT_SANS, fontWeight: 700, fontSize: 11.5, color: destacada ? colOpt : C.muted2, flexShrink: 0 }}>{opt.id}</span>
                                <span style={{ flex: 1, minWidth: 0, fontSize: destacada ? 13.5 : 12.5, fontWeight: destacada ? 600 : 400, color: destacada ? C.ink : C.muted }}>{opt.text}</span>
                                {isPick && tagAlumno(colOpt)}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {q.type === "corta" && (
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: 9, borderLeft: `3px solid ${v.color}`, background: C.paper2, borderRadius: "0 8px 8px 0", padding: "9px 12px" }}>
                            <span aria-hidden="true" style={{ fontSize: 15, fontWeight: 800, color: v.color, flexShrink: 0 }}>{v.symbol}</span>
                            <span style={{ fontFamily: FONT_SANS, fontSize: 10, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: v.color, flexShrink: 0 }}>{v.word}</span>
                            <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, color: studentAnswer ? C.ink : C.muted2, fontStyle: studentAnswer ? "normal" : "italic" }}>
                              {studentAnswer || "Sin respuesta"}
                            </span>
                            {studentAnswer && tagAlumno(v.color)}
                          </div>
                          <div style={{ fontSize: 11.5, color: C.muted, marginTop: 6 }}>Se aceptaba: {(q.accepted ?? []).join(" · ") || "—"}</div>
                        </div>
                      )}

                      {q.type === "desarrollo" && (
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: 9, borderLeft: `3px solid ${v.color}`, background: C.paper2, borderRadius: "0 8px 8px 0", padding: "9px 12px" }}>
                            <span style={{ flex: 1, minWidth: 0, fontSize: 14, color: studentAnswer ? C.ink : C.muted2, whiteSpace: "pre-wrap", lineHeight: 1.5, fontStyle: studentAnswer ? "normal" : "italic" }}>
                              {studentAnswer || "Sin respuesta"}
                            </span>
                            {studentAnswer && tagAlumno(v.color)}
                          </div>
                          {/* N4.2: la nota de esta pregunta y, si se corrigió
                              con instrumento, el mismo desglose que vio el
                              profesor (rejilla de solo lectura). */}
                          {(() => {
                            const pp = tc?.corrected ? califCorreccion?.porPregunta?.[q.id] : undefined;
                            if (!pp || pp.nota == null) return null;
                            const instr = instrumentoDeQ(q);
                            return (
                              <div style={{ marginTop: 10 }}>
                                <div style={{ fontSize: 12.5, color: C.muted }}>
                                  Nota: <strong style={{ color: scoreColor(pp.nota), fontVariantNumeric: "tabular-nums" }}>{nota10(pp.nota)}</strong>
                                  <span style={{ marginLeft: 6 }}>· {q.points ?? 1} {(q.points ?? 1) === 1 ? "punto" : "puntos"}</span>
                                </div>
                                {pp.instrumento && instr && (
                                  <div style={{ marginTop: 8 }}>
                                    <InstrumentoRespuestas instrumento={instr} respuestas={pp.instrumento.respuestas} />
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      )}

                      {q.explanation && (
                        <div style={{ fontSize: 12, color: C.muted, fontStyle: "italic", marginTop: 10 }}>
                          Guía: {q.explanation}
                        </div>
                      )}

                      {teacherComment ? (
                        <div style={{ marginTop: 10, background: "rgba(47,111,184,0.06)", border: `1px solid ${C.quiz}55`, borderRadius: 8, padding: "10px 12px" }}>
                          <div style={{ fontSize: 11, color: C.quiz, fontWeight: 700, marginBottom: 4 }}>Comentario del profesor</div>
                          <div style={{ fontSize: 13, color: C.ink, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{teacherComment}</div>
                        </div>
                      ) : q.type === "desarrollo" && !(tc?.corrected && califCorreccion?.porPregunta?.[q.id]?.nota != null) && (
                        // N4.2: con la pregunta ya calificada (nota visible
                        // arriba), este aviso legado sobraba — y mentía.
                        <p style={{ fontSize: 11, color: C.muted2, margin: "10px 0 0" }}>Pendiente de revisión por el profesor.</p>
                      )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
}
