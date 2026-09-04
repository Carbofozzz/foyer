import { eq } from "drizzle-orm";
import { agents, principals } from "@/lib/db/schema";
import { getDb } from "@/lib/db";
import { bearerToken, jsonError } from "./http";
import { hashSecret } from "./keys";

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

export async function requireCabinet(token: string) {
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
  if (!token || !token.startsWith("cab_")) {
    return { error: jsonError("unauthorized", "Cabinet link required", 401) };
  }
  const principal = await requireCabinet(token);
  if (!principal) {
    return { error: jsonError("not_found", "Unknown house", 404) };
  }
  return { principal, token };
}
