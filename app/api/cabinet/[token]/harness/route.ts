import { cabinetFromToken, needOperate } from "@/lib/protocol/auth";
import { jsonOk, protocolFail } from "@/lib/protocol/http";
import { skipHarness } from "@/lib/protocol/house-clients";

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const auth = needOperate(await cabinetFromToken(token, request));
  if ("error" in auth) return auth.error;
  try {
    await skipHarness(auth.principal);
    return jsonOk({ skipped: true });
  } catch (error) {
    return protocolFail(error);
  }
}
