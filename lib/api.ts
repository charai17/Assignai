import { NextResponse } from "next/server";
import { getConfig } from "./config";
import { checkRateLimit } from "./rate-limit";

export type ApiResult = {
  ok: boolean;
  result: string;
  raw?: unknown;
};

export type N8nProxyKind = "assignment" | "humanize";

export type ValidatedPayload = {
  input: string;
  payload: Record<string, unknown>;
};

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

export function validateWebhookPayload(body: unknown, maxInputChars: number): ValidationResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Request body must be a JSON object." };
  }

  const record = body as Record<string, unknown>;
  const candidates = [record.input, record.text, record.assignment, record.content];
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

export function applyRateLimit(request: Request, route: string, requestId: string): NextResponse<ApiResult> | null {
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
