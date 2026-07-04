// ═══ SEMILLA DEL MODO LOCAL (?local) ══════════════════════════════════════════
// Datos ficticios SOLO para el modo local de desarrollo (App.tsx, gateado por
// import.meta.env.DEV): alumnos, grupos, cursos, unidades, ejercicios extra y
// entregas en todos los estados posibles — para explorar la app entera (listas,
// cola de pendientes, correcciones por modelo, intentos, ocultos, preguntas de
// obra completa) sin backend. Las formas de los resultados calcan las que
// producen las sesiones reales (categoryId+intervals / answers / blocks), de
// modo que las vistas de corrección funcionan tal cual sobre ellos.
import type { Exercise, Course, Unit, Group, ExerciseResult, UserProfile } from "./lib/types.js";
import { DEFAULT_CATEGORY } from "./seed.js";

// ─── Usuarios: 1 profesor + 5 alumnos (índice 1 = la alumna de ?local=alumno) ─
export const LOCAL_USERS: UserProfile[] = [
  { id: "local-profe",  username: "profe",  displayName: "Prof. Local",     role: "teacher" },
  { id: "local-lucia",  username: "lucia",  displayName: "Lucía Arrieta",   role: "student", teacherId: "local-profe" },
  { id: "local-marco",  username: "marco",  displayName: "Marco Beltrán",   role: "student", teacherId: "local-profe" },
  { id: "local-aitana", username: "aitana", displayName: "Aitana Cortés",   role: "student", teacherId: "local-profe" },
  { id: "local-hugo",   username: "hugo",   displayName: "Hugo Domínguez",  role: "student", teacherId: "local-profe" },
  { id: "local-vera",   username: "vera",   displayName: "Vera Esteban",    role: "student", teacherId: "local-profe" },
];

export const LOCAL_GROUPS: Group[] = [
  // teacherId: la lista de grupos del profesor filtra por propietario.
  { id: "local-grupo-3a", name: "3º Análisis — grupo A", teacherId: "local-profe", studentIds: ["local-lucia", "local-marco", "local-aitana"] },
];

// ─── Ejercicios extra (se suman a los de seed.ts: 2, 3, 4 y 5) ────────────────
// Clave de esquema del coral: la referencia del profesor (nivel 1 = secciones).
const CORAL_KEY = [
  { id: "k1", level: 1, start: 0,  end: 22, label: "A" },
  { id: "k2", level: 1, start: 22, end: 42, label: "B" },
  { id: "k3", level: 1, start: 42, end: 60, label: "A'" },
];

