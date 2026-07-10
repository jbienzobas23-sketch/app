# A3 — Capa de datos (Supabase)

**Fecha:** 2026-07-10 · **Rama:** `beta` · **Commit HEAD:** `f263089a1ef0e70f2fb2902839e891cca6afe52a` (mismo HEAD que A0–A2, sin cambios)
**Fuentes:** código de `src/` + `supabase/` (solo lectura) y contraste con el proyecto de PRODUCCIÓN `vxmfwxpjmivionvxwsye` vía MCP de Supabase (**solo lecturas**: `list_tables`, `list_migrations`, `list_edge_functions`, `get_advisors`, `execute_sql` con SELECT/COUNT).

---

## 1. Inventario de accesos a Supabase

Comando: `grep -rn "\.from(\|\.rpc(\|\.storage" src/` (2026-07-10, HEAD `f263089`). Resultado: **todo el acceso a datos está centralizado en 2 módulos** (`src/data/db.ts` escrituras, `src/hooks/useAppData.ts` lecturas) más `src/auth/authClient.ts` (Edge Functions vía `fetch`, no PostgREST). Ningún componente de `src/components/` toca Supabase directamente. **No hay ningún uso de `.storage`** (el audio no pasa por Supabase Storage: la audioteca guarda solo metadatos + URL externa, ver §2) ni de Realtime (`.channel`).

### 1.1 Lecturas (`useAppData.ts`)

| Tabla/función | Operación | Punto | Cuándo |
|---|---|---|---|
| fa_exercises, fa_users, fa_categories, fa_courses, fa_units, fa_results, fa_audio_library, fa_groups | `select("*")` ×8 en `Promise.all` | `loadData` (`useAppData.ts:71-109`) | Al montar (anon → RLS devuelve poco/nada) y de nuevo tras login (`completeLogin`, `App.tsx:271`) y tras setup (`App.tsx:211`) |
| `has_admin()` | `rpc` | `bootstrap` (`useAppData.ts:132`) | Al montar, decide si mostrar SetupView |
| `auth.getSession` | Auth | `bootstrap` (`useAppData.ts:121`), `authClient.withSessionToken` | Detección de magic link / token para Edge Functions |

`fa_settings` **no se lee ni se escribe** desde el cliente (ver [A3-09]).

### 1.2 Escrituras (`data/db.ts`, todas envueltas en `write()` con reintentos 1s/3s/9s)

| Tabla | Helpers | Llamantes (vía `useAppData`) |
|---|---|---|
| fa_exercises | `dbUpsertExercise` (excluye `waveformData` de nivel superior), `dbDeleteExercise` | add/update/duplicate/deleteExercise |
| fa_users | `dbUpsertUser`, `dbDeleteUser` | add/update/removeUser, RecoveryEmailModal (`App.tsx:352`) |
| fa_categories | `dbUpsertCategory`, `dbDeleteCategory` | add/update/deleteCategory, toggleGlobalCategory |
| fa_courses | `dbUpsertCourse`, `dbDeleteCourse` | add/update/deleteCourse, addUnit/deleteUnit (mantienen `unitIds`) |
| fa_units | `dbUpsertUnit`, `dbDeleteUnit` | add/update/deleteUnit, addExercisesToUnit, removeExerciseFromUnit, deleteExercise (limpia referencias) |
| fa_results | `dbUpsertResult` (no-op para `guest-*`), `dbDeleteResultsForUser`, `dbDeleteResultsForExercise` | submitAnswer (hook `useSubmitAnswer`), saveCorrection, removeUser, deleteExercise |
| fa_audio_library | `dbUpsertAudio`, `dbDeleteAudio` | add/update/deleteAudio |
| fa_groups | `dbUpsertGroup`, `dbDeleteGroup` | add/update/deleteGroup, removeUser (saca al alumno de sus grupos) |

Patrón uniforme: cada helper de `useAppData` hace `setState` local **y** dispara el `dbUpsert*`/`dbDelete*` (fire-and-forget con reintentos; ver §3).

