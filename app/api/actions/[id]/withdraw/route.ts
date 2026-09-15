import { requireAgent } from "@/lib/protocol/auth";
import { jsonError, jsonOk, protocolFail } from "@/lib/protocol/http";
import { sweep } from "@/lib/protocol/sweep";
import { withdrawAction } from "@/lib/protocol/bargain";
import { isRecord } from "@/lib/protocol/parse";
import { writeSignFrom } from "@/lib/protocol/write-sign";
import { guardPublicWrite } from "@/lib/ops/guard";
import { LIMITS } from "@/lib/ops/rate-limit";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return guardPublicWrite(request, "withdraw", LIMITS.object, () => postWithdraw(request, context));
}

async function postWithdraw(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAgent(request);
  if ("error" in auth) return auth.error;
  await sweep(auth.principal.id, new Date());
  const { id } = await context.params;
  let body: Record<string, unknown> = {};
  const text = await request.text();
  if (text.trim()) {
    try {
      const parsed: unknown = JSON.parse(text);
      if (!isRecord(parsed)) return jsonError("bad_request", "JSON object required", 400);
      body = parsed;
    } catch {
      return jsonError("bad_request", "JSON body required", 400);
    }
  }
  try {
    return jsonOk(await withdrawAction(auth, id, { sign: writeSignFrom(request, body) }));
  } catch (error) {
    return protocolFail(error);
  }
}
