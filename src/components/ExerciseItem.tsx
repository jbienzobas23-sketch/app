// ═══ EXERCISEITEM (M2) ═══════════════════════════════════════════════════════
// Sustituye a las seis variantes de fila/tarjeta (ExerciseCard/ExerciseRow en
// student.tsx, TeacherExerciseRow/TeacherExerciseCard en teacher.tsx,
// TeacherExCard en courses.tsx): un único componente con la especificación de
// contenido definitiva (M2.1) para las tres listas (alumno, banco, unidades) y
// los dos roles. La forma visual (tarjeta/fila, tamaño compacto) es el único
// eje que varía por contexto — el contenido es idéntico.
import { useState } from "react";
import type { Exercise, ExerciseResult } from "../lib/types.js";
import { C, F, S } from "../theme/tokens.js";
import { fmtClock } from "../lib/time.js";
import { partsOf, modelsOf, partKeyReadyOf, composersOf, durationOf, resultStatusOf } from "../lib/domain.js";
import { rowButtonProps } from "../lib/a11y.js";
import { Chevron, ScoreBadge } from "./primitives.jsx";
import { ExercisePlate } from "./TypePlate.jsx";
import { KebabMenu } from "./courses.jsx";

type AskConfirm = (message: string, onConfirm: () => void, confirmLabel?: string) => void;

interface ExerciseItemProps {
  ex: Exercise;
  variant: "grid" | "row";
  compact?: boolean;
  role: "student" | "teacher";

  // alumno
  result?: ExerciseResult | null;
  onOpen?: (ex: Exercise) => void;
  onViewCorrection?: (ex: Exercise) => void;

  // profesor
  onEdit?: (ex: Exercise) => void;
  onPreview?: (ex: Exercise) => void;
  onToggleVisibility?: (ex: Exercise) => void;
  onDuplicate?: (ex: Exercise) => void;
  onDelete?: (ex: Exercise) => void;
  onCorrect?: (ex: Exercise) => void;
  submissionsCount?: number;
  pendingCount?: number;

  // contexto de unidad (ambos roles)
  onRemoveFromUnit?: () => void;
  askConfirm?: AskConfirm;
}

const fmtDate = (ts: number): string =>
  new Date(ts).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });

