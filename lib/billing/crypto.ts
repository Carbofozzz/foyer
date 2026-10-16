import { and, eq, isNull } from "drizzle-orm";
import { billingCheckouts, billingPlans } from "@/lib/db/schema";
import { getDb } from "@/lib/db";
import { formatGen } from "@/lib/gen/amount";
import { asHexAddress } from "@/lib/gen/chain";
import { readNativeTransfer } from "@/lib/judge/onchain";
import { platformWallet, platformWalletConfigured } from "@/lib/judge/platform-wallet";
import { mintToken } from "@/lib/protocol/keys";
import { ProtocolError } from "@/lib/protocol/errors";
import { activateSubscription, ensureBillingAccount, grantCredits } from "./account";
import { ensureBillingSchema } from "./ensure";
import { ensureDefaultPlans, getPlanByCode, getPlanById, listActivePlans, PLAN_PRO } from "./plans";

const CHECKOUT_TTL_MS = 60 * 60 * 1000; // 1 hour
const PRO_DURATION_SEC =
  Number(process.env.FOYER_PRO_DURATION_DAYS ?? 30) * 24 * 60 * 60 || 30 * 24 * 60 * 60;

function cryptoForcedOff(): boolean {
  const raw = (process.env.FOYER_CRYPTO ?? "").trim().toLowerCase();
  return raw === "off" || raw === "0" || raw === "false";
}

function cryptoForcedOn(): boolean {
  const raw = (process.env.FOYER_CRYPTO ?? "").trim().toLowerCase();
  return raw === "on" || raw === "1" || raw === "true";
}

export type CryptoOffer = {
  plan_id: string;
  code: string;
  kind: string;
  label: string;
  credits: number;
  amount_wei: string;
  amount_gen: string;
  feature_org: boolean;
};

export type CryptoCatalog = {
  enabled: boolean;
  pay_to: string | null;
  offers: CryptoOffer[];
};

function planPriceWei(row: typeof billingPlans.$inferSelect): bigint {
  const raw = (row.priceWei ?? "0").trim();
  if (!/^\d+$/.test(raw)) return BigInt(0);
  try {
    return BigInt(raw);
  } catch {
    return BigInt(0);
  }
}

/** Parse wei integer or decimal GEN into a wei decimal string. */
export function parsePriceWeiEnv(name: string, fallback = "0"): string {
  const raw = (process.env[name] ?? fallback).trim();
  if (!raw) return "0";
  if (/^\d+$/.test(raw)) return raw;
  try {
    const [whole, frac = ""] = raw.split(".");
    const padded = (frac + "000000000000000000").slice(0, 18);
    return (BigInt(whole || "0") * BigInt(10) ** BigInt(18) + BigInt(padded || "0")).toString();
  } catch {
    return "0";
  }
}

/** Fill zero plan prices from env once — ops DB edits win afterward. */
export async function syncPlanCryptoPricesFromEnv(): Promise<void> {
  await ensureDefaultPlans();
  const db = getDb();
  const map: Record<string, string> = {
    [PLAN_PRO]: parsePriceWeiEnv("FOYER_PRO_PRICE_WEI"),
    pack_5: parsePriceWeiEnv("FOYER_PACK5_PRICE_WEI"),
    pack_20: parsePriceWeiEnv("FOYER_PACK20_PRICE_WEI"),
  };
  for (const [code, wei] of Object.entries(map)) {
    if (wei === "0") continue;
    const plan = await getPlanByCode(code);
    if (!plan) continue;
    if (plan.priceWei && plan.priceWei !== "0") continue;
    await db.update(billingPlans).set({ priceWei: wei }).where(eq(billingPlans.id, plan.id));
  }
}

/** Crypto checkout is on when platform wallet exists and at least one paid GEN offer is set. */
export async function loadCryptoCatalog(): Promise<CryptoCatalog> {
  await syncPlanCryptoPricesFromEnv();
  if (cryptoForcedOff() || !platformWalletConfigured()) {
    return { enabled: false, pay_to: null, offers: [] };
  }
  const wallet = platformWallet();
  const plans = await listActivePlans();
  const offers: CryptoOffer[] = [];
  for (const plan of plans) {
    if (plan.kind === "free") continue;
    const wei = planPriceWei(plan);
    if (wei <= BigInt(0)) continue;
    offers.push({
      plan_id: plan.id,
      code: plan.code,
      kind: plan.kind,
      label: plan.label,
      credits: plan.credits,
      amount_wei: wei.toString(),
      amount_gen: formatGen(wei),
      feature_org: plan.featureOrg,
    });
  }
  const enabled = (cryptoForcedOn() || offers.length > 0) && Boolean(wallet);
  return {
    enabled,
    pay_to: wallet?.address ?? null,
    offers: enabled ? offers : [],
  };
}

