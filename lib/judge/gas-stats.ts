import { desc, sql } from "drizzle-orm";
import { courtGasStats } from "@/lib/db/schema";
import { getDb } from "@/lib/db";
import { mintToken } from "@/lib/protocol/keys";

export type CourtGasKind = "deploy" | "judge" | "resubmit";

let ready: Promise<void> | null = null;

export async function ensureCourtGasSchema(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      const db = getDb();
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS court_gas_stats (
          id text PRIMARY KEY,
          case_id text,
          tx text,
          kind text NOT NULL,
          estimated_wei text NOT NULL DEFAULT '0',
          actual_wei text,
          balance_before_wei text,
          balance_after_wei text,
          created_at timestamptz NOT NULL DEFAULT now()
        )
      `);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS court_gas_stats_case ON court_gas_stats (case_id)`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS court_gas_stats_created ON court_gas_stats (created_at)`);
      await db.execute(sql`ALTER TABLE billing_ledger ADD COLUMN IF NOT EXISTS gen_cost_wei text`);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS platform_wallet_state (
          id text PRIMARY KEY,
          low_alert_latched boolean NOT NULL DEFAULT false,
          low_alert_at timestamptz,
          floor_wei text,
          alert_wei text,
          updated_at timestamptz NOT NULL DEFAULT now()
        )
      `);
      await db.execute(sql`ALTER TABLE platform_wallet_state ADD COLUMN IF NOT EXISTS floor_wei text`);
      await db.execute(sql`ALTER TABLE platform_wallet_state ADD COLUMN IF NOT EXISTS alert_wei text`);
    })().catch((error) => {
      ready = null;
      throw error;
    });
  }
  await ready;
}

export async function recordCourtGas(input: {
  caseId?: string | null;
  tx: string | null;
  kind: CourtGasKind;
  estimatedWei: bigint;
  balanceBeforeWei?: bigint | null;
  balanceAfterWei?: bigint | null;
  actualWei?: bigint | null;
}): Promise<string> {
  await ensureCourtGasSchema();
  const id = mintToken("cgs");
  const db = getDb();
  await db.insert(courtGasStats).values({
    id,
    caseId: input.caseId ?? null,
    tx: input.tx,
    kind: input.kind,
    estimatedWei: input.estimatedWei.toString(),
    actualWei: input.actualWei != null ? input.actualWei.toString() : null,
    balanceBeforeWei: input.balanceBeforeWei != null ? input.balanceBeforeWei.toString() : null,
    balanceAfterWei: input.balanceAfterWei != null ? input.balanceAfterWei.toString() : null,
  });
  return id;
}

export type CourtGasRowView = {
  id: string;
  case_id: string | null;
  tx: string | null;
  kind: string;
  estimated_wei: string;
  actual_wei: string | null;
  created_at: string;
};

export type CourtGasSummary = {
  rows: CourtGasRowView[];
  count: number;
  sum_estimated_wei: string;
  p50_estimated_wei: string | null;
  p95_estimated_wei: string | null;
};

export async function loadCourtGasSummary(limit = 40): Promise<CourtGasSummary> {
  await ensureCourtGasSchema();
  const db = getDb();
  const rows = await db
    .select()
    .from(courtGasStats)
    .orderBy(desc(courtGasStats.createdAt))
    .limit(limit);

  const allEstimates = (
    await db.select({ estimatedWei: courtGasStats.estimatedWei }).from(courtGasStats)
  )
    .map((row) => BigInt(row.estimatedWei || "0"))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  let sum = BigInt(0);
  for (const value of allEstimates) sum += value;

  return {
    rows: rows.map((row) => ({
      id: row.id,
      case_id: row.caseId,
      tx: row.tx,
      kind: row.kind,
      estimated_wei: row.estimatedWei,
      actual_wei: row.actualWei,
      created_at: row.createdAt.toISOString(),
    })),
    count: allEstimates.length,
    sum_estimated_wei: sum.toString(),
    p50_estimated_wei: percentile(allEstimates, 0.5),
    p95_estimated_wei: percentile(allEstimates, 0.95),
  };
}

function percentile(sorted: bigint[], p: number): string | null {
  if (sorted.length === 0) return null;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1));
  return sorted[index]!.toString();
}

/** Attach estimated GEN cost onto the court debit ledger row when present. */
export async function stampLedgerGenCost(caseId: string, estimatedWei: bigint): Promise<void> {
  await ensureCourtGasSchema();
  const db = getDb();
  await db.execute(
    sql`update billing_ledger set gen_cost_wei = ${estimatedWei.toString()} where case_id = ${caseId} and gen_cost_wei is null`,
  );
}
