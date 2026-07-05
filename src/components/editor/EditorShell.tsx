// ═══ EDITORSHELL (M5 · reordenado M5.8) ═══════════════════════════════════════
// Reescritura de ExerciseDetailView como asistente por pasos, con navegación
// libre, resumen vivo y ?paso= en la query. Orden pedido por Jon (2026-07-05):
// Identidad (título + modelo) · Audios (+ compositor) · Categorías (solo
// interactivo) · Claves · Revisión. Por eso el asistente tiene 5 pasos en
// interactivo y 4 en cuestionario/esquema. El estado y el guardado viven en
// useExerciseEditor (extraídos verbatim); esto es la presentación.
import { useState } from "react";
import type { Unit, Category } from "../../lib/types.js";
import { C, F, S, FONT_SANS } from "../../theme/tokens.js";
import { keyReadyOf, partsOf, partKeyReadyOf, modelsOf } from "../../lib/domain.js";
import { parseHashQuery, setHashQuery } from "../../lib/routing.js";
import { useIsMobile } from "../../hooks/useIsMobile.js";
import { ConfirmModal, Menu } from "../primitives.jsx";
import { AudioLibraryPickerModal } from "../modals.js";
import { useExerciseEditor, type ExerciseEditorProps, type EditorApi } from "./useExerciseEditor.js";
import { PasoIdentidad } from "./PasoIdentidad.js";
import { PasoAudios } from "./PasoAudios.js";
import { PasoCategorias } from "./PasoCategorias.js";
import { PasoClaves } from "./PasoClaves.js";
import { PasoRevision, type Falta } from "./PasoRevision.js";

// Props de publicación (paso Revisión) — opcionales; se conectan desde TeacherDash.
export interface EditorShellProps extends ExerciseEditorProps {
  units?: Unit[];
  onToggleVisibility?: () => void;
  onAddToUnit?: (unitId: string) => void;
  onRemoveFromUnit?: (unitId: string) => void;
  onAddCategory?: (c: Category) => void;
}

type StepKey = "identidad" | "audios" | "categorias" | "claves" | "revision";
const STEP_LABELS: Record<StepKey, string> = {
  identidad: "Identidad", audios: "Audios", categorias: "Categorías", claves: "Claves", revision: "Revisión",
};

// Pasos vigentes: «categorias» solo cuando el modelo incluye interactivo.
function stepKeysFor(ed: EditorApi): StepKey[] {
  const hasInteractivo = ed.selectedModels.includes("interactivo");
  return ["identidad", "audios", ...(hasInteractivo ? ["categorias" as const] : []), "claves", "revision"];
}

// ── Estado de cada paso (done · warn · todo) y sub-rótulo vivo ────────────────
function stepStates(ed: EditorApi) {
  const { title, isMultiPart, parts, hasExistingAudio, effDuration, exercise, isCreating, selectedCategoryIds } = ed;
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
  const catN = selectedCategoryIds.size;
  const states: Record<StepKey, { st: string; sub: string }> = {
    identidad:  { st: title.trim() ? "done" : "todo", sub: title.trim() || "Sin título" },
    audios:     { st: audiosOk ? "done" : "todo", sub: partsN > 1 ? `${partsN} audios` : (audiosOk ? "1 audio" : "Sin audio") },
    categorias: { st: "done", sub: `${catN} categoría${catN === 1 ? "" : "s"}` },
    claves:     { st: isCreating ? "todo" : (keysDone ? "done" : totalKeys ? "warn" : "todo"), sub: totalKeys ? `${readyKeys} de ${totalKeys} listas` : "—" },
    revision:   { st: allReady && visible ? "done" : "todo", sub: isCreating ? "Sin guardar" : (visible ? "Visible" : "Oculto") },
  };
  return { ...states, _allReady: allReady, _visible: visible, _readyKeys: readyKeys, _totalKeys: totalKeys };
}

