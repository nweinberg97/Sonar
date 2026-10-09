/**
 * Sending things out of Sonar: a summary to Slack, an issue to Linear.
 *
 * Nothing here runs on its own. The creator asks for a draft, reads and edits
 * it, and presses Send. `send` is the only function that talks to Slack or
 * Linear, and every attempt is recorded in share_items (success or failure).
 *
 * Setup is two optional lines in .env (secrets never reach the browser or the database):
 *   SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...   (a Slack "incoming webhook" for one channel)
 *   LINEAR_API_KEY=lin_api_...                               (Linear → Settings → Security & access → Personal API keys)
 *   LINEAR_TEAM=ENG                                          (optional: which team, by key or name; needed only if you have several)
 */
import { getSession, getShareItem, listResponses, saveShareItem, type ShareItem } from "../data";
import type { Synthesis } from "../types";
import { nowIso } from "../validate";
import { slackChannels } from "./config";
import { insightService } from "./insights";
import { computePulse } from "./pulse";

function env(name: string): string {
  return (process.env[name] ?? "").trim();
}

/** The webhook for a Sonar's channel ("" = the default channel, or the only one set up). */
function slackUrl(channel = ""): string {
  const all = slackChannels();
  const hit = all.find((c) => c.name === channel);
  if (hit) return hit.url;
  if (!channel && all.length === 1) return all[0].url;
  return "";
}
export const channelLabel = (channel: string) => (channel ? `#${channel}` : "your default Slack channel");
const linearKey = () => env("LINEAR_API_KEY");
const linearApi = () => env("LINEAR_API_URL") || "https://api.linear.app/graphql";

/** Safe for the browser: whether each one is set up, nothing more. */
export function integrationStatus() {
  return { slack: slackChannels().length > 0, slackChannels: slackChannels().map((c) => c.name), linear: Boolean(linearKey()) };
}

export class ShareError extends Error {}

// ---------------------------------------------------------------- drafts

export type LinearSource = "action" | "request" | "friction";

export interface Draft {
  kind: "slack" | "linear";
  source: string;
  title: string;
  body: string;
}

async function load(sessionId: string): Promise<{ title: string; synthesis: Synthesis; questions: string[] }> {
  const session = await getSession(sessionId);
  if (!session) throw new ShareError("We couldn't find that Sonar.");
  const questions = session.questions.map((q) => q.text);
  return { title: session.title, synthesis: await insightService.synthesize(sessionId, questions), questions };
}

function themeLabel(t: Synthesis["themes"][number]): string {
  if (t.requests * 2 >= t.mentions && t.avgSentiment < 7.5) return "asked for";
  if (t.avgSentiment >= 7) return "loved";
  if (t.avgSentiment < 5.5) return "friction";
  return "mixed";
}

/** A Slack message summarising a Sonar. Plain text with *bold*, edited by the creator before sending. */
export async function draftSlackSummary(sessionId: string, link: string): Promise<Draft> {
  const { title, synthesis: s } = await load(sessionId);
  if (s.responseCount === 0) throw new ShareError("There are no answers to summarise yet.");
  const lines = [
    `*${title}*: what we heard from ${s.responseCount} ${s.responseCount === 1 ? "answer" : "answers"}`,
    "",
    s.heard,
  ];
  if (s.themes.length) {
    lines.push("", "*What keeps coming up*");
    for (const t of s.themes.slice(0, 5)) lines.push(`• ${t.theme} (${t.mentions} ${t.mentions === 1 ? "mention" : "mentions"}, ${themeLabel(t)})`);
  }
  if (s.actions.length) {
    lines.push("", "*What we should do*");
    s.actions.forEach((a, i) => lines.push(`${i + 1}. ${a}`));
  }
  if (link) lines.push("", `Full insights: ${link}`);
  return { kind: "slack", source: "summary", title: "", body: lines.join("\n") };
}

