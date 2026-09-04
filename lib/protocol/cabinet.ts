import { eq } from "drizzle-orm";
import { principals } from "@/lib/db/schema";
import { getDb } from "@/lib/db";
import type { ActionKind } from "./types";
import { ProtocolError } from "./errors";
import type { HousePrincipal } from "./bundle";

export async function saveConstitution(principal: HousePrincipal, constitution: string) {
  const text = constitution.trim();
  if (!text) throw new ProtocolError("bad_request", "constitution is required", 400);
  const db = getDb();
  await db
    .update(principals)
    .set({ constitution: text, wizardRulesDone: true })
    .where(eq(principals.id, principal.id));
}

export async function saveLocks(principal: HousePrincipal, kinds: unknown) {
  if (!Array.isArray(kinds)) throw new ProtocolError("bad_request", "kinds must be an array", 400);
  const allowed = kinds.filter((kind): kind is ActionKind =>
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
