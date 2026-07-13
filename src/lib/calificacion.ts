// ═══ CALIFICACIÓN — NÚCLEO ARITMÉTICO ════════════════════════════════════════
// Una sola aritmética a cinco alturas (ítems→instrumento, niveles→ejercicio,
// partes/modelos→ejercicio, ejercicios→unidad, unidades→curso): `ponderar` es
// la única función de agregación; todo lo demás (aggregateParts en scoring.ts,
// las medias de N1, notaInstrumento…) se construye sobre ella. Ver
// docs/PLAN_CALIFICACION.md.

// N0.1 — la media ponderada: los null no cuentan ni en el numerador ni en el
// denominador (permite "no penalizar lo aún no corregido"); redondeo entero.
// aggregateParts (scoring.ts) se reimplementa sobre esta misma función.
export interface PonderarEntry { nota: number | null; peso: number; }

export function ponderar(entries: PonderarEntry[]): number | null {
  let weightedSum = 0;
  let totalWeight = 0;
  for (const { nota, peso } of entries) {
    if (nota == null) continue;
    weightedSum += nota * peso;
    totalWeight += peso;
  }
  return totalWeight > 0 ? Math.round(weightedSum / totalWeight) : null;
}