### 1.3 Edge Functions (`auth/authClient.ts`, vía `fetch` con anon key o token de sesión)

| Función | Uso en cliente | ¿Desplegada en PROD? (`list_edge_functions`, 2026-07-10) |
|---|---|---|
| `login` | LoginView, SetupView | ✅ v1 ACTIVE |
| `create-user` | SetupView (bootstrap admin), AddUserModal | ✅ v2 ACTIVE |
| `reset-credential` | ResetCredentialModal | ✅ v1 ACTIVE |
| `request-pin-reset` | ForgotPinView | ❌ **NO desplegada** → [A3-01] |
| `reset-pin` | ResetPinView (magic link) | ❌ **NO desplegada** → [A3-01] |
| `claude-proxy` (v6, ACTIVE) | **Nadie** (legado de opos2027) | Desplegada sin uso → [A3-11] |

---

## 2. Lectores JSONB: tolerancia y variantes de esquema

### 2.1 Frontera de normalización

Solo **fa_exercises** pasa por un normalizador en la frontera: `normalizeExercise` (`lib/domain.ts:153-159`), aplicado en `loadData` (`useAppData.ts:89`), en las semillas y en cada add/update/duplicate. Es idempotente y materializa `categories`/`models`/`questions`/`parts`. Las otras 7 entidades se asignan **crudas** (`r.data` con cast TypeScript, `useAppData.ts:88-107`); su tolerancia depende de guards dispersos en los consumidores.

### 2.2 Veredicto por lector

| Lector | Ubicación | Datos antiguos que tolera | Veredicto |
|---|---|---|---|
| `categoriesOf` | domain.ts:31-36 | `categories` → `modes` → `mode` → DEFAULT_CATEGORY | ✅ tolerante |
| `modelsOf`/`modelOf` | domain.ts:38-44 | `models` → `model` → "interactivo" | ✅ tolerante |
| `answerFor` | domain.ts:46-53 | `answers[catId]` → legado `answer`+`mode.id` → `[]` | ✅ tolerante |
| `questionsOf` | domain.ts:80 | no-array → `[]` | ✅ tolerante |
| `questionScopeOf` | domain.ts:187-190 | sin `scope`: infiere fragmento/obra por tiempos | ✅ tolerante |
| `partsOf` | domain.ts:132-139 | sin `parts` o 1 parte: sintetiza desde campos planos | ⚠️ tolerante con el caso ambiguo "multiparte reducido a 1 parte" ya evidenciado en **[A2-02]** (los campos planos obsoletos pisan la parte superviviente) |
| `questionsSnapshotOf` | domain.ts:87-88 | resultados sin `questionsSnapshot` (pre-T5.5) → preguntas vigentes | ✅ tolerante |
| `resultPartsOf` | domain.ts:233-239 | resultado plano heredado → sobre `{p1:{byModel:{type}}}` | ✅ tolerante |
| `attemptsOf`/`addAttempt` | domain.ts:245-264 | sin `attempts`: el result ES el único intento | ✅ tolerante |
| `saveCorrection` (nota) | useAppData.ts:212-215 | `totalScore` en escala 0-10 o 0-100 (umbral ≤10 ×10) | ✅ tolerante |
| `courseUnitList`/`unitExList` | domain.ts:66-77 | ids número vs texto (`String()` en ambos lados), referencias colgantes (`filter(Boolean)`) | ✅ tolerante |
| `btnOf` | domain.ts:79 | **ninguno**: `category.buttons.find(...)` sin guard — una fila de fa_categories cuyo `data` no traiga `buttons` (array) lanza TypeError en render | ❌ frágil → [A3-08] |
| groups/audio/courses crudos | consumidores varios | `studentIds?.`, `unitIds \|\| []`, `tags \|\| []`, `filter(Boolean)` | ✅ tolerante (guard por uso, sin garantía central) |

### 2.3 Variantes de esquema JSONB coexistentes (detectables en el código)

