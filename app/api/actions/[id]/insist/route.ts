import { requireAgent } from "@/lib/protocol/auth";
import { jsonOk, protocolFail } from "@/lib/protocol/http";
import { sweep } from "@/lib/protocol/sweep";
import { insistAction } from "@/lib/protocol/bargain";
import { guardPublicWrite } from "@/lib/ops/guard";
import { LIMITS } from "@/lib/ops/rate-limit";

export const maxDuration = 120;

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return guardPublicWrite(request, "insist", LIMITS.object, () => postInsist(request, context));
}

async function postInsist(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAgent(request);
  if ("error" in auth) return auth.error;
  await sweep(auth.principal.id, new Date());
  const { id } = await context.params;
  try {
    return jsonOk(await insistAction(auth, id, new Date()));
  } catch (error) {
    return protocolFail(error);
  }
}
