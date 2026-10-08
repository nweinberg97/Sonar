import type { SessionStatus } from "./types";
import { cleanText, isId, ValidationError } from "./validate";

export const LIMITS = { title: 120, description: 280, question: 280, maxQuestions: 10, transcript: 6000 };

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
