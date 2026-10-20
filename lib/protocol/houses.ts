import { and, eq, isNull } from "drizzle-orm";
import { houseMembers, principals } from "@/lib/db/schema";
import { getDb } from "@/lib/db";
import { newHouseWallet } from "@/lib/judge/house-wallet";
import { sealKey } from "./seal";
import { deleteHouse } from "./admin";
import { ProtocolError } from "./errors";
import { hashSecret, mintToken } from "./keys";
import { accessFor } from "./members";
import { isOrgHouse } from "./types";
import { ensureLockHandsColumn } from "@/lib/lock/house-hands";
import { ensureHouseWindowsColumn } from "./house-windows";
import { ensureWriteSignColumns } from "./write-sign";

export const ORG_CAP = 1;
const ORG_NAME = 80;

export async function findHouseByOwner(userId: string) {
  await ensureHouseWindowsColumn();
  await ensureWriteSignColumns();
  await ensureLockHandsColumn();
  if (!userId) return null;
  const db = getDb();
  const [row] = await db.select().from(principals).where(eq(principals.ownerUserId, userId)).limit(1);
  return row ?? null;
}

/** One user, one personal house. Opened on first login; name/type are not a login step. */
export async function ensurePersonalHouseForUser(userId: string) {
  const existing = await findHouseByOwner(userId);
  if (existing) return existing;
  const db = getDb();
  const principalId = mintToken("hou");
  const wallet = newHouseWallet();
  try {
    await db.insert(principals).values({
      id: principalId,
      name: "",
      type: "personal",
      constitution: "",
      cabinetTokenHash: hashSecret(mintToken("cab")),
      walletAddress: wallet.address,
      sealedWalletKey: sealKey(wallet.accountKey),
      ownerUserId: userId,
    });
    await db.insert(houseMembers).values({ principalId, userId, role: "owner" }).onConflictDoNothing();
  } catch {
    // Unique owner_user_id: a parallel first request already inserted.
  }
  const house = await findHouseByOwner(userId);
  if (!house) throw new ProtocolError("internal", "Failed to open house", 500);
  const { ensureBillingAccount } = await import("@/lib/billing/account");
  await ensureBillingAccount(house.id, { personal: true });
  return house;
}

/** Extra org principal. Does not touch the personal `owner_user_id` row. */
export async function createOrgHouse(userId: string, rawName: string) {
  const name = rawName.trim();
  if (!name || name.length > ORG_NAME) {
    throw new ProtocolError("bad_request", "name is required", 400);
  }
  const personal = await ensurePersonalHouseForUser(userId);
  const { assertFeatureOrg, ensureBillingAccount } = await import("@/lib/billing/account");
  await ensureBillingAccount(personal.id, { personal: true });
  await assertFeatureOrg(personal.id);
  const db = getDb();
  const owned = await db
    .select({ id: principals.id })
    .from(houseMembers)
    .innerJoin(principals, eq(principals.id, houseMembers.principalId))
    .where(
      and(
        eq(houseMembers.userId, userId),
        eq(houseMembers.role, "owner"),
        eq(principals.type, "org"),
        isNull(principals.ownerUserId),
      ),
    );
  if (owned.length >= ORG_CAP) {
    throw new ProtocolError("forbidden", "Too many organizations", 403);
  }

  const principalId = mintToken("hou");
  const wallet = newHouseWallet();
  await db.insert(principals).values({
    id: principalId,
    name,
    type: "org",
    constitution: "",
    cabinetTokenHash: hashSecret(mintToken("cab")),
    walletAddress: wallet.address,
    sealedWalletKey: sealKey(wallet.accountKey),
    wizardConnectDone: true,
    wizardRulesDone: true,
    wizardLockDone: true,
    wizardHarnessDone: true,
    ownerUserId: null,
  });
  await db.insert(houseMembers).values({ principalId, userId, role: "owner" });
  return { id: principalId, name };
}

export async function ownedOrg(userId: string, houseId: string) {
  const id = houseId.trim();
  if (!id) throw new ProtocolError("bad_request", "id is required", 400);
  const access = await accessFor(userId, id);
  if (!access || !isOrgHouse(access.principal)) {
    throw new ProtocolError("not_found", "Unknown organization", 404);
  }
  if (access.role !== "owner") {
    throw new ProtocolError("forbidden", "Only the owner can do that", 403);
  }
  return access.principal;
}

export async function renameOrgHouse(userId: string, houseId: string, rawName: string) {
  const name = rawName.trim();
  if (!name || name.length > ORG_NAME) {
    throw new ProtocolError("bad_request", "name is required", 400);
  }
  const house = await ownedOrg(userId, houseId);
  const db = getDb();
  await db.update(principals).set({ name }).where(eq(principals.id, house.id));
  return { id: house.id, name };
}

export async function destroyOrgHouse(userId: string, houseId: string) {
  const house = await ownedOrg(userId, houseId);
  await deleteHouse(house.id);
}
