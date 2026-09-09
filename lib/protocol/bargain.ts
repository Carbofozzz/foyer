import { and, eq, lte } from "drizzle-orm";
import { actions } from "@/lib/db/schema";
import { getDb } from "@/lib/db";
import { REASON_BARGAIN_TIMEOUT } from "@/lib/notify/reasons";
import { enqueueWakes, escalateOffline } from "@/lib/notify/wake";
import { scheduleOpenCourt } from "./court";
import { ProtocolError } from "./errors";
import { MAX_REVISION } from "./types";
import { loadActionBundle, serializeAction, type HouseAuth, type HousePrincipal } from "./bundle";
import { assertJustification } from "./abuse";
import { parseEvidence, parsePayload } from "./parse";

export async function enterBargain(actionId: string, principalSilenceSec: number, now: Date): Promise<void> {
  const db = getDb();
  await db
    .update(actions)
    .set({
      status: "bargaining",
      bargainUntil: new Date(now.getTime() + principalSilenceSec * 1000),
    })
    .where(and(eq(actions.id, actionId), eq(actions.status, "open")));
}

export async function timeoutBargains(principal: HousePrincipal, now: Date): Promise<number> {
  const db = getDb();
  const rows = await db
    .select()
    .from(actions)
    .where(
      and(eq(actions.principalId, principal.id), eq(actions.status, "bargaining"), lte(actions.bargainUntil, now)),
    );
  let advanced = 0;
  for (const row of rows) {
    if (row.insistedAt) continue;
    await escalateOffline(principal, row.id, now, REASON_BARGAIN_TIMEOUT);
    advanced += 1;
  }
  return advanced;
}

export async function withdrawAction(auth: HouseAuth, actionId: string) {
  const bundle = await requireProposer(auth, actionId);
  assertCanBargain(bundle, "withdraw");
  const db = getDb();
  await db.update(actions).set({ status: "withdrawn", bargainUntil: null }).where(eq(actions.id, actionId));
  const next = await loadActionBundle(actionId);
  if (!next) throw new ProtocolError("internal", "Failed to load action", 500);
  return serializeAction(next);
}

export async function reviseAction(
  auth: HouseAuth,
  actionId: string,
  body: Record<string, unknown>,
  now: Date,
  options?: { origin?: string },
) {
  const bundle = await requireProposer(auth, actionId);
  assertCanBargain(bundle, "revise");
  if (bundle.action.revision >= MAX_REVISION) {
    throw new ProtocolError("conflict", "No more revisions on this action", 409);
  }
  const payload = parsePayload(body.payload ?? body);
  const justification = typeof body.justification === "string" ? body.justification.trim() : "";
  if (!justification) throw new ProtocolError("bad_request", "justification is required", 400);
  assertJustification(justification);
  const evidence = parseEvidence(body.evidence);
  const revision = bundle.action.revision + 1;
  const db = getDb();
  await db
    .update(actions)
    .set({
      kind: "",
      payload,
      justification,
      evidence,
      status: "open",
      revision,
      bargainRound: bundle.action.bargainRound + 1,
      bargainUntil: null,
      silenceUntil: new Date(now.getTime() + auth.principal.silenceWindowSec * 1000),
    })
    .where(eq(actions.id, actionId));
  await enqueueWakes({
    actionId,
    principalId: auth.principal.id,
    proposerId: auth.agent.id,
    revision,
    origin: options?.origin,
  });
  const next = await loadActionBundle(actionId);
  if (!next) throw new ProtocolError("internal", "Failed to load action", 500);
  return serializeAction(next);
}

export async function insistAction(auth: HouseAuth, actionId: string, now: Date) {
  const bundle = await requireProposer(auth, actionId);
  assertCanBargain(bundle, "insist");
  if (bundle.objections.length === 0) {
    throw new ProtocolError("conflict", "Insist needs at least one objection", 409);
  }
  const db = getDb();
  await db.update(actions).set({ insistedAt: now }).where(eq(actions.id, actionId));
  const [fresh] = await db.select().from(actions).where(eq(actions.id, actionId)).limit(1);
  if (!fresh) throw new ProtocolError("internal", "Failed to load action", 500);
  scheduleOpenCourt(fresh, auth.principal, now);
  const next = await loadActionBundle(actionId);
  if (!next) throw new ProtocolError("internal", "Failed to load action", 500);
  return serializeAction(next);
}

async function requireProposer(auth: HouseAuth, actionId: string) {
  const bundle = await loadActionBundle(actionId);
  if (!bundle || bundle.action.principalId !== auth.principal.id) {
    throw new ProtocolError("not_found", "Unknown house", 404);
  }
  if (bundle.action.proposerId !== auth.agent.id) {
    throw new ProtocolError("forbidden", "Only the proposer may bargain", 403);
  }
  return bundle;
}

function assertCanBargain(
  bundle: NonNullable<Awaited<ReturnType<typeof loadActionBundle>>>,
  call: "withdraw" | "revise" | "insist",
) {
  if (bundle.action.insistedAt) {
    throw new ProtocolError("conflict", "Court already started", 409);
  }
  if (call === "withdraw") {
    if (bundle.action.status !== "open" && bundle.action.status !== "bargaining") {
      throw new ProtocolError("conflict", "This action cannot be withdrawn", 409);
    }
    return;
  }
  if (bundle.action.status !== "bargaining") {
    throw new ProtocolError("conflict", "Bargain has not started", 409);
  }
}
