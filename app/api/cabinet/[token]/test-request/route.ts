import { cabinetFromToken, needOperate } from "@/lib/protocol/auth";
import { jsonError, jsonOk, protocolFail } from "@/lib/protocol/http";
import { runTestRequest } from "@/lib/protocol/test-request";

export const maxDuration = 60;

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const auth = needOperate(await cabinetFromToken(token, request));
  if ("error" in auth) return auth.error;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("bad_request", "JSON body required", 400);
  }
  try {
    return jsonOk(await runTestRequest(auth.principal, body), 201);
  } catch (error) {
    return protocolFail(error);
  }
}
