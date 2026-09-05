import { NextResponse } from "next/server";
import { publicOrigin } from "@/lib/mcp/config";
import { openApiSpec } from "@/lib/openapi/spec";

/** The document itself, not a `data` envelope: tooling reads this URL as a spec. */
export async function GET(request: Request) {
  return NextResponse.json(openApiSpec(publicOrigin(request)));
}
