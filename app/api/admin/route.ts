import { jsonError, jsonOk, protocolFail } from "@/lib/protocol/http";
import { deleteHouse, deleteWaitlistEmail, loadAdminOverview, requireAdmin } from "@/lib/protocol/admin";
import { isRecord } from "@/lib/protocol/parse";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    requireAdmin(request);
    return jsonOk(await loadAdminOverview());
  } catch (error) {
    return protocolFail(error);
  }
}

export async function POST(request: Request) {
  try {
    requireAdmin(request);
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
    } else if (body.op === "delete_house") {
      if (typeof body.house_id !== "string") return jsonError("bad_request", "house_id is required", 400);
      await deleteHouse(body.house_id);
    } else {
      return jsonError("bad_request", "unknown op", 400);
    }
    return jsonOk(await loadAdminOverview());
  } catch (error) {
    return protocolFail(error);
  }
}
