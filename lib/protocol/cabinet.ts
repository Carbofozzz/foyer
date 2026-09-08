import { eq } from "drizzle-orm";
import { principals } from "@/lib/db/schema";
import { getDb } from "@/lib/db";
import { saveHouseEmail } from "@/lib/notify/contacts";
import type { KnownActionKind, PrincipalType } from "./types";
import { ProtocolError } from "./errors";
import type { HousePrincipal } from "./bundle";

export async function saveConstitution(
  principal: HousePrincipal,
  constitution: string,
  type?: PrincipalType,
) {
  const text = constitution.trim();
  if (!text) throw new ProtocolError("bad_request", "constitution is required", 400);
  const db = getDb();
  await db
    .update(principals)
    .set({
      constitution: text,
      wizardRulesDone: true,
      ...(type === "org" || type === "personal" ? { type } : {}),
    })
    .where(eq(principals.id, principal.id));
}

export async function saveLocks(principal: HousePrincipal, kinds: unknown) {
  if (!Array.isArray(kinds)) throw new ProtocolError("bad_request", "kinds must be an array", 400);
  const allowed = kinds.filter((kind): kind is KnownActionKind =>
    kind === "spend" || kind === "book" || kind === "message",
  );
  if (allowed.length === 0) {
    throw new ProtocolError("bad_request", "Pick at least one kind", 400);
  }
  const db = getDb();
  await db
    .update(principals)
    .set({ lockedKinds: allowed, wizardLockDone: true })
    .where(eq(principals.id, principal.id));
}

export async function markConnectDone(principal: HousePrincipal) {
  const db = getDb();
  await db
    .update(principals)
    .set({ wizardConnectDone: true, wizardHarnessDone: true })
    .where(eq(principals.id, principal.id));
}

/** One save at the end of the cabinet setup wizard. Lock kinds are skipped. */
export async function finishWizard(
  principal: HousePrincipal,
  input: { constitution: string; type?: PrincipalType; email?: unknown; locale?: string; origin?: string },
) {
  const text = input.constitution.trim();
  if (!text) throw new ProtocolError("bad_request", "constitution is required", 400);
  const db = getDb();
  await db
    .update(principals)
    .set({
      constitution: text,
      wizardRulesDone: true,
      wizardLockDone: true,
      wizardConnectDone: true,
      wizardHarnessDone: true,
      ...(input.type === "org" || input.type === "personal" ? { type: input.type } : {}),
    })
    .where(eq(principals.id, principal.id));
  if (input.email !== undefined) {
    await saveHouseEmail(principal, input.email, input.locale ?? "en", input.origin);
  }
}
