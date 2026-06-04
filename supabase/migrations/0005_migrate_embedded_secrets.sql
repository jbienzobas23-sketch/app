-- 0005 — Migración de datos de PRODUCCIÓN: separar los secretos incrustados.
-- En producción, fa_users.data contiene hoy passwordHash/salt/recovery_email
-- (modelo viejo). Este paso los copia a fa_user_secrets y los borra del perfil
-- público. Es IDEMPOTENTE (solo toca filas que aún tengan passwordHash).
--
-- En STAGING las semillas ya nacieron separadas, así que aquí normalmente no hay
-- nada que migrar; se incluye para reproducir el paso real de producción.
-- VALIDADO en staging con un usuario "legacy" de prueba: tras la migración, ese
-- usuario LOGUEA con su credencial original (Opción A: no hay que resetear PIN).
--
-- Requiere que 0002_user_secrets.sql ya se haya aplicado (fa_user_secrets existe).

-- 1) Copiar los secretos incrustados a fa_user_secrets.
insert into public.fa_user_secrets (user_id, username, password_hash, salt, recovery_email)
select id, lower(data->>'username'), data->>'passwordHash', data->>'salt', data->>'recovery_email'
from public.fa_users
where data ? 'passwordHash'
on conflict (user_id) do nothing;

-- 2) Quitar los secretos del JSON público.
update public.fa_users
set data = data - 'passwordHash' - 'salt' - 'recovery_email'
where data ? 'passwordHash';

-- 3) Comprobación (debe devolver 0).
do $$
declare n int;
begin
  select count(*) into n from public.fa_users where data ? 'passwordHash';
  if n > 0 then raise exception 'Quedan % filas con passwordHash incrustado', n; end if;
end $$;
