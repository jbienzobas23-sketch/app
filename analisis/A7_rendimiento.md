# A7 — Rendimiento y build

**Fecha:** 2026-07-10 · **Rama:** `beta` · **Commit HEAD:** `f263089a1ef0e70f2fb2902839e891cca6afe52a` (código fuente idéntico a A0–A6; `analisis/` va por `085ab0a`)
**Método:** `npm run build` cronometrado + `npx vite-bundle-visualizer -t list` (efímero, sin tocar `vite.config.js` — verificado `git status` limpio en configs) + barrido estático de renders con verificación manual del hallazgo principal. Artefactos temporales borrados.

---

## 1. Bundle (build 2026-07-10, HEAD `f263089`)

| Chunk | Tamaño | gzip | Carga |
|---|---|---|---|
| index | 284,2 kB | 77,2 | inicial |
| supabase | 201,0 kB | 52,0 | inicial |
| react | 193,8 kB | 60,6 | inicial |
| vendor (js+css) | 6,2 + 15,1 kB | 1,9 + 1,5 | inicial |
| teacher | 87,3 kB | 23,3 | lazy ✅ |
| SchemaExerciseView | 69,3 kB | 18,0 | lazy ✅ |
| QuestionManagerView | 8,4 kB | 3,5 | lazy ✅ |
| fuentes Cormorant | 20 ficheros ≈ 540 kB | — | bajo demanda por `unicode-range` (el navegador trae 4-6) |

**Total inicial ≈ 686 kB JS (gzip ≈ 190 kB).** Estado sano: `manualChunks` separa react/supabase (cacheables entre despliegues) y las 3 vistas pesadas del profesor/esquema ya son lazy (App.tsx:46-48, SessionShell.tsx:30 con precalentamiento del combo).

**Composición de `index` (top ficheros propios, "rendered" del visualizer):** modals.tsx **54,1 kB**, primitives 48,4, session 37,3, QuizCorrection **36,5**, courses 36,3, ExerciseView 34,4, SchemaCorrection **33,8**, auth 20,7, App 20,1, InteractiveCorrection **14,7**, QuestionnaireView 14,3, ExerciseItem 12,6, useAppData 12,1, **localSeed 9,9**, SessionShell 10,0, StudentDash 9,5, seed 8,1.

### Qué carga en el inicial sin necesitarlo

1. **`modals.tsx` entero (54,1 kB) por UN import**: `App.tsx:33` importa solo `RecoveryEmailModal`; el resto de importadores (teacher.tsx:17, editor, QuestionManagerView) ya viven en chunks lazy — extraer ese modal a fichero propio mueve los otros ~52 kB al chunk del profesor. Verificado por grep de importadores.
2. **Las 3 vistas de corrección (~85 kB juntas)**: solo se usan tras entregar/corregir; candidatas a lazy por ruta (patrón ya existente). Menos claro que (1): el alumno las abre en casi toda sesión.
3. **`localSeed.ts` (9,9 kB rendered)**: datos solo-dev (`?local`) importados estáticamente por `useAppData.ts:18`; el gate `localMode` es runtime, así que viajan a producción (confirma A2).

---

## 2. Análisis estático de renders

Contexto: `time` re-renderiza a ~10 fps los componentes que lo consumen durante la reproducción; el canvas lee `timeRef` a 60 fps por rAF (correcto, fuera del análisis).

### Lo que ya está bien (no tocar)

Throttle 10 fps + refs 60 fps (useAudioPlayer.ts:45-55,198); `AudioScrubber` mueve thumb/fill por rAF sobre el DOM sin re-render; `WaveformDisplay` con `React.memo`+comparador que ignora `time` (funciona en ExerciseView, que memoiza sus props: :75,107,112); `FunctionButtons` con memo cuyo comparador ignora la identidad de los handlers; estado de drag como ref en RepeatBand/FragmentRangeSelector; `SessionShell` fuera del path de 10 fps (partsOf/partToExercise memoizados); listas de dashboards memoizadas (teacher.tsx:64-88,597-638; StudentDash.tsx:61-95); **cero `createContext`** en el repo; **cero listas reordenables con `key={i}`** (las que lo usan son estáticas; las reales usan id).

### Problemas, por coste (frecuencia × tamaño)

