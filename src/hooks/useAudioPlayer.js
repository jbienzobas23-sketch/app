// ═══ HOOK DE REPRODUCTOR DE AUDIO ════════════════════════════════════════════
// Web Audio API: carga/decodifica, reproduce, hace seek/scrub y genera la
// waveform del fragmento. Extraído de App.jsx (Fase 2).
import { useState, useRef, useEffect } from "react";
import { fetchAudioBuffer, buildFragmentWaveform } from "../lib/audio.js";

export function useAudioPlayer(exercise, { onWaveform = null, loopRegionRef = null } = {}) {
  const dur           = exercise.duration;
  const audioUrl      = exercise.audioUrl;
  const hasAudio      = !!audioUrl;
  const fragmentStart = exercise.audioFragmentStart ?? 0;
  const fragmentEnd   = exercise.audioFragmentEnd   ?? null;

  const [time,          setTime]          = useState(0);
  const [playing,       setPlaying]       = useState(false);
  const [audioReady,    setAudioReady]    = useState(false);
  const [audioError,    setAudioError]    = useState(null);
  const [audioDuration, setAudioDuration] = useState(exercise.duration);

  const ctxRef           = useRef(null);
  const bufferRef        = useRef(null);
  const sourceRef        = useRef(null);
  const startCtxTimeRef  = useRef(0);
  const playOffsetRef    = useRef(0);
  const playingRef       = useRef(false);
  const timeRef          = useRef(0);
  const scrubbingRef     = useRef(false);
  // Cada fuente recibe un ID único; onended sólo actúa si sigue siendo la fuente activa
  const sourceIdRef      = useRef(0);
  // Evita que togglePlay sea llamado concurrentemente mientras ctx.resume() está pendiente
  const pendingToggleRef = useRef(false);
  // Throttle de setTime: el canvas lee timeRef directamente a 60 fps; React solo necesita
  // ~10 fps para el contador de tiempo visible → mucho menos re-renders.
  const lastSetTimeRef   = useRef(0);
  playingRef.current     = playing;
  // timeRef es la fuente de verdad del canvas (60 fps). Durante la reproducción
  // lo gobierna el bucle rAF; NO debemos pisarlo aquí con `time` (estado de React
  // throttleado a ~10 fps), porque cada re-render —p. ej. al pulsar/soltar un
  // botón de función— retrocedería timeRef al último valor throttleado y la onda
  // daría un salto a la derecha y volvería. Solo sincronizamos cuando NO se
  // reproduce (seek/scrub manual, donde setTime sí es la fuente de verdad).
  if (!playing) timeRef.current = time;

  const stopSource = () => {
    if (sourceRef.current) {
      sourceIdRef.current += 1;            // invalida el onended de la fuente anterior
      try { sourceRef.current.stop(); } catch (_) {}
      sourceRef.current = null;
    }
  };

  const startSource = (offset) => {
    const ctx = ctxRef.current;
    if (!ctx || !bufferRef.current) return;
    const myId = ++sourceIdRef.current;    // captura el ID de ESTA fuente
    const src  = ctx.createBufferSource();
    src.buffer = bufferRef.current;
    src.connect(ctx.destination);
    src.onended = () => {
      if (sourceIdRef.current !== myId) return;   // ya hay otra fuente activa → ignorar
      const lq = loopRegionRef?.current;
      if (!lq && playingRef.current) {
        timeRef.current       = dur;
        playOffsetRef.current = 0;   // reset para que el siguiente play empiece desde el inicio
        setTime(dur);
        setPlaying(false);
      }
    };
    const absOffset = Math.min(bufferRef.current.duration, offset + fragmentStart);
    const clipDur   = fragmentEnd != null ? Math.max(0, (fragmentEnd - fragmentStart) - offset) : undefined;
    src.start(0, absOffset, clipDur);
    sourceRef.current        = src;
    startCtxTimeRef.current  = ctx.currentTime;
  };

  // Carga + decodificación cuando cambia el ejercicio
  useEffect(() => {
    setTime(0); setPlaying(false); setAudioReady(false); setAudioError(null);
    setAudioDuration(exercise.duration);
    playOffsetRef.current = 0;
    bufferRef.current     = null;
    if (!hasAudio) return;

    let cancelled = false;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) { setAudioError("Tu navegador no soporta Web Audio API"); return; }
    const ctx = new AudioCtx();
    ctxRef.current = ctx;

    (async () => {
      try {
        const buf     = await fetchAudioBuffer(audioUrl);
        const decoded = await ctx.decodeAudioData(buf);
        if (cancelled) return;
        bufferRef.current = decoded;
        setAudioDuration(decoded.duration);
        setAudioReady(true);
        onWaveform?.(buildFragmentWaveform(decoded.getChannelData(0), decoded.duration, fragmentStart, fragmentEnd));
      } catch (_) { if (!cancelled) setAudioError("Error al decodificar el audio"); }
    })();

    return () => { cancelled = true; stopSource(); try { ctx.close(); } catch (_) {} };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exercise.id, audioUrl]);

  // Timer simulado cuando no hay audio real.
  // El avance se calcula SOBRE timeRef (fuente de verdad para el canvas), no
  // sobre el estado `time` de React. Antes el updater de setTime escribía
  // timeRef.current dentro de sí mismo (efecto secundario impuro); en
  // StrictMode —o al batchear con setPressing/setIntervals de una pulsación—
  // React reejecutaba ese updater desde un estado base anterior y dejaba en
  // timeRef un valor menor durante 1 frame → la onda saltaba a la derecha y
  // volvía. Ahora timeRef se actualiza una sola vez por tick, fuera de React.
  const timerRef = useRef(null);
  useEffect(() => {
    if (!playing || hasAudio) return;
    let last = performance.now();
    timerRef.current = setInterval(() => {
      if (scrubbingRef.current) return;
      const now = performance.now();
      const dt = (now - last) / 1000;
      last = now;
      const lq = loopRegionRef?.current;
      let next;
      if (lq && timeRef.current >= lq.audioEnd) {
        next = lq.audioStart;
      } else if (!lq && timeRef.current >= dur) {
        timeRef.current = dur;
        setTime(dur);
        setPlaying(false);
        return;
      } else {
        next = Math.min(dur, timeRef.current + dt);
      }
      timeRef.current = next;     // fuente de verdad (canvas) — una sola escritura
      setTime(next);              // espejo para React (texto de tiempo, etc.)
    }, 50);
    return () => clearInterval(timerRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, dur, hasAudio]);

  // RAF tick para audio real — el canvas lee timeRef a 60 fps; React setState se
  // throttlea a ~10 fps para no saturar el árbol de componentes con re-renders.
  useEffect(() => {
    if (!playing || !hasAudio) return;
    let raf;
    const tick = () => {
      const ctx = ctxRef.current;
      if (ctx && !scrubbingRef.current) {
        const rawT = playOffsetRef.current + (ctx.currentTime - startCtxTimeRef.current);
        const lq   = loopRegionRef?.current;
        if (lq && rawT >= lq.audioEnd) {
          stopSource();
          playOffsetRef.current = lq.audioStart;
          timeRef.current = lq.audioStart;
          setTime(lq.audioStart);          // loop reset: sin throttle
          lastSetTimeRef.current = performance.now();
          startSource(lq.audioStart);
        } else {
          // Techo de la línea de tiempo (0..dur). `dur` es la duración del
          // ejercicio/fragmento que ve el alumno; el buffer puede contener más
          // (archivo completo) o menos audio. El límite reproducible real desde
          // el inicio del fragmento es (bufferDuration - fragmentStart); nunca
          // debemos pasar de ahí ni de `dur`.
          const bufDur      = bufferRef.current?.duration ?? dur;
          const playable    = Math.max(0, bufDur - fragmentStart);
          const effectiveDur = Math.min(dur, playable);
          const t = Math.min(effectiveDur, rawT);
          timeRef.current = t;             // siempre actualizar ref (canvas lo lee directo)
          const now = performance.now();
          if (now - lastSetTimeRef.current >= 100) {    // ~10 fps para React
            lastSetTimeRef.current = now;
            setTime(t);
          }
          if (!lq && rawT >= effectiveDur) {
            timeRef.current       = effectiveDur;
            playOffsetRef.current = 0;   // reset para que el siguiente play empiece desde el inicio
            setTime(effectiveDur);       // fin de audio: sin throttle
            setPlaying(false);
            return;
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, dur, hasAudio]);

  const togglePlay = () => {
    if (!hasAudio || !bufferRef.current) { setPlaying((p) => !p); return; }
    if (pendingToggleRef.current) return;
    const ctx = ctxRef.current;
    const wasPlaying = playingRef.current;
    pendingToggleRef.current = true;
    ctx.resume().then(() => {
      pendingToggleRef.current = false;
      if (wasPlaying) {
        stopSource();
        playOffsetRef.current = Math.min(dur, playOffsetRef.current + (ctx.currentTime - startCtxTimeRef.current));
        timeRef.current = playOffsetRef.current;   // fija el valor exacto al pausar
        setTime(playOffsetRef.current);            // evita retroceso al sincronizar en !playing
        setPlaying(false);
      } else {
        stopSource();                        // safety: matar cualquier fuente huérfana
        startSource(playOffsetRef.current);
        setPlaying(true);
      }
    }).catch(() => {
      pendingToggleRef.current = false;    // liberar el lock aunque ctx.resume() falle
    });
  };

  const seekTo = (t) => {
    const c = Math.max(0, Math.min(dur, t));
    playOffsetRef.current = c; setTime(c);
    if (playingRef.current && bufferRef.current && ctxRef.current) { stopSource(); startSource(c); }
  };

  // Saltar e iniciar reproducción (usado por QuestionnaireView)
  const playFrom = (t) => {
    const c = Math.max(0, Math.min(dur, t));
    playOffsetRef.current = c; setTime(c);
    if (hasAudio && bufferRef.current && ctxRef.current) {
      stopSource();
      ctxRef.current.resume().then(() => { startSource(c); setPlaying(true); });
    } else {
      setPlaying(true);
    }
  };

  const scrubBegin = () => { scrubbingRef.current = true; stopSource(); };
  const scrubTo    = (t) => { const c = Math.max(0, Math.min(dur, t)); playOffsetRef.current = c; setTime(c); };
  const scrubEnd   = () => {
    if (!scrubbingRef.current) return;
    scrubbingRef.current = false;
    if (playingRef.current && bufferRef.current && ctxRef.current) startSource(playOffsetRef.current);
  };

  return {
    time, setTime, playing, setPlaying,
    audioReady, audioError, hasAudio,
    timeRef, playOffsetRef,
    audioDuration,
    togglePlay, seekTo, playFrom,
    scrubBegin, scrubTo, scrubEnd,
  };
}
