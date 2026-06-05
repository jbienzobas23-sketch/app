// ═══ EDGE FUNCTION: request-pin-reset ════════════════════════════════════════
// Fase 1. Un alumno pide recuperar su PIN: el servidor busca su correo de
// recuperación en fa_user_secrets (el cliente ya no lo tiene) y envía un magic
// link. Respuesta SIEMPRE genérica (no revela si el usuario/correo existe).
// Al volver del enlace, el cliente tendrá una sesión con el correo REAL (no
// @fa.local) → muestra ResetPin → reset-pin.
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
  // Respuesta genérica: no distingue usuario inexistente / sin correo / enviado.
  const ok = () => json({ ok: true });

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
    const body = await req.json().catch(() => ({}));
    const username = String(body.username ?? "").trim().toLowerCase();
    const redirectTo = typeof body.redirectTo === "string" ? body.redirectTo : undefined;
    if (!username) return ok();

    // Solo alumnos pueden recuperar por correo.
    const { data: secret } = await admin
      .from("fa_user_secrets").select("user_id, recovery_email").eq("username", username).maybeSingle();
    if (!secret?.recovery_email) return ok();
    const { data: u } = await admin.from("fa_users").select("data").eq("id", secret.user_id).maybeSingle();
    if (u?.data?.role !== "student") return ok();

    // Enviar el magic link al correo de recuperación.
    const pub = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
    await pub.auth.signInWithOtp({
      email: secret.recovery_email,
      options: { shouldCreateUser: true, emailRedirectTo: redirectTo },
    });
    return ok();
  } catch (_e) {
    // Incluso ante error, respuesta genérica para no filtrar información.
    return json({ ok: true });
  }
});
