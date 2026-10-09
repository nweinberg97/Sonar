import { getRespondent, getSessionBySlug, setQuoteConsent } from "@/lib/data";
import { fail, handle, json } from "@/lib/http";
import { allow, TOO_MANY } from "@/lib/rate-limit";
import { isSlug, readJson, requireId } from "@/lib/validate";

export const dynamic = "force-dynamic";

/** The respondent tapped "OK to quote me anonymously" (or changed their mind). */
export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  return handle(async () => {
    if (!allow(req, "consent", 20, 10 * 60_000)) return fail(TOO_MANY, 429);
    const { slug } = await ctx.params;
    if (!isSlug(slug)) return fail("This Sonar link doesn't look right.", 404);
    const body = await readJson(req);
    const respondentId = requireId(body.respondentId, "respondent");
    const [session, respondent] = await Promise.all([getSessionBySlug(slug), getRespondent(respondentId)]);
    if (!session || !respondent || respondent.sessionId !== session.id) return fail("We couldn't find your session.", 404);
    await setQuoteConsent(respondentId, body.consent === true);
    return json({ ok: true });
  });
}
