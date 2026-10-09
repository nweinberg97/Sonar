import { listThemes } from "@/lib/data";
import { handle, json } from "@/lib/http";

export const dynamic = "force-dynamic";

/** The theme library (creator only). */
export async function GET() {
  return handle(async () => json({ themes: await listThemes() }));
}
