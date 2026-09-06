import { cabinetFromToken, needOperate } from "@/lib/protocol/auth";
import { jsonError, jsonOk, protocolFail } from "@/lib/protocol/http";
import { isRecord } from "@/lib/protocol/parse";
import { setTestClients } from "@/lib/protocol/house-clients";

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
  if (!isRecord(body) || typeof body.on !== "boolean") {
    return jsonError("bad_request", "on must be a boolean", 400);
  }
  try {
    await setTestClients(auth.principal, body.on);
    return jsonOk({ on: body.on });
  } catch (error) {
    return protocolFail(error);
  }
}
