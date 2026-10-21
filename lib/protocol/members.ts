import { and, eq, gt, inArray, isNull } from "drizzle-orm";
import { houseInvites, houseMembers, principals, users } from "@/lib/db/schema";
import { getDb } from "@/lib/db";
import { defaultPublicOrigin } from "@/lib/mcp/config";
import { isLocale } from "@/lib/i18n/config";
import { notifyCopy, sendMail } from "@/lib/notify/mail";
import type { HousePrincipal } from "./bundle";
import { ProtocolError } from "./errors";
import { hashSecret, mintToken } from "./keys";
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
const INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
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
  user_id: string | null;
  email: string;
  role: MemberRole;
  grants: CabinetGrant[];
  pending: boolean;
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

function parseEmail(raw: string): string {
  const email = raw.trim().toLowerCase();
  if (!email || email.length > 254 || !EMAIL.test(email)) {
    throw new ProtocolError("bad_request", "email is invalid", 400);
  }
  return email;
}

export async function accessFor(userId: string, houseId: string): Promise<HouseAccess | null> {
  if (!userId) return null;
  const { ensureLockHandsColumn } = await import("@/lib/lock/house-hands");
  await ensureLockHandsColumn();
  const db = getDb();
  const [principal] = await db.select().from(principals).where(eq(principals.id, houseId)).limit(1);
  if (!principal) return null;
  if (principal.ownerUserId === userId) {
    return { principal, role: "owner", grants: ALL_GRANTS };
  }
  const [row] = await db
    .select()
    .from(houseMembers)
    .where(and(eq(houseMembers.principalId, houseId), eq(houseMembers.userId, userId)))
    .limit(1);
  if (!row || !isMemberRole(row.role)) return null;
  return { principal, role: row.role, grants: grantsForRole(row.role, row.grants) };
}

export async function listHousesFor(userId: string): Promise<HouseListing[]> {
  if (!userId) return [];
  const { ensureLockHandsColumn } = await import("@/lib/lock/house-hands");
  await ensureLockHandsColumn();
  const db = getDb();
  const [own] = await db.select().from(principals).where(eq(principals.ownerUserId, userId)).limit(1);
  const rows = await db
    .select({
      id: principals.id,
      name: principals.name,
      type: principals.type,
      role: houseMembers.role,
      ownerUserId: principals.ownerUserId,
    })
    .from(houseMembers)
    .innerJoin(principals, eq(principals.id, houseMembers.principalId))
    .where(eq(houseMembers.userId, userId));

  const seen = new Set<string>();
  const list: HouseListing[] = [];
  for (const row of rows) {
    if (!isMemberRole(row.role) || seen.has(row.id)) continue;
    seen.add(row.id);
    list.push({
      id: row.id,
      name: row.name,
      type: isOrgHouse(row) ? "org" : "personal",
      role: row.role,
      own: row.ownerUserId === userId || row.role === "owner",
    });
  }
  if (own && !seen.has(own.id)) {
    list.unshift({ id: own.id, name: own.name, type: isOrgHouse(own) ? "org" : "personal", role: "owner", own: true });
  }
  return list.sort((a, b) => Number(b.own) - Number(a.own) || a.name.localeCompare(b.name));
}

export async function listMembers(principal: HousePrincipal): Promise<MemberView[]> {
  const db = getDb();
  const rows = await db
    .select({
      userId: houseMembers.userId,
      email: users.email,
      role: houseMembers.role,
      grants: houseMembers.grants,
      createdAt: houseMembers.createdAt,
    })
    .from(houseMembers)
    .innerJoin(users, eq(users.id, houseMembers.userId))
    .where(eq(houseMembers.principalId, principal.id));
  const pending = await db
    .select()
    .from(houseInvites)
    .where(
      and(
        eq(houseInvites.principalId, principal.id),
        isNull(houseInvites.acceptedAt),
        gt(houseInvites.expiresAt, new Date()),
      ),
    );
  const members: MemberView[] = rows
    .filter((row) => isMemberRole(row.role))
    .map((row) => ({
      user_id: row.userId,
      email: row.email,
      role: row.role as MemberRole,
      grants: grantsForRole(row.role as MemberRole, row.grants),
      pending: false,
      created_at: row.createdAt.toISOString(),
    }));
  const invited: MemberView[] = pending.map((row) => ({
    user_id: null,
    email: row.email,
    role: roleForGrants(parseGrants(row.grants)),
    grants: parseGrants(row.grants),
    pending: true,
    created_at: row.createdAt.toISOString(),
  }));
  return [...members, ...invited];
}

