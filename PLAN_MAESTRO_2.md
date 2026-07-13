# PLAN_MAESTRO_2 — Análisis Auditivo (base: rama `beta`, commit `2885575`)

Segundo plan maestro para **Claude Code**. Integra, con dependencias resueltas y sin duplicaciones, todo lo diseñado tras el `PLAN_MAESTRO` original: el plan de simplificación (S0–S4, íntegramente pendiente), el rediseño del editor por pantallas (demo v3), el contenido de las tarjetas, las placas combinadas de híbridos, las preguntas de obra completa y la corrección del pestañeo al alternar de modelo. Colócalo en la raíz como `PLAN_MAESTRO_2.md`; copia también `demo_editor_ejercicio_v3.html` a `docs/especificacion_editor.html` — es la **especificación de referencia** de la fase M5 (comportamiento e interacción; los estilos ya son los del sistema).

## 0 · Estado de partida (verificado sobre `2885575`)

El `PLAN_MAESTRO` original está **completo**: 53 commits, F0–F7, con tres matices que este plan absorbe: **T2.6** (`feedbackBands`) no se implementó — su retirada queda en no-op de verificación; **T3.7** (primitivo `Menu`) no se implementó — pasa a tarea real (M3.5); **T7.1** quedó parcial por decisión documentada en el propio repo (`SchemaExerciseView` en 1.814 líneas; `SchemaTimeline` no se extrae — **respetar esa decisión**, no forzarla). Puertas certificadas hoy: ESLint 0 · `tsc` limpio · **156/156 tests** · build 4,6 s. `any` = 53. Existen y **no se tocan**: `attempts[]`, `points` por pregunta, `questionsSnapshot`, `corta`, diagnósticos, `CorrectionAudioBar`, multiparte con rutas `parte/:pid`. Pendiente todo el plan de simplificación: siguen presentes `guestResults`, `FONT_MONO`, `fa_settings`, `MultiModelSessionView` + `MultiPartSessionView` anidados, las seis variantes de fila/tarjeta, y el `body` sin fondo.

## 1 · Reglas de oro

Heredadas íntegras del `PLAN_MAESTRO` (rama por fase desde `beta`, un commit por tarea `feat|fix|refactor(mN): MN.x — …`, **puertas `lint+typecheck+test+build` tras cada tarea**, nunca tocar `supabase/`, nunca migrar ni reescribir datos almacenados, lectores tolerantes para toda compatibilidad, comentarios en español que explican el porqué, ningún significado solo por color). Añadidas: en **M0–M4** cada tarea cierra con diff neto negativo o neutro en `src/` excluyendo tests (son simplificación); en **M5–M7** no aplica (son características). El conteo de tests solo puede crecer. Prohibido deshacer `attempts[]` o `points` por pregunta aunque el addendum antiguo los cuestionara: la decisión §2 de `simplificaciones` los conserva y está verificada en producción.

**M0.0 — Auditoría de línea base (obligatoria).** Ejecuta y anota en el PR: `grep -rn "feedbackBands" src | wc -l` (esperado 0 → M0.4 es solo verificación); `grep -rn "function Menu" src/components/primitives.tsx` (esperado vacío → M3.5 se ejecuta); `grep -rn 'import("./supabase' src/App.tsx` (si vacío, M0.1 es no-op); `npm test 2>&1 | grep Tests` (≥156); `grep -c "const fmt" src/components/*.tsx` (inventario para M3.1). Divergencias: adapta la tarea al estado real y documéntalo en el commit.

## 2 · Vista de fases

| Fase | Contenido | Origen | Depende de | Tamaño | LOC |
|---|---|---|---|---|---|
| M0 | Borrado muerto + fondo papel + primer pintado | S0 + pestañeo capas 0/2 | — | S | −− |
| M1 | Normalizar en la frontera + invitado sin rama | S1 | M0 | M | − |
| M2 | `ExerciseItem` único con contenido final + `ModelPlate` | S2 + tarjetas + placas | M1 | L | −− |
| M3 | Audio/corrección: time, minimapa, candado, troceo, `Menu` | S3 + T3.7 | M0 | M | − |
| M4 | `SessionShell` keep-mounted + `?parte=` | S4 + pestañeo capa 1 | M1 | M | − |
| M5 | Editor por pantallas (asistente de 5 pasos) | demo v3 | M1, M4 | L | + |
| M6 | Preguntas de obra completa | plan obra | M3 | S | + |
| M7 | [Opcional] Tope de 2 → 3 modelos | plan placas | M4, M5 | S | + |

