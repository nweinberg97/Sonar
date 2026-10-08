"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, copyText } from "@/lib/client";
import type { SentimentLabel, SessionStatus, SessionSummary } from "@/lib/types";

export const btn = {
  primary:
    "inline-flex h-10 items-center justify-center gap-2 rounded-full bg-blue px-5 text-[0.95rem] font-semibold text-white transition hover:bg-blue-press active:scale-[0.98] disabled:opacity-50",
  dark:
    "inline-flex h-10 items-center justify-center gap-2 rounded-full bg-ink px-5 text-[0.95rem] font-semibold text-white transition hover:bg-deep active:scale-[0.98] disabled:opacity-50",
  ghost:
    "inline-flex h-10 items-center justify-center gap-2 rounded-full border border-ink/12 px-4 text-[0.95rem] font-medium text-ink transition hover:border-ink/25 hover:bg-ink/[0.03] disabled:opacity-50",
  quiet:
    "inline-flex h-9 items-center justify-center gap-1.5 rounded-full px-3 text-sm font-medium text-ink/60 transition hover:bg-ink/5 hover:text-ink",
};

export function PageHeader({ title, sub, children }: { title: string; sub?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <header className="mb-10 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-[2.1rem] font-semibold leading-none tracking-[-0.035em]">{title}</h1>
        {sub && <p className="mt-3 text-ink/60">{sub}</p>}
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </header>
  );
}

const STATUS: Record<SessionStatus, { label: string; cls: string }> = {
  published: { label: "Live", cls: "bg-lime text-ink" },
  draft: { label: "Draft", cls: "bg-ink/[0.06] text-ink/60" },
  closed: { label: "Closed", cls: "bg-ink/[0.06] text-ink/45" },
};

export function StatusChip({ status }: { status: SessionStatus }) {
  const s = STATUS[status];
  return (
    <span className={`inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold ${s.cls}`}>
      {status === "published" && <span className="h-1.5 w-1.5 rounded-full bg-ink animate-breathe" aria-hidden />}
      {s.label}
    </span>
  );
}

export const SENTIMENT: Record<SentimentLabel, { label: string; dot: string }> = {
  positive: { label: "Positive", dot: "bg-lime ring-1 ring-ink/15" },
  mixed: { label: "Mixed", dot: "bg-cyan" },
  neutral: { label: "Neutral", dot: "bg-ink/25" },
  negative: { label: "Friction", dot: "bg-blue" },
};

export function SentimentTag({ label, score }: { label: SentimentLabel; score?: number }) {
  const s = SENTIMENT[label];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink/70">
      <span className={`h-2 w-2 rounded-full ${s.dot}`} aria-hidden />
      {s.label}
      {score !== undefined && <span className="tabular text-ink/40">{score}/10</span>}
    </span>
  );
}

export function CopyButton({ text, className = btn.ghost, label = "Copy link" }: { text: string; className?: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        if (await copyText(text)) {
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        }
      }}
    >
      {copied ? "Copied" : label}
    </button>
  );
}

/** Pick which Sonar a Responses/Insights view is about. Reflected in ?s=. */
export function useSessions() {
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api<{ sessions: SessionSummary[] }>("/api/sessions")
      .then((d) => setSessions(d.sessions))
      .catch((e: Error) => setError(e.message));
  }, []);
  return { sessions, error };
}

export function SessionPicker({
  sessions,
  value,
  onChange,
}: {
  sessions: SessionSummary[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <label className="relative inline-flex items-center">
      <span className="sr-only">Sonar</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 appearance-none rounded-full border border-ink/12 bg-white pl-4 pr-10 text-[0.95rem] font-medium outline-none hover:border-ink/25 focus-visible:border-blue"
      >
        {sessions.map((s) => (
          <option key={s.id} value={s.id}>
            {s.title}
          </option>
        ))}
      </select>
      <svg className="pointer-events-none absolute right-3.5" width="12" height="12" viewBox="0 0 12 12" aria-hidden>
        <path d="M2.5 4.5 6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      </svg>
    </label>
  );
}

export function EmptySignal({ title, children, action }: { title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="relative overflow-hidden rounded-[28px] bg-cloud px-8 py-16 text-center">
      <div className="relative mx-auto mb-8 grid h-16 w-16 place-items-center" aria-hidden>
        <span className="absolute inset-0 rounded-full border border-cyan animate-ping-out" />
        <span className="absolute inset-0 rounded-full border border-cyan animate-ping-out [animation-delay:1.2s]" />
        <span className="h-3 w-3 rounded-full bg-cyan" />
      </div>
      <h2 className="font-display text-2xl font-semibold tracking-tight">{title}</h2>
      {children && <p className="mx-auto mt-2 max-w-sm text-ink/60">{children}</p>}
      {action && <div className="mt-7 flex justify-center gap-2">{action}</div>}
    </div>
  );
}

export function Loading({ label = "Loading" }: { label?: string }) {
  return (
    <div className="py-24 text-center text-sm text-ink/45" aria-busy="true">
      {label}…
    </div>
  );
}

export function ErrorNote({ message }: { message: string }) {
  return (
    <p role="alert" className="rounded-2xl bg-cloud p-4 text-sm text-ink/75">
      {message}
    </p>
  );
}

export function SessionTabs({ id, active }: { id: string; active: "build" | "responses" | "insights" }) {
  const tabs = [
    { key: "build", label: "Build", href: `/feedback/${id}` },
    { key: "responses", label: "Responses", href: `/responses?s=${id}` },
    { key: "insights", label: "Insights", href: `/insights?s=${id}` },
  ] as const;
  return (
    <nav aria-label="Sonar sections" className="mb-8 flex gap-1 border-b border-ink/8">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={t.key === active ? "page" : undefined}
          className={`-mb-px border-b-2 px-3 pb-3 text-[0.95rem] font-medium transition ${
            t.key === active ? "border-ink text-ink" : "border-transparent text-ink/50 hover:text-ink"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
