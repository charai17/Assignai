import { handleGenerationRequest } from "@/lib/api";
import { generateResult } from "@/lib/ai";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  return handleGenerationRequest(request, "assignment", generateResult);
}
