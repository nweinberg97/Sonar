/**
 * Testing tools for running experiments: reset everything, generate sample
 * respondents, clear responses. Off in production unless SONAR_DEMO_TOOLS=true.
 */
import {
  clearResponses,
  completeRespondent,
  createResponse,
  getSession,
  resetAndSeed,
  startRespondent,
  wipeAll,
} from "@/lib/data";
import { backupNow } from "@/lib/backup";
import { fail, handle, json } from "@/lib/http";
import { demoToolsEnabled } from "@/lib/services/config";
import { kickAnalysis } from "@/lib/services/analysis-queue";
import { mockTranscribe } from "@/lib/services/mock";
import { isId, readJson, requireId } from "@/lib/validate";

export const dynamic = "force-dynamic";

const backedUp = (name: string | null) => (name ? " A backup of what was there is in Backups." : "");

export async function POST(req: Request) {
  return handle(async () => {
    if (!demoToolsEnabled()) return fail("Testing tools are turned off on this server.", 403);
    const body = await readJson(req);

    switch (body.action) {
      case "reset": {
        const saved = await backupNow("before-reset");
        await resetAndSeed();
        return json({ ok: true, message: `Workspace reset to the demo data.${backedUp(saved)}` });
      }
      case "empty": {
        const saved = await backupNow("before-delete");
        await wipeAll();
        return json({ ok: true, message: `Everything deleted.${backedUp(saved)}` });
      }
      case "clear": {
        const sessionId = isId(body.sessionId) ? body.sessionId : undefined;
        const saved = await backupNow("before-clear");
        await clearResponses(sessionId);
        return json({ ok: true, message: `Responses cleared.${backedUp(saved)}` });
      }
      case "generate": {
        const sessionId = requireId(body.sessionId, "Sonar");
        const session = await getSession(sessionId);
        if (!session) return fail("We couldn't find that Sonar.", 404);
        if (session.questions.length === 0) return fail("Add a question first.", 400);
        const count = Math.max(1, Math.min(20, Number(body.count) || 5));
        const now = Date.now();
        for (let n = 0; n < count; n++) {
          const started = now - Math.round(Math.random() * 6 * 3600_000);
          const respondentId = await startRespondent(session.id, new Date(started).toISOString());
          let t = started;
          for (const q of session.questions) {
            const durationMs = 6000 + Math.round(Math.random() * 18000);
            t += durationMs + 8000 + Math.round(Math.random() * 12000);
            const transcript = mockTranscribe(q.text, durationMs);
            await createResponse({
              sessionId: session.id,
              questionId: q.id,
              respondentId,
              transcript,
              inputMode: "voice",
              durationMs,
              createdAt: new Date(t).toISOString(),
            });
            
          }
          await completeRespondent(respondentId, new Date(t + 4000).toISOString());
        }
        kickAnalysis();
        return json({
          ok: true,
          message: `Added ${count} sample ${count === 1 ? "respondent" : "respondents"}. Their answers are being analyzed in the background.`,
        });
      }
      default:
        return fail("Unknown action.", 400);
    }
  });
}
