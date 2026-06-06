// ═══ CAPA DE DATOS (SUPABASE) ════════════════════════════════════════════════
// Helpers de persistencia upsert/delete sobre las tablas fa_*. Extraídos de
// App.jsx (Fase 2). Reciben el cliente Supabase como dependencia (mediante un
// getter perezoso `getClient`, porque el cliente se carga de forma asíncrona al
// montar) en lugar de leer un ref global. Si no hay cliente (visor de artefactos
// / sin backend) simplemente retornan: el estado React ya se actualizó y la app
// sigue con los datos semilla.
//
// `pendingSavesRef`: contador de escrituras en vuelo (para avisos de "guardando").
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Exercise } from "../lib/types.js";

interface DbDeps {
  getClient: () => SupabaseClient | null;
  pendingSavesRef: { current: number };
}

type AnyRecord = Record<string, unknown>;

export function createDb({ getClient, pendingSavesRef }: DbDeps) {
  const dbUpsertExercise = async (ex: Exercise) => {
    const sb = getClient(); if (!sb) return;
    // El waveform decodificado puede pesar mucho; no se guarda en Supabase.
    const { waveformData: _waveformData, ...rest } = ex;
    pendingSavesRef.current++;
    const { error } = await sb.from("fa_exercises").upsert({ id: ex.id, data: rest });
    pendingSavesRef.current--;
    if (error) console.error("[fa_exercises] Error al guardar:", error.message, ex.id);
  };
  const dbDeleteExercise = async (id: string) => { const sb = getClient(); if (!sb) return; await sb.from("fa_exercises").delete().eq("id", id); };

  const dbUpsertUser   = async (u: AnyRecord & { id: string })  => { const sb = getClient(); if (!sb) return; const { error } = await sb.from("fa_users").upsert({ id: u.id, data: u }); if (error) console.error("[fa_users] Error al guardar:", error.message); };
  const dbDeleteUser   = async (id: string) => { const sb = getClient(); if (!sb) return; await sb.from("fa_users").delete().eq("id", id); };

  const dbUpsertCategory = async (c: AnyRecord & { id: string })  => { const sb = getClient(); if (!sb) return; const { error } = await sb.from("fa_categories").upsert({ id: c.id, data: c }); if (error) console.error("[fa_categories] Error al guardar:", error.message); };
  const dbDeleteCategory = async (id: string) => { const sb = getClient(); if (!sb) return; await sb.from("fa_categories").delete().eq("id", id); };

  const dbUpsertCourse = async (c: AnyRecord & { id: string })  => { const sb = getClient(); if (!sb) return; const { error } = await sb.from("fa_courses").upsert({ id: c.id, data: c }); if (error) console.error("[fa_courses] Error al guardar:", error.message); };
  const dbDeleteCourse = async (id: string) => { const sb = getClient(); if (!sb) return; await sb.from("fa_courses").delete().eq("id", id); };

  const dbUpsertUnit = async (u: AnyRecord & { id: string })  => { const sb = getClient(); if (!sb) return; const { error } = await sb.from("fa_units").upsert({ id: u.id, data: u }); if (error) console.error("[fa_units] Error al guardar:", error.message); };
  const dbDeleteUnit = async (id: string) => { const sb = getClient(); if (!sb) return; await sb.from("fa_units").delete().eq("id", id); };

  const dbUpsertResult = async (userId: string, exerciseId: string, data: AnyRecord) => {
    const sb = getClient(); if (!sb) return;
    await sb.from("fa_results").upsert({ user_id: userId, exercise_id: exerciseId, data });
  };
  const dbDeleteResultsForUser     = async (userId: string)     => { const sb = getClient(); if (!sb) return; await sb.from("fa_results").delete().eq("user_id", userId); };
  const dbDeleteResultsForExercise = async (exerciseId: string) => { const sb = getClient(); if (!sb) return; await sb.from("fa_results").delete().eq("exercise_id", exerciseId); };

  const dbUpsertSetting = async (key: string, value: unknown) => { const sb = getClient(); if (!sb) return; await sb.from("fa_settings").upsert({ key, value }); };

  const dbUpsertAudio = async (a: AnyRecord & { id: string })  => { const sb = getClient(); if (!sb) return; await sb.from("fa_audio_library").upsert({ id: a.id, data: a }); };
  const dbDeleteAudio = async (id: string) => { const sb = getClient(); if (!sb) return; await sb.from("fa_audio_library").delete().eq("id", id); };

  const dbUpsertGroup = async (g: AnyRecord & { id: string })  => { const sb = getClient(); if (!sb) return; await sb.from("fa_groups").upsert({ id: g.id, data: g }); };
  const dbDeleteGroup = async (id: string) => { const sb = getClient(); if (!sb) return; await sb.from("fa_groups").delete().eq("id", id); };

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
