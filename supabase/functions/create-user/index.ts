// ═══ EDGE FUNCTION: create-user ══════════════════════════════════════════════
// Fase 1. Crea usuarios con el modelo nuevo: hashea la credencial en el SERVIDOR
// (PBKDF2-SHA256, mismos parámetros que login) y guarda el perfil público en
// fa_users y el secreto (hash+salt+recovery) en fa_user_secrets. El cliente nunca
// hashea ni ve secretos.
//
// Autorización:
//   · Bootstrap del primer admin: permitido SIN sesión solo si aún no existe
//     ningún admin.
//   · admin: puede crear cualquier rol.
//   · teacher: solo puede crear alumnos (role=student) asignados a sí mismo.
//   · cualquier otro caso → 403.
//
// verify_jwt=false porque el bootstrap inicial no tiene sesión; la autorización
// se comprueba dentro leyendo el JWT del caller (si lo hay).
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
    const username = String(body.username ?? "").trim().toLowerCase();
    const credential = String(body.credential ?? "");
    const role = String(body.role ?? "");
    const displayName = String(body.displayName ?? "").trim();
    const credType = body.credType === "pin" ? "pin" : "password";
    const recoveryEmail = body.recoveryEmail ? String(body.recoveryEmail).trim() : null;
    let teacherId = body.teacherId ? String(body.teacherId) : null;

    if (!username || !credential || !displayName || !["admin", "teacher", "student"].includes(role)) {
      return json({ error: "Datos incompletos." }, 400);
    }
    const minLen = credType === "pin" ? 4 : 6;
    if (credential.length < minLen) return json({ error: `La credencial es demasiado corta (mínimo ${minLen}).` }, 400);

    // ── Quién hace la petición ────────────────────────────────────────────────
    let callerRole: string | null = null;
    let callerId: string | null = null;
    const auth = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    if (auth && auth !== ANON_KEY) {
      const { data: { user } } = await admin.auth.getUser(auth);
      if (user) {
        const { data: sec } = await admin.from("fa_user_secrets").select("user_id").eq("auth_uid", user.id).maybeSingle();
        if (sec) {
          callerId = sec.user_id;
          const { data: u } = await admin.from("fa_users").select("data").eq("id", sec.user_id).maybeSingle();
          callerRole = u?.data?.role ?? null;
        }
      }
    }

    // ── Autorización ──────────────────────────────────────────────────────────
    const { count: adminCount } = await admin
      .from("fa_users").select("id", { count: "exact", head: true }).filter("data->>role", "eq", "admin");
    const isBootstrap = role === "admin" && (adminCount ?? 0) === 0;
    let allowed = false;
    if (isBootstrap) allowed = true;
    else if (callerRole === "admin") allowed = true;
    else if (callerRole === "teacher" && role === "student") { allowed = true; teacherId = callerId; }
    if (!allowed) return json({ error: "No autorizado para crear este usuario." }, 403);

    // ── Username único ────────────────────────────────────────────────────────
    const { data: existing } = await admin.from("fa_user_secrets").select("user_id").eq("username", username).maybeSingle();
    if (existing) return json({ error: "Ese nombre de usuario ya existe." }, 409);

    // ── Crear ─────────────────────────────────────────────────────────────────
    const id = `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const salt = genSalt();
    const hash = await pbkdf2Hex(credential, salt);

    const profile: Record<string, unknown> = { id, username, role, displayName, credType, createdAt: Date.now() };
    if (role === "student" && teacherId) profile.teacherId = teacherId;

    const { error: pErr } = await admin.from("fa_users").insert({ id, data: profile });
    if (pErr) return json({ error: "No se pudo crear el perfil." }, 500);
    const { error: sErr } = await admin.from("fa_user_secrets").insert({
      user_id: id, username, password_hash: hash, salt, recovery_email: recoveryEmail,
    });
    if (sErr) {
      await admin.from("fa_users").delete().eq("id", id); // rollback del perfil
      return json({ error: "No se pudo crear el secreto." }, 500);
    }

    return json({ profile }, 200);
  } catch (_e) {
    return json({ error: "Error del servidor." }, 500);
  }
});
