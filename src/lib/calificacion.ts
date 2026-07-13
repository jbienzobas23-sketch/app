// ═══ CALIFICACIÓN — NÚCLEO ARITMÉTICO ════════════════════════════════════════
// Una sola aritmética a cinco alturas (ítems→instrumento, niveles→ejercicio,
// partes/modelos→ejercicio, ejercicios→unidad, unidades→curso): `ponderar` es
// la única función de agregación; todo lo demás (aggregateParts en scoring.ts,
// las medias de N1, notaInstrumento…) se construye sobre ella. Ver
// docs/PLAN_CALIFICACION.md.
//
// Módulo hoja a propósito: no importa de scoring.ts (que sí importa de aquí,
// ponderar/labelsMatchForLevel/matchSchemaBlocks) para no crear un ciclo de
// imports — mismo patrón que ya usa scoring.ts con su propio `Question` local
// en vez de importarlo de types.ts.
import { partSlotIndex, phraseSlotIndex } from "./palette.js";

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

// ─── N0.2: modelo de datos (sobres JSONB, cero migraciones) ─────────────────
// Instrumento reutilizable (lista de control / escala estimativa / rúbrica) y
// configuración de pesos de PesoEditor — ver §2 de PLAN_CALIFICACION.md. Se
// definen aquí (no en types.ts) porque son propios de esta capa; types.ts los
// importa para tipar Course/Unit/Exercise/Question.evaluacion.
export interface Instrumento {
  tipo: "lista" | "escala" | "rubrica";
  titulo?: string;
  niveles: { id: string; etiqueta: string; valor: number }[]; // valor 0..1; lista = [Sí:1, No:0]
  items: {
    id: string;
    texto: string;
    peso: number; // coeficiente libre, no exige sumar 100
    descriptores?: Record<string, string>; // rúbrica: texto por (item, nivel)
  }[];
}

export interface PesoConfig { modo: "equitativa" | "personalizada"; pesos?: Record<string, number>; }

// Sobre de evaluación de un ejercicio (niveles del interactivo, etiqueta del
// esquema, modelos de un híbrido, instrumento de una pregunta/ejercicio libre).
export interface EvaluacionExercise {
  niveles?: { grados?: number; cifrado?: number };
  etiquetaCuenta?: boolean;
  equivalencias?: string[][];
  modelos?: Record<string, number>;
  instrumento?: Instrumento;
}

// Lectores tolerantes: en ausencia del sobre `evaluacion`, cada uno devuelve
// exactamente el comportamiento actual (regla de oro 1) — nada cambia de nota
// por instalar este plan hasta que el profesor active algo explícitamente.

function pesosDe(config: PesoConfig | null | undefined, ids: string[]): { id: string; peso: number }[] {
  const personalizada = config?.modo === "personalizada";
  return ids.map((id) => ({ id, peso: personalizada ? (config?.pesos?.[id] ?? 1) : 1 }));
}

export function pesosDeCurso(course: { evaluacion?: PesoConfig } | null | undefined, unitIds: string[]): { id: string; peso: number }[] {
  return pesosDe(course?.evaluacion, unitIds);
}

export function pesosDeUnidad(unit: { evaluacion?: PesoConfig } | null | undefined, exerciseIds: string[]): { id: string; peso: number }[] {
  return pesosDe(unit?.evaluacion, exerciseIds);
}

// Defecto {grados: 1}: un ejercicio interactivo sin sobre puntúa solo por
// grados, igual que hoy.
export function nivelesDe(exercise: { evaluacion?: EvaluacionExercise } | null | undefined): Record<string, number> {
  const niveles = exercise?.evaluacion?.niveles;
  if (!niveles || (niveles.grados == null && niveles.cifrado == null)) return { grados: 1 };
  const out: Record<string, number> = {};
  if (niveles.grados != null) out.grados = niveles.grados;
  if (niveles.cifrado != null) out.cifrado = niveles.cifrado;
  return out;
}

// Pesos por modelo de un híbrido (N2.5); vacío = "todos iguales" — el
// combinador aplica `?? 1` por modelo, mismo patrón que part.points.
export function modelosDe(exercise: { evaluacion?: EvaluacionExercise } | null | undefined): Record<string, number> {
  return exercise?.evaluacion?.modelos ?? {};
}

