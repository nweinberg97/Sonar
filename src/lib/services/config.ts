/**
 * Provider configuration, read from the environment on the server only.
 * Anything missing falls back to mock mode so `npm run dev` always works.
 */

export type TranscriptionProvider = "mock" | "local" | "openai" | "groq";
export type AIProvider = "mock" | "ollama" | "anthropic" | "openai" | "groq";

function env(name: string): string {
  return (process.env[name] ?? "").trim();
}

/**
 * Speech-to-text. Defaults to "local": open-source Whisper on this server,
 * free and keyless. "mock" serves sample transcripts for offline demos.
 */
export function transcriptionConfig() {
  const requested = (env("TRANSCRIPTION_PROVIDER") || "local").toLowerCase();
  const apiKey = env("TRANSCRIPTION_API_KEY");
  const provider: TranscriptionProvider =
    requested === "mock" || requested === "local"
      ? requested
      : (requested === "openai" || requested === "groq") && apiKey
        ? requested
        : "mock";
  const defaults = {
    local: { baseUrl: "", model: "Xenova/whisper-base.en" },
    openai: { baseUrl: "https://api.openai.com/v1", model: "whisper-1" },
    groq: { baseUrl: "https://api.groq.com/openai/v1", model: "whisper-large-v3-turbo" },
    mock: { baseUrl: "", model: "mock" },
  }[provider];
  return {
    provider,
    requested,
    apiKey,
    baseUrl: env("TRANSCRIPTION_BASE_URL") || defaults.baseUrl,
    model: env("TRANSCRIPTION_MODEL") || defaults.model,
    /** Local Whisper only: q8 (quantized, fast on CPU) or fp32. */
    dtype: env("TRANSCRIPTION_DTYPE") || "q8",
    /** Local Whisper only: pin a model commit for reproducible, tamper-evident downloads. */
    revision: env("TRANSCRIPTION_MODEL_REVISION") || "main",
    /** Local Whisper only: never fetch from the network, use ./.models only. */
    offline: env("TRANSCRIPTION_OFFLINE") === "true",
  };
}

/**
 * Insight extraction. Defaults to Sonar's built-in extractor ("mock").
 * "ollama" runs an open-source model on your own machine, no key needed.
 */
export function aiConfig() {
  const requested = (env("AI_PROVIDER") || "mock").toLowerCase();
  const apiKey = env("AI_API_KEY");
  const provider: AIProvider =
    requested === "ollama"
      ? "ollama"
      : (requested === "anthropic" || requested === "openai" || requested === "groq") && apiKey
        ? requested
        : "mock";
  const defaults = {
    ollama: { baseUrl: "http://localhost:11434/v1", model: "llama3.2" },
    anthropic: { baseUrl: "https://api.anthropic.com/v1", model: "claude-sonnet-5-5" },
    openai: { baseUrl: "https://api.openai.com/v1", model: "gpt-4.1-mini" },
    groq: { baseUrl: "https://api.groq.com/openai/v1", model: "llama-3.3-70b-versatile" },
    mock: { baseUrl: "", model: "built-in" },
  }[provider];
  return {
    provider,
    requested,
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
    auth: Boolean(env("SONAR_PASSWORD")),
    ai: { provider: a.provider, model: a.model, misconfigured: a.requested !== "mock" && a.provider === "mock" },
    demoTools: demoToolsEnabled(),
  };
}
