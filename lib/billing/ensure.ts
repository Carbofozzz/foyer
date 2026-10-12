import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";

let ready: Promise<void> | null = null;

/** Create billing tables if drizzle push has not run yet (serverless-safe). */
export async function ensureBillingSchema(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      const db = getDb();
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS billing_plans (
          id text PRIMARY KEY,
          code text NOT NULL UNIQUE,
          kind text NOT NULL,
          label text NOT NULL,
          credits integer NOT NULL DEFAULT 0,
          price_cents integer NOT NULL DEFAULT 0,
          currency text NOT NULL DEFAULT 'usd',
          feature_org boolean NOT NULL DEFAULT false,
          rollover boolean NOT NULL DEFAULT false,
          active boolean NOT NULL DEFAULT true,
          sort_order integer NOT NULL DEFAULT 0,
          created_at timestamptz NOT NULL DEFAULT now()
        )
      `);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS billing_accounts (
          principal_id text PRIMARY KEY REFERENCES principals(id),
          credit_balance integer NOT NULL DEFAULT 0,
          subscription_credits integer NOT NULL DEFAULT 0,
          free_anchor_at timestamptz,
          free_used_in_period integer NOT NULL DEFAULT 0,
          free_period_end timestamptz,
          subscription_plan_id text REFERENCES billing_plans(id),
          subscription_period_end timestamptz,
          subscription_grace_until timestamptz,
          feature_org boolean NOT NULL DEFAULT false,
          org_frozen_at timestamptz,
          updated_at timestamptz NOT NULL DEFAULT now(),
          created_at timestamptz NOT NULL DEFAULT now()
        )
      `);
      await db.execute(
        sql`ALTER TABLE billing_accounts ADD COLUMN IF NOT EXISTS subscription_credits integer NOT NULL DEFAULT 0`,
      );
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS billing_ledger (
          id text PRIMARY KEY,
          principal_id text NOT NULL REFERENCES principals(id),
          delta integer NOT NULL,
          reason text NOT NULL,
          provider text NOT NULL DEFAULT 'manual_admin',
          external_id text,
          idempotency_key text NOT NULL,
          case_id text,
          voucher_id text,
          note text,
          created_at timestamptz NOT NULL DEFAULT now()
        )
      `);
      await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS billing_ledger_idempotency ON billing_ledger (idempotency_key)`);
      await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS billing_ledger_case_debit ON billing_ledger (case_id)`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS billing_ledger_principal ON billing_ledger (principal_id)`);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS vouchers (
          id text PRIMARY KEY,
          code text NOT NULL UNIQUE,
          kind text NOT NULL,
          credits integer NOT NULL DEFAULT 0,
          plan_id text REFERENCES billing_plans(id),
          duration_sec integer,
          max_redemptions integer NOT NULL DEFAULT 1,
          redeemed_count integer NOT NULL DEFAULT 0,
          bound_email text,
          starts_at timestamptz,
          ends_at timestamptz,
          created_by text REFERENCES users(id),
          meta jsonb NOT NULL DEFAULT '{}'::jsonb,
          created_at timestamptz NOT NULL DEFAULT now()
        )
      `);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS vouchers_code ON vouchers (code)`);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS voucher_redemptions (
          id text PRIMARY KEY,
          voucher_id text NOT NULL REFERENCES vouchers(id),
          principal_id text NOT NULL REFERENCES principals(id),
          user_id text REFERENCES users(id),
          created_at timestamptz NOT NULL DEFAULT now()
        )
      `);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS voucher_redemptions_voucher ON voucher_redemptions (voucher_id)`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS voucher_redemptions_principal ON voucher_redemptions (principal_id)`);
    })().catch((error) => {
      ready = null;
      throw error;
    });
  }
  await ready;
}
