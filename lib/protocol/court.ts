import { and, desc, eq, isNotNull, isNull, ne, sql } from "drizzle-orm";
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
import { executeAfterAck } from "./execute";
import type { EvidenceItem, JudgeInput, ObjectionOpinion, VerdictAnswer } from "./types";
import { mintToken } from "./keys";
import { actionEvidence, actionPayload, type ActionRow, type HousePrincipal } from "./bundle";
import { asEvidence, asPayload } from "./parse";
import { normalizeCourtOutcome } from "./verdict";

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
  if (await recoverFalseEscalate(principal, now)) return true;
  const bare = await findBareCase(principal.id);
  if (bare) {
    await submitForCase(bare.row, principal, bare.action, now);
    return true;
  }
  return false;
}

const liveHouse = and(eq(principals.isSpawn, false), isNotNull(principals.ownerAddress));

export async function findHouseNeedingCourt(_now: Date): Promise<string | null> {
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

  const [falseEsc] = await db
    .select({ principalId: actions.principalId })
    .from(cases)
    .innerJoin(actions, eq(cases.actionId, actions.id))
    .innerJoin(principals, eq(actions.principalId, principals.id))
    .innerJoin(verdicts, eq(verdicts.caseId, cases.id))
    .where(
      and(
        liveHouse,
        eq(cases.status, "judged"),
        eq(verdicts.judge, "offline"),
        eq(verdicts.outcome, "escalate"),
        eq(verdicts.reasoning, ERROR_ESCALATE.reasoning),
        sql`not exists (
          select 1 from verdicts newer
          where newer.case_id = ${cases.id}
            and (newer.created_at > ${verdicts.createdAt}
              or (newer.created_at = ${verdicts.createdAt} and newer.id > ${verdicts.id}))
        )`,
      ),
    )
    .limit(1);
  return falseEsc?.principalId ?? null;
}

export async function openCourt(action: ActionRow, principal: HousePrincipal, now: Date): Promise<void> {
  const db = getDb();
  const [existing] = await db.select().from(cases).where(eq(cases.actionId, action.id)).limit(1);
  let row = existing ?? null;
  if (!row) {
    const claimed = await db
      .insert(cases)
      .values({
        id: mintToken("cas"),
        actionId: action.id,
        constitutionSnapshot: principal.constitution,
        status: "open",
      })
      .onConflictDoNothing({ target: cases.actionId })
      .returning();
    row = claimed[0] ?? (await db.select().from(cases).where(eq(cases.actionId, action.id)).limit(1))[0] ?? null;
  }
  if (!row || row.status === "judged" || row.tx) return;
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

async function advanceCase(row: CaseRow, principal: HousePrincipal, now: Date): Promise<void> {
  if (!row.tx) return;
  const phase = await inspectJudgeTx(row.tx);
  if (phase === "pending") return;
  if (phase === "ready") {
    const answer = await readCaseVerdict(principal, row);
    if (answer) {
      await applyVerdict(row, principal, now, answer, "onchain", row.tx);
      return;
    }
    // Consensus landed. Do not burn a retry because the view lagged.
    return;
  }
  await markTxFailed(row, principal, now);
}

async function readCaseVerdict(principal: HousePrincipal, row: CaseRow): Promise<VerdictAnswer | null> {
  const contract = row.contract || principal.courtContract;
  if (!contract) return null;
  const wallet = await ensureHouseWallet(principal);
  return readJudgeVerdict(contract, row.id, wallet.accountKey);
}

async function recoverFalseEscalate(principal: HousePrincipal, now: Date): Promise<boolean> {
  const row = await findFalseEscalateCase(principal.id);
  if (!row) return false;
  const answer = await readCaseVerdict(principal, row);
  if (!answer) return false;
  await applyVerdict(row, principal, now, answer, "onchain", row.tx);
  return true;
}

async function findFalseEscalateCase(principalId: string): Promise<CaseRow | null> {
  const db = getDb();
  const [hit] = await db
    .select({ court: cases, verdictJudge: verdicts.judge, verdictOutcome: verdicts.outcome, verdictReason: verdicts.reasoning })
    .from(cases)
    .innerJoin(actions, eq(cases.actionId, actions.id))
    .innerJoin(verdicts, eq(verdicts.caseId, cases.id))
    .where(and(eq(actions.principalId, principalId), eq(cases.status, "judged")))
    .orderBy(desc(verdicts.createdAt), desc(verdicts.id))
    .limit(1);
  if (!hit) return null;
  if (
    hit.verdictJudge === "offline" &&
    hit.verdictOutcome === "escalate" &&
    hit.verdictReason === ERROR_ESCALATE.reasoning
  ) {
    return hit.court;
  }
  return null;
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
  const hash = await submitJudgeWrite(wallet.accountKey, contractAddress, row.id, await buildJudgeInput(row, action), extra);
  if (!hash) {
    await noteSubmitFail(row, principal, now);
    return;
  }
  const db = getDb();
  await db.update(cases).set({ tx: hash, status: "open", contract: contractAddress }).where(eq(cases.id, row.id));
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

export async function buildJudgeInput(row: CaseRow, action: ActionRow): Promise<JudgeInput> {
  const db = getDb();
  const filed = await db.select().from(objections).where(eq(objections.actionId, action.id));
  const current = filed
    .filter((item) => item.revision === action.revision)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
  const opinions: ObjectionOpinion[] = current.map((item) => ({
    objector_id: item.objectorId,
    justification: item.justification,
    counter_action: item.counterAction ? asPayload(item.counterAction) : null,
  }));
  const evidence: EvidenceItem[] = [
    ...actionEvidence(action),
    ...current.flatMap((item) => asEvidence(item.evidence)),
  ];
  return {
    constitution: row.constitutionSnapshot,
    proposed_action: actionPayload(action),
    objections: opinions,
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
      outcome: normalizeCourtOutcome(prior.outcome) ?? "escalate",
      remedy_action: null,
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
      .where(and(eq(verdicts.caseId, row.id), eq(verdicts.tx, tx), eq(verdicts.judge, "onchain")))
      .limit(1);
    if (existing) return;
  }

  await db.insert(verdicts).values({
    id: mintToken("vrd"),
    caseId: row.id,
    outcome: answer.outcome,
    remedyAction: answer.remedy_action,
    reasoning: answer.reasoning,
    objectionGrounded: answer.objection_grounded,
    judge,
    tx,
    appealOf: null,
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

  const [action] = await db
    .select({ testPass: actions.testPass })
    .from(actions)
    .where(eq(actions.id, row.actionId))
    .limit(1);
  if (action?.testPass) await executeAfterAck(row.actionId);
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
  const hash = await submitJudgeWrite(wallet.accountKey, contractAddress, row.id, await buildJudgeInput(row, action), extra);
  if (!hash) {
    await noteSubmitFail(row, principal, now);
    return null;
  }
  await getDb().update(cases).set({ tx: hash, status: "open", contract: contractAddress }).where(eq(cases.id, row.id));
  await recordCourtTx(principal, hash, contractAddress);
  return hash;
}
