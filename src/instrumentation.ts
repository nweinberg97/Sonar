/**
 * Runs once when the Next.js server starts. Starts hourly database backups and the
 * background analysis queue, and if Sonar is using open-source
 * Whisper, start loading the model now so the first respondent doesn't wait
 * for the download.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startBackupSchedule } = await import("./lib/backup");
  startBackupSchedule();
  // Answers analysed before the theme library existed get library themes.
  const { backfillThemes } = await import("./lib/data");
  await backfillThemes().catch((err) => console.error("[sonar] theme backfill failed:", err));
  const { startAnalysisQueue } = await import("./lib/services/analysis-queue");
  startAnalysisQueue();
  const { transcriptionConfig } = await import("./lib/services/config");
  if (transcriptionConfig().provider !== "local") return;
  const { warmUpLocalWhisper } = await import("./lib/services/whisper-local");
  void warmUpLocalWhisper();
}
