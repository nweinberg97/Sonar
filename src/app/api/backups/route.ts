import { backupNow, listBackups } from "@/lib/backup";
import { handle, json } from "@/lib/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** List snapshots (creator only: protected by the password in middleware). */
export async function GET() {
  return handle(async () => json({ backups: listBackups() }));
}

/** Take a snapshot now. */
export async function POST() {
  return handle(async () => {
    const name = await backupNow("manual");
    return json({ ok: true, name, message: name ? "Backup saved." : "Backups aren't used with this database." });
  });
}
