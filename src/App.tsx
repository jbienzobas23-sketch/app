import { useState, useEffect, useRef, useMemo, lazy, Suspense } from "react";
import { createPortal } from "react-dom";
import { supabase } from "./supabase.js";
import type { Exercise, ExerciseResult, UserProfile } from "./lib/types.js";

/* ═══════════════════════════════════════════════════════════════════════════
   FUNCIONES ARMÓNICAS · APP ROOT
   ───────────────────────────────────────────────────────────────────────────
   Funciones puras, constantes de dominio, tokens y datos semilla viven en
   módulos bajo src/lib, src/theme y src/seed.js (Fase 0); la capa de datos
   (estado de entidades + carga + CRUD con persistencia) en hooks/useAppData
   (A2.3). Este archivo conserva la sesión, el routing y el submit.
   ═══════════════════════════════════════════════════════════════════════════ */

import { TEACHER_TAB_PATH, useHashRoute, coursesPath, getLastPanelPath, parseHashQuery } from "./lib/routing.js";
import { C, S, FONT_SANS } from "./theme/tokens.js";
import { modelsOf, partsOf, partToExercise, updatePart, partKeyReadyOf } from "./lib/domain.js";
import { effectivePaletteId, applyPaletteToExercise } from "./lib/palette.js";
import { useAppData } from "./hooks/useAppData.js";
import { useSubmitAnswer } from "./hooks/useSubmitAnswer.js";



// ═══ 5. PRIMITIVOS UI COMPARTIDOS ═══════════════════════════════════════════

import { useInjectFonts } from "./theme/fonts.js";

// ═══ 6. VISTAS DE AUTENTICACIÓN ═════════════════════════════════════════════

import { logout } from "./auth/authClient.js";
import { SetupView, LoginView, HomeView, ForgotPinView, ResetPinView, TeacherPickerView } from "./components/auth.jsx";
import type { AuthUser, Teacher } from "./components/auth.js";
import { RecoveryEmailModal } from "./components/RecoveryEmailModal.jsx";

import { ExerciseView } from "./components/ExerciseView.jsx";
import { CorrectionView } from "./components/CorrectionView.jsx";
import { QuestionnaireView } from "./components/QuestionnaireView.jsx";
import { StudentDash } from "./components/StudentDash.jsx";
import type { StudentUser } from "./components/StudentDash.js";
import { SessionShell } from "./components/SessionShell.jsx";

// Carga diferida (code-splitting) de lo pesado que no hace falta en el arranque:
// el subsistema de profesor (los alumnos no lo cargan) y la vista de esquema
// (~2k líneas; se carga al abrir un ejercicio de ese tipo). Cada uso va envuelto
// en <Suspense> (ver LazyView). Los módulos exportan con nombre → adaptamos a default.
const TeacherDash = lazy(() => import("./components/teacher.jsx").then((m) => ({ default: m.TeacherDash })));
const QuestionManagerView = lazy(() => import("./components/QuestionManagerView.jsx").then((m) => ({ default: m.QuestionManagerView })));
const SchemaExerciseView = lazy(() => import("./components/SchemaExerciseView.jsx").then((m) => ({ default: m.SchemaExerciseView })));

// Fallback mientras se descarga un chunk diferido. Pantalla completa, sobria.
const lazyFallback = (
  <div style={{ ...S.app, display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100dvh", color: C.muted, fontSize: 14 }}>
    Cargando…
  </div>
);

// Aviso flotante cuando una escritura al servidor falla (p. ej. RLS la rechaza
// porque la sesión no está enlazada). Portal a document.body → visible en
// cualquier vista. Antes estos fallos eran silenciosos y el estado local
// divergía del servidor sin que el usuario lo supiera.
function SaveErrorToast({ message, onClose }: { message: string | null; onClose: () => void }) {
  if (!message || typeof document === "undefined") return null;
  return createPortal(
    <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 2000, display: "flex", justifyContent: "center", padding: "0 16px calc(16px + env(safe-area-inset-bottom))", pointerEvents: "none" }}>
      <div role="alert" style={{ pointerEvents: "auto", maxWidth: 540, width: "100%", background: C.danger, color: "#fff", borderRadius: 10, padding: "12px 14px", boxShadow: "0 8px 30px rgba(0,0,0,0.28)", display: "flex", alignItems: "center", gap: 12, fontFamily: FONT_SANS, fontSize: 13, lineHeight: 1.4 }}>
        <span style={{ flex: 1 }}>{message}</span>
        <button onClick={onClose} className="fa-pressable" style={{ flexShrink: 0, background: "rgba(255,255,255,0.22)", border: "none", color: "#fff", borderRadius: 6, padding: "6px 11px", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: FONT_SANS }}>Cerrar</button>
      </div>
    </div>,
    document.body,
  );
}

