# A1 — Inventario estructural

**Fecha:** 2026-07-09
**Rama:** `beta`
**Commit HEAD analizado:** `f263089a1ef0e70f2fb2902839e891cca6afe52a` (`f263089`) — mismo que A0, sin cambios.

---

## 1. Árbol de `src/` (2 niveles) y recuento de archivos por carpeta

```
$ find src -maxdepth 2 -type d | sort
src
src/auth
src/components
src/components/correccion
src/components/editor
src/components/schema
src/data
src/hooks
src/lib
src/theme
```

| Carpeta | Archivos (no recursivo) |
|---|---|
| `src/` (raíz) | 14 |
| `src/auth/` | 2 |
| `src/components/` (raíz) | 19 |
| `src/components/correccion/` | 8 |
| `src/components/editor/` | 8 |
| `src/components/schema/` | 1 |
| `src/data/` | 2 |
| `src/hooks/` | 6 |
| `src/lib/` | 26 |
| `src/theme/` | 2 |
| **Total** | **88** |

Comando: `for d in <carpetas>; do find "$d" -maxdepth 1 -type f | wc -l; done`

**Nota:** `src/components/schema/` solo tiene 1 fichero (`RepeatBand.tsx`, extraído de `SchemaExerciseView.tsx`) — la subdivisión de ese monolito sigue prácticamente sin empezar (ver §2).

Por extensión (`find src -type f | sed ... | sort | uniq -c`):

| Extensión | Ficheros |
|---|---|
| `.tsx` | 42 |
| `.ts` | 37 |
| `.js` | 9 (los 9 son `*.test.js`: tests que aún no se migraron a `.ts`, pero importan módulos `.ts` sin problema) |
| `.jsx` | 0 |

Migración a TypeScript confirmada al 100% en código de producción (0 `.jsx`/`.js` fuera de tests).

---

## 2. Líneas por archivo

Comando: `npx cloc src/ --quiet`

```
Language                     files          blank        comment           code
-------------------------------------------------------------------------------
TypeScript                      79           1273           2481          15690
JavaScript                       9             84             36           1103
-------------------------------------------------------------------------------
SUM:                            88           1357           2517          16793
```

Top-20 por líneas totales (`wc -l`, incluye tests y comentarios):

Comando: `find src -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" \) -exec wc -l {} + | sort -rn | head -20`

| # | Líneas | Fichero | >600 |
|---|---|---|---|
| 1 | 1859 | `components/SchemaExerciseView.tsx` | ⚠️ sí |
| 2 | 1414 | `components/teacher.tsx` | ⚠️ sí |
| 3 | 1177 | `components/primitives.tsx` | ⚠️ sí |
| 4 | 991 | `components/session.tsx` | ⚠️ sí |
| 5 | 943 | `components/modals.tsx` | ⚠️ sí |
| 6 | 692 | `components/ExerciseView.tsx` | ⚠️ sí |
| 7 | 663 | `components/courses.tsx` | ⚠️ sí |
| 8 | 635 | `App.tsx` | ⚠️ sí |
| 9 | 610 | `components/correccion/QuizCorrection.tsx` | ⚠️ sí |
| 10 | 505 | `components/correccion/SchemaCorrection.tsx` | no |
| 11 | 435 | `components/editor/useExerciseEditor.ts` | no |
| 12 | 421 | `components/auth.tsx` | no |
| 13 | 417 | `lib/domain.test.js` | no (test) |
| 14 | 388 | `hooks/useAppData.ts` | no |
| 15 | 366 | `lib/scoring.test.js` | no (test) |
| 16 | 338 | `lib/scoring.ts` | no |
| 17 | 323 | `components/editor/PasoClaves.tsx` | no |
| 18 | 315 | `components/QuestionManagerView.tsx` | no |
| 19 | 301 | `localSeed.ts` | no |
| 20 | 297 | `hooks/useAudioPlayer.ts` | no |

**9 ficheros superan las 600 líneas**, todos en `components/` salvo `App.tsx`.

