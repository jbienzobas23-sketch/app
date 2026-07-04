// ═══ INTERACTIVECORRECTION (M3.4) ═════════════════════════════════════════════
// Corrección del modelo interactivo: vista única (sin split profesor/alumno) que
// compara la clave del profesor con la respuesta del alumno + diagnóstico.
// Extraída de CorrectionView.tsx sin cambio — antes era la rama por defecto.
import React from "react";
import { C, S, FONT_SANS } from "../../theme/tokens.js";
import { textOn, scoreColor } from "../../lib/color.js";
import { fmtClock } from "../../lib/time.js";
import { answerFor, btnOf } from "../../lib/domain.js";
import { interactiveDiagnostics } from "../../lib/scoring.js";
import { DEFAULT_MARGIN } from "../../lib/sessionConstants.js";
import { useAudioPlayer } from "../../hooks/useAudioPlayer.js";
import { ScoreBadge, SchemaPlayhead, CorrectionAudioBar } from "../primitives.jsx";
import { type CorrectionViewProps, type CorrectionIv } from "./shared.js";
import { AttemptBanner } from "./AttemptBanner.js";

export function InteractiveCorrection({ exercise, result, onBack, isTeacherMode = false, backLabel = isTeacherMode ? "← Volver" : "← Mis ejercicios", extraHeaderContent = null }: CorrectionViewProps) {
  const dur = exercise.duration as number;
  const { time, timeRef: audioTimeRef, playing, audioReady, hasAudio, togglePlay, seekTo } = useAudioPlayer(exercise);

  const exCategories     = exercise.categories ?? [];
  const resultCategoryId = result.categoryId ?? result.modeId;
  const exCategory       = (exCategories.find((m) => m.id === resultCategoryId) || exCategories[0]) as { id: string; name?: string; buttons: import("../../lib/types.js").Button[] };
  const teacherAns       = answerFor(exercise, exCategory.id) as CorrectionIv[];
  const studentAns       = result.intervals;
  const sc               = result.score;
  const col              = scoreColor(sc);
  const effMargin        = (exercise.margin as number | undefined) ?? DEFAULT_MARGIN;
  // Diagnóstico (T2.4): información adicional sobre CÓMO falló el alumno — la
  // nota sigue siendo `sc` (calcScore), esto no la sustituye ni la recalcula.
  const diagnostics = sc != null ? interactiveDiagnostics(teacherAns, studentAns ?? [], dur, effMargin) : null;
  const pct = (t: number) => `${(t / dur) * 100}%`;
  // Misma aritmética que handleTimelineClick del esquema: posición del clic
  // dentro del contenedor → segundos, sea la barra de transporte o una banda.
  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    seekTo(((e.clientX - rect.left) / rect.width) * dur);
  };

  return (
    <div style={S.app}>
      <div style={S.page}>
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "Outfit, sans-serif", fontSize: 13, color: "#888", padding: 0, marginBottom: 20 }}>{backLabel}</button>
        <h1 style={{ ...S.h1, marginBottom: 20 }}>Corrección: {exercise.title}</h1>
        {extraHeaderContent}
        <AttemptBanner result={result} />
        {hasAudio && (
          <CorrectionAudioBar time={time} timeRef={audioTimeRef} duration={dur} playing={playing} audioReady={audioReady}
            togglePlay={togglePlay} onSeek={handleTimelineClick} />
        )}

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
              <div style={{ color: C.muted, fontSize: 14, marginTop: 4 }}>de acierto · margen ±{effMargin}s</div>
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
            <div style={{ fontSize: 13, color: C.muted, marginBottom: 12 }}>Comparación visual (margen ±{effMargin}s aplicado)</div>
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
                <div onClick={hasAudio ? handleTimelineClick : undefined}
                  style={{ background: C.paper2, borderRadius: 6, height: 36, position: "relative", cursor: hasAudio ? "pointer" : "default" }}>
                  {(ivs ?? []).map((iv, i) => {
                    const b = btnOf(exCategory, iv.fn);
                    return (
                      <div key={i} style={{ position: "absolute", top: "10%", height: "80%", left: pct(iv.start), width: pct(iv.end - iv.start), background: b.color, borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", pointerEvents: "none" }}>
                        {(iv.end - iv.start) / dur > 0.06 && (
                          <span style={{ fontSize: 10, fontWeight: 700, color: textOn(b.color) }}>{iv.fn}</span>
                        )}
                      </div>
                    );
                  })}
                  {hasAudio && <SchemaPlayhead timeRef={audioTimeRef} duration={dur} />}
                </div>
              </div>
            ))}
            <div style={{ ...S.row, justifyContent: "space-between", fontSize: 10, color: C.muted2 }}>
              {Array.from({ length: Math.floor(dur / 5) + 1 }, (_, i) => i * 5).map((t) => <span key={t}>{fmtClock(t)}</span>)}
            </div>
          </div>
        )}

        {diagnostics && (
          <div style={{ ...S.card, marginTop: 16 }}>
            <div style={{ fontSize: 13, color: C.muted, marginBottom: 10 }}>Diagnóstico</div>
            <div style={{ fontSize: 13, color: C.ink2, marginBottom: 14 }}>
              Cobertura {diagnostics.cobertura}% · Precisión {diagnostics.precision}%
              {diagnostics.desfaseMedio != null && (
                <span style={{ color: C.muted }}> · desfase medio {diagnostics.desfaseMedio > 0 ? "+" : ""}{diagnostics.desfaseMedio}s</span>
              )}
            </div>
            {diagnostics.confusiones.length > 0 && (
              <div style={{ marginBottom: diagnostics.tramos.length > 0 ? 14 : 0 }}>
                <div style={{ fontSize: 11, color: C.muted, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 700 }}>Confusiones más frecuentes</div>
                {diagnostics.confusiones.slice(0, 5).map((c, i) => (
                  <div key={i} style={{ ...S.row, justifyContent: "space-between", fontSize: 13, padding: "5px 0", borderBottom: `1px solid ${C.line}` }}>
                    <span style={{ color: C.ink }}>{c.de} → {c.a}</span>
                    <span style={{ color: C.muted, fontFamily: FONT_SANS, fontSize: 12, fontVariantNumeric: "tabular-nums" }}>{c.segundos}s</span>
                  </div>
                ))}
              </div>
            )}
            {diagnostics.tramos.length > 0 && (
              <div>
                <div style={{ fontSize: 11, color: C.muted, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 700 }}>Tramos fallados</div>
                {diagnostics.tramos.map((tr, i) => (
                  <button key={i} onClick={() => seekTo(tr.start)} className="fa-pressable"
                    style={{ display: "flex", width: "100%", boxSizing: "border-box", justifyContent: "space-between", alignItems: "center", background: "transparent", border: "none", borderBottom: `1px solid ${C.line}`, padding: "6px 0", cursor: "pointer", fontSize: 13, color: C.ink, textAlign: "left" }}>
                    <span style={{ fontFamily: FONT_SANS, fontSize: 12, fontVariantNumeric: "tabular-nums" }}>{fmtClock(tr.start)}–{fmtClock(tr.end)}</span>
                    <span style={{ color: C.muted, fontSize: 12 }}>esperado {tr.esperado} · marcado {tr.marcado ?? "—"}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <button onClick={onBack} style={{ ...S.btnPrimary, width: "100%", marginTop: 8, padding: 14, borderRadius: 12 }}>
          {backLabel}
        </button>
      </div>
    </div>
  );
}
