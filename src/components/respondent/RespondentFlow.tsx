"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, formatClock } from "@/lib/client";
import { SonarMark } from "../SonarMark";
import { Waveform } from "../Waveform";
import { useRecorder, type RecorderError } from "../useRecorder";

interface PublicSession {
  slug: string;
  title: string;
  description: string;
  status: string;
  questions: { id: string; text: string }[];
}

type Phase = "loading" | "unavailable" | "intro" | "asking" | "finishing" | "done";
type Step = "idle" | "recording" | "processing" | "review" | "typing";

const STAGES = ["Listening", "Transcribing", "Finding signals"];

const MIC_ERRORS: Record<RecorderError, { title: string; body: string }> = {
  denied: {
    title: "We couldn't access your microphone.",
    body: "Allow microphone access for this site (look for the mic or lock icon next to the address bar), then try again.",
  },
  "no-mic": {
    title: "We couldn't find a microphone.",
    body: "Plug one in or switch devices, then try again. You can also type your answer.",
  },
  insecure: {
    title: "Voice needs a secure connection.",
    body: "Open this link over https to speak your answer, or type it instead.",
  },
  unsupported: {
    title: "This browser can't record audio.",
    body: "Try Safari or Chrome, or type your answer instead.",
  },
  failed: {
    title: "We couldn't start recording.",
    body: "Something on this device blocked the microphone. Try again, or type your answer.",
  },
};

