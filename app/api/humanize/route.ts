import { handleGenerationRequest } from "@/lib/api";
import { generateResult } from "@/lib/ai";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  return handleGenerationRequest(request, "humanize", generateResult);
}
