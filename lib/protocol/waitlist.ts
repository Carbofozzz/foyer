import { desc } from "drizzle-orm";
import { waitlist } from "@/lib/db/schema";
import { getDb } from "@/lib/db";
import { ProtocolError } from "./errors";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseWaitlistEmail(raw: string): string {
  const email = raw.trim().toLowerCase();
  if (!EMAIL.test(email) || email.length > 254) {
    throw new ProtocolError("bad_request", "email is invalid", 400);
  }
  return email;
}

/** Free-while-we-test list. Same address twice is a no-op. */
export async function joinWaitlist(email: string, locale: string) {
  const db = getDb();
  await db
    .insert(waitlist)
    .values({ email, locale })
    .onConflictDoNothing({ target: waitlist.email });
  return { ok: true as const };
}

export async function listWaitlist() {
  const db = getDb();
  return db.select().from(waitlist).orderBy(desc(waitlist.createdAt));
}
