import { desc, eq } from "drizzle-orm";
import { acks, actions, objections } from "@/lib/db/schema";
import { getDb } from "@/lib/db";
import { mintToken } from "./keys";
import { ProtocolError } from "./errors";
import { engagedIds, loadActionBundle, lockedKinds, serializeAction, type HouseAuth } from "./bundle";
import { parseCounterAction, parseEvidence, parseKind, parsePayload } from "./parse";
import { executeAfterAck } from "./execute";

export async function proposeAction(auth: HouseAuth, body: Record<string, unknown>, now: Date) {
  const kind = parseKind(body.kind);
  const allowed = lockedKinds(auth.principal);
  if (kind !== "cancel" && !allowed.includes(kind)) {
    throw new ProtocolError("forbidden", "This kind is not locked through the gateway", 403);
  }
  const payload = parsePayload(kind, body.payload ?? body);
  const justification = typeof body.justification === "string" ? body.justification.trim() : "";
  if (!justification) throw new ProtocolError("bad_request", "justification is required", 400);
  const evidence = parseEvidence(body.evidence);
  const id = mintToken("act");
  const db = getDb();
  await db.insert(actions).values({
    id,
    principalId: auth.principal.id,
    proposerId: auth.agent.id,
    kind,
    payload,
    justification,
    evidence,
    status: "open",
    silenceUntil: new Date(now.getTime() + auth.principal.silenceWindowSec * 1000),
  });
  const bundle = await loadActionBundle(id);
  if (!bundle) throw new ProtocolError("internal", "Failed to load action", 500);
  return serializeAction(bundle);
}

export async function fileObjection(
  auth: HouseAuth,
  actionId: string,
  body: Record<string, unknown>,
  _now: Date,
) {
  const bundle = await loadActionBundle(actionId);
  if (!bundle || bundle.action.principalId !== auth.principal.id) {
    throw new ProtocolError("not_found", "Unknown house", 404);
  }
  if (bundle.action.status !== "open") {
    throw new ProtocolError("conflict", "Silence window is closed", 409);
  }
  if (bundle.objections.some((row) => row.objectorId === auth.agent.id)) {
    throw new ProtocolError("conflict", "Already objected", 409);
  }
  const justification = typeof body.justification === "string" ? body.justification.trim() : "";
  if (!justification) throw new ProtocolError("bad_request", "justification is required", 400);
  const evidence = parseEvidence(body.evidence);
  const counter = parseCounterAction(body.counter_action);
  const objectionId = mintToken("obj");
  const db = getDb();
  await db.insert(objections).values({
    id: objectionId,
    actionId,
    objectorId: auth.agent.id,
    justification,
    evidence,
    bond: "0",
    counterAction: counter,
  });
  const next = await loadActionBundle(actionId);
  if (!next) throw new ProtocolError("internal", "Failed to load action", 500);
  return serializeAction(next);
}

export async function ackAction(auth: HouseAuth, actionId: string) {
  const bundle = await loadActionBundle(actionId);
  if (!bundle || bundle.action.principalId !== auth.principal.id) {
    throw new ProtocolError("not_found", "Unknown house", 404);
  }
  if (bundle.action.status !== "awaiting_ack") {
    throw new ProtocolError("conflict", "Ack is not owed on this action", 409);
  }
  const engaged = engagedIds(
    bundle.action.proposerId,
    bundle.objections.map((row) => row.objectorId),
  );
  if (!engaged.includes(auth.agent.id)) {
    throw new ProtocolError("forbidden", "This agent is not engaged", 403);
  }
  if (bundle.acks.some((row) => row.agentId === auth.agent.id)) {
    return serializeAction(bundle);
  }
  const db = getDb();
  await db.insert(acks).values({
    actionId,
    agentId: auth.agent.id,
    source: "explicit",
  });
  const next = await loadActionBundle(actionId);
  if (!next) throw new ProtocolError("internal", "Failed to load action", 500);
  if (engaged.every((id) => next.acks.some((row) => row.agentId === id))) {
    await executeAfterAck(actionId);
  }
  const done = await loadActionBundle(actionId);
  if (!done) throw new ProtocolError("internal", "Failed to load action", 500);
  return serializeAction(done);
}

export async function getAction(auth: HouseAuth, actionId: string) {
  const bundle = await loadActionBundle(actionId);
  if (!bundle || bundle.action.principalId !== auth.principal.id) {
    throw new ProtocolError("not_found", "Unknown house", 404);
  }
  return serializeAction(bundle);
}

export async function inboxFor(auth: HouseAuth) {
  return inboxForPrincipal(auth.principal.id);
}

export async function inboxForPrincipal(principalId: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(actions)
    .where(eq(actions.principalId, principalId))
    .orderBy(desc(actions.createdAt));
  const items = [];
  for (const row of rows) {
    const bundle = await loadActionBundle(row.id);
    if (!bundle) continue;
    items.push({
      type: "action" as const,
      ...serializeAction(bundle),
    });
  }
  return { items };
}

export async function recordTimeoutAcks(actionId: string, missing: string[]) {
  const db = getDb();
  for (const agentId of missing) {
    await db.insert(acks).values({ actionId, agentId, source: "timeout" }).onConflictDoNothing();
  }
}
