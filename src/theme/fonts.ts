// ═══ INYECCIÓN DE ESTILOS GLOBALES ═══════════════════════════════════════════
// Hook que inyecta keyframes/utilidades CSS una sola vez al montar la app.
// Extraído de App.jsx (Fase 2). Las fuentes están autoalojadas (main.tsx) desde F0.
import { useEffect } from "react";

export function useInjectFonts(): void {
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (!document.querySelector('style[data-fa-anim]')) {
      const style = document.createElement("style");
      style.setAttribute("data-fa-anim", "1");
      style.textContent =
        // Reset de caja: incluir padding/borde en el ancho calculado. Evita que
        // contenedores con width:100% + padding desborden el viewport en móvil.
        "*,*::before,*::after{box-sizing:border-box}"
        // Salvaguarda anti-desbordamiento horizontal en móvil.
        + "html,body{max-width:100%;overflow-x:hidden}"
        + "@keyframes faModelIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}"
        + "@keyframes faBarUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}"
        + "@keyframes faHintIn{from{opacity:0;max-height:0;margin-bottom:0}to{opacity:1;max-height:120px}}"
        // Desplegables flotantes (menús, sugerencias): fade + leve descenso/escala
        // desde el borde superior. Curva con un pelín de overshoot para ligereza.
        + "@keyframes faPop{from{opacity:0;transform:translateY(-6px) scale(.97)}to{opacity:1;transform:translateY(0) scale(1)}}"
        + ".fa-pop{animation:faPop .16s cubic-bezier(.34,1.4,.64,1);transform-origin:top center}"
        // Tarjetas/secciones expandibles en flujo: anima la altura con el truco
        // grid-rows 0fr→1fr (sin medir px). Envuelve el contenido en .fa-expand-inner.
        + ".fa-expand{display:grid;grid-template-rows:0fr;transition:grid-template-rows .24s cubic-bezier(.4,0,.2,1),opacity .2s ease;opacity:.4}"
        + ".fa-expand.fa-open{grid-template-rows:1fr;opacity:1}"
        + ".fa-expand-inner{overflow:hidden;min-height:0}"
        + ".fa-noscroll::-webkit-scrollbar{display:none;height:0;width:0}"
        + ".fa-noscroll{-ms-overflow-style:none}"
        // Sticky bar: pushes a safe spacer below the page so the bar never hides content
        + ".fa-sticky-bar{position:sticky;bottom:0;left:0;right:0;z-index:60;animation:faBarUp .22s ease}"
        // En móvil la barra de acción se reorganiza: el botón principal pasa a una
        // fila propia a todo el ancho (cómodo para el pulgar) y arriba quedan la
        // acción secundaria y el texto de estado, que así tiene sitio para respirar.
        + "@media (max-width:560px){"
        +   ".fa-actionbar{flex-wrap:wrap;gap:8px}"
        +   ".fa-actionbar-primary{flex-basis:100%;order:3}"
        +   ".fa-actionbar-primary>*{flex:1;justify-content:center}"
        + "}"
        + ".fa-pressable{transition:transform .08s ease, box-shadow .12s ease, background .12s ease, color .12s ease, border-color .12s ease}"
        + ".fa-pressable:active{transform:scale(.97)}"
        // Fade-in sin altura: para secciones con overflow o márgenes negativos donde
        // fa-expand cortaría el contenido. Pura opacidad, sin translate.
        + "@keyframes faFadeIn{from{opacity:0}to{opacity:1}}"
        + ".fa-fade-in{animation:faFadeIn .18s ease}"
        // Opciones de inversión: entrada escalonada (rise + leve escala) y origen
        // inferior para que sientan que "brotan" desde el switch.
        + "@keyframes faOptIn{from{opacity:0;transform:translateY(7px) scale(.96)}to{opacity:1;transform:translateY(0) scale(1)}}"
        + ".fa-opt-in{animation:faOptIn .22s cubic-bezier(.34,1.3,.64,1) both;transform-origin:center top}"
        // Respeta la preferencia de reducir movimiento del sistema
        + "@media (prefers-reduced-motion:reduce){.fa-pop,.fa-expand,.fa-fade-in,.fa-sticky-bar,.fa-opt-in{animation:none!important;transition:none!important}}"
        // S.input fija outline:none sin alternativa — sin esto el foco de teclado
        // es invisible en inputs de credencial y numéricos (AA de teclado).
        + "input:focus-visible,textarea:focus-visible,select:focus-visible{box-shadow:0 0 0 2px rgba(85,85,85,.4)}";
      document.head.appendChild(style);
    }
    // Asegura el viewport responsive en móvil (si el HTML host no lo define)
    if (!document.querySelector('meta[name="viewport"]')) {
      const meta = document.createElement("meta");
      meta.name = "viewport";
      meta.content = "width=device-width, initial-scale=1, viewport-fit=cover";
      document.head.appendChild(meta);
    }
  }, []);
}
