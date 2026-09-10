import { bearerToken, jsonError, jsonOk } from "@/lib/protocol/http";
import { findHouseNeedingCourt, findHousesNeedingSweep, sweep } from "@/lib/protocol/sweep";
import { publicOrigin } from "@/lib/mcp/config";
import { deployEnv } from "@/lib/ops/client";
import { writeRequestLog } from "@/lib/ops/log";
import { recordTick } from "@/lib/ops/tick";

export const maxDuration = 120;

/** Vercel Cron sends GET. POST stays for a manual sweep. */
export async function GET(request: Request) {
  return runTick(request);
}

export async function POST(request: Request) {
  return runTick(request);
}

async function runTick(request: Request) {
  const secret = process.env.CRON_SECRET;
  const token = bearerToken(request);
  const local = deployEnv() === "development";
  if (!local && (!secret || token !== secret)) {
    return jsonError("unauthorized", "Cron secret required", 401);
  }

  const startedAt = new Date();
  try {
    const houses = await findHousesNeedingSweep();
    const now = new Date();
    const dueId = await findHouseNeedingCourt(now);
    let advanced = 0;
    for (const id of houses) {
      if (id === dueId) continue;
      const result = await sweep(id, now, { courts: 0, origin: publicOrigin(request) });
      advanced += result.advanced;
    }
    if (dueId) {
      const result = await sweep(dueId, now, { courts: 1, origin: publicOrigin(request) });
      advanced += result.advanced;
    }
    await recordTick({ startedAt, houses: houses.length, advanced, ok: true });
    await writeRequestLog(request, "tick", 200, Date.now() - startedAt.getTime()).catch(() => undefined);
    return jsonOk({ houses: houses.length, advanced, court: dueId, at: now.toISOString() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "tick failed";
    await recordTick({ startedAt, houses: 0, advanced: 0, ok: false, error: message }).catch(() => undefined);
    await writeRequestLog(request, "tick", 500, Date.now() - startedAt.getTime()).catch(() => undefined);
    return jsonError("internal", "Tick failed", 500);
  }
}
