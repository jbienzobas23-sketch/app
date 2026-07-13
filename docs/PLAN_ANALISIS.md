# PLAN_ANALISIS — Análisis integral de Análisis Auditivo (rama beta)

Plan de análisis multipasos (A0–A9). Solo lectura: ninguna fase modifica código fuente; toda la salida se escribe en `analisis/`. Diseñado para ejecutarse en Claude Code, una fase por sesión, con los `.md` de salida como memoria persistente entre sesiones.

## Reglas transversales

1. **Solo lectura.** El análisis no toca `src/`, `supabase/`, configs ni tests. Únicos archivos nuevos permitidos: dentro de `analisis/`.
2. **Todo hallazgo con evidencia.** Formato estándar: `[A#-NN] severidad (crítica/alta/media/baja) — ubicación (archivo:línea) — evidencia (cita o salida de comando) — recomendación`. Nada especulativo: si no se puede verificar en el repo, no es un hallazgo.
3. **Salida de comandos capturada.** Cada comando ejecutado se pega (recortado si es largo) en el `.md` de la fase, con fecha y commit HEAD.
4. **CVD como criterio transversal.** En toda fase que toque UI, verificar que ninguna información se transmita solo por color (debe haber texto, número, forma o icono acompañante).
5. **Índice vivo.** `analisis/INDICE.md` registra: fase, estado (pendiente/en curso/completa), fecha, commit analizado, nº de hallazgos por severidad. Se actualiza al cerrar cada fase.
6. **Sin dependencias nuevas en el proyecto.** Herramientas de análisis (madge, knip, cloc, visualizer) se ejecutan vía `npx` sin tocar `package.json`.

---

## A0 — Línea base

**Objetivo:** fotografiar el estado actual antes de analizar nada.

Acciones:
- Confirmar rama `beta`, `git log -5 --oneline`, commit HEAD, `git status` limpio.
- Ejecutar los cuatro quality gates (lint, typecheck, test, build) y capturar salida íntegra, incluido el error conocido de `vite.config.js`.
- Versiones: node, npm, vite, react, supabase-js. `npm outdated` y `npm audit` (solo captura, análisis en A8).
- Crear `analisis/` e `analisis/INDICE.md`.

**Entregable:** `analisis/A0_linea_base.md`
**Cierre:** los cuatro gates documentados con su estado real; índice creado.

---

## A1 — Inventario estructural

**Objetivo:** mapa cuantitativo completo del código.

Acciones:
- Árbol de `src/` (2 niveles) con recuento de archivos por carpeta.
- Líneas por archivo (`npx cloc src/` o `wc -l`); tabla top-20 por tamaño. Verificar tamaño actual de `SchemaExerciseView` y de cualquier otro componente >600 líneas.
- Grafo de imports internos: `npx madge --extensions js,jsx src/` — detectar ciclos y módulos hub (muy importados).
- Código muerto: `npx knip` o, si no aplica, grep de exports nunca importados; assets no referenciados.
- Dependencias npm: usadas vs declaradas, desactualizadas (mayor/menor), peso relativo.
- Recuento actualizado de estilos inline (`style={{`) total y por componente; contraste con el uso real de la librería de primitivas (nº de imports de primitivas por componente).

**Entregable:** `analisis/A1_inventario.md` (incluye tablas: top archivos, top estilos inline, ciclos de imports, dead code).
**Cierre:** cifras reproducibles con comando indicado junto a cada tabla.

---

## A2 — Arquitectura y flujo de datos

**Objetivo:** entender cómo está organizada la app, no cuánto ocupa.

Acciones:
- Puntos de entrada, enrutado y árbol de vistas principales (profesor vs alumno).
- Gestión de estado: inventario de contexts, prop drilling significativo (props que atraviesan ≥3 niveles), estado duplicado entre componentes.
- Límites de capas: qué componentes acceden directamente a Supabase vs pasan por `src/lib`; violaciones del principio de funciones puras en `lib`.
- Autopsia de los monolitos: para `SchemaExerciseView` (y cualquier otro >600 líneas), mapa de responsabilidades internas (secciones, estados locales, efectos, handlers) como base para futura descomposición — sin proponer aún la descomposición, solo el mapa.
- Flujo de datos completo de un ejercicio: creación en el wizard → persistencia JSONB → carga → render → corrección → registro de resultado.

**Entregable:** `analisis/A2_arquitectura.md` (incluye diagrama en texto/Mermaid del flujo ejercicio y del árbol de vistas).
**Cierre:** cualquier desarrollador podría localizar dónde vive cada responsabilidad leyendo solo este documento.

---

## A3 — Capa de datos (Supabase)

**Objetivo:** auditar el contrato real entre cliente y base de datos.

