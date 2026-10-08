/**
 * Undo / restore from a backup, while Sonar keeps running.
 *
 * Reads the backup file with Node's built-in SQLite reader, then replaces the
 * live data in one transaction. A snapshot of the current state is taken first,
 * so every restore can itself be undone.
 */
import path from "node:path";
import { BACKUP_DIR, backupNow, isBackupName, listBackups } from "./backup";
import { db } from "./db";

// Parent tables first, so references are valid as rows go in.
const TABLES = ["workspaces", "feedback_sessions", "questions", "respondents", "responses", "ai_insights", "syntheses"] as const;

type Row = Record<string, string | number | null>;

async function readBackup(file: string): Promise<Record<string, Row[]>> {
  let sqlite: typeof import("node:sqlite");
  try {
    sqlite = await import("node:sqlite");
  } catch {
    throw new Error("Restoring needs Node.js 22 or newer.");
  }
  const src = new sqlite.DatabaseSync(file, { readOnly: true });
  try {
    const out: Record<string, Row[]> = {};
    const existing = new Set(
      (src.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all() as { name: string }[]).map((r) => r.name),
    );
    for (const t of TABLES) out[t] = existing.has(t) ? (src.prepare(`SELECT * FROM ${t}`).all() as Row[]) : [];
    return out;
  } finally {
    src.close();
  }
}

async function liveColumns(table: string): Promise<Set<string>> {
  const cols = await db.all<{ name: string }>(`SELECT name FROM pragma_table_info('${table}')`);
  return new Set(cols.map((c) => c.name));
}

export async function restoreBackup(name: string): Promise<{ restored: string; safetyCopy: string | null; responses: number }> {
  if (!isBackupName(name) || !listBackups().some((b) => b.name === name)) throw new Error("Backup not found.");
  const data = await readBackup(path.join(BACKUP_DIR, name));

  const safetyCopy = await backupNow("before-restore");

  await db.transaction(async (d) => {
    for (const t of [...TABLES].reverse()) await d.run(`DELETE FROM ${t}`);
    for (const t of TABLES) {
      const live = await liveColumns(t);
      for (const row of data[t]) {
        // Only copy columns that exist today (older backups may lack newer columns).
        const cols = Object.keys(row).filter((c) => live.has(c));
        if (cols.length === 0) continue;
        const values = cols.map((c) => {
          const v = row[c];
          return typeof v === "bigint" ? Number(v) : (v as string | number | null);
        });
        await d.run(`INSERT INTO ${t} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`, ...values);
      }
    }
  });

  return { restored: name, safetyCopy, responses: data.responses.length };
}

/** The most recent snapshot taken right before a reset, delete, clear or restore. */
export function latestUndoPoint(): string | null {
  return listBackups().find((b) => /-before-(reset|delete|clear|restore)\.db$/.test(b.name))?.name ?? null;
}
