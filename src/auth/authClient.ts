// ═══ CLIENTE DE AUTENTICACIÓN (Fase 1) ═══════════════════════════════════════
// Login vía servidor: llama a la Edge Function `login`, que verifica la
// credencial con PBKDF2 en el SERVIDOR y devuelve una sesión real de Supabase
// Auth. El cliente solo recibe la sesión (nunca el hash ni la sal) y la fija con
// supabase.auth.setSession. A partir de ahí todas las consultas van autenticadas.
// Migrado a TypeScript (Fase 3).
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from "../supabase.js";

const LOGIN_URL = `${SUPABASE_URL}/functions/v1/login`;

// Error con código HTTP adjunto, para que la UI distinga 401/429/…
interface HttpError extends Error { status?: number; }
// Forma tolerante de las respuestas JSON de las Edge Functions.
interface AuthResponse { session?: { access_token: string; refresh_token: string }; profile?: unknown; error?: string; ok?: boolean; }

function authHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  };
}

// Sustituye el header Authorization por el token de sesión actual (si lo hay).
async function withSessionToken(headers: Record<string, string>): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
  } catch { /* sin sesión: bootstrap/recuperación */ }
}

// login(username, credential) → perfil público del usuario.
// Lanza Error con .status (401 credencial incorrecta, 429 demasiados intentos).
export async function login(username: string, credential: string): Promise<unknown> {
  let res!: Response;
  let json!: AuthResponse;
  try {
    res = await fetch(LOGIN_URL, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ username, credential }),
    });
    json = await res.json().catch(() => ({}));
  } catch {
    throw new Error("Sin conexión con el servidor. Inténtalo más tarde.");
  }
  if (!res.ok || !json.session) {
    const err: HttpError = new Error(json.error || "No se pudo iniciar sesión.");
    err.status = res.status;
    throw err;
  }
  const { error } = await supabase.auth.setSession(json.session);
  if (error) throw new Error("No se pudo establecer la sesión.");
  return json.profile;
}

// Cierra la sesión de Supabase Auth.
export async function logout(): Promise<void> {
  try { await supabase.auth.signOut(); } catch { /* sin sesión */ }
}

// createUser(payload) — crea un usuario vía servidor (hash en servidor; perfil a
// fa_users y secreto a fa_user_secrets). Envía el token de sesión del que llama
// (si lo hay) para la autorización; sin sesión solo sirve para el bootstrap del
// primer admin. payload: { username, credential, role, displayName, credType?,
// teacherId?, recoveryEmail? }. Devuelve el perfil público creado.
export async function createUser(payload: Record<string, unknown>): Promise<unknown> {
  const headers = authHeaders();
  await withSessionToken(headers);

  let res!: Response;
  let json!: AuthResponse;
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/create-user`, {
      method: "POST", headers, body: JSON.stringify(payload),
    });
    json = await res.json().catch(() => ({}));
  } catch {
    throw new Error("Sin conexión con el servidor. Inténtalo más tarde.");
  }
  if (!res.ok || !json.profile) {
    const err: HttpError = new Error(json.error || "No se pudo crear el usuario.");
    err.status = res.status;
    throw err;
  }
  return json.profile;
}

// resetCredential({ userId, credential, credType }) — un admin/profesor restablece
// la credencial de otro usuario. El hash se calcula y guarda en el servidor.
export async function resetCredential(payload: Record<string, unknown>): Promise<unknown> {
  const headers = authHeaders();
  await withSessionToken(headers);

  let res!: Response;
  let json!: AuthResponse;
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/reset-credential`, {
      method: "POST", headers, body: JSON.stringify(payload),
    });
    json = await res.json().catch(() => ({}));
  } catch {
    throw new Error("Sin conexión con el servidor. Inténtalo más tarde.");
  }
  if (!res.ok || !json.profile) {
    const err: HttpError = new Error(json.error || "No se pudo restablecer la credencial.");
    err.status = res.status;
    throw err;
  }
  return json.profile;
}

// requestPinReset(username, redirectTo) — pide recuperar el PIN. El servidor busca
// el correo de recuperación (en fa_user_secrets) y envía el magic link. Respuesta
// siempre genérica (no revela si el usuario existe).
export async function requestPinReset(username: string, redirectTo: string): Promise<boolean> {
  const headers = authHeaders();
  let res: Response;
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/request-pin-reset`, {
      method: "POST", headers, body: JSON.stringify({ username, redirectTo }),
    });
  } catch {
    throw new Error("Sin conexión con el servidor. Inténtalo más tarde.");
  }
  // 200 = respuesta genérica del servidor (exista o no el usuario, A3-01 NO TOCAR).
  // Cualquier otro estado (404/5xx: función sin desplegar o caída) es un fallo
  // distinguible — no debe leerse como "correo enviado".
  return res.ok;
}

// resetPin(credential, credType) — fija un nuevo PIN usando la sesión ACTUAL de
// recuperación (la del magic link, con el correo real). El servidor identifica al
// usuario por ese correo y actualiza el secreto.
export async function resetPin(credential: string, credType = "pin"): Promise<boolean> {
  const headers = authHeaders();
  await withSessionToken(headers);

  let res!: Response;
  let json!: AuthResponse;
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/reset-pin`, {
      method: "POST", headers, body: JSON.stringify({ credential, credType }),
    });
    json = await res.json().catch(() => ({}));
  } catch {
    throw new Error("Sin conexión con el servidor. Inténtalo más tarde.");
  }
  if (!res.ok || !json.ok) {
    const err: HttpError = new Error(json.error || "No se pudo actualizar el PIN.");
    err.status = res.status;
    throw err;
  }
  return true;
}
