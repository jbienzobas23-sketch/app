# A6 — Audio

**Fecha:** 2026-07-10 · **Rama:** `beta` · **Commit HEAD:** `f263089a1ef0e70f2fb2902839e891cca6afe52a` (código fuente idéntico a A0–A5; `analisis/` va por `f7f8894`)
**Alcance real:** el plan contemplaba captura de micrófono y Supabase Storage; **ninguna de las dos existe en la app** (verificado por grep 2026-07-10: cero usos de `getUserMedia`/`MediaRecorder`/`createObjectURL`/`.storage`/`FileReader`/`<input type="file">`). El audio entra exclusivamente por **URL pegada** (hosting externo, p. ej. Cloudinary) y las data: URLs son solo herencia. El "hold-to-record" de esta app no graba audio: es mantener pulsado un botón de función para marcar intervalos sobre el audio que suena.

---

## 1. Mapa del pipeline (con veredicto por etapa)

```
[Profesor pega URL]
   │
   ├─ EDITOR (useExerciseEditor.handleUrlInput:205-227) ──► fetchAudioBuffer + decodeAudioData
   │       └─ duración + waveform · ctx.close() ✓ · reqId cancela obsoletas ✓ · catch SILENCIOSO ✗
   ├─ ALMACÉN (modals.AudioLibrary handleUrlChange:584-609) ──► ídem
   │       └─ ctx.close() ✓ · reqId ✓ · error visible "No se pudo verificar la URL" ✓
   ▼
[Persistencia: fa_exercises/fa_audio_library = SOLO url + metadatos (~350 B, verificado en prod A3)]
   │    (excepción: parts[*].waveformData sí viaja al JSONB — A2-09)
   ▼
[Selector de fragmento del editor]  <audio> nativo (session.tsx:39-169)
   │    streaming, sin CORS, pausa al desmontar ✓, RAF playhead ✓
   ▼
[SESIÓN DEL ALUMNO]  SessionShell → PartRunner → useAudioPlayer (UNO por parte, compartido
   │    por las vistas keep-mounted del combo — SessionShell.tsx:87-97; parte = LRU-1)
   │    fetch completo + decodeAudioData → AudioBuffer en RAM → AudioBufferSourceNode
   ▼
[Marcado hold-to-record]  timeRef a 60 fps desde ctx.currentTime (RAF) → intervalos {start,end}
   ▼
[Entrega → CORRECCIÓN]  QuizCorrection/InteractiveCorrection/SchemaCorrection instancian su
        propio useAudioPlayer (una vista a la vez) · bucle infinito de fragmento en QuizCorrection
```

| Etapa | Veredicto | Evidencia |
|---|---|---|
| Ingesta (URL pegada, sin subida de fichero) | **sólida con matiz** | validación real al pegar (decode completo); el matiz: feedback silencioso en el editor → [A6-02] |
| Detección duración/waveform | **sólida** | ctx cerrados en éxito Y error (useExerciseEditor.ts:221,226; modals.tsx:598,604); cancelación por `reqId` en ambas |
| Persistencia | **sólida** | solo URL+metadatos (~350 B/fila verificado en A3); sin base64 en BD; excepción `parts[*].waveformData` (A2-09) |
| Carga+decodificación en sesión (useAudioPlayer.ts:90-117) | **sólida en recursos, frágil en red** | cleanup completo al desmontar/cambiar (cancelled + stopSource + ctx.close, :115); pero fetch sin abort, CORS obligatorio y error único engañoso → [A6-01],[A6-03],[A6-04] |
| Reproducción/transporte | **sólida** | `ctx.resume()` antes de reproducir (iOS suspendido, :233,:272), `webkitAudioContext` fallback (3 sitios), `sourceIdRef` invalida `onended` obsoletos (:59,:68,:73), `pendingToggleRef` evita toggles concurrentes (:229-232); huecos menores → [A6-05],[A6-07] |
| Sincronización marca↔tiempo | **sólida** | `timeRef` gobernado por RAF desde `ctx.currentTime` (:163-216), canvas a 60 fps, React throttleado a ~10 fps; latencia de arranque del hold-to-record ≈ 1 frame (lectura directa de timeRef en el keydown/pointerdown, sin retardo artificial) |
| Waveform | **sólida** | real desde PCM canal 0 (lib/audio.ts:19-41, testeado A4); sintética determinista como fallback (seedFromId); compartida entre vistas del combo (SessionShell.tsx:90-93) |
| Compartición híbridos/multiparte | **sólida** | UN reproductor por parte (SessionShell.tsx:96), las vistas ocultas reciben `active=false` (pausan su rAF); cambio de parte remonta (LRU-1) y cierra el ctx anterior |
| Captura de micrófono | **inexistente** (N/A) | sin getUserMedia/MediaRecorder; no hay flujo de permisos que auditar |
| Supabase Storage | **inexistente por diseño** | audio en hosts externos; riesgo operacional de enlaces muertos → [A6-08] |