export const LOCAL_EXERCISES = [
  // Esquema CON clave grabada (listo para alumnos) — cubre SchemaCorrection.
  { id: "local-coral", title: "Coral BWV 227 — forma", duration: 60, model: "esquema",
    composerName: "Bach", categories: [], answers: {},
    schemaKey: CORAL_KEY, schemaLevels: [1, 2, 3, 4] },
  // Cuestionario completo: test (fragmento) + corta + OBRA COMPLETA (M6) +
  // desarrollo → la entrega queda "pendiente" y alimenta la cola del profesor.
  { id: "local-obra", title: "Escucha global — Nocturno op. 9 n.º 2", duration: 90, model: "cuestionario",
    composerName: "Chopin", categories: [], answers: {},
    questions: [
      { id: "lq1", type: "test", text: "¿Qué acorde abre el acompañamiento?", audioStart: 0, audioEnd: 12,
        options: [{ id: "A", text: "Tónica" }, { id: "B", text: "Dominante" }, { id: "C", text: "Sexta napolitana" }],
        correctOptionId: "A", points: 1 },
      { id: "lq2", type: "corta", text: "¿En qué compás está escrita la pieza?", audioStart: 12, audioEnd: 30,
        options: [], correctOptionId: null, accepted: ["12/8", "doce por ocho"], points: 1,
        explanation: "El balanceo constante de corcheas agrupadas de tres delata el 12/8." },
      { id: "lq3", type: "test", scope: "obra", text: "Sobre la obra completa: ¿cuántas veces reaparece el tema principal?",
        options: [{ id: "A", text: "Dos" }, { id: "B", text: "Tres" }, { id: "C", text: "Cuatro" }],
        correctOptionId: "B", points: 2 },
      { id: "lq4", type: "desarrollo", text: "Describe la ornamentación de la melodía en la segunda aparición del tema.",
        audioStart: 30, audioEnd: 60, options: [], correctOptionId: null,
        explanation: "Se esperan menciones a grupetos, apoyaturas y la fioritura cadencial." },
    ] },
  // Oculto para alumnos (tarjeta atenuada en el banco del profesor).
  { id: "local-oculto", title: "Sonata K. 141 — en preparación", duration: 45, model: "interactivo",
    composerName: "Scarlatti", categories: [DEFAULT_CATEGORY], answers: {}, hidden: true },
  // Muestras de placa híbrida (las dos parejas de producto + tercera pareja y
  // triple de la puerta M7, estos dos últimos solo visuales).
  { id: "local-h1", title: "Trío Op. 1 n.º 3 — IV.", duration: 120, model: "interactivo", models: ["interactivo", "cuestionario"], composerName: "Beethoven", categories: [DEFAULT_CATEGORY], answers: {} },
  { id: "local-h2", title: "Cuarteto Op. 18 — I.",   duration: 120, model: "interactivo", models: ["interactivo", "esquema"],      composerName: "Beethoven", categories: [DEFAULT_CATEGORY], answers: {} },
  { id: "local-h3", title: "Sonata Op. 53 — I.",     duration: 120, model: "esquema",     models: ["esquema", "cuestionario"],     composerName: "Beethoven", categories: [], answers: {} },
  { id: "local-h4", title: "Sinfonía n.º 9 — IV.",   duration: 120, model: "esquema",     models: ["esquema", "interactivo", "cuestionario"], composerName: "Beethoven", categories: [DEFAULT_CATEGORY], answers: {} },
] as unknown as Exercise[];

// ─── Cursos y unidades ────────────────────────────────────────────────────────
export const LOCAL_COURSES: Course[] = [
  { id: "local-armonia",  name: "Armonía I",              unitIds: ["local-u-cadencias", "local-u-formas", "local-u-prep"], visibility: "public" },
  { id: "local-analisis", name: "Análisis de partituras", unitIds: ["local-u-escucha"] },
];
export const LOCAL_UNITS: Unit[] = [
  { id: "local-u-cadencias", name: "Cadencias",               exerciseIds: ["2", "3", "5"] },
  { id: "local-u-formas",    name: "Formas y texturas",       exerciseIds: ["local-coral", "4"] },
  { id: "local-u-escucha",   name: "Escucha global",          exerciseIds: ["local-obra", "local-h1"] },
  // Unidad oculta: el alumno no la ve; el profesor la ve marcada "oculta".
  { id: "local-u-prep",      name: "Material en preparación", exerciseIds: ["local-oculto"], hidden: true },
];

// ─── Entregas ficticias: results[alumno][ejercicio] ───────────────────────────
// Un timestamp por día para que las fechas se lean naturales.
const DAY = 86400000;
const T0  = 1782000000000; // ≈ finales de junio de 2026

const r = (data: Record<string, unknown>) => data as unknown as ExerciseResult;

