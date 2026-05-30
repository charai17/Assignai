import { createRequestId, jsonResult } from "@/lib/api";
import { generateResult } from "@/lib/ai";
import { getGenerationJob, kindFromMode, markJobCompleted, markJobFailed, markJobRunning, requireJobAuth } from "@/lib/jobs";
import { saveGenerationForUser } from "@/lib/persistence";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: { jobId: string } }) {
  const requestId = createRequestId();
  const auth = await requireJobAuth(request);
  if (!auth.ok) return jsonResult({ ok: false, result: auth.error, raw: { requestId } }, auth.status, requestId);

  const { job, error } = await getGenerationJob(auth.client, params.jobId);
  if (!job) {
    return jsonResult({ ok: false, result: error || "Generation job was not found.", raw: { requestId } }, 404, requestId);
  }

  if (job.status === "completed") {
    return jsonResult({ ok: true, result: job.output || "", raw: { requestId, job } }, 200, requestId);
  }

  if (job.status === "running") {
    return jsonResult({ ok: false, result: "This generation job is already running.", raw: { requestId, job } }, 409, requestId);
  }

  if (job.status === "cancelled") {
    return jsonResult({ ok: false, result: "This generation job was cancelled.", raw: { requestId, job } }, 409, requestId);
  }

  await markJobRunning(auth.client, job.id, requestId);

  try {
    const kind = kindFromMode(job.mode);
    const generation = await generateResult({
      kind,
      input: job.input,
      payload: { ...job.payload, input: job.input },
      requestId,
    });

    if (!generation.result.ok) {
      await markJobFailed(auth.client, job.id, generation.result.result);
      return jsonResult(generation.result, generation.status, requestId);
    }

    const saved = await saveGenerationForUser({
      client: auth.client,
      userId: auth.userId,
      kind,
      input: job.input,
      output: generation.result.result,
      payload: { ...job.payload, input: job.input },
      model: readModel(generation.result.raw),
    });

    await markJobCompleted({
      client: auth.client,
      jobId: job.id,
      output: generation.result.result,
      model: readModel(generation.result.raw),
      generationId: saved.saved ? saved.generationId : null,
    });

    return jsonResult(
      {
        ok: true,
        result: generation.result.result,
        raw: {
          ...(isRecord(generation.result.raw) ? generation.result.raw : {}),
          requestId,
          jobId: job.id,
          persistence: saved,
        },
      },
      200,
      requestId,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Generation job failed.";
    await markJobFailed(auth.client, job.id, message);
    return jsonResult({ ok: false, result: message, raw: { requestId, jobId: job.id } }, 500, requestId);
  }
}

function readModel(raw: unknown): string | undefined {
  if (!isRecord(raw)) return undefined;
  return typeof raw.model === "string" ? raw.model : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
