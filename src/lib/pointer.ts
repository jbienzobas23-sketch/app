// ═══ DRAG DE PUNTERO UNIFICADO (RATÓN + TOUCH) ═══════════════════════════════
// Extraído de App.jsx (Fase 2). Migrado a TypeScript (Fase 3).
// Los eventos llegan desde handlers de React/DOM (ratón y touch); se tipan como
// `any` a propósito: la unión MouseEvent|TouchEvent crea fricción al acceder a
// clientX/touches y este es pegamento de eventos sin valor en tiparlo estricto.

type GetX = (ev: any) => number;
interface DragHandlers {
  onStart?: (ev: any, getX: GetX) => void;
  onMove?:  (ev: any, getX: GetX) => void;
  onEnd?:   () => void;
}

// ─── Drag de puntero unificado (ratón + touch) ─────────────────────────────
export function startPointerDrag(event: any, { onStart, onMove, onEnd }: DragHandlers = {}): void {
  event.preventDefault();
  const getX: GetX = (ev) => ev.touches?.[0]?.clientX ?? ev.changedTouches?.[0]?.clientX ?? ev.clientX;
  onStart?.(event, getX);
  const move = (ev: any) => { if (ev.cancelable) ev.preventDefault(); onMove?.(ev, getX); };
  const end  = () => {
    window.removeEventListener("mousemove", move);
    window.removeEventListener("mouseup",   end);
    window.removeEventListener("touchmove", move);
    window.removeEventListener("touchend",  end);
    window.removeEventListener("touchcancel", end);
    onEnd?.();
  };
  window.addEventListener("mousemove", move);
  window.addEventListener("mouseup",   end);
  window.addEventListener("touchmove", move, { passive: false });
  window.addEventListener("touchend",  end);
  window.addEventListener("touchcancel", end);
}
