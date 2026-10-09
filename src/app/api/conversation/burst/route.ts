import { fail, handle, json } from "@/lib/http";
import { allow, TOO_MANY } from "@/lib/rate-limit";
import { addBurst, ConversationError, openLive } from "@/lib/services/conversation";
import { isId } from "@/lib/validate";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BYTES = 2 * 1024 * 1024; // bursts are ≤ ~15 s of 16 kHz WAV (~500 KB)

/**
 * A few seconds of a live conversation. Accepted instantly; transcribed in the
 * background ahead of other work. The audio is kept in memory only until then.
 */
export async function POST(req: Request) {
  return handle(async () => {
    if (!allow(req, "conversation-burst", 150, 10 * 60_000)) return fail(TOO_MANY, 429);
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return fail("We couldn't read that recording.", 400);
    }
    const audio = form.get("audio");
    const liveId = form.get("liveId");
    const seq = Number(form.get("seq"));
    const atMs = Number(form.get("atMs"));
    const durationMs = Number(form.get("durationMs"));
    if (!(audio instanceof Blob) || audio.size === 0) return fail("That recording was empty.", 400);
    if (audio.size > MAX_BYTES) return fail("That recording is too long.", 413);
    if (!isId(liveId)) return fail("This Sonar link doesn't look right.", 400);
    if (!Number.isInteger(seq) || seq < 0 || seq > 1000) return fail("Bad recording order.", 400);
    if (!Number.isFinite(atMs) || atMs < 0 || atMs > 6 * 60_000) return fail("Bad recording time.", 400);
    try {
      const live = await openLive(liveId);
      addBurst(live, { seq, atMs, durationMs: Math.max(0, Math.min(30_000, durationMs || 0)), audio });
      return json({ ok: true }, 202);
    } catch (err) {
      if (err instanceof ConversationError) return fail(err.message, err.status);
      throw err;
    }
  });
}
