import { handleGenerationRequest } from "@/lib/api";
import { generateResult } from "@/lib/ai";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleGenerationRequest(request, "powerpoint", generateResult);
}
