/**
 * Background transcription.
 *
 * A respondent's recording is accepted instantly and they move on. This queue
 * then transcribes each clip with Whisper, one at a time, saves the text as
 * their answer, and hands it to the analysis queue.
 *
 * Audio lives only in this process's memory while it waits its turn, and is
 * dropped as soon as it's transcribed. Nothing is written to disk. (If the
 * server restarts mid-queue, clips still waiting are lost, by design.)
 */
import { createResponse } from "../data";
import { kickAnalysis } from "./analysis-queue";
import { transcriptionService } from "./transcription";

export interface VoiceJob {
  audio: Blob;
  sessionId: string;
  questionId: string;
  questionText: string;
  respondentId: string;
  durationMs: number;
  receivedAt: string;
}

const MAX_WAITING = 60;
const queue: VoiceJob[] = [];
const waitingBySession = new Map<string, number>();
let running = false;

function bump(sessionId: string, by: number) {
  const n = (waitingBySession.get(sessionId) ?? 0) + by;
  if (n <= 0) waitingBySession.delete(sessionId);
  else waitingBySession.set(sessionId, n);
}

async function transcribeWithRetry(job: VoiceJob): Promise<string> {
  const input = { audio: job.audio, filename: "answer.wav", durationMs: job.durationMs, question: job.questionText };
  try {
    return await transcriptionService.transcribe(input);
  } catch (err) {
    console.error("[sonar] transcription failed, retrying once:", err);
    await new Promise((r) => setTimeout(r, 3000));
    return transcriptionService.transcribe(input);
  }
}

async function drain() {
  while (queue.length) {
    const job = queue.shift()!;
    try {
      const transcript = await transcribeWithRetry(job);
      if (!transcript) {
        console.warn("[sonar] a recording had no detectable speech; nothing saved for it.");
        continue;
      }
      await createResponse({
        sessionId: job.sessionId,
        questionId: job.questionId,
        respondentId: job.respondentId,
        transcript,
        inputMode: "voice",
        durationMs: job.durationMs,
        createdAt: job.receivedAt,
      });
      kickAnalysis();
    } catch (err) {
      console.error("[sonar] couldn't transcribe a recording; it was discarded:", err);
    } finally {
      bump(job.sessionId, -1);
    }
  }
}

/** Returns false if the queue is full (the server is overwhelmed). */
export function enqueueVoice(job: VoiceJob): boolean {
  if (queue.length >= MAX_WAITING) return false;
  queue.push(job);
  bump(job.sessionId, 1);
  if (!running) {
    running = true;
    drain()
      .catch((err) => console.error("[sonar] transcription queue error:", err))
      .finally(() => {
        running = false;
      });
  }
  return true;
}

/** Recordings received but not yet turned into text. */
export function waitingForTranscription(sessionId?: string): number {
  if (!sessionId) return queue.length + (running ? 1 : 0);
  return waitingBySession.get(sessionId) ?? 0;
}
