import { eq } from "drizzle-orm";
import { agents, principals } from "@/lib/db/schema";
import { getDb } from "@/lib/db";
import { assertOrgNotFrozen, isOrgPrincipal } from "@/lib/billing/org-lifecycle";
import { ProtocolError } from "./errors";
import { bearerToken, jsonError, protocolFail } from "./http";
import { findHouseByOwner } from "./houses";
import { hashSecret } from "./keys";
import { accessFor, canManage, hasGrant, type HouseAccess } from "./members";
import { ensureAgentPromptColumn } from "./house-clients";
import { ensureLockHandsColumn } from "@/lib/lock/house-hands";
import { ensureHouseWindowsColumn } from "./house-windows";
import { ensureWriteHashColumns } from "./write-hash";
import { ensureWriteSignColumns } from "./write-sign";
import { sessionUser } from "./session";
import type { HousePrincipal } from "./bundle";
import type { CabinetGrant, MemberRole } from "./types";

export async function requireAgent(request: Request) {
  const token = bearerToken(request);
  if (!token || !token.startsWith("agk_")) {
    return { error: jsonError("unauthorized", "Agent key required", 401) };
  }
  await ensureAgentPromptColumn();
  await ensureHouseWindowsColumn();
  await ensureWriteHashColumns();
  await ensureWriteSignColumns();
  await ensureLockHandsColumn();
  const db = getDb();
  const [agent] = await db.select().from(agents).where(eq(agents.keyHash, hashSecret(token))).limit(1);
  if (!agent) {
    return { error: jsonError("not_found", "Unknown house", 404) };
  }
  const [principal] = await db
    .select()
    .from(principals)
    .where(eq(principals.id, agent.principalId))
    .limit(1);
  if (!principal) {
    return { error: jsonError("not_found", "Unknown house", 404) };
  }
  if (isOrgPrincipal(principal)) {
    try {
      await assertOrgNotFrozen(principal.id);
    } catch (error) {
      return { error: protocolFail(error) };
    }
  }
  return { agent, principal };
}

export async function cabinetFromToken(token: string, request: Request) {
  try {
    const opened = await openCabinet(token, request);
    if (opened) return opened;
  } catch (error) {
    if (error instanceof ProtocolError) {
      return { error: jsonError(error.code, error.message, error.status) };
    }
    throw error;
  }
  if (token === "me" && !(await sessionUser())) {
    return { error: jsonError("unauthorized", "Sign in required", 401) };
  }
  return { error: jsonError("not_found", "Unknown house", 404) };
}

type CabinetAuth = Awaited<ReturnType<typeof cabinetFromToken>>;

export function needOperate(auth: CabinetAuth): CabinetAuth {
  if ("error" in auth) return auth;
  if (!hasGrant(auth.role, auth.grants, "agents") && !hasGrant(auth.role, auth.grants, "treasury")) {
    return { error: jsonError("forbidden", "This account can only watch", 403) };
  }
  return auth;
}

export function needGrant(auth: CabinetAuth, grant: CabinetGrant): CabinetAuth {
  if ("error" in auth) return auth;
  if (!hasGrant(auth.role, auth.grants, grant)) {
    return { error: jsonError("forbidden", "This account cannot do that here", 403) };
  }
  return auth;
}

export function needManage(auth: CabinetAuth): CabinetAuth {
  if ("error" in auth) return auth;
  if (!canManage(auth.role)) {
    return { error: jsonError("forbidden", "Only the owner can do that", 403) };
  }
  return auth;
}

export async function requireCabinet(token: string, request?: Request, houseId?: string | null) {
  const opened = await openCabinet(token, request, houseId);
  return opened?.principal ?? null;
}

export async function openCabinet(token: string, request?: Request, houseId?: string | null) {
  await ensureHouseWindowsColumn();
  await ensureWriteHashColumns();
  await ensureWriteSignColumns();
  await ensureLockHandsColumn();
  if (token === "me") {
    if (!request) return null;
    const user = await sessionUser();
    if (!user) return null;
    const wanted = houseId?.trim() || request.headers.get("x-foyer-house")?.trim() || null;
    if (wanted) {
      const access = await accessFor(user.id, wanted);
      if (!access) return null;
      if (isOrgPrincipal(access.principal)) {
        await assertOrgNotFrozen(access.principal.id);
      }
      return asCabinet(access.principal, access.role, "me", access.grants);
    }
    const principal = await findHouseByOwner(user.id);
    if (!principal) return null;
    return asCabinet(principal, "owner", "me", ["agents", "treasury", "rules"]);
  }
  if (!token.startsWith("cab_")) return null;
  const db = getDb();
  const [principal] = await db
    .select()
    .from(principals)
    .where(eq(principals.cabinetTokenHash, hashSecret(token)))
    .limit(1);
  return principal ? asCabinet(principal, "owner", token, ["agents", "treasury", "rules"]) : null;
}

function asCabinet(principal: HousePrincipal, role: MemberRole, token: string, grants: HouseAccess["grants"] = []) {
  return { principal, role, token, grants };
}

export async function requireCabinetRequest(request: Request) {
  const token = bearerToken(request);
  if (token === "me" || !token) {
    let opened;
    try {
      opened = await openCabinet("me", request);
    } catch (error) {
      if (error instanceof ProtocolError) {
        return { error: jsonError(error.code, error.message, error.status) };
      }
      throw error;
    }
    if (!opened) return { error: jsonError("unauthorized", "Sign in required", 401) };
    return opened;
  }
  if (!token.startsWith("cab_")) {
    return { error: jsonError("unauthorized", "Cabinet link required", 401) };
  }
  const opened = await openCabinet(token, request);
  if (!opened) {
    return { error: jsonError("not_found", "Unknown house", 404) };
  }
  return opened;
}
