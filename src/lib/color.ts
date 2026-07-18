// ═══ UTILIDADES DE COLOR ═════════════════════════════════════════════════════
// Conversión HSL↔hex, aclarado, color de texto por luminancia y colores de
// puntuación. Extraídas de App.jsx (Fase 0). Migrado a TypeScript (Fase 3).
import { C } from "../theme/tokens.js";

export function _hexToHsl(hex: string): [number, number, number] {
  const r=parseInt(hex.slice(1,3),16)/255,g=parseInt(hex.slice(3,5),16)/255,b=parseInt(hex.slice(5,7),16)/255;
  const max=Math.max(r,g,b),min=Math.min(r,g,b),l=(max+min)/2;
  let h=0,s=0;
  if(max!==min){const d=max-min;s=l>0.5?d/(2-max-min):d/(max+min);
    switch(max){case r:h=((g-b)/d+(g<b?6:0))/6;break;case g:h=((b-r)/d+2)/6;break;case b:h=((r-g)/d+4)/6;break;}}
  return [h*360,s*100,l*100];
}
export function _hslToHex(h: number, s: number, l: number): string {
  h/=360;s/=100;l/=100;
  const hr=(p: number, q: number, t: number)=>{if(t<0)t+=1;if(t>1)t-=1;if(t<1/6)return p+(q-p)*6*t;if(t<1/2)return q;if(t<2/3)return p+(q-p)*(2/3-t)*6;return p;};
  let r,g,b;
  if(s===0){r=g=b=l;}else{const q=l<0.5?l*(1+s):l+s-l*s,p=2*l-q;r=hr(p,q,h+1/3);g=hr(p,q,h);b=hr(p,q,h-1/3);}
  return '#'+[r,g,b].map(x=>Math.round(x*255).toString(16).padStart(2,'0')).join('');
}
export function lightenColor(hex: string, lAdd=18, sAdd=-8): string {const[h,s,l]=_hexToHsl(hex);return _hslToHex(h,Math.max(0,Math.min(100,s+sAdd)),Math.max(0,Math.min(100,l+lAdd)));}

// Color identitario ajustado para LEER sobre una pista casi blanca (Jon,
// 2026-07-16): un trazo fino y su etiqueta pequeña en el color crudo del bloque
// (p. ej. los grises de Partes #9CA0AC/#8E9EAA o el Texto #8A8478) quedan por
// debajo del contraste mínimo sobre el carril claro. Conserva el TONO (y sube
// un pelín la saturación) pero baja la luminosidad a un techo que garantiza
// contraste; los colores ya oscuros se dejan intactos, y lo que no sea un hex
// #rrggbb (rgba, "transparent"…) se devuelve sin tocar.
export function markOnLight(color: string, maxL = 44): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) return color;
  const [h, s, l] = _hexToHsl(color);
  if (l <= maxL) return color;
  return _hslToHex(h, Math.min(100, s + 8), maxL);
}

export const textOn = (hex: string | null | undefined): string => {
  if (!hex || hex[0] !== "#") return "#000";
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${Math.round(r * 0.18)},${Math.round(g * 0.18)},${Math.round(b * 0.18)})`;
};

export const scoreColor = (sc: number | null | undefined): string =>
  sc == null   ? C.muted :
  sc >= 80     ? C.fnT :
  sc >= 50     ? C.fnD :
                 C.danger;

export const scoreBg = (sc: number | null | undefined): string =>
  sc == null   ? C.line :
  sc >= 80     ? "rgba(63,155,91,0.16)" :
  sc >= 50     ? "rgba(199,122,26,0.20)" :
                 "rgba(184,74,58,0.16)";
