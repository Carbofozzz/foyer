import { grantJwks, grantSigningKeyConfigured } from "@/lib/lock/jwt";
import { jsonError } from "@/lib/protocol/http";

export async function GET() {
  if (!grantSigningKeyConfigured()) return jsonError("grant_unconfigured", "Grant signer is not set", 503);
  try {
    return Response.json(grantJwks(), {
      headers: { "cache-control": "public, max-age=300" },
    });
  } catch {
    return jsonError("grant_unconfigured", "Grant signer is invalid", 503);
  }
}
