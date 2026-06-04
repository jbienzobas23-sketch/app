// ═══ EDGE FUNCTION: reset-pin ════════════════════════════════════════════════
// Fase 1. Tras volver del magic link de recuperación, el alumno fija un nuevo PIN.
// La sesión del que llama tiene el correo REAL de recuperación (no @fa.local). Se
// busca el usuario por recovery_email y se actualiza su secreto en el servidor.
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function pbkdf2Hex(credential: string, salt: string): Promise<string> {
  const enc = new TextEncoder();
  const km = await crypto.subtle.importKey("raw", enc.encode(credential), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: enc.encode(salt), iterations: 100000 }, km, 256,
  );
  return Array.from(new Uint8Array(bits)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function genSalt(): string {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return Array.from(a).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
    const body = await req.json().catch(() => ({}));
    const credential = String(body.credential ?? "");
    const credType = body.credType === "password" ? "password" : "pin";
    const minLen = credType === "pin" ? 4 : 6;
    if (credential.length < minLen) return json({ error: `La credencial es demasiado corta (mínimo ${minLen}).` }, 400);

    // Sesión de recuperación: su email es el correo REAL (no el sintético @fa.local).
    const auth = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    if (!auth || auth === ANON_KEY) return json({ error: "Enlace de recuperación inválido." }, 401);
    const { data: { user } } = await admin.auth.getUser(auth);
    const email = user?.email ?? "";
    if (!email || email.endsWith("@fa.local")) return json({ error: "Enlace de recuperación inválido." }, 401);

    const { data: secret } = await admin
      .from("fa_user_secrets").select("user_id").ilike("recovery_email", email).maybeSingle();
    if (!secret) return json({ error: "No hay ningún usuario asociado a este correo." }, 404);

    const salt = genSalt();
    const hash = await pbkdf2Hex(credential, salt);
    const { error: sErr } = await admin.from("fa_user_secrets")
      .update({ password_hash: hash, salt, updated_at: new Date().toISOString() }).eq("user_id", secret.user_id);
    if (sErr) return json({ error: "No se pudo actualizar el PIN." }, 500);

    const { data: targetU } = await admin.from("fa_users").select("data").eq("id", secret.user_id).maybeSingle();
    if (targetU?.data) await admin.from("fa_users").update({ data: { ...targetU.data, credType } }).eq("id", secret.user_id);

    return json({ ok: true }, 200);
  } catch (_e) {
    return json({ error: "Error del servidor." }, 500);
  }
});
