import { NextResponse } from "next/server";
import { getBuildStatus } from "@/lib/build-status";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(getBuildStatus());
}
