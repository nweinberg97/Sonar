/**
 * Every read and write Sonar makes. Plain SQL over the driver in db.ts.
 */
import { db as defaultDb, type Driver } from "./db";
import type {
  Insight,
  InputMode,
  Question,
  ResponseRow,
  Segment,
  SessionDetail,
  SessionFormat,
  Cadence,
  SessionStats,
  SessionStatus,
  SessionSummary,
} from "./types";
import { newId, nowIso, shortCode, slugify } from "./validate";
import { DRAFT_SONAR, DEMO, DEMO_RESPONDENTS, DEMO_SYNTHESIS } from "./seed-data";

let db: Driver = defaultDb;
/** Swap the driver (used by scripts and tests). */
export function useDriver(d: Driver) {
  db = d;
}

const WORKSPACE_ID = "ws_default";

// ---------------------------------------------------------------- sessions

const SUMMARY_SQL = `
  SELECT s.id, s.title, s.description, s.slug, s.status, s.template,
         s.format, s.goal, s.target_seconds AS "targetSeconds", s.cadence, s.timezone,
         s.created_at AS "createdAt", s.updated_at AS "updatedAt",
         (SELECT COUNT(*) FROM questions q WHERE q.session_id = s.id) AS "questionCount",
         (SELECT COUNT(DISTINCT r.session_response_id) FROM responses r WHERE r.session_id = s.id) AS "respondentCount",
         (SELECT COUNT(*) FROM responses r WHERE r.session_id = s.id) AS "responseCount",
         (SELECT MAX(r.created_at) FROM responses r WHERE r.session_id = s.id) AS "lastResponseAt"
  FROM feedback_sessions s`;

export async function listSessions(): Promise<SessionSummary[]> {
  return db.all<SessionSummary>(`${SUMMARY_SQL} ORDER BY s.updated_at DESC`);
}

async function questionsFor(sessionId: string): Promise<Question[]> {
  return db.all<Question>(
    `SELECT id, position, text FROM questions WHERE session_id = ? ORDER BY position ASC`,
    sessionId,
  );
}

export async function getSession(id: string): Promise<SessionDetail | null> {
  const [row] = await db.all<SessionSummary>(`${SUMMARY_SQL} WHERE s.id = ?`, id);
  if (!row) return null;
  return { ...row, questions: await questionsFor(id) };
}

export async function getSessionBySlug(slug: string): Promise<SessionDetail | null> {
  const [row] = await db.all<SessionSummary>(`${SUMMARY_SQL} WHERE s.slug = ?`, slug);
  if (!row) return null;
  return { ...row, questions: await questionsFor(row.id) };
}

async function uniqueSlug(d: Driver, title: string, exceptId?: string): Promise<string> {
  const base = slugify(title);
  let candidate = base;
  for (let i = 0; i < 8; i++) {
    const [hit] = await d.all<{ id: string }>(`SELECT id FROM feedback_sessions WHERE slug = ?`, candidate);
    if (!hit || hit.id === exceptId) return candidate;
    candidate = `${base}-${shortCode(4)}`;
  }
  return `${base}-${shortCode(8)}`;
}

async function ensureWorkspace(d: Driver) {
  await d.run(
    `INSERT INTO workspaces (id, name, created_at) VALUES (?, ?, ?) ON CONFLICT(id) DO NOTHING`,
    WORKSPACE_ID,
    "My workspace",
    nowIso(),
  );
}

