/**
 * Runs once when the Next.js server starts. Starts hourly database backups, and if Sonar is using open-source
 * Whisper, start loading the model now so the first respondent doesn't wait
 * for the download.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startBackupSchedule } = await import("./lib/backup");
  startBackupSchedule();
  const { transcriptionConfig } = await import("./lib/services/config");
  if (transcriptionConfig().provider !== "local") return;
  const { warmUpLocalWhisper } = await import("./lib/services/whisper-local");
  void warmUpLocalWhisper();
}
