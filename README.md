# Sonar

Feedback you can just say out loud.

Sonar is a prototype for one question: **is giving feedback by speaking genuinely easier than filling out a survey?** A respondent opens a link, taps the mic, talks, and moves on. The creator gets transcripts, per-answer signals and a short synthesis of what to do next.

## Run it

**To test with real people for free, use GitHub Codespaces.** Step-by-step guide: [CODESPACES.md](CODESPACES.md). Short version: Code → Codespaces → Create codespace, copy the password it prints, set port 3000 to Public, share your Sonar's link.

**On your own computer:**

```bash
npm install
npm run dev
```

Open http://localhost:3000 and sign in with the password printed in the terminal (any username). On first run Sonar creates `.env`, generates that password, builds a local SQLite database, loads the demo workspace and starts downloading the speech model in the background. No accounts or API keys needed.

- **Creator workspace:** `/feedback` (password protected)
- **Respondent link (demo):** `/s/northline-community` (open to anyone)

Requires Node 22+. Phones only allow the microphone over https, so for phone testing use Codespaces (or any https tunnel to your machine).

## Two formats

- **Questions:** a short list of questions, one recording each (the original flow).
- **Conversation:** one main question, then the person just talks. When they pause for 3 seconds, a follow-up appears on screen, written by the open-source model from what they've said and from **what you want to learn** (set in the builder, never shown to respondents). You also set **how long people should talk** (30 seconds to 5 minutes, default 1 minute): follow-ups keep people going until then, then the screen invites them to wrap up. Done appears after 30 seconds; recording stops at 5 minutes.

How a conversation stays instant on a small server: while someone talks, their browser sends a short burst of audio every 8–15 seconds, cut at a breath. Each burst is transcribed straight away (ahead of other work) and the model drafts the next follow-up in the background, so when they pause it's already waiting. If no draft is ready (the model is busy or off), a simple built-in follow-up is shown instead, so nobody waits. Background analysis of other answers pauses while anyone is mid-conversation. The finished conversation is saved as one answer: the transcript, plus each follow-up at the point it appeared (Responses shows it as a thread). The builder's preview runs real follow-ups without saving anything. Logic lives in `src/lib/services/conversation.ts`, the follow-up prompt in `src/lib/services/prompts.ts`, and the pause detector in `src/components/voice-activity.ts`.

On a free 2-core Codespace, a burst takes roughly 3–6 seconds to transcribe and a follow-up 3–5 seconds to draft: comfortable for one or two people talking at once. Beyond that, people get more of the built-in follow-ups.

## Speech to text: open source by default

