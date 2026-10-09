import { fail, handle, json } from "@/lib/http";
import { computePulse } from "@/lib/services/pulse";
import { requireId } from "@/lib/validate";

export const dynamic = "force-dynamic";

/** Week-by-week view of a weekly Sonar (creator only). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const id = requireId((await ctx.params).id);
    const pulse = await computePulse(id);
    return pulse ? json({ pulse }) : fail("We couldn't find that Sonar.", 404);
  });
}
