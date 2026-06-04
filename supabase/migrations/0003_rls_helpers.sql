-- 0003a — Funciones puente auth.uid() ↔ usuario/rol de la app.
-- SECURITY DEFINER: corren como el dueño (postgres) y pueden leer
-- fa_user_secrets / fa_users saltándose su RLS (sin recursión en las políticas).
create or replace function public.app_user_id() returns text
  language sql stable security definer set search_path = public as
$$ select user_id from public.fa_user_secrets where auth_uid = auth.uid() $$;

create or replace function public.app_role() returns text
  language sql stable security definer set search_path = public as
$$ select data->>'role' from public.fa_users where id = public.app_user_id() $$;

create or replace function public.app_teacher_id() returns text
  language sql stable security definer set search_path = public as
$$ select data->>'teacherId' from public.fa_users where id = public.app_user_id() $$;

create or replace function public.app_is_staff() returns boolean
  language sql stable security definer set search_path = public as
$$ select coalesce(public.app_role() in ('teacher','admin'), false) $$;

create or replace function public.app_is_admin() returns boolean
  language sql stable security definer set search_path = public as
$$ select coalesce(public.app_role() = 'admin', false) $$;

-- ids de los alumnos del profesor actual (ver/corregir sus resultados).
create or replace function public.app_my_student_ids() returns setof text
  language sql stable security definer set search_path = public as
$$ select id from public.fa_users where data->>'teacherId' = public.app_user_id() $$;

revoke all on function public.app_user_id, public.app_role, public.app_teacher_id,
  public.app_is_staff, public.app_is_admin, public.app_my_student_ids from public;
grant execute on function public.app_user_id, public.app_role, public.app_teacher_id,
  public.app_is_staff, public.app_is_admin, public.app_my_student_ids to authenticated, anon;
