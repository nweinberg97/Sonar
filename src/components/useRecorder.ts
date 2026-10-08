"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type RecorderError = "denied" | "no-mic" | "unsupported" | "insecure" | "failed";

export interface Recording {
  blob: Blob;
  durationMs: number;
  mimeType: string;
}

const MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm", "audio/ogg;codecs=opus"];

function pickMime(): string | undefined {
  if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported) return undefined;
  return MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m));
}

/**
 * Browser audio capture with a live analyser for the waveform.
 * Audio stays in memory as a Blob until it is uploaded for transcription.
 */
export function useRecorder({ maxMs = 180_000 }: { maxMs?: number } = {}) {
  const [status, setStatus] = useState<"idle" | "requesting" | "recording">("idle");
  const [error, setError] = useState<RecorderError | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedRef = useRef(0);
  const tickRef = useRef<number | null>(null);
  const stopResolveRef = useRef<((r: Recording | null) => void) | null>(null);

  const teardown = useCallback(() => {
    if (tickRef.current) window.clearInterval(tickRef.current);
    tickRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    analyserRef.current = null;
    if (ctxRef.current && ctxRef.current.state !== "closed") ctxRef.current.close().catch(() => {});
    ctxRef.current = null;
  }, []);

  useEffect(() => teardown, [teardown]);

  const stop = useCallback((): Promise<Recording | null> => {
    const rec = recRef.current;
    if (!rec || rec.state === "inactive") return Promise.resolve(null);
    return new Promise((resolve) => {
      stopResolveRef.current = resolve;
      rec.stop();
    });
  }, []);

  const start = useCallback(async (): Promise<boolean> => {
    setError(null);
    if (typeof window !== "undefined" && !window.isSecureContext) {
      setError("insecure");
      return false;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("unsupported");
      return false;
    }
    setStatus("requesting");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (err) {
      const name = (err as DOMException)?.name;
      setError(name === "NotAllowedError" || name === "SecurityError" ? "denied" : name === "NotFoundError" ? "no-mic" : "failed");
      setStatus("idle");
      return false;
    }
    streamRef.current = stream;

    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.6;
      source.connect(analyser);
      ctxRef.current = ctx;
      analyserRef.current = analyser;
      if (ctx.state === "suspended") await ctx.resume().catch(() => {});
    } catch {
      // The waveform is a nice-to-have; recording still works without it.
    }

    const mimeType = pickMime();
    let rec: MediaRecorder;
    try {
      rec = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    } catch {
      teardown();
      setError("unsupported");
      setStatus("idle");
      return false;
    }
    chunksRef.current = [];
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    rec.onstop = () => {
      const durationMs = Date.now() - startedRef.current;
      const type = rec.mimeType || mimeType || "audio/webm";
      const blob = new Blob(chunksRef.current, { type });
      chunksRef.current = [];
      teardown();
      setStatus("idle");
      stopResolveRef.current?.(blob.size > 0 ? { blob, durationMs, mimeType: type } : null);
      stopResolveRef.current = null;
    };
    recRef.current = rec;
    startedRef.current = Date.now();
    rec.start(250);
    setElapsed(0);
    setStatus("recording");
    tickRef.current = window.setInterval(() => {
      const ms = Date.now() - startedRef.current;
      setElapsed(ms);
      if (ms >= maxMs) void stop();
    }, 200);
    return true;
  }, [maxMs, stop, teardown]);

  const cancel = useCallback(() => {
    const rec = recRef.current;
    stopResolveRef.current = null;
    if (rec && rec.state !== "inactive") {
      rec.onstop = null;
      rec.stop();
    }
    chunksRef.current = [];
    teardown();
    setStatus("idle");
  }, [teardown]);

  return { status, error, elapsed, analyserRef, start, stop, cancel, clearError: () => setError(null) };
}