function roleForGrants(grants: CabinetGrant[]): InviteRole {
  return grants.length > 0 ? "operator" : "observer";
}

async function sendInviteMail(input: {
  principal: HousePrincipal;
  email: string;
  origin: string;
  locale: string;
  inviteToken?: string;
  joined: boolean;
}) {
  const base = input.origin.replace(/\/$/, "");
  const locale = isLocale(input.locale) ? input.locale : "en";
  const t = notifyCopy(locale);
  const houseName = input.principal.name.trim() || "Foyer";
  const url = input.inviteToken
    ? `${base}/${locale}/invite/${input.inviteToken}`
    : `${base}/${locale}/cabinet?house=${encodeURIComponent(input.principal.id)}`;
  const subject = t.inviteSubject.replace("{house}", houseName);
  const body = (input.joined ? t.inviteJoinedBody : t.inviteBody)
    .replace("{house}", houseName)
    .replace("{email}", input.email);
  try {
    await sendMail({ to: input.email, subject, text: `${body}\n\n${url}` });
  } catch {
    // Membership / invite row is stored; owner can invite again to resend.
  }
}

/** A known verified user joins at once; otherwise a pending invite + mail with accept link. */
export async function inviteMember(
  principal: HousePrincipal,
  rawEmail: string,
  grants: CabinetGrant[],
  options?: { origin?: string; locale?: string },
) {
  if (!isOrgHouse(principal)) {
    throw new ProtocolError("forbidden", "Only a company house can invite people", 403);
  }
  const email = parseEmail(rawEmail);
  const origin = (options?.origin || defaultPublicOrigin()).replace(/\/$/, "");
  const locale = options?.locale || principal.contactLocale || "en";
  const db = getDb();
  const current = await listMembers(principal);
  if (current.some((row) => row.email === email && !row.pending)) {
    throw new ProtocolError("conflict", "Already a member", 409);
  }
  if (current.filter((row) => row.role !== "owner").length >= HELPER_CAP) {
    throw new ProtocolError("forbidden", "Too many helpers", 403);
  }
  const role = roleForGrants(grants);
  const [known] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (known?.emailVerified) {
    await db
      .insert(houseMembers)
      .values({ principalId: principal.id, userId: known.id, role, grants })
      .onConflictDoNothing();
    await db
      .delete(houseInvites)
      .where(
        and(eq(houseInvites.principalId, principal.id), eq(houseInvites.email, email), isNull(houseInvites.acceptedAt)),
      );
    await sendInviteMail({ principal, email, origin, locale, joined: true });
    return listMembers(principal);
  }

  const raw = mintToken("inv");
  const tokenHash = hashSecret(raw);
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
  const [pending] = await db
    .select()
    .from(houseInvites)
    .where(
      and(eq(houseInvites.principalId, principal.id), eq(houseInvites.email, email), isNull(houseInvites.acceptedAt)),
    )
    .limit(1);
  if (pending) {
    await db
      .update(houseInvites)
      .set({ grants, tokenHash, expiresAt })
      .where(eq(houseInvites.id, pending.id));
  } else {
    await db.insert(houseInvites).values({
      id: mintToken("inv"),
      principalId: principal.id,
      email,
      grants,
      tokenHash,
      expiresAt,
    });
  }
  await sendInviteMail({ principal, email, origin, locale, inviteToken: raw, joined: false });
  return listMembers(principal);
}

/** Accept a mailed invite link after Clerk sign-in with the same verified email. */
export async function acceptInviteToken(
  raw: string,
  user: { id: string; email: string; emailVerified: boolean },
): Promise<{ principalId: string }> {
  if (!user.emailVerified) {
    throw new ProtocolError("forbidden", "Verify your email first", 403);
  }
  const tokenHash = hashSecret(raw);
  const db = getDb();
  const [row] = await db
    .select()
    .from(houseInvites)
    .where(and(eq(houseInvites.tokenHash, tokenHash), isNull(houseInvites.acceptedAt), gt(houseInvites.expiresAt, new Date())))
    .limit(1);
  if (!row) throw new ProtocolError("not_found", "Unknown or expired invite", 404);
  if (row.email !== user.email.trim().toLowerCase()) {
    throw new ProtocolError("forbidden", "Sign in with the invited email", 403);
  }
  const grants = parseGrants(row.grants);
  await db
    .insert(houseMembers)
    .values({ principalId: row.principalId, userId: user.id, role: roleForGrants(grants), grants })
    .onConflictDoNothing();
  await db
    .update(houseInvites)
    .set({ acceptedAt: new Date(), acceptedUserId: user.id })
    .where(eq(houseInvites.id, row.id));
  return { principalId: row.principalId };
}

