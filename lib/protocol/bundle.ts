import { eq } from "drizzle-orm";
import { acks, actions, agents, cases, executions, objections, verdicts } from "@/lib/db/schema";
import { getDb } from "@/lib/db";
import type { ActionKind, ActionPayload, EvidenceItem, Outcome } from "./types";
import { asEvidence, asPayload } from "./parse";

export type HouseAgent = typeof agents.$inferSelect;
export type HousePrincipal = typeof import("@/lib/db/schema").principals.$inferSelect;

export type HouseAuth = {
  agent: HouseAgent;
  principal: HousePrincipal;
};

export type ActionRow = typeof actions.$inferSelect;

export async function loadActionBundle(actionId: string) {
  const db = getDb();
  const [action] = await db.select().from(actions).where(eq(actions.id, actionId)).limit(1);
  if (!action) return null;
  const [filed, caseRows, ackRows, execRows] = await Promise.all([
    db.select().from(objections).where(eq(objections.actionId, actionId)),
    db.select().from(cases).where(eq(cases.actionId, actionId)),
    db.select().from(acks).where(eq(acks.actionId, actionId)),
    db.select().from(executions).where(eq(executions.actionId, actionId)),
  ]);
  const courtCase = caseRows[0] ?? null;
  const verdictList = courtCase
    ? await db.select().from(verdicts).where(eq(verdicts.caseId, courtCase.id))
    : [];
  return {
    action,
    objections: filed,
    courtCase,
    verdict: verdictList[0] ?? null,
    acks: ackRows,
    executions: execRows,
  };
}

export function actionPayload(action: ActionRow): ActionPayload {
  return asPayload({ ...(isObj(action.payload) ? action.payload : {}), kind: action.kind });
}

export function actionEvidence(action: ActionRow): EvidenceItem[] {
  return asEvidence(action.evidence);
}

export function lockedKinds(principal: HousePrincipal): ActionKind[] {
  const raw = principal.lockedKinds;
  if (!Array.isArray(raw)) return ["spend", "book", "message"];
  return raw.filter((kind): kind is ActionKind => kind === "spend" || kind === "book" || kind === "message" || kind === "cancel");
}

export function engagedIds(proposerId: string, objectorIds: string[]): string[] {
  return [...new Set([proposerId, ...objectorIds])];
}

export function serializeAction(bundle: NonNullable<Awaited<ReturnType<typeof loadActionBundle>>>) {
  const verdict = bundle.verdict;
  return {
    id: bundle.action.id,
    kind: bundle.action.kind,
    payload: bundle.action.payload,
    justification: bundle.action.justification,
    evidence: bundle.action.evidence,
    status: bundle.action.status,
    silence_until: bundle.action.silenceUntil.toISOString(),
    ack_until: bundle.action.ackUntil?.toISOString() ?? null,
    appeal_until: bundle.action.appealUntil?.toISOString() ?? null,
    executed_at: bundle.action.executedAt?.toISOString() ?? null,
    proposer_id: bundle.action.proposerId,
    objections: bundle.objections.map((row) => ({
      id: row.id,
      objector_id: row.objectorId,
      justification: row.justification,
      evidence: row.evidence,
      bond: row.bond,
      counter_action: row.counterAction,
    })),
    case: bundle.courtCase
      ? {
          id: bundle.courtCase.id,
          status: bundle.courtCase.status,
        }
      : null,
    verdict: verdict
      ? {
          id: verdict.id,
          outcome: verdict.outcome as Outcome,
          remedy_action: verdict.remedyAction,
          reasoning: verdict.reasoning,
          objection_grounded: verdict.objectionGrounded,
          judge: verdict.judge,
          tx: verdict.tx,
        }
      : null,
    acks: bundle.acks.map((row) => ({
      agent_id: row.agentId,
      source: row.source,
      at: row.createdAt.toISOString(),
    })),
    executions: bundle.executions.map((row) => ({
      id: row.id,
      kind: row.kind,
      result: row.result,
      at: row.createdAt.toISOString(),
    })),
  };
}

function isObj(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
