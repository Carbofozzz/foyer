import { cabinetFromToken } from "@/lib/protocol/auth";
import { jsonError, jsonOk, protocolFail } from "@/lib/protocol/http";
import { isRecord } from "@/lib/protocol/parse";
import { loadPlanView } from "@/lib/billing/account";
import { confirmCryptoCheckout, createCryptoCheckout } from "@/lib/billing/crypto";
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
    return jsonError("forbidden", "Only the owner or treasury grant may manage the plan", 403);
  }
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonError("bad_request", "JSON body required", 400);
    }
    if (!isRecord(body) || typeof body.op !== "string") {
      return jsonError("bad_request", "op is required", 400);
    }
    const user = await sessionUser();
    const personal = !isOrgHouse(auth.principal);

    if (body.op === "redeem") {
      if (typeof body.code !== "string") {
        return jsonError("bad_request", "code is required", 400);
      }
      const redeemed = await redeemVoucher({
        principalId: auth.principal.id,
        code: body.code,
        userId: user?.id ?? null,
        email: user?.email ?? null,
      });
      const plan = await loadPlanView(auth.principal.id, personal);
      return jsonOk({ ...plan, redeemed });
    }

    if (body.op === "crypto_checkout") {
      if (typeof body.plan_code !== "string") {
        return jsonError("bad_request", "plan_code is required", 400);
      }
      const checkout = await createCryptoCheckout({
        principalId: auth.principal.id,
        planCode: body.plan_code,
        userId: user?.id ?? null,
      });
      const plan = await loadPlanView(auth.principal.id, personal);
      return jsonOk({ ...plan, checkout });
    }

    if (body.op === "crypto_confirm") {
      if (typeof body.checkout_id !== "string") {
        return jsonError("bad_request", "checkout_id is required", 400);
      }
      if (typeof body.tx !== "string") {
        return jsonError("bad_request", "tx is required", 400);
      }
      const paid = await confirmCryptoCheckout({
        principalId: auth.principal.id,
        checkoutId: body.checkout_id,
        tx: body.tx,
      });
      const plan = await loadPlanView(auth.principal.id, personal);
      return jsonOk({ ...plan, paid });
    }

    return jsonError("bad_request", "op must be redeem, crypto_checkout, or crypto_confirm", 400);
  } catch (error) {
    return protocolFail(error);
  }
}
