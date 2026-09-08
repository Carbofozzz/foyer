import { requireAgent } from "@/lib/protocol/auth";
import { jsonOk, protocolFail } from "@/lib/protocol/http";
import { sweep } from "@/lib/protocol/sweep";
import { withdrawAction } from "@/lib/protocol/bargain";
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
  try {
    return jsonOk(await withdrawAction(auth, id));
  } catch (error) {
    return protocolFail(error);
  }
}
