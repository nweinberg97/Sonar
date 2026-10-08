import { deleteSession, getSession, updateSession } from "@/lib/data";
import { fail, handle, json } from "@/lib/http";
import { LIMITS, parseQuestions, parseStatus } from "@/lib/session-input";
import { cleanText, readJson, requireId } from "@/lib/validate";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  return handle(async () => {
    const id = requireId((await ctx.params).id);
    const session = await getSession(id);
    return session ? json({ session }) : fail("We couldn't find that Sonar.", 404);
  });
}

export async function PATCH(req: Request, ctx: Ctx) {
  return handle(async () => {
    const id = requireId((await ctx.params).id);
    if (!(await getSession(id))) return fail("We couldn't find that Sonar.", 404);
    const body = await readJson(req);
    await updateSession(id, {
      title: body.title === undefined ? undefined : cleanText(body.title, { max: LIMITS.title, field: "Title" }),
      description:
        body.description === undefined
          ? undefined
          : cleanText(body.description, { max: LIMITS.description, field: "Description", allowEmpty: true }),
      status: body.status === undefined ? undefined : parseStatus(body.status),
      questions: body.questions === undefined ? undefined : parseQuestions(body.questions),
    });
    return json({ session: await getSession(id) });
  });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  return handle(async () => {
    const id = requireId((await ctx.params).id);
    await deleteSession(id);
    return json({ ok: true });
  });
}
