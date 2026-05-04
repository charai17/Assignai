import { NextResponse } from "next/server";
import { getConfig } from "@/lib/config";

export const dynamic = "force-dynamic";

export async function GET() {
  const config = getConfig();

  return NextResponse.json({
    ok: true,
    service: config.serviceName,
    time: new Date().toISOString(),
  });
}
