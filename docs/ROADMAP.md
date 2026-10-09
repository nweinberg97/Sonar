# Sonar roadmap

## Context

You're working in `nweinberg97/Sonar`, a voice-first feedback prototype.

- **Stack:** Next.js 15 (App Router), TypeScript, Tailwind v4, Prisma on SQLite.
- **Transcription:** local Whisper via transformers.js, running in a background voice queue.
- **Insights:** Ollama `llama3.2:3b`, running in a background analysis queue.
- **Hosting:** GitHub Codespaces.

Read `README.md`, `prisma/schema.prisma`, `src/lib/data.ts`, `src/lib/db.ts`, `src/lib/services/*` and `src/components/respondent/RespondentFlow.tsx` before you change anything.

## Rules for every phase

1. **Don't break what works.**
   - Existing question-list Sonars, `/s/:slug` links, instant send, backups/undo and the creator password must behave exactly as they do today.
   - New behavior is opt-in per Sonar. The defaults reproduce current behavior.
2. **Stay free, stay portable.**
   - All SQL lives in `src/lib/data.ts` and goes through `src/lib/db.ts`, using syntax both SQLite and Postgres accept.
   - Schema changes go in `prisma/schema.prisma`. New columns are nullable or have defaults, so existing databases upgrade with `prisma db push`.
   - Anything scheduled sits behind one small job interface. It runs as an in-process timer now and can become a cron call later.
3. **Privacy.**
   - Never store audio.
   - Respondents stay anonymous: no names, emails or accounts.
   - Models are self-hosted by default. Hosted providers stay opt-in through env vars.
   - Secrets go in `.env`, never in the database or the client.
4. **Simplest version that proves the idea.** If a feature needs a new external account, a paid service, or real-time AI on CPU, stop and ask.
5. **One phase at a time.**
   - Finish a phase, run `npm run build` and a type-check, walk through it manually, commit, then stop and report.
   - Report what changed, how to test it, and the open decisions for the next phase.
   - Do not start the next phase without approval.

## Phase 0: Groundwork (small)

- Fix outdated README lines: the review step and "Record again" no longer exist.
- Confirm a fresh Codespace still boots cleanly with `npm run serve`.
- Add a short `docs/ROADMAP.md` that mirrors this plan, so future sessions have it in the repo.

**Acceptance:** no behavior changes, and the build passes.

## Phase 1: Conversation mode with pause-triggered follow-ups

*Highest value. This is the core experience being tested.*

**Goal.** Test whether one open prompt plus gentle nudges gets richer answers than a list of questions.

**User-facing behavior.**

