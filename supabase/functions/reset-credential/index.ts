// ═══ EDGE FUNCTION: reset-credential ═════════════════════════════════════════
// Fase 1. Un admin (o el profesor del alumno) restablece la credencial (PIN/
// contraseña) de otro usuario. El nuevo hash se calcula en el SERVIDOR y se
// guarda en fa_user_secrets; el credType (público) se actualiza en fa_users.
// El cliente nunca hashea ni puede escribir fa_user_secrets (RLS lo bloquea).
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
    const userId = String(body.userId ?? "");
    const credential = String(body.credential ?? "");
    const credType = body.credType === "pin" ? "pin" : "password";
    if (!userId || !credential) return json({ error: "Datos incompletos." }, 400);
    const minLen = credType === "pin" ? 4 : 6;
    if (credential.length < minLen) return json({ error: `La credencial es demasiado corta (mínimo ${minLen}).` }, 400);

    // Caller
    const auth = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    if (!auth || auth === ANON_KEY) return json({ error: "No autorizado." }, 401);
    const { data: { user } } = await admin.auth.getUser(auth);
    if (!user) return json({ error: "No autorizado." }, 401);
    const { data: callerSec } = await admin.from("fa_user_secrets").select("user_id").eq("auth_uid", user.id).maybeSingle();
    if (!callerSec) return json({ error: "No autorizado." }, 401);
    const { data: callerU } = await admin.from("fa_users").select("data").eq("id", callerSec.user_id).maybeSingle();
    const callerRole = callerU?.data?.role;

    // Target
    const { data: targetU } = await admin.from("fa_users").select("data").eq("id", userId).maybeSingle();
    if (!targetU) return json({ error: "Usuario no encontrado." }, 404);
    const target = targetU.data;

    const allowed = callerRole === "admin" ||
      (callerRole === "teacher" && target.role === "student" && target.teacherId === callerSec.user_id);
    if (!allowed) return json({ error: "No autorizado para restablecer este usuario." }, 403);

    // Actualizar secreto + credType público
    const salt = genSalt();
    const hash = await pbkdf2Hex(credential, salt);
    const { error: sErr } = await admin.from("fa_user_secrets")
      .update({ password_hash: hash, salt, updated_at: new Date().toISOString() }).eq("user_id", userId);
    if (sErr) return json({ error: "No se pudo actualizar la credencial." }, 500);
    const newData = { ...target, credType };
    await admin.from("fa_users").update({ data: newData }).eq("id", userId);

    return json({ profile: newData }, 200);
  } catch (_e) {
    return json({ error: "Error del servidor." }, 500);
  }
});
