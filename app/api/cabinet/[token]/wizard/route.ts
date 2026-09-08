import { cabinetFromToken, needManage, needOperate } from "@/lib/protocol/auth";
import { jsonError, jsonOk, protocolFail } from "@/lib/protocol/http";
import { finishWizard } from "@/lib/protocol/cabinet";
import { issueConnectAgent } from "@/lib/protocol/house-clients";
import { isRecord } from "@/lib/protocol/parse";

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
  if (!isRecord(body) || typeof body.constitution !== "string") {
    return jsonError("bad_request", "constitution is required", 400);
  }
  const type = body.type === "org" || body.type === "personal" ? body.type : undefined;
  try {
    await finishWizard(auth.principal, { constitution: body.constitution, type, email: body.email });
    if (isRecord(body.agent) && typeof body.agent.name === "string" && body.agent.name.trim()) {
      const operate = needOperate(auth);
      if ("error" in operate) return operate.error;
      await issueConnectAgent(auth.principal, body.agent);
    }
    return jsonOk({ ok: true });
  } catch (error) {
    return protocolFail(error);
  }
}
