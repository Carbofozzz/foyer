import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { actions, cases, guardianReviews, objections, principals, verdicts } from "@/lib/db/schema";
import { getDb } from "@/lib/db";
import { denyAction, executeSilenceAllow } from "@/lib/protocol/execute";
import { COURT_APPEAL_SEC } from "@/lib/protocol/types";
import { mintToken } from "@/lib/protocol/keys";
import { stampActionWrite, writeHash } from "@/lib/protocol/write-hash";
import { escalateOffline } from "@/lib/notify/wake";
import {
  REASON_GUARDIAN_FAILED,
  REASON_GUARDIAN_NO_CREDIT,
  REASON_GUARDIAN_NO_KEY,
  REASON_GUARDIAN_NO_RULES,
  REASON_GUARDIAN_UNSURE,
} from "@/lib/notify/reasons";
import { parseGuardianAnswer, settleAnswer } from "./compare";
import { completeGuardian, GUARDIAN_HOUSE_KEY_EMPTY, GUARDIAN_KEY_UNSET } from "./gateway";
import { ensureGuardianSchema, ensureHouseGuardian } from "./house";

const MAX_ATTEMPTS = 3;
// A background attempt that dies after the claim must be reclaimable on the next inbox poll.
const STUCK_MS = 15_000;
const PROPOSAL_CHARS = 8_000;

export async function enqueueGuardianReview(actionId: string, revision: number): Promise<void> {
  await ensureGuardianSchema();
  const db = getDb();
  await db
    .insert(guardianReviews)
    .values({
      id: mintToken("grv"),
      actionId,
      revision,
      status: "pending",
      attempts: 0,
    })
    .onConflictDoNothing({ target: [guardianReviews.actionId, guardianReviews.revision] });
}

/** Action ids whose current revision still waits on the guardian. */
export async function pendingGuardianActionIds(principalId: string): Promise<Set<string>> {
  await ensureGuardianSchema();
  const db = getDb();
  const rows = await db
    .select({ actionId: guardianReviews.actionId, revision: guardianReviews.revision })
    .from(guardianReviews)
    .innerJoin(actions, eq(guardianReviews.actionId, actions.id))
    .where(
      and(
        eq(actions.principalId, principalId),
        eq(actions.status, "open"),
        inArray(guardianReviews.status, ["pending", "running"]),
        eq(guardianReviews.revision, actions.revision),
      ),
    );
  return new Set(rows.map((row) => row.actionId));
}

/** Idempotent. One pass per pending review, then permit, bargain, or human. */
export async function runHouseGuardian(principalId: string, now: Date): Promise<number> {
  await ensureGuardianSchema();
  const db = getDb();
  const stuckBefore = new Date(now.getTime() - STUCK_MS);
  const houseActions = await db
    .select({ id: actions.id })
    .from(actions)
    .where(eq(actions.principalId, principalId));
  const houseIds = houseActions.map((row) => row.id);
  if (houseIds.length > 0) {
    await db
      .update(guardianReviews)
      .set({ status: "pending", updatedAt: now })
      .where(
        and(
          eq(guardianReviews.status, "running"),
          lt(guardianReviews.updatedAt, stuckBefore),
          inArray(guardianReviews.actionId, houseIds),
        ),
      );
  }

  const open = await db
    .select({ id: guardianReviews.id })
    .from(guardianReviews)
    .innerJoin(actions, eq(guardianReviews.actionId, actions.id))
    .where(and(eq(actions.principalId, principalId), eq(guardianReviews.status, "pending")));
  let advanced = 0;
  for (const row of open) {
    const did = await runOneReview(row.id, principalId, now);
    if (did) advanced += 1;
  }
  return advanced;
}

