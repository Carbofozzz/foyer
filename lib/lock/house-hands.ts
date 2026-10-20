import { eq, sql } from "drizzle-orm";
import { principals } from "@/lib/db/schema";
import { getDb } from "@/lib/db";
import { DEFAULT_LOCK_HANDS, enabledLockHands, type PilotHand } from "./hands";

let ready = false;

export async function ensureLockHandsColumn(): Promise<void> {
  if (ready) return;
  const db = getDb();
  await db.execute(
    sql`ALTER TABLE principals ADD COLUMN IF NOT EXISTS lock_hands jsonb NOT NULL DEFAULT '["git.push","pay.x402"]'::jsonb`,
  );
  ready = true;
}

export async function lockHandsFor(principalId: string): Promise<PilotHand[]> {
  await ensureLockHandsColumn();
  const [row] = await getDb()
    .select({ lockHands: principals.lockHands })
    .from(principals)
    .where(eq(principals.id, principalId))
    .limit(1);
  return enabledLockHands(row?.lockHands ?? [...DEFAULT_LOCK_HANDS]);
}

export async function saveLockHands(principalId: string, hands: PilotHand[]): Promise<PilotHand[]> {
  await ensureLockHandsColumn();
  const next = enabledLockHands(hands);
  await getDb().update(principals).set({ lockHands: next }).where(eq(principals.id, principalId));
  return next;
}
