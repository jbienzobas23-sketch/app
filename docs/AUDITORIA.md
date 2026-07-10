# AUDITORÍA — Funciones Armónicas (base: rama `beta`, commit `7fe9541`)

## 0 · Estado de partida (verificado sobre `7fe9541`)

Cuatro puertas ejecutadas sobre el HEAD real, no supuestas:

- **lint — ROJO.** 2 errores `'process' is not defined` en `vite.config.js:8`. Único fallo; `src` limpio.
- **typecheck — verde.** `tsc --noEmit` sin salida.
- **test — verde.** 14 ficheros, 196 tests. Cobertura concentrada en `src/lib` (dominio, scoring, harmony, routing, palette, color, audio).
- **build — verde.** 4.77 s. Code-splitting activo: chunks lazy `teacher` (87 KB) y `SchemaExerciseView` (69 KB); `index` 282 KB / 76 KB gz.

Volumen: 18.484 líneas TS/TSX en 71 ficheros (35 `.ts` + 36 `.tsx`) + 9 `.js`. Backend endurecido (edge functions de auth + secuencia RLS: helpers, harden anon grants, drop legacy policies, citext a extensions). Stack sin deuda de versiones (React 19.1, Vite 6.3, TS 6.0, Vitest 4.1).

Métricas de deuda que gobiernan las fases:

| Métrica | Valor | Objetivo |
|---|---|---|
| `style={{` inline en `src/components` | 1438 | ↓↓ sostenido |
| ficheros que importan `primitives` (44 primitivos exportados) | 18 | ↑ |
| `SchemaExerciseView.tsx` | 1859 líneas · 1 comp · 38 hooks | trocear |
| `App.tsx` | 1189 líneas · 4 comp · 30 hooks | adelgazar |
| `MultiModelSessionView` + `MultiPartSessionView` (M4.1 abierta) | 12 | 0 |
| planes referenciados ausentes del repo | 4 | 0 |

Estado M-plan inferido de sus condiciones `Verifica` sobre el código: **M0.5, M1.2, M1.3 y M5.6 = hechas** (grep = 0). **M4.1 pendiente** (12 ocurrencias).

## 1 · Reglas de oro (invariantes que la remediación no rompe)

- Forward-only; sin migraciones de esquema Supabase; lectores JSONB tolerantes.
- Toda información activa lleva señal **no cromática** junto al color (forma, cifra, texto, patrón). Restricción dura.
- Lógica pura en `src/lib` con test Vitest; el pintado no.
- **Las cuatro puertas verdes antes de cada commit.** Ninguna fase cierra con una en rojo.
- Cada tarea cierra con `Verifica:` comprobable (grep, exit code, recuento).

## 2 · Vista de fases

| Fase | Objetivo | Esfuerzo | Prioridad |
|---|---|---|---|
| A0 | Restaurar las cuatro puertas (lint) | trivial | 1 — bloquea todo |
| A1 | `SessionShell` sin remontaje (= M4.1) | alto | 2 — mayor retorno UX |
| A2 | Consumo de primitivos + troceado de monolitos | alto, incremental | 3 |
| A3 | Barrido a11y de bandas de score | bajo | 4 |
| A4 | Commitear los planes vivos | trivial | 5 |

## FASE A0 · Restaurar las cuatro puertas

**A0.1 — Globals de Node en ficheros de configuración.** El bloque `**/*.{js,jsx}` de `eslint.config.js` solo inyecta `globals.browser`, y `vite.config.js` usa `process.env.PORT`. Añadir un bloque específico al final del array de `eslint.config.js`:

```js
{
  files: ['**/*.config.{js,ts}'],
  languageOptions: { globals: { ...globals.node } },
},
```

Verifica: `npm run lint` exit 0; `npm run typecheck && npm run test && npm run build` verdes; commit único.

## FASE A1 · `SessionShell` sin remontaje

M4.1 de PLAN_MAESTRO_2 sigue sin ejecutar (12 ocurrencias). Es la fase abierta con más impacto: elimina el remontaje y el parpadeo al alternar modelo/parte. La especificación completa ya está en PLAN_MAESTRO_2 §M4.1 (montado permanente, `drafts[partId][modelId]` único, prop `active` que pausa rAF/ignora Espacio en vistas ocultas, precalentamiento del chunk de esquema, `?parte=` como única convención). No se reescribe aquí.

