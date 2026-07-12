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
// — viven en un overlay propio en el padre, pintado por ref.
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
import { SCHEMA_LEVELS } from "../../lib/schema.js";

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
  handleBlockKeyDown: (e: any, block: Block) => void;
}

export function SegBlocks({
  seg, pass, lvId, blocks, duration, listenOnly, schemaMarks, time, activeAt,
  selected, viewMode, schemaPalette, editId, editVal, setEditId, setEditVal, commitEdit,
  recToVisX, recToVisXResumed, handleBlockDown, handleSharedHandleDown, blockElRefs, handleBlockKeyDown,
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

  const { real, adjPairs, adjLIds, adjRIds } = useMemo(() => {
    const realArr = segBlocks.filter(b => !b.isPreview).sort((a, b) => a.start - b.start);
    const pairs = [];
    for (let i = 0; i < realArr.length - 1; i++) {
      if (Math.abs(realArr[i].end - realArr[i + 1].start) < 0.5)
        pairs.push({ left: realArr[i], right: realArr[i + 1] });
    }
    return {
      real: realArr,
      adjPairs: pairs,
      adjLIds: new Set(pairs.map(p => p.right.id)),
      adjRIds: new Set(pairs.map(p => p.left.id)),
    };
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

  // Altura real del bloque por nivel: la pista mide 62 (Partes) / 52 (Frases)
  // / 44 (resto) y el bloque va con top:6 bottom:6, así que su alto = pista − 12.
  const _trackH    = lvId === 1 ? 62 : lvId === 2 ? 52 : 44;
  const _blockH    = lvId >= 3 ? 32 : _trackH - 12;
  // Asas como "cápsulas" integradas DENTRO del borde del bloque (no objetos
  // aparte): un recuadro redondeado en cada extremo, con un chevron que indica
  // el sentido de arrastre.
  const _capW      = 16;
  // Mismo alto y radio que el bloque → las curvaturas del asa coinciden con su borde.
  // El extremo exterior copia el radio del bloque (semicírculo en píldoras, 5px en
  // rectángulos); el lado interior lleva un radio menor.
  const _capRouter = lvId >= 3 ? Math.round(_blockH / 2) : 5;
  const _capRinner = lvId >= 3 ? 6 : 5;
  // Operabilidad por teclado (C4.3h): bloques reales (no preview, no en vista
  // resumida — ahí el arrastre también está deshabilitado) son enfocables y
  // anuncian su posición vía aria-label, actualizado en cada render.
  const blockA11y = (block: Block) => (block.isPreview || viewMode === "resumida") ? {} : {
    tabIndex: 0,
    role: "button" as const,
    "aria-label": `Bloque ${block.label ?? ""}, de ${fmtClock(block.start)} a ${fmtClock(block.end)}`,
    onKeyDown: (e: any) => handleBlockKeyDown(e, block),
  };
  const capBase: CSSProperties = { position: "absolute", top: 6, height: _blockH, width: _capW, background: "#FFFFFF", boxShadow: "0 1px 3px rgba(0,0,0,0.16)", zIndex: 10, display: "flex", alignItems: "center", justifyContent: "center", boxSizing: "border-box" };
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
          background: block.isPreview ? `${bBg}38` : bBg, borderRadius: 5,
          // El borde depende SOLO de la selección (acción del usuario), nunca del
          // estado "activo" del cursor de reproducción. Ancho constante (2px) y sin
          // cambio de color al pasar la barra por encima → el bloque no varía nada.
          border: `2px solid ${isSel ? "rgba(255,255,255,0.82)" : "rgba(255,255,255,0.18)"}`,
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
    {/* Asas de borde libre — SOLO en el bloque seleccionado (Jon,
        2026-07-06: antes se veían todas, apagadas al 40%, todo el rato —
        ahora una asa que no es la del bloque seleccionado no se renderiza,
        en vez de solo atenuarse). Ocultas también en modo resumida y en
        bordes bloqueados. */}
    {viewMode !== "resumida" && real.flatMap(block => {
      if (selected !== block.id) return [];
      const lPct = ((block.start - bounds.min) / segDur) * 100;
      const rPct = ((block.end   - bounds.min) / segDur) * 100;
      const out: ReactNode[] = [];
      // Ocultar el asa izquierda si el bloque está bloqueado al borde de zona
      if (!adjLIds.has(block.id) && !block._lockedStart) out.push(
        <div key={`hl-${block.id}`} data-block="true"
          style={{ ...capBase, borderRadius: `${_capRouter}px ${_capRinner}px ${_capRinner}px ${_capRouter}px`, cursor: "ew-resize", left: `${lPct}%` }}
          onMouseDown={e => { e.stopPropagation(); handleBlockDown(e, block, "resize-l"); }}
          onTouchStart={e => { e.stopPropagation(); handleBlockDown(e, block, "resize-l"); }}>
          {edgeChevron("l")}
        </div>
      );
      // Ocultar el asa derecha si el bloque está bloqueado al borde de zona
      if (!adjRIds.has(block.id) && !block._lockedEnd) out.push(
        <div key={`hr-${block.id}`} data-block="true"
          style={{ ...capBase, borderRadius: `${_capRinner}px ${_capRouter}px ${_capRouter}px ${_capRinner}px`, cursor: "ew-resize", left: `calc(${rPct}% - ${_capW}px)` }}
          onMouseDown={e => { e.stopPropagation(); handleBlockDown(e, block, "resize-r"); }}
          onTouchStart={e => { e.stopPropagation(); handleBlockDown(e, block, "resize-r"); }}>
          {edgeChevron("r")}
        </div>
      );
      return out;
    })}
    {/* Asas de borde compartido — SOLO si uno de los dos bloques que la
        comparten está seleccionado (antes: siempre visible, apagada al
        40%). Ocultas también en modo resumida. */}
    {viewMode !== "resumida" && adjPairs.filter(({ left, right }) => selected === left.id || selected === right.id).map(({ left, right }) => {
      const pct = ((left.end - bounds.min) / segDur) * 100;
      return (
        <div key={`sh-${left.id}-${right.id}`} data-block="true"
          style={{ ...capBase, borderRadius: _capRouter, cursor: "col-resize", zIndex: 11, left: `calc(${pct}% - ${_capW / 2}px)` }}
          onMouseDown={e => handleSharedHandleDown(e, left, right)}
          onTouchStart={e => handleSharedHandleDown(e, left, right)}>
          {edgeChevron("both")}
        </div>
      );
    })}
  </>);
}
