-- 0002 — Fase 1.1: separa los secretos del perfil público.
-- fa_users pasa a contener SOLO el perfil público (id, username, role,
-- displayName, teacherId, hidden…). Los secretos (passwordHash, salt,
-- recovery_email) viven en fa_user_secrets, accesible SOLO por el rol de
-- servicio (la Edge Function de login). El cliente nunca los descarga.
--
-- En PRODUCCIÓN, además de crear la tabla, hay que MIGRAR los datos existentes:
--   insert into fa_user_secrets (user_id, username, password_hash, salt, recovery_email)
--   select id, data->>'username', data->>'passwordHash', data->>'salt', data->>'recovery_email'
--   from fa_users where data ? 'passwordHash';
--   update fa_users set data = data - 'passwordHash' - 'salt';
-- (En staging las semillas ya nacen separadas, así que aquí solo se crea la tabla.)
create extension if not exists citext;

create table if not exists public.fa_user_secrets (
  user_id        text primary key,
  username       citext unique,
  password_hash  text,
  salt           text,
  recovery_email text,
  auth_uid       uuid,
  auth_password  text,
  updated_at     timestamptz not null default now()
);

-- RLS sin políticas → denегar TODO a anon y authenticated. Solo service_role
-- (que omite RLS) puede leer/escribir. Así nadie con la anon key ve los hashes.
alter table public.fa_user_secrets enable row level security;
