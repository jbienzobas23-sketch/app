// ═══ INTERACTIVECORRECTION (M3.4) ═════════════════════════════════════════════
// Revisión del modelo interactivo (corrección AUTOMÁTICA): compara la clave del
// profesor con la respuesta del alumno + diagnóstico. Mismo lenguaje visual que
// las correcciones de cuestionario y esquema (Jon, 2026-07-06): página sin
// scroll, panel izquierdo FIJO con la nota (aquí de solo lectura, porque es
// automática) y el resumen del diagnóstico; columna derecha con scroll propio
// donde vive la comparación ANCHA (clave / alumno) con playhead sincronizado.
import React from "react";
import type { CSSProperties } from "react";
import { C, S, FONT_SANS } from "../../theme/tokens.js";
import { textOn, scoreColor } from "../../lib/color.js";
import { fmtClock } from "../../lib/time.js";
import { answerFor, btnOf } from "../../lib/domain.js";
import { useState } from "react";
import { interactiveDiagnostics, interactiveFigureDiagnostics, nota10 } from "../../lib/scoring.js";
import { instrumentoDe, nivelesDe } from "../../lib/calificacion.js";
import { figureOf } from "../../lib/figures.js";
import { DEFAULT_MARGIN } from "../../lib/sessionConstants.js";
import { useAudioPlayer } from "../../hooks/useAudioPlayer.js";
import { useIsMobile } from "../../hooks/useIsMobile.js";
import { ScoreBadge, SchemaPlayhead, CorrectionAudioBar } from "../primitives.jsx";
import { FigureLabel } from "../session.js";
import { InstrumentoRespuestas } from "../InstrumentoRespuestas.jsx";
import { FuenteNotaPanel } from "./FuenteNota.js";
import { fuenteInicial, notaDeFuente, useAutoHideScroll, type FuenteNotaState } from "./notaShared.js";
import { normalizeScore100, type CorrectionViewProps, type CorrectionIv } from "./shared.js";
import { AttemptBanner } from "./AttemptBanner.js";

