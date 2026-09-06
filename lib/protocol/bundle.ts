import { asc, desc, eq } from "drizzle-orm";
import { acks, actionReports, actions, agents, cases, executions, objections, verdicts } from "@/lib/db/schema";
import { getDb } from "@/lib/db";
import { KIND_REVERSIBLE, type ActionKind, type ActionPayload, type EvidenceItem, type Outcome } from "./types";
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
  const verdictList = courtCase
    ? await db
        .select()
        .from(verdicts)
        .where(eq(verdicts.caseId, courtCase.id))
        .orderBy(desc(verdicts.createdAt), desc(verdicts.id))
    : [];
  return {
    action,
    objections: filed,
    courtCase,
    verdict: verdictList[0] ?? null,
    acks: ackRows,
    executions: execRows,
    report: reportRows[0] ?? null,
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

function chosenKind(
  bundle: NonNullable<Awaited<ReturnType<typeof loadActionBundle>>>,
): ActionKind | null {
  const verdict = bundle.verdict;
  if (!verdict) return bundle.action.kind as ActionKind;
  if (verdict.outcome === "allow_a") return bundle.action.kind as ActionKind;
  if (verdict.outcome === "remedy" && verdict.remedyAction) return asPayload(verdict.remedyAction).kind;
  if (verdict.outcome === "allow_b") {
    const counter = bundle.objections[0]?.counterAction;
    return counter ? asPayload(counter).kind : null;
  }
  return null;
}

export function serializeAction(bundle: NonNullable<Awaited<ReturnType<typeof loadActionBundle>>>) {
  const verdict = bundle.verdict;
  const kind = chosenKind(bundle);
  const permitted = permittedPayloadOf(bundle);
  const mayAct = bundle.action.status === "permitted" && permitted !== null;
  const held =
    Boolean(
      kind &&
        !KIND_REVERSIBLE[kind] &&
        bundle.action.status === "awaiting_ack" &&
        bundle.action.appealUntil &&
        bundle.action.appealUntil > new Date(),
    );
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
    held_until: held ? bundle.action.appealUntil?.toISOString() ?? null : null,
    executed_at: bundle.action.executedAt?.toISOString() ?? null,
    may_act: mayAct,
    permitted_payload: permitted,
    report: bundle.report
      ? {
          did: bundle.report.did,
          result: reportResult(bundle.report.did, mayAct),
          at: bundle.report.createdAt.toISOString(),
        }
      : null,
    test_pass: bundle.action.testPass,
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
          tx: bundle.courtCase.tx,
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
          appeal_of: verdict.appealOf,
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

function reportResult(did: boolean, mayAct: boolean): "did" | "skipped" | "broke" {
  if (did && mayAct) return "did";
  if (!did && mayAct) return "skipped";
  if (did && !mayAct) return "broke";
  return "skipped";
}

function isObj(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
