import { requireAgent } from "@/lib/protocol/auth";
import { jsonOk } from "@/lib/protocol/http";
import { sweepIfBusy } from "@/lib/protocol/sweep";
import { inboxFor } from "@/lib/protocol/actions";

export const maxDuration = 120;

export async function GET(request: Request) {
  const auth = await requireAgent(request);
  if ("error" in auth) return auth.error;
  await sweepIfBusy(auth.principal.id, new Date());
  return jsonOk(await inboxFor(auth));
}