- **[A1-01] alta** — `src/components/SchemaExerciseView.tsx` (1859 líneas) — evidencia: `wc -l` → 1859; único fichero extraído de él hasta ahora es `components/schema/RepeatBand.tsx`. Sigue siendo, con diferencia, el mayor componente del repo — recomendación: es el "único pendiente estructural" ya identificado en planes previos; A2 debe mapear sus responsabilidades internas (hooks, estados, handlers) como base para una futura subdivisión — sin acometerla aún.
- **[A1-02] media** — `src/components/teacher.tsx` (1414 líneas) — evidencia: `wc -l` → 1414 — recomendación: junto con `primitives.tsx` (1177), `session.tsx` (991) y `modals.tsx` (943), forma un grupo de 4 ficheros >900 líneas que deberían entrar en el alcance de una futura fase de descomposición (fuera del alcance de A1, que solo fotografía).
- **[A1-03] baja** — `App.tsx` (635 líneas) — evidencia: `wc -l` → 635, justo por encima del umbral de 600 — recomendación: ninguna urgente; vigilar que no vuelva a crecer (el hook `hooks/useAppData.ts` de 388 líneas ya absorbió parte de su lógica de datos).

---

## 3. Grafo de imports internos

Comando: `npx madge --extensions ts,tsx --circular src/`

```
✖ Found 1 circular dependency!

1) components/ExerciseItem.tsx > components/courses.tsx
```

- **[A1-04] alta** — `src/components/ExerciseItem.tsx` ↔ `src/components/courses.tsx` — evidencia: `madge --circular` reporta 1 ciclo de 2 nodos entre ambos ficheros — recomendación: confirmar en A2 el sentido de la dependencia cruzada (`ExerciseItem` es un componente compartido usado por `courses.tsx`; si `courses.tsx` a su vez importa algo de `ExerciseItem.tsx` que en realidad podría vivir en un módulo común, extraerlo evita el ciclo). No es bloqueante hoy (build/lint/test en verde), pero los ciclos dificultan el code-splitting y el razonamiento sobre dependencias.

**Módulos hub (más importados)** — comando: `npx madge --extensions ts,tsx --json src/` + recuento de aristas entrantes por script:

| Nº importadores | Módulo |
|---|---|
| 38 | `lib/types.ts` |
| 38 | `theme/tokens.ts` |
| 23 | `lib/domain.ts` |
| 20 | `components/primitives.tsx` |
| 17 | `lib/time.ts` |
| 11 | `hooks/useIsMobile.ts` |
| 10 | `lib/palette.ts` |
| 9 | `lib/scoring.ts` |
| 8 | `lib/color.ts` / `components/session.tsx` / `hooks/useAudioPlayer.ts` / `seed.ts` |

`lib/types.ts` y `theme/tokens.ts` son importados por casi la mitad de los 79 ficheros TS/TSX (38/79 ≈ 48%) — son, con diferencia, los módulos más centrales del repo. Coherente con su rol (tipos compartidos `Exercise`/`Category`/etc. y tokens de diseño).

---

## 4. Código muerto

Comando: `npx knip`

```
Unused files (13)
src/auth/crypto.ts
src/preview-cursos.tsx
src/preview-exerciseitem.tsx
src/preview-interactivo.tsx
src/preview-menu.tsx
src/preview-minimap.tsx
src/preview-sessionshell.tsx
supabase/functions/create-user/index.ts
supabase/functions/login/index.ts
supabase/functions/request-pin-reset/index.ts
supabase/functions/reset-credential/index.ts
supabase/functions/reset-pin/index.ts
vite.harness.config.js

Unused devDependencies (1)
@testing-library/user-event  package.json:26:6

Unused exports (39)
[lista completa de 39 exports sin importar, mayormente en components/courses.tsx (17) y components/primitives.tsx (10) — ver salida íntegra]

Unused exported types (11)
[11 tipos/interfaces sin importar fuera de su propio fichero]
```
Exit code 1 (comportamiento normal de knip cuando hay hallazgos).

**Depurado por categoría (falsos positivos esperados vs hallazgos reales):**

- **Falsos positivos esperados (6 de los 13 "Unused files"):** los 6 `supabase/functions/*/index.ts` son Edge Functions desplegadas por separado (no las importa `src/`, es su naturaleza) — no son código muerto.
- **Falsos positivos esperados (7 de los 13):** `src/preview-*.tsx` (6) + `vite.harness.config.js` (1) son harnesses de desarrollo, deliberadamente sin trackear y fuera del build de producción (patrón establecido en el proyecto) — no son código muerto del producto.
- **Hallazgo real:**

