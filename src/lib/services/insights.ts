/**
 * insightService.analyzeLive(transcript) — one answer → structured Insight (throws on failure)
 * insightService.synthesize(sessionId)   — all answers → "what did we hear / what should we do"
 *
 * Providers are swappable via AI_PROVIDER. The default is Ollama: an
 * open-source model running on the same machine. Analysis runs in the
 * background (see analysis-queue.ts), so nobody waits on the model.
 */
import { aiConfig } from "./config";
import { INSIGHT_SYSTEM_PROMPT, SYNTHESIS_SYSTEM_PROMPT } from "./prompts";
import { mockAnalyze, mockNarrative } from "./mock";
import { getCachedNarrative, listResponses, saveNarrative, type Narrative } from "../data";
import type { Insight, ResponseRow, SentimentLabel, Synthesis, ThemeCount } from "../types";

// ---------------------------------------------------------------- LLM transport

async function complete(system: string, user: string): Promise<string> {
  const c = aiConfig();
  if (c.provider === "ollama") {
    // Ollama's native API: format "json" makes the model emit valid JSON.
    const res = await fetch(`${c.baseUrl.replace(/\/v1\/?$/, "").replace(/\/$/, "")}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: c.model,
        stream: false,
        format: "json",
        keep_alive: "30m",
        options: { temperature: 0.2, num_ctx: 4096 },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
      signal: AbortSignal.timeout(180_000),
    });
    if (!res.ok) throw new Error(`ollama ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = (await res.json()) as { message?: { content?: string } };
    return data.message?.content ?? "";
  }
  if (c.provider === "anthropic") {
    const res = await fetch(`${c.baseUrl.replace(/\/$/, "")}/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": c.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: c.model,
        max_tokens: 1024,
        system,
        messages: [{ role: "user", content: user }],
      }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) throw new Error(`anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = (await res.json()) as { content?: { type: string; text?: string }[] };
    return (data.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
  }
  // OpenAI-compatible chat completions (OpenAI, Groq, most hosted open models)
  const res = await fetch(`${c.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(c.apiKey ? { Authorization: `Bearer ${c.apiKey}` } : {}) },
    body: JSON.stringify({
      model: c.model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) throw new Error(`${c.provider} ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content ?? "";
}

function extractJson(text: string): unknown {
  const fenced = text.replace(/```(?:json)?/gi, "");
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("no JSON object in model output");
  return JSON.parse(fenced.slice(start, end + 1));
}

// ---------------------------------------------------------------- coercion

const LABELS: SentimentLabel[] = ["positive", "mixed", "neutral", "negative"];

function strList(v: unknown, max: number, maxLen = 200): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === "string")
    .map((s) => s.trim().slice(0, maxLen))
    .filter(Boolean)
    .slice(0, max);
}

/** Never trust model output: clamp, default and trim every field. */
export function coerceInsight(raw: unknown): Insight {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const score = Math.max(1, Math.min(10, Math.round(Number(o.sentiment_score) || 5)));
  const label = LABELS.includes(o.sentiment_label as SentimentLabel)
    ? (o.sentiment_label as SentimentLabel)
    : score >= 7
      ? "positive"
      : score <= 3
        ? "negative"
        : "neutral";
  const ineff = typeof o.business_inefficiency === "string" ? o.business_inefficiency.trim() : "";
  return {
    sentiment_score: score,
    sentiment_label: label,
    primary_theme: (typeof o.primary_theme === "string" && o.primary_theme.trim()) ? o.primary_theme.trim().slice(0, 60) : "General experience",
    business_inefficiency: ineff && !/^(null|none|n\/a)$/i.test(ineff) ? ineff.slice(0, 300) : null,
    feature_requests: strList(o.feature_requests, 5),
    key_points: strList(o.key_points, 4),
    executive_summary: typeof o.executive_summary === "string" ? o.executive_summary.trim().slice(0, 300) : "",
  };
}

// ---------------------------------------------------------------- aggregation

/** Deterministic cross-response counts. The model only writes the prose. */
export function aggregate(rows: ResponseRow[]) {
  const withInsight = rows.filter((r) => r.insight);
  const byTheme = new Map<string, { mentions: number; total: number; requests: number; quote: string | null; quoteScore: number }>();
  const requestCounts = new Map<string, { text: string; mentions: number }>();
  const frictions: string[] = [];
  const sentiment = { positive: 0, mixed: 0, neutral: 0, negative: 0 };
  let sum = 0;

  for (const r of withInsight) {
    const i = r.insight!;
    sentiment[i.sentiment_label] += 1;
    sum += i.sentiment_score;
    const key = i.primary_theme;
    if (key && key !== "Unclear response") {
      const t = byTheme.get(key) ?? { mentions: 0, total: 0, requests: 0, quote: null, quoteScore: -1 };
      t.mentions += 1;
      if (i.feature_requests.length) t.requests += 1;
      t.total += i.sentiment_score;
      // Prefer a mid-length, quotable line as the theme's example.
      const len = r.transcript.length;
      const quoteScore = len > 40 && len < 200 ? 200 - Math.abs(110 - len) : 0;
      if (quoteScore > t.quoteScore) {
        t.quote = r.transcript;
        t.quoteScore = quoteScore;
      }
      byTheme.set(key, t);
    }
    for (const fr of i.feature_requests) {
      const k = fr.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
      const hit = requestCounts.get(k) ?? { text: fr, mentions: 0 };
      hit.mentions += 1;
      requestCounts.set(k, hit);
    }
    if (i.business_inefficiency) frictions.push(i.business_inefficiency);
  }

  const themes: ThemeCount[] = [...byTheme.entries()]
    .map(([theme, t]) => ({ theme, mentions: t.mentions, avgSentiment: Math.round((t.total / t.mentions) * 10) / 10, quote: t.quote, requests: t.requests }))
    .sort((a, b) => b.mentions - a.mentions || a.theme.localeCompare(b.theme));

  return {
    themes,
    requests: [...requestCounts.values()].sort((a, b) => b.mentions - a.mentions).slice(0, 8),
    frictions: Array.from(new Set(frictions)).slice(0, 8),
    sentiment: { ...sentiment, average: withInsight.length ? Math.round((sum / withInsight.length) * 10) / 10 : null },
    analyzed: withInsight.length,
  };
}

// ---------------------------------------------------------------- service

const refreshing = new Set<string>();

function narrativeInput(rows: ResponseRow[], agg: ReturnType<typeof aggregate>, questions: string[]) {
  const lines = rows
    .filter((r) => r.insight)
    .slice(0, 120)
    .map((r) => `- [${r.insight!.sentiment_label}, ${r.insight!.primary_theme}] ${r.insight!.executive_summary}`)
    .join("\n");
  const themes = agg.themes.slice(0, 8).map((t) => `${t.theme} (${t.mentions})`).join(", ");
  return `Questions:\n${questions.map((q, i) => `${i + 1}. ${q}`).join("\n")}\n\nTop themes: ${themes}\n\nAnswers (${agg.analyzed}):\n${lines}`;
}

/** Rewrite the summary with the model, in the background. One at a time per Sonar. */
function refreshNarrative(sessionId: string, questions: string[]) {
  if (refreshing.has(sessionId)) return;
  refreshing.add(sessionId);
  (async () => {
    const rows = await listResponses({ sessionId });
    const agg = aggregate(rows);
    let narrative: Narrative | null = null;
    try {
      const parsed = extractJson(await complete(SYNTHESIS_SYSTEM_PROMPT, narrativeInput(rows, agg, questions))) as Record<string, unknown>;
      const heard = typeof parsed.heard === "string" ? parsed.heard.trim() : "";
      const actions = strList(parsed.actions, 5, 240);
      if (heard && actions.length) narrative = { heard, actions };
    } catch (err) {
      console.error("[sonar] summary failed, using the built-in one:", err);
    }
    await saveNarrative(sessionId, narrative ?? mockNarrative(agg.themes, agg.requests, agg.analyzed), agg.analyzed);
  })()
    .catch((err) => console.error("[sonar] summary refresh failed:", err))
    .finally(() => refreshing.delete(sessionId));
}

export const insightService = {
  /** Label stored with each insight so you can tell which engine wrote it. */
  get engine(): string {
    const c = aiConfig();
    return c.provider === "mock" ? "builtin" : `${c.provider}:${c.model}`;
  },

  /** Analyze with the configured model. Throws if the model is unavailable or returns junk. */
  async analyzeLive(transcript: string, question = ""): Promise<Insight> {
    if (aiConfig().provider === "mock") return mockAnalyze(transcript, question);
    const out = await complete(
      INSIGHT_SYSTEM_PROMPT,
      `Question asked:\n${question}\n\nTranscript of the spoken answer:\n"""\n${transcript}\n"""`,
    );
    const insight = coerceInsight(extractJson(out));
    if (!insight.executive_summary) throw new Error("model returned an empty summary");
    return insight;
  },

  /** Analyze, falling back to the built-in extractor if the model fails. */
  async analyze(transcript: string, question = ""): Promise<Insight> {
    try {
      return await this.analyzeLive(transcript, question);
    } catch (err) {
      console.error("[sonar] insight extraction failed, using built-in extractor:", err);
      return mockAnalyze(transcript, question);
    }
  },

  async synthesize(sessionId: string, questions: string[]): Promise<Synthesis> {
    const rows = await listResponses({ sessionId });
    const agg = aggregate(rows);
    const count = rows.length;
    const pending = count - agg.analyzed;
    const live = aiConfig().provider !== "mock";
    const cached = await getCachedNarrative(sessionId);

    let narrative: Narrative | null = null;
    let updating = false;
    if (agg.analyzed > 0) {
      // Live: refresh whenever more answers have been analyzed. Built-in: only after ~20% more.
      const fresh = cached && (live ? cached.responseCount === agg.analyzed : cached.responseCount >= Math.floor(agg.analyzed * 0.8));
      if (fresh) {
        narrative = cached;
      } else if (live) {
        // Show what we have right away; the model rewrites it in the background.
        narrative = cached ?? mockNarrative(agg.themes, agg.requests, agg.analyzed);
        refreshNarrative(sessionId, questions);
        updating = true;
      } else {
        narrative = mockNarrative(agg.themes, agg.requests, agg.analyzed);
        await saveNarrative(sessionId, narrative, agg.analyzed);
      }
    }

    return {
      heard: narrative?.heard ?? "",
      actions: narrative?.actions ?? [],
      themes: agg.themes,
      requests: agg.requests,
      frictions: agg.frictions,
      sentiment: agg.sentiment,
      responseCount: count,
      pending,
      updating: updating || refreshing.has(sessionId),
      generatedAt: new Date().toISOString(),
    };
  },
};
