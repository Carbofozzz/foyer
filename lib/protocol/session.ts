import { auth } from "@clerk/nextjs/server";
import { resolveUser, type SessionUser } from "./users";

export type { SessionUser };

export function clerkConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);
}

/** Clerk session → our `users` row (upserted on first sight). Null when signed out. */
export async function sessionUser(): Promise<SessionUser | null> {
  if (!clerkConfigured()) return null;
  let subject: string | null = null;
  try {
    subject = (await auth()).userId;
  } catch {
    // Outside the proxy matcher (or no Clerk context): treat as signed out.
    return null;
  }
  if (!subject) return null;
  return resolveUser(subject);
}
