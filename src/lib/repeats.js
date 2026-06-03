// ═══ SEGMENTOS DE REPETICIÓN (modelo Esquema / interactivo) ══════════════════
// Helpers puros para dividir la grabación en segmentos visuales con repeticiones
// y sincronizar la 2ª vez. Compartidos por ExerciseView y SchemaExerciseView.
// Extraídos de App.jsx (Fase 2).
import { uid } from "./ids.js";

/**
 * Divide la grabación en segmentos visuales. Cada repetición ocupa un slot cuyo
 * ancho de referencia es la duración de la 1ª vez; la 2ª vez comparte ese mismo
 * ancho horizontal pero se muestra en la fila inferior.
 */
export function buildRepeatSegments(duration, repetitions) {
  if (!repetitions?.length) {
    return [{ type: "normal", recStart: 0, recEnd: duration, canonDur: duration, vStart: 0, vEnd: 1, index: 0 }];
  }
  const reps = [...repetitions]
    .filter(r => r?.first?.start != null && r?.second?.end != null)
    .sort((a, b) => a.first.start - b.first.start);
  const raw = [];
  let cur = 0;
  for (const rep of reps) {
    if (cur < rep.first.start - 0.01)
      raw.push({ type: "normal", recStart: cur, recEnd: rep.first.start, canonDur: rep.first.start - cur });
    raw.push({ type: "repeat", rep, canonDur: rep.first.end - rep.first.start });
    cur = rep.second.end;
  }
  if (cur < duration - 0.01)
    raw.push({ type: "normal", recStart: cur, recEnd: duration, canonDur: duration - cur });
  const total = raw.reduce((s, g) => s + g.canonDur, 0) || 1;
  let v = 0;
  raw.forEach((g, i) => { g.vStart = v; v += g.canonDur / total; g.vEnd = v; g.index = i; });
  return raw;
}

/** Devuelve { min, max } en segundos de grabación para un segmento + fila. */
export function getSegBounds(seg, pass) {
  if (seg.type === "normal")         return { min: seg.recStart, max: seg.recEnd };
  if (seg.type === "repeat-first")   return { min: seg.recStart, max: seg.recEnd };
  if (seg.type === "repeat-second")  return { min: seg.recStart, max: seg.recEnd };
  return pass === "second"
    ? { min: seg.rep.second.start, max: seg.rep.second.end }
    : { min: seg.rep.first.start,  max: seg.rep.first.end  };
}

/**
 * En vista "completa": expande las repeticiones en segmentos secuenciales planos
 * (sin doble altura). Cada repetición produce dos segmentos consecutivos:
 * { type:"repeat-first"|"repeat-second", rep, recStart, recEnd, canonDur }
 */
export function buildCompleteViewSegments(duration, repetitions) {
  if (!repetitions?.length) {
    return [{ type: "normal", recStart: 0, recEnd: duration, canonDur: duration, vStart: 0, vEnd: 1, index: 0 }];
  }
  const reps = [...repetitions]
    .filter(r => r?.first?.start != null && r?.second?.end != null)
    .sort((a, b) => a.first.start - b.first.start);
  const raw = [];
  let cur = 0;
  for (const rep of reps) {
    if (cur < rep.first.start - 0.01)
      raw.push({ type: "normal", recStart: cur, recEnd: rep.first.start, canonDur: rep.first.start - cur });
    raw.push({ type: "repeat-first",  rep, recStart: rep.first.start,  recEnd: rep.first.end,  canonDur: rep.first.end  - rep.first.start  });
    // Gap entre fin del original y comienzo de la repetición (si existe)
    if (rep.second.start > rep.first.end + 0.01)
      raw.push({ type: "normal", recStart: rep.first.end, recEnd: rep.second.start, canonDur: rep.second.start - rep.first.end });
    raw.push({ type: "repeat-second", rep, recStart: rep.second.start, recEnd: rep.second.end, canonDur: rep.second.end - rep.second.start });
    cur = rep.second.end;
  }
  if (cur < duration - 0.01)
    raw.push({ type: "normal", recStart: cur, recEnd: duration, canonDur: duration - cur });
  const total = raw.reduce((s, g) => s + g.canonDur, 0) || 1;
  let v = 0;
  raw.forEach((g, i) => { g.vStart = v; v += g.canonDur / total; g.vEnd = v; g.index = i; });
  return raw;
}

