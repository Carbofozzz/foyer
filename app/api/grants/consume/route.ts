import { consumeGrant } from "@/lib/lock/grants";
import { requireAgent } from "@/lib/protocol/auth";
import { jsonError, jsonOk, protocolFail } from "@/lib/protocol/http";
import { isRecord } from "@/lib/protocol/parse";

export async function POST(request: Request) {
  const auth = await requireAgent(request);
  if ("error" in auth && auth.error) return auth.error;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("bad_request", "JSON body required", 400);
  }
  if (!isRecord(body)) return jsonError("bad_request", "JSON object required", 400);
  const token = typeof body.grant === "string" ? body.grant : "";
  const invocationId = typeof body.invocation_id === "string" ? body.invocation_id : "";
  const args = isRecord(body.args) ? body.args : null;
  if (!token || !invocationId || !args) {
    return jsonError("bad_request", "grant, invocation_id, and args are required", 400);
  }
  try {
    const data = await consumeGrant({
      token,
      agentId: auth.agent.id,
      principalId: auth.principal.id,
      args,
      invocationId,
      model: typeof body.model === "string" ? body.model : "",
      provider: typeof body.provider === "string" ? body.provider : "",
    });
    return jsonOk(data);
  } catch (error) {
    return protocolFail(error);
  }
}
