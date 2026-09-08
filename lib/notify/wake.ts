import { createHmac } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { actions, agents, cases, verdicts, wakes } from "@/lib/db/schema";
import { getDb } from "@/lib/db";
import { defaultPublicOrigin } from "@/lib/mcp/config";
import type { HousePrincipal } from "@/lib/protocol/bundle";
import { mintToken } from "@/lib/protocol/keys";
import { unsealKey } from "@/lib/protocol/seal";
import { isBidirectionalWake } from "@/lib/protocol/types";

const MAX_ATTEMPTS = 5;
const FETCH_MS = 4000;
const SWEEP_LIMIT = 6;

export type WakeGate = "pending" | "failed" | "ready";

export function signWakeBody(secret: string, timestamp: string, body: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

export async function enqueueWakes(input: {
  actionId: string;
  principalId: string;
  proposerId: string;
  revision: number;
  origin?: string;
}): Promise<void> {
  const origin = input.origin || defaultPublicOrigin();
  const db = getDb();
  const houseAgents = await db.select().from(agents).where(eq(agents.principalId, input.principalId));
  const proposer = houseAgents.find((row) => row.id === input.proposerId);
  if (proposer?.isGuardian) return;
  const targets = houseAgents.filter(
    (row) =>
      row.id !== input.proposerId &&
      !row.isGuardian &&
      isBidirectionalWake(row.wake),
  );
  for (const agent of targets) {
    await db
      .insert(wakes)
      .values({
        id: mintToken("wak"),
        actionId: input.actionId,
        agentId: agent.id,
        revision: input.revision,
        status: "pending",
        attempts: 0,
        error: null,
      })
      .onConflictDoNothing({ target: [wakes.actionId, wakes.agentId, wakes.revision] });
  }
  await deliverActionWakes(input.actionId, origin);
}

export async function deliverPendingWakes(principalId: string, origin: string, limit = SWEEP_LIMIT): Promise<number> {
  const db = getDb();
  const houseActions = await db.select({ id: actions.id }).from(actions).where(eq(actions.principalId, principalId));
  if (houseActions.length === 0) return 0;
  const ids = houseActions.map((row) => row.id);
  const pending = await db
    .select()
    .from(wakes)
    .where(and(inArray(wakes.actionId, ids), eq(wakes.status, "pending")));
  const agentIds = [...new Set(pending.map((row) => row.agentId))];
  const houseAgents =
    agentIds.length === 0 ? [] : await db.select().from(agents).where(inArray(agents.id, agentIds));
  const kind = new Map(houseAgents.map((row) => [row.id, row.wake]));
  const callbackFirst = pending.sort((a, b) => {
    const aHook = kind.get(a.agentId) === "callback" ? 0 : 1;
    const bHook = kind.get(b.agentId) === "callback" ? 0 : 1;
    return aHook - bHook || a.id.localeCompare(b.id);
  });
  let sent = 0;
  for (const row of callbackFirst) {
    if (sent >= limit) break;
    const did = await deliverOne(row, origin);
    if (did !== "skip") sent += 1;
  }
  return sent;
}

export async function deliverActionWakes(actionId: string, origin: string): Promise<void> {
  const db = getDb();
  const pending = await db
    .select()
    .from(wakes)
    .where(and(eq(wakes.actionId, actionId), eq(wakes.status, "pending")));
  for (const row of pending) {
    await deliverOne(row, origin);
  }
}

export async function requiredWakeGate(actionId: string, revision: number): Promise<WakeGate> {
  const db = getDb();
  const rows = await db
    .select()
    .from(wakes)
    .where(and(eq(wakes.actionId, actionId), eq(wakes.revision, revision)));
  if (rows.length === 0) return "ready";
  const agentIds = [...new Set(rows.map((row) => row.agentId))];
  const houseAgents = await db.select().from(agents).where(inArray(agents.id, agentIds));
  const byId = new Map(houseAgents.map((row) => [row.id, row]));
  const required = rows.filter((row) => {
    const agent = byId.get(row.agentId);
    return agent?.wake === "callback" && Boolean(agent.callbackUrl);
  });
  if (required.some((row) => row.status === "failed")) return "failed";
  if (required.some((row) => row.status === "pending")) return "pending";
  return "ready";
}

export async function escalateUnreachable(principal: HousePrincipal, actionId: string, now: Date): Promise<void> {
  await escalateOffline(principal, actionId, now, "A required checker did not receive the request.");
}

/** Offline escalate. Never submits GenLayer. Skips if insist already claimed a case. */
export async function escalateOffline(
  principal: HousePrincipal,
  actionId: string,
  now: Date,
  reasoning: string,
): Promise<void> {
  const db = getDb();
  const [action] = await db.select().from(actions).where(eq(actions.id, actionId)).limit(1);
  if (!action || (action.status !== "open" && action.status !== "bargaining")) return;
  if (action.insistedAt) return;
  const [existing] = await db.select().from(cases).where(eq(cases.actionId, actionId)).limit(1);
  if (existing?.tx) return;
  const caseId = existing?.id ?? mintToken("cas");
  if (!existing) {
    await db.insert(cases).values({
      id: caseId,
      actionId,
      constitutionSnapshot: principal.constitution,
      status: "judged",
      tx: null,
      txErrors: 0,
    });
  } else {
    await db.update(cases).set({ status: "judged" }).where(eq(cases.id, caseId));
  }
  const [verdict] = await db.select().from(verdicts).where(eq(verdicts.caseId, caseId)).limit(1);
  if (!verdict) {
    await db.insert(verdicts).values({
      id: mintToken("vrd"),
      caseId,
      outcome: "escalate",
      remedyAction: null,
      reasoning,
      objectionGrounded: false,
      judge: "offline",
      tx: null,
      appealOf: null,
      escalateExternal: false,
    });
  }
  await db
    .update(actions)
    .set({
      status: "escalated",
      appealUntil: new Date(now.getTime() + principal.appealWindowSec * 1000),
    })
    .where(eq(actions.id, actionId));
}

async function deliverOne(
  row: typeof wakes.$inferSelect,
  origin: string,
): Promise<"ok" | "fail" | "skip"> {
  const db = getDb();
  const [agent] = await db.select().from(agents).where(eq(agents.id, row.agentId)).limit(1);
  const [action] = await db.select().from(actions).where(eq(actions.id, row.actionId)).limit(1);
  if (!agent || !action) return "skip";
  if (agent.wake === "hosted") {
    await markWake(row, "delivered", row.attempts, null);
    return "skip";
  }
  if (!agent.callbackUrl) {
    return "skip";
  }
  if (!agent.sealedCallbackSecret) {
    await markWake(row, "failed", row.attempts + 1, "callback secret missing");
    return "fail";
  }
  const secret = unsealKey(agent.sealedCallbackSecret);
  const timestamp = String(Date.now());
  const body = JSON.stringify({
    action_id: action.id,
    revision: row.revision,
    silence_until: action.silenceUntil.toISOString(),
    inbox_url: `${origin.replace(/\/$/, "")}/api/inbox`,
  });
  const signature = signWakeBody(secret, timestamp, body);
  const attempts = row.attempts + 1;
  try {
    const response = await fetch(agent.callbackUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-foyer-timestamp": timestamp,
        "x-foyer-signature": `v1=${signature}`,
        "user-agent": "Foyer-Wake/1",
      },
      body,
      signal: AbortSignal.timeout(FETCH_MS),
    });
    if (response.ok) {
      await markWake(row, "delivered", attempts, null);
      return "ok";
    }
    const error = `http ${response.status}`;
    await markWake(row, attempts >= MAX_ATTEMPTS ? "failed" : "pending", attempts, error);
    return "fail";
  } catch (error) {
    const message = error instanceof Error ? error.message : "fetch failed";
    await markWake(row, attempts >= MAX_ATTEMPTS ? "failed" : "pending", attempts, message);
    return "fail";
  }
}

async function markWake(
  row: typeof wakes.$inferSelect,
  status: "pending" | "delivered" | "failed",
  attempts: number,
  error: string | null,
) {
  const db = getDb();
  await db
    .update(wakes)
    .set({ status, attempts, error, updatedAt: new Date() })
    .where(eq(wakes.id, row.id));
}
