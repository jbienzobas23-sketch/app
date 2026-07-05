// ═══ SCHEMACORRECTION (M3.4) ══════════════════════════════════════════════════
// Corrección del modelo esquema (profesor: forma de corrección manual; alumno:
// esquema entregado + referencia + feedback). Extraída de CorrectionView.tsx sin
// cambio de comportamiento — antes era la rama `result.type === "esquema"`.
import React, { useRef, useState } from "react";
import type { CSSProperties } from "react";
import { C, S, FONT_SANS, FONT_SERIF } from "../../theme/tokens.js";
import { scoreColor } from "../../lib/color.js";
import { fmtClock } from "../../lib/time.js";
import { SCHEMA_LEVELS } from "../../lib/schema.js";
import { SCHEMA_PALETTE_DEFAULT, schemaBlockColor } from "../../lib/palette.js";
import { schemaDiagnostics, nota10 } from "../../lib/scoring.js";
import { useAudioPlayer } from "../../hooks/useAudioPlayer.js";
import { useIsMobile } from "../../hooks/useIsMobile.js";
import { SchemaPlayhead, CorrectionAudioBar } from "../primitives.jsx";
import { normalizeScore100, type CorrectionViewProps, type SchemaBlock } from "./shared.js";
import { NotaInput } from "./NotaInput.js";
import { parseNota10, useAutoHideScroll } from "./notaShared.js";
import { AttemptBanner } from "./AttemptBanner.js";

