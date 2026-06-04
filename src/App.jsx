import { useState, useEffect, useRef, useMemo } from "react";

/* ═══════════════════════════════════════════════════════════════════════════
   FUNCIONES ARMÓNICAS · APP ROOT
   ───────────────────────────────────────────────────────────────────────────
   Funciones puras, constantes de dominio, tokens y datos semilla viven ahora en
   módulos bajo src/lib, src/theme y src/seed.js (extraídos en la Fase 0). Este
   archivo conserva los componentes React y el estado global de App().
   ═══════════════════════════════════════════════════════════════════════════ */

import { TEACHER_TAB_PATH, useHashRoute } from "./lib/routing.js";
import { C, S } from "./theme/tokens.js";
import { DEFAULT_CATEGORY, INIT_EXERCISES, INIT_AUDIO_LIBRARY } from "./seed.js";
import { modelsOf, answerFor } from "./lib/domain.js";
import { SCHEMA_PALETTE_DEFAULT, effectivePaletteId, applyPaletteToExercise } from "./lib/palette.js";
import { calcScore, calcSchemaPlacementScore } from "./lib/scoring.js";
import { createDb } from "./data/db.js";



// ═══ 5. PRIMITIVOS UI COMPARTIDOS ═══════════════════════════════════════════

import { useInjectFonts } from "./theme/fonts.js";

// ═══ 6. VISTAS DE AUTENTICACIÓN ═════════════════════════════════════════════

import { SetupView, LoginView, HomeView, ForgotPinView, ResetPinView, TeacherPickerView } from "./components/auth.jsx";

import { ExerciseView } from "./components/ExerciseView.jsx";
import { SchemaExerciseView } from "./components/SchemaExerciseView.jsx";
import { CorrectionView } from "./components/CorrectionView.jsx";
import { QuestionnaireView } from "./components/QuestionnaireView.jsx";
import { TeacherDash } from "./components/teacher.jsx";
import { QuestionManagerView } from "./components/QuestionManagerView.jsx";
import { StudentDash } from "./components/StudentDash.jsx";
import { MultiModelSessionView } from "./components/MultiModelSessionView.jsx";

