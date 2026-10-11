import { currentUser } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { adminAuditLog, users } from "@/lib/db/schema";
import { getDb } from "@/lib/db";
import { ProtocolError } from "./errors";
import { ensurePersonalHouseForUser } from "./houses";
import { mintToken } from "./keys";
import { claimInvites } from "./members";
import { PLATFORM_ROLES, type PlatformRole } from "./types";

export type SessionUser = typeof users.$inferSelect;

/** Re-read the Clerk profile at most this often; otherwise trust the stored row. */
const PROFILE_REFRESH_MS = 10 * 60 * 1000;

export function adminEmails(): Set<string> {
  const raw = process.env.FOYER_ADMIN_EMAILS ?? "";
  return new Set(
    raw
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function platformRole(user: Pick<SessionUser, "platformRole">): PlatformRole {
  return (PLATFORM_ROLES as readonly string[]).includes(user.platformRole) ? (user.platformRole as PlatformRole) : "none";
}

export function isPlatformAdmin(user: Pick<SessionUser, "platformRole"> | null | undefined): boolean {
  if (!user) return false;
  const role = platformRole(user);
  return role === "ops" || role === "owner";
}

/** Only a verified listed email is promoted. Env is the source of truth for promotion. */
function bootstrapRole(email: string, verified: boolean, current: string): string {
  if (verified && adminEmails().has(email)) return "owner";
  return current;
}

export async function upsertUser(input: {
  subject: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
}): Promise<SessionUser> {
  const db = getDb();
  const email = input.email.trim().toLowerCase();
  const now = new Date();
  const [bySubject] = await db.select().from(users).where(eq(users.authSubject, input.subject)).limit(1);
  let row: SessionUser | undefined;
  if (bySubject) {
    [row] = await db
      .update(users)
      .set({
        email,
        emailVerified: input.emailVerified,
        name: input.name,
        platformRole: bootstrapRole(email, input.emailVerified, bySubject.platformRole),
        lastSeenAt: now,
      })
      .where(eq(users.id, bySubject.id))
      .returning();
  } else {
    const [byEmail] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (byEmail) {
      // A recreated Clerk account may only take over the row with a verified email.
      if (!input.emailVerified) throw new ProtocolError("conflict", "Email already in use", 409);
      [row] = await db
        .update(users)
        .set({
          authSubject: input.subject,
          emailVerified: true,
          name: input.name,
          platformRole: bootstrapRole(email, true, byEmail.platformRole),
          lastSeenAt: now,
        })
        .where(eq(users.id, byEmail.id))
        .returning();
    } else {
      [row] = await db
        .insert(users)
        .values({
          id: mintToken("usr"),
          authSubject: input.subject,
          email,
          emailVerified: input.emailVerified,
          name: input.name,
          platformRole: bootstrapRole(email, input.emailVerified, "none"),
          lastSeenAt: now,
        })
        .onConflictDoNothing()
        .returning();
      if (!row) {
        // Parallel first request already inserted this subject.
        [row] = await db.select().from(users).where(eq(users.authSubject, input.subject)).limit(1);
      }
    }
  }
  if (!row) throw new ProtocolError("internal", "Failed to open account", 500);
  await ensurePersonalHouseForUser(row.id);
  if (row.emailVerified) await claimInvites(row);
  return row;
}

/** Map a Clerk subject to our row. Calls the Clerk API only on first sight or a stale profile. */
export async function resolveUser(subject: string): Promise<SessionUser | null> {
  const db = getDb();
  const [row] = await db.select().from(users).where(eq(users.authSubject, subject)).limit(1);
  const fresh = row?.lastSeenAt && Date.now() - row.lastSeenAt.getTime() < PROFILE_REFRESH_MS;
  if (row && fresh && bootstrapRole(row.email, row.emailVerified, row.platformRole) === row.platformRole) {
    return row;
  }
  const profile = await currentUser();
  if (!profile || profile.id !== subject) return row ?? null;
  const primary =
    profile.emailAddresses.find((item) => item.id === profile.primaryEmailAddressId) ?? profile.emailAddresses[0];
  const email = primary?.emailAddress ?? `${subject}@clerk.invalid`;
  const name = [profile.firstName, profile.lastName].filter(Boolean).join(" ").trim() || profile.username || null;
  return upsertUser({
    subject,
    email,
    emailVerified: primary?.verification?.status === "verified",
    name,
  });
}

/** Platform desk gate. Anyone else gets 404 so the desk is not advertised. */
export function requirePlatformAdmin(user: SessionUser | null): SessionUser {
  if (!user || !isPlatformAdmin(user)) throw new ProtocolError("not_found", "Not found", 404);
  return user;
}

export async function auditAdmin(
  actor: SessionUser,
  entry: { op: string; targetType: string; targetId: string; meta?: Record<string, unknown> },
) {
  const db = getDb();
  await db.insert(adminAuditLog).values({
    id: mintToken("aud"),
    actorUserId: actor.id,
    op: entry.op,
    targetType: entry.targetType,
    targetId: entry.targetId,
    meta: entry.meta ?? {},
  });
}
