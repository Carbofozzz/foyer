import { jsonError, jsonOk, protocolFail } from "@/lib/protocol/http";
import { confirmEmailToken } from "@/lib/notify/contacts";
import { guardPublicWrite } from "@/lib/ops/guard";
import { LIMITS } from "@/lib/ops/rate-limit";
import { isRecord } from "@/lib/protocol/parse";

export async function POST(request: Request) {
  return guardPublicWrite(request, "confirmEmail", LIMITS.confirmEmail, () => postConfirm(request));
}

async function postConfirm(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("bad_request", "JSON body required", 400);
  }
  if (!isRecord(body) || typeof body.token !== "string") {
    return jsonError("bad_request", "token is required", 400);
  }
  try {
    return jsonOk(await confirmEmailToken(body.token));
  } catch (error) {
    return protocolFail(error);
  }
}
