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

