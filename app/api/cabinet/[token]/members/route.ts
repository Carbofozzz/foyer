import { cabinetFromToken } from "@/lib/protocol/auth";
import { jsonError, jsonOk, protocolFail } from "@/lib/protocol/http";
import { canManage, inviteMember, isInviteRole, listMembers, removeMember } from "@/lib/protocol/members";
import { isRecord } from "@/lib/protocol/parse";

export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const auth = await cabinetFromToken(token, request);
  if ("error" in auth) return auth.error;
  try {
    return jsonOk({ role: auth.role, items: await listMembers(auth.principal) });
  } catch (error) {
    return protocolFail(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const auth = await cabinetFromToken(token, request);
  if ("error" in auth) return auth.error;
  if (!canManage(auth.role)) return jsonError("forbidden", "Only the owner can invite", 403);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("bad_request", "JSON body required", 400);
  }
  if (!isRecord(body) || typeof body.address !== "string") {
    return jsonError("bad_request", "address is required", 400);
  }
  const role = typeof body.role === "string" ? body.role : "";
  if (!isInviteRole(role)) return jsonError("bad_request", "role must be operator or observer", 400);
  try {
    return jsonOk({ role: auth.role, items: await inviteMember(auth.principal, body.address, role) }, 201);
  } catch (error) {
    return protocolFail(error);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const auth = await cabinetFromToken(token, request);
  if ("error" in auth) return auth.error;
  if (!canManage(auth.role)) return jsonError("forbidden", "Only the owner can remove a member", 403);
  const address = new URL(request.url).searchParams.get("address");
  if (!address) return jsonError("bad_request", "address is required", 400);
  try {
    return jsonOk({ role: auth.role, items: await removeMember(auth.principal, address) });
  } catch (error) {
    return protocolFail(error);
  }
}
