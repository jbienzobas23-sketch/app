# PLAN_CALIFICACION — sistema de calificación (rama `beta`, commit `6a933ab`)

**Alcance.** Capa de calificación completa: media aritmética o ponderada en cascada (curso → unidades → ejercicios), nota por niveles en el interactivo (grados + cifrado), etiqueta tolerante en la nota del esquema, instrumentos de evaluación (lista de control, escala estimativa, rúbrica) reutilizables, nota directa, retirada de la pregunta «corta» de la autoría, comentarios de retroalimentación anclados y cuaderno del curso con exportación. Fases N0–N5, ejecutables por Claude Code una por sesión.

**Tesis de integración.** La calificación no es un módulo aparte: es **una sola aritmética a cinco alturas**. `ponderar()` — la media ponderada que ya existe como `aggregateParts` — se convierte en la única función de agregación y se aplica idéntica a: ítems → instrumento, niveles → ejercicio, partes/modelos → ejercicio, ejercicios → unidad, unidades → curso. En UI, **una sola pieza** (`PesoEditor`: filas con chip de peso + conmutador Equitativa/Personalizada + reparto en texto) aparece en todas esas alturas. Nada nuevo que aprender dos veces; la media aritmética es el caso particular «todos los pesos iguales», no un modo aparte.

**Relación con planes previos.**
- `PLAN_EVALUACION` (E0–E6, fuera del repo): E0 (política de corrección), E1 (cola de repaso), E2 (predicción/calibración) y E5 (agregados del profesor) siguen **vigentes e independientes** de este plan. E3 (instrumento manual), E4 (CSV) y E6 (matriz de criterios) quedan **absorbidos y sustituidos** por N3–N5 con la especificación de Jon del 2026-07-13, que es más completa.
- `PLAN_MAESTRO_2` §1 protege `attempts[]`, `points` por pregunta y `corta`. Este plan **conserva** los dos primeros (los usa como cimiento) y, por decisión explícita de Jon (2026-07-13), retira `corta` **solo de la autoría**: los datos y la corrección de las cortas existentes no se tocan (lector legado), que es lo que la protección salvaguardaba.

**Para la ejecución (Claude Code).** Las referencias `l. NN` son del commit ancla `6a933ab`: ante cualquier deriva manda el símbolo (función, campo), no la línea. La especificación visual es `mockups_calificacion.html` (regla de oro 5): commitear plan y mockup a `docs/` antes de la primera sesión para que cada sesión lea ambos. Orden: N0 en sesión propia — reimplementa `aggregateParts` bajo los tests existentes y es la red de todo lo demás. N4 admite partirse en dos sesiones (N4.1–N4.3 y N4.4) si el contexto aprieta.

## 0 · Punto de partida (verificado sobre `6a933ab`)

- **Jerarquía ya existe**: `fa_courses` (`Course.unitIds`) → `fa_units` (`Unit.exerciseIds`) → `fa_exercises`; resultados por alumno en `fa_results` (`ResultsMap`). Tipos permisivos con índice abierto (`types.ts`) — los sobres nuevos entran sin migración.
- **Notas**: almacenadas 0–100, mostradas 0–10 con coma (`nota10`, `scoring.ts`); entrada manual saneada en `NotaInput` + `parseNota10/sanitizeNota10` (`correccion/notaShared.ts`). Estados de resultado: `"auto" | "pendiente" | "corregido"` (`ExerciseResult.status`).
- **Cuestionario**: `calcQuestionnaireScore` pondera por `q.points` (defecto 1) solo test + corta; desarrollo queda fuera (se corrige a mano y hoy no entra en la nota). Tipos en uso: `"test" | "corta" | "desarrollo"` (`QuizCorrection.tsx` l. 68–80, `QuestionnaireView.tsx` l. 204–237, `QuestionManagerView.tsx` l. 234–247).
- **Interactivo**: `calcScore` (grados) es la nota; `interactiveFigureDiagnostics` (Jon, 2026-07-06) ya calcula el % de cifrado sobre los instantes con grado acertado, **sin tocar la nota** — exactamente el nivel que este plan promociona a calificable.
- **Esquema**: `calcSchemaPlacementScore` puntúa solo colocación; `schemaDiagnostics` ya separa colocación (`exacto/desplazado/falta`) y etiqueta (`etiquetaOk` con ranuras A↔Desarrollo vía `labelsMatchForLevel` + normalización de tildes/mayúsculas).
- **Multiparte**: `aggregateParts` pondera por `part.points`, hoy `@deprecated` en autoría (M0.6) — el agregador sigue vivo, solo falta reabrir la edición.
- **Libre**: no hay modo formal; «interactivo (libre)» = ejercicio sin clave (`keyReadyOf` false, `domain.ts` l. 244) → hoy `calcScore` devuelve null y el intento queda `pendiente` sin preliminar.
- **Editor**: asistente en 5 pasos (`PasoIdentidad/Audios/Categorias/Claves/Revision`); preguntas en `QuestionManagerView`. Tokens en `theme/tokens.ts` (`C`, `F`, `S`).

