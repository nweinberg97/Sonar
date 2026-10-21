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

## Phase 1: Conversation mode with pause-triggered follow-ups ✅ built

*Highest value. This is the core experience being tested.*

**Decisions made.** Pause length 3 s. Follow-ups are written live by the open-source model from what the person has said and the creator's goal (built-in follow-ups as the fallback). Text on screen only. The creator sets a target length (30 s–5 min, default 1 min); Done appears after 30 s; recording stops at 5 min; follow-ups stop once the target is reached.

**What was built.**

- Builder: Format (Questions / Conversation), main question, "What do you want to learn?" (never shown to respondents), "How long should people talk?". Format locks once people have answered. New "Conversation" template.
- Respondent: tap once, talk. The browser captures raw audio and sends a burst every 8–15 s, cut at a breath (`useLiveCapture.ts`, `voice-activity.ts`). On a 3 s pause the next follow-up appears. Typed fallback still works.
- Server (`conversation.ts`): bursts are transcribed ahead of other Whisper work; after each one the model drafts the next follow-up (one draft at a time across everyone, always from the newest text). A pause returns the ready draft, waits up to 1.5 s for one in progress, or falls back to a built-in follow-up. Model output is cleaned and checked before it's shown. Background analysis pauses while anyone is mid-conversation. Conversations people walk away from are saved after 3 min idle. Builder previews get real follow-ups and save nothing.
- Data: `feedback_sessions.format`, `.goal`, `.target_seconds`; `responses.segments` (speech and follow-ups in order). `transcript` stays speech-only, so analysis and Insights work unchanged.
- Responses shows a conversation as a thread with each follow-up where it appeared.

**Tested.** Pause detector against synthetic loudness (steady speech, 2 s thinking pauses, silence from the start, a noisy room, non-stop speech); API flow (validation, built-in vs model follow-ups, duplicate bursts, late bursts, preview not saved, format lock, password still required); a full conversation in Chromium with a fake microphone; existing question-flow, studio and edge-case suites unchanged.

**Known limits / next to watch.**

- One primary theme per conversation: a long answer covering several topics is summarised under one theme. Phase 3 (theme library) is the natural place to split it.
- 2-core Codespace: about 3–6 s per burst and 3–5 s per draft, so one or two simultaneous talkers get model follow-ups; more get built-in ones.
- Not yet tried on real iOS Safari and Android devices. Check this first.

## Phase 2: Deployment modes (link, email, embed) and the hosting decision

**Embed built (Oct 2026).** `public/embed.js` + `/e/:slug`: a Feedback button any site adds with one script tag, `Sonar.trigger()` offers after key moments (30-day cap, 7-day snooze), health check before showing, close-mid-answer guard, shadow-DOM isolation, origin-checked messages, `frame-ancestors` limited to `/e/*` (`SONAR_EMBED_ORIGINS`), phone bottom sheet, `respondents.source`. Tested from a separate site on both databases. Still waiting on always-on hosting to be usable on real sites. Not built: passing context (plan, page) from the host app, email invites.

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

**Decision (Oct 2026): stay on Codespaces for now.** No users yet, so no always-on server. Phase 2 waits until someone wants Sonar embedded on their site; then move to a small always-on server (option 1 below).

**Ready for the move.** Switching to Postgres is one setting (`DATABASE_URL`), tested against a real Postgres 16; the move checklist is in the README ("When you're ready to move"). One limit to remember: Sonar must run as a single always-on server (not serverless, not several copies), because live conversations and queues are held in memory.

**Backlog (picked Oct 16 2026, revisit Sun Oct 18): free test hosting on Vercel + Neon + Groq.** Goal: an always-on link and a Feedback button to test inside SETI, at $0 and with no card anywhere.

- **Accounts the creator makes (~15 min):**
  - Vercel: sign in with GitHub, import the repo.
  - Neon: added from Vercel's Storage tab.
  - Groq: create an API key and paste it into Vercel's env settings.
- **Code changes (a few days):**
  - Move live-conversation state and the analysis queue out of memory into the database, so it works serverless.
  - Use Groq for transcription (whisper-large-v3-turbo) and insights.
  - Keep the self-hosted mode (local Whisper + Ollama) as an option.
  - Update the respondent privacy line: a provider transcribes, and audio is still never stored.
- **Free limits:**
  - Vercel Hobby: non-commercial use, about 4 active CPU-hours per month.
  - Neon: about 100 compute-hours per month, scales to zero when idle.
  - Groq: 2,000 audio requests per day, 20 per minute.
  - Over a limit, the service pauses; nothing is billed.
- **When to start paying:**
  - Vercel Pro ($20/month) once Sonar or SETI is commercial.
  - Groq at about $0.001 per answer, past a few hundred answers a day.

**Decisions before starting.**

- **Hosting (blocking).** A real embed needs a server that is always on, and Codespaces sleeps. The options:
  - a small always-on VPS running Whisper and Ollama (keeps everything self-hosted; roughly $5–10/month);
  - a free/cheap host with a hosted LLM (breaks the self-hosted default);
  - staying on Codespaces and only testing scheduled sessions.
- Which context keys, if any, the embed may pass in.

## Phase 3: Theme library with consistent naming ✅ built

