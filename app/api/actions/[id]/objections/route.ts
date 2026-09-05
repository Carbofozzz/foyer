import { requireAgent } from "@/lib/protocol/auth";
import { jsonError, jsonOk, protocolFail } from "@/lib/protocol/http";
import { sweep } from "@/lib/protocol/sweep";
import { fileObjection } from "@/lib/protocol/actions";
import { isRecord } from "@/lib/protocol/parse";
import { guardPublicWrite } from "@/lib/ops/guard";
import { LIMITS } from "@/lib/ops/rate-limit";

export const maxDuration = 120;

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return guardPublicWrite(request, "object", LIMITS.object, () => postObjection(request, context));
}

async function postObjection(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAgent(request);
  if ("error" in auth) return auth.error;
  await sweep(auth.principal.id, new Date());
  const { id } = await context.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("bad_request", "JSON body required", 400);
  }
  if (!isRecord(body)) return jsonError("bad_request", "JSON object required", 400);
  try {
    return jsonOk(await fileObjection(auth, id, body, new Date()), 201);
  } catch (error) {
    return protocolFail(error);
  }
}
