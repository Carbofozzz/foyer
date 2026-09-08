import { cabinetFromToken, needOperate } from "@/lib/protocol/auth";
import { jsonOk, protocolFail } from "@/lib/protocol/http";
import { publicOrigin } from "@/lib/mcp/config";
import { inspectQuery } from "@/lib/protocol/test-stage";

export const maxDuration = 120;

export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const auth = needOperate(await cabinetFromToken(token, request));
  if ("error" in auth) return auth.error;
  try {
    return jsonOk(await inspectQuery(auth.principal, new URL(request.url), publicOrigin(request)));
  } catch (error) {
    return protocolFail(error);
  }
}
