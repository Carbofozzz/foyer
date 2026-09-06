import { and, eq, lte } from "drizzle-orm";
import { actions, principals } from "@/lib/db/schema";
import { getDb } from "@/lib/db";
import { recordTimeoutAcks } from "./actions";
import { engagedIds, loadActionBundle } from "./bundle";
import { stepHouseCourt } from "./court";
import { executeAfterAck, executeSilenceAllow } from "./execute";
/**
 * Advances time for one house. Idempotent.
 * Test objections come from the cabinet test form, not phrase matchers.
 * Reads pass courts: 0. Only tick opens a court.
 */
export async function sweep(
  principalId: string,
  now: Date,
  options?: { courts?: number },
): Promise<{ advanced: number }> {
  const db = getDb();
  const [principal] = await db.select().from(principals).where(eq(principals.id, principalId)).limit(1);
  if (!principal) return { advanced: 0 };

  let advanced = 0;

  const openRows = await db
    .select()
    .from(actions)
    .where(and(eq(actions.principalId, principalId), eq(actions.status, "open"), lte(actions.silenceUntil, now)));

  // Reads never wait on GenLayer. Tick submits or polls one court tx.
  const courts = options?.courts ?? 0;

  for (const row of openRows) {
    const bundle = await loadActionBundle(row.id);
    if (!bundle || bundle.action.status !== "open") continue;
    if (bundle.objections.length === 0) {
      await executeSilenceAllow(bundle.action);
      advanced += 1;
    }
  }

  if (courts > 0 && (await stepHouseCourt(principal, now))) advanced += 1;

  const pending = await db
    .select()
    .from(actions)
    .where(and(eq(actions.principalId, principalId), eq(actions.status, "awaiting_ack")));

  for (const row of pending) {
    const bundle = await loadActionBundle(row.id);
    if (!bundle || bundle.action.status !== "awaiting_ack") continue;
    const engaged = engagedIds(
      bundle.action.proposerId,
      bundle.objections.map((item) => item.objectorId),
    );
    const acked = new Set(bundle.acks.map((item) => item.agentId));
    const missing = engaged.filter((id) => !acked.has(id));
    const timedOut = bundle.action.ackUntil !== null && bundle.action.ackUntil <= now;
    if (missing.length === 0 || timedOut) {
      if (missing.length > 0) await recordTimeoutAcks(row.id, missing);
      await executeAfterAck(row.id);
      advanced += 1;
    }
  }

  return { advanced };
}

export { findHouseNeedingCourt } from "./court";
