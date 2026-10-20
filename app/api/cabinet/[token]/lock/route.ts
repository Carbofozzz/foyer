import { lockHandsFor, saveLockHands } from "@/lib/lock/house-hands";
import { enabledLockHands } from "@/lib/lock/hands";
import { cabinetFromToken, needManage } from "@/lib/protocol/auth";
import { jsonError, jsonOk, protocolFail } from "@/lib/protocol/http";
import { isRecord } from "@/lib/protocol/parse";

export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const auth = needManage(await cabinetFromToken(token, request));
  if ("error" in auth) return auth.error;
  try {
    const hands = await lockHandsFor(auth.principal.id);
    return jsonOk({ hands });
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
  if (!isRecord(body) || !Array.isArray(body.hands)) return jsonError("bad_request", "hands array required", 400);
  try {
    const hands = await saveLockHands(auth.principal.id, enabledLockHands(body.hands));
    return jsonOk({ hands });
  } catch (error) {
    return protocolFail(error);
  }
}
