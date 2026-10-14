import { and, eq, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { billingAccounts, billingLedger, houseMembers, principals } from "@/lib/db/schema";
import { getDb } from "@/lib/db";
import { mintToken } from "@/lib/protocol/keys";
import { ProtocolError } from "@/lib/protocol/errors";
import { isOrgHouse } from "@/lib/protocol/types";
import { sendMail } from "@/lib/notify/mail";
import { addMonthsClamp } from "./calendar";
import { ensureBillingSchema } from "./ensure";
import { ensureBillingAccount } from "./account";

/** Frozen org data is kept this long, then cascade-deleted. */
export const ORG_FREEZE_MONTHS = 6;
/** Pre-expiry and pre-sweep mail lead time. */
export const BILLING_PRE_MAIL_MS = 3 * 24 * 60 * 60 * 1000;

export function orgSweepAt(frozenAt: Date): Date {
  return addMonthsClamp(frozenAt, ORG_FREEZE_MONTHS);
}

/** Mark personal account: orgs under this subscription are frozen. */
export async function freezeOrgsForPersonal(principalId: string, now = new Date()): Promise<void> {
  await ensureBillingSchema();
  const db = getDb();
  const [row] = await db
    .select({ orgFrozenAt: billingAccounts.orgFrozenAt })
    .from(billingAccounts)
    .where(eq(billingAccounts.principalId, principalId))
    .limit(1);
  await db
    .update(billingAccounts)
    .set({
      featureOrg: false,
      orgFrozenAt: row?.orgFrozenAt ?? now,
      updatedAt: now,
    })
    .where(eq(billingAccounts.principalId, principalId));
}

/** Owner's personal house for an org, or null. */
export async function personalHouseForOrg(orgPrincipalId: string): Promise<string | null> {
  const db = getDb();
  const [owner] = await db
    .select({ userId: houseMembers.userId })
    .from(houseMembers)
    .where(and(eq(houseMembers.principalId, orgPrincipalId), eq(houseMembers.role, "owner")))
    .limit(1);
  if (!owner) return null;
  const [personal] = await db
    .select({ id: principals.id })
    .from(principals)
    .where(and(eq(principals.ownerUserId, owner.userId), eq(principals.type, "personal")))
    .limit(1);
  return personal?.id ?? null;
}

/**
 * Org cabinet / agents are blocked while the owner's Pro is gone (frozen or never entitled).
 * Stamps orgFrozenAt on first block so the 6-month sweep clock starts.
 */
export async function assertOrgNotFrozen(orgPrincipalId: string): Promise<void> {
  const personalId = await personalHouseForOrg(orgPrincipalId);
  if (!personalId) {
    throw new ProtocolError("forbidden", "Organization is not available", 403);
  }
  const account = await ensureBillingAccount(personalId, { personal: true });
  if (account.featureOrg) return;
  if (!account.orgFrozenAt) {
    await freezeOrgsForPersonal(personalId);
  }
  throw new ProtocolError(
    "forbidden",
    "Organization is frozen — renew Pro on the personal Plan tab to reopen it",
    403,
  );
}

export async function listOwnedOrgIds(userId: string): Promise<string[]> {
  const db = getDb();
  const rows = await db
    .select({ id: principals.id })
    .from(houseMembers)
    .innerJoin(principals, eq(principals.id, houseMembers.principalId))
    .where(
      and(
        eq(houseMembers.userId, userId),
        eq(houseMembers.role, "owner"),
        eq(principals.type, "org"),
        isNull(principals.ownerUserId),
      ),
    );
  return rows.map((row) => row.id);
}

/** Delete orgs frozen for ORG_FREEZE_MONTHS. Idempotent. */
export async function sweepExpiredFrozenOrgs(now = new Date()): Promise<{ deleted: number }> {
  await ensureBillingSchema();
  const db = getDb();
  const frozen = await db
    .select({
      principalId: billingAccounts.principalId,
      orgFrozenAt: billingAccounts.orgFrozenAt,
      ownerUserId: principals.ownerUserId,
    })
    .from(billingAccounts)
    .innerJoin(principals, eq(principals.id, billingAccounts.principalId))
    .where(and(isNotNull(billingAccounts.orgFrozenAt), eq(principals.type, "personal")));

  let deleted = 0;
  for (const row of frozen) {
    if (!row.orgFrozenAt || !row.ownerUserId) continue;
    const due = orgSweepAt(row.orgFrozenAt);
    if (due > now) continue;
    const orgIds = await listOwnedOrgIds(row.ownerUserId);
    const { deleteHouse } = await import("@/lib/protocol/admin");
    for (const id of orgIds) {
      await deleteHouse(id);
      deleted += 1;
    }
    await db
      .update(billingAccounts)
      .set({ orgFrozenAt: null, updatedAt: now })
      .where(eq(billingAccounts.principalId, row.principalId));
  }
  return { deleted };
}

async function claimMail(idempotencyKey: string, principalId: string, note: string): Promise<boolean> {
  await ensureBillingSchema();
  const db = getDb();
  try {
    await db.insert(billingLedger).values({
      id: mintToken("bld"),
      principalId,
      delta: 0,
      reason: "billing_mail",
      provider: "foyer",
      idempotencyKey,
      note,
    });
    return true;
  } catch {
    return false;
  }
}

async function ownerVerifiedEmail(personalPrincipalId: string): Promise<{ email: string; locale: string } | null> {
  const db = getDb();
  const [row] = await db
    .select({
      email: principals.contactEmail,
      verifiedAt: principals.emailVerifiedAt,
      locale: principals.contactLocale,
    })
    .from(principals)
    .where(eq(principals.id, personalPrincipalId))
    .limit(1);
  if (!row?.email || !row.verifiedAt) return null;
  return { email: row.email, locale: row.locale || "en" };
}

/** 3 days before period_end — once per period. */
export async function sendPreExpiryMails(now = new Date()): Promise<number> {
  await ensureBillingSchema();
  const db = getDb();
  const windowEnd = new Date(now.getTime() + BILLING_PRE_MAIL_MS);
  const rows = await db
    .select({
      principalId: billingAccounts.principalId,
      periodEnd: billingAccounts.subscriptionPeriodEnd,
    })
    .from(billingAccounts)
    .innerJoin(principals, eq(principals.id, billingAccounts.principalId))
    .where(
      and(
        eq(principals.type, "personal"),
        eq(billingAccounts.featureOrg, true),
        isNotNull(billingAccounts.subscriptionPeriodEnd),
        lte(billingAccounts.subscriptionPeriodEnd, windowEnd),
        sql`${billingAccounts.subscriptionPeriodEnd} > ${now}`,
      ),
    );

  let sent = 0;
  for (const row of rows) {
    if (!row.periodEnd) continue;
    const key = `pre_expiry:${row.principalId}:${row.periodEnd.toISOString()}`;
    if (!(await claimMail(key, row.principalId, "Pre-expiry notice"))) continue;
    const contact = await ownerVerifiedEmail(row.principalId);
    if (!contact) continue;
    try {
      await sendMail({
        to: contact.email,
        subject: "Foyer: your Pro subscription ends soon",
        text: [
          "Your Foyer Pro period ends in about three days.",
          "",
          `Period end: ${row.periodEnd.toISOString()}`,
          "",
          "Renew (redeem a Pro code on the Plan tab) to keep organization access and roll unused subscription courts.",
          "After the period ends you get a short grace window; then leftover subscription credits burn and the organization freezes.",
        ].join("\n"),
      });
      sent += 1;
    } catch (error) {
      console.error("[billing-mail] pre-expiry failed", row.principalId, error);
    }
  }
  return sent;
}

/** 3 days before cascade delete of frozen orgs — once per freeze episode. */
export async function sendPreSweepMails(now = new Date()): Promise<number> {
  await ensureBillingSchema();
  const db = getDb();
  const rows = await db
    .select({
      principalId: billingAccounts.principalId,
      orgFrozenAt: billingAccounts.orgFrozenAt,
      ownerUserId: principals.ownerUserId,
    })
    .from(billingAccounts)
    .innerJoin(principals, eq(principals.id, billingAccounts.principalId))
    .where(and(isNotNull(billingAccounts.orgFrozenAt), eq(principals.type, "personal")));

  let sent = 0;
  for (const row of rows) {
    if (!row.orgFrozenAt || !row.ownerUserId) continue;
    const sweepAt = orgSweepAt(row.orgFrozenAt);
    const mailFrom = new Date(sweepAt.getTime() - BILLING_PRE_MAIL_MS);
    if (now < mailFrom || now >= sweepAt) continue;
    const orgs = await listOwnedOrgIds(row.ownerUserId);
    if (orgs.length === 0) continue;
    const key = `pre_sweep:${row.principalId}:${row.orgFrozenAt.toISOString()}`;
    if (!(await claimMail(key, row.principalId, "Pre-sweep notice"))) continue;
    const contact = await ownerVerifiedEmail(row.principalId);
    if (!contact) continue;
    try {
      await sendMail({
        to: contact.email,
        subject: "Foyer: frozen organization will be deleted soon",
        text: [
          "Your organization has been frozen because Pro lapsed.",
          "",
          `Scheduled delete: ${sweepAt.toISOString()}`,
          `Organizations: ${orgs.length}`,
          "",
          "Redeem a Pro code on the personal Plan tab before that date to unfreeze and keep the same organization.",
          "After the deadline the organization is permanently deleted (same as an ops delete).",
        ].join("\n"),
      });
      sent += 1;
    } catch (error) {
      console.error("[billing-mail] pre-sweep failed", row.principalId, error);
    }
  }
  return sent;
}

/** Tick hook: mails + 6-month org cascade. */
export async function runBillingLifecycle(now = new Date()): Promise<{
  pre_expiry: number;
  pre_sweep: number;
  orgs_deleted: number;
}> {
  const pre_expiry = await sendPreExpiryMails(now).catch(() => 0);
  const pre_sweep = await sendPreSweepMails(now).catch(() => 0);
  const { deleted } = await sweepExpiredFrozenOrgs(now).catch(() => ({ deleted: 0 }));
  return { pre_expiry, pre_sweep, orgs_deleted: deleted };
}

export function isOrgPrincipal(row: { type: string; ownerUserId: string | null }): boolean {
  return isOrgHouse(row);
}
