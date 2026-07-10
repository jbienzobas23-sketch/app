# A5 — UI, accesibilidad CVD y móvil

**Fecha:** 2026-07-10 · **Rama:** `beta` · **Commit HEAD:** `f263089a1ef0e70f2fb2902839e891cca6afe52a` (código fuente idéntico a A0–A4; `analisis/` va por `afb1ddf`)
**Método:** 3 barridos exhaustivos paralelos (color-only/CVD, teclado+estados, responsive+coherencia) sobre `src/App.tsx` + `src/components/**` + hooks/theme, con **verificación manual posterior** de todos los casos graves. Se descartaron 2 falsos positivos del barrido responsive (`courses.tsx:426` y `:178` son rutas solo-escritorio — `CoursesPages` enruta móvil a `MobileCoursesScreen` en `courses.tsx:621-656`; `teacher.tsx:733-735` sí está gateado con `isMobile`) y se corrigió 1 afirmación de teclado (el fragmento de pregunta SÍ tiene alternativa numérica: el modal de edición usa `FragmentRangeSelector` en `modals.tsx:851`, con campos Inicio/Fin en `session.tsx:311`).

Leyenda de color: verde=`C.fnT #3F9B5B`, azul=`C.fnS/C.quiz #2F6FB8`, ámbar=`C.fnD #C77A1A`, rojo=`C.danger #B84A3A`, morado=`C.fnI`.

---

## 1. Auditoría color-only (tabla exhaustiva)

Formato: ubicación · información transmitida · canal de color · **¿canal redundante?** (cuál).

### Correcciones (zona crítica)

| Ubicación | Información | Color | ¿Redundante? |
|---|---|---|---|
| InteractiveCorrection.tsx:136 | nota | scoreColor | ✅ número nota10 + "/10" |
| InteractiveCorrection.tsx:84-90 | grado marcado en bandas clave/alumno | color de categoría | ⚠️ **PARCIAL**: etiqueta `iv.fn`+cifrado solo si el bloque >5% de la duración → **[A5-02]** |
| InteractiveCorrection.tsx:206-213 | leyenda categoría↔color | swatch | ✅ id + nombre texto |
| InteractiveCorrection.tsx:150-179 | diagnóstico cobertura/precisión/desfase | neutro | ✅ números + texto |
| QuizCorrection.tsx:331-336 / 551+ | opción test correcta vs elegida errónea | verde vs rojo | ✅ ✓ vs ✗ (glifos distintos) + tag "TU" |
| QuizCorrection.tsx:346-352 / 565-571 | **veredicto de respuesta CORTA** | borde izq. verde/rojo | ❌ **NO** — la palabra solo vive en `title` → **[A5-01]** |
| QuizCorrection.tsx:356-365 | respuesta desarrollo (pendiente) | borde azul | ✅ no es acierto/fallo; texto "Pendiente de revisión" |
| QuizCorrection.tsx:305-309 | fragmento reproduciéndose | azul relleno | ✅ ▶/❚❚ + tiempo |
| SchemaCorrection.tsx:195 | bloque OK/mal en diagnóstico | verde/rojo | ✅ ✓/✗ + estado texto ("desplazado" + Δs) |
| SchemaCorrection.tsx:117-143 | identidad de bloques del esquema | color de paleta | ⚠️ PARCIAL: `b.label`, pero desaparece en bloques estrechos → **[A5-03]** |
| SchemaCorrection.tsx:428,437 / NotaInput.tsx:37 / CorrectionView.tsx:127-152 | notas | scoreColor | ✅ número |
| AttemptBanner.tsx:26-27 | tendencia entre intentos | verde/rojo | ✅ ↑ vs ↓ (forma) + números |

### Sesión (alumno)

