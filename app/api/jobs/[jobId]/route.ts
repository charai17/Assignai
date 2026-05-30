import { createRequestId, jsonResult } from "@/lib/api";
import { getGenerationJob, requireJobAuth } from "@/lib/jobs";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: { jobId: string } }) {
  const requestId = createRequestId();
  const auth = await requireJobAuth(request);
  if (!auth.ok) return jsonResult({ ok: false, result: auth.error, raw: { requestId } }, auth.status, requestId);

  const { job, error } = await getGenerationJob(auth.client, params.jobId);
  if (!job) {
    return jsonResult({ ok: false, result: error || "Generation job was not found.", raw: { requestId } }, 404, requestId);
  }

  return jsonResult({ ok: true, result: job.output || job.status, raw: { requestId, job } }, 200, requestId);
}
