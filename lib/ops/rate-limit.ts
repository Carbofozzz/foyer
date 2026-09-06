import { eq } from "drizzle-orm";
import { rateBuckets } from "@/lib/db/schema";
import { getDb } from "@/lib/db";
import { hashClient } from "./client";

export type RateLimit = { max: number; windowSec: number };

export const LIMITS = {
  waitlist: { max: 8, windowSec: 3600 },
  spawn: { max: 4, windowSec: 3600 },
  nonce: { max: 40, windowSec: 900 },
  verify: { max: 20, windowSec: 900 },
  propose: { max: 40, windowSec: 3600 },
  proposeAgent: { max: 20, windowSec: 3600 },
  object: { max: 40, windowSec: 3600 },
  report: { max: 40, windowSec: 3600 },
  enroll: { max: 20, windowSec: 3600 },
  mcp: { max: 80, windowSec: 3600 },
} as const satisfies Record<string, RateLimit>;

/** Returns true when the caller is over the limit. */
export async function overLimit(request: Request, route: string, limit: RateLimit): Promise<boolean> {
  return overLimitKey(`${route}:${hashClient(request)}`, limit);
}

/** Same bucket math, for a named key (agent id, not IP). */
export async function overLimitKey(key: string, limit: RateLimit): Promise<boolean> {
  const db = getDb();
  const now = new Date();
  const [row] = await db.select().from(rateBuckets).where(eq(rateBuckets.key, key)).limit(1);
  if (!row || now.getTime() - row.windowStart.getTime() >= limit.windowSec * 1000) {
    await db
      .insert(rateBuckets)
      .values({ key, count: 1, windowStart: now })
      .onConflictDoUpdate({
        target: rateBuckets.key,
        set: { count: 1, windowStart: now },
      });
    return false;
  }
  if (row.count >= limit.max) return true;
  await db.update(rateBuckets).set({ count: row.count + 1 }).where(eq(rateBuckets.key, key));
  return false;
}
