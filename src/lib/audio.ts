// ═══ AUDIO: DECODING Y WAVEFORM ══════════════════════════════════════════════
// Suavizado, construcción de waveform desde PCM, waveform sintética determinista
// y decodificación de data: URLs. Extraídas de App.jsx (Fase 0). Migrado a TS (Fase 3).

export function smoothArray(raw: number[], W: number): number[] {
  const n = raw.length;
  const out: number[] = new Array(n);
  let sum = 0, size = 0;
  for (let j = 0; j <= Math.min(W, n - 1); j++) { sum += raw[j]; size++; }
  for (let i = 0; i < n; i++) {
    out[i] = sum / size;
    const lo = i - W, hi = i + W + 1;
    if (lo >= 0) { sum -= raw[lo]; size--; }
    if (hi < n)  { sum += raw[hi]; size++; }
  }
  return out;
}

export function buildWaveformFromPCM(channelData: Float32Array, duration: number): number[] {
  const N = Math.max(400, Math.ceil(duration * 30));
  const blockSize = Math.max(1, Math.floor(channelData.length / N));
  const raw: number[] = new Array(N);
  for (let i = 0; i < N; i++) {
    let s = 0;
    for (let j = 0; j < blockSize; j++) s += Math.abs(channelData[i * blockSize + j] || 0);
    raw[i] = s / blockSize;
  }
  const sm = smoothArray(raw, 3);
  let mx = 1e-4;
  for (let i = 0; i < sm.length; i++) if (sm[i] > mx) mx = sm[i];
  return sm.map((v) => 0.08 + (v / mx) * 0.92);
}

export function buildFragmentWaveform(channelData: Float32Array, totalDuration: number, fragStart?: number | null, fragEnd?: number | null): number[] {
  const s = fragStart ?? 0;
  const e = fragEnd   ?? totalDuration;
  if (s <= 0 && e >= totalDuration) return buildWaveformFromPCM(channelData, totalDuration);
  const startIdx = Math.max(0, Math.floor((s / totalDuration) * channelData.length));
  const endIdx   = Math.min(channelData.length, Math.ceil((e  / totalDuration) * channelData.length));
  return buildWaveformFromPCM(channelData.slice(startIdx, endIdx), e - s);
}

// Hash determinista de un id (string o number) a una semilla numérica, para
// generar una onda sintética estable por parte/ejercicio (editor, M5.7).
export function seedFromId(id: string | number | null | undefined): number {
  const s = String(id ?? "x");
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h || 1;
}

export function generateWaveform(seed: number, numSamples: number): number[] {
  let s = (seed * 1664525 + 1013904223) >>> 0;
  const raw: number[] = new Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    raw[i] = s / 0xffffffff;
  }
  const sm = smoothArray(raw, 14);
  let mn = sm[0], mx = sm[0];
  for (let i = 1; i < sm.length; i++) { if (sm[i] < mn) mn = sm[i]; if (sm[i] > mx) mx = sm[i]; }
  return sm.map((v) => 0.08 + ((v - mn) / (mx - mn)) * 0.92);
}

export function dataUrlToBuffer(url: string): ArrayBuffer {
  const b64 = url.includes(",") ? url.split(",")[1] : url;
  const str = atob(b64);
  const buf = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) buf[i] = str.charCodeAt(i);
  return buf.buffer;
}

// Acepta data: URLs (heredadas) y URLs externas (Cloudinary, etc.)
export async function fetchAudioBuffer(url: string): Promise<ArrayBuffer> {
  if (url.startsWith("data:")) return dataUrlToBuffer(url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.arrayBuffer();
}
