// Paso 4 — Claves (M5.4 + M5.7): grabar la clave de corrección (interactivo/
// esquema) y las preguntas (cuestionario), con las opciones de cada modelo. En
// multiparte se muestra como matriz partes×modelos en escritorio (tarjetas en
// móvil), según docs/demo_editor_ejercicio_v3.html (stepClaves). Todo se
// reutiliza verbatim de ExerciseDetailView; la grabación abre las vistas de
// siempre (?paso=4 se conserva al volver, M5.6).
import { C, S, FONT_SANS } from "../../theme/tokens.js";
import { SCHEMA_LEVELS } from "../../lib/schema.js";
import { SCHEMA_PALETTE_DEFAULT, schemaBlockColor } from "../../lib/palette.js";
import { answerFor, partKeyReadyOf } from "../../lib/domain.js";
import { MODEL_META } from "../../lib/modelMeta.js";
import type { Exercise, Part } from "../../lib/types.js";
import { useIsMobile } from "../../hooks/useIsMobile.js";
import type { EditorApi } from "./useExerciseEditor.js";
import { StepHead } from "./editorUi.js";

// Bloque del esquema de referencia (clave) almacenado en el ejercicio.
interface KeyBlock { level: number; start: number; end: number; label?: string; [k: string]: unknown; }

// Celda de la matriz (o fila, en móvil): chip de estado + acción, por parte y
// modelo. El cuestionario se gestiona aparte (preguntas); el resto graba clave.
function ClaveCell({ exercise, part, model, onRecordPart, onQuestionsPart }: {
  exercise: Exercise; part: Part; model: string;
  onRecordPart: (id: string) => void; onQuestionsPart: (id: string) => void;
}) {
  const ready = partKeyReadyOf(exercise, part, [model]);
  const isQuiz = model === "cuestionario";
  const label = model === "esquema" ? "Esquema" : isQuiz ? "Preguntas" : "Clave";
  const color = isQuiz ? C.quiz : C.fnT;
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      <span style={{ ...S.badge, background: ready ? `${color}1f` : C.paper, color: ready ? color : C.muted, border: `1px solid ${ready ? `${color}4d` : C.line}`, whiteSpace: "nowrap" }}>
        {ready ? `${label} ✓` : `Sin ${label.toLowerCase()}`}
      </span>
      <button type="button" onClick={() => (isQuiz ? onQuestionsPart(part.id) : onRecordPart(part.id))}
        style={{ ...S.btn, padding: "3px 9px", fontSize: 11.5 }}>
        {ready ? (isQuiz ? "Gestionar" : "Regrabar") : (isQuiz ? "Añadir" : "Grabar")}
      </button>
    </div>
  );
}

