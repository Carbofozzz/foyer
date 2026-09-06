import type { ActionKind } from "@/lib/protocol/types";
import type { OpenInboxItem, ObjectionDraft } from "./types";

/** Test-only phrase gate. Free-form text without this clause never fires. */
const GRANT = /(finance|finanzas|finanz|финанс)[^.]*(block|bloquear|blockieren|engelle|блокир)/i;

/** Test-only Finance client: canned charter phrases. Not a product guardian. */
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
