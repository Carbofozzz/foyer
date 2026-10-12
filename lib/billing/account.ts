import { eq, sql } from "drizzle-orm";
import { billingAccounts, billingLedger } from "@/lib/db/schema";
import { getDb } from "@/lib/db";
import { mintToken } from "@/lib/protocol/keys";
import { ProtocolError } from "@/lib/protocol/errors";
import { ensureBillingSchema } from "./ensure";
import { billingGateEnabled } from "./gate";
import { addMonthsClamp, SUB_GRACE_MS } from "./calendar";
import { ensureDefaultPlans, getPlanByCode, PLAN_FREE } from "./plans";

export async function ensureBillingAccount(principalId: string, options?: { personal?: boolean }) {
  await ensureBillingSchema();
  await ensureDefaultPlans();
  const db = getDb();
  const [existing] = await db
    .select()
    .from(billingAccounts)
    .where(eq(billingAccounts.principalId, principalId))
    .limit(1);
  if (existing) {
    return refreshAccountState(existing, options?.personal !== false);
  }
  const now = new Date();
  const freePlan = await getPlanByCode(PLAN_FREE);
  const [created] = await db
    .insert(billingAccounts)
    .values({
      principalId,
      freeAnchorAt: options?.personal === false ? null : now,
      freePeriodEnd: options?.personal === false || !freePlan ? null : addMonthsClamp(now, 1),
      freeUsedInPeriod: 0,
    })
    .onConflictDoNothing({ target: billingAccounts.principalId })
    .returning();
  if (created) return created;
  const [again] = await db
    .select()
    .from(billingAccounts)
    .where(eq(billingAccounts.principalId, principalId))
    .limit(1);
  if (!again) throw new ProtocolError("internal", "Failed to open billing account", 500);
  return refreshAccountState(again, options?.personal !== false);
}

/** Advance Free anniversary window and subscription grace/burn. */
async function refreshAccountState(
  account: typeof billingAccounts.$inferSelect,
  withFree: boolean,
): Promise<typeof billingAccounts.$inferSelect> {
  const db = getDb();
  const now = new Date();
  const patch: Partial<typeof billingAccounts.$inferInsert> = {};

  if (withFree) {
    const freePlan = await getPlanByCode(PLAN_FREE);
    if (freePlan) {
      let anchor = account.freeAnchorAt;
      if (!anchor) {
        anchor = now;
        patch.freeAnchorAt = anchor;
        patch.freePeriodEnd = addMonthsClamp(anchor, 1);
        patch.freeUsedInPeriod = 0;
      } else {
        let periodEnd = account.freePeriodEnd ?? addMonthsClamp(anchor, 1);
        let used = account.freeUsedInPeriod;
        while (periodEnd <= now) {
          const nextStart = periodEnd;
          periodEnd = addMonthsClamp(nextStart, 1);
          used = 0;
        }
        if (
          !account.freePeriodEnd ||
          account.freePeriodEnd.getTime() !== periodEnd.getTime() ||
          account.freeUsedInPeriod !== used
        ) {
          patch.freePeriodEnd = periodEnd;
          patch.freeUsedInPeriod = used;
        }
      }
    }
  }

  if (account.subscriptionPeriodEnd && account.subscriptionPeriodEnd <= now) {
    const graceUntil =
      account.subscriptionGraceUntil ??
      new Date(account.subscriptionPeriodEnd.getTime() + SUB_GRACE_MS);
    if (!account.subscriptionGraceUntil) {
      patch.subscriptionGraceUntil = graceUntil;
    }
    if (graceUntil <= now) {
      // Burn subscription leftovers; on-demand creditBalance stays.
      if (account.subscriptionCredits > 0) {
        try {
          await db.insert(billingLedger).values({
            id: mintToken("bld"),
            principalId: account.principalId,
            delta: -account.subscriptionCredits,
            reason: "burn_sub",
            provider: "foyer",
            idempotencyKey: `burn_sub:${account.principalId}:${account.subscriptionPeriodEnd.toISOString()}`,
            note: "Subscription grace ended",
          });
        } catch {
          /* already burned */
        }
      }
      patch.subscriptionCredits = 0;
      patch.featureOrg = false;
      patch.subscriptionPlanId = null;
      patch.subscriptionPeriodEnd = null;
      patch.subscriptionGraceUntil = null;
      // Freeze path is B4.
    }
  }

  if (Object.keys(patch).length === 0) return account;
  patch.updatedAt = now;
  const [updated] = await db
    .update(billingAccounts)
    .set(patch)
    .where(eq(billingAccounts.principalId, account.principalId))
    .returning();
  return updated ?? { ...account, ...patch };
}

