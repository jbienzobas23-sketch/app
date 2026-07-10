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

