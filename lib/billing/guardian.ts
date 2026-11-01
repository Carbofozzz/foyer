import { eq, sql } from "drizzle-orm";
import { billingAccounts, billingLedger } from "@/lib/db/schema";
import { getDb } from "@/lib/db";
import { mintToken } from "@/lib/protocol/keys";
import { ProtocolError } from "@/lib/protocol/errors";
import { ensureBillingAccount } from "./account";

export const GUARDIAN_FREE_MONTH = 10;
export const GUARDIAN_PAID_PERIOD = 100;
export const GUARDIAN_TRANCHE = 10;

export type GuardianPools = {
  free_remaining: number;
  free_quota: number;
  sub: number;
  pack: number;
  total: number;
};

export async function guardianPools(principalId: string): Promise<GuardianPools> {
  const account = await ensureBillingAccount(principalId);
  const freeRemaining = Math.max(0, GUARDIAN_FREE_MONTH - (account.guardianFreeUsed ?? 0));
  const sub = Math.max(0, account.guardianSubCredits ?? 0);
  const pack = Math.max(0, account.guardianBalance ?? 0);
  return {
    free_remaining: freeRemaining,
    free_quota: GUARDIAN_FREE_MONTH,
    sub,
    pack,
    total: freeRemaining + sub + pack,
  };
}

/** One reaction after the model spent tokens. Same review id does not debit twice. */
export async function debitGuardianReaction(principalId: string, reviewId: string): Promise<void> {
  await ensureBillingAccount(principalId);
  const db = getDb();
  const idempotencyKey = `debit_guardian:${reviewId}`;
  const [existing] = await db
    .select({ id: billingLedger.id })
    .from(billingLedger)
    .where(eq(billingLedger.idempotencyKey, idempotencyKey))
    .limit(1);
  if (existing) return;
  const [account] = await db
    .select()
    .from(billingAccounts)
    .where(eq(billingAccounts.principalId, principalId))
    .limit(1);
  if (!account) return;
  const freeRemaining = Math.max(0, GUARDIAN_FREE_MONTH - account.guardianFreeUsed);
  const pool = freeRemaining > 0 ? "free" : account.guardianSubCredits > 0 ? "sub" : "pack";
  try {
    await db.insert(billingLedger).values({
      id: mintToken("bld"),
      principalId,
      delta: -1,
      reason: "debit_guardian",
      provider: "foyer",
      idempotencyKey,
      note: `Guardian review (${pool})`,
    });
  } catch (error) {
    // A parallel sweep already inserted this review's debit.
    if (isUniqueViolation(error)) return;
    throw error;
  }
  if (pool === "free") {
    await db
      .update(billingAccounts)
      .set({ guardianFreeUsed: sql`${billingAccounts.guardianFreeUsed} + 1`, updatedAt: new Date() })
      .where(eq(billingAccounts.principalId, principalId));
  } else if (pool === "sub") {
    await db
      .update(billingAccounts)
      .set({
        guardianSubCredits: sql`greatest(0, ${billingAccounts.guardianSubCredits} - 1)`,
        updatedAt: new Date(),
      })
      .where(eq(billingAccounts.principalId, principalId));
  } else {
    await db
      .update(billingAccounts)
      .set({
        guardianBalance: sql`greatest(0, ${billingAccounts.guardianBalance} - 1)`,
        updatedAt: new Date(),
      })
      .where(eq(billingAccounts.principalId, principalId));
  }
}

function isUniqueViolation(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("billing_ledger_idempotency") || message.includes("duplicate key");
}

/** Paid plan includes 100 reactions for the period. Idempotent per subscription grant. */
export async function grantGuardianSubscription(principalId: string, idempotencyKey: string): Promise<void> {
  await ensureBillingAccount(principalId);
  const db = getDb();
  const key = `guardian_sub:${idempotencyKey}`;
  const [dup] = await db
    .select({ id: billingLedger.id })
    .from(billingLedger)
    .where(eq(billingLedger.idempotencyKey, key))
    .limit(1);
  if (dup) return;
  await db.insert(billingLedger).values({
    id: mintToken("bld"),
    principalId,
    delta: GUARDIAN_PAID_PERIOD,
    reason: "grant_guardian_sub",
    provider: "foyer",
    idempotencyKey: key,
    note: "Paid plan guardian reactions",
  });
  await db
    .update(billingAccounts)
    .set({
      guardianSubCredits: sql`${billingAccounts.guardianSubCredits} + ${GUARDIAN_PAID_PERIOD}`,
      updatedAt: new Date(),
    })
    .where(eq(billingAccounts.principalId, principalId));
}

export async function grantGuardianPack(
  principalId: string,
  reactions: number,
  note?: string,
  options?: { idempotencyKey?: string; provider?: string; voucherId?: string | null },
): Promise<void> {
  if (!Number.isInteger(reactions) || reactions < GUARDIAN_TRANCHE || reactions % GUARDIAN_TRANCHE !== 0) {
    throw new ProtocolError("bad_request", "Guardian reactions must be a multiple of 10", 400);
  }
  await ensureBillingAccount(principalId);
  const db = getDb();
  const idempotencyKey = options?.idempotencyKey ?? `guardian_pack:${principalId}:${mintToken("bld")}`;
  const [dup] = await db
    .select({ id: billingLedger.id })
    .from(billingLedger)
    .where(eq(billingLedger.idempotencyKey, idempotencyKey))
    .limit(1);
  if (dup) return;
  await db.insert(billingLedger).values({
    id: mintToken("bld"),
    principalId,
    delta: reactions,
    reason: "grant_guardian_pack",
    provider: options?.provider ?? "manual_admin",
    idempotencyKey,
    voucherId: options?.voucherId ?? null,
    note: note ?? "Guardian pack",
  });
  await db
    .update(billingAccounts)
    .set({
      guardianBalance: sql`${billingAccounts.guardianBalance} + ${reactions}`,
      updatedAt: new Date(),
    })
    .where(eq(billingAccounts.principalId, principalId));
}
