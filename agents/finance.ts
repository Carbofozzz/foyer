import type { ActionKind } from "@/lib/protocol/types";
import type { OpenInboxItem, ObjectionDraft } from "./types";

/** The org charter has to hand Finance the block over the monthly limit. */
const GRANT = /(finance|finanzas|finanz|финанс)[^.]*(block|bloquear|blockieren|engelle|блокир)/i;

/** Finance guardian: org counterpart of Budget on spend. */
export function decideFinanceTurn(input: {
  constitution: string;
  selfId: string;
  items: OpenInboxItem[];
}): ObjectionDraft[] {
  const drafts: ObjectionDraft[] = [];
  const charter = input.constitution.trim();
  if (!GRANT.test(charter)) return drafts;

  for (const item of input.items) {
    if (item.status !== "open") continue;
    if (item.proposerId === input.selfId) continue;
    if (item.alreadyObjected) continue;
    if (item.kind !== "spend") continue;
    const amount = item.payload.amount;
    if (typeof amount !== "number" || amount < 200) continue;

    drafts.push({
      actionId: item.id,
      justification: `Finance: over the spend line. Charter: ${charter.slice(0, 240)}`,
      evidence: item.evidence,
      counter_action: {
        kind: item.kind as ActionKind,
        summary: `Hold the spend of ${amount}`,
        amount,
        currency: item.payload.currency ?? "EUR",
      },
    });
  }
  return drafts;
}
