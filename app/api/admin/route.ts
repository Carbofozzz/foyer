import { jsonError, jsonOk, protocolFail } from "@/lib/protocol/http";
import {
  adminCreateVoucher,
  adminGrantCredits,
  adminRevokeVoucher,
  deleteHouse,
  deleteWaitlistEmail,
  loadAdminOverview,
  requireAdmin,
} from "@/lib/protocol/admin";
import { auditAdmin } from "@/lib/protocol/users";
import { isRecord } from "@/lib/protocol/parse";
import { guardPublicWrite } from "@/lib/ops/guard";
import { LIMITS } from "@/lib/ops/rate-limit";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdmin();
    return jsonOk(await loadAdminOverview());
  } catch (error) {
    return protocolFail(error);
  }
}

export async function POST(request: Request) {
  return guardPublicWrite(request, "admin", LIMITS.admin, () => postAdmin(request));
}

async function postAdmin(request: Request) {
  try {
    const actor = await requireAdmin();
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonError("bad_request", "JSON body required", 400);
    }
    if (!isRecord(body) || typeof body.op !== "string") {
      return jsonError("bad_request", "op is required", 400);
    }
    if (body.op === "delete_waitlist") {
      if (typeof body.email !== "string") return jsonError("bad_request", "email is required", 400);
      await deleteWaitlistEmail(body.email);
      await auditAdmin(actor, { op: body.op, targetType: "waitlist", targetId: body.email.trim().toLowerCase() });
    } else if (body.op === "delete_house") {
      if (typeof body.house_id !== "string") return jsonError("bad_request", "house_id is required", 400);
      await deleteHouse(body.house_id);
      await auditAdmin(actor, { op: body.op, targetType: "house", targetId: body.house_id.trim() });
    } else if (body.op === "create_voucher") {
      if (typeof body.code !== "string") return jsonError("bad_request", "code is required", 400);
      const row = await adminCreateVoucher(actor, {
        code: body.code,
        kind: typeof body.kind === "string" ? body.kind : undefined,
        credits: typeof body.credits === "number" ? body.credits : undefined,
        max_redemptions: typeof body.max_redemptions === "number" ? body.max_redemptions : undefined,
        bound_email: typeof body.bound_email === "string" ? body.bound_email : null,
        duration_sec: typeof body.duration_sec === "number" ? body.duration_sec : null,
      });
      await auditAdmin(actor, { op: body.op, targetType: "voucher", targetId: row.id });
    } else if (body.op === "revoke_voucher") {
      if (typeof body.code !== "string") return jsonError("bad_request", "code is required", 400);
      const row = await adminRevokeVoucher(body.code);
      await auditAdmin(actor, { op: body.op, targetType: "voucher", targetId: row.id });
    } else if (body.op === "grant_credits") {
      if (typeof body.house_id !== "string") return jsonError("bad_request", "house_id is required", 400);
      if (typeof body.credits !== "number") return jsonError("bad_request", "credits is required", 400);
      await adminGrantCredits(
        body.house_id,
        body.credits,
        typeof body.note === "string" ? body.note : undefined,
      );
      await auditAdmin(actor, { op: body.op, targetType: "house", targetId: body.house_id.trim() });
    } else {
      return jsonError("bad_request", "unknown op", 400);
    }
    return jsonOk(await loadAdminOverview());
  } catch (error) {
    return protocolFail(error);
  }
}
