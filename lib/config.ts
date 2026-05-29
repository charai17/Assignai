export type AiProvider = "mock" | "openai" | "openrouter";

export type AppConfig = {
  serviceName: string;
  ai: {
    provider: AiProvider;
    openAiApiKey?: string;
    openAiModel: string;
    openRouterApiKey?: string;
    openRouterModel: string;
    appUrl?: string;
    appTitle: string;
    timeoutMs: number;
  };
  limits: {
    maxInputChars: number;
    rateLimitWindowMs: number;
    rateLimitMaxRequests: number;
  };
};

const DEFAULT_TIMEOUT_MS = 45_000;
const DEFAULT_MAX_INPUT_CHARS = 20_000;
const DEFAULT_RATE_LIMIT_WINDOW_MS = 60_000;
const DEFAULT_RATE_LIMIT_MAX_REQUESTS = 20;
const DEFAULT_OPENAI_MODEL = "gpt-4.1";
const DEFAULT_OPENROUTER_MODEL = "openai/gpt-4.1-mini";

export function getConfig(): AppConfig {
  const requestedProvider = optionalEnv("AI_PROVIDER") as AiProvider | undefined;
  const openAiApiKey = optionalEnv("OPENAI_API_KEY");
  const openRouterApiKey = optionalEnv("OPENROUTER_API_KEY");
  const provider = chooseProvider(requestedProvider, openAiApiKey, openRouterApiKey);

  return {
    serviceName: process.env.SERVICE_NAME || "assignai",
    ai: {
      provider,
      openAiApiKey,
      openAiModel: optionalEnv("OPENAI_MODEL") || DEFAULT_OPENAI_MODEL,
      openRouterApiKey,
      openRouterModel: optionalEnv("OPENROUTER_MODEL") || DEFAULT_OPENROUTER_MODEL,
      appUrl: optionalEnv("OPENROUTER_APP_URL"),
      appTitle: optionalEnv("OPENROUTER_APP_TITLE") || "AssignAI",
      timeoutMs: readPositiveInteger("AI_REQUEST_TIMEOUT_MS", DEFAULT_TIMEOUT_MS),
    },
    limits: {
      maxInputChars: readPositiveInteger("MAX_INPUT_CHARS", DEFAULT_MAX_INPUT_CHARS),
      rateLimitWindowMs: readPositiveInteger("RATE_LIMIT_WINDOW_MS", DEFAULT_RATE_LIMIT_WINDOW_MS),
      rateLimitMaxRequests: readPositiveInteger("RATE_LIMIT_MAX_REQUESTS", DEFAULT_RATE_LIMIT_MAX_REQUESTS),
    },
  };
}

function chooseProvider(requested: AiProvider | undefined, openAiApiKey: string | undefined, openRouterApiKey: string | undefined): AiProvider {
  if (requested === "mock") return "mock";
  if (requested === "openai" && openAiApiKey) return "openai";
  if (requested === "openrouter" && openRouterApiKey) return "openrouter";
  if (openAiApiKey) return "openai";
  if (openRouterApiKey) return "openrouter";
  return "mock";
}

function optionalEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function readPositiveInteger(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] || "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
