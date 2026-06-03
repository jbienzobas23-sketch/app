// ═══ CRIPTOGRAFÍA DE CREDENCIALES ════════════════════════════════════════════
// PBKDF2-SHA256 (100k iteraciones, salt aleatorio por usuario). Las contraseñas
// y PINs se guardan hasheadas; el texto plano nunca. Extraído de App.jsx (Fase 2).

// TODO Fase 1: mover la verificación de credenciales al servidor (Edge Function);
// estas utilidades dejan de usarse en el cliente cuando exista login de servidor.
// ─── Criptografía (PBKDF2-SHA256, 100k iter., salt aleatorio por usuario) ──
// Las contraseñas y PINs se guardan hasheadas; el texto plano nunca.
export const generateSalt = () => {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
};

export const hashCredential = async (credential, salt) => {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw", enc.encode(credential), "PBKDF2", false, ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: enc.encode(salt), iterations: 100000 },
    keyMaterial, 256
  );
  return Array.from(new Uint8Array(bits)).map((b) => b.toString(16).padStart(2, "0")).join("");
};

export const verifyCredential = async (credential, hash, salt) =>
  (await hashCredential(credential, salt)) === hash;
