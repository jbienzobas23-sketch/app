# INDICE — Análisis integral de Funciones Armónicas (rama beta)

Registro vivo de fases. Se actualiza al cerrar cada fase. Ver `PLAN_ANALISIS.md` (en Downloads, fuente del plan) para el detalle de cada fase.

| Fase | Estado | Fecha | Commit analizado | Crítica | Alta | Media | Baja |
|---|---|---|---|---|---|---|---|
| A0 — Línea base | ✅ Completa | 2026-07-09 | `f263089` | 0 | 0 | 1 | 1 |
| A1 — Inventario estructural | ✅ Completa | 2026-07-09 | `f263089` | 0 | 3 | 3 | 3 |
| A2 — Arquitectura y flujo de datos | ✅ Completa | 2026-07-09 | `f263089` | 0 | 2 | 11 | 14 |
| A3 — Capa de datos (Supabase) | ✅ Completa | 2026-07-10 | `f263089` | 0 | 3 | 5 | 4 |
| A4 — Dominio musical y tests | ⬜ Pendiente | — | — | — | — | — | — |
| A5 — UI, accesibilidad CVD y móvil | ⬜ Pendiente | — | — | — | — | — | — |
| A6 — Audio | ⬜ Pendiente | — | — | — | — | — | — |
| A7 — Rendimiento y build | ⬜ Pendiente | — | — | — | — | — | — |
| A8 — Seguridad | ⬜ Pendiente | — | — | — | — | — | — |
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