async function runOneReview(reviewId: string, principalId: string, now: Date): Promise<boolean> {
  const db = getDb();
  const [claimed] = await db
    .update(guardianReviews)
    .set({
      status: "running",
      attempts: sql`${guardianReviews.attempts} + 1`,
      updatedAt: now,
    })
    .where(and(eq(guardianReviews.id, reviewId), eq(guardianReviews.status, "pending")))
    .returning();
  if (!claimed) return false;

  const [action] = await db.select().from(actions).where(eq(actions.id, claimed.actionId)).limit(1);
  const [principal] = await db.select().from(principals).where(eq(principals.id, principalId)).limit(1);
  if (!action || !principal || action.status !== "open" || action.revision !== claimed.revision) {
    await finish(reviewId, null);
    return false;
  }

  const constitution = principal.constitution.trim();
  if (!constitution) {
    await escalateOffline(principal, action.id, now, REASON_GUARDIAN_NO_RULES);
    await finish(reviewId, null);
    return true;
  }

  const proposal = proposalText(action.justification, action.payload);
  const { houseGuardianEndpoint } = await import("./settings");
  const endpoint = await houseGuardianEndpoint(principalId);
  if (!endpoint.own) {
    const { guardianPools } = await import("@/lib/billing/guardian");
    const pools = await guardianPools(principalId);
    if (pools.total < 1) {
      await escalateOffline(principal, action.id, now, REASON_GUARDIAN_NO_CREDIT);
      await finish(reviewId, "no credits");
      return true;
    }
  }
  const result = await completeGuardian({
    constitution,
    proposal,
    addendum: endpoint.addendum,
    own: endpoint.own,
  });
  if (!(await stillClaimed(reviewId, claimed.attempts))) return false;
  // One review debits once, including a failed body that already spent tokens.
  if (!endpoint.own && result.tokens > 0) {
    const { debitGuardianReaction } = await import("@/lib/billing/guardian");
    await debitGuardianReaction(principalId, reviewId);
  }
  if (!result.ok && isMissingGuardianKey(result.error)) {
    await escalateOffline(principal, action.id, now, REASON_GUARDIAN_NO_KEY);
    await finish(reviewId, result.error);
    return true;
  }
  if (!result.ok || (!endpoint.own && result.tokens <= 0)) {
    if (claimed.attempts >= MAX_ATTEMPTS) {
      await escalateOffline(principal, action.id, now, REASON_GUARDIAN_FAILED);
      await finish(reviewId, result.ok ? "no tokens" : result.error);
      return true;
    }
    await db
      .update(guardianReviews)
      .set({ status: "pending", error: result.ok ? "no tokens" : result.error, updatedAt: new Date() })
      .where(eq(guardianReviews.id, reviewId));
    return false;
  }

  const parsed = parseGuardianAnswer(result.content);
  const answer = parsed ? settleAnswer(parsed) : null;
  if (!answer || answer.decision === "unsure") {
    await escalateOffline(principal, action.id, now, REASON_GUARDIAN_UNSURE);
    await finish(reviewId, "unsure");
    return true;
  }
  if (answer.decision === "allow") {
    await executeSilenceAllow(action);
    await finish(reviewId, null);
    return true;
  }

  const guardian = await ensureHouseGuardian(principalId);
  const hash = writeHash({ op: "object", justification: answer.text, evidence: [], counter_action: null });
  await db
    .insert(objections)
    .values({
      id: mintToken("obj"),
      actionId: action.id,
      objectorId: guardian.id,
      revision: action.revision,
      justification: answer.text,
      evidence: [],
      payloadHash: hash,
      bond: "0",
      counterAction: null,
    })
    .onConflictDoNothing({ target: [objections.actionId, objections.objectorId, objections.revision] });
  await stampActionWrite(action.id, "object", hash, { lastWriteSigned: false, lastWriteSig: "", lastWriteKeyGen: 0 });
  await denyObjection(principal, action.id, answer.text, now);
  await finish(reviewId, null);
  return true;
}

/** A rule break is a deny. No bargain clock and no message to the house. Appeal is a later insist. */
async function denyObjection(
  principal: typeof principals.$inferSelect,
  actionId: string,
  text: string,
  now: Date,
): Promise<void> {
  const db = getDb();
  const [existing] = await db.select().from(cases).where(eq(cases.actionId, actionId)).limit(1);
  if (existing?.tx) return;
  const caseId = existing?.id ?? mintToken("cas");
  if (!existing) {
    await db.insert(cases).values({
      id: caseId,
      actionId,
      constitutionSnapshot: principal.constitution,
      status: "judged",
      tx: null,
      txErrors: 0,
    });
  }
  const [verdict] = await db.select({ id: verdicts.id }).from(verdicts).where(eq(verdicts.caseId, caseId)).limit(1);
  if (!verdict) {
    await db.insert(verdicts).values({
      id: mintToken("vrd"),
      caseId,
      outcome: "deny",
      remedyAction: null,
      reasoning: text,
      objectionGrounded: true,
      judge: "offline",
      tx: null,
      appealOf: null,
      escalateExternal: false,
    });
  }
  await denyAction(actionId, new Date(now.getTime() + COURT_APPEAL_SEC * 1000));
}

async function stillClaimed(reviewId: string, attempts: number): Promise<boolean> {
  const [row] = await getDb()
    .select({ status: guardianReviews.status, attempts: guardianReviews.attempts })
    .from(guardianReviews)
    .where(eq(guardianReviews.id, reviewId))
    .limit(1);
  return row?.status === "running" && row.attempts === attempts;
}

function isMissingGuardianKey(error: string): boolean {
  return error === GUARDIAN_KEY_UNSET || error === GUARDIAN_HOUSE_KEY_EMPTY;
}

function proposalText(justification: string, payload: unknown): string {
  const body = `${justification}\n${JSON.stringify(payload ?? {})}`;
  return body.length > PROPOSAL_CHARS ? body.slice(0, PROPOSAL_CHARS) : body;
}

async function finish(reviewId: string, error: string | null) {
  await getDb()
    .update(guardianReviews)
    .set({ status: "done", error, updatedAt: new Date() })
    .where(eq(guardianReviews.id, reviewId));
}
