import { and, eq, isNotNull } from "drizzle-orm";
import { decideBudgetTurn } from "@/agents/budget";
import { decideCalendarTurn } from "@/agents/calendar";
import { decideLegalTurn } from "@/agents/legal";
import { CASE_D } from "@/agents/sales";
import { CASE_C, decideSecurityTurn } from "@/agents/security";
import { CASE_A, CASE_B } from "@/agents/travel";
import type { ObjectionDraft } from "@/agents/types";
import { agents, principals } from "@/lib/db/schema";
import { getDb } from "@/lib/db";
import { ackAction, fileObjection, proposeAction } from "./actions";
import type { HousePrincipal } from "./bundle";
import { ProtocolError } from "./errors";
import { hashSecret, mintToken } from "./keys";
import { sealKey, unsealKey } from "./seal";
import { sweep } from "./sweep";
import type { ActionPayload, EvidenceItem } from "./types";

type SealedAgent = typeof agents.$inferSelect;

type CaseDraft = {
  kind: "spend" | "book" | "message" | "cancel";
  payload: ActionPayload;
  justification: string;
  evidence: EvidenceItem[];
};

const PERSONAL_GUARDIANS = [
  { role: "budget", name: "Budget" },
  { role: "calendar", name: "Calendar" },
  { role: "security", name: "Security" },
] as const;

const ORG_GUARDIANS = [
  { role: "legal", name: "Legal" },
  { role: "finance", name: "Finance" },
] as const;

export function guardianRolesFor(type: string) {
  return type === "org" ? ORG_GUARDIANS : PERSONAL_GUARDIANS;
}

export async function enableGuardian(principal: HousePrincipal) {
  const wanted = guardianRolesFor(principal.type);
  let created = false;
  let first: SealedAgent | null = await findGuardian(principal.id);
  for (const spec of wanted) {
    const existing = await findAgentByRole(principal.id, spec.role);
    if (existing) {
      if (!first) first = existing;
      continue;
    }
    const { agent } = await insertSealedAgent(principal.id, {
      role: spec.role,
      name: spec.name,
      isGuardian: true,
    });
    created = true;
    if (!first) first = agent;
  }
  if (!first) throw new ProtocolError("internal", "Failed to enable guardian", 500);
  return { id: first.id, role: first.role, name: first.name, created };
}

export async function runFirstPass(principal: HousePrincipal) {
  if (!principal.wizardRulesDone || !principal.constitution.trim()) {
    throw new ProtocolError("conflict", "Write the rules first", 409);
  }
  await enableGuardian(principal);
  const db = getDb();
  const [fresh] = await db.select().from(principals).where(eq(principals.id, principal.id)).limit(1);
  if (!fresh) throw new ProtocolError("not_found", "Unknown house", 404);

  const now = new Date();
  const ids =
    fresh.type === "org" ? await runOrgCases(fresh, now) : await runPersonalCases(fresh, now);

  const latest = ids
    .map((row) => new Date(row.silenceUntil).getTime())
    .reduce((max, value) => Math.max(max, value), now.getTime());
  await sweep(fresh.id, new Date(latest + 1000));

  const [house] = await db.select().from(principals).where(eq(principals.id, principal.id)).limit(1);
  if (!house) throw new ProtocolError("not_found", "Unknown house", 404);
  for (const row of ids) {
    await ackIfEngaged(house, row.proposerId, row.id);
    for (const objectorId of row.objectorIds) {
      await ackIfEngaged(house, objectorId, row.id);
    }
  }

  return { action_id: ids[0]?.id ?? null, action_ids: ids.map((row) => row.id) };
}

async function runPersonalCases(principal: HousePrincipal, now: Date) {
  const travel = await ensureSealed(principal.id, { role: "travel", name: "Travel", isGuardian: false });
  const assistant = await ensureSealed(principal.id, {
    role: "assistant",
    name: "Assistant",
    isGuardian: false,
  });
  const budget = await findAgentByRole(principal.id, "budget");
  const calendar = await findAgentByRole(principal.id, "calendar");
  const security = await findAgentByRole(principal.id, "security");
  if (!budget || !calendar || !security) {
    throw new ProtocolError("conflict", "Enable the guardian first", 409);
  }

  return [
    await runCase(principal, travel, budget, CASE_A, now, decideBudgetTurn),
    await runCase(principal, travel, calendar, CASE_B, now, decideCalendarTurn),
    await runCase(principal, assistant, security, CASE_C, now, decideSecurityTurn),
  ];
}

async function runOrgCases(principal: HousePrincipal, now: Date) {
  const sales = await ensureSealed(principal.id, { role: "sales", name: "Sales", isGuardian: false });
  const legal = await findAgentByRole(principal.id, "legal");
  if (!legal) throw new ProtocolError("conflict", "Enable the guardian first", 409);
  return [await runCase(principal, sales, legal, CASE_D, now, decideLegalTurn)];
}

async function runCase(
  principal: HousePrincipal,
  proposer: SealedAgent,
  objector: SealedAgent,
  draft: CaseDraft,
  now: Date,
  decide: (input: {
    constitution: string;
    selfId: string;
    items: Parameters<typeof decideBudgetTurn>[0]["items"];
  }) => ObjectionDraft[],
) {
  const proposed = await proposeAction(
    { agent: proposer, principal },
    {
      kind: draft.kind,
      payload: draft.payload,
      justification: draft.justification,
      evidence: draft.evidence,
    },
    now,
  );
  const objections = decide({
    constitution: principal.constitution,
    selfId: objector.id,
    items: [
      {
        id: proposed.id,
        proposerId: proposer.id,
        kind: proposed.kind,
        payload: draft.payload,
        evidence: draft.evidence,
        status: "open",
        alreadyObjected: false,
      },
    ],
  });
  const objectorIds: string[] = [];
  for (const objection of objections) {
    await fileObjection(
      { agent: objector, principal },
      objection.actionId,
      {
        justification: objection.justification,
        evidence: objection.evidence,
        counter_action: objection.counter_action,
      },
      now,
    );
    objectorIds.push(objector.id);
  }
  return {
    id: proposed.id,
    proposerId: proposer.id,
    objectorIds,
    silenceUntil: proposed.silence_until,
  };
}

async function ackIfEngaged(principal: HousePrincipal, agentId: string, actionId: string) {
  const [agent] = await getDb().select().from(agents).where(eq(agents.id, agentId)).limit(1);
  if (!agent) return;
  try {
    await ackAction({ agent, principal }, actionId);
  } catch {
    // Silence-allow has no ack; not engaged if the guardian did not object.
  }
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

async function ensureSealed(
  principalId: string,
  input: { role: string; name: string; isGuardian: boolean },
) {
  const existing = await findAgentByRole(principalId, input.role);
  if (existing?.sealedKey) return existing;
  return (await insertSealedAgent(principalId, input)).agent;
}

export async function issueConnectAgent(principal: HousePrincipal) {
  const role = principal.type === "org" ? "sales" : "travel";
  const name = principal.type === "org" ? "Sales" : "Travel";
  const existing = await findAgentByRole(principal.id, role);
  if (existing?.sealedKey) {
    return { agent_key: unsealKey(existing.sealedKey), created: false };
  }
  const { agentKey } = await insertSealedAgent(principal.id, { role, name, isGuardian: false });
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

async function findAgentByRole(principalId: string, role: string) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(agents)
    .where(and(eq(agents.principalId, principalId), eq(agents.role, role), isNotNull(agents.sealedKey)))
    .limit(1);
  return row ?? null;
}
