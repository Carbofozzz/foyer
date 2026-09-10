import { requireAgent } from "@/lib/protocol/auth";
import { jsonOk } from "@/lib/protocol/http";
import { sweepIfBusy } from "@/lib/protocol/sweep";

export async function GET(request: Request) {
  const auth = await requireAgent(request);
  if ("error" in auth) return auth.error;
  await sweepIfBusy(auth.principal.id, new Date());
  return jsonOk({
    principal_id: auth.principal.id,
    type: auth.principal.type,
    constitution: auth.principal.constitution,
  });
}
