# A4 — Dominio musical y tests

**Fecha:** 2026-07-10 · **Rama:** `beta` · **Commit HEAD:** `f263089a1ef0e70f2fb2902839e891cca6afe52a` (código fuente idéntico a A0–A3; `analisis/` se commiteó como `70de916` al cerrar A3)
**Herramientas:** `npx vitest run --coverage` con `@vitest/coverage-v8@4.1.8` instalado `npm install --no-save` (solo `node_modules`; verificado `git status` limpio en `package.json`/`package-lock.json`, regla 6 respetada). Artefactos temporales (`analisis_cov_raw.txt`, `coverage/`) borrados al cerrar la fase.

---

## 1. Inventario de `src/lib` y pureza

16 módulos (+ `types.ts`, solo tipos). **Ninguna función de `lib` toca Supabase** (grep A3: acceso centralizado fuera de lib). Impurezas por módulo:

| Módulo | Contenido | Pureza |
|---|---|---|
| scoring.ts | correctores de los 3 modelos + diagnósticos + agregación | ✅ pura (sin Date/random/DOM) |
| domain.ts | lectores tolerantes del ejercicio/resultado | ✅ pura (importa datos de `seed.js` — acoplamiento ya anotado A2-13) |
| harmony.ts | tonalidad→color, parseo de etiquetas tonales, enarmonías | ✅ pura |
| color.ts | HSL↔hex, luminancia, colores de nota | ✅ pura (importa tokens, constantes) |
| palette.ts | paletas del esquema, ranuras A/B/C/D, color de bloque, snap | ✅ pura |
| figures.ts | cifrado de bajo (grupos, índice, legacy) | ✅ pura |
| schema.ts, sessionConstants.ts, modelMeta.ts, time.ts | constantes y formato | ✅ puras |
| repeats.ts | segmentos de repetición + sincronía 2ª vez | ⚠️ **impura encubierta**: `syncSecondPassBlocks` llama a `uid()` (`repeats.ts:5,143`) → `Date.now`/`Math.random` sin inyección — no determinista |
| ids.ts | `uid` (Date.now+Math.random, sin DI — A2-12), `toggleInSet` (pura) | ⚠️ por diseño |
| audio.ts | waveforms (puras) + `fetchAudioBuffer` (red — A2-11) | ⚠️ 1 función con fetch |
| routing.ts | parser de rutas (puro) + `useHashRoute` (React+window — A2-10) + `lastPanelPath` mutable de módulo (A2) | ⚠️ mixto |
| pointer.ts | drag unificado (listeners en window — DOM glue) | ⚠️ DOM |
| a11y.ts | `rowButtonProps` | ✅ pura (devuelve handlers) |

---

## 2. Cobertura

Comandos (2026-07-10, HEAD `f263089`): `npx vitest run --coverage` → **14 ficheros de test, 196/196 verdes**. Tabla `src/lib` (v8, % statements; fuente `coverage-summary.json` porque el reporter de texto trunca nombres):

| Módulo | Stmts | Branch | Funcs | Veredicto |
|---|---|---|---|---|
| schema.ts / sessionConstants.ts / time.ts / harmony.ts | 100 | 89–100 | 100 | ✅ |
| domain.ts | 97,9 | 92,4 | 100 | ✅ |
| color.ts | 96,4 | 75,6 | 87,5 | ✅ |
| scoring.ts | 90,9 | 83,5 | 92,3 | ✅ |
| audio.ts | 76,5 | 60 | 66,7 | ⚠️ justo |
| **modelMeta.ts** | 66,7 | 0 | 0 | 🔴 <70 |
| **figures.ts** | 61,1 | 30 | 25 | 🔴 <70 |
| **palette.ts** | 46,2 | 34,1 | 66,7 | 🔴 <70 |
| **routing.ts** | 40,2 | 38,3 | 29,4 | 🔴 <70 |
| **ids.ts** | 25 | 0 | 0 | 🔴 <70 |
| **a11y.ts** | 25 | 0 | 50 | 🔴 <70 |
| **pointer.ts** | 0 | 0 | 0 | 🔴 sin cargar |
| **repeats.ts** | **ausente del informe = 0** | — | — | 🔴 **ningún test lo importa** |
| `src/lib` total | 75,4 | 65,4 | 76,2 | |

