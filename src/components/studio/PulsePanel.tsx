"use client";

import { useEffect, useState } from "react";
import { api, plural } from "@/lib/client";
import { btn } from "./ui";

interface PulseWeek {
  key: string;
  label: string;
  current: boolean;
  respondents: number;
  answers: number;
  hidden: boolean;
  avgSentiment: number | null;
  themes: { theme: string; mentions: number; avgSentiment: number }[];
  vs: null | {
    key: string;
    label: string;
    respondentsDelta: number;
    sentimentDelta: number | null;
    up: { theme: string; now: number; before: number }[];
    down: { theme: string; now: number; before: number }[];
    new: string[];
  };
  sentToSlack: boolean;
}

interface Pulse {
  timezone: string;
  minRespondents: number;
  weeks: PulseWeek[];
  readyToSend: string | null;
}

const sign = (n: number) => (n > 0 ? `+${n}` : `${n}`);

/** Week-by-week view for a weekly Sonar, with a nudge to send last week's pulse to Slack. */
export function PulsePanel({ sessionId, refreshKey, onSendWeek }: { sessionId: string; refreshKey: number; onSendWeek: (week: string) => void }) {
  const [pulse, setPulse] = useState<Pulse | null>(null);
  const [week, setWeek] = useState<string | null>(null);

  useEffect(() => {
    api<{ pulse: Pulse }>(`/api/sessions/${sessionId}/pulse`)
      .then((d) => {
        setPulse(d.pulse);
        setWeek((w) => (w && d.pulse.weeks.some((x) => x.key === w) ? w : d.pulse.weeks[0]?.key ?? null));
      })
      .catch(() => setPulse(null));
  }, [sessionId, refreshKey]);

  if (!pulse || pulse.weeks.length === 0) return null;
  const w = pulse.weeks.find((x) => x.key === week) ?? pulse.weeks[0];

  return (
    <section aria-labelledby="pulse" className="mb-14 rounded-[24px] border border-ink/8 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="pulse" className="font-display text-xl font-semibold tracking-tight">
          Weekly pulse
        </h2>
        {pulse.readyToSend && (
          <button onClick={() => onSendWeek(pulse.readyToSend!)} className={btn.primary}>
            Send last week to Slack
          </button>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Choose a week">
        {pulse.weeks.map((x) => (
          <button
            key={x.key}
            onClick={() => setWeek(x.key)}
            aria-pressed={x.key === w.key}
            className={`h-9 rounded-full px-4 text-sm font-medium transition ${x.key === w.key ? "bg-ink text-white" : "bg-cloud text-ink/65 hover:text-ink"}`}
          >
            {x.current ? "This week" : x.label}
            {x.sentToSlack && <span className="ml-1.5 opacity-60">· sent</span>}
          </button>
        ))}
      </div>

      {w.hidden ? (
        <p className="mt-6 text-ink/60">
          {w.respondents === 0 ? "No answers yet this week." : `${plural(w.respondents, "person", "people")} so far.`} A week shows once{" "}
          {pulse.minRespondents} people have answered, so no one can be identified.
        </p>
      ) : (
        <div className="mt-6 grid gap-8 md:grid-cols-[14rem_minmax(0,1fr)]">
          <dl className="space-y-4">
            <div>
              <dt className="text-sm text-ink/50">People</dt>
              <dd className="tabular font-display text-3xl font-semibold tracking-tight">
                {w.respondents}
                {w.vs && w.vs.respondentsDelta !== 0 && <span className="ml-2 text-base font-medium text-ink/45">{sign(w.vs.respondentsDelta)}</span>}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-ink/50">Mood</dt>
              <dd className="tabular font-display text-3xl font-semibold tracking-tight">
                {w.avgSentiment ?? "—"}
                <span className="text-lg text-ink/35">/10</span>
                {w.vs?.sentimentDelta != null && w.vs.sentimentDelta !== 0 && (
                  <span className={`ml-2 text-base font-medium ${w.vs.sentimentDelta < 0 ? "text-blue" : "text-ink/45"}`}>{sign(w.vs.sentimentDelta)}</span>
                )}
              </dd>
            </div>
            <p className="text-xs text-ink/40">{w.vs ? `Compared with ${w.vs.label}.` : "The first week with enough answers. Next week gets a comparison."}</p>
          </dl>
          <div className="space-y-5">
            <div>
              <p className="text-sm font-medium text-ink/50">Top themes</p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {w.themes.slice(0, 8).map((t) => (
                  <li key={t.theme} className="rounded-full bg-cloud px-3 py-1 text-sm">
                    {t.theme} <span className="tabular text-ink/45">{t.mentions}</span>
                  </li>
                ))}
              </ul>
            </div>
            {w.vs && (w.vs.up.length > 0 || w.vs.new.length > 0 || w.vs.down.length > 0) && (
              <ul className="space-y-1.5 text-[0.95rem]">
                {w.vs.up.length > 0 && (
                  <li>
                    <span className="font-medium">Coming up more:</span> {w.vs.up.map((c) => `${c.theme} (${c.before}→${c.now})`).join(", ")}
                  </li>
                )}
                {w.vs.new.length > 0 && (
                  <li>
                    <span className="font-medium">New this week:</span> {w.vs.new.join(", ")}
                  </li>
                )}
                {w.vs.down.length > 0 && (
                  <li className="text-ink/60">
                    <span className="font-medium">Coming up less:</span> {w.vs.down.map((c) => `${c.theme} (${c.before}→${c.now})`).join(", ")}
                  </li>
                )}
              </ul>
            )}
            {!w.current && (
              <button onClick={() => onSendWeek(w.key)} className={btn.ghost}>
                {w.sentToSlack ? "Send this week to Slack again" : "Send this week to Slack"}
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
