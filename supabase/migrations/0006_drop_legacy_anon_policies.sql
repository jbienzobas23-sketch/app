-- 0006 — PRODUCCIÓN: eliminar las políticas heredadas `anon_all`.
--
-- El proyecto de producción nació con una política permisiva por tabla:
--   create policy anon_all on public.fa_<t> for all to anon using(true) with check(true);
-- Eso da lectura/escritura TOTAL a cualquiera con la anon key (que viaja en el
-- bundle del cliente). Staging no tenía estas políticas (las semillas nacieron
-- limpias), por eso 0003_rls_policies bastaba allí.
--
-- Las políticas son PERMISIVAS y se combinan con OR: mientras `anon_all` exista,
-- las políticas restrictivas de 0003 NO aseguran nada. Este es el PUNTO DE NO
-- RETORNO para el acceso anónimo: ejecutar SOLO cuando el cliente nuevo
-- (autenticado) ya esté desplegado y verificado en producción.
--
-- Rollback: volver a crear las `anon_all` (devuelve el acceso mientras se
-- diagnostica) o `alter table ... disable row level security;`.

drop policy if exists anon_all on public.fa_users;
drop policy if exists anon_all on public.fa_exercises;
drop policy if exists anon_all on public.fa_categories;
drop policy if exists anon_all on public.fa_courses;
drop policy if exists anon_all on public.fa_units;
drop policy if exists anon_all on public.fa_audio_library;
drop policy if exists anon_all on public.fa_groups;
drop policy if exists anon_all on public.fa_results;
drop policy if exists anon_all on public.fa_settings;

-- Comprobación: no debe quedar ninguna política para el rol anon en fa_*.
do $$
declare n int;
begin
  select count(*) into n
  from pg_policies
  where schemaname='public' and tablename like 'fa_%' and roles::text like '%anon%';
  if n > 0 then raise exception 'Quedan % políticas anon en fa_*', n; end if;
end $$;
