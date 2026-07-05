// ═══ NOTAINPUT — nota 0–10 editable in situ (corrección) ═════════════════════
// El número grande a color ES el input (Jon, 2026-07-06): sin campo aparte que
// repita la nota. Vacío → placeholder con la nota automática en gris; al
// escribir, el número toma el color del rango. Compartido por las vistas de
// corrección (cuestionario, esquema) para que la "historia de la nota" sea una
// sola en toda la app. Aquí también vive el hook del scrollbar autoocultable
// que usan los paneles con scroll propio de esas mismas vistas.
import { C, FONT_SANS } from "../../theme/tokens.js";
import { scoreColor } from "../../lib/color.js";
import { nota10 } from "../../lib/scoring.js";
import { parseNota10, sanitizeNota10 } from "./notaShared.js";

interface NotaInputProps {
  value: string;                     // texto tal como lo escribe el profesor ("7,5")
  onChange: (v: string) => void;     // recibe el valor YA saneado
  auto100?: number | null;           // nota automática (0–100) para el placeholder
}
export function NotaInput({ value, onChange, auto100 = null }: NotaInputProps) {
  // Ancho = suma de avances por carácter. Medir en `ch` sobredimensiona la
  // coma/punto (mucho más estrechos que un dígito) y dejaba hueco antes de
  // "/10". Avances aprox. en `em` para Outfit 800: dígito ~0.62, coma ~0.32,
  // + 0.1 de margen para que el ancho NUNCA quede por debajo del texto real
  // (si se queda corto, el input scrollea el contenido para ver el cursor y
  // el número "salta"). SIN transición de ancho por el mismo motivo.
  const shown = value !== "" ? value : (auto100 != null ? nota10(auto100)! : "—");
  const widthEm = [...shown].reduce((sum, ch) => sum + (/[0-9]/.test(ch) ? 0.62 : (ch === "," || ch === ".") ? 0.32 : 0.62), 0) + 0.1;
  const n = parseNota10(value);
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 2 }}>
      <input
        type="text" inputMode="decimal"
        value={value}
        onChange={(e) => onChange(sanitizeNota10(e.target.value))}
        placeholder={auto100 != null ? nota10(auto100)! : "—"}
        aria-label="Nota final (0–10)"
        className="fa-nota-input"
        style={{ width: `${widthEm.toFixed(2)}em`, boxSizing: "content-box", textAlign: "left", fontFamily: FONT_SANS, fontSize: 42, fontWeight: 800, lineHeight: 1, color: n != null ? scoreColor(n * 10) : C.muted, background: "transparent", border: "none", padding: 0, outline: "none", fontVariantNumeric: "tabular-nums" }}
      />
      <span style={{ fontSize: 16, fontWeight: 700, color: C.muted2 }}>/10</span>
    </div>
  );
}
