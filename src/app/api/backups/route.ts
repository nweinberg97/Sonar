import { backupNow, listBackups } from "@/lib/backup";
import { fail, handle, json } from "@/lib/http";
import { latestUndoPoint, restoreBackup } from "@/lib/restore";
import { readJson } from "@/lib/validate";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** List snapshots (creator only: protected by the password in middleware). */
export async function GET() {
  return handle(async () => json({ backups: listBackups(), undo: latestUndoPoint() }));
}

/** { action: "create" } take a snapshot · { action: "restore", name } · { action: "undo" } */
export async function POST(req: Request) {
  return handle(async () => {
    const body = await readJson(req).catch(() => ({}) as Record<string, unknown>);
    const action = body.action ?? "create";

    if (action === "create") {
      const name = await backupNow("manual");
      return json({ ok: true, name, message: name ? "Backup saved." : "Backups aren't used with this database." });
    }

    if (action === "restore" || action === "undo") {
      const name = action === "undo" ? latestUndoPoint() : body.name;
      if (typeof name !== "string") return fail("There's nothing to undo yet.", 404);
      try {
        const r = await restoreBackup(name);
        return json({
          ok: true,
          message: `Restored (${r.responses} responses). What was there before is saved as a backup too, so this can be undone.`,
        });
      } catch (err) {
        return fail((err as Error).message || "Couldn't restore that backup.", 400);
      }
    }

    return fail("Unknown action.", 400);
  });
}
