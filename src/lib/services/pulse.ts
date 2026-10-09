/**
 * Weekly pulse: the same Sonar link answered every week, compared week to week.
 *
 * Weeks are worked out from each answer's timestamp (Monday–Sunday in the
 * Sonar's time zone), so nothing needs to run on a schedule, and a Codespace
 * that was asleep all week still shows the right weeks when it wakes.
 * Themes come from the theme library, so "Pricing" this week and last week
 * really is the same thing.
 *
 * Privacy: a week with fewer than MIN_RESPONDENTS people is hidden, so a small
 * team's answers can't be traced back to someone.
 */
import { getSession, listResponses, listShareItems } from "../data";
import type { ResponseRow } from "../types";

export const MIN_RESPONDENTS = 3;
const WEEKS_SHOWN = 8;

/** Calendar date (y, m, d) of an instant in a time zone. */
function localDate(iso: string, timeZone: string): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(iso));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { y: get("year"), m: get("month"), d: get("day") };
}

/** ISO week ("2026-W41") and the Monday it starts on, for an instant in a time zone. */
export function weekOf(iso: string, timeZone: string): { key: string; monday: Date } {
  const { y, m, d } = localDate(iso, timeZone);
  const date = new Date(Date.UTC(y, m - 1, d));
  const dow = (date.getUTCDay() + 6) % 7; // Monday = 0
  const monday = new Date(date);
  monday.setUTCDate(date.getUTCDate() - dow);
  const thursday = new Date(monday);
  thursday.setUTCDate(monday.getUTCDate() + 3);
  const isoYear = thursday.getUTCFullYear();
  const jan4 = new Date(Date.UTC(isoYear, 0, 4));
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() + 6) % 7));
  const week = 1 + Math.round((monday.getTime() - week1Monday.getTime()) / (7 * 86_400_000));
  return { key: `${isoYear}-W${String(week).padStart(2, "0")}`, monday };
}

function weekLabel(monday: Date): string {
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const f = (d: Date, withMonth: boolean) =>
    d.toLocaleDateString("en-US", { timeZone: "UTC", day: "numeric", ...(withMonth ? { month: "short" } : {}) });
  return `${f(monday, true)} – ${f(sunday, sunday.getUTCMonth() !== monday.getUTCMonth())}`;
}

export interface PulseTheme {
  theme: string;
  mentions: number;
  avgSentiment: number;
}

export interface PulseWeek {
  key: string;
  label: string;
  current: boolean;
  respondents: number;
  answers: number;
  /** Fewer than MIN_RESPONDENTS people: numbers are withheld. */
  hidden: boolean;
  avgSentiment: number | null;
  themes: PulseTheme[];
  /** Compared with the previous week that had enough people. */
  vs: null | {
    key: string;
    label: string;
    respondentsDelta: number;
    sentimentDelta: number | null;
    up: { theme: string; now: number; before: number }[];
    down: { theme: string; now: number; before: number }[];
    new: string[];
  };
  /** A summary for this week was already sent to Slack. */
  sentToSlack: boolean;
}

export interface Pulse {
  timezone: string;
  minRespondents: number;
  weeks: PulseWeek[];
  /** The latest finished week that has enough people and hasn't been sent to Slack yet. */
  readyToSend: string | null;
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

function summarise(rows: ResponseRow[]): Pick<PulseWeek, "respondents" | "answers" | "avgSentiment" | "themes"> {
  const people = new Set(rows.map((r) => r.sessionResponseId));
  const analysed = rows.filter((r) => r.insight);
  const byTheme = new Map<string, { n: number; sum: number }>();
  for (const r of analysed) {
    for (const t of [r.insight!.primary_theme, ...(r.insight!.other_themes ?? [])]) {
      if (!t || t === "Unclear response") continue;
      const cur = byTheme.get(t) ?? { n: 0, sum: 0 };
      cur.n += 1;
      cur.sum += r.insight!.sentiment_score;
      byTheme.set(t, cur);
    }
  }
  return {
    respondents: people.size,
    answers: rows.length,
    avgSentiment: analysed.length ? round1(analysed.reduce((s, r) => s + r.insight!.sentiment_score, 0) / analysed.length) : null,
    themes: [...byTheme.entries()]
      .map(([theme, v]) => ({ theme, mentions: v.n, avgSentiment: round1(v.sum / v.n) }))
      .sort((a, b) => b.mentions - a.mentions || a.theme.localeCompare(b.theme)),
  };
}

export async function computePulse(sessionId: string, now = new Date()): Promise<Pulse | null> {
  const session = await getSession(sessionId);
  if (!session) return null;
  const tz = session.timezone || "UTC";
  const rows = await listResponses({ sessionId });
  const sent = new Set(
    (await listShareItems(sessionId)).filter((s) => s.kind === "slack" && s.status === "sent" && s.source.startsWith("pulse:")).map((s) => s.source.slice(6)),
  );

  const buckets = new Map<string, { monday: Date; rows: ResponseRow[] }>();
  for (const r of rows) {
    const w = weekOf(r.createdAt, tz);
    const b = buckets.get(w.key) ?? { monday: w.monday, rows: [] };
    b.rows.push(r);
    buckets.set(w.key, b);
  }
  const currentKey = weekOf(now.toISOString(), tz).key;
  const ordered = [...buckets.entries()].sort((a, b) => a[1].monday.getTime() - b[1].monday.getTime());

  const weeks: PulseWeek[] = [];
  let prev: PulseWeek | null = null;
  for (const [key, b] of ordered) {
    const s = summarise(b.rows);
    const hidden = s.respondents < MIN_RESPONDENTS;
    const week: PulseWeek = {
      key,
      label: weekLabel(b.monday),
      current: key === currentKey,
      respondents: s.respondents,
      answers: hidden ? 0 : s.answers,
      hidden,
      avgSentiment: hidden ? null : s.avgSentiment,
      themes: hidden ? [] : s.themes,
      vs: null,
      sentToSlack: sent.has(key),
    };
    if (!hidden && prev) {
      const before = new Map(prev.themes.map((t) => [t.theme, t.mentions]));
      const nowMap = new Map(week.themes.map((t) => [t.theme, t.mentions]));
      const all = new Set([...before.keys(), ...nowMap.keys()]);
      const changes = [...all].map((theme) => ({ theme, now: nowMap.get(theme) ?? 0, before: before.get(theme) ?? 0 }));
      week.vs = {
        key: prev.key,
        label: prev.label,
        respondentsDelta: week.respondents - prev.respondents,
        sentimentDelta: week.avgSentiment !== null && prev.avgSentiment !== null ? round1(week.avgSentiment - prev.avgSentiment) : null,
        up: changes.filter((c) => c.now > c.before && c.before > 0).sort((a, b) => b.now - b.before - (a.now - a.before)).slice(0, 5),
        down: changes.filter((c) => c.now < c.before).sort((a, b) => a.now - a.before - (b.now - b.before)).slice(0, 5),
        new: changes.filter((c) => c.before === 0 && c.now > 0).sort((a, b) => b.now - a.now).map((c) => c.theme).slice(0, 5),
      };
    }
    if (!hidden) prev = week;
    weeks.push(week);
  }
  const shown = weeks.slice(-WEEKS_SHOWN).reverse();
  const latestDone = shown.find((w) => !w.current && !w.hidden);
  return {
    timezone: tz,
    minRespondents: MIN_RESPONDENTS,
    weeks: shown,
    readyToSend: latestDone && !latestDone.sentToSlack ? latestDone.key : null,
  };
}
