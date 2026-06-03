// ═══ EDGE FUNCTION: login ════════════════════════════════════════════════════
// Fase 1 (Opción A). Verifica la credencial (PIN/contraseña) en el SERVIDOR con
// PBKDF2-SHA256 (mismos parámetros que el cliente, así los hashes actuales siguen
// siendo válidos: NO hay que resetear PIN). Si es válida, garantiza un usuario de
// Supabase Auth asociado (email sintético `${username}@fa.local` con contraseña
// aleatoria fuerte guardada solo en fa_user_secrets) y devuelve una sesión real.
//
// El cliente nunca recibe el hash ni la sal. La service_role solo vive aquí.
// verify_jwt está DESACTIVADO: este es el endpoint de login (el usuario aún no
// tiene sesión); la autenticación la hace la propia función con username+credential.
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// PBKDF2-SHA256, 100k iteraciones → hex. Idéntico a hashCredential del cliente.
async function pbkdf2Hex(credential: string, salt: string): Promise<string> {
  const enc = new TextEncoder();
  const km = await crypto.subtle.importKey("raw", enc.encode(credential), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: enc.encode(salt), iterations: 100000 },
    km, 256,
  );
  return Array.from(new Uint8Array(bits)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomPassword(): string {
  const a = new Uint8Array(24);
  crypto.getRandomValues(a);
  return Array.from(a).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Comparación en tiempo constante (evita timing por longitud de prefijo común).
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

// Rate limiting básico, best-effort (en memoria por instancia). Una versión
// robusta usaría una tabla; esto ya frena ráfagas obvias por IP+usuario.
const attempts = new Map<string, { n: number; t: number }>();
const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 10;
function rateLimited(key: string): boolean {
  const now = Date.now();
  const cur = attempts.get(key);
  if (!cur || now - cur.t > WINDOW_MS) { attempts.set(key, { n: 1, t: now }); return false; }
  cur.n++;
  return cur.n > MAX_ATTEMPTS;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const started = Date.now();
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
  // 401 genérico: no distingue "usuario inexistente" de "credencial incorrecta".
  const fail = () => json({ error: "Usuario o credencial incorrectos" }, 401);
  // Retardo constante (~350ms) para mitigar fuerza bruta y timing.
  const settle = async (resp: Response) => {
    const elapsed = Date.now() - started;
    if (elapsed < 350) await new Promise((r) => setTimeout(r, 350 - elapsed));
    return resp;
  };

  try {
    const ip = req.headers.get("x-forwarded-for") ?? "unknown";
    const body = await req.json().catch(() => ({}));
    const username = String(body.username ?? "").trim().toLowerCase();
    const credential = String(body.credential ?? "");
    if (!username || !credential) return settle(fail());
    if (rateLimited(`${ip}:${username}`)) return settle(json({ error: "Demasiados intentos. Espera un minuto." }, 429));

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

    const { data: secret } = await admin
      .from("fa_user_secrets")
      .select("user_id, username, password_hash, salt, auth_uid, auth_password")
      .eq("username", username)
      .maybeSingle();
    if (!secret || !secret.password_hash || !secret.salt) return settle(fail());

    const computed = await pbkdf2Hex(credential, secret.salt);
    if (!timingSafeEqual(computed, secret.password_hash)) return settle(fail());

    // ── Credencial válida → garantizar usuario de Supabase Auth ───────────────
    const email = `${secret.username}@fa.local`;
    let authPassword: string | null = secret.auth_password;
    let authUid: string | null = secret.auth_uid;

    if (authUid && authPassword) {
      // ok: ya existe
    } else if (authUid && !authPassword) {
      authPassword = randomPassword();
      await admin.auth.admin.updateUserById(authUid, { password: authPassword });
      await admin.from("fa_user_secrets").update({ auth_password: authPassword }).eq("user_id", secret.user_id);
    } else {
      authPassword = randomPassword();
      const { data: created, error: cErr } = await admin.auth.admin.createUser({
        email, password: authPassword, email_confirm: true,
        user_metadata: { app_user_id: secret.user_id },
      });
      if (cErr || !created?.user) {
        // Probablemente el usuario de Auth ya existe (uid perdido) → rotar su contraseña.
        const { data: list } = await admin.auth.admin.listUsers();
        const existing = list?.users?.find((u) => u.email === email);
        if (!existing) return settle(fail());
        authUid = existing.id;
        await admin.auth.admin.updateUserById(authUid, { password: authPassword });
      } else {
        authUid = created.user.id;
      }
      await admin.from("fa_user_secrets").update({ auth_uid: authUid, auth_password: authPassword }).eq("user_id", secret.user_id);
    }

    // ── Iniciar sesión y devolver la sesión real al cliente ───────────────────
    const pub = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
    const { data: signIn, error: sErr } = await pub.auth.signInWithPassword({ email, password: authPassword! });
    if (sErr || !signIn?.session) return settle(fail());

    const { data: profileRow } = await admin.from("fa_users").select("data").eq("id", secret.user_id).maybeSingle();

    return settle(json({ session: signIn.session, profile: profileRow?.data ?? null }, 200));
  } catch (_e) {
    return settle(fail());
  }
});
