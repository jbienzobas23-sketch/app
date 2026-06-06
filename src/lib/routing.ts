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
//   /alumno/cursos                     → panel alumno · por cursos
//   /alumno/elegir-profesor            → selección de profesor
//   /alumno/ejercicio/:id              → sesión de ejercicio (alumno)
//   /alumno/ejercicio/:id/correccion   → corrección (alumno)
//   /profesor                          → panel profesor · ejercicios
//   /profesor/cursos|alumnos|categorias|audios|ajustes|usuarios → pestañas
//   /profesor/ejercicio/nuevo          → crear ejercicio
//   /profesor/ejercicio/:id            → detalle del ejercicio
//   /profesor/ejercicio/:id/grabar     → grabar clave (interactivo/esquema)
//   /profesor/ejercicio/:id/previsualizar → previsualizar esquema
//   /profesor/ejercicio/:id/preguntas  → gestor de preguntas (cuestionario)
//   /profesor/ejercicio/:id/correccion → corrección (previsualización)
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

// Segmentos de URL → ruta lógica { name, params }
export function routeFromSegments(segs: string[]): Route {
  const [a, b, c, d] = segs;
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
    if (b === "cursos") return { name: "student", params: { tab: "courses" } };
    return { name: "student", params: { tab: "all" } };
  }

  if (a === "profesor") {
    if (b === "ejercicio" && c) {
      if (d === "grabar")        return { name: "session", params: { exId: c, mode: "record" } };
      if (d === "previsualizar") return { name: "session", params: { exId: c, mode: "preview" } };
      if (d === "preguntas")     return { name: "question-manager", params: { exId: c } };
      if (d === "correccion")    return { name: "correction", params: { exId: c, from: "teacher" } };
      return { name: "teacher-detail", params: { exId: c } };
    }
    const TAB: Record<string, string> = {
      cursos: "courses", alumnos: "students", categorias: "categories",
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

// Hook de enrutado: devuelve la ruta actual y un navegador.
export function useHashRoute() {
  const [segs, setSegs] = useState<string[]>(() => parseHash());

  useEffect(() => {
    const onChange = () => setSegs(parseHash());
    window.addEventListener("hashchange", onChange);
    if (!window.location.hash) { window.history.replaceState(null, "", "#/"); }
    return () => window.removeEventListener("hashchange", onChange);
  }, []);

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
