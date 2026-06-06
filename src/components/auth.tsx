// ═══ VISTAS DE AUTENTICACIÓN ═════════════════════════════════════════════════
// Setup inicial, login, home, recuperación/reseteo de PIN y selección de profesor.
// Extraídas de App.jsx (Fase 2) sin cambiar su lógica.
import { useState, useMemo } from "react";
import { S, C, F } from "../theme/tokens.js";
import { Overline, FieldLabel, TextInput, ErrorMsg, CtaButton, CredentialInput, GhostButton, StatusCircle } from "./primitives.jsx";
import { login, logout, createUser, requestPinReset, resetPin } from "../auth/authClient.js";

// ── Interfaces de props ──────────────────────────────────────────────────────
type AuthProfile = Record<string, unknown>;
type AuthUser = { username: string; role: string; credType?: string; [k: string]: unknown };
type Teacher = { id: string; displayName: string; username: string; [k: string]: unknown };

interface SetupViewProps { onSetup: (profile: AuthProfile) => void; }
interface LoginViewProps {
  roleLabel: string; filterRole: string;
  users: AuthUser[];
  onLogin: (profile: AuthProfile) => void; onBack: () => void;
  onGuest?: () => void; onForgotPin?: () => void;
}
interface HomeViewProps { onTeacher: () => void; onStudent: () => void; }
interface SimpleBackProps { onBack: () => void; }
interface TeacherPickerViewProps {
  teachers: Teacher[]; currentTeacherId?: string | null;
  onPick: (teacher: Teacher) => void; onLogout: () => void;
}

// Pantalla de primera ejecución (aún no existe ninguna cuenta admin)
export function SetupView({ onSetup }: SetupViewProps) {
  const [displayName, setDisplayName] = useState("");
  const [username,    setUsername]    = useState("admin");
  const [pass,        setPass]        = useState("");
  const [pass2,       setPass2]       = useState("");
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState("");

  const mismatch = pass && pass2 && pass !== pass2;
  const canSave  = displayName.trim() && username.trim() && pass.length >= 6 && pass === pass2 && !loading;

  const handleSubmit = async () => {
    if (!canSave) return;
    setLoading(true); setError("");
    try {
      const u = username.trim().toLowerCase();
      // El admin se crea en el SERVIDOR (hash PBKDF2 allí). Es el caso "bootstrap":
      // create-user lo permite sin sesión solo si aún no existe ningún admin.
      await createUser({ username: u, credential: pass, role: "admin", displayName: displayName.trim(), credType: "password" });
      // Iniciar sesión real con la nueva cuenta y devolver su perfil.
      const profile = await login(u, pass) as AuthProfile;
      onSetup(profile);
    } catch (e) { setError((e as Error).message || "Error al configurar la cuenta. Inténtalo de nuevo."); }
    finally  { setLoading(false); }
  };

  return (
    <div style={{ ...S.app, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ maxWidth: 400, width: "100%" }}>
        <div style={{ marginBottom: 30, paddingBottom: 20, borderBottom: `2px solid ${C.ink}` }}>
          <Overline>Primera configuración</Overline>
          <h1 style={{ ...S.h1 }}>Crear cuenta de administrador</h1>
        </div>

        <div style={{ marginBottom: 14 }}>
          <FieldLabel>Tu nombre (visible para los alumnos)</FieldLabel>
          <TextInput value={displayName} onChange={setDisplayName} placeholder="Ej: Prof. García" />
        </div>
        <div style={{ marginBottom: 14 }}>
          <FieldLabel>Nombre de usuario</FieldLabel>
          <TextInput value={username} onChange={(v) => setUsername(v.toLowerCase().replace(/\s/g, ""))} placeholder="admin" />
        </div>
        <div style={{ marginBottom: 14 }}>
          <FieldLabel>Contraseña (mínimo 6 caracteres)</FieldLabel>
          <TextInput value={pass} onChange={setPass} placeholder="••••••" type="password" />
        </div>
        <div style={{ marginBottom: mismatch ? 6 : 24 }}>
          <FieldLabel>Confirmar contraseña</FieldLabel>
          <input type="password" autoComplete="new-password"
            style={{ ...S.input, borderColor: mismatch ? C.danger : undefined }}
            value={pass2} onChange={(e) => setPass2(e.target.value)} placeholder="••••••"
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()} />
        </div>

        {mismatch && <ErrorMsg style={{ marginBottom: 16 }}>Las contraseñas no coinciden</ErrorMsg>}
        <ErrorMsg>{error}</ErrorMsg>

        <CtaButton full lg onClick={handleSubmit} disabled={!canSave}>
          {loading ? "Configurando…" : "Crear cuenta y comenzar →"}
        </CtaButton>
      </div>
    </div>
  );
}

