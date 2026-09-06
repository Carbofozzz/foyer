import { requireAgent } from "@/lib/protocol/auth";
import { jsonError, jsonOk, protocolFail } from "@/lib/protocol/http";
import { sweep } from "@/lib/protocol/sweep";
import { reportAction, reportBody } from "@/lib/protocol/report";
import { guardPublicWrite } from "@/lib/ops/guard";
import { LIMITS } from "@/lib/ops/rate-limit";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return guardPublicWrite(request, "report", LIMITS.report, () => postReport(request, context));
}

async function postReport(request: Request, context: { params: Promise<{ id: string }> }) {
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
  try {
    return jsonOk(await reportAction(auth, id, reportBody(body)));
  } catch (error) {
    return protocolFail(error);
  }
}
