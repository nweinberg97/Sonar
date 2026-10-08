import { createResponse, getRespondent, getSession, saveInsight } from "@/lib/data";
import { fail, handle, json } from "@/lib/http";
import { allow, TOO_MANY } from "@/lib/rate-limit";
import { insightService } from "@/lib/services/insights";
import { LIMITS } from "@/lib/session-input";
import { cleanText, readJson, requireId } from "@/lib/validate";

export const dynamic = "force-dynamic";

/** Save an accepted answer, then turn it into structured insight. */
export async function POST(req: Request) {
  return handle(async () => {
    if (!allow(req, "answers", 40, 10 * 60_000)) return fail(TOO_MANY, 429);
    const body = await readJson(req);
    const respondentId = requireId(body.respondentId, "respondent");
    const questionId = requireId(body.questionId, "question");
    const transcript = cleanText(body.transcript, { max: LIMITS.transcript, field: "Answer" });
    const inputMode = body.inputMode === "text" ? "text" : "voice";
    const durationMs = Math.max(0, Math.min(15 * 60_000, Number(body.durationMs) || 0));

    const respondent = await getRespondent(respondentId);
    if (!respondent) return fail("We couldn't find your session. Refresh the page to start again.", 404);
    const session = await getSession(respondent.sessionId);
    const question = session?.questions.find((q) => q.id === questionId);
    if (!session || !question) return fail("That question isn't part of this Sonar.", 400);
    if (session.status !== "published") return fail("This Sonar isn't taking responses right now.", 409);

    const responseId = await createResponse({
      sessionId: session.id,
      questionId,
      respondentId,
      transcript,
      inputMode,
      durationMs,
    });

    const insight = await insightService.analyze(transcript, question.text);
    await saveInsight(responseId, insight);

    return json({ ok: true, responseId }, 201);
  });
}
