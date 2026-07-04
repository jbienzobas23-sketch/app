// ═══ HASH ROUTER ═════════════════════════════════════════════════════════════
// Enrutado por almohadilla (#/…). Funciona en cualquier hosting estático SIN
// configuración extra: todo lo que va detrás de "#" lo gestiona el navegador en
// el cliente, así que recargar o pegar un enlace profundo nunca da 404. La URL es
// la fuente de verdad de la navegación de alto nivel; el contexto de ejercicio se
// reconstruye a partir del id de la URL. Extraído de App.jsx (Fase 0). Migrado a TS (Fase 3).
//
// Mapa de rutas:
//   /                                  → inicio (elegir rol)
//   /entrar/profesor · /entrar/alumno  → login
//   /configuracion                     → setup del primer admin
//   /alumno                            → panel alumno · todos los ejercicios
//   /alumno/cursos/:cursoId?/:unidadId? → panel alumno · por cursos (curso/unidad opcionales)
//   /alumno/elegir-profesor            → selección de profesor
//   /alumno/ejercicio/:id              → sesión de ejercicio (alumno)
//   /alumno/ejercicio/:id/correccion   → corrección (alumno)
//   /profesor                          → panel profesor · ejercicios
//   /profesor/cursos/:cursoId?/:unidadId? · alumnos|categorias|audios|ajustes|usuarios → pestañas
//   /profesor/alumnos/:studentId/ejercicio/:exId → respuesta de un alumno (corrección)
//   /profesor/ejercicio/nuevo          → crear ejercicio
//   /profesor/ejercicio/:id            → detalle del ejercicio
//   /profesor/ejercicio/:id[/parte/:pid]/grabar     → grabar clave (interactivo/esquema)
//   /profesor/ejercicio/:id[/parte/:pid]/previsualizar → previsualizar esquema
//   /profesor/ejercicio/:id[/parte/:pid]/preguntas  → gestor de preguntas (cuestionario)
//   /profesor/ejercicio/:id[/parte/:pid]/correccion → corrección (previsualización)
//   parte/:pid es opcional (F4, T4.2): sin él, App resuelve a la primera parte.
import { useState, useEffect, useMemo } from "react";

export interface Route { name: string; params: Record<string, string>; }

export function parseHash(): string[] {
  let h = (typeof window !== "undefined" && window.location.hash) || "";
  if (h.startsWith("#")) h = h.slice(1);
  const q = h.indexOf("?");
  if (q >= 0) h = h.slice(0, q);
  return h.split("/").filter(Boolean).map((s) => {
    try { return decodeURIComponent(s); } catch { return s; }
  });
}

// La query (?tipo=…&estado=…) es transparente para las rutas — parseHash la
// descarta al partir los segmentos — así que vive aparte (T3.6). Sirve para
// que los filtros del alumno sobrevivan a entrar a un ejercicio y volver: la
// vista los inicializa leyendo la query al montar y la actualiza al cambiar.
export function parseHashQuery(): Record<string, string> {
  const h = (typeof window !== "undefined" && window.location.hash) || "";
  const q = h.indexOf("?");
  if (q < 0) return {};
  const out: Record<string, string> = {};
  new URLSearchParams(h.slice(q + 1)).forEach((v, k) => { out[k] = v; });
  return out;
}

