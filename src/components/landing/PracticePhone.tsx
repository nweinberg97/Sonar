"use client";

import { useEffect, useRef, useState } from "react";
import { SonarMark } from "../SonarMark";

type Step = "idle" | "rec" | "sent" | "done";

const QUESTION = "How has your first month with us been?";
const FOLLOWUP = "What almost made you give up in the first week?";
/** In the real thing Done appears at 30 seconds; the practice run shortens it. */
const DONE_AT = 8;
const PAUSE_AT = 4.5;

/**
 * A practice run of what a respondent sees, inside a phone on the landing page.
 * Nothing is recorded and nothing is sent: it walks through the real screens
 * (question, listening, follow-up on a pause, done) on a timer.
 */
export function PracticePhone() {
  const [step, setStep] = useState<Step>("idle");
  const [t, setT] = useState(0);
  const [quoted, setQuoted] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (step !== "rec") return;
    const started = Date.now() - t * 1000;
    timer.current = window.setInterval(() => setT((Date.now() - started) / 1000), 100);
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  useEffect(() => {
    if (step !== "sent") return;
    const id = window.setTimeout(() => setStep("done"), 900);
    return () => window.clearTimeout(id);
  }, [step]);

  const start = () => {
    setT(0);
    setQuoted(false);
    setStep("rec");
  };
  const reset = () => {
    setT(0);
    setQuoted(false);
    setStep("idle");
  };

  const dark = step === "rec" || step === "sent";
  const paused = step === "rec" && t >= PAUSE_AT;
  const talking = step === "rec" && !(t > PAUSE_AT - 1.6 && t < PAUSE_AT + 0.4);
  const canFinish = t >= DONE_AT;

  return (
    <div className="mx-auto w-full max-w-[300px]">
      <div className="relative">
        {/* side buttons */}
        <span className="absolute -left-[3px] top-[108px] h-7 w-[3px] rounded-l bg-deep" aria-hidden />
        <span className="absolute -left-[3px] top-[150px] h-12 w-[3px] rounded-l bg-deep" aria-hidden />
        <span className="absolute -left-[3px] top-[206px] h-12 w-[3px] rounded-l bg-deep" aria-hidden />
        <span className="absolute -right-[3px] top-[170px] h-16 w-[3px] rounded-r bg-deep" aria-hidden />
        <div className="relative aspect-[9/19.5] rounded-[52px] bg-ink p-[10px] shadow-[0_40px_80px_-30px_rgba(17,19,21,0.55)] ring-1 ring-deep">
          <div
            className={`relative flex h-full flex-col overflow-hidden rounded-[42px] transition-colors duration-300 ${dark ? "bg-ink text-white" : "bg-cloud text-ink"}`}
          >
            <StatusBar dark={dark} />
            <span className="absolute left-1/2 top-2.5 h-[26px] w-[80px] -translate-x-1/2 rounded-full bg-black" aria-hidden />

            <div className="flex flex-1 flex-col px-6 pb-4 pt-5">
              {step !== "done" && (
                <div className="flex items-center gap-3">
                  <SonarMark size={18} tone={dark ? "dark" : "light"} />
                  <span className={`h-1 flex-1 overflow-hidden rounded-full ${dark ? "bg-white/15" : "bg-ink/10"}`}>
                    <span
                      className={`block h-full rounded-full transition-[width] duration-300 ${dark ? "bg-white" : "bg-blue"}`}
                      style={{ width: `${step === "idle" ? 6 : Math.min(100, 8 + (t / 12) * 92)}%` }}
                    />
                  </span>
                  <span className={`tabular text-xs ${dark ? "text-white/55" : "text-ink/55"}`}>~1 min</span>
                </div>
              )}

              {step === "idle" && (
                <>
                  <p className="mt-9 font-display text-[1.6rem] font-semibold leading-[1.08] tracking-[-0.03em]">{QUESTION}</p>
                  <p className="mt-4 text-[0.92rem] leading-snug text-ink/55">Tap the mic and just talk. If you pause, we&rsquo;ll ask a follow-up.</p>
                  <div className="mt-auto flex flex-col items-center">
                    <button
                      type="button"
                      onClick={start}
                      aria-label="Start the practice run"
                      className="relative grid h-[88px] w-[88px] place-items-center rounded-full bg-blue text-white shadow-[0_10px_30px_-10px_rgba(56,103,255,0.7)] transition hover:bg-blue-press active:scale-95"
                    >
                      <span className="absolute inset-0 rounded-full border-2 border-blue/40 animate-ping-out" aria-hidden />
                      <MicIcon />
                    </button>
                    <span className="mt-3.5 text-sm font-semibold">Tap to speak</span>
                    <span className="mt-3 text-xs text-ink/50 underline decoration-ink/20 underline-offset-4">Prefer to type?</span>
                  </div>
                </>
              )}

              {step === "rec" && (
                <>
                  <p
                    className={`mt-8 font-display font-semibold tracking-[-0.02em] transition-all duration-300 ${
                      paused ? "text-[0.95rem] leading-snug text-white/45" : "text-[1.3rem] leading-tight text-white/75"
                    }`}
                  >
                    {QUESTION}
                  </p>
                  <div className="mt-5 min-h-[92px]" aria-live="polite">
                    {paused ? (
                      <div className="animate-rise">
                        <p className="text-xs font-medium text-cyan">Follow-up</p>
                        <p className="mt-1.5 font-display text-[1.35rem] font-semibold leading-tight tracking-[-0.02em]">{FOLLOWUP}</p>
                      </div>
                    ) : (
                      <p className="text-[0.9rem] text-white/45">{talking ? "Imagine you're talking. Sonar is listening." : "You pause for a moment…"}</p>
                    )}
                  </div>
                  <div className="mt-auto flex flex-col items-center">
                    <span className="flex items-center gap-1.5 text-xs font-medium text-cyan">
                      <span className="h-1.5 w-1.5 rounded-full bg-cyan animate-breathe" />
                      Listening
                    </span>
                    <span className="tabular mt-1 font-display text-4xl font-medium">{clock(t)}</span>
                    <Wave active={talking} />
                    <button
                      type="button"
                      onClick={() => setStep("sent")}
                      disabled={!canFinish}
                      aria-label={canFinish ? "Done" : `Done appears in ${Math.ceil(DONE_AT - t)} seconds`}
                      className="mt-5 grid h-[68px] w-[68px] place-items-center rounded-full bg-white text-sm font-bold text-ink transition active:scale-95 disabled:bg-white/10 disabled:text-white/55"
                    >
                      {canFinish ? "Done" : <span className="tabular">{Math.ceil(DONE_AT - t)}</span>}
                    </button>
                  </div>
                </>
              )}

              {step === "sent" && (
                <div className="flex flex-1 flex-col items-center justify-center pb-10">
                  <span className="grid h-24 w-24 place-items-center rounded-full bg-cyan text-ink animate-rise">
                    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path d="M5 12.5 10 17.5 19 7" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  <p className="mt-5 text-sm font-semibold text-white/85">Got it</p>
                </div>
              )}

              {step === "done" && (
                <div className="flex flex-1 flex-col pt-6 animate-rise">
                  <SonarMark size={40} />
                  <p className="mt-6 font-display text-[2rem] font-semibold leading-none tracking-[-0.035em]">That&rsquo;s a wrap.</p>
                  <p className="mt-3 text-[0.92rem] leading-snug text-ink/65">Thanks for helping make this better. Your feedback has been heard.</p>
                  <div className="mt-5 rounded-2xl bg-white p-4 text-[0.85rem] shadow-[0_1px_0_rgba(17,19,21,0.06)]">
                    {quoted ? (
                      <p className="font-semibold">Thank you. They may quote your words, never with your name.</p>
                    ) : (
                      <>
                        <p className="font-semibold">Can they quote you?</p>
                        <p className="mt-1 leading-snug text-ink/60">Always anonymous. Skip this and they won&rsquo;t.</p>
                        <button type="button" onClick={() => setQuoted(true)} className="mt-3 h-9 rounded-full bg-ink px-4 text-xs font-semibold text-white">
                          Yes, you can quote me
                        </button>
                      </>
                    )}
                  </div>
                  <button type="button" onClick={reset} className="mt-auto self-center text-xs font-medium text-ink/55 underline decoration-ink/20 underline-offset-4 hover:text-ink">
                    Run it again
                  </button>
                </div>
              )}
            </div>
            <span className={`mx-auto mb-2 h-[5px] w-[110px] rounded-full ${dark ? "bg-white/80" : "bg-ink/85"}`} aria-hidden />
          </div>
        </div>
      </div>
      <p className="mt-5 text-center text-sm text-ink/50">
        {step === "idle" ? "Practice run: tap the mic. Nothing is recorded." : step === "rec" && !paused ? "Pause for a moment and a follow-up appears." : step === "rec" && !canFinish ? "In the real thing, Done appears at 30 seconds." : "This is the whole flow for the person answering."}
      </p>
    </div>
  );
}

