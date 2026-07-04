// Cabecera de intentos (F6, T6.3) — compartida por las tres vistas de
// corrección. Con más de un intento: «Intento N · Mejor X% · Último Y% (↑/↓)».
// `result.score` ya es el mejor (addAttempt lo garantiza); el "Último" es el
// score del intento más reciente. Devuelve null con ≤1 intento.
import type { ExerciseResult } from "../../lib/types.js";
import { C } from "../../theme/tokens.js";
import { attemptsOf } from "../../lib/domain.js";
import type { CorrectionResult } from "./shared.js";

export function AttemptBanner({ result }: { result: CorrectionResult }) {
  const attempts = attemptsOf(result as unknown as ExerciseResult);
  if (attempts.length <= 1) return null;
  const lastAttemptScore = attempts[attempts.length - 1]?.score ?? null;
  const prevBestScore = attempts.slice(0, -1).reduce<number | null>((best, a) => (a?.score != null && (best == null || a.score > best) ? a.score : best), null);
  const attemptTrend = lastAttemptScore != null && prevBestScore != null
    ? (lastAttemptScore > prevBestScore ? "up" : lastAttemptScore < prevBestScore ? "down" : "same")
    : null;
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 14, fontSize: 12.5, color: C.muted, flexWrap: "wrap" }}>
      <span>Intento {attempts.length}</span>
      <span>·</span>
      <span>Mejor <strong style={{ color: C.ink }}>{result.score ?? "—"}%</strong></span>
      <span>·</span>
      <span>
        Último <strong style={{ color: C.ink }}>{lastAttemptScore ?? "—"}%</strong>
        {attemptTrend === "up" && <span style={{ color: C.fnT, fontWeight: 700 }}> ↑</span>}
        {attemptTrend === "down" && <span style={{ color: C.danger, fontWeight: 700 }}> ↓</span>}
      </span>
    </div>
  );
}