---

## 2. Gestión de recursos (fugas)

Revisadas las 3 vías que crean `AudioContext` y el `<audio>` del selector:

- `useAudioPlayer` (la principal): el efecto de carga devuelve `cancelled=true; stopSource(); ctx.close()` (:115) — sin fuga al desmontar ni al cambiar de ejercicio; `bufferRef` se anula (:94). Los tickers (setInterval 50 ms del modo simulado, RAF del real) se limpian en sus returns (:157,:214). ✓
- Detección de duración (editor y almacén): `ctx.close()` en éxito y en error, con `try/catch` en el error. ✓
- `FragmentRangeSelector`: `cancelAnimationFrame` + `audio.pause()` al desmontar (session.tsx:82-85). El elemento `<audio>` muere con el DOM. ✓
- **Sin object URLs en todo el repo** → nada que revocar. ✓
- Único cabo suelto: el `fetch` del audio no tiene `AbortController` — al desmontar a mitad de descarga, `cancelled` ignora el resultado pero la descarga continúa en segundo plano → [A6-04].

---

## 3. Permisos

N/A: la app no pide micrófono ni ningún otro permiso de medios. La reproducción no requiere permisos (solo la política de autoplay, ver §4).

---

## 4. Compatibilidad Safari/iOS

- **AudioContext suspendido:** cubierto — `togglePlay` y `playFrom` hacen `ctx.resume()` antes de arrancar la fuente (useAudioPlayer.ts:233,272), y toda reproducción nace de un gesto del usuario (el autoplay al seleccionar pregunta se eliminó a propósito el 2026-07-06). ✓
- **`webkitAudioContext`:** fallback presente en los 3 puntos de creación (useAudioPlayer.ts:98, modals.tsx:592, useExerciseEditor.ts:215). ✓
- **Formatos de grabación:** N/A (no se graba). Los formatos de reproducción los decide el host externo; `decodeAudioData` en forma de promesa requiere Safari ≥14.1 (aceptable hoy).
- **Touch en hold-to-record:** `onTouchStart` con `preventDefault`+`stopPropagation`, `userSelect:none`, `touchAction:none`, `WebkitTapHighlightColor` transparente (session.tsx:945-957) — sin long-press/selección accidental. ✓ (Los dos huecos de `touchAction` en superficies de seek quedaron en [A5-18].)
- **100vh/dvh:** el fallback del chunk de esquema ya usa `100dvh` (SessionShell.tsx:31); los `100vh` restantes están gateados a escritorio (A5 §4).
- Herencia: `dataUrlToBuffer` usa `atob` síncrono (lib/audio.ts:65-71) — con data: URLs legadas grandes bloquearía el hilo; hoy es vía residual.

---

## 5. Almacenamiento, tamaños y carga

- **BD:** solo URL + metadatos (título, compositor, tags, duración, createdAt) — máximo observado en prod 358 bytes por audio y 2,5 KB por ejercicio (A3 §2.3). Sin compresión que auditar en BD porque el binario nunca la toca.
- **Memoria en cliente:** `decodeAudioData` materializa el PCM completo: ~0,35 MB/s estéreo a 44,1 kHz → una obra de 4 min ≈ **~85 MB de RAM** mientras la sesión está montada. Mitigado por el reproductor único compartido y la LRU-1 de partes; aun así es la razón de que no haya streaming → [A6-03].
- **Carga diferida:** el audio solo se descarga al montar la vista que lo usa (sesión/corrección/gestor) — no hay precarga global. ✓ Con overlay visible durante la descarga (`AudioLoadingOverlay`, A5 §3). ✓ Contrapartida: no suena nada hasta descargar el fichero COMPLETO (sin streaming), sensible en conexiones lentas con obras largas.
- **Descargas repetidas:** el mismo fichero se baja al pegar la URL (detección), lo streamea el `<audio>` del selector, se vuelve a bajar+decodificar en la sesión y otra vez en la corrección — sin caché propia; depende de las cabeceras HTTP del host → [A6-06] (cruza con A7).

---

## 6. Hallazgos

