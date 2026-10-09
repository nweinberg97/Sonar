"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, timeAgoInline } from "@/lib/client";
import { btn, CopyButton, EmptySignal, ErrorNote, Loading } from "./ui";

interface Row {
  responseId: string;
  transcript: string;
  text: string | null;
  status: "approved" | "rejected" | null;
  sentiment: number;
  theme: string | null;
  sessionId: string;
  sessionTitle: string;
  createdAt: string;
}

/**
 * Testimonials, with permission: only answers from people who tapped
 * "OK to quote me" at the end. Nothing is used until the creator approves it,
 * and the server refuses to approve anything without that permission.
 */
export function TestimonialsPanel() {
  const [data, setData] = useState<{ candidates: Row[]; approved: Row[] } | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    api<{ candidates: Row[]; approved: Row[] }>("/api/testimonials")
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, []);

  const act = async (responseId: string, action: "approve" | "reject" | "remove", text?: string) => {
    setBusy(responseId);
    setError("");
    try {
      setData(await api<{ candidates: Row[]; approved: Row[] }>("/api/testimonials", { method: "POST", json: { responseId, action, text } }));
      setEditing(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  if (!data && !error) return <Loading />;
  const meta = (r: Row) => (
    <p className="mt-2 text-xs text-ink/45">
      <Link href={`/responses?s=${r.sessionId}`} className="hover:text-ink">
        {r.sessionTitle}
      </Link>
      {r.theme ? ` · ${r.theme}` : ""} · {r.sentiment}/10 · {timeAgoInline(r.createdAt)}
    </p>
  );

  return (
    <div>
      <p className="max-w-2xl text-ink/60">
        Positive answers from people who said it&rsquo;s OK to quote them anonymously. Approve the ones you&rsquo;d use, trimming filler
        words if you like (don&rsquo;t change what they meant), then copy them wherever you need.
      </p>
      {error && (
        <div className="mt-4">
          <ErrorNote message={error} />
        </div>
      )}

      {data && data.approved.length > 0 && (
        <section aria-labelledby="approved" className="mt-10">
          <h2 id="approved" className="text-sm font-medium text-ink/50">
            Approved
          </h2>
          <ul className="mt-3 space-y-3">
            {data.approved.map((r) => (
              <li key={r.responseId} className="rounded-2xl bg-cloud p-5">
                <blockquote className="font-display text-[1.15rem] leading-snug">&ldquo;{r.text}&rdquo;</blockquote>
                {meta(r)}
                <div className="mt-3 flex gap-2">
                  <CopyButton text={`“${r.text}”`} label="Copy quote" className={btn.ghost} />
                  <button className={btn.quiet} disabled={busy === r.responseId} onClick={() => void act(r.responseId, "remove")}>
                    Un-approve
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="review" className="mt-10">
        <h2 id="review" className="text-sm font-medium text-ink/50">
          Ready to review
        </h2>
        {data && data.candidates.length === 0 ? (
          <div className="mt-3">
            <EmptySignal title="Nothing to review yet.">
              At the end of every Sonar, people can tap &ldquo;Yes, you can quote me.&rdquo; Their positive answers show up here.
            </EmptySignal>
          </div>
        ) : (
          <ul className="mt-3 divide-y divide-ink/8 border-y border-ink/8">
            {data?.candidates.map((r) => (
              <li key={r.responseId} className="py-5">
                {editing === r.responseId ? (
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    rows={4}
                    maxLength={1000}
                    aria-label="Quote text"
                    className="w-full resize-y rounded-xl border border-ink/15 p-3 leading-relaxed outline-none focus:border-blue"
                  />
                ) : (
                  <blockquote className="leading-relaxed">&ldquo;{r.transcript}&rdquo;</blockquote>
                )}
                {meta(r)}
                <div className="mt-3 flex flex-wrap gap-2">
                  {editing === r.responseId ? (
                    <>
                      <button className={btn.dark} disabled={busy === r.responseId || !draft.trim()} onClick={() => void act(r.responseId, "approve", draft)}>
                        Approve
                      </button>
                      <button className={btn.quiet} onClick={() => setEditing(null)}>
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className={btn.dark}
                        onClick={() => {
                          setEditing(r.responseId);
                          setDraft(r.transcript);
                        }}
                      >
                        Use as testimonial
                      </button>
                      <button className={btn.quiet} disabled={busy === r.responseId} onClick={() => void act(r.responseId, "reject")}>
                        Not this one
                      </button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
