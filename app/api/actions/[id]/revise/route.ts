import { requireAgent } from "@/lib/protocol/auth";
import { jsonError, jsonOk, protocolFail } from "@/lib/protocol/http";
import { sweep } from "@/lib/protocol/sweep";
import { reviseAction } from "@/lib/protocol/bargain";
import { isRecord } from "@/lib/protocol/parse";
import { publicOrigin } from "@/lib/mcp/config";
import { guardPublicWrite } from "@/lib/ops/guard";
import { LIMITS } from "@/lib/ops/rate-limit";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return guardPublicWrite(request, "revise", LIMITS.propose, () => postRevise(request, context));
}

async function postRevise(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAgent(request);
  if ("error" in auth) return auth.error;
  await sweep(auth.principal.id, new Date(), { origin: publicOrigin(request) });
  const { id } = await context.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("bad_request", "JSON body required", 400);
  }
  if (!isRecord(body)) return jsonError("bad_request", "JSON object required", 400);
  try {
    return jsonOk(await reviseAction(auth, id, body, new Date(), { origin: publicOrigin(request) }));
  } catch (error) {
    return protocolFail(error);
  }
}
