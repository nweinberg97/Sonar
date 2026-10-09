"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, displayUrl, shareUrl } from "@/lib/client";
import type { SessionDetail, SessionFormat, SessionStatus } from "@/lib/types";
import { btn, CopyButton, ErrorNote, Loading, SessionTabs, StatusChip } from "./ui";

interface Draft {
  key: string;
  id?: string;
  text: string;
}

let keySeq = 0;
const nextKey = () => `q${++keySeq}`;

export function Builder() {
  const { id } = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const isNew = search?.get("new") === "1";

  const [session, setSession] = useState<SessionDetail | null>(null);
  const [loadError, setLoadError] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [questions, setQuestions] = useState<Draft[]>([]);
  const [format, setFormat] = useState<SessionFormat>("questions");
  const [goal, setGoal] = useState("");
  const [targetSeconds, setTargetSeconds] = useState(60);
  const [save, setSave] = useState<"idle" | "pending" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState("");
  const [previewKey, setPreviewKey] = useState(0);
  const [publishing, setPublishing] = useState(false);

  const dirty = useRef(false);
  const version = useRef(0);
  const timer = useRef<number | null>(null);
  const focusKey = useRef<string | null>(null);
  const titleRef = useRef<HTMLInputElement | null>(null);

  const hydrate = useCallback((s: SessionDetail) => {
    setSession(s);
    setTitle(s.title);
    setDescription(s.description);
    setQuestions(s.questions.map((q) => ({ key: nextKey(), id: q.id, text: q.text })));
    setFormat(s.format ?? "questions");
    setGoal(s.goal ?? "");
    setTargetSeconds(s.targetSeconds ?? 60);
  }, []);

  useEffect(() => {
    api<{ session: SessionDetail }>(`/api/sessions/${id}`)
      .then(({ session }) => hydrate(session))
      .catch((e: Error) => setLoadError(e.message));
  }, [id, hydrate]);

  useEffect(() => {
    if (isNew && session) titleRef.current?.select();
  }, [isNew, session]);

  const persist = useCallback(async () => {
    const nonEmpty = questions.filter((q) => q.text.trim());
    // A conversation has one main question: the first one.
    const filled = format === "conversation" ? nonEmpty.slice(0, 1) : nonEmpty;
    if (!title.trim() || filled.length === 0) {
      setSave("error");
      setSaveError(!title.trim() ? "Give your Sonar a title." : "Add at least one question.");
      return;
    }
    setSave("saving");
    const savingVersion = version.current;
    try {
      const { session: s } = await api<{ session: SessionDetail }>(`/api/sessions/${id}`, {
        method: "PATCH",
        json: { title, description, format, goal, targetSeconds, questions: filled.map((q) => ({ id: q.id, text: q.text })) },
      });
      // Only clear the dirty flag if nothing changed while this save was in flight.
      if (version.current === savingVersion) dirty.current = false;
      setSession(s);
      // Attach server ids to newly added questions, keeping local keys stable.
      setQuestions((prev) => {
        let i = 0;
        const kept = format === "conversation" ? prev.filter((q) => q.text.trim()).slice(0, 1) : prev;
        return kept.map((q) => (q.text.trim() ? { ...q, id: s.questions[i++]?.id ?? q.id } : q));
      });
      setSave(dirty.current ? "pending" : "saved");
      setSaveError("");
      setPreviewKey((k) => k + 1);
    } catch (e) {
      setSave("error");
      setSaveError((e as Error).message);
    }
  }, [id, title, description, questions, format, goal, targetSeconds]);

  // Autosave shortly after the last edit.
  useEffect(() => {
    if (!dirty.current) return;
    setSave("pending");
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void persist(), 700);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [title, description, questions, format, goal, targetSeconds, persist]);

  useEffect(() => {
    if (!focusKey.current) return;
    const el = document.getElementById(`question-${focusKey.current}`) as HTMLTextAreaElement | null;
    el?.focus();
    focusKey.current = null;
  }, [questions]);

  const edit = (fn: () => void) => {
    dirty.current = true;
    version.current += 1;
    fn();
  };

  const setStatus = async (status: SessionStatus) => {
    setPublishing(true);
    try {
      if (dirty.current) await persist();
      const { session: s } = await api<{ session: SessionDetail }>(`/api/sessions/${id}`, { method: "PATCH", json: { status } });
      setSession(s);
      setPreviewKey((k) => k + 1);
    } catch (e) {
      setSave("error");
      setSaveError((e as Error).message);
    } finally {
      setPublishing(false);
    }
  };

  const remove = async () => {
    if (!session) return;
    const msg = session.responseCount
      ? `Delete "${session.title}" and its ${session.responseCount} responses? This can't be undone.`
      : `Delete "${session.title}"?`;
    if (!window.confirm(msg)) return;
    await api(`/api/sessions/${id}`, { method: "DELETE" });
    router.push("/feedback");
  };

  if (loadError) return <ErrorNote message={loadError} />;
  if (!session) return <Loading />;

  const url = shareUrl(session.slug);
  const live = session.status === "published";

  return (
    <>
      <div className="mb-6 flex items-center justify-between gap-4">
        <Link href="/feedback" className="text-sm text-ink/50 hover:text-ink">
          Feedback
        </Link>
        <SaveState state={save} />
      </div>

      <div className="mb-6 flex items-start gap-3">
        <input
          ref={titleRef}
          value={title}
          onChange={(e) => edit(() => setTitle(e.target.value))}
          maxLength={120}
          aria-label="Title"
          className="min-w-0 flex-1 rounded-lg bg-transparent font-display text-[2.1rem] font-semibold leading-tight tracking-[-0.035em] outline-none placeholder:text-ink/25 hover:bg-cloud/60 focus:bg-cloud/60"
          placeholder="Untitled Sonar"
        />
        <div className="pt-3">
          <StatusChip status={session.status} />
        </div>
      </div>

      <SessionTabs id={session.id} active="build" />

      {save === "error" && saveError && (
        <div className="mb-6">
          <ErrorNote message={saveError} />
        </div>
      )}

      <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section aria-label="Questions">
          <label className="block">
            <span className="text-sm font-medium text-ink/55">Opening line</span>
            <input
              value={description}
              onChange={(e) => edit(() => setDescription(e.target.value))}
              maxLength={280}
              placeholder="Tell us what you really thought."
              className="mt-2 w-full rounded-xl border border-ink/10 bg-white px-4 py-3 text-lg outline-none placeholder:text-ink/30 focus:border-blue"
            />
            <span className="mt-1.5 block text-sm text-ink/45">The first thing people see. Keep it short and human.</span>
          </label>

          <FormatPicker
            value={format}
            locked={session.respondentCount > 0}
            onChange={(f) => edit(() => setFormat(f))}
          />

          {format === "conversation" ? (
            <ConversationFields
              question={questions[0]?.text ?? ""}
              extraQuestions={questions.filter((q) => q.text.trim()).length - 1}
              goal={goal}
              targetSeconds={targetSeconds}
              onQuestion={(text) =>
                edit(() =>
                  setQuestions((qs) => (qs.length ? qs.map((x, i) => (i === 0 ? { ...x, text } : x)) : [{ key: nextKey(), text }])),
                )
              }
              onGoal={(v) => edit(() => setGoal(v))}
              onTarget={(v) => edit(() => setTargetSeconds(v))}
            />
          ) : (
          <>
          <ol className="mt-10 space-y-3">
            {questions.map((q, i) => (
              <li key={q.key} className="group flex gap-4 rounded-2xl border border-ink/10 p-4 focus-within:border-blue">
                <span className="tabular mt-1 w-6 shrink-0 font-display text-lg font-semibold text-ink/35">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <label htmlFor={`question-${q.key}`} className="sr-only">
                    Question {i + 1}
                  </label>
                  <AutoTextarea
                    id={`question-${q.key}`}
                    value={q.text}
                    placeholder="Ask something people can answer out loud"
                    onChange={(text) => edit(() => setQuestions((qs) => qs.map((x) => (x.key === q.key ? { ...x, text } : x))))}
                  />
                </div>
                <div className="flex shrink-0 items-start gap-0.5 opacity-60 transition group-focus-within:opacity-100 group-hover:opacity-100">
                  <IconButton
                    label={`Move question ${i + 1} up`}
                    disabled={i === 0}
                    onClick={() => edit(() => setQuestions((qs) => swap(qs, i, i - 1)))}
                    d="M7 11V3M3.5 6.5 7 3l3.5 3.5"
                  />
                  <IconButton
                    label={`Move question ${i + 1} down`}
                    disabled={i === questions.length - 1}
                    onClick={() => edit(() => setQuestions((qs) => swap(qs, i, i + 1)))}
                    d="M7 3v8M3.5 7.5 7 11l3.5-3.5"
                  />
                  <IconButton
                    label={`Remove question ${i + 1}`}
                    disabled={questions.length === 1}
                    onClick={() => edit(() => setQuestions((qs) => qs.filter((x) => x.key !== q.key)))}
                    d="M3.5 3.5l7 7M10.5 3.5l-7 7"
                  />
                </div>
              </li>
            ))}
          </ol>

          {questions.length < 10 && (
            <button
              onClick={() => {
                const key = nextKey();
                focusKey.current = key;
                edit(() => setQuestions((qs) => [...qs, { key, text: "" }]));
              }}
              className="mt-3 flex w-full items-center gap-3 rounded-2xl border border-dashed border-ink/15 px-4 py-4 text-left font-medium text-ink/55 transition hover:border-ink/35 hover:text-ink"
            >
              <span className="grid h-6 w-6 place-items-center rounded-full bg-ink/[0.06] text-lg leading-none" aria-hidden>
                +
              </span>
              Add question
            </button>
          )}
          <p className="mt-4 text-sm text-ink/45">
            Three open questions is the sweet spot. People answer each one in about 30 seconds.
          </p>
          </>
          )}

          <div className="mt-16 border-t border-ink/8 pt-6">
            <button onClick={remove} className="text-sm text-ink/45 hover:text-ink">
              Delete this Sonar
            </button>
          </div>
        </section>

        <aside className="space-y-6 lg:sticky lg:top-10 lg:self-start">
          <div className="rounded-[28px] bg-ink p-5 text-white on-dark">
            {live ? (
              <>
                <p className="font-display text-xl font-semibold tracking-tight">Your Sonar is ready.</p>
                <p className="mt-3 break-all rounded-xl bg-white/10 px-3 py-2.5 text-sm text-white/85">{displayUrl(session.slug)}</p>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <CopyButton text={url} className="h-10 rounded-full bg-lime text-sm font-semibold text-ink transition hover:brightness-95" />
                  <a href={url} target="_blank" rel="noreferrer" className="grid h-10 place-items-center rounded-full bg-white/10 text-sm font-semibold hover:bg-white/15">
                    Open Sonar
                  </a>
                </div>
                <p className="mt-4 text-sm text-white/55">Answer it yourself first, the way your respondents will.</p>
                <button onClick={() => setStatus("closed")} disabled={publishing} className="mt-4 text-sm text-white/45 hover:text-white">
                  Stop collecting responses
                </button>
              </>
            ) : (
              <>
                <p className="font-display text-xl font-semibold tracking-tight">
                  {session.status === "closed" ? "This Sonar is closed." : "Ready when you are."}
                </p>
                <p className="mt-2 text-sm text-white/60">
                  {session.status === "closed"
                    ? "The link shows a closed message. Reopen it to collect more."
                    : "Publishing gives you a link anyone can answer. No sign-up needed."}
                </p>
                <button
                  onClick={() => setStatus("published")}
                  disabled={publishing || save === "saving"}
                  className="mt-5 h-11 w-full rounded-full bg-blue font-semibold text-white transition hover:bg-blue-press disabled:opacity-60"
                >
                  {publishing ? "Publishing…" : session.status === "closed" ? "Reopen Sonar" : "Publish Sonar"}
                </button>
              </>
            )}
          </div>

          <div>
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-medium text-ink/55">Preview</p>
              <a href={`${url}?preview=1`} target="_blank" rel="noreferrer" className="text-sm text-ink/50 hover:text-ink">
                Full screen
              </a>
            </div>
            <div className="mx-auto w-[260px] rounded-[38px] bg-ink p-2.5 shadow-[0_24px_60px_-28px_rgba(17,19,21,0.6)]">
              <div className="h-[520px] overflow-hidden rounded-[30px] bg-cloud">
                <iframe
                  key={previewKey}
                  title="Respondent preview"
                  src={`/s/${session.slug}?preview=1`}
                  allow="microphone"
                  className="origin-top-left border-0"
                  style={{ width: 390, height: 780, transform: "scale(0.6667)" }}
                />
              </div>
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}

function swap<T>(arr: T[], a: number, b: number): T[] {
  const next = [...arr];
  [next[a], next[b]] = [next[b], next[a]];
  return next;
}

function SaveState({ state }: { state: "idle" | "pending" | "saving" | "saved" | "error" }) {
  const text = { idle: "", pending: "Editing", saving: "Saving…", saved: "Saved", error: "Not saved" }[state];
  return (
    <span className="text-sm text-ink/45" role="status" aria-live="polite">
      {text}
    </span>
  );
}

function IconButton({ label, d, onClick, disabled }: { label: string; d: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="grid h-8 w-8 place-items-center rounded-full text-ink/55 transition hover:bg-ink/5 hover:text-ink disabled:opacity-25 disabled:hover:bg-transparent"
    >
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
        <path d={d} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

function AutoTextarea({
  id,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      id={id}
      ref={ref}
      rows={1}
      value={value}
      maxLength={280}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value.replace(/\n/g, " "))}
      className="block w-full resize-none bg-transparent text-lg leading-snug outline-none placeholder:text-ink/30"
    />
  );
}

const TARGETS = [30, 45, 60, 90, 120, 180, 300];

function FormatPicker({ value, locked, onChange }: { value: SessionFormat; locked: boolean; onChange: (f: SessionFormat) => void }) {
  const options: { id: SessionFormat; label: string; hint: string }[] = [
    { id: "questions", label: "Questions", hint: "A short list. One recording each." },
    { id: "conversation", label: "Conversation", hint: "One question. Sonar asks follow-ups when people pause." },
  ];
  return (
    <fieldset className="mt-10">
      <legend className="text-sm font-medium text-ink/55">Format</legend>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {options.map((o) => (
          <label
            key={o.id}
            className={`flex cursor-pointer gap-3 rounded-2xl border px-4 py-3 transition ${
              value === o.id ? "border-blue bg-blue/[0.04]" : "border-ink/10 hover:border-ink/30"
            } ${locked && value !== o.id ? "cursor-not-allowed opacity-50" : ""}`}
          >
            <input
              type="radio"
              name="format"
              value={o.id}
              checked={value === o.id}
              disabled={locked && value !== o.id}
              onChange={() => onChange(o.id)}
              className="mt-1.5 accent-[var(--color-blue,#3867ff)]"
            />
            <span>
              <span className="block font-semibold">{o.label}</span>
              <span className="block text-sm text-ink/55">{o.hint}</span>
            </span>
          </label>
        ))}
      </div>
      {locked && <p className="mt-2 text-sm text-ink/45">People have already answered, so the format is fixed. Create a new Sonar to try the other one.</p>}
    </fieldset>
  );
}

function ConversationFields({
  question,
  extraQuestions,
  goal,
  targetSeconds,
  onQuestion,
  onGoal,
  onTarget,
}: {
  question: string;
  extraQuestions: number;
  goal: string;
  targetSeconds: number;
  onQuestion: (v: string) => void;
  onGoal: (v: string) => void;
  onTarget: (v: number) => void;
}) {
  return (
    <div className="mt-8 space-y-8">
      <div>
        <label htmlFor="main-question" className="text-sm font-medium text-ink/55">
          Main question
        </label>
        <div className="mt-2 rounded-2xl border border-ink/10 p-4 focus-within:border-blue">
          <AutoTextarea id="main-question" value={question} placeholder="One open question people can talk about" onChange={onQuestion} />
        </div>
        {extraQuestions > 0 && (
          <p className="mt-1.5 text-sm text-ink/45">
            A conversation uses one question. Your other {extraQuestions === 1 ? "question is" : `${extraQuestions} questions are`} removed when this saves.
          </p>
        )}
      </div>
      <label className="block">
        <span className="text-sm font-medium text-ink/55">What do you want to learn?</span>
        <textarea
          value={goal}
          onChange={(e) => onGoal(e.target.value)}
          maxLength={400}
          rows={3}
          placeholder="e.g. Where new users get stuck in their first week, and what would have helped."
          className="mt-2 w-full resize-none rounded-xl border border-ink/10 bg-white px-4 py-3 text-lg leading-snug outline-none placeholder:text-ink/30 focus:border-blue"
        />
        <span className="mt-1.5 block text-sm text-ink/45">Sonar uses this to choose follow-ups. Respondents never see it.</span>
      </label>
      <label className="block">
        <span className="text-sm font-medium text-ink/55">How long should people talk?</span>
        <select
          value={targetSeconds}
          onChange={(e) => onTarget(Number(e.target.value))}
          className="mt-2 block rounded-xl border border-ink/10 bg-white px-4 py-3 text-lg outline-none focus:border-blue"
        >
          {TARGETS.map((t) => (
            <option key={t} value={t}>
              {t < 60 ? `${t} seconds` : t % 60 ? `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")} minutes` : `${t / 60} ${t === 60 ? "minute" : "minutes"}`}
            </option>
          ))}
        </select>
        <span className="mt-1.5 block text-sm text-ink/45">
          Follow-ups keep people going until then. Done appears after 30 seconds, and recording stops at 5 minutes.
        </span>
      </label>
    </div>
  );
}
