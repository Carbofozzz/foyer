import type { ActionKind } from "@/lib/protocol/types";
import type { ObjectionDraft, OpenInboxItem } from "./types";

export type { ObjectionDraft, OpenInboxItem };

const SAVE = /save|econom|budget|cheap|ahorr|spar|tasarruf|эконом/i;

/** Budget guardian: a real protocol client. Sweep wakes it; it decides whether to object. */
export function decideBudgetTurn(input: {
  constitution: string;
  selfId: string;
  items: OpenInboxItem[];
}): ObjectionDraft[] {
  const drafts: ObjectionDraft[] = [];
  for (const item of input.items) {
    if (item.status !== "open") continue;
    if (item.proposerId === input.selfId) continue;
    if (item.alreadyObjected) continue;
    if (item.kind !== "book" && item.kind !== "spend") continue;
    const amount = item.payload.amount;
    if (typeof amount !== "number" || amount < 200) continue;
    if (!SAVE.test(input.constitution) && input.constitution.trim().length === 0) continue;

    const kind = item.kind as ActionKind;
    const economy = Math.round(amount * (180 / 420));
    const cited = input.constitution.trim().slice(0, 240);
    drafts.push({
      actionId: item.id,
      justification: `Budget: save money. Charter: ${cited}`,
      evidence: [...item.evidence, { type: "text", value: `Economy alternative is €${economy}` }],
      counter_action: {
        kind,
        summary: `Economy, €${economy}`,
        amount: economy,
        currency: item.payload.currency ?? "EUR",
      },
    });
  }
  return drafts;
}