// Fusiona `patch` en la query de la URL actual (una clave a `null` la borra)
// sin tocar el path ni crear una entrada de historial nueva.
export function setHashQuery(patch: Record<string, string | null>): void {
  if (typeof window === "undefined") return;
  const h = window.location.hash.replace(/^#/, "") || "/";
  const q = h.indexOf("?");
  const path   = q >= 0 ? h.slice(0, q) : h;
  const params = new URLSearchParams(q >= 0 ? h.slice(q + 1) : "");
  for (const [k, v] of Object.entries(patch)) {
    if (v == null || v === "") params.delete(k); else params.set(k, v);
  }
  const qs = params.toString();
  window.history.replaceState(null, "", "#" + (qs ? `${path}?${qs}` : path));
}

// Segmentos de URL → ruta lógica { name, params }
export function routeFromSegments(segs: string[]): Route {
  const [a, b, c, d, e, f] = segs;
  if (!a) return { name: "home", params: {} };
  if (a === "configuracion") return { name: "setup", params: {} };

  if (a === "entrar") {
    const role = b === "profesor" ? "teacher" : b === "alumno" ? "student" : null;
    return role ? { name: "login", params: { role } } : { name: "home", params: {} };
  }

  if (a === "alumno") {
    if (b === "elegir-profesor") return { name: "pick-teacher", params: {} };
    if (b === "ejercicio" && c) {
      if (d === "correccion") return { name: "correction", params: { exId: c, from: "student" } };
      return { name: "session", params: { exId: c, mode: "student" } };
    }
    if (b === "cursos") {
      const params: Record<string, string> = { tab: "courses" };
      if (c) params.cursoId = c;
      if (d) params.unidadId = d;
      return { name: "student", params };
    }
    return { name: "student", params: { tab: "all" } };
  }

  if (a === "profesor") {
    if (b === "ejercicio" && c) {
      // @deprecated (M4.2): el segmento parte/:pid (F4, T4.2) se sigue ACEPTANDO
      // para enlaces antiguos, pero ya NO se emite — la convención única es
      // `?parte=:pid` (query). App normaliza los enlaces con segmento a la query
      // con {replace}. Sin parte, App resuelve a la primera parte del ejercicio.
      const hasPart = d === "parte" && e;
      const action  = hasPart ? f : d;
      const params: Record<string, string> = { exId: c };
      if (hasPart) params.partId = e;
      if (action === "grabar")        return { name: "session", params: { ...params, mode: "record" } };
      if (action === "previsualizar") return { name: "session", params: { ...params, mode: "preview" } };
      if (action === "preguntas")     return { name: "question-manager", params };
      if (action === "correccion")    return { name: "correction", params: { ...params, from: "teacher" } };
      return { name: "teacher-detail", params: { exId: c } };
    }
    if (b === "cursos") {
      const params: Record<string, string> = { tab: "courses" };
      if (c) params.cursoId = c;
      if (d) params.unidadId = d;
      return { name: "teacher", params };
    }
    if (b === "alumnos" && c && d === "ejercicio" && e) {
      return { name: "teacher-answer", params: { studentId: c, exId: e } };
    }
    const TAB: Record<string, string> = {
      alumnos: "students", categorias: "categories",
      audios: "audios", ajustes: "settings", usuarios: "users",
    };
    return { name: "teacher", params: { tab: (b && TAB[b]) || "exercises" } };
  }

  return { name: "home", params: {} };
}

// Pestaña interna del profesor → ruta
export const TEACHER_TAB_PATH: Record<string, string> = {
  exercises: "/profesor", courses: "/profesor/cursos", students: "/profesor/alumnos",
  categories: "/profesor/categorias", audios: "/profesor/audios",
  settings: "/profesor/ajustes", users: "/profesor/usuarios",
};

// Construye la ruta de "por cursos" (T3.1): curso/unidad opcionales, en el
// panel de alumno o de profesor. Usado por CoursesPages vía onNavigate.
export const coursesPath = (role: "student" | "teacher", cursoId?: string | null, unidadId?: string | null): string => {
  const base = role === "student" ? "/alumno/cursos" : "/profesor/cursos";
  if (!cursoId) return base;
  return unidadId ? `${base}/${cursoId}/${unidadId}` : `${base}/${cursoId}`;
};

// Retorno al origen (T3.2): memoriza el último hash "de panel" — uno que
// empieza por /alumno o /profesor y no es una sesión de ejercicio (no
// contiene /ejercicio/) — para que grabar clave, guardar preguntas, entregar
// o volver de la corrección regresen adonde estaba el usuario (una unidad de
// curso, el banco…) en vez de saltar siempre a la raíz del rol.
let lastPanelPath: string | null = null;
const isPanelPath = (path: string): boolean =>
  (path.startsWith("/alumno") || path.startsWith("/profesor")) && !path.includes("/ejercicio/");

export function getLastPanelPath(fallback: string): string {
  return lastPanelPath ?? fallback;
}

// Hook de enrutado: devuelve la ruta actual y un navegador.
export function useHashRoute() {
  const [segs, setSegs] = useState<string[]>(() => parseHash());

  useEffect(() => {
    const onChange = () => setSegs(parseHash());
    window.addEventListener("hashchange", onChange);
    if (!window.location.hash) { window.history.replaceState(null, "", "#/"); }
    return () => window.removeEventListener("hashchange", onChange);
  }, []);

  useEffect(() => {
    const full = window.location.hash.replace(/^#/, "") || "/";
    if (isPanelPath(full.split("?")[0])) lastPanelPath = full;
  }, [segs]);

  const navigate = (path: string, opts: { replace?: boolean } = {}) => {
    const next = path.startsWith("/") ? path : "/" + path;
    const current = window.location.hash.replace(/^#/, "") || "/";
    if (current === next) return;
    if (opts.replace) {
      window.history.replaceState(null, "", "#" + next);
      setSegs(parseHash());
    } else {
      window.location.hash = next; // dispara "hashchange"
    }
  };

  const route = useMemo(() => routeFromSegments(segs), [segs]);
  return { route, navigate };
}
