// ═══ CRIPTOGRAFÍA DE CREDENCIALES ════════════════════════════════════════════
// PBKDF2-SHA256 (100k iteraciones, salt aleatorio por usuario). Las contraseñas
// y PINs se guardan hasheadas; el texto plano nunca. Extraído de App.jsx (Fase 2).
// Migrado a TypeScript (Fase 3). NOTA: con el login de servidor (Fase 1) estas
// utilidades de cliente quedan en desuso; se conservan por compatibilidad.

// ─── Criptografía (PBKDF2-SHA256, 100k iter., salt aleatorio por usuario) ──
export const generateSalt = (): string => {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
};

export const hashCredential = async (credential: string, salt: string): Promise<string> => {
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

export const verifyCredential = async (credential: string, hash: string, salt: string): Promise<boolean> =>
  (await hashCredential(credential, salt)) === hash;
