# A8 — Seguridad

**Fecha:** 2026-07-10 · **Rama:** `beta` · **Commit HEAD:** `f263089a1ef0e70f2fb2902839e891cca6afe52a` (código fuente idéntico a A0–A7; `analisis/` va por `9413864`)
**Método:** grep de secretos en repo e historial (`git grep`, `git log -S`), lectura de las 5 Edge Functions, `npm audit --json` con clasificación por árbol de dependencias, cruce con los advisors de RLS de A3. Sin escrituras en ningún entorno.

**Criterio (regla del plan): los hallazgos se clasifican por explotabilidad REAL en este contexto, no por severidad teórica del CVE.**

---

## 1. Secretos

- **Sin secretos en el repo.** `service_role` aparece **solo** en las 5 Edge Functions vía `Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")` (auto-inyectada por Supabase en runtime) y en `supabase/README.md` como nota. Cero claves privadas, cero `sk_`, cero `BEGIN PRIVATE KEY`.
- **`.env` está en `.gitignore`** (verificado: `git check-ignore .env` → positivo); solo `.env.example` trackeado. El historial (`git log -S "service_role"`) solo toca los commits de las Edge Functions y el doc de análisis — nunca una clave real.
- **La anon key SÍ está en el bundle** (fallback embebido en `supabase.ts:11-12` + variable de entorno). **Correcto por diseño:** es pública, y con RLS activo (A3) no concede acceso a datos por sí sola. El JWT anon tiene `exp` en 2094 — normal para una anon key.
- **`fa_user_secrets.auth_password` se guarda en texto plano** (la contraseña aleatoria del usuario Auth `@fa.local`, necesaria para que `login` re-inicie sesión). Es una propiedad inherente de la Opción A, **gateada a `service_role`** (RLS sin políticas, verificado A3) y documentada. No es fuga: quien tenga `service_role` ya controla toda la BD.

**Veredicto:** limpio. La única "clave" en el cliente es la anon, pública por diseño.

---

## 2. Validación de entrada y contenido generado por usuarios

### XSS almacenado: NO explotable
- **Cero `dangerouslySetInnerHTML`, `innerHTML`, `eval`, `new Function`** en todo `src/` (grep). Todo el contenido de usuario (títulos de ejercicio, enunciados de pregunta, nombres, etiquetas) se renderiza como **children de React → auto-escapado**. Un enunciado con `<script>` se muestra literal, no se ejecuta. La superficie clásica de XSS almacenado está cerrada.

### Escritura JSONB sin validación de esquema (mitigada por RLS)
- `data/db.ts` sube formas arbitrarias a las tablas `fa_*` sin validar campos ni tipos; la app confía en los lectores tolerantes (A3 §2). **Mitigación real:** RLS gatea *quién* escribe cada tabla (staff para exercises/courses/units/categories/audio; solo el propio alumno para sus results — A3 §5). Un alumno no puede corromper el catálogo; a lo sumo escribe basura en su propia fila de `fa_results`, que sus lectores toleran.
- **Sin límite de tamaño de JSONB** en cliente ni servidor → un profesor (o cuenta staff comprometida) podría almacenar blobs grandes. Impacto bajo (requiere ser staff; el binario de audio ya no viaja a BD — A6). → [A8-04]

### Validación en las Edge Functions (buena)
`create-user`, `reset-credential`, `reset-pin`, `login` validan: `username`/`credential` presentes, `role` contra whitelist `["admin","teacher","student"]`, `credType` normalizado a `pin`/`password`, longitud mínima (4 PIN / 6 contraseña), unicidad de username (409). Las consultas usan supabase-js parametrizado (`.eq`/`.ilike`) → **sin inyección SQL** (y la app no usa `execute_sql`). Ninguna función registra la credencial ni el hash.

---

## 3. Autorización

