# Sonar

Feedback you can just say out loud.

Sonar is a prototype for one question: **is giving feedback by speaking genuinely easier than filling out a survey?** A respondent opens a link, taps the mic, talks, and moves on. The creator gets transcripts, per-answer signals and a short synthesis of what to do next.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000. That's it. On first run Sonar creates `.env` from `.env.example`, builds a local SQLite database and loads the demo workspace. No API keys needed.

- **Creator workspace:** http://localhost:3000/feedback
- **Respondent link (demo):** http://localhost:3000/s/forth-community

Requires Node 20+.

### Testing on a phone

Browsers only allow the microphone on `https` or `localhost`. To try the respondent flow on a real phone, expose your dev server over https, e.g. `npx localtunnel --port 3000` or `cloudflared tunnel --url http://localhost:3000`, and open the `/s/...` link it gives you. Set `NEXT_PUBLIC_APP_URL` to that address so share links match.

## Demo mode vs live mode

With no keys, Sonar runs in demo mode: recording, the live waveform and the whole flow work for real, but transcripts come from a bank of natural spoken answers matched to the question, and insights come from a built-in extractor. Typed answers get real (heuristic) analysis.

To go live, set keys in `.env` and restart:

```bash
TRANSCRIPTION_PROVIDER=openai     # or groq
TRANSCRIPTION_API_KEY=sk-...
AI_PROVIDER=anthropic             # or openai, groq
AI_API_KEY=...
```

Optional: `TRANSCRIPTION_MODEL`, `TRANSCRIPTION_BASE_URL`, `AI_MODEL`, `AI_BASE_URL`. Any OpenAI-compatible endpoint works for either. If a live call fails, Sonar falls back to the built-in extractor rather than losing the answer.

## Running experiments

**Settings → Testing tools** (on in development; set `SONAR_DEMO_TOOLS=true` to keep them in a production build):

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
| `src/lib/services/transcription.ts` | `transcriptionService` with mock, OpenAI and Groq providers |
| `src/lib/services/insights.ts` | `insightService.analyze()` and `.synthesize()` with Anthropic, OpenAI-compatible and mock providers |
| `src/lib/services/prompts.ts` | The extraction and synthesis system prompts. Iterate here between test rounds. |
| `src/lib/services/mock.ts` | Demo transcripts and the offline extractor |
| `src/lib/data.ts` | Every database query, as plain SQL |
| `src/lib/seed-data.ts` | The Forth Community demo dataset |
| `prisma/schema.prisma` | Schema: workspaces, feedback sessions, questions, respondents, responses, AI insights, syntheses |

### Privacy

Transcript-first, audio-ephemeral. Audio exists only in the browser and in memory for the length of one transcription request. Respondents are identified by a random anonymous id, with no name, email or account. This is a prototype: it avoids obvious mistakes (server-side validation, secrets stay on the server, no direct database access from the browser) but makes no compliance claims.

### Not built, on purpose

Accounts and auth, billing, branching logic, integrations, exports, permanent audio storage. The creator workspace has no login, so don't put it on the public internet as-is: share respondent links, keep `/feedback` to yourself.

## What to watch in user tests

- Do people tap the mic without being told to?
- How long are spoken answers compared with what they'd type?
- How often do they press "Record again" or switch to typing?
- Average completion time (shown on Responses)
- Whether the creator can say what to do next from the Insights page alone