export async function createSession(input: {
  title: string;
  description: string;
  template: string;
  questions: string[];
  status?: SessionStatus;
  slug?: string;
  format?: SessionFormat;
  goal?: string;
  targetSeconds?: number;
}): Promise<string> {
  return db.transaction(async (d) => {
    await ensureWorkspace(d);
    const id = newId();
    const now = nowIso();
    const slug = input.slug ?? (await uniqueSlug(d, input.title));
    await d.run(
      `INSERT INTO feedback_sessions (id, workspace_id, title, description, slug, status, template, format, goal, target_seconds, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id, WORKSPACE_ID, input.title, input.description, slug, input.status ?? "draft", input.template,
      input.format ?? "questions", input.goal ?? "", input.targetSeconds ?? 60, now, now,
    );
    for (const [i, text] of input.questions.entries()) {
      await d.run(
        `INSERT INTO questions (id, session_id, position, text, created_at) VALUES (?, ?, ?, ?, ?)`,
        newId(), id, i + 1, text, now,
      );
    }
    return id;
  });
}

export async function updateSession(
  id: string,
  patch: {
    title?: string;
    description?: string;
    status?: SessionStatus;
    questions?: { id?: string; text: string }[];
    format?: SessionFormat;
    goal?: string;
    targetSeconds?: number;
    cadence?: Cadence;
    timezone?: string;
  },
): Promise<void> {
  await db.transaction(async (d) => {
    const now = nowIso();
    if (patch.title !== undefined) {
      await d.run(`UPDATE feedback_sessions SET title = ? WHERE id = ?`, patch.title, id);
      // Drafts that were never shared get a link that matches their title.
      const [cur] = await d.all<{ status: string; respondents: number }>(
        `SELECT status, (SELECT COUNT(*) FROM respondents r WHERE r.session_id = s.id) AS respondents
         FROM feedback_sessions s WHERE id = ?`,
        id,
      );
      if (cur && cur.status === "draft" && cur.respondents === 0) {
        await d.run(`UPDATE feedback_sessions SET slug = ? WHERE id = ?`, await uniqueSlug(d, patch.title, id), id);
      }
    }
    if (patch.description !== undefined) {
      await d.run(`UPDATE feedback_sessions SET description = ? WHERE id = ?`, patch.description, id);
    }
    if (patch.status !== undefined) {
      await d.run(`UPDATE feedback_sessions SET status = ? WHERE id = ?`, patch.status, id);
    }
    if (patch.format !== undefined) {
      await d.run(`UPDATE feedback_sessions SET format = ? WHERE id = ?`, patch.format, id);
    }
    if (patch.goal !== undefined) {
      await d.run(`UPDATE feedback_sessions SET goal = ? WHERE id = ?`, patch.goal, id);
    }
    if (patch.targetSeconds !== undefined) {
      await d.run(`UPDATE feedback_sessions SET target_seconds = ? WHERE id = ?`, patch.targetSeconds, id);
    }
    if (patch.cadence !== undefined) {
      await d.run(`UPDATE feedback_sessions SET cadence = ? WHERE id = ?`, patch.cadence, id);
    }
    if (patch.timezone !== undefined) {
      await d.run(`UPDATE feedback_sessions SET timezone = ? WHERE id = ?`, patch.timezone, id);
    }
    if (patch.questions) {
      const existing = await d.all<{ id: string }>(`SELECT id FROM questions WHERE session_id = ?`, id);
      const existingIds = new Set(existing.map((q) => q.id));
      const keep = new Set(patch.questions.map((q) => q.id).filter((x): x is string => !!x && existingIds.has(x)));
      for (const q of existing) {
        if (!keep.has(q.id)) await d.run(`DELETE FROM questions WHERE id = ?`, q.id);
      }
      for (const [i, q] of patch.questions.entries()) {
        if (q.id && keep.has(q.id)) {
          await d.run(`UPDATE questions SET text = ?, position = ? WHERE id = ?`, q.text, i + 1, q.id);
        } else {
          await d.run(
            `INSERT INTO questions (id, session_id, position, text, created_at) VALUES (?, ?, ?, ?, ?)`,
            newId(), id, i + 1, q.text, now,
          );
        }
      }
    }
    await d.run(`UPDATE feedback_sessions SET updated_at = ? WHERE id = ?`, now, id);
  });
}

export async function deleteSession(id: string): Promise<void> {
  await db.transaction(async (d) => {
    await d.run(`DELETE FROM ai_insights WHERE response_id IN (SELECT id FROM responses WHERE session_id = ?)`, id);
    await d.run(`DELETE FROM responses WHERE session_id = ?`, id);
    await d.run(`DELETE FROM respondents WHERE session_id = ?`, id);
    await d.run(`DELETE FROM questions WHERE session_id = ?`, id);
    await d.run(`DELETE FROM syntheses WHERE session_id = ?`, id);
    await d.run(`DELETE FROM share_items WHERE session_id = ?`, id);
    await d.run(`DELETE FROM feedback_sessions WHERE id = ?`, id);
  });
}

// ---------------------------------------------------------------- respondents

export async function startRespondent(sessionId: string, at = nowIso()): Promise<string> {
  const id = newId();
  await db.run(`INSERT INTO respondents (id, session_id, started_at) VALUES (?, ?, ?)`, id, sessionId, at);
  return id;
}

export async function getRespondent(id: string) {
  const [row] = await db.all<{ id: string; sessionId: string; completedAt: string | null }>(
    `SELECT id, session_id AS "sessionId", completed_at AS "completedAt" FROM respondents WHERE id = ?`,
    id,
  );
  return row ?? null;
}

export async function completeRespondent(id: string, at = nowIso()): Promise<void> {
  await db.run(`UPDATE respondents SET completed_at = ? WHERE id = ? AND completed_at IS NULL`, at, id);
}

// ---------------------------------------------------------------- responses

export async function createResponse(input: {
  sessionId: string;
  questionId: string;
  respondentId: string;
  transcript: string;
  inputMode: InputMode;
  durationMs: number;
  createdAt?: string;
  segments?: Segment[];
}): Promise<string> {
  // One answer per question per respondent: re-answering replaces the old one.
  return db.transaction(async (d) => {
    const prior = await d.all<{ id: string }>(
      `SELECT id FROM responses WHERE session_response_id = ? AND question_id = ?`,
      input.respondentId,
      input.questionId,
    );
    for (const p of prior) {
      await d.run(`DELETE FROM ai_insights WHERE response_id = ?`, p.id);
      await d.run(`DELETE FROM responses WHERE id = ?`, p.id);
    }
    const id = newId();
    await d.run(
      `INSERT INTO responses (id, session_id, question_id, session_response_id, transcript, input_mode, duration_ms, segments, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id, input.sessionId, input.questionId, input.respondentId, input.transcript,
      input.inputMode, Math.max(0, Math.round(input.durationMs)),
      input.segments?.length ? JSON.stringify(input.segments) : null, input.createdAt ?? nowIso(),
    );
    return id;
  });
}

/** source: which engine produced it, e.g. "ollama:llama3.2:3b", "builtin", "seed". */
export async function saveInsight(responseId: string, insight: Insight, at = nowIso(), source = "builtin"): Promise<void> {
  // Seeded data defines the starting library; anything new the model comes up with is a suggestion.
  const themeId = await resolveTheme(db, insight.primary_theme, source === "seed" ? "active" : "suggested");
  await db.run(`DELETE FROM ai_insights WHERE response_id = ?`, responseId);
  await db.run(
    `INSERT INTO ai_insights (id, response_id, sentiment_score, sentiment_label, primary_theme, business_inefficiency,
                              feature_requests, key_points, executive_summary, source, theme_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    newId(), responseId, insight.sentiment_score, insight.sentiment_label, insight.primary_theme,
    insight.business_inefficiency, JSON.stringify(insight.feature_requests), JSON.stringify(insight.key_points),
    insight.executive_summary, source.slice(0, 80), themeId, at,
  );
}

/** Answers saved but not analyzed yet, oldest first. */
export async function listPendingAnalysis(limit = 10) {
  return db.all<{ id: string; transcript: string; questionText: string }>(
    `SELECT r.id, r.transcript, q.text AS "questionText"
     FROM responses r JOIN questions q ON q.id = r.question_id
     LEFT JOIN ai_insights i ON i.response_id = r.id
     WHERE i.id IS NULL
     ORDER BY r.created_at ASC
     LIMIT ${Math.min(Math.max(limit, 1), 100)}`,
  );
}

export async function countPendingAnalysis(sessionId?: string): Promise<number> {
  const [row] = await db.all<{ n: number }>(
    `SELECT COUNT(*) AS n FROM responses r LEFT JOIN ai_insights i ON i.response_id = r.id
     WHERE i.id IS NULL ${sessionId ? "AND r.session_id = ?" : ""}`,
    ...(sessionId ? [sessionId] : []),
  );
  return row?.n ?? 0;
}

function parseList(raw: unknown): string[] {
  if (typeof raw !== "string") return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function parseSegments(raw: unknown): Segment[] | null {
  if (typeof raw !== "string" || !raw) return null;
  try {
    const v = JSON.parse(raw);
    if (!Array.isArray(v)) return null;
    return v.filter(
      (x): x is Segment => x && typeof x.text === "string" && (x.t === "speech" || x.t === "followup") && typeof x.atMs === "number",
    );
  } catch {
    return null;
  }
}

type RawResponse = Omit<ResponseRow, "insight" | "segments"> & {
  segments: string | null;
  iScore: number | null;
  iLabel: Insight["sentiment_label"] | null;
  iTheme: string | null;
  iIneff: string | null;
  iRequests: string | null;
  iPoints: string | null;
  iSummary: string | null;
};

export async function listResponses(opts: { sessionId?: string; limit?: number } = {}): Promise<ResponseRow[]> {
  const where = opts.sessionId ? `WHERE r.session_id = ?` : "";
  const params = opts.sessionId ? [opts.sessionId] : [];
  const rows = await db.all<RawResponse>(
    `SELECT r.id, r.session_id AS "sessionId", s.title AS "sessionTitle", r.question_id AS "questionId",
            q.text AS "questionText", q.position AS "questionPosition", r.session_response_id AS "sessionResponseId",
            r.transcript, r.input_mode AS "inputMode", r.duration_ms AS "durationMs", r.created_at AS "createdAt", r.segments,
            i.sentiment_score AS "iScore", i.sentiment_label AS "iLabel", COALESCE(th.name, i.primary_theme) AS "iTheme",
            i.business_inefficiency AS "iIneff", i.feature_requests AS "iRequests", i.key_points AS "iPoints",
            i.executive_summary AS "iSummary"
     FROM responses r
     JOIN feedback_sessions s ON s.id = r.session_id
     JOIN questions q ON q.id = r.question_id
     LEFT JOIN ai_insights i ON i.response_id = r.id
     LEFT JOIN themes th ON th.id = i.theme_id
     ${where}
     ORDER BY r.created_at DESC, q.position ASC
     LIMIT ${Math.min(Math.max(opts.limit ?? 500, 1), 2000)}`,
    ...params,
  );
  return rows.map(({ iScore, iLabel, iTheme, iIneff, iRequests, iPoints, iSummary, segments, ...r }) => ({
    ...r,
    segments: parseSegments(segments),
    insight:
      iScore === null || iScore === undefined
        ? null
        : {
            sentiment_score: iScore,
            sentiment_label: iLabel ?? "neutral",
            primary_theme: iTheme ?? "",
            business_inefficiency: iIneff ?? null,
            feature_requests: parseList(iRequests),
            key_points: parseList(iPoints),
            executive_summary: iSummary ?? "",
          },
  }));
}

export async function getStats(sessionId?: string): Promise<SessionStats> {
  const where = sessionId ? `WHERE session_id = ?` : "";
  const params = sessionId ? [sessionId] : [];
  const [a] = await db.all<{ respondents: number; answered: number }>(
    `SELECT COUNT(DISTINCT session_response_id) AS respondents, COUNT(*) AS answered FROM responses ${where}`,
    ...params,
  );
  const done = await db.all<{ startedAt: string; completedAt: string }>(
    `SELECT started_at AS "startedAt", completed_at AS "completedAt" FROM respondents
     ${sessionId ? "WHERE session_id = ? AND" : "WHERE"} completed_at IS NOT NULL`,
    ...params,
  );
  const durations = done
    .map((r) => Date.parse(r.completedAt) - Date.parse(r.startedAt))
    .filter((ms) => Number.isFinite(ms) && ms > 0 && ms < 60 * 60 * 1000);
  const [s] = await db.all<{ avg: number | null }>(
    `SELECT AVG(i.sentiment_score) AS avg FROM ai_insights i JOIN responses r ON r.id = i.response_id
     ${sessionId ? "WHERE r.session_id = ?" : ""}`,
    ...params,
  );
  return {
    respondents: a?.respondents ?? 0,
    answered: a?.answered ?? 0,
    completed: done.length,
    avgCompletionMs: durations.length ? Math.round(durations.reduce((x, y) => x + y, 0) / durations.length) : null,
    avgSentiment: s?.avg === null || s?.avg === undefined ? null : Math.round(Number(s.avg) * 10) / 10,
  };
}

// ---------------------------------------------------------------- synthesis cache

export interface Narrative {
  heard: string;
  actions: string[];
}

export async function getCachedNarrative(sessionId: string): Promise<(Narrative & { responseCount: number; createdAt: string }) | null> {
  const [row] = await db.all<{ data: string; responseCount: number; createdAt: string }>(
    `SELECT data, response_count AS "responseCount", created_at AS "createdAt" FROM syntheses WHERE session_id = ?`,
    sessionId,
  );
  if (!row) return null;
  try {
    const data = JSON.parse(row.data) as Narrative;
    return { heard: String(data.heard ?? ""), actions: (data.actions ?? []).map(String), responseCount: row.responseCount, createdAt: row.createdAt };
  } catch {
    return null;
  }
}

export async function saveNarrative(sessionId: string, n: Narrative, responseCount: number): Promise<void> {
  await db.run(`DELETE FROM syntheses WHERE session_id = ?`, sessionId);
  await db.run(
    `INSERT INTO syntheses (session_id, response_count, data, created_at) VALUES (?, ?, ?, ?)`,
    sessionId, responseCount, JSON.stringify(n), nowIso(),
  );
}

// ---------------------------------------------------------------- demo tools

export async function clearResponses(sessionId?: string): Promise<void> {
  await db.transaction(async (d) => {
    const where = sessionId ? `WHERE session_id = ?` : "";
    const params = sessionId ? [sessionId] : [];
    await d.run(`DELETE FROM ai_insights WHERE response_id IN (SELECT id FROM responses ${where})`, ...params);
    await d.run(`DELETE FROM responses ${where}`, ...params);
    await d.run(`DELETE FROM respondents ${where}`, ...params);
    await d.run(`DELETE FROM syntheses ${where}`, ...params);
  });
}

/** Delete every Sonar, question and response. Leaves an empty workspace. */
export async function wipeAll(): Promise<void> {
  await db.transaction(async (d) => {
    for (const t of ["share_items", "themes", "ai_insights", "responses", "respondents", "syntheses", "questions", "feedback_sessions", "workspaces"]) {
      await d.run(`DELETE FROM ${t}`);
    }
  });
}

/** Wipe everything and load the demo workspace. */
export async function resetAndSeed(): Promise<void> {
  await wipeAll();

  const now = Date.now();
  const demoId = await createSession({ ...DEMO, status: "published" });
  const questions = await questionsFor(demoId);

  for (const r of DEMO_RESPONDENTS) {
    const startedMs = now - r.minutesAgo * 60_000;
    const total = r.completionSec ?? 70;
    const respondentId = await startRespondent(demoId, new Date(startedMs).toISOString());
    for (const [i, a] of r.answers.entries()) {
      const at = new Date(startedMs + ((i + 1) / r.answers.length) * total * 1000).toISOString();
      const [transcript, score, label, theme, ineff, requests, points, summary] = a;
      const words = transcript.split(/\s+/).length;
      const responseId = await createResponse({
        sessionId: demoId,
        questionId: questions[i].id,
        respondentId,
        transcript,
        inputMode: "voice",
        durationMs: Math.round((words / 2.6) * 1000),
        createdAt: at,
      });
      await saveInsight(
        responseId,
        {
          sentiment_score: score,
          sentiment_label: label,
          primary_theme: theme,
          business_inefficiency: ineff,
          feature_requests: requests,
          key_points: points,
          executive_summary: summary,
        },
        at,
        "seed",
      );
    }
    if (r.completionSec) {
      await completeRespondent(respondentId, new Date(startedMs + r.completionSec * 1000).toISOString());
    }
  }

  const count = DEMO_RESPONDENTS.reduce((n, r) => n + r.answers.length, 0);
  await saveNarrative(demoId, { heard: DEMO_SYNTHESIS.heard, actions: DEMO_SYNTHESIS.actions }, count);

  await createSession({ ...DRAFT_SONAR, status: "draft" });
  // Make the flagship demo the most recently updated so it sits at the top.
  await db.run(`UPDATE feedback_sessions SET updated_at = ? WHERE id = ?`, new Date(now + 1000).toISOString(), demoId);
}

// ---------------------------------------------------------------- shared out (Slack, Linear)

export interface ShareItem {
  id: string;
  sessionId: string;
  kind: "slack" | "linear";
  source: string;
  title: string;
  body: string;
  status: "sent" | "failed";
  externalUrl: string | null;
  error: string | null;
  createdAt: string;
  sentAt: string | null;
}

const SHARE_COLS = `id, session_id AS "sessionId", kind, source, title, body, status, external_url AS "externalUrl",
  error, created_at AS "createdAt", sent_at AS "sentAt"`;

export async function getShareItem(id: string): Promise<ShareItem | null> {
  const [row] = await db.all<ShareItem>(`SELECT ${SHARE_COLS} FROM share_items WHERE id = ?`, id);
  return row ?? null;
}

export async function listShareItems(sessionId: string): Promise<ShareItem[]> {
  return db.all<ShareItem>(`SELECT ${SHARE_COLS} FROM share_items WHERE session_id = ? ORDER BY created_at DESC LIMIT 200`, sessionId);
}

/** Record an attempt. Re-saving the same id (a retry after a failure) replaces it. */
export async function saveShareItem(item: ShareItem): Promise<void> {
  await db.transaction(async (d) => {
    await d.run(`DELETE FROM share_items WHERE id = ?`, item.id);
    await d.run(
      `INSERT INTO share_items (id, session_id, kind, source, title, body, status, external_url, error, created_at, sent_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      item.id, item.sessionId, item.kind, item.source, item.title, item.body, item.status,
      item.externalUrl, item.error, item.createdAt, item.sentAt,
    );
  });
}

