// Configuración global para los tests (Vitest + Testing Library).
import '@testing-library/jest-dom'

// Stub de CanvasRenderingContext2D (F7, T7.3): jsdom no implementa el motor de
// canvas — getContext("2d") devuelve null — pero las vistas de sesión dibujan
// la forma de onda ahí. Un proxy todo-no-op deja montar esos componentes en
// los tests sin añadir una dependencia de canvas nueva.
if (typeof HTMLCanvasElement !== 'undefined') {
  const noopCtx = new Proxy({} as CanvasRenderingContext2D, {
    get: (_target, prop) => {
      if (prop === 'measureText') return () => ({ width: 0 });
      if (prop === 'canvas') return undefined;
      if (typeof prop === 'string') return () => noopCtx;
      return undefined;
    },
    set: () => true,
  });
  // @ts-expect-error — stub deliberadamente incompleto, solo para tests.
  HTMLCanvasElement.prototype.getContext = () => noopCtx;
}