// ═══ 15. APP ROOT ═══════════════════════════════════════════════════════════
export default function App() {
  useInjectFonts();

  // Ref al cliente Supabase — se carga dinámicamente; null en el visor de artefactos
  const supabaseRef = useRef(null);
  // Contador de escrituras en vuelo hacia Supabase.
  const pendingSavesRef = useRef(0);

  // Estado global
  const [exercises,    setExercises]    = useState(INIT_EXERCISES);
  const [users,        setUsers]        = useState([]);
  const [results,      setResults]      = useState({});   // { userId: { exerciseId: result } }
  const [margin,       setMargin]       = useState(1);
  const [categories,   setCategories]   = useState([DEFAULT_CATEGORY]);
  const [courses,      setCourses]      = useState([]);
  const [units,        setUnits]        = useState([]);
  const [groups,       setGroups]       = useState([]);
  const [audioLibrary, setAudioLibrary] = useState(INIT_AUDIO_LIBRARY);

  const [dbReady, setDbReady] = useState(false);
  const [user,    setUser]    = useState(null);
  // ¿Hay admin? null = desconocido; true/false = confirmado por el servidor (RPC).
  // Con RLS, anon no puede leer fa_users, así que el primer arranque no se puede
  // deducir de la carga; se consulta has_admin().
  const [serverHasAdmin, setServerHasAdmin] = useState(null);

  // Navegación — la URL (#/…) es la fuente de verdad
  const { route, navigate } = useHashRoute();
  const [lastResult,   setLastResult]     = useState(null);
  const [guestResults, setGuestResults]   = useState({});
  const [pickingTeacher, setPickingTeacher] = useState(false);
  const redirectAfterLogin = useRef(null);   // enlace profundo a recuperar tras login

  const [pendingLoginUser, setPendingLoginUser] = useState(null); // alumno esperando configurar correo de recuperación
  const [showForgotPin,    setShowForgotPin]    = useState(false);
  const [resetSession,     setResetSession]     = useState(null);  // sesión Supabase Auth desde magic link

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
  const loadData = async (sb) => {
    if (!sb) return { users };
    const [exRes, userRes, catRes, courseRes, unitRes, resultRes, settingsRes, audioRes, groupRes] = await Promise.all([
      sb.from("fa_exercises").select("*"),
      sb.from("fa_users").select("*"),
      sb.from("fa_categories").select("*"),
      sb.from("fa_courses").select("*"),
      sb.from("fa_units").select("*"),
      sb.from("fa_results").select("*"),
      sb.from("fa_settings").select("*"),
      sb.from("fa_audio_library").select("*"),
      sb.from("fa_groups").select("*"),
    ]);
    const loadedUsers = userRes.data?.length ? userRes.data.map((r) => r.data) : null;
    if (exRes.data?.length)     setExercises(exRes.data.map((r) => r.data));
    if (loadedUsers)            setUsers(loadedUsers);
    if (catRes.data?.length) {
      const cats = catRes.data.map((r) => r.data);
      if (!cats.find((c) => c.id === "default")) setCategories([DEFAULT_CATEGORY, ...cats]);
      else setCategories(cats);
    }
    if (courseRes.data?.length) setCourses(courseRes.data.map((r) => r.data));
    if (unitRes.data?.length)   setUnits(unitRes.data.map((r) => r.data));
    if (audioRes.data?.length)  setAudioLibrary(audioRes.data.map((r) => r.data));
    if (groupRes.data?.length)  setGroups(groupRes.data.map((r) => r.data));
    if (resultRes.data?.length) {
      const byUser = {};
      resultRes.data.forEach((row) => {
        if (!byUser[row.user_id]) byUser[row.user_id] = {};
        byUser[row.user_id][row.exercise_id] = row.data;
      });
      setResults(byUser);
    }
    if (settingsRes.data?.length) {
      const m = settingsRes.data.find((s) => s.key === "margin");
      if (m?.value != null) setMargin(Number(m.value));
    }
    return { users: loadedUsers || users };
  };

  // ─── Carga inicial desde Supabase (import dinámico) ─────────────────────
  // En la web, el import resuelve y carga datos reales.
  // En el visor de artefactos de Claude, el import falla silenciosamente y
  // la app arranca en modo "en memoria" con los datos semilla (INIT_EXERCISES).
  useEffect(() => {
    (async () => {
      try {
        // Intentar cargar el cliente de Supabase dinámicamente
        try {
          const mod = await import("./supabase.js");
          supabaseRef.current = mod.supabase;
          // Detectar sesión desde magic link de recuperación de PIN. OJO: el login
          // normal (Fase 1) también crea una sesión de Supabase Auth con email
          // sintético `${username}@fa.local`; esa NO es de recuperación. Solo lo es
          // una sesión cuyo email es el correo real (magic link de recuperación).
          const { data: { session: existingSession } } = await mod.supabase.auth.getSession();
          const sEmail = existingSession?.user?.email || "";
          if (existingSession && !sEmail.endsWith("@fa.local")) {
            setResetSession(existingSession);
            window.history.replaceState(null, "", "#/");
          }
        } catch {
          // Entorno de previsualización: sin backend — modo en memoria.
          // El `finally` de abajo marca dbReady; basta con salir aquí.
          return;
        }

        const sb = supabaseRef.current;
        await loadData(sb);

        // ¿Existe ya un admin? (primer arranque) — vía RPC, porque con RLS anon no
        // puede leer fa_users.
        try { const { data: ha } = await sb.rpc("has_admin"); setServerHasAdmin(ha === true); } catch { /* ignora */ }
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
    const handler = (e) => {
      if (pendingSavesRef.current > 0) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

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
    dbUpsertSetting,
    dbUpsertAudio, dbDeleteAudio,
    dbUpsertGroup, dbDeleteGroup,
  } = useMemo(() => createDb({ getClient: () => supabaseRef.current, pendingSavesRef }), []);

  // ─── Users ───────────────────────────────────────────────────────────────
  const addUser = (newUser) => {
    setUsers((prev) => [...prev, newUser]);
    dbUpsertUser(newUser);
  };

  const removeUser = (userId) => {
    setUsers((prev) => prev.filter((u) => u.id !== userId));
    setResults((prev) => { const next = { ...prev }; delete next[userId]; return next; });
    setGroups((prev) => prev.map((g) =>
      g.studentIds?.includes(userId) ? { ...g, studentIds: g.studentIds.filter((id) => id !== userId) } : g
    ));
    // Persistir los grupos afectados desde el estado actual (closure), no dentro
    // del updater de setGroups (correría en render → array vacío al guardar).
    groups
      .filter((g) => g.studentIds?.includes(userId))
      .forEach((g) => dbUpsertGroup({ ...g, studentIds: g.studentIds.filter((id) => id !== userId) }));
    dbDeleteUser(userId);
    dbDeleteResultsForUser(userId);
  };

  const updateUser = (updatedUser) => {
    setUsers((prev) => prev.map((u) => u.id === updatedUser.id ? updatedUser : u));
    if (user?.id === updatedUser.id) setUser(updatedUser);
    dbUpsertUser(updatedUser);
  };

  // ─── Correction save ─────────────────────────────────────────────────────
  const saveCorrection = (studentId, exerciseId, correction) => {
    // El objeto a persistir se calcula ANTES de setState (a partir del estado
    // actual en el closure). Antes se asignaba dentro del updater de setResults
    // y se leía justo después; como React ejecuta ese updater en la fase de
    // render (no de forma síncrona), `saved` seguía siendo null al llamar a
    // dbUpsertResult → la corrección del profesor no se guardaba en Supabase.
    const existing = (results[studentId] || {})[exerciseId] || {};
    const updated  = { ...existing, teacherCorrection: { ...correction, corrected: true } };
    setResults((prev) => ({ ...prev, [studentId]: { ...(prev[studentId] || {}), [exerciseId]: updated } }));
    dbUpsertResult(studentId, exerciseId, updated);
  };

  // ─── Groups ──────────────────────────────────────────────────────────────
  const addGroup    = (g) => { setGroups((prev) => [...prev, g]); dbUpsertGroup(g); };
  const updateGroup = (g) => { setGroups((prev) => prev.map((x) => x.id === g.id ? g : x)); dbUpsertGroup(g); };
  const deleteGroup = (id) => { setGroups((prev) => prev.filter((g) => g.id !== id)); dbDeleteGroup(id); };

  // ─── Setup inicial (primer admin) ────────────────────────────────────────
  const handleSetup = (adminProfile) => {
    // El admin ya está creado en el servidor (create-user) y con sesión iniciada
    // (login) desde SetupView. Solo reflejamos el estado y entramos.
    setUser(adminProfile);
    setServerHasAdmin(true);
    navigate("/profesor");
    if (supabaseRef.current) loadData(supabaseRef.current);
  };

  // ─── Exercises ───────────────────────────────────────────────────────────
  const addExercise = (newEx) => {
    setExercises((prev) => [...prev, newEx]);
    dbUpsertExercise(newEx);
  };

  const updateExercise = (id, patch) => {
    const current = exercises.find((e) => e.id === id);
    setExercises((prev) => prev.map((e) => e.id === id ? { ...e, ...patch } : e));
    if (current) dbUpsertExercise({ ...current, ...patch });
  };

  const deleteExercise = (id) => {
    setExercises((prev) => prev.filter((e) => e.id !== id));
    setUnits((prev) => prev.map((u) =>
      u.exerciseIds.includes(id) ? { ...u, exerciseIds: u.exerciseIds.filter((eid) => eid !== id) } : u
    ));
    // Persistir las unidades afectadas. Se calculan desde el estado actual
    // (closure `units`), NO dentro del updater de setUnits: React ejecuta ese
    // updater en la fase de render, así que un array capturado dentro seguiría
    // vacío aquí y las unidades no se guardarían (referencias colgantes al
    // ejercicio borrado tras recargar).
    units
      .filter((u) => u.exerciseIds.includes(id))
      .forEach((u) => dbUpsertUnit({ ...u, exerciseIds: u.exerciseIds.filter((eid) => eid !== id) }));
    setResults((prev) => {
      const next = {};
      for (const uid of Object.keys(prev)) {
        const sub = { ...prev[uid] };
        delete sub[id];
        next[uid] = sub;
      }
      return next;
    });
    dbDeleteExercise(id);
    dbDeleteResultsForExercise(id);
  };

  // ─── Categories ──────────────────────────────────────────────────────────
  const addCategory = (newCat) => {
    setCategories((prev) => [...prev, newCat]);
    dbUpsertCategory(newCat);
  };
  const updateCategory = (updatedCat) => {
    setCategories((prev) => prev.map((c) => c.id === updatedCat.id ? updatedCat : c));
    dbUpsertCategory(updatedCat);
  };
  const deleteCategory = (id) => {
    if (id === "default") return;
    setCategories((prev) => prev.filter((c) => c.id !== id));
    dbDeleteCategory(id);
  };
  const toggleGlobalCategory = (id) => {
    // Calcular el objeto a persistir desde el estado actual (closure), no dentro
    // del updater: el updater corre en render y `cat` seguiría null al guardar.
    const cat = categories.find((c) => c.id === id);
    if (!cat) return;
    const updated = { ...cat, global: !cat.global };
    setCategories((prev) => prev.map((c) => c.id === id ? updated : c));
    dbUpsertCategory(updated);
  };

  // ─── Courses ─────────────────────────────────────────────────────────────
  const addCourse = (newCourse) => {
    setCourses((prev) => [...prev, newCourse]);
    dbUpsertCourse(newCourse);
  };
  const updateCourse = (updated) => {
    setCourses((prev) => prev.map((c) => c.id === updated.id ? updated : c));
    dbUpsertCourse(updated);
  };
  const deleteCourse = (id) => {
    setCourses((prev) => prev.filter((c) => c.id !== id));
    dbDeleteCourse(id);
  };

  // ─── Units ───────────────────────────────────────────────────────────────
  const addUnit = (newUnit, courseId) => {
    const existingCourse = courses.find((c) => c.id === courseId);
    setUnits((prev) => [...prev, newUnit]);
    setCourses((prev) => prev.map((c) => c.id === courseId ? { ...c, unitIds: [...c.unitIds, newUnit.id] } : c));
    if (existingCourse) dbUpsertCourse({ ...existingCourse, unitIds: [...existingCourse.unitIds, newUnit.id] });
    dbUpsertUnit(newUnit);
  };

  const updateUnit = (updated) => {
    setUnits((prev) => prev.map((u) => u.id === updated.id ? updated : u));
    dbUpsertUnit(updated);
  };

  const deleteUnit = (unitId, courseId) => {
    const existingCourse = courses.find((c) => c.id === courseId);
    setUnits((prev) => prev.filter((u) => u.id !== unitId));
    setCourses((prev) => prev.map((c) => c.id === courseId ? { ...c, unitIds: c.unitIds.filter((id) => id !== unitId) } : c));
    if (existingCourse) dbUpsertCourse({ ...existingCourse, unitIds: existingCourse.unitIds.filter((id) => id !== unitId) });
    dbDeleteUnit(unitId);
  };

  const addExercisesToUnit = (unitId, exIds) => {
    const existingUnit = units.find((u) => u.id === unitId);
    setUnits((prev) => prev.map((u) => {
      if (u.id !== unitId) return u;
      const merged = [...u.exerciseIds, ...exIds.filter((id) => !u.exerciseIds.includes(id))];
      return { ...u, exerciseIds: merged };
    }));
    if (existingUnit) {
      const merged = [...existingUnit.exerciseIds, ...exIds.filter((id) => !existingUnit.exerciseIds.includes(id))];
      dbUpsertUnit({ ...existingUnit, exerciseIds: merged });
    }
  };

  const removeExerciseFromUnit = (unitId, exId) => {
    const existingUnit = units.find((u) => u.id === unitId);
    setUnits((prev) => prev.map((u) => u.id === unitId ? { ...u, exerciseIds: u.exerciseIds.filter((id) => id !== exId) } : u));
    if (existingUnit) dbUpsertUnit({ ...existingUnit, exerciseIds: existingUnit.exerciseIds.filter((id) => id !== exId) });
  };

  // ─── Audio library ───────────────────────────────────────────────────────
  const addAudio = (a) => {
    setAudioLibrary((prev) => [...prev, a]);
    dbUpsertAudio(a);
  };
  const updateAudio = (a) => {
    setAudioLibrary((prev) => prev.map((x) => x.id === a.id ? a : x));
    dbUpsertAudio(a);
  };
  const deleteAudio = (id) => {
    setAudioLibrary((prev) => prev.filter((x) => x.id !== id));
    dbDeleteAudio(id);
  };

  // ─── Margin (settings) ───────────────────────────────────────────────────
  const updateMargin = (m) => { setMargin(m); dbUpsertSetting("margin", m); };

  // ─── Navegación helpers ──────────────────────────────────────────────────
  const freshExercise = (ex) => exercises.find((e) => e.id === ex.id) || ex;

  // Si entras sin sesión a una ruta protegida, recuérdala para volver tras login
  useEffect(() => {
    if (user) return;
    const open = route.name === "home" || route.name === "login" || route.name === "setup";
    if (!open) {
      redirectAfterLogin.current = window.location.hash.replace(/^#/, "") || null;
    }
  }, [user, route]);

  const openCorrection = (ex) => {
    // Calcular el resultado almacenado de forma local: no depende del `const
    // userResults` declarado más abajo en el cuerpo del componente, lo que
    // evita una referencia frágil en la zona muerta temporal (TDZ).
    const stored = user?.isGuest
      ? guestResults[ex.id]
      : (results[user?.id] || {})[ex.id];
    if (!stored) return;
    setLastResult(stored);
    navigate(`/alumno/ejercicio/${ex.id}/correccion`);
  };

  const openEx = (ex, mode = "student") => {
    if (mode === "record") {
      // El cuestionario puro se "graba" desde el gestor de preguntas.
      // Los híbridos tienen su propio botón onManageQuestions; aquí se graba la clave interactiva.
      if (modelsOf(ex).join(",") === "cuestionario") navigate(`/profesor/ejercicio/${ex.id}/preguntas`);
      else navigate(`/profesor/ejercicio/${ex.id}/grabar`);
    } else {
      navigate(`/alumno/ejercicio/${ex.id}`);
    }
  };


  // Finalizar el login una vez que el alumno ya tiene (o ha saltado) el correo de recuperación
  const completeLogin = async (u) => {
    setUser(u);
    // Con RLS, la carga anónima del montaje vino vacía: recargar ahora con la
    // sesión. loadData devuelve los usuarios para decidir el flujo del alumno.
    let loaded = { users };
    if (supabaseRef.current && !u.isGuest) {
      try { loaded = await loadData(supabaseRef.current); } catch { /* mantiene el estado actual */ }
    }
    const dest = redirectAfterLogin.current;
    redirectAfterLogin.current = null;
    if (u.role === "student") {
      const hasTeacher = (loaded.users || []).some((x) => x.role === "teacher" && x.id === u.teacherId);
      if (!u.teacherId || !hasTeacher) { setPickingTeacher(true); return; }
      navigate(dest && dest.startsWith("/alumno") ? dest : "/alumno");
    } else {
      navigate(dest && dest.startsWith("/profesor") ? dest : "/profesor");
    }
  };

  // ─── Submit de respuestas (alumno entrega ejercicio) ────────────────────
  const submitAnswer = (payload) => {
    if (!exCtx) return;
    const ex      = freshExercise(exCtx.exercise);
    const isGuest = user?.isGuest;
    const activePalette = effectivePaletteId(ex, user?.defaultPalette);

    // Cuestionario
    if (payload?.type === "cuestionario") {
      const data = { type: "cuestionario", answers: payload.answers, score: payload.score, schemaPalette: activePalette, timestamp: Date.now() };
      if (isGuest) {
        setGuestResults((prev) => ({ ...prev, [ex.id]: data }));
      } else if (user) {
        setResults((prev) => ({ ...prev, [user.id]: { ...(prev[user.id] || {}), [ex.id]: data } }));
        dbUpsertResult(user.id, ex.id, data);
      }
      setLastResult(data);
      navigate(`/alumno/ejercicio/${ex.id}/correccion`);
      return;
    }

    // Esquema
    if (payload?.type === "esquema") {
      if (payload.mode === "record") {
        // El profesor guarda el esquema como modelo de referencia (con su paleta)
        updateExercise(ex.id, { schemaKey: payload.blocks, schemaPalette: payload.schemaPalette ?? SCHEMA_PALETTE_DEFAULT });
        navigate("/profesor");
        return;
      }
      // Modo preview (profesor prueba) o alumno: ambos van a CorrectionView
      const placementScore = calcSchemaPlacementScore(ex.schemaKey, payload.blocks);
      const data = { type: "esquema", blocks: payload.blocks, placementScore, schemaPalette: payload.schemaPalette ?? SCHEMA_PALETTE_DEFAULT, timestamp: Date.now() };
      if (payload.mode !== "preview") {
        // Solo guardar si es un alumno real
        if (isGuest) {
          setGuestResults((prev) => ({ ...prev, [ex.id]: data }));
        } else if (user) {
          setResults((prev) => ({ ...prev, [user.id]: { ...(prev[user.id] || {}), [ex.id]: data } }));
          dbUpsertResult(user.id, ex.id, data);
        }
      }
      setLastResult(data);
      navigate(payload.mode === "preview"
        ? `/profesor/ejercicio/${ex.id}/correccion`
        : `/alumno/ejercicio/${ex.id}/correccion`);
      return;
    }

    // Interactivo: payload = { entries: [{ categoryId, intervals }], currentCategoryId }
    const entries          = payload.entries || [];
    const currentCategoryId = payload.currentCategoryId || entries[0]?.categoryId || "default";

    const scoreFor = (categoryId, intervals) => {
      const key = answerFor(ex, categoryId);
      if (!key.length) return null;
      return calcScore(key, intervals, ex.duration, margin);
    };

    if (exCtx.mode === "record") {
      // Guardar como clave del profesor
      const patchAnswers = { ...(ex.answers || {}) };
      entries.forEach(({ categoryId, intervals }) => { patchAnswers[categoryId] = intervals; });
      updateExercise(ex.id, { answers: patchAnswers });
      navigate("/profesor");
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

    const data = {
      categoryId: currentCategoryId,
      intervals:  mainIvs,
      score:      mainScore,
      extras,
      schemaPalette: activePalette,
      timestamp:  Date.now(),
    };

    if (isGuest) {
      setGuestResults((prev) => ({ ...prev, [ex.id]: data }));
    } else if (user) {
      setResults((prev) => ({ ...prev, [user.id]: { ...(prev[user.id] || {}), [ex.id]: data } }));
      dbUpsertResult(user.id, ex.id, data);
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
  // Primer arranque (mostrar Setup) SOLO si el servidor confirma que no hay admin.
  // Con backend nos fiamos del RPC has_admin (anon no puede leer fa_users por RLS);
  // en modo en memoria (sin backend) usamos el estado local con los datos semilla.
  const noAdmin = supabaseRef.current
    ? serverHasAdmin === false
    : !(users || []).some((u) => u.role === "admin");
  if (noAdmin) return <SetupView onSetup={handleSetup} />;

  // Selección de profesor para alumno (al primer login o desde "Cambiar profesor")
  if ((pickingTeacher || route.name === "pick-teacher") && user?.role === "student") {
    const teacherList = (users || []).filter((u) => u.role === "teacher");
    return (
      <TeacherPickerView
        teachers={teacherList}
        currentTeacherId={user.teacherId}
        onPick={(t) => { const upd = { ...user, teacherId: t.id }; updateUser(upd); setPickingTeacher(false); navigate("/alumno"); }}
        onLogout={() => { setUser(null); setPickingTeacher(false); navigate("/"); }}
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
            const sb = supabaseRef.current;
            if (sb) await sb.auth.signOut();
            setResetSession(null);
            navigate("/");
          }}
          onBack={async () => {
            const sb = supabaseRef.current;
            if (sb) await sb.auth.signOut();
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
          supabaseRef={supabaseRef}
          onBack={() => setShowForgotPin(false)}
        />
      );
    }

    const finishLogin = (u) => {
      // El correo de recuperación ahora vive en fa_user_secrets (servidor), no en
      // el perfil público; el antiguo prompt de configuración se reintroducirá con
      // una función de servidor (Fase 1, pendiente). Por ahora, login directo.
      completeLogin(u);
    };

    if (loginRole) {
      const labels = { admin: "administrador", teacher: "profesor", student: "alumno" };
      return (
        <LoginView
          roleLabel={labels[loginRole]}
          filterRole={loginRole}
          users={users}
          onLogin={finishLogin}
          onBack={() => navigate("/")}
          onForgotPin={loginRole === "student" ? () => setShowForgotPin(true) : null}
          onGuest={loginRole === "student" ? () => {
            const guest = { id: `guest-${Date.now()}`, displayName: "Invitado", role: "student", isGuest: true };
            setUser(guest); navigate("/alumno");
          } : null}
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
  const onLogout = () => { setUser(null); setGuestResults({}); navigate("/"); };
  const userResults = user.isGuest ? guestResults : (results[user.id] || {});
  const isStudent = user.role === "student";

  // Mensaje cuando el ejercicio referenciado por la URL no existe (o no cargó)
  const NotFound = ({ to }) => (
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
    const exModels = modelsOf(exCtx.exercise);
    const onBack = () => navigate(exCtx.mode === "record" || exCtx.mode === "preview" ? "/profesor" : "/alumno");
    // Paleta efectiva = la del ejercicio, o la preferida por el usuario, o P1.
    const sessionPalette = effectivePaletteId(exCtx.exercise, user?.defaultPalette);
    const sessionExercise = applyPaletteToExercise(exCtx.exercise, sessionPalette);
    // Ejercicio con dos modelos: wrapper de alternancia (alumno y preview del profesor)
    if (exModels.length > 1 && (exCtx.mode === "student" || exCtx.mode === "preview")) {
      return <MultiModelSessionView exercise={sessionExercise} mode={exCtx.mode} onSubmit={submitAnswer} onBack={onBack} />;
    }
    // Ejercicio de un solo modelo (o modo record/preview con el modelo primario)
    const m = exModels[0];
    if (m === "esquema") {
      return <SchemaExerciseView exercise={sessionExercise} mode={exCtx.mode} onSubmit={submitAnswer} onBack={onBack} />;
    }
    if (exCtx.mode === "student" && m === "cuestionario") {
      return <QuestionnaireView exercise={sessionExercise} onSubmit={submitAnswer} onBack={onBack} />;
    }
    return <ExerciseView exercise={sessionExercise} mode={exCtx.mode} onSubmit={submitAnswer} onBack={onBack} />;
  }

  // ── Gestor de preguntas (cuestionario) ──
  if (route.name === "question-manager") {
    if (isStudent) { navigate("/alumno"); return null; }
    if (!qmCtx) return <NotFound to="/profesor" />;
    return (
      <QuestionManagerView
        exercise={qmCtx.exercise}
        onSave={(questions) => { updateExercise(qmCtx.exercise.id, { questions }); navigate("/profesor"); }}
        onBack={() => navigate("/profesor")}
      />
    );
  }

  // ── Corrección (depende del resultado recién entregado) ──
  if (route.name === "correction") {
    const back = route.params.from === "teacher" ? "/profesor" : "/alumno";
    if (!exCtx) return <NotFound to={back} />;
    if (!lastResult) {
      // La corrección no se puede reconstruir desde un enlace pegado/recargado
      return <NotFound to={exCtx ? `/alumno/ejercicio/${exCtx.exercise.id}` : back} />;
    }
    const wasPreview = route.params.from === "teacher";
    const corrPalette = effectivePaletteId({ schemaPalette: lastResult?.schemaPalette }, user?.defaultPalette);
    return (
      <CorrectionView
        exercise={applyPaletteToExercise(freshExercise(exCtx.exercise), corrPalette)}
        result={lastResult} margin={margin}
        onBack={() => { setLastResult(null); navigate(wasPreview ? "/profesor" : "/alumno"); }}
      />
    );
  }

  // ── Panel del alumno ──
  if (isStudent) {
    const visibleExercises = exercises; // (heurística actual: banco completo)
    return (
      <StudentDash
        user={user}
        exercises={visibleExercises}
        results={userResults}
        courses={courses}
        units={units}
        groups={groups}
        tab={route.name === "student" ? route.params.tab : "all"}
        onTab={(t) => navigate(t === "courses" ? "/alumno/cursos" : "/alumno")}
        onExercise={(ex) => openEx(ex, "student")}
        onViewCorrection={openCorrection}
        onLogout={onLogout}
        onChangeTeacher={user.isGuest ? null : () => navigate("/alumno/elegir-profesor")}
        onUpdatePalette={(id) => updateUser({ ...user, defaultPalette: id })}
      />
    );
  }

  // ── Panel del profesor / admin ──
  return (
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
      margin={margin} onMargin={updateMargin}
      tab={route.name === "teacher" ? route.params.tab : "exercises"}
      onTab={(t) => navigate(TEACHER_TAB_PATH[t] || "/profesor")}
      detailExId={route.name === "teacher-detail" ? (route.params.exId === "nuevo" ? "new" : route.params.exId) : null}
      onSelectExercise={(id) => {
        if (id == null) navigate(route.name === "teacher" ? (TEACHER_TAB_PATH[route.params.tab] || "/profesor") : "/profesor");
        else if (id === "new") navigate("/profesor/ejercicio/nuevo");
        else navigate(`/profesor/ejercicio/${id}`);
      }}
      onRecord={(ex) => openEx(freshExercise(ex), "record")}
      onManageQuestions={(ex) => navigate(`/profesor/ejercicio/${ex.id}/preguntas`)}
      onPreview={(ex) => navigate(`/profesor/ejercicio/${ex.id}/previsualizar`)}
      onAdd={addExercise}
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
  );
}
