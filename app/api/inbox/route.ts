import { requireAgent } from "@/lib/protocol/auth";
import { jsonOk } from "@/lib/protocol/http";
import { sweep } from "@/lib/protocol/sweep";

export async function GET(request: Request) {
  const auth = await requireAgent(request);
  if ("error" in auth) return auth.error;
  await sweep(auth.principal.id, new Date());
  return jsonOk({ items: [] });
}
