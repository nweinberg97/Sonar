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
- **Respondent link (demo):** `/s/forth-community` (open to anyone)

Requires Node 20+. Phones only allow the microphone over https, so for phone testing use Codespaces (or any https tunnel to your machine).

## Speech to text: open source by default

Sonar transcribes with **Whisper**, OpenAI's open-source speech model, running **on your own server** through Hugging Face's [transformers.js](https://github.com/huggingface/transformers.js). Free, no key, no third party hears the audio.

- The browser converts each recording to 16 kHz WAV, the server transcribes it in memory and discards it.
- The model (`Xenova/whisper-base.en`, about 80 MB quantized) downloads once into `./.models`. `npm run whisper:prefetch` fetches it ahead of time; `TRANSCRIPTION_OFFLINE=true` then blocks any further downloads. Pin `TRANSCRIPTION_MODEL_REVISION` to a commit hash if you want downloads to be reproducible.
- Speed vs accuracy: `TRANSCRIPTION_MODEL=Xenova/whisper-tiny.en` is faster, `Xenova/whisper-small.en` is more accurate.
- `TRANSCRIPTION_PROVIDER=mock` gives sample transcripts for offline demos. `openai` or `groq` (with `TRANSCRIPTION_API_KEY`) use hosted Whisper instead.

**Insights** use Sonar's built-in extractor by default, also free and local. Optional upgrades: `AI_PROVIDER=ollama` for an open-source model on your own machine ([Ollama](https://ollama.com), no key), or `anthropic`, `openai`, `groq` with `AI_API_KEY`. If a model call fails, Sonar falls back to the built-in extractor rather than losing the answer.

## Running experiments

**Settings → Testing tools** (on by default via `SONAR_DEMO_TOOLS=true` in `.env`):

- Generate sample responses for any Sonar
- Clear a Sonar's responses
- Reset everything to the Forth Community demo

From the terminal: `npm run db:reset` wipes and reseeds the database.

## How it works

```
Browser (MediaRecorder + live analyser)
  └─ POST /api/transcribe  audio held in memory → transcriptionService.transcribe() → transcript
       (audio is never written to disk or the database)
  └─ POST /api/answers     transcript → insightService.analyze() → SQLite
Creator
  └─ GET  /api/sessions/:id/insights  counts themes, requests and friction across answers,
                                      then insightService.synthesize() writes the summary and actions
```

| Path | What's there |
| --- | --- |
| `src/components/respondent/RespondentFlow.tsx` | The respondent experience: intro, recording, processing, review, typed fallback, completion |
| `src/components/useRecorder.ts`, `Waveform.tsx` | Mic capture and the real-input waveform |
| `src/components/studio/*` | Creator workspace: feedback list, builder, responses, insights, settings |
| `src/lib/services/transcription.ts` | `transcriptionService` with local Whisper, mock, OpenAI and Groq providers |
| `src/lib/services/whisper-local.ts` | Open-source Whisper on the server (transformers.js) |
| `src/middleware.ts` | Creator password |
| `src/lib/services/insights.ts` | `insightService.analyze()` and `.synthesize()`: built-in extractor, Ollama, Anthropic, OpenAI-compatible |
| `src/lib/services/prompts.ts` | The extraction and synthesis system prompts. Iterate here between test rounds. |
| `src/lib/services/mock.ts` | Demo transcripts and the offline extractor |
| `src/lib/data.ts` | Every database query, as plain SQL |
| `src/lib/seed-data.ts` | The Forth Community demo dataset |
| `prisma/schema.prisma` | Schema: workspaces, feedback sessions, questions, respondents, responses, AI insights, syntheses |

### Privacy and security

- **Transcript-first, audio-ephemeral.** With local Whisper, audio exists only in the browser and in the server's memory for one request. It never reaches a third party.
- **Anonymous respondents.** A random id groups one person's answers. No name, email or account.
- **Creator side is password-protected** (`SONAR_PASSWORD`, generated on first run). Respondent pages and the three endpoints they use are the only open routes.
- **Rate limits** on the public endpoints, so one visitor can't tie up the server.
- Server-side validation on every input, secrets stay on the server, the browser never touches the database.
- This is a prototype: it avoids obvious mistakes but makes no compliance claims.

### Not built, on purpose

User accounts (one shared creator password instead), billing, branching logic, integrations, exports, permanent audio storage.

## What to watch in user tests

- Do people tap the mic without being told to?
- How long are spoken answers compared with what they'd type?
- How often do they press "Record again" or switch to typing?
- Average completion time (shown on Responses)
- Whether the creator can say what to do next from the Insights page alone
