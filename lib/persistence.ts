import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import type { ToolKind } from "./api";

type SaveGenerationInput = {
  request: Request;
  kind: ToolKind;
  input: string;
  output: string;
  payload: Record<string, unknown>;
  model?: string;
};

type SaveGenerationResult =
  | { saved: true; projectId: string | null; generationId: string | null }
  | { saved: false; reason: "missing-config" | "missing-auth" | "invalid-auth" | "database-error"; message?: string };

export type AuthenticatedSupabase = {
  client: SupabaseClient;
  user: User;
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export async function saveGenerationFromRequest({
  request,
  kind,
  input,
  output,
  payload,
  model,
}: SaveGenerationInput): Promise<SaveGenerationResult> {
  if (!supabaseUrl || !supabaseAnonKey) return { saved: false, reason: "missing-config" };

  const auth = await getAuthenticatedSupabase(request);
  if (!auth.ok) return { saved: false, reason: auth.reason, message: auth.message };

  return saveGenerationForUser({
    client: auth.client,
    userId: auth.user.id,
    kind,
    input,
    output,
    payload,
    model,
  });
}

export async function saveGenerationForUser({
  client,
  userId,
  kind,
  input,
  output,
  payload,
  model,
}: {
  client: SupabaseClient;
  userId: string;
  kind: ToolKind;
  input: string;
  output: string;
  payload: Record<string, unknown>;
  model?: string;
}): Promise<SaveGenerationResult> {
  const mode = databaseMode(kind);
  const title = titleFromInput(input, mode);

  const { data: project, error: projectError } = await client
    .from("projects")
    .insert({ user_id: userId, kind: mode, title })
    .select("id")
    .single();

  const { data: generation, error: generationError } = await client
    .from("generations")
    .insert({
      user_id: userId,
      project_id: projectError ? null : project?.id ?? null,
      mode,
      title,
      input,
      output,
      metadata: sanitizeMetadata(payload),
    })
    .select("id")
    .single();

  await client.from("usage_events").insert({
    user_id: userId,
    mode,
    input_chars: input.length,
    output_chars: output.length,
    model: model || null,
  });

  if (generationError) {
    return { saved: false, reason: "database-error", message: generationError.message };
  }

  return {
    saved: true,
    projectId: project?.id ?? null,
    generationId: generation?.id ?? null,
  };
}

export async function getAuthenticatedSupabase(request: Request): Promise<
  | ({ ok: true } & AuthenticatedSupabase)
  | { ok: false; reason: "missing-config" | "missing-auth" | "invalid-auth"; message?: string }
> {
  if (!supabaseUrl || !supabaseAnonKey) return { ok: false, reason: "missing-config" };

  const token = bearerToken(request);
  if (!token) return { ok: false, reason: "missing-auth" };

  const client = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await client.auth.getUser(token);
  const user = userData.user;
  if (userError || !user) return { ok: false, reason: "invalid-auth", message: userError?.message };

  return { ok: true, client, user };
}

function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export function databaseMode(kind: ToolKind): "assignment" | "references" | "humanizer" | "powerpoint" {
  return kind === "humanize" ? "humanizer" : kind;
}

export function titleFromInput(input: string, mode: "assignment" | "references" | "humanizer" | "powerpoint"): string {
  const fallback = mode === "assignment"
    ? "AssignAI Assignment"
    : mode === "references"
      ? "AssignAI Referenced Draft"
      : mode === "humanizer"
        ? "AssignAI Humanized Text"
        : "AssignAI Presentation";
  return input.replace(/\s+/g, " ").trim().slice(0, 80) || fallback;
}

export function sanitizeMetadata(payload: Record<string, unknown>): Record<string, unknown> {
  const copy = { ...payload };
  delete copy.input;
  delete copy.text;
  delete copy.content;
  delete copy.assignment;
  delete copy.prompt;
  delete copy.topic;
  return copy;
}
