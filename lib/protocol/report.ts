import { eq, inArray } from "drizzle-orm";
import { actionReports, actions, agents } from "@/lib/db/schema";
import { getDb } from "@/lib/db";
import { ProtocolError } from "./errors";
import { loadActionBundle, serializeAction, type HouseAuth } from "./bundle";
import { isRecord } from "./parse";

export type DoorStats = {
  agent_id: string;
  proposed: number;
  passed: number;
  blocked: number;
  escalated: number;
  broke: number;
  pending: number;
  did: number;
  skipped: number;
};

/** Proposer acks a final allow or deny. No did flag — the act is outside Foyer. */
export async function reportAction(auth: HouseAuth, actionId: string, _body?: Record<string, unknown>) {
  const bundle = await loadActionBundle(actionId);
  if (!bundle || bundle.action.principalId !== auth.principal.id) {
    throw new ProtocolError("not_found", "Unknown house", 404);
  }
  if (bundle.action.proposerId !== auth.agent.id) {
    throw new ProtocolError("forbidden", "Only the proposer may report", 403);
  }
  if (bundle.action.status !== "permitted") {
    throw new ProtocolError("conflict", "Report after a final allow or deny", 409);
  }
  const existing = await findReport(actionId);
  if (existing) {
    const next = await loadActionBundle(actionId);
    if (!next) throw new ProtocolError("internal", "Failed to load action", 500);
    return serializeAction(next);
  }
  await getDb()
    .insert(actionReports)
    .values({
      actionId,
      agentId: auth.agent.id,
      did: true,
    })
    .onConflictDoNothing();
  const done = await loadActionBundle(actionId);
  if (!done) throw new ProtocolError("internal", "Failed to load action", 500);
  return serializeAction(done);
}

export async function doorStatsFor(principalId: string): Promise<DoorStats[]> {
  const db = getDb();
  const houseAgents = await db.select().from(agents).where(eq(agents.principalId, principalId));
  const rows = await db.select().from(actions).where(eq(actions.principalId, principalId));
  const reportRows = rows.length
    ? await db.select().from(actionReports).where(
        inArray(
          actionReports.actionId,
          rows.map((row) => row.id),
        ),
      )
    : [];
  const reportByAction = new Map(reportRows.map((row) => [row.actionId, row]));

  return houseAgents.map((agent) => {
    const mine = rows.filter((row) => row.proposerId === agent.id);
    let passed = 0;
    let blocked = 0;
    let escalated = 0;
    let broke = 0;
    let pending = 0;
    let did = 0;
    let skipped = 0;
    for (const row of mine) {
      const report = reportByAction.get(row.id);
      const mayAct = row.status === "permitted" && row.permittedPayload != null;
      const blockedRow = row.status === "permitted" && row.permittedPayload == null;
      if (row.status === "escalated") escalated += 1;
      if (mayAct) passed += 1;
      if (blockedRow) blocked += 1;
      if (row.status === "permitted" && !report) pending += 1;
      if (report) did += 1;
    }
    return {
      agent_id: agent.id,
      proposed: mine.length,
      passed,
      blocked,
      escalated,
      broke,
      pending,
      did,
      skipped,
    };
  });
}

async function findReport(actionId: string) {
  const [row] = await getDb().select().from(actionReports).where(eq(actionReports.actionId, actionId)).limit(1);
  return row ?? null;
}

export function reportBody(value: unknown): Record<string, unknown> {
  if (value == null || value === "") return {};
  if (!isRecord(value)) throw new ProtocolError("bad_request", "JSON object required", 400);
  return value;
}
