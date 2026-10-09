/**
 * Conversation mode: one open question, with follow-ups when the person pauses.
 *
 * While someone talks, their browser sends short bursts of audio (every ~8–12
 * seconds, cut at a breath). Each burst is transcribed straight away, ahead of
 * other work, and the model drafts the next follow-up from the creator's goal
 * and everything said so far. When the person pauses, the latest draft is
 * shown instantly. If no draft is ready (model busy or off), a simple built-in
 * follow-up is used, so nobody waits.
 *
 * Privacy: audio bursts live only in memory until transcribed, then are
 * dropped. A conversation's text is held in memory until it ends, then saved
 * as one answer (transcript + the follow-ups shown, in order).
 * Preview conversations (from the builder) are never saved.
 */
import { createResponse, getRespondent, getSession, getSessionBySlug } from "../data";
import type { Segment } from "../types";
import { newId } from "../validate";
import { kickAnalysis } from "./analysis-queue";
import { aiConfig } from "./config";
import { complete, extractJson } from "./insights";
import { liveState } from "./live-state";
import { FOLLOWUP_SYSTEM_PROMPT } from "./prompts";
import { transcriptionService } from "./transcription";

/** Shown when no model draft is ready. Order matters: earlier ones first. */
export const BUILTIN_FOLLOWUPS = [
  "Can you give a specific example?",
  "How did that affect you?",
  "What would you change first?",
  "What would make the biggest difference for you?",
  "Is there anything else that stood out?",
];
const LAST_RESORT = "Anything else you'd like to add?";

const MAX_LIVE = 60; // conversations held in memory at once
const MAX_PENDING_BURSTS = 150; // across everyone; beyond this the server is overwhelmed
const IDLE_MS = 3 * 60_000; // no bursts or pauses for this long: treat as abandoned and save what we have
const FINISH_GRACE_MS = 90_000; // after "done", wait this long at most for the last bursts
const WAIT_FOR_DRAFT_MS = 1_500; // on a pause, wait this long for a draft that's being written

interface Burst {
  atMs: number;
  text: string | null;
  done: boolean;
}

interface Shown {
  text: string;
  atMs: number;
  by: "ai" | "builtin";
}

interface Live {
  id: string;
  preview: boolean;
  sessionId: string;
  questionId: string;
  question: string;
  goal: string;
  targetSeconds: number;
  respondentId: string | null;
  bursts: Map<number, Burst>;
  shown: Shown[];
  /** Latest model-written follow-up, not shown yet. */
  draft: string | null;
  /** Bumped every time a follow-up is shown, so drafts started before it are discarded. */
  gen: number;
  elapsedMs: number;
  finish: { durationMs: number; expected: number; at: number } | null;
  saved: boolean;
  lastSeen: number;
}

const lives = new Map<string, Live>();
let pendingBursts = 0;

export class ConversationError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

function touch(live: Live) {
  live.lastSeen = Date.now();
  liveState.lastActivityAt = live.lastSeen;
}

// ---------------------------------------------------------------- opening

/** A real respondent's conversation, created on their first burst or pause. */
export async function openLive(liveId: string): Promise<Live> {
  const existing = lives.get(liveId);
  if (existing) {
    if (existing.saved) throw new ConversationError("This conversation has already been sent.", 409);
    return existing;
  }
  if (liveId.startsWith("p")) throw new ConversationError("This preview has ended. Reload the preview to try again.", 404);
  const respondent = await getRespondent(liveId);
  if (!respondent) throw new ConversationError("We couldn't find your session. Refresh the page to start again.", 404);
  if (respondent.completedAt) throw new ConversationError("This conversation has already been sent.", 409);
  const session = await getSession(respondent.sessionId);
  if (!session || session.format !== "conversation" || !session.questions[0]) {
    throw new ConversationError("This Sonar doesn't take conversations.", 400);
  }
  if (session.status !== "published") throw new ConversationError("This Sonar isn't taking responses right now.", 409);
  return register({
    id: liveId,
    preview: false,
    respondentId: liveId,
    sessionId: session.id,
    questionId: session.questions[0].id,
    question: session.questions[0].text,
    goal: session.goal,
    targetSeconds: session.targetSeconds,
  });
}

