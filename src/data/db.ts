// ═══ CAPA DE DATOS (SUPABASE) ════════════════════════════════════════════════
// Helpers de persistencia upsert/delete sobre las tablas fa_*. Extraídos de
// App.jsx (Fase 2). Reciben el cliente Supabase como dependencia (mediante un
// getter perezoso `getClient`, porque el cliente se carga de forma asíncrona al
// montar) en lugar de leer un ref global. Si no hay cliente (visor de artefactos
// / sin backend) simplemente retornan: el estado React ya se actualizó y la app
// sigue con los datos semilla.
//
// `pendingSavesRef`: contador de escrituras en vuelo (para avisos de "guardando").
// `onError`: se invoca cuando una escritura falla (p. ej. RLS la rechaza porque
//   la sesión no está enlazada). Antes los errores se tragaban (solo console.error)
//   y el estado local divergía en silencio del servidor → incoherencias entre
//   sesiones/dispositivos. Ahora se pueden mostrar al usuario.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Exercise } from "../lib/types.js";

interface DbDeps {
  getClient: () => SupabaseClient | null;
  pendingSavesRef: { current: number };
  onError?: (info: { table: string; message: string }) => void;
  // Inyectable para tests (F7, T7.4): por defecto espera de verdad; los tests
  // pasan una versión instantánea para no esperar los 13s reales del backoff.
  sleep?: (ms: number) => Promise<void>;
}

type AnyRecord = Record<string, unknown>;
type WriteResult = { error: { message?: string } | null };

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// Reintento exponencial (F7, T7.4): 1s / 3s / 9s entre intentos — 3 reintentos
// tras el fallo inicial (4 intentos en total). `pendingSavesRef` sigue contando
// durante toda la secuencia (no baja hasta el éxito o agotar reintentos), así
// que el indicador de "guardando" no parpadea a mitad de los reintentos.
const RETRY_DELAYS_MS = [1000, 3000, 9000];

export function createDb({ getClient, pendingSavesRef, onError, sleep = defaultSleep }: DbDeps) {
  // Envuelve una escritura: cuenta pendientes, reintenta con backoff ante
  // fallo, y solo avisa (onError) tras agotar los reintentos — antes cada
  // fallo (a menudo transitorio: red, RLS en mitad de un refresco de sesión)
  // disparaba el toast de inmediato.
  const write = async (table: string, run: (sb: SupabaseClient) => PromiseLike<WriteResult>) => {
    const sb = getClient(); if (!sb) return;
    pendingSavesRef.current++;
    try {
      let lastMessage = "error";
      for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
        try {
          const { error } = await run(sb);
          if (!error) return;
          lastMessage = error.message ?? "error";
        } catch (e) {
          lastMessage = e instanceof Error ? e.message : String(e);
        }
        if (attempt < RETRY_DELAYS_MS.length) await sleep(RETRY_DELAYS_MS[attempt]);
      }
      console.error(`[${table}] Error al guardar (tras reintentos):`, lastMessage);
      onError?.({ table, message: lastMessage });
    } finally {
      pendingSavesRef.current--;
    }
  };

  const dbUpsertExercise = async (ex: Exercise) => {
    // El waveform decodificado puede pesar mucho; no se guarda en Supabase.
    const { waveformData: _waveformData, ...rest } = ex;
    await write("fa_exercises", (sb) => sb.from("fa_exercises").upsert({ id: ex.id, data: rest }));
  };
  const dbDeleteExercise = async (id: string) => { await write("fa_exercises", (sb) => sb.from("fa_exercises").delete().eq("id", id)); };

  const dbUpsertUser = async (u: AnyRecord & { id: string }) => { await write("fa_users", (sb) => sb.from("fa_users").upsert({ id: u.id, data: u })); };
  const dbDeleteUser = async (id: string) => { await write("fa_users", (sb) => sb.from("fa_users").delete().eq("id", id)); };

  const dbUpsertCategory = async (c: AnyRecord & { id: string }) => { await write("fa_categories", (sb) => sb.from("fa_categories").upsert({ id: c.id, data: c })); };
  const dbDeleteCategory = async (id: string) => { await write("fa_categories", (sb) => sb.from("fa_categories").delete().eq("id", id)); };

  const dbUpsertCourse = async (c: AnyRecord & { id: string }) => { await write("fa_courses", (sb) => sb.from("fa_courses").upsert({ id: c.id, data: c })); };
  const dbDeleteCourse = async (id: string) => { await write("fa_courses", (sb) => sb.from("fa_courses").delete().eq("id", id)); };

  const dbUpsertUnit = async (u: AnyRecord & { id: string }) => { await write("fa_units", (sb) => sb.from("fa_units").upsert({ id: u.id, data: u })); };
  const dbDeleteUnit = async (id: string) => { await write("fa_units", (sb) => sb.from("fa_units").delete().eq("id", id)); };

  // El invitado (id sintético "guest-<timestamp>", sin sesión ni fila en
  // fa_users) comparte el mismo `results` en memoria que un alumno real — sin
  // rama propia (M1.3) — pero sus entregas nunca se persisten: no hay sesión
  // que las respalde y RLS las rechazaría igualmente. No-op silencioso, no error.
  const dbUpsertResult = async (userId: string, exerciseId: string, data: AnyRecord) => {
    if (userId.startsWith("guest-")) return;
    await write("fa_results", (sb) => sb.from("fa_results").upsert({ user_id: userId, exercise_id: exerciseId, data }));
  };
  const dbDeleteResultsForUser = async (userId: string) => { await write("fa_results", (sb) => sb.from("fa_results").delete().eq("user_id", userId)); };
  const dbDeleteResultsForExercise = async (exerciseId: string) => { await write("fa_results", (sb) => sb.from("fa_results").delete().eq("exercise_id", exerciseId)); };

  const dbUpsertAudio = async (a: AnyRecord & { id: string }) => { await write("fa_audio_library", (sb) => sb.from("fa_audio_library").upsert({ id: a.id, data: a })); };
  const dbDeleteAudio = async (id: string) => { await write("fa_audio_library", (sb) => sb.from("fa_audio_library").delete().eq("id", id)); };

  const dbUpsertGroup = async (g: AnyRecord & { id: string }) => { await write("fa_groups", (sb) => sb.from("fa_groups").upsert({ id: g.id, data: g })); };
  const dbDeleteGroup = async (id: string) => { await write("fa_groups", (sb) => sb.from("fa_groups").delete().eq("id", id)); };

  return {
    dbUpsertExercise, dbDeleteExercise,
    dbUpsertUser, dbDeleteUser,
    dbUpsertCategory, dbDeleteCategory,
    dbUpsertCourse, dbDeleteCourse,
    dbUpsertUnit, dbDeleteUnit,
    dbUpsertResult, dbDeleteResultsForUser, dbDeleteResultsForExercise,
    dbUpsertAudio, dbDeleteAudio,
    dbUpsertGroup, dbDeleteGroup,
  };
}