- **Creator side:** the creator picks a format, either "Questions" (today's default) or "Conversation". A Conversation Sonar has one main prompt and 2–4 short follow-ups that the creator writes. Templates prefill sensible ones.
- **Respondent side:**
  - The respondent taps the mic once and talks.
  - After they've spoken for a bit and then gone quiet for about 3 seconds, the next follow-up fades in on screen as text.
  - They keep talking, or tap "I'm done", which is always visible.
  - It feels like one continuous recording.

**How it works (keep it simple).**

- Pause detection runs in the browser, using the analyser that already drives the waveform. No server round trip.
- The silence threshold adapts to the room's noise floor.
- When a follow-up appears, the client quietly ends the current clip and starts a new one. Each segment uploads through the existing `/api/voice-answers` as its own answer to that follow-up. Transcription, analysis and insights work unchanged.
- Cap each conversation at about 3 minutes. Whisper's 30-second chunking is already on, so longer clips are fine.

**Data model.**

- `FeedbackSession.format`: `"questions"` (default) or `"conversation"`.
- `Question.kind`: `"question"` (default), `"prompt"` or `"followup"`.
- `Response.trigger`, nullable: `"pause"`, `"tap"` or `"done"`. Records what moved the respondent on.

**Acceptance criteria.**

- Question-mode Sonars are unchanged.
- A follow-up never appears mid-speech, never before about 5 seconds of speech, and never more than once per pause. Each follow-up is shown only once.
- "I'm done" always works. Every segment arrives. None are lost if the respondent finishes quickly.
- Responses view shows a conversation as one thread, in order, with each follow-up labeled.
- The typed fallback still works.
- It works on iOS Safari and Android Chrome.

**What to test.**

- A unit test for the pause detector using synthetic level sequences: steady speech, thinking pauses, a noisy room, silence from the start.
- Real phones in a quiet room and in a noisy one.
- Someone who pauses to think: how often does a follow-up interrupt them?
- Compare words per respondent and completion rate against a Questions-mode Sonar with the same topic.

**Decisions before starting.**

- Pause length (suggest 3 s) and minimum speech before the first follow-up (suggest 5 s).
- Follow-ups written by the creator (recommended) or fixed defaults only.
- Text only (recommended) or also spoken aloud.
- Maximum length.

## Phase 2: Deployment modes (link, email, embed) and the hosting decision

**Goal.** Let feedback be collected where people already are.

**User-facing behavior.**

- **Email invite:** no sending. The creator copies a link tagged `?src=email`, plus a short invite text.
- **Embed:** a compact `/e/:slug` view with no site chrome. The creator copies an iframe snippet. When the respondent finishes, the page posts a `sonar:done` message so the host site can close its pop-up.
- **In-app widget:** the same embed launched by a small floating button script. Build this only after the iframe version works.

**Data model.**

- `Respondent.source`: `"link"`, `"email"`, `"embed"` or `"widget"`. Default `"link"`.
- Optional `Respondent.context` (JSON). It accepts only keys the creator allows per Sonar, such as `page` or `plan`, and is validated so it can't carry personal data.

**Technical notes.**

- `next.config.ts` currently sends `Permissions-Policy: microphone=(self)` on every path. That header blocks the mic inside a cross-origin iframe.
- Loosen it **only** for `/e/*`, using an allowlist of permitted parent sites from `.env`.
- Add CSP `frame-ancestors` so creator pages can never be framed.
- The host iframe needs `allow="microphone"`.

**Acceptance criteria.**

- The embed works from a test page on a different origin, on desktop and on phones.
- The done event fires.
- Creator pages refuse to be framed.
- `/s/` links behave exactly as before.

**Decisions before starting.**

- **Hosting (blocking).** A real embed needs a server that is always on, and Codespaces sleeps. The options:
  - a small always-on VPS running Whisper and Ollama (keeps everything self-hosted; roughly $5–10/month);
  - a free/cheap host with a hosted LLM (breaks the self-hosted default);
  - staying on Codespaces and only testing scheduled sessions.
- Which context keys, if any, the embed may pass in.

## Phase 3: Theme library with consistent naming

*Foundation for everything after it.*

**Goal.** The same idea gets the same name across answers and across Sonars, so counts, pulses and tickets can be trusted.

**User-facing behavior.**

- A **Library** page lists the workspace's themes. Each theme shows its mentions over time, its sentiment mix, and every quote, across all Sonars.
- The creator can rename a theme, merge two themes, or archive one.
- New themes the model suggests show up as "Suggested" until the creator accepts them.

**How it works.**

- The analysis prompt receives the current theme list and must choose from it, or suggest a new one.
- Output that isn't on the list falls back to a suggestion and never creates a theme silently.
- Keep the model's raw label as well, for debugging.

**Data model.**

- New `themes` table: `id`, `workspaceId`, `name`, `description`, `status` (`active`, `suggested`, `merged` or `archived`), `mergedIntoId`.
- New nullable `ai_insights.theme_id`. Keep `primary_theme` as the raw label.
- Add a one-time backfill that maps existing insights to themes.

**Acceptance criteria.**

- Re-analyzing the demo data produces a small, stable set of themes; target ≤ 8.
- A merge updates counts on Insights and in the Library instantly.
- No insight is ever lost or left unassigned. Unmatched ones show as "Unsorted".
- The backfill is reversible through the existing backup/undo.

**What to test.**

- Run the same 20 answers through analysis twice and compare the labels.
- Merge, then undo.
- Feed the 3B model off-list answers.

**Decisions before starting.**

- Workspace-wide themes (recommended) or per-Sonar themes.
- Whether to seed a starter list per template.

## Phase 4: Human approval before anything leaves Sonar

**Goal.** Nothing is used publicly or sent to another tool without a person approving it.

**User-facing behavior.**

- A **Ready to share** queue holds drafts: quotes for testimonials, ticket drafts, and pulse summaries.
- Each draft can be approved, edited or rejected.
- Rejected drafts stay visible with their reason.

**Data model.**

- New `share_items` table: `id`, `kind` (`quote`, `ticket` or `pulse`), source references, `draft` (JSON), `edited_text`, `status` (`draft`, `approved`, `rejected` or `sent`), timestamps, `external_url`.
- Optional `Respondent.quote_consent`, set from an end-of-flow checkbox: "OK to quote my words anonymously."

**Acceptance criteria.**

- Exactly one server function can send anything outbound, and it refuses items that aren't approved.
- Quotes from respondents who didn't consent can't be marked as testimonials.
- Every approval and edit is recorded.

**Decisions before starting.**

- Ask for quote consent: yes (recommended) or no.
- Is "positioning" (the words customers use) a view you'll actually use yet?

## Phase 5: Weekly pulse

**Goal.** A repeat check-in that shows change over time.

**User-facing behavior.**

- The creator sets a Sonar to "Weekly". It's the same link every week.
- Insights gain a week picker and a "vs last week" comparison: themes up or down, sentiment shift.
- A pulse summary is drafted into the approval queue each week.
- **"Per team" is just one Sonar per team.** Don't build a teams model.

**How it works.**

- The week is derived from the answer's timestamp, so tagging needs no scheduler and survives Codespaces sleeping.
- Only the weekly summary draft uses the job interface, with a catch-up run on startup for missed weeks.

**Data model.**

- `FeedbackSession.cadence`: `"none"` (default) or `"weekly"`.
- Optional indexed `Respondent.period` (for example `2026-W41`) for fast queries.

**Privacy.**

- Hide any week with fewer than 3 responses, so small teams can't identify people.
- Following the same person week to week needs a persistent anonymous ID in the browser. That is a decision; default it to off.

**Acceptance criteria.**

- Weeks with too few responses are hidden.
- The comparison is correct across a week boundary in the user's timezone.
- A missed week is caught up after a restart.

**Decisions before starting.**

- The minimum response threshold.
- Whether to follow the same person week to week.
- The timezone that defines a "week".

## Phase 6: Integrations (Slack first, then Linear)

**Goal.** Approved items land where teams already work.

**User-facing behavior.**

- **Slack:** "Send to Slack" on an approved pulse or quote. Uses an incoming webhook URL in `.env`; no OAuth app.
- **Linear:** "Create issue" on an approved ticket draft. Uses an API key in `.env`; the issue links back to the quotes.
- These buttons are hidden when no key is set.

**Data model.** Add `external_url` and `sent_at` to `share_items` (already planned above).

**Acceptance criteria.**

- Only approved items can be sent.
- A failed send keeps the item, shows the error, and can be retried.
- Nothing is sent twice.

**Decisions before starting.** Which tool your first real team actually uses.

## Premature: cut or defer, and say so if asked

- **AI-written live follow-ups.** The model would need to read the transcript mid-answer, and a 3B model on CPU is too slow for that today. Creator-written follow-ups prove the idea first.
- **Behavior-triggered widgets** ("show after the user does X"). These need an SDK and event tracking. A manual pop-up is enough to test.
- **Roadmap-aware timing.** Needs integrations and a theme library first.
- **Jira.** Only when a real user asks.
- **Sending emails.** Links and copy text are enough.
- **Teams, accounts, roles.** One password is fine for testing.
- **Postgres migration.** Do it only when you choose always-on hosting in Phase 2. The code is already ready for it.
- **Languages other than English.** The Whisper model is English-only.