## 1 · Reglas de oro

Heredadas íntegras (rama por fase desde `beta`, un commit por tarea `feat|fix|refactor(nN): NN.x — …`, **cuatro puertas por commit**, nunca tocar `supabase/`, ninguna migración de esquema, lectores tolerantes, forward-only sin reescribir datos, nada solo por color, tests solo crecen, comentarios en español con el porqué). Específicas de este plan:

1. **Compatibilidad por defecto**: todo lector tolerante devuelve, en ausencia del sobre `evaluacion`, exactamente el comportamiento actual (media equitativa; interactivo = solo grados; esquema = solo colocación). Un ejercicio/curso antiguo no cambia de nota por instalar este plan.
2. **Nunca rescoring**: las notas guardadas no se recalculan. Las fórmulas nuevas aplican a entregas y correcciones nuevas.
3. **La preliminar nunca se pierde**: la nota automática del momento de la entrega queda congelada en el intento aunque el profesor la sustituya por instrumento o nota directa.
4. **Pesos = coeficientes libres** (positivos): `ponderar` normaliza; la UI muestra el reparto en % como texto. No se fuerza «suma 100».
5. **La UI autoexplica**: nada de texto didáctico, leyendas redundantes ni fórmulas en pantalla. La comprensión sale de la anatomía repetida (fila nombre · peso · nota en todas las alturas), de la jerarquía tipográfica y de ver cambiar los números al interactuar. Si un elemento necesita explicarse, se rediseña.

## 2 · Modelo de datos (sobres JSONB, cero migraciones)

```ts
// src/lib/calificacion.ts
export interface Instrumento {
  tipo: "lista" | "escala" | "rubrica";
  titulo?: string;
  niveles: { id: string; etiqueta: string; valor: number }[];  // valor 0..1; lista = [Sí:1, No:0]
  items:   { id: string; texto: string; peso: number;          // peso = coeficiente libre
             descriptores?: Record<string, string> }[];        // rúbrica: texto por (item, nivel)
}
export interface PesoConfig { modo: "equitativa" | "personalizada"; pesos?: Record<string, number>; }
```

