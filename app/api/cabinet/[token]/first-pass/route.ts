import { cabinetFromToken } from "@/lib/protocol/auth";
import { jsonError, jsonOk, protocolFail } from "@/lib/protocol/http";
import { runFirstPass } from "@/lib/protocol/house-clients";

export const maxDuration = 180;

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const auth = await cabinetFromToken(token, request);
  if ("error" in auth) return auth.error;
  const principal = auth.principal;
  try {
    return jsonOk(await runFirstPass(principal));
  } catch (error) {
    return protocolFail(error);
  }
}
