"use client";

import Link from "next/link";
import { displayUrl, plural, shareUrl, timeAgo } from "@/lib/client";
import { btn, CopyButton, EmptySignal, ErrorNote, Loading, PageHeader, StatusChip, useSessions } from "./ui";

export function FeedbackList() {
  const { sessions, error } = useSessions();

  return (
    <>
      <PageHeader title="Feedback" sub="Every Sonar you've made. Open one to edit its questions or share it.">
        <Link href="/feedback/new" className={btn.primary}>
          New Sonar
        </Link>
      </PageHeader>

      {error && <ErrorNote message={error} />}
      {!sessions && !error && <Loading />}

      {sessions && sessions.length === 0 && (
        <EmptySignal
          title="Ask your first question"
          action={
            <Link href="/feedback/new" className={btn.primary}>
              New Sonar
            </Link>
          }
        >
          Pick what you&rsquo;re trying to learn and Sonar suggests the questions. It takes about two minutes.
        </EmptySignal>
      )}

      {sessions && sessions.length > 0 && (
        <ul className="divide-y divide-ink/8 border-y border-ink/8">
          {sessions.map((s) => (
            <li key={s.id} className="group relative flex flex-wrap items-center gap-x-6 gap-y-3 py-5">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-3">
                  <Link
                    href={`/feedback/${s.id}`}
                    className="truncate font-display text-xl font-semibold tracking-[-0.02em] after:absolute after:inset-0 hover:text-blue"
                  >
                    {s.title}
                  </Link>
                  <StatusChip status={s.status} />
                </div>
                <p className="mt-1.5 text-sm text-ink/55">
                  {plural(s.questionCount, "question")}
                  <span className="mx-2 text-ink/25">/</span>
                  {s.status === "draft" ? "Not shared yet" : displayUrl(s.slug)}
                </p>
              </div>
              <div className="flex items-center gap-8 text-right">
                <div>
                  <p className="tabular font-display text-2xl font-semibold leading-none">{s.respondentCount}</p>
                  <p className="mt-1 text-xs text-ink/50">{s.respondentCount === 1 ? "response" : "responses"}</p>
                </div>
                <p className="hidden w-32 text-sm text-ink/50 sm:block">{s.lastResponseAt ? timeAgo(s.lastResponseAt) : "No responses yet"}</p>
                <div className="relative z-[1] flex gap-1">
                  {s.status === "published" ? (
                    <CopyButton text={shareUrl(s.slug)} className={btn.quiet} />
                  ) : (
                    <Link href={`/feedback/${s.id}`} className={btn.quiet}>
                      Finish setup
                    </Link>
                  )}
                  {s.responseCount > 0 && (
                    <Link href={`/insights?s=${s.id}`} className={btn.quiet}>
                      Insights
                    </Link>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
