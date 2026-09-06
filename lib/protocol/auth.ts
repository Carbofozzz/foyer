import { eq } from "drizzle-orm";
import { agents, principals } from "@/lib/db/schema";
import { getDb } from "@/lib/db";
import { bearerToken, jsonError } from "./http";
import { findHouseByOwner } from "./houses";
import { hashSecret } from "./keys";
import { accessFor, canManage, canOperate } from "./members";
import { readSession } from "./session";
import type { HousePrincipal } from "./bundle";
import { DEMO_TOKEN } from "./spawn";
import type { MemberRole } from "./types";

export async function requireAgent(request: Request) {
  const token = bearerToken(request);
  if (!token || !token.startsWith("agk_")) {
    return { error: jsonError("unauthorized", "Agent key required", 401) };
  }
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
  return { agent, principal };
}

export async function cabinetFromToken(token: string, request: Request) {
  const opened = await openCabinet(token, request);
  if (opened) return opened;
  if (token === "me" && !readSession(request)) {
    return { error: jsonError("unauthorized", "Sign in required", 401) };
  }
  return { error: jsonError("not_found", "Unknown house", 404) };
}

type CabinetAuth = Awaited<ReturnType<typeof cabinetFromToken>>;

export function needOperate(auth: CabinetAuth): CabinetAuth {
  if ("error" in auth) return auth;
  if (!canOperate(auth.role)) {
    return { error: jsonError("forbidden", "This wallet can only watch", 403) };
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
  if (token === "me") {
    if (!request) return null;
    const session = readSession(request);
    if (!session) return null;
    const wanted = houseId?.trim() || request.headers.get("x-foyer-house")?.trim() || null;
    if (wanted) {
      const access = await accessFor(session.address, wanted);
      if (!access) return null;
      return asCabinet(access.principal, access.role, "me");
    }
    const principal = await findHouseByOwner(session.address);
    if (!principal) return null;
    return asCabinet(principal, "owner", "me");
  }
  if (token === DEMO_TOKEN) return null;
  if (!token.startsWith("cab_")) return null;
  const db = getDb();
  const [principal] = await db
    .select()
    .from(principals)
    .where(eq(principals.cabinetTokenHash, hashSecret(token)))
    .limit(1);
  return principal ? asCabinet(principal, "owner", token) : null;
}

function asCabinet(principal: HousePrincipal, role: MemberRole, token: string) {
  if (principal.isSpawn) return { principal, role: "observer" as const, token };
  return { principal, role, token };
}

export async function requireCabinetRequest(request: Request) {
  const token = bearerToken(request);
  if (token === "me" || !token) {
    const opened = await openCabinet("me", request);
    if (!opened) return { error: jsonError("unauthorized", "Sign in required", 401) };
    return opened;
  }
  if (token === DEMO_TOKEN) {
    const opened = await openCabinet(DEMO_TOKEN, request);
    if (!opened) return { error: jsonError("not_found", "Unknown house", 404) };
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
