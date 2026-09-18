import { and, desc, eq, inArray, notInArray } from "drizzle-orm";
import { acks, actions, objections } from "@/lib/db/schema";
import { getDb } from "@/lib/db";
import { mintToken } from "./keys";
import { ProtocolError } from "./errors";
import { engagedIds, loadActionBundle, loadActionBundles, serializeAction, type HouseAuth } from "./bundle";
import { INBOX_RECENT_LIMIT, LIVE_ACTION_STATUSES } from "./types";
import { parseCounterAction, parseEvidence, parsePayload } from "./parse";
import { executeAfterAck } from "./execute";
import { assertHouseProposeRoom, assertJustification } from "./abuse";
import { enqueueWakes } from "@/lib/notify/wake";
import { writeHash, stampActionWrite } from "./write-hash";
import { verifyWriteSign, writeSignFrom, writeSignStamp, type WriteSignOffer } from "./write-sign";

export async function proposeAction(
  auth: HouseAuth,
  body: Record<string, unknown>,
  now: Date,
  options?: { origin?: string; testPass?: boolean; sign?: WriteSignOffer },
) {
  const payload = parsePayload(body.payload ?? body);
  const justification = typeof body.justification === "string" ? body.justification.trim() : "";
  if (!justification) throw new ProtocolError("bad_request", "justification is required", 400);
  assertJustification(justification);
  const evidence = parseEvidence(body.evidence);
  await assertHouseProposeRoom(auth.principal.id);
  const proof = await verifyWriteSign(
    auth,
    { op: "propose", payload, justification, evidence },
    options?.sign ?? writeSignFrom(undefined, body),
    { skip: Boolean(options?.testPass) },
  );
  const id = mintToken("act");
  const hash = writeHash({ op: "propose", payload, justification, evidence });
  const db = getDb();
  await db.insert(actions).values({
    id,
    principalId: auth.principal.id,
    proposerId: auth.agent.id,
    kind: "",
    payload,
    justification,
    evidence,
    payloadHash: hash,
    lastWriteOp: "propose",
    lastWriteHash: hash,
    ...writeSignStamp(proof),
    status: "open",
    silenceUntil: new Date(now.getTime() + auth.principal.silenceWindowSec * 1000),
    testPass: Boolean(options?.testPass),
  });
  if (!options?.testPass) {
    await enqueueWakes({
      actionId: id,
      principalId: auth.principal.id,
      proposerId: auth.agent.id,
      revision: 1,
      origin: options?.origin,
    });
  }
  const bundle = await loadActionBundle(id);
  if (!bundle) throw new ProtocolError("internal", "Failed to load action", 500);
  return serializeAction(bundle);
}

export async function fileObjection(
  auth: HouseAuth,
  actionId: string,
  body: Record<string, unknown>,
  _now: Date,
  options?: { sign?: WriteSignOffer; skipSign?: boolean },
) {
  const bundle = await loadActionBundle(actionId);
  if (!bundle || bundle.action.principalId !== auth.principal.id) {
    throw new ProtocolError("not_found", "Unknown house", 404);
  }
  if (bundle.action.status !== "open") {
    throw new ProtocolError("conflict", "Silence window is closed", 409);
  }
  if (bundle.objections.some((row) => row.objectorId === auth.agent.id && row.revision === bundle.action.revision)) {
    throw new ProtocolError("conflict", "Already objected", 409);
  }
  const justification = typeof body.justification === "string" ? body.justification.trim() : "";
  if (!justification) throw new ProtocolError("bad_request", "justification is required", 400);
  assertJustification(justification);
  const evidence = parseEvidence(body.evidence);
  const counter = parseCounterAction(body.counter_action);
  const proof = await verifyWriteSign(
    auth,
    { op: "object", action_id: actionId, justification, evidence, counter_action: counter },
    options?.sign ?? writeSignFrom(undefined, body),
    { skip: Boolean(options?.skipSign || bundle.action.testPass) },
  );
  const objectionId = mintToken("obj");
  const hash = writeHash({ op: "object", justification, evidence, counter_action: counter });
  const db = getDb();
  await db.insert(objections).values({
    id: objectionId,
    actionId,
    objectorId: auth.agent.id,
    revision: bundle.action.revision,
    justification,
    evidence,
    payloadHash: hash,
    bond: "0",
    counterAction: counter,
  });
  await stampActionWrite(actionId, "object", hash, writeSignStamp(proof));
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
  const live = [...LIVE_ACTION_STATUSES];
  const [liveRows, recent] = await Promise.all([
    db
      .select({ id: actions.id, createdAt: actions.createdAt })
      .from(actions)
      .where(and(eq(actions.principalId, principalId), inArray(actions.status, live))),
    db
      .select({ id: actions.id, createdAt: actions.createdAt })
      .from(actions)
      .where(and(eq(actions.principalId, principalId), notInArray(actions.status, live)))
      .orderBy(desc(actions.createdAt), desc(actions.id))
      .limit(INBOX_RECENT_LIMIT),
  ]);
  const seen = new Set<string>();
  const ids: string[] = [];
  const ordered = [...liveRows, ...recent].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id),
  );
  for (const row of ordered) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    ids.push(row.id);
  }
  const bundles = await loadActionBundles(ids);
  const byId = new Map(bundles.map((bundle) => [bundle.action.id, bundle]));
  const items = [];
  for (const id of ids) {
    const bundle = byId.get(id);
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
