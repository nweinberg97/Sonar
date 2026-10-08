import { getSession, getStats } from "@/lib/data";
import { fail, handle, json } from "@/lib/http";
import { insightService } from "@/lib/services/insights";
import { requireId } from "@/lib/validate";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const id = requireId((await ctx.params).id);
    const session = await getSession(id);
    if (!session) return fail("We couldn't find that Sonar.", 404);
    const [synthesis, stats] = await Promise.all([
      insightService.synthesize(id, session.questions.map((q) => q.text)),
      getStats(id),
    ]);
    return json({ session, synthesis, stats });
  });
}
