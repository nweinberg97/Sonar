import { completeRespondent, getRespondent, getSessionBySlug } from "@/lib/data";
import { fail, handle, json } from "@/lib/http";
import { isSlug, readJson, requireId } from "@/lib/validate";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  return handle(async () => {
    const { slug } = await ctx.params;
    if (!isSlug(slug)) return fail("This Sonar link doesn't look right.", 404);
    const body = await readJson(req);
    const respondentId = requireId(body.respondentId, "respondent");
    const [s, r] = await Promise.all([getSessionBySlug(slug), getRespondent(respondentId)]);
    if (!s || !r || r.sessionId !== s.id) return fail("We couldn't find your answers.", 404);
    await completeRespondent(respondentId);
    return json({ ok: true });
  });
}
