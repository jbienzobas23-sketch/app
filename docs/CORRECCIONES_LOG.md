# CORRECCIONES_LOG

**Plan:** [`docs/PLAN_CORRECCIONES.md`](./PLAN_CORRECCIONES.md)
**Inicio de sesión:** 2026-07-10
**HEAD de partida:** `de3527c` (rama `beta`, ahead de `origin/beta` por 10 commits)
**D4 (descenso de contenido en prod):** confirmada por Jon como limpieza deliberada — no bloquea el arranque del plan.

## Línea base (C0.1)

| Puerta | Resultado |
|---|---|
| lint | 0 errores |
| typecheck | 0 errores |
| test | 196/196 (14 ficheros) |
| build | OK — `dist/assets/index-BpuvFw24.js` 284.20 kB (coincide con línea base A7) |

## Registro de tareas

| Tarea | Commit | Puertas | Incidencias | Verificación MANUAL pendiente |
|---|---|---|---|---|
| C0.1 | (sin commit, verificación) | lint 0 / typecheck 0 / test 196/196 / build OK | ninguna | — |
| C0.2 | `8bbbd7d` | lint 0 / typecheck 0 / test 196/196 / build OK | ninguna | — |
| C1.1 | `ba113d0` | lint 0 / typecheck 0 / test 199/199 / build OK (284.23 kB) | test rojo confirmado antes del fix (3 tests fallaban por `serializeIntervals` inexistente); ninguna otra incidencia | — |
| C1.2 | `57d3b8c` | lint 0 / typecheck 0 / test 199/199 / build OK (284.24 kB) | ninguna | **[MANUAL]** Jon: entrar, salir, recargar → debe aparecer login (no datos del usuario anterior); `localStorage` sin token `sb-*` |
| C1.3 | `6141667` | lint 0 / typecheck 0 / test 199/199 / build OK (284.31 kB) | ninguna; grep confirma que la rama 200 conserva "Correo enviado" | — |
| C1.6 | `f5a187d` | lint 0 / typecheck 0 / test 199/199 / build OK | `grep "components/modals" src/App.tsx` → 0 (cumple). `modals.tsx` ahora es su propio chunk async (`modals-*.js`, 28.66 kB) cargado solo por teacher/QuestionManagerView (ya lazy). **Bundle inicial: 284.31 kB → 255.92 kB, −28.39 kB.** No alcanza el objetivo ≥40 kB del informe (A7-04 estimaba "rendered" 54,1 kB, pero buena parte de eso son primitivas (`Overline`/`CtaButton`/`GhostButton`/`FieldLabel`) que ya vivían en el chunk inicial vía otros importadores — el ahorro real es solo el código exclusivo de `modals.tsx`. Cambio correcto y con el comportamiento intacto; no se fuerza extracción adicional fuera del alcance de la tarea. | — |
| C1.7 | `68ad7bb` | lint 0 / typecheck 0 / test 199/199 / build OK | **Incidencia relevante:** el gate `import.meta.env.DEV ? … : null` (incluso puesto en la MISMA expresión que la referencia, tal como sugiere el plan) NO basta para que Rollup pode `localSeed.ts` — verificado empíricamente con `git stash`/A/B: con ese gate el literal único `local-grados-cifrado` seguía en `index-*.js`, byte a byte idéntico al build sin el fix. Causa: Rollup mantiene un export "vivo" si CUALQUIER referencia alcanzable existe en el grafo, sin evaluar si la rama es constante-falsa; solo el minificador plegaría el ternario, pero para entonces Rollup ya decidió incluir el módulo. Se aplicó el fallback que el propio plan prevé: `import()` dinámico (en `App.tsx` para el usuario inicial + selector, y en `useAppData.ts` para exercises/users/results/courses/units/groups), con estado inicial vacío y población async en un `useEffect`. Verificado: `grep -r "local-grados-cifrado\|local-profe\|Lucía Arrieta" dist/assets/` → 0 coincidencias en NINGÚN asset (no solo index.js); de hecho no se genera ni siquiera un chunk `localSeed-*.js` — Rollup elimina el `import()` por completo, no solo lo separa. `index-*.js`: 255.92 kB → 253.07 kB. Verificación opcional en navegador (`npm run dev` + `?local`, puerto 5174 vía `cards`): confirmado con capturas — el profesor local carga con los ejercicios de la semilla (Coral BWV 227, Bourrée, Escucha global) sin errores de consola; el único cambio de comportamiento es un tick asíncrono adicional para poblar el estado (antes síncrono), irrelevante para una herramienta solo-dev. | **[MANUAL opcional]** Jon: `npm run dev` + `?local` y `?local=alumno` — confirmar que el selector de usuario y el resto de la app local siguen funcionando igual que antes (ya verificado por Claude Code, pendiente de tu ojo). |
| C1.8 | `3f369b9` | lint 0 / typecheck 0 / test 199/199 / build OK / `madge --circular` → 0 ciclos | El harness `src/preview-menu.tsx` (sin trackear, §1.9) importaba `KebabMenu` de `courses.jsx`; se actualizó su import localmente para no romper el harness, pero se dejó fuera de git (`git restore --staged`) tal como manda la regla — no se añade ni se borra. | — |

