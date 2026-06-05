# Runbook — cutover de la Fase 1 a PRODUCCIÓN

Lleva la seguridad ya validada en staging (`pinrhvurzhvdvbnzrbem`) al proyecto de
producción (`vxmfwxpjmivionvxwsye`). **Todo el bloque va junto**: si se activa RLS
sin que el login de servidor y el cliente nuevo estén en producción, la app se
queda sin acceso a datos.

> ⚠️ Datos reales de menores. Hacer en una ventana de mantenimiento, con copia de
> seguridad y verificando cada paso. Ejecutar idealmente con Jon presente.

## ⚑ Estado REAL de producción (verificado 2026-06-05)
Diferencias respecto a staging que cambian el plan:
- **9 usuarios**, los 9 con `passwordHash`/`salt` incrustados en `fa_users.data`
  (modelo viejo). `recovery_email`: 0. `fa_user_secrets` **no existe** aún.
- Las 9 tablas `fa_*` tienen **RLS activado** y **una política `anon_all`**
  (`for all to anon using(true) with check(true)`) → hoy cualquiera con la anon
  key tiene lectura/escritura total. **Staging no tenía esto.**
- Consecuencias:
  1. `0001` no se ejecuta (las tablas ya existen; los `id` son `text`).
  2. Las políticas de `0003_rls_policies` son `to authenticated`; mientras
     `anon_all` siga viva, anon mantiene acceso total (políticas permisivas = OR).
     Hay que ejecutar **`0006_drop_legacy_anon_policies.sql`** para asegurar.
  3. El cliente nuevo entra como `authenticated`: necesita `fa_user_secrets`
     poblada **y** las políticas `authenticated` ANTES de cortar `anon`, o se
     queda sin datos.

### Orden de baja-caída (recomendado)
Evita la ventana de login caído separando el "copiar" del "borrar" secretos.
Pasos no-destructivos primero; el corte de `anon` al final, ya verificado.

| # | Acción | ¿Rompe algo? | Quién |
|---|--------|--------------|-------|
| 0 | Copia de seguridad de prod | no | **Jon** |
| 1 | `0002` crear `fa_user_secrets` | no (additivo) | Claude/MCP |
| 2 | `0003_rls_helpers` + `0004_has_admin` (funciones) | no | Claude/MCP |
| 3 | **Copiar** secretos: el `insert ... select` de `0005` (sin el `update` que borra) | no (cliente viejo sigue) | Claude/MCP |
| 4 | Desplegar las 3 Edge Functions (`--no-verify-jwt`) | no | Claude/MCP |
| 5 | `0003_rls_policies` (añade políticas `authenticated`; `anon_all` sigue) | no (app sigue) | Claude/MCP |
| 6 | Vercel: env vars `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` y desplegar la rama con Fase 1 | no | **Jon** |
| 7 | Smoke test cliente nuevo: login real, alumno ve lo suyo, profe gestiona | — | Jon+Claude |
| 8 | **Borrar** secretos del perfil: el `update ... - 'passwordHash' ...` de `0005` + su check 0 filas | rompe login del cliente VIEJO (ya no se usa) | Claude/MCP |
| 9 | **`0006_drop_legacy_anon_policies.sql`** ← punto de no retorno para anon | corta acceso anónimo | Claude/MCP |
| 10 | Verificación RLS final (anon=0/401, alumno solo suyo, admin todo) | — | Jon+Claude |

Rollback en cualquier punto tras el 9: recrear `anon_all` o `disable row level
security` para devolver acceso; restaurar la copia del paso 0 si hay corrupción.

---
_Lo que sigue es el runbook original (orden lógico por fases); en producción se
ejecuta según la tabla de baja-caída de arriba._

## 0. Preparación
- **Copia de seguridad** de producción (Dashboard → Database → Backups, o `pg_dump`).
- **Verificar el esquema real** de prod antes de migrar:
  ```sql
  select table_name, column_name, data_type
  from information_schema.columns
  where table_schema='public' and table_name like 'fa_%'
  order by table_name, ordinal_position;
  ```
  Si el tipo de `fa_*.id` o de `fa_settings.value` no coincide con
  `0001_base_schema.sql`, NO ejecutes 0001 (las tablas ya existen); úsalo solo de
  referencia. Las políticas de 0003 no dependen del tipo de `id`.
- Asegúrate de tener: las 5 migraciones (`supabase/migrations/`), las 3 Edge
  Functions (`supabase/functions/`), y el cliente en una rama lista para desplegar.

## 1. Secretos (sin tocar RLS todavía)
1. `0002_user_secrets.sql` → crea `fa_user_secrets` (RLS bloqueada).
2. `0005_migrate_embedded_secrets.sql` → mueve passwordHash/salt/recovery_email de
   `fa_users.data` a `fa_user_secrets` y los borra del perfil público. Idempotente;
   la comprobación final debe dar 0 filas con `passwordHash`.

## 2. Funciones de servidor
3. `0003_rls_helpers.sql` y `0004_has_admin.sql` → funciones (todavía SIN activar RLS).
4. Desplegar Edge Functions a producción (verify_jwt=false en las tres):
   ```
   supabase functions deploy login --no-verify-jwt
   supabase functions deploy create-user --no-verify-jwt
   supabase functions deploy reset-credential --no-verify-jwt
   ```
   (No hace falta configurar SERVICE_ROLE/ANON/URL: Supabase las inyecta.)
5. Smoke test del login en prod (sin tocar la app): `POST /functions/v1/login`
   con un usuario real → debe devolver `{ session, profile }`. El `profile` NO debe
   traer hash ni sal.

## 3. Cliente nuevo
6. Configurar en el hosting (Vercel) las env vars de producción:
   `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
7. Desplegar la rama con la Fase 1 (login servidor, has_admin, recarga tras login,
   Setup/AddUser/Reset vía servidor). Probar que la app sigue funcionando **con RLS
   aún desactivada** (login real, dashboards con datos).

## 4. Activar RLS (punto de no retorno para el acceso anónimo)
8. `0003_rls_policies.sql` → activa RLS + políticas en todas las `fa_*`.
9. **Verificar** (mismos tests que en staging):
   - sin sesión (solo anon key) → `GET /rest/v1/fa_results` y `fa_exercises` → 0 filas; escritura → 401/403.
   - un alumno (token de login) → solo SUS resultados y ejercicios visibles; sin escritura.
   - un admin → todo y escritura.
   - En la app: alumno entra y ve lo suyo; profesor gestiona; nadie anónimo lee/escribe.

## 5. Rollback
- Si algo falla tras el paso 8: `alter table public.fa_<t> disable row level security;`
  en todas las `fa_*` para devolver el acceso mientras se diagnostica.
- Si hay corrupción de datos: restaurar la copia del paso 0.
- Los secretos ya separados (pasos 1-2) no rompen nada con RLS desactivada (la app
  vieja leía hash de `fa_users`, pero el cliente nuevo ya no lo necesita).

## Estado de validación (staging, 2026-06-03)
Todo lo anterior está probado de extremo a extremo en staging, incluida la UI real
en navegador y la migración de un usuario "legacy" (secretos incrustados → separados
→ loguea con su credencial original sin reseteo). Ver `README.md`.

## Pendiente (no bloquea el cutover)
- Recuperación de PIN por *magic link* (ForgotPin/ResetPin) vía función de servidor
  + email configurado. `reset-credential` ya cubre el reseteo por admin/profesor.
