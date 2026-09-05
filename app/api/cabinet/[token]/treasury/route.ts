import { cabinetFromToken, needManage, needOperate } from "@/lib/protocol/auth";
import { jsonError, jsonOk, protocolFail } from "@/lib/protocol/http";
import { exportHouseWalletKey, loadHouseWalletView, recordDeposit, withdrawTo } from "@/lib/judge/wallet";
import { canManage } from "@/lib/protocol/members";
import { isRecord } from "@/lib/protocol/parse";
import { readSession } from "@/lib/protocol/session";

export const maxDuration = 120;

export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const auth = await cabinetFromToken(token, request);
  if ("error" in auth) return auth.error;
  const principal = auth.principal;
  try {
    return jsonOk(await loadHouseWalletView(principal));
  } catch (error) {
    return protocolFail(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const auth = await cabinetFromToken(token, request);
  if ("error" in auth) return auth.error;
  const principal = auth.principal;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("bad_request", "JSON body required", 400);
  }
  if (!isRecord(body)) return jsonError("bad_request", "JSON object required", 400);
  try {
    if (body.export === true) {
      const denied = needManage(auth);
      if ("error" in denied) return denied.error;
      return jsonOk(await exportHouseWalletKey(principal));
    }
    if (body.withdraw === true) {
      const denied = needManage(auth);
      if ("error" in denied) return denied.error;
      if (typeof body.gen !== "string") {
        return jsonError("bad_request", "gen is required", 400);
      }
      const to = typeof body.to === "string" ? body.to : "";
      return jsonOk(await withdrawTo(principal, { to, gen: body.gen }));
    }
    if (body.deposit === true) {
      const denied = needOperate(auth);
      if ("error" in denied) return denied.error;
      if (typeof body.tx !== "string" || typeof body.from !== "string" || typeof body.gen !== "string") {
        return jsonError("bad_request", "tx, from and gen are required", 400);
      }
      const session = readSession(request);
      return jsonOk(
        await recordDeposit(principal, {
          tx: body.tx,
          from: body.from,
          gen: body.gen,
          payer: session?.address ?? (canManage(auth.role) ? principal.ownerAddress : null),
        }),
      );
    }
    return jsonError("bad_request", "export, deposit, or withdraw is required", 400);
  } catch (error) {
    return protocolFail(error);
  }
}
