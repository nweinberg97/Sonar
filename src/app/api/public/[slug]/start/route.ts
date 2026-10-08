import { getSessionBySlug, startRespondent } from "@/lib/data";
import { fail, handle, json } from "@/lib/http";
import { isSlug } from "@/lib/validate";

export const dynamic = "force-dynamic";

/** Issue an anonymous session_response_id. No name, email or account. */
export async function POST(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  return handle(async () => {
    const { slug } = await ctx.params;
    if (!isSlug(slug)) return fail("This Sonar link doesn't look right.", 404);
    const s = await getSessionBySlug(slug);
    if (!s || s.status !== "published") return fail("This Sonar isn't taking responses right now.", 404);
    return json({ respondentId: await startRespondent(s.id) });
  });
}
