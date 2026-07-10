# INDICE — Análisis integral de Funciones Armónicas (rama beta)

Registro vivo de fases. Se actualiza al cerrar cada fase. Ver `PLAN_ANALISIS.md` (en Downloads, fuente del plan) para el detalle de cada fase.

| Fase | Estado | Fecha | Commit analizado | Crítica | Alta | Media | Baja |
|---|---|---|---|---|---|---|---|
| A0 — Línea base | ✅ Completa | 2026-07-09 | `f263089` | 0 | 0 | 1 | 1 |
| A1 — Inventario estructural | ✅ Completa | 2026-07-09 | `f263089` | 0 | 3 | 3 | 3 |
| A2 — Arquitectura y flujo de datos | ✅ Completa | 2026-07-09 | `f263089` | 0 | 2 | 11 | 14 |
| A3 — Capa de datos (Supabase) | ✅ Completa | 2026-07-10 | `f263089` | 0 | 3 | 5 | 4 |
| A4 — Dominio musical y tests | ✅ Completa | 2026-07-10 | `f263089` | 0 | 1 | 5 | 4 |
| A5 — UI, accesibilidad CVD y móvil | ✅ Completa | 2026-07-10 | `f263089` | 0 | 6 | 7 | 7 |
| A6 — Audio | ✅ Completa | 2026-07-10 | `f263089` | 0 | 0 | 3 | 5 |
| A7 — Rendimiento y build | ✅ Completa | 2026-07-10 | `f263089` | 0 | 0 | 4 | 7 |
| A8 — Seguridad | ✅ Completa | 2026-07-10 | `f263089` | 0 | 0 | 2 | 4 |
| A9 — Cruce con planes y síntesis final | ⬜ Pendiente | — | — | — | — | — | — |

## Notas transversales para próximas fases

- **HEAD analizado en A0:** `f263089a1ef0e70f2fb2902839e891cca6afe52a`, rama `beta`, **3 commits por delante de `origin/beta`** (`f263089`, `c3c5bb8`, `88327e5`) más 13 ficheros sin trackear (harnesses `preview-*` dev-only, patrón establecido). Ver [A0-01] en `A0_linea_base.md`. Cada fase debe volver a fijar/confirmar el commit HEAD en su cabecera y avisar si cambió respecto a A0.
- **Los cuatro quality gates estaban en verde en A0** (lint 0, typecheck 0, test 196/196, build OK). El error de lint de `vite.config.js` que documentaba `AUDITORIA.md`/memoria de sesiones previas **ya está resuelto** (commit `88327e5`) — A9 debe registrarlo como deuda cerrada.
- `npm outdated` (15 paquetes) y `npm audit` (3 vulnerabilidades: 1 baja, 2 altas, todas en dependencias de build/dev) quedaron solo capturados en A0; su análisis de impacto/explotabilidad real corresponde a A8.

## Hallazgos por fase (detalle)

### A0 — Línea base
- [A0-01] media — repo raíz — `git status` ahead of origin/beta by 3 commits + 13 ficheros sin trackear — decidir si pushear antes de que A9 cierre el análisis.
- [A0-02] baja — suite de tests (jsdom) — `Not implemented: Window's scrollTo()` repetido en stderr — limitación conocida de jsdom, no bloquea (196/196 verdes); revisar si algún test depende implícitamente de scroll real.

### A1 — Inventario estructural
- [A1-01] alta — `components/SchemaExerciseView.tsx` (1859 líneas) — sigue siendo el mayor monolito; único pendiente estructural conocido, insumo para el mapa de A2.
- [A1-02] media — `components/teacher.tsx` (1414 líneas) — junto a `primitives.tsx` (1177), `session.tsx` (991) y `modals.tsx` (943), grupo de 4 ficheros >900 líneas candidatos a descomposición futura.
- [A1-03] baja — `App.tsx` (635 líneas) — justo por encima del umbral de 600, vigilar que no vuelva a crecer.
- [A1-04] alta — ciclo de imports `components/ExerciseItem.tsx` ↔ `components/courses.tsx` (`madge --circular`) — confirmar sentido de la dependencia en A2.
- [A1-05] media — `src/auth/crypto.ts` sin ningún import en todo el repo (`knip`) — huérfano tras la migración de auth a Edge Functions (Fase 1); candidato a borrado, verificar en A3/A8 antes.
- [A1-06] baja — devDependency `@testing-library/user-event` sin usar (`knip`).
- [A1-07] baja — 39 exports + 11 tipos exportados innecesariamente (usados solo dentro de su propio fichero), concentrados en `courses.tsx` y `primitives.tsx`.
- [A1-08] alta — `components/editor/PasoClaves.tsx` (91 inline) y `components/session.tsx` (56 inline) son los únicos ficheros del top-20 de estilos inline que **no importan `primitives.tsx`** — candidatos más claros a divergencia visual, insumo directo para A5/PLAN_UNIFICACION.
- [A1-09] media — 1506 estilos inline totales en `src/`, frente a 1.438 registrado como línea base en `AUDITORIA.md` (a confirmar literalmente en A9) — posible aumento pese a la consolidación en curso.

