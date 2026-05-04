import { applyRateLimit, createRequestId, jsonResult, parseJsonRequest, validateWebhookPayload } from "@/lib/api";
import { getConfig } from "@/lib/config";
import { proxyToN8n } from "@/lib/n8n";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const requestId = createRequestId();
  const rateLimited = applyRateLimit(request, "assignment", requestId);
  if (rateLimited) return rateLimited;

  const parsed = await parseJsonRequest(request);
  if (!parsed.ok) {
    return jsonResult({ ok: false, result: parsed.error, raw: { requestId } }, 400, requestId);
  }

  const validated = validateWebhookPayload(parsed.body, getConfig().limits.maxInputChars);
  if (!validated.ok) {
    return jsonResult({ ok: false, result: validated.error, raw: { requestId } }, 400, requestId);
  }

  const { result, status } = await proxyToN8n({
    kind: "assignment",
    input: validated.value.input,
    payload: validated.value.payload,
    requestId,
  });

  return jsonResult(result, status, requestId);
}
