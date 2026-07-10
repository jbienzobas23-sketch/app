# A0 — Línea base

**Fecha:** 2026-07-09
**Rama:** `beta`
**Commit HEAD analizado:** `f263089a1ef0e70f2fb2902839e891cca6afe52a` (`f263089`)
**Entorno de ejecución:** Windows 11, PowerShell 5.1, repo local `C:\Users\bienz\app`

---

## 1. Estado de git

```
$ git branch --show-current
beta

$ git rev-parse HEAD
f263089a1ef0e70f2fb2902839e891cca6afe52a

$ git log -5 --oneline
f263089 refactor(a2.3): adelgaza App.tsx extrayendo la capa de datos y el submit a hooks
c3c5bb8 docs(m4.1): limpia las referencias a MultiModel/MultiPartSessionView en comentarios
88327e5 fix(lint): globals de Node para ficheros de configuración
7fe9541 fix(híbridos): preguntas de cuestionario desaparecían en ejercicios de una parte
2ac53b3 fix(esquema): playhead invisible en repeticiones, regla reiniciada a 0 e imán entre repeticiones

$ git status
On branch beta
Your branch is ahead of 'origin/beta' by 3 commits.
  (use "git push" to publish your local commits)

Untracked files:
  (use "git add <file>..." to include in what will be committed)
	preview-cursos.html
	preview-exerciseitem.html
	preview-interactivo.html
	preview-menu.html
	preview-minimap.html
	preview-sessionshell.html
	src/preview-cursos.tsx
	src/preview-exerciseitem.tsx
	src/preview-interactivo.tsx
	src/preview-menu.tsx
	src/preview-minimap.tsx
	src/preview-sessionshell.tsx
	vite.harness.config.js

nothing added to commit but untracked files present (use "git add" to track)

$ git log origin/beta -1 --oneline
7fe9541 fix(híbridos): preguntas de cuestionario desaparecían en ejercicios de una parte
```

**Interpretación:** working tree limpio en el sentido estricto (sin cambios a ficheros trackeados sin commitear), pero **no coincide con `origin/beta`** (3 commits locales sin push: `f263089`, `c3c5bb8`, `88327e5`) y tiene 13 ficheros sin trackear, todos harness de previsualización dev-only (`preview-*.html`, `src/preview-*.tsx`, `vite.harness.config.js`) — patrón ya establecido en el proyecto (harnesses efímeros no versionados, confirmado consistente en todas las sesiones previas).

- **[A0-01] media** — repo raíz — evidencia: `git status` → "ahead of 'origin/beta' by 3 commits" — recomendación: antes de dar por buenas conclusiones de este análisis frente al código en GitHub/CI, tener en cuenta que el análisis se hace sobre HEAD local (`f263089`), 3 commits por delante de lo que ve cualquiera que clone `origin/beta`. Si el análisis debe reflejar "lo desplegable", decidir si pushear antes de cerrar A9.

---

## 2. Quality gates

Los cuatro comandos se ejecutaron tal cual están definidos en `package.json` (`lint`, `typecheck`, `test`, `build`), sobre el commit `f263089`.

### 2.1 Lint — `npm run lint` (`eslint .`)

```
> funciones-armonicas@0.1.0 lint
> eslint .

(sin salida — 0 problemas)
```
**Exit code: 0.**

**Hallazgo de deuda resuelta:** el plan de análisis (regla transversal y su plantilla A9) esperaba encontrar "el error conocido de `vite.config.js`" (2 `no-undef` preexistentes, citado también en memoria de sesiones anteriores hasta el 2026-07-06). **Ya NO existe**: el commit `88327e5 fix(lint): globals de Node para ficheros de configuración` (incluido en este HEAD, sin pushear a origin) lo corrigió. A9 deberá registrar esto como deuda de `AUDITORIA.md` ya resuelta.

### 2.2 Typecheck — `npm run typecheck` (`tsc --noEmit`)

```
> funciones-armonicas@0.1.0 typecheck
> tsc --noEmit

(sin salida — 0 errores)
```
**Exit code: 0.**

### 2.3 Test — `npm run test` (`vitest run`)

```
> funciones-armonicas@0.1.0 test
> vitest run

 RUN  v4.1.8 C:/Users/bienz/app

Not implemented: Window's scrollTo() method   [repetido ~10 veces]

 Test Files  14 passed (14)
      Tests  196 passed (196)
   Start at  21:38:28
   Duration  3.81s (transform 1.72s, setup 4.09s, import 2.51s, tests 989ms, environment 28.56s)
```
**Exit code: 0.** 14 ficheros de test, 196 tests, todos en verde.