export function ExerciseItem({
  ex, variant, compact = false, role,
  result = null, onOpen, onViewCorrection,
  onEdit, onPreview, onToggleVisibility, onDuplicate, onDelete, onCorrect,
  submissionsCount = 0, pendingCount = 0,
  onRemoveFromUnit, askConfirm,
}: ExerciseItemProps) {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(false);
  const isHidden = !!ex.hidden;
  const isGrid = variant === "grid";

  // ── Meta línea colapsada: «compositor · duración» ──────────────────────────
  // showComposer solo gobierna la vista del alumno — el profesor siempre ve el
  // compositor real (lo necesita para gestionar, aunque lo oculte a la clase).
  const composers = composersOf(ex);
  const showComposerHere = role === "student" ? (ex.showComposer !== false) : true;
  const composerLabel = showComposerHere
    ? (composers.length > 1 ? "Varios" : composers[0])
    : undefined;
  const parts  = partsOf(ex);
  const partsN = parts.length;
  const isMultiPart = partsN > 1;
  // M2.1 revisado (Jon, 2026-07-04): la duración NO va en la línea colapsada
  // (no aporta a primera vista y roba sitio al título) — baja al detalle.
  const durationDetail = isMultiPart ? `${partsN} audios · ${fmtClock(durationOf(ex))}` : `Duración ${fmtClock(durationOf(ex))}`;

  // ── Claves por (parte, modelo): para el desglose de excepción del profesor ──
  const models = modelsOf(ex);
  let readySlots = 0;
  let firstIncompletePart: (typeof parts)[number] | null = null;
  parts.forEach((p) => {
    models.forEach((m) => { if (partKeyReadyOf(ex, p, [m])) readySlots++; });
    if (!firstIncompletePart && !partKeyReadyOf(ex, p, models)) firstIncompletePart = p;
  });
  const totalSlots = parts.length * models.length;
  const keyReady = totalSlots > 0 && readySlots === totalSlots;

  // Menos ruido (Jon, 2026-07-04): la tarjeta colapsada solo interrumpe con lo
  // ACCIONABLE — "N pendientes" (hay entregas por corregir). "Borrador" y
  // "Oculto" salen de aquí: lo oculto ya se ve por el atenuado de la tarjeta y
  // el borrador se explica al desplegar ("Claves x de y").
  const statusBits: { text: string; amber?: boolean }[] = (role === "teacher" && pendingCount > 0)
    ? [{ text: `${pendingCount} pendiente${pendingCount === 1 ? "" : "s"}`, amber: true }]
    : [];

  const isDone = result != null;
  const isCorrected = result?.teacherCorrection?.corrected;

  // ── Tamaños responsivos (idénticos a los de las 6 variantes que sustituye) ──
  const plateSize = isGrid ? 38 : (compact ? 30 : 36);
  const plateRadius = isGrid ? 10 : (compact ? 9 : 10);
  const headGap = isGrid ? 12 : (compact ? 9 : 14);
  const headMinH = isGrid ? 76 : (compact ? undefined : 66);
  const headPad = compact ? "11px 13px" : "12px 16px";
  const titleSize = compact ? 16 : 17;
  const borderRadius = isGrid ? 14 : (compact ? 10 : 14);

  const toggle = () => setOpen((o) => !o);

  return (
    <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        display: "flex", flexDirection: "column", boxSizing: "border-box",
        background: C.paper, border: `1px solid ${hover && isGrid ? C.rail : C.line}`,
        borderRadius, overflow: "hidden", opacity: isHidden ? 0.6 : 1,
        boxShadow: hover && isGrid ? "0 6px 20px rgba(26,25,21,0.09)" : "none",
        transition: "box-shadow .18s, border-color .18s, opacity .2s",
      }}>
      <div onClick={toggle} {...rowButtonProps(toggle)} aria-expanded={open}
        style={{ display: "flex", alignItems: "center", gap: headGap, ...(headMinH ? { minHeight: headMinH } : {}), boxSizing: "border-box", padding: headPad, cursor: "pointer", userSelect: "none" }}>
        <ExercisePlate ex={ex} size={plateSize} radius={plateRadius} />
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 1 }}>
          <div style={{
            fontFamily: F.serif, fontSize: titleSize, fontWeight: 600,
            color: isHidden ? C.muted : C.ink, lineHeight: 1.2,
            overflow: "hidden", textOverflow: "ellipsis",
            ...(compact ? { whiteSpace: "nowrap" as const } : { display: "-webkit-box" as const, WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const }),
          }}>
            {ex.title}
          </div>
          {composerLabel && (
            <div style={{ fontFamily: F.sans, fontSize: 11.5, fontWeight: 400, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{composerLabel}</div>
          )}
        </div>
        {/* Menos ruido (Jon, 2026-07-04): sin "Pendiente" en cada tarjeta no
            hecha — la ausencia de nota ya lo dice; la insignia solo aparece
            cuando hay entrega (información real, no relleno). */}
        {role === "student" && isDone && (
          <ScoreBadge score={result!.score ?? null} status={resultStatusOf(result, ex)} />
        )}
        {/* Estado del profesor: un nivel jerárquico POR DEBAJO del compositor
            (Jon, 2026-07-04) — versalitas de 9px muy apagadas junto al chevron,
            nunca mezclado con los metadatos de contenido de la obra. */}
        {statusBits.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2, flexShrink: 0 }}>
            {statusBits.map((b) => (
              <span key={b.text} style={{ fontFamily: F.sans, fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: b.amber ? "#d47800" : C.chevron, whiteSpace: "nowrap" }}>
                {b.text}
              </span>
            ))}
          </div>
        )}
        <Chevron open={open} />
      </div>

      <div className={`fa-expand${open ? " fa-open" : ""}`}>
        <div className="fa-expand-inner">
          <div style={{ borderTop: `1px solid ${C.line}`, padding: compact ? "11px 13px 13px" : "11px 16px 14px", display: "flex", flexDirection: "column", gap: 10, background: C.bg }}>

            {role === "student" ? (
              <>
                {/* Una sola fila de metadatos (Jon, 2026-07-04): duración y
                    entrega juntas — misma estructura compacta que el profesor. */}
                <div style={{ fontFamily: F.sans, fontSize: 12, color: C.muted }}>
                  {durationDetail}
                  {isDone && (
                    <span style={{ color: C.ink2 }}>
                      {" · "}
                      {result!.timestamp ? `Entregado el ${fmtDate(result!.timestamp)}` : "Entregado"}
                      {result!.score != null && ` · ${result!.score}%${isCorrected ? " ✓" : ""}`}
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }} onClick={(e) => e.stopPropagation()}>
                  {isDone && onViewCorrection && (
                    <button onClick={() => onViewCorrection(ex)} className="fa-pressable"
                      style={{ ...S.btn, fontSize: 12.5, padding: "8px 14px", color: isCorrected ? C.quiz : C.fnS, borderColor: isCorrected ? C.quiz : C.fnS }}>
                      {isCorrected ? "Ver corrección ✓" : "Ver entrega"}
                    </button>
                  )}
                  {onOpen && (
                    <button onClick={() => onOpen(ex)} className="fa-pressable"
                      style={isDone ? { ...S.btn, fontSize: 12.5, padding: "8px 14px" } : { ...S.btnPrimary, fontSize: 12.5, padding: "8px 16px" }}>
                      {isDone ? "Repetir" : "Iniciar →"}
                    </button>
                  )}
                </div>
              </>
            ) : (
              <>
                {/* Una sola fila de metadatos (Jon, 2026-07-04): duración y
                    claves juntas, con el ⋯ aprovechando el hueco a la derecha
                    — antes eran tres filas (duración / claves / ⋯ huérfano). */}
                <div style={{ display: "flex", alignItems: "center", gap: 8 }} onClick={(e) => e.stopPropagation()}>
                  <div style={{ fontFamily: F.sans, fontSize: 12, color: C.muted, flex: 1, minWidth: 0 }}>
                    {durationDetail}
                    {!keyReady && (
                      <>
                        {" · "}
                        <button onClick={() => onEdit?.(ex)} className="fa-pressable"
                          title="Faltan claves de corrección — abrir el editor"
                          style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: F.sans, fontSize: 12, color: C.ink2, textDecoration: "underline", textUnderlineOffset: 2 }}>
                          Claves {readySlots} de {totalSlots}
                          {/* Nombrar la parte solo si hay más de una — con una sola
                              parte sintetizada, su título ES el del ejercicio. */}
                          {isMultiPart && firstIncompletePart && ` — falta ${(firstIncompletePart as { title?: string }).title || `Audio ${parts.indexOf(firstIncompletePart) + 1}`}`}
                        </button>
                      </>
                    )}
                  </div>
                  {(onDuplicate || onDelete || onRemoveFromUnit) && askConfirm && (
                    <KebabMenu title={`Más acciones de "${ex.title}"`} items={[
                      ...(onDuplicate ? [{ label: "Duplicar ejercicio", onClick: () => onDuplicate(ex) }] : []),
                      ...(onRemoveFromUnit ? [{ label: "Quitar de la unidad", onClick: () => askConfirm(`¿Quitar "${ex.title}" de esta unidad?\n\nEl ejercicio permanecerá en el banco global.`, onRemoveFromUnit) }] : []),
                      ...(onDelete ? [{ label: "Eliminar ejercicio", danger: true, onClick: () => askConfirm(`¿Eliminar "${ex.title}"?\n\nEsta acción no se puede deshacer.`, () => onDelete(ex)) }] : []),
                    ]} />
                  )}
                </div>
                {submissionsCount > 0 && (
                  <div style={{ fontFamily: F.sans, fontSize: 12.5, color: C.ink2, display: "flex", alignItems: "center", gap: 6 }}>
                    <span>
                      {submissionsCount} entrega{submissionsCount === 1 ? "" : "s"}
                      {pendingCount > 0 && ` · ${pendingCount} pendiente${pendingCount === 1 ? "" : "s"}`}
                    </span>
                    {pendingCount > 0 && onCorrect && (
                      <button onClick={(e) => { e.stopPropagation(); onCorrect(ex); }} className="fa-pressable"
                        style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: F.sans, fontSize: 12.5, fontWeight: 600, color: C.fnS, textDecoration: "underline" }}>
                        → Corregir
                      </button>
                    )}
                  </div>
                )}
                {/* Acciones CON TEXTO (Jon, 2026-07-04): los iconos sueltos
                    (lápiz/play/ojo) no son intuitivos para usuarios nuevos.
                    Solo lo infrecuente/destructivo queda plegado en el ⋯. */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }} onClick={(e) => e.stopPropagation()}>
                  {onEdit && (
                    <button onClick={() => onEdit(ex)} className="fa-pressable"
                      style={{ ...S.btnPrimary, fontSize: 12.5, padding: "8px 16px" }}>
                      Editar
                    </button>
                  )}
                  {onPreview && (
                    <button onClick={() => onPreview(ex)} className="fa-pressable"
                      title={`Previsualizar "${ex.title}" como alumno`}
                      style={{ ...S.btn, fontSize: 12.5, padding: "8px 14px" }}>
                      Previsualizar
                    </button>
                  )}
                  {onToggleVisibility && (
                    <button onClick={() => onToggleVisibility(ex)} className="fa-pressable"
                      title={isHidden ? "Volver a mostrar este ejercicio a los alumnos" : "Dejar de mostrar este ejercicio a los alumnos"}
                      style={{ ...S.btn, fontSize: 12.5, padding: "8px 14px" }}>
                      {isHidden ? "Mostrar" : "Ocultar"}
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
