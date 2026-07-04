// ═══ PRIMITIVOS UI COMPARTIDOS ═══════════════════════════════════════════════
// Modales, barras, inputs, iconos y botones-icono reutilizados por toda la app.
// Extraídos de App.jsx (Fase 2) sin cambiar su lógica ni su aspecto.
import React, { useState, useEffect, useRef, useCallback, type ReactNode, type CSSProperties, type RefObject } from "react";
import { createPortal } from "react-dom";
import { C, S, F, FONT_SANS, disabledStyle } from "../theme/tokens.js";
import { scoreBg, scoreColor, textOn } from "../lib/color.js";
import { fmtClock } from "../lib/time.js";

// ── Tipos de props de los primitivos ────────────────────────────────────────
// `dot`: aviso rojo en la esquina superior izquierda de la pestaña (p. ej.
// "Alumnos" mientras haya entregas por corregir — Jon, 2026-07-04).
type Tab = { id: string; label: string; dot?: boolean };
type Option = { id: string; label: string; accent?: string };

interface ModalShellProps { children: ReactNode; width?: number; align?: "center"|"top"; zIndex?: number; onClose?: () => void; label?: string; }
interface ConfirmModalProps { message: string; onConfirm: () => void; onCancel: () => void; confirmLabel?: string; }
interface ErrorMsgProps { children?: ReactNode; style?: CSSProperties; }
interface TabBarProps { tabs: Tab[]; value: string; onChange: (id: string) => void; variant?: "primary"|"secondary"; }
interface ScoreBadgeProps { score?: number | null; suffix?: string; emptyLabel?: string; status?: "auto" | "pendiente" | "corregido" | null; }
interface CredentialInputProps { kind?: string; value: string; onChange: (v: string) => void; placeholder?: string; autoFocus?: boolean; onSubmit?: () => void; marginBottom?: number; style?: CSSProperties; }
interface CircleButtonProps { onClick?: () => void; disabled?: boolean; title?: string; children: ReactNode; size?: number; primary?: boolean; fontSize?: number; }
interface ModalFooterProps { onCancel: () => void; onSave: () => void; canSave?: boolean; saveLabel?: ReactNode; cancelLabel?: string; }
interface SessionHeaderProps { exercise: { title?: string; composerName?: string; showComposer?: boolean; [k: string]: unknown }; onBack: () => void; modelId: string; rightSlot?: ReactNode; }
interface SessionHintProps { modelId: string; extra?: ReactNode; }
interface StickyActionBarProps { children: ReactNode; secondary?: ReactNode; info?: ReactNode; }
interface BarSubmitButtonProps { onClick: () => void; children: ReactNode; disabled?: boolean; accent?: string; }
interface BarIconButtonProps { onClick: () => void; disabled?: boolean; title?: string; children: ReactNode; danger?: boolean; }
interface ChevronProps { open: boolean; size?: number; color?: string; rotate90WhenClosed?: boolean; }
interface StatusCircleProps { done?: boolean; size?: number; }
interface ProgressRingProps { ready: number; total: number; size?: number; stroke?: number; }
interface CategoryDotsProps { buttons: Array<{ id?: string; name?: string; color?: string }> }
interface SuggestInputProps { value: string; onChange: (v: string) => void; suggestions?: string[]; placeholder?: string; autoFocus?: boolean; style?: CSSProperties; }
interface TagInputProps { tags?: string[]; onChange: (tags: string[]) => void; suggestions?: string[]; }
interface IconButtonProps { onClick: () => void; title?: string; }
interface FilterDropdownProps { label: string; options: string[]; selected: string[]; onToggle: (v: string) => void; onClear: () => void; accent?: string; }
interface PillSelectProps { value: string; onChange: (v: string) => void; options: Option[]; accent?: string; }
interface TeacherFilterBarProps { filterModel: string; setFilterModel: (v: string) => void; allComposers: string[]; filterComposers: string[]; setFilterComposers: (v: string[]) => void; allTags: string[]; filterTags: string[]; setFilterTags: (v: string[]) => void; trailing?: ReactNode; }
interface StudentFilterBarProps { filterModel: string; setFilterModel: (v: string) => void; filterDone: string; setFilterDone: (v: string) => void; searchQuery?: string; setSearchQuery?: (v: string) => void; }
interface OverlineProps { children: ReactNode; style?: CSSProperties; }
interface ButtonProps { children: ReactNode; onClick?: () => void; full?: boolean; lg?: boolean; disabled?: boolean; }
interface FieldLabelProps { children: ReactNode; }
interface TextInputProps { value: string; onChange: (v: string) => void; placeholder?: string; type?: string; big?: boolean; }
interface MetaItemProps { label: string; children: ReactNode; }
interface SchemaPlayheadProps { timeRef: { current: number }; duration: number; }
interface CorrectionAudioBarProps { time: number; timeRef: { current: number }; duration: number; playing: boolean; audioReady: boolean; togglePlay: () => void; onSeek: (e: React.MouseEvent<HTMLDivElement>) => void; }

// Backdrop semitransparente + tarjeta centrada. Usado por todos los modales.
// Accesibilidad (Fase 5): role="dialog"/aria-modal, foco inicial dentro del
// diálogo, trampa de foco (Tab cicla dentro), devolución del foco al cerrar y,
// si se pasa `onClose`, cierre con Escape. `label` da el nombre accesible.
const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
export function ModalShell({ children, width = 480, align = "center", zIndex = 200, onClose, label = "Diálogo" }: ModalShellProps) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const prevFocus = document.activeElement as HTMLElement | null;
    const card = cardRef.current;
    // Foco inicial: solo lo movemos si aún no está dentro del diálogo (respeta
    // modales que ya enfocan su propio input vía autoFocus).
    if (card && !card.contains(document.activeElement)) {
      const f = card.querySelectorAll<HTMLElement>(FOCUSABLE);
      (f[0] ?? card).focus?.();
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && onClose) { e.stopPropagation(); onClose(); return; }
      if (e.key === "Tab" && card) {
        const f = [...card.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      // Devolver el foco al elemento que lo tenía antes de abrir el modal.
      prevFocus?.focus();
    };
  }, [onClose]);

  const isTop = align === "top";
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(26,25,21,0.55)",
      display: "flex", justifyContent: "center",
      alignItems: isTop ? "flex-start" : "center",
      overflowY: isTop ? "auto" : undefined,
      padding:   isTop ? "32px 16px" : undefined,
      zIndex,
    }}>
      <div ref={cardRef} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}
        style={{ ...S.card, width, maxWidth: "92vw", marginBottom: 0, outline: "none" }}>
        {children}
      </div>
    </div>
  );
}

