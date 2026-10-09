import type { SessionFormat, SessionStatus } from "./types";
import { cleanText, isId, ValidationError } from "./validate";

export const LIMITS = {
  title: 120,
  description: 280,
  question: 280,
  maxQuestions: 10,
  transcript: 6000,
  goal: 400,
  /** Conversation length the creator can ask for, in seconds. */
  minSeconds: 30,
  maxSeconds: 300,
};

export function parseQuestions(value: unknown): { id?: string; text: string }[] {
  if (!Array.isArray(value)) throw new ValidationError("Questions must be a list.");
  if (value.length === 0) throw new ValidationError("Add at least one question.");
  if (value.length > LIMITS.maxQuestions) throw new ValidationError(`Keep it to ${LIMITS.maxQuestions} questions or fewer.`);
  return value.map((q, i) => {
    if (typeof q === "string") return { text: cleanText(q, { max: LIMITS.question, field: `Question ${i + 1}` }) };
    if (q && typeof q === "object") {
      const o = q as Record<string, unknown>;
      return {
        id: isId(o.id) ? o.id : undefined,
        text: cleanText(o.text, { max: LIMITS.question, field: `Question ${i + 1}` }),
      };
    }
    throw new ValidationError(`Question ${i + 1} is invalid.`);
  });
}

export function parseStatus(value: unknown): SessionStatus {
  if (value === "draft" || value === "published" || value === "closed") return value;
  throw new ValidationError("Status must be draft, published or closed.");
}

export function parseFormat(value: unknown): SessionFormat {
  if (value === "questions" || value === "conversation") return value;
  throw new ValidationError("Format must be questions or conversation.");
}

export function parseGoal(value: unknown): string {
  return cleanText(value, { max: LIMITS.goal, field: "What you want to learn", allowEmpty: true });
}

/** Target conversation length in seconds, rounded to 15s and clamped to 30s–5min. */
export function parseTargetSeconds(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new ValidationError("Target length must be a number of seconds.");
  return Math.min(LIMITS.maxSeconds, Math.max(LIMITS.minSeconds, Math.round(n / 15) * 15));
}
