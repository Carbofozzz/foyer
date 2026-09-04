import { and, eq, isNotNull } from "drizzle-orm";
import { agents, principals } from "@/lib/db/schema";
import { getDb } from "@/lib/db";
import { CASE_A } from "@/agents/travel";
import { ackAction, proposeAction } from "./actions";
import type { HouseAuth, HousePrincipal } from "./bundle";
import { ProtocolError } from "./errors";
import { hashSecret, mintToken } from "./keys";
import { sealKey } from "./seal";
import { sweep } from "./sweep";

export async function enableGuardian(principal: HousePrincipal) {
  const existing = await findGuardian(principal.id);
  if (existing) return { id: existing.id, role: existing.role, name: existing.name, created: false };
  const agent = await insertSealedAgent(principal.id, {
    role: "budget",
    name: "Budget",
    isGuardian: true,
  });
  return { id: agent.id, role: agent.role, name: agent.name, created: true };
}

export async function runFirstPass(principal: HousePrincipal) {
  if (!principal.wizardRulesDone || !principal.constitution.trim()) {
    throw new ProtocolError("conflict", "Write the rules first", 409);
  }
  const guardian = await findGuardian(principal.id);
  if (!guardian) throw new ProtocolError("conflict", "Enable the guardian first", 409);

  const travel =
    (await findSealedTravel(principal.id)) ??
    (await insertSealedAgent(principal.id, { role: "travel", name: "Travel", isGuardian: false }));

  const db = getDb();
  const [travelRow] = await db.select().from(agents).where(eq(agents.id, travel.id)).limit(1);
  const [freshPrincipal] = await db.select().from(principals).where(eq(principals.id, principal.id)).limit(1);
  if (!travelRow || !freshPrincipal) throw new ProtocolError("not_found", "Unknown house", 404);

  const now = new Date();
  const proposed = await proposeAction(
    { agent: travelRow, principal: freshPrincipal },
    {
      kind: CASE_A.kind,
      payload: CASE_A.payload,
      justification: CASE_A.justification,
      evidence: CASE_A.evidence,
    },
    now,
  );

  await sweep(principal.id, now);
  const silenceUntil = new Date(proposed.silence_until);
  await sweep(principal.id, new Date(silenceUntil.getTime() + 1000));

  const [travelNow] = await db.select().from(agents).where(eq(agents.id, travel.id)).limit(1);
  const [budgetNow] = await db.select().from(agents).where(eq(agents.id, guardian.id)).limit(1);
  const [house] = await db.select().from(principals).where(eq(principals.id, principal.id)).limit(1);
  if (!travelNow || !budgetNow || !house) throw new ProtocolError("not_found", "Unknown house", 404);

  const travelAuth: HouseAuth = { agent: travelNow, principal: house };
  try {
    await ackAction(travelAuth, proposed.id);
  } catch {
    // Silence-allow has no ack.
  }
  try {
    await ackAction({ agent: budgetNow, principal: house }, proposed.id);
  } catch {
    // Not engaged if the guardian did not object.
  }

  await sweep(principal.id, new Date());
  return { action_id: proposed.id };
}

async function insertSealedAgent(
  principalId: string,
  input: { role: string; name: string; isGuardian: boolean },
) {
  const db = getDb();
  const id = mintToken("agt");
  const agentKey = mintToken("agk");
  await db.insert(agents).values({
    id,
    principalId,
    role: input.role,
    name: input.name,
    keyHash: hashSecret(agentKey),
    sealedKey: sealKey(agentKey),
    isGuardian: input.isGuardian,
  });
  const [row] = await db.select().from(agents).where(eq(agents.id, id)).limit(1);
  if (!row) throw new ProtocolError("internal", "Failed to create agent", 500);
  return row;
}

async function findGuardian(principalId: string) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(agents)
    .where(and(eq(agents.principalId, principalId), eq(agents.isGuardian, true)))
    .limit(1);
  return row ?? null;
}

async function findSealedTravel(principalId: string) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(agents)
    .where(and(eq(agents.principalId, principalId), eq(agents.role, "travel"), isNotNull(agents.sealedKey)))
    .limit(1);
  return row ?? null;
}
