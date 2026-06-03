// ═══ CLIENTE DE AUTENTICACIÓN (Fase 1) ═══════════════════════════════════════
// Login vía servidor: llama a la Edge Function `login`, que verifica la
// credencial con PBKDF2 en el SERVIDOR y devuelve una sesión real de Supabase
// Auth. El cliente solo recibe la sesión (nunca el hash ni la sal) y la fija con
// supabase.auth.setSession. A partir de ahí todas las consultas van autenticadas.
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from "../supabase.js";

const LOGIN_URL = `${SUPABASE_URL}/functions/v1/login`;

// login(username, credential) → perfil público del usuario.
// Lanza Error con .status (401 credencial incorrecta, 429 demasiados intentos).
export async function login(username, credential) {
  let res, json;
  try {
    res = await fetch(LOGIN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ username, credential }),
    });
    json = await res.json().catch(() => ({}));
  } catch {
    throw new Error("Sin conexión con el servidor. Inténtalo más tarde.");
  }
  if (!res.ok || !json.session) {
    const err = new Error(json.error || "No se pudo iniciar sesión.");
    err.status = res.status;
    throw err;
  }
  const { error } = await supabase.auth.setSession(json.session);
  if (error) throw new Error("No se pudo establecer la sesión.");
  return json.profile;
}

// Cierra la sesión de Supabase Auth.
export async function logout() {
  try { await supabase.auth.signOut(); } catch { /* sin sesión */ }
}
