import { useState, useEffect, useRef, useMemo, lazy, Suspense } from "react";
import { createPortal } from "react-dom";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "./supabase.js";
import type { Exercise, Category, Course, Unit, Group, ExerciseResult, UserProfile } from "./lib/types.js";
import type { AudioItem } from "./components/modals.js";

/* ═══════════════════════════════════════════════════════════════════════════
   FUNCIONES ARMÓNICAS · APP ROOT
   ───────────────────────────────────────────────────────────────────────────
   Funciones puras, constantes de dominio, tokens y datos semilla viven ahora en
   módulos bajo src/lib, src/theme y src/seed.js (extraídos en la Fase 0). Este
   archivo conserva los componentes React y el estado global de App().
   ═══════════════════════════════════════════════════════════════════════════ */

import { TEACHER_TAB_PATH, useHashRoute, coursesPath, getLastPanelPath, parseHashQuery } from "./lib/routing.js";
import { DEFAULT_MARGIN, DEFAULT_SCHEMA_MARGIN } from "./lib/sessionConstants.js";
import { C, S, FONT_SANS } from "./theme/tokens.js";
import { DEFAULT_CATEGORY, INIT_EXERCISES, INIT_AUDIO_LIBRARY } from "./seed.js";
import { LOCAL_USERS, LOCAL_GROUPS, LOCAL_COURSES, LOCAL_UNITS, LOCAL_EXERCISES, LOCAL_RESULTS } from "./localSeed.js";
import { modelsOf, answerFor, resultStatusOf, partsOf, partToExercise, updatePart, partKeyReadyOf, questionsOf, addAttempt, normalizeExercise } from "./lib/domain.js";
import { SCHEMA_PALETTE_DEFAULT, effectivePaletteId, applyPaletteToExercise } from "./lib/palette.js";
import { calcScore, calcSchemaPlacementScore, calcQuestionnaireScore, aggregateParts, type Interval, type SchemaBlock } from "./lib/scoring.js";
import { createDb } from "./data/db.js";
import type { TeacherCorrection } from "./components/CorrectionView.js";



// ═══ 5. PRIMITIVOS UI COMPARTIDOS ═══════════════════════════════════════════

import { useInjectFonts } from "./theme/fonts.js";

// ═══ 6. VISTAS DE AUTENTICACIÓN ═════════════════════════════════════════════

import { SetupView, LoginView, HomeView, ForgotPinView, ResetPinView, TeacherPickerView } from "./components/auth.jsx";
import type { AuthUser, Teacher } from "./components/auth.js";
import { RecoveryEmailModal } from "./components/modals.jsx";

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
    <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 2000, display: "flex", justifyContent: "center", padding: "0 16px 16px", pointerEvents: "none" }}>
      <div role="alert" style={{ pointerEvents: "auto", maxWidth: 540, width: "100%", background: C.danger, color: "#fff", borderRadius: 10, padding: "12px 14px", boxShadow: "0 8px 30px rgba(0,0,0,0.28)", display: "flex", alignItems: "center", gap: 12, fontFamily: FONT_SANS, fontSize: 13, lineHeight: 1.4 }}>
        <span style={{ flex: 1 }}>{message}</span>
        <button onClick={onClose} className="fa-pressable" style={{ flexShrink: 0, background: "rgba(255,255,255,0.22)", border: "none", color: "#fff", borderRadius: 6, padding: "6px 11px", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: FONT_SANS }}>Cerrar</button>
      </div>
    </div>,
    document.body,
  );
}

// Payload que entregan las vistas de sesión al entregar un ejercicio (F7,
// T7.2 — antes `any` en submitAnswer). `entries`/`intervals` son el formato
// "en bruto" del interactivo, igual en modo una-parte que dentro de cada
// `parts[partId].byModel[modelo]` del multiparte — de ahí que
// ModelAnswerPayload cubra los cuatro modelos con campos todos opcionales.
interface AnswerEntry { categoryId: string; intervals: Interval[]; }
interface ModelAnswerPayload {
  answers?: Record<string, string>;
  blocks?: SchemaBlock[];
  schemaPalette?: string;
  entries?: AnswerEntry[];
  currentCategoryId?: string;
}
interface SubmitPayload extends ModelAnswerPayload {
  type?: string;
  mode?: string;
  score?: number | null;
  parts?: Record<string, { byModel?: Record<string, ModelAnswerPayload> }>;
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

  // Contador de escrituras en vuelo hacia Supabase.
  const pendingSavesRef = useRef(0);