- **[A6-01] media — la reproducción de sesión exige CORS del host y el error lo disfraza de "decodificación"** — `lib/audio.ts:74-79` + `useAudioPlayer.ts:112` — Evidencia: toda la sesión usa `fetch`+`decodeAudioData` (necesita CORS); cualquier fallo (404, CORS, red, formato) colapsa en el único mensaje "Error al decodificar el audio". El `<audio>` del selector reproduce sin CORS → un mismo enlace puede "funcionar" en el editor-preview y fallar en sesión. Mitiga: la detección al pegar (mismo fetch) actúa de puerta — una URL sin CORS no llega a guardarse con duración. — Recomendación: diferenciar mensajes (HTTP nnn / CORS / formato) y documentar el requisito CORS para el profesor.
- **[A6-02] media — el editor traga en silencio el error de URL de audio** — `useExerciseEditor.ts:226` (`catch { ctx.close() }` sin setError) — Evidencia: al pegar una URL mala en el editor no aparece nada (ni error ni duración); el modal del almacén sí avisa (`modals.tsx:606`). El profesor solo lo nota porque la falta "sin duración" bloquea el estado Lista. — Recomendación: replicar el `setError` del almacén.
- **[A6-03] media — sin streaming: PCM completo en RAM (~85 MB para 4 min) y espera de descarga íntegra** — `useAudioPlayer.ts:105-111` — Evidencia: `fetchAudioBuffer` baja el fichero entero y `decodeAudioData` lo expande a Float32; en móviles antiguos con obras largas es presión real de memoria, y nada suena hasta el último byte. Mitigado por reproductor compartido + LRU-1 + overlay. — Recomendación: registrar como límite de diseño (el scrub sample-preciso lo justifica); si algún día duele, `<audio>`+MediaElementSource para reproducción y decode solo para la waveform.
- **[A6-04] baja — descarga sin AbortController** — `useAudioPlayer.ts:97-115` — `cancelled` ignora el resultado pero la transferencia sigue; al saltar entre partes/ejercicios rápido se apilan descargas huérfanas. — Recomendación: AbortController en el cleanup.
- **[A6-05] baja — promesas de reproducción sin manejar** — `useAudioPlayer.ts:272` (`ctx.resume().then` sin `.catch`; togglePlay sí lo tiene en :254) y `session.tsx:148,167` (`audio.play().catch(()=>{})` pero `setPlaying(true)` incondicional → si play() es rechazado, la UI queda en "pausa" fantasma). — Recomendación: catch simétrico y fijar `playing` en el resolve.
- **[A6-06] baja — el mismo audio se descarga hasta 4 veces por flujo (detección, selector, sesión, corrección)** — §5 — sin caché de aplicación; el hit de caché depende del host externo. — Recomendación: anotar para A7 (candidato: cachear el ArrayBuffer por URL en memoria de sesión).
- **[A6-07] baja — pendiente de verificación manual: "reanudar tras pararse al final del fragmento" (stopAtLoopEnd)** — `useAudioPlayer.ts:242-249` (rama real) y `:222-225` (simulada) — El código cubre ambos modos, pero la nota de sesión del 2026-07-06 dejó constancia de que ESTA pieza no quedó verificada con confianza en navegador (el entorno de preview se congelaba). Sigue sin test (useAudioPlayer al 25 % de cobertura, A4). — Recomendación: prueba manual directa + test del hook con el timer simulado.
- **[A6-08] baja — dependencia operacional de hosts externos sin verificación de enlaces** — diseño (sin Storage) — Evidencia: 13 audios en prod apuntan a URLs externas; si el host borra/mueve un fichero, el ejercicio queda mudo y nadie lo sabe hasta que un alumno lo abre ("Error al decodificar el audio"). — Recomendación: acción de "verificar enlaces" en el almacén (HEAD a cada URL) o chequeo al abrir el detalle; valorar Supabase Storage a futuro (cruza con A8 §Storage: hoy no hay superficie de Storage que auditar).

---

## Criterio de cierre

✅ Pipeline diagramado de extremo a extremo (§1) con veredicto por etapa y evidencia: 7 etapas sólidas (2 con matices), 1 frágil-en-red, 2 inexistentes (captura y Storage — documentado por qué). La gestión de recursos está notablemente limpia (cero object URLs, ctx.close() en todas las vías, un solo reproductor compartido en híbridos); los hallazgos reales son de robustez de red/feedback ([A6-01..02]), límites de diseño ([A6-03]) y remates ([A6-04..08]).