- `Course.evaluacion?: PesoConfig` (sobre `unitIds`) y `Unit.evaluacion?: PesoConfig` (sobre `exerciseIds`) — en `fa_courses.data` / `fa_units.data`.
- `Exercise.evaluacion?: { niveles?: { grados?: number; cifrado?: number }; etiquetaCuenta?: boolean; equivalencias?: string[][]; modelos?: Record<string, number>; instrumento?: Instrumento }`. `Part.points` se reactiva tal cual (ya lo consume `aggregateParts`).
- `Question`: `points` ya existe; se añade `evaluacion?: { instrumento?: Instrumento }` (desarrollo).
- `ExerciseResult.calificacion?: { fuente: "auto" | "instrumento" | "directa"; preliminar?: number; niveles?: Record<string, number>; instrumento?: { respuestas: Record<string, string>; nota: number }; porPregunta?: Record<string, { fuente: string; nota: number; instrumento?: { respuestas: Record<string, string>; nota: number } }>; comentarios?: { id: string; ancla: { tipo: "general" | "pregunta" | "bloque" | "nivel" | "tramo"; ref?: string | { start: number; end: number } }; texto: string }[] }` — mismo sobre dentro de cada elemento de `attempts[]`. `status` sigue siendo la máquina de estados.
- **Plantillas de instrumento**: `UserProfile` (índice abierto, `fa_users.data`) gana `instrumentos?: Instrumento[]`. Al adjuntar, el instrumento se **copia inline** al ejercicio/pregunta (instantánea: editar la plantilla no reescribe ejercicios).

## 3 · Fases

### N0 · Núcleo aritmético (`src/lib/calificacion.ts` + Vitest; sin UI)

- **N0.1** `ponderar(entries: {nota: number|null, peso: number}[]): number|null` — misma semántica que `aggregateParts` (los null no cuentan en numerador ni denominador; redondeo entero 0–100). Reimplementar `aggregateParts` sobre `ponderar` sin cambiar su firma: una sola aritmética con los tests existentes como red.
- **N0.2** Lectores tolerantes: `pesosDeCurso(course, unitIds)`, `pesosDeUnidad(unit, exerciseIds)`, `nivelesDe(exercise)` (defecto `{grados: 1}`), `modelosDe(exercise)`, `etiquetaCuentaDe(exercise)` (defecto `false`), `equivalenciasDe(exercise)`, `instrumentoDe(exercise | question)`.
- **N0.3** `notaInstrumento(instr, respuestas): number|null` = `ponderar(items → valor(nivel elegido)·100, peso)`. Ítems sin responder = null (no penalizan hasta que se responden; el panel de corrección exige completarlos para «corregido»).
- **N0.4** Esquema: extraer de `schemaDiagnostics` el emparejador clave↔alumno a función común; `etiquetaEquivalente(a, b, equivalencias)` = `labelsMatchForLevel` ∪ grupos de equivalencia normalizados (mismo `normalizeLabel`); `calcSchemaScore(key, student, margin, {etiquetaCuenta, equivalencias})` = % de bloques con colocación dentro de margen ∧ (etiqueta equivalente si `etiquetaCuenta`). `calcSchemaPlacementScore` queda como lector legado (ejercicios sin sobre).
- **N0.5** `coberturaLibre(intervals, duration)` = % de la duración cubierto por marcas (preliminar del libre: mide compleción, no acierto — se etiqueta así en UI).
- **N0.6** `mediaDe(hijos): { nota: number|null; pendientes: number; total: number }` para unidad y curso. La nota vigente de un ejercicio es la que ya muestra la app (final si corregido, preliminar si auto); **excepción**: la cobertura del libre no entra en medias (no es logro) — el libre cuenta solo cuando tiene fuente docente.
- **Verifica**: equitativa ≡ aritmética; peso 0 excluye; nulls excluidos; instrumento en los 3 tipos; equivalencias con tildes/mayúsculas/ranuras («B» ≡ «Desarrollo» ≡ «desarrollo»); cobertura con solapes. Cuatro puertas.

### N1 · Ponderación estructural y medias (curso ↔ unidad)

- **N1.1** Primitivo `PesoEditor` (`primitives.tsx`): filas con chip de peso numérico editable + conmutador `Equitativa/Personalizada` + línea de reparto («33 % · 33 % · 33 %» en texto, nunca solo barra). Teclado completo; peso siempre visible como cifra.
- **N1.2** Detalle de curso (`courses.tsx`, rol teacher): `PesoEditor` sobre las unidades → `fa_courses.data.evaluacion`. Cabecera del curso: media (`nota10`) + estado «provisional · n pendientes» (texto + glifo ⏳) cuando `pendientes > 0`.
- **N1.3** Detalle de unidad: ídem sobre ejercicios; media de la unidad en su cabecera y en la tarjeta de unidad dentro del curso, junto a la cuenta de progreso existente (`UnitStats`).
- **N1.4** Alumno: mismas medias en lectura (sus resultados) en tarjetas de curso y unidad.
- **Verifica**: sin sobre `evaluacion` las medias coinciden con la aritmética simple; pantallas legacy no cambian salvo la media nueva; CVD.

