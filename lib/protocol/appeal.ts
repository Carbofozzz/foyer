import { eq } from "drizzle-orm";
import { actions, cases, verdicts } from "@/lib/db/schema";
import { getDb } from "@/lib/db";
import { loadActionBundle, serializeAction, type HousePrincipal } from "./bundle";
import { ProtocolError } from "./errors";
import { mintToken } from "./keys";
import { isRecord } from "./parse";
import { executeAfterAck } from "./execute";
import type { Outcome, VerdictAnswer } from "./types";

export async function appealCase(
  principal: HousePrincipal,
  caseId: string,
  body: Record<string, unknown>,
  now: Date,
) {
  const db = getDb();
  const [courtCase] = await db.select().from(cases).where(eq(cases.id, caseId)).limit(1);
  if (!courtCase) throw new ProtocolError("not_found", "Unknown house", 404);

  const bundle = await loadActionBundle(courtCase.actionId);
  if (!bundle || bundle.action.principalId !== principal.id) {
    throw new ProtocolError("not_found", "Unknown house", 404);
  }
  if (bundle.action.status !== "escalated") {
    throw new ProtocolError("conflict", "Only an escalated case can be decided here", 409);
  }
  const prior = bundle.verdict;
  if (!prior) throw new ProtocolError("conflict", "No verdict to replace", 409);

  const manual = body.outcome === "allow_a" || body.outcome === "allow_b" ? (body.outcome as Outcome) : null;
  if (!manual) throw new ProtocolError("bad_request", "outcome must be allow_a or allow_b", 400);

  const answer: VerdictAnswer = {
    outcome: manual,
    remedy_action: null,
    reasoning: "The principal set the outcome.",
    objection_grounded: prior.objectionGrounded,
  };
  await db.insert(verdicts).values({
    id: mintToken("vrd"),
    caseId: courtCase.id,
    outcome: answer.outcome,
    remedyAction: answer.remedy_action,
    reasoning: answer.reasoning,
    objectionGrounded: answer.objection_grounded,
    judge: "offline",
    tx: null,
    appealOf: prior.id,
    escalateExternal: false,
  });
  await db
    .update(actions)
    .set({ status: "awaiting_ack", ackUntil: now, appealUntil: now })
    .where(eq(actions.id, bundle.action.id));
  await executeAfterAck(bundle.action.id);

  const next = await loadActionBundle(bundle.action.id);
  if (!next) throw new ProtocolError("internal", "Failed to load action", 500);
  return serializeAction(next);
}

export function parseAppealBody(raw: unknown): Record<string, unknown> {
  if (!isRecord(raw)) throw new ProtocolError("bad_request", "JSON object required", 400);
  return raw;
}
