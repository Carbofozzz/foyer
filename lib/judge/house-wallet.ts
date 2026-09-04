import { and, eq, isNull } from "drizzle-orm";
import { createAccount, generatePrivateKey } from "genlayer-js";
import { principals } from "@/lib/db/schema";
import { getDb } from "@/lib/db";
import type { HousePrincipal } from "@/lib/protocol/bundle";
import { sealKey, unsealKey } from "@/lib/protocol/seal";

export type HouseWallet = {
  address: `0x${string}`;
  accountKey: `0x${string}`;
};

export function newHouseWallet(): HouseWallet {
  const accountKey = generatePrivateKey();
  const account = createAccount(accountKey);
  return { address: account.address, accountKey };
}

/** One signing wallet per house. Fees leave this address; the court IC never holds GEN. */
export async function ensureHouseWallet(principal: HousePrincipal): Promise<HouseWallet> {
  if (principal.walletAddress && principal.sealedWalletKey) {
    return thaw(principal.walletAddress, principal.sealedWalletKey);
  }

  const fresh = newHouseWallet();
  const db = getDb();
  const claimed = await db
    .update(principals)
    .set({
      walletAddress: fresh.address,
      sealedWalletKey: sealKey(fresh.accountKey),
    })
    .where(and(eq(principals.id, principal.id), isNull(principals.walletAddress)))
    .returning({
      walletAddress: principals.walletAddress,
      sealedWalletKey: principals.sealedWalletKey,
    });
  if (claimed[0]?.walletAddress && claimed[0].sealedWalletKey) {
    principal.walletAddress = claimed[0].walletAddress;
    principal.sealedWalletKey = claimed[0].sealedWalletKey;
    return thaw(claimed[0].walletAddress, claimed[0].sealedWalletKey);
  }

  const [row] = await db
    .select({
      walletAddress: principals.walletAddress,
      sealedWalletKey: principals.sealedWalletKey,
    })
    .from(principals)
    .where(eq(principals.id, principal.id))
    .limit(1);
  if (row?.walletAddress && row.sealedWalletKey) {
    principal.walletAddress = row.walletAddress;
    principal.sealedWalletKey = row.sealedWalletKey;
    return thaw(row.walletAddress, row.sealedWalletKey);
  }
  throw new Error("House wallet was not stored");
}

export async function revealHouseWallet(principal: HousePrincipal): Promise<HouseWallet> {
  return ensureHouseWallet(principal);
}

function thaw(address: string, sealed: string): HouseWallet {
  return {
    address: address as `0x${string}`,
    accountKey: unsealKey(sealed) as `0x${string}`,
  };
}