1. **El arrastre de bloques del esquema pasa por `setState` en CADA mousemove/touchmove** — `SchemaExerciseView.tsx:627-628` (`setGuides` + `setBlocks(prev.map(...))`), ídem resize `:643-645,:656,:665` — **verificado**. Cada evento re-renderiza el componente de 1859 líneas/44 hooks, incluido `renderSegBlocks` × niveles × segmentos. Es la interacción más sensible del modelo esquema.
2. **`renderSegBlocks` recalcula filtros/sorts/colores de TODOS los bloques 10×/s** — `SchemaExerciseView.tsx:893-1010` — por render: `blocks.filter` (:898) + `.sort` (:905) + cadena `harmonyBlockColors/partColorFromPalette/phraseColorFromPalette` por bloque (:1002-1010) + `blocks.find` anidado para el color del padre (:1006). Nada depende de `time` salvo el playhead y `activeAt`.
3. **PartRunner re-renderiza a 10 fps TODAS las vistas keep-mounted del combo, incluida la oculta** — `SessionShell.tsx:97` (`sharedAudioPlayer = { ...rawPlayer, ... }` objeto nuevo por tick) + `:115-136` (vistas sin `React.memo`; la oculta con `display:none` ejecuta igualmente su cuerpo completo).
4. **Zoom/scroll/pinch del esquema hacen setState por evento** — `useSchemaZoom.ts:34-37,62,84` — re-render del árbol completo por rueda/arrastre de scrollbar (en parte inherente: el layout depende del zoom; falta aislamiento).
5. **QuestionnaireView reconstruye la lista completa de tarjetas por tick** — `:183` `questions.map(...)`, más `fragmentQs` (:160) y `answeredCount` (:104) sin memo, y props inline a `QuestionMinimap` (:162-165), que tampoco está memoizado (:61,:93).
6. **`ExerciseItem` sin memo recalcula helpers de dominio por ítem y por render** — `:49,:80-83` (`composersOf/partsOf/modelsOf` + `partKeyReadyOf` por parte×modelo) — cada pulsación del buscador re-ejecuta esto × N ejercicios.
7. **El memo de `WaveformDisplay` queda derrotado en Questionnaire/Schema** — `QuestionnaireView.tsx:147-149` y `SchemaExerciseView.tsx:1204-1205` pasan `[]`/`{}` inline → el comparador por referencia (session.tsx:383-384) nunca acierta. Impacto bajo (re-render barato), pero anula la intención.

---

## 3. Audio y datos

- **Consultas Supabase:** `loadData` = 8 `select("*")` en `Promise.all` (sin waterfall ✓), ejecutado 2 veces (montaje anónimo + tras login). El del montaje, **sin sesión, son 8 peticiones que RLS devuelve vacías** + `has_admin` en cada visita — coste menor pero gratuito de evitar (y cambiará si se rehidrata sesión, A3-05). No hay consultas repetidas ni por render.
- **Audio:** sin precarga global ✓, overlay durante descarga ✓; el mismo fichero se descarga hasta 4× por flujo sin caché propia (A6-06) y sin streaming (~85 MB RAM decodificados para 4 min, A6-03).

## 4. Línea base de tiempos

- **Build:** `npm run build` = **1,96 s** (vite 7; 3,6 s bajo el visualizer). Excelente.
- **Tests:** 196 tests / 14 ficheros = **5,3–6,2 s** (mediciones de A4 con cobertura; el grueso es el arranque de jsdom: environment ~28-37 s agregado paralelizado).

---

## 5. Top-10 de optimizaciones (impacto estimado / esfuerzo)

