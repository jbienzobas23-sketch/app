// ═══ CIFRADO DE BAJO (INVERSIONES) ═══════════════════════════════════════════
// Grupos de cifrado para categorías con hasFigures, índice id→item y helpers.
// Extraídos de App.jsx (Fase 0). Migrado a TypeScript (Fase 3).

export interface Glyph { d: string; pre: string; strike: boolean; }
export interface FigItem { id: string; top: Glyph | null; bot: Glyph | null; }
export interface FigGroup { label: string | null; accent: string; items: FigItem[]; }
export type FigItemIndexed = FigItem & { kind: string };

// Cada cifra se compone de hasta dos "glifos" apilados (top/bot). Cada glifo es
// { d: dígito, pre: "+"|"♭"|"", strike: bool } para reproducir el cifrado real
// (dígitos tachados de las séptimas de dominante/disminuida, prefijos +/♭).
export const g = (d: string, opts: { pre?: string; strike?: boolean } = {}): Glyph =>
  ({ d, pre: opts.pre || "", strike: !!opts.strike });

// Grupos de cifrado. `kind` identifica la familia; cada item lleva id único
// (kind+inversión) para guardarse en la marca y comparar en corrección.
export const FIG_GROUPS: Record<string, FigGroup> = {
  triada: { label: null, accent: "#1A1915", items: [
    { id: "t0", top: null,      bot: null },              // fundamental
    { id: "t1", top: g("6"),    bot: null },              // 6
    { id: "t2", top: g("6"),    bot: g("4") },            // 6/4
  ]},
  dia: { label: "7ª diatónica", accent: "#2F6FB8", items: [
    { id: "d0", top: g("7"),    bot: null },
    { id: "d1", top: g("6"),    bot: g("5") },
    { id: "d2", top: g("4"),    bot: g("3") },
    { id: "d3", top: g("2"),    bot: null },
  ]},
  dom: { label: "7ª de dominante", accent: "#C77A1A", items: [
    { id: "D0", top: g("7"),               bot: g("+") },
    { id: "D1", top: g("6"),               bot: g("5", { strike: true }) },
    { id: "D2", top: g("6", { pre: "+" }), bot: null },
    { id: "D3", top: g("4", { pre: "+" }), bot: null },
  ]},
  semi: { label: "7ª semidisminuida", accent: "#9A4FB8", items: [
    { id: "s0", top: g("7"),               bot: g("5", { strike: true }) },
    { id: "s1", top: g("5"),               bot: g("6", { pre: "+" }) },
    { id: "s2", top: g("3"),               bot: g("4", { pre: "+" }) },
    { id: "s3", top: g("4"),               bot: g("2", { pre: "+" }) },
  ]},
  dim: { label: "7ª disminuida", accent: "#B84A3A", items: [
    { id: "x0", top: g("7", { strike: true }), bot: null },
    { id: "x1", top: g("6", { pre: "+" }),     bot: g("5", { strike: true }) },
    { id: "x2", top: g("4", { pre: "+" }),     bot: g("3", { pre: "♭" }) },
    { id: "x3", top: g("2", { pre: "+" }),     bot: null },
  ]},
};

// Índice id → item (con su kind), para lookup O(1).
export const FIG_BY_ID: Record<string, FigItemIndexed> = {};
for (const [kind, grp] of Object.entries(FIG_GROUPS)) {
  for (const it of grp.items) FIG_BY_ID[it.id] = { ...it, kind };
}
// Compatibilidad con marcas antiguas (fig en formato "6", "6/4", "7"…).
export const FIG_LEGACY: Record<string, string> = { "": "t0", "6": "t1", "6/4": "t2", "7": "d0", "6/5": "d1", "4/3": "d2", "2": "d3" };
export const figureOf = (id?: string | null): FigItemIndexed => FIG_BY_ID[id ?? ""] || FIG_BY_ID[FIG_LEGACY[id ?? ""]] || FIG_BY_ID.t0;
export const isTriadFig = (id?: string | null): boolean => (figureOf(id).kind === "triada");

// Qué grupos de cuatríada ofrece cada grado (además de la tríada).
export const quadGroupsForDegree = (fn: string): string[] => {
  if (fn === "V")   return ["dia", "dom"];
  if (fn === "VII") return ["dia", "semi", "dim"];
  return ["dia"];
};