// Modal de confirmación destructiva
export function ConfirmModal({ message, onConfirm, onCancel, confirmLabel = "Eliminar" }: ConfirmModalProps) {
  return (
    <ModalShell width={400} zIndex={300} onClose={onCancel} label="Confirmación">
      <p style={{ margin: "0 0 18px", color: C.ink, fontSize: 14, lineHeight: 1.5, whiteSpace: "pre-line" }}>{message}</p>
      <div style={{ ...S.row, gap: 10, justifyContent: "flex-end" }}>
        <button onClick={onCancel} style={S.btn} autoFocus>Cancelar</button>
        <button onClick={onConfirm} style={{ ...S.btnPrimary, background: C.danger, border: `1px solid ${C.danger}` }}>
          {confirmLabel}
        </button>
      </div>
    </ModalShell>
  );
}

// Mensaje de error en rojo (oculto si children es vacío)
export function ErrorMsg({ children, style }: ErrorMsgProps) {
  if (!children) return null;
  return <p style={{ fontSize: 12, color: C.danger, margin: "0 0 12px", ...style }}>{children}</p>;
}

// Barra de pestañas con underline. variant="primary" para pestañas principales,
// "secondary" para tabs de configuración (más pequeñas, color atenuado).
export function TabBar({ tabs, value, onChange, variant = "primary" }: TabBarProps) {
  const isPrim = variant === "primary";
  return tabs.map(({ id, label, dot }) => {
    const active = value === id;
    return (
      <button key={id} onClick={() => onChange(id)}
        title={dot ? "Hay entregas por corregir" : undefined}
        style={{
        position: "relative",
        background: "none", border: "none",
        borderBottom: `2px solid ${active ? (isPrim ? C.ink : C.muted) : "transparent"}`,
        color:        active ? (isPrim ? C.ink : C.ink2) : (isPrim ? C.muted : C.muted2),
        marginBottom: -1,
        padding:      isPrim ? "12px 16px 11px" : "10px 10px 11px",
        cursor:       "pointer",
        fontSize:     isPrim ? 13 : 11,
        fontWeight:   active ? 600 : 400,
        fontFamily:   FONT_SANS,
        transition:   "color .12s, border-color .12s",
        whiteSpace:   "nowrap",
      }}>
        {dot && (
          <span aria-hidden="true" style={{ position: "absolute", top: 7, right: 7, width: 6, height: 6, borderRadius: "50%", background: C.danger }} />
        )}
        {label}
      </button>
    );
  });
}

// Badge de puntuación con color según rango. Usado en dashboards. Con `status`,
// unifica las tres variantes del contrato de corrección (F1): "pendiente" no
// puede mostrar una nota (aún no hay una fórmula fiable para ese modelo — ver
// resultStatusOf), así que se sustituye por una insignia ámbar con texto;
// "corregido" añade un ✓ textual junto a la nota (nunca solo color, por la
// regla de daltonismo del proyecto).
export function ScoreBadge({ score, suffix = "%", emptyLabel = "—", status = null }: ScoreBadgeProps) {
  if (status === "pendiente") {
    return <span style={{ ...S.badge, background: "rgba(212,120,0,0.12)", color: "#d47800" }}>Pendiente</span>;
  }
  return (
    <span style={{ ...S.badge, background: scoreBg(score), color: scoreColor(score) }}>
      {score == null ? emptyLabel : `${score}${suffix}${status === "corregido" ? " ✓" : ""}`}
    </span>
  );
}

// Input de credencial (PIN numérico o contraseña)
export function CredentialInput({ kind, value, onChange, placeholder, autoFocus, onSubmit, marginBottom = 14, style }: CredentialInputProps) {
  const isPin = kind === "pin";
  return (
    <input
      type={isPin ? "tel" : "password"}
      inputMode={isPin ? "numeric" : undefined}
      style={{ ...S.input, marginBottom, letterSpacing: isPin ? "0.25em" : undefined, ...style }}
      value={value}
      onChange={(e) => onChange(isPin ? e.target.value.replace(/\D/g, "") : e.target.value)}
      placeholder={placeholder ?? (isPin ? "• • • •" : "••••••")}
      autoComplete={onSubmit ? "current-password" : "new-password"}
      autoFocus={autoFocus}
      onKeyDown={onSubmit ? (e) => e.key === "Enter" && onSubmit() : undefined}
    />
  );
}

// Botón redondo de tipo "+5s / −5s / play"
export function CircleButton({ onClick, disabled, title, children, size = 42, primary = false, fontSize }: CircleButtonProps) {
  return (
    <button onClick={onClick} disabled={disabled} title={title} aria-label={title} style={{
      width: size, height: size, borderRadius: "50%",
      background: primary ? C.ink : "transparent",
      border:     primary ? `1px solid ${C.ink}` : `1px solid ${C.line}`,
      color:      primary ? C.paper : C.ink2,
      cursor:     "pointer",
      display:    "flex", alignItems: "center", justifyContent: "center",
      fontSize:   fontSize ?? (primary ? 16 : 11),
      fontWeight: primary ? 700 : 400,
      fontFamily: FONT_SANS,
      opacity:    disabled ? 0.4 : 1,
    }}>
      {children}
    </button>
  );
}

// Botón submit grande con flecha (usado en ExerciseView y QuestionnaireView)
export function AudioLoadingOverlay() {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(26,25,21,0.52)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 400 }}>
      <div style={{ background: C.paper, borderRadius: 18, padding: "28px 36px", textAlign: "center", boxShadow: "0 10px 40px rgba(0,0,0,0.20)", maxWidth: 280 }}>
        <div style={{ fontFamily: FONT_SANS, fontSize: 15, fontWeight: 600, color: C.ink, marginBottom: 6 }}>Cargando audio…</div>
        <div style={{ fontFamily: FONT_SANS, fontSize: 12, color: C.muted, lineHeight: 1.5 }}>Espera un momento antes de comenzar el ejercicio</div>
      </div>
    </div>
  );
}

// Pie de modal estándar: botón "Cancelar" + acción principal (guardar/crear).
// Centraliza el patrón que se repetía en casi todos los formularios modales.
export function ModalFooter({ onCancel, onSave, canSave = true, saveLabel = "Guardar", cancelLabel = "Cancelar" }: ModalFooterProps) {
  return (
    <div style={{ ...S.row, gap: 8, justifyContent: "flex-end" }}>
      <button onClick={onCancel} style={S.btn}>{cancelLabel}</button>
      <button onClick={onSave} disabled={!canSave} style={{ ...S.btnPrimary, ...disabledStyle(canSave) }}>
        {saveLabel}
      </button>
    </div>
  );
}

