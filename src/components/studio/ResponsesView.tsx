"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { api, formatDuration, plural, shareUrl, timeAgo } from "@/lib/client";
import type { ResponseRow, Segment, SessionStats } from "@/lib/types";
import { btn, CopyButton, EmptySignal, ErrorNote, Loading, PageHeader, SentimentTag, SessionPicker, SessionTabs } from "./ui";
import { useSelectedSession } from "./useSelectedSession";

export function ResponsesView() {
  const { sessions, error, selected, select } = useSelectedSession("/responses");
  const [data, setData] = useState<{ responses: ResponseRow[]; stats: SessionStats; transcribing: number } | null>(null);
  const [loadError, setLoadError] = useState("");
  const [question, setQuestion] = useState<number | "all">("all");

  useEffect(() => {
    if (!selected) return;
    setData(null);
    setQuestion("all");
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = () =>
      api<{ responses: ResponseRow[]; stats: SessionStats; transcribing: number }>(`/api/responses?sessionId=${selected.id}`)
        .then((d) => {
          if (!alive) return;
          setData(d);
          // Recordings still being transcribed or analyzed: refresh until they're done.
          if (d.transcribing > 0 || d.responses.some((r) => !r.insight)) timer = setTimeout(load, 4000);
        })
        .catch((e: Error) => alive && setLoadError(e.message));
    void load();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
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

      {data && data.transcribing > 0 && (
        <p role="status" className="mb-6 flex items-center gap-3 text-sm text-ink/55">
          <span className="relative grid h-4 w-4 place-items-center" aria-hidden>
            <span className="absolute inset-0 rounded-full border border-cyan animate-ping-out" />
            <span className="h-1.5 w-1.5 rounded-full bg-cyan" />
          </span>
          Transcribing {plural(data.transcribing, "new recording")}. They'll appear here on their own.
        </p>
      )}

      {data && data.responses.length === 0 && data.transcribing === 0 && (
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
                        {r.segments?.length ? (
                          <Thread segments={r.segments} />
                        ) : (
                          <p className="mt-1.5 text-[1.05rem] leading-relaxed">{r.transcript}</p>
                        )}
                        <p className="mt-2 text-xs text-ink/40">
                          {r.inputMode === "voice" ? `Spoken, ${formatDuration(r.durationMs)}` : "Typed"}
                          {r.segments && countFollowups(r.segments) > 0 ? ` · ${plural(countFollowups(r.segments), "follow-up")}` : ""}
                        </p>
                      </div>
                      {r.insight ? (
                        <div className="space-y-2 border-l border-ink/8 pl-4 text-sm md:border-l md:pl-5">
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                            <SentimentTag label={r.insight.sentiment_label} score={r.insight.sentiment_score} />
                          </div>
                          <p className="font-medium">{r.insight.primary_theme}</p>
                          {(r.insight.other_themes?.length ?? 0) > 0 && (
                            <p className="text-ink/55">Also: {r.insight.other_themes!.join(", ")}</p>
                          )}
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

const countFollowups = (segments: Segment[]) => segments.filter((x) => x.t === "followup").length;

/** A conversation answer: what they said, with each follow-up where it appeared. */
function Thread({ segments }: { segments: Segment[] }) {
  return (
    <div className="mt-1.5 space-y-3">
      {segments.map((seg, i) =>
        seg.t === "speech" ? (
          <p key={i} className="text-[1.05rem] leading-relaxed">
            {seg.text}
          </p>
        ) : (
          <p key={i} className="flex gap-2 text-sm text-ink/55">
            <span className="shrink-0 font-medium text-blue">Follow-up</span>
            <span>
              {seg.text}
              {seg.by === "builtin" && <span className="text-ink/35"> (built-in)</span>}
            </span>
          </p>
        ),
      )}
    </div>
  );
}
