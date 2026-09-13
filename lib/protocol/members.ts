import { and, eq, sql } from "drizzle-orm";
import { houseMembers, principals } from "@/lib/db/schema";
import { getDb } from "@/lib/db";
import { ownerKey } from "@/lib/gen/chain";
import type { HousePrincipal } from "./bundle";
import { ProtocolError } from "./errors";
import {
  CABINET_GRANTS,
  INVITE_ROLES,
  MEMBER_ROLES,
  isOrgHouse,
  type CabinetGrant,
  type InviteRole,
  type MemberRole,
} from "./types";

const HELPER_CAP = 16;
const ALL_GRANTS: CabinetGrant[] = [...CABINET_GRANTS];

export type HouseAccess = {
  principal: HousePrincipal;
  role: MemberRole;
  grants: CabinetGrant[];
};

export type HouseListing = {
  id: string;
  name: string;
  type: string;
  role: MemberRole;
  own: boolean;
};

export type MemberView = {
  address: string;
  role: MemberRole;
  grants: CabinetGrant[];
  created_at: string;
};

export function isMemberRole(value: string): value is MemberRole {
  return (MEMBER_ROLES as readonly string[]).includes(value);
}

export function isInviteRole(value: string): value is InviteRole {
  return (INVITE_ROLES as readonly string[]).includes(value);
}

export function isCabinetGrant(value: string): value is CabinetGrant {
  return (CABINET_GRANTS as readonly string[]).includes(value);
}

export function parseGrants(raw: unknown): CabinetGrant[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter((item): item is CabinetGrant => typeof item === "string" && isCabinetGrant(item)))];
}

export function grantsForRole(role: MemberRole, stored: unknown): CabinetGrant[] {
  if (role === "owner") return ALL_GRANTS;
  return parseGrants(stored);
}

export function hasGrant(role: MemberRole, grants: CabinetGrant[], grant: CabinetGrant): boolean {
  if (role === "owner") return true;
  return grants.includes(grant);
}

/** Owner and operator can appeal, connect, deposit. Observer only reads. */
export function canOperate(role: MemberRole): boolean {
  return role === "owner" || role === "operator";
}

/** Only the owner writes the charter, invites people, or moves GEN out. */
export function canManage(role: MemberRole): boolean {
  return role === "owner";
}

let grantsReady = false;

export async function ensureHouseMembersSchema() {
  if (grantsReady) return;
  const db = getDb();
  await db.execute(sql`ALTER TABLE house_members ADD COLUMN IF NOT EXISTS grants jsonb`);
  grantsReady = true;
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
  await ensureHouseMembersSchema();
  const wallet = ownerKey(address);
  if (!wallet) return null;
  const db = getDb();
  const [principal] = await db.select().from(principals).where(eq(principals.id, houseId)).limit(1);
  if (!principal || principal.isSpawn) return null;

  const owner = principal.ownerAddress ? ownerKey(principal.ownerAddress) : null;
  if (owner && owner === wallet) {
    await ensureOwnerRow(principal);
    return { principal, role: "owner", grants: ALL_GRANTS };
  }

  const [row] = await db
    .select()
    .from(houseMembers)
    .where(and(eq(houseMembers.principalId, houseId), eq(houseMembers.address, wallet)))
    .limit(1);
  if (!row || !isMemberRole(row.role)) return null;
  return { principal, role: row.role, grants: grantsForRole(row.role, row.grants) };
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
      name: principals.name,
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
      name: row.name,
      type: isOrgHouse({ type: row.type, ownerAddress: row.ownerAddress }) ? "org" : "personal",
      role: row.role,
      own: Boolean(row.ownerAddress && ownerKey(row.ownerAddress) === wallet) || row.role === "owner",
    });
  }
  if (own[0] && !seen.has(own[0].id)) {
    list.unshift({
      id: own[0].id,
      name: own[0].name,
      type: isOrgHouse(own[0]) ? "org" : "personal",
      role: "owner",
      own: true,
    });
  }
  return list.sort((a, b) => Number(b.own) - Number(a.own) || a.name.localeCompare(b.name));
}

export async function listMembers(principal: HousePrincipal): Promise<MemberView[]> {
  await ensureHouseMembersSchema();
  await ensureOwnerRow(principal);
  const db = getDb();
  const rows = await db.select().from(houseMembers).where(eq(houseMembers.principalId, principal.id));
  return rows
    .filter((row) => isMemberRole(row.role))
    .map((row) => ({
      address: row.address,
      role: row.role as MemberRole,
      grants: grantsForRole(row.role as MemberRole, row.grants),
      created_at: row.createdAt.toISOString(),
    }));
}

function roleForGrants(grants: CabinetGrant[]): InviteRole {
  return grants.length > 0 ? "operator" : "observer";
}

export async function inviteMember(principal: HousePrincipal, rawAddress: string, grants: CabinetGrant[]) {
  if (!isOrgHouse(principal)) {
    throw new ProtocolError("forbidden", "Only a company house can invite people", 403);
  }
  const address = ownerKey(rawAddress);
  if (!address) throw new ProtocolError("bad_request", "address must be a wallet", 400);
  await ensureHouseMembersSchema();
  await ensureOwnerRow(principal);
  const db = getDb();
  const existing = await db.select().from(houseMembers).where(eq(houseMembers.principalId, principal.id));
  if (existing.some((row) => row.address === address)) {
    throw new ProtocolError("conflict", "Already a member", 409);
  }
  const helpers = existing.filter((row) => row.role !== "owner");
  if (helpers.length >= HELPER_CAP) {
    throw new ProtocolError("forbidden", "Too many helpers", 403);
  }
  const role = roleForGrants(grants);
  await db.insert(houseMembers).values({ principalId: principal.id, address, role, grants });
  return listMembers(principal);
}

export async function saveMemberGrants(principal: HousePrincipal, rawAddress: string, grants: CabinetGrant[]) {
  if (!isOrgHouse(principal)) {
    throw new ProtocolError("forbidden", "Only a company house can invite people", 403);
  }
  const address = ownerKey(rawAddress);
  if (!address) throw new ProtocolError("bad_request", "address must be a wallet", 400);
  await ensureHouseMembersSchema();
  const db = getDb();
  const [row] = await db
    .select()
    .from(houseMembers)
    .where(and(eq(houseMembers.principalId, principal.id), eq(houseMembers.address, address)))
    .limit(1);
  if (!row) throw new ProtocolError("not_found", "Unknown member", 404);
  if (row.role === "owner") throw new ProtocolError("forbidden", "The owner cannot be limited", 403);
  await db
    .update(houseMembers)
    .set({ role: roleForGrants(grants), grants })
    .where(and(eq(houseMembers.principalId, principal.id), eq(houseMembers.address, address)));
  return listMembers(principal);
}

export async function removeMember(principal: HousePrincipal, rawAddress: string) {
  const address = ownerKey(rawAddress);
  if (!address) throw new ProtocolError("bad_request", "address must be a wallet", 400);
  const db = getDb();
  const [row] = await db
    .select()
    .from(houseMembers)
    .where(and(eq(houseMembers.principalId, principal.id), eq(houseMembers.address, address)))
    .limit(1);
  if (row?.role === "owner") {
    throw new ProtocolError("forbidden", "The owner cannot be removed", 403);
  }
  await db
    .delete(houseMembers)
    .where(and(eq(houseMembers.principalId, principal.id), eq(houseMembers.address, address)));
  return listMembers(principal);
}