Racional del orden: M1 da los campos canónicos que M2 y M5 leen; M3 crea el `QuestionMinimap` que M6 extiende; M4 estabiliza rutas y alternancia antes de que M5 cablee sus retornos por paso; M7 es decisión de producto y queda preparada, no ejecutada por defecto.

---

## FASE M0 · Borrado muerto, fondo papel y primer pintado

**M0.1–M0.3 = S0.1–S0.3 del plan de simplificación**, tal cual: import dinámico de supabase fuera (o no-op si M0.0 lo encontró ya ausente); `FONT_MONO` eliminado (presente hoy en `teacher.tsx`, `CorrectionView.tsx`, `primitives.tsx` — sustituir por `FONT_UI` + `tabular-nums`); frases enlatadas de la corrección interactiva fuera (el diagnóstico de F2 ya ocupa su lugar).

**M0.4 — `feedbackBands`: verificación no-op.** Confirmado ausente en línea base; deja constancia con el grep en el PR y cierra.

**M0.5 = S0.5 — Margen global eliminado.** `DEFAULT_MARGIN = 1` y `DEFAULT_SCHEMA_MARGIN = 3` en `sessionConstants.ts`; fuera la carga de `fa_settings`, el estado `margin`, `updateMargin`, su hilado y el slider global de `SettingsTab`; `submitAnswer` usa `ex.margin ?? DEFAULT_MARGIN` (los sliders por ejercicio de T1.3 ya existen y quedan como única superficie; su valor inicial pasa a las constantes, y el defecto de `schemaMargin` es 3 s fijo, sin fórmula). Verifica: `grep -rn "fa_settings" src` = 0 salvo comentarios; test de defectos.

**M0.6 = S0.6 — `points` por parte fuera de la superficie.** Input de peso fuera de la autoría; `aggregateParts` conserva firma y honra pesos guardados (test «pesos heredados respetados»); `Part.points` marcado deprecated.

**M0.7 — Fondo papel bajo todo (pestañeo, capa 0).** En la hoja inyectada de `theme/fonts.ts`: `html,body{background:#f8f8f6}` y `#root{min-height:100dvh;background:#f8f8f6}`. Los **dos** fallbacks de Suspense (`App.tsx:~48` y el `schemaFallback` de `MultiModelSessionView`) ganan fondo papel y `minHeight:100dvh`, texto en `muted`. Verifica: con `body{background:red}` temporal el pestañeo del toggle se ve rojo **antes** del cambio y papel después; overscroll de iOS muestra papel.

**M0.8 — Primer dibujo síncrono del waveform (pestañeo, capa 2).** En el `useLayoutEffect` de `WaveformDisplay` (`session.tsx:411`), tras `resize()`, invocar el dibujo una vez de forma síncrona desde la `waveformData` disponible, sin esperar al primer rAF. Verifica: entrar en sesión y cambiar de parte sin frame de lienzo vacío (Paint flashing).

## FASE M1 · Frontera de datos (= S1 íntegra)

**M1.1** `normalizeExercise` idempotente sobre los lectores existentes, aplicada en `loadData`, escrituras (`addExercise`/`updateExercise`/`updatePart`/importación) y semillas, con fixtures legacy y test de idempotencia. **M1.2** barrido: los componentes leen `ex.models/categories/parts` directos; `grep "categoriesOf(\|modelOf(\|questionsOf(" src/components` = 0 (los lectores viven dentro del normalizador; `partToExercise`, `durationOf`, `keyReadyOf`, `resultPartsOf`, `composersOf` siguen públicos). **M1.3** invitado sin rama: fuera `guestResults` y sus ternarios; la condición baja a `createDb` (escrituras de resultados no-op); el aviso de UI se mantiene. Verifica: recorrido invitado completo; `grep guestResults` = 0.

## FASE M2 · Un solo ítem de ejercicio, con su contenido final