### A2 — Arquitectura y flujo de datos
- **[A2-01] alta (VERIFICADA) — la evaluación de cifrado está rota de extremo a extremo**: `ExerciseView.tsx:286` y `SessionShell.tsx:65` descartan `fig` al serializar el submit → claves grabadas sin cifrado + respuestas del alumno que pierden el suyo. Fix de 2 líneas. **Bug funcional del producto, prioridad para Jon.**
- **[A2-02] alta (VERIFICADA)** — multiparte reducido a 1 parte: `partsOf` (`domain.ts:132-139`) pisa la parte superviviente con los campos planos obsoletos; `removePart`+`handleSave` permiten llegar a ese estado. Variante evidenciada del "pendiente profundo" del 2026-07-06.
- [A2-03] media — rutas `#/profesor/categorias` y `#/profesor/usuarios` renderizan página vacía (tabs huérfanos tras anidarlos en Ajustes).
- [A2-04] media — ruta muerta `#/configuracion` (parseada, nunca renderiza SetupView).
- [A2-05] media — `EditorShell` sin `key` sobre formulario-snapshot: transición detalle→detalle puede guardar datos del ejercicio A sobre el B.
- [A2-06] media — sesión de UI no rehidratada al recargar (token Supabase válido persiste en localStorage pero se vuelve al login).
- [A2-07] media — cuestionario con 0 preguntas en multiparte bloquea la entrega indefinidamente (`SessionShell.tsx:46-51`).
- [A2-08] media — partes sin `duration` (addEmptyPart / pegar URL) → `calcScore` devuelve 0 en vez de null.
- [A2-09] media — `parts[*].waveformData` SÍ se persiste en el JSONB (la exclusión de `db.ts:66` solo cubre el nivel superior).
- [A2-10..13] medias — impurezas de `lib/`: routing.ts (React+DOM), audio.ts (fetch), ids.ts (Date.now/Math.random sin DI), domain.ts importa seed.
- [A2-14..27] bajas — 14 hallazgos menores: ids numéricos `Date.now()`, closure obsoleto en `updateExercise`, paleta no aplicada en multiparte, status "pendiente" contagia combos, `categories:[]` no representable, key JSON.stringify remonta CorrectionView, resets incompletos, `lastPanelPath` global, URL sin normalizar por rol, navigate en render, fallbacks silenciosos sin 404, higiene menor (signOut duplicado, props muertas), localSeed en bundle de prod, pointer.ts DOM en lib. Detalle en `A2_arquitectura.md §6`.
- Confirmada la causa raíz del ciclo A1-04: `KebabMenu` definido en `courses.tsx:302` e importado por `ExerciseItem.tsx:16` — mover a `primitives.tsx` lo rompe.

### A3 — Capa de datos (Supabase)
- **[A3-01] alta — recuperación de PIN rota y silenciosa en PROD**: `request-pin-reset`/`reset-pin` NO desplegadas y `authClient.requestPinReset` ignora `res.ok` → «Correo enviado» ante un 404.
- **[A3-02] alta — «Salir» no hace `signOut`** (`App.tsx:419`,`:317`): el token persiste en localStorage y el siguiente arranque carga datos autenticado como el usuario anterior — equipos compartidos de aula.
- **[A3-03] alta — 7 de 9 usuarios de prod sin enlace Auth** (`auth_uid` null): RLS sigue rechazando sus escrituras hasta un primer login (verificado por SQL 2026-07-10).
- [A3-04] media — fallo de carga silencioso: las semillas (ids 2/3/4) enmascaran un Supabase caído.
- [A3-05] media — sin `onAuthStateChange` ni rehidratación; la expiración se descubre por un toast de guardado a los 13s.
- [A3-06] media — `has_admin` fallido deja SetupView inaccesible en despliegues nuevos (`useAppData.ts:132`).
- [A3-07] media — reintentos ciegos (403 RLS reintentado 13s) y estado optimista sin rollback (`db.ts:42-62`).
- [A3-08] media — `btnOf` (`domain.ts:79`) sin guard: categoría JSONB sin `buttons` → TypeError en render. Único lector frágil; el resto tolerantes (tabla completa en A3_datos.md §2.2).
- [A3-09] baja — `fa_settings` tabla muerta (0 usos en cliente, 0 filas).
- [A3-10] baja — advisor rendimiento: políticas permisivas duplicadas en 7 tablas (`*_select`+`*_write FOR ALL`).
- [A3-11] baja — Edge Function `claude-proxy` desplegada sin ningún llamante.
- [A3-12] baja — historia de migraciones repo ≠ prod (0001/0005 por equivalencia) y prefijo `0003` duplicado.
- **Observación para Jon (no numerada):** contenido de prod bajó de 17→3 ejercicios y 5→2 resultados entre el 2026-07-01 y el 2026-07-10 — confirmar si fue limpieza intencionada antes de A9.
- Contraste servidor (2026-07-10): 10 tablas `fa_*` todas con RLS ON; advisors de seguridad = solo los "por diseño" conocidos, nada nuevo; el código no presupone migraciones pendientes.

