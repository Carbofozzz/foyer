import { eq } from "drizzle-orm";
import { actions, agents, cases, objections, verdicts } from "@/lib/db/schema";
import { getDb } from "@/lib/db";
import { judgeOffline } from "@/lib/judge/offline";
import type { EvidenceItem } from "./types";
import { mintToken } from "./keys";
import { actionEvidence, actionPayload, type ActionRow, type HousePrincipal } from "./bundle";
import { asEvidence, asPayload } from "./parse";

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

  const answer = judgeOffline({
    constitution: principal.constitution,
    proposed_action: actionPayload(action),
    objection: primary
      ? {
          justification: primary.justification,
          counter_action: primary.counterAction ? asPayload(primary.counterAction) : null,
        }
      : null,
    evidence,
  });

  const caseId = mintToken("cas");
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
    judge: "offline",
  });

  for (const row of filed) {
    if (answer.objection_grounded) {
      const [objector] = await db.select().from(agents).where(eq(agents.id, row.objectorId)).limit(1);
      if (objector) {
        await db
          .update(agents)
          .set({ bondBalance: objector.bondBalance + row.bond })
          .where(eq(agents.id, objector.id));
      }
    }
  }

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