export function SchemaCorrection({ exercise, result, onBack, isTeacherMode = false, backLabel = isTeacherMode ? "← Volver" : "← Mis ejercicios", student = null, onSaveCorrection = null, extraHeaderContent = null, queueLabel = null, onPrev = null, onNext = null }: CorrectionViewProps) {
  const dur = exercise.duration as number;
  const tc  = result.teacherCorrection;
  const [lvComments,   setLvComments]   = useState<Record<string, string>>(() => tc?.levelComments || {});
  const [blkComments,  setBlkComments]  = useState<Record<string, string>>(() => tc?.blockComments || {});
  const [schemaGlobal, setSchemaGlobal] = useState(tc?.globalComment || "");
  // La nota manual se edita en 0–10 como TEXTO (Jon, 2026-07-06) y se ALMACENA
  // en 0–100 (totalScore, compatible). Saneado/parseo/input en NotaInput.tsx,
  // compartidos con la corrección de cuestionario.
  const [schemaScore,  setSchemaScore]  = useState<string>(() => {
    const n = normalizeScore100(tc?.totalScore);
    return n == null ? "" : nota10(n)!;
  });
  const { time, timeRef: audioTimeRef, playing, audioReady, hasAudio, togglePlay, seekTo } = useAudioPlayer(exercise);
  const isMobile = useIsMobile();
  const handleAutoHideScroll = useAutoHideScroll();

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
  // Comentarios plegados (Jon, 2026-07-06): son opcionales — se abren bajo
  // demanda y de inicio si ya traen texto (al editar una corrección existente).
  // DOS niveles de granularidad (Jon, 2026-07-06):
  //  · por NIVEL  → se abre pulsando «+ Nivel» o la ETIQUETA del nivel en la tira.
  //  · por BLOQUE → se abre pulsando ESE bloque concreto en el esquema del alumno.
  const [openLv, setOpenLv] = useState<Set<number>>(
    () => new Set(activeLevels.filter((lv) => (tc?.levelComments?.[lv.id] || "").trim()).map((lv) => lv.id))
  );
  const [openBlk, setOpenBlk] = useState<Set<string>>(
    () => new Set(Object.entries(tc?.blockComments || {}).filter(([, v]) => (v || "").trim()).map(([k]) => k))
  );
  const lvTextareaRefs  = useRef<Record<number, HTMLTextAreaElement | null>>({});
  const blkTextareaRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  // Abrir enfoca el textarea recién montado. Cerrar lo QUITA de verdad: descarta
  // su comentario (son opcionales; el ✕ es una acción deliberada).
  const openLevel = (id: number) => {
    setOpenLv((s) => new Set(s).add(id));
    setTimeout(() => lvTextareaRefs.current[id]?.focus(), 40);
  };
  const closeLevel = (id: number) => {
    setOpenLv((s) => { const n = new Set(s); n.delete(id); return n; });
    setLvComments((p) => { const n = { ...p }; delete n[id]; return n; });
  };
  const openBlock = (id: string) => {
    setOpenBlk((s) => new Set(s).add(id));
    setTimeout(() => blkTextareaRefs.current[id]?.focus(), 40);
  };
  const closeBlock = (id: string) => {
    setOpenBlk((s) => { const n = new Set(s); n.delete(id); return n; });
    setBlkComments((p) => { const n = { ...p }; delete n[id]; return n; });
  };

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    seekTo(((e.clientX - rect.left) / rect.width) * dur);
  };

  const SchemaStrip = ({ title: stripTitle, bks, paletteId = studentPalette, onBlockClick, onLevelClick }: { title: string; bks: SchemaBlock[]; paletteId?: string; onBlockClick?: (b: SchemaBlock) => void; onLevelClick?: (levelId: number) => void }) => (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 12, color: C.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 10 }}>{stripTitle}</div>
      {activeLevels.map((lv) => {
        const lvBlocks = bks.filter((b) => b.level === lv.id).sort((a, b) => a.start - b.start);
        if (lvBlocks.length === 0) return null;
        // Interacción de la tira del alumno (Jon, 2026-07-06): pulsar UN BLOQUE
        // abre el comentario de ESE bloque; pulsar la ETIQUETA del nivel abre el
        // comentario del nivel. `stopPropagation` para no disparar el seek de
        // audio del carril. La tira de referencia no lleva callbacks → inerte.
        const blockClickable = !!onBlockClick;
        const blockEvents = blockClickable ? { pointerEvents: "auto" as const, cursor: "pointer" as const } : { pointerEvents: "none" as const };
        const onBlk = (b: SchemaBlock) => (e: React.MouseEvent) => { if (!onBlockClick) return; e.stopPropagation(); onBlockClick(b); };
        return (
          <div key={lv.id} style={{ marginBottom: lv.id === 4 ? 14 : 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {onLevelClick ? (
                <button onClick={() => onLevelClick(lv.id)} title={`Comentar el nivel ${lv.sub}`} className="fa-pressable"
                  style={{ fontSize: 11, fontWeight: 700, color: lv.color, minWidth: 56, textTransform: "uppercase", letterSpacing: 0.5, textAlign: "left", background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: FONT_SANS }}>{lv.sub}</button>
              ) : (
                <span style={{ fontSize: 11, fontWeight: 700, color: lv.color, minWidth: 56, textTransform: "uppercase", letterSpacing: 0.5 }}>{lv.sub}</span>
              )}
              <div
                onClick={hasAudio ? handleTimelineClick : undefined}
                style={{ flex: 1, position: "relative", height: 40, background: C.paper2, borderRadius: 6, overflow: "hidden", cursor: hasAudio ? "pointer" : "default" }}>
                {lvBlocks.map((b, i) => {
                  const lPct = (b.start / dur) * 100;
                  const wPct = Math.max(((b.end - b.start) / dur) * 100, 0.5);
                  const { bg, textColor } = schemaBlockColor(b, bks, paletteId);
                  const titleAttr = blockClickable ? `Comentar el bloque ${b.label}` : undefined;
                  if (lv.id === 3) {
                    return (
                      <div key={i} onClick={onBlk(b)} title={titleAttr} style={{ position: "absolute", top: 6, bottom: 6, left: `${lPct}%`, width: `${wPct}%`, display: "flex", alignItems: "center", overflow: "hidden", ...blockEvents }}>
                        <div style={{ background: bg, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", padding: "4px 10px", flexShrink: 0, minWidth: 0 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: textColor, fontFamily: FONT_SANS, whiteSpace: "nowrap" }}>{b.label}</span>
                        </div>
                        {wPct >= 4 && <div style={{ flex: 1, height: 2.5, background: bg, opacity: 0.55, marginLeft: 4, borderRadius: 1.5 }} />}
                      </div>
                    );
                  }
                  if (lv.id === 4) {
                    return (
                      <div key={i} onClick={onBlk(b)} title={titleAttr} style={{ position: "absolute", top: 4, bottom: 4, left: `${lPct}%`, width: `${wPct}%`, background: bg, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 10px", overflow: "hidden", ...blockEvents }}>
                        <span style={{ fontSize: 11, fontWeight: 500, color: textColor, fontFamily: FONT_SANS, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{b.label}</span>
                      </div>
                    );
                  }
                  return (
                    <div key={i} onClick={onBlk(b)} title={titleAttr} style={{ position: "absolute", top: 3, bottom: 3, left: `${lPct}%`, width: `${wPct}%`, background: bg, borderRadius: 4, border: "1px solid rgba(255,255,255,0.22)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", ...blockEvents }}>
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

  // Diagnóstico compacto (Jon, 2026-07-06): un chip por bloque en fila con
  // salto — antes cada bloque era una fila a TODO lo ancho con su «etiqueta ✗»
  // pegada al borde derecho, medio ancho vacío por fila. El símbolo va junto a
  // su color (regla 9) y el estado se lee dentro del propio chip.
  const DiagnosticsCard = () => !diag ? null : (
    <div style={{ ...S.card, borderRadius: 12, marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
        <span style={{ fontFamily: FONT_SANS, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase", color: C.muted }}>Diagnóstico por bloque</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: C.ink2 }}>Colocación {ps ?? 0}% · Nombres {nombresPct ?? 0}%</span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {diag.bloques.map((b, i) => (
          <span key={b.id ?? i} title={b.etiquetaOk ? "Etiqueta correcta" : "Etiqueta incorrecta"}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 8, background: C.paper2, border: `1px solid ${C.line}`, fontSize: 12.5 }}>
            <strong style={{ color: C.ink, fontFamily: FONT_SERIF }}>{b.label || "—"}</strong>
            <span style={{ color: C.muted }}>
              {b.estado}
              {b.estado === "desplazado" && b.delta != null && ` ${b.delta > 0 ? "+" : ""}${b.delta}s`}
            </span>
            <span aria-label={b.etiquetaOk ? "etiqueta correcta" : "etiqueta incorrecta"} style={{ color: b.etiquetaOk ? C.fnT : C.danger, fontWeight: 800 }}>{b.etiquetaOk ? "✓" : "✗"}</span>
          </span>
        ))}
        {diag.sobrantes.length > 0 && (
          <span style={{ display: "inline-flex", alignItems: "center", padding: "4px 10px", borderRadius: 8, background: "transparent", border: `1px dashed ${C.rail}`, fontSize: 12, color: C.muted }}>
            +{diag.sobrantes.length} sin clave
          </span>
        )}
      </div>
    </div>
  );

  // ── Vista del profesor ────────────────────────────────────────────────────
  if (isTeacherMode) {
    const handleSave = () => onSaveCorrection?.(student?.id, exercise.id, {
      levelComments: lvComments,
      blockComments: Object.fromEntries(Object.entries(blkComments).filter(([, v]) => v?.trim())),
      globalComment: schemaGlobal.trim(),
      // El input está en 0–10; totalScore se guarda en 0–100 (contrato estable).
      totalScore:    (() => { const n = parseNota10(schemaScore); return n == null ? null : n * 10; })(),
    });
    const alumnoNombre = (student?.displayName || student?.name || "el alumno") as string;

    // Mismo lenguaje que la corrección de cuestionario (Jon, 2026-07-06):
    // página sin scroll, panel izquierdo FIJO (nota in situ + comentario general
    // + guardar) y columna derecha con scroll propio autoocultable. maxWidth más
    // ancho que el cuestionario (1240) porque el esquema necesita anchura
    // horizontal para sus tiras.
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
          {/* El nombre del alumno LIDERA el subtítulo (Jon, 2026-07-06): es el
              dato clave —de quién es esta entrega— y va prominente; el contexto
              «· corrección de la entrega» queda apagado detrás. */}
          <h1 style={{ ...S.h1, marginBottom: 4 }}>{exercise.title}</h1>
          <p style={{ fontSize: 13, color: C.muted, margin: "0 0 20px" }}>
            <strong style={{ color: C.ink2, fontSize: 14 }}>{alumnoNombre}</strong> · corrección de la entrega
          </p>
          {extraHeaderContent}
          <AttemptBanner result={result} />
         </div>

          {/* Dos columnas: nota/acciones FIJAS (izq) + esquema con scroll propio */}
          <div style={gridStyle}>

            {/* ── Panel lateral (fijo; scrollea solo si no cabe) ── */}
            <aside style={asideStyle} className="fa-autohide-scroll" onScroll={handleAutoHideScroll}>
              {/* Bloque de nota: el número grande a color ES el input (NotaInput).
                  Vacío → la nota de colocación automática en gris. */}
              <div style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 14, padding: "14px 16px", marginBottom: 14 }}>
                <div style={{ fontFamily: FONT_SANS, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase", color: C.muted, marginBottom: 4 }}>Nota</div>
                <NotaInput value={schemaScore} onChange={setSchemaScore} auto100={ps} />
                {ps != null && (
                  <div style={{ fontSize: 10.5, color: C.muted, marginTop: 6, lineHeight: 1.5 }}>Automática: colocación de bloques (±{effSchemaMargin} s)</div>
                )}
              </div>

              {/* Comentario general + guardar: el cierre de la corrección
                  siempre a mano, como en la corrección de cuestionario. */}
              <textarea
                value={schemaGlobal}
                onChange={(e) => setSchemaGlobal(e.target.value)}
                placeholder="Comentario global para el alumno…"
                rows={3}
                style={{ width: "100%", boxSizing: "border-box", fontFamily: FONT_SANS, fontSize: 12.5, background: C.paper, border: `1px solid ${C.line}`, borderRadius: 10, padding: "9px 11px", color: C.ink, resize: "vertical", marginBottom: 8 }}
              />
              <button onClick={handleSave} style={{ ...S.btnPrimary, width: "100%", padding: 12, borderRadius: 10, fontSize: 13, marginBottom: 6 }}>
                {tc?.corrected ? "Actualizar corrección" : "Guardar corrección"}
              </button>
              {onNext && (
                <button onClick={() => { handleSave(); onNext(); }} style={{ ...S.btnPrimary, width: "100%", padding: 12, borderRadius: 10, fontSize: 13, background: C.fnT, borderColor: C.fnT }}>
                  Guardar y siguiente
                </button>
              )}
            </aside>

            {/* ── Columna del esquema (scroll propio; aquí vive lo ANCHO) ── */}
            <div style={rightColStyle} className="fa-autohide-scroll" onScroll={handleAutoHideScroll}>
              {/* Solo con audio (Jon, 2026-07-06): el envoltorio siempre presente
                  dejaba 16px de hueco arriba y desalineaba la primera tarjeta
                  respecto al bloque de NOTA de la izquierda. */}
              {hasAudio && <div style={{ marginBottom: 16 }}><AudioBar /></div>}

              {(blocks.length > 0 || hasKey) && (
                <div style={{ ...S.card, borderRadius: 12, marginBottom: 16 }}>
                  {hasKey && <><SchemaStrip title="Referencia (profesor)" bks={schemaKey} paletteId={keyPalette} /><hr style={{ ...S.divider, margin: "10px 0 14px" }} /></>}
                  {/* Tira del alumno interactiva: pulsar un BLOQUE abre su
                      comentario Y lleva la reproducción al inicio de ese bloque
                      (seekTo); pulsar la ETIQUETA del nivel abre el del nivel. */}
                  {blocks.length > 0 && <SchemaStrip title="Esquema del alumno" bks={blocks} onBlockClick={(b) => { openBlock(b.id); seekTo(b.start); }} onLevelClick={openLevel} />}
                </div>
              )}

              {/* Comentarios opcionales (Jon, 2026-07-06): en reposo, una fila de
                  botones. Se abren también desde el esquema (bloque → su
                  comentario; etiqueta de nivel → comentario del nivel). Cada
                  apartado abierto se QUITA con su ✕ (descarta su texto). */}
              <div style={{ ...S.card, borderRadius: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontFamily: FONT_SANS, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase", color: C.muted, marginRight: 4 }}>Comentarios</span>
                  {activeLevels.filter((lv) => !openLv.has(lv.id)).map((lv) => (
                    <button key={lv.id} onClick={() => openLevel(lv.id)} className="fa-pressable"
                      style={{ ...S.btn, fontSize: 12, padding: "5px 12px", color: lv.color, borderColor: `${lv.color}55` }}>
                      + {lv.sub}
                    </button>
                  ))}
                </div>

                {/* Comentarios de NIVEL abiertos */}
                {openLv.size > 0 && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 10, marginTop: 12 }}>
                    {activeLevels.filter((lv) => openLv.has(lv.id)).map((lv) => (
                      <div key={lv.id}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                          <label style={{ ...S.label, color: lv.color, margin: 0 }}>Nivel · {lv.sub}</label>
                          <span style={{ flex: 1 }} />
                          <button onClick={() => closeLevel(lv.id)} aria-label={`Quitar comentario de ${lv.sub}`} title="Quitar" className="fa-pressable"
                            style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, fontSize: 14, lineHeight: 1, padding: "0 2px" }}>✕</button>
                        </div>
                        <textarea ref={(el) => { lvTextareaRefs.current[lv.id] = el; }} value={lvComments[lv.id] || ""}
                          onChange={(e) => setLvComments((p) => ({ ...p, [lv.id]: e.target.value }))}
                          placeholder={`Valoración del nivel ${lv.sub}…`}
                          style={{ ...S.input, minHeight: 52, resize: "vertical", fontFamily: FONT_SANS }} />
                      </div>
                    ))}
                  </div>
                )}

                {/* Comentarios de BLOQUE abiertos (uno por bloque pulsado) */}
                {openBlk.size > 0 && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 10, marginTop: 12 }}>
                    {blocks.filter((b) => openBlk.has(b.id)).map((b) => {
                      const lv = SCHEMA_LEVELS.find((l) => l.id === b.level);
                      return (
                        <div key={b.id}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                            <label style={{ ...S.label, margin: 0, display: "inline-flex", alignItems: "center", gap: 6 }}>
                              <span style={{ fontFamily: FONT_SERIF, fontWeight: 700, fontSize: 13, color: lv?.color, textTransform: "none", letterSpacing: 0 }}>{b.label}</span>
                              <span style={{ fontSize: 10, color: C.muted, fontVariantNumeric: "tabular-nums" }}>{lv?.sub} · {fmtClock(b.start)}–{fmtClock(b.end)}</span>
                            </label>
                            <span style={{ flex: 1 }} />
                            <button onClick={() => closeBlock(b.id)} aria-label={`Quitar comentario del bloque ${b.label}`} title="Quitar" className="fa-pressable"
                              style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, fontSize: 14, lineHeight: 1, padding: "0 2px" }}>✕</button>
                          </div>
                          <textarea ref={(el) => { blkTextareaRefs.current[b.id] = el; }} value={blkComments[b.id] || ""}
                            onChange={(e) => setBlkComments((p) => ({ ...p, [b.id]: e.target.value }))}
                            placeholder={`Comentario sobre el bloque ${b.label}…`}
                            style={{ ...S.input, minHeight: 52, resize: "vertical", fontFamily: FONT_SANS, fontSize: 12 }} />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
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
              <div style={{ fontSize: 56, fontWeight: 900, color: scoreColor(ps), lineHeight: 1 }}>{nota10(ps)}</div>
              <div style={{ color: C.muted, fontSize: 13, marginTop: 4 }}>Nota de colocación automática (margen ±{effSchemaMargin} s)</div>
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
                  <span style={{ fontSize: 48, fontWeight: 900, color: scoreColor(pct100), lineHeight: 1 }}>{nota10(pct100)}</span>
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
