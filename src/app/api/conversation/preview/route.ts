import { fail, handle, json } from "@/lib/http";
import { allow, TOO_MANY } from "@/lib/rate-limit";
import { ConversationError, openPreview } from "@/lib/services/conversation";
import { isSlug, readJson } from "@/lib/validate";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Start a builder preview of a conversation Sonar. Follow-ups work; nothing is saved. */
export async function POST(req: Request) {
  return handle(async () => {
    if (!allow(req, "conversation-preview", 20, 10 * 60_000)) return fail(TOO_MANY, 429);
    const body = await readJson(req);
    if (!isSlug(body.slug)) return fail("This Sonar link doesn't look right.", 404);
    try {
      return json({ liveId: await openPreview(body.slug) }, 201);
    } catch (err) {
      if (err instanceof ConversationError) return fail(err.message, err.status);
      throw err;
    }
  });
}
