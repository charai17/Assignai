import { NextResponse } from "next/server";
import { getConfig } from "@/lib/config";

export const dynamic = "force-dynamic";

export async function GET() {
  const config = getConfig();

  return NextResponse.json({
    ok: true,
    service: config.serviceName,
    provider: config.ai.provider,
    model: config.ai.provider === "openai" ? config.ai.openaiModel : "mock",
    time: new Date().toISOString(),
  });
}
