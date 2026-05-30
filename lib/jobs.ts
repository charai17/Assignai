import type { SupabaseClient } from "@supabase/supabase-js";
import type { ToolKind } from "./api";
import { databaseMode, getAuthenticatedSupabase, sanitizeMetadata, titleFromInput } from "./persistence";

export type JobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";
export type JobMode = "assignment" | "humanizer" | "powerpoint";

export type GenerationJob = {
  id: string;
  user_id: string;
  mode: JobMode;
  status: JobStatus;
  title: string;
  input: string;
  payload: Record<string, unknown>;
  output: string | null;
  error: string | null;
  request_id: string | null;
  model: string | null;
  progress: number;
  generation_id: string | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
};

export type JobAuthResult =
  | { ok: true; client: SupabaseClient; userId: string }
  | { ok: false; status: number; error: string };

export async function requireJobAuth(request: Request): Promise<JobAuthResult> {
  const auth = await getAuthenticatedSupabase(request);
  if (auth.ok) return { ok: true, client: auth.client, userId: auth.user.id };

  if (auth.reason === "missing-config") {
    return { ok: false, status: 503, error: "Supabase is not configured for generation jobs." };
  }

  if (auth.reason === "missing-auth") {
    return { ok: false, status: 401, error: "Sign in to use tracked generation jobs." };
  }

  return { ok: false, status: 401, error: auth.message || "Your sign-in session could not be verified." };
}

export async function createGenerationJob({
  client,
  userId,
  kind,
  input,
  payload,
  requestId,
}: {
  client: SupabaseClient;
  userId: string;
  kind: ToolKind;
  input: string;
  payload: Record<string, unknown>;
  requestId: string;
}): Promise<{ job: GenerationJob | null; error?: string }> {
  const mode = databaseMode(kind);
  const { data, error } = await client
    .from("generation_jobs")
    .insert({
      user_id: userId,
      mode,
      status: "queued",
      title: titleFromInput(input, mode),
      input,
      payload: sanitizeMetadata(payload),
      request_id: requestId,
      progress: 0,
    })
    .select("*")
    .single();

  return { job: (data as GenerationJob | null) ?? null, error: error?.message };
}

export async function getGenerationJob(client: SupabaseClient, jobId: string): Promise<{ job: GenerationJob | null; error?: string }> {
  const { data, error } = await client.from("generation_jobs").select("*").eq("id", jobId).single();
  return { job: (data as GenerationJob | null) ?? null, error: error?.message };
}

export async function markJobRunning(client: SupabaseClient, jobId: string, requestId: string): Promise<void> {
  await client
    .from("generation_jobs")
    .update({
      status: "running",
      progress: 15,
      request_id: requestId,
      error: null,
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId);
}

export async function markJobCompleted({
  client,
  jobId,
  output,
  model,
  generationId,
}: {
  client: SupabaseClient;
  jobId: string;
  output: string;
  model?: string;
  generationId?: string | null;
}): Promise<void> {
  await client
    .from("generation_jobs")
    .update({
      status: "completed",
      progress: 100,
      output,
      model: model || null,
      generation_id: generationId || null,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId);
}

export async function markJobFailed(client: SupabaseClient, jobId: string, error: string): Promise<void> {
  await client
    .from("generation_jobs")
    .update({
      status: "failed",
      progress: 100,
      error,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId);
}

export function kindFromMode(mode: JobMode): ToolKind {
  return mode === "humanizer" ? "humanize" : mode;
}
