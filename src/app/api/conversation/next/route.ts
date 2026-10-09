import { fail, handle, json } from "@/lib/http";
import { allow, TOO_MANY } from "@/lib/rate-limit";
import { ConversationError, nextFollowup, openLive } from "@/lib/services/conversation";
import { readJson, requireId } from "@/lib/validate";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** The person paused. Returns the follow-up to show (already drafted, so this is quick). */
export async function POST(req: Request) {
  return handle(async () => {
    if (!allow(req, "conversation-next", 60, 10 * 60_000)) return fail(TOO_MANY, 429);
    const body = await readJson(req);
    const liveId = requireId(body.liveId, "conversation");
    const elapsedMs = Math.max(0, Math.min(6 * 60_000, Number(body.elapsedMs) || 0));
    try {
      const live = await openLive(liveId);
      const shown = await nextFollowup(live, elapsedMs);
      return json({ followup: shown.text, by: shown.by });
    } catch (err) {
      if (err instanceof ConversationError) return fail(err.message, err.status);
      throw err;
    }
  });
}
