import { getSessionBySlug, startRespondent } from "@/lib/data";
import { fail, handle, json } from "@/lib/http";
import { allow, TOO_MANY } from "@/lib/rate-limit";
import { isSlug, readJson } from "@/lib/validate";

export const dynamic = "force-dynamic";

/** Issue an anonymous session_response_id. No name, email or account. */
export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  return handle(async () => {
    // Generous: a whole office can share one IP address.
    if (!allow(req, "start", 60, 10 * 60_000)) return fail(TOO_MANY, 429);
    const { slug } = await ctx.params;
    if (!isSlug(slug)) return fail("This Sonar link doesn't look right.", 404);
    const s = await getSessionBySlug(slug);
    if (!s || s.status !== "published") return fail("This Sonar isn't taking responses right now.", 404);
    const body = await readJson(req).catch(() => ({}) as Record<string, unknown>);
    const source = body.source === "embed" ? "embed" : "link";
    return json({ respondentId: await startRespondent(s.id, undefined, source) });
  });
}
