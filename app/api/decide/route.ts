import { jsonError, jsonOk, protocolFail } from "@/lib/protocol/http";
import { decideFromToken, loadDecideView } from "@/lib/notify/outbox";
import { guardPublicWrite } from "@/lib/ops/guard";
import { LIMITS } from "@/lib/ops/rate-limit";
import { isRecord } from "@/lib/protocol/parse";

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token");
  if (!token) return jsonError("bad_request", "token is required", 400);
  try {
    return jsonOk(await loadDecideView(token));
  } catch (error) {
    return protocolFail(error);
  }
}

export async function POST(request: Request) {
  return guardPublicWrite(request, "decide", LIMITS.decide, () => postDecide(request));
}

async function postDecide(request: Request) {
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
    return jsonOk(await decideFromToken(body.token, body.outcome, new Date()));
  } catch (error) {
    return protocolFail(error);
  }
}