export function InteractiveCorrection({ exercise, result, onBack, isTeacherMode = false, backLabel = "← Volver", student = null, onSaveCorrection = null, extraHeaderContent = null, queueLabel = null, onPrev = null, onNext = null }: CorrectionViewProps) {
  const dur = exercise.duration as number;
  const isMobile = useIsMobile();
  const handleAutoHideScroll = useAutoHideScroll();
  const { time, timeRef: audioTimeRef, playing, audioReady, hasAudio, togglePlay, seekTo } = useAudioPlayer(exercise);

  const exCategories     = exercise.categories ?? [];
  const resultCategoryId = result.categoryId ?? result.modeId;
  const exCategory       = (exCategories.find((m) => m.id === resultCategoryId) || exCategories[0]) as { id: string; name?: string; buttons: import("../../lib/types.js").Button[] };
  const teacherAns       = answerFor(exercise, exCategory.id) as CorrectionIv[];
  const studentAns       = result.intervals;
  const sc               = result.score;
  const col              = scoreColor(sc);
  const effMargin        = (exercise.margin as number | undefined) ?? DEFAULT_MARGIN;

  // ── N4.1: fuente de la nota (el interactivo deja de ser solo lectura) ──────
  // La preliminar congelada en la entrega (calificacion.preliminar) es la
  // referencia; en una entrega ya corregida en una sola parte, result.score es
  // la nota FINAL (saveCorrection la sustituyó) — por eso no vale como
  // preliminar. Entregas antiguas sin sobre y sin corregir: sc ES la preliminar.
  const tc        = result.teacherCorrection;
  const sobre     = result.calificacion;
  const corrected = tc?.corrected === true;
  const preliminar = (sobre?.preliminar ?? (corrected ? null : sc)) ?? null;
  const instrumento = instrumentoDe(exercise);
  const puedeCorregir = isTeacherMode && !!onSaveCorrection;
  const [fuente, setFuente] = useState<FuenteNotaState>(
    () => fuenteInicial(tc?.calificacion as Parameters<typeof fuenteInicial>[0], normalizeScore100((tc?.totalScore as number | null | undefined) ?? null)),
  );
  const notaFinalPanel = notaDeFuente(fuente, preliminar, instrumento);
  // Guardar exige una nota: certificar la automática (existente), el
  // instrumento relleno o una directa. Un libre con fuente «automática» no
  // tiene nada que certificar — la fuente docente es la que cierra (N4.3).
  const handleSaveInteractive = () => {
    if (notaFinalPanel == null) return;
    onSaveCorrection?.(student?.id, exercise.id, {
      totalScore: fuente.fuente === "auto" ? null : notaFinalPanel,
      calificacion: {
        fuente: fuente.fuente,
        nota: notaFinalPanel,
        ...(fuente.fuente === "instrumento" ? { instrumento: { respuestas: fuente.respuestas, nota: notaFinalPanel } } : {}),
      },
    });
  };
  // Nota que ve quien NO edita (alumno, o profesor de paso): la final de la
  // corrección si existe; si no, la automática de siempre.
  const notaCorregida = corrected
    ? ((tc?.calificacion as { nota?: number | null } | undefined)?.nota ?? normalizeScore100((tc?.totalScore as number | null | undefined) ?? null) ?? sc ?? null)
    : null;
  // Diagnóstico (T2.4): CÓMO falló el alumno — la nota sigue siendo `sc`.
  // N4.1: gated por CLAVE, no por nota — un libre corregido a mano tiene nota
  // final (sc != null) pero sigue sin clave con la que comparar nada.
  const tieneClave = teacherAns.length > 0;
  const diagnostics = tieneClave ? interactiveDiagnostics(teacherAns, studentAns ?? [], dur, effMargin) : null;
  // Diagnóstico de CIFRADO (Jon, 2026-07-06): en categorías con hasFigures cada
  // intervalo lleva grado (fn) Y cifrado/inversión (fig) — son dos preguntas
  // distintas y hasta ahora la corrección solo evaluaba el grado. `figDiag` es
  // null si la clave no usa cifrado (categoría normal, sin hasFigures).
  const figDiag = tieneClave ? interactiveFigureDiagnostics(teacherAns, studentAns ?? [], dur, effMargin) : null;
  // N2.1: desglose por NIVEL congelado en la entrega (calificacion.niveles) —
  // solo cuando el ejercicio pondera el cifrado. La nota grande ya ES la
  // ponderada (la escribió submitAnswer); aquí se enseña de qué se compone.
  // Entregas antiguas (sin sobre) siguen viendo exactamente lo de siempre.
  const califNiveles = result.calificacion?.niveles;
  const pesosNiveles = nivelesDe(exercise);
  const totalPesosNiveles = (pesosNiveles.grados ?? 0) + (pesosNiveles.cifrado ?? 0);
  const factorDe = (peso: number | undefined) =>
    peso != null && totalPesosNiveles > 0 ? `×${(peso / totalPesosNiveles).toFixed(2).replace(".", ",")}` : null;
  const desgloseNiveles = califNiveles && pesosNiveles.cifrado != null ? califNiveles : null;
  const pct = (t: number) => `${(t / dur) * 100}%`;
  const alumnoNombre = (student?.displayName || student?.name || "el alumno") as string;
  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    seekTo(((e.clientX - rect.left) / rect.width) * dur);
  };

  const split = !isMobile;
  const pageStyle: CSSProperties = split
    ? { maxWidth: 1240, margin: "0 auto", padding: "22px 24px 0", height: "100vh", boxSizing: "border-box", display: "flex", flexDirection: "column" }
    : S.page;
  const gridStyle: CSSProperties = split
    ? { display: "grid", gridTemplateColumns: "232px minmax(0, 1fr)", gridTemplateRows: "minmax(0, 1fr)", gap: 18, flex: 1, minHeight: 0 }
    : { display: "grid", gridTemplateColumns: "1fr", gap: 18, alignItems: "start" };
  const asideStyle: CSSProperties = split
    ? { overflowY: "auto", minHeight: 0, paddingRight: 2, paddingBottom: 8 }
    : {};
  const rightColStyle: CSSProperties = split
    ? { minWidth: 0, overflowY: "auto", minHeight: 0, paddingRight: 6, paddingBottom: 24 }
    : { minWidth: 0 };

  const eyebrow: CSSProperties = { fontFamily: FONT_SANS, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase", color: C.muted, marginBottom: 8 };

  // Una banda de comparación (clave o alumno): segmentos coloreados + playhead.
  // Si el intervalo lleva `fig` (categoría con cifrado), el grado (romano) y la
  // inversión se muestran JUNTOS en el bloque — igual que dentro del ejercicio
  // (session.tsx) — para que grado y cifrado se lean como dos datos distintos
  // del mismo bloque, no fundidos en uno.
  const CompareBar = ({ label, ivs }: { label: string; ivs: CorrectionIv[] | undefined }) => (
    <div style={{ marginBottom: 12 }}>
      <div style={{ ...eyebrow, marginBottom: 6 }}>{label}</div>
      <div onClick={hasAudio ? handleTimelineClick : undefined}
        style={{ background: C.paper2, borderRadius: 8, height: 40, position: "relative", cursor: hasAudio ? "pointer" : "default", overflow: "hidden" }}>
        {(ivs ?? []).map((iv, i) => {
          const b = btnOf(exCategory, iv.fn) ?? { id: iv.fn, color: C.muted };
          const figId = (iv.fig as string | null | undefined) ?? null;
          const tc = textOn(b.color);
          return (
            <div key={i} title={`${iv.fn} · ${fmtClock(iv.start)}–${fmtClock(iv.end)}`} style={{ position: "absolute", top: 3, bottom: 3, left: pct(iv.start), width: pct(iv.end - iv.start), background: b.color, borderRadius: 4, border: "1px solid rgba(255,255,255,0.22)", display: "flex", alignItems: "center", justifyContent: "center", gap: 4, overflow: "hidden", pointerEvents: "none" }}>
              {(iv.end - iv.start) / dur > 0.05 ? (
                <>
                  <span style={{ fontSize: 11, fontWeight: 700, color: tc, fontFamily: FONT_SANS }}>{iv.fn}</span>
                  {figId != null && <FigureLabel item={figureOf(figId)} color={tc} size={9} />}
                </>
              ) : (
                // A5-02/A5-03: nunca ocultar del todo la etiqueta — al menos la
                // inicial, siempre visible (el title lleva la etiqueta completa).
                <span style={{ fontSize: 9, fontWeight: 700, color: tc, fontFamily: FONT_SANS }}>{iv.fn.charAt(0)}</span>
              )}
            </div>
          );
        })}
        {hasAudio && <SchemaPlayhead timeRef={audioTimeRef} duration={dur} />}
      </div>
    </div>
  );

  return (
    <div style={S.app}>
      <div style={pageStyle}>
       <div style={split ? { flexShrink: 0 } : undefined}>
        {/* Fila superior: volver (izq) + navegación de cola (der, si la hay) */}
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
        <h1 style={{ ...S.h1, marginBottom: 4 }}>{exercise.title}</h1>
        <p style={{ fontSize: 13, color: C.muted, margin: "0 0 20px" }}>
          <strong style={{ color: C.ink2, fontSize: 14 }}>{alumnoNombre}</strong> · {puedeCorregir ? "corrección de la entrega" : "corrección automática"}
        </p>
        {extraHeaderContent}
        <AttemptBanner result={result} />
       </div>

        {/* Dos columnas: nota + diagnóstico FIJOS (izq) + comparación ancha (der) */}
        <div style={gridStyle}>

          {/* ── Panel lateral (fijo) ── */}
          <aside style={asideStyle} className="fa-autohide-scroll" onScroll={handleAutoHideScroll}>
            {/* Nota. Profesor con guardado (N4.1): fuente elegible + Guardar —
                el interactivo deja de ser solo lectura (imprescindible para el
                LIBRE, que no tiene automática que valga). Lectura (alumno):
                final de la corrección si existe; si no, la automática. */}
            <div style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 14, padding: "14px 16px", marginBottom: 14 }}>
              <div style={eyebrow}>Nota</div>
              {puedeCorregir ? (
                <>
                  <FuenteNotaPanel state={fuente} onChange={setFuente} preliminar={preliminar}
                    preliminarLabel={preliminar != null ? `margen ±${effMargin} s` : undefined}
                    instrumento={instrumento} rejillaEnPanel={false} />
                  {preliminar == null && fuente.fuente === "auto" && (
                    <div style={{ fontSize: 11, color: C.muted, marginTop: 6, lineHeight: 1.5 }}>Sin nota automática que certificar.</div>
                  )}
                </>
              ) : corrected && notaCorregida != null ? (
                <>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 3 }}>
                    <span style={{ fontSize: 42, fontWeight: 800, color: scoreColor(notaCorregida), lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{nota10(notaCorregida)}</span>
                    <span style={{ fontSize: 16, fontWeight: 700, color: C.muted2 }}>/10</span>
                  </div>
                  <div style={{ fontSize: 10.5, color: C.muted, marginTop: 6, lineHeight: 1.5 }}>
                    Corregido por el profesor{preliminar != null && ` · automática: ${nota10(preliminar)}`}
                  </div>
                </>
              ) : sc == null ? (
                <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.5 }}>Sin clave de corrección todavía.</div>
              ) : (
                <>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 3 }}>
                    <span style={{ fontSize: 42, fontWeight: 800, color: col, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{nota10(sc)}</span>
                    <span style={{ fontSize: 16, fontWeight: 700, color: C.muted2 }}>/10</span>
                  </div>
                  <div style={{ fontSize: 10.5, color: C.muted, marginTop: 6, lineHeight: 1.5 }}>Automática · margen ±{effMargin} s</div>
                </>
              )}
              {/* N2.1: fila por nivel con su peso (cifra + «×0,30») —
                  el alumno y el profesor ven el mismo desglose. */}
              {desgloseNiveles && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.line}`, display: "flex", flexDirection: "column", gap: 6 }}>
                  {([["grados", "Grados"], ["cifrado", "Cifrado"]] as const).map(([nivel, label]) => (
                    <div key={nivel} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: 12.5 }}>
                      <span style={{ color: C.muted }}>{label}</span>
                      <span>
                        <strong style={{ color: C.ink, fontVariantNumeric: "tabular-nums" }}>{desgloseNiveles[nivel] != null ? `${desgloseNiveles[nivel]}%` : "—"}</strong>
                        <span style={{ color: C.muted, fontSize: 11, marginLeft: 5, fontVariantNumeric: "tabular-nums" }}>{factorDe(pesosNiveles[nivel])}</span>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {puedeCorregir && (
              <button onClick={handleSaveInteractive} disabled={notaFinalPanel == null}
                style={{ ...S.btnPrimary, width: "100%", padding: 12, borderRadius: 10, fontSize: 13, marginBottom: 14, opacity: notaFinalPanel == null ? 0.5 : 1, cursor: notaFinalPanel == null ? "default" : "pointer" }}>
                {corrected ? "Actualizar corrección" : "Guardar corrección"}
              </button>
            )}

            {/* Resumen del diagnóstico. Con cifrado (figDiag), se separan
                explícitamente dos preguntas distintas: "¿acertó el GRADO?" y,
                solo de lo acertado, "¿acertó también la INVERSIÓN?" — acertar
                la cifra con el grado equivocado no cuenta para nada (Jon,
                2026-07-06). Sin cifrado, la tarjeta queda como antes. */}
            {diagnostics && (
              <div style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 14, padding: "14px 16px" }}>
                <div style={eyebrow}>Diagnóstico</div>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: C.muted2, marginBottom: 6 }}>Grados</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
                    <span style={{ color: C.muted }}>Cobertura</span><strong style={{ color: C.ink, fontVariantNumeric: "tabular-nums" }}>{diagnostics.cobertura}%</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
                    <span style={{ color: C.muted }}>Precisión</span><strong style={{ color: C.ink, fontVariantNumeric: "tabular-nums" }}>{diagnostics.precision}%</strong>
                  </div>
                  {diagnostics.desfaseMedio != null && (
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
                      <span style={{ color: C.muted }}>Desfase medio</span><strong style={{ color: C.ink, fontVariantNumeric: "tabular-nums" }}>{diagnostics.desfaseMedio > 0 ? "+" : ""}{diagnostics.desfaseMedio} s</strong>
                    </div>
                  )}
                </div>

                {figDiag && (
                  <>
                    <div style={{ height: 1, background: C.line, margin: "12px 0 10px" }} />
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: C.muted2, marginBottom: 6 }}>Cifrado (inversión)</div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
                      <span style={{ color: C.muted }}>Acierto</span>
                      <strong style={{ color: C.ink, fontVariantNumeric: "tabular-nums" }}>{figDiag.pct != null ? `${figDiag.pct}%` : "—"}</strong>
                    </div>
                    <div style={{ fontSize: 10.5, color: C.muted, marginTop: 6, lineHeight: 1.45 }}>
                      De los grados que acertó, en cuántos llevaba también la inversión correcta.
                    </div>
                  </>
                )}

                {exCategories.length > 1 && (
                  <div style={{ fontSize: 11.5, color: C.muted, marginTop: 10 }}>Categoría: <span style={{ color: C.fnI, fontWeight: 600 }}>{exCategory.name}</span></div>
                )}
              </div>
            )}
          </aside>

          {/* ── Columna de la comparación (scroll propio; aquí vive lo ANCHO) ── */}
          <div style={rightColStyle} className="fa-autohide-scroll" onScroll={handleAutoHideScroll}>
            {hasAudio && (
              <div style={{ marginBottom: 16 }}>
                <CorrectionAudioBar time={time} timeRef={audioTimeRef} duration={dur} playing={playing} audioReady={audioReady}
                  togglePlay={togglePlay} onSeek={handleTimelineClick} />
              </div>
            )}

            {/* N4.1: rejilla del instrumento (misma pieza que la vista previa
                del editor), en la columna ancha; su nota vive en el panel. */}
            {puedeCorregir && fuente.fuente === "instrumento" && instrumento && (
              <div style={{ ...S.card, borderRadius: 12, marginBottom: 16 }}>
                <div style={{ ...eyebrow, marginBottom: 10 }}>{instrumento.titulo?.trim() || "Instrumento de corrección"}</div>
                <InstrumentoRespuestas instrumento={instrumento} respuestas={fuente.respuestas}
                  onChange={(respuestas) => setFuente({ ...fuente, respuestas })} />
              </div>
            )}

            {!tieneClave ? (
              <div style={{ ...S.card, borderRadius: 12, color: C.muted, textAlign: "center", padding: "2rem 1rem" }}>
                Este ejercicio no tiene clave de corrección aún, así que no hay comparación que mostrar.
              </div>
            ) : (
              <>
                {/* Comparación clave / alumno */}
                <div style={{ ...S.card, borderRadius: 12, marginBottom: 16 }}>
                  {/* Leyenda de colores */}
                  <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 12 }}>
                    {exCategory.buttons.map((b) => (
                      <span key={b.id} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5 }}>
                        <span style={{ width: 11, height: 11, background: b.color, borderRadius: 3, display: "inline-block" }} />
                        <span style={{ color: C.muted2 }}><strong style={{ color: C.ink2 }}>{b.id}</strong> · {b.name}</span>
                      </span>
                    ))}
                  </div>
                  <CompareBar label="Clave (profesor)" ivs={teacherAns} />
                  <CompareBar label="Respuesta del alumno" ivs={studentAns} />
                  {/* Regla de tiempo */}
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: C.muted2, fontVariantNumeric: "tabular-nums", marginTop: 2 }}>
                    {Array.from({ length: Math.floor(dur / 5) + 1 }, (_, i) => i * 5).map((t) => <span key={t}>{fmtClock(t)}</span>)}
                  </div>
                </div>

                {/* Práctica en otras categorías (multi-modo) */}
                {Array.isArray(result.extras) && result.extras.length > 0 && (
                  <div style={{ ...S.card, borderRadius: 12, marginTop: 16 }}>
                    <div style={eyebrow}>También practicado</div>
                    {result.extras.map((ex2) => {
                      const catId = ex2.categoryId ?? ex2.modeId;
                      const m = exCategories.find((mm) => mm.id === catId);
                      if (!m) return null;
                      return (
                        <div key={catId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${C.line}` }}>
                          <span style={{ fontSize: 13, color: C.muted2 }}>{m.name}</span>
                          <ScoreBadge score={ex2.score} />
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
