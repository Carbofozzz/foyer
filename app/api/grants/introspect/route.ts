import { introspectGrant } from "@/lib/lock/grants";
import { jsonError, jsonOk, protocolFail } from "@/lib/protocol/http";
import { isRecord } from "@/lib/protocol/parse";

/** A facilitator reads grant status. The JWT is the credential. This route does not settle. */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("bad_request", "JSON body required", 400);
  }
  if (!isRecord(body) || typeof body.grant !== "string" || !body.grant) {
    return jsonError("bad_request", "grant is required", 400);
  }
  try {
    const data = await introspectGrant(body.grant, typeof body.invocation_id === "string" ? body.invocation_id : undefined);
    return jsonOk(data);
  } catch (error) {
    return protocolFail(error);
  }
}