export async function createCryptoCheckout(input: {
  principalId: string;
  planCode: string;
  userId?: string | null;
}): Promise<{
  checkout_id: string;
  pay_to: string;
  amount_wei: string;
  amount_gen: string;
  plan_code: string;
  label: string;
  expires_at: string;
}> {
  const catalog = await loadCryptoCatalog();
  if (!catalog.enabled || !catalog.pay_to) {
    throw new ProtocolError("bad_request", "Crypto checkout is not available", 400);
  }
  const offer = catalog.offers.find((row) => row.code === input.planCode.trim());
  if (!offer) throw new ProtocolError("bad_request", "Unknown or unpaid plan for GEN", 400);

  await ensureBillingAccount(input.principalId);
  await ensureBillingSchema();
  const id = mintToken("bco");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + CHECKOUT_TTL_MS);
  const db = getDb();
  await db.insert(billingCheckouts).values({
    id,
    principalId: input.principalId,
    planId: offer.plan_id,
    userId: input.userId ?? null,
    amountWei: offer.amount_wei,
    payTo: catalog.pay_to,
    status: "pending",
    expiresAt,
  });
  return {
    checkout_id: id,
    pay_to: catalog.pay_to,
    amount_wei: offer.amount_wei,
    amount_gen: offer.amount_gen,
    plan_code: offer.code,
    label: offer.label,
    expires_at: expiresAt.toISOString(),
  };
}

/**
 * Verify a native GEN transfer to the platform wallet and grant the checkout plan.
 * Replay-safe: same tx / checkout cannot grant twice.
 */
export async function confirmCryptoCheckout(input: {
  principalId: string;
  checkoutId: string;
  tx: string;
}): Promise<{ credits_granted: number; kind: string; feature_org: boolean }> {
  const txHash = input.tx.trim();
  if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
    throw new ProtocolError("bad_request", "tx must be a 0x hash", 400);
  }
  await ensureBillingSchema();
  const db = getDb();
  const [checkout] = await db
    .select()
    .from(billingCheckouts)
    .where(and(eq(billingCheckouts.id, input.checkoutId.trim()), eq(billingCheckouts.principalId, input.principalId)))
    .limit(1);
  if (!checkout) throw new ProtocolError("not_found", "Unknown checkout", 404);
  if (checkout.status === "paid") {
    const plan = await getPlanById(checkout.planId);
    return {
      credits_granted: plan?.credits ?? 0,
      kind: plan?.kind ?? "pack",
      feature_org: Boolean(plan?.featureOrg),
    };
  }
  if (checkout.status !== "pending") {
    throw new ProtocolError("conflict", "Checkout is no longer pending", 409);
  }
  if (checkout.expiresAt <= new Date()) {
    await db
      .update(billingCheckouts)
      .set({ status: "expired" })
      .where(and(eq(billingCheckouts.id, checkout.id), eq(billingCheckouts.status, "pending")));
    throw new ProtocolError("conflict", "Checkout expired — create a new one", 409);
  }

  const [taken] = await db
    .select({ id: billingCheckouts.id })
    .from(billingCheckouts)
    .where(eq(billingCheckouts.tx, txHash))
    .limit(1);
  if (taken && taken.id !== checkout.id) {
    throw new ProtocolError("conflict", "This transaction was already used", 409);
  }

  const transfer = await readNativeTransfer(txHash);
  if (!transfer) throw new ProtocolError("unavailable", "Could not read that transaction yet", 503);
  if (transfer.phase === "pending") {
    throw new ProtocolError("conflict", "Transaction is not finalized yet — try again shortly", 409);
  }
  if (transfer.phase === "failed") {
    throw new ProtocolError("bad_request", "Transaction failed on chain", 400);
  }

  const payTo = asHexAddress(checkout.payTo);
  const to = transfer.to ? asHexAddress(transfer.to) : null;
  if (!payTo || !to || to.toLowerCase() !== payTo.toLowerCase()) {
    throw new ProtocolError("bad_request", "Transfer must go to the Foyer platform address", 400);
  }
  const expected = BigInt(checkout.amountWei);
  if (transfer.valueWei < expected) {
    throw new ProtocolError(
      "bad_request",
      `Transfer value too low — need at least ${formatGen(expected)} GEN`,
      400,
    );
  }

  let claimed: (typeof billingCheckouts.$inferSelect)[];
  try {
    claimed = await db
      .update(billingCheckouts)
      .set({ status: "paid", tx: txHash, paidAt: new Date() })
      .where(
        and(eq(billingCheckouts.id, checkout.id), eq(billingCheckouts.status, "pending"), isNull(billingCheckouts.tx)),
      )
      .returning();
  } catch {
    throw new ProtocolError("conflict", "This transaction was already used", 409);
  }
  if (!claimed[0]) {
    const [again] = await db.select().from(billingCheckouts).where(eq(billingCheckouts.id, checkout.id)).limit(1);
    if (again?.status === "paid") {
      const plan = await getPlanById(checkout.planId);
      return {
        credits_granted: plan?.credits ?? 0,
        kind: plan?.kind ?? "pack",
        feature_org: Boolean(plan?.featureOrg),
      };
    }
    throw new ProtocolError("conflict", "Checkout could not be claimed", 409);
  }

  const plan = await getPlanById(checkout.planId);
  if (!plan) throw new ProtocolError("internal", "Plan missing for checkout", 500);

  const idempotencyKey = `crypto:${checkout.id}`;
  if (plan.kind === "subscription" || plan.code === PLAN_PRO) {
    await activateSubscription(input.principalId, plan.id, plan.credits, {
      durationSec: PRO_DURATION_SEC,
      idempotencyKey,
      provider: "crypto",
    });
  } else {
    await grantCredits({
      principalId: input.principalId,
      credits: plan.credits,
      reason: "grant_crypto",
      provider: "crypto",
      idempotencyKey,
      externalId: txHash,
      note: `Crypto pack ${plan.code}`,
    });
  }

  return {
    credits_granted: plan.credits,
    kind: plan.kind,
    feature_org: plan.featureOrg,
  };
}