  // Estado global
  const [exercises,    setExercises]    = useState<Exercise[]>(() =>
    ([...(INIT_EXERCISES as Exercise[]), ...(LOCAL_MODE ? LOCAL_EXERCISES : [])]).map(normalizeExercise));
  const [users,        setUsers]        = useState<UserProfile[]>(LOCAL_MODE ? LOCAL_USERS : []);
  const [results,      setResults]      = useState<Record<string, Record<string, ExerciseResult>>>(LOCAL_MODE ? LOCAL_RESULTS : {});   // { userId: { exerciseId: result } }
  const [categories,   setCategories]   = useState<Category[]>([DEFAULT_CATEGORY as Category]);
  const [courses,      setCourses]      = useState<Course[]>(LOCAL_MODE ? LOCAL_COURSES : []);
  const [units,        setUnits]        = useState<Unit[]>(LOCAL_MODE ? LOCAL_UNITS : []);
  const [groups,       setGroups]       = useState<Group[]>(LOCAL_MODE ? LOCAL_GROUPS : []);
  const [audioLibrary, setAudioLibrary] = useState<AudioItem[]>(INIT_AUDIO_LIBRARY as AudioItem[]);

  const [dbReady, setDbReady] = useState(!!LOCAL_MODE);
  const [user,    setUser]    = useState<UserProfile | null>(
    LOCAL_MODE ? LOCAL_USERS[LOCAL_MODE === "alumno" ? 1 : 0] : null
  );
  // Mensaje de error de guardado (persistencia). null = sin error.
  const [saveError, setSaveError] = useState<string | null>(null);
  // ¿Hay admin? null = desconocido; true/false = confirmado por el servidor (RPC).
  // Con RLS, anon no puede leer fa_users, así que el primer arranque no se puede
  // deducir de la carga; se consulta has_admin().
  const [serverHasAdmin, setServerHasAdmin] = useState<boolean | null>(LOCAL_MODE ? true : null);

  // Navegación — la URL (#/…) es la fuente de verdad
  const { route, navigate } = useHashRoute();
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

  // Carga todas las entidades desde Supabase y actualiza el estado. Se usa al
  // montar (anon — con RLS devuelve poco o nada) y de nuevo TRAS el login (con la
  // sesión, trae lo que el usuario puede ver). Devuelve los usuarios cargados para
  // que el login decida el flujo sin esperar al re-render.
  const loadData = async (sb: SupabaseClient): Promise<{ users: UserProfile[] }> => {
    const [exRes, userRes, catRes, courseRes, unitRes, resultRes, audioRes, groupRes] = await Promise.all([
      sb.from("fa_exercises").select("*"),
      sb.from("fa_users").select("*"),
      sb.from("fa_categories").select("*"),
      sb.from("fa_courses").select("*"),
      sb.from("fa_units").select("*"),
      sb.from("fa_results").select("*"),
      sb.from("fa_audio_library").select("*"),
      sb.from("fa_groups").select("*"),
    ]);
    // Con cliente presente, cada tabla se asigna siempre que la consulta no
    // haya fallado — incluida la lista vacía. Antes un `if (data?.length)`
    // dejaba las semillas (INIT_EXERCISES, etc.) puestas cuando el servidor
    // respondía [], colando datos de ejemplo en un despliegue real vacío.
    // Sin tipos generados de Supabase, `.data` de cada tabla es `any[] | null`
    // — los `.map`/`.filter` de abajo heredan ese `any` sin anotarlo aparte.
    const loadedUsers: UserProfile[] | null = userRes.data?.length ? userRes.data.map((r) => r.data) : null;
    if (!exRes.error)     setExercises((exRes.data ?? []).map((r) => normalizeExercise(r.data)));
    if (loadedUsers)      setUsers(loadedUsers);
    if (!catRes.error) {
      const cats = (catRes.data ?? []).map((r) => r.data);
      if (!cats.find((c) => c.id === "default")) setCategories([DEFAULT_CATEGORY as Category, ...cats]);
      else setCategories(cats);
    }
    if (!courseRes.error) setCourses((courseRes.data ?? []).map((r) => r.data));
    if (!unitRes.error)   setUnits((unitRes.data ?? []).map((r) => r.data));
    if (!audioRes.error)  setAudioLibrary((audioRes.data ?? []).map((r) => r.data));
    if (!groupRes.error)  setGroups((groupRes.data ?? []).map((r) => r.data));
    if (!resultRes.error) {
      const byUser: Record<string, Record<string, ExerciseResult>> = {};
      (resultRes.data ?? []).forEach((row) => {
        if (!byUser[row.user_id]) byUser[row.user_id] = {};
        byUser[row.user_id][row.exercise_id] = row.data;
      });
      setResults(byUser);
    }
    return { users: loadedUsers || users };
  };

