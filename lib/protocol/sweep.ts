import { and, eq, isNotNull, lte } from "drizzle-orm";
import { actions, agents, principals } from "@/lib/db/schema";
import { getDb } from "@/lib/db";
import { decideBudgetTurn } from "@/agents/budget";
import { fileObjection, recordTimeoutAcks } from "./actions";
import { actionEvidence, actionPayload, engagedIds, loadActionBundle, type HouseAuth } from "./bundle";
import { openCourt } from "./court";
import { executeAfterAck, executeSilenceAllow } from "./execute";
/**
 * Advances time for one house. Idempotent.
 * Guardian runs first so a late tick can still object before silence closes.
 */
export async function sweep(principalId: string, now: Date): Promise<{ advanced: number }> {
  const db = getDb();
  const [principal] = await db.select().from(principals).where(eq(principals.id, principalId)).limit(1);
  if (!principal) return { advanced: 0 };

  let advanced = 0;
  advanced += await runGuardians(principalId, principal, now);

  const openRows = await db
    .select()
    .from(actions)
    .where(and(eq(actions.principalId, principalId), eq(actions.status, "open"), lte(actions.silenceUntil, now)));

  for (const row of openRows) {
    const bundle = await loadActionBundle(row.id);
    if (!bundle || bundle.action.status !== "open") continue;
    if (bundle.objections.length === 0) {
      await executeSilenceAllow(bundle.action);
    } else {
      await openCourt(bundle.action, principal, now);
    }
    advanced += 1;
  }

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

async function runGuardians(
  principalId: string,
  principal: typeof principals.$inferSelect,
  now: Date,
): Promise<number> {
  const db = getDb();
  const guardians = await db
    .select()
    .from(agents)
    .where(and(eq(agents.principalId, principalId), eq(agents.isGuardian, true), isNotNull(agents.sealedKey)));

  let advanced = 0;
  const openRows = await db
    .select()
    .from(actions)
    .where(and(eq(actions.principalId, principalId), eq(actions.status, "open")));

  for (const guardian of guardians) {
    const items = [];
    for (const row of openRows) {
      const bundle = await loadActionBundle(row.id);
      if (!bundle) continue;
      items.push({
        id: row.id,
        proposerId: row.proposerId,
        kind: row.kind,
        payload: actionPayload(row),
        evidence: actionEvidence(row),
        status: row.status,
        alreadyObjected: bundle.objections.some((item) => item.objectorId === guardian.id),
      });
    }
    const drafts = decideBudgetTurn({
      constitution: principal.constitution,
      selfId: guardian.id,
      items,
    });
    const auth: HouseAuth = { agent: guardian, principal };
    for (const draft of drafts) {
      try {
        await fileObjection(
          auth,
          draft.actionId,
          {
            justification: draft.justification,
            evidence: draft.evidence,
            bond: draft.bond,
            counter_action: draft.counter_action,
          },
          now,
        );
        advanced += 1;
      } catch {
        // Already objected or window closed — sweep stays idempotent.
      }
    }
  }
  return advanced;
}