export type CreditBreakdown = {
  free_remaining: number;
  free_quota: number;
  free_used: number;
  free_period_end: string | null;
  subscription_credits: number;
  on_demand: number;
  available: number;
  feature_org: boolean;
  in_grace: boolean;
};

export async function creditBreakdown(principalId: string, personal = true): Promise<CreditBreakdown> {
  const account = await ensureBillingAccount(principalId, { personal });
  const freePlan = personal ? await getPlanByCode(PLAN_FREE) : null;
  const freeQuota = freePlan?.credits ?? 0;
  const freeRemaining = personal ? Math.max(0, freeQuota - account.freeUsedInPeriod) : 0;
  // After burn, subscriptionCredits is 0. During active/grace, feature_org stays until burn.
  const subscriptionCredits = Math.max(0, account.subscriptionCredits);
  const onDemand = Math.max(0, account.creditBalance);
  const available = freeRemaining + subscriptionCredits + onDemand;
  return {
    free_remaining: freeRemaining,
    free_quota: freeQuota,
    free_used: account.freeUsedInPeriod,
    free_period_end: account.freePeriodEnd?.toISOString() ?? null,
    subscription_credits: subscriptionCredits,
    on_demand: onDemand,
    available,
    feature_org: account.featureOrg,
    in_grace: Boolean(
      account.subscriptionGraceUntil &&
        account.subscriptionGraceUntil > new Date() &&
        account.subscriptionPeriodEnd &&
        account.subscriptionPeriodEnd <= new Date(),
    ),
  };
}

export async function creditBalance(principalId: string): Promise<number> {
  return (await creditBreakdown(principalId)).available;
}

export type GrantInput = {
  principalId: string;
  credits: number;
  reason: "grant_voucher" | "grant_admin" | "adjust" | "grant_sub";
  provider: string;
  idempotencyKey: string;
  externalId?: string | null;
  voucherId?: string | null;
  note?: string | null;
  /** When true, credits go to the subscription pool (rollover / burn). */
  subscription?: boolean;
};

/** Append-only grant. Idempotent on idempotencyKey. */
export async function grantCredits(input: GrantInput): Promise<{ balance: number; granted: boolean }> {
  if (!Number.isInteger(input.credits) || input.credits <= 0) {
    throw new ProtocolError("bad_request", "credits must be a positive integer", 400);
  }
  await ensureBillingAccount(input.principalId);
  const db = getDb();
  const [dup] = await db
    .select({ id: billingLedger.id })
    .from(billingLedger)
    .where(eq(billingLedger.idempotencyKey, input.idempotencyKey))
    .limit(1);
  if (dup) {
    return { balance: await creditBalance(input.principalId), granted: false };
  }

  await db.transaction(async (tx) => {
    await tx.execute(sql`select principal_id from billing_accounts where principal_id = ${input.principalId} for update`);
    const [again] = await tx
      .select({ id: billingLedger.id })
      .from(billingLedger)
      .where(eq(billingLedger.idempotencyKey, input.idempotencyKey))
      .limit(1);
    if (again) return;
    await tx.insert(billingLedger).values({
      id: mintToken("bld"),
      principalId: input.principalId,
      delta: input.credits,
      reason: input.reason,
      provider: input.provider,
      externalId: input.externalId ?? null,
      idempotencyKey: input.idempotencyKey,
      voucherId: input.voucherId ?? null,
      note: input.note ?? null,
    });
    if (input.subscription) {
      await tx
        .update(billingAccounts)
        .set({
          subscriptionCredits: sql`${billingAccounts.subscriptionCredits} + ${input.credits}`,
          updatedAt: new Date(),
        })
        .where(eq(billingAccounts.principalId, input.principalId));
    } else {
      await tx
        .update(billingAccounts)
        .set({
          creditBalance: sql`${billingAccounts.creditBalance} + ${input.credits}`,
          updatedAt: new Date(),
        })
        .where(eq(billingAccounts.principalId, input.principalId));
    }
  });

  return { balance: await creditBalance(input.principalId), granted: true };
}

