import { and, count, desc, eq, gte, lt } from "drizzle-orm";
import { cronTicks, rateBuckets, requestLogs } from "@/lib/db/schema";
import { getDb } from "@/lib/db";
import { mintToken } from "@/lib/protocol/keys";
import { cronIntervalSec } from "./client";

export async function recordTick(input: {
  startedAt: Date;
  houses: number;
  advanced: number;
  ok: boolean;
  error?: string;
}) {
  const db = getDb();
  await db.insert(cronTicks).values({
    id: mintToken("tck"),
    startedAt: input.startedAt,
    finishedAt: new Date(),
    houses: input.houses,
    advanced: input.advanced,
    ok: input.ok,
    error: input.error ?? null,
  });
  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const twoDays = new Date(Date.now() - 2 * 24 * 3600 * 1000);
  await db.delete(requestLogs).where(lt(requestLogs.createdAt, weekAgo));
  await db.delete(rateBuckets).where(lt(rateBuckets.windowStart, twoDays));
}

export async function lastTick() {
  const db = getDb();
  const [row] = await db.select().from(cronTicks).orderBy(desc(cronTicks.startedAt)).limit(1);
  return row ?? null;
}

export function tickIsStale(at: Date | null, now = new Date()): boolean {
  if (!at) return true;
  const interval = cronIntervalSec();
  const grace = Math.min(Math.floor(interval * 0.25), 3600);
  return now.getTime() - at.getTime() > (interval + grace) * 1000;
}

export async function recentWriteCounts() {
  const db = getDb();
  const hourAgo = new Date(Date.now() - 3600 * 1000);
  const [all] = await db
    .select({ n: count() })
    .from(requestLogs)
    .where(gte(requestLogs.createdAt, hourAgo));
  const [limited] = await db
    .select({ n: count() })
    .from(requestLogs)
    .where(and(gte(requestLogs.createdAt, hourAgo), eq(requestLogs.status, 429)));
  return { writes: Number(all?.n ?? 0), limited: Number(limited?.n ?? 0) };
}
