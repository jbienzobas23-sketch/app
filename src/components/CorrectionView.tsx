// ═══ CORRECTIONVIEW (CORRECCIÓN / REVISIÓN) ══════════════════════════════════
// CorrectionView (alumno y profesor). Extraída de App.jsx (Fase 2).
import React, { useState, useRef } from "react";
import type { Exercise, ExerciseResult } from "../lib/types.js";
import { C, S, FONT_SANS, FONT_SERIF } from "../theme/tokens.js";
import { textOn, scoreColor } from "../lib/color.js";
import { fmtClock } from "../lib/time.js";
import { SCHEMA_LEVELS } from "../lib/schema.js";
import { SCHEMA_PALETTE_DEFAULT, schemaBlockColor } from "../lib/palette.js";
import { answerFor, btnOf, partsOf, partToExercise, modelsOf, resultPartsOf, questionsSnapshotOf, attemptsOf } from "../lib/domain.js";
import { interactiveDiagnostics, schemaDiagnostics, aggregateParts, gradeShort } from "../lib/scoring.js";
import { parseHashQuery, setHashQuery } from "../lib/routing.js";
import { DEFAULT_MARGIN } from "../lib/sessionConstants.js";
import { useAudioPlayer } from "../hooks/useAudioPlayer.js";
import { ScoreBadge, SchemaPlayhead, CorrectionAudioBar } from "./primitives.jsx";

