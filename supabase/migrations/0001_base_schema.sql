-- 0001 — Esquema base (patrón "blob": id + data jsonb).
-- En STAGING crea las tablas fa_* desde cero. En PRODUCCIÓN ya existen: antes de
-- aplicarlo allí, verifica los tipos de columna reales (sobre todo el tipo de `id`
-- y de fa_settings.value) y ajusta este fichero para que coincidan; usa
-- `create table if not exists` para no pisar datos.
create table if not exists public.fa_users         (id text primary key, data jsonb not null default '{}'::jsonb);
create table if not exists public.fa_exercises     (id text primary key, data jsonb not null default '{}'::jsonb);
create table if not exists public.fa_categories    (id text primary key, data jsonb not null default '{}'::jsonb);
create table if not exists public.fa_courses       (id text primary key, data jsonb not null default '{}'::jsonb);
create table if not exists public.fa_units         (id text primary key, data jsonb not null default '{}'::jsonb);
create table if not exists public.fa_audio_library (id text primary key, data jsonb not null default '{}'::jsonb);
create table if not exists public.fa_groups        (id text primary key, data jsonb not null default '{}'::jsonb);
create table if not exists public.fa_results       (user_id text not null, exercise_id text not null, data jsonb not null default '{}'::jsonb, primary key (user_id, exercise_id));
create table if not exists public.fa_settings      (key text primary key, value jsonb);
