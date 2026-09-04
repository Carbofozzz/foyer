import { cabinetFromToken } from "@/lib/protocol/auth";
import { jsonError, jsonOk, protocolFail } from "@/lib/protocol/http";
import { enableGuardian } from "@/lib/protocol/house-clients";

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const auth = await cabinetFromToken(token, request);
  if ("error" in auth) return auth.error;
  const principal = auth.principal;
  try {
    return jsonOk(await enableGuardian(principal), 201);
  } catch (error) {
    return protocolFail(error);
  }
}
