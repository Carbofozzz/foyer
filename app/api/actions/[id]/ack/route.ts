import { requireAgent } from "@/lib/protocol/auth";
import { jsonError } from "@/lib/protocol/http";
import { sweep } from "@/lib/protocol/sweep";

export async function POST(request: Request) {
  const auth = await requireAgent(request);
  if ("error" in auth) return auth.error;
  await sweep(auth.principal.id, new Date());
  return jsonError("not_implemented", "Ack lands on day 2", 501);
}
