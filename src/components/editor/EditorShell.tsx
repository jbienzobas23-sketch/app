// ═══ EDITORSHELL (M5) ═════════════════════════════════════════════════════════
// Reescritura de ExerciseDetailView como asistente de 5 pasos (Identidad ·
// Modelo · Audios · Claves · Revisión) según docs/especificacion_editor.html —
// navegación libre, resumen vivo, ?paso= en la query. El estado y el guardado
// viven en useExerciseEditor (extraídos verbatim); esto es la presentación.
import { useState, useEffect } from "react";
import type { Unit } from "../../lib/types.js";
import { C, F, S, FONT_SANS } from "../../theme/tokens.js";
import { keyReadyOf, partsOf, partKeyReadyOf, modelsOf } from "../../lib/domain.js";
import { parseHashQuery, setHashQuery } from "../../lib/routing.js";
import { ConfirmModal, Menu } from "../primitives.jsx";
import { AudioLibraryPickerModal } from "../modals.js";
import { useExerciseEditor, type ExerciseEditorProps, type EditorApi } from "./useExerciseEditor.js";
import { Paso1Identidad } from "./Paso1Identidad.js";
import { Paso2Modelo } from "./Paso2Modelo.js";
import { Paso3Audios } from "./Paso3Audios.js";
import { Paso4Claves } from "./Paso4Claves.js";
import { Paso5Revision } from "./Paso5Revision.js";

// Props de publicación (paso 5) — opcionales; se conectan desde TeacherDash.
export interface EditorShellProps extends ExerciseEditorProps {
  units?: Unit[];
  onToggleVisibility?: () => void;
  onAddToUnit?: (unitId: string) => void;
  onRemoveFromUnit?: (unitId: string) => void;
}

const STEP_LABELS = ["Identidad", "Modelo", "Audios", "Claves", "Revisión"];

// ── Estado de cada paso (done · warn · todo) y sub-rótulo vivo ────────────────
function stepStates(ed: EditorApi) {
  const { title, selectedModels, isMultiPart, parts, hasExistingAudio, effDuration, exercise, isCreating } = ed;
  const partsN = isMultiPart ? parts.length : 1;
  const audiosOk = isMultiPart ? parts.every((p) => !!p.audioUrl || !!p.audioName) : (hasExistingAudio || effDuration > 0);
  // Claves: keyReadyOf sobre el ejercicio guardado (las claves se graban aparte).
  const savedParts = isCreating ? [] : partsOf(exercise);
  const savedModels = modelsOf(exercise);
  const totalKeys = savedParts.length * savedModels.length;
  let readyKeys = 0;
  savedParts.forEach((p) => savedModels.forEach((m) => { if (partKeyReadyOf(exercise, p, [m])) readyKeys++; }));
  const keysDone = !isCreating && totalKeys > 0 && readyKeys === totalKeys;
  const allReady = !isCreating && keyReadyOf(exercise) && audiosOk;
  const visible  = !isCreating && !exercise.hidden;
  return {
    1: { st: title.trim() ? "done" : "todo", sub: title.trim() || "Sin título" },
    2: { st: "done", sub: selectedModels.join(" + ") },
    3: { st: audiosOk ? "done" : "todo", sub: partsN > 1 ? `${partsN} audios` : (audiosOk ? "1 audio" : "Sin audio") },
    4: { st: isCreating ? "todo" : (keysDone ? "done" : totalKeys ? "warn" : "todo"), sub: totalKeys ? `${readyKeys} de ${totalKeys} listas` : "—" },
    5: { st: allReady && visible ? "done" : "todo", sub: isCreating ? "Sin guardar" : (visible ? "Visible" : "Oculto") },
    _allReady: allReady, _visible: visible, _readyKeys: readyKeys, _totalKeys: totalKeys,
  } as const;
}

