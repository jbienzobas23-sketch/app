// ═══ USELISTENONLYMARKS ═══════════════════════════════════════════════════════
// Estado y handlers de las "marcas" del modo listen-only del esquema: crear
// (clic en la regla), arrastrar y borrar (clic sin arrastre) una marca.
// Extraído de SchemaExerciseView.tsx (C4.3d). Sin acoplamiento con el motor de
// arrastre de bloques (dragRef/trackSegRefs) — solo lee segmentsRef (ya
// existente en el padre) para mapear posición visual → tiempo de grabación.
import { useRef, useState } from "react";

export function useListenOnlyMarks(
  rulerContainerRef: React.RefObject<HTMLDivElement | null>,
  segmentsRef: React.RefObject<any[]>,
  getClientX: (e: any) => number,
) {
  const [schemaMarks, setSchemaMarks] = useState<number[]>([]);
  const schemaMarksRef = useRef<number[]>([]);
  schemaMarksRef.current = schemaMarks;

  // Mapeo visual → tiempo de grabación (mismo criterio que containerXToRecForPass,
  // pero para segmentos "repeat" siempre resuelve a la 1ª vez — las marcas no
  // distinguen pase).
  const containerXToRec = (xFrac: number) => {
    const segs = segmentsRef.current;
    for (const sg of segs) {
      if (xFrac >= sg.vStart - 0.001 && xFrac <= sg.vEnd + 0.001) {
        const f = sg.vEnd > sg.vStart
          ? Math.max(0, Math.min(1, (xFrac - sg.vStart) / (sg.vEnd - sg.vStart))) : 0;
        if (sg.type === "normal") return sg.recStart + f * sg.canonDur;
        if (sg.type === "repeat-first")  return sg.recStart + f * sg.canonDur;
        if (sg.type === "repeat-second") return sg.recStart + f * sg.canonDur;
        return sg.rep.first.start + f * (sg.rep.first.end - sg.rep.first.start);
      }
    }
    return 0;
  };

  const handleMarksContainerDown = (e: any) => {
    if (e.target.closest("[data-mark]")) return;
    const el = rulerContainerRef.current; if (!el) return;
    e.preventDefault();
    const rect = el.getBoundingClientRect();
    const t = containerXToRec(Math.max(0, Math.min(1, (getClientX(e) - rect.left) / rect.width)));
    setSchemaMarks(prev => [...prev, t].sort((a, b) => a - b));
  };

  const handleMarkDown = (e: any, idx: number) => {
    e.stopPropagation(); e.preventDefault();
    const el = rulerContainerRef.current; if (!el) return;
    const rect = el.getBoundingClientRect();
    const startX = getClientX(e);
    let moved = false;
    const mv = (ev: any) => {
      if (ev.cancelable) ev.preventDefault();
      const x = getClientX(ev);
      if (!moved && Math.abs(x - startX) > 3) moved = true;
      if (moved) {
        const t = containerXToRec(Math.max(0, Math.min(1, (x - rect.left) / rect.width)));
        setSchemaMarks(prev => { const n = [...prev]; n[idx] = t; return n; });
      }
    };
    const up = () => {
      if (!moved) setSchemaMarks(prev => prev.filter((_, i) => i !== idx));
      window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up);
      window.removeEventListener("touchmove", mv); window.removeEventListener("touchend", up);
    };
    window.addEventListener("mousemove", mv); window.addEventListener("mouseup", up);
    window.addEventListener("touchmove", mv, { passive: false }); window.addEventListener("touchend", up);
  };

  return { schemaMarks, schemaMarksRef, handleMarksContainerDown, handleMarkDown };
}
