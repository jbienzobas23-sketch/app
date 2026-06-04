# Supabase — Fase 1 (seguridad)

Migraciones versionadas y Edge Functions del proyecto.

## Proyectos

- **Producción:** `vxmfwxpjmivionvxwsye` (eu-west-1). **No tocar sin verificación** —
  contiene datos reales (incl. de menores).
- **Staging (Fase 1):** `pinrhvurzhvdvbnzrbem` (eu-west-1). Donde se desarrolla y
  prueba la Fase 1 antes de migrar a producción.

## Migraciones (`migrations/`)

| Fichero | Qué hace |
|---|---|
| `0001_base_schema.sql` | Tablas `fa_*` (patrón `id`+`data jsonb`). |
| `0002_user_secrets.sql` | `fa_user_secrets` (hash/salt/recovery fuera del perfil público) con RLS bloqueada (solo `service_role`). |
| `0003_rls_helpers.sql` | Funciones puente `app_user_id()`/`app_role()`/`app_is_staff()`… (SECURITY DEFINER) que mapean `auth.uid()` → usuario/rol de la app. |
| `0003_rls_policies.sql` | Activa RLS en todas las `fa_*` y define políticas por rol/visibilidad. **Probado en staging.** |

Aplicar con `supabase db push` (CLI) o desde el SQL editor / conector MCP.

## Edge Function: `login`

`functions/login/index.ts` — **Opción A** del plan. Verifica la credencial
(PIN/contraseña) en el servidor con PBKDF2-SHA256 (mismos parámetros que el
cliente → conserva los PIN actuales, sin reseteo), y devuelve una **sesión real
de Supabase Auth**. El cliente nunca recibe el hash ni la sal.

- Se despliega con `verify_jwt = false` (es el endpoint de login; el usuario aún
  no tiene sesión).
- Usa `SUPABASE_SERVICE_ROLE_KEY` (auto-inyectada en la función; **nunca** en el cliente).
- Crea un usuario de Supabase Auth por usuario de la app (email sintético
  `${username}@fa.local`, contraseña aleatoria guardada solo en `fa_user_secrets`).

Desplegar: `supabase functions deploy login --no-verify-jwt`.

## Edge Function: `create-user`

`functions/create-user/index.ts` — alta de usuarios con el modelo nuevo: hashea
la credencial en el servidor (PBKDF2) y escribe el perfil público en `fa_users` y
el secreto en `fa_user_secrets`. Autorización: bootstrap del primer admin sin
sesión (solo si no hay admin), admin crea cualquiera, profesor solo alumnos
asignados a sí mismo. `verify_jwt=false` (comprueba el JWT del caller dentro).

### Probado en staging (2026-06-03)
- anon → crear profesor → 403; admin → profesor → 200; profesor → alumno → 200
  (teacherId = el propio profesor); profesor → profesor → 403; username duplicado
  → 409. Los usuarios creados **pueden loguear** después (contraseña y PIN). ✅
- Verificado también EN NAVEGADOR: profesor crea alumno desde AddUserModal y el
  alumno loguea; admin crea el primer admin desde SetupView (bootstrap).

## Edge Function: `reset-credential`

`functions/reset-credential/index.ts` — un admin (o el profesor del alumno)
restablece la credencial de otro usuario: nuevo hash en el servidor → `fa_user_secrets`;
`credType` (público) → `fa_users`. El cliente no escribe secretos.

### Probado en staging (2026-06-03)
- profesor restablece el PIN de SU alumno → 200; el PIN viejo deja de funcionar y
  el nuevo entra; anon → 401; profesor → usuario que no es su alumno → 403.
  Verificado también EN NAVEGADOR (ResetCredentialModal). ✅

## Edge Functions: `request-pin-reset` + `reset-pin` (recuperación)

Recuperación de PIN por *magic link* (un alumno olvidó su PIN):
- `request-pin-reset` — busca el correo de recuperación en `fa_user_secrets` (el
  cliente ya no lo tiene) y envía el enlace. Respuesta SIEMPRE genérica.
- `reset-pin` — al volver del enlace, la sesión tiene el correo REAL; identifica al
  usuario por `recovery_email` y actualiza su secreto. Rechaza sesiones de login
  normal (`@fa.local`).

### Probado en staging (2026-06-03)
- `request-pin-reset` con usuario válido/ inexistente → respuesta genérica (no
  filtra); en NAVEGADOR ForgotPinView muestra "Correo enviado". ✅
- `reset-pin`: anon → 401; sesión de login normal (@fa.local) → 401 (no es
  recuperación). La actualización del PIN reutiliza la misma lógica ya verificada
  en `reset-credential`. ⚠️ El recorrido completo del *magic link* requiere un buzón
  real (infraestructura de email de Supabase) y no se probó de extremo a extremo.

### Probado en staging (2026-06-03)
- `admin`/`admin123` (contraseña) → 200 + sesión (rol admin).
- `alumno1`/`1234` (PIN) → 200 + sesión (rol student).
- credencial incorrecta / usuario inexistente → 401 genérico.
- segundo login reutiliza el usuario de Auth (idempotente).

### RLS probada en staging (2026-06-03, con tokens reales)
- **anon** (solo anon key, sin sesión) → 0 filas en todas las tablas y escritura → 401.
- **alumno** → solo SUS resultados (no los de otros), solo ejercicios no ocultos,
  solo sus grupos; no puede escribir (403).
- **admin** → ve todo y puede escribir (201).

## Pendiente de Fase 1
- **Cliente: recargar datos DESPUÉS del login.** Con RLS activa, anon no ve nada,
  así que la carga inicial (que hoy ocurre antes de login) vuelve vacía; tras
  `setSession` hay que volver a cargar. Sin esto la app se queda sin datos.
- `LoginView` ya usa el servidor; falta `SetupView`/alta de usuario/reseteo de PIN
  vía Edge Functions (hoy escriben el hash en `fa_users`, que ya no es el sitio).
- Migrar datos de producción (separar secretos a `fa_user_secrets`, rellenar
  `auth_uid` en el primer login) y desplegar RLS+auth+políticas **de una vez**.
