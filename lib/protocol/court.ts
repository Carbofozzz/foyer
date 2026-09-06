import { and, desc, eq, isNotNull, isNull, lte, ne, or, sql } from "drizzle-orm";
import { actions, cases, objections, principals, verdicts } from "@/lib/db/schema";
import { getDb } from "@/lib/db";
import { COURT_FLOOR_WEI, ensureCourtFunds } from "@/lib/judge/funds";
import { ensureHouseCourt } from "@/lib/judge/house-court";
import { ensureHouseWallet } from "@/lib/judge/house-wallet";
import {
  inspectJudgeTx,
  readJudgeVerdict,
  submitJudgeWrite,
  type JudgeExtra,
} from "@/lib/judge/onchain";
import { recordCourtTx } from "@/lib/judge/wallet";
import type { EvidenceItem, Outcome, VerdictAnswer } from "./types";
import { mintToken } from "./keys";
import { actionEvidence, actionPayload, type ActionRow, type HousePrincipal } from "./bundle";
import { asEvidence, asPayload } from "./parse";

const ERROR_ESCALATE: VerdictAnswer = {
  outcome: "escalate",
  remedy_action: null,
  reasoning: "The court transaction finalized with an error too many times.",
  objection_grounded: false,
};

const NO_FEE: VerdictAnswer = {
  outcome: "escalate",
  remedy_action: null,
  reasoning: "The house wallet cannot pay the court fee, so the court never ran.",
  objection_grounded: false,
};

const SUBMIT_FAIL: VerdictAnswer = {
  outcome: "escalate",
  remedy_action: null,
  reasoning: "The court transaction could not be submitted after several attempts.",
  objection_grounded: false,
};

function errorLimit(): number {
  return Math.max(1, Number(process.env.COURT_TX_ERROR_LIMIT ?? 3));
}

type CaseRow = typeof cases.$inferSelect;

/** One court step: submit, poll, retry, or apply. Never waits for GenLayer finalization. */
export async function stepHouseCourt(principal: HousePrincipal, now: Date): Promise<boolean> {
  const inflight = await findInflightCase(principal.id);
  if (inflight) {
    await advanceCase(inflight, principal, now);
    return true;
  }
  const bare = await findBareCase(principal.id);
  if (bare) {
    await submitForCase(bare.row, principal, bare.action, now);
    return true;
  }
  const deadlock = await findDeadlock(principal.id, now);
  if (deadlock) {
    await openCourt(deadlock, principal, now);
    return true;
  }
  return false;
}

const liveHouse = and(eq(principals.isSpawn, false), isNotNull(principals.ownerAddress));

export async function findHouseNeedingCourt(now: Date): Promise<string | null> {
  const db = getDb();
  const [inflight] = await db
    .select({ principalId: actions.principalId })
    .from(cases)
    .innerJoin(actions, eq(cases.actionId, actions.id))
    .innerJoin(principals, eq(actions.principalId, principals.id))
    .where(
      and(
        liveHouse,
        isNotNull(cases.tx),
        sql`not exists (select 1 from verdicts v where v.case_id = ${cases.id} and v.tx = ${cases.tx})`,
      ),
    )
    .limit(1);
  if (inflight) return inflight.principalId;

  const [bare] = await db
    .select({ principalId: actions.principalId })
    .from(cases)
    .innerJoin(actions, eq(cases.actionId, actions.id))
    .innerJoin(principals, eq(actions.principalId, principals.id))
    .where(and(liveHouse, isNull(cases.tx), ne(cases.status, "judged")))
    .limit(1);
  if (bare) return bare.principalId;

  const [row] = await db
    .select({ principalId: actions.principalId })
    .from(actions)
    .innerJoin(objections, eq(objections.actionId, actions.id))
    .innerJoin(principals, eq(actions.principalId, principals.id))
    .leftJoin(cases, eq(cases.actionId, actions.id))
    .where(
      and(
        liveHouse,
        eq(actions.status, "open"),
        isNull(cases.id),
        or(lte(actions.silenceUntil, now), eq(actions.testPass, true)),
      ),
    )
    .limit(1);
  return row?.principalId ?? null;
}

export async function openCourt(action: ActionRow, principal: HousePrincipal, now: Date): Promise<void> {
  const db = getDb();
  const caseId = mintToken("cas");
  const claimed = await db
    .insert(cases)
    .values({
      id: caseId,
      actionId: action.id,
      constitutionSnapshot: principal.constitution,
      status: "open",
    })
    .onConflictDoNothing({ target: cases.actionId })
    .returning();
  const row = claimed[0];
  if (!row) return;
  await submitForCase(row, principal, action, now);
}

