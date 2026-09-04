import { eq } from "drizzle-orm";
import { agents, principals } from "@/lib/db/schema";
import { getDb } from "@/lib/db";
import { bearerToken, jsonError } from "./http";
import { findHouseByOwner } from "./houses";
import { hashSecret } from "./keys";
import { readSession } from "./session";

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
  const principal = await requireCabinet(token, request);
  if (principal) return { principal };
  if (token === "me" && !readSession(request)) {
    return { error: jsonError("unauthorized", "Sign in required", 401) };
  }
  return { error: jsonError("not_found", "Unknown house", 404) };
}

export async function requireCabinet(token: string, request?: Request) {
  if (token === "me") {
    if (!request) return null;
    const session = readSession(request);
    if (!session) return null;
    return findHouseByOwner(session.address);
  }
  if (!token.startsWith("cab_")) return null;
  const db = getDb();
  const [principal] = await db
    .select()
    .from(principals)
    .where(eq(principals.cabinetTokenHash, hashSecret(token)))
    .limit(1);
  return principal ?? null;
}

export async function requireCabinetRequest(request: Request) {
  const token = bearerToken(request);
  if (token === "me" || !token) {
    const principal = await requireCabinet("me", request);
    if (!principal) return { error: jsonError("unauthorized", "Sign in required", 401) };
    return { principal, token: "me" };
  }
  if (!token.startsWith("cab_")) {
    return { error: jsonError("unauthorized", "Cabinet link required", 401) };
  }
  const principal = await requireCabinet(token, request);
  if (!principal) {
    return { error: jsonError("not_found", "Unknown house", 404) };
  }
  return { principal, token };
}
