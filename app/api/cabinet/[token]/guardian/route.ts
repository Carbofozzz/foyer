import { cabinetFromToken, needManage } from "@/lib/protocol/auth";
import { jsonError, jsonOk, protocolFail } from "@/lib/protocol/http";
import { isRecord } from "@/lib/protocol/parse";
import { loadGuardianSettings, saveGuardianSettings } from "@/lib/guardian/settings";

export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const auth = needManage(await cabinetFromToken(token, request));
  if ("error" in auth) return auth.error;
  return jsonOk(await loadGuardianSettings(auth.principal.id));
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
  if (!isRecord(body)) return jsonError("bad_request", "JSON body required", 400);
  try {
    const saved = await saveGuardianSettings(auth.principal.id, {
      name: typeof body.name === "string" ? body.name : undefined,
      llm_url: typeof body.llm_url === "string" ? body.llm_url : undefined,
      llm_model: typeof body.llm_model === "string" ? body.llm_model : undefined,
      llm_key: typeof body.llm_key === "string" ? body.llm_key : undefined,
      addendum: typeof body.addendum === "string" ? body.addendum : undefined,
    });
    return jsonOk(saved);
  } catch (error) {
    return protocolFail(error);
  }
}
