import { and, eq } from "drizzle-orm";
import { houseMembers, principals, enrollments } from "@/lib/db/schema";
import { getDb } from "@/lib/db";
import { ownerKey } from "@/lib/gen/chain";
import { newHouseWallet } from "@/lib/judge/house-wallet";
import { sealKey } from "./seal";
import { ProtocolError } from "./errors";
import { hashSecret, mintToken } from "./keys";
import type { PrincipalType } from "./types";

export async function findHouseByOwner(ownerAddress: string) {
  const owner = ownerKey(ownerAddress);
  if (!owner) return null;
  const db = getDb();
  const [row] = await db
    .select()
    .from(principals)
    .where(and(eq(principals.ownerAddress, owner), eq(principals.isSpawn, false)))
    .limit(1);
  return row ?? null;
}

export async function createHouse(input: { name: string; type: PrincipalType; ownerAddress?: string }) {
  if (input.ownerAddress) {
    const existing = await findHouseByOwner(input.ownerAddress);
    if (existing) return { principalId: existing.id, cabinetToken: "me", enrollmentToken: null as string | null, existing: true };
  }

  const db = getDb();
  const principalId = mintToken("hou");
  const cabinetToken = mintToken("cab");
  const enrollmentToken = mintToken("enr");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const wallet = newHouseWallet();

  await db.insert(principals).values({
    id: principalId,
    name: input.name,
    type: input.type,
    constitution: "",
    cabinetTokenHash: hashSecret(cabinetToken),
    walletAddress: wallet.address,
    sealedWalletKey: sealKey(wallet.accountKey),
    ownerAddress: input.ownerAddress ? ownerKey(input.ownerAddress) : null,
  });

  const owner = input.ownerAddress ? ownerKey(input.ownerAddress) : null;
  if (owner) {
    await db.insert(houseMembers).values({ principalId, address: owner, role: "owner" });
  }

  await db.insert(enrollments).values({
    tokenHash: hashSecret(enrollmentToken),
    principalId,
    role: "travel",
    name: "Travel",
    expiresAt,
  });

  return {
    principalId,
    cabinetToken: input.ownerAddress ? "me" : cabinetToken,
    enrollmentToken,
    existing: false,
  };
}

/** One wallet, one house. Name/type are not a login step. */
export async function ensureHouseForOwner(ownerAddress: string) {
  const existing = await findHouseByOwner(ownerAddress);
  if (existing) return existing;
  try {
    await createHouse({ name: "", type: "personal", ownerAddress });
  } catch {
    // Unique owner_address: a parallel sign-in already inserted.
  }
  const house = await findHouseByOwner(ownerAddress);
  if (!house) throw new ProtocolError("internal", "Failed to open house", 500);
  return house;
}