/** Start or renew Pro (anniversary month). Adds plan credits to the subscription pool. */
export async function activateSubscription(
  principalId: string,
  planId: string,
  credits: number,
  options?: { durationSec?: number | null; idempotencyKey?: string; voucherId?: string | null },
): Promise<void> {
  await ensureBillingAccount(principalId);
  const db = getDb();
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.execute(sql`select principal_id from billing_accounts where principal_id = ${principalId} for update`);
    const [account] = await tx
      .select()
      .from(billingAccounts)
      .where(eq(billingAccounts.principalId, principalId))
      .limit(1);
    if (!account) return;

    let periodEnd: Date;
    if (options?.durationSec && options.durationSec > 0) {
      const base =
        account.subscriptionPeriodEnd && account.subscriptionPeriodEnd > now
          ? account.subscriptionPeriodEnd
          : now;
      periodEnd = new Date(base.getTime() + options.durationSec * 1000);
    } else {
      const base =
        account.subscriptionPeriodEnd && account.subscriptionPeriodEnd > now
          ? account.subscriptionPeriodEnd
          : now;
      periodEnd = addMonthsClamp(base, 1);
    }

    await tx
      .update(billingAccounts)
      .set({
        subscriptionPlanId: planId,
        subscriptionPeriodEnd: periodEnd,
        subscriptionGraceUntil: null,
        featureOrg: true,
        orgFrozenAt: null,
        updatedAt: now,
      })
      .where(eq(billingAccounts.principalId, principalId));
  });

  if (credits > 0) {
    await grantCredits({
      principalId,
      credits,
      reason: "grant_sub",
      provider: options?.voucherId ? "voucher" : "foyer",
      idempotencyKey: options?.idempotencyKey ?? `sub_grant:${principalId}:${Date.now()}`,
      voucherId: options?.voucherId,
      note: "Subscription credits",
      subscription: true,
    });
  }
}

export async function assertCourtCredit(principalId: string): Promise<void> {
  if (!billingGateEnabled()) return;
  const available = await creditBalance(principalId);
  if (available < 1) {
    throw new ProtocolError(
      "payment_required",
      "Court credit required — open Plan and redeem a code, or ask ops to grant credits",
      402,
    );
  }
}

export async function maySubmitCourt(principalId: string, caseId: string): Promise<boolean> {
  if (!billingGateEnabled()) return true;
  await ensureBillingSchema();
  const db = getDb();
  const [debited] = await db
    .select({ id: billingLedger.id })
    .from(billingLedger)
    .where(eq(billingLedger.caseId, caseId))
    .limit(1);
  if (debited) return true;
  return (await creditBalance(principalId)) >= 1;
}

