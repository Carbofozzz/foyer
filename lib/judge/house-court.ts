import { and, eq, isNotNull, isNull, lt, or } from "drizzle-orm";
import { actions, cases, principals } from "@/lib/db/schema";
import { getDb } from "@/lib/db";
import type { HousePrincipal } from "@/lib/protocol/bundle";
import { ensureCourtFunds } from "./funds";
import { recordCourtGas } from "./gas-stats";
import { deployHouseCourt, walletBalance } from "./onchain";
import { platformWallet } from "./platform-wallet";
import { resolvePlatformThresholds } from "./platform-thresholds";

/**
 * 9 = platform wallet is IC admin (B2).
 * Leftover houses with court_abi < 9 redeploy on the next court.
 */
export const COURT_ABI = 9;

/** One Intelligent Contract per house. Redeploys when the stored ABI is stale. */
export async function ensureHouseCourt(principal: HousePrincipal): Promise<string | null> {
  if (
    principal.courtContract &&
    /^0x[a-fA-F0-9]{40}$/.test(principal.courtContract) &&
    principal.courtAbi >= COURT_ABI
  ) {
    return principal.courtContract;
  }
  if (principal.courtContract && /^0x[a-fA-F0-9]{40}$/.test(principal.courtContract)) {
    await stampInflightCases(principal.id, principal.courtContract);
  }

  const platform = platformWallet();
  if (!platform) return null;
  const { floorWei } = await resolvePlatformThresholds();
  if ((await ensureCourtFunds(platform.address)) < floorWei) return null;

  const balanceBefore = (await walletBalance(platform.address)) ?? BigInt(0);
  const deployed = await deployHouseCourt(platform.accountKey);
  if (!deployed) return null;

  await recordCourtGas({
    caseId: null,
    tx: deployed.hash,
    kind: "deploy",
    estimatedWei: deployed.estimatedWei,
    balanceBeforeWei: balanceBefore,
  }).catch(() => undefined);

  const db = getDb();
  const claimed = await db
    .update(principals)
    .set({ courtContract: deployed.address, courtAbi: COURT_ABI })
    .where(
      and(
        eq(principals.id, principal.id),
        or(isNull(principals.courtContract), lt(principals.courtAbi, COURT_ABI)),
      ),
    )
    .returning({ courtContract: principals.courtContract });
  if (claimed[0]?.courtContract) {
    principal.courtContract = claimed[0].courtContract;
    principal.courtAbi = COURT_ABI;
    return claimed[0].courtContract;
  }

  const [fresh] = await db
    .select({ courtContract: principals.courtContract, courtAbi: principals.courtAbi })
    .from(principals)
    .where(eq(principals.id, principal.id))
    .limit(1);
  if (fresh?.courtContract && /^0x[a-fA-F0-9]{40}$/.test(fresh.courtContract) && (fresh.courtAbi ?? 0) >= COURT_ABI) {
    principal.courtContract = fresh.courtContract;
    principal.courtAbi = fresh.courtAbi ?? COURT_ABI;
    return fresh.courtContract;
  }
  return deployed.address;
}

async function stampInflightCases(principalId: string, address: string): Promise<void> {
  const db = getDb();
  const rows = await db
    .select({ id: cases.id })
    .from(cases)
    .innerJoin(actions, eq(cases.actionId, actions.id))
    .where(and(eq(actions.principalId, principalId), isNull(cases.contract), isNotNull(cases.tx)));
  for (const row of rows) {
    await db.update(cases).set({ contract: address }).where(eq(cases.id, row.id));
  }
}