### Servidor (Edge Functions) — sólida
| Función | Control de autorización | Veredicto |
|---|---|---|
| `login` | verifica PBKDF2 en tiempo constante (`timingSafeEqual`), 401 genérico (no distingue usuario/credencial), retardo constante ~350 ms, rate-limit por IP+usuario (10/min) | ✅ robusta |
| `create-user` | bootstrap del 1er admin solo si `adminCount===0`; admin→cualquiera; teacher→solo `student` **con `teacherId` forzado a `callerId`** (no puede regalar alumnos a otro); resto 403 | ✅ correcta |
| `reset-credential` | exige sesión válida; admin→cualquiera; teacher→solo si `target.role==='student' && target.teacherId===callerId`; resto 403 | ✅ correcta |
| `reset-pin` | exige sesión de recuperación con correo REAL (rechaza `@fa.local` y anon key); identifica por `recovery_email` | ✅ correcta |
| `request-pin-reset` | respuesta SIEMPRE genérica (no enumera usuarios); solo alumnos con `recovery_email` | ✅ correcta (matiz en [A8-03]) |

### Base de datos (RLS) — respalda la UI
A3 ya verificó que **toda** escritura de tabla exige `app_is_staff()`/propiedad y que no hay operación sensible que dependa solo de ocultación en la UI. Los botones de profesor ocultos en el cliente están respaldados por RLS en servidor. Confirmado aquí desde el lado del código: no hay ninguna mutación de catálogo accesible a un alumno.

### Matices
- **El chequeo de rol de `LoginView` es cosmético** (`auth.tsx:144`): `login` devuelve sesión sea cual sea la pantalla, y el cliente hace `logout()` si el rol no cuadra. La autoría real es RLS; aceptable, pero significa que un alumno *puede* obtener una sesión válida entrando por la pantalla de profesor (y la app lo expulsa) — no es escalada porque RLS lo trata como alumno igualmente.
- **Perfiles legibles por cualquier autenticado** (`users_select ... using(true)`, A3): un alumno logueado puede leer username/displayName/role de todos. Es **necesario** (lista de profesores, corrección) y no expone secretos (que viven en `fa_user_secrets`, service_role). Riesgo: enumeración de usernames — bajo, ya conocido.

---

## 4. `npm audit` — explotabilidad real

3 vulnerabilidades (1 baja, 2 altas por CVSS). **Clasificación por árbol de dependencias:**

| Paquete | Vía | ¿Llega al navegador/bundle? | Explotabilidad REAL aquí |
|---|---|---|---|
| **undici** (2 high) | transitivo bajo **`jsdom`** (devDependency, solo tests) | ❌ nunca — jsdom solo corre en vitest | **Nula.** No se ejecuta en producción ni toca datos reales |
| **vite** (2 high: UNC/NTLM en Windows, `fs.deny` bypass) | **devDependency** (build/dev server) | ❌ herramienta de build | **Casi nula.** Requiere que un atacante alcance el dev server local del desarrollador; el sitio desplegado es estático |
| **@babel/core** (1 low: file-read vía sourceMappingURL) | transitivo bajo vite/plugin-react (build) | ❌ build-time | **Nula** en producción |

**Ninguna de las 3 alcanza el bundle de producción ni al usuario final.** Las dependencias de *producción* son mínimas: `react`, `react-dom`, `@supabase/supabase-js`, dos paquetes de fuentes. `fixAvailable: true` en las tres → actualizar cuando toque (higiene), sin urgencia de seguridad. → [A8-05]

---

## 5. Storage y acceso a audios

- **No hay Supabase Storage** (A6). Los audios son URLs a hosts externos, guardadas en `fa_audio_library`/`fa_exercises` (JSONB legible por cualquier autenticado). **Un alumno logueado puede leer todas las URLs de audio** — pero son ficheros públicos de material didáctico (obras musicales), no datos personales; el riesgo de "un alumno accede al audio de otro" del plan **no aplica** porque no hay audios privados por alumno. Las entregas de alumno (`fa_results`) sí están aisladas por RLS (A3). → sin hallazgo, documentado.

---

## 6. CORS y rate limiting