| Ubicación | Información | Color | ¿Redundante? |
|---|---|---|---|
| session.tsx:959 (FunctionButtons) | función T/S/D/grado | color categoría | ✅ letra/romano grande + nombre + "tecla X" |
| session.tsx:600-630 | marcas pintadas sobre la onda | color categoría | ⚠️ PARCIAL: etiqueta solo si ancho >14px → **[A5-02]** |
| session.tsx:286-288 / 186,244-249 | playhead / handles fragmento | verde / azul | ✅ posición + tiempo |
| ExerciseView.tsx:404-441,467-479 | tab activa, grado seleccionado, tile de cifrado | relleno | ✅ texto/letra/glifo FigureLabel |
| SchemaExerciseView.tsx:1000-1122 | bloque esquema (parte/frase) | color paleta | ⚠️ PARCIAL: `block.label` con `fontSize:0` si wPct<3.5 → **[A5-03]** |
| SchemaExerciseView.tsx:1107 | bloque seleccionado | borde blanco 0.82 vs 0.18 | ✅ luminosidad+sombra (no tono) — aceptable, sutil |
| SchemaExerciseView.tsx:1272-1298 | selector de paleta | swatches | ✅ nombre + ✓ |
| schema/RepeatBand.tsx:218-226 | zona original vs repetición | azul vs verde | ✅ texto "ORIGINAL"/"REPETICIÓN" |
| schema/RepeatBand.tsx:229-245 | asas inicio/unión/fin | azul/tinta/verde | ⚠️ posición + title; inicio/fin solo difieren en color+posición → [A5-07] baja |
| QuestionnaireView.tsx:163 (minimapa) | **pregunta respondida vs no** | verde vs azul | ❌ **NO** — el número no cambia → **[A5-05]** (mitigado: tarjetas con ✓) |
| QuestionnaireView.tsx:194-196 | pregunta respondida (tarjeta) | verde | ✅ ✓ vs número |
| QuestionnaireView.tsx:249-254 | progreso | verde al completar | ✅ "N / M" + barra |
| QuestionMinimap.tsx:112-117,165-170 | seleccionada / chip Obra | borde+opacidad / relleno | ✅ opacidad + número / texto |

### Listas, dashboards y editor

| Ubicación | Información | Color | ¿Redundante? |
|---|---|---|---|
| lib/modelMeta + TypePlate | tipo de ejercicio | verde/azul/ámbar | ✅ icono de FORMA distinta (onda/lista/bloques) + label |
| primitives.tsx:163-172 (ScoreBadge) | nota/estado | scoreBg/Color | ✅ número; corregido→✓; pendiente→texto "Pendiente" |
| primitives.tsx:429-467 (ProgressRing/StatusCircle/CategoryDots) | progreso/hecho/categoría | verde/tinta/color | ✅ ✓, fracción n/m, inicial de letra en el punto |
| primitives.tsx:147-149 (TabBar) | entregas por corregir | punto rojo | ✅ presencia del punto + title (no depende del tono) |
| primitives.tsx:644-658 (EyeButton) | visible/oculto | tinte rojo | ✅ ojo abierto vs tachado (forma) |
| ExerciseItem.tsx:110,134-176 | oculto / pendiente vs corregido | opacidad / gris-verde | ✅ opacidad; reloj vs ✓ (formas); textos distintos |
| editor/EditorShell.tsx:250-260 (StepNum) | paso hecho/aviso/pendiente | verde/ámbar/tinta | ✅ ✓ / ! / número |
| editor/PasoClaves.tsx:31-34,128-134,170-262 | clave lista/sin clave, nivel activo | verde vs gris | ✅ textos distintos + ✓ |
| editor/editorUi.tsx:31-37 (Switch) | on/off | verde/gris | ✅ posición del knob + role=switch |
| editor/PasoRevision.tsx:57-88 | lista/faltas | verde/quiz | ✅ ✓ texto / ○ + texto de la falta |
| courses.tsx:100-129,354-591 | visibilidad, progreso, unidad oculta/hecha | verde/azul/gris | ✅ texto siempre ("Público", n/m, "oculta", "✓") |
| teacher.tsx:262-277,399-410,507,1129-1220 | credencial, badges, etiquetas, correcciones | varios | ✅ texto siempre |
| teacher.tsx:547-553 (BookCard) | **libro vs audio suelto** | tinte azul del marco | ❌ **NO** — comentario: "el azul YA distingue un libro" → **[A5-04]** |
| modals.tsx:305,689 / App.tsx:61-68 / ErrorMsg | tipo picker, duración OK, errores | azul-verde/rojo | ✅ texto siempre (el rojo es refuerzo) |
| modals.tsx:903-914 | opción correcta (editor de pregunta) | relleno verde vs contorno | ⚠️ PARCIAL: luminosidad + title; letra idéntica → [A5-06] |

**Balance CVD global:** la app está mayoritariamente bien cubierta (números de nota, ✓/✗/○/reloj, iconos de forma por tipo, iniciales en los puntos de categoría — `CategoryDots` incluso cita el daltonismo en su comentario). Los huecos reales son los 4 ❌ y los 3 ⚠️ estructurales de arriba.

---

## 2. Teclado y ARIA

