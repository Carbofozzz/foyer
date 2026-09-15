import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { ProtocolError } from "./errors";
import { WINDOW_SEC_MAX, WINDOW_SEC_MIN } from "./types";
import type { HousePrincipal } from "./bundle";

let ready = false;

/** Collect vs bargain clocks. Backfill bargain from the old shared silence value. */
export async function ensureHouseWindowsColumn() {
  if (ready) return;
  const db = getDb();
  await db.execute(sql`ALTER TABLE principals ADD COLUMN IF NOT EXISTS bargain_window_sec integer`);
  await db.execute(
    sql`UPDATE principals SET bargain_window_sec = silence_window_sec WHERE bargain_window_sec IS NULL`,
  );
  await db.execute(sql`ALTER TABLE principals ALTER COLUMN bargain_window_sec SET DEFAULT 60`);
  await db.execute(sql`ALTER TABLE principals ALTER COLUMN bargain_window_sec SET NOT NULL`);
  ready = true;
}

export function parseWindowSec(raw: unknown, field: string): number {
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw.trim()) : NaN;
  if (!Number.isInteger(n) || n < WINDOW_SEC_MIN || n > WINDOW_SEC_MAX) {
    throw new ProtocolError("bad_request", `${field} must be ${WINDOW_SEC_MIN}–${WINDOW_SEC_MAX} seconds`, 400);
  }
  return n;
}

export function houseWindows(principal: HousePrincipal) {
  const collect = principal.silenceWindowSec;
  const bargain = principal.bargainWindowSec ?? collect;
  return {
    collect_window_sec: collect,
    bargain_window_sec: bargain,
    require_signed_writes: Boolean(principal.requireSignedWrites),
  };
}
