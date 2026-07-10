// ═══ KEBABMENU ════════════════════════════════════════════════════════════════
// Menú "⋯" reutilizable (acciones de curso / unidad / grupo / alumno / ejercicio).
// Sobre el primitivo Menu (M3.5) en modo portal: el desplegable vive a menudo
// dentro de un contenedor overflow:hidden (.fa-expand-inner de ExerciseItem),
// que recortaría un panel "absolute" — el portal lo evita.
//
// Extraído de courses.tsx (A1-04): courses.tsx importa ExerciseItem, que a su
// vez importaba KebabMenu de courses.tsx → ciclo. Fichero propio, no
// primitives.tsx (veredicto del informe final, prevalece sobre A2 §4.3).
import { C, F } from "../theme/tokens.js";
import { Menu } from "./primitives.jsx";

interface KebabItem { label: string; onClick: () => void; danger?: boolean; }

export function KebabMenu({ items, size = 28, title = "Acciones" }: { items: KebabItem[]; size?: number; title?: string }) {
  return (
    <Menu portal align="right" ariaLabel={title} panelStyle={{ minWidth: 178 }}
      trigger={({ open, toggle, triggerRef }) => (
        <button ref={triggerRef} onClick={toggle} title={title} aria-label={title} aria-haspopup="menu" aria-expanded={open}
          style={{ width: size, height: size, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", background: open ? C.field : "transparent", border: `1px solid ${open ? C.rail : "transparent"}`, color: "#888", cursor: "pointer" }}>
          <svg width={Math.round(size * 0.55)} height={Math.round(size * 0.55)} viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="4" cy="10" r="1.7" fill="currentColor" /><circle cx="10" cy="10" r="1.7" fill="currentColor" /><circle cx="16" cy="10" r="1.7" fill="currentColor" /></svg>
        </button>
      )}>
      {({ close }) => items.map((it, i) => (
        <button key={i} role="menuitem" onClick={() => { close(); it.onClick(); }}
          style={{ width: "100%", boxSizing: "border-box", textAlign: "left", display: "block", padding: "8px 10px", borderRadius: 7, border: "none", background: "transparent", cursor: "pointer", fontFamily: F.sans, fontSize: 13, fontWeight: 500, color: it.danger ? C.danger : C.ink2 }}>
          {it.label}
        </button>
      ))}
    </Menu>
  );
}
