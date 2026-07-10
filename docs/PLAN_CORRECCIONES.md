# PLAN_CORRECCIONES — Funciones Armónicas

**Derivado de:** análisis integral A0–A9 (`analisis/`, INFORME_ANALISIS.md), commit base `f263089a1ef0e70f2fb2902839e891cca6afe52a`, rama `beta`.
**Ejecutor previsto:** Claude Code (Sonnet) en `C:\Users\bienz\app`.
**Alcance:** 0 críticas · 15 altas · medias seleccionadas. Fases C0–C4 (obligatorias, en orden) + C5 (segunda ola, a demanda).
**Fidelidad:** las fases C1–C4 reproducen los lotes 1–4 del INFORME_ANALISIS §4. Las tareas añadidas respecto al informe están marcadas `(+)` con su justificación.

---

## 0. Contrato de ejecución (leer antes de tocar nada)

- **R1 — Cuatro puertas por commit.** Antes de cada commit: `npm run lint` && `npm run typecheck` && `npm run test` && `npm run build`, los cuatro con exit code 0. Si cualquiera falla, no se commitea.
- **R2 — Una tarea = un commit.** Mensaje en el formato del repo: `tipo(ámbito): descripción en minúsculas` (tipos: fix, refactor, perf, test, docs, a11y). No mezclar tareas en un commit.
- **R3 — Forward-only, sin migraciones.** Prohibido crear/aplicar migraciones SQL o ALTER. Toda tolerancia a datos históricos vive en los lectores del cliente (convención del proyecto, verificada en A3 §5).
- **R4 — CVD, restricción dura.** Ninguna información puede transmitirse solo por color. Todo indicador nuevo o modificado lleva canal redundante: glifo, forma, texto o número. Esto aplica también a soluciones improvisadas durante cualquier tarea.
- **R5 — Respetar la sección «NO TOCAR» (§1).** Ante la duda de si un cambio colateral la viola, no hacerlo y anotarlo en el log.
- **R6 — Tareas `[BLOQUEADA: Dx]` no se ejecutan** sin instrucción explícita de Jon en el prompt de la sesión. Las decisiones D1–D12 están en §2.
- **R7 — `[MANUAL]`** = verificación en navegador/producción que hace Jon. Claude Code implementa, deja las puertas verdes y lista en el log qué debe probar Jon exactamente.
- **R8 — Rollback disciplinado.** Si tras un cambio una puerta falla y no se resuelve en ≤2 intentos dirigidos (no a ciegas), `git restore`/`git reset` al estado previo, anotar la incidencia en el log y pasar a la siguiente tarea.
- **R9 — Test rojo primero** donde la tarea lo indique (bugs de datos: C1.1, C3.4, C3.5). Verificar que el test falla con el código actual antes de aplicar el fix.
- **R10 — No tocar `package.json` ni `package-lock.json`** salvo tarea que lo diga explícitamente. Cobertura: instalar `@vitest/coverage-v8` con `npm install --no-save` (patrón de A4) y borrar artefactos (`coverage/`) al terminar.
- **R11 — Los números de línea citados corresponden a `f263089`** y se desplazan conforme avanzan los commits. Localizar SIEMPRE por patrón de contenido (grep del fragmento citado), nunca editar por número de línea a ciegas. Si el patrón no aparece, detenerse y anotar en el log (el código pudo cambiar desde el análisis).
- **R12 — No hacer `git push`** en ningún caso. El push (incluidos los 3 commits previos al análisis y `analisis/`) es decisión D1 de Jon.
- **R13 — Log obligatorio.** Mantener `docs/CORRECCIONES_LOG.md`: por tarea, hash del commit, resultado de puertas, incidencias, verificaciones manuales pendientes. Se actualiza en el mismo commit de la tarea o en commits `docs(log)`.
- **R14 — Inicio de sesión.** Cada sesión de Claude Code: (1) leer este plan y el log; (2) `git branch --show-current` = beta y `git status` limpio; (3) ejecutar las cuatro puertas como línea base — si alguna está roja ANTES de empezar, detenerse y avisar.

---

## 1. NO TOCAR

Trabajo bueno verificado en A6/A7 §2 y decisiones de diseño documentadas. No deshacer ni "mejorar" de paso:

1. **Throttle 10 fps de `time` + refs a 60 fps** en `useAudioPlayer` (ts:45-55,198) y todo el patrón rAF-sobre-refs de `session.tsx` (`AudioScrubber`, `WaveformDisplay`, `FunctionButtons`, drag como ref en `RepeatBand`/`FragmentRangeSelector`).
2. **Memos existentes y sus comparadores** (`WaveformDisplay`, `FunctionButtons`, listas de dashboards, `partsOf`/`partToExercise` memoizados en SessionShell).
3. **`fontSize:16` de `modals.tsx`** (11 usos) e inputs del esquema: intencional, evita el zoom-on-focus de iOS (A5-20). No "unificar" a la escala.
4. **No extraer `SchemaTimeline` como componente separado** ni tocar el motor de drag `:526-874` más allá de lo que especifica C4.3g. El acoplamiento vía `dragRef`/`trackSegRefs` es decisión documentada en la cabecera del fichero (A9-02: la subdivisión va por hooks/subcomponentes, no por ese corte).
5. **No actualizar dependencias** (los 15 paquetes de `npm outdated` y las 3 vulns de `npm audit` son build/test-only, A8-05; ventana de mantenimiento aparte, fuera de este plan).
6. **Cleanup de audio existente:** `ctx.close()` en las 3 vías, `cancelled`, `sourceIdRef`, `pendingToggleRef`, ausencia de autoplay al seleccionar pregunta (eliminado a propósito el 2026-07-06).
7. **Lectores tolerantes de `domain.ts`** — se les puede AÑADIR tolerancia (C3.4) pero nunca quitarla ni introducir migración a cambio.
8. **Respuesta genérica anti-enumeración** de `request-pin-reset` y el 401 genérico + retardo constante de `login`.
9. **Harnesses `preview-*` y `vite.harness.config.js`** sin trackear: patrón establecido, no añadirlos a git ni borrarlos.
10. **`vite.config.js` y configs**: no tocar (el visualizer de A7 se usó efímero precisamente para no ensuciarlos).

---

## 2. Decisiones pendientes de Jon (bloquean tareas, no el resto del plan)

