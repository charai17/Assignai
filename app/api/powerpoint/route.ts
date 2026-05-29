import { applyRateLimit, createRequestId, jsonResult, parseJsonRequest, validateGenerationPayload } from "@/lib/api";
import { generateResult } from "@/lib/ai";
import { getConfig } from "@/lib/config";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const requestId = createRequestId();
  const rateLimited = applyRateLimit(request, "powerpoint", requestId);
  if (rateLimited) return rateLimited;

  const parsed = await parseJsonRequest(request);
  if (!parsed.ok) {
    return jsonResult({ ok: false, result: parsed.error, raw: { requestId } }, 400, requestId);
  }

  const validated = validateGenerationPayload(parsed.body, getConfig().limits.maxInputChars);
  if (!validated.ok) {
    return jsonResult({ ok: false, result: validated.error, raw: { requestId } }, 400, requestId);
  }

  const { result, status } = await generateResult({
    kind: "powerpoint",
    input: validated.value.input,
    payload: validated.value.payload,
    requestId,
  });

  return jsonResult(result, status, requestId);
}
