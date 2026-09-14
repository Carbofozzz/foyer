import { and, eq, isNull } from "drizzle-orm";
import { houseMembers, principals, enrollments } from "@/lib/db/schema";
import { getDb } from "@/lib/db";
import { ownerKey } from "@/lib/gen/chain";
import { newHouseWallet } from "@/lib/judge/house-wallet";
import { sealKey } from "./seal";
import { deleteHouse } from "./admin";
import { ProtocolError } from "./errors";
import { hashSecret, mintToken } from "./keys";
import { accessFor } from "./members";
import { isOrgHouse, type PrincipalType } from "./types";

export const ORG_CAP = 1;
const ORG_NAME = 80;

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

/** Extra org principal. Does not touch the personal `owner_address` row. */
export async function createOrgHouse(ownerAddress: string, rawName: string) {
  const owner = ownerKey(ownerAddress);
  if (!owner) throw new ProtocolError("bad_request", "wallet required", 400);
  const name = rawName.trim();
  if (!name || name.length > ORG_NAME) {
    throw new ProtocolError("bad_request", "name is required", 400);
  }
  await ensureHouseForOwner(owner);
  const db = getDb();
  const owned = await db
    .select({ id: principals.id })
    .from(houseMembers)
    .innerJoin(principals, eq(principals.id, houseMembers.principalId))
    .where(
      and(
        eq(houseMembers.address, owner),
        eq(houseMembers.role, "owner"),
        eq(principals.type, "org"),
        isNull(principals.ownerAddress),
        eq(principals.isSpawn, false),
      ),
    );
  if (owned.length >= ORG_CAP) {
    throw new ProtocolError("forbidden", "Too many organizations", 403);
  }

  const principalId = mintToken("hou");
  const cabinetToken = mintToken("cab");
  const wallet = newHouseWallet();
  await db.insert(principals).values({
    id: principalId,
    name,
    type: "org",
    constitution: "",
    cabinetTokenHash: hashSecret(cabinetToken),
    walletAddress: wallet.address,
    sealedWalletKey: sealKey(wallet.accountKey),
    wizardConnectDone: true,
    wizardRulesDone: true,
    wizardLockDone: true,
    wizardHarnessDone: true,
    ownerAddress: null,
  });
  await db.insert(houseMembers).values({ principalId, address: owner, role: "owner" });
  return { id: principalId, name };
}

export async function ownedOrg(ownerAddress: string, houseId: string) {
  const id = houseId.trim();
  if (!id) throw new ProtocolError("bad_request", "id is required", 400);
  const access = await accessFor(ownerAddress, id);
  if (!access || !isOrgHouse(access.principal)) {
    throw new ProtocolError("not_found", "Unknown organization", 404);
  }
  if (access.role !== "owner") {
    throw new ProtocolError("forbidden", "Only the owner can do that", 403);
  }
  return access.principal;
}

export async function renameOrgHouse(ownerAddress: string, houseId: string, rawName: string) {
  const name = rawName.trim();
  if (!name || name.length > ORG_NAME) {
    throw new ProtocolError("bad_request", "name is required", 400);
  }
  const house = await ownedOrg(ownerAddress, houseId);
  const db = getDb();
  await db.update(principals).set({ name }).where(eq(principals.id, house.id));
  return { id: house.id, name };
}

export async function destroyOrgHouse(ownerAddress: string, houseId: string) {
  const house = await ownedOrg(ownerAddress, houseId);
  await deleteHouse(house.id);
}
