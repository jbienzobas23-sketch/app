// ═══ USEAPPDATA (A2.3) ════════════════════════════════════════════════════════
// Capa de datos de App: estado de las entidades (ejercicios, usuarios, cursos,
// unidades, categorías, grupos, audioteca, resultados), su carga desde Supabase
// y los helpers de alta/edición/borrado (cada uno = setState + dbUpsert/dbDelete,
// mismo patrón que ya usaban dentro de App). Extraído VERBATIM (sin cambio de
// comportamiento) para que App.tsx quede como cableado de rutas/sesión.
//
// `currentUser`/`onCurrentUserSync` son la única frontera con el estado de sesión
// (dueño de App): updateUser necesita saber si el perfil editado es el usuario
// logueado para refrescar esa sesión, sin que este hook posea `user`.
import { useEffect, useMemo, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "../supabase.js";
import { readSessionUser, clearSessionUser } from "../auth/authClient.js";
import type { Exercise, Category, Course, Unit, Group, ExerciseResult, UserProfile } from "../lib/types.js";
import type { AudioItem } from "../components/modals.js";
import type { TeacherCorrection } from "../components/CorrectionView.js";
import { DEFAULT_CATEGORY, INIT_EXERCISES, INIT_AUDIO_LIBRARY } from "../seed.js";
import { normalizeExercise } from "../lib/domain.js";
import { createDb } from "../data/db.js";

interface UseAppDataArgs {
  localMode: "profe" | "alumno" | null;
  currentUser: UserProfile | null;
  onCurrentUserSync: (profile: UserProfile) => void;
}

export function useAppData({ localMode, currentUser, onCurrentUserSync }: UseAppDataArgs) {
  const pendingSavesRef = useRef(0);

  const [exercises,    setExercises]    = useState<Exercise[]>(() => (INIT_EXERCISES as Exercise[]).map(normalizeExercise));
  const [users,        setUsers]        = useState<UserProfile[]>([]);
  const [results,      setResults]      = useState<Record<string, Record<string, ExerciseResult>>>({});   // { userId: { exerciseId: result } }
  const [categories,   setCategories]   = useState<Category[]>([DEFAULT_CATEGORY as Category]);
  const [courses,      setCourses]      = useState<Course[]>([]);
  const [units,        setUnits]        = useState<Unit[]>([]);
  const [groups,       setGroups]       = useState<Group[]>([]);
  const [audioLibrary, setAudioLibrary] = useState<AudioItem[]>(INIT_AUDIO_LIBRARY as AudioItem[]);

  // A7-07: import() DINÁMICO — ni el ternario de `localMode` ni un gate directo
  // con el literal `import.meta.env.DEV` bastan para que el bundler pode
  // `localSeed.ts` del build de producción (verificado empíricamente: el array
  // seguía en el bundle aunque la rama fuera inalcanzable en runtime, porque
  // Rollup mantiene cualquier referencia alcanzable sin evaluar la condición).
  // Con `import()` la semilla vive en su propio chunk, cargado solo si
  // `localMode` está activo (solo posible en dev).
  useEffect(() => {
    if (!localMode) return;
    let cancelled = false;
    import("../localSeed.js").then((seed) => {
      if (cancelled) return;
      setUsers(seed.LOCAL_USERS);
      setResults(seed.LOCAL_RESULTS);
      setCourses(seed.LOCAL_COURSES);
      setUnits(seed.LOCAL_UNITS);
      setExercises((prev) => [...prev, ...(seed.LOCAL_EXERCISES as Exercise[])].map(normalizeExercise));
      setGroups(seed.LOCAL_GROUPS);
    });
    return () => { cancelled = true; };
  // Solo al montar: localMode es constante durante la vida de la sesión.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [dbReady, setDbReady] = useState(!!localMode);
  // Mensaje de error de guardado (persistencia). null = sin error.
  const [saveError, setSaveError] = useState<string | null>(null);
  // A3-04: error de CARGA (distinto de saveError). No se autooculta — las
  // semillas (INIT_EXERCISES, etc.) no deben leerse como datos reales mientras
  // el servidor no haya respondido con éxito.
  const [loadError, setLoadError] = useState<string | null>(null);
  // ¿Hay admin? null = desconocido; true/false = confirmado por el servidor (RPC).
  const [serverHasAdmin, setServerHasAdmin] = useState<boolean | null>(localMode ? true : null);

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
    getClient: () => (localMode ? null : supabase),
    pendingSavesRef,
    onError: () => setSaveError("No se pudieron guardar los cambios en el servidor. Puede que se pierdan al recargar — prueba a cerrar sesión y volver a entrar."),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), []);

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
    // A3-04: cualquier tabla fallida deja el banner visible — las semillas que
    // hayan quedado puestas (o los datos a medias) no deben leerse como reales.
    const anyError = [exRes, userRes, catRes, courseRes, unitRes, resultRes, audioRes, groupRes].some((r) => r.error);
    setLoadError(anyError ? "No se pudieron cargar los datos del servidor. Lo que ves puede estar incompleto." : null);
    return { users: loadedUsers || users };
  };

  const retryLoad = () => { loadData(supabase); checkHasAdmin(supabase); };

  // A3-06: has_admin distingue true | false | null (no confirmado) — un fallo
  // de red NUNCA debe enseñar SetupView por defecto (eso pisaría un despliegue
  // real ya configurado). Reintenta con backoff corto; si sigue fallando, se
  // integra con el banner de carga (C3.1) para que "Reintentar" también
  // reintente esto, en vez de quedar indefinidamente sin confirmar y en silencio.
  const checkHasAdmin = async (sb: SupabaseClient, attempt = 0): Promise<void> => {
    try {
      const { data: ha, error } = await sb.rpc("has_admin");
      if (error) throw error;
      setServerHasAdmin(ha === true);
    } catch {
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
        return checkHasAdmin(sb, attempt + 1);
      }
      setLoadError((prev) => prev ?? "No se pudo verificar el estado del servidor.");
    }
  };

  // Arranque: detecta sesión de recuperación (magic link) y carga inicial desde
  // Supabase. `onResetSession` es la única salida hacia el estado de sesión de
  // App (resetSession vive ahí, no aquí). En modo local no hay nada que hacer:
  // la semilla ya está puesta y dbReady empieza en true.
  const bootstrap = async (sb: SupabaseClient, onResetSession: (session: unknown) => void): Promise<void> => {
    try {
      // Detectar sesión desde magic link de recuperación de PIN. OJO: el login
      // normal (Fase 1) también crea una sesión de Supabase Auth con email
      // sintético `${username}@fa.local`; esa NO es de recuperación. Solo lo es
      // una sesión cuyo email es el correo real (magic link de recuperación).
      const { data: { session: existingSession } } = await sb.auth.getSession();
      const sEmail = (existingSession?.user?.email as string | undefined) || "";
      if (existingSession && !sEmail.endsWith("@fa.local")) {
        onResetSession(existingSession);
        window.history.replaceState(null, "", "#/");
      }

      const loaded = await loadData(sb);

      // A3-05/A2-06: rehidratación de sesión al recargar. El token de Supabase
      // ya persiste solo (por eso loadData de arriba corre autenticado); lo que
      // faltaba era restaurar el estado de UI (`user`, dueño de App). Solo para
      // sesiones de LOGIN normal (email sintético @fa.local) — las de
      // recuperación (correo real) siguen su flujo intacto, ya gestionado arriba.
      // Verificación SIEMPRE contra los datos reales recién cargados (con RLS),
      // nunca confianza ciega en el perfil mínimo de localStorage.
      if (existingSession && sEmail.endsWith("@fa.local")) {
        const saved = readSessionUser();
        if (saved) {
          const match = (loaded.users || []).find((u) => String(u.id) === String(saved.id) && u.role === saved.role);
          if (match) onCurrentUserSync(match);
          else clearSessionUser();
        }
      }

      // ¿Existe ya un admin? (primer arranque) — vía RPC, porque con RLS anon no
      // puede leer fa_users.
      await checkHasAdmin(sb);
    } catch (e) {
      console.error("Error cargando datos de Supabase:", e);
    } finally {
      setDbReady(true);
    }
  };

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
    if (currentUser?.id === profile.id) onCurrentUserSync(profile);
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
    // N4.1: el sobre de calificación de la corrección (fuente, nota exacta,
    // instrumento relleno, porPregunta) se FUSIONA sobre el del intento — la
    // preliminar y los niveles congelados en la entrega quedan intactos
    // (regla de oro 3: la preliminar nunca se pierde).
    if (correction?.calificacion) {
      updated.calificacion = { ...(existing.calificacion ?? {}), ...correction.calificacion };
    }
    // Nota vigente. Si la corrección trae el sobre con `nota`, es 0-100 EXACTA
    // (sin heurística — una nota de instrumento de 5 significa 0,5/10, no 5).
    // Si no (correcciones legadas), totalScore con el umbral tolerante de
    // siempre: puede llegar en 0-10 (anteriores a T1.2, o inputs sin migrar).
    // CorrectionView siempre envía number|null (nunca "") — TeacherCorrection
    // lo tipa así (F7, T7.2); el `!== ""` que había aquí era una comprobación
    // muerta sobre ese contrato ya garantizado por el tipo.
    if (correction?.calificacion?.nota != null) {
      updated.score = Number(correction.calificacion.nota);
    } else if (correction?.totalScore != null) {
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

  return {
    exercises, users, results, categories, courses, units, groups, audioLibrary,
    setUsers, setResults,
    dbReady, saveError, setSaveError, serverHasAdmin, setServerHasAdmin,
    loadError, retryLoad,
    loadData, bootstrap, dbUpsertUser, dbUpsertResult,
    addUser, removeUser, updateUser,
    saveCorrection,
    addGroup, updateGroup, deleteGroup,
    addExercise, updateExercise, duplicateExercise, deleteExercise,
    addCategory, updateCategory, deleteCategory, toggleGlobalCategory,
    addCourse, updateCourse, deleteCourse,
    addUnit, updateUnit, deleteUnit, addExercisesToUnit, removeExerciseFromUnit,
    addAudio, updateAudio, deleteAudio,
  };
}
