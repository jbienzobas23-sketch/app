-- 0008 — Mover la extensión citext del schema `public` a `extensions`
-- (recomendación del linter de Supabase: no instalar extensiones en public).
-- El tipo de la columna fa_user_secrets.username (citext) no cambia; los roles
-- de Supabase tienen `extensions` en su search_path, así que el operador `=`
-- case-insensitive sigue resolviéndose. Verificado: login OK tras el cambio.
alter extension citext set schema extensions;