// ---------------------------------------------------------------- theme library

/** "Hands-on Workshops!" and "hands on workshop" are the same theme. */
export function themeKey(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w))
    .join(" ");
}

const NOT_A_THEME = new Set(["unclear response", ""]);

/** Find the library theme for a raw label (following merges), or add it. */
async function resolveTheme(d: Driver, raw: string, statusIfNew: "active" | "suggested"): Promise<string | null> {
  const name = raw.trim().slice(0, 60);
  const key = themeKey(name);
  if (NOT_A_THEME.has(key)) return null;
  let [t] = await d.all<{ id: string; status: string; mergedIntoId: string | null }>(
    `SELECT id, status, merged_into_id AS "mergedIntoId" FROM themes WHERE workspace_id = ? AND key = ?`,
    WORKSPACE_ID,
    key,
  );
  for (let hops = 0; t?.status === "merged" && t.mergedIntoId && hops < 10; hops++) {
    [t] = await d.all<{ id: string; status: string; mergedIntoId: string | null }>(
      `SELECT id, status, merged_into_id AS "mergedIntoId" FROM themes WHERE id = ?`,
      t.mergedIntoId,
    );
  }
  if (t) return t.id;
  await ensureWorkspace(d);
  const id = newId();
  await d.run(
    `INSERT INTO themes (id, workspace_id, name, key, status, created_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (workspace_id, key) DO NOTHING`,
    id, WORKSPACE_ID, name, key, statusIfNew, nowIso(),
  );
  const [row] = await d.all<{ id: string }>(`SELECT id FROM themes WHERE workspace_id = ? AND key = ?`, WORKSPACE_ID, key);
  return row?.id ?? null;
}

