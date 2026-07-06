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

// ─── Audio sintético de demo (Jon, 2026-07-06) ───────────────────────────────
// Los ejercicios de la semilla no traen audio real (el corpus vive fuera). Para
// PODER reproducir el ejercicio en las vistas de corrección —barra de
// transporte, playhead sincronizado en las tiras del esquema, bucle por
// fragmento de cada pregunta— se genera aquí un WAV suave del largo del
// ejercicio: `audioReady` pasa a true y toda la maquinaria de audio se ilumina
// tal cual en producción. SOLO en `vite dev` (guardado por import.meta.env.DEV):
// en el build de producción la rama es dead-code y no se genera nada.
const u8ToBase64 = (u8: Uint8Array): string => {
  let out = "";
  const CH = 0x8000;
  for (let i = 0; i < u8.length; i += CH) out += String.fromCharCode.apply(null, Array.from(u8.subarray(i, i + CH)));
  return btoa(out);
};
// WAV PCM 8-bit mono a 8 kHz (ligero). Tono grave y muy suave con un pulso lento
// para que se OIGA que avanza sin resultar molesto durante 60–90 s.
const makeToneWav = (durationSec: number): string => {
  const rate = 8000;
  const n = Math.floor(durationSec * rate);
  const buf = new Uint8Array(44 + n);
  const view = new DataView(buf.buffer);
  const ws = (off: number, s: string) => { for (let i = 0; i < s.length; i++) buf[off + i] = s.charCodeAt(i); };
  ws(0, "RIFF"); view.setUint32(4, 36 + n, true); ws(8, "WAVE"); ws(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate, true); view.setUint16(32, 1, true); view.setUint16(34, 8, true);
  ws(36, "data"); view.setUint32(40, n, true);
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const env = 0.35 + 0.35 * Math.sin(2 * Math.PI * 0.2 * t);   // pulso de 5 s
    const s = Math.sin(2 * Math.PI * 174 * t) * 26 * env;        // ~174 Hz, volumen bajo
    buf[44 + i] = 128 + Math.round(s);
  }
  return "data:audio/wav;base64," + u8ToBase64(buf);
};
const DEMO_AUDIO_60 = import.meta.env.DEV ? makeToneWav(60) : null;
const DEMO_AUDIO_90 = import.meta.env.DEV ? makeToneWav(90) : null;

