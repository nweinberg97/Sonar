"use client";

import { useEffect, useRef } from "react";

/**
 * Live waveform driven by the microphone's real input level.
 * New samples enter on the right and scroll left. Each frame also writes the
 * current level to `--level` on `levelTarget`, so other elements (the Sonar
 * mark, the halo around the stop button) can react without re-rendering.
 */
export function Waveform({
  analyserRef,
  levelTarget,
  color = "#C8F36B",
  bars = 48,
  height = 96,
}: {
  analyserRef: React.RefObject<AnalyserNode | null>;
  levelTarget?: React.RefObject<HTMLElement | null>;
  color?: string;
  bars?: number;
  height?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const history = new Array<number>(bars).fill(0);
    let buf: Uint8Array<ArrayBuffer> | null = null;
    let raf = 0;
    let last = 0;
    let smooth = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const draw = (t: number) => {
      raf = requestAnimationFrame(draw);
      const analyser = analyserRef.current;
      let level = 0;
      if (analyser) {
        if (!buf || buf.length !== analyser.fftSize) buf = new Uint8Array(new ArrayBuffer(analyser.fftSize));
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) {
          const v = (buf[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / buf.length);
        // Speech RMS sits roughly between 0.01 and 0.3; map it onto 0–1 with a gentle curve.
        level = Math.min(1, Math.pow(rms * 4.2, 0.75));
      }
      smooth = smooth * 0.6 + level * 0.4;
      levelTarget?.current?.style.setProperty("--level", smooth.toFixed(3));

      // Advance the history ~25 times a second for a readable scroll speed.
      if (t - last > 40) {
        history.shift();
        history.push(smooth);
        last = t;
      }

      const w = canvas.clientWidth;
      const h = height;
      ctx.clearRect(0, 0, w, h);
      const gap = 4;
      const bw = Math.max(2, (w - gap * (bars - 1)) / bars);
      ctx.fillStyle = color;
      for (let i = 0; i < bars; i++) {
        const v = history[i];
        const bh = Math.max(4, v * (h - 6));
        const x = i * (bw + gap);
        const y = (h - bh) / 2;
        ctx.globalAlpha = 0.25 + 0.75 * (i / bars);
        const r = Math.min(bw / 2, bh / 2);
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(x, y, bw, bh, r);
        else ctx.rect(x, y, bw, bh);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [analyserRef, levelTarget, color, bars, height]);

  return <canvas ref={canvasRef} className="block w-full" style={{ height }} aria-hidden />;
}
