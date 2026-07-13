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