1. Ejercicio legado `{mode, answer}` / intermedio `{modes}` / canónico `{categories, answers}`.
2. `{model}` (string) vs `{models}` (array, combos).
3. Ejercicio plano (una parte implícita) vs `{parts:[...]}` multiparte (F4).
4. Preguntas con/sin `scope` explícito (M6).
5. Resultado plano vs sobre compuesto `{parts:{pid:{byModel}}}` vs con `{attempts:[...]}` (F6) y con/sin `questionsSnapshot` (T5.5).
6. `teacherCorrection.totalScore` en 0-10 (pre-T1.2) vs 0-100.
7. `unit.exerciseIds`/ids de ejercicio: numéricos (`Date.now()`) vs texto.
8. Audioteca con/sin `composer`/`tags` (confirmado en prod: `audio-1779041115609` no los tiene).

**Contraste con datos reales de prod** (SELECT de claves JSONB, 2026-07-10): los 3 ejercicios existentes ya tienen la forma canónica completa (`categories`, `models`, `parts`, `questions` presentes) — la normalización en frontera está funcionando también al escribir. Tamaños: máx. 2.474 bytes por ejercicio y ~358 por audio (solo metadatos + `url`; **ningún base64 en BD**, consistente con la ausencia de `.storage`).

---

## 3. Manejo de errores: qué ve el usuario cuando falla Supabase

| Vía | Comportamiento | ¿Visible para el usuario? |
|---|---|---|
| **Escrituras** (`db.ts:42-62`) | 4 intentos con backoff 1s/3s/9s; al agotar → `onError` → `SaveErrorToast` («No se pudieron guardar los cambios…», se autooculta a los 9s, `useAppData.ts:63,153-157`). `beforeunload` avisa si hay escrituras en vuelo (`useAppData.ts:141-150`) | ✅ sí (desde `492c603`) — pero el estado local NO se revierte: diverge del servidor hasta recargar, y los errores permanentes (RLS 403) esperan 13s de reintentos inútiles → [A3-07] |
| **Lecturas** (`loadData`) | Por tabla: `if (!error) set…` — el error se ignora en silencio y quedan las semillas (`INIT_EXERCISES`, ids 2/3/4) o el estado previo. `bootstrap` → `catch` con `console.error` y `dbReady=true` igualmente | ❌ no: la app arranca "normal" mostrando datos semilla que enmascaran el fallo → [A3-04] |
| **`has_admin` RPC** | `catch {}` ignorado (`useAppData.ts:132`); `serverHasAdmin` queda `null` → `noAdmin=false` | ❌ no: en un despliegue nuevo con red inestable, SetupView no aparece nunca → [A3-06] |
| **Edge Functions** (`authClient.ts`) | Todos los `fetch` con try/catch («Sin conexión con el servidor…»), errores HTTP con `.status` (401/429) y mensaje del servidor | ✅ sí — **excepto** `requestPinReset` (`authClient.ts:116-126`), que ignora `res.ok` a propósito (respuesta genérica) y devuelve `true` siempre → con la función sin desplegar, «Correo enviado» miente → [A3-01] |
| **Resultados de invitado** | `dbUpsertResult` no-op silencioso para `guest-*` (`db.ts:87-90`) | Por diseño (documentado en el propio código) |

---

## 4. Auth: sesión, expiración y protección de rutas

**Flujo:** LoginView → `authClient.login` (Edge `login`: PBKDF2 en servidor, nunca baja el hash) → `supabase.auth.setSession` → `completeLogin` (`App.tsx:264-282`): recarga `loadData` ya autenticado y navega por rol (con deep-link `redirectAfterLogin`). El primer login **auto-repara** el enlace `auth_uid` del usuario (Edge Function), del que dependen todas las políticas de escritura (`app_user_id()` mapea `auth.uid()`).