- **[A0-02] baja** — suite de tests (jsdom) — evidencia: `Not implemented: Window's scrollTo() method` repetido ~10 veces en stderr durante `vitest run` — recomendación: es una limitación conocida de jsdom (no implementa `scrollTo`), no un fallo funcional (exit code 0, 196/196 verdes). Si algún test depende implícitamente de que `scrollTo` haga algo, revisar en A4; si no, considerar un stub de `window.scrollTo` en `setupTests.ts` solo para silenciar ruido en CI.

### 2.4 Build — `npm run build` (`vite build`)

```
> funciones-armonicas@0.1.0 build
> vite build

vite v6.4.2 building for production...
transforming...
✓ 144 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                                    0.83 kB │ gzip:  0.42 kB
dist/assets/vendor-BMIE80IC.css                    15.10 kB │ gzip:  1.51 kB
dist/assets/vendor-BCyZI2sy.js                      6.17 kB │ gzip:  1.87 kB
dist/assets/QuestionManagerView-DRi_9hvJ.js         8.42 kB │ gzip:  3.45 kB
dist/assets/SchemaExerciseView-DzmFEksZ.js         69.34 kB │ gzip: 17.97 kB
dist/assets/teacher-DgZgXrc6.js                    87.27 kB │ gzip: 23.27 kB
dist/assets/react-Clbal_GG.js                     193.83 kB │ gzip: 60.55 kB
dist/assets/supabase-DZbQxYSG.js                  200.98 kB │ gzip: 51.99 kB
dist/assets/index-BpuvFw24.js                     284.20 kB │ gzip: 77.15 kB
✓ built in 1.23s
(+ ~65 ficheros de fuentes woff/woff2, 6–33 kB cada uno, omitidos aquí por brevedad — ver salida íntegra más abajo)
```
**Exit code: 0.** Build correcto, code-splitting activo (chunks `react`, `supabase`, `teacher`, `SchemaExerciseView`, `QuestionManagerView` separados del `index` principal — confirma lo registrado como hecho en Fase 6/M-plan). Ningún chunk individual de JS supera 500 kB (el mayor es `index-BpuvFw24.js` con 284.20 kB); ningún aviso de tamaño en la salida.

**Resumen gates:**

| Gate | Comando | Exit code | Resultado |
|---|---|---|---|
| Lint | `npm run lint` | 0 | 0 problemas |
| Typecheck | `npm run typecheck` | 0 | 0 errores |
| Test | `npm run test` | 0 | 196/196 tests, 14 ficheros |
| Build | `npm run build` | 0 | OK, 144 módulos, sin chunk >500 kB |

---

## 3. Versiones

```
$ node --version
v24.15.0

$ npm --version
11.12.1

$ npm list vite --depth=0
funciones-armonicas@0.1.0 C:\Users\bienz\app
`-- vite@6.4.2

$ npm list react react-dom --depth=0
funciones-armonicas@0.1.0 C:\Users\bienz\app
+-- react-dom@19.2.6
`-- react@19.2.6

$ npm list @supabase/supabase-js --depth=0
funciones-armonicas@0.1.0 C:\Users\bienz\app
`-- @supabase/supabase-js@2.105.4

$ npm list typescript --depth=0
funciones-armonicas@0.1.0 C:\Users\bienz\app
`-- typescript@6.0.3
```

Versiones declaradas en `package.json` (rangos `^`) vs resueltas en `node_modules`:

| Paquete | Declarado | Resuelto |
|---|---|---|
| node | — (runtime) | v24.15.0 |
| npm | — (runtime) | 11.12.1 |
| vite | ^6.3.5 | 6.4.2 |
| react / react-dom | ^19.1.0 | 19.2.6 |
| @supabase/supabase-js | ^2.105.4 | 2.105.4 |
| typescript | ^6.0.3 | 6.0.3 |

---

## 4. `npm outdated` (solo captura — análisis de impacto en A8)

