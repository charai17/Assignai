import { createClient } from "@supabase/supabase-js";
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

  const token = bearerToken(request);
  if (!token) return { saved: false, reason: "missing-auth" };

  const client = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await client.auth.getUser(token);
  const user = userData.user;
  if (userError || !user) return { saved: false, reason: "invalid-auth", message: userError?.message };

  const mode = databaseMode(kind);
  const title = titleFromInput(input, mode);

  const { data: project, error: projectError } = await client
    .from("projects")
    .insert({ user_id: user.id, kind: mode, title })
    .select("id")
    .single();

  const { data: generation, error: generationError } = await client
    .from("generations")
    .insert({
      user_id: user.id,
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
    user_id: user.id,
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

function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function databaseMode(kind: ToolKind): "assignment" | "humanizer" | "powerpoint" {
  return kind === "humanize" ? "humanizer" : kind;
}

function titleFromInput(input: string, mode: "assignment" | "humanizer" | "powerpoint"): string {
  const fallback = mode === "assignment" ? "AssignAI Assignment" : mode === "humanizer" ? "AssignAI Humanized Text" : "AssignAI Presentation";
  return input.replace(/\s+/g, " ").trim().slice(0, 80) || fallback;
}

function sanitizeMetadata(payload: Record<string, unknown>): Record<string, unknown> {
  const copy = { ...payload };
  delete copy.input;
  delete copy.text;
  delete copy.content;
  delete copy.assignment;
  delete copy.prompt;
  delete copy.topic;
  return copy;
}