/**
 * Give every analysed answer a library theme. Runs at startup and after a
 * restore, so databases from before the library existed fill it in. Existing
 * labels become active themes.
 */
export async function backfillThemes(): Promise<number> {
  const rows = await db.all<{ id: string; raw: string }>(
    `SELECT id, primary_theme AS raw FROM ai_insights WHERE theme_id IS NULL LIMIT 5000`,
  );
  let n = 0;
  for (const r of rows) {
    const themeId = await resolveTheme(db, r.raw, "active");
    if (!themeId) continue;
    await db.run(`UPDATE ai_insights SET theme_id = ? WHERE id = ?`, themeId, r.id);
    n += 1;
  }
  return n;
}

/** Names the model should reuse, most used first. */
export async function activeThemeNames(limit = 40): Promise<string[]> {
  const rows = await db.all<{ name: string }>(
    `SELECT t.name, COUNT(i.id) AS uses FROM themes t LEFT JOIN ai_insights i ON i.theme_id = t.id
     WHERE t.workspace_id = ? AND t.status = 'active'
     GROUP BY t.id, t.name ORDER BY uses DESC, t.name ASC LIMIT ${Math.min(Math.max(limit, 1), 200)}`,
    WORKSPACE_ID,
  );
  return rows.map((r) => r.name);
}