/** A Slack message for one week of a weekly pulse, compared with the week before. */
export async function draftSlackPulse(sessionId: string, weekKey: string, link: string): Promise<Draft> {
  const session = await getSession(sessionId);
  const pulse = await computePulse(sessionId);
  if (!session || !pulse) throw new ShareError("We couldn't find that Sonar.");
  const w = pulse.weeks.find((x) => x.key === weekKey);
  if (!w) throw new ShareError("That week isn't available.");
  if (w.hidden) throw new ShareError(`That week had fewer than ${pulse.minRespondents} people, so it stays private.`);
  const sign = (n: number) => (n > 0 ? `+${n}` : `${n}`);
  const lines = [`*${session.title}*: weekly pulse for ${w.label}`, ""];
  lines.push(
    `${w.respondents} ${w.respondents === 1 ? "person" : "people"}${
      w.vs ? (w.vs.respondentsDelta === 0 ? " (same as last week)" : ` (${sign(w.vs.respondentsDelta)} vs last week)`) : ""
    }` +
      (w.avgSentiment !== null
        ? `, mood ${w.avgSentiment}/10${w.vs?.sentimentDelta != null ? (w.vs.sentimentDelta === 0 ? " (no change)" : ` (${sign(w.vs.sentimentDelta)})`) : ""}`
        : ""),
  );
  if (w.themes.length) {
    lines.push("", "*Top themes this week*");
    for (const t of w.themes.slice(0, 5)) lines.push(`• ${t.theme} (${t.mentions})`);
  }
  if (w.vs) {
    if (w.vs.up.length) lines.push("", `*Coming up more:* ${w.vs.up.map((c) => `${c.theme} (${c.before}→${c.now})`).join(", ")}`);
    if (w.vs.new.length) lines.push(`*New this week:* ${w.vs.new.join(", ")}`);
    if (w.vs.down.length) lines.push(`*Coming up less:* ${w.vs.down.map((c) => `${c.theme} (${c.before}→${c.now})`).join(", ")}`);
  }
  if (link) lines.push("", `Full insights: ${link}`);
  return { kind: "slack", source: `pulse:${w.key}`, title: "", body: lines.join("\n") };
}

const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();

/** A Linear issue for one action, request or friction point, with anonymous supporting quotes. */
export async function draftLinearIssue(sessionId: string, source: LinearSource, text: string, link: string): Promise<Draft> {
  const { title, synthesis: s } = await load(sessionId);
  const rows = (await listResponses({ sessionId })).filter((r) => r.insight);
  let evidence: string[] = [];
  let count = "";
  if (source === "request") {
    const hits = rows.filter((r) => r.insight!.feature_requests.some((f) => norm(f) === norm(text)));
    count = `Asked for by ${hits.length} ${hits.length === 1 ? "person" : "people"}.`;
    evidence = hits.map((r) => r.transcript);
  } else if (source === "friction") {
    const hits = rows.filter((r) => r.insight!.business_inefficiency && norm(r.insight!.business_inefficiency) === norm(text));
    evidence = hits.map((r) => r.transcript);
  } else {
    // Actions are written across all answers; the most critical answers are the best evidence.
    evidence = [...rows].sort((a, b) => a.insight!.sentiment_score - b.insight!.sentiment_score).slice(0, 3).map((r) => r.transcript);
  }
  const quotes = evidence
    .slice(0, 3)
    .map((q) => (q.length > 400 ? `${q.slice(0, 397)}…` : q))
    .map((q) => `> ${q.replace(/\n+/g, " ")}`);
  const kindLabel = { action: "Suggested action", request: "Requested", friction: "Friction point" }[source];
  const body = [
    `From the Sonar feedback **${title}** (${s.responseCount} ${s.responseCount === 1 ? "answer" : "answers"}).`,
    "",
    `**${kindLabel}:** ${text}`,
    ...(count ? ["", count] : []),
    ...(source === "action" && s.heard ? ["", `**What we heard:** ${s.heard}`] : []),
    ...(quotes.length ? ["", "**What people said** (anonymous):", "", ...quotes.flatMap((q) => [q, ""])] : [""]),
    ...(link ? [`[Open in Sonar](${link})`] : []),
  ].join("\n");
  const issueTitle = text.length > 120 ? `${text.slice(0, 117)}…` : text;
  return { kind: "linear", source: `${source}:${text}`.slice(0, 300), title: issueTitle, body: body.trim() };
}

// ---------------------------------------------------------------- sending