**M2.1 — `ExerciseItem`** con la especificación de contenido **ya definitiva** (plan de tarjetas integrado — no construir y retocar): *colapsada* = placa(s) · título · línea meta «**compositor** · duración» (multiparte: «Varios · 3 audios · 4:32» vía `composersOf`/`durationOf`; `showComp` solo gobierna la vista del alumno) · insignia de resultado (alumno) o chips **solo por excepción** (profesor: «Borrador» gris neutro si `keyReadyOf` incompleto, «Oculto», «N pendientes» en ámbar suave con texto); *expandida* = **nunca repite la insignia**: alumno → «Entregado el {fecha} · 84 % ✓» (el `timestamp` existe) + Iniciar/Repetir + Ver corrección; profesor → desglose solo si existe («Claves 4 de 6 — falta Audio 2» enlazando al editor; «12 entregas · 2 pendientes → Corregir» reubicando el MetaItem de T6.1 sin duplicarlo) + Editar · Previsualizar · Ocultar/Mostrar · ⋯(Duplicar, Eliminar) · ✕ Quitar en unidades. **Fuera en ambos roles:** conteos de categorías y preguntas, etiquetas, «×N» separado, chip verde perpetuo, «Grabar clave» como botón fijo.

**M2.2–M2.4 = S2.2–S2.4**: sustitución por contexto (lista alumno → banco → unidades ×2 roles), un commit cada una; al final caen las seis variantes (`grep "ExerciseRow\|TeacherExerciseRow"` = 0) y checklist visual por contexto en móvil y escritorio.

**M2.5 — `ModelPlate` (placas combinadas).** Según `plan_placas_hibridas.md` §2 al pie de la letra: refactor `Glyph({model})` en `TypePlate.tsx` sin cambio visual; `ModelPlate({models,size,radius})` con SVG 48×48, clip redondeado, **dos modelos** = triángulos `M0,0 H48 L0,48 Z` / `M48,0 V48 H0 Z` con costura blanca 1.2, glifos en `translate(16,15)`/`translate(32,33)` `scale(0.9)`; **tres modelos** = sectores `TL/TR/B` por mitades y cuartos, glifos en (13,13)/(35,13)/(24,36) `scale(0.78)`; orden de sectores = orden de `models[]`; tintes/colores de `MODEL_META` (coinciden con la maqueta). `ExercisePlate` pasa de `modelOf` a `ex.models` y delega. Placa híbrida: **mínimo 36 px** (subir las filas de 32) y `role="img"` con `aria-label` compuesto. Verifica: siete combinaciones (3 simples, 3 duales, 1 triple latente) a 36 y 44 px en móvil real; VoiceOver lee el combo; `grep modelOf` en componentes de tarjeta = 0.

## FASE M3 · Audio, corrección y menús (= S3 + T3.7)

**M3.1** `lib/time.ts` (`fmtClock`, `fmtPrecise`) sustituyendo los `fmt` locales inventariados en M0.0. **M3.2** `QuestionMinimap` compartido (gestor `editable`, sesión de solo lectura) **con la bandeja «Obra» ya en la API** — prop `obraQuestions` que renderiza chips bajo la línea de tiempo; hasta M6 llegará vacía, pero el componente nace preparado. **M3.3** candado de región: los «▶ Fragmento» por pregunta de la corrección dejan sus bucles ad-hoc y fijan la región en la `CorrectionAudioBar` común (patrón `loopRegionRef`), con la píldora «Fragmento Pn · bucle — Liberar». **M3.4** troceo de `CorrectionView` (hoy **1.143 líneas**): `correccion/InteractiveCorrection.tsx`, `SchemaCorrection.tsx`, `QuizCorrection.tsx` (cada una con su diagnóstico y su audio) + contenedor con cabecera, navegador de partes, agregado, línea de intentos y retorno; objetivo <300 por archivo, contenedor <200, un commit por extracción. **M3.5 — Primitivo `Menu`** (T3.7, confirmada pendiente): trigger+items con Escape, flechas, Enter, clic-fuera y roles; migra `KebabMenu`, `FilterDropdown`, `PaletteMenuButton`, `CourseDropdown` conservando su aspecto — única tarea de M0–M4 con LOC potencialmente neutro (su justificación es una convención de descarte, no líneas).

## FASE M4 · `SessionShell` sin remontaje (= S4 + pestañeo capa 1)

