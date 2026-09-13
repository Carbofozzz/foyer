import { cabinetFromToken } from "@/lib/protocol/auth";
import { jsonError, jsonOk, protocolFail } from "@/lib/protocol/http";
import { canManage, inviteMember, listMembers, parseGrants, removeMember, saveMemberGrants } from "@/lib/protocol/members";
import { isRecord } from "@/lib/protocol/parse";

export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const auth = await cabinetFromToken(token, request);
  if ("error" in auth) return auth.error;
  try {
    return jsonOk({ role: auth.role, grants: auth.grants, items: await listMembers(auth.principal) });
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
  const grants = parseGrants(body.grants);
  try {
    return jsonOk({ role: auth.role, items: await inviteMember(auth.principal, body.address, grants) }, 201);
  } catch (error) {
    return protocolFail(error);
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const auth = await cabinetFromToken(token, request);
  if ("error" in auth) return auth.error;
  if (!canManage(auth.role)) return jsonError("forbidden", "Only the owner can change access", 403);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("bad_request", "JSON body required", 400);
  }
  if (!isRecord(body) || typeof body.address !== "string") {
    return jsonError("bad_request", "address is required", 400);
  }
  try {
    return jsonOk({ role: auth.role, items: await saveMemberGrants(auth.principal, body.address, parseGrants(body.grants)) });
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
