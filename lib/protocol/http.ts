import { NextResponse } from "next/server";
import { ProtocolError } from "./errors";

export function jsonOk<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ data }, { status });
}

export function jsonError(code: string, message: string, status: number): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status });
}

export function protocolFail(error: unknown): NextResponse {
  if (error instanceof ProtocolError) {
    return jsonError(error.code, error.message, error.status);
  }
  return jsonError("internal", "Unexpected error", 500);
}

export function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token;
}