export function RespondentFlow({ slug, preview = false }: { slug: string; preview?: boolean }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [session, setSession] = useState<PublicSession | null>(null);
  const [unavailable, setUnavailable] = useState("");
  const [index, setIndex] = useState(0);
  const [step, setStep] = useState<Step>("idle");
  const [stage, setStage] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [typed, setTyped] = useState("");
  const [lastDuration, setLastDuration] = useState(0);
  const [processError, setProcessError] = useState("");
  const [saveTrouble, setSaveTrouble] = useState(false);
  const [starting, setStarting] = useState(false);

  const respondentRef = useRef<string | null>(null);
  const pendingRef = useRef<Promise<boolean>[]>([]);
  const levelRef = useRef<HTMLDivElement | null>(null);
  const primaryRef = useRef<HTMLButtonElement | null>(null);
  const textRef = useRef<HTMLTextAreaElement | null>(null);
  const rec = useRecorder();

  useEffect(() => {
    let alive = true;
    api<{ session: PublicSession }>(`/api/public/${encodeURIComponent(slug)}${preview ? "?preview=1" : ""}`)
      .then(({ session }) => {
        if (!alive) return;
        setSession(session);
        setPhase("intro");
      })
      .catch((err: Error) => {
        if (!alive) return;
        setUnavailable(err.message);
        setPhase("unavailable");
      });
    return () => {
      alive = false;
    };
  }, [slug, preview]);

  // Keyboard users get focus moved to the main control whenever the screen changes.
  // Touch and mouse users don't, so no focus ring appears out of nowhere.
  const keyboardRef = useRef(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Tab" || e.key === "Enter" || e.key === " ") keyboardRef.current = true;
    };
    const onPointer = () => (keyboardRef.current = false);
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer);
    };
  }, []);
  useEffect(() => {
    if (step === "typing") textRef.current?.focus();
    else if (keyboardRef.current) primaryRef.current?.focus({ preventScroll: true });
  }, [phase, step, index]);

  const question = session?.questions[index];
  const total = session?.questions.length ?? 0;
  const dark = step === "recording" || step === "processing";

  const begin = async () => {
    if (!session) return;
    setStarting(true);
    if (!preview) {
      try {
        const { respondentId } = await api<{ respondentId: string }>(`/api/public/${slug}/start`, { method: "POST" });
        respondentRef.current = respondentId;
      } catch (err) {
        setUnavailable((err as Error).message);
        setPhase("unavailable");
        setStarting(false);
        return;
      }
    }
    setStarting(false);
    setIndex(0);
    setStep("idle");
    setPhase("asking");
  };

  const startRecording = async () => {
    setProcessError("");
    rec.clearError();
    const ok = await rec.start();
    if (ok) setStep("recording");
  };

  const finishRecording = async () => {
    if (!question) return;
    setStage(0);
    setStep("processing");
    const recording = await rec.stop();
    if (!recording) {
      setProcessError("We didn't catch anything. Try recording again.");
      setStep("idle");
      return;
    }
    setLastDuration(recording.durationMs);
    const t1 = window.setTimeout(() => setStage(1), 450);
    try {
      const form = new FormData();
      const ext = recording.mimeType.includes("mp4") ? "m4a" : recording.mimeType.includes("ogg") ? "ogg" : "webm";
      form.append("audio", recording.blob, `answer.${ext}`);
      form.append("slug", slug);
      form.append("questionId", question.id);
      form.append("durationMs", String(recording.durationMs));
      const { transcript } = await api<{ transcript: string }>("/api/transcribe", { method: "POST", body: form });
      window.clearTimeout(t1);
      setStage(2);
      await new Promise((r) => setTimeout(r, 550));
      setTranscript(transcript);
      setStep("review");
    } catch (err) {
      window.clearTimeout(t1);
      setProcessError((err as Error).message || "We couldn't process that response. Try recording again.");
      setStep("idle");
    }
  };

  const save = useCallback(
    (text: string, inputMode: "voice" | "text", durationMs: number) => {
      if (preview || !question || !respondentRef.current) return;
      const body = { respondentId: respondentRef.current, questionId: question.id, transcript: text, inputMode, durationMs };
      const attempt = () => api("/api/answers", { method: "POST", json: body }).then(() => true);
      pendingRef.current.push(attempt().catch(() => attempt().catch(() => false)));
    },
    [preview, question],
  );

  const advance = async () => {
    setTranscript("");
    setTyped("");
    setProcessError("");
    if (index + 1 < total) {
      setIndex(index + 1);
      setStep("idle");
      return;
    }
    setPhase("finishing");
    const results = await Promise.all(pendingRef.current);
    pendingRef.current = [];
    if (results.some((ok) => !ok)) setSaveTrouble(true);
    if (!preview && respondentRef.current) {
      await api(`/api/public/${slug}/complete`, { method: "POST", json: { respondentId: respondentRef.current } }).catch(() => {});
    }
    setPhase("done");
  };

  const acceptResponse = () => {
    save(transcript, "voice", lastDuration);
    void advance();
  };

  const submitTyped = () => {
    const text = typed.trim();
    if (!text) return;
    save(text, "text", 0);
    void advance();
  };

  const restart = () => {
    respondentRef.current = null;
    setSaveTrouble(false);
    setPhase("intro");
  };

  // ---------------------------------------------------------------- render

  if (phase === "loading") {
    return (
      <Shell>
        <div className="flex flex-1 items-center justify-center" aria-busy="true" aria-label="Loading">
          <SonarMark size={40} className="animate-breathe" />
        </div>
      </Shell>
    );
  }

  if (phase === "unavailable" || !session) {
    return (
      <Shell>
        <div className="flex flex-1 flex-col justify-center gap-4 pb-24">
          <SonarMark size={32} />
          <h1 className="font-display text-3xl font-semibold tracking-tight">{unavailable || "This Sonar isn't available."}</h1>
          <p className="text-ink/60">Check the link with whoever sent it to you.</p>
        </div>
      </Shell>
    );
  }

  if (phase === "intro") {
    const minutes = Math.max(1, Math.round((total * 40) / 60));
    return (
      <Shell preview={preview}>
        <div className="flex flex-1 flex-col pb-10 pt-6">
          <div className="flex items-center gap-2 text-sm text-ink/60">
            <SonarMark size={22} />
            <span>{session.title}</span>
          </div>
          <div className="mt-auto animate-rise">
            <h1 className="font-display text-[2.6rem] font-semibold leading-[1.02] tracking-[-0.035em] text-balance sm:text-5xl">
              {session.description || "Tell us what you really thought."}
            </h1>
            <p className="mt-5 text-lg text-ink/65">
              About {minutes} {minutes === 1 ? "minute" : "minutes"}. {total} {total === 1 ? "question" : "questions"}. Just talk, no typing.
            </p>
          </div>
          <button
            ref={primaryRef}
            onClick={begin}
            disabled={starting}
            className="mt-10 h-16 w-full rounded-full bg-ink text-lg font-semibold text-white transition active:scale-[0.98] disabled:opacity-60"
          >
            {starting ? "Starting…" : "Start"}
          </button>
          <p className="mt-4 text-center text-sm text-ink/50">Anonymous. Your voice is turned into text and never stored.</p>
        </div>
      </Shell>
    );
  }

  if (phase === "finishing" || phase === "done") {
    return (
      <Shell preview={preview}>
        <div className="flex flex-1 flex-col items-start justify-center pb-24">
          <div className="relative mb-10 grid h-20 w-20 place-items-center">
            {phase === "done" && (
              <>
                <span className="absolute inset-0 rounded-full border-2 border-cyan animate-[ping-out_1.8s_var(--ease-signal)_2]" />
                <span className="absolute inset-0 rounded-full border-2 border-cyan animate-[ping-out_1.8s_var(--ease-signal)_0.5s_2]" />
              </>
            )}
            <SonarMark size={56} className={phase === "finishing" ? "animate-breathe" : ""} />
          </div>
          {phase === "finishing" ? (
            <p className="font-display text-2xl text-ink/60" role="status">
              Sending your answers…
            </p>
          ) : (
            <div className="animate-rise" role="status">
              <h1 className="font-display text-5xl font-semibold tracking-[-0.035em]">That&rsquo;s a wrap.</h1>
              <p className="mt-4 text-lg text-ink/70">Thanks for helping make this better. Your feedback has been heard.</p>
              {saveTrouble && (
                <p className="mt-6 rounded-2xl bg-cloud p-4 text-sm text-ink/70">
                  One of your answers didn&rsquo;t reach us. If you have a moment, you can go through it again.
                </p>
              )}
              {preview && (
                <button onClick={restart} className="mt-10 h-12 rounded-full border border-ink/15 px-6 font-semibold">
                  Run the preview again
                </button>
              )}
            </div>
          )}
        </div>
      </Shell>
    );
  }

  // phase === "asking"
  const micError = rec.error ? MIC_ERRORS[rec.error] : null;

  return (
    <div
      ref={levelRef}
      className={`min-h-[100dvh] transition-colors duration-300 ${dark ? "on-dark bg-ink text-white" : "bg-cloud text-ink"}`}
      style={{ ["--level" as string]: 0 }}
    >
      <div className="mx-auto flex min-h-[100dvh] max-w-md flex-col px-6 pb-[max(env(safe-area-inset-bottom),1.5rem)] pt-5">
        {preview && <PreviewBadge dark={dark} />}
        {/* Progress */}
        <div className="flex items-center gap-3">
          <SonarMark size={22} tone={dark ? "dark" : "light"} />
          <div className="flex flex-1 gap-1.5" aria-hidden>
            {session.questions.map((q, i) => (
              <span
                key={q.id}
                className={`h-1 flex-1 rounded-full transition-colors duration-500 ${
                  i < index ? (dark ? "bg-white" : "bg-ink") : i === index ? (dark ? "bg-lime" : "bg-blue") : dark ? "bg-white/15" : "bg-ink/10"
                }`}
              />
            ))}
          </div>
          <span className={`tabular text-sm ${dark ? "text-white/60" : "text-ink/55"}`}>
            {index + 1} of {total}
          </span>
        </div>

        {/* Question */}
        <div key={question?.id} className="mt-12 animate-rise">
          <h1
            className={`font-display font-semibold tracking-[-0.03em] text-balance transition-all duration-300 ${
              dark ? "text-[1.6rem] leading-tight text-white/75" : "text-[2.15rem] leading-[1.08]"
            }`}
          >
            {question?.text}
          </h1>
          {step === "idle" && !micError && !processError && (
            <p className="mt-4 text-lg text-ink/55">{index === total - 1 && total > 1 ? "Last one. Take a moment, then tell us." : "Take a moment, then tell us."}</p>
          )}
        </div>

        <div className="sr-only" aria-live="polite">
          {step === "recording" ? "Recording. Press the button again to finish." : step === "processing" ? STAGES[stage] : step === "review" ? "Your response is ready to review." : ""}
        </div>

        {/* Stage */}
        <div className="flex flex-1 flex-col justify-end pt-8">
          {step === "idle" && (
            <div className="flex flex-col items-center">
              {(micError || processError) && (
                <div className="mb-8 w-full rounded-3xl bg-white p-5 shadow-[0_1px_0_rgba(17,19,21,0.06)]" role="alert">
                  <p className="font-semibold">{micError?.title ?? processError}</p>
                  {micError && <p className="mt-1.5 text-[0.95rem] leading-relaxed text-ink/65">{micError.body}</p>}
                </div>
              )}
              <button
                ref={primaryRef}
                onClick={startRecording}
                disabled={rec.status === "requesting" || !!(micError && rec.error !== "denied" && rec.error !== "failed")}
                aria-label={micError ? "Try the microphone again" : "Tap to speak"}
                className="group relative grid h-28 w-28 place-items-center rounded-full bg-blue text-white shadow-[0_10px_30px_-10px_rgba(56,103,255,0.7)] transition-transform duration-150 hover:bg-blue-press active:scale-95 disabled:bg-ink/15 disabled:shadow-none"
              >
                {!micError && <span className="absolute inset-0 rounded-full border-2 border-blue/40 animate-ping-out" aria-hidden />}
                <MicIcon />
              </button>
              <p className="mt-4 font-semibold">
                {rec.status === "requesting" ? "Allow microphone access…" : micError ? (rec.error === "denied" || rec.error === "failed" ? "Try again" : "Voice isn't available") : "Tap to speak"}
              </p>
              <button
                onClick={() => {
                  rec.clearError();
                  setProcessError("");
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
                Recording
              </div>
              <div className="tabular font-display text-6xl font-medium tracking-tight" aria-label={`Elapsed ${formatClock(rec.elapsed)}`}>
                {formatClock(rec.elapsed)}
              </div>
              <div className="my-8 w-full">
                <Waveform analyserRef={rec.analyserRef} levelTarget={levelRef} />
              </div>
              <button
                ref={primaryRef}
                onClick={finishRecording}
                aria-label="Finish recording"
                className="relative grid h-28 w-28 place-items-center rounded-full bg-white text-ink transition-transform duration-150 active:scale-95"
              >
                <span
                  className="absolute inset-0 rounded-full border-2 border-lime"
                  style={{ transform: "scale(calc(1 + var(--level) * 0.45))", opacity: "calc(0.25 + var(--level))", transition: "transform 80ms linear" }}
                  aria-hidden
                />
                <span className="h-8 w-8 rounded-lg bg-ink" />
              </button>
              <p className="mt-4 font-semibold text-white/80">Tap to finish</p>
              <button onClick={() => { rec.cancel(); setStep("idle"); }} className="mt-5 text-sm text-white/45 hover:text-white/80">
                Cancel
              </button>
            </div>
          )}

          {step === "processing" && (
            <div className="flex flex-col items-center pb-14">
              <div className="relative grid h-28 w-28 place-items-center">
                {[0, 0.6, 1.2].map((d) => (
                  <span
                    key={d}
                    className="absolute inset-0 rounded-full border-2 border-cyan"
                    style={{ animation: `ping-soft 1.8s var(--ease-signal) ${d}s infinite` }}
                    aria-hidden
                  />
                ))}
                <SonarMark size={44} tone="dark" />
              </div>
              <ol className="mt-16 flex items-center gap-3 text-sm">
                {STAGES.map((s, i) => (
                  <li key={s} className={`flex items-center gap-3 transition-colors duration-300 ${i === stage ? "text-white" : i < stage ? "text-white/45" : "text-white/20"}`}>
                    {i > 0 && <span className="h-px w-4 bg-current opacity-50" aria-hidden />}
                    {s}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {step === "review" && (
            <div className="animate-rise">
              <p className="text-sm font-medium text-ink/55">Your response</p>
              <blockquote className="mt-3 max-h-[38vh] overflow-y-auto rounded-3xl bg-white p-6 font-display text-xl leading-snug tracking-[-0.01em]">
                &ldquo;{transcript}&rdquo;
              </blockquote>
              <button
                ref={primaryRef}
                onClick={acceptResponse}
                className="mt-6 h-16 w-full rounded-full bg-blue text-lg font-semibold text-white transition hover:bg-blue-press active:scale-[0.98]"
              >
                {index + 1 < total ? "Use response" : "Use response and finish"}
              </button>
              <button onClick={startRecording} className="mt-3 h-14 w-full rounded-full font-semibold text-ink/70 hover:bg-ink/5">
                Record again
              </button>
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
                rows={5}
                maxLength={6000}
                placeholder="Write as much or as little as you like"
                className="mt-3 w-full resize-none rounded-3xl bg-white p-5 text-lg leading-relaxed outline-none placeholder:text-ink/35 focus:ring-2 focus:ring-blue"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submitTyped();
                }}
              />
              <button
                type="submit"
                disabled={!typed.trim()}
                className="mt-4 h-16 w-full rounded-full bg-blue text-lg font-semibold text-white transition hover:bg-blue-press active:scale-[0.98] disabled:bg-ink/15"
              >
                {index + 1 < total ? "Use response" : "Use response and finish"}
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

function Shell({ children, preview = false }: { children: React.ReactNode; preview?: boolean }) {
  return (
    <div className="min-h-[100dvh] bg-cloud">
      <div className="mx-auto flex min-h-[100dvh] max-w-md flex-col px-6 pb-[max(env(safe-area-inset-bottom),1.5rem)] pt-5">
        {preview && <PreviewBadge />}
        {children}
      </div>
    </div>
  );
}

function PreviewBadge({ dark = false }: { dark?: boolean }) {
  return (
    <p className={`mb-4 self-start rounded-full px-3 py-1 text-xs font-medium ${dark ? "bg-white/10 text-white/70" : "bg-ink/[0.06] text-ink/60"}`}>
      Preview. Answers aren&rsquo;t saved.
    </p>
  );
}

function MicIcon() {
  return (
    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="8.5" y="2.5" width="7" height="12" rx="3.5" fill="currentColor" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