export interface ThemeSummary {
  id: string;
  name: string;
  status: "active" | "suggested";
  mentions: number;
  sonars: number;
  avgSentiment: number | null;
  lastAt: string | null;
}

export async function listThemes(): Promise<ThemeSummary[]> {
  const rows = await db.all<ThemeSummary>(
    `SELECT t.id, t.name, t.status, COUNT(i.id) AS mentions, COUNT(DISTINCT r.session_id) AS sonars,
            AVG(i.sentiment_score) AS "avgSentiment", MAX(r.created_at) AS "lastAt"
     FROM themes t
     LEFT JOIN ai_insights i ON i.theme_id = t.id
     LEFT JOIN responses r ON r.id = i.response_id
     WHERE t.workspace_id = ? AND t.status <> 'merged'
     GROUP BY t.id, t.name, t.status
     ORDER BY mentions DESC, t.name ASC`,
    WORKSPACE_ID,
  );
  return rows.map((r) => ({
    ...r,
    mentions: Number(r.mentions),
    sonars: Number(r.sonars),
    avgSentiment: r.avgSentiment === null || r.avgSentiment === undefined ? null : Math.round(Number(r.avgSentiment) * 10) / 10,
  }));
}

export async function themeQuotes(themeId: string, limit = 50) {
  return db.all<{ responseId: string; transcript: string; sentiment: number; sessionId: string; sessionTitle: string; createdAt: string }>(
    `SELECT r.id AS "responseId", r.transcript, i.sentiment_score AS sentiment, s.id AS "sessionId", s.title AS "sessionTitle",
            r.created_at AS "createdAt"
     FROM ai_insights i JOIN responses r ON r.id = i.response_id JOIN feedback_sessions s ON s.id = r.session_id
     WHERE i.theme_id = ? ORDER BY r.created_at DESC LIMIT ${Math.min(Math.max(limit, 1), 500)}`,
    themeId,
  );
}

