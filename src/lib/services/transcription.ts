/**
 * transcriptionService.transcribe(audio)
 *
 * Audio arrives as an in-memory Blob from the request, is forwarded to the
 * provider, and is never written to disk. When this function returns, the
 * only thing that survives is the transcript. Transcript-first, audio-ephemeral.
 */
import { transcriptionConfig } from "./config";
import { mockTranscribe } from "./mock";

export interface TranscribeInput {
  audio: Blob;
  filename: string;
  durationMs: number;
  /** The question being answered, used by mock mode and as a vocabulary hint. */
  question: string;
}

export interface TranscriptionProviderImpl {
  name: string;
  transcribe(input: TranscribeInput): Promise<string>;
}

export class TranscriptionError extends Error {}

const mockProvider: TranscriptionProviderImpl = {
  name: "mock",
  async transcribe({ question, durationMs }) {
    // A short pause keeps the processing animation honest in demos.
    await new Promise((r) => setTimeout(r, 700 + Math.random() * 500));
    return mockTranscribe(question, durationMs);
  },
};

/** OpenAI and Groq share the OpenAI-compatible /audio/transcriptions endpoint. */
function openAICompatible(name: string, baseUrl: string, apiKey: string, model: string): TranscriptionProviderImpl {
  return {
    name,
    async transcribe({ audio, filename, question }) {
      const form = new FormData();
      form.append("file", audio, filename);
      form.append("model", model);
      form.append("response_format", "json");
      // A short prompt nudges Whisper toward the right vocabulary.
      form.append("prompt", `An answer to the question: ${question}`.slice(0, 220));
      const res = await fetch(`${baseUrl.replace(/\/$/, "")}/audio/transcriptions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new TranscriptionError(`${name} transcription failed (${res.status}): ${detail.slice(0, 300)}`);
      }
      const data = (await res.json()) as { text?: string };
      return (data.text ?? "").trim();
    },
  };
}

const localProvider: TranscriptionProviderImpl = {
  name: "local",
  async transcribe({ audio }) {
    const { transcribeLocally } = await import("./whisper-local");
    return transcribeLocally(audio);
  },
};

function resolveProvider(): TranscriptionProviderImpl {
  const c = transcriptionConfig();
  if (c.provider === "local") return localProvider;
  if (c.provider === "openai" || c.provider === "groq") return openAICompatible(c.provider, c.baseUrl, c.apiKey, c.model);
  return mockProvider;
}

export const transcriptionService = {
  get providerName() {
    return resolveProvider().name;
  },
  async transcribe(input: TranscribeInput): Promise<string> {
    const text = await resolveProvider().transcribe(input);
    return text.replace(/\s+/g, " ").trim();
  },
};
