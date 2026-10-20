import { and, eq, inArray } from "drizzle-orm";
import { grantAudit, grants, principals } from "@/lib/db/schema";
import { getDb } from "@/lib/db";
import { actionPayload, type ActionRow } from "@/lib/protocol/bundle";
import { ProtocolError } from "@/lib/protocol/errors";
import { mintToken } from "@/lib/protocol/keys";
import { notifyCopy, sendMail } from "@/lib/notify/mail";
import { sendTelegram } from "@/lib/notify/telegram";
import { constraintMismatch, handFromPayload } from "./hands";
import { lockHandsFor } from "./house-hands";
import { grantSigningKeyConfigured, verifyGrantJwt, type GrantClaims } from "./jwt";
import { tokenForGrant } from "./token";
import { ensureGrantTables } from "./store";

const DEFAULT_TTL_SEC = 15 * 60;

export type GrantRow = typeof grants.$inferSelect;

export async function mintGrantForPermit(
  action: ActionRow,
  decision: "silence" | "court" | "human",
): Promise<GrantRow | null> {
  await ensureGrantTables();
  const payload = actionPayload(action);
  let intent: ReturnType<typeof handFromPayload>;
  try {
    intent = handFromPayload(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "bad hand";
    throw new ProtocolError("bad_request", message, 400);
  }
  if (!intent) return null;
  const enabled = await lockHandsFor(action.principalId);
  if (!enabled.includes(intent.hand)) return null;
  if (!grantSigningKeyConfigured()) {
    throw new ProtocolError("grant_unconfigured", "FOYER_GRANT_SIGNING_KEY is not set", 503);
  }

  const db = getDb();
  const [existing] = await db.select().from(grants).where(eq(grants.actionId, action.id)).limit(1);
  if (existing) return existing;

  const ttl = grantTtlSec();
  const row: typeof grants.$inferInsert = {
    id: mintToken("grn"),
    actionId: action.id,
    principalId: action.principalId,
    agentId: action.proposerId,
    hand: intent.hand,
    constraints: intent.constraints,
    expiresAt: new Date(Date.now() + ttl * 1000),
    usesRemaining: 1,
    status: "active",
    decision,
    payloadHash: action.payloadHash || "",
  };
  await db.insert(grants).values(row).onConflictDoNothing({ target: grants.actionId });
  const [saved] = await db.select().from(grants).where(eq(grants.actionId, action.id)).limit(1);
  if (!saved) throw new ProtocolError("internal", "Failed to mint grant", 500);
  if (saved.id === row.id) {
    await writeAudit({
      grantId: saved.id,
      actionId: saved.actionId,
      principalId: saved.principalId,
      agentId: saved.agentId,
      kind: "grant",
      hand: saved.hand,
      detail: { decision, constraints: saved.constraints },
    });
  }
  return saved;
}

export { tokenForGrant };

export async function consumeGrant(input: {
  token: string;
  agentId: string;
  principalId: string;
  args: Record<string, unknown>;
  invocationId: string;
  model?: string;
  provider?: string;
}): Promise<{ grant_id: string; invocation_id: string; hand: string; status: "consumed" }> {
  await ensureGrantTables();
  let claims: GrantClaims;
  try {
    claims = verifyGrantJwt(input.token);
  } catch {
    throw new ProtocolError("unauthorized", "Grant token rejected", 401);
  }
  if (claims.exp * 1000 <= Date.now()) throw new ProtocolError("conflict", "Grant expired", 409);
  if (claims.agent_id !== input.agentId) throw new ProtocolError("forbidden", "Grant is for another agent", 403);

  const db = getDb();
  const [row] = await db.select().from(grants).where(eq(grants.id, claims.grant_id)).limit(1);
  if (!row || row.principalId !== input.principalId) throw new ProtocolError("not_found", "Unknown grant", 404);
  if (row.hand !== claims.hand) throw new ProtocolError("unauthorized", "Grant token rejected", 401);

  const mismatch = constraintMismatch(row.hand, row.constraints, input.args);
  if (mismatch) throw new ProtocolError("conflict", `Grant does not allow this ${mismatch}`, 409);

  const replay = await findInvocation(row.id, input.invocationId);
  if (replay) {
    return { grant_id: row.id, invocation_id: input.invocationId, hand: row.hand, status: "consumed" };
  }
  if (row.status === "revoked") throw new ProtocolError("conflict", "Grant revoked", 409);
  if (row.status === "consumed") throw new ProtocolError("conflict", "Grant already used", 409);
  if (row.status !== "active" || row.expiresAt.getTime() <= Date.now()) {
    throw new ProtocolError("conflict", "Grant expired", 409);
  }

  const updated = await db
    .update(grants)
    .set({ status: "consumed", usesRemaining: 0 })
    .where(and(eq(grants.id, row.id), eq(grants.status, "active")))
    .returning({ id: grants.id });
  if (updated.length === 0) {
    const again = await findInvocation(row.id, input.invocationId);
    if (again) return { grant_id: row.id, invocation_id: input.invocationId, hand: row.hand, status: "consumed" };
    throw new ProtocolError("conflict", "Grant already used", 409);
  }

  await writeAudit({
    grantId: row.id,
    actionId: row.actionId,
    principalId: row.principalId,
    agentId: row.agentId,
    kind: "invocation",
    hand: row.hand,
    detail: { args: input.args },
    model: input.model ?? "",
    provider: input.provider ?? "",
    invocationId: input.invocationId,
  });
  return { grant_id: row.id, invocation_id: input.invocationId, hand: row.hand, status: "consumed" };
}

/** Facilitator check. The JWT is the credential. Does not consume and does not settle. */
export async function introspectGrant(token: string, invocationId?: string) {
  await ensureGrantTables();
  let claims: GrantClaims;
  try {
    claims = verifyGrantJwt(token);
  } catch {
    throw new ProtocolError("unauthorized", "Grant token rejected", 401);
  }
  const db = getDb();
  const [row] = await db.select().from(grants).where(eq(grants.id, claims.grant_id)).limit(1);
  if (!row || row.hand !== claims.hand) throw new ProtocolError("not_found", "Unknown grant", 404);
  const invocation = invocationId ? await findInvocation(row.id, invocationId) : null;
  const args =
    invocation?.detail && typeof invocation.detail === "object" && "args" in invocation.detail
      ? (invocation.detail.args as Record<string, unknown>)
      : null;
  return {
    grant_id: row.id,
    hand: row.hand,
    status: row.status,
    constraints: row.constraints,
    expires_at: row.expiresAt.toISOString(),
    invocation: invocation ? { invocation_id: invocationId, args } : null,
  };
}

export async function expireGrants(principalId: string, now: Date): Promise<number> {
  await ensureGrantTables();
  const db = getDb();
  const rows = await db
    .select()
    .from(grants)
    .where(and(eq(grants.principalId, principalId), eq(grants.status, "active")));
  let n = 0;
  for (const row of rows) {
    if (row.expiresAt > now) continue;
    const updated = await db
      .update(grants)
      .set({ status: "expired" })
      .where(and(eq(grants.id, row.id), eq(grants.status, "active")))
      .returning({ id: grants.id });
    if (updated.length) n += 1;
  }
  return n;
}

export async function revokeGrants(input: {
  principalId: string;
  agentId?: string | null;
  grantId?: string | null;
}): Promise<number> {
  await ensureGrantTables();
  const db = getDb();
  const live = await db
    .select()
    .from(grants)
    .where(and(eq(grants.principalId, input.principalId), eq(grants.status, "active")));
  const targets = live.filter((row) => {
    if (input.grantId && row.id !== input.grantId) return false;
    if (input.agentId && row.agentId !== input.agentId) return false;
    return true;
  });
  for (const row of targets) {
    await db.update(grants).set({ status: "revoked" }).where(and(eq(grants.id, row.id), eq(grants.status, "active")));
    await writeAudit({
      grantId: row.id,
      actionId: row.actionId,
      principalId: row.principalId,
      agentId: row.agentId,
      kind: "revoke",
      hand: row.hand,
      detail: { scope: input.grantId ? "grant" : input.agentId ? "agent" : "house" },
    });
  }
  if (targets.length) await notifyRevoke(input.principalId, targets.length);
  return targets.length;
}

export async function exportGrantJournal(principalId: string) {
  await ensureGrantTables();
  const db = getDb();
  const issued = await db.select().from(grants).where(eq(grants.principalId, principalId));
  const ids = issued.map((row) => row.id);
  const events = ids.length ? await db.select().from(grantAudit).where(inArray(grantAudit.grantId, ids)) : [];
  return {
    grants: issued.map(publicGrant),
    events: events.map((row) => ({
      id: row.id,
      grant_id: row.grantId,
      action_id: row.actionId,
      agent_id: row.agentId,
      kind: row.kind,
      hand: row.hand,
      detail: row.detail,
      model: row.model || null,
      provider: row.provider || null,
      invocation_id: row.invocationId || null,
      at: row.createdAt.toISOString(),
    })),
  };
}

export async function recordGrantReport(actionId: string, agentId: string): Promise<void> {
  await ensureGrantTables();
  const db = getDb();
  const [row] = await db.select().from(grants).where(eq(grants.actionId, actionId)).limit(1);
  if (!row) return;
  await writeAudit({
    grantId: row.id,
    actionId,
    principalId: row.principalId,
    agentId,
    kind: "report",
    hand: row.hand,
    detail: {},
  });
}

export async function grantsByAction(actionIds: string[]): Promise<Map<string, GrantRow>> {
  await ensureGrantTables();
  const ids = [...new Set(actionIds.filter(Boolean))];
  const map = new Map<string, GrantRow>();
  if (!ids.length) return map;
  const rows = await getDb().select().from(grants).where(inArray(grants.actionId, ids));
  for (const row of rows) map.set(row.actionId, row);
  return map;
}

export function publicGrant(row: GrantRow) {
  return {
    grant_id: row.id,
    action_id: row.actionId,
    agent_id: row.agentId,
    hand: row.hand,
    constraints: row.constraints,
    expires_at: row.expiresAt.toISOString(),
    uses_remaining: row.usesRemaining,
    status: row.status,
    decision: row.decision,
    payload_hash: row.payloadHash || null,
  };
}

function grantTtlSec(): number {
  const raw = Number(process.env.FOYER_GRANT_TTL_SEC ?? DEFAULT_TTL_SEC);
  if (!Number.isFinite(raw) || raw < 30) return DEFAULT_TTL_SEC;
  return Math.floor(raw);
}

async function findInvocation(grantId: string, invocationId: string) {
  if (!invocationId) return null;
  const [row] = await getDb()
    .select({ id: grantAudit.id, detail: grantAudit.detail })
    .from(grantAudit)
    .where(and(eq(grantAudit.grantId, grantId), eq(grantAudit.invocationId, invocationId), eq(grantAudit.kind, "invocation")))
    .limit(1);
  return row ?? null;
}

async function writeAudit(input: {
  grantId: string;
  actionId: string;
  principalId: string;
  agentId: string | null;
  kind: string;
  hand: string;
  detail: Record<string, unknown>;
  model?: string;
  provider?: string;
  invocationId?: string;
}) {
  await getDb()
    .insert(grantAudit)
    .values({
      id: mintToken("gau"),
      grantId: input.grantId,
      actionId: input.actionId,
      principalId: input.principalId,
      agentId: input.agentId,
      kind: input.kind,
      hand: input.hand,
      detail: input.detail,
      model: input.model ?? "",
      provider: input.provider ?? "",
      invocationId: input.invocationId ?? "",
    });
}

async function notifyRevoke(principalId: string, count: number) {
  const [principal] = await getDb().select().from(principals).where(eq(principals.id, principalId)).limit(1);
  if (!principal) return;
  const copy = notifyCopy(principal.contactLocale);
  const text = copy.lockRevokeBody.replace("{n}", String(count));
  try {
    if (principal.telegramChatId) {
      await sendTelegram(principal.telegramChatId, text);
      return;
    }
    if (principal.contactEmail && principal.emailVerifiedAt) {
      await sendMail({ to: principal.contactEmail, subject: copy.lockRevokeSubject, text });
    }
  } catch (error) {
    console.error("[lock] revoke notify failed", error);
  }
}