- **[A1-05] media** — `src/auth/crypto.ts` — evidencia: `knip` lo marca como fichero sin ningún import en todo el repo (a diferencia de los harness/Edge Functions, este SÍ es código de producción histórico) — recomendación: es coherente con la migración de Fase 1 (el cliente dejó de hashear/verificar credenciales, todo se mueve a las Edge Functions); el fichero parece haber quedado huérfano tras esa migración. Candidato claro a borrado — verificar en A3/A8 que ningún flujo de auth lo referencia dinámicamente antes de eliminarlo.
- **[A1-06] baja** — `@testing-library/user-event` (devDependency) — evidencia: `knip` no encuentra ningún import de este paquete en el repo — recomendación: o se usa (revisar si algún test debería usarlo para simular interacción de usuario en vez de `fireEvent`) o se retira de `package.json` como limpieza menor.
- **[A1-07] baja** — 39 exports + 11 tipos exportados sin usar fuera de su propio fichero, concentrados en `components/courses.tsx` (17 funciones, todas declaradas con `export function` pero usadas solo internamente) y `components/primitives.tsx` (10) — evidencia: salida de `knip`, sección "Unused exports"/"Unused exported types" — recomendación: no es dead code real (las funciones se usan, solo no hace falta que sean `export`); limpieza de estilo de bajo riesgo, quitar el `export` innecesario donde no se prevea reutilización.

**Assets:** `public/` solo contiene `favicon.svg`, referenciado en `index.html`. No hay `src/assets/` ni imágenes/audio embebidos en el repo (coherente con que el audio vive en Supabase Storage, no en el bundle). Sin hallazgos de assets huérfanos.

---

## 5. Dependencias npm: usadas vs declaradas, desactualizadas, peso

**Usadas vs declaradas:** según `knip` (arriba), 0 dependencias declaradas-pero-no-usadas salvo `@testing-library/user-event` ([A1-06]); 0 dependencias usadas-pero-no-declaradas (`knip` no reportó ninguna sección "Unlisted dependencies").

**Desactualizadas:** ya capturadas en A0 (`npm outdated`, 15 paquetes) — remito a `A0_linea_base.md §4`, análisis de impacto pendiente de A8.

**Peso relativo en disco** (`du -sh node_modules/<pkg>`):

| Paquete | Tipo | Tamaño en disco |
|---|---|---|
| `typescript` | dev | 24 M |
| `jsdom` | dev | 11 M |
| `eslint` | dev | 3.9 M |
| `@fontsource/cormorant-garamond` | prod | 2.2 M |
| `vite` | dev | 2.7 M |
| `@types/node` | dev | 2.5 M |
| `vitest` | dev | 2.1 M |
| `react-dom` | prod | 7.1 M |
| `@fontsource/outfit` | prod | 628 K |
| `@supabase/supabase-js` | prod | 536 K |
| `react` | prod | 231 K |

