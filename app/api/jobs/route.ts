import { createGenerationJob, requireJobAuth } from "@/lib/jobs";
import { applyRateLimit, createRequestId, jsonResult, parseJsonRequest, validateGenerationPayload, type ToolKind } from "@/lib/api";
import { getConfig } from "@/lib/config";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const requestId = createRequestId();
  const rateLimited = applyRateLimit(request, "assignment", requestId);
  if (rateLimited) return rateLimited;

  const auth = await requireJobAuth(request);
  if (!auth.ok) return jsonResult({ ok: false, result: auth.error, raw: { requestId } }, auth.status, requestId);

  const parsed = await parseJsonRequest(request);
  if (!parsed.ok) return jsonResult({ ok: false, result: parsed.error, raw: { requestId } }, 400, requestId);

  const body = parsed.body;
  const kind = readKind(body);
  if (!kind) return jsonResult({ ok: false, result: "Job kind must be assignment, humanize, or powerpoint.", raw: { requestId } }, 400, requestId);

  const validated = validateGenerationPayload(body, getConfig().limits.maxInputChars);
  if (!validated.ok) return jsonResult({ ok: false, result: validated.error, raw: { requestId } }, 400, requestId);

  const { job, error } = await createGenerationJob({
    client: auth.client,
    userId: auth.userId,
    kind,
    input: validated.value.input,
    payload: validated.value.payload,
    requestId,
  });

  if (!job) {
    return jsonResult({ ok: false, result: error || "Could not create the generation job.", raw: { requestId } }, 500, requestId);
  }

  return jsonResult(
    {
      ok: true,
      result: "Generation job created.",
      raw: { requestId, job },
    },
    201,
    requestId,
  );
}

function readKind(body: unknown): ToolKind | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const value = (body as Record<string, unknown>).kind || (body as Record<string, unknown>).mode;
  if (value === "assignment" || value === "humanize" || value === "powerpoint") return value;
  if (value === "humanizer") return "humanize";
  return null;
}
