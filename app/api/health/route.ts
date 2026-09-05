import { NextResponse } from "next/server";
import { readHealth } from "@/lib/ops/health";

export const dynamic = "force-dynamic";

export async function GET() {
  const health = await readHealth();
  return NextResponse.json(health, { status: health.ok ? 200 : 503 });
}
