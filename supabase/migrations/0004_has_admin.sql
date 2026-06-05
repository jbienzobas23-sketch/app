-- 0004 — ¿Existe algún admin? Para que el cliente detecte el primer arranque sin
-- depender de una lectura anónima (que RLS bloquea). SECURITY DEFINER + ejecutable
-- por anon. No revela datos: solo un booleano.
create or replace function public.has_admin() returns boolean
  language sql stable security definer set search_path = public as
$$ select exists(select 1 from public.fa_users where data->>'role' = 'admin') $$;
grant execute on function public.has_admin to anon, authenticated;
