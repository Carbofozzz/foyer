import { eq } from "drizzle-orm";
import { cases, verdicts } from "@/lib/db/schema";
import { getDb } from "@/lib/db";
import {
  actionEvidence,
  engagedIds,
  loadActionBundle,
  serializeAction,
  type HousePrincipal,
} from "./bundle";
import { submitAppealTx } from "./court";
import { ProtocolError } from "./errors";
import { mintToken } from "./keys";
import { asPayload, isRecord } from "./parse";
import { executeAfterAck } from "./execute";
import { OUTCOMES, type Outcome, type VerdictAnswer } from "./types";

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
  if (!bundle.action.appealUntil || bundle.action.appealUntil <= now) {
    throw new ProtocolError("conflict", "Appeal window is closed", 409);
  }
  const prior = bundle.verdict;
  if (!prior) throw new ProtocolError("conflict", "No verdict to appeal", 409);

  const note = typeof body.note === "string" ? body.note.trim() : "";
  const manual = typeof body.outcome === "string" && OUTCOMES.includes(body.outcome as Outcome)
    ? (body.outcome as Outcome)
    : null;

  if (manual) {
    const remedy =
      manual === "remedy"
        ? body.remedy_action
          ? asPayload(body.remedy_action)
          : prior.remedyAction
            ? asPayload(prior.remedyAction)
            : null
        : null;
    if (manual === "remedy" && !remedy) {
      throw new ProtocolError("bad_request", "remedy needs a remedy_action", 400);
    }
    const answer: VerdictAnswer = {
      outcome: manual,
      remedy_action: remedy,
      reasoning: note || "The principal set the outcome on appeal.",
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
    const after = await loadActionBundle(bundle.action.id);
    if (!after) throw new ProtocolError("internal", "Failed to load action", 500);
    const engaged = engagedIds(
      after.action.proposerId,
      after.objections.map((item) => item.objectorId),
    );
    const acked = new Set(after.acks.map((item) => item.agentId));
    const timedOut = after.action.ackUntil !== null && after.action.ackUntil <= now;
    if (engaged.every((id) => acked.has(id)) || timedOut) {
      await executeAfterAck(after.action.id);
    }
  } else {
    const hash = await submitAppealTx(
      principal,
      courtCase,
      bundle.action,
      {
        prior_verdict: {
          outcome: prior.outcome as Outcome,
          remedy_action: prior.remedyAction ? asPayload(prior.remedyAction) : null,
          reasoning: prior.reasoning,
          objection_grounded: prior.objectionGrounded,
        },
        appeal_note: note,
      },
      now,
    );
    if (!hash) throw new ProtocolError("unavailable", "Court transaction was not submitted", 503);
  }

  const next = await loadActionBundle(bundle.action.id);
  if (!next) throw new ProtocolError("internal", "Failed to load action", 500);
  return serializeAction(next);
}

export function parseAppealBody(raw: unknown): Record<string, unknown> {
  if (!isRecord(raw)) throw new ProtocolError("bad_request", "JSON object required", 400);
  return raw;
}
