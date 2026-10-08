import { readFileSync } from "node:fs";
import path from "node:path";
import { BACKUP_DIR, isBackupName, listBackups } from "@/lib/backup";
import { fail, handle } from "@/lib/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Download one snapshot as a .db file you can open with any SQLite viewer. */
export async function GET(req: Request) {
  return handle(async () => {
    const name = new URL(req.url).searchParams.get("name");
    // Only names that match our own pattern AND exist in the folder; no paths.
    if (!isBackupName(name) || !listBackups().some((b) => b.name === name)) return fail("Backup not found.", 404);
    const bytes = readFileSync(path.join(BACKUP_DIR, name));
    return new Response(bytes, {
      headers: {
        "content-type": "application/vnd.sqlite3",
        "content-disposition": `attachment; filename="${name}"`,
        "cache-control": "no-store",
      },
    });
  });
}