Fuera de lib pero relevante: `data/db.ts` funcs 15,8% (solo el retry de `write()` está testeado; los 17 helpers mecánicos no), `hooks/useAudioPlayer.ts` 25%, global del repo 44,4% (los componentes grandes apenas se tocan — `courses.tsx` 1,4%, `primitives.tsx` 8,1%).

---

## 3. Clasificación de cada función exportada de `lib`

**Testeada** (test directo que la nombra): `getAt`, `resolveOverlap`, `calcScore`, `gradeShort`, `calcQuestionnaireScore`, `calcSchemaPlacementScore`, `interactiveDiagnostics`, `interactiveFigureDiagnostics`, `schemaDiagnostics`, `aggregateParts`, `nota10` (scoring); `categoriesOf`, `modelOf`, `modelsOf`, `answerFor`, `comboIdFromModels`, `audioComposers`, `audioTags`, `courseUnitList`, `unitExList`, `resultStatusOf`, `partsOf`, `partToExercise`, `durationOf`, `keyReadyOf`, `resultPartsOf`, `questionsCountOf`, `updatePart`, `composersOf`, `questionsSnapshotOf`, `attemptsOf`, `addAttempt`, `normalizeExercise`, `questionScopeOf` (domain); `parseHarmonyLabel`, `harmonyBlockColors`; `_hexToHsl`, `_hslToHex`, `lightenColor`, `textOn`; `partSlotIndex`, `phraseSlotIndex`, `effectivePaletteId`, `applyPaletteToExercise`; `smoothArray`, `buildWaveformFromPCM`, `buildFragmentWaveform`, `generateWaveform`; `routeFromSegments`, `coursesPath`; `fmtClock`, `fmtPrecise`; constantes de sessionConstants.

**Parcial** (solo cobertura indirecta, o testeada sin sus casos límite): `btnOf` (¡el frágil de A3-08, sin test del caso sin `buttons`!), `questionsOf`, `answerStats`, `partKeyReadyOf` (vía `keyReadyOf`); `scoreColor`/`scoreBg` (umbrales 80/50 sin test); `figureOf`/`isTriadFig` (vía componentes); `calcScore` (falta `duration` 0/undefined), `calcSchemaPlacementScore` (falta: sobrantes y nota), `calcQuestionnaireScore` (falta `points: 0`).

**Sin test** (riesgo entre paréntesis): **todo `repeats.ts`** — `buildRepeatSegments`, `getSegBounds`, `buildCompleteViewSegments`, `syncSecondPassBlocks`, `rulerTicksForSeg` (**alto**: lógica más intrincada del dominio, compartida por dos vistas); `partBlockColor`, `getSchemaPalette`, `getCategoryColorsFromPalette`, `partColorFromPalette`, `phraseColorFromPalette`, `schemaBlockColor`, `snapToNearest` (medio: sistema de color del esquema — insumo CVD para A5 — y snap de interacción); `g`, `FIG_GROUPS`, `FIG_BY_ID`, `FIG_LEGACY`, `quadGroupsForDegree` (medio: la compatibilidad legacy de marcas antiguas puede regresionar en silencio); `parseHash`, `parseHashQuery`, `setHashQuery`, `getLastPanelPath`, `useHashRoute` (medio-bajo); `seedFromId`, `dataUrlToBuffer`, `fetchAudioBuffer` (bajo); `uid`, `toggleInSet` (bajo); `modelMeta` (bajo); `rowButtonProps` (bajo); `startPointerDrag` (bajo, DOM).

---

## 4. Invariantes musicales críticas: protección y casos límite

