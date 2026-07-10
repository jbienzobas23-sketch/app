# INFORME FINAL — Análisis integral de Funciones Armónicas (A0–A9)

**Fecha:** 2026-07-10 · **Rama:** `beta` · **Commit analizado:** `f263089` (idéntico en las 9 fases; los commits `70de916…10ef04f` sobre él son solo `analisis/`)
**Fases:** A0–A8 completas (entregables en `analisis/A*.md`) + este cruce/síntesis (A9).

---

## 1. Resumen ejecutivo

**La aplicación está en buen estado de salud técnica.** Las cuatro puertas están verdes (lint 0, typecheck 0, 196/196 tests, build 1,96 s), la seguridad es sólida (0 hallazgos altos en A8: hash en servidor, RLS por rol verificada, sin XSS, secretos limpios, npm audit solo build/test), el build está sano (splitting correcto, inicial 686 kB) y la capa de audio es la más robusta del sistema. El refactor de 2026 (Fases 0–8 + M0–M6) ha funcionado: App.tsx pasó de 11.247 a 635 líneas y la deuda que gobierna hoy es acotada y conocida.

**Balance de hallazgos: 0 críticas · 15 altas · ~41 medias · ~49 bajas** (detalle por fase en `INDICE.md`). Las 15 altas se concentran en **tres frentes**:

1. **Funcional/datos (5):** la evaluación de cifrado está rota de extremo a extremo (A2-01, fix de 2 líneas), el multiparte reducido a 1 parte pisa datos (A2-02), la recuperación de PIN no existe en producción y miente al alumno (A3-01), «Salir» no cierra la sesión de Supabase (A3-02) y 7 de 9 usuarios de prod siguen sin poder persistir escrituras (A3-03).
2. **Accesibilidad CVD y teclado (6):** cinco puntos transmiten información solo por color (veredicto de respuesta corta, marcas/bloques estrechos, libro-vs-audio, minimapa) y el modelo esquema es inoperable sin ratón (A5-01..05, A5-08).
3. **Estructural (4):** `SchemaExerciseView` sigue siendo el monolito de 1.859 líneas (A1-01) — y es también donde viven los peores hotspots de render (A7-01/02) y el hueco de teclado (A5-08); `lib/repeats.ts` está a 0 % de cobertura (A4-01); el ciclo de imports ExerciseItem↔courses (A1-04); y los dos ficheros que ignoran las primitivas (A1-08).

**La noticia estratégica:** los tres frentes convergen. Arreglar el esquema (subdividir + drag por refs + teclado + tests de repeats) es UN proyecto, no cuatro.

⚠️ **Pendiente de confirmación con Jon (no es hallazgo de código):** el contenido de prod bajó de 17→3 ejercicios y 5→2 resultados entre el 1 y el 10 de julio. Si no fue limpieza deliberada, investigar antes de nada.

---

## 2. Cruce con la planificación existente

### 2.1 Documentos localizados y no localizados

