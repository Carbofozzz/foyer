import { NextResponse } from "next/server";
import { ProtocolError } from "./errors";

export function jsonOk<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ data }, { status });
}

export function jsonError(code: string, message: string, status: number): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status });
}

function asProtocolError(error: unknown): ProtocolError | null {
  if (error instanceof ProtocolError) return error;
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    "message" in error &&
    "status" in error &&
    typeof (error as { code: unknown }).code === "string" &&
    typeof (error as { message: unknown }).message === "string" &&
    typeof (error as { status: unknown }).status === "number"
  ) {
    const pe = error as { code: string; message: string; status: number };
    return new ProtocolError(pe.code, pe.message, pe.status);
  }
  if (error && typeof error === "object" && "cause" in error) {
    return asProtocolError((error as { cause: unknown }).cause);
  }
  return null;
}

export function protocolFail(error: unknown): NextResponse {
  const pe = asProtocolError(error);
  if (pe) return jsonError(pe.code, pe.message, pe.status);
  return jsonError("internal", "Unexpected error", 500);
}

export function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token;
}
