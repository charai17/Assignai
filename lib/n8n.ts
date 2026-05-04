import { getConfig } from "./config";
import type { ApiResult, N8nProxyKind } from "./api";

export type N8nRequest = {
  kind: N8nProxyKind;
  input: string;
  payload: Record<string, unknown>;
  requestId: string;
};

type N8nResponse = {
  result: ApiResult;
  status: number;
};

const TRANSIENT_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);

export async function proxyToN8n({ kind, input, payload, requestId }: N8nRequest): Promise<N8nResponse> {
  const config = getConfig();
  const webhookUrl = kind === "assignment" ? config.n8n.assignmentWebhookUrl : config.n8n.humanizerWebhookUrl;

  if (!webhookUrl) {
    return { result: mockResponse(kind, input, requestId), status: 200 };
  }

  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-request-id": requestId,
  };

  if (config.n8n.authHeader && config.n8n.authValue) {
    headers[config.n8n.authHeader] = config.n8n.authValue;
  }

  const outboundPayload = {
    ...payload,
    kind,
    requestId,
  };

  const attempts = config.n8n.retries + 1;
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.n8n.timeoutMs);

    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(outboundPayload),
        signal: controller.signal,
      });

      const raw = await readResponseBody(response);
      const normalized = normalizeWebhookResult(raw);

      if (response.ok) {
        return {
          status: 200,
          result: {
            ok: true,
            result: normalized || "n8n webhook completed successfully.",
            raw: { requestId, attempt, response: raw },
          },
        };
      }

      if (attempt < attempts && isTransientStatus(response.status)) {
        await sleep(retryDelayMs(attempt));
        continue;
      }

      return {
        status: 502,
        result: {
          ok: false,
          result: mapN8nHttpError(response.status, normalized),
          raw: { requestId, attempt, status: response.status, response: raw },
        },
      };
    } catch (error) {
      lastError = error;
      clearTimeout(timeout);

      if (attempt < attempts && isRetryableFetchError(error)) {
        await sleep(retryDelayMs(attempt));
        continue;
      }

      const message = mapFetchError(error);
      return {
        status: 502,
        result: {
          ok: false,
          result: message,
          raw: { requestId, attempt, error: message },
        },
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  const message = mapFetchError(lastError);
  return {
    status: 502,
    result: {
      ok: false,
      result: message,
      raw: { requestId, error: message },
    },
  };
}

async function readResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function normalizeWebhookResult(raw: unknown): string {
  if (typeof raw === "string") return raw;
  if (!raw || typeof raw !== "object") return "";

  if (Array.isArray(raw)) {
    return raw.length > 0 ? normalizeWebhookResult(raw[0]) : "";
  }

  const record = raw as Record<string, unknown>;
  const keys = ["result", "output", "text", "message", "content", "response"];

  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value;
  }

  if (Array.isArray(record.data) && record.data.length > 0) {
    return normalizeWebhookResult(record.data[0]);
  }

  if (record.data && typeof record.data === "object") {
    return normalizeWebhookResult(record.data);
  }

  return JSON.stringify(raw);
}

function isTransientStatus(status: number): boolean {
  return TRANSIENT_STATUS_CODES.has(status);
}

function isRetryableFetchError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.name === "AbortError" || error.name === "TypeError";
}

function mapFetchError(error: unknown): string {
  if (error instanceof Error && error.name === "AbortError") {
    return "n8n webhook request timed out.";
  }

  if (error instanceof Error && error.message) {
    return `Failed to call n8n webhook: ${error.message}`;
  }

  return "Failed to call n8n webhook.";
}

function mapN8nHttpError(status: number, webhookMessage: string): string {
  if (status === 404) {
    return webhookMessage || "n8n webhook returned 404. If this is a webhook-test URL, click 'Execute workflow' in n8n before testing.";
  }

  if (status === 401 || status === 403) {
    return webhookMessage || "n8n webhook rejected the request. Check webhook auth configuration.";
  }

  if (status === 429) {
    return webhookMessage || "n8n webhook is rate limiting requests. Please try again shortly.";
  }

  if (status >= 500) {
    return webhookMessage || `n8n webhook is temporarily unavailable (HTTP ${status}).`;
  }

  return webhookMessage || `n8n webhook returned HTTP ${status}.`;
}

function retryDelayMs(attempt: number): number {
  return Math.min(250 * 2 ** (attempt - 1), 1_000);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mockResponse(kind: N8nProxyKind, input: string, requestId: string): ApiResult {
  if (kind === "assignment") {
    return {
      ok: true,
      result: `Mock assignment response: received ${input.length} characters. Configure N8N_ASSIGNMENT_WEBHOOK_URL to enable the live n8n workflow.`,
      raw: { mock: true, kind, input, requestId },
    };
  }

  return {
    ok: true,
    result: `Mock humanizer response: ${input}\n\nConfigure N8N_HUMANIZER_WEBHOOK_URL to enable the live n8n workflow.`,
    raw: { mock: true, kind, input, requestId },
  };
}