**Mecanismos correctos (referencia):** `ModalShell` completo (role=dialog, trampa de foco, Escape — primitives.tsx:56-101); `rowButtonProps` aplicado en filas/tarjetas (ExerciseItem:114, StudentDash:193, teacher:230/336/492/548, courses:346, QuestionManagerView:229); focus visible repuesto vía CSS inyectado (`theme/fonts.ts:72,79`) — **cero hallazgos de outline**; `Menu` (⋯) con Escape+flechas+devolución de foco (primitives.tsx:747-808).

**Hold-to-record: SÍ tiene alternativa de teclado** — `ExerciseView.tsx:174-214` registra `keydown`/`keyup` globales (cada letra `b.key` mantiene el intervalo; Espacio = play/pausa), y los botones rotulan "tecla X". Matiz: con el foco en un botón de función, Espacio dispara play (el botón no tiene onClick/onKeyDown propio).

**Huecos (véanse hallazgos):**
- **Modelo esquema inoperable sin puntero** — [A5-08]: bloques no enfocables (SchemaExerciseView.tsx:1029-1167 mover/redimensionar solo drag), reglas/carriles/scrollbar solo puntero (:1390-1701), zoom solo rueda/pinch sin botones (useSchemaZoom.ts:29-65).
- Navegación de audio solo puntero — [A5-09]: `AudioScrubber` con aspecto de slider sin role/tabIndex/flechas (session.tsx:782-840); `WaveformDisplay` scrub/colorear sobre canvas no enfocable (session.tsx:703-758); seek de corrección solo clic (SchemaCorrection.tsx:115, InteractiveCorrection.tsx:77). Mitiga: Espacio play/pausa y campos numéricos del fragmento (session.tsx:311).
- Divs clicables sin teclado — [A5-10]: cabecera de pregunta del alumno (QuestionnaireView.tsx:190-191 — la vía principal de selección), "comentar bloque" (SchemaCorrection.tsx:124/134/140), × de etiqueta (primitives.tsx:543, además sin aria-label), bloque del minimapa en modo lectura (QuestionMinimap.tsx:109).
- `FieldLabel` sin `htmlFor` — [A5-11]: primitives.tsx:1104-1105 (label hermano del input, sin id) — patrón en login, modales y editor; también session.tsx:310.
- Botones de icono sin nombre — [A5-12]: play/pausa de SchemaExerciseView.tsx:1257-1259 y QuestionManagerView.tsx:191-192 (sin title ni aria-label); varios solo-title (ExerciseView:442/520/529, RepeatBand:248, SchemaExerciseView:1752/1777).

---

## 3. Estados de interfaz por vista

| Vista | Carga | Vacío | Error |
|---|---|---|---|
| App raíz | ✅ "Cargando…" (App.tsx:295) + lazyFallback (:51) | N/A | ⚠️ SaveErrorToast role=alert (:61-72) — solo guardado; **error de CARGA invisible** (cruza A3-04) |
| StudentDash | (cubierto por dbReady) | ✅ :213-215 (sin ejercicios / filtro) | ❌ solo toast global |
| Cursos (alumno/profesor) | — | ⚠️ 0 cursos ✅ (:177,:463); unidad sin ejercicios ✅ (:185-188); **curso sin unidades: sin mensaje** | ❌ |
| Teacher ejercicios/alumnos/audios | — | ✅ :147 / :323 / :708,715 | ❌ |
| ExerciseView | ✅ AudioLoadingOverlay (:378) | ⚠️ **sin audio: reproduce en silencio, sin aviso** | ✅ audioError (:379) |
| QuestionnaireView | ✅ (:139) | ✅ 0 preguntas (:115-127) | ✅ (:140) |
| SchemaExerciseView | ✅ (:1201) | ✅ contadores "Sin bloques/marcas todavía" | ✅ (:1202) |
| SessionShell / CorrectionView | ✅ (:31) / síncrono | ✅ "parte sin entrega" (CorrectionView:174), "Sin clave todavía" (InteractiveCorrection:132), NotFound (App:528) | ❌ |
| Login/Setup/ForgotPin | ✅ "Verificando/Configurando/Enviando…" | ✅ TeacherPicker (auth:391) | ✅ ErrorMsg |
| Editor | ⚠️ punto de "sucio" + disabled, **sin "Guardando…"** | ✅ faltas (PasoRevision:72-88) | ⚠️ solo toast global; URL de audio sí (modals:606,690) |

---

## 4. Responsive y móvil (verificado)