- **CORS `*` en las 5 funciones:** correcto para los endpoints públicos (login, request-pin-reset). En `reset-credential`/`reset-pin`/`create-user` el `*` no concede acceso porque exigen un token de sesión válido en `Authorization` (el navegador de un tercero no lo tiene). Aceptable. → nota, no hallazgo.
- **Rate limiting solo en `login`** (best-effort, en memoria por instancia — el propio código lo admite). `request-pin-reset` **no tiene rate limit** → se puede pedir el envío repetido de OTP a un `recovery_email` conocido (spam de correo / email-bombing). Respuesta genérica evita enumeración, pero no el envío. → [A8-03]

---

## 7. Hallazgos (por explotabilidad real)

- **[A8-01] media (explotable, ya conocido) — recuperación de PIN inalcanzable en prod deja a los alumnos sin recuperación** — cruce con **A3-01**: `request-pin-reset`/`reset-pin` no desplegadas + `requestPinReset` traga el 404 → «Correo enviado» falso. No es una brecha de confidencialidad, pero es un fallo del control de recuperación de credenciales (disponibilidad de la cuenta). — Recomendación: desplegar ambas o deshabilitar la vía visiblemente (misma acción que A3-01).
- **[A8-02] media (contexto) — «Salir» no invalida la sesión** — cruce con **A3-02** (`App.tsx:419`): `setUser(null)` sin `signOut()`; en equipos de aula compartidos, el token en localStorage permite reanudar la sesión del alumno anterior. Explotabilidad real: alta en aulas, nula fuera de ellas. — Recomendación: `logout()` en onLogout (ya existe).
- **[A8-03] baja — `request-pin-reset` sin rate limiting: email-bombing a un correo de recuperación** — `supabase/functions/request-pin-reset/index.ts` (sin límite de tasa; `login` sí lo tiene) — Evidencia: cada POST con un username válido dispara un `signInWithOtp` al correo asociado; repetido, satura ese buzón. La respuesta genérica evita *enumerar*, pero no *enviar*. — Recomendación: rate-limit por username+IP (como `login`), y valorar límite por correo destino.
- **[A8-04] baja — escrituras JSONB sin límite de tamaño** — `data/db.ts` (sin cota) — Evidencia: staff puede subir blobs arbitrariamente grandes a `fa_*`; RLS impide que un alumno lo haga en el catálogo. Impacto: coste/almacenamiento, no confidencialidad. — Recomendación: validar tamaño en cliente y/o `check` en columna.
- **[A8-05] baja (higiene, no explotable en prod) — 3 vulnerabilidades de dependencias, todas de build/test** — `npm audit` 2026-07-10 — Evidencia: undici (←jsdom, tests), vite (build), @babel/core (build); ninguna en el bundle. `fixAvailable:true`. — Recomendación: actualizar en la próxima ventana de mantenimiento; sin urgencia. A9 debe registrar que este es el `npm audit` que A0 dejó "solo capturado".
- **[A8-06] baja — chequeo de rol de login cosmético + perfiles legibles por todos** — `auth.tsx:144`, política `users_select using(true)` — Evidencia: un alumno puede obtener sesión entrando por la pantalla de profesor (la app lo expulsa; RLS lo trata como alumno) y puede leer username/role de todos. No es escalada; sí permite enumeración de usernames. — Recomendación: aceptable para el modelo actual (aula); si se endurece, exponer solo la lista de profesores necesaria.

**Sin hallazgos altos.** Los controles centrales (hash en servidor, secretos fuera del cliente, RLS por rol, autorización por función, sin XSS, sin service_role en el cliente) son sólidos y ya verificados en producción durante el cutover.

---

## Criterio de cierre

✅ Hallazgos clasificados por explotabilidad real, no por severidad teórica del CVE (§4 y §7): las 3 vulnerabilidades de `npm audit` quedan como bajas de higiene por ser build/test-only pese a su CVSS "high"; los 2 medios ([A8-01], [A8-02]) son controles de sesión/recuperación reutilizados de A3, no fugas de datos. Secretos verificados limpios (§1), autorización de las 5 Edge Functions leída y contrastada con RLS (§3), XSS almacenado descartado por ausencia de `dangerouslySetInnerHTML` + escapado de React (§2), y storage confirmado sin superficie privada (§5).