// Pantalla de login (alumno/profesor/admin)
export function LoginView({ roleLabel, filterRole, users, onLogin, onBack, onGuest, onForgotPin }: LoginViewProps) {
  const [username,   setUsername]   = useState("");
  const [credential, setCredential] = useState("");
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState("");

  const targetUsers = useMemo(() =>
    (users || []).filter((u) => u.role === filterRole || (filterRole === "teacher" && u.role === "admin")),
  [users, filterRole]);
  const matchedUser = useMemo(() => {
    if (!username.trim()) return null;
    return targetUsers.find((u) => u.username === username.trim().toLowerCase()) || null;
  }, [username, targetUsers]);

  const isPin     = matchedUser?.credType === "pin";
  const credLabel = matchedUser ? (isPin ? "PIN" : "Contraseña") : "Contraseña / PIN";
  const canSubmit = username.trim() && credential && !loading;

  const handleLogin = async () => {
    if (!canSubmit) return;
    setLoading(true); setError("");
    try {
      // La verificación de la credencial ocurre en el SERVIDOR (Edge Function):
      // el cliente nunca recibe el hash ni la sal.
      const profile = await login(username.trim().toLowerCase(), credential) as AuthProfile | null;
      const roleOk = profile?.role === filterRole || (filterRole === "teacher" && profile?.role === "admin");
      if (!roleOk) {
        await logout();
        setError(`Esta cuenta no puede entrar como ${roleLabel.toLowerCase()}.`);
        return;
      }
      onLogin(profile);
    } catch (e) {
      setError((e as Error).message || "No se pudo iniciar sesión.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ ...S.app, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ maxWidth: 380, width: "100%" }}>
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: F.sans, fontSize: 13, color: "#888", padding: 0, marginBottom: 28 }}>← Inicio</button>
        <div style={{ marginBottom: 30, paddingBottom: 20, borderBottom: `2px solid ${C.ink}` }}>
          <Overline>Acceso · {roleLabel}</Overline>
          <h1 style={{ ...S.h1 }}>Iniciar sesión</h1>
        </div>

        <div style={{ marginBottom: 16 }}>
          <FieldLabel>Nombre de usuario</FieldLabel>
          <input style={{ ...S.input }} value={username} autoFocus autoComplete="username"
            onChange={(e) => { setUsername(e.target.value); setError(""); }} placeholder="usuario" />
        </div>
        <div style={{ marginBottom: 24 }}>
          <FieldLabel>{credLabel}</FieldLabel>
          <CredentialInput kind={isPin ? "pin" : "password"} value={credential}
            onChange={(v) => { setCredential(v); setError(""); }} onSubmit={handleLogin} marginBottom={0} />
        </div>

        {error && <ErrorMsg style={{ marginBottom: 14 }}>{error}</ErrorMsg>}
        <CtaButton full lg onClick={handleLogin} disabled={!canSubmit}>
          {loading ? "Verificando…" : "Entrar →"}
        </CtaButton>

        {onForgotPin && (
          <div style={{ textAlign: "center", marginTop: 16 }}>
            <button
              onClick={onForgotPin}
              style={{ background: "none", border: "none", cursor: "pointer", fontFamily: F.sans, fontSize: 12, color: C.muted, textDecoration: "underline", padding: 0 }}
            >
              He olvidado mi PIN
            </button>
          </div>
        )}

        {onGuest && (
          <>
            <div style={{ display: "flex", alignItems: "center", margin: "22px 0 16px" }}>
              <div style={{ flex: 1, height: 1, background: C.line }} />
              <span style={{ fontFamily: F.sans, fontSize: 11, color: C.muted, padding: "0 12px", whiteSpace: "nowrap" }}>o sin cuenta</span>
              <div style={{ flex: 1, height: 1, background: C.line }} />
            </div>
            <GhostButton full lg onClick={onGuest}>Entrar como invitado</GhostButton>
            <p style={{ fontFamily: F.sans, fontSize: 11, color: C.muted, textAlign: "center", margin: "10px 0 0", lineHeight: 1.5 }}>
              Modo de prueba · los resultados no se guardan
            </p>
          </>
        )}
      </div>
    </div>
  );
}

