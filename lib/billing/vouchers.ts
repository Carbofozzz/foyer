import { and, desc, eq, lt, sql } from "drizzle-orm";
import { voucherRedemptions, vouchers } from "@/lib/db/schema";
import { getDb } from "@/lib/db";
import { mintToken } from "@/lib/protocol/keys";
import { ProtocolError } from "@/lib/protocol/errors";
import { ensureBillingSchema } from "./ensure";
import { activateSubscription, ensureBillingAccount, grantCredits } from "./account";
import { getPlanByCode, getPlanById, PLAN_PRO } from "./plans";

export function normalizeVoucherCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

export type CreateVoucherInput = {
  code: string;
  kind: "credits" | "subscription" | "feature_org" | "bundle";
  credits?: number;
  planId?: string | null;
  durationSec?: number | null;
  maxRedemptions?: number;
  boundEmail?: string | null;
  startsAt?: Date | null;
  endsAt?: Date | null;
  createdBy?: string | null;
};

export async function createVoucher(input: CreateVoucherInput) {
  await ensureBillingSchema();
  const code = normalizeVoucherCode(input.code);
  if (!code || code.length > 64) throw new ProtocolError("bad_request", "code is invalid", 400);
  const credits = input.credits ?? 0;
  if (!Number.isInteger(credits) || credits < 0) {
    throw new ProtocolError("bad_request", "credits must be a non-negative integer", 400);
  }
  if (input.kind === "credits" && credits < 1) {
    throw new ProtocolError("bad_request", "credits voucher needs credits >= 1", 400);
  }
  if (input.kind === "subscription" && credits < 0) {
    throw new ProtocolError("bad_request", "credits must be non-negative", 400);
  }
  const maxRedemptions = input.maxRedemptions ?? 1;
  if (!Number.isInteger(maxRedemptions) || maxRedemptions < 1) {
    throw new ProtocolError("bad_request", "max_redemptions must be >= 1", 400);
  }
  const boundEmail = input.boundEmail?.trim().toLowerCase() || null;
  const db = getDb();
  try {
    const [row] = await db
      .insert(vouchers)
      .values({
        id: mintToken("vou"),
        code,
        kind: input.kind,
        credits,
        planId: input.planId ?? null,
        durationSec: input.durationSec ?? null,
        maxRedemptions,
        boundEmail,
        startsAt: input.startsAt ?? null,
        endsAt: input.endsAt ?? null,
        createdBy: input.createdBy ?? null,
      })
      .returning();
    return row;
  } catch {
    throw new ProtocolError("conflict", "That code already exists", 409);
  }
}

export async function revokeVoucher(codeRaw: string) {
  await ensureBillingSchema();
  const code = normalizeVoucherCode(codeRaw);
  const db = getDb();
  const [row] = await db
    .update(vouchers)
    .set({ endsAt: new Date() })
    .where(eq(vouchers.code, code))
    .returning();
  if (!row) throw new ProtocolError("not_found", "Unknown code", 404);
  return row;
}

export async function listVouchers(limit = 50) {
  await ensureBillingSchema();
  const db = getDb();
  return db.select().from(vouchers).orderBy(desc(vouchers.createdAt)).limit(Math.min(100, Math.max(1, limit)));
}

export type RedeemInput = {
  principalId: string;
  code: string;
  userId?: string | null;
  email?: string | null;
};

/** Redeem into the chosen house. Credits grant immediately; subscription fields land lightly for B1. */
export async function redeemVoucher(input: RedeemInput) {
  await ensureBillingSchema();
  const code = normalizeVoucherCode(input.code);
  if (!code) throw new ProtocolError("bad_request", "code is required", 400);
  await ensureBillingAccount(input.principalId);
  const db = getDb();
  const now = new Date();

  const [found] = await db.select().from(vouchers).where(eq(vouchers.code, code)).limit(1);
  if (!found) throw new ProtocolError("not_found", "Unknown code", 404);
  if (found.startsAt && found.startsAt > now) {
    throw new ProtocolError("conflict", "This code is not active yet", 409);
  }
  if (found.endsAt && found.endsAt <= now) {
    throw new ProtocolError("conflict", "This code has expired", 409);
  }
  if (found.redeemedCount >= found.maxRedemptions) {
    throw new ProtocolError("conflict", "This code has no redemptions left", 409);
  }
  if (found.boundEmail) {
    const email = input.email?.trim().toLowerCase() ?? "";
    if (!email || email !== found.boundEmail) {
      throw new ProtocolError("forbidden", "This code is bound to another email", 403);
    }
  }

  const result = await db.transaction(async (tx) => {
    const claimed = await tx
      .update(vouchers)
      .set({ redeemedCount: sql`${vouchers.redeemedCount} + 1` })
      .where(and(eq(vouchers.id, found.id), lt(vouchers.redeemedCount, found.maxRedemptions)))
      .returning();
    const voucher = claimed[0];
    if (!voucher) {
      throw new ProtocolError("conflict", "This code has no redemptions left", 409);
    }

    const redemptionId = mintToken("vrdm");
    await tx.insert(voucherRedemptions).values({
      id: redemptionId,
      voucherId: voucher.id,
      principalId: input.principalId,
      userId: input.userId ?? null,
    });

    return { voucher, redemptionId };
  });

  const { voucher, redemptionId } = result;
  let creditsGranted = 0;
  const isSub =
    voucher.kind === "subscription" || voucher.kind === "feature_org" || voucher.kind === "bundle";

  if (isSub) {
    const plan =
      (voucher.planId ? await getPlanById(voucher.planId) : null) ?? (await getPlanByCode(PLAN_PRO));
    if (!plan) throw new ProtocolError("internal", "Pro plan missing", 500);
    const subCredits = voucher.credits > 0 ? voucher.credits : plan.credits;
    await activateSubscription(input.principalId, plan.id, subCredits, {
      durationSec: voucher.durationSec,
      idempotencyKey: `voucher_sub:${redemptionId}`,
      voucherId: voucher.id,
    });
    creditsGranted = subCredits;
  }

  if (voucher.kind === "credits") {
    await grantCredits({
      principalId: input.principalId,
      credits: voucher.credits,
      reason: "grant_voucher",
      provider: "voucher",
      idempotencyKey: `voucher_redeem:${redemptionId}`,
      voucherId: voucher.id,
      note: `Redeem ${voucher.code}`,
    });
    creditsGranted = voucher.credits;
  }

  return {
    code: voucher.code,
    credits_granted: creditsGranted,
    kind: voucher.kind,
    feature_org: isSub,
  };
}

export function serializeVoucher(row: typeof vouchers.$inferSelect) {
  return {
    id: row.id,
    code: row.code,
    kind: row.kind,
    credits: row.credits,
    plan_id: row.planId,
    duration_sec: row.durationSec,
    max_redemptions: row.maxRedemptions,
    redeemed_count: row.redeemedCount,
    bound_email: row.boundEmail,
    starts_at: row.startsAt?.toISOString() ?? null,
    ends_at: row.endsAt?.toISOString() ?? null,
    created_at: row.createdAt.toISOString(),
  };
}