export function EditorShell(props: EditorShellProps) {
  const ed = useExerciseEditor(props);
  const { units = [], onToggleVisibility, onAddToUnit, onRemoveFromUnit } = props;

  // ?paso= sincronizado con la query (helpers de F3).
  const [step, setStepState] = useState<number>(() => {
    const n = parseInt(parseHashQuery().paso || "1", 10);
    return Number.isFinite(n) && n >= 1 && n <= 5 ? n : 1;
  });
  const goStep = (n: number) => { setStepState(n); setHashQuery({ paso: n === 1 ? null : String(n) }); window.scrollTo(0, 0); };

  const states = stepStates(ed);
  const isDesktop = useMediaMin(900);

  const overlineState = ed.isCreating || !states._allReady || !states._visible ? "Borrador" : "Lista ✓";

  // Guardar (con punto de sucio) + ⋯
  const saveDot = ed.isDirty || ed.isCreating;
  const menuItems = [
    ...(ed.guardedOnPreview ? [{ label: "Previsualizar como alumno", onClick: () => ed.guardedOnPreview!() }] : []),
    ...(onToggleVisibility && !ed.isCreating ? [{ label: ed.exercise.hidden ? "Mostrar a alumnos" : "Ocultar para alumnos", onClick: onToggleVisibility }] : []),
    ...(!ed.isCreating ? [{ label: "Eliminar ejercicio", danger: true, onClick: () => ed.setShowConfirmDel(true) }] : []),
  ];

  const stepContent = (() => {
    const common = { ed, goStep };
    if (step === 1) return <Paso1Identidad {...common} />;
    if (step === 2) return <Paso2Modelo {...common} />;
    if (step === 3) return <Paso3Audios {...common} />;
    if (step === 4) return <Paso4Claves {...common} />;
    return <Paso5Revision {...common} units={units} onToggleVisibility={onToggleVisibility} onAddToUnit={onAddToUnit} onRemoveFromUnit={onRemoveFromUnit}
      allReady={states._allReady} visible={states._visible} readyKeys={states._readyKeys} totalKeys={states._totalKeys} faltas={faltasList(ed, states)} />;
  })();

  return (
    <div style={{ ...S.app, minHeight: "100dvh" }}>
      {/* ── Topbar ── */}
      <div style={{ position: "sticky", top: 0, zIndex: 40, background: "rgba(248,248,246,0.93)", backdropFilter: "blur(6px)", borderBottom: `1px solid ${C.line}`, padding: "10px 16px", display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={ed.guardedOnBack} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, color: C.ink2, padding: "6px 8px", borderRadius: 8, whiteSpace: "nowrap", fontFamily: F.sans }}>← Volver</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <button onClick={() => goStep(5)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: F.sans, fontSize: 9.5, letterSpacing: "1.4px", textTransform: "uppercase", color: C.muted, fontWeight: 600 }}>
            Ejercicio · <span style={{ textDecoration: "underline", textDecorationColor: C.rail, textUnderlineOffset: 2 }}>{overlineState}</span>
          </button>
          <button onClick={() => goStep(1)} title="Editar en Identidad" style={{ display: "block", background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left", maxWidth: "100%", fontFamily: F.serif, fontWeight: 700, fontSize: 19, lineHeight: 1.15, color: C.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {ed.title.trim() || <span style={{ color: C.chevron, fontStyle: "italic" }}>Título del ejercicio</span>}
          </button>
        </div>
        <button onClick={ed.handleSave} disabled={!ed.canSave}
          style={{ ...S.btnPrimary, padding: "8px 14px", opacity: ed.canSave ? 1 : 0.5, cursor: ed.canSave ? "pointer" : "default" }}>
          Guardar{saveDot && <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "#e0b13d", marginLeft: 6, verticalAlign: "middle" }} />}
        </button>
        {menuItems.length > 0 && (
          <Menu align="right" ariaLabel="Más acciones" panelStyle={{ minWidth: 210 }}
            trigger={({ open, toggle, triggerRef }) => (
              <button ref={triggerRef} onClick={toggle} aria-haspopup="menu" aria-expanded={open} aria-label="Más acciones"
                style={{ ...S.btn, padding: "8px 10px", fontSize: 15, lineHeight: 1 }}>⋯</button>
            )}>
            {({ close }) => menuItems.map((it, i) => (
              <button key={i} role="menuitem" onClick={() => { close(); it.onClick(); }}
                style={{ display: "block", width: "100%", boxSizing: "border-box", textAlign: "left", padding: "8px 10px", borderRadius: 7, border: "none", background: "transparent", cursor: "pointer", fontFamily: F.sans, fontSize: 12.5, color: it.danger ? C.danger : C.ink2 }}>
                {it.label}
              </button>
            ))}
          </Menu>
        )}
      </div>

      {/* ── Marco: carril (escritorio) + contenido ── */}
      <div style={{ maxWidth: 1220, margin: "0 auto", padding: isDesktop ? "12px 14px 40px" : "12px 14px 96px", ...(isDesktop ? { display: "grid", gridTemplateColumns: "290px minmax(0,1fr)", gap: 22, alignItems: "start" } : {}) }}>
        {isDesktop ? (
          <aside style={{ position: "sticky", top: 72 }}>
            {states._allReady && states._visible && (
              <div style={{ borderRadius: 10, padding: "9px 12px", fontSize: 12.5, fontWeight: 600, background: "#eef4ee", border: "1px solid #cfe0cf", color: C.fnT, margin: "11px 11px 5px" }}>✓ Lista para alumnos</div>
            )}
            <div style={{ ...S.card, padding: 7, marginBottom: 0 }}>
              {[1, 2, 3, 4, 5].map((n) => {
                const s = states[n as 1 | 2 | 3 | 4 | 5];
                const cur = step === n;
                return (
                  <button key={n} onClick={() => goStep(n)}
                    style={{ display: "flex", gap: 11, alignItems: "center", width: "100%", textAlign: "left", padding: 9, borderRadius: 9, border: "none", cursor: "pointer", position: "relative", background: cur ? C.field : "transparent" }}>
                    <StepNum n={n} st={s.st} cur={cur} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <b style={{ display: "block", fontSize: 13, fontWeight: 600, color: C.ink }}>{STEP_LABELS[n - 1]}</b>
                      <span style={{ display: "block", fontSize: 11, color: C.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginTop: 1 }}>{s.sub}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </aside>
        ) : (
          <div className="fa-noscroll" style={{ display: "flex", gap: 6, overflowX: "auto", padding: "2px 2px 10px" }}>
            {[1, 2, 3, 4, 5].map((n) => {
              const s = states[n as 1 | 2 | 3 | 4 | 5];
              const cur = step === n;
              return (
                <button key={n} onClick={() => goStep(n)}
                  style={{ display: "flex", gap: 7, alignItems: "center", border: `1px solid ${C.rail}`, background: cur ? C.ink : C.paper, color: cur ? C.paper : C.ink2, borderRadius: 999, padding: "6px 11px 6px 7px", fontSize: 11.5, fontWeight: 600, whiteSpace: "nowrap", cursor: "pointer" }}>
                  <StepNum n={n} st={s.st} cur={cur} mobile />{STEP_LABELS[n - 1]}
                </button>
              );
            })}
          </div>
        )}

        <main>
          {stepContent}
          {/* Pie de paso (escritorio) */}
          {isDesktop && step < 5 && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 18, gap: 10 }}>
              <span>{step > 1 && <button onClick={() => goStep(step - 1)} style={{ ...S.btn }}>← {STEP_LABELS[step - 2]}</button>}</span>
              <button onClick={() => goStep(step + 1)} style={{ ...S.btnPrimary }}>{STEP_LABELS[step]} →</button>
            </div>
          )}
        </main>
      </div>

      {/* Pie inferior fijo (móvil) */}
      {!isDesktop && (
        <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 45, background: "rgba(255,255,255,0.95)", backdropFilter: "blur(6px)", borderTop: `1px solid ${C.line}`, padding: "10px 14px calc(10px + env(safe-area-inset-bottom))", display: "flex", gap: 10 }}>
          {step < 5 ? (
            <>
              {step > 1 && <button onClick={() => goStep(step - 1)} style={{ ...S.btn, flex: 1, padding: 11 }}>← Anterior</button>}
              <button onClick={() => goStep(step + 1)} style={{ ...S.btnPrimary, flex: 1, padding: 11 }}>{STEP_LABELS[step]} →</button>
            </>
          ) : (
            <>
              {ed.guardedOnPreview && <button onClick={() => ed.guardedOnPreview!()} style={{ ...S.btn, flex: 1, padding: 11 }}>Previsualizar</button>}
              <button onClick={ed.handleSave} disabled={!ed.canSave} style={{ ...S.btnPrimary, flex: 1, padding: 11, opacity: ed.canSave ? 1 : 0.5 }}>Guardar</button>
            </>
          )}
        </div>
      )}

      {/* ── Modales compartidos ── */}
      {ed.showLibraryPicker && (
        <AudioLibraryPickerModal library={ed.audioLibrary} onPick={ed.handlePickFromLibrary} onClose={() => ed.setShowLibraryPicker(false)} />
      )}
      {ed.libraryPickerForPart && (
        <AudioLibraryPickerModal library={ed.audioLibrary} onPick={(a) => ed.pickAudioForPart(ed.libraryPickerForPart!, a)} onClose={() => ed.setLibraryPickerForPart(null)} />
      )}
      {ed.showConfirmDel && (
        <ConfirmModal message={`¿Eliminar "${ed.title || "este ejercicio"}"?\n\nEsta acción no se puede deshacer.`}
          onConfirm={ed.onDelete} onCancel={() => ed.setShowConfirmDel(false)} />
      )}
      {ed.pendingAction && (
        <ConfirmModal message="Tienes cambios sin guardar.\n\n¿Descartarlos y continuar?" confirmLabel="Descartar y continuar"
          onConfirm={() => { const a = ed.pendingAction!; ed.setPendingAction(null); a(); }} onCancel={() => ed.setPendingAction(null)} />
      )}
      {ed.confirmDeletePart && (
        <ConfirmModal message="¿Eliminar esta parte?\n\nSe pierde su audio y su clave." confirmLabel="Eliminar parte"
          onConfirm={() => { ed.removePart(ed.confirmDeletePart!); ed.setConfirmDeletePart(null); }} onCancel={() => ed.setConfirmDeletePart(null)} />
      )}
    </div>
  );
}