/** A builder preview: follow-ups work, nothing is saved. */
export async function openPreview(slug: string): Promise<string> {
  const session = await getSessionBySlug(slug);
  if (!session || session.format !== "conversation" || !session.questions[0]) {
    throw new ConversationError("This Sonar doesn't take conversations.", 404);
  }
  if (session.status === "closed") throw new ConversationError("This Sonar is closed.", 410);
  const live = register({
    id: `p${newId()}`,
    preview: true,
    respondentId: null,
    sessionId: session.id,
    questionId: session.questions[0].id,
    question: session.questions[0].text,
    goal: session.goal,
    targetSeconds: session.targetSeconds,
  });
  return live.id;
}

function register(base: Pick<Live, "id" | "preview" | "respondentId" | "sessionId" | "questionId" | "question" | "goal" | "targetSeconds">): Live {
  if (lives.size >= MAX_LIVE) {
    sweep();
    if (lives.size >= MAX_LIVE) throw new ConversationError("A lot of people are talking right now. Please try again in a minute.", 503);
  }
  const live: Live = { ...base, bursts: new Map(), shown: [], draft: null, gen: 0, elapsedMs: 0, finish: null, saved: false, lastSeen: Date.now() };
  touch(live);
  lives.set(live.id, live);
  startSweeper();
  return live;
}

// ---------------------------------------------------------------- bursts

export function addBurst(live: Live, burst: { seq: number; atMs: number; durationMs: number; audio: Blob }): void {
  if (live.saved) throw new ConversationError("This conversation has already been sent.", 409);
  if (live.bursts.has(burst.seq)) return; // a retried upload that already arrived
  if (pendingBursts >= MAX_PENDING_BURSTS) throw new ConversationError("We're getting a lot of answers right now.", 503);
  touch(live);
  live.elapsedMs = Math.max(live.elapsedMs, burst.atMs + burst.durationMs);
  const entry: Burst = { atMs: burst.atMs, text: null, done: false };
  live.bursts.set(burst.seq, entry);
  pendingBursts += 1;
  void transcribeBurst(live, entry, burst.audio, burst.durationMs);
}

async function transcribeBurst(live: Live, entry: Burst, audio: Blob, durationMs: number) {
  const input = { audio, filename: "burst.wav", durationMs, question: live.question, priority: "urgent" as const };
  try {
    entry.text = await transcriptionService.transcribe(input);
  } catch (err) {
    console.error("[sonar] couldn't transcribe part of a conversation, retrying once:", err);
    try {
      entry.text = await transcriptionService.transcribe(input);
    } catch (err2) {
      console.error("[sonar] part of a conversation couldn't be transcribed and was skipped:", err2);
      entry.text = "";
    }
  } finally {
    entry.done = true;
    pendingBursts -= 1;
  }
  if (!live.finish && entry.text) requestDraft(live);
  maybeFinalize(live);
}

function speechSoFar(live: Live): string {
  return [...live.bursts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, b]) => b.text ?? "")
    .filter(Boolean)
    .join(" ");
}

// ---------------------------------------------------------------- drafting follow-ups

// One draft at a time across everyone (the model is the bottleneck). Each
// conversation appears at most once in the queue, and its draft always uses
// the newest text at the moment it's written.
const draftQueue: string[] = [];
let drafting: { id: string; done: Promise<void> } | null = null;

function requestDraft(live: Live) {
  if (aiConfig().provider === "mock") return; // built-in follow-ups only
  if (!draftQueue.includes(live.id)) draftQueue.push(live.id);
  if (!drafting) void drainDrafts();
}

