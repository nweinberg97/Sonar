import { getRespondent, getSession } from "@/lib/data";
import { fail, handle, json } from "@/lib/http";
import { allow, TOO_MANY } from "@/lib/rate-limit";
import { enqueueVoice } from "@/lib/services/voice-queue";
import { isId, nowIso } from "@/lib/validate";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BYTES = 12 * 1024 * 1024; // 16 kHz WAV is ~32 KB/s, so ~6 minutes; answers are usually < 1 MB

/**
 * Accept a spoken answer and return immediately. Transcription happens in the
 * background (voice-queue.ts); the audio stays in memory only until then.
 */
export async function POST(req: Request) {
  return handle(async () => {
    if (!allow(req, "voice", 40, 10 * 60_000)) return fail(TOO_MANY, 429);
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return fail("We couldn't read that recording.", 400);
    }
    const audio = form.get("audio");
    const respondentId = form.get("respondentId");
    const questionId = form.get("questionId");
    const durationMs = Math.max(0, Math.min(15 * 60_000, Number(form.get("durationMs")) || 0));

    if (!(audio instanceof Blob) || audio.size === 0) return fail("That recording was empty.", 400);
    if (audio.size > MAX_BYTES) return fail("That recording is too long.", 413);
    if (!isId(respondentId) || !isId(questionId)) return fail("This Sonar link doesn't look right.", 400);

    const respondent = await getRespondent(respondentId);
    if (!respondent) return fail("We couldn't find your session. Refresh the page to start again.", 404);
    const session = await getSession(respondent.sessionId);
    const question = session?.questions.find((q) => q.id === questionId);
    if (!session || !question) return fail("That question isn't part of this Sonar.", 400);
    if (session.status !== "published") return fail("This Sonar isn't taking responses right now.", 409);

    const ok = enqueueVoice({
      audio,
      sessionId: session.id,
      questionId,
      questionText: question.text,
      respondentId,
      durationMs,
      receivedAt: nowIso(),
    });
    if (!ok) return fail("We're getting a lot of answers right now. Please try again in a minute.", 503);
    return json({ ok: true }, 202);
  });
}
