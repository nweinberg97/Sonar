/**
 * Provider configuration, read from the environment on the server only.
 * Anything missing falls back to mock mode so `npm run dev` always works.
 */

export type TranscriptionProvider = "mock" | "openai" | "groq";
export type AIProvider = "mock" | "anthropic" | "openai" | "groq";

function env(name: string): string {
  return (process.env[name] ?? "").trim();
}

export function transcriptionConfig() {
  const requested = env("TRANSCRIPTION_PROVIDER").toLowerCase();
  const apiKey = env("TRANSCRIPTION_API_KEY");
  const provider: TranscriptionProvider =
    (requested === "openai" || requested === "groq") && apiKey ? requested : "mock";
  const defaults = {
    openai: { baseUrl: "https://api.openai.com/v1", model: "whisper-1" },
    groq: { baseUrl: "https://api.groq.com/openai/v1", model: "whisper-large-v3-turbo" },
    mock: { baseUrl: "", model: "mock" },
  }[provider];
  return {
    provider,
    requested: requested || "mock",
    apiKey,
    baseUrl: env("TRANSCRIPTION_BASE_URL") || defaults.baseUrl,
    model: env("TRANSCRIPTION_MODEL") || defaults.model,
  };
}

export function aiConfig() {
  const requested = env("AI_PROVIDER").toLowerCase();
  const apiKey = env("AI_API_KEY");
  const provider: AIProvider =
    (requested === "anthropic" || requested === "openai" || requested === "groq") && apiKey ? requested : "mock";
  const defaults = {
    anthropic: { baseUrl: "https://api.anthropic.com/v1", model: "claude-sonnet-5-5" },
    openai: { baseUrl: "https://api.openai.com/v1", model: "gpt-4.1-mini" },
    groq: { baseUrl: "https://api.groq.com/openai/v1", model: "llama-3.3-70b-versatile" },
    mock: { baseUrl: "", model: "mock" },
  }[provider];
  return {
    provider,
    requested: requested || "mock",
    apiKey,
    baseUrl: env("AI_BASE_URL") || defaults.baseUrl,
    model: env("AI_MODEL") || defaults.model,
  };
}

export function demoToolsEnabled(): boolean {
  return process.env.NODE_ENV !== "production" || env("SONAR_DEMO_TOOLS") === "true";
}

/** Safe to send to the browser: no keys. */
export function publicStatus() {
  const t = transcriptionConfig();
  const a = aiConfig();
  return {
    transcription: { provider: t.provider, model: t.model, misconfigured: t.requested !== "mock" && t.provider === "mock" },
    ai: { provider: a.provider, model: a.model, misconfigured: a.requested !== "mock" && a.provider === "mock" },
    demoTools: demoToolsEnabled(),
  };
}
