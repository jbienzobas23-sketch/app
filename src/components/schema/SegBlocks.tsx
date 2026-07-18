// ═══ SEGBLOCKS ════════════════════════════════════════════════════════════════
// Renderizado de bloques (+ asas de borde libre/compartido) dentro de un
// segmento+fila del esquema. Extraído de SchemaExerciseView.tsx (C4.3e): no
// toca el motor de arrastre (dragRef/trackSegRefs) — recibe handleBlockDown/
// handleSharedHandleDown ya cerrados sobre esos refs en el padre, y se limita
// a invocarlos en los eventos de puntero, igual que antes.
// C4.3g: cada bloque expone su nodo DOM en `blockElRefs` (mapa compartido con
// el padre) para que el bucle rAF del arrastre pueda pintar su posición ahí
// directamente, sin pasar por props/estado durante el propio arrastre. Las
// guías de snap ya no se renderizan aquí (antes una copia por nivel×segmento)
// — viven en un overlay propio en el padre, pintado por ref. Sus asas de
// borde (libre/compartida) se exponen igual en `handleElRefs` — si no, se
// quedaban ancladas a la posición pre-arrastre hasta soltar (bug reportado
// tras A7-01: el bloque se movía por ref pero el asa seguía leyendo
// block.start/end del estado, congelado durante el drag).
// C4.3h: cada bloque es enfocable (tabIndex/role="button"/aria-label) y
// operable con ←→ (mover), Shift+←→ (redimensionar borde derecho) y Alt+←→
// (borde izquierdo) vía `handleBlockKeyDown`, cerrado en el padre sobre la
// misma lógica de snap/cascada que el arrastre.
import { useMemo, type ReactNode, type CSSProperties, type RefObject } from "react";
import { C, FONT_SANS } from "../../theme/tokens.js";
import { fmtClock } from "../../lib/time.js";
import type { Block } from "../../lib/repeats.js";
import { getSegBounds } from "../../lib/repeats.js";
import { harmonyBlockColors } from "../../lib/harmony.js";
import { partColorFromPalette, phraseColorFromPalette } from "../../lib/palette.js";
import { SCHEMA_LEVELS, SCHEMA_CAP_W, SCHEMA_CAP_TRANSITION, schemaBlockH, schemaCapRouter, schemaCapRadius, schemaCapLeft, isTransitionLabel } from "../../lib/schema.js";
import { TransitionArrow } from "./TransitionArrow.js";

interface SegBlocksProps {
  seg: any;
  pass: string;
  lvId: number;
  blocks: Block[];
  duration: number;
  listenOnly: boolean;
  schemaMarks: number[];
  time: number;
  activeAt: Record<number, string>;
  selected: string | null;
  viewMode: string;
  schemaPalette: string;
  editId: string | null;
  editVal: string;
  setEditId: (id: string | null) => void;
  setEditVal: (val: string) => void;
  commitEdit: () => void;
  recToVisX: (t: number) => number;
  recToVisXResumed: (t: number) => number;
  handleBlockDown: (e: any, block: Block, type?: string) => void;
  handleSharedHandleDown: (e: any, leftBlock: Block, rightBlock: Block) => void;
  blockElRefs: RefObject<Record<string, HTMLElement | null>>;
  handleElRefs: RefObject<Record<string, HTMLElement | null>>;
  handleBlockKeyDown: (e: any, block: Block) => void;
}