Verifica (la del propio M4.1): `grep -rn "MultiModelSessionView\|MultiPartSessionView" src` = 0; Paint flashing limpio en 20 toggles con audio sonando; primer cambio a esquema bajo Slow 3G sin blanco ni «Cargando…»; borradores intactos en toda combinación parte×modelo; cuatro puertas verdes.

## FASE A2 · Consumo de primitivos y troceado de monolitos

Núcleo de la deuda de mantenibilidad. Incremental: cada sub-tarea es un PR que deja las puertas verdes y reduce una métrica del §0. Sin cambio visual en ninguna.

**A2.1 — Trocear `SchemaExerciseView.tsx`.** 1859 líneas en un único componente con 38 hooks: es el peor caso del repo. Extraer la lógica a hooks (`hooks/useSchemaEditor` y `hooks/useSchemaZoom` ya existen — absorber lo que aún viva en el componente) y partir el render en subcomponentes por banda/región (`schema/RepeatBand.tsx` ya está fuera; seguir el patrón). El fichero queda como shell de composición.
Verifica: `find src/components -name "*.tsx" -exec wc -l {} + | awk '$1>600'` vacío salvo revisión explícita; recorrido de esquema idéntico al actual; test de las funciones/hooks extraídos.

**A2.2 — Campaña de consumo de primitivos.** 1438 `style={{}}` frente a 44 primitivos exportados usados en solo 18 ficheros: la biblioteca existe y está infraconsumida. Barrer por fichero reemplazando estilos inline repetidos por primitivos/tokens (`C`, `S`, `F` de `theme/tokens`), empezando por los de mayor densidad (`teacher`, `modals`, `session`).
Verifica: `grep -rn "style={{" src/components | wc -l` baja por PR con presupuesto acordado (p. ej. −200/PR); nº de ficheros que importan `primitives` sube; sin regresión visual.

**A2.3 — Adelgazar `App.tsx`.** 1189 líneas · 30 hooks: extraer la capa de datos/routing a hooks dedicados, dejando `App` como cableado.
Verifica: `App.tsx` < ~600 líneas; typecheck y test verdes; recorrido de arranque y rutas intacto.

## FASE A3 · Barrido a11y de bandas de score

Único punto del código donde el color podría quedar solo: `scoreColor`/`scoreBg` en `lib/color.ts` codifican las bandas 80 / 50 / menos por color. Es seguro únicamente si toda banda va acompañada de la cifra o un símbolo no cromático. (El resto está cubierto: placas/glifos por modelo en `TypePlate`/`ModelPlate` + `MODEL_META`, 37 `aria-label`, 48 `role=`, 84 `title=`, `rowButtonProps`.)

**A3.1 — Garantizar señal no cromática en cada uso.** Localizar todos los consumidores de `scoreColor`/`scoreBg` y confirmar que el número (o un símbolo, tipo el `▾` del cuaderno) se pinta siempre al lado. Donde no, añadirlo.
Verifica: cada render de banda incluye cifra o símbolo; `grep -rn "scoreColor\|scoreBg" src` revisado uno a uno; PR con el listado de sitios y su señal.

## FASE A4 · Commitear los planes vivos

`PLAN_UNIFICACION.md`, `PLAN_EVALUACION.md`, `plan_placas_hibridas.md` y `plan_obra.md` están referenciados en PLAN_MAESTRO_2 pero **ausentes del repo** — solo viven en local. Riesgo de pérdida de la hoja de ruta al cambiar de máquina.

**A4.1 — Versionar los planes.** Mover los cuatro a `docs/` (o a raíz, como `PLAN_MAESTRO_2.md`) y commitear.
Verifica: los cuatro ficheros existen en el árbol; las referencias cruzadas de PLAN_MAESTRO_2 resuelven a ficheros presentes; `git status` limpio.

## Verificación final del programa

Cuatro puertas verdes de forma estable; `SchemaExerciseView.tsx` y `App.tsx` bajo el umbral de líneas; `MultiModelSessionView`/`MultiPartSessionView` = 0; `style={{` en `src/components` reducido de forma sostenida y `primitives` consumido en más ficheros; toda banda de score con señal no cromática; planes vivos versionados en el repo.