### A4 — Dominio musical y tests
- **[A4-01] alta — `lib/repeats.ts` a 0% de cobertura**: ningún test lo importa; la lógica más compleja del dominio (sincronía de repeticiones) sin red, y no determinista (`uid()` sin inyección).
- [A4-02] media — la nota del interactivo multi-categoría depende de la pestaña activa al entregar (`useSubmitAnswer.ts:236-256`): extras no promedian. Decisión de producto pendiente.
- [A4-03] media — sembrar bloques por toda la línea da 100% de colocación en esquema (sobrantes no penalizan, `scoring.ts:85-100`); mitigado por revisión manual.
- [A4-04] media — se puede publicar sin clave → entrega con score null y status "auto" (ni nota ni cola de corrección).
- [A4-05] media — cifrado sin test de integración (el hueco que dejó pasar A2-01).
- [A4-06] media — `palette.ts` 46%: sistema de color del esquema sin test (insumo CVD → A5).
- [A4-07..10] bajas — casos límite de scoring sin fijar (duration undefined→0, points:0), routing 40%, impureza `uid()` en repeats, helpers db sin ejecutar.
- Cobertura global: 196/196 tests verdes; `src/lib` 75,4% stmts; <70%: modelMeta, figures, palette, routing, ids, a11y, pointer, repeats. Lista priorizada de 12 tests en `A4_dominio_tests.md §6`.
- Purity check: ninguna función de `lib` toca Supabase; impurezas = routing (React/DOM), audio (fetch), ids (Date/random), pointer (DOM), repeats (uid).

### A5 — UI, accesibilidad CVD y móvil
- **[A5-01..05] altas (CVD, verificadas una a una):** veredicto de respuesta corta solo color de canto (QuizCorrection:346/565); marcas estrechas del interactivo solo color (etiqueta solo si >5%/14px); bloques estrechos del esquema pierden la etiqueta (fontSize:0 si wPct<3.5); libro vs audio solo tinte azul (teacher:547); minimapa del cuestionario verde/azul sin glifo (mitigado por tarjetas con ✓).
- **[A5-08] alta — el modelo esquema es inoperable sin puntero** (bloques no enfocables, zoom solo rueda/pinch).
- Medias: opción correcta relleno-vs-contorno (modals:903), scrubber sin role=slider/teclado, divs clicables sin teclado (incl. cabecera de pregunta del alumno), FieldLabel sin htmlFor en toda la app, error de datos invisible en listas (refuerza A3-04), targets táctiles <40px (asa 6px + `SCHEMA_HND_W` del comentario NO existe — hitbox fantasma), radios de facto 10/12 sin tokenizar + CTAs bespoke PasoClaves (insumo nº1 PLAN_UNIFICACION).
- Bajas: RepeatBand asas, 2 play sin nombre accesible, Menu sin autofocus, vacíos que faltan (curso sin unidades; sin-audio silencioso; sin "Guardando…"), minmax(340) desborda en 375px (SchemaCorrection:332/352), SaveErrorToast sin safe-area + touchAction ausente en 2 superficies, #555/#888 hardcodeados.
- Positivo verificado: hold-to-record SÍ tiene teclado (ExerciseView:174-214); ModalShell/Menu/focus-visible correctos; tipografía 100% tokenizada; TypePlate distingue por FORMA de icono; CategoryDots con inicial.
- Falsos positivos descartados en verificación: courses.tsx:426/:178 y teacher.tsx:735 (gateados o solo-escritorio); el fragmento de pregunta sí tiene campos numéricos (modal → FragmentRangeSelector).

