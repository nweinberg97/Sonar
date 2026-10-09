export type SessionStatus = "draft" | "published" | "closed";
export type SentimentLabel = "positive" | "mixed" | "neutral" | "negative";
export type InputMode = "voice" | "text";
export type SessionFormat = "questions" | "conversation";
export type Cadence = "none" | "weekly";

/** One piece of a conversation answer: something said, or a follow-up shown. */
export type Segment =
  | { t: "speech"; text: string; atMs: number }
  | { t: "followup"; text: string; atMs: number; by: "ai" | "builtin" };

export interface Question {
  id: string;
  position: number;
  text: string;
}

export interface SessionSummary {
  id: string;
  title: string;
  description: string;
  slug: string;
  status: SessionStatus;
  template: string;
  format: SessionFormat;
  goal: string;
  targetSeconds: number;
  cadence: Cadence;
  timezone: string;
  createdAt: string;
  updatedAt: string;
  questionCount: number;
  respondentCount: number;
  responseCount: number;
  lastResponseAt: string | null;
}

export interface SessionDetail extends SessionSummary {
  questions: Question[];
}

/** The structured output every response is turned into. */
export interface Insight {
  sentiment_score: number;
  sentiment_label: SentimentLabel;
  primary_theme: string;
  business_inefficiency: string | null;
  feature_requests: string[];
  key_points: string[];
  executive_summary: string;
}

export interface ResponseRow {
  id: string;
  sessionId: string;
  sessionTitle: string;
  questionId: string;
  questionText: string;
  questionPosition: number;
  sessionResponseId: string;
  transcript: string;
  inputMode: InputMode;
  durationMs: number;
  createdAt: string;
  /** Conversation answers: speech and follow-ups in order. Null for single answers. */
  segments: Segment[] | null;
  insight: Insight | null;
}

export interface SessionStats {
  respondents: number;
  completed: number;
  answered: number;
  avgCompletionMs: number | null;
  avgSentiment: number | null;
}

export interface ThemeCount {
  theme: string;
  mentions: number;
  avgSentiment: number;
  quote: string | null;
  /** How many of the mentions were requests for change rather than reactions. */
  requests: number;
}

/** Cross-response synthesis shown on the Insights view. */
export interface Synthesis {
  heard: string;
  themes: ThemeCount[];
  actions: string[];
  requests: { text: string; mentions: number }[];
  frictions: string[];
  sentiment: { positive: number; mixed: number; neutral: number; negative: number; average: number | null };
  responseCount: number;
  /** Answers saved but not analyzed by the model yet. */
  pending: number;
  /** The summary is being rewritten by the model right now. */
  updating: boolean;
  generatedAt: string;
}