export const LOCAL_RESULTS: Record<string, Record<string, ExerciseResult>> = {
  // Lucía (la alumna de ?local=alumno): una de cada estado.
  "local-lucia": {
    // Interactivo autocorregido con buena nota.
    "2": r({ type: "interactivo", categoryId: DEFAULT_CATEGORY.id, score: 92, status: "auto", timestamp: T0,
      intervals: [
        { fn: "T", start: 0, end: 4.2 }, { fn: "S", start: 4.2, end: 8.1 },
        { fn: "D", start: 8.1, end: 12 }, { fn: "T", start: 12, end: 16.4 },
        { fn: "D", start: 16.4, end: 20 }, { fn: "T", start: 20, end: 24 },
      ] }),
    // Cuestionario con pregunta de desarrollo → PENDIENTE de corrección.
    "4": r({ type: "cuestionario", status: "pendiente", score: 50, timestamp: T0 + DAY,
      answers: { "q-demo-1": "A", "q-demo-2": "B", "q-demo-3": "El final se apaga en un carácter contemplativo, casi de despedida." } }),
    // Esquema YA CORREGIDO por el profesor (nota + comentario global). El
    // score refleja el totalScore de la corrección, como hace el flujo real.
    "local-coral": r({ type: "esquema", status: "pendiente", score: 78, timestamp: T0 + 2 * DAY,
      blocks: [
        { id: "s1", level: 1, start: 0,  end: 20, label: "A" },
        { id: "s2", level: 1, start: 20, end: 44, label: "B" },
        { id: "s3", level: 1, start: 44, end: 60, label: "A" },
      ],
      teacherCorrection: { corrected: true, totalScore: 78, globalComment: "Buena segmentación general; afina el final de B, entra dos segundos antes. La reexposición es A', no A: fíjate en la ornamentación." } }),
  },

  // Marco: dos intentos en el Minueto (la nota vigente es la MEJOR).
  "local-marco": {
    "2": r({ type: "interactivo", categoryId: DEFAULT_CATEGORY.id, score: 85, status: "auto", timestamp: T0 + 3 * DAY,
      intervals: [
        { fn: "T", start: 0, end: 4 }, { fn: "S", start: 4, end: 9 },
        { fn: "D", start: 9, end: 12.5 }, { fn: "T", start: 12.5, end: 16 },
        { fn: "D", start: 16, end: 20 }, { fn: "T", start: 20, end: 24 },
      ],
      attempts: [
        { type: "interactivo", categoryId: DEFAULT_CATEGORY.id, score: 60, status: "auto", timestamp: T0 + 2 * DAY,
          intervals: [{ fn: "T", start: 0, end: 8 }, { fn: "D", start: 8, end: 16 }, { fn: "T", start: 16, end: 24 }] },
        { type: "interactivo", categoryId: DEFAULT_CATEGORY.id, score: 85, status: "auto", timestamp: T0 + 3 * DAY,
          intervals: [
            { fn: "T", start: 0, end: 4 }, { fn: "S", start: 4, end: 9 },
            { fn: "D", start: 9, end: 12.5 }, { fn: "T", start: 12.5, end: 16 },
            { fn: "D", start: 16, end: 20 }, { fn: "T", start: 20, end: 24 },
          ] },
      ] }),
    // En la cola de pendientes del Nocturno (junto a Aitana).
    "local-obra": r({ type: "cuestionario", status: "pendiente", score: 83, timestamp: T0 + 4 * DAY,
      answers: { lq1: "A", lq2: "12/8", lq3: "C", lq4: "La melodía se llena de grupetos y notas de paso; la fioritura final alarga la cadencia." } }),
  },

  // Aitana: nota baja en el Minueto + pendiente en el Nocturno (cola de 2).
  "local-aitana": {
    "2": r({ type: "interactivo", categoryId: DEFAULT_CATEGORY.id, score: 45, status: "auto", timestamp: T0 + 4 * DAY,
      intervals: [{ fn: "S", start: 0, end: 6 }, { fn: "T", start: 6, end: 14 }, { fn: "D", start: 14, end: 24 }] }),
    "local-obra": r({ type: "cuestionario", status: "pendiente", score: 33, timestamp: T0 + 5 * DAY,
      answers: { lq1: "B", lq2: "3/4", lq3: "B", lq4: "Aparecen más adornos que la primera vez." } }),
  },

  // Hugo: esquema entregado y aún SIN corregir (pendiente en el coral).
  "local-hugo": {
    "local-coral": r({ type: "esquema", status: "pendiente", score: null, timestamp: T0 + 5 * DAY,
      blocks: [
        { id: "h1", level: 1, start: 0,  end: 30, label: "A" },
        { id: "h2", level: 1, start: 30, end: 60, label: "B" },
      ] }),
  },

  // Vera: recién llegada, sin entregas (estado vacío).
};