### A6 — Audio
- **Alcance real:** NO hay captura de micrófono ni Supabase Storage (verificado: cero getUserMedia/MediaRecorder/createObjectURL/FileReader/input-file). El audio entra SOLO por URL pegada (host externo); "hold-to-record" = marcar intervalos, no grabar.
- **Arquitectura sólida verificada:** un solo useAudioPlayer compartido por parte (SessionShell:96, keep-mounted sin doble decode), cleanup completo (ctx.close en las 3 vías, cero object URLs), resume() para iOS, sourceId contra onended obsoletos, sincronía marca↔tiempo por timeRef/RAF.
- [A6-01] media — sesión exige CORS del host y todo fallo se disfraza de "Error al decodificar el audio" (useAudioPlayer:112); el `<audio>` del selector reproduce sin CORS → señales contradictorias.
- [A6-02] media — el editor traga en silencio el error de URL (useExerciseEditor.ts:226); el modal del almacén sí avisa.
- [A6-03] media — sin streaming: PCM completo en RAM (~85 MB para 4 min estéreo) y nada suena hasta descargar el fichero entero.
- [A6-04..08] bajas — fetch sin AbortController; promesas play/resume sin manejar (playing fantasma); mismo audio descargado hasta 4× por flujo (→A7); stopAtLoopEnd "reanudar tras parada" pendiente de verificación manual desde 2026-07-06 (hook al 25% cobertura); enlaces externos sin verificación (ejercicio mudo si el host borra).

### A7 — Rendimiento y build
- **Salud general muy buena**: build 1,96 s, tests ~5,3 s, inicial 686 kB JS (gzip ~190), manualChunks + 3 lazy correctos, cero contexts, keys estables, throttle 10fps + refs 60fps bien hecho, memos existentes funcionan (salvo 1 derrotado).
- Medias: [A7-01] drag de bloques del esquema = setState por mousemove sobre 1859 líneas/44 hooks (verificado, SchemaExerciseView:627-665); [A7-02] renderSegBlocks recalcula filtros/sorts/colores 10×/s; [A7-03] PartRunner re-renderiza la vista oculta del combo 10×/s (sharedAudioPlayer nuevo por tick); [A7-04] modals.tsx (54 kB) en el inicial por UN import (App.tsx:33 RecoveryEmailModal — extraerlo lo manda al chunk teacher).
- Bajas: lista de preguntas/minimapa por tick; ExerciseItem sin memo (keystroke×N); localSeed 9,9 kB en prod; correcciones ~85 kB en el inicial; memo de WaveformDisplay derrotado por []/{} inline; zoom por setState; 8 selects anónimos vacíos por visita.
- **Top-10 impacto/esfuerzo en A7_rendimiento.md §5** — nº1: extraer RecoveryEmailModal (−52 kB, esfuerzo mínimo).

### A8 — Seguridad
- **Base sólida, cero altas:** hash PBKDF2 en servidor, secretos fuera del cliente (service_role solo en Edge Functions), RLS por rol verificada en prod, autorización correcta en las 5 Edge Functions (bootstrap admin gate, teacher forzado a sus alumnos, timingSafeEqual+rate-limit+401 genérico en login), SIN dangerouslySetInnerHTML/eval → XSS almacenado no explotable (React escapa), anon key pública por diseño, .env ignorado, historial limpio.
- [A8-01] media — recuperación de PIN inalcanzable en prod (= A3-01, control de recuperación roto).
- [A8-02] media — «Salir» no hace signOut (= A3-02, sesión reanudable en aula compartida).
- [A8-03] baja — request-pin-reset sin rate limit → email-bombing a un recovery_email (login sí lo tiene).
- [A8-04] baja — escrituras JSONB sin límite de tamaño (solo staff, mitigado por RLS).
- [A8-05] baja — **npm audit: 3 vulns (undici←jsdom, vite, @babel/core) TODAS build/test-only, ninguna en el bundle de prod; fixAvailable:true.** Este es el audit que A0 dejó "solo capturado".
- [A8-06] baja — chequeo de rol de login cosmético + perfiles legibles por todos (enumeración de usernames, no escalada; aceptable para modelo de aula).
- Storage: sin superficie privada (audios = URLs públicas de material; entregas de alumno sí aisladas por RLS). El riesgo "alumno accede a audio de otro" del plan NO aplica.
