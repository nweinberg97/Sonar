/**
 * Small, dependency-free input validation. Everything that crosses the API
 * boundary goes through here before it reaches the database.
 */
import { randomBytes, randomUUID } from "node:crypto";

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

// Strip control characters (keep newlines/tabs), normalise whitespace, clamp length.
export function cleanText(value: unknown, { max, field, allowEmpty = false }: { max: number; field: string; allowEmpty?: boolean }): string {
  if (typeof value !== "string") {
    if (allowEmpty && (value === undefined || value === null)) return "";
    throw new ValidationError(`${field} must be text.`);
  }
  // eslint-disable-next-line no-control-regex
  const cleaned = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").replace(/[ \t]+/g, " ").trim();
  if (!allowEmpty && cleaned.length === 0) throw new ValidationError(`${field} can't be empty.`);
  if (cleaned.length > max) throw new ValidationError(`${field} is too long (max ${max} characters).`);
  return cleaned;
}

export function isId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{6,64}$/.test(value);
}

export function requireId(value: unknown, field = "id"): string {
  if (!isId(value)) throw new ValidationError(`Invalid ${field}.`);
  return value;
}

export function newId(): string {
  return randomUUID().replace(/-/g, "");
}

export function shortCode(len = 4): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(len);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

export function slugify(title: string): string {
  const base = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
  return base || "sonar";
}

export function isSlug(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9-]{1,64}$/.test(value);
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    return body as Record<string, unknown>;
  } catch {
    throw new ValidationError("Request body must be a JSON object.");
  }
}

export function nowIso(): string {
  return new Date().toISOString();
}
