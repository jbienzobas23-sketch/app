-- 0007 — Endurecimiento: el rol `anon` no necesita ejecutar las funciones puente
-- app_* (solo las usa el RLS, que evalúa como `authenticated`). Se revoca su
-- EXECUTE a anon para reducir superficie. `has_admin` SÍ se mantiene para anon
-- (el cliente lo llama antes del login). `authenticated` conserva todo.
revoke execute on function
  public.app_user_id(),
  public.app_role(),
  public.app_teacher_id(),
  public.app_is_staff(),
  public.app_is_admin(),
  public.app_my_student_ids()
from anon;
