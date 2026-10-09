"use client";

/**
 * Convert a recorded clip (webm/opus on Chrome, mp4/aac on Safari) into
 * 16 kHz mono 16-bit WAV, the format Whisper wants. Doing this in the browser
 * means the server needs no ffmpeg, and uploads stay small (~32 KB/s).
 */
export async function toWav16k(blob: Blob): Promise<Blob> {
  const Ctx =
    window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  let decoded: AudioBuffer;
  try {
    decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
  } finally {
    ctx.close().catch(() => {});
  }
  const rate = 16000;
  const length = Math.max(1, Math.ceil(decoded.duration * rate));
  const offline = new OfflineAudioContext(1, length, rate);
  const src = offline.createBufferSource();
  src.buffer = decoded;
  src.connect(offline.destination);
  src.start();
  const rendered = await offline.startRendering();
  return wavBlob(rendered.getChannelData(0));
}

/**
 * Raw microphone samples (at the device's rate, usually 44.1 or 48 kHz) →
 * 16 kHz mono WAV. Used for live conversation bursts, which are captured as
 * raw samples so each burst is a complete, playable file on its own.
 */
export function samplesToWav16k(input: Float32Array, fromRate: number): Blob {
  if (fromRate === 16000) return wavBlob(input);
  const ratio = fromRate / 16000;
  const out = new Float32Array(Math.floor(input.length / ratio));
  // Average each window: a cheap low-pass that avoids aliasing when downsampling.
  for (let i = 0; i < out.length; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(input.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = start; j < end; j++) sum += input[j];
    out[i] = end > start ? sum / (end - start) : 0;
  }
  return wavBlob(out);
}

function wavBlob(samples: Float32Array): Blob {
  const rate = 16000;
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buffer);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  v.setUint32(4, 36 + samples.length * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}