- **Anchos fijos:** ningún `width` >340 sin gate en todo el árbol (el único de 3 cifras, ExerciseView.tsx:498 `width:200`, envuelve bien). Los `maxWidth` grandes acotan, no desbordan. Las rutas de cursos escritorio/móvil están correctamente separadas (CoursesPages, courses.tsx:621-656).
- **Grids:** los `minmax(340px,1fr)` de SchemaCorrection.tsx:332 y :352 (paneles de comentarios del corrector) no están gateados → en 375px (contenedor ~327px tras padding) desbordan ~13px → [A5-17]. La matriz partes×modelos del editor SÍ tiene variante móvil (PasoClaves.tsx:54,72-117). No hay más `<table>`.
- **Targets táctiles** → [A5-16]: asa de intervalo dibujada a 6px (`SCHEMA_HND_VISUAL_W`, session.tsx:661) y **la constante de hitbox ampliada `SCHEMA_HND_W` que cita el comentario de lib/schema.ts:28 NO existe en el repo** (verificado por grep — comentario obsoleto o hitbox nunca implementada); handles de fragmento 12px (session.tsx:181); botón ClaveCell ~22px (PasoClaves.tsx:36); × de modales ~24px (modals.tsx:106,544); asa de repetición height 14 (SchemaExerciseView.tsx:1699); botones de icono ~22px sueltos. Contraste positivo: los botones hold-to-record son grandes (session.tsx:941-958).
- **Touch:** `startPointerDrag` bloquea el scroll correctamente y casi todas las superficies declaran `touchAction:"none"`; faltan 2: la barra de seek (session.tsx:255) y el minimapa en modo navegación (QuestionMinimap.tsx:91-92, la rama editable sí lo pone) → [A5-18]. Hold-to-record suprime selección/tap-highlight (session.tsx:945,957). No hay `onContextMenu` en el repo.
- **Safe-area/viewport:** `100vh` solo en correcciones y gateado a escritorio (split=!isMobile); no hay `100vw`. Único gap de producción: **SaveErrorToast fixed bottom sin `env(safe-area-inset-bottom)`** (App.tsx:64) → [A5-18]. Bien resueltos: barra del editor (EditorShell:211), sheets (primitives:258/348), `S.page` (tokens:28).
- Menor: tabs del editor con `overflowX:auto` sin `WebkitOverflowScrolling:"touch"` (EditorShell.tsx:181).

---

## 5. Coherencia visual (insumo para PLAN_UNIFICACION)

- **Radios sin tokenizar** → [A5-19]: distribución `999`×36, **`10`×36, `12`×28** (¡tan usados como los tokens!), `8`×32 (S.card), `7`×27 (S.btn/S.input), `3`×19, `4`×15, `14`×10, `16`×7, `20`×6… El radio 12 se concentra en PasoClaves (6), SchemaCorrection (4), courses/SchemaExerciseView/ExerciseView (3 c/u); 14-20 en primitives/teacher/courses. Radios "de facto" 10 y 12 no existen como token.
- **CTAs bespoke en PasoClaves.tsx** (no importa primitives, A1-08): «Grabar clave» :143-152 (`radius 12, padding 13px 18px, fs 15`), esquema/probar :267-272, cuestionario :291-296 — todos duplican `S.btnPrimary` (radius 7, `7px 15px`, fs 12) con valores mayores. En session.tsx (tampoco importa primitives): play 34×34 sobre S.btn (:197-206), botoncillos `4px 10px` (:220-234, :340), FunctionButtons totalmente bespoke (:941-958, sin equivalente — legítimo). En modals.tsx: × (:105), preview/elegir (:544-547) encogen tokens.
- **Colores hardcodeados que ya son token:** `#555`×10, `#888`×7 (y un `#444` en App.tsx:150 que ni es token); peor fichero `courses.tsx` (9). `C.ink`/`C.line` sí se usan por token (0 hardcodeos).
- **fontSize:** outliers de display (40-52 en auth/notas) coherentes entre sí; fraccionales raros 13.5/14.5/25 dispersos. **OJO:** `fontSize:16` masivo en modals.tsx (11×) e inputs de esquema probablemente **intencional** (≥16px evita el zoom-on-focus de iOS) — no "unificar" a 13 sin confirmar.
- **Tipografía: 100% tokenizada** — 292 usos de `fontFamily`, todos resuelven a FONT_SANS/FONT_SERIF. La dimensión más limpia del sistema.

---

## 6. Hallazgos

Regla del plan aplicada: **todo canal sin redundancia no cromática = alta como mínimo.**

