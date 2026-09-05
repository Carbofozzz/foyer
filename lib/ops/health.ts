import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { cronIntervalSec, cronRunsHere, deployEnv } from "./client";
import { lastTick, recentWriteCounts, tickIsStale } from "./tick";

export type Health = {
  ok: boolean;
  env: "production" | "preview" | "development";
  db: "up" | "down";
  tick: {
    at: string | null;
    houses: number | null;
    advanced: number | null;
    ok: boolean | null;
    stale: boolean;
    interval_sec: number;
    runs_here: boolean;
  };
  writes_last_hour: { writes: number; limited: number };
};

export async function readHealth(): Promise<Health> {
  let db: "up" | "down" = "down";
  try {
    await getDb().execute(sql`select 1`);
    db = "up";
  } catch {
    db = "down";
  }

  let tickRow = null;
  let writes = { writes: 0, limited: 0 };
  if (db === "up") {
    try {
      tickRow = await lastTick();
      writes = await recentWriteCounts();
    } catch {
      db = "down";
    }
  }

  const at = tickRow?.finishedAt ?? tickRow?.startedAt ?? null;
  return {
    ok: db === "up",
    env: deployEnv(),
    db,
    tick: {
      at: at?.toISOString() ?? null,
      houses: tickRow?.houses ?? null,
      advanced: tickRow?.advanced ?? null,
      ok: tickRow?.ok ?? null,
      stale: tickIsStale(at),
      interval_sec: cronIntervalSec(),
      runs_here: cronRunsHere(),
    },
    writes_last_hour: writes,
  };
}
