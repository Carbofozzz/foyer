import { principals } from "@/lib/db/schema";
import { getDb } from "@/lib/db";
import { bearerToken, jsonError, jsonOk } from "@/lib/protocol/http";
import { sweep } from "@/lib/protocol/sweep";
import { deployEnv } from "@/lib/ops/client";
import { writeRequestLog } from "@/lib/ops/log";
import { recordTick } from "@/lib/ops/tick";

export const maxDuration = 120;

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  const token = bearerToken(request);
  const local = deployEnv() === "development";
  if (!local && (!secret || token !== secret)) {
    return jsonError("unauthorized", "Cron secret required", 401);
  }

  const startedAt = new Date();
  const db = getDb();
  try {
    const houses = await db.select({ id: principals.id }).from(principals);
    const now = new Date();
    let advanced = 0;
    for (const house of houses) {
      const result = await sweep(house.id, now);
      advanced += result.advanced;
    }
    await recordTick({ startedAt, houses: houses.length, advanced, ok: true });
    await writeRequestLog(request, "tick", 200, Date.now() - startedAt.getTime()).catch(() => undefined);
    return jsonOk({ houses: houses.length, advanced, at: now.toISOString() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "tick failed";
    await recordTick({ startedAt, houses: 0, advanced: 0, ok: false, error: message }).catch(() => undefined);
    await writeRequestLog(request, "tick", 500, Date.now() - startedAt.getTime()).catch(() => undefined);
    return jsonError("internal", "Tick failed", 500);
  }
}
