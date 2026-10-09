"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { samplesToWav16k } from "./toWav";
import type { RecorderError } from "./useRecorder";
import { VoiceActivity } from "./voice-activity";

export interface LiveBurst {
  seq: number;
  /** When this burst started, from the start of the recording. */
  atMs: number;
  durationMs: number;
  wav: Blob;
}

interface Handlers {
  onBurst: (b: LiveBurst) => void;
  onPause: (elapsedMs: number) => void;
}

/**
 * Microphone capture for conversation mode. Instead of one recording at the
 * end, it hands over short bursts of audio (cut at natural breaths) while the
 * person is still talking, and tells you when they pause.
 *
 * Audio is captured as raw samples, so every burst is a complete WAV file the
 * server can transcribe on its own. Nothing is kept once a burst is handed over.
 */
export function useLiveCapture(handlers: Handlers) {
  const [status, setStatus] = useState<"idle" | "requesting" | "recording">("idle");
  const [error, setError] = useState<RecorderError | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const procRef = useRef<ScriptProcessorNode | null>(null);
  const tickRef = useRef<number | null>(null);

  // Capture state lives in refs: the audio callback runs ~12 times a second.
  const chunksRef = useRef<Float32Array[]>([]);
  const burstStartRef = useRef(0);
  /** When speech first started in the current burst (leading silence doesn't count). */
  const speechStartRef = useRef<number | null>(null);
  const capturedMsRef = useRef(0);
  const seqRef = useRef(0);
  const vadRef = useRef(new VoiceActivity());
  const rateRef = useRef(48000);

  const teardown = useCallback(() => {
    if (tickRef.current) window.clearInterval(tickRef.current);
    tickRef.current = null;
    if (procRef.current) {
      procRef.current.onaudioprocess = null;
      procRef.current.disconnect();
    }
    procRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    analyserRef.current = null;
    if (ctxRef.current && ctxRef.current.state !== "closed") ctxRef.current.close().catch(() => {});
    ctxRef.current = null;
  }, []);

  useEffect(() => teardown, [teardown]);

  const emit = useCallback(() => {
    const chunks = chunksRef.current;
    chunksRef.current = [];
    const length = chunks.reduce((n, c) => n + c.length, 0);
    const atMs = Math.round(speechStartRef.current ?? burstStartRef.current);
    burstStartRef.current = capturedMsRef.current;
    speechStartRef.current = null;
    if (!length) return;
    const all = new Float32Array(length);
    let o = 0;
    for (const c of chunks) {
      all.set(c, o);
      o += c.length;
    }
    const durationMs = Math.round((length / rateRef.current) * 1000);
    handlersRef.current.onBurst({ seq: seqRef.current++, atMs, durationMs, wav: samplesToWav16k(all, rateRef.current) });
  }, []);

  const stop = useCallback((): { durationMs: number; bursts: number } => {
    if (!procRef.current) return { durationMs: capturedMsRef.current, bursts: seqRef.current };
    if (vadRef.current.hasPendingSpeech) emit();
    chunksRef.current = [];
    teardown();
    setStatus("idle");
    return { durationMs: Math.round(capturedMsRef.current), bursts: seqRef.current };
  }, [emit, teardown]);

  const start = useCallback(async (): Promise<boolean> => {
    setError(null);
    if (typeof window !== "undefined" && !window.isSecureContext) {
      setError("insecure");
      return false;
    }
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!navigator.mediaDevices?.getUserMedia || !Ctx) {
      setError("unsupported");
      return false;
    }
    // Create the audio context inside the tap, before any await, so iOS lets it run.
    const ctx = new Ctx();
    ctxRef.current = ctx;
    setStatus("requesting");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (err) {
      ctx.close().catch(() => {});
      ctxRef.current = null;
      const name = (err as DOMException)?.name;
      setError(name === "NotAllowedError" || name === "SecurityError" ? "denied" : name === "NotFoundError" ? "no-mic" : "failed");
      setStatus("idle");
      return false;
    }
    streamRef.current = stream;
    try {
      if (ctx.state === "suspended") await ctx.resume().catch(() => {});
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.6;
      source.connect(analyser);
      analyserRef.current = analyser;

      // ScriptProcessor is old but works everywhere, including iOS Safari, with no extra files.
      const proc = ctx.createScriptProcessor(4096, 1, 1);
      rateRef.current = ctx.sampleRate;
      chunksRef.current = [];
      burstStartRef.current = 0;
      speechStartRef.current = null;
      capturedMsRef.current = 0;
      seqRef.current = 0;
      vadRef.current = new VoiceActivity();
      proc.onaudioprocess = (e) => {
        const input = e.inputBuffer.getChannelData(0);
        const block = new Float32Array(input);
        let sum = 0;
        for (let i = 0; i < block.length; i++) sum += block[i] * block[i];
        const rms = Math.sqrt(sum / block.length);
        const blockMs = (block.length / rateRef.current) * 1000;
        chunksRef.current.push(block);
        capturedMsRef.current += blockMs;
        const step = vadRef.current.feed(rms, blockMs);
        if (step.voiced && speechStartRef.current === null) speechStartRef.current = capturedMsRef.current - blockMs;
        if (step.cut) emit();
        else if (step.drop) {
          chunksRef.current = [];
          burstStartRef.current = capturedMsRef.current;
          speechStartRef.current = null;
        }
        if (step.pause) handlersRef.current.onPause(Math.round(capturedMsRef.current));
      };
      source.connect(proc);
      proc.connect(ctx.destination); // required for the callback to run; it outputs silence
      procRef.current = proc;
    } catch {
      teardown();
      setError("unsupported");
      setStatus("idle");
      return false;
    }

    setElapsed(0);
    setStatus("recording");
    const started = Date.now();
    tickRef.current = window.setInterval(() => {
      const ms = Date.now() - started;
      setElapsed(ms);
    }, 200);
    return true;
  }, [emit, teardown]);

  return { status, error, elapsed, analyserRef, start, stop, clearError: () => setError(null) };
}