// Círculo con el número / ✓ / ! del paso.
function StepNum({ n, st, cur, mobile = false }: { n: number; st: string; cur: boolean; mobile?: boolean }) {
  const sz = mobile ? 20 : 24;
  const bg = st === "done" ? "#eef4ee" : st === "warn" ? "#faf4e4" : (mobile ? "transparent" : C.paper);
  const bd = cur ? C.ink : st === "done" ? "#9dbb9d" : st === "warn" ? "#d9c98e" : C.rail;
  const col = st === "done" ? C.fnT : st === "warn" ? "#a07a1f" : (cur ? C.ink : C.muted);
  return (
    <span style={{ width: sz, height: sz, borderRadius: "50%", border: `1.5px solid ${bd}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: mobile ? 10.5 : 11.5, fontWeight: 700, color: col, flex: "none", background: bg, fontFamily: FONT_SANS }}>
      {st === "done" ? "✓" : st === "warn" ? "!" : n}
    </span>
  );
}

// Lista de faltas para el paso 5 (revisión por excepciones).
function faltasList(ed: EditorApi, states: ReturnType<typeof stepStates>): { txt: string; go: number }[] {
  const f: { txt: string; go: number }[] = [];
  if (!ed.title.trim()) f.push({ txt: "Falta el título", go: 1 });
  const audiosOk = ed.isMultiPart ? ed.parts.every((p) => !!p.audioUrl || !!p.audioName) : (ed.hasExistingAudio || ed.effDuration > 0);
  if (!audiosOk) f.push({ txt: "Añade el primer audio", go: 3 });
  else if (states._totalKeys > 0 && states._readyKeys < states._totalKeys) f.push({ txt: `Claves incompletas (${states._readyKeys} de ${states._totalKeys})`, go: 4 });
  if (!ed.isCreating && !states._visible) f.push({ txt: "Oculto para alumnos", go: 5 });
  return f;
}

// Hook minimal de media-query (escritorio ≥ px).
function useMediaMin(px: number): boolean {
  const [m, setM] = useState(() => typeof window !== "undefined" && window.matchMedia(`(min-width:${px}px)`).matches);
  useEffect(() => {
    const mq = window.matchMedia(`(min-width:${px}px)`);
    const on = () => setM(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [px]);
  return m;
}
