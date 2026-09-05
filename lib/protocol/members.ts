import { and, eq } from "drizzle-orm";
import { houseMembers, principals } from "@/lib/db/schema";
import { getDb } from "@/lib/db";
import { ownerKey } from "@/lib/gen/chain";
import type { HousePrincipal } from "./bundle";
import { ProtocolError } from "./errors";
import { INVITE_ROLES, MEMBER_ROLES, type InviteRole, type MemberRole } from "./types";

export type HouseAccess = {
  principal: HousePrincipal;
  role: MemberRole;
};

export type HouseListing = {
  id: string;
  type: string;
  role: MemberRole;
  own: boolean;
};

export function isMemberRole(value: string): value is MemberRole {
  return (MEMBER_ROLES as readonly string[]).includes(value);
}

export function isInviteRole(value: string): value is InviteRole {
  return (INVITE_ROLES as readonly string[]).includes(value);
}

/** Owner and operator can appeal, connect, deposit. Observer only reads. */
export function canOperate(role: MemberRole): boolean {
  return role === "owner" || role === "operator";
}

/** Only the owner writes the charter, invites people, or moves GEN out. */
export function canManage(role: MemberRole): boolean {
  return role === "owner";
}

export async function ensureOwnerRow(principal: HousePrincipal): Promise<void> {
  const address = principal.ownerAddress ? ownerKey(principal.ownerAddress) : null;
  if (!address) return;
  const db = getDb();
  await db
    .insert(houseMembers)
    .values({ principalId: principal.id, address, role: "owner" })
    .onConflictDoNothing();
}

export async function accessFor(address: string, houseId: string): Promise<HouseAccess | null> {
  const wallet = ownerKey(address);
  if (!wallet) return null;
  const db = getDb();
  const [principal] = await db.select().from(principals).where(eq(principals.id, houseId)).limit(1);
  if (!principal || principal.isSpawn) return null;

  const owner = principal.ownerAddress ? ownerKey(principal.ownerAddress) : null;
  if (owner && owner === wallet) {
    await ensureOwnerRow(principal);
    return { principal, role: "owner" };
  }

  const [row] = await db
    .select()
    .from(houseMembers)
    .where(and(eq(houseMembers.principalId, houseId), eq(houseMembers.address, wallet)))
    .limit(1);
  if (!row || !isMemberRole(row.role)) return null;
  return { principal, role: row.role };
}

export async function listHousesFor(address: string): Promise<HouseListing[]> {
  const wallet = ownerKey(address);
  if (!wallet) return [];
  const db = getDb();
  const own = await db
    .select()
    .from(principals)
    .where(and(eq(principals.ownerAddress, wallet), eq(principals.isSpawn, false)))
    .limit(1);
  if (own[0]) await ensureOwnerRow(own[0]);

  const rows = await db
    .select({
      id: principals.id,
      type: principals.type,
      role: houseMembers.role,
      ownerAddress: principals.ownerAddress,
    })
    .from(houseMembers)
    .innerJoin(principals, eq(principals.id, houseMembers.principalId))
    .where(and(eq(houseMembers.address, wallet), eq(principals.isSpawn, false)));

  const seen = new Set<string>();
  const list: HouseListing[] = [];
  for (const row of rows) {
    if (!isMemberRole(row.role) || seen.has(row.id)) continue;
    seen.add(row.id);
    list.push({
      id: row.id,
      type: row.type,
      role: row.role,
      own: Boolean(row.ownerAddress && ownerKey(row.ownerAddress) === wallet),
    });
  }
  if (own[0] && !seen.has(own[0].id)) {
    list.unshift({ id: own[0].id, type: own[0].type, role: "owner", own: true });
  }
  return list.sort((a, b) => Number(b.own) - Number(a.own));
}

export async function listMembers(principal: HousePrincipal) {
  await ensureOwnerRow(principal);
  const db = getDb();
  const rows = await db
    .select()
    .from(houseMembers)
    .where(eq(houseMembers.principalId, principal.id));
  return rows
    .filter((row) => isMemberRole(row.role))
    .map((row) => ({
      address: row.address,
      role: row.role as MemberRole,
      created_at: row.createdAt.toISOString(),
    }));
}

export async function inviteMember(principal: HousePrincipal, rawAddress: string, role: InviteRole) {
  if (principal.type !== "org") {
    throw new ProtocolError("forbidden", "Only a company house can invite people", 403);
  }
  const address = ownerKey(rawAddress);
  if (!address) throw new ProtocolError("bad_request", "address must be a wallet", 400);
  const owner = principal.ownerAddress ? ownerKey(principal.ownerAddress) : null;
  if (owner && owner === address) {
    throw new ProtocolError("conflict", "That wallet already owns this house", 409);
  }
  await ensureOwnerRow(principal);
  const db = getDb();
  const [existing] = await db
    .select()
    .from(houseMembers)
    .where(and(eq(houseMembers.principalId, principal.id), eq(houseMembers.address, address)))
    .limit(1);
  if (existing) throw new ProtocolError("conflict", "Already a member", 409);
  await db.insert(houseMembers).values({ principalId: principal.id, address, role });
  return listMembers(principal);
}

export async function removeMember(principal: HousePrincipal, rawAddress: string) {
  const address = ownerKey(rawAddress);
  if (!address) throw new ProtocolError("bad_request", "address must be a wallet", 400);
  const owner = principal.ownerAddress ? ownerKey(principal.ownerAddress) : null;
  if (owner && owner === address) {
    throw new ProtocolError("forbidden", "The owner cannot be removed", 403);
  }
  const db = getDb();
  await db
    .delete(houseMembers)
    .where(and(eq(houseMembers.principalId, principal.id), eq(houseMembers.address, address)));
  return listMembers(principal);
}
