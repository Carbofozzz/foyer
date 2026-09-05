import { eq } from "drizzle-orm";
import { actions, cases, objections, verdicts } from "@/lib/db/schema";
import { getDb } from "@/lib/db";
import { decide } from "@/lib/judge/decide";
import { ensureHouseCourt } from "@/lib/judge/house-court";
import type { EvidenceItem } from "./types";
import { mintToken } from "./keys";
import { actionEvidence, actionPayload, type ActionRow, type HousePrincipal } from "./bundle";
import { asEvidence, asPayload } from "./parse";
import { recordCourtTx } from "@/lib/judge/wallet";

export async function openCourt(action: ActionRow, principal: HousePrincipal, now: Date): Promise<void> {
  const db = getDb();
  const existing = await db.select().from(cases).where(eq(cases.actionId, action.id)).limit(1);
  if (existing.length > 0) return;

  const filed = await db.select().from(objections).where(eq(objections.actionId, action.id));
  const primary = filed[0];
  const evidence: EvidenceItem[] = [
    ...actionEvidence(action),
    ...(primary ? asEvidence(primary.evidence) : []),
  ];

  const caseId = mintToken("cas");
  const contractAddress = await ensureHouseCourt(principal);
  const { answer, judge, tx } = await decide(
    principal,
    caseId,
    {
      constitution: principal.constitution,
      proposed_action: actionPayload(action),
      objection: primary
        ? {
            justification: primary.justification,
            counter_action: primary.counterAction ? asPayload(primary.counterAction) : null,
          }
        : null,
      evidence,
    },
    undefined,
    contractAddress,
  );

  await db.insert(cases).values({
    id: caseId,
    actionId: action.id,
    constitutionSnapshot: principal.constitution,
    status: "judged",
  });
  await db.insert(verdicts).values({
    id: mintToken("vrd"),
    caseId,
    outcome: answer.outcome,
    remedyAction: answer.remedy_action,
    reasoning: answer.reasoning,
    objectionGrounded: answer.objection_grounded,
    judge,
    tx,
    escalateExternal: false,
  });
  await recordCourtTx(principal, tx, contractAddress);

  if (answer.outcome === "escalate") {
    await db
      .update(actions)
      .set({
        status: "escalated",
        appealUntil: new Date(now.getTime() + principal.appealWindowSec * 1000),
      })
      .where(eq(actions.id, action.id));
    return;
  }

  await db
    .update(actions)
    .set({
      status: "awaiting_ack",
      ackUntil: new Date(now.getTime() + principal.ackTimeoutSec * 1000),
      appealUntil: new Date(now.getTime() + principal.appealWindowSec * 1000),
    })
    .where(eq(actions.id, action.id));
}
