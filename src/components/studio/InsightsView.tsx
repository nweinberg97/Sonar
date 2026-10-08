"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, plural, shareUrl } from "@/lib/client";
import type { SessionStats, Synthesis, ThemeCount } from "@/lib/types";
import { btn, CopyButton, EmptySignal, ErrorNote, PageHeader, SessionPicker, SessionTabs } from "./ui";
import { useSelectedSession } from "./useSelectedSession";

export function InsightsView() {
  const { sessions, error, selected, select } = useSelectedSession("/insights");
  const [data, setData] = useState<{ synthesis: Synthesis; stats: SessionStats } | null>(null);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    if (!selected) return;
    setData(null);
    setLoadError("");
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = () =>
      api<{ synthesis: Synthesis; stats: SessionStats }>(`/api/sessions/${selected.id}/insights`)
        .then((d) => {
          if (!alive) return;
          setData(d);
          // While the model is still working, check back every few seconds.
          if (d.synthesis.pending > 0 || d.synthesis.updating) timer = setTimeout(load, 5000);
        })
        .catch((e: Error) => alive && setLoadError(e.message));
    void load();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return <ErrorNote message={error} />;
  if (!sessions) return <Listening />;
  if (!selected)
    return (
      <>
        <PageHeader title="Insights" />
        <EmptySignal title="Your first signal is out there." action={<Link href="/feedback/new" className={btn.primary}>New Sonar</Link>}>
          Create a Sonar and share it. Insights appear as soon as people answer.
        </EmptySignal>
      </>
    );

  const s = data?.synthesis;
  const maxMentions = Math.max(1, ...(s?.themes.map((t) => t.mentions) ?? [1]));

  return (
    <>
      <PageHeader
        title="Insights"
        sub={data && s && s.responseCount > 0 ? `From ${plural(data.stats.respondents, "person", "people")} and ${plural(s.responseCount, "answer")}.` : undefined}
      >
        <SessionPicker sessions={sessions} value={selected.id} onChange={select} />
      </PageHeader>
      <SessionTabs id={selected.id} active="insights" />

      {loadError && <ErrorNote message={loadError} />}
      {!data && !loadError && <Listening />}

      {s && s.responseCount === 0 && (
        <EmptySignal
          title="Your first signal is out there."
          action={
            selected.status === "published" ? (
              <CopyButton text={shareUrl(selected.slug)} className={btn.primary} label="Copy share link" />
            ) : (
              <Link href={`/feedback/${selected.id}`} className={btn.primary}>
                Publish this Sonar
              </Link>
            )
          }
        >
          Share your Sonar to start hearing from people. Themes and next steps show up here as answers arrive.
        </EmptySignal>
      )}

      {s && s.responseCount > 0 && (s.pending > 0 || s.updating) && (
        <p role="status" className="mb-8 flex items-center gap-3 text-sm text-ink/55">
          <span className="relative grid h-4 w-4 place-items-center" aria-hidden>
            <span className="absolute inset-0 rounded-full border border-cyan animate-ping-out" />
            <span className="h-1.5 w-1.5 rounded-full bg-cyan" />
          </span>
          {s.pending > 0
            ? `Analyzing ${plural(s.pending, "new answer")}. This page updates on its own.`
            : "Rewriting the summary with the latest answers…"}
        </p>
      )}

      {s && s.responseCount > 0 && (
        <div className="grid gap-x-16 gap-y-14 lg:grid-cols-[minmax(0,1fr)_17rem]">
          <div className="space-y-16">
            <section aria-labelledby="heard" className="animate-rise">
              <h2 id="heard" className="text-sm font-medium text-ink/50">
                What did we hear?
              </h2>
              <p className="mt-4 max-w-[38rem] font-display text-[1.65rem] leading-[1.28] tracking-[-0.02em] text-balance">{s.heard}</p>
            </section>

            <section aria-labelledby="themes">
              <h2 id="themes" className="text-sm font-medium text-ink/50">
                What keeps coming up?
              </h2>
              <ul className="mt-5 divide-y divide-ink/8 border-y border-ink/8">
                {s.themes.slice(0, 8).map((t) => (
                  <ThemeRow key={t.theme} theme={t} max={maxMentions} />
                ))}
              </ul>
            </section>

            <section aria-labelledby="todo">
              <h2 id="todo" className="text-sm font-medium text-ink/50">
                What should we do?
              </h2>
              <ul className="mt-5 space-y-3">
                {s.actions.map((a, i) => (
                  <li key={i} className="flex gap-4 rounded-2xl bg-cloud px-5 py-4 text-[1.05rem] leading-snug">
                    <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-[3px] bg-lime ring-1 ring-ink/20" aria-hidden />
                    {a}
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <aside className="space-y-12">
            <section aria-labelledby="mood">
              <h2 id="mood" className="text-sm font-medium text-ink/50">
                Sentiment
              </h2>
              <p className="tabular mt-2 font-display text-4xl font-semibold tracking-tight">
                {s.sentiment.average ?? "—"}
                <span className="text-xl text-ink/35">/10</span>
              </p>
              <SentimentBar s={s.sentiment} />
            </section>

            {s.requests.length > 0 && (
              <section aria-labelledby="asks">
                <h2 id="asks" className="text-sm font-medium text-ink/50">
                  Most requested
                </h2>
                <ul className="mt-3 space-y-2.5 text-[0.95rem]">
                  {s.requests.slice(0, 6).map((r) => (
                    <li key={r.text} className="flex justify-between gap-3">
                      <span>{r.text}</span>
                      {r.mentions > 1 && <span className="tabular shrink-0 text-ink/40">{r.mentions}</span>}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {s.frictions.length > 0 && (
              <section aria-labelledby="friction">
                <h2 id="friction" className="text-sm font-medium text-ink/50">
                  Where things get stuck
                </h2>
                <ul className="mt-3 space-y-3 text-[0.95rem] leading-snug text-ink/75">
                  {s.frictions.slice(0, 5).map((f, i) => (
                    <li key={i} className="border-l-2 border-blue pl-3">
                      {f}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </aside>
        </div>
      )}
    </>
  );
}

function tone(t: ThemeCount): { label: string; bar: string } {
  if (t.requests * 2 >= t.mentions && t.avgSentiment < 7.5) return { label: "Asked for", bar: "bg-cyan" };
  if (t.avgSentiment >= 7) return { label: "Loved", bar: "bg-lime" };
  if (t.avgSentiment < 5.5) return { label: "Friction", bar: "bg-blue" };
  return { label: "Mixed", bar: "bg-cyan" };
}

function ThemeRow({ theme: t, max }: { theme: ThemeCount; max: number }) {
  const tn = tone(t);
  return (
    <li>
      <details className="group">
        <summary className="grid cursor-pointer list-none grid-cols-[minmax(0,1fr)_auto] items-center gap-5 py-4 sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)_auto] [&::-webkit-details-marker]:hidden">
          <span className="font-semibold sm:truncate">{t.theme}</span>
          <span className="hidden items-center gap-3 sm:flex">
            <span className="h-2.5 overflow-hidden rounded-full bg-ink/[0.05]" style={{ width: "100%" }}>
              <span className={`block h-full rounded-full ${tn.bar}`} style={{ width: `${Math.max(6, (t.mentions / max) * 100)}%` }} />
            </span>
          </span>
          <span className="flex items-center gap-4 text-sm">
            <span className="flex w-20 items-center gap-1.5 text-ink/50"><span className={`h-2 w-2 rounded-full sm:hidden ${tn.bar}`} aria-hidden />{tn.label}</span>
            <span className="tabular w-24 text-right font-medium">{plural(t.mentions, "mention")}</span>
          </span>
        </summary>
        {t.quote && (
          <blockquote className="mb-5 ml-0 max-w-[36rem] text-ink/70 sm:ml-[12.25rem]">&ldquo;{t.quote}&rdquo;</blockquote>
        )}
      </details>
    </li>
  );
}

function SentimentBar({ s }: { s: Synthesis["sentiment"] }) {
  const total = s.positive + s.mixed + s.neutral + s.negative || 1;
  const parts = [
    { k: "Positive", n: s.positive, c: "bg-lime" },
    { k: "Mixed", n: s.mixed, c: "bg-cyan" },
    { k: "Neutral", n: s.neutral, c: "bg-ink/20" },
    { k: "Friction", n: s.negative, c: "bg-blue" },
  ];
  return (
    <>
      <div className="mt-4 flex h-2.5 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={parts.map((p) => `${p.k} ${p.n}`).join(", ")}>
        {parts.filter((p) => p.n > 0).map((p) => (
          <span key={p.k} className={p.c} style={{ width: `${(p.n / total) * 100}%` }} />
        ))}
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-1.5 text-sm text-ink/60">
        {parts.map((p) => (
          <li key={p.k} className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${p.c}`} aria-hidden />
            {p.k} <span className="tabular text-ink/40">{p.n}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

function Listening() {
  return (
    <div className="flex items-center gap-3 py-24 text-ink/50" aria-busy="true">
      <span className="relative grid h-6 w-6 place-items-center" aria-hidden>
        <span className="absolute inset-0 rounded-full border border-cyan animate-ping-out" />
        <span className="h-1.5 w-1.5 rounded-full bg-cyan" />
      </span>
      Finding signals…
    </div>
  );
}
