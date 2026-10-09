import { getSession, listShareItems } from "@/lib/data";
import { fail, handle, json } from "@/lib/http";
import {
  draftLinearIssue,
  draftSlackSummary,
  integrationStatus,
  send,
  ShareError,
  type LinearSource,
} from "@/lib/services/integrations";
import { cleanText, isId, readJson, requireId } from "@/lib/validate";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** Creator only (password-protected by middleware). What's set up, and what's been sent. */
export async function GET(_req: Request, ctx: Ctx) {
  return handle(async () => {
    const id = requireId((await ctx.params).id);
    if (!(await getSession(id))) return fail("We couldn't find that Sonar.", 404);
    return json({ integrations: integrationStatus(), history: await listShareItems(id) });
  });
}

function link(value: unknown): string {
  if (typeof value !== "string") return "";
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : "";
  } catch {
    return "";
  }
}

/**
 * { action: "draft", kind: "slack" | "linear", source?, text?, link? } → a draft to review
 * { action: "send", key, kind, source, title, body }                 → sends it (once per key)
 */
export async function POST(req: Request, ctx: Ctx) {
  return handle(async () => {
    const id = requireId((await ctx.params).id);
    const body = await readJson(req);
    const kind = body.kind === "slack" || body.kind === "linear" ? body.kind : null;
    if (!kind) return fail("Choose Slack or Linear.", 400);
    try {
      if (body.action === "draft") {
        if (kind === "slack") return json({ draft: await draftSlackSummary(id, link(body.link)) });
        const source = (["action", "request", "friction"] as const).includes(body.source as LinearSource) ? (body.source as LinearSource) : null;
        if (!source) return fail("Pick what the issue is about.", 400);
        const text = cleanText(body.text, { max: 400, field: "Item" });
        return json({ draft: await draftLinearIssue(id, source, text, link(body.link)) });
      }
      if (body.action === "send") {
        if (!integrationStatus()[kind]) return fail(`${kind === "slack" ? "Slack" : "Linear"} isn't set up yet. See Settings → Integrations.`, 409);
        if (!isId(body.key)) return fail("Missing send key.", 400);
        const item = await send({
          key: body.key,
          sessionId: id,
          kind,
          source: typeof body.source === "string" ? body.source.slice(0, 300) : "",
          title: kind === "linear" ? cleanText(body.title, { max: 200, field: "Title" }) : "",
          body: cleanText(body.body, { max: 8000, field: "Message" }),
        });
        if (item.status === "failed") return json({ item, error: item.error }, 502);
        return json({ item });
      }
      return fail("Unknown action.", 400);
    } catch (err) {
      if (err instanceof ShareError) return fail(err.message, 400);
      throw err;
    }
  });
}
