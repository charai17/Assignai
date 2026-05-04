export type AppConfig = {
  serviceName: string;
  n8n: {
    assignmentWebhookUrl?: string;
    humanizerWebhookUrl?: string;
    authHeader?: string;
    authValue?: string;
    timeoutMs: number;
    retries: number;
  };
  limits: {
    maxInputChars: number;
    rateLimitWindowMs: number;
    rateLimitMaxRequests: number;
  };
};

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_RETRIES = 1;
const DEFAULT_MAX_INPUT_CHARS = 20_000;
const DEFAULT_RATE_LIMIT_WINDOW_MS = 60_000;
const DEFAULT_RATE_LIMIT_MAX_REQUESTS = 20;

export function getConfig(): AppConfig {
  return {
    serviceName: process.env.SERVICE_NAME || "assignment-humanizer",
    n8n: {
      assignmentWebhookUrl: optionalEnv("N8N_ASSIGNMENT_WEBHOOK_URL"),
      humanizerWebhookUrl: optionalEnv("N8N_HUMANIZER_WEBHOOK_URL"),
      authHeader: optionalEnv("N8N_WEBHOOK_AUTH_HEADER"),
      authValue: optionalEnv("N8N_WEBHOOK_AUTH_VALUE"),
      timeoutMs: readPositiveInteger("N8N_WEBHOOK_TIMEOUT_MS", DEFAULT_TIMEOUT_MS),
      retries: readNonNegativeInteger("N8N_WEBHOOK_RETRIES", DEFAULT_RETRIES),
    },
    limits: {
      maxInputChars: readPositiveInteger("MAX_INPUT_CHARS", DEFAULT_MAX_INPUT_CHARS),
      rateLimitWindowMs: readPositiveInteger("RATE_LIMIT_WINDOW_MS", DEFAULT_RATE_LIMIT_WINDOW_MS),
      rateLimitMaxRequests: readPositiveInteger("RATE_LIMIT_MAX_REQUESTS", DEFAULT_RATE_LIMIT_MAX_REQUESTS),
    },
  };
}

function optionalEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function readPositiveInteger(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] || "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function readNonNegativeInteger(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] || "", 10);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}
