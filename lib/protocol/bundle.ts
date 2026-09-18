import { inArray } from "drizzle-orm";
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

export type ActionBundle = {
  action: ActionRow;
  objections: (typeof objections.$inferSelect)[];
  courtCase: typeof cases.$inferSelect | null;
  verdict: typeof verdicts.$inferSelect | null;
  priorVerdict: typeof verdicts.$inferSelect | null;
  acks: (typeof acks.$inferSelect)[];
  executions: (typeof executions.$inferSelect)[];
  report: typeof actionReports.$inferSelect | null;
};

export async function loadActionBundle(actionId: string): Promise<ActionBundle | null> {
  const [bundle] = await loadActionBundles([actionId]);
  return bundle ?? null;
}

/** One round-trip set per table for many actions (inbox). */
export async function loadActionBundles(actionIds: string[]): Promise<ActionBundle[]> {
  const ids = [...new Set(actionIds.filter(Boolean))];
  if (ids.length === 0) return [];
  const db = getDb();
  const actionRows = await db.select().from(actions).where(inArray(actions.id, ids));
  if (actionRows.length === 0) return [];
  const found = actionRows.map((row) => row.id);
  const [filed, caseRows, ackRows, execRows, reportRows] = await Promise.all([
    db.select().from(objections).where(inArray(objections.actionId, found)),
    db.select().from(cases).where(inArray(cases.actionId, found)),
    db.select().from(acks).where(inArray(acks.actionId, found)),
    db.select().from(executions).where(inArray(executions.actionId, found)),
    db.select().from(actionReports).where(inArray(actionReports.actionId, found)),
  ]);
  const caseByAction = new Map<string, typeof cases.$inferSelect>();
  for (const row of caseRows) {
    const prev = caseByAction.get(row.actionId);
    if (
      !prev ||
      row.createdAt.getTime() < prev.createdAt.getTime() ||
      (row.createdAt.getTime() === prev.createdAt.getTime() && row.id < prev.id)
    ) {
      caseByAction.set(row.actionId, row);
    }
  }
  const caseIds = [...new Set([...caseByAction.values()].map((row) => row.id))];
  const verdictRows = caseIds.length
    ? await db.select().from(verdicts).where(inArray(verdicts.caseId, caseIds))
    : [];
  const verdictsByCase = new Map<string, (typeof verdicts.$inferSelect)[]>();
  for (const row of verdictRows) {
    const list = verdictsByCase.get(row.caseId) ?? [];
    list.push(row);
    verdictsByCase.set(row.caseId, list);
  }
  for (const list of verdictsByCase.values()) {
    list.sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id),
    );
  }
  const objectionsByAction = groupBy(filed, (row) => row.actionId);
  const acksByAction = groupBy(ackRows, (row) => row.actionId);
  const execsByAction = groupBy(execRows, (row) => row.actionId);
  const reportByAction = new Map(reportRows.map((row) => [row.actionId, row]));
  const byId = new Map(actionRows.map((row) => [row.id, row]));
  const out: ActionBundle[] = [];
  for (const id of ids) {
    const action = byId.get(id);
    if (!action) continue;
    out.push(
      assembleBundle(
        action,
        objectionsByAction.get(id) ?? [],
        caseByAction.get(id) ?? null,
        verdictsByCase.get(caseByAction.get(id)?.id ?? "") ?? [],
        acksByAction.get(id) ?? [],
        execsByAction.get(id) ?? [],
        reportByAction.get(id) ?? null,
      ),
    );
  }
  return out;
}

function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    const list = map.get(k);
    if (list) list.push(row);
    else map.set(k, [row]);
  }
  return map;
}

function assembleBundle(
  action: ActionRow,
  filed: (typeof objections.$inferSelect)[],
  courtCase: typeof cases.$inferSelect | null,
  verdictList: (typeof verdicts.$inferSelect)[],
  ackRows: (typeof acks.$inferSelect)[],
  execRows: (typeof executions.$inferSelect)[],
  report: typeof actionReports.$inferSelect | null,
): ActionBundle {
  const currentObjections = filed
    .filter((row) => row.revision === action.revision)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
  const latest = verdictList[0] ?? null;
  return {
    action,
    objections: currentObjections,
    courtCase,
    verdict: latest,
    priorVerdict: latest?.appealOf ? verdictList.find((row) => row.id === latest.appealOf) ?? null : null,
    acks: ackRows,
    executions: execRows,
    report,
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
    payload_hash: bundle.action.payloadHash || null,
    last_write:
      bundle.action.lastWriteHash && bundle.action.lastWriteOp
        ? {
            op: bundle.action.lastWriteOp,
            hash: bundle.action.lastWriteHash,
            signed: Boolean(bundle.action.lastWriteSigned),
            key_gen: bundle.action.lastWriteKeyGen || null,
          }
        : null,
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
      payload_hash: row.payloadHash || null,
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