**Built.** `themes` table (workspace-wide), `ai_insights.theme_id` (raw label kept in `primary_theme`). The model gets the active theme names and must reuse one if it fits; new ones arrive as "suggested". Library page: accept, rename (renaming to an existing name merges), merge, and every quote under a theme across Sonars. Existing answers are backfilled at startup and after a restore. Long answers covering several topics also count toward up to two extra themes (`insight_themes`), in Insights, the pulse and the Library.

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

## Phase 4: Human approval before anything leaves Sonar ✅ built

**Built.** Every Slack/Linear send is an editable preview the creator must press Send on; one server function does all outbound calls; every attempt is recorded in `share_items`. Testimonials: respondents opt in on the final screen (`respondents.quote_consent`, never assumed); Library → Testimonials shows their praise (not suggestions) to approve with light edits, turn down, or copy (`testimonials` table). Approval without consent is refused on the server.

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

## Phase 5: Weekly pulse ✅ built

**Built.** `feedback_sessions.cadence` (none/weekly) and `.timezone` (set from the creator's browser). Weeks are derived from answer timestamps (no scheduler). Insights shows a week picker, people/mood with deltas, top themes, and themes coming up more/less/new versus the previous visible week. Weeks under 3 people are hidden everywhere (including Slack drafts). "Send last week to Slack" appears when the latest finished week hasn't been sent. Not built: following the same person week to week (off by design).

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

## Phase 6: Integrations (Slack first, then Linear) ✅ built

**Built.** Slack via one incoming webhook (`SLACK_WEBHOOK_URL`); Linear via personal API key (`LINEAR_API_KEY`, optional `LINEAR_TEAM`). Settings → Integrations shows status and setup steps. A channel per Sonar: extra webhooks named `SLACK_WEBHOOK_URL_<NAME>`, picked in the builder; the destination is shown before sending. Tested against stand-in Slack and Linear services, not the real ones.

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

## Backlog: direction from the Oct 20 strategy conversation

**Principles this sets.**

- Answers are spoken, with no forms, no fields and no account details.
- Anonymous by default.
- People always know what happens to their data.
- Guided, not interviewed: one pre-written question, then a natural follow-up only when the person pauses. It never interrupts and is never a chatbot.
- Speech is transcribed **on the person's device**.
- Keep only the insights, not the audio and not the transcript.
- Cheap enough for one person to run for a long time.

**Changes these imply (where today's build differs).**

1. **On-device transcription.**
   - Today Whisper runs on Sonar's server.
   - Move it into the respondent's browser. Same open model; transformers.js runs in browsers.
   - Open questions: model download size and speed on older phones. Fallback: typing.
   - This replaces Groq for speech in the free-hosting plan (Phase 2 backlog). An AI provider is then needed only for follow-ups and insights, which receive text, never audio.
2. **Insights only, no transcripts.**
   - Today full transcripts are stored and shown in Responses, and testimonials quote them.
   - New flow: transcript → insights → transcript discarded.
   - Keep a quote only when the respondent approves that specific quote. This becomes the evidence teams can check, building on the quote-consent card.
   - Decide what Responses shows without transcripts.
3. **Organisation → brands → surveys.**
   - Today it's one workspace → Sonars.
   - Add the data model now. First UI: a brand switcher and insights per brand.
   - Later: patterns across brands.
   - Pricing idea: free for one brand, paid per added brand.
4. **Optional "leave a way to reach you"** for follow-ups. Anonymity stays the default. This connects to the post-launch personal follow-up emails.
5. **"Powered by Sonar"** on the done screen and embed, with a path to create your own Sonar (the respondent → creator loop).
6. **Opt-in inside my own apps.** Those apps promise data stays on the device, so the Feedback button there must be clearly opt-in, with a one-line explanation.
7. **Personal use: voice reflections.** Guided questions that pull out insights about yourself.

**First live test.** A "tell us what you think, just talk" button in Sedi before its Product Hunt launch. This needs the always-on hosting above, and ideally on-device transcription first, so Sedi's privacy promise holds.

**Learning to-dos (not code).**

- Talk to ~10 people who run feedback or research: what they do with responses, what they wish they had, what they'd pay to replace.
- Get a few outside teams early. My own apps teach the respondent side, not what a paying team needs.

## Premature: cut or defer, and say so if asked

- **Behavior-triggered widgets** ("show after the user does X"). These need an SDK and event tracking. A manual pop-up is enough to test.
- **Roadmap-aware timing.** Needs integrations and a theme library first.
- **Jira.** Only when a real user asks.
- **Sending emails.** Links and copy text are enough.
- **Teams, accounts, roles.** One password is fine for testing.
- **Postgres migration.** Do it only when you choose always-on hosting in Phase 2. The code is already ready for it.
- **Languages other than English.** The Whisper model is English-only.

## After launch (live backend, real link, embeds)

Waiting until Sonar is on an always-on server with real users:

- **Always-on hosting**, so the Feedback button works on real sites (the embed itself is built).
- **Personal follow-up emails:** respondents opt in to a reply ("want a reply? leave your email") or the host product passes who the customer is; Sonar drafts a reply per person from what they said, reviewed and sent by the creator. Changes the anonymity promise for those who opt in.
- **CRMs (HubSpot etc.):** save identified respondents' feedback and themes to their contact record. Depends on the opt-in above.
- **General outgoing webhook / CSV export:** one setting that covers Zapier, Make, Notion and spreadsheets.
- **Jira:** only if a user asks.
