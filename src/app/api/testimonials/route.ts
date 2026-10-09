import { decideTestimonial, listTestimonials } from "@/lib/data";
import { fail, handle, json } from "@/lib/http";
import { cleanText, readJson, requireId } from "@/lib/validate";

export const dynamic = "force-dynamic";

/** Creator only. Quotes from people who said it's OK to quote them. */
export async function GET() {
  return handle(async () => json(await listTestimonials()));
}

/** { responseId, action: "approve" | "reject" | "remove", text? } */
export async function POST(req: Request) {
  return handle(async () => {
    const body = await readJson(req);
    const responseId = requireId(body.responseId, "answer");
    const action = body.action === "approve" || body.action === "reject" || body.action === "remove" ? body.action : null;
    if (!action) return fail("Unknown action.", 400);
    const text = body.text === undefined ? undefined : cleanText(body.text, { max: 1000, field: "Quote" });
    try {
      await decideTestimonial(responseId, action, text);
    } catch (err) {
      const m = (err as Error).message;
      if (m === "no consent") return fail("This person didn't say it's OK to quote them, so it can't be used as a testimonial.", 403);
      if (m === "not found") return fail("We couldn't find that answer.", 404);
      throw err;
    }
    return json(await listTestimonials());
  });
}
