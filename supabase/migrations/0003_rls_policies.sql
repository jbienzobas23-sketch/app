-- 0003b — Activa RLS y define políticas. anon (sin sesión) NO ve ni escribe nada.
-- Verificado en staging con tokens reales:
--   anon → 0 filas y escritura 401; alumno → solo SUS resultados y ejercicios no
--   ocultos, sin escritura (403); admin → todo y escritura (201).

alter table public.fa_users         enable row level security;
alter table public.fa_exercises     enable row level security;
alter table public.fa_categories    enable row level security;
alter table public.fa_courses       enable row level security;
alter table public.fa_units         enable row level security;
alter table public.fa_audio_library enable row level security;
alter table public.fa_groups        enable row level security;
alter table public.fa_results       enable row level security;
alter table public.fa_settings      enable row level security;

-- ── fa_results: aislamiento por alumno ───────────────────────────────────────
create policy results_select on public.fa_results for select to authenticated
  using (
    public.app_is_admin()
    or user_id = public.app_user_id()
    or (public.app_role() = 'teacher' and user_id in (select public.app_my_student_ids()))
  );
create policy results_insert on public.fa_results for insert to authenticated
  with check (user_id = public.app_user_id() or public.app_is_staff());
create policy results_update on public.fa_results for update to authenticated
  using (
    user_id = public.app_user_id()
    or public.app_is_admin()
    or (public.app_role() = 'teacher' and user_id in (select public.app_my_student_ids()))
  )
  with check (
    user_id = public.app_user_id()
    or public.app_is_admin()
    or (public.app_role() = 'teacher' and user_id in (select public.app_my_student_ids()))
  );
create policy results_delete on public.fa_results for delete to authenticated
  using (public.app_is_staff());

-- ── fa_users: perfil público legible por autenticados; escritura propia o staff ─
create policy users_select on public.fa_users for select to authenticated using (true);
create policy users_insert on public.fa_users for insert to authenticated
  with check (id = public.app_user_id() or public.app_is_staff());
create policy users_update on public.fa_users for update to authenticated
  using (id = public.app_user_id() or public.app_is_staff())
  with check (id = public.app_user_id() or public.app_is_staff());
create policy users_delete on public.fa_users for delete to authenticated
  using (public.app_is_staff());

-- ── fa_exercises: alumnos solo ven los no ocultos; staff todo; escritura staff ─
create policy exercises_select on public.fa_exercises for select to authenticated
  using (public.app_is_staff() or coalesce((data->>'hidden')::boolean, false) = false);
create policy exercises_write on public.fa_exercises for all to authenticated
  using (public.app_is_staff()) with check (public.app_is_staff());

-- ── Lectura autenticada + escritura staff: categorías, cursos, unidades, audios ─
create policy categories_select on public.fa_categories for select to authenticated using (true);
create policy categories_write  on public.fa_categories for all to authenticated using (public.app_is_staff()) with check (public.app_is_staff());

create policy courses_select on public.fa_courses for select to authenticated using (true);
create policy courses_write  on public.fa_courses for all to authenticated using (public.app_is_staff()) with check (public.app_is_staff());

create policy units_select on public.fa_units for select to authenticated using (true);
create policy units_write  on public.fa_units for all to authenticated using (public.app_is_staff()) with check (public.app_is_staff());

create policy audio_select on public.fa_audio_library for select to authenticated using (true);
create policy audio_write  on public.fa_audio_library for all to authenticated using (public.app_is_staff()) with check (public.app_is_staff());

-- ── fa_groups: staff todo; alumno solo los grupos a los que pertenece ─────────
create policy groups_select on public.fa_groups for select to authenticated
  using (public.app_is_staff() or (data->'studentIds') @> to_jsonb(public.app_user_id()));
create policy groups_write on public.fa_groups for all to authenticated
  using (public.app_is_staff()) with check (public.app_is_staff());

-- ── fa_settings: lectura autenticada; escritura admin ─────────────────────────
create policy settings_select on public.fa_settings for select to authenticated using (true);
create policy settings_write  on public.fa_settings for all to authenticated using (public.app_is_admin()) with check (public.app_is_admin());