export function etiquetaCuentaDe(exercise: { evaluacion?: EvaluacionExercise } | null | undefined): boolean {
  return exercise?.evaluacion?.etiquetaCuenta ?? false;
}

export function equivalenciasDe(exercise: { evaluacion?: EvaluacionExercise } | null | undefined): string[][] {
  return exercise?.evaluacion?.equivalencias ?? [];
}

// Vale tanto para un ejercicio (esquema/libre) como para una pregunta de
// desarrollo — ambos comparten la misma forma `evaluacion.instrumento`.
export function instrumentoDe(target: { evaluacion?: { instrumento?: Instrumento } } | null | undefined): Instrumento | undefined {
  return target?.evaluacion?.instrumento;
}

// ─── N0.3: nota de un instrumento (lista/escala/rúbrica) a partir de las
// respuestas del profesor (una elección de nivel por ítem) ──────────────────
// Ítems sin responder no penalizan (quedan fuera de ponderar, igual que una
// parte sin corregir) — el panel de corrección (N4) exige completarlos todos
// antes de poder marcar la unidad como "corregido".
export function notaInstrumento(
  instrumento: Instrumento | null | undefined,
  respuestas: Record<string, string> | null | undefined,
): number | null {
  if (!instrumento?.items?.length) return null;
  const valorPorNivel = new Map(instrumento.niveles.map((n) => [n.id, n.valor]));
  const elegido = respuestas ?? {};
  return ponderar(
    instrumento.items.map((item) => {
      const nivelId = elegido[item.id];
      const valor = nivelId != null ? valorPorNivel.get(nivelId) : undefined;
      return { nota: valor != null ? valor * 100 : null, peso: item.peso };
    }),
  );
}

// ─── N0.4: esquema — emparejador clave↔alumno compartido, equivalencia de
// etiquetas y nota de colocación+etiqueta ────────────────────────────────────
// SchemaBlock duplica la forma del homónimo de scoring.ts (id?/level/start/
// end/label?) a propósito — mismo patrón local que ya usa scoring.ts, y
// estructuralmente compatible (TS es estructural, no hace falta convertir).
export interface SchemaBlock { id?: string; level: number; start: number; end: number; label?: string; }

