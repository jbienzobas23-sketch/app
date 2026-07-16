// ═══ COMENTARIOSTRAMO (N4.4) ══════════════════════════════════════════════════
// Comentarios anclados a un TRAMO de audio ({start, end}) en la corrección:
// editor del profesor (añadir en el instante actual, ajustar los segundos,
// escribir, quitar) y vista del alumno (glifo › + rótulo «Comentario» + salto
// de audio al pulsar el rango). El salto lo aporta el llamador (onJump):
// el cuestionario reutiliza su bucle de fragmento; esquema e interactivo
// hacen seek. Compartido por las tres vistas de corrección.
import { C, S, FONT_SANS } from "../../theme/tokens.js";
import { fmtClock } from "../../lib/time.js";
import { uid } from "../../lib/ids.js";
import type { ComentarioTramo } from "../../lib/calificacion.js";

const eyebrow = { fontFamily: FONT_SANS, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase", color: C.muted } as const;

// Botón del rango: pulsa → salta el audio al tramo (y el rango se lee siempre
// como texto m:ss–m:ss, no solo como posición).
function RangoBoton({ tramo, onJump }: { tramo: ComentarioTramo; onJump?: (t: ComentarioTramo) => void }) {
  return (
    <button type="button" onClick={() => onJump?.(tramo)} disabled={!onJump}
      style={{ ...S.badge, background: "transparent", color: C.quiz, border: `1px solid ${C.quiz}55`, cursor: onJump ? "pointer" : "default", fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
      ▶ {fmtClock(tramo.start)}–{fmtClock(tramo.end)}
    </button>
  );
}

// ── Editor (profesor) ────────────────────────────────────────────────────────
export function ComentariosTramoEditor({ tramos, onChange, duration, currentTime, onJump }: {
  tramos: ComentarioTramo[];
  onChange: (next: ComentarioTramo[]) => void;
  duration: number;
  // Instante actual de reproducción: «+ Tramo» ancla ahí (con 5 s de tramo por
  // defecto, ajustables en segundos).
  currentTime: number;
  onJump?: (t: ComentarioTramo) => void;
}) {
  const add = () => {
    const start = Math.round(Math.min(currentTime, Math.max(0, duration - 0.5)) * 10) / 10;
    const end = Math.round(Math.min(duration, start + 5) * 10) / 10;
    onChange([...tramos, { id: uid("ct"), start, end, texto: "" }]);
  };
  const update = (id: string, patch: Partial<ComentarioTramo>) =>
    onChange(tramos.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  const segundos = (t: ComentarioTramo, campo: "start" | "end") => (
    <input type="number" min={0} max={duration} step={0.5} value={t[campo]}
      aria-label={campo === "start" ? "Inicio del tramo (s)" : "Fin del tramo (s)"}
      onChange={(e) => {
        const v = Math.max(0, Math.min(duration, Number(e.target.value) || 0));
        update(t.id, campo === "start" ? { start: v, end: Math.max(v, t.end) } : { end: v, start: Math.min(v, t.start) });
      }}
      style={{ ...S.input, width: 68, textAlign: "right", padding: "4px 8px", fontSize: 12 }} />
  );
  return (
    <div style={{ ...S.card, borderRadius: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={eyebrow}>Comentarios de tramo</span>
        <span style={{ flex: 1 }} />
        <button type="button" onClick={add} className="fa-pressable" style={{ ...S.btn, fontSize: 12, padding: "5px 12px" }}>
          + Tramo en {fmtClock(currentTime)}
        </button>
      </div>
      {tramos.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
          {tramos.map((t) => (
            <div key={t.id}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                <RangoBoton tramo={t} onJump={onJump} />
                {segundos(t, "start")}
                {segundos(t, "end")}
                <span style={{ flex: 1 }} />
                <button type="button" onClick={() => onChange(tramos.filter((x) => x.id !== t.id))}
                  aria-label={`Quitar comentario del tramo ${fmtClock(t.start)}–${fmtClock(t.end)}`} title="Quitar" className="fa-pressable"
                  style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, fontSize: 14, lineHeight: 1, padding: "0 2px" }}>✕</button>
              </div>
              <textarea value={t.texto} onChange={(e) => update(t.id, { texto: e.target.value })}
                placeholder="Comentario sobre este tramo del audio…"
                style={{ ...S.input, minHeight: 48, resize: "vertical", fontFamily: FONT_SANS, fontSize: 12.5 }} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Vista (alumno) ───────────────────────────────────────────────────────────
export function ComentariosTramoView({ tramos, onJump }: { tramos: ComentarioTramo[]; onJump?: (t: ComentarioTramo) => void }) {
  const conTexto = tramos.filter((t) => t.texto.trim());
  if (conTexto.length === 0) return null;
  return (
    <div style={{ ...S.card, borderRadius: 12, marginBottom: 16 }}>
      {conTexto.map((t, i) => (
        <div key={t.id} style={{ display: "flex", alignItems: "flex-start", gap: 9, padding: "8px 0", borderTop: i > 0 ? `1px solid ${C.line}` : "none" }}>
          <span aria-hidden="true" style={{ color: C.quiz, fontWeight: 700, flexShrink: 0 }}>›</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
              <span style={{ ...eyebrow, color: C.quiz }}>Comentario</span>
              <RangoBoton tramo={t} onJump={onJump} />
            </div>
            <div style={{ fontSize: 13, color: C.ink, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{t.texto}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
