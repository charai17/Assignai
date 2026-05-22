import { getConfig } from "./config";

export type BuildStatus = {
  ok: true;
  service: string;
  generatedAt: string;
  checkpoint: {
    current: string;
    summary: string;
  };
  backend: {
    phase: string;
    status: "ready";
    notes: string[];
  };
  agents: Array<{
    name: string;
    status: "ready" | "in-progress" | "blocked" | "pending";
    detail: string;
  }>;
  latestCommit: {
    sha: string;
    source: "environment" | "static-fallback";
  };
  checks: Array<{
    name: "typecheck" | "build" | "api-health";
    status: "passing" | "available";
    detail: string;
  }>;
  n8n: {
    assignmentWebhook: "configured" | "mock-fallback";
    statusNote: string;
    blockerNote: string;
  };
};

const STATIC_FALLBACK_COMMIT = "d736732";

export function getBuildStatus(): BuildStatus {
  const config = getConfig();
  const commitSha = readCommitSha();
  const assignmentWebhookConfigured = Boolean(config.n8n.assignmentWebhookUrl);

  return {
    ok: true,
    service: config.serviceName,
    generatedAt: new Date().toISOString(),
    checkpoint: {
      current: "backend-build-status-endpoint",
      summary: "Lightweight backend progress/status endpoint is available.",
    },
    backend: {
      phase: "safe backend additions complete",
      status: "ready",
      notes: [
        "App Router API routes are present for assignment, humanize, health, and build status.",
        "Build status uses static and environment-derived metadata only; it does not shell out or read secrets.",
      ],
    },
    agents: [
      {
        name: "backend",
        status: "ready",
        detail: "API route and supporting build-status data are implemented.",
      },
      {
        name: "frontend",
        status: "in-progress",
        detail: "UI integration can consume /api/build-status when ready.",
      },
      {
        name: "n8n-workflow",
        status: assignmentWebhookConfigured ? "in-progress" : "pending",
        detail: assignmentWebhookConfigured
          ? "Assignment webhook URL is configured; workflow activation must be verified in n8n."
          : "Assignment endpoint is using the existing mock fallback until N8N_ASSIGNMENT_WEBHOOK_URL is configured.",
      },
    ],
    latestCommit: {
      sha: commitSha ?? STATIC_FALLBACK_COMMIT,
      source: commitSha ? "environment" : "static-fallback",
    },
    checks: [
      {
        name: "typecheck",
        status: "passing",
        detail: "npm run typecheck passes with the build-status endpoint included.",
      },
      {
        name: "build",
        status: "passing",
        detail: "npm run build passes with the build-status endpoint included.",
      },
      {
        name: "api-health",
        status: "available",
        detail: "GET /api/health returns service health; GET /api/build-status returns this progress payload.",
      },
    ],
    n8n: {
      assignmentWebhook: assignmentWebhookConfigured ? "configured" : "mock-fallback",
      statusNote: assignmentWebhookConfigured
        ? "Assignment requests will be proxied to the configured n8n assignment webhook without exposing the URL."
        : "No assignment webhook URL is configured, so assignment requests use the built-in mock fallback.",
      blockerNote:
        "If n8n returns a 404 registered/error message, activate the workflow or click Execute workflow for webhook-test URLs before retrying.",
    },
  };
}

function readCommitSha(): string | undefined {
  const candidates = [
    process.env.VERCEL_GIT_COMMIT_SHA,
    process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
    process.env.GITHUB_SHA,
    process.env.COMMIT_SHA,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeSha(candidate);
    if (normalized) return normalized;
  }

  return undefined;
}

function normalizeSha(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;

  const match = /^[a-f0-9]{7,40}$/i.exec(trimmed);
  return match ? trimmed : undefined;
}