- **Persistencia/expiración:** supabase-js con defaults (`persistSession` en localStorage, `autoRefreshToken`). No hay ninguna suscripción a `onAuthStateChange` en `src/` (grep 2026-07-10): si el refresh falla con la pestaña abierta, la primera señal es el toast de guardado fallido tras 13s → [A3-05].
- **Recarga:** el token sigue válido pero la UI vuelve al login (`user` es estado React no rehidratado) — ya registrado como **A2-06**; A3 añade el reverso: la carga anónima del arranque en realidad corre **autenticada** con ese token restaurado.
- **Logout:** `onLogout` (`App.tsx:419`) y el de TeacherPicker (`App.tsx:317`) hacen solo `setUser(null)` — **no llaman a `supabase.auth.signOut()`** (`authClient.logout` existe pero solo lo usan LoginView ante rol equivocado, `auth.tsx:146`, y los flujos de magic link, `App.tsx:332,337`) → [A3-02].
- **Rutas protegidas solo en cliente:** cierto (guards por `user` en App.tsx), pero cada dato/escritura está respaldado por RLS en servidor (§5), que es la frontera real. La ocultación de botones de profesor sin RLS detrás se cruzará en A8 con esta tabla: **todas** las tablas exigen `app_is_staff()`/dueño para escribir — no se encontró operación sensible que dependa solo de UI.

---

## 5. Contraste con el servidor real (PROD `vxmfwxpjmivionvxwsye`, 2026-07-10)

- **Tablas** (`list_tables`): las 10 `fa_*` (incl. `fa_user_secrets`), **todas con RLS activada**. Coincide 1:1 con el inventario del cliente + `fa_settings` (muerta, [A3-09]) + `fa_user_secrets` (solo service_role, sin políticas — por diseño Fase 1).
- **Recuentos reales** (`count(*)`): users 9, user_secrets 9, exercises **3**, categories 2, courses 5, units 18, results **2**, audio_library 13, groups 1, settings 0. ⚠️ **Observación para Jon (no es hallazgo de código):** el 2026-07-01 había 17 ejercicios y 5 resultados; hoy hay 3 y 2. Puede ser limpieza deliberada — conviene confirmarlo antes de A9. (Nota: los `rows` de `list_tables` son estimaciones de `pg_class` y salían a 0 para fa_users; los COUNT de arriba son reales.)
- **Enlace Auth:** solo **2 de 9** `fa_user_secrets` tienen `auth_uid` (y `auth.users` total = 4, incluidas cuentas de recuperación) → 7 usuarios siguen sin poder persistir escrituras hasta su primer login → [A3-03].
- **Advisors seguridad:** solo los "por diseño" ya conocidos y aceptados (INFO `fa_user_secrets` RLS sin políticas; WARN `has_admin` ejecutable por anon — necesario para el arranque; WARN funciones `app_*` SECURITY DEFINER ejecutables por authenticated — requerido por las políticas RLS; WARN leaked-password N/A con PBKDF2 propio). **Nada nuevo.** Análisis de explotabilidad → A8.
- **Advisors rendimiento:** WARN `multiple_permissive_policies` en 7 tablas (`*_select` + `*_write FOR ALL` solapan el SELECT para authenticated) → [A3-10]. Sin issues de índices (volúmenes minúsculos).
- **Migraciones aplicadas** (`list_migrations`): historia real = 3 legadas (creación de tablas 2026-05) + `0002`, `0003_helpers+0004`, `0003_policies`, `0006`, `0007`, `0008` (2026-06-05) + 6 de opos2027 (5 create + 1 drop, infra ya limpiada). Los ficheros del repo `0001` y `0005` no figuran como migración aplicada en prod porque se ejecutaron de forma equivalente (tablas legadas / inserts manuales del cutover) — coherente con `supabase/DEPLOY.md` → [A3-12].

### ¿Presupone el código migraciones pendientes?

**No.** El cliente usa exactamente: 8 tablas `fa_*` con contrato `{id text, data jsonb}` (+ `fa_results` con PK compuesta `user_id, exercise_id`) y el RPC `has_admin()` — todo existente y con política en prod. La convención "JSONB tolerante, sin cambios de esquema" se respeta: las variantes (§2.3) se resuelven en lectores del cliente, no con ALTER.

---

## 6. Hallazgos

