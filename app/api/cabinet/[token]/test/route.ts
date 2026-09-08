import { cabinetFromToken, needOperate } from "@/lib/protocol/auth";
import { jsonOk, protocolFail } from "@/lib/protocol/http";
import { publicOrigin } from "@/lib/mcp/config";
import { loadTestStage, runTestStage } from "@/lib/protocol/test-stage";

export const maxDuration = 120;

export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const auth = needOperate(await cabinetFromToken(token, request));
  if ("error" in auth) return auth.error;
  try {
    return jsonOk(await loadTestStage(auth.principal, publicOrigin(request)));
  } catch (error) {
    return protocolFail(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const auth = needOperate(await cabinetFromToken(token, request));
  if ("error" in auth) return auth.error;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  try {
    return jsonOk(await runTestStage(auth.principal, body, request));
  } catch (error) {
    return protocolFail(error);
  }
}