| ID | Decisión | Bloquea | Estado |
|---|---|---|---|
| D1 | ¿Push de los 3 commits previos + `analisis/` + estos commits a `origin/beta`? (A0-01) | push final | pendiente |
| D2 | ¿Desplegar `request-pin-reset` y `reset-pin` a PROD? (probadas en staging) | C1.4, C5 (A8-03) | pendiente |
| D3 | Las 7 cuentas sin `auth_uid`: ¿primer login de cada usuario o script de servidor? (A3-03) | C1.5 | pendiente |
| D4 | El descenso de contenido en prod (17→3 ejercicios, 5→2 resultados entre el 1 y el 10 de julio): ¿fue limpieza deliberada? **Si NO lo fue, investigar antes de ejecutar nada.** | arranque del plan | pendiente |
| D5 | ¿Conservas copias de PLAN_EVALUACION, PLAN_UNIFICACION, plan_placas_hibridas, plan_obra? (A9-01) | reconstrucción de planes (fuera de este plan) | pendiente |
| D6 | Nota del interactivo multi-categoría: ¿promedia categorías o mantiene "la de la pestaña activa"? (A4-02) | C5-T12 | pendiente |
| D7 | ¿Los bloques sobrantes del esquema penalizan la nota de colocación? (A4-03) | C5-T13 | pendiente |
| D8 | ¿Se puede publicar sin clave? Opciones: (a) bloquear visibilidad sin clave; (b) `resultStatusOf` trata "sin clave" como "pendiente" (A4-04) | C3.7 | pendiente |
| D9 | Libro vs audio (A5-04), alternativa no cromática (emoji vetado). Propuestas: (a) texto «N piezas» bajo el título; (b) doble borde/marco; (c) icono SVG de forma (pila/lista), coherente con TypePlate | C2.7 | pendiente |
| D10 | ¿Ejecutar M7 (tope 3 modelos)? Opt-in de PLAN_MAESTRO_2 | fuera de este plan | pendiente |
| D11 | ¿Borrar la Edge Function `claude-proxy` (v6, sin llamantes)? (A3-11) | C5-T20 | pendiente |
| D12 | Enfoque del proyecto Esquema: confirmar la vía del informe (trocear por hooks/subcomponentes SIN extraer SchemaTimeline, integrando drag-por-refs, memoización y teclado) (A9-02) | C4.3 en adelante | pendiente (default = propuesta del informe) |

Claude Code puede ejecutar C0–C3 completos (salvo C1.4, C1.5, C2.7, C3.7) sin ninguna decisión resuelta, siempre que D4 esté confirmada como limpieza deliberada.

---

## 3. Fase C0 — Preparación

### C0.1 — Línea base de la sesión
Confirmar rama `beta`, `git status` limpio, HEAD anotado en el log. Ejecutar las cuatro puertas y registrar el resultado (esperado: lint 0, typecheck 0, 196/196, build OK). Registrar el tamaño de `dist/assets/index-*.js` (línea base A7: 284,20 kB) — se usa como referencia en C1.6/C1.7.

