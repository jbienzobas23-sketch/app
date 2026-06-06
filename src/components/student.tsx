// ═══ COMPONENTES DE ALUMNO ═══════════════════════════════════════════════════
// Barra de alternancia de modelos y tarjeta de ejercicio. Extraídos (Fase 2).
import { useState } from "react";
import type { Exercise, ExerciseResult } from "../lib/types.js";
import { C, S, F } from "../theme/tokens.js";
import { MODEL_META, modelMeta } from "../lib/modelMeta.js";
import { modelOf, modelsOf, questionsOf, categoriesOf } from "../lib/domain.js";
import { fmt } from "../lib/ids.js";
import { scoreBg, scoreColor } from "../lib/color.js";
import { useIsMobile } from "../hooks/useIsMobile.js";
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

// Tarjeta colapsable de ejercicio (alumno) — franja de tipo + metadatos desplegables
export function ExerciseRow({ ex, result, onOpen, onViewCorrection }: ExerciseRowProps) {
  const [open, setOpen] = useState(false);
  const isMobile  = useIsMobile();
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
    <div style={{ display: "flex", flex: 1, minWidth: 0, background: C.paper, border: `1px solid ${C.line}`, borderRadius: 10, overflow: "hidden" }}>
      {exModels.length > 1 ? (
        <div style={{ width: 10, flexShrink: 0, display: "flex", flexDirection: "column" }}>
          <div style={{ flex: 1, background: MODEL_META[exModels[0]]?.color || meta.color }} />
          <div style={{ flex: 1, background: MODEL_META[exModels[1]]?.color || meta.color }} />
        </div>
      ) : (
        <div style={{ width: 10, flexShrink: 0, background: meta.color }} />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div onClick={() => setOpen((o) => !o)}
          style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", cursor: "pointer", userSelect: "none" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontFamily: F.sans, fontSize: isMobile ? 15.5 : 16, fontWeight: 500, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>
              {ex.title}
            </span>
            {/* Solo compositor — el tipo ya lo dice la franja de color */}
            {ex.composerName && ex.showComposer !== false && (
              <span style={{ display: "block", fontFamily: F.sans, fontSize: 11, color: C.fnS, fontWeight: 500, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {ex.composerName}
              </span>
            )}
          </div>
          {isDone && score != null && (
            <span style={{ ...S.badge, background: scoreBg(score), color: scoreColor(score), flexShrink: 0 }}>{score}%</span>
          )}
          {isDone && score == null && <StatusCircle done />}
          {/* Botón principal a la derecha, alineado con el título */}
          <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", flexShrink: 0 }}>
            {primaryButton}
          </div>
          <Chevron open={open} />
        </div>

        <div className={`fa-expand${open ? " fa-open" : ""}`}>
          <div className="fa-expand-inner">
            <div style={{ borderTop: `1px solid ${C.line}`, padding: "10px 14px 12px", display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: "12px 24px", background: C.bg }}>
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
    </div>
  );
}