/** Sincroniza los bloques de la 2ª vez a partir de los de la 1ª vez.
 *  - Bloques NO overridden: se sincronizan completamente (posición y duración).
 *  - Bloques overridden: conservan su start manual pero la DURACIÓN siempre
 *    sigue proporcional a la del bloque original. Así, redimensionar el original
 *    actualiza la duración de la repetición aunque haya sido editada.
 *  - Bloques anclados a bordes de zona (_lockedStart/_lockedEnd): el asa
 *    correspondiente no se muestra para impedir separarlo del borde.
 */
export function syncSecondPassBlocks(blocks, reps) {
  let result = [...blocks];
  for (const rep of reps) {
    const fd    = (rep.first.end  - rep.first.start)  || 1;
    const sd    = (rep.second.end - rep.second.start) || 1;
    const ratio = sd / fd;
    const firstBlocks  = blocks.filter(b => b.repeatId === rep.id && b.pass === "first"  && !b.isPreview);
    const secondBlocks = blocks.filter(b => b.repeatId === rep.id && b.pass === "second" && !b.isPreview);
    const newSecond = [];

    for (const fb of firstBlocks) {
      const isAtZoneStart = Math.abs(fb.start - rep.first.start) < 0.08;
      const isAtZoneEnd   = Math.abs(fb.end   - rep.first.end)   < 0.08;
      const derivedDur    = (fb.end - fb.start) * ratio;
      // Posición por defecto (sin override)
      const ds = isAtZoneStart ? rep.second.start : rep.second.start + ((fb.start - rep.first.start) / fd) * sd;
      const de = isAtZoneEnd   ? rep.second.end   : ds + derivedDur;

      const mirror = secondBlocks.find(b => b.mirrorId === fb.id);
      if (mirror?.overridden) {
        // Preservar start manual pero actualizar end con la duración proporcional
        let newStart, newEnd;
        if (isAtZoneStart) {
          newStart = rep.second.start;
          newEnd   = rep.second.start + derivedDur;
        } else if (isAtZoneEnd) {
          newEnd   = rep.second.end;
          newStart = rep.second.end - derivedDur;
        } else {
          newStart = mirror.start;
          newEnd   = mirror.start + derivedDur;
        }
        newStart = Math.max(rep.second.start, newStart);
        newEnd   = Math.min(rep.second.end,   newEnd);
        newSecond.push({ ...mirror, start: newStart, end: newEnd, _lockedStart: isAtZoneStart, _lockedEnd: isAtZoneEnd });
      } else if (mirror) {
        newSecond.push({ ...mirror, start: ds, end: de, label: fb.label, level: fb.level, customColor: fb.customColor, _lockedStart: isAtZoneStart, _lockedEnd: isAtZoneEnd });
      } else {
        newSecond.push({ ...fb, id: uid("sb"), pass: "second", mirrorId: fb.id, start: ds, end: de, _lockedStart: isAtZoneStart, _lockedEnd: isAtZoneEnd });
      }
    }
    // Overridden sin espejo primario: conservar
    for (const sb of secondBlocks) {
      if (sb.overridden && !newSecond.find(b => b.id === sb.id)) newSecond.push(sb);
    }
    result = result.filter(b => !(b.repeatId === rep.id && b.pass === "second" && !b.isPreview));
    result = [...result, ...newSecond];
  }
  return result;
}

/** Genera marcas de tiempo internas para la regla de un segmento. */
export function rulerTicksForSeg(start, end, widthPx) {
  const d = end - start; if (d <= 0) return [];
  const STEPS = [1, 2, 5, 10, 15, 20, 30, 60, 120, 300];
  const target = d / Math.max(2, Math.floor((widthPx || 200) / 55));
  const step = STEPS.find(s => s >= target) || STEPS[STEPS.length - 1];
  const ticks = [];
  const first_t = Math.ceil(start / step) * step;
  for (let t = first_t; t < end - step * 0.1; t += step) ticks.push({ t, frac: (t - start) / d });
  return ticks;
}

// ─── Barras de repetición (notación musical SVG) ─────────────────────────────
export const REPEAT_BARLINE_W = 17;   // ancho reservado para la barra de repetición (px)