// ── Primitivos de sesión S2 ───────────────────────────────────────────────────
// Estos primitivos unifican las tres vistas de ejercicio (interactivo /
// cuestionario / esquema) para que la lógica de interacción sea obvia y el
// flujo esté pensado para móvil: cabecera con el modelo visible, banner de
// ayuda destacado y barra de acción inferior fija (alcanzable con el pulgar).

// Punto de tiempo abreviado para "0:07" sin minutos cuando es corto
const SESSION_MODEL_META = {
  interactivo:  { color: C.fnT, label: "Interactivo",  hint: "Mantén pulsado el botón de la función (o su tecla) mientras suena el audio para marcar cada fragmento.", verb: "marca categorías en vivo" },
  cuestionario: { color: C.fnS, label: "Cuestionario", hint: "Toca una pregunta para saltar a su fragmento de audio y escucharlo en bucle, luego responde.", verb: "responde sobre fragmentos" },
  esquema:      { color: C.fnD, label: "Esquema",       hint: "Arrastra sobre cualquier pista para crear un bloque. Doble toque para renombrarlo; selecciónalo para moverlo o cambiar su color.", verb: "dibuja la forma musical" },
};

// Cabecera unificada de sesión: volver + título + píldora del modelo activo.
// Sustituye/clarifica a ExercisePageHeader en las vistas de ejercicio S2.
export function SessionHeader({ exercise, onBack, modelId, rightSlot = null }: SessionHeaderProps) {
  const meta = SESSION_MODEL_META[modelId as keyof typeof SESSION_MODEL_META] || SESSION_MODEL_META.interactivo;
  return (
    <div style={{
      background: C.paper, borderBottom: `1px solid ${C.line}`, flexShrink: 0,
      position: "sticky", top: 0, zIndex: 55,
      paddingTop: "env(safe-area-inset-top, 0px)",
    }}>
      <div style={{ padding: "9px 16px", display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={onBack} aria-label="Volver" className="fa-pressable" style={{
          background: "none", border: "none", cursor: "pointer",
          fontFamily: F.sans, fontSize: 13, color: C.ink2, padding: "6px 4px",
          flexShrink: 0, display: "flex", alignItems: "center", gap: 4, marginLeft: -4,
        }}>
          <span style={{ fontSize: 18, lineHeight: 1 }}>←</span>
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: F.serif, fontSize: 18, fontWeight: 600, color: C.ink,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.25,
          }}>{exercise.title}</div>
          {exercise.composerName && exercise.showComposer !== false && (
            <div style={{ fontFamily: F.sans, fontSize: 11, color: C.fnS, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 1 }}>
              {exercise.composerName}
            </div>
          )}
        </div>
        {rightSlot}
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0,
          background: `${meta.color}14`, border: `1px solid ${meta.color}40`,
          borderRadius: 999, padding: "4px 11px",
          fontFamily: F.sans, fontSize: 11, fontWeight: 600, color: meta.color,
        }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: meta.color }} />
          {meta.label}
        </span>
      </div>
    </div>
  );
}

// Banner de ayuda destacado y descartable, al inicio del área de trabajo.
// Hace evidente el modelo de interacción de un vistazo, sin sustituir el texto
// fino de pie ya existente (que se mantiene como recordatorio).
export function SessionHint({ modelId, extra = null }: SessionHintProps) {
  const meta = SESSION_MODEL_META[modelId as keyof typeof SESSION_MODEL_META] || SESSION_MODEL_META.interactivo;
  const storeKey = `fa_hint_seen_${modelId}`;
  const [open, setOpen] = useState(() => {
    try { return localStorage.getItem(storeKey) !== "1"; } catch { return true; }
  });
  // El banner aclaratorio del modelo solo aparece la primera vez que se accede a
  // ese tipo de ejercicio; se marca como visto al mostrarse (también evita que
  // reaparezca al alternar modelos en ejercicios híbridos).
  useEffect(() => {
    if (!open) return;
    try { localStorage.setItem(storeKey, "1"); } catch {}
  }, [open, storeKey]);
  if (!open) return null;
  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 10,
      background: `${meta.color}0E`, border: `1px solid ${meta.color}33`,
      borderRadius: 12, padding: "11px 12px 11px 14px", marginBottom: 12,
      animation: "faHintIn .25s ease",
    }}>
      <span aria-hidden style={{
        flexShrink: 0, marginTop: 1,
        width: 20, height: 20, borderRadius: "50%",
        background: meta.color, color: C.paper,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: F.serif, fontSize: 13, fontWeight: 700, lineHeight: 1,
      }}>i</span>
      <div style={{ flex: 1, minWidth: 0, fontFamily: F.sans, fontSize: 12.5, lineHeight: 1.5, color: C.ink2 }}>
        {meta.hint}{extra ? <> {extra}</> : null}
      </div>
      <button onClick={() => setOpen(false)} aria-label="Ocultar ayuda" className="fa-pressable" style={{
        flexShrink: 0, background: "transparent", border: "none", cursor: "pointer",
        color: meta.color, fontSize: 16, lineHeight: 1, padding: "0 2px", marginTop: -1, opacity: 0.7,
      }}>✕</button>
    </div>
  );
}

// Barra de acción inferior fija. Garantiza que la acción principal (Entregar /
// Guardar clave) esté siempre visible y al alcance del pulgar en móvil.
// `secondary` permite añadir controles a la izquierda (deshacer, borrar…).
export function StickyActionBar({ children, secondary = null, info = null }: StickyActionBarProps) {
  return (
    <div className="fa-sticky-bar" style={{
      background: "rgba(255,255,255,0.86)",
      backdropFilter: "saturate(180%) blur(12px)",
      WebkitBackdropFilter: "saturate(180%) blur(12px)",
      borderTop: `1px solid ${C.line}`,
      marginTop: "auto",   // en flex-column empuja la barra al fondo
      padding: "10px 16px",
      paddingBottom: "calc(10px + env(safe-area-inset-bottom, 0px))",
      boxShadow: "0 -6px 22px rgba(26,25,21,0.06)",
    }}>
      <div className="fa-actionbar" style={{ maxWidth: 980, margin: "0 auto", display: "flex", alignItems: "center", gap: 10 }}>
        {secondary}
        <div className="fa-actionbar-info" style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 1 }}>
          {info}
        </div>
        <div className="fa-actionbar-primary" style={{ flexShrink: 0, display: "flex" }}>
          {children}
        </div>
      </div>
    </div>
  );
}

// Botón submit grande para la barra fija — variante full-bleed amigable al pulgar
export function BarSubmitButton({ onClick, children, disabled = false, accent = C.ink }: BarSubmitButtonProps) {
  return (
    <button onClick={onClick} disabled={disabled} className="fa-pressable" style={{
      background: accent, color: C.paper, border: `1px solid ${accent}`,
      borderRadius: 999, padding: "11px 18px 11px 22px",
      fontSize: 14, fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer",
      fontFamily: FONT_SANS, flexShrink: 0,
      display: "inline-flex", alignItems: "center", gap: 9,
      opacity: disabled ? 0.45 : 1,
    }}>
      {children}
      <span style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 22, height: 22, borderRadius: "50%",
        background: "rgba(251,250,246,0.20)", fontSize: 13,
      }}>→</span>
    </button>
  );
}

