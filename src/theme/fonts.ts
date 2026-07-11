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
        // Reserva SIEMPRE el ancho de la barra de scroll vertical (Jon,
        // 2026-07-06): sin esto, una pestaña corta (sin scroll) y una larga
        // (Audios, con scroll) tienen distinto ancho de contenido — al
        // cambiar de una a otra, todo el layout salta unos px a la izquierda
        // cuando aparece la barra. `stable` reserva ese hueco de entrada,
        // haya o no overflow. Los navegadores sin soporte (Safari) ignoran
        // la propiedad sin efecto — no empeora nada donde no se aplica.
        + "html{scrollbar-gutter:stable}"
        // Fondo papel bajo todo (M0.7): sin esto, el hueco entre capas (fallback
        // de Suspense, remontaje al alternar modelo/parte, overscroll de iOS)
        // se ve blanco puro en vez del fondo de la app — un pestañeo visible.
        // margin:0 elimina el margen por defecto del body (8px): sin él, un
        // layout de altura de viewport (corrección) hereda 16px de scroll
        // fantasma; el fondo ya cubría ese margen, así que no cambia nada visible.
        + "html,body{background:#f8f8f6;margin:0}"
        + "#root{min-height:100dvh;background:#f8f8f6}"
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
        // Hitbox táctil mínima de 40px (A5-16): zona invisible vía ::before,
        // centrada sobre el elemento, sin cambiar su dibujo/tamaño visual. El
        // propio elemento debe ser position:relative (o quedar así al aplicarla).
        + ".fa-hit40{position:relative}"
        + ".fa-hit40::before{content:\"\";position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:max(100%,40px);height:max(100%,40px)}"
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
        + "input:focus-visible,textarea:focus-visible,select:focus-visible{box-shadow:0 0 0 2px rgba(85,85,85,.4)}"
        // Input de nota grande (corrección): sin las flechas del spinner numérico
        // (afean el número grande) y con el placeholder de la nota automática en
        // gris + peso normal, para que se distinga de una nota escrita a mano.
        + ".fa-nota-input::-webkit-outer-spin-button,.fa-nota-input::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}"
        + ".fa-nota-input{-moz-appearance:textfield;appearance:textfield}"
        + ".fa-nota-input::placeholder{color:#b9b9b3;font-weight:600;opacity:1}"
        + ".fa-nota-input:focus-visible{box-shadow:none;text-decoration:underline;text-decoration-thickness:2px;text-underline-offset:4px}"
        // Scrollbar que solo aparece al moverla O al pasar el ratón por encima
        // (paneles con scroll propio, p. ej. la corrección de cuestionario):
        // invisible en reposo; el hover la asoma para que se note que ahí hay
        // más contenido, y "en uso" (clase .fa-scrolling, JS con temporizador)
        // la mantiene mientras se scrollea. El track siempre transparente.
        + ".fa-autohide-scroll{scrollbar-width:thin;scrollbar-color:transparent transparent}"
        + ".fa-autohide-scroll:hover,.fa-autohide-scroll.fa-scrolling{scrollbar-color:rgba(26,25,21,.28) transparent}"
        + ".fa-autohide-scroll::-webkit-scrollbar{width:7px}"
        + ".fa-autohide-scroll::-webkit-scrollbar-track{background:transparent}"
        + ".fa-autohide-scroll::-webkit-scrollbar-thumb{background:transparent;border-radius:8px;transition:background .15s ease}"
        + ".fa-autohide-scroll:hover::-webkit-scrollbar-thumb,.fa-autohide-scroll.fa-scrolling::-webkit-scrollbar-thumb{background:rgba(26,25,21,.28)}";
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