function clock(sec: number) {
  const s = Math.floor(sec);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function MicIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="8.5" y="2.5" width="7" height="12" rx="3.5" fill="currentColor" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** A simulated waveform: lively while "talking", flat during the pause. */
function Wave({ active }: { active: boolean }) {
  const [bars, setBars] = useState<number[]>(() => Array.from({ length: 24 }, () => 0.1));
  useEffect(() => {
    const id = window.setInterval(() => {
      setBars((b) => [...b.slice(1), active ? 0.2 + Math.random() * 0.8 : 0.08]);
    }, 110);
    return () => window.clearInterval(id);
  }, [active]);
  return (
    <div className="mt-4 flex h-11 w-full items-center justify-between" aria-hidden>
      {bars.map((v, i) => (
        <span key={i} className="w-[3px] rounded-full bg-cyan transition-[height] duration-100" style={{ height: `${Math.max(8, v * 100)}%`, opacity: 0.35 + (i / bars.length) * 0.65 }} />
      ))}
    </div>
  );
}

function StatusBar({ dark }: { dark: boolean }) {
  return (
    <div className={`flex items-center justify-between px-7 pt-3.5 text-[13px] font-semibold tabular ${dark ? "text-white" : "text-ink"}`}>
      <span>9:41</span>
      <span className="flex items-center gap-1" aria-hidden>
        <svg width="16" height="10" viewBox="0 0 17 11" fill="currentColor">
          <rect x="0" y="7" width="3" height="4" rx="1" />
          <rect x="4.5" y="5" width="3" height="6" rx="1" />
          <rect x="9" y="2.5" width="3" height="8.5" rx="1" />
          <rect x="13.5" y="0" width="3" height="11" rx="1" />
        </svg>
        <svg width="14" height="10" viewBox="0 0 15 11" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
          <path d="M1.5 4a9 9 0 0 1 12 0M3.8 6.5a5.6 5.6 0 0 1 7.4 0" />
          <circle cx="7.5" cy="9.2" r="1" fill="currentColor" stroke="none" />
        </svg>
        <svg width="23" height="11" viewBox="0 0 25 12" fill="none">
          <rect x="0.5" y="0.5" width="21" height="11" rx="3.5" stroke="currentColor" opacity="0.4" />
          <rect x="2" y="2" width="16" height="8" rx="2" fill="currentColor" />
          <rect x="22.5" y="4" width="1.8" height="4" rx="0.9" fill="currentColor" opacity="0.4" />
        </svg>
      </span>
    </div>
  );
}
