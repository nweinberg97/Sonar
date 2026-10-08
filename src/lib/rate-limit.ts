/**
 * Small in-memory rate limiter for the public endpoints, so one visitor can't
 * tie up the server (Whisper runs on its CPU). Per client IP, sliding window.
 * Good enough for a single-server prototype; resets when the server restarts.
 */
const hits = new Map<string, number[]>();

export function clientKey(req: Request): string {
  const h = req.headers;
  return (
    h.get("cf-connecting-ip") ??
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    h.get("x-real-ip") ??
    "local"
  );
}

/** Returns true if the request is allowed. */
export function allow(req: Request, bucket: string, limit: number, windowMs: number): boolean {
  const key = `${bucket}:${clientKey(req)}`;
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
  }
  return true;
}

export const TOO_MANY = "You're going a little fast. Wait a minute and try again.";
