import { eq, inArray } from "drizzle-orm";
import { actionReports, actions, agents } from "@/lib/db/schema";
import { getDb } from "@/lib/db";
import { ProtocolError } from "./errors";
import { loadActionBundle, serializeAction, type HouseAuth } from "./bundle";
import { isRecord } from "./parse";

export type ReportKind = "did" | "skipped" | "broke";

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

export function classifyReport(did: boolean, mayAct: boolean): ReportKind {
  if (did && mayAct) return "did";
  if (!did && mayAct) return "skipped";
  if (did && !mayAct) return "broke";
  return "skipped";
}

export function parseDid(body: Record<string, unknown>): boolean {
  if (typeof body.did !== "boolean") {
    throw new ProtocolError("bad_request", "did must be true or false", 400);
  }
  return body.did;
}

export async function reportAction(auth: HouseAuth, actionId: string, body: Record<string, unknown>) {
  const did = parseDid(body);
  const bundle = await loadActionBundle(actionId);
  if (!bundle || bundle.action.principalId !== auth.principal.id) {
    throw new ProtocolError("not_found", "Unknown house", 404);
  }
  if (bundle.action.proposerId !== auth.agent.id) {
    throw new ProtocolError("forbidden", "Only the proposer may report", 403);
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
      did,
    })
    .onConflictDoNothing();
  const done = await loadActionBundle(actionId);
  if (!done) throw new ProtocolError("internal", "Failed to load action", 500);
  return serializeAction(done);
}

/** First-pass / spawn test client: after a permit, they report the act. */
export async function maybeReportTestPass(actionId: string): Promise<void> {
  const bundle = await loadActionBundle(actionId);
  if (!bundle || !bundle.action.testPass) return;
  if (bundle.action.status !== "permitted") return;
  if (await findReport(actionId)) return;
  const serialized = serializeAction(bundle);
  await getDb()
    .insert(actionReports)
    .values({
      actionId,
      agentId: bundle.action.proposerId,
      did: serialized.may_act,
    })
    .onConflictDoNothing();
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
      if (report) {
        const kind = classifyReport(report.did, mayAct);
        if (kind === "broke") broke += 1;
        if (kind === "did") did += 1;
        if (kind === "skipped" && mayAct) skipped += 1;
      } else if (mayAct) {
        pending += 1;
      }
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
  if (!isRecord(value)) throw new ProtocolError("bad_request", "JSON object required", 400);
  return value;
}