### N2 · La nota del ejercicio: niveles, etiqueta, partes, modelos

- **N2.1** Interactivo con clave: `notaInteractivo = ponderar([grados: calcScore, cifrado: interactiveFigureDiagnostics().pct], nivelesDe)`; `submitAnswer` escribe `calificacion.niveles` y la preliminar. `InteractiveCorrection` promociona la fila de cifrado de diagnóstico a **fila de nota con peso** (cifra + «×0,30»); el alumno ve el mismo desglose.
- **N2.2** `PasoClaves`: sección «Calificación» visible cuando la categoría tiene `hasFigures` — pesos Grados/Cifrado (al activar cifrado se sugiere 70/30, editable; sin tocar nada, lector defecto `{grados: 1}` = comportamiento actual).
- **N2.3** Esquema: la entrega usa `calcSchemaScore`. `PasoClaves` (esquema): conmutador «La etiqueta cuenta en la nota (tolerante)» — **ON al crear ejercicio nuevo**, ausente=OFF en antiguos — y editor de equivalencias (grupos de sinónimos como chips: «Puente = Transición»). Corrección por bloque con `schemaDiagnostics`: `✓ exacto · ≈ etiqueta equivalente · △ desplazado · ✗ falta` (glifo + palabra).
- **N2.4** Partes: reabrir la edición de `part.points` (fila por parte en `PasoAudios`, chip de peso) y retirar el `@deprecated` de `types.ts` citando esta decisión (Jon, 2026-07-13, revierte M0.6). `aggregateParts` no cambia.
- **N2.5** Híbridos (varios modelos por parte) — combinador localizado en tres sitios: entrega en `useSubmitAnswer.ts` l. 130 (`aggregateParts(modelScores)` sin pesos, dentro del bucle `multi`; el agregado de partes con `partPoints` ya existe, l. 135) y corrección en `CorrectionView.tsx` l. 87 (`partAggregate`, comentario «sin pesos por modelo» en l. 78–79) y su recomputo gemelo l. 113. Sustituir los tres por `ponderar` con `modelosDe` (defecto iguales), construyendo pares (nota, peso) por modelo `m` dentro del bucle en lugar de filtrar los null antes de agregar; pesos por modelo en la misma sección «Calificación» de `PasoClaves`.
- **Verifica**: ejercicios existentes puntúan idéntico; nuevo con cifrado 70/30 y esquema con etiqueta dan la nota esperada en tests; ningún resultado guardado reescrito.

### N3 · Instrumentos y retirada de «corta»

- **N3.1** `InstrumentoEditor` (componente único, tres presentaciones): selector `Lista de control / Escala estimativa / Rúbrica`; ítems con texto + peso; niveles con etiqueta + valor (lista fija Sí=1/No=0; escala N niveles editables; rúbrica = escala + descriptor por celda). Vista previa de nota en vivo con respuestas de ejemplo.
- **N3.2** Plantillas del profesor (`fa_users.data.instrumentos`): guardar, duplicar, adjuntar desde biblioteca.
- **N3.3** Adjuntar instrumento a: pregunta de desarrollo (`QuestionManagerView`), ejercicio interactivo libre y esquema (`PasoClaves`). Siempre copia inline (instantánea).
- **N3.4** Retirar «corta» de la autoría: el selector de tipo en `QuestionManagerView` ofrece solo `Test | Desarrollo`. Las cortas existentes se muestran y autocorrigen exactamente igual (`gradeShort`, `QuizCorrection` l. 70 intactos — lector legado). Comentario en código citando la decisión frente a la protección de `PLAN_MAESTRO_2` §1.
- **Verifica**: los tres tipos calculan bien (`notaInstrumento`); imposible crear cortas nuevas; las legadas intactas en sesión y corrección.

