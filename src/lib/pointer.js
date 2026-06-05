// ═══ DRAG DE PUNTERO UNIFICADO (RATÓN + TOUCH) ═══════════════════════════════
// Extraído de App.jsx (Fase 2).

// ─── Drag de puntero unificado (ratón + touch) ─────────────────────────────
export function startPointerDrag(event, { onStart, onMove, onEnd } = {}) {
  event.preventDefault();
  const getX = (ev) => ev.touches?.[0]?.clientX ?? ev.changedTouches?.[0]?.clientX ?? ev.clientX;
  onStart?.(event, getX);
  const move = (ev) => { if (ev.cancelable) ev.preventDefault(); onMove?.(ev, getX); };
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
