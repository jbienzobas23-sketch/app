// ═══ COMPONENTES DE ALUMNO ═══════════════════════════════════════════════════
// Barra de alternancia de modelos y tarjeta de ejercicio. Extraídos (Fase 2).
import { useState, type CSSProperties } from "react";
import type { Exercise, ExerciseResult } from "../lib/types.js";
import { C, S, F } from "../theme/tokens.js";
import { MODEL_META, modelMeta } from "../lib/modelMeta.js";
import { modelOf, modelsOf, categoriesOf, resultStatusOf, partsOf, durationOf, questionsCountOf, composersOf } from "../lib/domain.js";
import { fmt } from "../lib/ids.js";
import { rowButtonProps } from "../lib/a11y.js";
import { Chevron, MetaItem, CategoryDots, ScoreBadge } from "./primitives.jsx";
import { ExercisePlate } from "./TypePlate.jsx";

// ── Interfaces de props ──────────────────────────────────────────────────────
interface ModelToggleBarProps { models: string[]; activeIdx: number; onSwitch: (idx: number) => void; }
interface ExerciseRowProps { ex: Exercise; result?: ExerciseResult | null; onOpen: (ex: Exercise) => void; onViewCorrection?: (ex: Exercise) => void; compact?: boolean; }

// Barra de alternancia entre modelos (se inyecta entre título y waveform en sesiones con 2 modelos)
export function ModelToggleBar({ models, activeIdx, onSwitch }: ModelToggleBarProps) {
  if (!models || models.length < 2) return null;
  return (
    <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
      <div style={{
        display: "inline-flex",
        background: C.paper2,
        border: `1px solid ${C.line}`,
        borderRadius: 999,
        padding: 3,
        gap: 3,
      }}>
        {models.map((modelId, idx) => {
          const meta = MODEL_META[modelId] || MODEL_META.interactivo;
          const isActive = activeIdx === idx;
          return (
            <button
              key={modelId}
              type="button"
              onClick={() => onSwitch(idx)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "5px 16px",
                borderRadius: 999,
                border: "none",
                background: isActive ? C.ink : "transparent",
                color: isActive ? C.paper : C.ink2,
                cursor: "pointer",
                fontFamily: F.sans,
                fontSize: 12,
                fontWeight: isActive ? 600 : 400,
                transition: "background .15s, color .15s",
                whiteSpace: "nowrap",
              }}
            >
              <span style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: isActive ? "rgba(255,255,255,0.55)" : meta.color,
                flexShrink: 0,
                transition: "background .15s",
              }} />
              {meta.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Tarjeta de ejercicio (alumno) para la rejilla "Todos los ejercicios" —
// sistema de placas: placa de tipo (icono+color) + título; el resto de metadatos
// y las acciones (iniciar/repetir/ver entrega) aparecen al desplegar.
export function ExerciseCard({ ex, result, onOpen, onViewCorrection }: ExerciseRowProps) {
  const [open, setOpen]   = useState(false);
  const [hover, setHover] = useState(false);
  const meta      = modelMeta(ex);
  const exModels  = modelsOf(ex);
  const isQuiz    = modelOf(ex) === "cuestionario";
  const exQsN     = questionsCountOf(ex);
  const cats      = categoriesOf(ex);
  const allBtns   = cats.flatMap((c) => c.buttons || []);
  const isDone    = result != null;
  const score     = result?.score ?? null;
  const isCorrected = result?.teacherCorrection?.corrected;
  // Multiparte (F4, T4.5): «3 audios · 4:32» (durationOf suma las partes) y
  // «Compositores: varios» cuando difieren entre partes; con una parte,
  // idéntico a como se mostraba antes (ex.composerName + su opt-out).
  const partsN    = partsOf(ex).length;
  const composers = ex.showComposer !== false ? composersOf(ex) : [];
  // Alto mínimo de la cabecera → rejilla regular (placa + título + estado).
  const HEAD_H = 76;

  return (
    <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ display: "flex", flexDirection: "column", boxSizing: "border-box", background: C.paper, border: `1px solid ${hover ? C.rail : C.line}`, borderRadius: 14, overflow: "hidden", boxShadow: hover ? "0 6px 20px rgba(26,25,21,0.09)" : "none", transition: "box-shadow .18s, border-color .18s" }}>
      <div onClick={() => setOpen((o) => !o)} {...rowButtonProps(() => setOpen((o) => !o))} aria-expanded={open}
        style={{ display: "flex", alignItems: "center", gap: 12, minHeight: HEAD_H, boxSizing: "border-box", padding: "14px 16px", cursor: "pointer", userSelect: "none" }}>
        <ExercisePlate ex={ex} size={38} radius={10} />
        <div style={{ flex: 1, minWidth: 0, fontFamily: F.serif, fontSize: 17, fontWeight: 600, color: C.ink, lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{ex.title}</div>
        {isDone && <ScoreBadge score={score} status={resultStatusOf(result, ex)} />}
        {!isDone && <span style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 600, color: C.muted, flexShrink: 0, whiteSpace: "nowrap" }}>Pendiente</span>}
        <Chevron open={open} />
      </div>

      <div className={`fa-expand${open ? " fa-open" : ""}`}>
        <div className="fa-expand-inner">
          <div style={{ borderTop: `1px solid ${C.line}`, padding: "11px 16px 14px", display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: "12px 22px", background: C.bg }}>
            <MetaItem label="Tipo">
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: meta.color }} />
              {exModels.length > 1 ? exModels.map(m => MODEL_META[m]?.label).join(" + ") : meta.label}
            </MetaItem>
            <MetaItem label="Duración">{partsN > 1 ? `${partsN} audios · ${fmt(durationOf(ex))}` : fmt(durationOf(ex))}</MetaItem>
            {isQuiz
              ? <MetaItem label="Preguntas">{exQsN || "—"}</MetaItem>
              : allBtns.length > 0 && <MetaItem label="Categorías"><CategoryDots buttons={allBtns} /></MetaItem>}
            {composers.length > 0 && (
              <MetaItem label={composers.length > 1 ? "Compositores" : "Compositor"}>
                <span style={{ fontStyle: "italic" }}>{composers.length > 1 ? "Varios" : composers[0]}</span>
              </MetaItem>
            )}
            {isDone && (
              <MetaItem label="Resultado">
                <ScoreBadge score={score} status={resultStatusOf(result, ex)} />
              </MetaItem>
            )}
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
              {isDone && onViewCorrection && (
                <button onClick={(e) => { e.stopPropagation(); onViewCorrection(ex); }} className="fa-pressable"
                  style={{ ...S.btn, fontSize: 12.5, padding: "8px 14px", color: isCorrected ? C.quiz : C.fnS, borderColor: isCorrected ? C.quiz : C.fnS }}>
                  {isCorrected ? "Ver corrección ✓" : "Ver entrega"}
                </button>
              )}
              <button onClick={(e) => { e.stopPropagation(); onOpen(ex); }} className="fa-pressable"
                style={isDone
                  ? { ...S.btn, fontSize: 12.5, padding: "8px 14px" }
                  : { ...S.btnPrimary, fontSize: 12.5, padding: "8px 16px" }}>
                {isDone ? "Repetir" : "Iniciar →"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Fila de ejercicio a ancho completo (alumno) — sistema de placas: placa de tipo
// + título + estado (puntuación/completado); metadatos y acciones (iniciar/
// repetir/ver entrega) al desplegar. Se apila en la vista de curso.
export function ExerciseRow({ ex, result, onOpen, onViewCorrection, compact = false }: ExerciseRowProps) {
  const [open, setOpen] = useState(false);
  const meta      = modelMeta(ex);
  const exModels  = modelsOf(ex);
  const isQuiz    = modelOf(ex) === "cuestionario";
  const exQsN     = questionsCountOf(ex);
  const cats      = categoriesOf(ex);
  const allBtns   = cats.flatMap((c) => c.buttons || []);
  const isDone    = result != null;
  const score     = result?.score ?? null;
  const isCorrected = result?.teacherCorrection?.corrected;
  // Multiparte (F4, T4.5): «3 audios · 4:32» (durationOf suma las partes) y
  // «Compositores: varios» cuando difieren entre partes; con una parte,
  // idéntico a como se mostraba antes (ex.composerName + su opt-out).
  const partsN    = partsOf(ex).length;
  const composers = ex.showComposer !== false ? composersOf(ex) : [];
  // Variante compacta (móvil): placa/título/medidas menores y título a una línea.
  const titleStyle: CSSProperties = compact
    ? { flex: 1, minWidth: 0, fontFamily: F.serif, fontSize: 16, fontWeight: 600, color: C.ink, lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }
    : { flex: 1, minWidth: 0, fontFamily: F.serif, fontSize: 17, fontWeight: 600, color: C.ink, lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" };

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0, background: C.paper, border: `1px solid ${C.line}`, borderRadius: compact ? 10 : 14, overflow: "hidden" }}>
      <div onClick={() => setOpen((o) => !o)} {...rowButtonProps(() => setOpen((o) => !o))} aria-expanded={open}
        style={{ display: "flex", alignItems: "center", gap: compact ? 9 : 14, ...(compact ? {} : { minHeight: 66 }), boxSizing: "border-box", padding: compact ? "11px 13px" : "12px 16px", cursor: "pointer", userSelect: "none" }}>
        <ExercisePlate ex={ex} size={compact ? 30 : 36} radius={compact ? 9 : 10} />
        <div style={titleStyle}>
          {ex.title}
        </div>
        {isDone && <ScoreBadge score={score} status={resultStatusOf(result, ex)} />}
        <Chevron open={open} />
      </div>

      <div className={`fa-expand${open ? " fa-open" : ""}`}>
        <div className="fa-expand-inner">
          <div style={{ borderTop: `1px solid ${C.line}`, padding: "11px 16px 14px", display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: "12px 22px", background: C.bg }}>
            <MetaItem label="Tipo">
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: meta.color }} />
              {exModels.length > 1 ? exModels.map(m => MODEL_META[m]?.label).join(" + ") : meta.label}
            </MetaItem>
            <MetaItem label="Duración">{partsN > 1 ? `${partsN} audios · ${fmt(durationOf(ex))}` : fmt(durationOf(ex))}</MetaItem>
            {isQuiz
              ? <MetaItem label="Preguntas">{exQsN || "—"}</MetaItem>
              : allBtns.length > 0 && <MetaItem label="Categorías"><CategoryDots buttons={allBtns} /></MetaItem>}
            {composers.length > 0 && (
              <MetaItem label={composers.length > 1 ? "Compositores" : "Compositor"}>
                <span style={{ fontStyle: "italic" }}>{composers.length > 1 ? "Varios" : composers[0]}</span>
              </MetaItem>
            )}
            {isDone && (
              <MetaItem label="Resultado">
                <ScoreBadge score={score} status={resultStatusOf(result, ex)} />
              </MetaItem>
            )}
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
              {isDone && onViewCorrection && (
                <button onClick={(e) => { e.stopPropagation(); onViewCorrection(ex); }} className="fa-pressable"
                  style={{ ...S.btn, fontSize: 12.5, padding: "8px 14px", color: isCorrected ? C.quiz : C.fnS, borderColor: isCorrected ? C.quiz : C.fnS }}>
                  {isCorrected ? "Ver corrección ✓" : "Ver entrega"}
                </button>
              )}
              <button onClick={(e) => { e.stopPropagation(); onOpen(ex); }} className="fa-pressable"
                style={isDone
                  ? { ...S.btn, fontSize: 12.5, padding: "8px 14px" }
                  : { ...S.btnPrimary, fontSize: 12.5, padding: "8px 16px" }}>
                {isDone ? "Repetir" : "Iniciar →"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
