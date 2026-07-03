// ═══ CONSTANTES DE UI DE SESIÓN ══════════════════════════════════════════════
// Compartidas por las vistas de ejercicio (interactivo). Extraídas (Fase 2).
// Migrado a TypeScript (Fase 3).

// ─── Constantes de UI compartidas (modo interactivo) ─────────────────────────
export const VISIBLE_SECS    = 10;
export const IV_BAND_H       = 38;   // altura de la banda de respuesta en modo interactivo
export const IV_BAND_GAP     =  6;   // separación entre onda y banda
export const EMPTY_IVS: never[] = []; // referencia estable para listas de intervalos vacías

// ─── Márgenes de corrección por defecto (M0.5) ───────────────────────────────
// El margen ya no es configurable de forma global (fa_settings/SettingsTab):
// cada ejercicio define el suyo (T1.3); estas constantes son solo el valor
// inicial para ejercicios nuevos y el respaldo cuando uno antiguo no lo trae.
export const DEFAULT_MARGIN        = 1; // s — modelo interactivo
export const DEFAULT_SCHEMA_MARGIN = 3; // s — modelo esquema
