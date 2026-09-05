import { requireAgent } from "@/lib/protocol/auth";
import { jsonError, jsonOk, protocolFail } from "@/lib/protocol/http";
import { sweep } from "@/lib/protocol/sweep";
import { proposeAction } from "@/lib/protocol/actions";
import { isRecord } from "@/lib/protocol/parse";

import { guardPublicWrite } from "@/lib/ops/guard";
import { LIMITS } from "@/lib/ops/rate-limit";

export async function POST(request: Request) {
  return guardPublicWrite(request, "propose", LIMITS.propose, () => postPropose(request));
}

async function postPropose(request: Request) {
  const auth = await requireAgent(request);
  if ("error" in auth) return auth.error;
  await sweep(auth.principal.id, new Date());
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("bad_request", "JSON body required", 400);
  }
  if (!isRecord(body)) return jsonError("bad_request", "JSON object required", 400);
  try {
    const action = await proposeAction(auth, body, new Date());
    return jsonOk(action, 201);
  } catch (error) {
    return protocolFail(error);
  }
}
