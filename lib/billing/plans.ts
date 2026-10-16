import { asc, eq } from "drizzle-orm";
import { billingPlans } from "@/lib/db/schema";
import { getDb } from "@/lib/db";
import { ensureBillingSchema } from "./ensure";

export const PLAN_FREE = "free";
export const PLAN_PRO = "pro";

const DEFAULTS: Array<typeof billingPlans.$inferInsert> = [
  {
    id: "bpl_free",
    code: PLAN_FREE,
    kind: "free",
    label: "Free",
    credits: Number(process.env.FOYER_FREE_COURTS ?? 3) || 3,
    priceCents: 0,
    currency: "usd",
    priceWei: "0",
    featureOrg: false,
    rollover: false,
    active: true,
    sortOrder: 10,
  },
  {
    id: "bpl_pro",
    code: PLAN_PRO,
    kind: "subscription",
    label: "Pro",
    credits: Number(process.env.FOYER_PRO_COURTS ?? 20) || 20,
    priceCents: Number(process.env.FOYER_PRO_PRICE_CENTS ?? 0) || 0,
    currency: "usd",
    priceWei: "0",
    featureOrg: true,
    rollover: true,
    active: true,
    sortOrder: 20,
  },
  {
    id: "bpl_pack_5",
    code: "pack_5",
    kind: "pack",
    label: "5 courts",
    credits: 5,
    priceCents: Number(process.env.FOYER_PACK5_PRICE_CENTS ?? 0) || 0,
    currency: "usd",
    priceWei: "0",
    featureOrg: false,
    rollover: false,
    active: true,
    sortOrder: 30,
  },
  {
    id: "bpl_pack_20",
    code: "pack_20",
    kind: "pack",
    label: "20 courts",
    credits: 20,
    priceCents: Number(process.env.FOYER_PACK20_PRICE_CENTS ?? 0) || 0,
    currency: "usd",
    priceWei: "0",
    featureOrg: false,
    rollover: false,
    active: true,
    sortOrder: 40,
  },
];

/** Idempotent seed of Free / Pro / packs. Ops can update rows in DB later. */
export async function ensureDefaultPlans(): Promise<void> {
  await ensureBillingSchema();
  const db = getDb();
  for (const plan of DEFAULTS) {
    await db.insert(billingPlans).values(plan).onConflictDoNothing({ target: billingPlans.id });
  }
}

export async function getPlanByCode(code: string) {
  await ensureDefaultPlans();
  const db = getDb();
  const [row] = await db.select().from(billingPlans).where(eq(billingPlans.code, code)).limit(1);
  return row ?? null;
}

export async function getPlanById(id: string) {
  await ensureDefaultPlans();
  const db = getDb();
  const [row] = await db.select().from(billingPlans).where(eq(billingPlans.id, id)).limit(1);
  return row ?? null;
}

export async function listActivePlans() {
  await ensureDefaultPlans();
  const db = getDb();
  return db
    .select()
    .from(billingPlans)
    .where(eq(billingPlans.active, true))
    .orderBy(asc(billingPlans.sortOrder));
}

export function serializePlan(row: typeof billingPlans.$inferSelect) {
  const priceWei = (row.priceWei ?? "0").trim() || "0";
  return {
    id: row.id,
    code: row.code,
    kind: row.kind,
    label: row.label,
    credits: row.credits,
    price_cents: row.priceCents,
    currency: row.currency,
    price_wei: priceWei,
    feature_org: row.featureOrg,
    rollover: row.rollover,
  };
}
