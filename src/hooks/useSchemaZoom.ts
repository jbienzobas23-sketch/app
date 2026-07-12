// ═══ ZOOM Y DESPLAZAMIENTO HORIZONTAL DEL ESQUEMA ═══════════════════════════
// Extraído de SchemaExerciseView (F7, T7.1) sin cambio de comportamiento:
// rueda del ratón, pinch-to-zoom (móvil) y arrastre de la barra de scroll
// personalizada. Autónomo — solo depende de su propio estado y del ref del
// contenedor que expone (schemaOuterRef), sin tocar bloques/repeticiones.
import { useEffect, useRef, useState } from "react";

interface PinchState { dist: number; zoom: number; sf: number }

export interface SchemaZoomState {
  schemaZoom: number;
  schemaScrollFrac: number;
  schemaOuterRef: React.RefObject<HTMLDivElement | null>;
  handleSchemaPinchStart: (e: React.TouchEvent) => void;
  handleSchemaPinchMove: (e: React.TouchEvent) => void;
  handleSchemaPinchEnd: () => void;
  handleScrollbarTrackDown: (e: React.MouseEvent | React.TouchEvent) => void;
  zoomBy: (factor: number) => void;
}

export function useSchemaZoom(): SchemaZoomState {
  const [schemaZoom,       setSchemaZoom]       = useState(1);
  const [schemaScrollFrac, setSchemaScrollFrac] = useState(0);
  const schemaOuterRef = useRef<HTMLDivElement | null>(null);
  const pinchRef       = useRef<PinchState | null>(null);

  // ── Rueda del ratón → zoom (listener no-pasivo para poder preventDefault) ──
  useEffect(() => {
    const outer = schemaOuterRef.current; if (!outer) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const rect    = outer.getBoundingClientRect();
      const curFrac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const factor  = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      setSchemaZoom(prevZoom => {
        const nextZoom = Math.min(8, Math.max(1, prevZoom * factor));
        if (nextZoom !== prevZoom) {
          setSchemaScrollFrac(prevSf => {
            if (nextZoom === 1) return 0;
            const newSf = (((prevSf * (prevZoom - 1)) + curFrac) * (nextZoom / prevZoom) - curFrac) / (nextZoom - 1);
            return Math.max(0, Math.min(1, newSf));
          });
        }
        return nextZoom;
      });
    };
    outer.addEventListener('wheel', handler, { passive: false });
    return () => outer.removeEventListener('wheel', handler);
  }, []);

  // ── Pinch-to-zoom (móvil) ─────────────────────────────────────────────────
  const handleSchemaPinchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 2) return;
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    pinchRef.current = { dist: Math.hypot(dx, dy), zoom: schemaZoom, sf: schemaScrollFrac };
  };
  const handleSchemaPinchMove = (e: React.TouchEvent) => {
    if (e.touches.length !== 2 || !pinchRef.current) return;
    const dx  = e.touches[0].clientX - e.touches[1].clientX;
    const dy  = e.touches[0].clientY - e.touches[1].clientY;
    const newZoom = Math.min(8, Math.max(1, pinchRef.current.zoom * (Math.hypot(dx, dy) / pinchRef.current.dist)));
    setSchemaZoom(newZoom);
    if (e.cancelable) e.preventDefault();
  };
  const handleSchemaPinchEnd = () => { pinchRef.current = null; };

  // ── Botones de zoom +/− (C4.3h, A5-08) ───────────────────────────────────
  // Mismo cálculo que la rueda del ratón, pero centrado en el centro del
  // viewport (curFrac=0.5) — un botón no tiene una posición de cursor de la
  // que anclar el zoom.
  const zoomBy = (factor: number) => {
    setSchemaZoom(prevZoom => {
      const nextZoom = Math.min(8, Math.max(1, prevZoom * factor));
      if (nextZoom !== prevZoom) {
        setSchemaScrollFrac(prevSf => {
          if (nextZoom === 1) return 0;
          const curFrac = 0.5;
          const newSf = (((prevSf * (prevZoom - 1)) + curFrac) * (nextZoom / prevZoom) - curFrac) / (nextZoom - 1);
          return Math.max(0, Math.min(1, newSf));
        });
      }
      return nextZoom;
    });
  };

  // ── Drag de la barra de scroll personalizada ──────────────────────────────
  // El drag es RELATIVO: el desplazamiento es proporcional al movimiento del ratón/dedo,
  // sin saltar a la posición absoluta del clic.
  const handleScrollbarTrackDown = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const track   = e.currentTarget as HTMLElement;
    const nativeE = e.nativeEvent as MouseEvent & TouchEvent;
    const startX  = nativeE.touches?.[0]?.clientX ?? nativeE.clientX;
    const startSf = schemaScrollFrac;
    const move = (ev: MouseEvent | TouchEvent) => {
      const rect     = track.getBoundingClientRect();
      const x        = (ev as TouchEvent).touches?.[0]?.clientX ?? (ev as MouseEvent).clientX;
      const deltaX   = x - startX;
      const deltaFrac = deltaX / rect.width;
      // El thumb ocupa 1/zoom del track; el rango de movimiento del thumb es (1 - 1/zoom)
      const thumbRange = 1 - 1 / Math.max(1, schemaZoom);
      const newSf    = thumbRange > 0 ? startSf + deltaFrac / thumbRange : 0;
      setSchemaScrollFrac(Math.max(0, Math.min(1, newSf)));
    };
    const up = () => {
      window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up);
      window.removeEventListener('touchmove', move); window.removeEventListener('touchend', up);
    };
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
    window.addEventListener('touchmove', move, { passive: false }); window.addEventListener('touchend', up);
  };

  return {
    schemaZoom, schemaScrollFrac, schemaOuterRef,
    handleSchemaPinchStart, handleSchemaPinchMove, handleSchemaPinchEnd,
    handleScrollbarTrackDown, zoomBy,
  };
}
