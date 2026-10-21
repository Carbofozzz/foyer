import { exportGrantJournal, revokeGrants } from "@/lib/lock/grants";
import { cabinetFromToken, needManage } from "@/lib/protocol/auth";
import { jsonError, jsonOk, protocolFail } from "@/lib/protocol/http";
import { isRecord } from "@/lib/protocol/parse";

export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const auth = needManage(await cabinetFromToken(token, request));
  if ("error" in auth) return auth.error;
  try {
    const data = await exportGrantJournal(auth.principal.id);
    return jsonOk(data);
  } catch (error) {
    return protocolFail(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const auth = needManage(await cabinetFromToken(token, request));
  if ("error" in auth) return auth.error;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("bad_request", "JSON body required", 400);
  }
  if (!isRecord(body)) return jsonError("bad_request", "JSON object required", 400);
  const scope = body.scope === "agent" || body.scope === "grant" ? body.scope : "house";
  try {
    const revoked = await revokeGrants({
      principalId: auth.principal.id,
      agentId: scope === "agent" && typeof body.agent_id === "string" ? body.agent_id : null,
      grantId: scope === "grant" && typeof body.grant_id === "string" ? body.grant_id : null,
    });
    return jsonOk({ revoked });
  } catch (error) {
    return protocolFail(error);
  }
}
