import { getSessionBySlug } from "@/lib/data";
import { fail, handle, json } from "@/lib/http";
import { allow, TOO_MANY } from "@/lib/rate-limit";
import { transcriptionService } from "@/lib/services/transcription";
import { isId, isSlug } from "@/lib/validate";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BYTES = 12 * 1024 * 1024; // 16 kHz WAV is ~32 KB/s, so ~6 minutes; answers are usually < 1 MB

const EXT: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
  "audio/x-m4a": "m4a",
  "audio/aac": "aac",
};

/**
 * Audio in, transcript out. The clip lives only in this request's memory:
 * it is forwarded to the transcription provider and then dropped. Nothing is
 * written to disk or the database.
 */
export async function POST(req: Request) {
  return handle(async () => {
    if (!allow(req, "transcribe", 30, 10 * 60_000)) return fail(TOO_MANY, 429);
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return fail("We couldn't read that recording. Try recording again.", 400);
    }
    const audio = form.get("audio");
    const slug = form.get("slug");
    const questionId = form.get("questionId");
    const durationMs = Math.max(0, Math.min(15 * 60_000, Number(form.get("durationMs")) || 0));

    if (!(audio instanceof Blob) || audio.size === 0) return fail("That recording was empty. Try again.", 400);
    if (audio.size > MAX_BYTES) return fail("That recording is too long. Try a shorter answer.", 413);
    if (!isSlug(slug) || !isId(questionId)) return fail("This Sonar link doesn't look right.", 400);

    const session = await getSessionBySlug(slug);
    const question = session?.questions.find((q) => q.id === questionId);
    if (!session || !question || session.status === "closed") return fail("This Sonar isn't taking responses right now.", 404);

    const base = (audio.type || "audio/webm").split(";")[0].trim();
    const filename = `answer.${EXT[base] ?? "webm"}`;

    try {
      const transcript = await transcriptionService.transcribe({ audio, filename, durationMs, question: question.text });
      if (!transcript) return fail("We didn't catch anything in that recording. Try speaking a little closer to the mic.", 422);
      return json({ transcript });
    } catch (err) {
      console.error("[sonar] transcription failed:", err);
      return fail("We couldn't process that response. Try recording again.", 502);
    }
    // `audio` goes out of scope here; no copy is retained.
  });
}
