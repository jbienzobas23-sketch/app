// ═══ ACCESIBILIDAD ═══════════════════════════════════════════════════════════
// Helpers para hacer accesibles por teclado los elementos que actúan como botón
// pero se renderizan como <div>/<span> (filas desplegables, tarjetas clicables).

import type { KeyboardEvent } from "react";

interface RowButtonProps {
  role: "button";
  tabIndex: 0;
  onKeyDown: (e: KeyboardEvent) => void;
}

/**
 * Devuelve las props ARIA/teclado para un elemento clicable no nativo.
 * Activa `onActivate` con Enter o Espacio (y evita el scroll del Espacio).
 * Úsalo junto a `onClick={onActivate}` en el mismo elemento:
 *
 *   <div onClick={toggle} {...rowButtonProps(toggle)}>…</div>
 */
export function rowButtonProps(onActivate: () => void): RowButtonProps {
  return {
    role: "button",
    tabIndex: 0,
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onActivate();
      }
    },
  };
}