async function drainDrafts() {
  while (draftQueue.length) {
    const live = lives.get(draftQueue.shift()!);
    if (!live || live.finish || live.saved) continue;
    const done = draftFor(live).catch((err) => console.error("[sonar] follow-up draft failed:", (err as Error).message));
    drafting = { id: live.id, done };
    await done;
  }
  drafting = null;
}

async function draftFor(live: Live) {
  const said = speechSoFar(live);
  if (!said) return;
  const gen = live.gen;
  const out = await complete(FOLLOWUP_SYSTEM_PROMPT, followupInput(live, said), { temperature: 0.5, maxTokens: 60, timeoutMs: 20_000 });
  if (live.gen !== gen) return; // a follow-up was shown while this was being written
  const text = coerceFollowup(out, live.shown.map((s) => s.text));
  if (text) live.draft = text;
}

function followupInput(live: Live, said: string): string {
  const shown = live.shown.length ? live.shown.map((s) => `- ${s.text}`).join("\n") : "(none yet)";
  const recent = said.length > 2500 ? `…${said.slice(-2500)}` : said;
  return [
    `Main question: ${live.question}`,
    `What the person asking for feedback wants to learn: ${live.goal || "Not specified. Aim for concrete, useful detail."}`,
    `Time so far: about ${Math.round(live.elapsedMs / 1000)} seconds of a ${live.targetSeconds}-second conversation.`,
    `Follow-ups already shown:\n${shown}`,
    `What they've said so far:\n"""\n${recent}\n"""`,
  ].join("\n\n");
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim();

/** Never trust model output on a respondent's screen: one short, clean question or nothing. */
export function coerceFollowup(raw: string, shown: string[]): string | null {
  let text = "";
  try {
    const o = extractJson(raw) as Record<string, unknown>;
    text = typeof o.followup === "string" ? o.followup : "";
  } catch {
    text = raw;
  }
  text = text.replace(/\s+/g, " ").replace(/^[\s"'“”‘’*-]+|[\s"'“”‘’*]+$/g, "").trim();
  const q = text.indexOf("?");
  if (q === -1) return null;
  text = text.slice(0, q + 1);
  // Keep only the last sentence before the "?" (drops "Great point! " style lead-ins).
  const lastStop = Math.max(text.lastIndexOf(". "), text.lastIndexOf("! "));
  if (lastStop > 0) text = text.slice(lastStop + 2);
  const words = text.split(" ").length;
  if (text.length < 8 || text.length > 120 || words < 3 || words > 20) return null;
  if (/https?:|www\.|@|[<>{}]|\b(e-?mail|phone|your name|address|employer)\b/i.test(text)) return null;
  if (shown.some((s) => norm(s) === norm(text))) return null;
  return text[0].toUpperCase() + text.slice(1);
}

// ---------------------------------------------------------------- pauses

/** The person paused: return the follow-up to show, and remember it. */
export async function nextFollowup(live: Live, elapsedMs: number): Promise<Shown> {
  if (live.saved || live.finish) throw new ConversationError("This conversation has already been sent.", 409);
  touch(live);
  live.elapsedMs = Math.max(live.elapsedMs, elapsedMs);
  // A draft for this person is being written right now: give it a moment.
  const inFlight = drafting;
  if (!live.draft && inFlight?.id === live.id) {
    await Promise.race([inFlight.done, new Promise((r) => setTimeout(r, WAIT_FOR_DRAFT_MS))]);
  }
  let shown: Shown;
  if (live.draft) {
    shown = { text: live.draft, atMs: elapsedMs, by: "ai" };
  } else {
    const used = new Set(live.shown.map((s) => norm(s.text)));
    const text = BUILTIN_FOLLOWUPS.find((f) => !used.has(norm(f))) ?? LAST_RESORT;
    shown = { text, atMs: elapsedMs, by: "builtin" };
  }
  live.shown.push(shown);
  live.draft = null;
  live.gen += 1;
  // Have a fresh one ready for the next pause, using everything said so far.
  if (speechSoFar(live)) requestDraft(live);
  return shown;
}

// ---------------------------------------------------------------- finishing

/** The person tapped Done (or hit the time limit). Saves once the last bursts are transcribed. */
export function finishLive(live: Live, durationMs: number, expectedBursts: number): void {
  if (live.saved) return;
  if (!live.finish) {
    live.finish = { durationMs, expected: Math.max(0, Math.min(1000, expectedBursts)), at: Date.now() };
    if (!live.preview) bumpFinishing(live.sessionId, 1);
  }
  maybeFinalize(live);
}

function bumpFinishing(sessionId: string, by: number) {
  const n = (liveState.finishingBySession.get(sessionId) ?? 0) + by;
  if (n <= 0) liveState.finishingBySession.delete(sessionId);
  else liveState.finishingBySession.set(sessionId, n);
}

function maybeFinalize(live: Live) {
  if (!live.finish || live.saved) return;
  const allIn = live.bursts.size >= live.finish.expected && [...live.bursts.values()].every((b) => b.done);
  const timedOut = Date.now() - live.finish.at > FINISH_GRACE_MS && [...live.bursts.values()].every((b) => b.done);
  if (allIn || timedOut) void finalize(live);
}

/** Speech and follow-ups in the order they happened. Neighbouring speech is merged into one paragraph. */
export function buildSegments(bursts: { atMs: number; text: string | null }[], shown: Shown[]): Segment[] {
  const events: Segment[] = [
    ...bursts.filter((b) => b.text).map((b) => ({ t: "speech" as const, text: b.text!, atMs: b.atMs })),
    ...shown.map((s) => ({ t: "followup" as const, text: s.text, atMs: s.atMs, by: s.by })),
  ].sort((a, b) => a.atMs - b.atMs);
  const out: Segment[] = [];
  for (const e of events) {
    const prev = out[out.length - 1];
    if (e.t === "speech" && prev?.t === "speech") prev.text = `${prev.text} ${e.text}`;
    else out.push({ ...e });
  }
  // A follow-up nobody answered (they tapped Done right after) adds nothing.
  while (out.length && out[out.length - 1].t === "followup") out.pop();
  return out;
}

async function finalize(live: Live) {
  if (live.saved) return;
  live.saved = true;
  lives.delete(live.id);
  if (live.finish && !live.preview) bumpFinishing(live.sessionId, -1);
  if (live.preview || !live.respondentId) return;

  const ordered = [...live.bursts.entries()].sort((a, b) => a[0] - b[0]).map(([, b]) => b);
  const segments = buildSegments(ordered, live.shown);
  const transcript = segments
    .filter((s) => s.t === "speech")
    .map((s) => s.text)
    .join(" ")
    .trim();
  if (!transcript) {
    console.warn("[sonar] a conversation had no detectable speech; nothing saved for it.");
    return;
  }
  try {
    await createResponse({
      sessionId: live.sessionId,
      questionId: live.questionId,
      respondentId: live.respondentId,
      transcript: transcript.slice(0, 20_000),
      inputMode: "voice",
      durationMs: live.finish?.durationMs || live.elapsedMs,
      segments,
    });
    kickAnalysis();
  } catch (err) {
    console.error("[sonar] couldn't save a conversation:", err);
  }
}

// ---------------------------------------------------------------- housekeeping

let sweeper: ReturnType<typeof setInterval> | null = null;

function startSweeper() {
  if (sweeper) return;
  sweeper = setInterval(sweep, 30_000);
  sweeper.unref?.();
}

/** Save conversations people walked away from, and any whose last bursts never arrived. */
function sweep() {
  const now = Date.now();
  for (const live of lives.values()) {
    if (!live.finish && now - live.lastSeen > IDLE_MS) finishLive(live, live.elapsedMs, live.bursts.size);
    else maybeFinalize(live);
  }
}

/** For tests and the status page. */
export function liveSummary() {
  return { conversations: lives.size, pendingBursts, drafting: drafting !== null, queuedDrafts: draftQueue.length };
}