async function findInflightCase(principalId: string): Promise<CaseRow | null> {
  const db = getDb();
  const [row] = await db
    .select({ court: cases })
    .from(cases)
    .innerJoin(actions, eq(cases.actionId, actions.id))
    .where(
      and(
        eq(actions.principalId, principalId),
        isNotNull(cases.tx),
        sql`not exists (select 1 from verdicts v where v.case_id = ${cases.id} and v.tx = ${cases.tx})`,
      ),
    )
    .limit(1);
  return row?.court ?? null;
}

async function findBareCase(principalId: string): Promise<{ row: CaseRow; action: ActionRow } | null> {
  const db = getDb();
  const [hit] = await db
    .select({ court: cases, action: actions })
    .from(cases)
    .innerJoin(actions, eq(cases.actionId, actions.id))
    .where(and(eq(actions.principalId, principalId), isNull(cases.tx), ne(cases.status, "judged")))
    .limit(1);
  return hit ? { row: hit.court, action: hit.action } : null;
}

async function findDeadlock(principalId: string, now: Date): Promise<ActionRow | null> {
  const db = getDb();
  const [row] = await db
    .select({ action: actions })
    .from(actions)
    .innerJoin(objections, eq(objections.actionId, actions.id))
    .leftJoin(cases, eq(cases.actionId, actions.id))
    .where(
      and(
        eq(actions.principalId, principalId),
        eq(actions.status, "open"),
        isNull(cases.id),
        or(lte(actions.silenceUntil, now), eq(actions.testPass, true)),
      ),
    )
    .limit(1);
  return row?.action ?? null;
}

async function advanceCase(row: CaseRow, principal: HousePrincipal, now: Date): Promise<void> {
  if (!row.tx) return;
  const phase = await inspectJudgeTx(row.tx);
  if (phase === "pending") return;
  if (phase === "ready") {
    const contract = principal.courtContract;
    const answer = contract ? await readJudgeVerdict(contract, row.id) : null;
    if (answer) {
      await applyVerdict(row, principal, now, answer, "onchain", row.tx);
      return;
    }
  }
  await markTxFailed(row, principal, now);
}

async function markTxFailed(row: CaseRow, principal: HousePrincipal, now: Date): Promise<void> {
  const db = getDb();
  const failedTx = row.tx;
  const errors = row.txErrors + 1;
  await db.update(cases).set({ tx: null, txErrors: errors }).where(eq(cases.id, row.id));
  if (errors >= errorLimit()) {
    await applyVerdict(row, principal, now, ERROR_ESCALATE, "offline", failedTx);
    return;
  }
  const [action] = await db.select().from(actions).where(eq(actions.id, row.actionId)).limit(1);
  if (!action) return;
  await submitForCase({ ...row, tx: null, txErrors: errors }, principal, action, now);
}

async function submitForCase(
  row: CaseRow,
  principal: HousePrincipal,
  action: ActionRow,
  now?: Date,
): Promise<void> {
  if (row.tx) return;
  const wallet = await ensureHouseWallet(principal);
  if ((await ensureCourtFunds(wallet.address)) < COURT_FLOOR_WEI) {
    if (now) await applyVerdict(row, principal, now, NO_FEE, "offline", null);
    return;
  }
  const contractAddress = await ensureHouseCourt(principal);
  if (!contractAddress) {
    await noteSubmitFail(row, principal, now);
    return;
  }

  const extra = await appealExtra(row.id);
  const hash = await submitJudgeWrite(wallet.accountKey, contractAddress, row.id, await judgeInput(row, action), extra);
  if (!hash) {
    await noteSubmitFail(row, principal, now);
    return;
  }
  const db = getDb();
  await db.update(cases).set({ tx: hash, status: "open" }).where(eq(cases.id, row.id));
  await recordCourtTx(principal, hash, contractAddress);
}

async function noteSubmitFail(row: CaseRow, principal: HousePrincipal, now?: Date): Promise<void> {
  const db = getDb();
  const errors = row.txErrors + 1;
  await db.update(cases).set({ txErrors: errors }).where(eq(cases.id, row.id));
  if (now && errors >= errorLimit()) {
    await applyVerdict({ ...row, txErrors: errors }, principal, now, SUBMIT_FAIL, "offline", null);
  }
}

