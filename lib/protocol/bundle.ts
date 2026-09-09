import { asc, desc, eq } from "drizzle-orm";
import { acks, actionReports, actions, agents, cases, executions, objections, verdicts } from "@/lib/db/schema";
import { getDb } from "@/lib/db";
import { MAX_REVISION, type KnownActionKind, type ActionPayload, type EvidenceItem, type StoredOutcome } from "./types";
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
  const [filed, caseRows, ackRows, execRows, reportRows] = await Promise.all([
    db.select().from(objections).where(eq(objections.actionId, actionId)),
    db.select().from(cases).where(eq(cases.actionId, actionId)).orderBy(asc(cases.createdAt), asc(cases.id)).limit(1),
    db.select().from(acks).where(eq(acks.actionId, actionId)),
    db.select().from(executions).where(eq(executions.actionId, actionId)),
    db.select().from(actionReports).where(eq(actionReports.actionId, actionId)).limit(1),
  ]);
  const courtCase = caseRows[0] ?? null;
  const currentObjections = filed
    .filter((row) => row.revision === action.revision)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
  const verdictList = courtCase
    ? await db
        .select()
        .from(verdicts)
        .where(eq(verdicts.caseId, courtCase.id))
        .orderBy(desc(verdicts.createdAt), desc(verdicts.id))
    : [];
  return {
    action,
    objections: currentObjections,
    courtCase,
    verdict: verdictList[0] ?? null,
    priorVerdict: (() => {
      const latest = verdictList[0];
      if (!latest?.appealOf) return null;
      return verdictList.find((row) => row.id === latest.appealOf) ?? null;
    })(),
    acks: ackRows,
    executions: execRows,
    report: reportRows[0] ?? null,
  };
}

export function actionPayload(action: ActionRow): ActionPayload {
  const raw = isObj(action.payload) ? action.payload : {};
  const summary = typeof raw.summary === "string" && raw.summary.trim() ? raw.summary : action.justification;
  return asPayload({ ...raw, summary });
}

export function actionEvidence(action: ActionRow): EvidenceItem[] {
  return asEvidence(action.evidence);
}

export function lockedKinds(principal: HousePrincipal): KnownActionKind[] {
  const raw = principal.lockedKinds;
  if (!Array.isArray(raw)) return ["spend", "book", "message"];
  return raw.filter(
    (kind): kind is KnownActionKind =>
      kind === "spend" || kind === "book" || kind === "message" || kind === "cancel",
  );
}

export function engagedIds(proposerId: string, objectorIds: string[]): string[] {
  return [...new Set([proposerId, ...objectorIds])];
}

export function serializeAction(bundle: NonNullable<Awaited<ReturnType<typeof loadActionBundle>>>) {
  const verdict = bundle.verdict;
  const permitted = permittedPayloadOf(bundle);
  const mayAct = bundle.action.status === "permitted" && permitted !== null;
  return {
    id: bundle.action.id,
    payload: bundle.action.payload,
    justification: bundle.action.justification,
    evidence: bundle.action.evidence,
    status: bundle.action.status,
    created_at: bundle.action.createdAt.toISOString(),
    silence_until: bundle.action.silenceUntil.toISOString(),
    ack_until: bundle.action.ackUntil?.toISOString() ?? null,
    appeal_until: bundle.action.appealUntil?.toISOString() ?? null,
    held_until: null,
    executed_at: bundle.action.executedAt?.toISOString() ?? null,
    may_act: mayAct,
    permitted_payload: permitted,
    report: bundle.report
      ? {
          at: bundle.report.createdAt.toISOString(),
        }
      : null,
    test_pass: bundle.action.testPass,
    proposer_id: bundle.action.proposerId,
    revision: bundle.action.revision,
    bargain_round: bundle.action.bargainRound,
    bargain_until: bundle.action.bargainUntil?.toISOString() ?? null,
    insisted_at: bundle.action.insistedAt?.toISOString() ?? null,
    phase: actionPhase(bundle),
    proposer_can: proposerCan(bundle),
    objections: bundle.objections.map((row) => ({
      id: row.id,
      objector_id: row.objectorId,
      revision: row.revision,
      justification: row.justification,
      evidence: row.evidence,
      bond: row.bond,
      counter_action: row.counterAction,
    })),
    case: bundle.courtCase
      ? {
          id: bundle.courtCase.id,
          status: bundle.courtCase.status,
          tx: bundle.courtCase.tx,
        }
      : null,
    verdict: verdict
      ? {
          id: verdict.id,
          outcome: verdict.outcome as StoredOutcome,
          remedy_action: verdict.remedyAction,
          reasoning: verdict.reasoning,
          objection_grounded: verdict.objectionGrounded,
          judge: verdict.judge,
          tx: verdict.tx,
          appeal_of: verdict.appealOf,
          prior_reasoning: bundle.priorVerdict?.reasoning ?? null,
          prior_judge: bundle.priorVerdict?.judge ?? null,
          escalate_external: verdict.escalateExternal,
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

function actionPhase(bundle: NonNullable<Awaited<ReturnType<typeof loadActionBundle>>>) {
  const status = bundle.action.status;
  if (status === "withdrawn") return "withdrawn" as const;
  if (status === "permitted" || status === "executed") return status;
  if (status === "escalated") return "escalated" as const;
  if (status === "awaiting_ack") return "awaiting_ack" as const;
  if (bundle.action.insistedAt && bundle.courtCase && bundle.courtCase.status !== "judged") {
    return "in_court" as const;
  }
  if (status === "bargaining") return "bargaining" as const;
  return "collecting" as const;
}

function proposerCan(bundle: NonNullable<Awaited<ReturnType<typeof loadActionBundle>>>) {
  const claimed = Boolean(bundle.action.insistedAt);
  const bargaining = bundle.action.status === "bargaining" && !claimed;
  return {
    withdraw: (bundle.action.status === "open" || bundle.action.status === "bargaining") && !claimed,
    revise: bargaining && bundle.action.revision < MAX_REVISION,
    insist: bargaining && bundle.objections.length > 0,
  };
}

function permittedPayloadOf(
  bundle: NonNullable<Awaited<ReturnType<typeof loadActionBundle>>>,
): ActionPayload | null {
  if (bundle.action.status !== "permitted") return null;
  const raw = bundle.action.permittedPayload;
  if (raw == null) return null;
  try {
    return asPayload(raw);
  } catch {
    return null;
  }
}

function isObj(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