// Botón circular compacto para la barra de acción (deshacer / borrar)
export function BarIconButton({ onClick, disabled, title, children, danger = false }: BarIconButtonProps) {
  return (
    <button onClick={onClick} disabled={disabled} title={title} aria-label={title} className="fa-pressable" style={{
      width: 40, height: 40, borderRadius: 10, flexShrink: 0,
      background: C.paper, border: `1px solid ${danger ? "rgba(184,74,58,0.4)" : C.line}`,
      color: danger ? C.danger : C.ink2,
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.35 : 1,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: 17, lineHeight: 1, fontFamily: FONT_SANS,
    }}>
      {children}
    </button>
  );
}

// ── Primitivos del sistema editorial V1 ──────────────────────────────────────

export function Chevron({ open, size = 13, color = C.chevron, rotate90WhenClosed = false }: ChevronProps) {
  const deg = open ? 180 : rotate90WhenClosed ? -90 : 0;
  return (
    <svg aria-hidden="true" focusable="false" width={size} height={size} viewBox="0 0 13 13" fill="none"
      style={{ flexShrink: 0, transition: "transform 0.18s ease", transform: `rotate(${deg}deg)` }}>
      <path d="M2.5 4.5L6.5 8.5L10.5 4.5" stroke={color} strokeWidth="1.4"
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function StatusCircle({ done, size = 14 }: StatusCircleProps) {
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: done ? C.ink : C.bg, border: done ? "none" : `1.5px solid ${C.chevron}`, flexShrink: 0 }}>
      {done && (
        <svg width={size * 0.5} height={size * 0.43} viewBox="0 0 7 6" fill="none">
          <path d="M1 2.8L3 4.8L6 1" stroke="#fff" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </div>
  );
}

// Anillo de progreso SVG — usado en la vista de Cursos (unidades / cursos).
// done → relleno verde con ✓; en curso → fracción ready/total centrada.
export function ProgressRing({ ready, total, size = 46, stroke = 4 }: ProgressRingProps) {
  const r     = (size - stroke) / 2;
  const circ  = 2 * Math.PI * r;
  const pct   = total ? ready / total : 0;
  const done  = total > 0 && ready === total;
  const color = done ? C.fnT : C.ink;
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={C.line} strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={circ * (1 - pct)} style={{ transition: "stroke-dashoffset .4s ease" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {done
          ? <svg width={size * 0.42} height={size * 0.36} viewBox="0 0 7 6" fill="none"><path d="M1 2.8L3 4.8L6 1" stroke={C.fnT} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
          : <span style={{ fontFamily: F.sans, fontSize: size * 0.26, fontWeight: 700, color: C.ink, fontVariantNumeric: "tabular-nums" }}>
              {ready}<span style={{ color: C.muted, fontWeight: 600 }}>/{total}</span>
            </span>}
      </div>
    </div>
  );
}

// La inicial dentro del punto (F7, T7.5) evita que el color sea la única
// señal — regla de daltonismo del resto de la app (p. ej. las flechas ↑/↓
// siempre van con número, nunca solo con color).
export function CategoryDots({ buttons }: CategoryDotsProps) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      {buttons.map((b) => (
        <span key={b.id} title={b.name}
          style={{ width: 13, height: 13, borderRadius: "50%", background: b.color, border: "1px solid rgba(0,0,0,0.08)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 700, fontFamily: FONT_SANS, color: textOn(b.color), lineHeight: 1 }}>
          {(b.name || "?")[0]?.toUpperCase()}
        </span>
      ))}
    </span>
  );
}

// ─── SuggestInput — campo de texto con desplegable de sugerencias ────────────
export function SuggestInput({ value, onChange, suggestions = [], placeholder, autoFocus, style }: SuggestInputProps) {
  const [show, setShow] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const filtered = suggestions.filter(
    (s) => s.toLowerCase().includes(value.toLowerCase()) && s !== value
  );

  return (
    <div style={{ position: "relative" }}>
      <input
        ref={inputRef}
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => { onChange(e.target.value); setShow(true); }}
        onFocus={() => setShow(true)}
        onBlur={() => setTimeout(() => setShow(false), 140)}
        placeholder={placeholder}
        style={style}
      />
      {show && filtered.length > 0 && (
        <div className="fa-pop" style={{ position: "absolute", top: "calc(100% + 3px)", left: 0, right: 0, zIndex: 40, background: C.paper, border: `1px solid ${C.line}`, borderRadius: 7, boxShadow: "0 4px 14px rgba(0,0,0,0.08)", overflow: "hidden", maxHeight: 180, overflowY: "auto" }}>
          {filtered.map((s) => (
            <div key={s} onMouseDown={() => { onChange(s); setShow(false); }}
              style={{ padding: "8px 12px", cursor: "pointer", fontSize: 13, fontFamily: FONT_SANS, color: C.ink }}>
              {s}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── TagInput — editor de etiquetas con sugerencias de reutilización ─────────
export function TagInput({ tags = [], onChange, suggestions = [] }: TagInputProps) {
  const [input, setInput] = useState("");
  const [showSug, setShowSug] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const filtered = suggestions.filter(
    (s) => s.toLowerCase().includes(input.toLowerCase()) && !tags.includes(s)
  );

  const addTag = (tag: string) => {
    const t = tag.trim();
    if (!t || tags.includes(t)) return;
    onChange([...tags, t]);
    setInput("");
    setShowSug(false);
    inputRef.current?.focus();
  };

  const removeTag = (t: string) => onChange(tags.filter((x) => x !== t));

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === "Enter" || e.key === ",") && input.trim()) {
      e.preventDefault();
      addTag(input);
    } else if (e.key === "Backspace" && !input && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    }
  };

  return (
    <div style={{ position: "relative" }}>
      <div
        onClick={() => inputRef.current?.focus()}
        style={{ display: "flex", flexWrap: "wrap", gap: 5, alignItems: "center", background: C.field, border: `1px solid ${C.line}`, borderRadius: 7, padding: "6px 10px", minHeight: 40, cursor: "text" }}
      >
        {tags.map((t) => (
          <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: C.ink, color: "#fff", borderRadius: 4, padding: "2px 8px", fontSize: 11, fontFamily: FONT_SANS, fontWeight: 500 }}>
            {t}
            <span onClick={() => removeTag(t)} style={{ cursor: "pointer", opacity: 0.7, fontSize: 13, lineHeight: 1, marginLeft: 1 }}>×</span>
          </span>
        ))}
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => { setInput(e.target.value); setShowSug(true); }}
          onKeyDown={handleKey}
          onFocus={() => setShowSug(true)}
          onBlur={() => setTimeout(() => setShowSug(false), 140)}
          placeholder={tags.length === 0 ? "Añadir etiqueta…" : ""}
          style={{ border: "none", outline: "none", background: "transparent", fontSize: 12, fontFamily: FONT_SANS, color: C.ink, minWidth: 90, flex: 1 }}
        />
      </div>
      {showSug && (input.trim() || filtered.length > 0) && (
        <div className="fa-pop" style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 40, background: C.paper, border: `1px solid ${C.line}`, borderRadius: 7, boxShadow: "0 4px 14px rgba(0,0,0,0.08)", overflow: "hidden", maxHeight: 180, overflowY: "auto" }}>
          {input.trim() && !tags.includes(input.trim()) && (
            <div onMouseDown={() => addTag(input)} style={{ padding: "8px 12px", cursor: "pointer", fontSize: 12, fontFamily: FONT_SANS, color: C.ink, display: "flex", alignItems: "center", gap: 8, borderBottom: filtered.length ? `1px solid ${C.line}` : "none" }}>
              <span style={{ color: C.muted, fontSize: 11 }}>Crear:</span>
              <strong>{input.trim()}</strong>
            </div>
          )}
          {filtered.map((s) => (
            <div key={s} onMouseDown={() => addTag(s)} style={{ padding: "8px 12px", cursor: "pointer", fontSize: 12, fontFamily: FONT_SANS, color: C.ink }}>
              {s}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── EyeIcon / EyeButton — visibilidad de ejercicios, cursos, unidades ────────
export function EyeIcon({ open = true, size = 15 }: { open?: boolean; size?: number }) {
  return open ? (
    <svg aria-hidden="true" focusable="false" width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="10" cy="10" rx="8" ry="5" />
      <circle cx="10" cy="10" r="2.2" fill="currentColor" stroke="none" />
    </svg>
  ) : (
    <svg aria-hidden="true" focusable="false" width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3l14 14" />
      <path d="M6.5 6.5C4.5 7.6 3 9 3 10c0 2.8 3.1 5 7 5a9 9 0 0 0 3.5-.7" />
      <path d="M10 5c3.9 0 7 2.2 7 5a6.3 6.3 0 0 1-1.5 2.5" />
    </svg>
  );
}

// Icono de lápiz (editar) — estética de trazo fino coherente con EyeIcon
export function PencilIcon({ size = 15 }: { size?: number }) {
  return (
    <svg aria-hidden="true" focusable="false" width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13.5 3.5l3 3" />
      <path d="M12.2 4.8l3 3L7 16l-3.6.6L4 13z" />
    </svg>
  );
}

// Icono de papelera (eliminar) — trazo fino coherente con el resto de iconos
export function TrashIcon({ size = 15 }: { size?: number }) {
  return (
    <svg aria-hidden="true" focusable="false" width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3.5 5.5h13" />
      <path d="M8 5.5V4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5" />
      <path d="M5 5.5l.8 10a1.5 1.5 0 0 0 1.5 1.4h5.4a1.5 1.5 0 0 0 1.5-1.4l.8-10" />
      <path d="M8.5 8.5v5M11.5 8.5v5" />
    </svg>
  );
}

// Icono de onda de audio — barras verticales de altura variable, estética waveform
export function AudioWaveIcon({ size = 16, color = "currentColor" }: { size?: number; color?: string }) {
  const bars = [0.35, 0.6, 0.85, 0.65, 1.0, 0.8, 0.5, 0.9, 0.55, 0.3];
  return (
    <svg aria-hidden="true" focusable="false" width={size} height={size * 0.875} viewBox="0 0 20 14" fill="none" style={{ flexShrink: 0 }}>
      {bars.map((h, i) => {
        const bh = h * 12;
        const y  = (14 - bh) / 2;
        return <rect key={i} x={i * 2} y={y} width={1.2} height={bh} rx={0.6} fill={color} />;
      })}
    </svg>
  );
}

// Base común de los botones-icono de acción de la tarjeta de ejercicio.
// Mismo tamaño/forma para mantener la estética; el color/relleno los diferencia.
const ICON_BTN_BASE = { display: "flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, borderRadius: 8, flexShrink: 0, cursor: "pointer", transition: "background .15s, color .15s, border-color .15s, box-shadow .15s" };

// Visible/oculto → botón-estado: contorno tenue y tinte ámbar/rojo al ocultar.
export function EyeButton({ visible, onClick, title }: { visible: boolean; onClick: () => void; title?: string }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      title={title || (visible ? "Ocultar para alumnos" : "Mostrar a alumnos")}
      aria-label={title || (visible ? "Ocultar para alumnos" : "Mostrar a alumnos")}
      className="fa-pressable"
      style={{ ...ICON_BTN_BASE,
        border: `1px solid ${visible ? C.line : "rgba(184,74,58,0.45)"}`,
        background: visible ? C.paper : "rgba(184,74,58,0.07)",
        color: visible ? C.muted : C.danger }}
    >
      <EyeIcon open={visible} size={15} />
    </button>
  );
}

// Previsualizar (como alumno) → contorno neutro, glifo de ojo-en-pantalla para
// no confundirse con EyeButton (esa es el estado visible/oculto).
export function PreviewIconButton({ onClick, title = "Previsualizar" }: IconButtonProps) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      title={title}
      aria-label={title}
      className="fa-pressable"
      style={{ ...ICON_BTN_BASE, border: `1px solid ${C.line}`, background: C.paper, color: C.muted }}
    >
      <svg aria-hidden="true" focusable="false" width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2.5" y="4" width="15" height="12" rx="2" />
        <path d="M8.5 7.5l4 2.5-4 2.5z" fill="currentColor" stroke="none" />
      </svg>
    </button>
  );
}

// Editar → acción principal: relleno oscuro sólido (destaca sobre los otros dos).
export function EditIconButton({ onClick, title = "Editar" }: IconButtonProps) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      title={title}
      aria-label={title}
      className="fa-pressable"
      style={{ ...ICON_BTN_BASE, border: `1px solid ${C.ink}`, background: C.ink, color: C.paper, boxShadow: "0 1px 3px rgba(26,25,21,0.18)" }}
    >
      <PencilIcon size={15} />
    </button>
  );
}

// Eliminar → acción destructiva: contorno rojo con tinte suave.
export function DeleteIconButton({ onClick, title = "Eliminar" }: IconButtonProps) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      title={title}
      aria-label={title}
      className="fa-pressable"
      style={{ ...ICON_BTN_BASE, border: `1px solid rgba(184,74,58,0.45)`, background: "rgba(184,74,58,0.07)", color: C.danger }}
    >
      <TrashIcon size={15} />
    </button>
  );
}

// Quitar de una lista (sin borrar) → mismo molde rojo pero glifo ✕, para no
// confundir con la eliminación definitiva (papelera).
export function RemoveIconButton({ onClick, title = "Quitar" }: IconButtonProps) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      title={title}
      aria-label={title}
      className="fa-pressable"
      style={{ ...ICON_BTN_BASE, border: `1px solid rgba(184,74,58,0.45)`, background: "rgba(184,74,58,0.07)", color: C.danger }}
    >
      <svg aria-hidden="true" focusable="false" width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
        <path d="M5.5 5.5l9 9M14.5 5.5l-9 9" />
      </svg>
    </button>
  );
}