// Pantalla inicial: selección de rol
export function HomeView({ onTeacher, onStudent }: HomeViewProps) {
  return (
    <div style={{ ...S.app, display: "flex", alignItems: "center", justifyContent: "center", padding: "calc(24px + env(safe-area-inset-top,0px)) 24px calc(24px + env(safe-area-inset-bottom,0px))" }}>
      <div style={{ maxWidth: 360, width: "100%", textAlign: "center" }}>
        <h1 style={{ fontFamily: F.sans, fontSize: 52, fontWeight: 700, letterSpacing: "-0.04em", lineHeight: 1.0, margin: 0 }}>
          Análisis<br />auditivo
        </h1>
        <div style={{ width: 40, height: 2, background: C.ink, margin: "26px auto 22px" }} />
        <p style={{ fontFamily: F.sans, fontSize: 14, color: "#888", lineHeight: 1.6, maxWidth: 270, margin: "0 auto 36px" }}>
          Herramienta interactiva de análisis y escucha armónica para el aula.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          <CtaButton full lg onClick={onStudent}>Acceso alumno</CtaButton>
          <GhostButton full lg onClick={onTeacher}>Acceso profesor</GhostButton>
        </div>
      </div>
    </div>
  );
}

// Vista para solicitar enlace de recuperación de PIN por correo
export function ForgotPinView({ onBack }: SimpleBackProps) {
  const [username, setUsername] = useState("");
  const [loading,  setLoading]  = useState(false);
  const [sent,     setSent]     = useState(false);
  const [error,    setError]    = useState("");

  const handleSend = async () => {
    if (!username.trim() || loading) return;
    setLoading(true); setError("");
    try {
      // El servidor busca el correo de recuperación (en fa_user_secrets) y envía el
      // enlace. Respuesta genérica: mostramos "enviado" exista o no el usuario, para
      // no revelar quién tiene cuenta.
      await requestPinReset(username.trim().toLowerCase(), window.location.origin + (window.location.pathname || "/"));
      setSent(true);
    } catch (e) { setError((e as Error).message || "No se pudo enviar el correo. Inténtalo de nuevo."); }
    finally { setLoading(false); }
  };

  if (sent) {
    return (
      <div style={{ ...S.app, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ maxWidth: 380, width: "100%", textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 20 }}>✉</div>
          <h1 style={{ ...S.h1, textAlign: "center" }}>Correo enviado</h1>
          <p style={{ fontFamily: F.sans, fontSize: 14, color: C.ink2, lineHeight: 1.6, marginBottom: 28 }}>
            Hemos enviado un enlace de acceso a tu correo de recuperación. Haz clic en él para configurar un nuevo PIN.
          </p>
          <GhostButton full lg onClick={onBack}>← Volver al inicio</GhostButton>
        </div>
      </div>
    );
  }

  return (
    <div style={{ ...S.app, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ maxWidth: 380, width: "100%" }}>
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: F.sans, fontSize: 13, color: "#888", padding: 0, marginBottom: 28 }}>← Volver</button>
        <div style={{ marginBottom: 30, paddingBottom: 20, borderBottom: `2px solid ${C.ink}` }}>
          <Overline>Recuperar acceso · Alumno</Overline>
          <h1 style={{ ...S.h1 }}>He olvidado mi PIN</h1>
        </div>
        <p style={{ fontFamily: F.sans, fontSize: 14, color: C.ink2, lineHeight: 1.6, marginBottom: 20 }}>
          Introduce tu nombre de usuario. Te enviaremos un enlace a tu correo de recuperación.
        </p>
        <div style={{ marginBottom: 24 }}>
          <FieldLabel>Nombre de usuario</FieldLabel>
          <input
            style={{ ...S.input }}
            value={username}
            autoFocus
            autoComplete="username"
            onChange={(e) => { setUsername(e.target.value); setError(""); }}
            placeholder="usuario"
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
          />
        </div>
        {error && <ErrorMsg style={{ marginBottom: 14 }}>{error}</ErrorMsg>}
        <CtaButton full lg onClick={handleSend} disabled={!username.trim() || loading}>
          {loading ? "Enviando…" : "Enviar enlace →"}
        </CtaButton>
      </div>
    </div>
  );
}