export function SegBlocks({
  seg, pass, lvId, blocks, duration, listenOnly, schemaMarks, time, activeAt,
  selected, viewMode, schemaPalette, editId, editVal, setEditId, setEditVal, commitEdit,
  recToVisX, recToVisXResumed, handleBlockDown, handleSharedHandleDown, blockElRefs, handleElRefs, handleBlockKeyDown,
}: SegBlocksProps) {
  const lv = SCHEMA_LEVELS.find(l => l.id === lvId)!;
  const bounds = getSegBounds(seg, pass);
  const segDur = (bounds.max - bounds.min) || 1;

  // Bloques/orden/adyacencia filtrados por nivel×segmento — memoizados porque
  // `time`/`activeAt` (playhead a 10fps) NO están en las dependencias: solo se
  // recalculan cuando cambian los bloques o el segmento, no en cada tick.
  const segBlocks = useMemo(() => blocks.filter(b => {
    if (b.level !== lvId) return false;
    if (seg.type === "normal") return !b.repeatId && b.end > bounds.min - 0.01 && b.start < bounds.max + 0.01;
    if (seg.type === "repeat-first")  return b.repeatId === seg.rep.id && b.pass === "first";
    if (seg.type === "repeat-second") return b.repeatId === seg.rep.id && b.pass === "second";
    return b.repeatId === seg.rep.id && b.pass === pass;
  }), [blocks, lvId, seg, pass, bounds.min, bounds.max]);

  const { real, adjPairs } = useMemo(() => {
    const realArr = segBlocks.filter(b => !b.isPreview).sort((a, b) => a.start - b.start);
    const pairs = [];
    for (let i = 0; i < realArr.length - 1; i++) {
      if (Math.abs(realArr[i].end - realArr[i + 1].start) < 0.5)
        pairs.push({ left: realArr[i], right: realArr[i + 1] });
    }
    return { real: realArr, adjPairs: pairs };
  }, [segBlocks]);

  // Color por bloque (cadena `harmonyBlockColors`/`partColorFromPalette`/
  // `phraseColorFromPalette`, incluida la búsqueda del bloque "Parte" padre
  // para el nivel 2) — memoizado por el mismo motivo: no depende de time/selected.
  const blockColors = useMemo(() => {
    const map = new Map<string, { bg: string; textColor: string }>();
    for (const block of segBlocks) {
      const colors = block.isPreview
        ? { bg: lv.color, textColor: "#FFFFFF" }
        : block.customColor ? harmonyBlockColors(null, block.customColor)
        : lv.id === 3 ? harmonyBlockColors(block.label, lv.color)
        : lv.id === 1 ? harmonyBlockColors(null, partColorFromPalette(block.label, schemaPalette))
        : lv.id === 2 ? (() => {
            const partB = blocks.find(b => b.level === 1 && !b.isPreview &&
              b.start <= block.start + 0.01 && b.end > block.start + 0.01 &&
              (block.repeatId ? b.repeatId === block.repeatId && b.pass === block.pass : !b.repeatId));
            const parentColor = partB ? (partB.customColor || partColorFromPalette(partB.label, schemaPalette)) : lv.color;
            return harmonyBlockColors(null, phraseColorFromPalette(block.label, parentColor, schemaPalette));
          })()
        : { bg: lv.color, textColor: "#FFFFFF" };
      map.set(block.id, colors);
    }
    return map;
  }, [segBlocks, blocks, schemaPalette, lv]);

  // Posición del cursor de reproducción en esta fila. "repeat-first"/
  // "repeat-second" (vista completa, Jon 2026-07-07) faltaban aquí — el
  // playhead solo se calculaba para "normal" y "repeat" (vista resumida),
  // así que desaparecía en cuanto la reproducción entraba en la zona de
  // repetición. recStart/recEnd de estos segmentos YA son tiempo absoluto
  // de grabación, igual que en "normal".
  let phPct = null;
  if ((seg.type === "normal" || seg.type === "repeat-first" || seg.type === "repeat-second") && time >= seg.recStart && time < seg.recEnd)
    phPct = ((time - seg.recStart) / seg.canonDur) * 100;
  else if (seg.type === "repeat") {
    if (pass === "first" && time >= seg.rep.first.start && time < seg.rep.first.end)
      phPct = ((time - seg.rep.first.start) / (seg.rep.first.end - seg.rep.first.start)) * 100;
    else if (pass === "second" && time >= seg.rep.second.start && time < seg.rep.second.end)
      phPct = ((time - seg.rep.second.start) / (seg.rep.second.end - seg.rep.second.start)) * 100;
  }

  // Altura del bloque y radio de cápsula/bloque: helpers compartidos con el
  // paintDrag de SchemaExerciseView (schema.ts) — reposo y arrastre coinciden.
  const _blockH    = schemaBlockH(lvId);
  // Asas como "cápsulas" integradas a RAS del borde del bloque (Jon,
  // 2026-07-16, v2): misma altura que el bloque, sin sombra y ceñidas al canto
  // visual. El extremo exterior copia el radio del bloque; el canto interior
  // va SIN redondear, en ángulo recto (estado libre).
  const _capW      = SCHEMA_CAP_W;
  const _capRouter = schemaCapRouter(lvId);
  // Operabilidad por teclado (C4.3h): bloques reales (no preview, no en vista
  // resumida — ahí el arrastre también está deshabilitado) son enfocables y
  // anuncian su posición vía aria-label, actualizado en cada render.
  const blockA11y = (block: Block) => (block.isPreview || viewMode === "resumida") ? {} : {
    tabIndex: 0,
    role: "button" as const,
    "aria-label": `Bloque ${block.label ?? ""}, de ${fmtClock(block.start)} a ${fmtClock(block.end)}`,
    onKeyDown: (e: any) => handleBlockKeyDown(e, block),
  };
  const capBase: CSSProperties = { position: "absolute", top: 6, height: _blockH, width: _capW, background: "#FFFFFF", zIndex: 10, display: "flex", alignItems: "center", justifyContent: "center", boxSizing: "border-box" };
  const _capChev   = "rgba(35,40,70,0.72)";
  const edgeChevron = (dir: "l" | "r" | "both") => (
    <svg width={dir === "both" ? 14 : 9} height="12" viewBox={dir === "both" ? "0 0 14 12" : "0 0 9 12"} fill="none" style={{ pointerEvents: "none" }}>
      {dir === "l" && <path d="M6 2 L2.5 6 L6 10" stroke={_capChev} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />}
      {dir === "r" && <path d="M3 2 L6.5 6 L3 10" stroke={_capChev} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />}
      {dir === "both" && <>
        <path d="M5 2 L2 6 L5 10" stroke={_capChev} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M9 2 L12 6 L9 10" stroke={_capChev} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </>}
    </svg>
  );
  // Los DOS chevrones de la cápsula, apilados, con fundido cruzado por opacidad
  // según el estado (libre = simple, compartida = doble). paintDrag localiza
  // cada capa por data-chev para poder mutar el estado en mitad del arrastre.
  const chevLayer: CSSProperties = { position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", transition: "opacity 120ms ease", pointerEvents: "none" };
  const capChevrons = (side: "l" | "r", shared: boolean) => (<>
    <span data-chev="single" style={{ ...chevLayer, opacity: shared ? 0 : 1 }}>{edgeChevron(side)}</span>
    <span data-chev="both"   style={{ ...chevLayer, opacity: shared ? 1 : 0 }}>{edgeChevron("both")}</span>
  </>);

  return (<>
    {/* Cuadrícula de fondo — paso fijo global para que la densidad
        sea la misma en todos los segmentos independientemente de su duración */}
    {(() => {
      const GRID_STEPS = [1, 2, 5, 10, 15, 20, 30, 60, 120, 300];
      const gridTarget = duration / 10; // ~10 divisiones en toda la pieza
      const step = GRID_STEPS.find(s => s >= gridTarget) ?? GRID_STEPS[GRID_STEPS.length - 1];
      const lines = [];
      const t0 = Math.ceil(bounds.min / step) * step;
      for (let t = t0; t < bounds.max - step * 0.05; t += step)
        lines.push((t - bounds.min) / segDur);
      return lines.map((f, i) => (
        <div key={i} style={{ position: "absolute", top: 0, left: `${f * 100}%`, width: 1, height: "100%", background: "rgba(0,0,0,0.04)", pointerEvents: "none" }} />
      ));
    })()}
    {/* Marcas listen-only */}
    {listenOnly && schemaMarks.filter(mt => mt >= bounds.min && mt < bounds.max).map((mt, i) => (
      <div key={i} style={{ position: "absolute", top: 0, left: `${((mt - bounds.min) / segDur) * 100}%`, width: 1, height: "100%", background: "rgba(184,74,58,0.28)", pointerEvents: "none", zIndex: 7 }} />
    ))}
    {/* Cursor de reproducción */}
    {phPct !== null && (
      <div style={{ position: "absolute", top: 0, left: `${phPct}%`, width: 1, height: "100%", background: C.danger, opacity: 0.5, pointerEvents: "none", zIndex: 6 }} />
    )}
    {/* Bloques */}
    {segBlocks.map(block => {
      const isActive = activeAt[lvId] === block.id, isSel = selected === block.id;
      // En vista resumida los bloques sin repeatId pueden cruzar la zona de
      // repetición (la parte abarca tanto la 1ª como la 2ª vez). Usamos
      // recToVisXResumed para que su anchura visual sea correcta.
      let lPct: number, wPct: number;
      if (viewMode === "resumida" && seg.type === "normal" && !block.repeatId) {
        const segVW = (seg.vEnd - seg.vStart) || 1;
        const visS  = recToVisX(block.start);
        const visE  = recToVisXResumed(block.end);
        lPct = Math.max(0, (visS - seg.vStart) / segVW) * 100;
        wPct = Math.max(0, (visE - visS) / segVW) * 100;
      } else {
        lPct = Math.max(0, ((block.start - bounds.min) / segDur) * 100);
        wPct = Math.max(0, ((block.end - block.start) / segDur) * 100);
      }
      const { bg: bBg, textColor: bTx } = blockColors.get(block.id)!;

      // ── Bloque de transición (puente/transición/enlace/retransición): FLECHA ──
      // En cualquier nivel. Se conserva TODO lo interactivo (arrastrar, asas de
      // redimensión en los cantos, doble clic para renombrar): solo cambia el
      // relleno por una flecha que rellena el nodo, así paintBlockPos la
      // redimensiona en vivo sin tocar nada. Durante la edición (editId) cae al
      // render normal para mostrar el input; al confirmar vuelve a ser flecha.
      // El inset por nivel coincide con paintBlockPos (rect 1px / píldora 0).
      if (isTransitionLabel(block.label) && editId !== block.id) {
        const insT = (lvId === 3 || lvId === 4) ? 0 : 1;
        return (
          <div key={block.id} data-block="true" data-transition="true" title={block.label ?? undefined} ref={el => { blockElRefs.current[block.id] = el; }} {...blockA11y(block)} style={{
            position: "absolute", top: 6, bottom: 6,
            left: insT ? `calc(${lPct}% + ${insT}px)` : `${lPct}%`,
            width: insT ? `calc(${wPct}% - ${insT * 2}px)` : `${wPct}%`,
            // Sin relleno ni borde (lee como flecha sobre la pista, no como
            // placa); la selección la señalan las asas + un tinte muy tenue.
            background: isSel ? "rgba(0,0,0,0.05)" : "transparent",
            borderRadius: _capRouter,
            display: "flex", alignItems: "center", justifyContent: "center",
            overflow: "hidden", cursor: (block.isPreview || viewMode === "resumida") ? "default" : "grab",
            zIndex: isSel ? 7 : isActive ? 4 : 3, boxSizing: "border-box",
          }}
            onMouseDown={e => !(block.isPreview || viewMode === "resumida") && handleBlockDown(e, block, "move")}
            onTouchStart={e => !(block.isPreview || viewMode === "resumida") && handleBlockDown(e, block, "move")}
            onDoubleClick={() => { if (!(block.isPreview || viewMode === "resumida" || block.pass === "second")) { setEditId(block.id); setEditVal(block.label ?? ""); } }}>
            <TransitionArrow color={bBg} label={block.label ?? undefined} />
          </div>
        );
      }

      // ── Nivel 3 (Armonía): píldora de color + línea horizontal ─────────
      if (lvId === 3) {
        const pillBg = block.isPreview ? `${bBg}60` : bBg;
        return (
          <div key={block.id} data-block="true" ref={el => { blockElRefs.current[block.id] = el; }} {...blockA11y(block)} style={{
            position: "absolute", top: 6, bottom: 6, left: `${lPct}%`, width: `${wPct}%`,
            background: "transparent",
            borderRadius: 999,
            boxShadow: "none",
            display: "flex", alignItems: "center",
            overflow: "hidden",
            cursor: (block.isPreview || viewMode === "resumida") ? "default" : "grab",
            zIndex: isSel ? 7 : isActive ? 4 : 3,
            boxSizing: "border-box",
          }}
            onMouseDown={e => !(block.isPreview || viewMode === "resumida") && handleBlockDown(e, block, "move")}
            onTouchStart={e => !(block.isPreview || viewMode === "resumida") && handleBlockDown(e, block, "move")}
            onDoubleClick={() => { if (!(block.isPreview || viewMode === "resumida" || block.pass === "second")) { setEditId(block.id); setEditVal(block.label ?? ""); } }}>
            {/* Píldora izquierda */}
            {editId === block.id ? (
              <div style={{ alignSelf: "center", background: pillBg, borderRadius: 999, display: "flex", alignItems: "center", padding: "5px 8px", flexShrink: 0 }}>
                <input autoFocus value={editVal} onChange={e => setEditVal(e.target.value)}
                  onBlur={commitEdit} onKeyDown={e => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") setEditId(null); }}
                  onClick={e => e.stopPropagation()}
                  style={{ width: 60, background: "transparent", border: "none", borderBottom: "1.5px solid rgba(255,255,255,0.8)", color: bTx, fontSize: 11, fontWeight: 700, textAlign: "center", outline: "none", padding: "2px 2px", fontFamily: FONT_SANS, borderRadius: 2 }} />
              </div>
            ) : (
              <div style={{ alignSelf: "center", background: pillBg, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", padding: "5px 11px", flexShrink: 0, boxSizing: "border-box" }}>
                {wPct >= 2 && (
                  <span style={{ fontSize: wPct < 5 ? 9 : 11, fontWeight: 700, color: bTx, textShadow: bTx === "#FFFFFF" ? "0 1px 3px rgba(0,0,0,0.28)" : "none", fontFamily: FONT_SANS, whiteSpace: "nowrap", pointerEvents: "none" }}>
                    {block.label}
                  </span>
                )}
              </div>
            )}
            {/* Línea horizontal hasta el borde derecho */}
            {wPct >= 3 && (
              <div style={{ flex: 1, minWidth: 0, height: 2.5, background: pillBg, opacity: 0.55, marginLeft: 4, borderRadius: 1.5, flexShrink: 1 }} />
            )}
          </div>
        );
      }

      // ── Nivel 4 (Texto): píldora de ancho completo, sin línea ───────────
      if (lvId === 4) {
        const pillBg = block.isPreview ? `${bBg}60` : bBg;
        return (
          <div key={block.id} data-block="true" title={block.label ?? undefined} ref={el => { blockElRefs.current[block.id] = el; }} {...blockA11y(block)} style={{
            position: "absolute", top: 6, bottom: 6, left: `${lPct}%`, width: `${wPct}%`,
            display: "flex", alignItems: "stretch",
            overflow: "hidden",
            cursor: (block.isPreview || viewMode === "resumida") ? "default" : "grab",
            zIndex: isSel ? 7 : isActive ? 4 : 3,
            boxSizing: "border-box",
          }}
            onMouseDown={e => !(block.isPreview || viewMode === "resumida") && handleBlockDown(e, block, "move")}
            onTouchStart={e => !(block.isPreview || viewMode === "resumida") && handleBlockDown(e, block, "move")}
            onDoubleClick={() => { if (!(block.isPreview || viewMode === "resumida" || block.pass === "second")) { setEditId(block.id); setEditVal(block.label ?? ""); } }}>
            {editId === block.id ? (
              <div style={{ flex: 1, background: pillBg, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 11px", overflow: "hidden" }}>
                <input autoFocus value={editVal} onChange={e => setEditVal(e.target.value)}
                  onBlur={commitEdit} onKeyDown={e => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") setEditId(null); }}
                  onClick={e => e.stopPropagation()}
                  style={{ width: "82%", background: "transparent", border: "none", borderBottom: "1.5px solid rgba(255,255,255,0.8)", color: bTx, fontSize: 11, fontWeight: 500, textAlign: "center", outline: "none", padding: "2px 4px", fontFamily: FONT_SANS, borderRadius: 2 }} />
              </div>
            ) : (
              <div style={{ flex: 1, background: pillBg, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", padding: "5px 11px", overflow: "hidden" }}>
                {/* A5-02/A5-03: nunca fontSize:0 — bajo el umbral, al menos la
                    inicial de la etiqueta, con overflow visible si hace falta. */}
                <span style={{ fontSize: wPct < 3.5 ? 8 : wPct < 6 ? 9 : 11, fontWeight: 500, color: bTx, textShadow: bTx === "#FFFFFF" ? "0 1px 3px rgba(0,0,0,0.28)" : "none", maxWidth: "90%", overflow: wPct < 3.5 ? "visible" : "hidden", textOverflow: wPct < 3.5 ? "clip" : "ellipsis", whiteSpace: "nowrap", fontFamily: FONT_SANS, pointerEvents: "none" }}>
                  {wPct < 3.5 ? (block.label ?? "").charAt(0) : block.label}
                </span>
              </div>
            )}
          </div>
        );
      }

      // ── Resto de niveles: rectángulo relleno (estilo original) ──────────
      // Pelín de espacio visual SIEMPRE, en los dos lados (Jon, 2026-07-06,
      // v3): la v2 quitaba el inset en los cantos compartidos (imantados)
      // para que "se notara" el imán, pero a 0px el hueco quedaba demasiado
      // apurado — dos bloques imantados se leían casi como uno solo, con el
      // asa compartida como única pista. El imán en sí ya no depende de
      // esto (es un problema de datos, ya arreglado en los handlers de
      // resize): visualmente basta un hueco pequeño y CONSTANTE, esté o no
      // imantado el bloque.
      const ins = 1;
      return (
        <div key={block.id} data-block="true" title={block.label ?? undefined} ref={el => { blockElRefs.current[block.id] = el; }} {...blockA11y(block)} style={{
          position: "absolute", top: 6, bottom: 6, left: `calc(${lPct}% + ${ins}px)`, width: `calc(${wPct}% - ${ins * 2}px)`,
          // Mismo radio que las asas (_capRouter): al ir la cápsula a ras del
          // canto, sus curvas exteriores deben coincidir con las del bloque.
          background: block.isPreview ? `${bBg}38` : bBg, borderRadius: _capRouter,
          // Borde tenue CONSTANTE (Jon, 2026-07-16): el borde blanco de
          // selección creaba un halo alrededor del bloque — efecto óptico de
          // "placa" con las asas a ras. La selección ya la señalan las asas
          // (solo visibles en el bloque seleccionado) y la sombra; el borde no
          // cambia ni con la selección ni con el cursor de reproducción.
          border: "2px solid rgba(255,255,255,0.18)",
          boxShadow: isSel ? "0 2px 10px rgba(0,0,0,0.16)" : "none",
          display: "flex", alignItems: "center", justifyContent: "center",
          overflow: "hidden", cursor: (block.isPreview || viewMode === "resumida") ? "default" : "grab",
          zIndex: isSel ? 7 : isActive ? 4 : 3, boxSizing: "border-box",
        }}
          onMouseDown={e => !(block.isPreview || viewMode === "resumida") && handleBlockDown(e, block, "move")}
          onTouchStart={e => !(block.isPreview || viewMode === "resumida") && handleBlockDown(e, block, "move")}
          onDoubleClick={() => { if (!(block.isPreview || viewMode === "resumida" || block.pass === "second")) { setEditId(block.id); setEditVal(block.label ?? ""); } }}>
          {editId === block.id ? (
            <input autoFocus value={editVal} onChange={e => setEditVal(e.target.value)}
              onBlur={commitEdit} onKeyDown={e => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") setEditId(null); }}
              onClick={e => e.stopPropagation()}
              style={{ width: "82%", background: "rgba(0,0,0,0.18)", border: "none", borderBottom: "1.5px solid rgba(255,255,255,0.85)", color: "white", fontSize: 12, fontWeight: lvId === 1 ? 700 : 500, textAlign: "center", outline: "none", padding: "2px 4px", fontFamily: FONT_SANS, borderRadius: 2 }} />
          ) : (
            <span style={{ fontSize: wPct < 3.5 ? 8 : wPct < 6 ? 9 : 12, fontWeight: lvId === 1 ? 700 : 500, color: bTx, textShadow: bTx === "#FFFFFF" ? "0 1px 3px rgba(0,0,0,0.28)" : "none", maxWidth: "84%", overflow: wPct < 3.5 ? "visible" : "hidden", textOverflow: wPct < 3.5 ? "clip" : "ellipsis", whiteSpace: "nowrap", fontFamily: FONT_SANS, pointerEvents: "none" }}>
              {wPct < 3.5 ? (block.label ?? "").charAt(0) : block.label}
            </span>
          )}
        </div>
      );
    })}
    {/* Asas del bloque seleccionado — SIEMPRE sus dos lados (Jon, 2026-07-16,
        v3): cada lado es UN único elemento persistente (hl-/hr-) que muta
        entre "libre" (a ras dentro del canto, chevron simple, redimensiona
        este bloque) y "compartida" (centrada en la juntura con el vecino
        imantado, chevron doble, arrastra el borde común de ambos — antes era
        un tercer elemento sh- aparte). El cambio de estado se anima
        (SCHEMA_CAP_TRANSITION); durante un arrastre, paintDrag pinta left a
        cada frame con la variante _DRAG y muta radio/chevrones por ref, así
        el asa acompaña al canto y se transforma en vez de desaparecer.
        Ocultas en modo resumida; un canto bloqueado (borde de zona) sin
        vecino imantado sigue sin asa, como antes. */}
    {viewMode !== "resumida" && real.flatMap(block => {
      if (selected !== block.id) return [];
      const leftPair  = adjPairs.find(p => p.right.id === block.id);
      const rightPair = adjPairs.find(p => p.left.id  === block.id);
      const lPct = ((block.start - bounds.min) / segDur) * 100;
      const rPct = ((block.end   - bounds.min) / segDur) * 100;
      const out: ReactNode[] = [];
      if (leftPair || !block._lockedStart) out.push(
        <div key={`hl-${block.id}`} data-block="true" ref={el => { handleElRefs.current[`hl-${block.id}`] = el; }}
          style={{ ...capBase, transition: SCHEMA_CAP_TRANSITION, zIndex: leftPair ? 11 : 10,
                   borderRadius: schemaCapRadius(lvId, leftPair ? "shared" : "l"),
                   cursor: leftPair ? "col-resize" : "ew-resize",
                   left: schemaCapLeft(lPct, leftPair ? "shared" : "l") }}
          onMouseDown={e => { e.stopPropagation(); if (leftPair) handleSharedHandleDown(e, leftPair.left, leftPair.right); else handleBlockDown(e, block, "resize-l"); }}
          onTouchStart={e => { e.stopPropagation(); if (leftPair) handleSharedHandleDown(e, leftPair.left, leftPair.right); else handleBlockDown(e, block, "resize-l"); }}>
          {capChevrons("l", !!leftPair)}
        </div>
      );
      if (rightPair || !block._lockedEnd) out.push(
        <div key={`hr-${block.id}`} data-block="true" ref={el => { handleElRefs.current[`hr-${block.id}`] = el; }}
          style={{ ...capBase, transition: SCHEMA_CAP_TRANSITION, zIndex: rightPair ? 11 : 10,
                   borderRadius: schemaCapRadius(lvId, rightPair ? "shared" : "r"),
                   cursor: rightPair ? "col-resize" : "ew-resize",
                   left: schemaCapLeft(rPct, rightPair ? "shared" : "r") }}
          onMouseDown={e => { e.stopPropagation(); if (rightPair) handleSharedHandleDown(e, rightPair.left, rightPair.right); else handleBlockDown(e, block, "resize-r"); }}
          onTouchStart={e => { e.stopPropagation(); if (rightPair) handleSharedHandleDown(e, rightPair.left, rightPair.right); else handleBlockDown(e, block, "resize-r"); }}>
          {capChevrons("r", !!rightPair)}
        </div>
      );
      return out;
    })}
  </>);
}
