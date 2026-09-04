import { and, eq, isNull } from "drizzle-orm";
import { principals } from "@/lib/db/schema";
import { getDb } from "@/lib/db";
import type { HousePrincipal } from "@/lib/protocol/bundle";
import { ensureHouseWallet } from "./house-wallet";
import { deployHouseCourt } from "./onchain";

/** One Intelligent Contract per house. Deploy once, paid by the house wallet. */
export async function ensureHouseCourt(principal: HousePrincipal): Promise<string | null> {
  if (principal.courtContract && /^0x[a-fA-F0-9]{40}$/.test(principal.courtContract)) {
    return principal.courtContract;
  }
  const wallet = await ensureHouseWallet(principal);
  const deployed = await deployHouseCourt(wallet.accountKey);
  if (!deployed) return null;

  const db = getDb();
  const claimed = await db
    .update(principals)
    .set({ courtContract: deployed })
    .where(and(eq(principals.id, principal.id), isNull(principals.courtContract)))
    .returning({ courtContract: principals.courtContract });
  if (claimed[0]?.courtContract) {
    principal.courtContract = claimed[0].courtContract;
    return claimed[0].courtContract;
  }

  const [fresh] = await db
    .select({ courtContract: principals.courtContract })
    .from(principals)
    .where(eq(principals.id, principal.id))
    .limit(1);
  if (fresh?.courtContract && /^0x[a-fA-F0-9]{40}$/.test(fresh.courtContract)) {
    principal.courtContract = fresh.courtContract;
    return fresh.courtContract;
  }
  return deployed;
}
