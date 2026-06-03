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
| `0003_rls_policies.sql` | *(pendiente)* Activa RLS en todas las `fa_*` y define políticas por rol/visibilidad. |

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

### Probado en staging (2026-06-03)
- `admin`/`admin123` (contraseña) → 200 + sesión (rol admin).
- `alumno1`/`1234` (PIN) → 200 + sesión (rol student).
- credencial incorrecta / usuario inexistente → 401 genérico.
- segundo login reutiliza el usuario de Auth (idempotente).

## Pendiente de Fase 1
- `0003_rls_policies.sql` (RLS + políticas por rol/visibilidad).
- Reescribir el cliente: `LoginView`/`SetupView`/alta de usuario vía servidor;
  quitar `passwordHash`/`salt` del `select` de `fa_users`; `authClient.login()`.
- Migrar datos de producción (separar secretos) y desplegar todo de una vez.