```
Package                      Current   Wanted   Latest  Location                                  Depended by
@eslint/js                    9.39.4   9.39.4   10.0.1  node_modules/@eslint/js                   app
@supabase/supabase-js        2.105.4  2.110.2  2.110.2  node_modules/@supabase/supabase-js        app
@types/node                   25.9.1   25.9.5   26.1.1  node_modules/@types/node                  app
@types/react                 19.2.16  19.2.17  19.2.17  node_modules/@types/react                 app
@vitejs/plugin-react           4.7.0    4.7.0    6.0.3  node_modules/@vitejs/plugin-react         app
eslint                        9.39.4   9.39.4   10.6.0  node_modules/eslint                       app
eslint-plugin-react-hooks      5.2.0    5.2.0    7.1.1  node_modules/eslint-plugin-react-hooks    app
eslint-plugin-react-refresh   0.4.26   0.4.26    0.5.3  node_modules/eslint-plugin-react-refresh  app
globals                      15.15.0  15.15.0   17.7.0  node_modules/globals                      app
react                         19.2.6   19.2.7   19.2.7  node_modules/react                        app
react-dom                     19.2.6   19.2.7   19.2.7  node_modules/react-dom                    app
typescript                     6.0.3    6.0.3    7.0.2  node_modules/typescript                   app
typescript-eslint             8.60.1   8.63.0   8.63.0  node_modules/typescript-eslint            app
vite                           6.4.2    6.4.3    8.1.4  node_modules/vite                         app
vitest                         4.1.8   4.1.10   4.1.10  node_modules/vitest                       app
```
(exit code 1 — comportamiento normal de `npm outdated` cuando hay paquetes desactualizados, no es un fallo)

15 paquetes con actualización disponible, todos `devDependencies` salvo `@supabase/supabase-js`, `react` y `react-dom` (producción). Ninguno se actualiza en esta fase (solo lectura); análisis de riesgo/beneficio en A8.

---

## 5. `npm audit` (solo captura — análisis de explotabilidad real en A8)

```
# npm audit report

@babel/core  <=7.29.0
@babel/core: Arbitrary File Read via sourceMappingURL Comment - https://github.com/advisories/GHSA-4x5r-pxfx-6jf8
fix available via `npm audit fix`
node_modules/@babel/core

undici  7.0.0 - 7.27.2
Severity: high
undici vulnerable to TLS certificate validation bypass via dropped requestTls in SOCKS5 ProxyAgent - https://github.com/advisories/GHSA-vmh5-mc38-953g
undici vulnerable to HTTP header injection via Set-Cookie percent-decoding - https://github.com/advisories/GHSA-p88m-4jfj-68fv
undici WebSocket client vulnerable to denial of service via fragment count bypass - https://github.com/advisories/GHSA-vxpw-j846-p89q
undici vulnerable to cross-origin request routing via SOCKS5 proxy pool reuse - https://github.com/advisories/GHSA-hm92-r4w5-c3mj
undici vulnerable to HTTP response queue poisoning via keep-alive socket reuse - https://github.com/advisories/GHSA-35p6-xmwp-9g52
undici vulnerable to Set-Cookie SameSite attribute downgrade via permissive substring matching - https://github.com/advisories/GHSA-g8m3-5g58-fq7m
undici vulnerable to cross-user information disclosure via shared cache whitespace bypass - https://github.com/advisories/GHSA-pr7r-676h-xcf6
fix available via `npm audit fix`
node_modules/undici

vite  <=6.4.2
Severity: high
launch-editor: NTLMv2 hash disclosure via UNC path handling on Windows - https://github.com/advisories/GHSA-v6wh-96g9-6wx3
vite: `server.fs.deny` bypass on Windows alternate paths - https://github.com/advisories/GHSA-fx2h-pf6j-xcff
fix available via `npm audit fix`
node_modules/vite

3 vulnerabilities (1 low, 2 high)

To address all issues, run:
  npm audit fix
```
(exit code 1 — comportamiento normal de `npm audit` cuando hay hallazgos)

3 vulnerabilidades (1 baja, 2 altas), las tres en dependencias de **build/desarrollo** (`@babel/core` vía toolchain de test, `undici` vía dependencia transitiva, `vite`/`launch-editor` vía servidor de dev). Ninguna es una dependencia que se sirva al navegador del usuario final en producción. Veredicto de explotabilidad real (superficie: máquina de desarrollo, no runtime de producción) queda para A8; aquí solo se deja constancia.

---

## 6. Índice creado

Se crea `analisis/INDICE.md` (ver fichero) con el registro de fases.

---

## Cierre de fase

- ✅ Rama confirmada: `beta`.
- ✅ `git log -5`, HEAD y estado de `git status` documentados (incluida la divergencia con `origin/beta`, ver [A0-01]).
- ✅ Los cuatro quality gates ejecutados con salida capturada — los cuatro en verde; el error de lint de `vite.config.js` que el plan esperaba encontrar **ya no existe** (resuelto en `88327e5`, sin pushear).
- ✅ Versiones de node/npm/vite/react/supabase-js capturadas.
- ✅ `npm outdated` y `npm audit` capturados (sin analizar).
- ✅ `analisis/` e `analisis/INDICE.md` creados.

**Hallazgos de esta fase:** 1 media (A0-01), 1 baja (A0-02). Ningún hallazgo crítico ni alto — línea base sana para empezar A1.