| # | Acción | Impacto | Esfuerzo | Evidencia |
|---|---|---|---|---|
| 1 | Extraer `RecoveryEmailModal` a fichero propio (o lazy) → modals.tsx entero al chunk teacher | **−52 kB del inicial** (~−10 gzip) para TODOS los usuarios | Mínimo (mover 1 componente) | App.tsx:33 + §1 |
| 2 | `localSeed` a import dinámico gated por `import.meta.env.DEV` | −9,9 kB del inicial en prod | Mínimo | useAppData.ts:18 |
| 3 | `React.memo` en `ExerciseItem` | Tecleo fluido en buscadores con muchos ejercicios | Bajo | ExerciseItem.tsx:49,80-83 |
| 4 | Constantes módulo (`EMPTY_IVS=[]`, `EMPTY_COLORS={}`) para las props de WaveformDisplay en Questionnaire/Schema | Repone un memo ya escrito | Trivial | QuestionnaireView.tsx:147-149; SchemaExerciseView.tsx:1204-05 |
| 5 | Memoizar la vista oculta del combo (`React.memo` a las 3 vistas + `sharedAudioPlayer` partido en API estable + `timeRef`) | Elimina un render completo de vista 10×/s en híbridos | Medio | SessionShell.tsx:97,115-136 |
| 6 | `useMemo` para los datos derivados de `renderSegBlocks` (bloques filtrados/ordenados/coloreados por nivel×segmento; el playhead ya va aparte) | Corta el grueso del trabajo por tick del esquema | Medio | SchemaExerciseView.tsx:893-1010 |
| 7 | Drag de bloques por ref+rAF (pintar la posición vía transform y hacer `setBlocks` solo al soltar) | La interacción más sensible deja de re-renderizar 1859 líneas por mousemove | Medio-alto (cirugía cuidadosa; casa con la subdivisión pendiente del monolito) | SchemaExerciseView.tsx:627-665 |
| 8 | Extraer/memoizar la lista de preguntas de QuestionnaireView + memo de QuestionMinimap | Cuestionarios grandes sin reconciliación 10×/s | Bajo-medio | QuestionnaireView.tsx:104,160,183 |
| 9 | Lazy de las 3 vistas de corrección | −85 kB del inicial (llega tras la primera entrega) | Bajo | §1.2 |
| 10 | Caché en memoria del ArrayBuffer de audio por URL (sesión) | Evita 2-4 descargas del mismo fichero por flujo | Bajo-medio | A6-06 |

(El zoom por setState —§2.4— queda fuera del top-10: en parte inherente y absorbe su solución la nº 7.)

---

## 6. Hallazgos

- [A7-01] media — arrastre de bloques del esquema con `setState` por evento de puntero — `SchemaExerciseView.tsx:627-628,643-645,656,665` (verificado) — top-10 nº 7.
- [A7-02] media — `renderSegBlocks` sin memoización recalcula todo 10×/s — `SchemaExerciseView.tsx:893-1010` — nº 6.
- [A7-03] media — PartRunner re-renderiza la vista oculta del combo 10×/s (`sharedAudioPlayer` nuevo por tick, hijas sin memo) — `SessionShell.tsx:97,115-136` — nº 5.
- [A7-04] media — `modals.tsx` (54 kB) entra al chunk inicial por un único import — `App.tsx:33` — nº 1.
- [A7-05] baja — lista de preguntas y minimapa reconstruidos por tick — `QuestionnaireView.tsx:183` + `QuestionMinimap.tsx:61,93` — nº 8.
- [A7-06] baja — `ExerciseItem` sin memo con helpers de dominio por render — `ExerciseItem.tsx:49,80-83` — nº 3.
- [A7-07] baja — `localSeed` (9,9 kB) en el bundle de producción — `useAppData.ts:18` — nº 2 (concreta A2).
- [A7-08] baja — vistas de corrección (~85 kB) en el chunk inicial — §1.2 — nº 9.
- [A7-09] baja — memo de WaveformDisplay derrotado por `[]`/`{}` inline — `QuestionnaireView.tsx:147-149`, `SchemaExerciseView.tsx:1204-1205` — nº 4.
- [A7-10] baja — zoom/scroll del esquema por setState por evento — `useSchemaZoom.ts:34-37,62,84` — parcialmente inherente.
- [A7-11] baja — 8 selects anónimos vacíos + `has_admin` en cada visita sin sesión — `useAppData.ts:71-109,128-132` — coste menor; se replantéa junto a A3-05.

---

## Criterio de cierre

✅ Top-10 ordenado por impacto/esfuerzo con evidencia por fila (§5). Bundle medido con visualizer y tabla de chunks (§1), code-splitting auditado (3 lazy correctos + 3 sobrantes identificados en el inicial), análisis de renders con el hallazgo principal verificado línea a línea y una sección explícita de "ya optimizado" para no deshacer trabajo bueno (§2), datos/audio revisados (§3) y línea base de tiempos registrada (§4: build 1,96 s, tests ~5,3 s). Salud general del build: muy buena — los hallazgos son de pulido, no estructurales.
