// ═══ DESIGN TOKENS ══════════════════════════════════════════════════════════
// Tokens compartidos de color, tipografía y estilos base. Extraídos de App.jsx
// (Fase 0) sin cambios de valor para no alterar el aspecto de la app.

export const C = {
  // Base palette
  bg: "#f8f8f6", paper: "#ffffff", paper2: "#f0f0ee",
  ink: "#1a1a1a", ink2: "#555555", muted: "#b0b0a8", muted2: "#b0b0a8", line: "#e6e6e3",
  // V0_9 aliases (usados por primitivos compartidos)
  border: "#e6e6e3", rail: "#e0e0db", chevron: "#c0c0b8",
  chipBg: "#f0f0ee", chipInk: "#888888", tabOff: "#aaaaaa",
  noteBg: "#fffaeb", noteInk: "#c07427",
  field: "#fcfcfb", fieldFocus: "#555",
  // Colores funcionales — sin cambios
  fnT: "#3F9B5B", fnS: "#2F6FB8", fnD: "#C77A1A",
  fnI: "#9A4FB8", fnIV: "#3A8CA8", fnV: "#C9A33A",
  quiz: "#2F6FB8",
  danger: "#B84A3A",
};

export const FONT_SANS  = "'Outfit', system-ui, sans-serif";
export const FONT_SERIF = "'Cormorant Garamond', Georgia, serif";
export const FONT_MONO  = "'Outfit', system-ui, sans-serif";
export const F = { serif: FONT_SERIF, sans: FONT_SANS };

export const S = {
  app:        { fontFamily: FONT_SANS, background: C.bg, minHeight: "100vh", color: C.ink },
  page:       { maxWidth: 980, margin: "0 auto", padding: "calc(22px + env(safe-area-inset-top,0px)) 24px 40px" },
  card:       { background: C.paper, border: `1px solid ${C.line}`, borderRadius: 8, padding: "14px 18px", marginBottom: 12 },
  h1:         { fontFamily: FONT_SERIF, fontSize: 32, fontWeight: 600, margin: 0, color: C.ink, letterSpacing: "-0.01em", lineHeight: 1 },
  h2:         { fontFamily: FONT_SERIF, fontSize: 22, fontWeight: 600, margin: "0 0 12px", color: C.ink, letterSpacing: "-0.01em" },
  label:      { fontSize: 11, color: "#999", marginBottom: 6, display: "block", fontFamily: FONT_SANS, fontWeight: 500 },
  btn:        { background: C.paper, border: `1px solid ${C.line}`, color: "#555", borderRadius: 7, padding: "7px 14px", cursor: "pointer", fontSize: 13, fontWeight: 500, fontFamily: FONT_SANS },
  btnPrimary: { background: C.ink, border: `1px solid ${C.ink}`, color: "#fff", borderRadius: 7, padding: "7px 15px", cursor: "pointer", fontSize: 12, fontWeight: 500, fontFamily: FONT_SANS },
  btnDanger:  { background: "transparent", border: `1px solid rgba(184,74,58,0.4)`, color: C.danger, borderRadius: 7, padding: "5px 12px", cursor: "pointer", fontSize: 12, fontWeight: 500, fontFamily: FONT_SANS },
  input:      { background: C.field, border: `1px solid ${C.line}`, borderRadius: 7, color: C.ink, padding: "9px 12px", fontSize: 13, width: "100%", boxSizing: "border-box", fontFamily: FONT_SANS, outline: "none" },
  row:        { display: "flex", alignItems: "center", gap: 10 },
  badge:      { fontSize: 11, padding: "2px 8px", borderRadius: 4, fontWeight: 600 },
  divider:    { border: "none", borderTop: `1px solid ${C.line}`, margin: "16px 0" },
};

export const SECTION_STYLE = {
  fontSize: 10, fontWeight: 700, letterSpacing: "0.15em",
  textTransform: "uppercase", color: C.chevron, margin: "0 0 14px",
  fontFamily: FONT_SANS,
};

// Estilo "guardar/disabled" (ratio de opacidad común) compartido por modales.
export const disabledStyle = (canSave) => ({
  opacity: canSave ? 1 : 0.45,
  cursor:  canSave ? "pointer" : "not-allowed",
});
