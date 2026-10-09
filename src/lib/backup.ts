/**
 * Automatic SQLite backups.
 *
 * Snapshots go to prisma/backups/ as complete, self-contained .db files made
 * with SQLite's `VACUUM INTO` (a consistent copy even while the app is running).
 * - before every reset / delete / clear in Testing tools
 * - every hour while the server runs, but only if something changed
 * - whenever you press "Back up now"
 * The newest 30 are kept. Download any of them from Settings → Backups.
 *
 * Postgres (e.g. Supabase) has its own backups, so this does nothing there.
 */
import { mkdirSync, readdirSync, statSync, unlinkSync, existsSync } from "node:fs";
import path from "node:path";
import { db } from "./db";

export const BACKUP_DIR = path.join(process.cwd(), "prisma", "backups");
const KEEP = 30;
const NAME = /^sonar-\d{8}-\d{6}-[a-z-]{1,24}\.db$/;

export interface BackupFile {
  name: string;
  bytes: number;
  createdAt: string;
}

function isSqlite(): boolean {
  return !/^postgres(ql)?:/i.test(process.env.DATABASE_URL ?? "");
}

/** Built-in snapshots and undo only work with SQLite. On Postgres, the provider (e.g. Supabase) keeps backups. */
export function backupsSupported(): boolean {
  return isSqlite();
}

export function isBackupName(name: unknown): name is string {
  return typeof name === "string" && NAME.test(name);
}

export function listBackups(): BackupFile[] {
  if (!isSqlite() || !existsSync(BACKUP_DIR)) return [];
  return readdirSync(BACKUP_DIR)
    .filter((n) => NAME.test(n))
    .map((name) => {
      const s = statSync(path.join(BACKUP_DIR, name));
      return { name, bytes: s.size, createdAt: s.mtime.toISOString() };
    })
    .sort((a, b) => b.name.localeCompare(a.name));
}

let lastFingerprint = "";

/** A cheap summary of the data; if it hasn't changed, the hourly backup is skipped. */
async function fingerprint(): Promise<string> {
  const [row] = await db.all<{ s: number; r: number; u: string | null; c: string | null }>(
    `SELECT (SELECT COUNT(*) FROM feedback_sessions) AS s, (SELECT COUNT(*) FROM responses) AS r,
            (SELECT MAX(updated_at) FROM feedback_sessions) AS u, (SELECT MAX(created_at) FROM responses) AS c`,
  );
  return JSON.stringify(row ?? {});
}

/** Write a snapshot. Returns its file name, or null when skipped. */
export async function backupNow(
  reason: "manual" | "hourly" | "before-reset" | "before-clear" | "before-delete" | "before-restore",
): Promise<string | null> {
  if (!isSqlite()) return null;
  const fp = await fingerprint();
  if (reason === "hourly" && fp === lastFingerprint) return null;

  mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
  let name = `sonar-${stamp}-${reason}.db`;
  for (let i = 1; existsSync(path.join(BACKUP_DIR, name)); i++) {
    const s2 = String(Number(stamp.slice(-6)) + i).padStart(6, "0").slice(-6);
    name = `sonar-${stamp.slice(0, 9)}${s2}-${reason}.db`;
  }
  const target = path.join(BACKUP_DIR, name);
  // Path is built entirely by us (no user input), so inlining it is safe.
  await db.run(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
  lastFingerprint = fp;

  for (const old of listBackups().slice(KEEP)) {
    try {
      unlinkSync(path.join(BACKUP_DIR, old.name));
    } catch {
      /* already gone */
    }
  }
  return name;
}

let timer: ReturnType<typeof setInterval> | null = null;

/** Hourly snapshots while the server is up. Called once at startup. */
export function startBackupSchedule(everyMs = 60 * 60 * 1000) {
  if (timer || !isSqlite()) return;
  timer = setInterval(() => {
    backupNow("hourly").catch((err) => console.error("[sonar] hourly backup failed:", err));
  }, everyMs);
  timer.unref?.();
}