1. **Corrección del interactivo** (`calcScore`, muestreo 0,1s + margen): testeada, incluida la semántica `[start, end)` y clave vacía → null. **Faltan:** `duration` 0/undefined → devuelve **0, no null** (raíz de A2-08: partes sin `duration`); margen mayor que el tramo; derivas de coma flotante en audios largos.
2. **Etiquetado T/S/D:** no hay cálculo armónico — son ids de botones de la categoría (semilla `DEFAULT_CATEGORY`); la invariante real es que clave y sesión comparten los mismos ids de botón, garantizada por compartir el documento del ejercicio. Las **enarmonías** (`ENARM` re#→mib… en `harmony.ts:74`) solo afectan al color de bloques, no a la nota, y están testeadas. (Fase 7 enarmonía descartada por Jon — coherente.)
3. **Cifrado (inversiones):** el corrector puro (`interactiveFigureDiagnostics`) está testeado, pero el **pipeline real está roto** (A2-01: `fig` se descarta al serializar el submit) y **ningún test de integración lo protege** — exactamente el hueco que habría cazado el bug. `FIG_LEGACY` (marcas antiguas "6", "6/4"…) sin test.
4. **Cuestionario** (`calcQuestionnaireScore`+`gradeShort`): testeados (ponderación por points, normalización de tildes/caja). Faltan: `points: 0` (→ null aunque haya preguntas), desarrollo-solo → null → "pendiente" (protegido vía `resultStatusOf`, testeado).
5. **Esquema** (`calcSchemaPlacementScore`+`schemaDiagnostics`): testeados, incluidos sobrantes **en el diagnóstico**. **Invariante sin decidir ni testear: los sobrantes NO penalizan la nota de colocación** — sembrar bloques por toda la línea da 100% (scoring.ts:85-100). Mitigado porque esquema siempre queda "pendiente" de revisión manual, pero esa nota automática se almacena y muestra.
6. **Nombres vs colocación** (nivel 3): `labelsMatchForLevel` cae a igualdad de texto normalizado — "Do M" ≠ "Do mayor" cuenta etiqueta errónea aunque `parseHarmonyLabel` las considere la misma tonalidad (scoring.ts:256-264). Sin test.
7. **Multiparte** (`partsOf`/`aggregateParts`/`addAttempt`): testeados (media ponderada, mejor intento, status del último). Falta el test del caso ambiguo A2-02 (multiparte reducido a 1 parte pisa con planos obsoletos) — debería escribirse ANTES del fix, en rojo.
8. **Repeticiones** (`repeats.ts`): **cero protección** — ver [A4-01].

---

## 5. Consistencia editor ↔ corrector

- ✅ La rama multiparte de `useSubmitAnswer` reutiliza exactamente los mismos puntuadores puros que las ramas de una parte (`useSubmitAnswer.ts:100-131` vs `:150-263`) — sin duplicación divergente.
- ✅ `questionsSnapshot` congela las preguntas al entregar: una edición posterior del profesor no descoloca entregas (testeado, `questionsSnapshotOf`).
- ❌ **El asistente permite publicar sin clave y el corrector no lo detecta:** el switch «Visible para alumnos» está activo aunque `faltas` liste claves pendientes (PasoRevision.tsx:94-102 — el panel de publicación se renderiza siempre que `!isCreating`, independiente de `ok`; las faltas son informativas). Un alumno entrega ese interactivo → `scoreFor` → null y `resultStatusOf` → **"auto"** (solo esquema/desarrollo dan "pendiente") → sin nota y sin cola de corrección manual. → [A4-04]
- ❌ **La nota del interactivo multi-categoría depende de la pestaña activa al entregar:** la nota de cabecera es solo `mainScore` de `currentCategoryId`; las demás categorías van en `extras` con nota propia que **no promedia** (`useSubmitAnswer.ts:236-256`; la rama multi hace lo mismo, `:119-126`). Dos alumnos con idénticas marcas pueden recibir notas distintas según qué categoría tuvieran seleccionada. Sin test que documente si es intencional. → [A4-02]
- ⚠️ Ya numerados en A2 y confirmados aquí desde el lado corrector: cuestionario multiparte con 0 preguntas bloquea la entrega (A2-07); partes sin `duration` → nota 0 en vez de null (A2-08).

---

## 6. Tests que faltan, priorizados (con esbozo de casos)

1. **`repeats.ts` — suite de caracterización completa** (requiere inyectar el generador de ids en `syncSecondPassBlocks`): `buildRepeatSegments` sin reps / 1 rep en medio / rep pegada al inicio o fin / reps desordenadas (ordena por `first.start`) / rep malformada (filtrada); `buildCompleteViewSegments` con hueco entre 1ª y 2ª vez; `syncSecondPassBlocks` espejo nuevo / espejo existente sin override / override conserva start pero recalcula duración / anclas `_lockedStart`/`_lockedEnd` en bordes / ratio 2ª vez ≠ 1ª / override huérfano se conserva; `rulerTicksForSeg` elección de paso y `d<=0`.
2. **Integración de cifrado** (tras el fix A2-01): grabar clave con `fig` → entregar marcas con `fig` → el resultado conserva `fig` y `interactiveFigureDiagnostics` devuelve `evaluable > 0`.
3. **`partsOf` caso A2-02** (test en rojo que guíe el fix): multiparte 2→1 partes vía `removePart`+`handleSave`, la parte superviviente no debe ser pisada por los campos planos obsoletos.
4. **`calcScore` casos límite:** `duration` undefined/0 (decidir null vs 0), clave que excede `duration`, margen ≥ duración del tramo.
5. **`calcSchemaPlacementScore` + sobrantes:** documentar (o cambiar) que los sobrantes no penalizan; verificar que dos bloques clave no pueden "consumir" el mismo bloque del alumno (el `pool.splice` de `schemaDiagnostics` sí lo evita — testearlo también en la nota).
6. **`palette.ts`:** `schemaBlockColor` frase (nivel 2) hereda color de su parte madre / frase huérfana sin parte → color por defecto; `partColorFromPalette` neutras (intro/coda/puente) → gris; `snapToNearest` empate y fuera de umbral.
7. **`figures.ts`:** `FIG_LEGACY` ("6"→t1, "6/4"→t2, …), `figureOf` con id desconocido → t0, `quadGroupsForDegree` V/VII/resto.
8. **`btnOf` tolerante** (con A3-08): categoría sin `buttons` no debe lanzar.
9. **`calcQuestionnaireScore`** con `points: 0` en todas las gradables (hoy → null) y mezcla test+corta+desarrollo.
10. **`labelsMatchForLevel` nivel 3:** "Do M" vs "Do mayor" (decidir si deben casar vía `parseHarmonyLabel`).
11. **routing:** round-trip `setHashQuery`/`parseHashQuery` (borrar clave con null, valores con caracteres reservados), `getLastPanelPath`.
12. **`scoreColor`/`scoreBg`:** umbrales exactos 79/80 y 49/50 (cruza con CVD/A5: el color es canal principal de la nota).

---

## 7. Hallazgos

- **[A4-01] alta — `lib/repeats.ts` sin ningún test (0%, ni siquiera se importa en tests)** — `repeats.ts` (170 líneas) + informe de cobertura 2026-07-10 — Evidencia: ausente de `coverage-summary.json` (ningún test lo carga); contiene la lógica más intrincada del dominio (`syncSecondPassBlocks`: ratio 1ª/2ª vez, overrides, anclas, espejos), compartida por ExerciseView y SchemaExerciseView, y además es no determinista (`uid()` en `repeats.ts:143` → Date.now/Math.random sin inyección). — Recomendación: prioridad 1 de la lista §6; inyectar el generador de ids como hace `db.ts` con `sleep`.
- **[A4-02] media — la nota del interactivo multi-categoría depende de la pestaña activa al entregar** — `useSubmitAnswer.ts:236-256` (y rama multi `:119-126`) — Evidencia: `score` = solo `mainScore` de `currentCategoryId`; los `extras` llevan nota propia que no entra en la cabecera ni en `aggregateParts`. — Recomendación: decisión de producto con Jon (¿promediar categorías? ¿cuál es "la" nota?) y test que la documente.
- **[A4-03] media — los bloques sobrantes no penalizan la nota de colocación del esquema** — `scoring.ts:85-100` — Evidencia: la nota cuenta `correct/keyBlocks` y sembrar la línea entera de bloques da 100%; `schemaDiagnostics` sí los lista (testeado) pero la nota los ignora y ningún test fija ese comportamiento como intencional. Mitigado: esquema siempre "pendiente" de revisión manual. — Recomendación: decidir penalización (o documentarla como no-penaliza) + test.
- **[A4-04] media — se puede publicar un ejercicio sin clave y la entrega resultante queda "auto" sin nota ni cola de corrección** — `PasoRevision.tsx:94-102` + `resultStatusOf` (`domain.ts:95-101`) — Evidencia: el switch de visibilidad no depende de `allReady`; un interactivo sin `answers` entregado da `score: null` con status "auto" (no "pendiente") → invisible para el flujo de corrección del profesor. — Recomendación: o bloquear visibilidad sin clave, o que `resultStatusOf` trate "sin clave" como "pendiente".
- **[A4-05] media — el cifrado no tiene test de integración marca→entrega→corrección** — cruce con A2-01 — Evidencia: `interactiveFigureDiagnostics` testeado en puro, pero el descarte de `fig` al serializar (A2-01) vivió sin detección; no hay test que recorra el pipeline. — Recomendación: test de integración nº 2 de §6, junto al fix.
- **[A4-06] media — `palette.ts` al 46%: el sistema de color del esquema sin red** — cobertura 2026-07-10 — Evidencia: `schemaBlockColor`, `partColorFromPalette`, `phraseColorFromPalette`, `partBlockColor`, `getCategoryColorsFromPalette`, `snapToNearest` sin test alguno; es el canal visual principal del modelo esquema (insumo CVD directo para A5). — Recomendación: suite §6.6.
- **[A4-07] baja — casos límite de puntuación sin fijar** — `scoring.ts:27-42,68-83` — Evidencia: `calcScore` con `duration` 0/undefined → 0 (no null; raíz de A2-08); `calcQuestionnaireScore` con `points: 0` → null. — Recomendación: tests §6.4 y §6.9 con decisión explícita del comportamiento deseado.
- **[A4-08] baja — mitad de `routing.ts` sin test (40%)** — cobertura 2026-07-10 — Evidencia: `parseHash`, `parseHashQuery`, `setHashQuery`, `getLastPanelPath` sin test (lo testeado es `routeFromSegments`/`coursesPath`). — Recomendación: §6.11.
- **[A4-09] baja — impureza no inventariada hasta ahora: `syncSecondPassBlocks` usa `uid()`** — `repeats.ts:5,143` — Evidencia: import de `ids.js` y llamada al crear espejos; completa el mapa de impurezas de A2-10..13 (routing React/DOM, audio fetch, ids sin DI, pointer DOM). Ninguna función de lib toca Supabase. — Recomendación: inyectar generador (habilita A4-01).
- **[A4-10] baja — 15 de 17 helpers de `data/db.ts` sin ejecutar en tests (funcs 15,8%)** — cobertura 2026-07-10 — Evidencia: `db.test.js` cubre el retry de `write()` con un helper; el resto son mecánicos e idénticos. Riesgo bajo real. — Recomendación: opcional, un test paramétrico que recorra los 17.

---

## Criterio de cierre

✅ Cada función exportada de `lib` clasificada testeada/parcial/sin test con riesgo (§3). ✅ Cobertura medida y tabla <70% (§2: 8 módulos por debajo, `repeats.ts` a cero). ✅ Invariantes críticas revisadas una a una con su protección y casos límite (§4). ✅ Consistencia editor↔corrector analizada con 2 inconsistencias nuevas ([A4-02], [A4-04]) y lista priorizada de 12 tests con esbozo de casos (§6).