// ─── Modo local de desarrollo (?local | ?local=alumno) ───────────────────────
// Arranca la app COMPLETA sin backend: datos de semilla en memoria y sesión ya
// iniciada (profesor por defecto; `?local=alumno` para el alumno). Sirve para
// trabajar sobre el contexto real de todas las ventanas sin Supabase (el
// staging está pausado) ni pasar por la primera configuración. Solo existe en
// `vite dev`: en el build de producción `import.meta.env.DEV` es false y la
// condición (constante) elimina el código; además las escrituras van a un
// cliente nulo, así que nada puede tocar un servidor por accidente.
const LOCAL_MODE: "profe" | "alumno" | null = import.meta.env.DEV
  ? (() => {
      const v = new URLSearchParams(window.location.search).get("local");
      return v === null ? null : v === "alumno" ? "alumno" : "profe";
    })()
  : null;
// Todos los datos del modo local (alumnos, grupos, cursos, unidades, ejercicios
// extra y entregas ficticias en todos los estados) viven en src/localSeed.ts.

// ═══ 15. APP ROOT ═══════════════════════════════════════════════════════════
export default function App() {
  useInjectFonts();

  // A7-07: sin import estático de localSeed — ni el ternario de LOCAL_MODE ni un
  // `import.meta.env.DEV && …` en la misma expresión bastan para que el bundler
  // pode el módulo del build de producción (verificado: el array seguía en el
  // bundle aunque la rama fuera inalcanzable en runtime, porque Rollup considera
  // "usada" cualquier referencia alcanzable, sin evaluar la condición). Con
  // `import()` dinámico la semilla vive en su propio chunk, cargado solo si
  // LOCAL_MODE está activo (solo posible en dev). El usuario inicial llega un
  // tick más tarde (irrelevante: es una herramienta de desarrollo local).
  const [user, setUser] = useState<UserProfile | null>(null);
  const [localUsers, setLocalUsers] = useState<UserProfile[]>([]);

  // Capa de datos (A2.3): estado de las entidades, carga desde Supabase y
  // helpers CRUD con persistencia — todo vive en hooks/useAppData. La única
  // frontera de vuelta hacia la sesión es onCurrentUserSync (updateUser
  // refresca al usuario logueado si es el perfil editado).
  const {
    exercises, users, results, categories, courses, units, groups, audioLibrary,
    setUsers, setResults,
    dbReady, saveError, setSaveError, serverHasAdmin, setServerHasAdmin,
    loadData, bootstrap, dbUpsertUser, dbUpsertResult,
    addUser, removeUser, updateUser,
    saveCorrection,
    addGroup, updateGroup, deleteGroup,
    addExercise, updateExercise, duplicateExercise, deleteExercise,
    addCategory, updateCategory, deleteCategory, toggleGlobalCategory,
    addCourse, updateCourse, deleteCourse,
    addUnit, updateUnit, deleteUnit, addExercisesToUnit, removeExerciseFromUnit,
    addAudio, updateAudio, deleteAudio,
  } = useAppData({ localMode: LOCAL_MODE, currentUser: user, onCurrentUserSync: setUser });

  useEffect(() => {
    if (!LOCAL_MODE) return;
    let cancelled = false;
    import("./localSeed.js").then((seed) => {
      if (cancelled) return;
      setLocalUsers(seed.LOCAL_USERS);
      setUser((prev) => prev ?? seed.LOCAL_USERS[LOCAL_MODE === "alumno" ? 1 : 0]);
    });
    return () => { cancelled = true; };
  }, []);

  // Navegación — la URL (#/…) es la fuente de verdad
  const { route, navigate } = useHashRoute();

  // Selector de usuario local (Jon, 2026-07-06): SOLO en `?local` (import.meta.env.DEV
  // + semilla local). Antes `?local=alumno` entraba SIEMPRE como la primera
  // alumna (Lucía) sin forma de ver a los demás sin tocar la URL o el código.
  // Este selector cambia el usuario activo con un clic, sin recargar — vive en
  // las dos pantallas de inicio (paneles de alumno y de profesor). Colapsado
  // por defecto (Jon, 2026-07-06: la fila de píldoras siempre abierta tapaba
  // la cabecera) — un único botón compacto que despliega la lista bajo
  // demanda y se cierra solo al elegir o al perder el foco.
  const switchLocalUser = (u: UserProfile) => { setUser(u); navigate(u.role === "student" ? "/alumno" : "/profesor"); };
  const [localSwitcherOpen, setLocalSwitcherOpen] = useState(false);
  const localSwitcherLabel = (u: UserProfile | null) =>
    !u ? "…" : u.role === "teacher" ? "👨‍🏫 Profesor" : (u.displayName || u.username || "").split(" ")[0];
  const localUserSwitcher = LOCAL_MODE ? (
    <div
      tabIndex={-1}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setLocalSwitcherOpen(false); }}
      style={{ position: "fixed", top: 10, right: 10, zIndex: 999 }}>
      <button onClick={() => setLocalSwitcherOpen((o) => !o)} title="Ver como… (solo beta local)"
        style={{ font: "inherit", fontFamily: FONT_SANS, fontSize: 11, fontWeight: 600, padding: "5px 10px", borderRadius: 999, cursor: "pointer",
          background: "rgba(255,255,255,0.92)", color: "#555", border: `1px solid ${C.line}`, boxShadow: "0 1px 6px rgba(0,0,0,0.1)" }}>
        {localSwitcherLabel(user)} {localSwitcherOpen ? "▲" : "▼"}
      </button>
      {localSwitcherOpen && (
        <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, display: "flex", flexDirection: "column", gap: 3, minWidth: 160, background: "#fff", border: `1px solid ${C.line}`, borderRadius: 10, padding: 6, boxShadow: "0 4px 18px rgba(0,0,0,0.16)" }}>
          {localUsers.map((u) => {
            const active = user?.id === u.id;
            return (
              <button key={u.id} onClick={() => { switchLocalUser(u); setLocalSwitcherOpen(false); }}
                style={{ font: "inherit", fontFamily: FONT_SANS, fontSize: 12.5, fontWeight: 600, textAlign: "left", padding: "7px 10px", borderRadius: 7, cursor: "pointer",
                  background: active ? C.ink : "transparent", color: active ? "#fff" : "#444", border: "none" }}>
                {u.role === "teacher" ? "👨‍🏫 Profesor" : (u.displayName || u.username)}
              </button>
            );
          })}
        </div>
      )}
    </div>
  ) : null;
  const [lastResult,   setLastResult]     = useState<ExerciseResult | null>(null);
  const redirectAfterLogin = useRef<string | null>(null);   // enlace profundo a recuperar tras login

  const [pendingLoginUser, setPendingLoginUser] = useState<UserProfile | null>(null); // alumno esperando configurar correo de recuperación
  const [showForgotPin,    setShowForgotPin]    = useState(false);
  // Sesión de Supabase Auth desde magic link — solo se reenvía a ResetPinView
  // (que la tipa `unknown`), nunca se lee su forma aquí.
  const [resetSession,     setResetSession]     = useState<unknown>(null);

  // Ejercicio referenciado por la URL (reconstruido desde el id)
  const routeExercise = useMemo(() => {
    const exId = route.params?.exId;
    if (!exId || exId === "nuevo") return null;
    // Los ids de la URL son texto; los del modelo pueden ser numéricos → comparar como texto
    return (exercises || []).find((e) => String(e.id) === String(exId)) || null;
  }, [route, exercises]);
  const exCtx = routeExercise
    ? { exercise: routeExercise, mode: route.params?.mode || "student" }
    : null;
  const qmCtx = routeExercise ? { exercise: routeExercise } : null;
  const loginRole = route.name === "login" ? route.params.role : null;

  // ─── Carga inicial desde Supabase ────────────────────────────────────────
  // Detección del magic link + carga de datos + has_admin — vive en useAppData
  // (bootstrap); la sesión de recuperación (resetSession) sigue siendo de App.
  useEffect(() => {
    if (LOCAL_MODE) return;   // modo local: sin backend, la semilla ya está puesta
    bootstrap(supabase, setResetSession);
  // Solo al montar; bootstrap se redefine cada render pero aquí queremos una única carga.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // M4.2: normaliza los enlaces heredados /profesor/ejercicio/:id/parte/:pid/…
  // a la única convención emitida (…/…?parte=:pid), una vez y con {replace} para
  // no dejar entrada de historial. El segmento se sigue ACEPTANDO (routing.ts,
  // @deprecated); esto solo reescribe bookmarks antiguos.
  useEffect(() => {
    if (route.params.partId && !parseHashQuery().parte) {
      const full = window.location.hash.replace(/^#/, "");
      const path = full.split("?")[0].replace(`/parte/${route.params.partId}`, "");
      navigate(`${path}?parte=${route.params.partId}`, { replace: true });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route]);

  // ─── Setup inicial (primer admin) ────────────────────────────────────────
  const handleSetup = (adminProfile: unknown) => {
    // El admin ya está creado en el servidor (create-user) y con sesión iniciada
    // (login) desde SetupView. Solo reflejamos el estado y entramos.
    setUser(adminProfile as UserProfile);
    setServerHasAdmin(true);
    navigate("/profesor");
    loadData(supabase);
  };

  // ─── Navegación helpers ──────────────────────────────────────────────────
  const freshExercise = (ex: Exercise) => exercises.find((e) => e.id === ex.id) || ex;

  // Si entras sin sesión a una ruta protegida, recuérdala para volver tras login
  useEffect(() => {
    if (user) return;
    const open = route.name === "home" || route.name === "login" || route.name === "setup";
    if (!open) {
      redirectAfterLogin.current = window.location.hash.replace(/^#/, "") || null;
    }
  }, [user, route]);

  const openCorrection = (ex: Exercise) => {
    // Calcular el resultado almacenado de forma local: no depende del `const
    // userResults` declarado más abajo en el cuerpo del componente, lo que
    // evita una referencia frágil en la zona muerta temporal (TDZ).
    const exId = String(ex.id);
    const stored = user ? (results[user.id] || {})[exId] : undefined;
    if (!stored) return;
    setLastResult(stored);
    navigate(`/alumno/ejercicio/${ex.id}/correccion`);
  };

  const openEx = (ex: Exercise, mode = "student") => {
    if (mode === "record") {
      // El cuestionario puro se "graba" desde el gestor de preguntas.
      // Los híbridos tienen su propio botón onManageQuestions; aquí se graba la clave interactiva.
      const isQuizOnly = modelsOf(ex).join(",") === "cuestionario";
      const action = isQuizOnly ? "preguntas" : "grabar";
      // Multiparte (F4, T4.2): el botón genérico apunta a la primera parte con
      // la clave incompleta — la entrada canónica pasan a ser los botones
      // por-parte del detalle, este es solo un atajo razonable.
      const parts = partsOf(ex);
      if (parts.length > 1) {
        const models = modelsOf(ex);
        const target = parts.find((p) => !partKeyReadyOf(ex, p, models)) || parts[0];
        navigate(`/profesor/ejercicio/${ex.id}/${action}?parte=${target.id}`);
      } else {
        navigate(`/profesor/ejercicio/${ex.id}/${action}`);
      }
    } else {
      navigate(`/alumno/ejercicio/${ex.id}`);
    }
  };


  // Finalizar el login una vez que el alumno ya tiene (o ha saltado) el correo de recuperación.
  // `u` llega tanto de LoginView (AuthProfile = Record<string, unknown>, servidor
  // sin tipar) como del propio estado ya tipado (flujo de correo de recuperación)
  // — `unknown` acepta ambos sin forzar un cast en las llamadas.
  const completeLogin = async (u: unknown) => {
    const profile = u as UserProfile;
    setUser(profile);
    // Con RLS, la carga anónima del montaje vino vacía: recargar ahora con la
    // sesión. loadData devuelve los usuarios para decidir el flujo del alumno.
    let loaded = { users };
    if (!profile.isGuest) {
      try { loaded = await loadData(supabase); } catch { /* mantiene el estado actual */ }
    }
    const dest = redirectAfterLogin.current;
    redirectAfterLogin.current = null;
    if (profile.role === "student") {
      const hasTeacher = (loaded.users || []).some((x) => x.role === "teacher" && x.id === profile.teacherId);
      if (!profile.teacherId || !hasTeacher) { navigate("/alumno/elegir-profesor", { replace: true }); return; }
      navigate(dest && dest.startsWith("/alumno") ? dest : "/alumno");
    } else {
      navigate(dest && dest.startsWith("/profesor") ? dest : "/profesor");
    }
  };

  // ─── Submit de respuestas (alumno entrega ejercicio) ────────────────────
  // Puntuación, intentos y persistencia de la entrega — vive en
  // hooks/useSubmitAnswer (A2.3); App solo aporta sus dependencias.
  const submitAnswer = useSubmitAnswer({
    exCtx,
    routePartId: route.params.partId,
    user, results, setResults, dbUpsertResult, updateExercise,
    freshExercise, setLastResult, navigate,
  });

  // ─── Routing ─────────────────────────────────────────────────────────────
  if (!dbReady) {
    return (
      <div style={{ ...S.app, display: "flex", alignItems: "center", justifyContent: "center", color: C.muted, fontSize: 14 }}>
        Cargando…
      </div>
    );
  }

  // Setup inicial: aún no hay admin
  // Primer arranque (mostrar Setup) SOLO si el servidor confirma que no hay admin
  // (anon no puede leer fa_users por RLS, de ahí el RPC has_admin).
  const noAdmin = serverHasAdmin === false;
  if (noAdmin) return <SetupView onSetup={handleSetup} />;

  // Selección de profesor para alumno (al primer login o desde "Cambiar profesor")
  if (route.name === "pick-teacher" && user?.role === "student") {
    const teacherList = (users || []).filter((u) => u.role === "teacher");
    return (
      <TeacherPickerView
        teachers={teacherList as unknown as Teacher[]}
        currentTeacherId={user.teacherId}
        onPick={(t) => { const upd = { ...user, teacherId: t.id }; updateUser(upd); navigate("/alumno"); }}
        onLogout={() => { logout(); setUser(null); navigate("/"); }}
      />
    );
  }

  // Login flow
  if (!user) {
    // 1. Recuperar acceso desde magic link enviado por correo
    if (resetSession) {
      return (
        <ResetPinView
          users={users}
          supabaseSession={resetSession}
          onReset={async (updatedUser) => {
            updateUser(updatedUser);
            await supabase.auth.signOut();
            setResetSession(null);
            navigate("/");
          }}
          onBack={async () => {
            await supabase.auth.signOut();
            setResetSession(null);
            navigate("/");
          }}
        />
      );
    }

    // 2. Primer login de alumno sin correo de recuperación configurado
    if (pendingLoginUser) {
      return (
        <RecoveryEmailModal
          onSave={async (email) => {
            const updated = { ...pendingLoginUser, recoveryEmail: email };
            setUsers((prev) => prev.map((u) => u.id === updated.id ? updated : u));
            await dbUpsertUser(updated);
            setPendingLoginUser(null);
            completeLogin(updated);
          }}
          onSkip={() => {
            setPendingLoginUser(null);
            completeLogin(pendingLoginUser);
          }}
        />
      );
    }

    // 3. Vista "He olvidado mi PIN"
    if (showForgotPin) {
      return (
        <ForgotPinView
          users={users}
          onBack={() => setShowForgotPin(false)}
        />
      );
    }

    const finishLogin = (u: unknown) => {
      // El correo de recuperación ahora vive en fa_user_secrets (servidor), no en
      // el perfil público; el antiguo prompt de configuración se reintroducirá con
      // una función de servidor (Fase 1, pendiente). Por ahora, login directo.
      completeLogin(u);
    };

    if (loginRole) {
      const labels: Record<string, string> = { admin: "administrador", teacher: "profesor", student: "alumno" };
      return (
        <LoginView
          roleLabel={labels[loginRole]}
          filterRole={loginRole}
          users={users as unknown as AuthUser[]}
          onLogin={finishLogin}
          onBack={() => navigate("/")}
          onForgotPin={loginRole === "student" ? () => setShowForgotPin(true) : undefined}
          onGuest={
            loginRole === "student"
              ? () => {
                  const guest = { id: `guest-${Date.now()}`, displayName: "Invitado", role: "student", isGuest: true };
                  setUser(guest); navigate("/alumno");
                }
              // Profesor invitado: SOLO en el build local (import.meta.env.DEV).
              // Permite entrar al panel de profesor sin credenciales para pruebas;
              // en producción `import.meta.env.DEV` es false y la opción no existe.
              : (loginRole === "teacher" && import.meta.env.DEV)
                ? () => {
                    const guest = { id: `guest-profe-${Date.now()}`, displayName: "Profesor invitado", role: "teacher", isGuest: true };
                    setUser(guest); navigate("/profesor");
                  }
                : undefined
          }
        />
      );
    }
    return (
      <HomeView
        onTeacher={() => navigate("/entrar/profesor")}
        onStudent={() => navigate("/entrar/alumno")}
      />
    );
  }

  // Vistas autenticadas
  const onLogout = () => { logout(); setUser(null); navigate("/"); };
  const userResults = results[user.id] || {};
  const isStudent = user.role === "student";

  // Mensaje cuando el ejercicio referenciado por la URL no existe (o no cargó)
  const NotFound = ({ to }: { to: string }) => (
    <div style={{ ...S.app, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, color: C.muted, fontSize: 14, padding: 24, textAlign: "center" }}>
      <span>No se encontró este ejercicio.</span>
      <button style={S.btn} onClick={() => navigate(to)}>← Volver</button>
    </div>
  );

  // ── Sesión de ejercicio (interactivo / esquema / cuestionario) ──
  if (route.name === "session") {
    const back = isStudent ? "/alumno" : "/profesor";
    // Un alumno no puede entrar a modos de profesor
    if (isStudent && exCtx?.mode !== "student") { navigate("/alumno"); return null; }
    if (!exCtx) return <NotFound to={back} />;
    // Sesión multiparte (F4, T4.3): el alumno entrega TODAS las partes en una
    // sola sesión — envoltorio aparte, antes de resolver una parte concreta.
    // Con una sola parte, ni se monta: sigue el camino de siempre, sin cambios.
    if (exCtx.mode === "student" && partsOf(exCtx.exercise).length > 1) {
      const onBackMulti = () => navigate(getLastPanelPath("/alumno"));
      return <SessionShell exercise={exCtx.exercise} mode={exCtx.mode} onSubmit={submitAnswer} onBack={onBackMulti} />;
    }
    // Autoría por parte (F4, T4.2): grabar/previsualizar apuntan a la parte
    // de la URL (o la primera si no hay). SOLO para ejercicios GENUINAMENTE
    // multiparte (>1): `partsOf` sintetiza una única parte a partir de los
    // campos planos en el momento en que normalizeExercise la materializó por
    // primera vez, y esa parte sintetizada queda congelada — un patch posterior
    // que solo toque un campo plano (p.ej. `questions` al guardar el
    // cuestionario) no se refleja en ella. Proyectar con partToExercise en ese
    // caso pisaría los campos planos vigentes con esa parte obsoleta. Con un
    // solo part real, `exCtx.exercise` YA es la fuente de verdad — se usa tal cual.
    const isGenuinelyMultiPart = partsOf(exCtx.exercise).length > 1;
    const sessionUrlPartId = parseHashQuery().parte || route.params.partId;  // M4.2: ?parte= primero
    const baseExercise = (isGenuinelyMultiPart && (exCtx.mode === "record" || exCtx.mode === "preview"))
      ? partToExercise(exCtx.exercise, partsOf(exCtx.exercise).find((p) => p.id === sessionUrlPartId) || partsOf(exCtx.exercise)[0])
      : exCtx.exercise;
    const exModels = modelsOf(baseExercise);
    const onBack = () => navigate(getLastPanelPath(exCtx.mode === "record" || exCtx.mode === "preview" ? "/profesor" : "/alumno"));
    // Paleta efectiva = la del ejercicio, o la preferida por el usuario, o P1.
    const sessionPalette = effectivePaletteId(baseExercise, user?.defaultPalette);
    const sessionExercise = applyPaletteToExercise(baseExercise, sessionPalette) || baseExercise;
    // Ejercicio con dos modelos: shell de alternancia keep-mounted (alumno y
    // preview del profesor). Con una sola parte, el shell no muestra chips.
    if (exModels.length > 1 && (exCtx.mode === "student" || exCtx.mode === "preview")) {
      return <SessionShell exercise={sessionExercise} mode={exCtx.mode} onSubmit={submitAnswer} onBack={onBack} />;
    }
    // Ejercicio de un solo modelo (o modo record/preview con el modelo primario)
    const m = exModels[0];
    if (m === "esquema") {
      return <Suspense fallback={lazyFallback}><SchemaExerciseView exercise={sessionExercise} mode={exCtx.mode} onSubmit={submitAnswer} onBack={onBack} /></Suspense>;
    }
    if ((exCtx.mode === "student" || exCtx.mode === "preview") && m === "cuestionario") {
      // QuestionnaireView no conoce el modo (siempre se comportó como alumno);
      // el modo se inyecta aquí en el payload para que submitAnswer sepa que
      // una previsualización del profesor no debe guardarse como entrega real
      // (mismo patrón que esquema, más arriba).
      return <QuestionnaireView exercise={sessionExercise} onSubmit={(result) => submitAnswer({ ...result, mode: exCtx.mode })} onBack={onBack} />;
    }
    return <ExerciseView exercise={sessionExercise} mode={exCtx.mode} onSubmit={submitAnswer} onBack={onBack} />;
  }

  // ── Gestor de preguntas (cuestionario) ──
  if (route.name === "question-manager") {
    if (isStudent) { navigate("/alumno"); return null; }
    if (!qmCtx) return <NotFound to="/profesor" />;
    // Autoría por parte (F4, T4.2): QuestionManagerView no cambia por dentro —
    // recibe el ejercicio proyectado de la parte de la URL (o la primera) y
    // onSave escribe las preguntas en esa misma parte, solo si el ejercicio es
    // genuinamente multiparte; si no, en el campo plano de siempre.
    const qmParts = partsOf(qmCtx.exercise);
    const qmIsMultiPart = Array.isArray(qmCtx.exercise.parts) && qmCtx.exercise.parts.length > 1;
    const qmUrlPartId = parseHashQuery().parte || route.params.partId;  // M4.2: ?parte= primero
    const qmPartId = (qmUrlPartId && qmParts.some((p) => p.id === qmUrlPartId))
      ? qmUrlPartId
      : qmParts[0]?.id;
    const qmPart = qmParts.find((p) => p.id === qmPartId) || qmParts[0];
    const qmExercise = qmIsMultiPart ? partToExercise(qmCtx.exercise, qmPart) : qmCtx.exercise;
    return (
      <Suspense fallback={lazyFallback}>
        <QuestionManagerView
          exercise={qmExercise}
          onSave={(questions) => {
            if (qmIsMultiPart) updateExercise(qmCtx.exercise.id, { parts: updatePart(qmCtx.exercise, qmPartId, { questions }).parts });
            else updateExercise(qmCtx.exercise.id, { questions });
            navigate(getLastPanelPath("/profesor"));
          }}
          onBack={() => navigate(getLastPanelPath("/profesor"))}
        />
      </Suspense>
    );
  }

  // ── Corrección (depende del resultado recién entregado) ──
  if (route.name === "correction") {
    const back = route.params.from === "teacher" ? "/profesor" : "/alumno";
    if (!exCtx) return <NotFound to={back} />;
    const wasPreview = route.params.from === "teacher";
    // Reconstruible (T3.3): si no hay lastResult en memoria (recarga, enlace
    // pegado, atrás del navegador) y no es la previsualización efímera del
    // profesor, se reconstruye desde los resultados guardados — misma lógica
    // que openCorrection.
    let result = lastResult;
    if (!result && !wasPreview) {
      const exId = String(exCtx.exercise.id);
      result = (results[user?.id] || {})[exId];
    }
    if (!result) {
      // La previsualización del profesor sí es efímera y no se puede reconstruir.
      return <NotFound to={exCtx ? `/alumno/ejercicio/${exCtx.exercise.id}` : back} />;
    }
    const corrPalette = effectivePaletteId({ schemaPalette: result?.schemaPalette }, user?.defaultPalette);
    return (
      <CorrectionView
        exercise={applyPaletteToExercise(freshExercise(exCtx.exercise), corrPalette) || freshExercise(exCtx.exercise)}
        result={result}
        onBack={() => {
          setLastResult(null);
          // El preview del profesor es efímero: reemplaza la entrada de
          // historial para que "atrás" no reabra una corrección irreconstruible.
          navigate(getLastPanelPath(wasPreview ? "/profesor" : "/alumno"), { replace: wasPreview });
        }}
      />
    );
  }

  // ── Panel del alumno ──
  if (isStudent) {
    const visibleExercises = exercises; // (heurística actual: banco completo)
    return (
      <>
      {localUserSwitcher}
      <SaveErrorToast message={saveError} onClose={() => setSaveError(null)} />
      <StudentDash
        user={user as unknown as StudentUser}
        exercises={visibleExercises}
        results={userResults}
        courses={courses}
        units={units}
        groups={groups}
        tab={route.name === "student" ? route.params.tab : "all"}
        onTab={(t) => navigate(t === "courses" ? "/alumno/cursos" : "/alumno")}
        cursoId={route.name === "student" ? route.params.cursoId ?? null : null}
        unidadId={route.name === "student" ? route.params.unidadId ?? null : null}
        onNavigateCourses={(cursoId, unidadId) => navigate(coursesPath("student", cursoId, unidadId))}
        onExercise={(ex) => openEx(ex, "student")}
        onViewCorrection={openCorrection}
        onLogout={onLogout}
        onChangeTeacher={user.isGuest ? undefined : () => navigate("/alumno/elegir-profesor")}
        onUpdatePalette={(id) => updateUser({ ...user, defaultPalette: id })}
      />
      </>
    );
  }

  // ── Panel del profesor / admin ──
  if (route.name === "teacher" && route.params.tab === "users" && user?.role !== "admin") {
    navigate("/profesor", { replace: true });
    return null;
  }
  return (
    <>
    {localUserSwitcher}
    <Suspense fallback={lazyFallback}>
    <SaveErrorToast message={saveError} onClose={() => setSaveError(null)} />
    <TeacherDash
      currentUser={user}
      users={users}
      onAddUser={addUser}
      onRemoveUser={removeUser}
      onUpdateUser={updateUser}
      exercises={exercises}
      onUpdateExercise={updateExercise}
      onDeleteExercise={deleteExercise}
      results={results}
      tab={route.name === "teacher" ? route.params.tab : "exercises"}
      onTab={(t) => navigate(TEACHER_TAB_PATH[t] || "/profesor")}
      cursoId={route.name === "teacher" ? route.params.cursoId ?? null : null}
      unidadId={route.name === "teacher" ? route.params.unidadId ?? null : null}
      onNavigateCourses={(cursoId, unidadId) => navigate(coursesPath("teacher", cursoId, unidadId))}
      detailExId={route.name === "teacher-detail" ? (route.params.exId === "nuevo" ? "new" : route.params.exId) : null}
      viewingStudentId={route.name === "teacher-answer" ? route.params.studentId : null}
      viewingExId={route.name === "teacher-answer" ? route.params.exId : null}
      onViewStudentAnswer={(studentId, exId) => navigate(`/profesor/alumnos/${studentId}/ejercicio/${exId}`)}
      onBackFromAnswer={() => navigate(getLastPanelPath("/profesor/alumnos"))}
      onSelectExercise={(id) => {
        if (id == null) navigate(getLastPanelPath("/profesor"));
        else if (id === "new") navigate("/profesor/ejercicio/nuevo");
        else navigate(`/profesor/ejercicio/${id}`);
      }}
      onRecord={(ex, partId) => partId ? navigate(`/profesor/ejercicio/${ex.id}/grabar?parte=${partId}`) : openEx(freshExercise(ex), "record")}
      onManageQuestions={(ex, partId) => navigate(partId ? `/profesor/ejercicio/${ex.id}/preguntas?parte=${partId}` : `/profesor/ejercicio/${ex.id}/preguntas`)}
      onPreview={(ex, partId) => navigate(partId ? `/profesor/ejercicio/${ex.id}/previsualizar?parte=${partId}` : `/profesor/ejercicio/${ex.id}/previsualizar`)}
      onAdd={addExercise}
      onDuplicateExercise={duplicateExercise}
      onLogout={onLogout}
      categories={categories}
      onAddCategory={addCategory}
      onUpdateCategory={updateCategory}
      onDeleteCategory={deleteCategory}
      onToggleGlobalCategory={toggleGlobalCategory}
      courses={courses} units={units}
      onAddCourse={addCourse} onUpdateCourse={updateCourse} onDeleteCourse={deleteCourse}
      onAddUnit={addUnit} onUpdateUnit={updateUnit} onDeleteUnit={deleteUnit}
      onAddExercisesToUnit={addExercisesToUnit}
      onRemoveExerciseFromUnit={removeExerciseFromUnit}
      groups={groups} onAddGroup={addGroup} onUpdateGroup={updateGroup} onDeleteGroup={deleteGroup}
      onSaveCorrection={saveCorrection}
      audioLibrary={audioLibrary}
      onAddAudio={addAudio} onUpdateAudio={updateAudio} onDeleteAudio={deleteAudio}
    />
    </Suspense>
    </>
  );
}
