import { fail, handle, json } from "@/lib/http";
import { allow, TOO_MANY } from "@/lib/rate-limit";
import { ConversationError, finishLive, openLive } from "@/lib/services/conversation";
import { readJson, requireId } from "@/lib/validate";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * The person is done talking. Returns at once; the answer is saved as soon as
 * the last bursts are transcribed.
 */
export async function POST(req: Request) {
  return handle(async () => {
    if (!allow(req, "conversation-finish", 20, 10 * 60_000)) return fail(TOO_MANY, 429);
    const body = await readJson(req);
    const liveId = requireId(body.liveId, "conversation");
    const durationMs = Math.max(0, Math.min(6 * 60_000, Number(body.durationMs) || 0));
    const bursts = Math.max(0, Math.min(1000, Math.round(Number(body.bursts) || 0)));
    try {
      const live = await openLive(liveId);
      finishLive(live, durationMs, bursts);
      return json({ ok: true }, 202);
    } catch (err) {
      if (err instanceof ConversationError) {
        // Already sent counts as success: the client may retry a finish that went through.
        if (err.status === 409) return json({ ok: true }, 202);
        return fail(err.message, err.status);
      }
      throw err;
    }
  });
}
