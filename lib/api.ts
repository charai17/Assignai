import { NextResponse } from "next/server";
import { getConfig } from "./config";
import { checkRateLimit } from "./rate-limit";
import { saveGenerationFromRequest } from "./persistence";

export type ApiResult = {
  ok: boolean;
  result: string;
  raw?: unknown;
};

export type ToolKind = "assignment" | "humanize" | "powerpoint" | "references";

export type ValidatedPayload = {
  input: string;
  payload: Record<string, unknown>;
};

export type GenerationRunner = (request: {
  kind: ToolKind;
  input: string;
  payload: Record<string, unknown>;
  requestId: string;
}) => Promise<{ result: ApiResult; status: number }>;

type JsonParseResult =
  | { ok: true; body: unknown }
  | { ok: false; error: string };

type ValidationResult =
  | { ok: true; value: ValidatedPayload }
  | { ok: false; error: string };

export function createRequestId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export async function parseJsonRequest(request: Request): Promise<JsonParseResult> {
  try {
    return { ok: true, body: await request.json() };
  } catch {
    return { ok: false, error: "Invalid JSON request body." };
  }
}

export function validateGenerationPayload(body: unknown, maxInputChars: number): ValidationResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Request body must be a JSON object." };
  }

  const record = body as Record<string, unknown>;
  const candidates = [record.input, record.text, record.assignment, record.content, record.prompt, record.topic];
  const input = candidates.find((value): value is string => typeof value === "string");

  if (typeof input !== "string") {
    return { ok: false, error: "Missing input. Provide a non-empty string in `input`." };
  }

  const trimmed = input.trim();
  if (!trimmed) {
    return { ok: false, error: "Input must be a non-empty string." };
  }

  if (trimmed.length > maxInputChars) {
    return { ok: false, error: `Input is too long. Maximum is ${maxInputChars} characters.` };
  }

  return { ok: true, value: { input: trimmed, payload: { ...record, input: trimmed } } };
}

export function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwardedFor || request.headers.get("x-real-ip") || "unknown";
}

export function jsonResult(result: ApiResult, status: number, requestId: string): NextResponse<ApiResult> {
  const response = NextResponse.json(result, { status });
  response.headers.set("x-request-id", requestId);
  return response;
}

export function applyRateLimit(request: Request, route: ToolKind, requestId: string): NextResponse<ApiResult> | null {
  const config = getConfig();
  const rateLimit = checkRateLimit({
    key: `${route}:${getClientIp(request)}`,
    limit: config.limits.rateLimitMaxRequests,
    windowMs: config.limits.rateLimitWindowMs,
  });

  if (rateLimit.allowed) return null;

  const response = jsonResult(
    {
      ok: false,
      result: "Too many requests. Please wait and try again.",
      raw: { requestId, retryAfterSeconds: rateLimit.retryAfterSeconds },
    },
    429,
    requestId,
  );

  response.headers.set("retry-after", String(rateLimit.retryAfterSeconds || 1));
  response.headers.set("x-ratelimit-limit", String(rateLimit.limit));
  response.headers.set("x-ratelimit-remaining", String(rateLimit.remaining));
  response.headers.set("x-ratelimit-reset", String(Math.ceil(rateLimit.resetAt / 1000)));

  return response;
}

export async function handleGenerationRequest(
  request: Request,
  kind: ToolKind,
  generate: GenerationRunner,
): Promise<NextResponse<ApiResult>> {
  const requestId = createRequestId();
  const config = getConfig();
  const rateLimited = applyRateLimit(request, kind, requestId);
  if (rateLimited) return rateLimited;

  const parsed = await parseJsonRequest(request);
  if (!parsed.ok) {
    return jsonResult({ ok: false, result: parsed.error, raw: { requestId } }, 400, requestId);
  }

  const validated = validateGenerationPayload(parsed.body, config.limits.maxInputChars);
  if (!validated.ok) {
    return jsonResult({ ok: false, result: validated.error, raw: { requestId } }, 400, requestId);
  }

  const { result, status } = await generate({
    kind,
    input: validated.value.input,
    payload: validated.value.payload,
    requestId,
  });

  if (result.ok && result.result) {
    const persistence = await saveGenerationFromRequest({
      request,
      kind,
      input: validated.value.input,
      output: result.result,
      payload: validated.value.payload,
      model: modelFromRaw(result.raw),
    });

    result.raw = { ...(isRecord(result.raw) ? result.raw : {}), persistence };
  }

  return jsonResult(result, status, requestId);
}

function modelFromRaw(raw: unknown): string | undefined {
  if (!isRecord(raw)) return undefined;
  return typeof raw.model === "string" ? raw.model : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
