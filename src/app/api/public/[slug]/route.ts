import { getSessionBySlug } from "@/lib/data";
import { fail, handle, json } from "@/lib/http";
import { isSlug } from "@/lib/validate";

export const dynamic = "force-dynamic";

/** What a respondent is allowed to see: title, description, questions. Nothing else. */
export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  return handle(async () => {
    const { slug } = await ctx.params;
    if (!isSlug(slug)) return fail("This Sonar link doesn't look right.", 404);
    const preview = new URL(req.url).searchParams.get("preview") === "1";
    const s = await getSessionBySlug(slug);
    if (!s) return fail("This Sonar link doesn't look right.", 404);
    if (s.status === "closed" && !preview) return fail("This Sonar isn't taking responses any more.", 410);
    if (s.status === "draft" && !preview) return fail("This Sonar isn't live yet.", 404);
    return json({
      session: {
        slug: s.slug,
        title: s.title,
        description: s.description,
        status: s.status,
        questions: s.questions.map((q) => ({ id: q.id, text: q.text })),
      },
    });
  });
}
