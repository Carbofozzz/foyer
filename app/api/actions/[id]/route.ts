import { requireAgent } from "@/lib/protocol/auth";
import { jsonOk, protocolFail } from "@/lib/protocol/http";
import { sweepIfBusy } from "@/lib/protocol/sweep";
import { getAction } from "@/lib/protocol/actions";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAgent(request);
  if ("error" in auth) return auth.error;
  await sweepIfBusy(auth.principal.id, new Date());
  const { id } = await context.params;
  try {
    return jsonOk(await getAction(auth, id));
  } catch (error) {
    return protocolFail(error);
  }
}
