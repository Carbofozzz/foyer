import { jsonError, jsonOk, protocolFail } from "@/lib/protocol/http";
import { createOrgHouse, destroyOrgHouse, renameOrgHouse } from "@/lib/protocol/houses";
import { isRecord } from "@/lib/protocol/parse";
import { readSession } from "@/lib/protocol/session";
import { guardPublicWrite } from "@/lib/ops/guard";
import { LIMITS } from "@/lib/ops/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return guardPublicWrite(request, "orgs", LIMITS.orgs, () => postOrg(request));
}

export async function PATCH(request: Request) {
  return guardPublicWrite(request, "orgs", LIMITS.orgs, () => patchOrg(request));
}

export async function DELETE(request: Request) {
  return guardPublicWrite(request, "orgs", LIMITS.orgs, () => deleteOrg(request));
}

async function postOrg(request: Request) {
  const session = readSession(request);
  if (!session) return jsonError("unauthorized", "Sign in required", 401);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("bad_request", "JSON body required", 400);
  }
  if (!isRecord(body) || typeof body.name !== "string") {
    return jsonError("bad_request", "name is required", 400);
  }
  try {
    return jsonOk(await createOrgHouse(session.address, body.name), 201);
  } catch (error) {
    return protocolFail(error);
  }
}

async function patchOrg(request: Request) {
  const session = readSession(request);
  if (!session) return jsonError("unauthorized", "Sign in required", 401);
  const body = await orgBody(request);
  if ("error" in body) return body.error;
  if (typeof body.name !== "string") return jsonError("bad_request", "name is required", 400);
  try {
    return jsonOk(await renameOrgHouse(session.address, body.id, body.name));
  } catch (error) {
    return protocolFail(error);
  }
}

async function deleteOrg(request: Request) {
  const session = readSession(request);
  if (!session) return jsonError("unauthorized", "Sign in required", 401);
  const body = await orgBody(request);
  if ("error" in body) return body.error;
  try {
    await destroyOrgHouse(session.address, body.id);
    return jsonOk({ ok: true });
  } catch (error) {
    return protocolFail(error);
  }
}

async function orgBody(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { error: jsonError("bad_request", "JSON body required", 400) };
  }
  if (!isRecord(body) || typeof body.id !== "string") {
    return { error: jsonError("bad_request", "id is required", 400) };
  }
  return { id: body.id, name: body.name };
}
