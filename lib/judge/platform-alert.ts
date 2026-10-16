import { eq } from "drizzle-orm";
import { platformWalletState } from "@/lib/db/schema";
import { getDb } from "@/lib/db";
import { ensureCourtGasSchema } from "./gas-stats";
import { resolvePlatformThresholds } from "./platform-thresholds";
import { platformWallet, platformWalletConfigured } from "./platform-wallet";
import { walletBalance } from "./onchain";
import { formatGen } from "@/lib/gen/amount";
import { sendMail } from "@/lib/notify/mail";
import { adminEmails } from "@/lib/protocol/users";

const STATE_ID = "singleton";

/**
 * Check platform GEN vs alert threshold. One mail per low episode to FOYER_ADMIN_EMAILS.
 * Safe to call from tick and court submit.
 */
export async function checkPlatformBalanceAlert(): Promise<{
  balance_wei: string | null;
  below_floor: boolean;
  below_alert: boolean;
  mailed: boolean;
}> {
  if (!platformWalletConfigured()) {
    return { balance_wei: null, below_floor: true, below_alert: true, mailed: false };
  }
  const wallet = platformWallet();
  if (!wallet) {
    return { balance_wei: null, below_floor: true, below_alert: true, mailed: false };
  }
  await ensureCourtGasSchema();
  const balance = (await walletBalance(wallet.address)) ?? BigInt(0);
  const { floorWei, alertWei } = await resolvePlatformThresholds();
  const belowFloor = balance < floorWei;
  const belowAlert = balance < alertWei;
  const db = getDb();
  const [row] = await db
    .select()
    .from(platformWalletState)
    .where(eq(platformWalletState.id, STATE_ID))
    .limit(1);

  let mailed = false;
  if (!belowAlert) {
    if (row?.lowAlertLatched) {
      await db
        .update(platformWalletState)
        .set({ lowAlertLatched: false, updatedAt: new Date() })
        .where(eq(platformWalletState.id, STATE_ID));
    }
    return {
      balance_wei: balance.toString(),
      below_floor: belowFloor,
      below_alert: false,
      mailed: false,
    };
  }

  if (!row?.lowAlertLatched) {
    mailed = await sendLowBalanceMail(wallet.address, balance, alertWei, floorWei);
    await db
      .insert(platformWalletState)
      .values({
        id: STATE_ID,
        lowAlertLatched: true,
        lowAlertAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: platformWalletState.id,
        set: {
          lowAlertLatched: true,
          lowAlertAt: new Date(),
          updatedAt: new Date(),
        },
      });
  }

  return {
    balance_wei: balance.toString(),
    below_floor: belowFloor,
    below_alert: true,
    mailed,
  };
}

async function sendLowBalanceMail(
  address: string,
  balance: bigint,
  alert: bigint,
  floor: bigint,
): Promise<boolean> {
  const emails = [...adminEmails()];
  if (emails.length === 0) return false;
  const subject = "Foyer: platform GEN below alert threshold";
  const text = [
    "The Foyer platform court wallet is low on GEN.",
    "",
    `Address: ${address}`,
    `Balance: ${formatGen(balance)} GEN (${balance.toString()} wei)`,
    `Alert at: ${formatGen(alert)} GEN`,
    `Floor (submit stops): ${formatGen(floor)} GEN`,
    "",
    "Top up the wallet so courts can keep submitting. Cases wait without debit while below the floor.",
  ].join("\n");
  let any = false;
  for (const to of emails) {
    try {
      await sendMail({ to, subject, text });
      any = true;
    } catch (error) {
      console.error("[platform-alert] mail failed", to, error);
    }
  }
  return any;
}

export async function loadPlatformAlertState(): Promise<{
  latched: boolean;
  low_alert_at: string | null;
}> {
  await ensureCourtGasSchema();
  const db = getDb();
  const [row] = await db
    .select()
    .from(platformWalletState)
    .where(eq(platformWalletState.id, STATE_ID))
    .limit(1);
  return {
    latched: Boolean(row?.lowAlertLatched),
    low_alert_at: row?.lowAlertAt ? row.lowAlertAt.toISOString() : null,
  };
}