// ── Tipos locales de corrección ──────────────────────────────────────────────
// TeacherCorrection se exporta para que App.tsx tipe saveCorrection sin `any`
// (F7, T7.2) — sigue siendo el mismo tipo permisivo (índice abierto), solo
// visible fuera de este módulo.
export interface TeacherCorrection {
  corrected?: boolean;
  // Solo la presente en corrección multiparte (T4.4): con partes aún sin
  // corregir, el sobre sigue "pendiente" aunque esta parte concreta ya se
  // haya guardado.
  status?: "pendiente" | "corregido";
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

// Antes de este cambio la nota manual del profesor se editaba en 0–10; ahora
// se edita y se muestra en 0–100 (la escala que consume scoreColor/ScoreBadge
// en el resto de la app). Las correcciones guardadas en la escala antigua se
// leen tolerantemente: un totalScore <= 10 se interpreta como 0–10 y se
// multiplica por 10 tanto al mostrarlo como al precargarlo en el input de
// edición.
const normalizeScore100 = (v: number | null | undefined): number | null =>
  v == null ? null : (v <= 10 ? v * 10 : v);

interface CorrectionViewProps {
  exercise: Exercise;
  result: CorrectionResult;
  onBack: () => void;
  backLabel?: string;
  isTeacherMode?: boolean;
  student?: CorrectionStudent | null;
  onSaveCorrection?: SaveCorrection | null;
  // Contenido extra bajo el título (F4, T4.4): el navegador de chips de parte
  // + nota agregada que añade el envoltorio multiparte, más abajo en este
  // mismo archivo. null en el uso normal (una parte) — cero cambio visual.
  extraHeaderContent?: React.ReactNode;
  // Cola de pendientes (F6, T6.2): navegador «‹ Anterior · N/M · Siguiente ›»
  // entre las entregas pendientes del mismo ejercicio, y botón «Guardar y
  // siguiente» junto al de guardar. Solo en ejercicios de una parte — con
  // más de una, MultiPartCorrectionShell los ignora (límite de alcance
  // documentado: la cola no compone con el navegador de partes de T4.4).
  queueLabel?: string | null;
  onPrev?: (() => void) | null;
  onNext?: (() => void) | null;
}

// Corrección de UNA parte con UN modelo — es literalmente el componente de
// corrección de antes de F4 (T4.1-T4.3), sin ningún cambio interno. El
// envoltorio multiparte (más abajo) la reutiliza tal cual una vez por parte
// (y por modelo, en partes híbridas), proyectando el ejercicio y desglosando
// el sobre compuesto en resultados planos — así un ejercicio de una sola
// parte se corrige exactamente como siempre (mismo árbol de render).
// backLabel por defecto contextual (F7, T7.5): en modo profesor (previsualizar
// o corregir) el destino natural es "Volver", no "Mis ejercicios" (etiqueta
// del alumno) — un explícito del llamador sigue ganando siempre.
function CorrectionViewSingle({ exercise, result, onBack, isTeacherMode = false, backLabel = isTeacherMode ? "← Volver" : "← Mis ejercicios", student = null, onSaveCorrection = null, extraHeaderContent = null, queueLabel = null, onPrev = null, onNext = null }: CorrectionViewProps) {
  const dur = exercise.duration as number;
  const tc  = result.teacherCorrection;

  // Intentos (F6, T6.3): con más de un intento, «Mejor X% · Último Y% (↑/↓)».
  // `result.score` ya es el mejor de todos (addAttempt lo garantiza al
  // guardar); el "Último" es el score propio del intento más reciente.
  const attempts = attemptsOf(result as unknown as ExerciseResult);
  const lastAttemptScore = attempts.length > 0 ? (attempts[attempts.length - 1]?.score ?? null) : null;
  const prevBestScore = attempts.slice(0, -1).reduce<number | null>((best, a) => (a?.score != null && (best == null || a.score > best) ? a.score : best), null);
  const attemptTrend = lastAttemptScore != null && prevBestScore != null
    ? (lastAttemptScore > prevBestScore ? "up" : lastAttemptScore < prevBestScore ? "down" : "same")
    : null;
  const attemptBanner = attempts.length > 1 && (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 14, fontSize: 12.5, color: C.muted, flexWrap: "wrap" }}>
      <span>Intento {attempts.length}</span>
      <span>·</span>
      <span>Mejor <strong style={{ color: C.ink }}>{result.score ?? "—"}%</strong></span>
      <span>·</span>
      <span>
        Último <strong style={{ color: C.ink }}>{lastAttemptScore ?? "—"}%</strong>
        {attemptTrend === "up" && <span style={{ color: C.fnT, fontWeight: 700 }}> ↑</span>}
        {attemptTrend === "down" && <span style={{ color: C.danger, fontWeight: 700 }}> ↓</span>}
      </span>
    </div>
  );

  // Hooks siempre en el mismo orden (reglas de React)
  const [lvComments,   setLvComments]   = useState<Record<string, string>>(() => tc?.levelComments   || {});
  const [blkComments,  setBlkComments]  = useState<Record<string, string>>(() => tc?.blockComments   || {});
  const [schemaGlobal, setSchemaGlobal] = useState(tc?.globalComment || "");
  const [schemaScore,  setSchemaScore]  = useState<ScoreInput>(() => normalizeScore100(tc?.totalScore) ?? "");
  const [showBlkForm,  setShowBlkForm]  = useState(false);
  const [qComments,    setQComments]    = useState<Record<string, string>>(() => tc?.questionComments || {});
  const [quizGlobal,   setQuizGlobal]   = useState(tc?.globalComment || "");
  const [quizScore,    setQuizScore]    = useState<ScoreInput>(() => normalizeScore100(tc?.totalScore) ?? "");

  // Audio — siempre incondicional (reglas de hooks). loopRegionRef: región de
  // bucle activa para el botón «▶ Fragmento» del cuestionario (T2.3); null en
  // el resto de modelos.
  const loopRegionRef = useRef<{ audioStart: number; audioEnd: number } | null>(null);
  const { time, timeRef: audioTimeRef, playing, audioReady, hasAudio, togglePlay, seekTo, playFrom } = useAudioPlayer(exercise, { loopRegionRef });
  const [activeFragmentQId, setActiveFragmentQId] = useState<string | null>(null);
  const playQuestionFragment = (q: { id: string; audioStart?: number; audioEnd?: number }) => {
    if (activeFragmentQId === q.id && playing) { togglePlay(); return; }
    loopRegionRef.current = { audioStart: q.audioStart ?? 0, audioEnd: q.audioEnd ?? (exercise.duration as number) };
    setActiveFragmentQId(q.id);
    playFrom(q.audioStart ?? 0);
  };

  // Modelo esquema — corrección semiautomática
  if (result.type === "esquema") {
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
            {attemptBanner}

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
          {attemptBanner}

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

  // Modelo cuestionario
  if (result.type === "cuestionario") {
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
            {attemptBanner}

            {sc != null && (
              <div style={{ ...S.card, textAlign: "center", marginBottom: 20 }}>
                <div style={{ fontSize: 48, fontWeight: 900, color: col, lineHeight: 1 }}>{sc}%</div>
                <div style={{ color: C.muted, fontSize: 13, marginTop: 4 }}>{correctN} de {gradableQs} {gradableQs === 1 ? "pregunta correcta" : "preguntas correctas"} (automático)</div>
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
          {attemptBanner}

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

  // Modelo interactivo
  const exCategories     = exercise.categories ?? [];
  const resultCategoryId = result.categoryId ?? result.modeId;
  const exCategory       = (exCategories.find((m) => m.id === resultCategoryId) || exCategories[0]) as { id: string; name?: string; buttons: import("../lib/types.js").Button[] };
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
        {attemptBanner}
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

// Nota/estado efectivos de una parte+modelo: la corrección manual (si existe
// y está marcada `corrected`) sustituye a la nota automática — mismo criterio
// que ya aplicaba saveCorrection a nivel de ejercicio (T1), ahora por modelo.
function effectiveModelResult(
  raw: CorrectionResult | undefined,
  corr: TeacherCorrection | undefined,
): { score: number | null; status: "auto" | "pendiente" | "corregido" } {
  if (corr?.corrected) {
    let score = raw?.score ?? (raw as { placementScore?: number | null } | undefined)?.placementScore ?? null;
    if (corr.totalScore != null) {
      const n = Number(corr.totalScore);
      if (!Number.isNaN(n)) score = n <= 10 ? n * 10 : n;
    }
    return { score, status: "corregido" };
  }
  return {
    score: raw?.score ?? (raw as { placementScore?: number | null } | undefined)?.placementScore ?? null,
    status: (raw?.status as "auto" | "pendiente" | "corregido" | undefined) ?? "auto",
  };
}

// ═══ ENVOLTORIO MULTIPARTE (F4, T4.4) ════════════════════════════════════════
// Con más de una parte: navegador de chips (nota agregada arriba, mini-nota
// por parte en cada chip) — cada parte renderiza su rama existente SIN
// CAMBIOS vía CorrectionViewSingle, alimentada por el ejercicio proyectado
// (partToExercise) y el resultado plano de esa parte/modelo, desglosados del
// sobre compuesto con resultPartsOf (tolerante: también envuelve un resultado
// plano heredado como una única parte, si algún día hiciera falta). Solo la
// parte activa está montada — mismo criterio de LRU-1 que MultiPartSessionView
// (T4.3): un único useAudioPlayer vivo a la vez, sin cachés de audio nuevas.
// teacherCorrection.parts[partId][modelId] anida la forma manual de cada
// modelo tal cual la produce CorrectionViewSingle — sin tocarla.
function MultiPartCorrectionShell({ exercise, result, onBack, isTeacherMode = false, backLabel = isTeacherMode ? "← Volver" : "← Mis ejercicios", student = null, onSaveCorrection = null }: CorrectionViewProps) {
  const parts = partsOf(exercise);
  const resultParts = resultPartsOf(result);
  const teacherPartsCorrection = ((result.teacherCorrection as { parts?: Record<string, Record<string, TeacherCorrection>> } | undefined)?.parts) || {};

  const [activeIdx, setActiveIdx] = useState(() => {
    const n = parseInt(parseHashQuery().parte || "1", 10);
    return Number.isFinite(n) && n >= 1 && n <= parts.length ? n - 1 : 0;
  });
  const activePart = parts[activeIdx] || parts[0];
  const goToPart = (idx: number) => { setActiveIdx(idx); setHashQuery({ parte: String(idx + 1) }); };

  // Agregado de UNA parte: media de sus modelos (mismo criterio que la nota
  // de ejercicio agrega sus partes — aggregateParts, sin pesos por modelo).
  const partAggregate = (partId: string) => {
    const p = parts.find((x) => x.id === partId);
    if (!p) return { score: null, pending: false };
    const projected = partToExercise(exercise, p);
    const pModels = modelsOf(projected);
    const results = pModels.map((m) => effectiveModelResult(resultParts[partId]?.byModel?.[m], teacherPartsCorrection[partId]?.[m]));
    const scores = results.map((r) => r.score).filter((s): s is number => s != null);
    return { score: scores.length ? aggregateParts(scores) : null, pending: results.some((r) => r.status === "pendiente") };
  };

  const partAggregates = parts.map((p) => partAggregate(p.id));
  const overallScore  = aggregateParts(partAggregates.map((a) => a.score), parts.map((p) => p.points ?? 1));
  const overallPending = partAggregates.some((a) => a.pending);
  const col = scoreColor(overallScore);

  // Guarda la corrección de UN modelo de la parte activa: fusiona sobre
  // teacherCorrection.parts (sin pisar el resto de partes/modelos ya
  // corregidos) y recalcula la nota/estado agregados del ejercicio entero —
  // "saveCorrection recalcula score/status agregados" (plan, T4.4).
  const saveForModel = (modelId: string) => (studentId: string | undefined, exerciseId: Exercise["id"], correction: TeacherCorrection) => {
    const mergedParts = {
      ...teacherPartsCorrection,
      [activePart.id]: { ...(teacherPartsCorrection[activePart.id] || {}), [modelId]: { ...correction, corrected: true } },
    };
    let anyPending = false;
    const partScores = parts.map((p) => {
      const projected = partToExercise(exercise, p);
      const pModels = modelsOf(projected);
      const scores = pModels.map((m) => {
        const r = effectiveModelResult(resultParts[p.id]?.byModel?.[m], mergedParts[p.id]?.[m]);
        if (r.status === "pendiente") anyPending = true;
        return r.score;
      }).filter((s): s is number => s != null);
      return scores.length ? aggregateParts(scores) : null;
    });
    onSaveCorrection?.(studentId, exerciseId, {
      parts: mergedParts,
      totalScore: aggregateParts(partScores, parts.map((p) => p.points ?? 1)),
      status: anyPending ? "pendiente" : "corregido",
    } as unknown as TeacherCorrection);
  };

  const chips = (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 20 }}>
      {parts.map((p, i) => {
        const agg = partAggregates[i];
        const isActive = i === activeIdx;
        const label = agg.pending ? "pendiente" : agg.score != null ? `${agg.score}%` : "—";
        return (
          <button key={p.id} type="button" onClick={() => goToPart(i)}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 999,
              border: `1.5px solid ${isActive ? C.ink : C.line}`,
              background: isActive ? C.ink : "transparent",
              color: isActive ? C.paper : C.ink2,
              fontFamily: FONT_SANS, fontSize: 12.5, fontWeight: 700, cursor: "pointer",
            }}>
            <span>{i + 1}</span>
            <span style={{ fontWeight: 600, opacity: 0.85 }}>{p.title || `Parte ${i + 1}`}</span>
            <span style={{ fontSize: 10.5, opacity: 0.75 }}>{label}</span>
          </button>
        );
      })}
    </div>
  );

  const extraHeaderContent = (
    <>
      {overallScore != null && (
        <div style={{ ...S.card, textAlign: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 48, fontWeight: 900, color: col, lineHeight: 1 }}>{overallScore}%</div>
          <div style={{ color: C.muted, fontSize: 13, marginTop: 4 }}>
            Nota agregada de {parts.length} partes{overallPending ? " · con partes pendientes de corrección" : ""}
          </div>
        </div>
      )}
      {chips}
    </>
  );

  const projected = partToExercise(exercise, activePart);
  const pModels = modelsOf(projected);
  const modelsWithResult = pModels.filter((m) => resultParts[activePart.id]?.byModel?.[m]);

  if (modelsWithResult.length === 0) {
    return (
      <div style={S.app}>
        <div style={S.page}>
          <button onClick={onBack} style={{ ...S.btn, marginBottom: 20, fontSize: 12, padding: "6px 12px" }}>{backLabel}</button>
          <h1 style={{ ...S.h1, marginBottom: 4 }}>Corrección: {exercise.title}</h1>
          {student && <p style={{ color: C.muted, fontSize: 13, margin: "0 0 16px" }}>Alumno: <strong>{student.displayName || student.name}</strong></p>}
          {extraHeaderContent}
          <p style={{ color: C.muted, fontSize: 13 }}>Esta parte todavía no tiene entrega.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {modelsWithResult.map((m, i) => {
        const raw  = resultParts[activePart.id]!.byModel[m];
        const corr = teacherPartsCorrection[activePart.id]?.[m];
        const flatResult: CorrectionResult = { ...raw, type: (raw.type as string | undefined) ?? m, teacherCorrection: corr };
        return (
          <CorrectionViewSingle
            key={m}
            exercise={projected}
            result={flatResult}
            onBack={onBack}
            backLabel={backLabel}
            isTeacherMode={isTeacherMode}
            student={student}
            onSaveCorrection={isTeacherMode ? saveForModel(m) : null}
            // El navegador de chips + nota agregada solo se inserta una vez —
            // en el primer modelo de la parte activa (el caso común, una
            // parte con un solo modelo, no repite nada; una parte híbrida
            // muestra el navegador junto al primer modelo y el resto debajo).
            extraHeaderContent={i === 0 ? extraHeaderContent : null}
          />
        );
      })}
    </>
  );
}

// ═══ CORRECTIONVIEW (punto de entrada) ═══════════════════════════════════════
// Con una parte, delega tal cual en CorrectionViewSingle — un ejercicio
// antiguo (o cualquiera de una sola parte) se corrige exactamente como
// siempre. Con más de una parte, monta el envoltorio de arriba.
export function CorrectionView(props: CorrectionViewProps) {
  const parts = partsOf(props.exercise);
  if (parts.length > 1) return <MultiPartCorrectionShell {...props} />;
  return <CorrectionViewSingle {...props} />;
}