// ─── Menu — primitivo de desplegable (T3.7 / M3.5) ───────────────────────────
// Convención de descarte unificada para todos los desplegables de la app: cierra
// con Escape, con clic fuera y devuelve el foco al trigger; flechas ↑/↓ mueven el
// foco entre los ítems y Enter/Espacio los activa (los propios <button>). role=
// menu en el panel. `portal` porta el panel a document.body con posición fija —
// necesario cuando el desplegable vive dentro de un contenedor overflow:hidden
// (p.ej. .fa-expand-inner). Cada llamador aporta el aspecto de su trigger y el
// contenido de su panel; el primitivo solo aporta el comportamiento.
interface MenuRenderApi { open: boolean; toggle: () => void; close: () => void; triggerRef: RefObject<HTMLButtonElement | null>; }
interface MenuProps {
  trigger: (api: MenuRenderApi) => ReactNode;
  children: ReactNode | ((api: { close: () => void }) => ReactNode);
  align?: "left" | "right";
  portal?: boolean;
  ariaLabel?: string;
  panelStyle?: CSSProperties;
  panelClassName?: string;
}
const MENU_PANEL_BASE: CSSProperties = { background: C.paper, border: `1px solid ${C.line}`, borderRadius: 10, boxShadow: "0 10px 30px rgba(0,0,0,0.14)", padding: 5, boxSizing: "border-box" };
export function Menu({ trigger, children, align = "left", portal = false, ariaLabel = "Menú", panelStyle, panelClassName }: MenuProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left?: number; right?: number }>({ top: 0 });
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const close = useCallback(() => { setOpen(false); triggerRef.current?.focus(); }, []);
  const openMenu = () => {
    if (portal && triggerRef.current) {
      const r = triggerRef.current.getBoundingClientRect();
      setPos(align === "right" ? { top: r.bottom + 5, right: window.innerWidth - r.right } : { top: r.bottom + 5, left: r.left });
    }
    setOpen(true);
  };
  const toggle = () => (open ? close() : openMenu());

  // Clic fuera (modo inline: contención del ref; modo portal: la capa overlay).
  useEffect(() => {
    if (!open || portal) return;
    const onDown = (e: MouseEvent | TouchEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("touchstart", onDown); };
  }, [open, portal]);

  // Escape cierra; ↑/↓ mueven el foco entre los ítems enfocables del panel.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); close(); return; }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        const nodes = panelRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), [role="menuitem"]:not([aria-disabled="true"]), [tabindex]:not([tabindex="-1"])');
        if (!nodes || nodes.length === 0) return;
        e.preventDefault();
        const arr = Array.from(nodes);
        const idx = arr.indexOf(document.activeElement as HTMLElement);
        const next = e.key === "ArrowDown" ? (idx + 1) % arr.length : (idx - 1 + arr.length) % arr.length;
        arr[next]?.focus();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, close]);

  const panel = (
    <div ref={panelRef} role="menu" aria-label={ariaLabel} className={panelClassName}
      style={portal
        ? { position: "fixed", top: pos.top, left: pos.left, right: pos.right, zIndex: 41, ...MENU_PANEL_BASE, ...panelStyle }
        : { position: "absolute", top: "calc(100% + 6px)", ...(align === "right" ? { right: 0 } : { left: 0 }), zIndex: 41, ...MENU_PANEL_BASE, ...panelStyle }}>
      {typeof children === "function" ? children({ close }) : children}
    </div>
  );

  return (
    <div ref={wrapRef} style={{ position: "relative", flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
      {trigger({ open, toggle, close, triggerRef })}
      {open && (portal
        ? createPortal(<><div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />{panel}</>, document.body)
        : panel)}
    </div>
  );
}

// ─── FilterDropdown — menú desplegable de selección múltiple para filtros ─────
// Sobre el primitivo Menu (M3.5): comparte descarte (Escape/clic-fuera/foco) y
// navegación por flechas. Multi-selección → tocar un ítem NO cierra (solo
// Escape/clic-fuera lo hacen); los ítems son botones role=menuitemcheckbox.
export function FilterDropdown({ label, options, selected, onToggle, onClear, accent = C.ink }: FilterDropdownProps) {
  const count = selected.length;
  return (
    <Menu ariaLabel={label} panelStyle={{ minWidth: 200, maxWidth: 280, padding: "6px 0", overflow: "hidden", boxShadow: "0 6px 24px rgba(0,0,0,0.10)" }} panelClassName="fa-pop"
      trigger={({ open, toggle, triggerRef }) => (
        <button ref={triggerRef} onClick={toggle} aria-haspopup="menu" aria-expanded={open}
          style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 11px", borderRadius: 20, border: `1.5px solid ${count > 0 ? accent : C.line}`, background: count > 0 ? accent : C.paper, color: count > 0 ? "#fff" : C.ink2, cursor: "pointer", fontFamily: FONT_SANS, fontSize: 12, fontWeight: count > 0 ? 600 : 400, transition: "all .15s", whiteSpace: "nowrap" }}>
          {label}
          {count > 0 && <span style={{ background: "rgba(255,255,255,0.28)", borderRadius: 10, padding: "0px 6px", fontSize: 11, fontWeight: 700 }}>{count}</span>}
          <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" style={{ marginLeft: 1, opacity: 0.7, transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform .18s" }}>
            <polyline points="2,3.5 5,6.5 8,3.5" />
          </svg>
        </button>
      )}>
      {options.length === 0 ? (
        <div style={{ padding: "10px 14px", fontSize: 12, color: C.muted, fontFamily: FONT_SANS }}>Sin opciones disponibles</div>
      ) : (
        <>
          {options.map((opt) => {
            const on = selected.includes(opt);
            return (
              <button key={opt} type="button" role="menuitemcheckbox" aria-checked={on} onClick={() => onToggle(opt)}
                style={{ width: "100%", boxSizing: "border-box", textAlign: "left", border: "none", display: "flex", alignItems: "center", gap: 9, padding: "8px 14px", cursor: "pointer", background: on ? `${accent}10` : "transparent", transition: "background .1s" }}>
                <span style={{ width: 15, height: 15, borderRadius: 4, border: `1.5px solid ${on ? accent : C.chevron}`, background: on ? accent : "transparent", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {on && <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><polyline points="1.5,5 4,7.5 8.5,2.5"/></svg>}
                </span>
                <span style={{ fontSize: 13, fontFamily: FONT_SANS, color: C.ink, lineHeight: 1.3 }}>{opt}</span>
              </button>
            );
          })}
          {count > 0 && (
            <div style={{ borderTop: `1px solid ${C.line}`, margin: "4px 0 0" }}>
              <button type="button" onClick={onClear} style={{ width: "100%", boxSizing: "border-box", textAlign: "left", border: "none", background: "transparent", padding: "7px 14px", cursor: "pointer", fontSize: 12, color: C.danger, fontFamily: FONT_SANS, fontWeight: 500 }}>✕ Limpiar selección</button>
            </div>
          )}
        </>
      )}
    </Menu>
  );
}

// ─── Pill select estilizado ────────────────────────────────────────────────────
export function PillSelect({ value, onChange, options, accent = C.ink }: PillSelectProps) {
  const active = value !== options[0]?.id;
  return (
    <div style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ appearance: "none", WebkitAppearance: "none", padding: "5px 28px 5px 12px", borderRadius: 20, border: `1.5px solid ${active ? accent : C.line}`, background: active ? accent : C.paper, color: active ? "#fff" : C.ink2, cursor: "pointer", fontFamily: FONT_SANS, fontSize: 12, fontWeight: active ? 600 : 400, outline: "none", transition: "all .15s" }}
      >
        {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
      <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke={active ? "#fff" : C.ink2} strokeWidth="1.8" strokeLinecap="round"
        style={{ position: "absolute", right: 10, pointerEvents: "none", opacity: 0.7 }}>
        <polyline points="2,3.5 5,6.5 8,3.5" />
      </svg>
    </div>
  );
}

