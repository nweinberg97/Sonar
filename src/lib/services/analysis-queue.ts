/**
 * Background analysis.
 *
 * When a respondent finishes an answer, it is saved straight away and they
 * move on. This queue then runs each saved answer through the model (Ollama by
 * default) one at a time, so a slow model never makes anyone wait.
 *
 * - Survives restarts: on startup it picks up any answers that were never analyzed.
 * - If the model isn't reachable, it retries with growing pauses. After several
 *   failed tries on the same answer it uses the built-in extractor for that one,
 *   so results never go missing.
 */
import { listPendingAnalysis, saveInsight } from "../data";
import { insightService } from "./insights";
import { aiConfig, ollamaHealth } from "./config";
import { mockAnalyze } from "./mock";

const MAX_TRIES = 5;
const failures = new Map<string, number>();
let running = false;
let rerun = false;
let backoffUntil = 0;
let lastError: string | null = null;
let consecutiveFailures = 0;
/** While set, the model is treated as down and the built-in extractor is used. */
let degradedUntil = 0;
const DEGRADED_MS = 5 * 60_000;

async function drain() {
  while (true) {
    if (Date.now() < backoffUntil) return;
    const batch = await listPendingAnalysis(10);
    if (batch.length === 0) return;
    for (const item of batch) {
      if (Date.now() < degradedUntil) {
        await saveInsight(item.id, mockAnalyze(item.transcript, item.questionText), undefined, "builtin");
        continue;
      }
      try {
        const insight = await insightService.analyzeLive(item.transcript, item.questionText);
        await saveInsight(item.id, insight, undefined, insightService.engine);
        failures.delete(item.id);
        lastError = null;
        consecutiveFailures = 0;
      } catch (err) {
        consecutiveFailures += 1;
        const n = (failures.get(item.id) ?? 0) + 1;
        failures.set(item.id, n);
        lastError = (err as Error).message?.slice(0, 200) ?? "unknown error";
        // Ollama not running at all (rather than busy)? Don't make answers wait: use the built-in extractor now.
        if (aiConfig().provider === "ollama" && !(await ollamaHealth()).reachable) {
          console.error("[sonar] Ollama isn't running. Using the built-in extractor for 5 minutes, then checking again.");
          degradedUntil = Date.now() + DEGRADED_MS;
          failures.delete(item.id);
          consecutiveFailures = 0;
          break;
        }
        if (n >= MAX_TRIES) {
          console.error(
            `[sonar] the model failed ${n} times in a row. Using the built-in extractor for 5 minutes, then trying the model again.`,
          );
          await saveInsight(item.id, mockAnalyze(item.transcript, item.questionText), undefined, "builtin");
          failures.delete(item.id);
          if (consecutiveFailures >= MAX_TRIES) degradedUntil = Date.now() + DEGRADED_MS;
        } else {
          // Model probably down or still loading: pause the whole queue, longer each time.
          backoffUntil = Date.now() + Math.min(60_000, 5_000 * 2 ** (n - 1));
          console.error(`[sonar] analysis failed (try ${n}/${MAX_TRIES}), retrying shortly:`, lastError);
          return;
        }
      }
    }
  }
}

/** Ask the queue to process anything pending. Safe to call as often as you like. */
export function kickAnalysis(): void {
  if (running) {
    rerun = true;
    return;
  }
  running = true;
  drain()
    .catch((err) => console.error("[sonar] analysis queue error:", err))
    .finally(() => {
      running = false;
      if (rerun) {
        rerun = false;
        kickAnalysis();
      }
    });
}

let timer: ReturnType<typeof setInterval> | null = null;

/** Check for pending work every few seconds (covers restarts and retries). */
export function startAnalysisQueue(everyMs = 5_000): void {
  if (timer) return;
  timer = setInterval(kickAnalysis, everyMs);
  timer.unref?.();
  kickAnalysis();
}

export function analysisStatus() {
  return {
    running,
    lastError,
    retryingAt: backoffUntil > Date.now() ? new Date(backoffUntil).toISOString() : null,
    usingBuiltinUntil: degradedUntil > Date.now() ? new Date(degradedUntil).toISOString() : null,
  };
}