export const normalizeLabel = (s?: string | null): string =>
  (s ?? "").trim().normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Etiqueta correcta si coincide su ranura semántica (A/B/C/D para Partes,
// a/b/c/d para Frases — "Desarrollo" y "B" cuentan como la misma etiqueta). Si
// la ranura no aplica a ninguna de las dos (niveles 3/4, o fuera de patrón),
// cae a igualdad de texto normalizado. Movida desde scoring.ts (N0.4): sigue
// siendo la que usa schemaDiagnostics para su etiquetaOk, ahora importada.
export const labelsMatchForLevel = (level: number, keyLabel?: string | null, studentLabel?: string | null): boolean => {
  const slotFn = level === 1 ? partSlotIndex : level === 2 ? phraseSlotIndex : null;
  if (slotFn) {
    const a = slotFn(keyLabel), b = slotFn(studentLabel);
    if (a != null && b != null) return a === b;
  }
  const nk = normalizeLabel(keyLabel);
  return nk !== "" && nk === normalizeLabel(studentLabel);
};

export interface SchemaBlockMatch { key: SchemaBlock; student: SchemaBlock | null; delta: number | null; }

// Empareja cada bloque de la clave con, como mucho, un bloque del alumno del
// mismo nivel y dentro del margen (el más cercano; cada bloque del alumno se
// usa una sola vez) — extraído de schemaDiagnostics para compartirlo con
// calcSchemaScore; el comportamiento no cambia (mismos tests de schemaDiagnostics).
export function matchSchemaBlocks(
  keyBlocks: SchemaBlock[],
  studentBlocks: SchemaBlock[] | null | undefined,
  margin: number,
): { matches: SchemaBlockMatch[]; sobrantes: SchemaBlock[] } {
  const pool = [...(studentBlocks ?? [])];
  const matches: SchemaBlockMatch[] = keyBlocks.map((kb) => {
    let best: SchemaBlock | null = null;
    let bestDist = Infinity;
    let bestIdx = -1;
    for (let i = 0; i < pool.length; i++) {
      const sb = pool[i];
      if (sb.level !== kb.level) continue;
      const dist = Math.max(Math.abs(sb.start - kb.start), Math.abs(sb.end - kb.end));
      if (dist <= margin && dist < bestDist) { best = sb; bestDist = dist; bestIdx = i; }
    }
    if (!best) return { key: kb, student: null, delta: null };
    pool.splice(bestIdx, 1);
    const delta = Math.round((best.start - kb.start) * 10) / 10;
    return { key: kb, student: best, delta };
  });
  return { matches, sobrantes: pool };
}

// Unión de labelsMatchForLevel (ranura semántica) y los grupos de sinónimos
// que el profesor define en el ejercicio (p. ej. "Puente" = "Transición",
// que no comparten ranura y por tanto labelsMatchForLevel por sí sola no
// cubre). Normaliza tildes/mayúsculas antes de comparar contra cada grupo.
export function etiquetaEquivalente(
  level: number,
  a: string | null | undefined,
  b: string | null | undefined,
  equivalencias: string[][] = [],
): boolean {
  if (labelsMatchForLevel(level, a, b)) return true;
  const na = normalizeLabel(a), nb = normalizeLabel(b);
  if (!na || !nb) return false;
  return equivalencias.some((grupo) => {
    const normGrupo = grupo.map(normalizeLabel);
    return normGrupo.includes(na) && normGrupo.includes(nb);
  });
}

// % de bloques de la clave con colocación dentro de margen y, si etiquetaCuenta,
// con etiqueta equivalente. calcSchemaPlacementScore (scoring.ts) sigue siendo
// el lector legado para ejercicios sin sobre `evaluacion` (regla de oro 1).
export function calcSchemaScore(
  keyBlocks: SchemaBlock[] | null | undefined,
  studentBlocks: SchemaBlock[] | null | undefined,
  margin: number,
  opts: { etiquetaCuenta?: boolean; equivalencias?: string[][] } = {},
): number | null {
  if (!keyBlocks?.length) return null;
  const { etiquetaCuenta = false, equivalencias = [] } = opts;
  const { matches } = matchSchemaBlocks(keyBlocks, studentBlocks, margin);
  const correct = matches.filter(({ key, student }) => {
    if (!student) return false;
    if (!etiquetaCuenta) return true;
    return etiquetaEquivalente(key.level, key.label, student.label, equivalencias);
  }).length;
  return Math.round((correct / keyBlocks.length) * 100);
}

// ─── N0.5: cobertura del libre (mide compleción, no acierto) ────────────────
// % de la duración cubierto por las marcas del alumno, fusionando solapes
// para no contar dos veces el mismo instante. Es la preliminar de "interactivo
// (libre)" (ejercicio sin clave, keyReadyOf false) — se etiqueta como
// "cobertura" en la UI (N4.3), nunca como acierto.
export function coberturaLibre(
  intervals: { start: number; end: number }[] | null | undefined,
  duration: number,
): number | null {
  if (!duration || duration <= 0) return null;
  const marcas = (intervals ?? [])
    .filter((iv) => iv.end > iv.start)
    .map((iv): [number, number] => [Math.max(0, iv.start), Math.min(duration, iv.end)])
    .sort((a, b) => a[0] - b[0]);
  let cubierto = 0, curInicio = 0, curFin = -Infinity;
  for (const [s, e] of marcas) {
    if (s > curFin) {
      if (curFin > curInicio) cubierto += curFin - curInicio;
      curInicio = s; curFin = e;
    } else if (e > curFin) {
      curFin = e;
    }
  }
  if (curFin > curInicio) cubierto += curFin - curInicio;
  return Math.round((cubierto / duration) * 100);
}

// ─── N0.6: media de una unidad o de un curso ────────────────────────────────
// El llamador resuelve qué nota está "vigente" para cada hijo (final si
// corregido, preliminar si auto — la que ya muestra la app) y su peso
// (pesosDeUnidad/pesosDeCurso); mediaDe solo agrega. La excepción "la
// cobertura del libre no entra en medias" (no es logro) es responsabilidad del
// llamador: no debe incluir esa entrada hasta que haya nota de fuente docente.
export interface MediaEntry { id: string; nota: number | null; peso: number; pendiente?: boolean; }

export function mediaDe(hijos: MediaEntry[]): { nota: number | null; pendientes: number; total: number } {
  return {
    nota: ponderar(hijos.map(({ nota, peso }) => ({ nota, peso }))),
    pendientes: hijos.filter((h) => h.pendiente).length,
    total: hijos.length,
  };
}