export function PasoClaves({ ed, num, total }: { ed: EditorApi; goStep: (k: string) => void; num: number; total: number }) {
  const {
    isCreating, isMultiPart, exercise, selectedModels, onPreview,
    exMargin, setExMargin, exSchemaMargin, setExSchemaMargin,
    listenOnly, setListenOnly, immediateSchemaFeedback, setImmediateSchemaFeedback,
    schemaLevels, toggleSchemaLevel, answerStatsSaved, exQs,
    guardedOnRecord, guardedOnPreview, guardedOnManageOrRecord,
    guardedOnRecordPart, guardedOnQuestionsPart,
    parts,
  } = ed;
  const { recorded, total: totalCats } = answerStatsSaved;
  const isDesktop = !useIsMobile(899);

  const hasInteractivo  = selectedModels.includes("interactivo");
  const hasEsquema      = selectedModels.includes("esquema");
  const hasCuestionario = selectedModels.includes("cuestionario");

  return (
    <>
      <StepHead num={num} total={total} title="Claves" />

      {isCreating ? (
        <div style={{ ...S.card, marginBottom: 0 }}>
          <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.6, margin: 0 }}>
            Aún no has guardado el ejercicio. Ve al último paso y pulsa «Guardar»: después podrás grabar la clave de corrección de cada modelo.
          </p>
        </div>
      ) : isMultiPart ? (
        /* ── Claves por parte: matriz en escritorio, tarjetas en móvil ── */
        isDesktop ? (
          <div style={{ ...S.card, padding: "6px 8px", marginBottom: 0 }}>
            <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
              <thead>
                <tr>
                  <th style={{ width: "32%", textAlign: "left", padding: "8px 10px", borderBottom: `1px solid ${C.line}`, fontSize: 9.5, letterSpacing: "1.2px", textTransform: "uppercase", color: C.muted, fontWeight: 600, fontFamily: FONT_SANS }}>Parte</th>
                  {selectedModels.map((m) => (
                    <th key={m} style={{ textAlign: "left", padding: "8px 10px", borderBottom: `1px solid ${C.line}`, fontSize: 9.5, letterSpacing: "1.2px", textTransform: "uppercase", color: C.muted, fontWeight: 600, fontFamily: FONT_SANS }}>
                      <span style={{ width: 9, height: 9, borderRadius: 3, display: "inline-block", marginRight: 6, border: "1px solid rgba(0,0,0,0.12)", background: MODEL_META[m]?.color, verticalAlign: -1 }} />
                      {MODEL_META[m]?.label ?? m}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {parts.map((part, idx) => (
                  <tr key={part.id}>
                    <td style={{ padding: 10, borderBottom: `1px dashed ${C.line}`, verticalAlign: "middle" }}>
                      <b style={{ fontSize: 13, color: C.ink }}>{idx + 1} · {part.title || `Parte ${idx + 1}`}</b>
                      <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{part.composerName || " "}</div>
                    </td>
                    {selectedModels.map((m) => (
                      <td key={m} style={{ padding: 10, borderBottom: `1px dashed ${C.line}`, verticalAlign: "middle" }}>
                        <ClaveCell exercise={exercise} part={part} model={m} onRecordPart={guardedOnRecordPart} onQuestionsPart={guardedOnQuestionsPart} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ ...S.card, marginBottom: 0 }}>
            {parts.map((part, idx) => (
              <div key={part.id} style={{ border: `1px solid ${C.line}`, borderRadius: 12, padding: "12px 14px", marginBottom: 10, background: C.paper2 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: C.ink, display: "block", marginBottom: 8 }}>{idx + 1} · {part.title || `Parte ${idx + 1}`}</span>
                {selectedModels.map((m) => (
                  <div key={m} style={{ ...S.row, justifyContent: "space-between", padding: "6px 0", borderTop: `1px dashed ${C.line}` }}>
                    <span style={{ fontSize: 12.5, color: C.ink2 }}>{MODEL_META[m]?.label ?? m}</span>
                    <ClaveCell exercise={exercise} part={part} model={m} onRecordPart={guardedOnRecordPart} onQuestionsPart={guardedOnQuestionsPart} />
                  </div>
                ))}
              </div>
            ))}
          </div>
        )
      ) : (
        <>
          {/* ── Clave de corrección (interactivo) ── */}
          {hasInteractivo && (
            <div style={{ ...S.card }}>
              <p style={{ ...S.label, margin: "0 0 14px" }}>Clave de corrección</p>
              <div style={{ marginBottom: 14 }}>
                {(exercise.categories ?? []).map((cat) => {
                  const hasKey = answerFor(exercise, cat.id).length > 0;
                  return (
                    <div key={cat.id} style={{ ...S.row, justifyContent: "space-between", padding: "8px 12px", borderRadius: 8, background: hasKey ? "rgba(63,155,91,0.07)" : C.paper2, border: `1px solid ${hasKey ? "rgba(63,155,91,0.22)" : C.line}`, marginBottom: 6 }}>
                      <span style={{ fontSize: 13, color: C.ink2, fontWeight: 500 }}>{cat.name}</span>
                      <span style={{ ...S.row, gap: 5, fontSize: 12, color: hasKey ? C.fnT : C.muted, fontWeight: 600 }}>
                        <span style={{ width: 7, height: 7, borderRadius: "50%", background: hasKey ? C.fnT : C.muted2, flexShrink: 0 }} />
                        {hasKey ? "Clave grabada" : "Sin clave"}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ ...S.label, marginBottom: 8 }}>Margen de tolerancia: {exMargin}s</label>
                <input type="range" min={0} max={3} step={0.5} value={exMargin}
                  onChange={(e) => setExMargin(Number(e.target.value))} style={{ width: "100%" }} />
              </div>
              <button onClick={guardedOnRecord} style={{
                width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                background: recorded === 0 ? C.ink : C.paper2,
                color:      recorded === 0 ? C.paper : C.ink,
                border:     recorded === 0 ? `1px solid ${C.ink}` : `1.5px solid ${C.line}`,
                borderRadius: 12, padding: "13px 18px", cursor: "pointer", fontSize: 15, fontWeight: 600,
              }}>
                <span>{recorded === 0 ? "Grabar clave" : recorded < totalCats ? "Grabar resto" : "Regrabar clave"}</span>
                <span style={{ fontSize: 18, opacity: 0.55, fontWeight: 300 }}>→</span>
              </button>
            </div>
          )}

          {/* ── Esquema formal ── */}
          {hasEsquema && (
            <div style={{ ...S.card }}>
              <p style={{ ...S.label, margin: "0 0 14px" }}>Esquema formal</p>
              <div style={{ background: `${C.fnD}10`, border: `1px solid ${C.fnD}30`, borderRadius: 10, padding: "10px 14px", marginBottom: 14, fontSize: 13, color: C.ink2, lineHeight: 1.6 }}>
                El alumno dibuja bloques de forma musical sobre una línea de tiempo multinivel. Graba un esquema de referencia para mostrarlo durante la corrección.
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ ...S.label, marginBottom: 8 }}>Niveles que verá el alumno</label>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {SCHEMA_LEVELS.map(lv => {
                    const active = schemaLevels.has(lv.id);
                    const isLast = active && schemaLevels.size === 1;
                    return (
                      <button key={lv.id} type="button"
                        onClick={() => !isLast && toggleSchemaLevel(lv.id)}
                        title={isLast ? "Debe haber al menos un nivel activo" : undefined}
                        style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 14px", borderRadius: 9, cursor: isLast ? "not-allowed" : "pointer", border: `1.5px solid ${active ? lv.color : C.line}`, background: active ? lv.color + "18" : C.paper2, transition: "all .12s", opacity: isLast ? 0.6 : 1, fontFamily: FONT_SANS }}>
                        <span style={{ width: 10, height: 10, borderRadius: 2, background: active ? lv.color : C.muted2, flexShrink: 0, transition: "background .12s" }} />
                        <span style={{ fontSize: 12, fontWeight: active ? 600 : 400, color: active ? lv.color : C.muted, transition: "all .12s" }}>{lv.sub}</span>
                        {active && <span style={{ fontSize: 10, color: lv.color, opacity: 0.7, marginLeft: 1 }}>✓</span>}
                      </button>
                    );
                  })}
                </div>
                {schemaLevels.size < SCHEMA_LEVELS.length && (
                  <p style={{ fontSize: 11, color: C.muted, margin: "6px 0 0" }}>Los niveles desactivados no aparecen al alumno.</p>
                )}
              </div>
              <div style={{ marginBottom: 14, padding: "12px 14px", background: C.paper2, border: `1px solid ${listenOnly ? C.fnD + "55" : C.line}`, borderRadius: 10, transition: "border-color .15s" }}>
                <label style={{ display: "flex", alignItems: "flex-start", gap: 14, cursor: "pointer", userSelect: "none" }}>
                  <input type="checkbox" checked={listenOnly} onChange={e => setListenOnly(e.target.checked)}
                    style={{ marginTop: 3, flexShrink: 0, cursor: "pointer" }} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.ink, marginBottom: 3 }}>Reproducción sin navegación</div>
                    <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.55 }}>El alumno solo puede dar al play/pausa y a «Empezar de nuevo». No puede saltar en la línea de tiempo.</div>
                  </div>
                </label>
              </div>
              <div style={{ marginBottom: 14, padding: "12px 14px", background: C.paper2, border: `1px solid ${immediateSchemaFeedback ? C.quiz + "55" : C.line}`, borderRadius: 10, transition: "border-color .15s" }}>
                <label style={{ display: "flex", alignItems: "flex-start", gap: 14, cursor: "pointer", userSelect: "none" }}>
                  <input type="checkbox" checked={immediateSchemaFeedback} onChange={e => setImmediateSchemaFeedback(e.target.checked)}
                    style={{ marginTop: 3, flexShrink: 0, cursor: "pointer" }} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.ink, marginBottom: 3 }}>Mostrar el esquema de referencia al entregar</div>
                    <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.55 }}>Si no, se mostrará tras la corrección del profesor.</div>
                  </div>
                </label>
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ ...S.label, marginBottom: 8 }}>Margen de tolerancia: {exSchemaMargin}s</label>
                <input type="range" min={0} max={3} step={0.5} value={exSchemaMargin}
                  onChange={(e) => setExSchemaMargin(Number(e.target.value))} style={{ width: "100%" }} />
              </div>
              {(() => {
                const key = (exercise.schemaKey as KeyBlock[] | undefined) ?? [];
                const hasKey = key.length > 0;
                const keyLvls = exercise.schemaLevels as number[] | undefined;
                const keyLevels = SCHEMA_LEVELS.filter(lv => !keyLvls || keyLvls.length === 0 || keyLvls.includes(lv.id));
                const byLevel = hasKey ? keyLevels.map(lv => ({ lv, blocks: key.filter(b => b.level === lv.id) })).filter(x => x.blocks.length > 0) : [];
                return (
                  <div style={{ border: `1px solid ${hasKey ? C.fnT + "55" : C.line}`, borderRadius: 10, padding: "10px 14px", marginBottom: 14, background: hasKey ? `rgba(63,155,91,0.05)` : C.paper2 }}>
                    <div style={{ ...S.row, gap: 8, marginBottom: hasKey ? 10 : 0 }}>
                      <span style={{ width: 7, height: 7, borderRadius: "50%", background: hasKey ? C.fnT : C.muted2, flexShrink: 0, display: "inline-block" }} />
                      <span style={{ fontSize: 13, color: hasKey ? C.fnT : C.muted, fontWeight: 600 }}>
                        {hasKey ? `Clave grabada · ${key.length} ${key.length === 1 ? "bloque" : "bloques"}` : "Sin clave de corrección"}
                      </span>
                    </div>
                    {hasKey && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {byLevel.map(({ lv, blocks }) => (
                          <div key={lv.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontSize: 10, fontWeight: 700, color: lv.color, minWidth: 48, textTransform: "uppercase", letterSpacing: 0.5 }}>{lv.sub}</span>
                            <div style={{ flex: 1, position: "relative", height: 28, background: "rgba(26,25,21,0.05)", borderRadius: 4, overflow: "hidden" }}>
                              {blocks.map((b, i) => {
                                const exDur = exercise.duration || 1;
                                const lPct = (b.start / exDur) * 100;
                                const wPct = Math.max(((b.end - b.start) / exDur) * 100, 0.5);
                                const { bg, textColor } = schemaBlockColor(b, key, (exercise.schemaPalette as string | undefined) || SCHEMA_PALETTE_DEFAULT);
                                if (lv.id === 3) {
                                  return (
                                    <div key={i} style={{ position: "absolute", top: 4, bottom: 4, left: `${lPct}%`, width: `${wPct}%`, display: "flex", alignItems: "center", overflow: "hidden" }}>
                                      <div style={{ background: bg, borderRadius: 999, display: "flex", alignItems: "center", padding: "2px 7px", flexShrink: 0 }}>
                                        <span style={{ fontSize: 9, fontWeight: 700, color: textColor, fontFamily: FONT_SANS, whiteSpace: "nowrap" }}>{b.label}</span>
                                      </div>
                                      {wPct >= 4 && <div style={{ flex: 1, height: 2, background: bg, opacity: 0.5, marginLeft: 3, borderRadius: 1 }} />}
                                    </div>
                                  );
                                }
                                if (lv.id === 4) {
                                  return (
                                    <div key={i} style={{ position: "absolute", top: 3, bottom: 3, left: `${lPct}%`, width: `${wPct}%`, background: bg, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                                      <span style={{ fontSize: 9, fontWeight: 500, color: textColor, fontFamily: FONT_SANS, whiteSpace: "nowrap", padding: "0 4px", overflow: "hidden", textOverflow: "ellipsis" }}>{b.label}</span>
                                    </div>
                                  );
                                }
                                return (
                                  <div key={i} style={{ position: "absolute", top: 2, bottom: 2, left: `${lPct}%`, width: `${wPct}%`, background: bg, borderRadius: 3, border: "1px solid rgba(255,255,255,0.22)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                                    <span style={{ fontSize: 9, fontWeight: lv.id === 1 ? 700 : 500, color: textColor, fontFamily: FONT_SANS, whiteSpace: "nowrap", padding: "0 2px", overflow: "hidden", textOverflow: "ellipsis" }}>{b.label}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={guardedOnRecord} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "space-between", background: !(exercise.schemaKey as unknown[] | undefined)?.length ? C.ink : C.paper2, color: !(exercise.schemaKey as unknown[] | undefined)?.length ? C.paper : C.ink, border: !(exercise.schemaKey as unknown[] | undefined)?.length ? `1px solid ${C.ink}` : `1.5px solid ${C.line}`, borderRadius: 12, padding: "13px 18px", cursor: "pointer", fontSize: 14, fontWeight: 600 }}>
                  <span>{(exercise.schemaKey as unknown[] | undefined)?.length ? "Regrabar clave" : "Grabar clave"}</span>
                  <span style={{ fontSize: 18, opacity: 0.55, fontWeight: 300 }}>→</span>
                </button>
                {onPreview && guardedOnPreview && (
                  <button onClick={guardedOnPreview} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "space-between", background: C.paper2, color: C.ink, border: `1.5px solid ${C.line}`, borderRadius: 12, padding: "13px 18px", cursor: "pointer", fontSize: 14, fontWeight: 600 }}>
                    <span>Probar ejercicio</span>
                    <span style={{ fontSize: 18, opacity: 0.55, fontWeight: 300 }}>›</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ── Preguntas (cuestionario) ── */}
          {hasCuestionario && (
            <div style={{ ...S.card }}>
              <p style={{ ...S.label, margin: "0 0 14px" }}>Preguntas</p>
              <div style={{ ...S.row, justifyContent: "space-between", padding: "8px 12px", borderRadius: 8, background: exQs.length > 0 ? "rgba(47,111,184,0.07)" : C.paper2, border: `1px solid ${exQs.length > 0 ? "rgba(47,111,184,0.22)" : C.line}`, marginBottom: 14 }}>
                <span style={{ fontSize: 13, color: C.ink2, fontWeight: 500 }}>Preguntas configuradas</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: exQs.length > 0 ? C.quiz : C.muted }}>
                  {exQs.length > 0 ? `${exQs.length} ${exQs.length === 1 ? "pregunta" : "preguntas"}` : "Ninguna todavía"}
                </span>
              </div>
              <button onClick={guardedOnManageOrRecord} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", background: exQs.length === 0 ? C.ink : C.paper2, color: exQs.length === 0 ? C.paper : C.ink, border: exQs.length === 0 ? `1px solid ${C.ink}` : `1.5px solid ${C.line}`, borderRadius: 12, padding: "13px 18px", cursor: "pointer", fontSize: 15, fontWeight: 600 }}>
                <span>{exQs.length === 0 ? "Crear preguntas" : "Editar preguntas"}</span>
                <span style={{ fontSize: 18, opacity: 0.55, fontWeight: 300 }}>→</span>
              </button>
              {selectedModels.length > 1 && onPreview && guardedOnPreview && (
                <button onClick={guardedOnPreview} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", background: "transparent", color: C.ink2, border: `1px solid ${C.line}`, borderRadius: 12, padding: "10px 18px", cursor: "pointer", fontSize: 13, fontWeight: 500, marginTop: 8 }}>
                  <span>Probar ejercicio completo</span>
                  <span style={{ fontSize: 16, opacity: 0.45, fontWeight: 300 }}>→</span>
                </button>
              )}
            </div>
          )}

          {/* ── Guía de tiempo (interactivo) ── */}
          {hasInteractivo && (
            <div style={{ ...S.card, marginBottom: 0 }}>
              <p style={{ ...S.label, margin: "0 0 14px" }}>Opciones para el alumno</p>
              <label style={{ display: "flex", alignItems: "flex-start", gap: 14, cursor: "pointer", userSelect: "none" }}>
                <input type="checkbox" checked={!!exercise.showHint}
                  onChange={(e) => ed.onUpdate({ showHint: e.target.checked })}
                  style={{ width: 16, height: 16, marginTop: 2, accentColor: C.fnT, flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: C.ink, marginBottom: 3 }}>Mostrar guía de tiempo</div>
                  <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5 }}>Muestra los bloques de función como barras apagadas — una pista sin revelar la solución.</div>
                </div>
              </label>
            </div>
          )}
        </>
      )}
    </>
  );
}