**M4.1 — Fusión con montado permanente.** `SessionShell.tsx` absorbe `MultiPartSessionView` + `MultiModelSessionView` (ambos se borran): chips de parte y alternador de modelo como dos nodos del mismo shell; `drafts[partId][modelId]` único (F4 ya elevó los borradores — reutilizarlos); reproductor por parte con la LRU existente; **las vistas de los modelos del combo se montan una vez y el toggle alterna `style.display`** — cero remontaje, cero parpadeo por construcción. Requisitos: prop `active: boolean` en las tres vistas (con `false`: pausa su rAF de dibujo, ignora Espacio, no registra `loopRegion`) — se suma a `initialDraft/onDraftChange` como cambio interno permitido; **precalentamiento** del chunk de esquema al montar un combo que lo incluya (`import("./SchemaExerciseView.js")` en efecto inmediato); scroll reset instantáneo al alternar (`window.scrollTo`), sin animación. Con una parte y un modelo, el shell es transparente. Verifica: Paint flashing limpio en 20 toggles con audio sonando; primer cambio a esquema bajo Slow 3G sin blanco ni «Cargando…»; Performance monitor → rAF parado en vistas ocultas; borradores intactos en todas las combinaciones parte×modelo; `grep MultiModelSessionView|MultiPartSessionView` = 0.

**M4.2 — `?parte=` como única convención emitida.** El segmento `parte/:pid` (F4) se sigue aceptando con `@deprecated`; todos los `navigate` emisores pasan a ruta sin segmento + `setHashQuery({parte})`; efecto de compatibilidad en `App` que normaliza con `{replace:true}`. Verifica: enlace antiguo redirige; atrás no rebota.

## FASE M5 · Editor por pantallas (especificación: `docs/especificacion_editor.html`)

Reescritura de `ExerciseDetailView` (1.052 líneas) como asistente de **5 pasos** — Identidad · Modelo · Audios · Claves · Revisión — con navegación libre y resumen vivo. Estructura destino: `components/editor/EditorShell.tsx` (<250 líneas: topbar, carril/chips, `?paso=` en query, pie de paso) + `Paso1Identidad.tsx` … `Paso5Revision.tsx`. La demo define comportamiento e interacción; los estilos son los tokens del sistema.

**M5.1 — Armazón.** Topbar: ← Volver (a `getLastPanelPath`), overline «Ejercicio · {Borrador|Lista ✓}» **tocable → paso 5**, título como botón → paso 1, Guardar con punto de sucio (las guardias `isDirty` de F0 se conservan), ⋯ (Previsualizar como alumno, Duplicar, Ocultar/Mostrar, Eliminar en dos toques). Escritorio ≥900 px: carril izquierdo fijo — caja de estado **solo en positivo** («✓ Lista para alumnos»; en borrador, nada) + los cinco pasos con número/✓/! y sub-rótulo vivo. Móvil: **solo** la tira de chips horizontal (sin tarjeta-resumen); pie inferior fijo Anterior/Siguiente (paso 5: Previsualizar/Guardar); el pie de paso en contenido solo en escritorio. `?paso=n` sincronizado (helpers de query de F3). **Prohibida la palabra «Incompleta» y todo mensaje ansiógeno global**: el estado neutro es «Borrador».

**M5.2 — Pasos 1 y 2.** *Identidad:* panel a todo el ancho — título grande; debajo, dos columnas: categorías | interruptor «Mostrar compositor al alumno» con la nota «El compositor se indica en cada audio (paso 3)». **Sin campo de compositor por defecto** (el `composerName` de nivel ejercicio se conserva como dato de fallback para ejercicios existentes, pero desaparece de la autoría). *Modelo:* tres tarjetas grandes con descripción (textos de la demo), toggle con tope actual (2) y la nota «Al desactivar un modelo, sus claves se conservan».

**M5.3 — Paso 3 · Audios.** Sustituye la sección Partes de T4.2. Cabecera con el **selector segmentado `[1][2][3][+]` a la derecha del título** (números; activo en tinta; título de parte en `title`); todo el ancho para la parte seleccionada, jerarquizada en cuatro niveles: overline «Parte 2 de 3 · 0:58» con un único ⋯ (Subir/Bajar/Duplicar/—/Eliminar en dos toques, más «Importar del banco…»); onda protagonista (~96 px, `FragmentRangeSelector` real); fila única «▸ Escuchar · Ajustar fragmento · ‹rango› ·· Cambiar audio…» (biblioteca y subida fusionadas tras un solo botón que abre el `AudioLibraryPickerModal`/selector); divisor punteado; nombre + compositor de la parte en dos columnas. Estado vacío = invitación de la demo. Tope 8 partes.

