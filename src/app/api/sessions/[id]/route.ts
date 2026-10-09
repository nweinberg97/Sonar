import { deleteSession, getSession, updateSession } from "@/lib/data";
import { fail, handle, json } from "@/lib/http";
import { LIMITS, parseCadence, parseFormat, parseGoal, parseQuestions, parseStatus, parseTargetSeconds, parseTimezone } from "@/lib/session-input";
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
    const current = await getSession(id);
    if (!current) return fail("We couldn't find that Sonar.", 404);
    const body = await readJson(req);
    const format = body.format === undefined ? undefined : parseFormat(body.format);
    const questions = body.questions === undefined ? undefined : parseQuestions(body.questions);
    if (format !== undefined && format !== current.format && current.respondentCount > 0) {
      return fail("People have already answered this Sonar, so its format can't change. Create a new Sonar instead.", 409);
    }
    const finalFormat = format ?? current.format;
    const questionCount = questions?.length ?? current.questions.length;
    if (finalFormat === "conversation" && questionCount !== 1) {
      return fail("A conversation Sonar has exactly one main question.", 400);
    }
    await updateSession(id, {
      title: body.title === undefined ? undefined : cleanText(body.title, { max: LIMITS.title, field: "Title" }),
      description:
        body.description === undefined
          ? undefined
          : cleanText(body.description, { max: LIMITS.description, field: "Description", allowEmpty: true }),
      status: body.status === undefined ? undefined : parseStatus(body.status),
      questions,
      format,
      goal: body.goal === undefined ? undefined : parseGoal(body.goal),
      targetSeconds: body.targetSeconds === undefined ? undefined : parseTargetSeconds(body.targetSeconds),
      cadence: body.cadence === undefined ? undefined : parseCadence(body.cadence),
      timezone: body.timezone === undefined ? undefined : parseTimezone(body.timezone),
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
