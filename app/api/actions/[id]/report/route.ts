import { requireAgent } from "@/lib/protocol/auth";
import { jsonError, jsonOk, protocolFail } from "@/lib/protocol/http";
import { sweep } from "@/lib/protocol/sweep";
import { reportAction, reportBody } from "@/lib/protocol/report";
import { writeSignFrom } from "@/lib/protocol/write-sign";
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
  let body: unknown = {};
  const text = await request.text();
  if (text.trim()) {
    try {
      body = JSON.parse(text);
    } catch {
      return jsonError("bad_request", "JSON body required", 400);
    }
  }
  try {
    const parsed = reportBody(body);
    return jsonOk(await reportAction(auth, id, parsed, { sign: writeSignFrom(request, parsed) }));
  } catch (error) {
    return protocolFail(error);
  }
}
