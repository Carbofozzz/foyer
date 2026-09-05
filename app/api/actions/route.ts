import { requireAgent } from "@/lib/protocol/auth";
import { jsonError, jsonOk, protocolFail } from "@/lib/protocol/http";
import { sweep } from "@/lib/protocol/sweep";
import { ABUSE, readBoundedJson } from "@/lib/protocol/abuse";
import { proposeAction } from "@/lib/protocol/actions";
import { isRecord } from "@/lib/protocol/parse";

import { guardPublicWrite } from "@/lib/ops/guard";
import { LIMITS, overLimitKey } from "@/lib/ops/rate-limit";

export async function POST(request: Request) {
  return guardPublicWrite(request, "propose", LIMITS.propose, () => postPropose(request));
}

async function postPropose(request: Request) {
  const declared = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > ABUSE.bodyBytes) {
    return jsonError("payload_too_large", "Body is too large", 413);
  }
  const auth = await requireAgent(request);
  if ("error" in auth) return auth.error;
  await sweep(auth.principal.id, new Date());
  if (await overLimitKey(`propose:agent:${auth.agent.id}`, LIMITS.proposeAgent)) {
    return jsonError("rate_limited", "Too many proposals from this agent", 429);
  }
  let body: unknown;
  try {
    body = await readBoundedJson(request);
  } catch (error) {
    return protocolFail(error);
  }
  if (!isRecord(body)) return jsonError("bad_request", "JSON object required", 400);
  try {
    const action = await proposeAction(auth, body, new Date());
    return jsonOk(action, 201);
  } catch (error) {
    return protocolFail(error);
  }
}
