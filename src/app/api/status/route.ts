import { json } from "@/lib/http";
import { analysisStatus } from "@/lib/services/analysis-queue";
import { ollamaHealth, publicStatus } from "@/lib/services/config";

export const dynamic = "force-dynamic";

export async function GET() {
  const base = publicStatus();
  return json({ ...base, ai: { ...base.ai, ollama: await ollamaHealth(), queue: analysisStatus() } });
}