Acciones:
- Inventario de accesos: grep de `.from(`, `.rpc(`, `.storage` — tabla de {tabla/función, operación, componente/lib que la usa}.
- Lectores JSONB: localizar todos los puntos de parsing de JSONB y evaluar tolerancia real (¿todo campo tiene fallback? ¿qué pasa con datos históricos de esquemas antiguos?). Listar variantes de esquema JSONB coexistentes detectables en el código.
- Manejo de errores: qué llamadas carecen de manejo de error de red/permiso; qué ve el usuario cuando falla Supabase.
- Auth: flujo de sesión, expiración, rutas protegidas solo en cliente.
- Si el MCP de Supabase está disponible: `list_tables`, `get_advisors` (seguridad y rendimiento) y contraste con el inventario del cliente. RLS: verificar desde los advisors, no desde suposiciones.
- Confirmar que nada en el código presupone migraciones pendientes (convención: sin cambios de esquema).

**Entregable:** `analisis/A3_datos.md`
**Cierre:** tabla completa de accesos y lista de lectores JSONB con veredicto de tolerancia por lector.

---

## A4 — Dominio musical y tests

**Objetivo:** verificar la fiabilidad del núcleo pedagógico.

Acciones:
- Inventario de `src/lib`: función por función, pureza (¿alguna toca Supabase, DOM, Date.now, Math.random sin inyección?).
- Cobertura: `npx vitest run --coverage`; tabla de módulos con cobertura <70% y funciones exportadas sin ningún test.
- Invariantes musicales críticas: cálculo/etiquetado de funciones armónicas (T/S/D), lógica de corrección y evaluación (motor de E0–E6 en la medida en que exista), parsing de esquemas de ejercicio. Para cada invariante: ¿hay test que la proteja? ¿qué casos límite faltan (enarmonías, compases irregulares, ejercicios vacíos, respuestas parciales)?
- Consistencia entre editor y corrector: ¿puede el wizard producir un ejercicio que el corrector no sepa evaluar?

**Entregable:** `analisis/A4_dominio_tests.md` (incluye lista priorizada de tests que faltan, con esbozo de casos).
**Cierre:** cada función exportada de `lib` clasificada: testeada / parcial / sin test, con riesgo asociado.

---

## A5 — UI, accesibilidad CVD y móvil

**Objetivo:** auditoría de experiencia de uso con la accesibilidad daltónica como criterio no negociable.

Acciones:
- **Color-only audit (prioritaria):** localizar todo render condicional que cambie solo color (clases/estilos con verde/rojo/ámbar, estados correcto/incorrecto, indicadores T/S/D) y verificar acompañamiento de texto/icono/forma. Tabla exhaustiva: {componente, información transmitida, canal de color, canal redundante sí/no}.
- Estados de interfaz: por vista principal, verificar existencia de estado de carga, vacío y error.
- Teclado y ARIA: controles de audio (hold-to-record incluido), wizard, cuaderno — operabilidad sin ratón, labels, roles, focus visible.
- Responsive: patrones problemáticos en móvil (anchos fijos, tablas sin scroll, targets táctiles pequeños, hold-to-record en touch).
- Coherencia visual: divergencias entre primitivas y estilos inline que producen inconsistencias visibles (tipografías, espaciados, radios duplicados con valores distintos) — insumo directo para PLAN_UNIFICACION.

**Entregable:** `analisis/A5_ui_accesibilidad.md`
**Cierre:** tabla color-only completa; todo canal sin redundancia marcado como hallazgo de severidad alta como mínimo.

---

## A6 — Audio

**Objetivo:** auditar el pipeline de audio de extremo a extremo.

Acciones:
- Mapa del pipeline: captura (getUserMedia/MediaRecorder o Web Audio), hold-to-record y su latencia de arranque, reproducción, generación de waveform, sincronización marca-tiempo↔audio.
- Gestión de recursos: creación/revocación de object URLs y AudioContexts, listeners no limpiados, fugas al desmontar componentes.
- Permisos: flujo de denegación de micrófono y qué ve el usuario.
- Compatibilidad: patrones problemáticos en Safari/iOS (autoplay, AudioContext suspendido, formatos de grabación), touch vs mouse en hold-to-record.
- Almacenamiento: subida/descarga de audio en Supabase Storage, tamaños, ausencia de compresión, carga diferida.

**Entregable:** `analisis/A6_audio.md`
**Cierre:** pipeline diagramado y cada etapa con veredicto (sólida / frágil / rota) y evidencia.

---

## A7 — Rendimiento y build

**Objetivo:** medir lo que pesa y detectar lo que re-renderiza de más.