- **[A3-01] alta — recuperación de PIN rota y silenciosa en producción** — `authClient.ts:116-126` + `list_edge_functions` prod — Evidencia: ForgotPinView llama a `request-pin-reset`, que **no está desplegada** en prod (solo login, create-user, reset-credential, claude-proxy); además `requestPinReset` no comprueba `res.ok` (devuelve `true` siempre), así que el alumno ve «Correo enviado» ante un 404. `reset-pin` tampoco está (flujo del magic link, hoy inalcanzable al no enviarse correos). — Recomendación: desplegar `request-pin-reset` y `reset-pin` a prod (requiere OK de Jon; están probadas en staging) o, mientras tanto, ocultar «He olvidado mi PIN» y hacer que `requestPinReset` distinga al menos el fallo de red/despliegue del OK genérico.
- **[A3-02] alta — «Salir» no cierra la sesión de Supabase** — `App.tsx:419` y `App.tsx:317` — Evidencia: `onLogout = () => { setUser(null); navigate("/"); }`; el token queda en localStorage (`persistSession`) y el siguiente arranque en el mismo dispositivo ejecuta `loadData` **autenticado como el usuario anterior** (datos suyos en memoria; con `matchedUser` de LoginView se puede además sondear qué usernames existen). En equipos compartidos de aula es acceso residual real. `authClient.logout()` ya existe y solo se usa en 3 sitios laterales. — Recomendación: que `onLogout` (y el de TeacherPicker) llamen a `logout()`; revisar la dependencia sutil de LoginView en `users` cargados (con signOut la lista llega vacía y `credLabel` degrada al genérico «Contraseña / PIN», aceptable).
- **[A3-03] alta — 7 de 9 usuarios de prod sin enlace Auth: sus escrituras siguen rechazadas por RLS** — servidor (SQL 2026-07-10: `auth_uid not null` = 2/9; `auth.users` = 4) — Evidencia: las políticas de escritura pasan por `app_user_id()` que mapea `auth.uid()` ↔ `fa_user_secrets.auth_uid`; sin enlace, cada guardado agota reintentos y muestra el toast, y el trabajo se pierde al recargar. El enlace se auto-repara en el primer login (Edge `login`) y `create-user` v2 ya enlaza en el alta, pero las cuentas antiguas siguen pendientes desde el 2026-07-01. — Recomendación: pedir a esos usuarios un primer login, o (con OK de Jon) un script de servidor que cree/enlace sus usuarios Auth de una vez.
- **[A3-04] media — fallo de carga invisible: las semillas enmascaran el error** — `useAppData.ts:89-107,133-137` — Evidencia: cada tabla ignora su `error` en silencio; `bootstrap` captura, hace `console.error` y activa `dbReady` igualmente → con Supabase caído la app muestra los ejercicios semilla (ids 2/3/4) como si fueran reales (fuente ya conocida de "aparecen/desaparecen"). — Recomendación: estado de error de carga visible (banner/reintentar) y no confundible con datos reales.
- **[A3-05] media — sin `onAuthStateChange` ni rehidratación: la expiración se descubre por un guardado fallido** — grep `onAuthStateChange` = 0 en `src/` — Evidencia: no hay listener de sesión; si el refresh del token falla (pestaña abierta horas), la primera señal es el toast tras 13s de reintentos; y al recargar, el token válido no restaura la UI (A2-06). — Recomendación: suscribirse a `onAuthStateChange` (SIGNED_OUT/TOKEN_REFRESHED) para avisar/redirigir, y rehidratar el perfil al arrancar si hay sesión `@fa.local`.
- **[A3-06] media — `has_admin` fallido deja el bootstrap inaccesible** — `useAppData.ts:132` — Evidencia: `catch { /* ignora */ }`; con el RPC fallando, `serverHasAdmin` queda `null` y `noAdmin === false` → un despliegue vacío (escenario "otros conservatorios") nunca muestra SetupView, sin mensaje alguno. — Recomendación: distinguir "no confirmado" (reintentar/avisar) de "false".
- **[A3-07] media — reintentos ciegos y sin rollback en escrituras** — `db.ts:42-62` — Evidencia: un 401/403 de RLS (permanente) se reintenta 4 veces (13s) igual que un fallo de red; mientras tanto el `setState` optimista ya aplicó el cambio y nunca se revierte → estado local divergente hasta recargar. — Recomendación: no reintentar errores de permiso; valorar marcar visualmente la entidad no guardada (el rollback completo puede quedar para la capa de datos futura, Fase 4).
- **[A3-08] media — `btnOf` revienta con una categoría sin `buttons`** — `lib/domain.ts:79` — Evidencia: `category.buttons.find((b) => …) || category.buttons[0]` sin guard; fa_categories se asigna cruda desde el JSONB (`useAppData.ts:92-95`), de modo que una fila malformada (o un doc antiguo sin `buttons`) produce TypeError en pleno render de sesión. Único lector de entidad no-ejercicio sin tolerancia. — Recomendación: guard (`category?.buttons ?? []`) o normalizar categorías en la frontera como ya se hace con ejercicios.
- **[A3-09] baja — `fa_settings` es una tabla muerta** — grep `.from("fa_settings")` = 0; prod: 0 filas, políticas activas — Evidencia: el cliente ya no la usa (el "margen de error" vive hoy en el propio ejercicio). — Recomendación: registrarla como deuda de limpieza para cuando se toque el esquema (convención actual: sin migraciones); mientras, documentada aquí.
- **[A3-10] baja — políticas permisivas duplicadas en 7 tablas (advisor rendimiento)** — advisor `multiple_permissive_policies` (fa_audio_library, fa_categories, fa_courses, fa_exercises, fa_groups, fa_settings, fa_units) — Evidencia: `*_write FOR ALL` incluye SELECT y solapa con `*_select` → doble evaluación por consulta. Impacto hoy despreciable (tablas minúsculas). — Recomendación: cuando haya ventana de esquema, dividir `*_write` en insert/update/delete; anotar en A9, no actuar ahora.
- **[A3-11] baja — Edge Function `claude-proxy` desplegada sin uso** — `list_edge_functions` prod (v6 ACTIVE) — Evidencia: ningún llamante en `src/` ni en opos2027-v2 (usa proyecto propio). Superficie y confusión innecesarias. — Recomendación: borrarla (con OK de Jon); cruzar con A8.
- **[A3-12] baja — historia de migraciones repo ≠ prod y prefijo `0003` duplicado** — `supabase/migrations/` vs `list_migrations` — Evidencia: `0001`/`0005` no existen como migraciones aplicadas (se ejecutaron por equivalencia en el cutover, documentado en DEPLOY.md); `0003_rls_helpers.sql` y `0003_rls_policies.sql` comparten prefijo numérico (el orden lo decide el sufijo alfabético). Riesgo solo al recrear entornos desde cero. — Recomendación: renumerar en la próxima ocasión que se toquen migraciones y mantener DEPLOY.md como fuente de verdad del histórico real.

**Observación sin número (estado de datos, no de código):** descenso de contenido en prod entre 2026-07-01 y 2026-07-10 (ejercicios 17→3, resultados 5→2). Puede ser limpieza intencionada de Jon; confirmar antes de A9. Si no lo fuera, cruzar con [A3-03] (aunque un borrado por usuario sin enlace también sería rechazado por RLS, no explicaría la desaparición).

---

## Criterio de cierre

✅ Tabla completa de accesos (§1: 8 tablas leídas, 8 escritas vía 17 helpers, 1 RPC, 5 Edge Functions, 0 storage/realtime, todo centralizado en 3 módulos). ✅ Lista de lectores JSONB con veredicto por lector (§2.2: 12 tolerantes, 1 con caso ambiguo ya numerado A2-02, 1 frágil → A3-08). Advisors contrastados con el inventario del cliente (§5), RLS verificada desde advisors/`list_tables` y no desde suposiciones, y confirmado que el código no presupone migraciones pendientes (§5).
