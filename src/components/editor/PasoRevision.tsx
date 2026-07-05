// Paso Revisión y publicación (M5.5 + M5.7 + M5.8): resumen «por excepciones»
// (solo lo que falta), visibilidad y unidades, en dos columnas en escritorio
// (estado | publicación), según docs/demo_editor_ejercicio_v3.html
// (stepRevision). El guardado usa handleSave del hook (byte-idéntico); la
// visibilidad y las unidades se delegan a TeacherDash mediante los callbacks.
import { C, S, FONT_SANS } from "../../theme/tokens.js";
import { fmtClock } from "../../lib/time.js";
import { MODEL_META } from "../../lib/modelMeta.js";
import type { Unit } from "../../lib/types.js";
import { useIsMobile } from "../../hooks/useIsMobile.js";
import { Menu } from "../primitives.jsx";
import type { EditorApi } from "./useExerciseEditor.js";
import { StepHead, Switch } from "./editorUi.js";

// go = clave del paso al que saltar (null si la acción es alternar visibilidad).
export interface Falta { txt: string; go: string | null; actionLabel: string; vis?: boolean }

export function PasoRevision({
  ed, goStep, num, total, units = [], onToggleVisibility, onAddToUnit, onRemoveFromUnit,
  allReady, visible, readyKeys, totalKeys, faltas,
}: {
  ed: EditorApi;
  goStep: (k: string) => void;
  num: number;
  total: number;
  units?: Unit[];
  onToggleVisibility?: () => void;
  onAddToUnit?: (unitId: string) => void;
  onRemoveFromUnit?: (unitId: string) => void;
  allReady: boolean;
  visible: boolean;
  readyKeys: number;
  totalKeys: number;
  faltas: Falta[];
}) {
  const { isCreating, isMultiPart, parts, hasExistingAudio, effDuration, selectedModels, exercise, canSave, handleSave, guardedOnPreview } = ed;
  const ok = !isCreating && allReady && visible;
  const isDesktop = !useIsMobile(899);

  const audiosN = isMultiPart ? parts.length : (hasExistingAudio || effDuration > 0 ? 1 : 0);
  const modelsLabel = selectedModels.map((m) => MODEL_META[m]?.label ?? m).join(" + ");

  // Unidades que contienen este ejercicio (comparación por string, como TeacherDash).
  const exId = isCreating ? null : String(exercise.id);
  const inUnits  = exId ? units.filter((u) => (u.exerciseIds ?? []).map(String).includes(exId)) : [];
  const outUnits = exId ? units.filter((u) => !(u.exerciseIds ?? []).map(String).includes(exId)) : [];

  return (
    <>
      <StepHead num={num} total={total} title="Revisión y publicación" />

      <div style={{ display: "grid", gap: 14, gridTemplateColumns: isDesktop ? "minmax(0,1fr) 340px" : "1fr", alignItems: "start" }}>
        {/* ── Panel 1: estado / faltas ── */}
        <div style={{ ...S.card, marginBottom: 0 }}>
          {ok ? (
            <>
              <div style={{ borderRadius: 10, padding: "9px 12px", fontSize: 12.5, fontWeight: 600, background: "#eef4ee", border: "1px solid #cfe0cf", color: C.fnT }}>✓ Lista para alumnos</div>
              <div style={{ ...S.row, gap: 6, marginTop: 10, fontSize: 12.5, color: C.ink2, flexWrap: "wrap" }}>
                <span style={{ color: C.fnT, fontWeight: 700 }}>✓</span>
                {audiosN} audio{audiosN === 1 ? "" : "s"}
                {isMultiPart ? "" : ` · ${fmtClock(effDuration)}`}
                {totalKeys > 0 && ` · claves ${readyKeys}/${totalKeys}`}
                {` · ${modelsLabel}`}
              </div>
            </>
          ) : (
            <>
              <p style={{ fontSize: 12, color: C.muted, margin: "0 0 6px 2px" }}>
                {isCreating ? "Se guardará como borrador. Para completar:" : "Se guarda como borrador hasta completar:"}
              </p>
              {faltas.length === 0 && isCreating && (
                <p style={{ fontSize: 12.5, color: C.ink2, margin: "0 0 2px 2px" }}>Todo listo — pulsa «Guardar» para crear el ejercicio.</p>
              )}
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                {faltas.map((it, i) => (
                  <li key={i}>
                    <button type="button"
                      onClick={() => (it.vis && onToggleVisibility ? onToggleVisibility() : it.go && goStep(it.go))}
                      style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", padding: "9px 11px", borderRadius: 9, border: `1px solid ${C.line}`, background: C.paper2, cursor: "pointer", fontFamily: FONT_SANS }}>
                      <span style={{ color: C.muted, fontSize: 13, flexShrink: 0 }}>○</span>
                      <span style={{ flex: 1, fontSize: 12.5, color: C.ink2 }}>{it.txt}</span>
                      <span style={{ fontSize: 11.5, color: C.quiz, fontWeight: 600, whiteSpace: "nowrap" }}>
                        {it.actionLabel}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        {/* ── Panel 2: publicación (solo tras guardar) ── */}
        {!isCreating && (
          <div style={{ ...S.card, marginBottom: 0 }}>
            <div style={{ ...S.row, justifyContent: "space-between", gap: 10, marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{visible ? "Visible para alumnos" : "Oculto para alumnos"}</div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>Aparece en sus listas y unidades</div>
              </div>
              {onToggleVisibility && <Switch on={visible} onToggle={onToggleVisibility} label="Visible para alumnos" />}
            </div>

            <div>
              <label style={{ ...S.label, marginBottom: 6 }}>Unidades</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                {inUnits.map((u) => (
                  <span key={u.id} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: C.paper2, border: `1px solid ${C.line}`, borderRadius: 999, padding: "4px 6px 4px 11px", fontSize: 12, color: C.ink2 }}>
                    {u.name || "Unidad"}
                    {onRemoveFromUnit && (
                      <button type="button" onClick={() => onRemoveFromUnit(u.id)} title="Quitar de la unidad" aria-label={`Quitar de ${u.name || "la unidad"}`}
                        style={{ border: "none", background: "none", cursor: "pointer", color: C.muted, fontSize: 13, lineHeight: 1, padding: "0 2px" }}>×</button>
                    )}
                  </span>
                ))}
                {inUnits.length === 0 && <span style={{ fontSize: 12, color: C.muted }}>Sin unidades.</span>}
                {onAddToUnit && outUnits.length > 0 && (
                  <Menu align="left" ariaLabel="Añadir a unidad" panelStyle={{ minWidth: 200 }}
                    trigger={({ open, toggle, triggerRef }) => (
                      <button ref={triggerRef} onClick={toggle} aria-haspopup="menu" aria-expanded={open}
                        style={{ border: `1px dashed ${C.rail}`, background: "transparent", borderRadius: 999, padding: "4px 11px", fontSize: 12, color: C.ink2, cursor: "pointer", fontFamily: FONT_SANS }}>
                        + Añadir a unidad
                      </button>
                    )}>
                    {({ close }) => outUnits.map((u) => (
                      <button key={u.id} role="menuitem" onClick={() => { close(); onAddToUnit(u.id); }}
                        style={{ display: "block", width: "100%", boxSizing: "border-box", textAlign: "left", padding: "8px 10px", borderRadius: 7, border: "none", background: "transparent", cursor: "pointer", fontFamily: FONT_SANS, fontSize: 12.5, color: C.ink2 }}>
                        {u.name || "Unidad"}
                      </button>
                    ))}
                  </Menu>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Acciones ── */}
        <div style={{ display: "flex", gap: 10, gridColumn: isDesktop ? "1 / -1" : "auto" }}>
          {guardedOnPreview && (
            <button onClick={() => guardedOnPreview()} style={{ ...S.btn, flex: 1, padding: "12px 16px" }}>Previsualizar</button>
          )}
          <button onClick={handleSave} disabled={!canSave} style={{ ...S.btnPrimary, flex: 1, padding: "12px 16px", opacity: canSave ? 1 : 0.5, cursor: canSave ? "pointer" : "default" }}>
            Guardar
          </button>
        </div>
      </div>
    </>
  );
}