Acciones:
- Bundle: `npx vite-bundle-visualizer` (o rollup-plugin-visualizer efímero vía config temporal en `analisis/`, no en `vite.config.js`); tabla de chunks, top imports por peso, dependencias que deberían ser lazy.
- Code splitting: qué rutas/vistas cargan en el chunk inicial sin necesitarlo.
- Análisis estático de renders: objetos/arrays/funciones creados inline en props de componentes pesados, listas sin key estable, contexts cuyo value se recrea en cada render, ausencia de memo en hojas caras (waveform, listas de ejercicios).
- Audio y datos: cargas de audio no diferidas, consultas Supabase repetidas sin cache, waterfalls de peticiones.
- Tiempo de build y de test como métrica de línea base.

**Entregable:** `analisis/A7_rendimiento.md`
**Cierre:** top-10 de optimizaciones ordenadas por (impacto estimado / esfuerzo), cada una con evidencia.

---

## A8 — Seguridad

**Objetivo:** superficie de riesgo del cliente.

Acciones:
- Secretos: grep de claves en el repo e historial reciente; confirmar que solo hay anon key (pública por diseño) y jamás service_role; variables de entorno bien delimitadas.
- Validación de entrada: qué campos del wizard/editor llegan a JSONB sin validar; límites de tamaño; contenido generado por usuarios que se renderiza (¿algún `dangerouslySetInnerHTML`?).
- Autorización: qué operaciones dependen solo de ocultación en UI (botones de profesor) sin respaldo en RLS (cruzar con advisors de A3).
- `npm audit` analizado (no solo capturado): vulnerabilidades con vector real en este contexto vs ruido.
- Storage: políticas de acceso a audios (¿un alumno puede acceder a audios de otro por URL?).

**Entregable:** `analisis/A8_seguridad.md`
**Cierre:** hallazgos clasificados por explotabilidad real, no por severidad teórica del CVE.

---

## A9 — Cruce con planes y síntesis final

**Objetivo:** consolidar todo en un informe accionable y contrastarlo con la planificación existente.

Acciones:
- Leer AUDITORIA.md, PLAN_MAESTRO_2, PLAN_EVALUACION.md (E0–E6) y PLAN_UNIFICACION.md. Para cada fase planificada: estado real verificado en el código (hecha / parcial / no iniciada / contradicha por el código).
- Deuda nueva: hallazgos A1–A8 no recogidos en AUDITORIA.md.
- Deuda resuelta: puntos de AUDITORIA.md ya corregidos (verificar el estado actual del lint de `vite.config.js` y el recuento de estilos inline contra las cifras originales: error de lint, 1.438 inline, 1.859 líneas del monolito).
- Matriz global: todos los hallazgos críticos y altos en una tabla impacto × esfuerzo, con dependencias entre ellos.
- Secuencia recomendada: lista ordenada de acciones concretas (con referencia a fase de plan existente cuando aplique: "esto es U3", "esto precede a E2"), respetando las convenciones (JSONB tolerante, sin migraciones, forward-only, gates verdes).
- Actualizar `analisis/INDICE.md` a estado final.

**Entregables:** `analisis/INFORME_ANALISIS.md` (síntesis ejecutiva + matriz + secuencia) y `analisis/INDICE.md` cerrado.
**Cierre:** el informe permite decidir el próximo mes de trabajo sin releer las fases individuales.

---

## Ejecución en Claude Code

- **Una fase por sesión.** Al terminar una fase: commit de `analisis/` (`analisis: fase A# completa`), `/clear`, siguiente fase. Los `.md` son la memoria entre sesiones; ninguna fase depende del contexto de la anterior, solo de sus entregables.
- **Orden:** A0→A1→A2 son secuenciales. A3–A8 pueden hacerse en cualquier orden (A3 antes que A8 es preferible por los advisors). A9 requiere todas las anteriores.
- **Duración estimada:** A0 corta; A1, A3, A5 medias; A2, A4, A6, A7, A8 medias-largas; A9 larga. Si una fase agota contexto, dividir su entregable en `A#_parte1.md` / `A#_parte2.md` y continuar en sesión nueva.

### Prompt maestro (pegar en Claude Code, sustituyendo N)

```
Lee analisis/INDICE.md y PLAN_ANALISIS.md. Ejecuta íntegramente la fase A[N] del plan.
Reglas estrictas: solo lectura del código fuente; toda salida en analisis/; cada hallazgo
con formato [A[N]-NN] severidad — archivo:línea — evidencia — recomendación; salida de
comandos capturada con fecha y commit HEAD; herramientas externas solo vía npx sin
modificar package.json; la accesibilidad CVD (nada transmitido solo por color) es
criterio transversal. Al terminar: escribe el entregable de la fase, actualiza
analisis/INDICE.md, verifica el criterio de cierre y detente. No inicies la fase siguiente.
```