// Vista para configurar nuevo PIN tras llegar desde el enlace de correo
export function ResetPinView({ onBack }: SimpleBackProps) {
  const [pin,     setPin]     = useState("");
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");
  const [done,    setDone]    = useState(false);

  const canSave = pin.length >= 4 && !loading;

  const handleReset = async () => {
    if (!canSave) return;
    setLoading(true); setError("");
    try {
      // El servidor identifica al usuario por la sesión de recuperación (correo
      // real del magic link) y actualiza su secreto; el cliente no hashea.
      await resetPin(pin, "pin");
      try { await logout(); } catch { /* cerrar la sesión de recuperación */ }
      setDone(true);
    } catch (e) { setError((e as Error).message || "Error al actualizar el PIN. Inténtalo de nuevo."); }
    finally { setLoading(false); }
  };

  if (done) {
    return (
      <div style={{ ...S.app, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ maxWidth: 380, width: "100%", textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 20 }}>✓</div>
          <h1 style={{ ...S.h1, textAlign: "center" }}>PIN actualizado</h1>
          <p style={{ fontFamily: F.sans, fontSize: 14, color: C.ink2, lineHeight: 1.6, marginBottom: 28 }}>
            Tu PIN ha sido actualizado correctamente. Ya puedes iniciar sesión con tu nuevo PIN.
          </p>
          <CtaButton full lg onClick={onBack}>Ir al inicio →</CtaButton>
        </div>
      </div>
    );
  }

  return (
    <div style={{ ...S.app, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ maxWidth: 380, width: "100%" }}>
        <div style={{ marginBottom: 30, paddingBottom: 20, borderBottom: `2px solid ${C.ink}` }}>
          <Overline>Recuperar acceso</Overline>
          <h1 style={{ ...S.h1 }}>Nuevo PIN de acceso</h1>
        </div>
        <p style={{ fontFamily: F.sans, fontSize: 14, color: C.ink2, lineHeight: 1.6, marginBottom: 20 }}>
          Elige un nuevo PIN de 4 a 6 dígitos.
        </p>
        <div style={{ marginBottom: 24 }}>
          <FieldLabel>Nuevo PIN</FieldLabel>
          <CredentialInput kind="pin" value={pin} onChange={setPin} onSubmit={handleReset} marginBottom={0} />
        </div>
        {error && <ErrorMsg style={{ marginBottom: 14 }}>{error}</ErrorMsg>}
        <CtaButton full lg onClick={handleReset} disabled={!canSave}>
          {loading ? "Guardando…" : "Guardar nuevo PIN →"}
        </CtaButton>
      </div>
    </div>
  );
}

// Selector de profesor (para alumnos al primer login)
export function TeacherPickerView({ teachers, currentTeacherId, onPick, onLogout }: TeacherPickerViewProps) {
  const [hoverId, setHoverId] = useState<string | null>(null);
  return (
    <div style={{ ...S.app, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ maxWidth: 400, width: "100%" }}>
        <div style={{ marginBottom: 30, paddingBottom: 20, borderBottom: `2px solid ${C.ink}` }}>
          <Overline>Selección de profesor</Overline>
          <h1 style={{ ...S.h1 }}>{currentTeacherId ? "Cambiar profesor" : "Elige tu profesor"}</h1>
        </div>

        {teachers.length === 0 ? (
          <div style={{ paddingTop: 8 }}>
            <p style={{ color: C.muted, fontSize: 13, marginBottom: 14 }}>Aún no hay profesores registrados.</p>
            <GhostButton onClick={onLogout}>Volver al inicio</GhostButton>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 28 }}>
            {teachers.map((t) => {
              const isSel   = t.id === currentTeacherId;
              const isHover = hoverId === t.id;
              return (
                <button key={t.id} onClick={() => onPick(t)}
                  onMouseEnter={() => setHoverId(t.id)} onMouseLeave={() => setHoverId(null)}
                  style={{ background: isSel ? C.ink : isHover ? C.paper2 : C.paper, border: `1px solid ${isSel ? C.ink : isHover ? C.ink2 : C.line}`, borderRadius: 8, padding: "12px 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, textAlign: "left" }}>
                  <div style={{ width: 38, height: 38, borderRadius: "50%", background: isSel ? "rgba(255,255,255,0.15)" : C.chipBg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: F.serif, fontSize: 18, fontWeight: 600, color: isSel ? "#fff" : C.ink, flexShrink: 0 }}>
                    {t.displayName[0].toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: F.sans, fontWeight: 600, fontSize: 14, color: isSel ? "#fff" : C.ink, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.displayName}</div>
                    <div style={{ fontFamily: F.sans, fontSize: 12, color: isSel ? "rgba(255,255,255,0.6)" : C.muted }}>@{t.username}</div>
                  </div>
                  {isSel && <StatusCircle done size={18} />}
                </button>
              );
            })}
          </div>
        )}

        <button onClick={onLogout} style={{ background: "none", border: "none", color: C.muted, fontSize: 12, cursor: "pointer", fontFamily: F.sans, padding: 0 }}>Salir</button>
      </div>
    </div>
  );
}
