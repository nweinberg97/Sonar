"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, formatClock } from "@/lib/client";
import { SonarMark } from "../SonarMark";
import { Waveform } from "../Waveform";
import { useLiveCapture, type LiveBurst } from "../useLiveCapture";
import { MIC_ERRORS, MicIcon, PreviewBadge } from "./shared";

/** Everyone talks for at least this long before Done appears. */
export const MIN_MS = 30_000;
/** Recording stops here no matter what. */
export const MAX_MS = 5 * 60_000;

const LOCAL_FOLLOWUPS = [
  "Can you give a specific example?",
  "How did that affect you?",
  "What would you change first?",
  "Is there anything else that stood out?",
];

type Step = "idle" | "recording" | "sent" | "typing";

/**
 * Conversation mode: one question, then just talk. Short bursts of audio go to
 * the server while the person speaks; when they pause, a follow-up (already
 * drafted from what they said) appears. Done shows up after 30 seconds; once
 * the creator's target length is reached, follow-ups stop.
 */
export function ConversationStage({
  slug,
  question,
  targetSeconds,
  respondentId,
  preview,
  track,
  onDone,
}: {
  slug: string;
  question: { id: string; text: string };
  targetSeconds: number;
  respondentId: string | null;
  preview: boolean;
  /** Hand over uploads still in flight; the finishing screen waits for them. */
  track: (p: Promise<boolean>) => void;
  onDone: () => void;
}) {
  const [step, setStep] = useState<Step>("idle");
  const [followup, setFollowup] = useState<{ text: string; key: number } | null>(null);
  const [typed, setTyped] = useState("");
  const [trouble, setTrouble] = useState("");

  const liveIdRef = useRef<string | null>(respondentId);
  const shownRef = useRef<string[]>([]);
  const askingRef = useRef(false);
  const elapsedRef = useRef(0);
  const finishingRef = useRef(false);
  const levelRef = useRef<HTMLDivElement | null>(null);
  const primaryRef = useRef<HTMLButtonElement | null>(null);
  const textRef = useRef<HTMLTextAreaElement | null>(null);

  const targetMs = Math.min(MAX_MS, Math.max(MIN_MS, targetSeconds * 1000));

  const sendBurst = useCallback(
    (b: LiveBurst) => {
      const liveId = liveIdRef.current;
      if (!liveId) return;
      const attempt = async () => {
        const form = new FormData();
        form.append("audio", b.wav, `burst-${b.seq}.wav`);
        form.append("liveId", liveId);
        form.append("seq", String(b.seq));
        form.append("atMs", String(b.atMs));
        form.append("durationMs", String(b.durationMs));
        await api("/api/conversation/burst", { method: "POST", body: form });
        return true;
      };
      const p = attempt().catch(() => new Promise<boolean>((r) => setTimeout(() => r(attempt().catch(() => false)), 1500)));
      if (!preview) track(p);
    },
    [preview, track],
  );

  const showLocal = () => {
    const text = LOCAL_FOLLOWUPS.find((f) => !shownRef.current.includes(f)) ?? "Anything else you'd like to add?";
    return text;
  };

  const onPause = useCallback(async (elapsedMs: number) => {
    // Past the target: no more follow-ups, the wrap-up message is showing.
    if (askingRef.current || finishingRef.current || elapsedMs >= targetMs) return;
    askingRef.current = true;
    let text = "";
    try {
      if (liveIdRef.current) {
        const res = await api<{ followup: string }>("/api/conversation/next", {
          method: "POST",
          json: { liveId: liveIdRef.current, elapsedMs },
        });
        text = res.followup;
      }
    } catch {
      /* fall back to a simple one below */
    }
    if (!text) text = showLocal();
    askingRef.current = false;
    if (finishingRef.current) return;
    shownRef.current.push(text);
    setFollowup({ text, key: Date.now() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetMs]);

  const cap = useLiveCapture({ onBurst: sendBurst, onPause: (ms) => void onPause(ms) });
  elapsedRef.current = cap.elapsed;

  const start = async () => {
    setTrouble("");
    cap.clearError();
    shownRef.current = [];
    setFollowup(null);
    finishingRef.current = false;
    const ok = await cap.start();
    if (ok) setStep("recording");
  };

  // Previews get a throwaway conversation so follow-ups work but nothing is saved.
  useEffect(() => {
    if (!preview) return;
    api<{ liveId: string }>("/api/conversation/preview", { method: "POST", json: { slug } })
      .then((r) => (liveIdRef.current = r.liveId))
      .catch(() => {});
  }, [preview, slug]);

  const finish = useCallback(async () => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    const { durationMs, bursts } = cap.stop();
    setStep("sent");
    const liveId = liveIdRef.current;
    if (liveId && bursts > 0) {
      const attempt = () =>
        api("/api/conversation/finish", { method: "POST", json: { liveId, durationMs, bursts } }).then(() => true);
      const p = attempt().catch(() => attempt().catch(() => false));
      if (!preview) track(p);
    }
    await new Promise((r) => setTimeout(r, 700));
    if (bursts === 0) {
      finishingRef.current = false;
      setTrouble("We didn't catch anything. Check your microphone and try again, or type instead.");
      setStep("idle");
      return;
    }
    onDone();
  }, [cap, onDone, preview, track]);

  // Hard stop at five minutes.
  useEffect(() => {
    if (step === "recording" && cap.elapsed >= MAX_MS) void finish();
  }, [cap.elapsed, finish, step]);

  useEffect(() => {
    if (step === "typing") textRef.current?.focus();
  }, [step]);

  const submitTyped = () => {
    const text = typed.trim();
    if (!text) return;
    if (!preview && respondentId) {
      const body = { respondentId, questionId: question.id, transcript: text, inputMode: "text", durationMs: 0 };
      const attempt = () => api("/api/answers", { method: "POST", json: body }).then(() => true);
      track(attempt().catch(() => attempt().catch(() => false)));
    }
    onDone();
  };

  const dark = step === "recording" || step === "sent";
  const micError = cap.error ? MIC_ERRORS[cap.error] : null;
  const elapsed = cap.elapsed;
  const canFinish = elapsed >= MIN_MS;
  const pastTarget = elapsed >= targetMs;
  const progress = Math.min(1, elapsed / targetMs);

  return (
    <div
      ref={levelRef}
      className={`min-h-[100dvh] transition-colors duration-300 ${dark ? "on-dark bg-ink text-white" : "bg-cloud text-ink"}`}
      style={{ ["--level" as string]: 0 }}
    >
      <div className="mx-auto flex min-h-[100dvh] max-w-md flex-col px-6 pb-[max(env(safe-area-inset-bottom),1.5rem)] pt-5">
        {preview && <PreviewBadge dark={dark} />}
        <div className="flex items-center gap-3">
          <SonarMark size={22} tone={dark ? "dark" : "light"} />
          <div className={`h-1 flex-1 overflow-hidden rounded-full ${dark ? "bg-white/15" : "bg-ink/10"}`} aria-hidden>
            <div
              className={`h-full rounded-full transition-[width] duration-300 ${pastTarget ? "bg-lime" : dark ? "bg-white" : "bg-blue"}`}
              style={{ width: `${progress * 100}%` }}
            />
          </div>
          <span className={`tabular text-sm ${dark ? "text-white/60" : "text-ink/55"}`}>~{formatTarget(targetSeconds)}</span>
        </div>

        <div className="mt-12">
          <h1
            className={`font-display font-semibold tracking-[-0.03em] text-balance transition-all duration-300 ${
              dark ? (followup || pastTarget ? "text-lg leading-snug text-white/45" : "text-[1.6rem] leading-tight text-white/75") : "text-[2.15rem] leading-[1.08]"
            }`}
          >
            {question.text}
          </h1>
          {step === "idle" && !micError && !trouble && (
            <p className="mt-4 text-lg text-ink/55">Tap the mic and just talk. If you pause, we&rsquo;ll ask a follow-up.</p>
          )}
          {step === "recording" && (
            <div className="mt-6 min-h-[7rem]" aria-live="polite">
              {pastTarget ? (
                <p key="wrap" className="animate-rise font-display text-[1.6rem] font-semibold leading-tight tracking-[-0.02em]">
                  That&rsquo;s plenty, thank you. Add anything else, or tap Done.
                </p>
              ) : followup ? (
                <div key={followup.key} className="animate-rise">
                  <p className="text-sm font-medium text-lime">Follow-up</p>
                  <p className="mt-2 font-display text-[1.9rem] font-semibold leading-tight tracking-[-0.025em]">{followup.text}</p>
                </div>
              ) : (
                <p className="text-white/50">Pause anytime and we&rsquo;ll ask a follow-up.</p>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-1 flex-col justify-end pt-8">
          {step === "idle" && (
            <div className="flex flex-col items-center">
              {(micError || trouble) && (
                <div className="mb-8 w-full rounded-3xl bg-white p-5 shadow-[0_1px_0_rgba(17,19,21,0.06)]" role="alert">
                  <p className="font-semibold">{micError?.title ?? trouble}</p>
                  {micError && <p className="mt-1.5 text-[0.95rem] leading-relaxed text-ink/65">{micError.body}</p>}
                </div>
              )}
              <button
                ref={primaryRef}
                onClick={start}
                disabled={cap.status === "requesting" || !!(micError && cap.error !== "denied" && cap.error !== "failed")}
                aria-label={micError ? "Try the microphone again" : "Tap to speak"}
                className="group relative grid h-28 w-28 place-items-center rounded-full bg-blue text-white shadow-[0_10px_30px_-10px_rgba(56,103,255,0.7)] transition-transform duration-150 hover:bg-blue-press active:scale-95 disabled:bg-ink/15 disabled:shadow-none"
              >
                {!micError && <span className="absolute inset-0 rounded-full border-2 border-blue/40 animate-ping-out" aria-hidden />}
                <MicIcon />
              </button>
              <p className="mt-4 font-semibold">
                {cap.status === "requesting" ? "Allow microphone access…" : micError ? (cap.error === "denied" || cap.error === "failed" ? "Try again" : "Voice isn't available") : "Tap to speak"}
              </p>
              <button
                onClick={() => {
                  cap.clearError();
                  setTrouble("");
                  setStep("typing");
                }}
                className="mt-5 text-sm text-ink/55 underline decoration-ink/20 underline-offset-4 hover:text-ink"
              >
                Prefer to type?
              </button>
            </div>
          )}

          {step === "recording" && (
            <div className="flex flex-col items-center">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium text-lime">
                <span className="h-2 w-2 rounded-full bg-lime animate-breathe" aria-hidden />
                Listening
              </div>
              <div className="tabular font-display text-5xl font-medium tracking-tight" aria-label={`Elapsed ${formatClock(elapsed)}`}>
                {formatClock(elapsed)}
              </div>
              <div className="my-6 w-full">
                <Waveform analyserRef={cap.analyserRef} levelTarget={levelRef} height={72} />
              </div>
              <button
                ref={primaryRef}
                onClick={() => void finish()}
                disabled={!canFinish}
                aria-label={canFinish ? "Done, send my answer" : `Done is available in ${Math.ceil((MIN_MS - elapsed) / 1000)} seconds`}
                className="relative grid h-24 w-24 place-items-center rounded-full bg-white text-ink transition duration-150 active:scale-95 disabled:bg-white/10 disabled:text-white/50"
              >
                <span
                  className="absolute inset-0 rounded-full border-2 border-lime"
                  style={{ transform: "scale(calc(1 + var(--level) * 0.45))", opacity: "calc(0.25 + var(--level))", transition: "transform 80ms linear" }}
                  aria-hidden
                />
                {canFinish ? (
                  <span className="font-semibold">Done</span>
                ) : (
                  <span className="tabular text-lg font-semibold">{Math.ceil((MIN_MS - elapsed) / 1000)}</span>
                )}
              </button>
              <p className="mt-4 text-sm font-medium text-white/60">{canFinish ? "Tap when you're finished" : "Keep going, Done appears at 0:30"}</p>
            </div>
          )}

          {step === "sent" && (
            <div className="flex flex-col items-center pb-14">
              <span className="grid h-28 w-28 place-items-center rounded-full bg-lime text-ink animate-rise">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M5 12.5 10 17.5 19 7" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <p className="mt-6 font-semibold text-white/85">Got it</p>
            </div>
          )}

          {step === "typing" && (
            <form
              className="animate-rise"
              onSubmit={(e) => {
                e.preventDefault();
                submitTyped();
              }}
            >
              <label htmlFor="typed-answer" className="text-sm font-medium text-ink/55">
                Your response
              </label>
              <textarea
                id="typed-answer"
                ref={textRef}
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                rows={6}
                maxLength={6000}
                placeholder="Write as much or as little as you like"
                className="mt-3 w-full resize-none rounded-3xl bg-white p-5 text-lg leading-relaxed outline-none placeholder:text-ink/35 focus:ring-2 focus:ring-blue"
              />
              <button
                type="submit"
                disabled={!typed.trim()}
                className="mt-4 h-16 w-full rounded-full bg-blue text-lg font-semibold text-white transition hover:bg-blue-press active:scale-[0.98] disabled:bg-ink/15"
              >
                Send
              </button>
              <button type="button" onClick={() => setStep("idle")} className="mt-3 h-14 w-full rounded-full font-semibold text-ink/70 hover:bg-ink/5">
                Speak instead
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export function formatTarget(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s ? `${m}:${String(s).padStart(2, "0")}` : `${m} min`;
}
