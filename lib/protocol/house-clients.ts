import { and, eq, isNotNull } from "drizzle-orm";
import { agents, principals } from "@/lib/db/schema";
import { getDb } from "@/lib/db";
import { decideBudgetTurn } from "@/agents/budget";
import { CASE_A } from "@/agents/travel";
import { ackAction, fileObjection, proposeAction } from "./actions";
import type { HousePrincipal } from "./bundle";
import { ProtocolError } from "./errors";
import { hashSecret, mintToken } from "./keys";
import { sealKey, unsealKey } from "./seal";
import { sweep } from "./sweep";

export async function enableGuardian(principal: HousePrincipal) {
  const existing = await findGuardian(principal.id);
  if (existing) return { id: existing.id, role: existing.role, name: existing.name, created: false };
  const { agent } = await insertSealedAgent(principal.id, {
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
    (await insertSealedAgent(principal.id, { role: "travel", name: "Travel", isGuardian: false })).agent;

  const db = getDb();
  const [freshPrincipal] = await db.select().from(principals).where(eq(principals.id, principal.id)).limit(1);
  if (!freshPrincipal) throw new ProtocolError("not_found", "Unknown house", 404);

  const now = new Date();
  const proposed = await proposeAction(
    { agent: travel, principal: freshPrincipal },
    {
      kind: CASE_A.kind,
      payload: CASE_A.payload,
      justification: CASE_A.justification,
      evidence: CASE_A.evidence,
    },
    now,
  );

  const drafts = decideBudgetTurn({
    constitution: freshPrincipal.constitution,
    selfId: guardian.id,
    items: [
      {
        id: proposed.id,
        proposerId: travel.id,
        kind: proposed.kind,
        payload: CASE_A.payload,
        evidence: CASE_A.evidence,
        status: "open",
        alreadyObjected: false,
      },
    ],
  });

  for (const draft of drafts) {
    await fileObjection(
      { agent: guardian, principal: freshPrincipal },
      draft.actionId,
      {
        justification: draft.justification,
        evidence: draft.evidence,
        bond: draft.bond,
        counter_action: draft.counter_action,
      },
      now,
    );
  }

  await sweep(freshPrincipal.id, new Date(new Date(proposed.silence_until).getTime() + 1000));

  const [house] = await db.select().from(principals).where(eq(principals.id, principal.id)).limit(1);
  const [travelNow] = await db.select().from(agents).where(eq(agents.id, travel.id)).limit(1);
  const [budgetNow] = await db.select().from(agents).where(eq(agents.id, guardian.id)).limit(1);
  if (!house || !travelNow || !budgetNow) throw new ProtocolError("not_found", "Unknown house", 404);

  try {
    await ackAction({ agent: travelNow, principal: house }, proposed.id);
  } catch {
    // Silence-allow has no ack.
  }
  try {
    await ackAction({ agent: budgetNow, principal: house }, proposed.id);
  } catch {
    // Not engaged if the guardian did not object.
  }

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
  return { agent: row, agentKey };
}

export async function issueConnectAgent(principal: HousePrincipal) {
  const existing = await findSealedTravel(principal.id);
  if (existing?.sealedKey) {
    return { agent_key: unsealKey(existing.sealedKey), created: false };
  }
  const { agentKey } = await insertSealedAgent(principal.id, {
    role: "travel",
    name: "Travel",
    isGuardian: false,
  });
  return { agent_key: agentKey, created: true };
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
