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
}

type AnyRecord = Record<string, unknown>;
type WriteResult = { error: { message?: string } | null };

export function createDb({ getClient, pendingSavesRef, onError }: DbDeps) {
  // Envuelve una escritura: cuenta pendientes, y ante un error lo registra y
  // avisa (onError) de forma uniforme para TODAS las tablas y operaciones.
  const write = async (table: string, run: (sb: SupabaseClient) => PromiseLike<WriteResult>) => {
    const sb = getClient(); if (!sb) return;
    pendingSavesRef.current++;
    try {
      const { error } = await run(sb);
      if (error) { console.error(`[${table}] Error al guardar:`, error.message); onError?.({ table, message: error.message ?? "error" }); }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error(`[${table}] Error al guardar:`, message); onError?.({ table, message });
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

  const dbUpsertResult = async (userId: string, exerciseId: string, data: AnyRecord) => {
    await write("fa_results", (sb) => sb.from("fa_results").upsert({ user_id: userId, exercise_id: exerciseId, data }));
  };
  const dbDeleteResultsForUser = async (userId: string) => { await write("fa_results", (sb) => sb.from("fa_results").delete().eq("user_id", userId)); };
  const dbDeleteResultsForExercise = async (exerciseId: string) => { await write("fa_results", (sb) => sb.from("fa_results").delete().eq("exercise_id", exerciseId)); };

  const dbUpsertSetting = async (key: string, value: unknown) => { await write("fa_settings", (sb) => sb.from("fa_settings").upsert({ key, value })); };

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
    dbUpsertSetting,
    dbUpsertAudio, dbDeleteAudio,
    dbUpsertGroup, dbDeleteGroup,
  };
}
