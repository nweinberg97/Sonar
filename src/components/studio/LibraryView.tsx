"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, plural, timeAgoInline } from "@/lib/client";
import { TestimonialsPanel } from "./TestimonialsPanel";
import { btn, EmptySignal, ErrorNote, Loading, PageHeader } from "./ui";

interface Theme {
  id: string;
  name: string;
  status: "active" | "suggested";
  mentions: number;
  sonars: number;
  avgSentiment: number | null;
  lastAt: string | null;
}

interface Quote {
  responseId: string;
  transcript: string;
  sentiment: number;
  sessionId: string;
  sessionTitle: string;
  createdAt: string;
}

function mood(avg: number | null): { label: string; dot: string } {
  if (avg === null) return { label: "No answers yet", dot: "bg-ink/20" };
  if (avg >= 7) return { label: "Loved", dot: "bg-lime" };
  if (avg < 5.5) return { label: "Friction", dot: "bg-blue" };
  return { label: "Mixed", dot: "bg-cyan" };
}

/**
 * The theme library: every theme across all Sonars, one name per idea.
 * New themes the AI comes up with wait here as suggestions. Accept, rename or
 * merge them, and every count (Insights, weekly pulse, Slack, Linear) follows.
 */
export function LibraryView() {
  const [tab, setTab] = useState<"themes" | "testimonials">("themes");
  return (
    <>
      <PageHeader title="Library" sub="Every theme and quote across all your Sonars." />
      <div className="mb-8 flex gap-1 border-b border-ink/8" role="tablist">
        {(["themes", "testimonials"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-3 pb-3 text-[0.95rem] font-medium transition ${tab === t ? "border-ink text-ink" : "border-transparent text-ink/50 hover:text-ink"}`}
          >
            {t === "themes" ? "Themes" : "Testimonials"}
          </button>
        ))}
      </div>
      {tab === "themes" ? <ThemesPanel /> : <TestimonialsPanel />}
    </>
  );
}

function ThemesPanel() {
  const [themes, setThemes] = useState<Theme[] | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [quotes, setQuotes] = useState<Record<string, Quote[]>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = () =>
    api<{ themes: Theme[] }>("/api/themes")
      .then((d) => setThemes(d.themes))
      .catch((e: Error) => setError(e.message));
  useEffect(() => {
    void load();
  }, []);

  const toggle = async (id: string) => {
    setOpen(open === id ? null : id);
    if (!quotes[id]) {
      const d = await api<{ quotes: Quote[] }>(`/api/themes/${id}`).catch(() => ({ quotes: [] as Quote[] }));
      setQuotes((q) => ({ ...q, [id]: d.quotes }));
    }
  };

  const change = async (id: string, body: Record<string, unknown>) => {
    setBusy(id);
    setError("");
    try {
      const d = await api<{ themes: Theme[] }>(`/api/themes/${id}`, { method: "PATCH", json: body });
      setThemes(d.themes);
      setQuotes({});
      setEditing(null);
      setOpen(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  if (!themes && !error) return <Loading />;
  const suggested = themes?.filter((t) => t.status === "suggested") ?? [];
  const active = themes?.filter((t) => t.status === "active") ?? [];

  const row = (t: Theme) => {
    const m = mood(t.avgSentiment);
    const others = (themes ?? []).filter((o) => o.id !== t.id);
    return (
      <li key={t.id} className="py-4">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          {editing === t.id ? (
            <form
              className="flex min-w-0 flex-1 gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (draftName.trim()) void change(t.id, { name: draftName });
              }}
            >
              <input
                autoFocus
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                maxLength={60}
                aria-label={`New name for ${t.name}`}
                className="min-w-0 flex-1 rounded-lg border border-ink/15 px-3 py-1.5 font-semibold outline-none focus:border-blue"
              />
              <button className={btn.dark} disabled={busy === t.id}>
                Save
              </button>
              <button type="button" className={btn.quiet} onClick={() => setEditing(null)}>
                Cancel
              </button>
            </form>
          ) : (
            <button onClick={() => void toggle(t.id)} className="min-w-0 flex-1 text-left" aria-expanded={open === t.id}>
              <span className="font-semibold">{t.name}</span>
              <span className="ml-3 text-sm text-ink/45">
                {plural(t.mentions, "mention")} · {plural(t.sonars, "Sonar")}
                {t.lastAt ? ` · ${timeAgoInline(t.lastAt)}` : ""}
              </span>
            </button>
          )}
          <span className="flex items-center gap-1.5 text-sm text-ink/55">
            <span className={`h-2 w-2 rounded-full ${m.dot}`} aria-hidden />
            {m.label}
            {t.avgSentiment !== null && <span className="tabular text-ink/40">{t.avgSentiment}/10</span>}
          </span>
          {editing !== t.id && (
            <span className="flex items-center gap-1">
              {t.status === "suggested" && (
                <button className={btn.quiet} disabled={busy === t.id} onClick={() => void change(t.id, { accept: true })}>
                  Accept
                </button>
              )}
              <button
                className={btn.quiet}
                onClick={() => {
                  setEditing(t.id);
                  setDraftName(t.name);
                }}
              >
                Rename
              </button>
              {others.length > 0 && (
                <select
                  aria-label={`Merge ${t.name} into another theme`}
                  value=""
                  disabled={busy === t.id}
                  onChange={(e) => {
                    const into = others.find((o) => o.id === e.target.value);
                    if (into && window.confirm(`Merge "${t.name}" into "${into.name}"? Its answers move over, and future "${t.name}" answers go there too.`)) {
                      void change(t.id, { mergeInto: into.id });
                    }
                  }}
                  className="h-9 rounded-full bg-transparent px-2 text-sm font-medium text-ink/60 hover:bg-ink/5"
                >
                  <option value="">Merge into…</option>
                  {others.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              )}
            </span>
          )}
        </div>
        {open === t.id && (
          <ul className="mt-4 space-y-3 border-l-2 border-ink/10 pl-4">
            {!quotes[t.id] && <li className="text-sm text-ink/45">Loading…</li>}
            {quotes[t.id]?.length === 0 && <li className="text-sm text-ink/45">No answers under this theme yet.</li>}
            {quotes[t.id]?.slice(0, 20).map((q) => (
              <li key={q.responseId}>
                <p className="leading-relaxed">&ldquo;{q.transcript.length > 360 ? `${q.transcript.slice(0, 357)}…` : q.transcript}&rdquo;</p>
                <p className="mt-1 text-xs text-ink/45">
                  <Link href={`/responses?s=${q.sessionId}`} className="hover:text-ink">
                    {q.sessionTitle}
                  </Link>{" "}
                  · {q.sentiment}/10 · {timeAgoInline(q.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </li>
    );
  };

  return (
    <>
      {error && <ErrorNote message={error} />}
      {themes && themes.length === 0 && (
        <EmptySignal title="No themes yet.">Themes appear here as answers are analyzed.</EmptySignal>
      )}
      {suggested.length > 0 && (
        <section aria-labelledby="suggested" className="mb-12">
          <h2 id="suggested" className="text-sm font-medium text-ink/50">
            New themes to review
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-ink/45">
            The AI didn&rsquo;t find a matching theme for these answers. Accept a name, rename it, or merge it into an existing theme so it&rsquo;s counted together.
          </p>
          <ul className="mt-3 divide-y divide-ink/8 border-y border-ink/8">{suggested.map(row)}</ul>
        </section>
      )}
      {active.length > 0 && (
        <section aria-labelledby="all-themes">
          <h2 id="all-themes" className="text-sm font-medium text-ink/50">
            Themes
          </h2>
          <ul className="mt-3 divide-y divide-ink/8 border-y border-ink/8">{active.map(row)}</ul>
        </section>
      )}
    </>
  );
}
