// ═══ COMPONENTES DE ALUMNO ═══════════════════════════════════════════════════
// Barra de alternancia de modelos y tarjeta de ejercicio. Extraídos (Fase 2).
import { useState } from "react";
import type { Exercise, ExerciseResult } from "../lib/types.js";
import { C, S, F } from "../theme/tokens.js";
import { MODEL_META, modelMeta } from "../lib/modelMeta.js";
import { modelOf, modelsOf, questionsOf, categoriesOf } from "../lib/domain.js";
import { fmt } from "../lib/ids.js";
import { scoreBg, scoreColor } from "../lib/color.js";
import { rowButtonProps } from "../lib/a11y.js";
import { StatusCircle, Chevron, MetaItem, CategoryDots } from "./primitives.jsx";

// ── Interfaces de props ──────────────────────────────────────────────────────
interface ModelToggleBarProps { models: string[]; activeIdx: number; onSwitch: (idx: number) => void; }
interface ExerciseRowProps { ex: Exercise; result?: ExerciseResult | null; onOpen: (ex: Exercise) => void; onViewCorrection?: (ex: Exercise) => void; }

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
// mismo lenguaje editorial que la vista del profesor (altura uniforme, modelo en
// líneas horizontales, acciones al desplegar).
export function ExerciseCard({ ex, result, onOpen, onViewCorrection }: ExerciseRowProps) {
  const [open, setOpen]   = useState(false);
  const [hover, setHover] = useState(false);
  const meta      = modelMeta(ex);
  const exModels  = modelsOf(ex);
  const isQuiz    = modelOf(ex) === "cuestionario";
  const exQs      = questionsOf(ex);
  const cats      = categoriesOf(ex);
  const allBtns   = cats.flatMap((c) => c.buttons || []);
  const isDone    = result != null;
  const score     = result?.score ?? null;
  const isCorrected = result?.teacherCorrection?.corrected;
  // Cabecera de altura fija → rejilla uniforme (igual que la tarjeta del profesor)
  const HEAD_H = 106;

  return (
    <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ display: "flex", flexDirection: "column", boxSizing: "border-box", background: C.paper, border: `1px solid ${hover ? C.rail : C.line}`, borderRadius: 14, overflow: "hidden", boxShadow: hover ? "0 6px 20px rgba(26,25,21,0.09)" : "none", transition: "box-shadow .18s, border-color .18s" }}>
      <div onClick={() => setOpen((o) => !o)} {...rowButtonProps(() => setOpen((o) => !o))} aria-expanded={open}
        style={{ display: "flex", alignItems: "center", gap: 13, height: HEAD_H, boxSizing: "border-box", padding: "14px 18px", cursor: "pointer", userSelect: "none" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: F.serif, fontSize: 19, fontWeight: 600, color: C.ink, lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{ex.title}</div>
          {/* Subrayado de modelo: un trazo de color por modelo */}
          <div style={{ display: "flex", gap: 3, margin: "8px 0 7px" }}>
            {exModels.map((m, i) => (
              <span key={i} title={MODEL_META[m]?.label} style={{ width: 30, height: 3, borderRadius: 2, background: MODEL_META[m]?.color || meta.color }} />
            ))}
          </div>
          {ex.composerName && ex.showComposer !== false && (
            <div style={{ fontFamily: F.sans, fontStyle: "italic", fontSize: 12, color: C.ink2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ex.composerName}</div>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 11, flexShrink: 0 }}>
          {isDone && score != null && (
            <span style={{ ...S.badge, background: scoreBg(score), color: scoreColor(score) }}>{score}%</span>
          )}
          {isDone && score == null && <StatusCircle done />}
          <Chevron open={open} />
        </div>
      </div>

      <div className={`fa-expand${open ? " fa-open" : ""}`}>
        <div className="fa-expand-inner">
          <div style={{ borderTop: `1px solid ${C.line}`, padding: "11px 18px 14px", display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: "12px 22px", background: C.bg }}>
            <MetaItem label="Tipo">
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: meta.color }} />
              {exModels.length > 1 ? exModels.map(m => MODEL_META[m]?.label).join(" + ") : meta.label}
            </MetaItem>
            <MetaItem label="Duración">{fmt(ex.duration ?? 0)}</MetaItem>
            {isQuiz
              ? <MetaItem label="Preguntas">{exQs.length || "—"}</MetaItem>
              : allBtns.length > 0 && <MetaItem label="Categorías"><CategoryDots buttons={allBtns} /></MetaItem>}
            {isDone && (
              <MetaItem label="Resultado">
                <StatusCircle done />
                {score != null ? `${score}%` : "Entregado"}
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

// Tarjeta colapsable de ejercicio (alumno) — franja de tipo + metadatos desplegables
export function ExerciseRow({ ex, result, onOpen, onViewCorrection }: ExerciseRowProps) {
  const [open, setOpen] = useState(false);
  const meta      = modelMeta(ex);
  const exModels  = modelsOf(ex);
  const isQuiz    = modelOf(ex) === "cuestionario";
  const exQs      = questionsOf(ex);
  const cats      = categoriesOf(ex);
  const allBtns   = cats.flatMap((c) => c.buttons || []);
  const isDone    = result != null;
  const score     = result?.score ?? null;
  const isCorrected = result?.teacherCorrection?.corrected;

  // Solo el botón principal en el header; "Ver entrega" aparece al desplegar
  const primaryButton = (
    <button onClick={(e) => { e.stopPropagation(); onOpen(ex); }} className="fa-pressable"
      style={isDone
        ? { ...S.btn, fontSize: 12.5, padding: "8px 14px", flexShrink: 0 }
        : { ...S.btnPrimary, fontSize: 12.5, padding: "8px 16px", flexShrink: 0 }}>
      {isDone ? "Repetir" : "Iniciar →"}
    </button>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0, background: C.paper, border: `1px solid ${C.line}`, borderRadius: 10, overflow: "hidden" }}>
      <div onClick={() => setOpen((o) => !o)} {...rowButtonProps(() => setOpen((o) => !o))} aria-expanded={open}
        style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", cursor: "pointer", userSelect: "none" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "block", fontFamily: F.serif, fontSize: 19, fontWeight: 600, color: C.ink, lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {ex.title}
          </span>
          {/* Subrayado de modelo: un trazo de color por modelo (igual que la tarjeta) */}
          <span style={{ display: "flex", gap: 3, margin: "7px 0 6px" }}>
            {exModels.map((m, i) => (
              <span key={i} title={MODEL_META[m]?.label} style={{ width: 30, height: 3, borderRadius: 2, background: MODEL_META[m]?.color || meta.color }} />
            ))}
          </span>
          {ex.composerName && ex.showComposer !== false && (
            <span style={{ display: "block", fontFamily: F.sans, fontStyle: "italic", fontSize: 12, color: C.ink2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {ex.composerName}
            </span>
          )}
        </div>
        {isDone && score != null && (
          <span style={{ ...S.badge, background: scoreBg(score), color: scoreColor(score), flexShrink: 0 }}>{score}%</span>
        )}
        {isDone && score == null && <StatusCircle done />}
        {/* Botón principal a la derecha */}
        <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", flexShrink: 0 }}>
          {primaryButton}
        </div>
        <Chevron open={open} />
      </div>

      <div className={`fa-expand${open ? " fa-open" : ""}`}>
        <div className="fa-expand-inner">
          <div style={{ borderTop: `1px solid ${C.line}`, padding: "11px 16px 14px", display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: "12px 22px", background: C.bg }}>
            <MetaItem label="Tipo">
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: meta.color }} />
              {exModels.length > 1 ? exModels.map(m => MODEL_META[m]?.label).join(" + ") : meta.label}
            </MetaItem>
            <MetaItem label="Duración">{fmt(ex.duration ?? 0)}</MetaItem>
            {isQuiz
              ? <MetaItem label="Preguntas">{exQs.length || "—"}</MetaItem>
              : allBtns.length > 0 && <MetaItem label="Categorías"><CategoryDots buttons={allBtns} /></MetaItem>}
            {isDone && (
              <MetaItem label="Resultado">
                <StatusCircle done />
                {score != null ? `${score}%` : "Entregado"}
              </MetaItem>
            )}
            {isDone && onViewCorrection && (
              <div style={{ marginLeft: "auto" }}>
                <button onClick={(e) => { e.stopPropagation(); onViewCorrection(ex); }} className="fa-pressable"
                  style={{ ...S.btn, fontSize: 12.5, padding: "8px 14px", color: isCorrected ? C.quiz : C.fnS, borderColor: isCorrected ? C.quiz : C.fnS }}>
                  {isCorrected ? "Ver corrección ✓" : "Ver entrega"}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