**M5.4 — Paso 4 · Claves.** Matriz partes × modelos desde `keyReadyOf` (escritorio tabla, móvil tarjetas): celda = chip de estado con texto («Lista ✓» / «Sin preguntas ⚠») + acción (Grabar/Regrabar → ruta de grabación de esa parte; Añadir preguntas/Gestionar → gestor de esa parte). Debajo, «Opciones de corrección» condicionadas: margen+pista si interactivo; solo-escucha+referencia («al entregar / tras la corrección») si esquema — **los sliders de T1.3 y las opciones de esquema se mudan aquí** desde sus ubicaciones actuales.

**M5.5 — Paso 5 · Revisión por excepciones.** Sin checklist completa: si todo está, estado verde + línea-recibo («✓ 3 audios · 3:41 · claves 6/6 · Interactivo + Cuestionario»); si no, «Se guarda como borrador hasta completar:» con **círculos grises ○** (nunca ámbar) y «Ir al paso N →». Panel de publicación: interruptor visible + unidades que contienen el ejercicio (derivadas de `units`) + «+ Añadir a unidad» + Previsualizar/Guardar.

**M5.6 — Retornos por paso.** Grabar clave, gestor de preguntas y previsualización vuelven a `…/ejercicio/:id?paso=4` (o al paso de origen), componiendo con `getLastPanelPath` de F3 — el ciclo Cursos → editar → grabar → **vuelta a Claves** queda cerrado. Verifica M5 completa: crear el 3-cadencias de cero por el asistente en móvil y escritorio; recarga en cualquier paso conserva posición; cero apariciones de «Incompleta» (`grep -rn "Incompleta" src` = 0); guardias de sucio activas al salir de cualquier paso.

## FASE M6 · Preguntas de obra completa (= T5.8 del plan de obra)

`Question.scope?: "fragmento"|"obra"` con `audioStart/End` opcionales; `questionScopeOf` en `domain.ts` (sin tiempos ⇒ obra; tests con fixtures legacy). `QuestionEditorModal`: segmentado «Ámbito: Fragmento | Obra completa» que muestra/oculta el `FragmentRangeSelector` (ya presente por T5.2) y salta la validación de tiempos. Sesión: insignia «Obra completa», `selectQuestion` con obra → `unlockAudio()` sin seek; bandeja del `QuestionMinimap` (M3.2) poblada. «Ordenar por tiempo» (T5.3) pospone las de obra. Corrección: insignia + botón «▸ Escuchar la obra» (desde 0, sin candado) en la variante del mecanismo de M3.3. `scoring.ts` **sin cambios**, con test que lo demuestra. Sin rangos degenerados «0:00–fin». En multiparte, obra = el audio de esa parte; el ámbito `"ejercicio"` queda como puerta v2 documentada, no implementada.

## FASE M7 · [Opcional — decisión de producto] Tope de 3 modelos

No ejecutar sin confirmación explícita en el PR anterior. Si se aprueba: constante y textos del paso Modelo («hasta tres»), constraint del alternador del `SessionShell`; matriz de Claves, `keyReadyOf`, sobre `byModel` y corrección troceada ya son genéricos. La placa triple de M2.5 se vuelve alcanzable. Verifica: un triple real sobre obra corta, de autoría a corrección, en móvil.

---

## Verificación final del programa

Puertas en verde con **>156 tests**; `git diff 2885575 --stat` de M0–M4 con neto negativo en `src/` excluyendo tests; greps a cero: `FONT_MONO`, `fa_settings`, `guestResults`, `MultiModelSessionView`, `MultiPartSessionView`, `ExerciseRow|TeacherExerciseRow`, `const fmt` en componentes, `categoriesOf(|modelOf(|questionsOf(` en componentes, `Incompleta`; `any` < 40. Recorrido completo del demo «Tres cadencias comparadas»: autoría íntegra por el asistente (con una pregunta de obra y una `corta`), sesión alternando parte y modelo con Paint flashing limpio, entrega única, cola de pendientes con «Guardar y siguiente», corrección con candado de fragmento y «Escuchar la obra», reintento, insignias y tarjetas finales conforme a la tabla de M2 — en móvil y escritorio, más el modo invitado de punta a punta.

**Fuera de alcance declarado:** deshacer `attempts[]` o `points` por pregunta; migrar o re-baremar datos; extraer `SchemaTimeline` (decisión documentada en `2885575` — respetarla); `multi`/`shuffleOptions`; ámbito de pregunta `"ejercicio"`; comentarios anclados a tiempo; dark mode; i18n; tocar `supabase/functions` o `supabase/migrations`.
