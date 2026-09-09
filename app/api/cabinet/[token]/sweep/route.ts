import { cabinetFromToken } from "@/lib/protocol/auth";
import { jsonOk, protocolFail } from "@/lib/protocol/http";
import { publicOrigin } from "@/lib/mcp/config";
import { sweep } from "@/lib/protocol/sweep";

export const maxDuration = 60;

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const auth = await cabinetFromToken(token, request);
  if ("error" in auth) return auth.error;
  try {
    await sweep(auth.principal.id, new Date(), { courts: 0, origin: publicOrigin(request) });
    return jsonOk({ ok: true });
  } catch (error) {
    return protocolFail(error);
  }
}