- **[A5-01] alta — el veredicto de una respuesta corta se transmite SOLO por color** — `correccion/QuizCorrection.tsx:346` (profesor) y `:565` (alumno) — Evidencia (verificada): `borderLeft: 3px solid ${v.color}` verde/rojo; la palabra del veredicto solo existe en `title={v.word}` (`:299`); "Se aceptaba: …" (`:352`) es dato, no veredicto. Las preguntas test sí llevan ✓/✗ (`:331-336`). — Recomendación: replicar el patrón de test (✓/✗ + palabra visible) en corta.
- **[A5-02] alta — marcas estrechas del interactivo identificadas solo por color de categoría** — `correccion/InteractiveCorrection.tsx:85` y `session.tsx:601` — Evidencia (verificada): la etiqueta `iv.fn` (+cifrado) solo se dibuja si el intervalo ocupa >5% de la duración (corrección) o >14px (sesión); los intervalos cortos — frecuentes en análisis armónico — exigen distinguir tonos entre sí. — Recomendación: etiqueta abreviada/rotada o tooltip persistente también en bloques estrechos; mínimo garantizado de 1 carácter.
- **[A5-03] alta — los bloques estrechos del esquema pierden su etiqueta (fontSize:0) y quedan solo-color** — `SchemaExerciseView.tsx:1122` y `correccion/SchemaCorrection.tsx:141` — Evidencia: `fontSize: wPct<3.5 ? 0 : …`; con paleta, la identidad parte/frase pasa a ser únicamente el tono. — Recomendación: mismo remedio que A5-02.
- **[A5-04] alta — libro vs audio suelto distinguidos únicamente por el tinte azul del marco** — `teacher.tsx:547-553` — Evidencia (verificada): comentario literal «el azul de la tarjeta YA distingue un libro de un audio suelto, no hace falta rotularlo»; colapsadas, ambas tarjetas muestran título+compositor+chevron. — Recomendación: canal no cromático discreto (p. ej. conteo "N piezas", ya vetado el emoji por Jon — proponer alternativas en el rediseño).
- **[A5-05] alta — minimapa del cuestionario: respondida (verde) vs pendiente (azul) sin cambio de glifo** — `QuestionnaireView.tsx:163` + `QuestionMinimap.tsx:125` — Evidencia (verificada): `fill: answers[q.id]!==undefined ? C.fnT : C.quiz`; el label del bloque es el número en ambos estados. Mitigado: las tarjetas de la lista sí llevan ✓ (:194-196) — el canal duplicado existe en pantalla, pero el minimapa en sí es solo-color. — Recomendación: ✓ o relleno/contorno en el bloque del minimapa.
- **[A5-06] media — opción correcta del editor de preguntas marcada por relleno vs contorno** — `modals.tsx:903-914` — Evidencia: verde relleno vs contorno + `title`; la letra de opción no cambia. Es luminosidad (perceptible con CVD), por eso media y no alta. — Recomendación: ✓ junto a la opción correcta.
- **[A5-07] baja — asas inicio/fin de RepeatBand difieren solo en color+posición** — `schema/RepeatBand.tsx:229-245` — la posición (izquierda/derecha) es canal no cromático inherente; title presente. Anotado por exhaustividad.
- **[A5-08] alta — el modelo esquema es inoperable sin puntero** — `SchemaExerciseView.tsx:1029-1167,1390-1701` + `hooks/useSchemaZoom.ts:29-65` — Evidencia: bloques sin role/tabIndex/onKeyDown (solo el input de renombrado tiene teclado), mover/redimensionar/crear solo drag, zoom solo rueda/pinch sin botones +/−. Un alumno que no puede usar ratón no puede entregar un esquema. — Recomendación: al menos selección por Tab + flechas para mover/redimensionar el bloque seleccionado (patrón estándar), botones de zoom.
- **[A5-09] media — navegación de audio solo por puntero** — `session.tsx:782-840` (AudioScrubber sin role="slider"/flechas), `session.tsx:703-758` (canvas no enfocable), `SchemaCorrection.tsx:115`/`InteractiveCorrection.tsx:77` (seek solo clic) — Mitiga: Espacio play/pausa global y campos numéricos del fragmento. — Recomendación: role=slider + flechas en el scrubber (sirve a las 4 vistas).
- **[A5-10] media — accionables en div sin teclado** — `QuestionnaireView.tsx:190-191` (cabecera de pregunta: la vía principal de selección del alumno), `SchemaCorrection.tsx:124,134,140` (comentar bloque), `primitives.tsx:543` (× de etiqueta, también sin aria-label), `QuestionMinimap.tsx:109` — Recomendación: `rowButtonProps` (ya existe y se usa en 6+ sitios).
- **[A5-11] media — `FieldLabel` no asocia label↔input (`htmlFor` ausente en toda la app)** — `primitives.tsx:1104-1105`, `session.tsx:310` — Evidencia: `<label>` hermano sin htmlFor; inputs sin id. Afecta a lectores de pantalla y al clic-en-label. — Recomendación: FieldLabel acepte `htmlFor` + id autogenerado en TextInput.
- **[A5-12] baja — 2 botones play/pausa sin nombre accesible** — `SchemaExerciseView.tsx:1257-1259`, `QuestionManagerView.tsx:191-192` — CircleButton sin title/aria-label (el resto de botones de icono están bien tras la Fase 5 de a11y). + 6 casos solo-title.
- **[A5-13] baja — Menu (⋯) sin autofocus del primer ítem ni Home/End/typeahead** — `primitives.tsx:747-808` — Escape/flechas/foco correctos; carencias menores frente al patrón ARIA completo.
- **[A5-14] media — el error de datos es invisible en todas las vistas de lista** — tabla §3 — Evidencia: solo existe toast de GUARDADO; un fallo de carga deja listas vacías/semilla sin aviso (refuerza A3-04 desde la UI). — Recomendación: estado de error con reintento a nivel de App.
- **[A5-15] baja — vacíos/feedback que faltan** — curso sin unidades sin mensaje (courses.tsx), ExerciseView sin audio reproduce en silencio sin aviso (ExerciseView.tsx:378 solo cubre carga/error), editor sin indicador "Guardando…" (EditorShell.tsx:134,220).
- **[A5-16] media — targets táctiles por debajo de 40px en controles clave** — asa de intervalo 6px con hitbox fantasma (`SCHEMA_HND_VISUAL_W`, `session.tsx:661`; **`SCHEMA_HND_W` citada en `lib/schema.ts:28` no existe** — verificado), handles 12px (session.tsx:181), ClaveCell ~22px (PasoClaves.tsx:36), × ~24px (modals.tsx:106,544), asa de repetición 14px de alto (SchemaExerciseView.tsx:1699). — Recomendación: hitbox ≥40px independiente del dibujo (el comentario de schema.ts ya lo prometía).
- **[A5-17] baja — grids `minmax(340px)` desbordan en 375px** — `SchemaCorrection.tsx:332,352` — contenedor ~327px tras padding → overflow ~13px al corregir desde el móvil. — Recomendación: `minmax(min(340px,100%),1fr)`.
- **[A5-18] baja — remates touch/safe-area** — SaveErrorToast sin `env(safe-area-inset-bottom)` (App.tsx:64); `touchAction:"none"` ausente en la barra de seek (session.tsx:255) y el minimapa en modo navegación (QuestionMinimap.tsx:91-92); tabs del editor sin momentum iOS (EditorShell.tsx:181).
- **[A5-19] media — radios "de facto" (10, 12) tan usados como los tokens (7, 8) y CTAs bespoke en PasoClaves** — §5 — Evidencia: 36+28 usos vs 32+27; «Grabar clave» duplica S.btnPrimary con radius 12/padding 13-18/fs 15. Insumo nº 1 para PLAN_UNIFICACION. — Recomendación: decidir la escala de radios (¿4/8/12/999?) y tokenizarla antes de unificar.
- **[A5-20] baja — restos de color hardcodeado y fontSize fuera de escala** — `#555`×10/`#888`×7/`#444`(App.tsx:150), concentrados en courses.tsx; outliers fraccionales 13.5/14.5/25. **No tocar los `fontSize:16` de modals.tsx sin confirmar** (anti zoom-on-focus iOS). Positivo: tipografía 100% tokenizada.

---

## Criterio de cierre

✅ Tabla color-only completa (§1, ~50 indicadores revisados uno a uno, con las 4 ausencias de redundancia **verificadas manualmente en el código** y marcadas alta ([A5-01..05]; la [A5-05] con su mitigación anotada). ✅ Estados carga/vacío/error por vista (§3). ✅ Teclado/ARIA incluido hold-to-record — que resultó tener alternativa de teclado — y el hueco real es el esquema ([A5-08]). ✅ Responsive con falsos positivos filtrados y el hallazgo del hitbox fantasma verificado. ✅ Coherencia visual cuantificada como insumo de PLAN_UNIFICACION ([A5-19..20]).
