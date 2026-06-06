// ═══ DATOS SEMILLA ═══════════════════════════════════════════════════════════
// Categoría por defecto, paletas de categoría, secuencia de teclas y datos de
// demostración (ejercicios y biblioteca de audios). Sostienen el fallback en
// memoria cuando no hay backend Supabase. Extraídos de App.jsx (Fase 0).
// Migrado a TypeScript (Fase 3).
import type { Category, Exercise } from "./lib/types.js";

export const DEFAULT_CATEGORY: Category = {
  id: "default", name: "Funciones armónicas (T/S/D)", builtIn: true,
  buttons: [
    { id: "T", name: "Tónica",       color: "#3F9B5B", key: "a" },
    { id: "S", name: "Subdominante", color: "#2F6FB8", key: "s" },
    { id: "D", name: "Dominante",    color: "#C77A1A", key: "d" },
  ],
};
export const CATEGORY_COLORS: string[] = ["#3F9B5B","#2F6FB8","#C77A1A","#B84A3A","#9A4FB8","#C75A8E","#3A8CA8","#C9A33A"];
export const KEY_SEQUENCE: string[]    = ["a","s","d","f","j","k","l","g"];

export const INIT_EXERCISES: Exercise[] = [
  {
    id: 2, title: "Minueto – Mozart", duration: 24,
    audioUrl: null, audioName: null, showHint: false, model: "interactivo",
    categories: [DEFAULT_CATEGORY],
    answers: {
      [DEFAULT_CATEGORY.id]: [
        { fn: "T", start: 0, end: 4 }, { fn: "S", start: 4, end: 8 },
        { fn: "D", start: 8, end: 12 }, { fn: "T", start: 12, end: 16 },
        { fn: "D", start: 16, end: 20 }, { fn: "T", start: 20, end: 24 },
      ],
    },
  },
  {
    id: 3, title: "Ejercicio libre", duration: 20,
    audioUrl: null, audioName: null, showHint: false, model: "interactivo",
    categories: [DEFAULT_CATEGORY], answers: {},
  },
  {
    id: 4, title: "Análisis – Cuestionario demo", duration: 30,
    audioUrl: null, audioName: null, showHint: false, model: "cuestionario",
    categories: [], answers: {},
    questions: [
      {
        id: "q-demo-1",
        text: "¿Qué función armónica predomina en los primeros 8 segundos?",
        audioStart: 0, audioEnd: 8, type: "test",
        options: [{ id: "A", text: "Tónica" }, { id: "B", text: "Subdominante" }, { id: "C", text: "Dominante" }],
        correctOptionId: "A",
      },
      {
        id: "q-demo-2",
        text: "¿Qué tipo de cadencia concluye el fragmento entre 0:10 y 0:18?",
        audioStart: 10, audioEnd: 18, type: "test",
        options: [{ id: "A", text: "Cadencia auténtica perfecta" }, { id: "B", text: "Cadencia plagal" }, { id: "C", text: "Semicadencia" }],
        correctOptionId: "C",
      },
      {
        id: "q-demo-3",
        text: "Describe con tus propias palabras el carácter expresivo del fragmento final.",
        audioStart: 20, audioEnd: 30, type: "desarrollo",
        options: [], correctOptionId: null,
      },
    ],
  },
];

// ─── Biblioteca de audios inicial (datos de demostración) ───────────────────
export const INIT_AUDIO_LIBRARY = [
  {
    id: "audio-demo-01",
    title: "Sinfonía nº 40 en sol menor – I. Molto allegro",
    composer: "Wolfgang Amadeus Mozart",
    description: "K. 550. Exposición con dos grupos temáticos contrastantes.",
    tags: ["Forma sonata", "Clasicismo", "Modo menor", "Sinfonía"],
    url: "https://res.cloudinary.com/demo/video/upload/fake_mozart_40.mp3",
    duration: 186,
    createdAt: 1700000001000,
  },
  {
    id: "audio-demo-02",
    title: "Sinfonía nº 5 en do menor – I. Allegro con brio",
    composer: "Ludwig van Beethoven",
    description: "Op. 67. Motivo de cuatro notas. Desarrollo con modulación a Mi♭ Mayor.",
    tags: ["Forma sonata", "Clasicismo tardío", "Modo menor", "Sinfonía", "Modulación"],
    url: "https://res.cloudinary.com/demo/video/upload/fake_beethoven_5.mp3",
    duration: 220,
    createdAt: 1700000002000,
  },
  {
    id: "audio-demo-03",
    title: "Preludio op. 28 nº 4 en mi menor",
    composer: "Frédéric Chopin",
    description: "Textura homofónica. Cromatismo descendente en el bajo.",
    tags: ["Romanticismo", "Cromatismo", "Modo menor", "Piano"],
    url: "https://res.cloudinary.com/demo/video/upload/fake_chopin_prelude4.mp3",
    duration: 148,
    createdAt: 1700000003000,
  },
  {
    id: "audio-demo-04",
    title: "Coral BWV 227 – Jesu, meine Freude",
    composer: "Johann Sebastian Bach",
    description: "Mi menor. Cuatro voces mixtas. Contrapunto imitativo.",
    tags: ["Barroco", "Coral", "Contrapunto", "Modo menor"],
    url: "https://res.cloudinary.com/demo/video/upload/fake_bach_bwv227.mp3",
    duration: 134,
    createdAt: 1700000004000,
  },
  {
    id: "audio-demo-05",
    title: "Cuarteto de cuerdas op. 76 nº 3 – II. Poco adagio",
    composer: "Joseph Haydn",
    description: "Do Mayor. Tema con variaciones. Conocido como «El Emperador».",
    tags: ["Clasicismo", "Tema y variaciones", "Modo mayor", "Música de cámara"],
    url: "https://res.cloudinary.com/demo/video/upload/fake_haydn_emperor.mp3",
    duration: 272,
    createdAt: 1700000005000,
  },
  {
    id: "audio-demo-06",
    title: "Nocturno op. 9 nº 2 en Mi♭ Mayor",
    composer: "Frédéric Chopin",
    description: "Melodía ornamentada sobre acompañamiento de vals. Cadencia libre.",
    tags: ["Romanticismo", "Modo mayor", "Piano", "Ornamentación"],
    url: "https://res.cloudinary.com/demo/video/upload/fake_chopin_nocturne.mp3",
    duration: 244,
    createdAt: 1700000006000,
  },
  {
    id: "audio-demo-07",
    title: "Tocata y Fuga en re menor BWV 565",
    composer: "Johann Sebastian Bach",
    description: "Re menor. Estructura libre en la tocata; fuga a cuatro voces.",
    tags: ["Barroco", "Fuga", "Modo menor", "Órgano"],
    url: "https://res.cloudinary.com/demo/video/upload/fake_bach_toccata.mp3",
    duration: 198,
    createdAt: 1700000007000,
  },
  {
    id: "audio-demo-08",
    title: "Sinfonía nº 9 en re menor – IV. Finale",
    composer: "Ludwig van Beethoven",
    description: "Op. 125. Estructura de variaciones. Coro y solistas vocales.",
    tags: ["Clasicismo tardío", "Modo menor", "Sinfonía", "Modulación", "Vocal"],
    url: "https://res.cloudinary.com/demo/video/upload/fake_beethoven_9.mp3",
    duration: 310,
    createdAt: 1700000008000,
  },
];
