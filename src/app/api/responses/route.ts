import { getStats, listResponses } from "@/lib/data";
import { handle, json } from "@/lib/http";
import { waitingForTranscription } from "@/lib/services/voice-queue";
import { isId } from "@/lib/validate";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handle(async () => {
    const raw = new URL(req.url).searchParams.get("sessionId");
    const sessionId = isId(raw) ? raw : undefined;
    const [responses, stats] = await Promise.all([listResponses({ sessionId }), getStats(sessionId)]);
    return json({ responses, stats, transcribing: waitingForTranscription(sessionId) });
  });
}
