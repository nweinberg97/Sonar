/**
 * Open-source speech-to-text: OpenAI's Whisper model, run on this server with
 * Hugging Face transformers.js (ONNX Runtime). No API key, no third party.
 *
 * - The model is downloaded once from the Hugging Face Hub into ./.models and
 *   reused from disk afterwards. Set TRANSCRIPTION_OFFLINE=true after the first
 *   download to forbid any further network fetches.
 * - Models are ONNX files: weights only, no executable code is loaded.
 * - Audio arrives as 16 kHz mono WAV (the browser converts it), is decoded in
 *   memory, transcribed, and dropped. Nothing is written to disk.
 */
import path from "node:path";
import { transcriptionConfig } from "./config";

type Transcriber = (audio: Float32Array, opts: Record<string, unknown>) => Promise<{ text?: string } | { text?: string }[]>;

let loading: Promise<Transcriber> | null = null;

// One transcription at a time keeps a small server responsive and memory flat.
// Live conversation bursts jump ahead of finished answers: someone is still
// talking and their next follow-up depends on it.
type Job = () => Promise<void>;
const urgent: Job[] = [];
const normal: Job[] = [];
let busy = false;

function schedule<T>(fn: () => Promise<T>, priority: "urgent" | "normal"): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    (priority === "urgent" ? urgent : normal).push(() => fn().then(resolve, reject));
    void pump();
  });
}

async function pump() {
  if (busy) return;
  busy = true;
  try {
    for (let job = urgent.shift() ?? normal.shift(); job; job = urgent.shift() ?? normal.shift()) {
      await job().catch(() => undefined);
    }
  } finally {
    busy = false;
  }
}

async function load(): Promise<Transcriber> {
  const c = transcriptionConfig();
  const tf = await import("@huggingface/transformers");
  tf.env.cacheDir = path.join(process.cwd(), ".models");
  tf.env.allowLocalModels = true;
  tf.env.allowRemoteModels = !c.offline;
  const started = Date.now();
  const asr = await tf.pipeline("automatic-speech-recognition", c.model, {
    dtype: c.dtype as "q8",
    revision: c.revision,
  });
  console.log(`[sonar] Whisper ready (${c.model}, ${c.dtype}) in ${Math.round((Date.now() - started) / 1000)}s`);
  return asr as unknown as Transcriber;
}

function getTranscriber(): Promise<Transcriber> {
  if (!loading) {
    loading = load().catch((err) => {
      loading = null; // allow a retry on the next request
      throw err;
    });
  }
  return loading;
}

/** Start downloading/loading the model in the background (called at server start). */
export function warmUpLocalWhisper(): Promise<void> {
  console.log("[sonar] Loading Whisper (first run downloads the model, this can take a minute)…");
  return getTranscriber().then(
    () => undefined,
    (err) => console.error("[sonar] Whisper failed to load:", err),
  );
}

export async function transcribeLocally(audio: Blob, priority: "urgent" | "normal" = "normal"): Promise<string> {
  const samples = decodeWav16k(new Uint8Array(await audio.arrayBuffer()));
  if (samples.length < 16000 * 0.3) return "";
  const asr = await getTranscriber();
  const out = await schedule(() => asr(samples, { chunk_length_s: 30, stride_length_s: 5 }), priority);
  const text = Array.isArray(out) ? out.map((o) => o.text ?? "").join(" ") : out.text ?? "";
  return cleanWhisperText(text);
}

// Whisper sometimes emits bracketed non-speech tags or a lone filler on silence.
function cleanWhisperText(text: string): string {
  const t = text
    .replace(/\[(?:BLANK_AUDIO|MUSIC|NOISE|SILENCE|INAUDIBLE)[^\]]*\]/gi, " ")
    .replace(/\((?:music|noise|silence|inaudible)[^)]*\)/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return /^(you|thank you\.?|thanks for watching!?|\.)$/i.test(t) ? "" : t;
}

/**
 * Minimal RIFF/WAVE reader → mono Float32 at 16 kHz.
 * Accepts 16-bit PCM or 32-bit float, any channel count or sample rate.
 */
export function decodeWav16k(bytes: Uint8Array): Float32Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (o: number) => String.fromCharCode(bytes[o], bytes[o + 1], bytes[o + 2], bytes[o + 3]);
  if (bytes.length < 44 || tag(0) !== "RIFF" || tag(8) !== "WAVE") throw new Error("Audio is not a WAV file");

  let fmt: { format: number; channels: number; rate: number; bits: number } | null = null;
  let dataStart = -1;
  let dataLen = 0;
  for (let o = 12; o + 8 <= bytes.length; ) {
    const id = tag(o);
    const size = view.getUint32(o + 4, true);
    if (id === "fmt ") {
      fmt = { format: view.getUint16(o + 8, true), channels: view.getUint16(o + 10, true), rate: view.getUint32(o + 12, true), bits: view.getUint16(o + 22, true) };
    } else if (id === "data") {
      dataStart = o + 8;
      dataLen = Math.min(size, bytes.length - dataStart);
      break;
    }
    o += 8 + size + (size % 2);
  }
  if (!fmt || dataStart < 0) throw new Error("WAV file is missing audio data");
  const { format, channels, rate, bits } = fmt;
  const pcm16 = format === 1 && bits === 16;
  const f32 = format === 3 && bits === 32;
  if (!pcm16 && !f32) throw new Error(`Unsupported WAV encoding (format ${format}, ${bits}-bit)`);
  if (channels < 1 || channels > 8 || rate < 4000 || rate > 192000) throw new Error("Unsupported WAV layout");

  const bytesPer = bits / 8;
  const frames = Math.floor(dataLen / (bytesPer * channels));
  const mono = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    let sum = 0;
    for (let ch = 0; ch < channels; ch++) {
      const o = dataStart + (i * channels + ch) * bytesPer;
      sum += pcm16 ? view.getInt16(o, true) / 32768 : view.getFloat32(o, true);
    }
    mono[i] = sum / channels;
  }
  if (rate === 16000) return mono;
  // Linear resample to 16 kHz.
  const outLen = Math.floor((frames * 16000) / rate);
  const out = new Float32Array(outLen);
  const step = rate / 16000;
  for (let i = 0; i < outLen; i++) {
    const x = i * step;
    const i0 = Math.floor(x);
    const i1 = Math.min(i0 + 1, frames - 1);
    out[i] = mono[i0] + (mono[i1] - mono[i0]) * (x - i0);
  }
  return out;
}