async function judgeInput(row: CaseRow, action: ActionRow) {
  const db = getDb();
  const filed = await db.select().from(objections).where(eq(objections.actionId, action.id));
  const primary = filed[0];
  const evidence: EvidenceItem[] = [
    ...actionEvidence(action),
    ...(primary ? asEvidence(primary.evidence) : []),
  ];
  return {
    constitution: row.constitutionSnapshot,
    proposed_action: actionPayload(action),
    objection: primary
      ? {
          justification: primary.justification,
          counter_action: primary.counterAction ? asPayload(primary.counterAction) : null,
        }
      : null,
    evidence,
  };
}

async function appealExtra(caseId: string): Promise<JudgeExtra | undefined> {
  const db = getDb();
  const [prior] = await db
    .select()
    .from(verdicts)
    .where(eq(verdicts.caseId, caseId))
    .orderBy(desc(verdicts.createdAt))
    .limit(1);
  if (!prior) return undefined;
  return {
    prior_verdict: {
      outcome: prior.outcome as Outcome,
      remedy_action: prior.remedyAction ? asPayload(prior.remedyAction) : null,
      reasoning: prior.reasoning,
      objection_grounded: prior.objectionGrounded,
    },
    appeal_note: "",
  };
}

async function applyVerdict(
  row: CaseRow,
  principal: HousePrincipal,
  now: Date,
  answer: VerdictAnswer,
  judge: "onchain" | "offline",
  tx: string | null,
): Promise<void> {
  const db = getDb();
  if (tx) {
    const [existing] = await db
      .select({ id: verdicts.id })
      .from(verdicts)
      .where(and(eq(verdicts.caseId, row.id), eq(verdicts.tx, tx)))
      .limit(1);
    if (existing) return;
  }

  const [latest] = await db
    .select({ id: verdicts.id })
    .from(verdicts)
    .where(eq(verdicts.caseId, row.id))
    .orderBy(desc(verdicts.createdAt))
    .limit(1);

  await db.insert(verdicts).values({
    id: mintToken("vrd"),
    caseId: row.id,
    outcome: answer.outcome,
    remedyAction: answer.remedy_action,
    reasoning: answer.reasoning,
    objectionGrounded: answer.objection_grounded,
    judge,
    tx,
    appealOf: latest?.id ?? null,
    escalateExternal: false,
  });
  await db.update(cases).set({ status: "judged", tx: tx ?? row.tx, txErrors: 0 }).where(eq(cases.id, row.id));

  if (answer.outcome === "escalate") {
    await db
      .update(actions)
      .set({
        status: "escalated",
        appealUntil: new Date(now.getTime() + principal.appealWindowSec * 1000),
      })
      .where(eq(actions.id, row.actionId));
    return;
  }

  await db
    .update(actions)
    .set({
      status: "awaiting_ack",
      ackUntil: new Date(now.getTime() + principal.ackTimeoutSec * 1000),
      appealUntil: new Date(now.getTime() + principal.appealWindowSec * 1000),
    })
    .where(eq(actions.id, row.actionId));
}

/** Public submit for a principal appeal. Saves the hash; tick applies the IC JSON. */
export async function submitAppealTx(
  principal: HousePrincipal,
  row: CaseRow,
  action: ActionRow,
  extra: JudgeExtra,
  now: Date,
): Promise<string | null> {
  if (row.tx) {
    const [matched] = await getDb()
      .select({ id: verdicts.id })
      .from(verdicts)
      .where(and(eq(verdicts.caseId, row.id), eq(verdicts.tx, row.tx)))
      .limit(1);
    if (!matched) return row.tx;
  }
  const wallet = await ensureHouseWallet(principal);
  if ((await ensureCourtFunds(wallet.address)) < COURT_FLOOR_WEI) {
    await applyVerdict(row, principal, now, NO_FEE, "offline", null);
    return null;
  }
  const contractAddress = await ensureHouseCourt(principal);
  if (!contractAddress) {
    await noteSubmitFail(row, principal, now);
    return null;
  }
  const hash = await submitJudgeWrite(wallet.accountKey, contractAddress, row.id, await judgeInput(row, action), extra);
  if (!hash) {
    await noteSubmitFail(row, principal, now);
    return null;
  }
  await getDb().update(cases).set({ tx: hash, status: "open" }).where(eq(cases.id, row.id));
  await recordCourtTx(principal, hash, contractAddress);
  return hash;
}