// ─── TypeFilterChips — filtro por tipo de ejercicio (placas) ──────────────────
// Chips con punto de color del tipo: "Todos" (pill oscuro al activarse) +
// Interactivo/Cuestionario/Esquema. Un solo tipo activo a la vez; volver a
// pulsar el activo restablece a "Todos". Reemplaza al PillSelect de modelo.
const TYPE_CHIPS: Array<{ id: string; label: string; color?: string }> = [
  { id: "all",          label: "Todos" },
  { id: "interactivo",  label: "Interactivo",  color: "#3F9B5B" },
  { id: "cuestionario", label: "Cuestionario", color: "#2F6FB8" },
  { id: "esquema",      label: "Esquema",      color: "#C77A1A" },
];
// (TypeFilterChips se retiró el 2026-07-04: ambos roles filtran el tipo con el
// desplegable FilterDropdown "Tipo"; TYPE_CHIPS queda como fuente de opciones.)

// ─── TeacherFilterBar — filtros de ejercicios para la vista del profesor ──────
export function TeacherFilterBar({ filterModel, setFilterModel, allComposers, filterComposers, setFilterComposers, allTags, filterTags, setFilterTags, trailing }: TeacherFilterBarProps) {
  const toggleComposer = (val: string) => setFilterComposers(filterComposers.includes(val) ? filterComposers.filter((x) => x !== val) : [...filterComposers, val]);
  const toggleTag      = (val: string) => setFilterTags(filterTags.includes(val) ? filterTags.filter((x) => x !== val) : [...filterTags, val]);
  const active = filterModel !== "all" || filterComposers.length > 0 || filterTags.length > 0;

  // Tipo como desplegable (Jon, 2026-07-04): mismo control que Compositor y
  // Etiquetas. Semántica de radio: un solo tipo activo; repetirlo (o Limpiar)
  // vuelve a "Todos".
  const typeOpts = TYPE_CHIPS.filter((c) => c.id !== "all");
  const typeLabelToId = (lbl: string) => typeOpts.find((c) => c.label === lbl)?.id || "all";
  const typeIdToLabel = (id: string) => typeOpts.find((c) => c.id === id)?.label;

  return (
    <div style={{ marginBottom: 16, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
      <span style={{ fontFamily: FONT_SANS, fontSize: 12, color: C.muted, marginRight: 2 }}>Filtrar por:</span>
      <FilterDropdown
        label="Tipo"
        options={typeOpts.map((c) => c.label)}
        selected={filterModel === "all" ? [] : [typeIdToLabel(filterModel)].filter(Boolean) as string[]}
        onToggle={(lbl) => { const id = typeLabelToId(lbl); setFilterModel(filterModel === id ? "all" : id); }}
        onClear={() => setFilterModel("all")}
      />

      <FilterDropdown
        label="Compositor"
        options={allComposers}
        selected={filterComposers}
        onToggle={toggleComposer}
        onClear={() => setFilterComposers([])}
        accent="#2F6FB8"
      />

      <FilterDropdown
        label="Etiquetas"
        options={allTags}
        selected={filterTags}
        onToggle={toggleTag}
        onClear={() => setFilterTags([])}
        accent={C.fnI}
      />

      {active && (
        <button onClick={() => { setFilterModel("all"); setFilterComposers([]); setFilterTags([]); }}
          style={{ padding: "5px 11px", borderRadius: 20, border: "1.5px solid rgba(184,74,58,0.35)", background: "transparent", color: C.danger, cursor: "pointer", fontFamily: FONT_SANS, fontSize: 12 }}>
          ✕ Limpiar
        </button>
      )}

      {trailing && <><span style={{ flex: 1 }} />{trailing}</>}
    </div>
  );
}

// ─── StudentFilterBar — filtros de ejercicios para la vista del alumno ────────
export function StudentFilterBar({ filterModel, setFilterModel, filterDone, setFilterDone, searchQuery, setSearchQuery }: StudentFilterBarProps) {
  const active = filterModel !== "all" || filterDone !== "all";
  // Mismos desplegables que la vista del profesor (Jon, 2026-07-04): "Tipo" y
  // "Estado" con semántica de radio — repetir la opción activa vuelve a todos.
  const typeOpts = TYPE_CHIPS.filter((c) => c.id !== "all");
  const DONE_OPTIONS = [
    { id: "notdone", label: "Sin hacer" },
    { id: "done",    label: "Hechos"    },
  ];
  return (
    <div style={{ marginBottom: 16, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
      <span style={{ fontFamily: FONT_SANS, fontSize: 12, color: C.muted, marginRight: 2 }}>Filtrar por:</span>
      <FilterDropdown
        label="Tipo"
        options={typeOpts.map((c) => c.label)}
        selected={typeOpts.filter((c) => c.id === filterModel).map((c) => c.label)}
        onToggle={(lbl) => { const id = typeOpts.find((c) => c.label === lbl)?.id || "all"; setFilterModel(filterModel === id ? "all" : id); }}
        onClear={() => setFilterModel("all")}
      />
      <FilterDropdown
        label="Estado"
        options={DONE_OPTIONS.map((o) => o.label)}
        selected={DONE_OPTIONS.filter((o) => o.id === filterDone).map((o) => o.label)}
        onToggle={(lbl) => { const id = DONE_OPTIONS.find((o) => o.label === lbl)?.id || "all"; setFilterDone(filterDone === id ? "all" : id); }}
        onClear={() => setFilterDone("all")}
      />
      {active && (
        <button onClick={() => { setFilterModel("all"); setFilterDone("all"); }}
          style={{ padding: "5px 11px", borderRadius: 20, border: "1.5px solid rgba(184,74,58,0.35)", background: "transparent", color: C.danger, cursor: "pointer", fontFamily: FONT_SANS, fontSize: 12 }}>
          ✕ Limpiar
        </button>
      )}
      {/* Buscador del alumno (Jon, 2026-07-04): mismo sitio que el del profesor
          — al final de la fila de filtros, con su ✕ propio. */}
      {setSearchQuery && (
        <div style={{ position: "relative", marginLeft: "auto" }}>
          <input type="text" value={searchQuery ?? ""} onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar…" title="Buscar por título o compositor"
            style={{ ...S.input, width: 180, paddingRight: searchQuery ? 30 : undefined }} />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} aria-label="Borrar búsqueda"
              style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: C.muted, fontSize: 13, padding: 4, lineHeight: 1 }}>
              ✕
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function Overline({ children, style }: OverlineProps) {
  return <div style={{ fontFamily: F.sans, fontSize: 10, fontWeight: 700, letterSpacing: "0.15em", color: C.chevron, textTransform: "uppercase", marginBottom: 6, ...style }}>{children}</div>;
}

export function GhostButton({ children, onClick, full, lg, disabled }: ButtonProps) {
  return (
    <button onClick={onClick} disabled={disabled} style={{ background: C.paper, border: `1px solid ${C.rail}`, borderRadius: lg ? 8 : 7, padding: lg ? "12px 18px" : "7px 14px", fontFamily: F.sans, fontSize: lg ? 14 : 13, fontWeight: 500, color: "#555", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.4 : 1, width: full ? "100%" : undefined }}>{children}</button>
  );
}

export function CtaButton({ children, onClick, disabled, full, lg }: ButtonProps) {
  return (
    <button onClick={onClick} disabled={disabled} style={{ background: C.ink, color: "#fff", border: "none", borderRadius: lg ? 8 : 7, padding: lg ? "12px 18px" : "7px 15px", fontFamily: F.sans, fontSize: lg ? 14 : 12, fontWeight: 500, cursor: disabled ? "not-allowed" : "pointer", flexShrink: 0, opacity: disabled ? 0.4 : 1, width: full ? "100%" : undefined }}>{children}</button>
  );
}

export function FieldLabel({ children }: FieldLabelProps) {
  return <label style={{ display: "block", fontFamily: F.sans, fontSize: 11, fontWeight: 500, color: "#767670", marginBottom: 6 }}>{children}</label>;
}

export function TextInput({ value, onChange, placeholder, type = "text", big }: TextInputProps) {
  const [focus, setFocus] = useState(false);
  return (
    <input type={type} value={value} placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
      style={{ width: "100%", boxSizing: "border-box", fontFamily: big ? F.serif : F.sans, fontSize: big ? 18 : 13, fontWeight: big ? 500 : 400, color: C.ink, background: C.field, border: `1px solid ${focus ? C.fieldFocus : C.border}`, borderRadius: 7, padding: big ? "10px 14px" : "9px 12px", outline: "none", transition: "border-color .15s" }} />
  );
}

export function MetaItem({ label, children }: MetaItemProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <span style={{ fontFamily: F.sans, fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: C.chevron }}>{label}</span>
      <span style={{ display: "flex", alignItems: "center", gap: 5, fontFamily: F.sans, fontSize: 12, color: "#666" }}>{children}</span>
    </div>
  );
}

// Línea vertical animada a 60 fps sobre un timeline (waveform, banda de esquema,
// barra de audio de corrección…). Lee timeRef directamente en cada frame en vez
// de depender de `time` en el estado de React, así no fuerza un re-render por
// tick. Extraída de CorrectionView (Fase 2).
export function SchemaPlayhead({ timeRef, duration }: SchemaPlayheadProps) {
  const lineRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    let raf: number;
    const tick = () => {
      if (lineRef.current && duration > 0) {
        const pct = Math.min(100, (timeRef.current / duration) * 100);
        lineRef.current.style.left = `${pct}%`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [timeRef, duration]);
  return (
    <div ref={lineRef} style={{
      position: "absolute", top: 0, left: 0, width: 2, height: "100%",
      background: C.danger, opacity: 0.75, pointerEvents: "none", zIndex: 10,
      transform: "translateX(-50%)", borderRadius: 1,
    }} />
  );
}

// Barra de transporte compacta (play/pausa + progreso + tiempo) de las vistas
// de corrección. Extraída de la rama esquema de CorrectionView (Fase 2) para
// reutilizarla también en la rama interactiva (T2.2).
export function CorrectionAudioBar({ time, timeRef, duration, playing, audioReady, togglePlay, onSeek }: CorrectionAudioBarProps) {
  if (!duration) return null;
  return (
    <div style={{ ...S.card, marginBottom: 16, padding: "12px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          onClick={togglePlay}
          disabled={!audioReady}
          style={{ width: 36, height: 36, borderRadius: "50%", border: "none", background: audioReady ? C.ink : C.line, color: C.paper, cursor: audioReady ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0, transition: "background .15s" }}>
          {playing ? "⏸" : "▶"}
        </button>
        <div
          onClick={onSeek}
          style={{ flex: 1, position: "relative", height: 6, background: C.paper2, borderRadius: 3, cursor: "pointer", overflow: "visible" }}>
          <div style={{ position: "absolute", top: 0, left: 0, height: "100%", width: `${(time / duration) * 100}%`, background: C.fnS, borderRadius: 3, transition: "width .1s linear" }} />
          <SchemaPlayhead timeRef={timeRef} duration={duration} />
        </div>
        <span style={{ fontSize: 12, fontFamily: FONT_SANS, color: C.muted, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>{fmtClock(time)} / {fmtClock(duration)}</span>
      </div>
    </div>
  );
}