/** Debit one credit after a successful court tx. Order: Free → subscription → on-demand. */
export async function debitCourtCredit(principalId: string, caseId: string): Promise<void> {
  if (!billingGateEnabled()) return;
  await ensureBillingAccount(principalId);
  const db = getDb();
  const idempotencyKey = `debit_court:${caseId}`;

  await db.transaction(async (tx) => {
    await tx.execute(sql`select principal_id from billing_accounts where principal_id = ${principalId} for update`);
    const [existing] = await tx
      .select({ id: billingLedger.id })
      .from(billingLedger)
      .where(eq(billingLedger.caseId, caseId))
      .limit(1);
    if (existing) return;

    const [account] = await tx
      .select()
      .from(billingAccounts)
      .where(eq(billingAccounts.principalId, principalId))
      .limit(1);
    if (!account) return;

    const freePlan = await getPlanByCode(PLAN_FREE);
    const freeQuota = freePlan?.credits ?? 0;
    const freeRemaining = Math.max(0, freeQuota - account.freeUsedInPeriod);
    let pool: "free" | "subscription" | "on_demand" = "on_demand";
    if (freeRemaining > 0 && account.freeAnchorAt) {
      pool = "free";
    } else if (account.subscriptionCredits > 0) {
      pool = "subscription";
    }

    await tx.insert(billingLedger).values({
      id: mintToken("bld"),
      principalId,
      delta: -1,
      reason: "debit_court",
      provider: "foyer",
      idempotencyKey,
      caseId,
      note: `Court submit (${pool})`,
    });

    if (pool === "free") {
      await tx
        .update(billingAccounts)
        .set({
          freeUsedInPeriod: sql`${billingAccounts.freeUsedInPeriod} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(billingAccounts.principalId, principalId));
    } else if (pool === "subscription") {
      await tx
        .update(billingAccounts)
        .set({
          subscriptionCredits: sql`greatest(0, ${billingAccounts.subscriptionCredits} - 1)`,
          updatedAt: new Date(),
        })
        .where(eq(billingAccounts.principalId, principalId));
    } else {
      await tx
        .update(billingAccounts)
        .set({
          creditBalance: sql`greatest(0, ${billingAccounts.creditBalance} - 1)`,
          updatedAt: new Date(),
        })
        .where(eq(billingAccounts.principalId, principalId));
    }
  });
}

export type PlanView = {
  credits: number;
  free_remaining: number;
  free_quota: number;
  free_used: number;
  free_period_end: string | null;
  subscription_credits: number;
  on_demand: number;
  feature_org: boolean;
  in_grace: boolean;
  subscription_plan_id: string | null;
  subscription_period_end: string | null;
  subscription_grace_until: string | null;
  org_frozen_at: string | null;
  gate: boolean;
};

export async function loadPlanView(principalId: string, personal = true): Promise<PlanView> {
  const account = await ensureBillingAccount(principalId, { personal });
  const breakdown = await creditBreakdown(principalId, personal);
  return {
    credits: breakdown.available,
    free_remaining: breakdown.free_remaining,
    free_quota: breakdown.free_quota,
    free_used: breakdown.free_used,
    free_period_end: breakdown.free_period_end,
    subscription_credits: breakdown.subscription_credits,
    on_demand: breakdown.on_demand,
    feature_org: breakdown.feature_org,
    in_grace: breakdown.in_grace,
    subscription_plan_id: account.subscriptionPlanId,
    subscription_period_end: account.subscriptionPeriodEnd?.toISOString() ?? null,
    subscription_grace_until: account.subscriptionGraceUntil?.toISOString() ?? null,
    org_frozen_at: account.orgFrozenAt?.toISOString() ?? null,
    gate: billingGateEnabled(),
  };
}

/** Personal house may create/keep org when feature_org is live (active or grace). */
export async function assertFeatureOrg(principalId: string): Promise<void> {
  const account = await ensureBillingAccount(principalId, { personal: true });
  if (!account.featureOrg) {
    throw new ProtocolError(
      "payment_required",
      "Organization requires an active Pro subscription or voucher",
      402,
    );
  }
}
