import { eq } from "drizzle-orm";
import { cases, verdicts } from "@/lib/db/schema";
import { getDb } from "@/lib/db";
import { decide } from "@/lib/judge/decide";
import { ensureHouseCourt } from "@/lib/judge/house-court";
import { recordCourtTx } from "@/lib/judge/wallet";
import { actionEvidence, actionPayload, loadActionBundle, serializeAction, type HousePrincipal } from "./bundle";
import { ProtocolError } from "./errors";
import { mintToken } from "./keys";
import { asEvidence, asPayload, isRecord } from "./parse";
import { OUTCOMES, type Judge, type Outcome, type VerdictAnswer } from "./types";

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

  const primary = bundle.objections[0];
  let answer: VerdictAnswer;
  let judge: Judge = "offline";
  let tx: string | null = null;
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
    answer = {
      outcome: manual,
      remedy_action: remedy,
      reasoning: note || "The principal set the outcome on appeal.",
      objection_grounded: prior.objectionGrounded,
    };
  } else {
    const extra = note ? [{ type: "text" as const, value: `Appeal note: ${note}` }] : [];
    const contractAddress = await ensureHouseCourt(principal);
    const retrial = await decide(
      principal,
      courtCase.id,
      {
        constitution: courtCase.constitutionSnapshot,
        proposed_action: actionPayload(bundle.action),
        objection: primary
          ? {
              justification: primary.justification,
              counter_action: primary.counterAction ? asPayload(primary.counterAction) : null,
            }
          : null,
        evidence: [...actionEvidence(bundle.action), ...(primary ? asEvidence(primary.evidence) : []), ...extra],
      },
      {
        prior_verdict: {
          outcome: prior.outcome as Outcome,
          remedy_action: prior.remedyAction ? asPayload(prior.remedyAction) : null,
          reasoning: prior.reasoning,
          objection_grounded: prior.objectionGrounded,
        },
        appeal_note: note,
      },
      contractAddress,
    );
    answer = retrial.answer;
    judge = retrial.judge;
    tx = retrial.tx;
  }

  await db.insert(verdicts).values({
    id: mintToken("vrd"),
    caseId: courtCase.id,
    outcome: answer.outcome,
    remedyAction: answer.remedy_action,
    reasoning: answer.reasoning,
    objectionGrounded: answer.objection_grounded,
    judge,
    tx,
    appealOf: prior.id,
  });
  await recordCourtTx(principal, tx, principal.courtContract);

  const next = await loadActionBundle(bundle.action.id);
  if (!next) throw new ProtocolError("internal", "Failed to load action", 500);
  return serializeAction(next);
}

export function parseAppealBody(raw: unknown): Record<string, unknown> {
  if (!isRecord(raw)) throw new ProtocolError("bad_request", "JSON object required", 400);
  return raw;
}
