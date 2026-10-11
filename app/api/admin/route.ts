import { jsonError, jsonOk, protocolFail } from "@/lib/protocol/http";
import { deleteHouse, deleteWaitlistEmail, loadAdminOverview, requireAdmin } from "@/lib/protocol/admin";
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
    } else {
      return jsonError("bad_request", "unknown op", 400);
    }
    return jsonOk(await loadAdminOverview());
  } catch (error) {
    return protocolFail(error);
  }
}
