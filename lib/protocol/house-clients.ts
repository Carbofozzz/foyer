import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { decideBudgetTurn } from "@/agents/budget";
import { decideCalendarTurn } from "@/agents/calendar";
import { decideLegalTurn } from "@/agents/legal";
import { CASE_D } from "@/agents/sales";
import { CASE_C, decideSecurityTurn } from "@/agents/security";
import { CASE_A, CASE_B } from "@/agents/travel";
import type { ObjectionDraft } from "@/agents/types";
import { actions, agents, principals } from "@/lib/db/schema";
import { getDb } from "@/lib/db";
import { ackAction, fileObjection, proposeAction } from "./actions";
import { maybeReportTestPass } from "./report";
import type { HousePrincipal } from "./bundle";
import { ProtocolError } from "./errors";
import { hashSecret, mintToken } from "./keys";
import { sealKey, unsealKey } from "./seal";
import { sweep } from "./sweep";
import type { ActionPayload, EvidenceItem } from "./types";

/** Phrase-matching test clients for first pass / spawn. Not a product guardian. */
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
  await getDb()
    .update(principals)
    .set({ testClients: true })
    .where(eq(principals.id, principal.id));
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
    await maybeReportTestPass(row.id);
  }

  await db
    .update(principals)
    .set({ wizardHarnessDone: true, testClients: true })
    .where(eq(principals.id, principal.id));

  return { action_id: ids[0]?.id ?? null, action_ids: ids.map((row) => row.id) };
}

async function runPersonalCases(principal: HousePrincipal, now: Date) {
  const travel = await ensureSealed(principal.id, { role: "travel", name: "Travel", isGuardian: true });
  const assistant = await ensureSealed(principal.id, {
    role: "assistant",
    name: "Assistant",
    isGuardian: true,
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
  const sales = await ensureSealed(principal.id, { role: "sales", name: "Sales", isGuardian: true });
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
  await getDb().update(actions).set({ testPass: true }).where(eq(actions.id, proposed.id));
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

export async function ensureTestAgent(
  principalId: string,
  spec: { role: string; name: string },
) {
  const existing = await findTestAgentByRole(principalId, spec.role);
  if (existing) return existing;
  return (await insertSealedAgent(principalId, { ...spec, isGuardian: true })).agent;
}

async function findTestAgentByRole(principalId: string, role: string) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(agents)
    .where(
      and(
        eq(agents.principalId, principalId),
        eq(agents.role, role),
        eq(agents.isGuardian, true),
        isNotNull(agents.sealedKey),
      ),
    )
    .limit(1);
  return row ?? null;
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

const CONNECT_ROLES = {
  personal: [
    { role: "travel", name: "Travel" },
    { role: "assistant", name: "Assistant" },
  ],
  org: [
    { role: "sales", name: "Sales" },
    { role: "legal", name: "Legal" },
    { role: "finance", name: "Finance" },
  ],
} as const;

export function connectRolesFor(type: string) {
  return type === "org" ? CONNECT_ROLES.org : CONNECT_ROLES.personal;
}

export async function listConnectAgents(principalId: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(agents)
    .where(
      and(eq(agents.principalId, principalId), eq(agents.isGuardian, false), isNotNull(agents.sealedKey)),
    );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    role: row.role,
    agent_key: row.sealedKey ? unsealKey(row.sealedKey) : "",
  }));
}

export async function issueConnectAgent(principal: HousePrincipal, name: string) {
  const trimmed = name.trim();
  if (!trimmed) throw new ProtocolError("bad_request", "name is required", 400);
  const existing = await findRealAgentByName(principal.id, trimmed);
  if (existing?.sealedKey) {
    return {
      id: existing.id,
      agent_key: unsealKey(existing.sealedKey),
      created: false,
      role: existing.role,
      name: existing.name,
    };
  }
  const role = roleFromName(trimmed);
  const { agent, agentKey } = await insertSealedAgent(principal.id, {
    role,
    name: trimmed,
    isGuardian: false,
  });
  return { id: agent.id, agent_key: agentKey, created: true, role, name: trimmed };
}

function roleFromName(name: string) {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
  return slug || "agent";
}

async function findRealAgentByName(principalId: string, name: string) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(agents)
    .where(
      and(
        eq(agents.principalId, principalId),
        eq(agents.name, name),
        eq(agents.isGuardian, false),
        isNotNull(agents.sealedKey),
      ),
    )
    .limit(1);
  return row ?? null;
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

export async function setTestClients(principal: HousePrincipal, on: boolean) {
  await getDb()
    .update(principals)
    .set({ testClients: on })
    .where(eq(principals.id, principal.id));
}

export async function skipHarness(principal: HousePrincipal) {
  await getDb()
    .update(principals)
    .set({ wizardHarnessDone: true, testClients: false })
    .where(eq(principals.id, principal.id));
}

/** First-pass Travel/Assistant were stored as live. Mark them test if this house has guardians. */
export async function markHarnessProposers(principalId: string) {
  const db = getDb();
  const houseAgents = await db.select().from(agents).where(eq(agents.principalId, principalId));
  if (!houseAgents.some((agent) => agent.isGuardian)) return;
  const roles = ["travel", "assistant", "sales"] as const;
  const ids = [];
  for (const role of roles) {
    const same = houseAgents.filter((agent) => agent.role === role);
    if (same.length === 1 && !same[0].isGuardian) ids.push(same[0].id);
  }
  if (ids.length === 0) return;
  await db.update(agents).set({ isGuardian: true }).where(inArray(agents.id, ids));
}

async function findRealAgentByRole(principalId: string, role: string) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(agents)
    .where(
      and(
        eq(agents.principalId, principalId),
        eq(agents.role, role),
        eq(agents.isGuardian, false),
        isNotNull(agents.sealedKey),
      ),
    )
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
