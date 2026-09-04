import { requireCabinet } from "@/lib/protocol/auth";
import { jsonError, jsonOk, protocolFail } from "@/lib/protocol/http";
import { enableGuardian } from "@/lib/protocol/house-clients";

export async function POST(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const principal = await requireCabinet(token);
  if (!principal) return jsonError("not_found", "Unknown house", 404);
  try {
    return jsonOk(await enableGuardian(principal), 201);
  } catch (error) {
    return protocolFail(error);
  }
}
