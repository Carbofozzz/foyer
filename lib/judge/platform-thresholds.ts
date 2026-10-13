import { eq, sql } from "drizzle-orm";
import { platformWalletState } from "@/lib/db/schema";
import { getDb } from "@/lib/db";
import { parseGen, formatGen } from "@/lib/gen/amount";
import { ProtocolError } from "@/lib/protocol/errors";
import { ensureCourtGasSchema } from "./gas-stats";

const STATE_ID = "singleton";

/** Env / hard defaults when ops has not saved overrides. */
export const DEFAULT_FLOOR_WEI = BigInt(3) * BigInt(10) ** BigInt(17); // 0.3 GEN
export const DEFAULT_ALERT_WEI = BigInt(1) * BigInt(10) ** BigInt(18); // 1 GEN

function parseWeiEnv(name: string, fallback: bigint): bigint {
  const raw = (process.env[name] ?? "").trim();
  if (!raw) return fallback;
  try {
    if (/^\d+$/.test(raw)) return BigInt(raw);
    const [whole, frac = ""] = raw.split(".");
    const padded = (frac + "000000000000000000").slice(0, 18);
    return BigInt(whole || "0") * BigInt(10) ** BigInt(18) + BigInt(padded || "0");
  } catch {
    return fallback;
  }
}

function envFloor(): bigint {
  return parseWeiEnv("COURT_FLOOR_WEI", DEFAULT_FLOOR_WEI);
}

function envAlert(): bigint {
  return parseWeiEnv("GENLAYER_PLATFORM_ALERT_WEI", DEFAULT_ALERT_WEI);
}

export type PlatformThresholds = {
  floorWei: bigint;
  alertWei: bigint;
  /** true when values come from platform_wallet_state, not only env. */
  fromOps: boolean;
};

/** Ops overrides win; else env; alert is never below floor. */
export async function resolvePlatformThresholds(): Promise<PlatformThresholds> {
  await ensureCourtGasSchema();
  const db = getDb();
  const [row] = await db
    .select({
      floorWei: platformWalletState.floorWei,
      alertWei: platformWalletState.alertWei,
    })
    .from(platformWalletState)
    .where(eq(platformWalletState.id, STATE_ID))
    .limit(1);

  let floor = envFloor();
  let alert = envAlert();
  let fromOps = false;
  if (row?.floorWei && /^\d+$/.test(row.floorWei)) {
    floor = BigInt(row.floorWei);
    fromOps = true;
  }
  if (row?.alertWei && /^\d+$/.test(row.alertWei)) {
    alert = BigInt(row.alertWei);
    fromOps = true;
  }
  if (alert < floor) alert = floor;
  return { floorWei: floor, alertWei: alert, fromOps };
}

/** Save floor / alert from decimal GEN strings entered in the ops desk. */
export async function savePlatformThresholds(input: {
  floorGen: string;
  alertGen: string;
}): Promise<PlatformThresholds> {
  let floor: bigint;
  let alert: bigint;
  try {
    floor = parseGen(input.floorGen);
    alert = parseGen(input.alertGen);
  } catch (error) {
    throw new ProtocolError(
      "bad_request",
      error instanceof Error ? error.message : "Invalid GEN amount",
      400,
    );
  }
  if (alert < floor) {
    throw new ProtocolError("bad_request", "Alert must be at or above the floor", 400);
  }
  await ensureCourtGasSchema();
  const db = getDb();
  await db
    .insert(platformWalletState)
    .values({
      id: STATE_ID,
      floorWei: floor.toString(),
      alertWei: alert.toString(),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: platformWalletState.id,
      set: {
        floorWei: floor.toString(),
        alertWei: alert.toString(),
        updatedAt: new Date(),
      },
    });
  return { floorWei: floor, alertWei: alert, fromOps: true };
}

export function thresholdsAsGen(t: PlatformThresholds): { floor_gen: string; alert_gen: string } {
  return { floor_gen: formatGen(t.floorWei), alert_gen: formatGen(t.alertWei) };
}

/** Ensure columns exist on leftover DBs before drizzle push. */
export async function ensureThresholdColumns(): Promise<void> {
  await ensureCourtGasSchema();
  const db = getDb();
  await db.execute(sql`ALTER TABLE platform_wallet_state ADD COLUMN IF NOT EXISTS floor_wei text`);
  await db.execute(sql`ALTER TABLE platform_wallet_state ADD COLUMN IF NOT EXISTS alert_wei text`);
}