const slackEscape = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function postSlack(body: string, channel: string): Promise<string | null> {
  const url = slackUrl(channel);
  if (!url) {
    throw new ShareError(
      channel
        ? `This Sonar posts to #${channel}, but that channel isn't set up. Add SLACK_WEBHOOK_URL_${channel.toUpperCase().replace(/-/g, "_")} to .env, or pick another channel in the builder.`
        : "Slack isn't set up. Add SLACK_WEBHOOK_URL to .env and restart Sonar.",
    );
  }
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: slackEscape(body) }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 120);
    throw new ShareError(
      res.status === 404 || res.status === 403
        ? "Slack didn't accept the webhook link. It may have been removed; make a new one and update SLACK_WEBHOOK_URL."
        : `Slack said no (${res.status}${detail ? `: ${detail}` : ""}).`,
    );
  }
  return null; // incoming webhooks don't return a message link
}

async function linear<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const key = linearKey();
  if (!key) throw new ShareError("Linear isn't set up. Add LINEAR_API_KEY to .env and restart Sonar.");
  const res = await fetch(linearApi(), {
    method: "POST",
    // Personal API keys go in the header as-is (no "Bearer").
    headers: { "content-type": "application/json", authorization: key },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await res.json().catch(() => ({}))) as { data?: T; errors?: { message?: string }[] };
  if (res.status === 401 || res.status === 403) throw new ShareError("Linear didn't accept the API key. Check LINEAR_API_KEY.");
  if (!res.ok || data.errors?.length || !data.data) {
    throw new ShareError(`Linear said no: ${data.errors?.[0]?.message ?? `status ${res.status}`}`);
  }
  return data.data;
}

let teamCache: { key: string; id: string } | null = null;

async function linearTeamId(): Promise<string> {
  const want = env("LINEAR_TEAM");
  if (teamCache && teamCache.key === want) return teamCache.id;
  const { teams } = await linear<{ teams: { nodes: { id: string; key: string; name: string }[] } }>(`query { teams { nodes { id key name } } }`);
  const nodes = teams.nodes;
  const list = nodes.map((t) => `${t.key} (${t.name})`).join(", ");
  const team = want ? nodes.find((t) => [t.id, t.key, t.name].some((v) => v.toLowerCase() === want.toLowerCase())) : nodes.length === 1 ? nodes[0] : undefined;
  if (!team) {
    throw new ShareError(
      want ? `No Linear team called "${want}". Set LINEAR_TEAM to one of: ${list}.` : `You have several Linear teams. Set LINEAR_TEAM in .env to one of: ${list}.`,
    );
  }
  teamCache = { key: want, id: team.id };
  return team.id;
}

async function createLinearIssue(title: string, description: string): Promise<string | null> {
  const teamId = await linearTeamId();
  const out = await linear<{ issueCreate: { success: boolean; issue?: { identifier: string; url: string } } }>(
    `mutation Create($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { identifier url } } }`,
    { input: { teamId, title, description } },
  );
  if (!out.issueCreate.success) throw new ShareError("Linear didn't create the issue.");
  return out.issueCreate.issue?.url ?? null;
}

/**
 * Send something the creator reviewed. `key` comes from the browser and makes
 * this idempotent: if that key was already sent, nothing is sent again.
 */
export async function send(input: { key: string; sessionId: string; kind: "slack" | "linear"; source: string; title: string; body: string }): Promise<ShareItem> {
  const existing = await getShareItem(input.key);
  if (existing?.status === "sent") return existing;
  const session = await getSession(input.sessionId);
  if (!session) throw new ShareError("We couldn't find that Sonar.");

  const item: ShareItem = {
    id: input.key,
    sessionId: input.sessionId,
    kind: input.kind,
    source: input.source,
    title: input.title,
    body: input.body,
    status: "sent",
    externalUrl: null,
    error: null,
    createdAt: existing?.createdAt ?? nowIso(),
    sentAt: null,
  };
  try {
    item.externalUrl = input.kind === "slack" ? await postSlack(input.body, session.slackChannel) : await createLinearIssue(input.title, input.body);
    item.sentAt = nowIso();
  } catch (err) {
    item.status = "failed";
    item.error = err instanceof ShareError ? err.message : "Couldn't reach the service. Check the connection and try again.";
    if (!(err instanceof ShareError)) console.error(`[sonar] sending to ${input.kind} failed:`, err);
  }
  await saveShareItem(item);
  return item;
}
