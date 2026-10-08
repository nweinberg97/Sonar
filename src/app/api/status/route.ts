import { json } from "@/lib/http";
import { publicStatus } from "@/lib/services/config";

export const dynamic = "force-dynamic";

export async function GET() {
  return json(publicStatus());
}
