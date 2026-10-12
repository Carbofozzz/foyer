import { cabinetFromToken } from "@/lib/protocol/auth";
import { jsonError, jsonOk, protocolFail } from "@/lib/protocol/http";
import { isRecord } from "@/lib/protocol/parse";
import { loadPlanView } from "@/lib/billing/account";
import { redeemVoucher } from "@/lib/billing/vouchers";
import { canManage, hasGrant } from "@/lib/protocol/members";
import { sessionUser } from "@/lib/protocol/session";
import { isOrgHouse } from "@/lib/protocol/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const auth = await cabinetFromToken(token, request);
  if ("error" in auth) return auth.error;
  try {
    return jsonOk(await loadPlanView(auth.principal.id, !isOrgHouse(auth.principal)));
  } catch (error) {
    return protocolFail(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const auth = await cabinetFromToken(token, request);
  if ("error" in auth) return auth.error;
  if (!canManage(auth.role) && !hasGrant(auth.role, auth.grants, "treasury")) {
    return jsonError("forbidden", "Only the owner or treasury grant may redeem", 403);
  }
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonError("bad_request", "JSON body required", 400);
    }
    if (!isRecord(body) || body.op !== "redeem") {
      return jsonError("bad_request", "op must be redeem", 400);
    }
    if (typeof body.code !== "string") {
      return jsonError("bad_request", "code is required", 400);
    }
    const user = await sessionUser();
    const redeemed = await redeemVoucher({
      principalId: auth.principal.id,
      code: body.code,
      userId: user?.id ?? null,
      email: user?.email ?? null,
    });
    const plan = await loadPlanView(auth.principal.id, !isOrgHouse(auth.principal));
    return jsonOk({ ...plan, redeemed });
  } catch (error) {
    return protocolFail(error);
  }
}
