import { and, eq, isNotNull, isNull, lt, or } from "drizzle-orm";
import { actions, cases, principals } from "@/lib/db/schema";
import { getDb } from "@/lib/db";
import type { HousePrincipal } from "@/lib/protocol/bundle";
import { COURT_FLOOR_WEI, ensureCourtFunds } from "./funds";
import { ensureHouseWallet } from "./house-wallet";
import { deployHouseCourt } from "./onchain";

/** allow/deny/escalate + objections list. Older deploys are the four-outcome ABI. */
export const COURT_ABI = 2;

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
  const wallet = await ensureHouseWallet(principal);
  if ((await ensureCourtFunds(wallet.address)) < COURT_FLOOR_WEI) return null;
  const deployed = await deployHouseCourt(wallet.accountKey);
  if (!deployed) return null;

  const db = getDb();
  const claimed = await db
    .update(principals)
    .set({ courtContract: deployed, courtAbi: COURT_ABI })
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
  return deployed;
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