| Documento | Estado |
|---|---|
| `PLAN_MAESTRO_2.md` | ✅ en el repo (raíz) |
| `AUDITORIA.md` | ⚠️ solo en `C:\Users\bienz\Downloads\` (no versionado) |
| `PLAN_EVALUACION.md` (E0–E6) | ❌ **NO LOCALIZADO** (ni repo ni Downloads) |
| `PLAN_UNIFICACION.md` | ❌ **NO LOCALIZADO** |
| `plan_placas_hibridas.md` / `plan_obra.md` | ❌ **NO LOCALIZADOS** (referenciados por PLAN_MAESTRO_2) |

**[A9-01] alta — el riesgo que AUDITORIA-A4 avisaba ("planes solo en local, riesgo de pérdida") se ha materializado:** 4 documentos referenciados por la planificación no existen en ninguna ubicación accesible de esta máquina. El cruce con PLAN_EVALUACION y PLAN_UNIFICACION que pedía este análisis es imposible tal cual. — Recomendación: (a) commitear YA lo que existe (AUDITORIA.md, PLAN_ANALISIS.md → `docs/`); (b) preguntar a Jon si conserva copias; (c) si no, **reconstruirlos desde este análisis**: A5 §5 + A1-08/09 son el insumo completo de un PLAN_UNIFICACION nuevo, y A4 §4-6 lo son de un PLAN_EVALUACION.

### 2.2 PLAN_MAESTRO_2 (M0–M7) — estado real verificado en el código

| Fase | Estado | Evidencia del análisis |
|---|---|---|
| M0 borrado muerto/fondo | ✅ hecha | `fa_settings` sin usos en cliente (A3-09), greps del cierre a cero |
| M1 frontera de datos | ✅ hecha | `normalizeExercise` en frontera, idempotente, testeada (A3 §2, A4) |
| M2 ExerciseItem + ModelPlate | ✅ hecha | ExerciseItem/TypePlate en uso (A5, A7); placa por forma+color ✓CVD |
| M3 audio/corrección/Menu | ✅ hecha | `lib/time.ts` 100 % cobertura, `correccion/` troceada (<300/fichero, A7 bundle), `Menu` con Escape/flechas (A5) |
| M4 SessionShell keep-mounted + `?parte=` | ✅ hecha | leída completa en A6/A7: montado único, `active`, precalentamiento, LRU-1 |
| M5 editor 5 pasos | ✅ hecha (+M5.7-.10 posteriores) | `components/editor/` con pasos dinámicos (A5) |
| M6 preguntas de obra | ✅ hecha | `questionScopeOf` tolerante y testeado (A4) |
| M7 tope 3 modelos | ⬜ NO ejecutada — **opt-in, decisión de producto pendiente de Jon** (por diseño) |
| Métricas blandas del cierre | ⚠️ 2 sin alcanzar (registro del 2026-07-04): `any`=53 (objetivo <40) y diff M0–M4 neto +184 (objetivo ≤0) | deuda menor declarada |

**[A9-02] media — contradicción entre planes sobre `SchemaExerciseView`:** PLAN_MAESTRO_2 declara *fuera de alcance* extraer `SchemaTimeline` ("decisión documentada — respetarla") mientras AUDITORIA-A2.1 ordena trocear el fichero entero. Ambos conviven sin resolver, y el fichero sigue en 1.859 líneas exactas desde la línea base de AUDITORIA. — Recomendación: decisión explícita de Jon; la propuesta de este análisis (§4, proyecto "Esquema") es trocear por hooks/subcomponentes SIN extraer SchemaTimeline como componente separado — satisface el espíritu de ambos.

### 2.3 AUDITORIA.md (sus fases A0–A4, aquí "AU-") — estado real

| Fase | Estado | Evidencia |
|---|---|---|
| AU-A0 lint vite.config.js | ✅ **resuelta** | commit `88327e5`; las 4 puertas verdes en la línea base A0 |
| AU-A1 SessionShell (=M4.1) | ✅ resuelta | ver M4 arriba |
| AU-A2.1 trocear SchemaExerciseView | ❌ no iniciada | 1.859 líneas — cifra IDÉNTICA a la línea base de AUDITORIA (A1-01) |
| AU-A2.2 consumo de primitivas | ❌ **contradicha por el código** | estilos inline 1.438 → **1.506** (A1-09: subió pese al objetivo "↓↓ sostenido"); PasoClaves(91)/session(56) ni importan primitives (A1-08) |
| AU-A2.3 adelgazar App.tsx | ✅ resuelta | 1.189 → 635 líneas (commit `f263089`, literalmente "a2.3"); objetivo <~600 casi exacto (A1-03: vigilar) |
| AU-A3 bandas de score no cromáticas | ✅ resuelta EN SU ALCANCE, pero el alcance quedó corto | A5 verificó que todos los consumidores de scoreColor/scoreBg llevan cifra/✓ — y encontró **5 huecos CVD fuera de las bandas** (A5-01..05) que AUDITORIA no contemplaba |
| AU-A4 versionar planes | ❌ no hecha y **agravada** | ver [A9-01] |

### 2.4 Deuda de AUDITORIA resuelta / nueva

**Resuelta desde la línea base (`7fe9541`):** lint 2 errores→0 · App.tsx 1.189→635 · MultiModel/MultiPart 12→0 · fa_settings fuera del cliente · build 4,77 s→1,96 s · npm audit clasificado (A8: todo build/test, sin urgencia).

**Deuda nueva no recogida en AUDITORIA (lo grueso):** el bug de cifrado A2-01 y el de multiparte A2-02; todo el bloque de sesión/persistencia A3-01..08; las inconsistencias editor↔corrector A4-02..04; `repeats.ts` sin tests A4-01; los 5 huecos CVD finos y el teclado del esquema A5; los hotspots de render A7-01..03 y el chunk inicial A7-04; el email-bombing A8-03. AUDITORIA seguía siendo válida pero miraba la mantenibilidad; este análisis añade la capa funcional/datos/UX.

---

## 3. Matriz global (críticas y altas) — impacto × esfuerzo

0 críticas. Las 15 altas (A8-01/02 son las mismas que A3-01/02, no se duplican):

| Hallazgo | Impacto | Esfuerzo | Dependencias |
|---|---|---|---|
| A2-01 cifrado roto e2e | ALTO (función del producto muerta en silencio) | **Mínimo** (2 líneas + test A4 §6.2) | — |
| A3-01 PIN-reset roto en prod | ALTO (alumnos sin recuperación + mensaje falso) | **Bajo** (desplegar 2 funciones probadas en staging + `res.ok`) | **OK de Jon** (deploy prod) |
| A3-02 «Salir» sin signOut | ALTO en aulas compartidas | **Mínimo** (`logout()` ya existe) | revisar credType de LoginView (A3 §hallazgo) |
| A3-03 7/9 usuarios sin enlace Auth | ALTO (trabajo que se pierde) | **Bajo** (primer login o script servidor) | **OK de Jon** |
| A5-01 respuesta corta solo-color | MEDIO-ALTO (CVD, criterio duro del proyecto) | **Bajo** (replicar patrón ✓/✗ de test) | — |
| A5-04 libro vs audio solo-color | MEDIO | **Bajo** (decisión de diseño: Jon vetó emoji) | consulta a Jon |
| A5-05 minimapa solo-color | MEDIO (mitigado en pantalla) | **Bajo** | — |
| A5-02 marcas estrechas interactivo | MEDIO-ALTO | Medio (etiqueta mínima/tooltip) | — |
| A5-03 bloques estrechos esquema | MEDIO-ALTO | Medio | idem A5-02 (misma familia) |
| A2-02 multiparte→1 parte | MEDIO (pérdida de datos en caso raro) | Medio (test rojo primero, A4 §6.3) | — |
| A1-04 ciclo ExerciseItem↔courses | BAJO-MEDIO (higiene) | Bajo (KebabMenu a fichero propio — a primitives NO, lo rompe) | — |
| A4-01 repeats.ts 0 % cobertura | MEDIO (riesgo latente) | Medio (DI de uid + suite A4 §6.1) | **precede** al proyecto Esquema |
| A5-08 esquema sin teclado | MEDIO-ALTO (bloqueo de acceso) | Alto | proyecto Esquema |
| A1-01 monolito SchemaExerciseView | MEDIO (mantenibilidad) | Alto | A4-01 antes; resolver [A9-02] |
| A1-08 PasoClaves/session sin primitivas | MEDIO (insumo unificación) | Medio | PLAN_UNIFICACION reconstruido |
| [A9-01] planes perdidos | MEDIO-ALTO (gobernanza) | Bajo (commitear+reconstruir) | pregunta a Jon |

---

## 4. Secuencia recomendada (próximo mes)

Respeta las convenciones: JSONB tolerante, sin migraciones, forward-only, cuatro puertas verdes por commit, nada solo-color.

**Lote 1 — Quick wins operativos (días, no semanas):**
1. Fix cifrado A2-01 (2 líneas) + test de integración A4 §6.2 — recupera una función del producto.
2. `onLogout` → `logout()` (A3-02).
3. Con OK de Jon: desplegar `request-pin-reset`/`reset-pin` a prod (A3-01) + `requestPinReset` comprueba `res.ok`.
4. Con OK de Jon: enlazar las 7 cuentas sin Auth (A3-03) — o pedirles un primer login.
5. Rendimiento gratis: extraer `RecoveryEmailModal` (−52 kB del inicial) + `localSeed` dinámico (A7 nº1-2).
6. Versionar AUDITORIA.md y PLAN_ANALISIS.md en `docs/`; preguntar a Jon por los 4 planes perdidos ([A9-01]).

**Lote 2 — CVD y accesibilidad fina (una sesión temática):**
7. A5-01 (✓/✗ en respuesta corta), A5-05 (glifo en minimapa), A5-06 (✓ en opción correcta), A5-12 (2 aria-label), A5-18 (safe-area del toast). Después, en la misma familia: A5-02/03 (etiquetas mínimas en marcas/bloques estrechos — pedir criterio visual a Jon si hace falta).
8. A5-04 libro-vs-audio: proponer a Jon 2-3 alternativas no cromáticas (conteo «N piezas», doble borde…).

**Lote 3 — Robustez de datos/sesión:**
9. A3-04 (error de carga visible; las semillas no enmascaran), A3-05 (rehidratar sesión + `onAuthStateChange`), A3-06 (`has_admin` con reintento), A3-08 (guard en `btnOf` + test), A6-02 (error de URL visible en el editor), A4-04 si Jon decide (publicar sin clave → "pendiente").
10. A2-02 multiparte: test rojo A4 §6.3 → fix en `partsOf`/normalize (distinguir "nunca multiparte" de "reducido a 1").

**Lote 4 — Proyecto "Esquema" (el estructural, 1-2 semanas):**
11. PRIMERO la suite de `repeats.ts` con `uid` inyectable (A4-01/§6.1) — red de seguridad.
12. Resolver [A9-02] con Jon y subdividir `SchemaExerciseView` (AU-A2.1) integrando en la misma cirugía: drag por refs/rAF (A7-01), memoización de `renderSegBlocks` (A7-02) y operabilidad por teclado (A5-08). Un solo proyecto, cuatro deudas.

**Paralelo — decisiones de producto para Jon (bloquean código, no análisis):**
- ¿La nota del interactivo multi-categoría debe promediar categorías? (A4-02)
- ¿Los bloques sobrantes del esquema penalizan? (A4-03)
- ¿Se puede publicar sin clave? (A4-04)
- ¿Ejecutar M7 (3 modelos)? (PLAN_MAESTRO_2, opt-in)
- ¿El descenso de datos de prod (17→3 ejercicios) fue limpieza tuya?
- ¿Conservas PLAN_EVALUACION/PLAN_UNIFICACION/plan_placas/plan_obra? ([A9-01])

**Después (reconstruible desde este análisis):** PLAN_UNIFICACION nuevo desde A5 §5 (radios 10/12 → tokens, CTAs de PasoClaves, #555/#888) + campaña de primitivas (AU-A2.2, hoy contradicha); resto del top-10 de A7; bajas de A6/A8 en ventanas de mantenimiento.

---

## 5. Cierre

- Hallazgos A9 propios: **[A9-01] alta** (planes perdidos), **[A9-02] media** (contradicción de planes sobre el esquema).
- Los entregables A0–A8 + este informe + `INDICE.md` cerrado constituyen la memoria completa del análisis. Los `.md` permiten decidir el próximo mes de trabajo sin releer fases individuales (criterio de cierre de A9). El repo queda con `analisis/` commiteado en `beta` local; **el push a `origin/beta` requiere el OK de Jon** (junto con la decisión sobre los 3 commits de código previos al análisis, ver A0-01).
