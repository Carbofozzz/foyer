import { cabinetFromToken } from "@/lib/protocol/auth";
import { jsonError, jsonOk, protocolFail } from "@/lib/protocol/http";
import { loadHouseWalletView } from "@/lib/judge/wallet";

export const maxDuration = 120;

export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const auth = await cabinetFromToken(token, request);
  if ("error" in auth) return auth.error;
  try {
    return jsonOk(await loadHouseWalletView(auth.principal));
  } catch (error) {
    return protocolFail(error);
  }
}

/** Treasury is read-only until BILLING: no deposit, withdraw, export, or faucet from the cabinet. */
export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const auth = await cabinetFromToken(token, request);
  if ("error" in auth) return auth.error;
  return jsonError("gone", "Treasury is read-only", 410);
}