Sonar transcribes with **Whisper**, OpenAI's open-source speech model, running **on your own server** through Hugging Face's [transformers.js](https://github.com/huggingface/transformers.js). Free, no key, no third party hears the audio.

- The browser converts each recording to 16 kHz WAV, the server transcribes it in memory and discards it.
- The model (`Xenova/whisper-base.en`, about 80 MB quantized) downloads once into `./.models`. `npm run whisper:prefetch` fetches it ahead of time; `TRANSCRIPTION_OFFLINE=true` then blocks any further downloads. Pin `TRANSCRIPTION_MODEL_REVISION` to a commit hash if you want downloads to be reproducible.
- Speed vs accuracy: `TRANSCRIPTION_MODEL=Xenova/whisper-tiny.en` is faster, `Xenova/whisper-small.en` is more accurate.
- `TRANSCRIPTION_PROVIDER=mock` gives sample transcripts for offline demos. `openai` or `groq` (with `TRANSCRIPTION_API_KEY`) use hosted Whisper instead.

## Insights: an open-source model, in the background

Each transcript is analyzed by **Llama 3.2 (3B)**, an open-source model run by [Ollama](https://ollama.com) on the same machine as Sonar. It reads the answer the way a person would, so it catches meaning however people phrase it, and returns sentiment, theme, friction, requests, key points and a one-line summary (prompt in `src/lib/services/prompts.ts`).

- **Nobody waits for it.** Answers are saved instantly; a background queue (`src/lib/services/analysis-queue.ts`) analyzes them one by one. On a 2-core Codespace that's roughly 10–30 seconds an answer. Responses and Insights refresh themselves while it works.
- **Nothing gets lost.** If Ollama isn't running, the queue uses Sonar's built-in rule-based extractor and tries the model again 5 minutes later. Each insight records which engine wrote it.
- **In a Codespace it's automatic:** Ollama and the model install when the Codespace is created and start with Sonar. On your own computer, install Ollama and run `ollama pull llama3.2:3b`.
- Other options: `AI_MODEL=qwen2.5:3b` or `llama3.2:1b` (faster), `AI_PROVIDER=mock` (built-in extractor only), or hosted models (`anthropic`, `openai`, `groq` with `AI_API_KEY`).

## Running experiments

**Settings → Backups and undo:** automatic database snapshots (hourly when anything changed, and before every reset, delete or restore), **Undo last reset**, **Restore** any snapshot, and **Download** a copy. Restores happen while Sonar runs, and each one saves the current state first, so it can be undone too.

**Settings → Testing tools** (on by default via `SONAR_DEMO_TOOLS=true` in `.env`):

- Generate sample responses for any Sonar
- Clear a Sonar's responses
- Reset everything to the Northline Community demo

From the terminal: `npm run db:reset` wipes and reseeds the database.

## How it works

```
Browser (MediaRecorder + live analyser)
  └─ POST /api/voice-answers  accepted instantly; respondent moves straight on
       background: Whisper → transcript saved (audio kept in memory only until then)
  └─ POST /api/answers     transcript saved to SQLite instantly
       background queue → insightService.analyzeLive() (Ollama) → insight saved
Creator
  └─ GET  /api/sessions/:id/insights  counts themes, requests and friction across answers,
                                      then insightService.synthesize() writes the summary and actions
```

| Path | What's there |
| --- | --- |
| `src/components/respondent/RespondentFlow.tsx` | The respondent experience: intro, recording, instant send, typed fallback, completion |
| `src/components/respondent/ConversationStage.tsx`, `useLiveCapture.ts`, `voice-activity.ts` | Conversation mode: live audio bursts, pause detection, follow-ups |
| `src/lib/services/conversation.ts` | Live conversations on the server: burst transcription, follow-up drafting, saving the thread |
| `src/components/useRecorder.ts`, `Waveform.tsx` | Mic capture and the real-input waveform |
| `src/components/studio/*` | Creator workspace: feedback list, builder, responses, insights, settings |
| `src/lib/services/transcription.ts` | `transcriptionService` with local Whisper, mock, OpenAI and Groq providers |
| `src/lib/services/whisper-local.ts` | Open-source Whisper on the server (transformers.js) |
| `src/middleware.ts` | Creator password |
| `src/lib/services/insights.ts` | `insightService.analyze()` and `.synthesize()`: built-in extractor, Ollama, Anthropic, OpenAI-compatible |
| `src/lib/services/prompts.ts` | The extraction and synthesis system prompts. Iterate here between test rounds. |
| `src/lib/services/mock.ts` | Demo transcripts and the offline extractor |
| `src/lib/data.ts` | Every database query, as plain SQL |
| `src/lib/seed-data.ts` | The Northline Community demo dataset |
| `prisma/schema.prisma` | Schema: workspaces, feedback sessions, questions, respondents, responses, AI insights, syntheses |

### Moving off SQLite later (Supabase / Postgres)

Every query lives in `src/lib/data.ts` and goes through the tiny driver in `src/lib/db.ts`, which already rewrites placeholders for Postgres. To switch:

1. In `prisma/schema.prisma`, change `provider = "sqlite"` to `provider = "postgresql"`.
2. Set `DATABASE_URL` to your Postgres connection string (Supabase: Project settings → Database).
3. Run `npx prisma db push`, then `npm run db:seed` if you want the demo data.

Nothing else in the app changes: the SQL sticks to syntax both databases share (quoted column aliases, `ON CONFLICT`, plain aggregates).

### Privacy and security

- **Transcript-first, audio-ephemeral.** With local Whisper, audio exists only in the browser and in the server's memory until it's transcribed (for conversations, burst by burst). It never reaches a third party and is never written to disk.
- **Anonymous respondents.** A random id groups one person's answers. No name, email or account.
- **Creator side is password-protected** (`SONAR_PASSWORD`, generated on first run). Respondent pages and the endpoints they use are the only open routes.
- **Follow-ups are checked before anyone sees them:** one short question, no links, never asking for personal details, never a repeat. Anything else is replaced by a built-in follow-up.
- **Rate limits** on the public endpoints, so one visitor can't tie up the server.
- Server-side validation on every input, secrets stay on the server, the browser never touches the database.
- This is a prototype: it avoids obvious mistakes but makes no compliance claims.

### Not built, on purpose

User accounts (one shared creator password instead), billing, branching logic, integrations, exports, permanent audio storage. What's planned next, in order: [docs/ROADMAP.md](docs/ROADMAP.md).

## What to watch in user tests

- Do people tap the mic without being told to?
- How long are spoken answers compared with what they'd type?
- How often do they switch to typing instead of speaking?
- Conversation vs Questions on the same topic: words per person, completion rate, and whether follow-ups get useful detail or interrupt people who were just thinking
- Average completion time (shown on Responses)
- Whether the creator can say what to do next from the Insights page alone