### C0.2 — Versionar la documentación superviviente (A9-01, parcial)
**Ficheros:** crear `docs/`; copiar desde `C:\Users\bienz\Downloads\` → `docs/AUDITORIA.md` y `docs/PLAN_ANALISIS.md` (si existen; si no, anotar en el log). Copiar este plan a `docs/PLAN_CORRECCIONES.md`. Crear `docs/CORRECCIONES_LOG.md` con cabecera (fecha, HEAD de partida, tabla de tareas).
**Commit:** `docs(gobernanza): versiona AUDITORIA, PLAN_ANALISIS y PLAN_CORRECCIONES en docs/ (A9-01)`

---

## 4. Fase C1 — Quick wins funcionales

### C1.1 — Cifrado: conservar `fig` en la serialización de entregas y claves · [A2-01 alta, A4-05 media] · esfuerzo mínimo
**Ficheros:** `src/lib/domain.ts` (nuevo helper), `src/lib/domain.test.js` (o test vecino), `src/components/ExerciseView.tsx`, `src/components/SessionShell.tsx`.
**Contexto:** ambos submits serializan `ivs.map(({fn,start,end}) => ({fn,start,end}))` — `ExerciseView.tsx:286` (buscar ese patrón dentro de `handleSubmit`) y `SessionShell.tsx:65` (dentro de `draftToPayload`) — descartando `fig` (cifrado/inversión) que la vista sí captura (`commitInterval`, ExerciseView:147-149) y la corrección sí evalúa (`interactiveFigureDiagnostics`, scoring.ts:209-246). Resultado: claves grabadas sin `fig` (diagnóstico siempre `null`) y respuestas de alumno que pierden el suyo (todo instante evaluable cuenta fallo).
**Pasos:**
1. **Test rojo primero.** Nueva función pura en `domain.ts`:
   ```ts
   export function serializeIntervals(ivs) {
     return ivs.map(({ fn, start, end, fig }) =>
       fig !== undefined ? { fn, start, end, fig } : { fn, start, end });
   }
   ```
   Tests (mismo patrón que los vecinos `*.test.js`): (a) conserva `fig` cuando existe; (b) omite la clave `fig` cuando no existe (compatibilidad JSONB: sin `fig: undefined` explícito); (c) integración de pipeline: construir clave con `fig` + marcas de alumno con `fig`, pasar ambas por `serializeIntervals` y verificar que `interactiveFigureDiagnostics(clave, marcas, duración)` devuelve `evaluable > 0` (hoy, sin el helper, replicar la serialización actual en el test y comprobar que devuelve el comportamiento roto — el test debe demostrar el bug antes del fix).
2. Sustituir los dos `map` inline por `serializeIntervals(ivs)` en `ExerciseView.tsx` y `SessionShell.tsx` (import desde domain). No tocar nada más de esos ficheros.
**Aceptación:** test (c) pasa; los intervalos sin `fig` siguen produciendo objetos idénticos a los actuales (sin regresión de forma); cuatro puertas verdes.
**Commit:** `fix(interactivo): conserva fig al serializar entregas y claves (A2-01)`

### C1.2 — «Salir» cierra la sesión de Supabase · [A3-02 alta / A8-02] · esfuerzo mínimo
**Ficheros:** `src/App.tsx`.
**Contexto:** `onLogout` (`App.tsx:419`, buscar `setUser(null)` + `navigate("/")`) y el logout de TeacherPicker (`App.tsx:317`) no llaman a `signOut`; el token queda en localStorage y el siguiente arranque en el mismo equipo carga datos autenticado como el usuario anterior (aulas compartidas). `authClient.logout()` ya existe.
**Pasos:** en ambos puntos, llamar `logout()` (de `auth/authClient`) antes de `setUser(null)` (await con catch silencioso: un fallo de red no debe impedir salir de la UI). Si C3.2 ya está hecha, limpiar también el perfil rehidratable.
**Nota conocida (aceptable, no "arreglar"):** tras signOut, LoginView recibe `users` vacío y `credLabel` degrada al genérico «Contraseña / PIN» (documentado en A3-02).
**Aceptación:** puertas verdes. **[MANUAL]** Jon: entrar, salir, recargar → debe aparecer login, no datos del usuario anterior; `localStorage` sin token `sb-*`.
**Commit:** `fix(auth): salir cierra la sesión de Supabase (A3-02)`

### C1.3 — `requestPinReset` deja de mentir ante un servicio caído · [A3-01 alta, parte de cliente] · esfuerzo bajo
**Ficheros:** `src/auth/authClient.ts`, vista ForgotPin (`auth.tsx`).
**Contexto:** `requestPinReset` (`authClient.ts:116-126`) ignora `res.ok` y devuelve `true` siempre → con la Edge Function sin desplegar (404), el alumno ve «Correo enviado».
**Pasos:** comprobar `res.ok`. Con `res.ok` → mantener la respuesta genérica actual (anti-enumeración, NO TOCAR §1.8). Con 404/5xx/red → devolver fallo distinguible y que ForgotPinView muestre «El servicio de recuperación no está disponible ahora mismo» (ErrorMsg existente). No distinguir "usuario existe/no existe" en ningún caso.
**Aceptación:** puertas verdes; grep confirma que la rama 200 no cambió de mensaje.
**Commit:** `fix(auth): requestPinReset distingue servicio caído del envío genérico (A3-01)`

### C1.4 — Desplegar `request-pin-reset` y `reset-pin` a PROD · [A3-01 alta] · `[BLOQUEADA: D2]`
Con OK de Jon: desplegar ambas funciones (CLI `supabase functions deploy` o MCP `deploy_edge_function`) al proyecto `vxmfwxpjmivionvxwsye`. Verificar con `list_edge_functions` que ambas figuran ACTIVE. **[MANUAL]** Jon: flujo completo «He olvidado mi PIN» → correo → magic link → ResetPinView con un alumno de prueba con `recovery_email`.
**Sin commit de código** (las funciones ya están en el repo); anotar el despliegue en el log.

### C1.5 — Enlazar las 7 cuentas sin `auth_uid` · [A3-03 alta] · `[BLOQUEADA: D3]`
Opción (a): Jon pide a esos usuarios un primer login (el Edge `login` auto-repara el enlace). Opción (b): script de servidor con `service_role` que cree/enlace sus usuarios Auth de una vez — requiere OK explícito y se ejecuta fuera del repo (dashboard SQL o Edge temporal que se borra después). Verificación: `SELECT count(*) FROM fa_user_secrets WHERE auth_uid IS NOT NULL` = 9.

### C1.6 — `RecoveryEmailModal` a fichero propio: −52 kB del chunk inicial · [A7-04 media] · esfuerzo mínimo
**Ficheros:** nuevo `src/components/RecoveryEmailModal.tsx`, `src/components/modals.tsx`, `src/App.tsx`.
**Contexto:** `App.tsx:33` importa solo `RecoveryEmailModal` de `modals.tsx` (54,1 kB rendered) y eso arrastra el fichero entero al chunk inicial; el resto de importadores de modals (teacher, editor, QuestionManagerView) ya viven en chunks lazy (A7 §1).
**Pasos:** mover el componente completo (con sus imports: ModalShell/primitives, etc.) a fichero propio; App importa del nuevo fichero; eliminar el export de `modals.tsx`. Verificar antes con grep que ningún otro fichero importa `RecoveryEmailModal` desde modals.
**Aceptación:** `grep "components/modals" src/App.tsx` → 0; `npm run build` y `dist/assets/index-*.js` baja ≥40 kB respecto a la línea base de C0.1 (esperado ~232 kB); puertas verdes.
**Commit:** `perf(bundle): RecoveryEmailModal a fichero propio; modals sale del chunk inicial (A7-04)`

### C1.7 — `localSeed` fuera del bundle de producción · [A7-07 baja / A2-26] · esfuerzo mínimo
**Ficheros:** `src/hooks/useAppData.ts` (import en `:18`, usos en ternarios `:32-38`).
**Contexto:** los datos solo-dev de `localSeed.ts` (9,9 kB) viajan a producción porque el gate `localMode` es runtime.
**Pasos:** gatear todas las referencias con `import.meta.env.DEV` de forma estáticamente eliminable, p. ej. un ternario a nivel de módulo `const LOCAL_SEED = import.meta.env.DEV ? localSeedData : null` y que los ternarios existentes consuman `LOCAL_SEED`. Si el tree-shaking no poda el módulo (verificar), pasar a `import()` dinámico dentro de la rama DEV.
**Aceptación:** elegir un literal único de `localSeed.ts` (p. ej. un título de ejercicio semilla) y `grep -c "<literal>" dist/assets/*.js` → 0 tras build; typecheck/tests verdes (el modo `?local` en dev debe seguir compilando; prueba en navegador dev opcional **[MANUAL]**).
**Commit:** `perf(bundle): localSeed excluido de producción (A7-07)`

### C1.8 — Romper el ciclo `ExerciseItem ↔ courses` · [A1-04 alta] · esfuerzo bajo
**Ficheros:** nuevo `src/components/KebabMenu.tsx`, `src/components/courses.tsx` (definición en `:302`), `src/components/ExerciseItem.tsx` (import en `:16`), `src/components/teacher.tsx` (import en `:18`).
**Contexto:** `KebabMenu` (envoltorio del primitivo `Menu` de primitives) vive en `courses.tsx`, y `courses` importa `ExerciseItem`, que importa `KebabMenu` → ciclo. **Destino: fichero propio, NO `primitives.tsx`** (veredicto del informe final §3; contradice la sugerencia inicial de A2 §4.3 — prevalece el informe).
**Pasos:** mover `KebabMenu` sin cambiar comportamiento; actualizar los 3 importadores.
**Aceptación:** `npx madge --extensions ts,tsx --circular src/` → 0 ciclos; puertas verdes.
**Commit:** `refactor(imports): KebabMenu a fichero propio; elimina el ciclo ExerciseItem-courses (A1-04)`

### C1.9 (+) — `key` en los montajes de EditorShell · [A2-05 media] · esfuerzo mínimo
**Justificación de inclusión:** riesgo de pérdida de datos (guardar el ejercicio A sobre el B) con fix de una línea — mismo espíritu que el lote 1 del informe.
**Ficheros:** `src/components/teacher.tsx` (montajes de EditorShell en `:1080-1118`).
**Contexto:** el formulario del editor es snapshot-al-montar (~18 useState sin resincronizar); sin `key`, una transición detalle→detalle reutiliza la instancia.
**Pasos:** `key={String(<idSeleccionado> ?? "new")}` en ambos montajes (ajustar al nombre real de la variable).
**Aceptación:** puertas verdes.
**Commit:** `fix(editor): remonta EditorShell por ejercicio (A2-05)`

---

## 5. Fase C2 — CVD y accesibilidad

**Bloque A = lote 2 del informe. Regla transversal R4 en todo el bloque.**

### C2.1 — Veredicto de respuesta corta con glifo y palabra visibles · [A5-01 alta]
**Ficheros:** `src/components/correccion/QuizCorrection.tsx`.
**Contexto:** el veredicto vive solo en `borderLeft: 3px solid ${v.color}` (verde/rojo) en `:346-352` (vista profesor) y `:565-571` (vista alumno); la palabra solo existe en `title={v.word}` (`:299`). Las preguntas test SÍ llevan ✓/✗ (`:331-336`) — ese es el patrón a replicar.
**Pasos:** añadir glifo ✓/✗ + la palabra del veredicto (`v.word`) visible junto a la respuesta corta, en ambas vistas, manteniendo el borde de color como refuerzo.
**Aceptación:** con los colores neutralizados mentalmente, el veredicto se lee por glifo+texto; puertas verdes.
**Commit:** `a11y(correccion): veredicto de respuesta corta con glifo y texto, no solo color (A5-01)`

### C2.2 — Minimapa del cuestionario: respondida ≠ pendiente sin depender del tono · [A5-05 alta]
**Ficheros:** `src/components/QuestionMinimap.tsx` (`:125`), `src/components/QuestionnaireView.tsx` (`:163`).
**Contexto:** `fill: answers[q.id]!==undefined ? C.fnT : C.quiz` — el label (número) no cambia entre estados.
**Pasos:** añadir ✓ (junto al número o superpuesta) o cambio de forma (relleno vs contorno + ✓) en el bloque respondido. Mantener el color.
**Commit:** `a11y(cuestionario): glifo de respondida en el minimapa (A5-05)`

### C2.3 — Opción correcta del editor de preguntas con ✓ · [A5-06 media]
**Ficheros:** `src/components/modals.tsx` (`:903-914`, QuestionEditor).
**Pasos:** ✓ visible junto a la opción marcada como correcta (además del relleno).
**Commit:** `a11y(editor): marca visible de opción correcta en el editor de preguntas (A5-06)`

### C2.4 — Nombres accesibles en botones de icono · [A5-12 baja]
**Ficheros/puntos:** `SchemaExerciseView.tsx:1257-1259` y `QuestionManagerView.tsx:191-192` (play/pausa sin title ni aria-label → `aria-label` dinámico «Reproducir»/«Pausar»); casos solo-title → añadir `aria-label` espejo: `ExerciseView.tsx:442,520,529`, `schema/RepeatBand.tsx:248`, `SchemaExerciseView.tsx:1752,1777`.
**Commit:** `a11y(botones): aria-label en play/pausa y botones de icono solo-title (A5-12)`

### C2.5 — Remates touch y safe-area · [A5-18 baja]
**Puntos:** `App.tsx:64` SaveErrorToast → `bottom: calc(<valor actual> + env(safe-area-inset-bottom))`; `session.tsx:255` (barra de seek) y `QuestionMinimap.tsx:91-92` (rama de navegación) → `touchAction:"none"`; `EditorShell.tsx:181` tabs → `WebkitOverflowScrolling:"touch"`.
**Commit:** `fix(móvil): safe-area en el toast y touchAction en seek/minimapa (A5-18)`

### C2.6 — Etiqueta mínima garantizada en marcas y bloques estrechos · [A5-02, A5-03 altas] · **[MANUAL al cierre]**
**Ficheros/puntos:** `correccion/InteractiveCorrection.tsx:85` (etiqueta solo si el intervalo >5% de la duración), `session.tsx:601` (solo si >14px), `SchemaExerciseView.tsx:1122` y `correccion/SchemaCorrection.tsx:141` (`fontSize: wPct<3.5 ? 0 : …`).
**Contexto:** los intervalos cortos — frecuentes en análisis armónico — quedan identificados solo por el tono de la categoría/paleta.
**Pasos (criterio conservador del informe):** garantizar SIEMPRE ≥1 carácter visible (inicial de `iv.fn` / primera letra de `block.label`), eliminando el `fontSize:0`; `title` con la etiqueta completa en todos los casos; permitir `overflow` visible o rotación si hace falta que el carácter quepa. No cambiar colores ni layout general.
**Aceptación:** puertas verdes. **[MANUAL]** Jon valida visualmente con un ejercicio real de marcas densas; si el resultado molesta, se itera con su criterio (alternativas del informe: etiqueta rotada o tooltip persistente).
**Commit:** `a11y(cvd): etiqueta mínima de un carácter en marcas y bloques estrechos (A5-02, A5-03)`

### C2.7 — Libro vs audio suelto con canal no cromático · [A5-04 alta] · `[BLOQUEADA: D9]`
**Ficheros:** `src/components/teacher.tsx` (`:547-553`, BookCard — comentario literal «el azul de la tarjeta YA distingue un libro…»).
Implementar la alternativa que Jon elija en D9 (propuestas en §2). Emoji vetado.
**Commit:** `a11y(audioteca): distinción libro/audio por <alternativa elegida> (A5-04)`

**Bloque B (+) — extensión de accesibilidad (medias del análisis fuera de los lotes explícitos del informe; ejecutar tras el bloque A o cuando Jon lo pida):**

### C2.8 — Accionables en div con teclado · [A5-10 media]
`rowButtonProps` (ya existe en `lib/a11y.ts`, usado en 6+ sitios) en: `QuestionnaireView.tsx:190-191` (cabecera de pregunta — vía principal de selección del alumno), `SchemaCorrection.tsx:124,134,140` (comentar bloque), `primitives.tsx:543` (× de etiqueta, añadir además aria-label), `QuestionMinimap.tsx:109` (modo lectura).
**Commit:** `a11y(teclado): rowButtonProps en accionables div (A5-10)`

### C2.9 — `FieldLabel` con `htmlFor` · [A5-11 media]
`primitives.tsx:1104-1105`: `FieldLabel` acepta `htmlFor`; `TextInput` genera/acepta `id`. Aplicar en los formularios de login y del editor (alcance acotado; el barrido completo de la app queda para PLAN_UNIFICACION). Incluir `session.tsx:310` (campos Inicio/Fin).
**Commit:** `a11y(formularios): asociación label-input en login y editor (A5-11)`

### C2.10 — Hitboxes táctiles ≥40px · [A5-16 media]
Puntos: asa de intervalo dibujada a 6px (`SCHEMA_HND_VISUAL_W`, `session.tsx:661`) — **crear la constante de hitbox real** (la `SCHEMA_HND_W` que cita el comentario de `lib/schema.ts:28` NO existe, verificado) como zona transparente ≥40px que no cambia el dibujo; handles de fragmento 12px (`session.tsx:181`); `ClaveCell` ~22px (`PasoClaves.tsx:36`); × de modales ~24px (`modals.tsx:106,544`); asa de repetición height 14 (`SchemaExerciseView.tsx:1699`). Técnica: padding/pseudo-elemento/área invisible, dibujo intacto.
**Commit:** `fix(táctil): hitboxes de 40px en asas, handles y cierres (A5-16)`

### C2.11 — Grids que desbordan en 375px · [A5-17 baja]
`SchemaCorrection.tsx:332,352`: `minmax(340px,1fr)` → `minmax(min(340px,100%),1fr)`.
**Commit:** `fix(móvil): paneles de comentarios sin desbordar en 375px (A5-17)`

### C2.12 — Scrubber operable por teclado · [A5-09 media]
`session.tsx:782-840` (`AudioScrubber`): `role="slider"`, `tabIndex=0`, `aria-valuemin/max/now` (+ `aria-valuetext` con tiempo formateado), flechas ←→ (paso 1s; Shift 5s), Home/End. Sirve a las 4 vistas que lo usan. No tocar el mecanismo rAF de pintado (NO TOCAR §1.1).
**Commit:** `a11y(audio): AudioScrubber como slider con teclado (A5-09)`

### C2.13 — Vacíos y feedback que faltan · [A5-15 baja]
Curso sin unidades → mensaje (courses.tsx, junto a los vacíos existentes `:177,:463`); ExerciseView sin audio → aviso en vez de reproducir en silencio; editor → indicador «Guardando…» junto al punto de sucio (`EditorShell.tsx:134,220`).
**Commit:** `fix(ux): vacío de curso sin unidades, aviso sin-audio y estado guardando (A5-15)`

---

## 6. Fase C3 — Robustez de datos y sesión

### C3.1 — El error de carga se ve · [A3-04 media + A5-14 media]
**Ficheros:** `src/hooks/useAppData.ts` (`loadData` `:71-109`, `bootstrap` `:115-138`), `src/App.tsx`.
**Contexto:** cada tabla ignora su `error` en silencio y quedan las semillas (ids 2/3/4) enmascarando un Supabase caído; `bootstrap` hace `console.error` y `dbReady=true` igualmente.
**Pasos:**
1. `loadData` acumula errores por tabla y expone `loadError: string | null` + `retryLoad()` desde `useAppData`.
2. App: banner persistente `role="alert"` (visualmente distinto del SaveErrorToast) con botón «Reintentar» cuando `loadError && !localMode`. Texto propuesto: «No se pudieron cargar los datos del servidor. Lo que ves puede estar incompleto.»
3. Las semillas no deben confundirse con datos reales: si hubo error de carga, el banner queda visible mientras persista (no autoocultar).
**Aceptación:** puertas verdes; test opcional del estado si el hook es testeable sin red (mock del cliente como en tests existentes de db). **[MANUAL]** Jon: cortar red / URL de Supabase inválida en dev → banner visible, reintentar funciona.
**Commit:** `fix(datos): error de carga visible con reintento; las semillas no enmascaran (A3-04)`

### C3.2 — Rehidratación de sesión + `onAuthStateChange` · [A3-05 media + A2-06 media]
**Ficheros:** `src/App.tsx`, `src/hooks/useAppData.ts` (bootstrap `:115-138`), `src/auth/authClient.ts`.
**Contexto:** la sesión de UI es solo memoria; al recargar, el token Supabase válido persiste en localStorage pero la app vuelve al login (y la "carga anónima" del arranque en realidad corre autenticada con ese token). No hay ningún `onAuthStateChange` en `src/` (grep = 0): la expiración se descubre por un toast de guardado a los 13s.
**Diseño propuesto (validar contra el código antes de implementar; si se encuentra una vía más simple, documentarla en el log):**
1. En `completeLogin`, persistir perfil mínimo `{id, role}` en localStorage (`fa_session_user`).
2. En `bootstrap`: si `getSession()` devuelve sesión válida cuyo email termina en `@fa.local` Y existe `fa_session_user` → tras `loadData` (que ya corre autenticado), verificar que `users` cargados contienen ese `id` con ese `role` (verificación contra datos reales servidos por RLS, nunca confianza ciega en localStorage) → `setUser` con el perfil real cargado. Si no casa, limpiar `fa_session_user` y seguir al login. Las sesiones de recuperación (email real) mantienen su flujo actual intacto.
3. Suscribirse a `onAuthStateChange`: `SIGNED_OUT` → `setUser(null)` + navegar a `/` + limpiar `fa_session_user`; `TOKEN_REFRESHED` → nada. Desuscribir en cleanup.
4. `logout()` (y C1.2) limpia `fa_session_user`.
**Nota:** la fuente de verdad de permisos sigue siendo RLS; el perfil local solo restaura la UI.
**Aceptación:** puertas verdes. **[MANUAL]** Jon: login → recargar → sigue dentro; salir → recargar → login; segunda pestaña + salir en la primera → la segunda reacciona al SIGNED_OUT.
**Commit:** `fix(auth): rehidrata la sesión al recargar y escucha onAuthStateChange (A3-05, A2-06)`

### C3.3 — `has_admin` fallido no bloquea el bootstrap · [A3-06 media]
**Ficheros:** `src/hooks/useAppData.ts` (`:132`), `src/App.tsx` (gate `serverHasAdmin === false` `:303-307`).
**Contexto:** `catch {}` deja `serverHasAdmin = null` → `noAdmin === false` para siempre: en un despliegue vacío con red inestable, SetupView no aparece nunca y sin mensaje.
**Pasos:** distinguir tres estados (`true | false | null`); con `null` tras el bootstrap, reintentar el RPC (1-2 reintentos con backoff) y, si sigue fallando, integrarlo con el banner de C3.1 («No se pudo verificar el estado del servidor — Reintentar»). Nunca mostrar SetupView por defecto ante fallo.
**Commit:** `fix(bootstrap): has_admin con reintento y estado no-confirmado visible (A3-06)`

### C3.4 — `btnOf` tolerante · [A3-08 media] · test rojo primero
**Ficheros:** `src/lib/domain.ts` (`:79`), test vecino.
**Contexto:** `category.buttons.find(...) || category.buttons[0]` sin guard; `fa_categories` se asigna cruda del JSONB → una fila sin `buttons` lanza TypeError en pleno render de sesión. Único lector no tolerante del repo.
**Pasos:** test rojo (A4 §6.8): categoría sin `buttons` / con `buttons` no-array → no lanza. Fix: `const btns = Array.isArray(category?.buttons) ? category.buttons : []` y devolver `btns.find(...) || btns[0]` (puede ser `undefined`). Revisar con grep los consumidores de `btnOf` y proteger el render donde se desestructure sin guard.
**Commit:** `fix(dominio): btnOf tolera categorías sin buttons (A3-08)`

### C3.5 — Multiparte reducido a 1 parte no pisa datos · [A2-02 alta] · test rojo primero
**Ficheros:** `src/lib/domain.ts` (nueva función + `partsOf` `:132-139` + `PART_FIELDS` `:115-120`), `src/components/editor/useExerciseEditor.ts` (`removePart` `:152-153`, `handleSave` `:359-360`), tests.
**Contexto (verificado en A2):** `removePart` permite pasar de 2→1 partes; el guardado escribe `parts:[A]`; y `partsOf` con `length===1` sintetiza la parte desde los **campos planos del ejercicio** (obsoletos desde que se hizo multiparte) → el audio/clave/preguntas de la parte superviviente quedan enmascarados. El comentario de `domain.ts:122-131` explica por qué `partsOf` "refresca" desde planos con 1 parte — ese diseño NO se toca; **el fix va en el guardado**: si los campos planos reflejan la parte superviviente, la síntesis vuelve a ser correcta.
**Pasos:**
1. Función pura en domain: `flattenSinglePart(exercise)` — si `parts?.length === 1`, copia todos los `PART_FIELDS` de esa parte a los campos planos del ejercicio y elimina `parts` (y cualquier campo de identidad de parte residual). Idempotente con ejercicios sin `parts` o con ≥2 partes (los devuelve intactos).
2. **Test rojo** (A4 §6.3): ejercicio `{campos planos viejos, parts:[A,B]}` → quitar B → sin fix, `partsOf(guardado)[0]` muestra los planos viejos; con `flattenSinglePart` aplicado antes de guardar/normalizar, `partsOf(...)[0]` contiene el audio/clave/preguntas de A. Cubrir también la idempotencia y que `normalizeExercise(flattenSinglePart(ex))` re-materializa `parts` coherentes con A (la re-materialización de `normalizeExercise` es esperada y correcta una vez los planos son los buenos).
3. Integrar en `useExerciseEditor.handleSave` (aplicar `flattenSinglePart` al objeto antes de `onCreate/onUpdate`) o en el propio `removePart` al detectar `length===1` — elegir el punto que menos toque, documentar en el log.
**Aceptación:** test rojo→verde; puertas verdes; los ejercicios multiparte de ≥2 partes no cambian de forma (test).
**Commit:** `fix(multiparte): aplana a campos planos al quedar una sola parte (A2-02)`

### C3.6 — El editor avisa cuando la URL de audio falla · [A6-02 media]
**Ficheros:** `src/components/editor/useExerciseEditor.ts` (`:226`, `catch { ctx.close() }` sin setError).
**Contexto:** al pegar una URL mala en el editor no aparece nada; el modal del almacén sí avisa (`modals.tsx:606`, «No se pudo verificar la URL»).
**Pasos:** replicar el `setError` del almacén en el catch del editor (mismo mensaje), manteniendo `ctx.close()`.
**Commit:** `fix(editor): error visible al fallar la URL de audio (A6-02)`

### C3.7 — Publicar sin clave · [A4-04 media] · `[BLOQUEADA: D8]`
Variante (a): `PasoRevision.tsx:94-102` — el switch «Visible para alumnos» exige claves listas (`allReady`/faltas vacías). Variante (b): `resultStatusOf` (`domain.ts:95-101`) trata interactivo/cuestionario sin clave como «pendiente» (entra en la cola de corrección manual) + test que lo fije. Implementar la que Jon decida; en ambos casos, test.
**Commit:** `fix(evaluacion): <variante> para entregas sin clave (A4-04)`

### C3.8 (+) — Duración por parte y `calcScore` honesto · [A2-08 media, A4-07 baja]
**Justificación:** cierra la raíz de notas 0 injustas; casa con los tests §6.4 de A4.
**Ficheros:** `src/components/editor/PasoAudios.tsx` (`:218-226`), `src/components/editor/useExerciseEditor.ts` (`canSave` `:308`, `addEmptyPart` `:154-159`), `src/lib/scoring.ts` (`calcScore` `:27-42`), tests.
**Pasos:** (1) al asignar URL a una parte, decodificar y fijar `duration` (reutilizar el mecanismo de `handleUrlInput`); (2) `canSave` valida duración presente por parte con audio en multiparte; (3) `calcScore` con `duration` 0/`undefined` devuelve `null` (no 0) + tests de casos límite (duration inválida, clave que excede duration, margen ≥ tramo). Verificar consumidores de `calcScore` frente al nuevo `null` (la semántica null="pendiente" ya existe: clave vacía → null).
**Commit:** `fix(scoring): duración por parte en el editor y calcScore null sin duración (A2-08)`

---

## 7. Fase C4 — Proyecto «Esquema»

**Objetivo:** un solo proyecto que salda cuatro deudas: A1-01 (monolito 1.859 líneas), A4-01 (repeats sin tests), A7-01/02 (hotspots de render) y A5-08 (teclado). Precondición dura: **C4.2 en verde antes de tocar `SchemaExerciseView.tsx`** (red de seguridad).

### C4.1 — Inyección del generador de ids en `repeats.ts` · [A4-09 baja, habilita A4-01]
**Ficheros:** `src/lib/repeats.ts` (`:5,143`).
**Pasos:** `syncSecondPassBlocks(..., makeId: () => string = uid)` — parámetro opcional con default, cero cambios en los llamantes (grep para confirmarlos: ExerciseView y SchemaExerciseView). Opcional en el mismo commit: `uid(now?, rand?)` en `ids.ts` (A2-12) sin cambiar llamadas.
**Commit:** `refactor(repeats): generador de ids inyectable (A4-09)`

### C4.2 — Suite de caracterización de `repeats.ts` · [A4-01 alta]
**Ficheros:** nuevo `src/lib/repeats.test.js` (patrón de los tests vecinos).
**Casos (A4 §6.1, todos):**
- `buildRepeatSegments`: sin reps · 1 rep en medio · rep pegada al inicio · pegada al fin · reps desordenadas (verifica orden por `first.start`) · rep malformada (filtrada).
- `buildCompleteViewSegments`: con hueco entre 1ª y 2ª vez.
- `syncSecondPassBlocks` (con `makeId` determinista inyectado): espejo nuevo · espejo existente sin override · override conserva `start` pero recalcula duración · anclas `_lockedStart`/`_lockedEnd` en bordes · ratio de 2ª vez ≠ 1ª · override huérfano se conserva.
- `rulerTicksForSeg`: elección de paso · `d<=0`.
**Aceptación:** todos verdes; cobertura de `repeats.ts` ≥90% stmts (medida con `npm install --no-save @vitest/coverage-v8` + `npx vitest run --coverage`; borrar `coverage/` después; `git status` limpio en package*.json — regla R10). Estos tests son de **caracterización**: fijan el comportamiento ACTUAL; si un caso revela un comportamiento sorprendente, documentarlo en el test y en el log, no "corregirlo".
**Commit:** `test(repeats): suite de caracterización completa (A4-01)`

### C4.3 — Subdivisión de `SchemaExerciseView` · [A1-01 alta, A9-02] · `[BLOQUEADA: D12 — default: enfoque del informe]`
**Enfoque (propuesta del informe, satisface PLAN_MAESTRO_2 y AUDITORIA a la vez):** trocear por hooks/subcomponentes SIN extraer `SchemaTimeline` como componente y SIN tocar el motor de drag `:526-874` salvo lo especificado en C4.3g. Guía completa de responsabilidades: A2 §4.1 (15 responsabilidades con rangos de líneas). **Un commit por extracción, comportamiento idéntico, puertas verdes en cada uno.** Orden de menor a mayor acoplamiento:

- **C4.3a — Selector de paleta** (estado `:118-127`, render `:1267-1301`) → `components/schema/SchemaPalettePicker.tsx`.
  `refactor(esquema): extrae el selector de paleta (A1-01)`
- **C4.3b — Panel de selección/detalle** (`:1720-1824`) → `components/schema/BlockDetailPanel.tsx`.
  `refactor(esquema): extrae el panel de detalle de bloque (A1-01)`
- **C4.3c — Barras de vista resumida** (condicionales de `viewMode`, `:1229-1253` y afines) → subcomponente propio.
  `refactor(esquema): extrae las barras de vista resumida (A1-01)`
- **C4.3d — Subsistema listen-only** (estado `:87-91`, handlers `:478-523`, render `:1394-1412`) → hook `useListenOnlyMarks` + subcomponente de render.
  `refactor(esquema): extrae el subsistema listen-only (A1-01)`
- **C4.3e — `renderSegBlocks` a componente** (`:893-1174`, 282 líneas, 3 variantes visuales) → `components/schema/SegBlocks.tsx` con props explícitas (bloques, nivel, segmento, paleta, callbacks). Los refs del drag que necesite se pasan por props — no duplicar `dragRef`/`trackSegRefs`.
  `refactor(esquema): extrae SegBlocks (A1-01)`
- **C4.3f — Memoización de datos derivados** · [A7-02 media]: `useMemo` para los bloques filtrados/ordenados/coloreados por nivel×segmento (`blocks.filter` `:898`, `.sort` `:905`, cadena de colores `:1002-1010`, `blocks.find` del padre `:1006`), con dependencias que NO incluyen `time`; playhead y `activeAt` quedan fuera del memo (siguen a 10 fps).
  `perf(esquema): memoiza los datos derivados de los bloques (A7-02)`
- **C4.3g — Drag por refs + rAF** · [A7-01 media] · **[MANUAL]**: durante mousemove/touchmove, pintar la posición del bloque vía `transform` sobre refs (rAF), sin `setGuides`/`setBlocks` por evento (`:627-628,643-645,656,665`); `setBlocks` (y snap/cascada definitivos) solo al soltar. Las guías de snap pueden pintarse también por ref. No alterar la semántica de snap, cascada, borde compartido ni las ramas create/move/resize.
  **[MANUAL]** Jon verifica en navegador (ratón Y táctil): crear bloque, mover, redimensionar ambos bordes, borde compartido entre bloques, snap, cascada, drag entre niveles, y que soltar persiste exactamente donde se ve.
  `perf(esquema): drag de bloques por refs y rAF, commit al soltar (A7-01)`
- **C4.3h — Operabilidad por teclado** · [A5-08 alta] · **[MANUAL]**: (1) bloques enfocables: `tabIndex=0`, `role="button"`, `aria-label` «Bloque {label}, de {t1} a {t2}»; (2) con bloque enfocado: ←→ mueven (paso = snap activo o 0,1s), Shift+←→ redimensionan el borde derecho, Alt+←→ el izquierdo; Supr ya borra (`:283`); (3) botones visibles de zoom +/− que llamen al mecanismo de `useSchemaZoom` (`:29-65`), junto al control actual; (4) foco visible en el bloque activo (el sistema ya repone outline vía `theme/fonts.ts` — verificar que aplica). Anunciar cambios de posición vía `aria-label` actualizado.
  **[MANUAL]** Jon: completar un esquema entero solo con teclado y entregarlo.
  `a11y(esquema): bloques operables por teclado y botones de zoom (A5-08)`
- **C4.3i — Regla de navegación/resize de repetición (opcional):** extraer solo si es posible pasando los refs compartidos por props sin duplicar estado; si el acoplamiento con `trackSegRefs` lo impide, documentar en el log y dejar dentro (respeta NO TOCAR §1.4).

**Métrica de cierre C4:** `SchemaExerciseView.tsx` reducido de forma sustancial (orientativo: <1.100 líneas; sin cifra dura — manda el comportamiento intacto), `wc -l` registrado en el log; 196+N tests verdes; cero regresiones en las dos verificaciones manuales.

---

## 8. Fase C5 — Segunda ola (a demanda, priorizada)

Ejecutar tras C1–C4 o cuando Jon lo pida, en este orden salvo indicación contraria. Mismo formato de trabajo (R1–R14). Referencias completas en los informes A*.

| # | Tarea | Hallazgo | Evidencia | Nota |
|---|---|---|---|---|
| T1 | `React.memo` en `ExerciseItem` | A7-06 | ExerciseItem.tsx:49,80-83 | tecleo fluido en buscadores |
| T2 | Constantes módulo `EMPTY_IVS=[]`/`EMPTY_COLORS={}` para WaveformDisplay | A7-09 | QuestionnaireView.tsx:147-149; SchemaExerciseView.tsx:1204-05 | repone un memo ya escrito |
| T3 | Memo de la vista oculta del combo: `React.memo` en las 3 vistas + `sharedAudioPlayer` con API estable (callbacks estables + `timeRef`, sin objeto nuevo por tick) | A7-03 | SessionShell.tsx:97,115-136 | cuidado con no romper el contrato del player |
| T4 | Memo de lista de preguntas + `QuestionMinimap` | A7-05 | QuestionnaireView.tsx:104,160,183; QuestionMinimap.tsx:61,93 | |
| T5 | Lazy de las 3 vistas de corrección | A7-08 | patrón lazy existente (App.tsx:46-48) | −85 kB del inicial |
| T6 | Caché en memoria del ArrayBuffer de audio por URL (sesión) | A6-06 | useAudioPlayer.ts:105-111 | Map módulo-level, invalidable |
| T7 | `AbortController` en el fetch de audio | A6-04 | useAudioPlayer.ts:97-115 | abort en cleanup |
| T8 | Promesas play/resume con catch simétrico y `playing` fijado en resolve | A6-05 | useAudioPlayer.ts:272; session.tsx:148,167 | elimina el "pausa fantasma" |
| T9 | Mensajes de error de audio diferenciados (HTTP nnn / CORS / formato) + nota de requisito CORS para el profesor | A6-01 | lib/audio.ts:74-79; useAudioPlayer.ts:112 | documentar en README o ayuda del editor |
| T10 | Excluir `waveformData` también dentro de `parts[*]` en el upsert | A2-09 | db.ts:66; domain.ts:115-120,137 | lectores ya toleran ausencia (waveform sintética A6) |
| T11 | `db.write()` no reintenta 401/403 (error permanente → toast inmediato) | A3-07 | db.ts:42-62 | el rollback completo queda para una fase de datos futura |
| T12 | Nota multi-categoría según D6 + test que la documente | A4-02 | useSubmitAnswer.ts:236-256,:119-126 | `[BLOQUEADA: D6]` |
| T13 | Sobrantes del esquema según D7 + test (§6.5, incluye verificar que dos bloques clave no consumen el mismo bloque del alumno también en la nota) | A4-03 | scoring.ts:85-100 | `[BLOQUEADA: D7]`; si D7 = "no penaliza", el test documenta |
| T14 | Tests de `palette.ts` (§6.6) | A4-06 | schemaBlockColor, part/phraseColorFromPalette, snapToNearest | insumo CVD |
| T15 | Tests de `figures.ts` (§6.7): FIG_LEGACY, figureOf desconocido→t0, quadGroupsForDegree | A4 §3 | figures.ts | protege compatibilidad de marcas antiguas |
| T16 | Tests §6.9/§6.11/§6.12: `calcQuestionnaireScore` points:0; round-trip de routing; umbrales 79/80 y 49/50 de scoreColor/Bg | A4-07/08 | scoring.ts, routing.ts | |
| T17 | Rutas huérfanas: `#/profesor/categorias`/`usuarios` → tab settings (o redirect) + podar `TEACHER_TAB_PATH`; eliminar o dar función a `#/configuracion` | A2-03, A2-04 | routing.ts:73,120-135; teacher.tsx:1223-1321; App.tsx:220,577 | |
| T18 | Cuestionario 0 preguntas en multiparte: default sugerido = cuenta como completo (alternativa: bloquear publicación) | A2-07 | SessionShell.tsx:46-51,185-189 | confirmar default con Jon en el prompt |
| T19 | Borrar `src/auth/crypto.ts` (huérfano confirmado por knip + A3/A8: nada lo referencia) | A1-05 | knip 2026-07-09 | `git rm` |
| T20 | Borrar Edge Function `claude-proxy` de prod | A3-11 | list_edge_functions | `[BLOQUEADA: D11]`, operación MCP/CLI |
| T21 | Rate limit en `request-pin-reset` (patrón del de `login`: por username+IP) + redeploy | A8-03 | supabase/functions/request-pin-reset | requiere D2 desplegada |
| T22 | Paleta aplicada también en multiparte de alumno | A2-16 | App.tsx:440-442 vs :461-462 | `applyPaletteToExercise` en la rama SessionShell |
| T23 | Stub de `window.scrollTo` en `setupTests` para silenciar jsdom | A0-02 | stderr de vitest | |
| T24 | Higiene A2-25: signOut directos → `authClient.logout`; props muertas (`supabaseSession`, `tab`/`onTab`); `labels.admin` inalcanzable | A2-25 | App.tsx:332,337; auth.tsx:28; StudentDash.tsx:34-41 | |
| T25 | Quitar exports innecesarios (39+11, knip) y decidir `@testing-library/user-event` (usar o retirar — retirar toca package.json: excepción explícita a R10) | A1-07, A1-06 | knip | bajo riesgo, al final |

**Fuera de este plan (se abordan en chat con Jon, no en Claude Code):** reconstrucción de PLAN_UNIFICACION (desde A5 §5 + A1-08/09: escala de radios 10/12 → tokens, CTAs de PasoClaves, `#555`/`#888`, campaña de primitivas en PasoClaves y session) y de PLAN_EVALUACION (desde A4 §4–6); decisión M7; `any`=53 y diff neto (métricas blandas de PLAN_MAESTRO_2).

---

## 9. Checklist de cierre global

1. Todas las tareas ejecutadas tienen su fila en `docs/CORRECCIONES_LOG.md` con hash y puertas.
2. `npx madge --extensions ts,tsx --circular src/` → 0 ciclos.
3. `npm run test` → todos verdes (196 de partida + los nuevos de C1.1, C3.4, C3.5, C3.8, C4.2 y los de C5 ejecutados).
4. Cobertura de `repeats.ts` ≥90% verificada y artefactos de coverage borrados.
5. Bundle: `index-*.js` ≤ ~235 kB (tras C1.6/C1.7) y sin literales de `localSeed` en `dist/`.
6. Lista de verificaciones **[MANUAL]** pendientes de Jon, consolidada al final del log: C1.2 (logout), C1.4 (flujo PIN e2e), C2.6 (etiquetas mínimas), C3.1 (banner de error), C3.2 (rehidratación), C4.3g (drag), C4.3h (teclado del esquema), C1.7 opcional (`?local` en dev).
7. Decisiones D aún abiertas listadas con sus tareas bloqueadas.
8. **Sin push** (D1 pendiente): recordar a Jon que `origin/beta` sigue 3+N commits por detrás.