(Medición del `node_modules` total no completada — `du -sh node_modules` excedió el tiempo de comando; no es relevante para el peso de producción, ver bundle real en A0 §2.4: chunk `supabase` 200.98 kB, `react` 193.83 kB, `index` 284.20 kB, todos gzip'd por debajo de 78 kB.)

Nota: el peso en disco de `node_modules` no se corresponde con el peso en el bundle final (p.ej. `@fontsource/*` pesa 2.8 M en disco entre ambas familias porque incluye variantes woff/woff2 de todos los idiomas/pesos, pero Vite solo emite al `dist/` los subconjuntos realmente usados — ver la lista de `dist/assets/*.woff2` en A0 §2.4).

---

## 6. Estilos inline (`style={{`)

Comando: `grep -rn "style={{" --include="*.tsx" --include="*.ts" src/ | wc -l`

**Total: 1506** ocurrencias en `src/` (frente a las 1.438 registradas como línea base histórica en `AUDITORIA.md` — cifra que A9 deberá contrastar formalmente cruzando con ese documento; aquí se deja solo el dato bruto).

Top-20 por fichero (`grep -rc "style={{" ... | sort -t: -k2 -rn`):

| # | Ocurrencias | Fichero | ¿Importa `primitives`? |
|---|---|---|---|
| 1 | 141 | `components/SchemaExerciseView.tsx` | Sí (8 símbolos) |
| 2 | 136 | `components/teacher.tsx` | Sí (11 símbolos) |
| 3 | 127 | `components/modals.tsx` | Sí (10 símbolos) |
| 4 | 118 | `components/primitives.tsx` (es la propia librería) | — |
| 5 | 101 | `components/correccion/SchemaCorrection.tsx` | Sí (2 símbolos) |
| 6 | 98 | `components/correccion/QuizCorrection.tsx` | Sí (1 símbolo) |
| 7 | 91 | `components/editor/PasoClaves.tsx` | **No** |
| 8 | 84 | `components/courses.tsx` | Sí (3 símbolos) |
| 9 | 79 | `components/auth.tsx` | Sí (8 símbolos) |
| 10 | 56 | `components/session.tsx` | **No** |
| 11 | 53 | `components/ExerciseView.tsx` | Sí (7 símbolos) |
| 12 | 48 | `components/correccion/InteractiveCorrection.tsx` | Sí (3 símbolos) |
| 13 | 42 | `components/editor/PasoAudios.tsx` | Sí (1 símbolo) |
| 14 | 31 | `components/editor/EditorShell.tsx` | Sí (2 símbolos) |
| 15 | 29 | `components/QuestionManagerView.tsx` | Sí (3 símbolos) |
| 16 | 28 | `components/QuestionnaireView.tsx` | Sí (7 símbolos) |
| 17 | 26 | `components/editor/PasoRevision.tsx` | Sí (1 símbolo) |
| 18 | 22 | `components/ExerciseItem.tsx` | Sí (1 símbolo) |
| 19 | 17 | `components/schema/RepeatBand.tsx` | No comprobado (fuera de top-20 de importadores) |
| 20 | 17 | `components/StudentDash.tsx` | Sí (5 símbolos) |

**Contraste con el uso de primitivas:** 18 de los 19 componentes reales (excluyendo `primitives.tsx` mismo y los harness `preview-*`) que superan 20 estilos inline **sí** importan al menos un símbolo de `primitives.tsx`. Sin embargo, importar primitivas no impide el uso masivo de estilos inline: los 3 ficheros con más inline styles (`SchemaExerciseView`, `teacher`, `modals`) importan primitivas y aun así concentran 404 de las 1506 ocurrencias totales (27%).

- **[A1-08] alta** — `src/components/editor/PasoClaves.tsx` (91 estilos inline) y `src/components/session.tsx` (56 estilos inline) — evidencia: `grep -c "primitives" <fichero>` → 0 en ambos; son los dos únicos ficheros del top-20 de estilos inline que **no importan la librería de primitivas en absoluto** — recomendación: insumo directo para A5/PLAN_UNIFICACION — son los candidatos más claros a divergencia visual (tipografías/espaciados/radios) frente al resto de la app, precisamente porque no pasan por el sistema compartido.
- **[A1-09] media** — total de estilos inline (1506) — evidencia: cifra actual 1506 vs 1.438 registrado como línea base en `AUDITORIA.md` (fuente externa al análisis, a confirmar literalmente en A9) — recomendación: si se confirma el aumento, señala que el trabajo de consolidación (extracción a primitivas/tokens) no ha compensado el ritmo de código nuevo con estilos inline; A9 debe decidir si esto entra como "deuda nueva" o simplemente ruido de nuevas features.

---

## Cierre de fase

- ✅ Árbol de `src/` a 2 niveles con recuento de archivos por carpeta.
- ✅ Líneas por archivo (`cloc` + `wc -l`), top-20, `SchemaExerciseView` y 8 ficheros más >600 líneas confirmados con evidencia reproducible.
- ✅ Grafo de imports (`madge`): 1 ciclo detectado, módulos hub identificados (`lib/types.ts` y `theme/tokens.ts`, 38 importadores cada uno).
- ✅ Código muerto (`knip`): 13 "unused files" depurados (12 falsos positivos esperados: Edge Functions + harnesses; 1 hallazgo real, `auth/crypto.ts`), 1 devDependency sin usar, 39+11 exports innecesariamente públicos. Sin assets huérfanos.
- ✅ Dependencias npm usadas/declaradas/desactualizadas/peso capturadas.
- ✅ Estilos inline: 1506 total, tabla top-20 con contraste de uso de primitivas, 2 ficheros identificados sin ningún uso de la librería compartida.

**Hallazgos de esta fase:** 3 altas (A1-01, A1-04, A1-08), 3 medias (A1-02, A1-05, A1-09), 3 bajas (A1-03, A1-06, A1-07). Todas las cifras son reproducibles con el comando indicado junto a cada tabla.
