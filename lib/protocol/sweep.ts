import { and, eq, inArray, lte, ne } from "drizzle-orm";
import { actions, cases, notifications, principals, wakes } from "@/lib/db/schema";
import { getDb } from "@/lib/db";
import { recordTimeoutAcks } from "./actions";
import { enterBargain, timeoutBargains } from "./bargain";
import { engagedIds, loadActionBundle } from "./bundle";
import { stepHouseCourt, findHouseNeedingCourt } from "./court";
import { executeAfterAck, executeSilenceAllow } from "./execute";
import { defaultPublicOrigin } from "@/lib/mcp/config";
import { deliverPendingWakes, escalateUnreachable, requiredWakeGate } from "@/lib/notify/wake";
import { syncEscalateMail } from "@/lib/notify/outbox";

/**
 * Advances time for one house. Idempotent.
 * Test objections come from the cabinet test stage as house agents.
 * Reads pass courts: 0. Tick only polls an already submitted court.
 */
export async function sweep(
  principalId: string,
  now: Date,
  options?: { courts?: number; origin?: string; wakes?: boolean; outbox?: boolean },
): Promise<{ advanced: number }> {
  const db = getDb();
  const [principal] = await db.select().from(principals).where(eq(principals.id, principalId)).limit(1);
  if (!principal) return { advanced: 0 };

  let advanced = 0;
  const origin = options?.origin || defaultPublicOrigin();
  if (options?.wakes !== false) {
    advanced += await deliverPendingWakes(principalId, origin);
  }

  const openRows = await db
    .select()
    .from(actions)
    .where(and(eq(actions.principalId, principalId), eq(actions.status, "open"), lte(actions.silenceUntil, now)));

  const courts = options?.courts ?? 0;

  for (const row of openRows) {
    const bundle = await loadActionBundle(row.id);
    if (!bundle || bundle.action.status !== "open") continue;
    const gate = bundle.action.testPass ? "ready" : await requiredWakeGate(bundle.action.id, bundle.action.revision);
    if (gate === "pending") continue;
    if (gate === "failed") {
      await escalateUnreachable(principal, bundle.action.id, now);
      advanced += 1;
      continue;
    }
    if (bundle.objections.length === 0) {
      await executeSilenceAllow(bundle.action);
      advanced += 1;
    } else {
      await enterBargain(bundle.action.id, principal.silenceWindowSec, now);
      advanced += 1;
    }
  }

  advanced += await timeoutBargains(principal, now);

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

  if (options?.outbox !== false) {
    advanced += await syncEscalateMail(principalId, origin);
  }

  return { advanced };
}

const LIVE_STATUSES = ["open", "bargaining", "awaiting_ack", "escalated"] as const;

/** Houses with work for tick: live actions, pending wakes, unsent notify, or an open court. */
export async function findHousesNeedingSweep(): Promise<string[]> {
  const db = getDb();
  const ids = new Set<string>();
  const add = (rows: { id: string }[]) => {
    for (const row of rows) ids.add(row.id);
  };
  add(
    await db
      .selectDistinct({ id: actions.principalId })
      .from(actions)
      .where(inArray(actions.status, [...LIVE_STATUSES])),
  );
  add(
    await db
      .selectDistinct({ id: actions.principalId })
      .from(wakes)
      .innerJoin(actions, eq(wakes.actionId, actions.id))
      .where(eq(wakes.status, "pending")),
  );
  add(
    await db
      .selectDistinct({ id: actions.principalId })
      .from(notifications)
      .innerJoin(actions, eq(notifications.actionId, actions.id))
      .where(inArray(notifications.status, ["pending", "failed"])),
  );
  add(
    await db
      .selectDistinct({ id: actions.principalId })
      .from(cases)
      .innerJoin(actions, eq(cases.actionId, actions.id))
      .where(ne(cases.status, "judged")),
  );
  const court = await findHouseNeedingCourt(new Date());
  if (court) ids.add(court);
  return [...ids];
}

export async function houseNeedsSweep(principalId: string): Promise<boolean> {
  const db = getDb();
  const [live] = await db
    .select({ id: actions.id })
    .from(actions)
    .where(and(eq(actions.principalId, principalId), inArray(actions.status, [...LIVE_STATUSES])))
    .limit(1);
  if (live) return true;
  const [wake] = await db
    .select({ id: wakes.id })
    .from(wakes)
    .innerJoin(actions, eq(wakes.actionId, actions.id))
    .where(and(eq(actions.principalId, principalId), eq(wakes.status, "pending")))
    .limit(1);
  if (wake) return true;
  const [note] = await db
    .select({ id: notifications.id })
    .from(notifications)
    .innerJoin(actions, eq(notifications.actionId, actions.id))
    .where(and(eq(actions.principalId, principalId), inArray(notifications.status, ["pending", "failed"])))
    .limit(1);
  if (note) return true;
  const [court] = await db
    .select({ id: cases.id })
    .from(cases)
    .innerJoin(actions, eq(cases.actionId, actions.id))
    .where(and(eq(actions.principalId, principalId), ne(cases.status, "judged")))
    .limit(1);
  return Boolean(court);
}

/** Skip the heavy path when this house has nothing on the clock. */
export async function sweepIfBusy(
  principalId: string,
  now: Date,
  options?: { courts?: number; origin?: string; wakes?: boolean; outbox?: boolean },
): Promise<{ advanced: number }> {
  if (!(await houseNeedsSweep(principalId))) return { advanced: 0 };
  return sweep(principalId, now, options);
}

export { findHouseNeedingCourt } from "./court";
