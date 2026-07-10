// ═══ RECOVERYEMAILMODAL ══════════════════════════════════════════════════════
// Modal para configurar el correo de recuperación en el primer login.
// Extraído de modals.tsx (A7-04): App.tsx solo importaba este componente de
// modals.tsx, arrastrando el fichero entero (54,1 kB) al chunk inicial — el
// resto de importadores de modals.tsx ya viven en chunks lazy.
import { useState } from "react";
import { C, F, S } from "../theme/tokens.js";
import { Overline, ErrorMsg, CtaButton, GhostButton, FieldLabel } from "./primitives.jsx";

export function RecoveryEmailModal({ onSave, onSkip }: { onSave: (email: string) => Promise<void> | void; onSkip: () => void }) {
  const [email,   setEmail]   = useState("");
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const handleSave = async () => {
    if (!valid || loading) return;
    setLoading(true); setError("");
    try { await onSave(email.trim().toLowerCase()); }
    catch { setError("Error al guardar el correo. Inténtalo de nuevo."); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ ...S.app, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ maxWidth: 400, width: "100%" }}>
        <div style={{ marginBottom: 30, paddingBottom: 20, borderBottom: `2px solid ${C.ink}` }}>
          <Overline>Primer acceso</Overline>
          <h1 style={{ ...S.h1 }}>Correo de recuperación</h1>
        </div>
        <p style={{ fontFamily: F.sans, fontSize: 14, color: C.ink2, lineHeight: 1.6, marginBottom: 24 }}>
          Añade un correo para poder recuperar tu acceso si olvidas tu PIN. Puedes saltarte este paso, pero no podrás recuperar tu cuenta sin ayuda del profesor.
        </p>
        <div style={{ marginBottom: 8 }}>
          <FieldLabel>Correo electrónico</FieldLabel>
          <input
            type="email"
            style={{ ...S.input }}
            value={email}
            autoFocus
            onChange={(e) => { setEmail(e.target.value); setError(""); }}
            placeholder="correo@ejemplo.com"
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
          />
        </div>
        {error && <ErrorMsg style={{ marginBottom: 12 }}>{error}</ErrorMsg>}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 24 }}>
          <CtaButton full lg onClick={handleSave} disabled={!valid || loading}>
            {loading ? "Guardando…" : "Guardar y continuar →"}
          </CtaButton>
          <GhostButton full lg onClick={onSkip}>Ahora no</GhostButton>
        </div>
      </div>
    </div>
  );
}
