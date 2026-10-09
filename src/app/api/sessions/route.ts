import { createSession, getSession, listSessions } from "@/lib/data";
import { handle, json } from "@/lib/http";
import { LIMITS, parseQuestions } from "@/lib/session-input";
import { getTemplate } from "@/lib/templates";
import { cleanText, readJson } from "@/lib/validate";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => json({ sessions: await listSessions() }));
}

/** Create a draft from a template (questions optional — the template fills them in). */
export async function POST(req: Request) {
  return handle(async () => {
    const body = await readJson(req);
    const template = getTemplate(typeof body.template === "string" ? body.template : "general");
    const title = body.title === undefined ? template.title : cleanText(body.title, { max: LIMITS.title, field: "Title" });
    const description =
      body.description === undefined
        ? template.description
        : cleanText(body.description, { max: LIMITS.description, field: "Description", allowEmpty: true });
    const questions = body.questions === undefined ? template.questions : parseQuestions(body.questions).map((q) => q.text);
    const id = await createSession({
      title,
      description,
      template: template.id,
      questions,
      format: template.format,
      goal: template.goal,
      targetSeconds: template.targetSeconds,
    });
    return json({ session: await getSession(id) }, 201);
  });
}