export async function peekInviteToken(raw: string): Promise<{
  email: string;
  houseName: string;
  principalId: string;
  expired: boolean;
  accepted: boolean;
} | null> {
  const tokenHash = hashSecret(raw);
  const db = getDb();
  const [row] = await db
    .select({
      email: houseInvites.email,
      principalId: houseInvites.principalId,
      name: principals.name,
      expiresAt: houseInvites.expiresAt,
      acceptedAt: houseInvites.acceptedAt,
    })
    .from(houseInvites)
    .innerJoin(principals, eq(principals.id, houseInvites.principalId))
    .where(eq(houseInvites.tokenHash, tokenHash))
    .limit(1);
  if (!row) return null;
  return {
    email: row.email,
    houseName: row.name.trim() || "Foyer",
    principalId: row.principalId,
    expired: row.expiresAt <= new Date(),
    accepted: Boolean(row.acceptedAt),
  };
}

/** Turn pending invites for this verified email into memberships. */
export async function claimInvites(user: { id: string; email: string; emailVerified: boolean }) {
  if (!user.emailVerified) return;
  const db = getDb();
  const rows = await db
    .select()
    .from(houseInvites)
    .where(
      and(eq(houseInvites.email, user.email), isNull(houseInvites.acceptedAt), gt(houseInvites.expiresAt, new Date())),
    );
  if (rows.length === 0) return;
  for (const row of rows) {
    const grants = parseGrants(row.grants);
    await db
      .insert(houseMembers)
      .values({ principalId: row.principalId, userId: user.id, role: roleForGrants(grants), grants })
      .onConflictDoNothing();
  }
  await db
    .update(houseInvites)
    .set({ acceptedAt: new Date(), acceptedUserId: user.id })
    .where(
      inArray(
        houseInvites.id,
        rows.map((row) => row.id),
      ),
    );
}

async function memberTarget(principal: HousePrincipal, rawEmail: string) {
  const email = parseEmail(rawEmail);
  const db = getDb();
  const [row] = await db
    .select({ userId: houseMembers.userId, role: houseMembers.role })
    .from(houseMembers)
    .innerJoin(users, eq(users.id, houseMembers.userId))
    .where(and(eq(houseMembers.principalId, principal.id), eq(users.email, email)))
    .limit(1);
  return { email, row };
}

export async function saveMemberGrants(principal: HousePrincipal, rawEmail: string, grants: CabinetGrant[]) {
  if (!isOrgHouse(principal)) {
    throw new ProtocolError("forbidden", "Only a company house can invite people", 403);
  }
  const db = getDb();
  const { email, row } = await memberTarget(principal, rawEmail);
  if (row) {
    if (row.role === "owner") throw new ProtocolError("forbidden", "The owner cannot be limited", 403);
    await db
      .update(houseMembers)
      .set({ role: roleForGrants(grants), grants })
      .where(and(eq(houseMembers.principalId, principal.id), eq(houseMembers.userId, row.userId)));
    return listMembers(principal);
  }
  const updated = await db
    .update(houseInvites)
    .set({ grants })
    .where(
      and(eq(houseInvites.principalId, principal.id), eq(houseInvites.email, email), isNull(houseInvites.acceptedAt)),
    )
    .returning({ id: houseInvites.id });
  if (updated.length === 0) throw new ProtocolError("not_found", "Unknown member", 404);
  return listMembers(principal);
}

export async function removeMember(principal: HousePrincipal, rawEmail: string) {
  const db = getDb();
  const { email, row } = await memberTarget(principal, rawEmail);
  if (row?.role === "owner") {
    throw new ProtocolError("forbidden", "The owner cannot be removed", 403);
  }
  if (row) {
    await db
      .delete(houseMembers)
      .where(and(eq(houseMembers.principalId, principal.id), eq(houseMembers.userId, row.userId)));
  }
  await db
    .delete(houseInvites)
    .where(
      and(eq(houseInvites.principalId, principal.id), eq(houseInvites.email, email), isNull(houseInvites.acceptedAt)),
    );
  return listMembers(principal);
}