// ─── Usuarios: 1 profesor + 5 alumnos (índice 1 = la alumna de ?local=alumno) ─
export const LOCAL_USERS: UserProfile[] = [
  { id: "local-profe",  username: "profe",  displayName: "Prof. Local",     role: "admin" },
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
// Clave de esquema del coral: la referencia del profesor, con los cuatro
// niveles del modelo (Partes / Frases / Armonía / Texto) para ver el
// comportamiento del corrector con varios niveles y bloques.
const CORAL_KEY = [
  // Nivel 1 · Partes (secciones)
  { id: "k1", level: 1, start: 0,  end: 22, label: "A" },
  { id: "k2", level: 1, start: 22, end: 42, label: "B" },
  { id: "k3", level: 1, start: 42, end: 60, label: "A'" },
  // Nivel 2 · Frases
  { id: "k2a", level: 2, start: 0,  end: 11, label: "a" },
  { id: "k2b", level: 2, start: 11, end: 22, label: "a'" },
  { id: "k2c", level: 2, start: 22, end: 42, label: "b" },
  { id: "k2d", level: 2, start: 42, end: 60, label: "a''" },
  // Nivel 3 · Armonía (cadencias)
  { id: "k3a", level: 3, start: 10, end: 12, label: "V" },
  { id: "k3b", level: 3, start: 20, end: 22, label: "I" },
  { id: "k3c", level: 3, start: 40, end: 42, label: "V/vi" },
  { id: "k3d", level: 3, start: 58, end: 60, label: "I" },
  // Nivel 4 · Texto (versos del coral)
  { id: "k4a", level: 4, start: 0,  end: 22, label: "Jesu, meine Freude" },
  { id: "k4b", level: 4, start: 22, end: 42, label: "Trotz dem alten Drachen" },
  { id: "k4c", level: 4, start: 42, end: 60, label: "Jesu, meine Freude" },
];

// Categoría "Grados + cifrado" (hasFigures): los botones son grados (I…VII) y
// cada intervalo lleva además una cifra de bajo/inversión (fig) — dos datos
// distintos por bloque. Mismo diseño que el caso de demostración del harness
// preview-interactivo.tsx (Jon, 2026-07-06), para tener un ejemplo real de
// corrección donde grado y cifrado se evalúan por separado.
const GRADOS_CATEGORY = {
  id: "local-grados-cifrado", name: "Grados + cifrado", builtIn: false, hasFigures: true,
  buttons: [
    { id: "I",   name: "Tónica",         color: "#3F9B5B", key: "a" },
    { id: "II",  name: "Supertónica",    color: "#2F6FB8", key: "s" },
    { id: "III", name: "Mediante",       color: "#3A8CA8", key: "d" },
    { id: "IV",  name: "Subdominante",   color: "#C77A1A", key: "f" },
    { id: "V",   name: "Dominante",      color: "#9A4FB8", key: "j" },
    { id: "VI",  name: "Superdominante", color: "#C75A8E", key: "k" },
    { id: "VII", name: "Sensible",       color: "#B84A3A", key: "l" },
  ],
};
// Clave: progresión con grado + cifrado de bajo (fig: t0 fundamental · t1 (6) ·
// t2 (⁶₄) · d1 (⁶₅, 7ª diatónica) · D0 (7 de dominante) · D3 (+4)).
const GRADOS_KEY = [
  { fn: "I",   start: 0,    end: 3.5,  fig: "t0" },
  { fn: "V",   start: 3.5,  end: 6.5,  fig: "t1" },  // V6
  { fn: "I",   start: 6.5,  end: 10,   fig: "t0" },
  { fn: "IV",  start: 10,   end: 13,   fig: "t0" },
  { fn: "II",  start: 13,   end: 16,   fig: "d1" },  // ii6/5
  { fn: "V",   start: 16,   end: 19.5, fig: "D0" },  // V7
  { fn: "I",   start: 19.5, end: 22,   fig: "t2" },  // I6/4 (cadencial)
  { fn: "V",   start: 22,   end: 25,   fig: "D3" },  // V (+4)
  { fn: "I",   start: 25,   end: 28,   fig: "t0" },
];

export const LOCAL_EXERCISES = [
  // Esquema CON clave grabada (listo para alumnos) — cubre SchemaCorrection.
  { id: "local-coral", title: "Coral BWV 227 — forma", duration: 60, model: "esquema",
    composerName: "Bach", categories: [], answers: {}, audioUrl: DEMO_AUDIO_60,
    schemaKey: CORAL_KEY, schemaLevels: [1, 2, 3, 4] },
  // Cuestionario completo: test (fragmento) + corta + OBRA COMPLETA (M6) +
  // desarrollo → la entrega queda "pendiente" y alimenta la cola del profesor.
  { id: "local-obra", title: "Escucha global — Nocturno op. 9 n.º 2", duration: 90, model: "cuestionario",
    composerName: "Chopin", categories: [], answers: {}, audioUrl: DEMO_AUDIO_90,
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
  // Interactivo CON clave grabada (corrección automática) — para revisar la
  // comparación clave/alumno en InteractiveCorrection.
  { id: "local-interactivo", title: "Bourrée — funciones armónicas", duration: 60, model: "interactivo",
    composerName: "Bach", categories: [DEFAULT_CATEGORY], audioUrl: DEMO_AUDIO_60,
    answers: { [DEFAULT_CATEGORY.id]: [
      { fn: "T", start: 0,  end: 8 },  { fn: "S", start: 8,  end: 16 },
      { fn: "D", start: 16, end: 22 }, { fn: "T", start: 22, end: 30 },
      { fn: "S", start: 30, end: 36 }, { fn: "D", start: 36, end: 42 },
      { fn: "T", start: 42, end: 48 }, { fn: "D", start: 48, end: 54 },
      { fn: "T", start: 54, end: 60 },
    ] } },
  // Interactivo de GRADOS + CIFRADO (hasFigures) — para revisar la corrección
  // diferenciando grado (romano) e inversión (cifra de bajo) como dos datos
  // distintos. Ver la entrega de Marco (grados bien, cifrado con dos fallos).
  { id: "local-grados", title: "Coral — grados y cifrado", duration: 28, model: "interactivo",
    composerName: "Bach", categories: [GRADOS_CATEGORY], audioUrl: DEMO_AUDIO_60,
    answers: { [GRADOS_CATEGORY.id]: GRADOS_KEY } },
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
    // Interactivo autocorregido con clave visible: bien pero con un par de
    // fallos (una S marcada como D en 0:30–0:36 y desfases de entrada) → nota
    // media, para ver la comparación clave/alumno y el diagnóstico.
    "local-interactivo": r({ type: "interactivo", categoryId: DEFAULT_CATEGORY.id, score: 78, status: "auto", timestamp: T0 + 3 * DAY,
      intervals: [
        { fn: "T", start: 0,  end: 7 },  { fn: "S", start: 7,  end: 16 },
        { fn: "D", start: 16, end: 24 }, { fn: "T", start: 24, end: 30 },
        { fn: "D", start: 30, end: 36 }, { fn: "D", start: 36, end: 42 },
        { fn: "T", start: 42, end: 50 }, { fn: "D", start: 50, end: 54 },
        { fn: "T", start: 54, end: 60 },
      ] }),
    // Cuestionario con pregunta de desarrollo → PENDIENTE de corrección.
    "4": r({ type: "cuestionario", status: "pendiente", score: 50, timestamp: T0 + DAY,
      answers: { "q-demo-1": "A", "q-demo-2": "B", "q-demo-3": "El final se apaga en un carácter contemplativo, casi de despedida." } }),
    // Esquema YA CORREGIDO por el profesor (nota + comentario global). El
    // score refleja el totalScore de la corrección, como hace el flujo real.
    "local-coral": r({ type: "esquema", status: "pendiente", score: 78, timestamp: T0 + 2 * DAY,
      blocks: [
        // Partes: casi bien, con el final de B corrido y la reexposición mal etiquetada (A en vez de A').
        { id: "s1", level: 1, start: 0,  end: 20, label: "A" },
        { id: "s2", level: 1, start: 20, end: 44, label: "B" },
        { id: "s3", level: 1, start: 44, end: 60, label: "A" },
        // Frases: las cuatro, con la segunda algo corta.
        { id: "s1f1", level: 2, start: 0,  end: 10, label: "a" },
        { id: "s1f2", level: 2, start: 10, end: 20, label: "a'" },
        { id: "s1f3", level: 2, start: 20, end: 44, label: "b" },
        { id: "s1f4", level: 2, start: 44, end: 60, label: "a''" },
        // Armonía: solo detectó dos cadencias.
        { id: "s1h1", level: 3, start: 19, end: 21, label: "I" },
        { id: "s1h2", level: 3, start: 58, end: 60, label: "I" },
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
    // Grados TODOS correctos (nota 100 · ejemplo de "diagnóstico de grados"),
    // pero con DOS cifrados equivocados (V6→marcó fundamental; V7→marcó otra
    // inversión de dominante) — ejemplo de "diagnóstico de cifrado" por debajo
    // del 100% aunque los grados estén perfectos. Las dos correcciones son
    // independientes: acertar el grado no implica acertar la inversión.
    "local-grados": r({ type: "interactivo", categoryId: "local-grados-cifrado", score: 100, status: "auto", timestamp: T0 + 6 * DAY,
      intervals: [
        { fn: "I",   start: 0,    end: 3.5,  fig: "t0" },
        { fn: "V",   start: 3.5,  end: 6.5,  fig: "t0" },  // grado ✓, cifrado ✗ (era t1 · V6)
        { fn: "I",   start: 6.5,  end: 10,   fig: "t0" },
        { fn: "IV",  start: 10,   end: 13,   fig: "t0" },
        { fn: "II",  start: 13,   end: 16,   fig: "d1" },
        { fn: "V",   start: 16,   end: 19.5, fig: "D2" },  // grado ✓, cifrado ✗ (era D0 · V7)
        { fn: "I",   start: 19.5, end: 22,   fig: "t2" },
        { fn: "V",   start: 22,   end: 25,   fig: "D3" },
        { fn: "I",   start: 25,   end: 28,   fig: "t0" },
      ] }),
  },

  // Aitana: nota baja en el Minueto + pendiente en el Nocturno (cola de 2).
  "local-aitana": {
    "2": r({ type: "interactivo", categoryId: DEFAULT_CATEGORY.id, score: 45, status: "auto", timestamp: T0 + 4 * DAY,
      intervals: [{ fn: "S", start: 0, end: 6 }, { fn: "T", start: 6, end: 14 }, { fn: "D", start: 14, end: 24 }] }),
    "local-obra": r({ type: "cuestionario", status: "pendiente", score: 33, timestamp: T0 + 5 * DAY,
      answers: { lq1: "B", lq2: "3/4", lq3: "B", lq4: "Aparecen más adornos que la primera vez." } }),
  },

  // Hugo: esquema entregado y aún SIN corregir (pendiente en el coral). Entrega
  // flojita, útil para probar la corrección con varios niveles: Partes solo con
  // dos bloques (le falta la reexposición), Frases mal segmentadas y una etiqueta
  // de Armonía errónea.
  "local-hugo": {
    "local-coral": r({ type: "esquema", status: "pendiente", score: null, timestamp: T0 + 5 * DAY,
      blocks: [
        { id: "h1", level: 1, start: 0,  end: 30, label: "A" },
        { id: "h2", level: 1, start: 30, end: 60, label: "B" },
        { id: "hf1", level: 2, start: 0,  end: 15, label: "a" },
        { id: "hf2", level: 2, start: 15, end: 30, label: "b" },
        { id: "hf3", level: 2, start: 30, end: 60, label: "c" },
        { id: "hh1", level: 3, start: 28, end: 30, label: "V" },
        { id: "hh2", level: 3, start: 58, end: 60, label: "IV" },
      ] }),
  },

  // Vera: recién llegada, sin entregas (estado vacío).
};
