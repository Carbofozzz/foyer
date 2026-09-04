import { requireCabinetRequest } from "@/lib/protocol/auth";
import { jsonError, jsonOk, protocolFail } from "@/lib/protocol/http";
import { appealCase, parseAppealBody } from "@/lib/protocol/appeal";
import { sweep } from "@/lib/protocol/sweep";

export const maxDuration = 120;

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireCabinetRequest(request);
  if ("error" in auth) return auth.error;
  await sweep(auth.principal.id, new Date());
  const { id } = await context.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("bad_request", "JSON body required", 400);
  }
  try {
    return jsonOk(await appealCase(auth.principal, id, parseAppealBody(body), new Date()));
  } catch (error) {
    return protocolFail(error);
  }
}