export function EditorShell(props: EditorShellProps) {
  const ed = useExerciseEditor(props);
  const { units = [], onToggleVisibility, onAddToUnit, onRemoveFromUnit, onAddCategory } = props;

  const stepKeys = stepKeysFor(ed);

  // ?paso= sincronizado con la query (helpers de F3), ahora por clave de paso.
  const [step, setStepState] = useState<StepKey>(() => {
    const p = parseHashQuery().paso as StepKey | undefined;
    return p && (["identidad", "audios", "categorias", "claves", "revision"] as StepKey[]).includes(p) ? p : "identidad";
  });
  // Si el paso vigente ya no existe (p. ej. se dejó de usar interactivo), cae al primero.
  const activeStep: StepKey = stepKeys.includes(step) ? step : stepKeys[0];
  const goStep = (k: string) => { setStepState(k as StepKey); setHashQuery({ paso: k === "identidad" ? null : k }); window.scrollTo(0, 0); };

  const states = stepStates(ed);
  const isDesktop = !useIsMobile(899);

  const idx = stepKeys.indexOf(activeStep);
  const total = stepKeys.length;
  const prevKey = idx > 0 ? stepKeys[idx - 1] : null;
  const nextKey = idx < total - 1 ? stepKeys[idx + 1] : null;

  // Ancho ÚNICO de la columna de contenido para TODOS los pasos (Jon
  // 2026-07-05: «iguala la anchura de todas las pestañas»). Sin esto cada paso
  // ocupaba un ancho distinto (categorías estrecho, el resto a pantalla
  // completa) y el contenido "saltaba" al navegar. 680 da holgura al paso más
  // ancho (Claves en matriz, Revisión a dos columnas) sin sprawl horizontal. Se
  // acota el paso ENTERO (contenido + pie) para que todo quede alineado.
  const contentMax = 680;

  const overlineState = ed.isCreating || !states._allReady || !states._visible ? "Borrador" : "Lista ✓";

  // Guardar (con punto de sucio) + ⋯
  const saveDot = ed.isDirty || ed.isCreating;
  const menuItems = [
    ...(ed.guardedOnPreview ? [{ label: "Previsualizar como alumno", onClick: () => ed.guardedOnPreview!() }] : []),
    ...(onToggleVisibility && !ed.isCreating ? [{ label: ed.exercise.hidden ? "Mostrar a alumnos" : "Ocultar para alumnos", onClick: onToggleVisibility }] : []),
    ...(!ed.isCreating ? [{ label: "Eliminar ejercicio", danger: true, onClick: () => ed.setShowConfirmDel(true) }] : []),
  ];

  const stepContent = (() => {
    const common = { ed, goStep, num: idx + 1, total };
    if (activeStep === "identidad")  return <PasoIdentidad {...common} />;
    if (activeStep === "audios")     return <PasoAudios {...common} />;
    if (activeStep === "categorias") return <PasoCategorias {...common} onAddCategory={onAddCategory} />;
    if (activeStep === "claves")     return <PasoClaves {...common} />;
    return <PasoRevision {...common} units={units} onToggleVisibility={onToggleVisibility} onAddToUnit={onAddToUnit} onRemoveFromUnit={onRemoveFromUnit}
      allReady={states._allReady} visible={states._visible} readyKeys={states._readyKeys} totalKeys={states._totalKeys} faltas={faltasList(ed, states)} />;
  })();

  return (
    <div style={{ ...S.app, minHeight: "100dvh" }}>
      {/* ── Topbar ── */}
      <div style={{ position: "sticky", top: 0, zIndex: 40, background: "rgba(248,248,246,0.93)", backdropFilter: "blur(6px)", borderBottom: `1px solid ${C.line}`, padding: "10px 16px", display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={ed.guardedOnBack} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, color: C.ink2, padding: "6px 8px", borderRadius: 8, whiteSpace: "nowrap", fontFamily: F.sans }}>← Volver</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <button onClick={() => goStep("revision")} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: F.sans, fontSize: 9.5, letterSpacing: "1.4px", textTransform: "uppercase", color: C.muted, fontWeight: 600 }}>
            Ejercicio · <span style={{ textDecoration: "underline", textDecorationColor: C.rail, textUnderlineOffset: 2 }}>{overlineState}</span>
          </button>
          <button onClick={() => goStep("identidad")} title="Editar en Identidad" style={{ display: "block", background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left", maxWidth: "100%", fontFamily: F.serif, fontWeight: 700, fontSize: 19, lineHeight: 1.15, color: C.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
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
      {/* Ancho del marco = rail(290) + gap(22) + contenido(680) + padding(28) =
          1020, para que el CONJUNTO (rail + pasos) quede centrado en la página
          (margin auto) sin hueco a la derecha (Jon 2026-07-06). */}
      <div style={{ maxWidth: 1020, margin: "0 auto", padding: isDesktop ? "12px 14px 40px" : "12px 14px 96px", ...(isDesktop ? { display: "grid", gridTemplateColumns: "290px minmax(0,1fr)", gap: 22, alignItems: "start" } : {}) }}>
        {isDesktop ? (
          <aside style={{ position: "sticky", top: 72 }}>
            {states._allReady && states._visible && (
              <div style={{ borderRadius: 10, padding: "9px 12px", fontSize: 12.5, fontWeight: 600, background: "#eef4ee", border: "1px solid #cfe0cf", color: C.fnT, margin: "11px 11px 5px" }}>✓ Lista para alumnos</div>
            )}
            <div style={{ ...S.card, padding: 8, marginBottom: 0 }}>
              {stepKeys.map((k, i) => {
                const s = states[k];
                const cur = activeStep === k;
                return (
                  <button key={k} onClick={() => goStep(k)}
                    style={{ display: "flex", gap: 12, alignItems: "center", width: "100%", textAlign: "left", padding: "10px 10px", borderRadius: 10, border: "none", cursor: "pointer", position: "relative", background: cur ? C.field : "transparent" }}>
                    <StepNum n={i + 1} st={s.st} cur={cur} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      {/* Serif para el nombre del paso (misma jerarquía que un nombre de fila en el resto de la app: alumno, grupo, unidad…), no sans-serif de UI. */}
                      <b style={{ display: "block", fontFamily: F.serif, fontSize: 17, fontWeight: 600, lineHeight: 1.2, color: C.ink }}>{STEP_LABELS[k]}</b>
                      <span style={{ display: "block", fontSize: 11.5, color: C.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginTop: 2 }}>{s.sub}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </aside>
        ) : (
          <div className="fa-noscroll" style={{ display: "flex", gap: 6, overflowX: "auto", padding: "2px 2px 10px" }}>
            {stepKeys.map((k, i) => {
              const s = states[k];
              const cur = activeStep === k;
              return (
                <button key={k} onClick={() => goStep(k)}
                  style={{ display: "flex", gap: 7, alignItems: "center", border: `1px solid ${C.rail}`, background: cur ? C.ink : C.paper, color: cur ? C.paper : C.ink2, borderRadius: 999, padding: "6px 11px 6px 7px", fontSize: 11.5, fontWeight: 600, whiteSpace: "nowrap", cursor: "pointer" }}>
                  <StepNum n={i + 1} st={s.st} cur={cur} mobile />{STEP_LABELS[k]}
                </button>
              );
            })}
          </div>
        )}

        <main>
          <div style={contentMax ? { maxWidth: contentMax } : undefined}>
            {stepContent}
            {/* Pie de paso (escritorio) */}
            {isDesktop && nextKey && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 18, gap: 10 }}>
                <span>{prevKey && <button onClick={() => goStep(prevKey)} style={{ ...S.btn }}>← {STEP_LABELS[prevKey]}</button>}</span>
                <button onClick={() => goStep(nextKey)} style={{ ...S.btnPrimary }}>{STEP_LABELS[nextKey]} →</button>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Pie inferior fijo (móvil) */}
      {!isDesktop && (
        <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 45, background: "rgba(255,255,255,0.95)", backdropFilter: "blur(6px)", borderTop: `1px solid ${C.line}`, padding: "10px 14px calc(10px + env(safe-area-inset-bottom))", display: "flex", gap: 10 }}>
          {nextKey ? (
            <>
              {prevKey && <button onClick={() => goStep(prevKey)} style={{ ...S.btn, flex: 1, padding: 11 }}>← Anterior</button>}
              <button onClick={() => goStep(nextKey)} style={{ ...S.btnPrimary, flex: 1, padding: 11 }}>{STEP_LABELS[nextKey]} →</button>
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

// Lista de faltas para el paso Revisión (revisión por excepciones). Cada falta
// enlaza por CLAVE de paso (no por número), robusto al recuento dinámico.
function faltasList(ed: EditorApi, states: ReturnType<typeof stepStates>): Falta[] {
  const f: Falta[] = [];
  if (!ed.title.trim()) f.push({ txt: "Falta el título", go: "identidad", actionLabel: "Ir a Identidad →" });
  const audiosOk = ed.isMultiPart ? ed.parts.every((p) => !!p.audioUrl || !!p.audioName) : (ed.hasExistingAudio || ed.effDuration > 0);
  if (!audiosOk) f.push({ txt: "Añade el primer audio", go: "audios", actionLabel: "Ir a Audios →" });
  else if (states._totalKeys > 0 && states._readyKeys < states._totalKeys) f.push({ txt: `Claves incompletas (${states._readyKeys} de ${states._totalKeys})`, go: "claves", actionLabel: "Ir a Claves →" });
  if (!ed.isCreating && !states._visible) f.push({ txt: "Oculto para alumnos", go: null, vis: true, actionLabel: "Hacer visible" });
  return f;
}