  // ─── Carga inicial desde Supabase ────────────────────────────────────────
  useEffect(() => {
    if (LOCAL_MODE) return;   // modo local: sin backend, la semilla ya está puesta
    (async () => {
      try {
        // Detectar sesión desde magic link de recuperación de PIN. OJO: el login
        // normal (Fase 1) también crea una sesión de Supabase Auth con email
        // sintético `${username}@fa.local`; esa NO es de recuperación. Solo lo es
        // una sesión cuyo email es el correo real (magic link de recuperación).
        const { data: { session: existingSession } } = await supabase.auth.getSession();
        const sEmail = existingSession?.user?.email || "";
        if (existingSession && !sEmail.endsWith("@fa.local")) {
          setResetSession(existingSession);
          window.history.replaceState(null, "", "#/");
        }

        await loadData(supabase);

        // ¿Existe ya un admin? (primer arranque) — vía RPC, porque con RLS anon no
        // puede leer fa_users.
        try { const { data: ha } = await supabase.rpc("has_admin"); setServerHasAdmin(ha === true); } catch { /* ignora */ }
      } catch (e) {
        console.error("Error cargando datos de Supabase:", e);
      } finally {
        setDbReady(true);
      }
    })();
  // Solo al montar; loadData se redefine cada render pero aquí queremos una única carga.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Advierte al usuario si recarga mientras hay escrituras en vuelo.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (pendingSavesRef.current > 0) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
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

  // ─── Helpers de upsert ───────────────────────────────────────────────────
  // Todos los helpers comprueban si el cliente existe; si no (modo en memoria),
  // simplemente retornan sin hacer nada: el estado React ya se actualizó.

  // Capa de datos: los helpers viven en data/db.js y reciben un getter perezoso
  // del cliente Supabase (se carga async al montar). Se desestructuran con los
  // mismos nombres para no tocar los puntos de llamada.
  const {
    dbUpsertExercise, dbDeleteExercise,
    dbUpsertUser, dbDeleteUser,
    dbUpsertCategory, dbDeleteCategory,
    dbUpsertCourse, dbDeleteCourse,
    dbUpsertUnit, dbDeleteUnit,
    dbUpsertResult, dbDeleteResultsForUser, dbDeleteResultsForExercise,
    dbUpsertAudio, dbDeleteAudio,
    dbUpsertGroup, dbDeleteGroup,
  } = useMemo(() => createDb({
    // En modo local, cliente nulo: createDb convierte toda escritura en no-op.
    getClient: () => (LOCAL_MODE ? null : supabase),
    pendingSavesRef,
    onError: () => setSaveError("No se pudieron guardar los cambios en el servidor. Puede que se pierdan al recargar — prueba a cerrar sesión y volver a entrar."),
  }), []);

  // El aviso de error de guardado se oculta solo tras unos segundos (o al cerrarlo).
  useEffect(() => {
    if (!saveError) return;
    const t = setTimeout(() => setSaveError(null), 9000);
    return () => clearTimeout(t);
  }, [saveError]);

  // ─── Users ───────────────────────────────────────────────────────────────
  // El perfil llega desde AddUserModal (onSave: (profile: unknown) => void) —
  // el servidor lo devuelve sin tipar; se confía en su forma (mismo patrón que
  // `as AuthProfile` en auth.tsx) tras cruzar esa frontera.
  const addUser = (newUser: unknown) => {
    const profile = newUser as UserProfile;
    setUsers((prev) => [...prev, profile]);
    dbUpsertUser(profile);
  };

  const removeUser = (userId: string) => {
    setUsers((prev) => prev.filter((u) => u.id !== userId));
    setResults((prev) => { const next = { ...prev }; delete next[userId]; return next; });
    setGroups((prev) => prev.map((g) =>
      g.studentIds?.includes(userId) ? { ...g, studentIds: g.studentIds.filter((id) => id !== userId) } : g
    ));
    // Persistir los grupos afectados desde el estado actual (closure), no dentro
    // del updater de setGroups (correría en render → array vacío al guardar).
    groups
      .filter((g) => g.studentIds?.includes(userId))
      .forEach((g) => dbUpsertGroup({ ...g, studentIds: (g.studentIds || []).filter((id) => id !== userId) }));
    dbDeleteUser(userId);
    dbDeleteResultsForUser(userId);
  };

  const updateUser = (updatedUser: unknown) => {
    const profile = updatedUser as UserProfile;
    setUsers((prev) => prev.map((u) => u.id === profile.id ? profile : u));
    if (user?.id === profile.id) setUser(profile);
    dbUpsertUser(profile);
  };

  // ─── Correction save ─────────────────────────────────────────────────────
  const saveCorrection = (studentId: string | undefined, exerciseId: Exercise["id"], correction: TeacherCorrection) => {
    // El objeto a persistir se calcula ANTES de setState (a partir del estado
    // actual en el closure). Antes se asignaba dentro del updater de setResults
    // y se leía justo después; como React ejecuta ese updater en la fase de
    // render (no de forma síncrona), `saved` seguía siendo null al llamar a
    // dbUpsertResult → la corrección del profesor no se guardaba en Supabase.
    const sid = studentId ?? "";
    const eid = String(exerciseId ?? "");
    const existing = (results[sid] || {})[eid] || {};
    // status: "corregido" salvo que la corrección multiparte (F4, T4.4) traiga
    // uno explícito — con partes aún sin corregir, sigue "pendiente" aunque
    // esta parte concreta ya se haya guardado. El resto de llamadas (una sola
    // parte) nunca traen `status`, así que su comportamiento no cambia.
    const updated: ExerciseResult = { ...existing, teacherCorrection: { ...correction, corrected: true }, status: correction?.status || "corregido" };
    // Nota normalizada a escala 0-100 (la que consume ScoreBadge). totalScore
    // puede llegar en 0-10 (correcciones anteriores a T1.2, o inputs aún sin
    // migrar) — el mismo umbral tolerante que usa CorrectionView al mostrarla.
    // CorrectionView siempre envía number|null (nunca "") — TeacherCorrection
    // lo tipa así (F7, T7.2); el `!== ""` que había aquí era una comprobación
    // muerta sobre ese contrato ya garantizado por el tipo.
    if (correction?.totalScore != null) {
      const raw = Number(correction.totalScore);
      if (!Number.isNaN(raw)) updated.score = raw <= 10 ? raw * 10 : raw;
    }
    setResults((prev) => ({ ...prev, [sid]: { ...(prev[sid] || {}), [eid]: updated } }));
    dbUpsertResult(sid, eid, updated);
  };

  // ─── Groups ──────────────────────────────────────────────────────────────
  const addGroup    = (g: Group) => { setGroups((prev) => [...prev, g]); dbUpsertGroup(g); };
  const updateGroup = (g: Group) => { setGroups((prev) => prev.map((x) => x.id === g.id ? g : x)); dbUpsertGroup(g); };
  const deleteGroup = (id: string) => { setGroups((prev) => prev.filter((g) => g.id !== id)); dbDeleteGroup(id); };

  // ─── Setup inicial (primer admin) ────────────────────────────────────────
  const handleSetup = (adminProfile: unknown) => {
    // El admin ya está creado en el servidor (create-user) y con sesión iniciada
    // (login) desde SetupView. Solo reflejamos el estado y entramos.
    setUser(adminProfile as UserProfile);
    setServerHasAdmin(true);
    navigate("/profesor");
    loadData(supabase);
  };

  // ─── Exercises ───────────────────────────────────────────────────────────
  // `onAdd` (teacher.tsx) entrega `Record<string, unknown>` — el mismo cruce de
  // frontera que en Users: se confía en su forma tras el cast.
  const addExercise = (newEx: Record<string, unknown>) => {
    const ex = normalizeExercise(newEx as Exercise);
    setExercises((prev) => [...prev, ex]);
    dbUpsertExercise(ex);
  };

  const updateExercise = (id: Exercise["id"], patch: Record<string, unknown>) => {
    const current = exercises.find((e) => e.id === id);
    setExercises((prev) => prev.map((e) => e.id === id ? normalizeExercise({ ...e, ...patch } as Exercise) : e));
    if (current) dbUpsertExercise(normalizeExercise({ ...current, ...patch } as Exercise));
  };

  // Copia completa, sin publicar (M2): id nuevo, oculta para alumnos y fuera de
  // toda unidad — el profesor decide explícitamente dónde y cuándo mostrarla,
  // en vez de que la copia aparezca ya visible junto al original.
  const duplicateExercise = (ex: Exercise) => {
    const copy = normalizeExercise({ ...ex, id: Date.now(), title: `${ex.title} (copia)`, hidden: true });
    setExercises((prev) => [...prev, copy]);
    dbUpsertExercise(copy);
  };

  const deleteExercise = (id: Exercise["id"]) => {
    const sid = String(id);
    setExercises((prev) => prev.filter((e) => e.id !== id));
    setUnits((prev) => prev.map((u) =>
      (u.exerciseIds || []).some((eid) => String(eid) === sid) ? { ...u, exerciseIds: (u.exerciseIds || []).filter((eid) => String(eid) !== sid) } : u
    ));
    // Persistir las unidades afectadas. Se calculan desde el estado actual
    // (closure `units`), NO dentro del updater de setUnits: React ejecuta ese
    // updater en la fase de render, así que un array capturado dentro seguiría
    // vacío aquí y las unidades no se guardarían (referencias colgantes al
    // ejercicio borrado tras recargar).
    units
      .filter((u) => (u.exerciseIds || []).some((eid) => String(eid) === sid))
      .forEach((u) => dbUpsertUnit({ ...u, exerciseIds: (u.exerciseIds || []).filter((eid) => String(eid) !== sid) }));
    setResults((prev) => {
      const next: Record<string, Record<string, ExerciseResult>> = {};
      for (const uid of Object.keys(prev)) {
        const sub = { ...prev[uid] };
        delete sub[sid];
        next[uid] = sub;
      }
      return next;
    });
    dbDeleteExercise(sid);
    dbDeleteResultsForExercise(sid);
  };

  // ─── Categories ──────────────────────────────────────────────────────────
  const addCategory = (newCat: Category) => {
    setCategories((prev) => [...prev, newCat]);
    dbUpsertCategory(newCat);
  };
  const updateCategory = (updatedCat: Category) => {
    setCategories((prev) => prev.map((c) => c.id === updatedCat.id ? updatedCat : c));
    dbUpsertCategory(updatedCat);
  };
  const deleteCategory = (id: string) => {
    if (id === "default") return;
    setCategories((prev) => prev.filter((c) => c.id !== id));
    dbDeleteCategory(id);
  };
  const toggleGlobalCategory = (id: string) => {
    // Calcular el objeto a persistir desde el estado actual (closure), no dentro
    // del updater: el updater corre en render y `cat` seguiría null al guardar.
    const cat = categories.find((c) => c.id === id);
    if (!cat) return;
    const updated = { ...cat, global: !cat.global };
    setCategories((prev) => prev.map((c) => c.id === id ? updated : c));
    dbUpsertCategory(updated);
  };

  // ─── Courses ─────────────────────────────────────────────────────────────
  const addCourse = (newCourse: Course) => {
    setCourses((prev) => [...prev, newCourse]);
    dbUpsertCourse(newCourse);
  };
  const updateCourse = (updated: Course) => {
    setCourses((prev) => prev.map((c) => c.id === updated.id ? updated : c));
    dbUpsertCourse(updated);
  };
  const deleteCourse = (id: string) => {
    setCourses((prev) => prev.filter((c) => c.id !== id));
    dbDeleteCourse(id);
  };

  // ─── Units ───────────────────────────────────────────────────────────────
  const addUnit = (newUnit: Unit, courseId: string | null) => {
    const existingCourse = courses.find((c) => c.id === courseId);
    setUnits((prev) => [...prev, newUnit]);
    setCourses((prev) => prev.map((c) => c.id === courseId ? { ...c, unitIds: [...(c.unitIds || []), newUnit.id] } : c));
    if (existingCourse) dbUpsertCourse({ ...existingCourse, unitIds: [...(existingCourse.unitIds || []), newUnit.id] });
    dbUpsertUnit(newUnit);
  };

  const updateUnit = (updated: Unit) => {
    setUnits((prev) => prev.map((u) => u.id === updated.id ? updated : u));
    dbUpsertUnit(updated);
  };

  const deleteUnit = (unitId: string, courseId: string) => {
    const existingCourse = courses.find((c) => c.id === courseId);
    setUnits((prev) => prev.filter((u) => u.id !== unitId));
    setCourses((prev) => prev.map((c) => c.id === courseId ? { ...c, unitIds: (c.unitIds || []).filter((id) => id !== unitId) } : c));
    if (existingCourse) dbUpsertCourse({ ...existingCourse, unitIds: (existingCourse.unitIds || []).filter((id) => id !== unitId) });
    dbDeleteUnit(unitId);
  };

  const addExercisesToUnit = (unitId: string, exIds: Array<string | number | undefined>) => {
    const ids = exIds.map((x) => String(x));
    const existingUnit = units.find((u) => u.id === unitId);
    // `cur` se normaliza a texto: así el dedup funciona aunque el dato antiguo
    // tuviera ids numéricos, y de paso los deja consistentes (todo texto).
    setUnits((prev) => prev.map((u) => {
      if (u.id !== unitId) return u;
      const cur = (u.exerciseIds || []).map(String);
      const merged = [...cur, ...ids.filter((id) => !cur.includes(id))];
      return { ...u, exerciseIds: merged };
    }));
    if (existingUnit) {
      const cur = (existingUnit.exerciseIds || []).map(String);
      const merged = [...cur, ...ids.filter((id) => !cur.includes(id))];
      dbUpsertUnit({ ...existingUnit, exerciseIds: merged });
    }
  };

  const removeExerciseFromUnit = (unitId: string, exId: string) => {
    const existingUnit = units.find((u) => u.id === unitId);
    setUnits((prev) => prev.map((u) => u.id === unitId ? { ...u, exerciseIds: (u.exerciseIds || []).filter((id) => String(id) !== String(exId)) } : u));
    if (existingUnit) dbUpsertUnit({ ...existingUnit, exerciseIds: (existingUnit.exerciseIds || []).filter((id) => String(id) !== String(exId)) });
  };

  // ─── Audio library ───────────────────────────────────────────────────────
  const addAudio = (a: AudioItem) => {
    setAudioLibrary((prev) => [...prev, a]);
    dbUpsertAudio(a);
  };
  const updateAudio = (a: AudioItem) => {
    setAudioLibrary((prev) => prev.map((x) => x.id === a.id ? a : x));
    dbUpsertAudio(a);
  };
  const deleteAudio = (id: string) => {
    setAudioLibrary((prev) => prev.filter((x) => x.id !== id));
    dbDeleteAudio(id);
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
  // Recibe `unknown` porque cada vista de sesión (ExerciseView, Questionnaire-
  // View, SchemaExerciseView, MultiPart/MultiModelSessionView) tiene su propio
  // tipo de onSubmit — SubmitPayload es la forma común que asume el cuerpo.
  const submitAnswer = (rawPayload: unknown) => {
    const payload = rawPayload as SubmitPayload;
    if (!exCtx) return;
    const ex      = freshExercise(exCtx.exercise);
    const exId    = String(ex.id);
    // Intentos (F6, T6.3): "Repetir" no debe sobrescribir la entrega anterior
    // — addAttempt la conserva en `attempts` y expone score = mejor de todos.
    // Ninguno de los cuatro sitios donde se guarda más abajo es modo "record"
    // (ese siempre escribe en el ejercicio, no en `results`, y ya ha vuelto
    // antes de llegar aquí en sus propias ramas).
    const existingResult = user ? (results[user.id] || {})[exId] : undefined;
    const activePalette = effectivePaletteId(ex, user?.defaultPalette);
    // Autoría por parte (F4, T4.2): grabar clave (esquema/interactivo) escribe
    // en la parte de la URL cuando el ejercicio es genuinamente multiparte —
    // un ejercicio de una sola parte sigue escribiendo en los campos planos,
    // sin materializar `parts` (la UI se mantiene idéntica a hoy).
    const isMultiPart = Array.isArray(ex.parts) && ex.parts.length > 1;
    const recordParts = partsOf(ex);
    // M4.2: la parte activa se lee de `?parte=` (única convención emitida); el
    // segmento /parte/:pid heredado (route.params.partId) se sigue aceptando.
    const urlPartId = parseHashQuery().parte || route.params.partId;
    const recordPartId = (urlPartId && recordParts.some((p) => p.id === urlPartId))
      ? urlPartId
      : recordParts[0]?.id;

    // Sesión multiparte (F4, T4.3): MultiPartSessionView entrega TODAS las
    // partes en un solo payload — { parts: { [partId]: { points, byModel } } },
    // con el payload "en bruto" de cada modelo (mismo formato que produciría
    // ese modelo en una sesión de una sola parte). Puntuamos aquí reutilizando
    // exactamente los mismos puntuadores puros que las ramas de abajo, una vez
    // por parte y modelo, y agregamos con aggregateParts (T4.1). El sobre
    // compuesto completo (status por parte, corrección con navegador de
    // partes) es T4.4 — aquí se guarda ya con la forma final para que esa fase
    // no tenga que reescribir el payload, solo enriquecer cómo se lee.
    if (payload?.type === "multi") {
      const parts = partsOf(ex);
      const partScores: Array<number | null> = [];
      const partPoints: number[] = [];
      const partsEnvelope: Record<string, { byModel: Record<string, unknown> }> = {};
      let anyPending = false;
      parts.forEach((p) => {
        const partPayload = payload.parts?.[p.id];
        const projected = partToExercise(ex, p);
        const pModels = modelsOf(projected);
        const byModel: Record<string, unknown> = {};
        const modelScores: number[] = [];
        pModels.forEach((m) => {
          const raw: ModelAnswerPayload = partPayload?.byModel?.[m] || {};
          const status = resultStatusOf(null, projected);
          if (status === "pendiente") anyPending = true;
          if (m === "cuestionario") {
            const score = calcQuestionnaireScore(questionsOf(projected), raw.answers);
            byModel[m] = { type: "cuestionario", answers: raw.answers || {}, score, status, schemaPalette: activePalette, timestamp: Date.now(), questionsSnapshot: questionsOf(projected) };
            if (score != null) modelScores.push(score);
          } else if (m === "esquema") {
            const score = calcSchemaPlacementScore(projected.schemaKey as SchemaBlock[], raw.blocks || [], projected.schemaMargin ?? DEFAULT_SCHEMA_MARGIN);
            byModel[m] = { type: "esquema", blocks: raw.blocks || [], placementScore: score, score, status, schemaPalette: raw.schemaPalette ?? activePalette, timestamp: Date.now() };
            if (score != null) modelScores.push(score);
          } else {
            const entries = raw.entries || [];
            const currentCategoryId = raw.currentCategoryId || entries[0]?.categoryId || "default";
            const scoreFor = (categoryId: string, intervals: Interval[]) => {
              const key = answerFor(projected, categoryId) as Interval[];
              return key.length ? calcScore(key, intervals, projected.duration as number, projected.margin ?? DEFAULT_MARGIN) : null;
            };
            const mainEntry = entries.find((e) => e.categoryId === currentCategoryId) || entries[0];
            const mainIvs   = mainEntry?.intervals || [];
            const mainScore = scoreFor(currentCategoryId, mainIvs);
            const extras = entries
              .filter((e) => e.categoryId !== currentCategoryId)
              .map((e) => ({ categoryId: e.categoryId, intervals: e.intervals, score: scoreFor(e.categoryId, e.intervals) }));
            byModel[m] = { categoryId: currentCategoryId, intervals: mainIvs, score: mainScore, extras, status, schemaPalette: activePalette, timestamp: Date.now() };
            if (mainScore != null) modelScores.push(mainScore);
          }
        });
        partsEnvelope[p.id] = { byModel };
        partScores.push(modelScores.length ? aggregateParts(modelScores) : null);
        partPoints.push(p.points ?? 1);
      });
      const data = addAttempt(existingResult, {
        type: "multi",
        score: aggregateParts(partScores, partPoints),
        status: (anyPending ? "pendiente" : "auto") as "pendiente" | "auto",
        timestamp: Date.now(),
        parts: partsEnvelope,
      });
      if (user) {
        setResults((prev) => ({ ...prev, [user.id]: { ...(prev[user.id] || {}), [exId]: data } }));
        dbUpsertResult(user.id, exId, data);
      }
      setLastResult(data);
      navigate(`/alumno/ejercicio/${ex.id}/correccion`);
      return;
    }

    // Cuestionario
    if (payload?.type === "cuestionario") {
      // Instantánea de las preguntas al entregar (F5, T5.5): la corrección y
      // resultStatusOf la leen en vez de las preguntas vigentes del ejercicio,
      // así una edición posterior del profesor no descoloca entregas pasadas.
      const data = { type: "cuestionario" as const, answers: payload.answers, score: payload.score, status: resultStatusOf(null, ex), schemaPalette: activePalette, timestamp: Date.now(), questionsSnapshot: questionsOf(ex) };
      if (payload.mode !== "preview") {
        // La previsualización del profesor NUNCA se mezcla con el historial
        // real (mismo criterio que esquema, más arriba).
        const savedData = addAttempt(existingResult, data);
        if (user) {
          setResults((prev) => ({ ...prev, [user.id]: { ...(prev[user.id] || {}), [exId]: savedData } }));
          dbUpsertResult(user.id, exId, savedData);
        }
        setLastResult(savedData);
      } else {
        setLastResult(data);
      }
      navigate(payload.mode === "preview"
        ? `/profesor/ejercicio/${ex.id}/correccion`
        : `/alumno/ejercicio/${ex.id}/correccion`);
      return;
    }

    // Esquema
    if (payload?.type === "esquema") {
      if (payload.mode === "record") {
        // El profesor guarda el esquema como modelo de referencia (con su paleta)
        if (isMultiPart) {
          updateExercise(ex.id, {
            parts: updatePart(ex, recordPartId, { schemaKey: payload.blocks }).parts,
            schemaPalette: payload.schemaPalette ?? SCHEMA_PALETTE_DEFAULT,
          });
        } else {
          updateExercise(ex.id, { schemaKey: payload.blocks, schemaPalette: payload.schemaPalette ?? SCHEMA_PALETTE_DEFAULT });
        }
        navigate(getLastPanelPath("/profesor"));
        return;
      }
      // Modo preview (profesor prueba) o alumno: ambos van a CorrectionView
      const placementScore = calcSchemaPlacementScore(ex.schemaKey as SchemaBlock[], payload.blocks || [], ex.schemaMargin ?? DEFAULT_SCHEMA_MARGIN);
      const data = { type: "esquema", blocks: payload.blocks, placementScore, score: placementScore, status: resultStatusOf(null, ex), schemaPalette: payload.schemaPalette ?? SCHEMA_PALETTE_DEFAULT, timestamp: Date.now() };
      if (payload.mode !== "preview") {
        // Solo guardar si es un alumno real. Intentos (F6, T6.3): la
        // previsualización del profesor NUNCA se mezcla con el historial real.
        const savedData = addAttempt(existingResult, data);
        if (user) {
          setResults((prev) => ({ ...prev, [user.id]: { ...(prev[user.id] || {}), [exId]: savedData } }));
          dbUpsertResult(user.id, exId, savedData);
        }
        setLastResult(savedData);
      } else {
        setLastResult(data);
      }
      navigate(payload.mode === "preview"
        ? `/profesor/ejercicio/${ex.id}/correccion`
        : `/alumno/ejercicio/${ex.id}/correccion`);
      return;
    }

    // Interactivo: payload = { entries: [{ categoryId, intervals }], currentCategoryId }
    const entries          = payload.entries || [];
    const currentCategoryId = payload.currentCategoryId || entries[0]?.categoryId || "default";

    const scoreFor = (categoryId: string, intervals: Interval[]) => {
      const key = answerFor(ex, categoryId) as Interval[];
      if (!key.length) return null;
      return calcScore(key, intervals, ex.duration as number, ex.margin ?? DEFAULT_MARGIN);
    };

    if (exCtx.mode === "record") {
      // Guardar como clave del profesor
      if (isMultiPart) {
        const activePart = recordParts.find((p) => p.id === recordPartId);
        const patchAnswers: Record<string, Interval[]> = { ...(activePart?.answers || {}) } as Record<string, Interval[]>;
        entries.forEach(({ categoryId, intervals }) => { patchAnswers[categoryId] = intervals; });
        updateExercise(ex.id, { parts: updatePart(ex, recordPartId, { answers: patchAnswers }).parts });
      } else {
        const patchAnswers: Record<string, Interval[]> = { ...(ex.answers || {}) } as Record<string, Interval[]>;
        entries.forEach(({ categoryId, intervals }) => { patchAnswers[categoryId] = intervals; });
        updateExercise(ex.id, { answers: patchAnswers });
      }
      navigate(getLastPanelPath("/profesor"));
      return;
    }

    // Modo alumno: el "principal" es el currentCategoryId
    const mainEntry  = entries.find((e) => e.categoryId === currentCategoryId) || entries[0];
    const mainIvs    = mainEntry?.intervals || [];
    const mainScore  = scoreFor(currentCategoryId, mainIvs);

    const extras = entries
      .filter((e) => e.categoryId !== currentCategoryId)
      .map((e) => ({
        categoryId: e.categoryId,
        intervals:  e.intervals,
        score:      scoreFor(e.categoryId, e.intervals),
      }));

    const data = addAttempt(existingResult, {
      categoryId: currentCategoryId,
      intervals:  mainIvs,
      score:      mainScore,
      extras,
      status:     resultStatusOf(null, ex),
      schemaPalette: activePalette,
      timestamp:  Date.now(),
    });

    if (user) {
      setResults((prev) => ({ ...prev, [user.id]: { ...(prev[user.id] || {}), [exId]: data } }));
      dbUpsertResult(user.id, exId, data);
    }
    setLastResult(data);
    navigate(`/alumno/ejercicio/${ex.id}/correccion`);
  };

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
        onLogout={() => { setUser(null); navigate("/"); }}
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
  const onLogout = () => { setUser(null); navigate("/"); };
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
  );
}