async function liveTheme(d: Driver, id: string) {
  const [t] = await d.all<{ id: string; name: string; status: string }>(
    `SELECT id, name, status FROM themes WHERE id = ? AND workspace_id = ? AND status <> 'merged'`,
    id,
    WORKSPACE_ID,
  );
  return t ?? null;
}

/** Fold one theme into another: its answers move over, and its name keeps routing there. */
export async function mergeTheme(fromId: string, intoId: string): Promise<void> {
  if (fromId === intoId) return;
  await db.transaction(async (d) => {
    const from = await liveTheme(d, fromId);
    const into = await liveTheme(d, intoId);
    if (!from || !into) throw new Error("theme not found");
    await d.run(`UPDATE ai_insights SET theme_id = ? WHERE theme_id = ?`, intoId, fromId);
    await d.run(`UPDATE themes SET merged_into_id = ? WHERE merged_into_id = ?`, intoId, fromId);
    await d.run(`UPDATE themes SET status = 'merged', merged_into_id = ? WHERE id = ?`, intoId, fromId);
    if (into.status === "suggested") await d.run(`UPDATE themes SET status = 'active' WHERE id = ?`, intoId);
  });
}

/** Rename. If another theme already has that name, the two are merged. Returns the surviving id. */
export async function renameTheme(id: string, name: string): Promise<string> {
  const key = themeKey(name);
  if (NOT_A_THEME.has(key)) throw new Error("empty name");
  const [clash] = await db.all<{ id: string; status: string; mergedIntoId: string | null }>(
    `SELECT id, status, merged_into_id AS "mergedIntoId" FROM themes WHERE workspace_id = ? AND key = ?`,
    WORKSPACE_ID,
    key,
  );
  if (clash && clash.id !== id) {
    if (clash.status === "merged") {
      // The name belonged to a theme merged away earlier: reuse it.
      await db.run(`UPDATE themes SET key = ? WHERE id = ?`, `${key} (old ${clash.id.slice(0, 6)})`, clash.id);
    } else {
      await mergeTheme(id, clash.id);
      return clash.id;
    }
  }
  await db.run(`UPDATE themes SET name = ?, key = ?, status = 'active' WHERE id = ?`, name.trim().slice(0, 60), key, id);
  return id;
}

export async function acceptTheme(id: string): Promise<void> {
  await db.run(`UPDATE themes SET status = 'active' WHERE id = ? AND status = 'suggested'`, id);
}
