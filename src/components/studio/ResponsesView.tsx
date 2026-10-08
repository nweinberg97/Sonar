"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { api, formatDuration, plural, shareUrl, timeAgo } from "@/lib/client";
import type { ResponseRow, SessionStats } from "@/lib/types";
import { btn, CopyButton, EmptySignal, ErrorNote, Loading, PageHeader, SentimentTag, SessionPicker, SessionTabs } from "./ui";
import { useSelectedSession } from "./useSelectedSession";

export function ResponsesView() {
  const { sessions, error, selected, select } = useSelectedSession("/responses");
  const [data, setData] = useState<{ responses: ResponseRow[]; stats: SessionStats } | null>(null);
  const [loadError, setLoadError] = useState("");
  const [question, setQuestion] = useState<number | "all">("all");

  useEffect(() => {
    if (!selected) return;
    setData(null);
    setQuestion("all");
    api<{ responses: ResponseRow[]; stats: SessionStats }>(`/api/responses?sessionId=${selected.id}`)
      .then(setData)
      .catch((e: Error) => setLoadError(e.message));
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // One block per person, newest first, answers in question order.
  const people = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, ResponseRow[]>();
    for (const r of data.responses) {
      if (question !== "all" && r.questionPosition !== question) continue;
      map.set(r.sessionResponseId, [...(map.get(r.sessionResponseId) ?? []), r]);
    }
    return [...map.entries()]
      .map(([id, rows]) => ({ id, rows: rows.sort((a, b) => a.questionPosition - b.questionPosition) }))
      .sort((a, b) => Date.parse(b.rows[b.rows.length - 1].createdAt) - Date.parse(a.rows[a.rows.length - 1].createdAt));
  }, [data, question]);

  const questions = useMemo(() => {
    const m = new Map<number, string>();
    data?.responses.forEach((r) => m.set(r.questionPosition, r.questionText));
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [data]);

  if (error) return <ErrorNote message={error} />;
  if (!sessions) return <Loading />;
  if (!selected)
    return (
      <>
        <PageHeader title="Responses" />
        <EmptySignal title="Your first signal is out there." action={<Link href="/feedback/new" className={btn.primary}>New Sonar</Link>}>
          Create a Sonar and share it to start hearing from people.
        </EmptySignal>
      </>
    );

  return (
    <>
      <PageHeader title="Responses">
        <SessionPicker sessions={sessions} value={selected.id} onChange={select} />
      </PageHeader>
      <SessionTabs id={selected.id} active="responses" />

      {loadError && <ErrorNote message={loadError} />}
      {!data && !loadError && <Loading />}

      {data && data.responses.length === 0 && (
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
          Share your Sonar to start hearing from people.
        </EmptySignal>
      )}

      {data && data.responses.length > 0 && (
        <>
          <dl className="mb-12 grid grid-cols-2 gap-y-6 border-y border-ink/8 py-6 sm:grid-cols-4">
            <Stat label="Responses" value={String(data.stats.respondents)} />
            <Stat label="Average completion" value={formatDuration(data.stats.avgCompletionMs)} />
            <Stat label="Questions answered" value={String(data.stats.answered)} />
            <Stat label="Average sentiment" value={data.stats.avgSentiment === null ? "—" : `${data.stats.avgSentiment}`} suffix="/10" />
          </dl>

          {questions.length > 1 && (
            <div className="mb-8 flex flex-wrap gap-2" role="group" aria-label="Filter by question">
              <FilterChip active={question === "all"} onClick={() => setQuestion("all")}>
                All questions
              </FilterChip>
              {questions.map(([pos, text]) => (
                <FilterChip key={pos} active={question === pos} onClick={() => setQuestion(pos)} title={text}>
                  Q{pos}. <span className="max-w-[14rem] truncate">{text}</span>
                </FilterChip>
              ))}
            </div>
          )}

          <ul className="space-y-4">
            {people.map((p) => (
              <li key={p.id} className="rounded-[24px] border border-ink/8 p-6">
                <div className="mb-5 flex items-center justify-between text-sm text-ink/45">
                  <span>Anonymous respondent {p.id.slice(0, 4)}</span>
                  <time dateTime={p.rows[0].createdAt}>{timeAgo(p.rows[p.rows.length - 1].createdAt)}</time>
                </div>
                <ol className="space-y-6">
                  {p.rows.map((r) => (
                    <li key={r.id} className="grid gap-x-8 gap-y-3 md:grid-cols-[minmax(0,1fr)_15rem]">
                      <div>
                        <p className="text-sm text-ink/50">{r.questionText}</p>
                        <p className="mt-1.5 text-[1.05rem] leading-relaxed">{r.transcript}</p>
                        <p className="mt-2 text-xs text-ink/40">
                          {r.inputMode === "voice" ? `Spoken, ${formatDuration(r.durationMs)}` : "Typed"}
                        </p>
                      </div>
                      {r.insight ? (
                        <div className="space-y-2 border-l border-ink/8 pl-4 text-sm md:border-l md:pl-5">
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                            <SentimentTag label={r.insight.sentiment_label} score={r.insight.sentiment_score} />
                          </div>
                          <p className="font-medium">{r.insight.primary_theme}</p>
                          <p className="text-ink/60">{r.insight.executive_summary}</p>
                          {r.insight.feature_requests.length > 0 && (
                            <p className="text-ink/60">
                              <span className="font-medium text-ink">Asks for: </span>
                              {r.insight.feature_requests.join("; ")}
                            </p>
                          )}
                        </div>
                      ) : (
                        <p className="text-sm text-ink/40">Finding signals…</p>
                      )}
                    </li>
                  ))}
                </ol>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-sm text-ink/40">
            {plural(people.length, "person", "people")} shown. Only transcripts are kept; audio is discarded after transcription.
          </p>
        </>
      )}
    </>
  );
}

function Stat({ label, value, suffix }: { label: string; value: string; suffix?: string }) {
  return (
    <div>
      <dt className="text-sm text-ink/50">{label}</dt>
      <dd className="tabular mt-1 font-display text-3xl font-semibold tracking-tight">
        {value}
        {suffix && value !== "—" && <span className="text-lg text-ink/35">{suffix}</span>}
      </dd>
    </div>
  );
}

function FilterChip({ active, onClick, children, title }: { active: boolean; onClick: () => void; children: React.ReactNode; title?: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={`inline-flex h-9 items-center gap-1 rounded-full px-4 text-sm font-medium transition ${
        active ? "bg-ink text-white" : "bg-cloud text-ink/65 hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}