### N4 · Corrección: fuente de la nota, desarrollo en la media, comentarios anclados

- **N4.1** Selector de **fuente** en `CorrectionView` por unidad calificable (ejercicio simple o pregunta de desarrollo): `Automática (preliminar) / Instrumento / Nota directa`. La preliminar queda siempre visible como referencia (regla de oro 3); directa usa `NotaInput`; instrumento despliega el panel (una opción por nivel e ítem, nota en vivo).
- **N4.2** Nota final del cuestionario: `calcQuestionnaireFinal(questions, answers, notasManuales)` — un solo pool ponderado por `points` con test + corta legada (auto) + desarrollo (manual). `calcQuestionnaireScore` actual queda como **preliminar**. `status = "corregido"` cuando ningún desarrollo queda sin nota; mientras, `pendiente` con preliminar visible.
- **N4.3** Libre: preliminar = `coberturaLibre`, etiquetada literalmente «cobertura (no mide acierto)» en corrección y en la vista del alumno; la fuente docente (instrumento/directa) cierra el intento.
- **N4.4** Comentarios de retroalimentación: general + anclados a pregunta (`q.id`), bloque (`block.id`) o tramo (`{start, end}` con salto de audio reutilizando el bucle de fragmento existente en corrección). El alumno los ve junto al elemento con glifo `›` + rótulo «Comentario». Localizado: `TeacherCorrection` (`correccion/shared.ts` l. 11–23) ya transporta `globalComment`, `questionComments`, `blockComments` y `levelComments`, y `QuizCorrection` ya pinta un textarea por pregunta (`comentarioBloque`, l. 130). N4.4 no crea el sistema: añade el ancla `tramo` (salto de audio) y un lector que funde los cuatro campos legados en `comentarios[]` (globalComment → `general`, questionComments → `pregunta`, blockComments → `bloque`, levelComments → `nivel`); los campos antiguos se conservan tal cual (forward-only) y las escrituras nuevas van solo a `comentarios[]`.
- **Verifica**: nota final correcta en los cuatro modelos con fuentes mezcladas; comentarios visibles y anclados para el alumno; la preliminar nunca desaparece.

### N5 · Cuaderno del curso y exportación

- **N5.1** Pestaña «Calificaciones» en el detalle de curso del profesor: tabla alumnos × unidades, expandible a ejercicios; celda = `nota10` + glifo de estado (`● corregido · ◐ auto · ○ pendiente`, con leyenda textual) + `▾` cuando < 5 (convención del cuaderno de pestañas); fila y columna de medias vía `ponderar` (idénticas a las cabeceras de N1 por construcción: misma función, mismos lectores).
- **N5.2** Exportar CSV con `;` y BOM (Excel es-ES), medias incluidas, estados como texto.
- **N5.3** Rendimiento: `useMemo` por (resultados, pesos), como `UnitStats`; nada recalcula por render.
- **Verifica**: medias del cuaderno == cabeceras; CSV abre bien en Excel es-ES; CVD en tabla completa.

## 4 · Decisiones abiertas (no bloquean N0–N2)

- **D1 — Fuente mixta**: ¿permitir «auto 60 % + instrumento 40 %» como fuente combinada? v1 la omite (la fuente sustituye, la preliminar queda de referencia); si hace falta, es un caso más de `ponderar` sobre dos fuentes.
- **D2 — Intento que puntúa**: hoy las medias usan la nota vigente del sobre de intentos. ¿Configurar «mejor/último intento» por curso? Fuera de v1.
- **D3 — Equivalencias**: v1 por ejercicio (+ duplicar ejercicio las arrastra). ¿Diccionario global del profesor en su perfil? Trivial de añadir después (mismo lector, otra procedencia).
