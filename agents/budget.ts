import type { ActionKind } from "@/lib/protocol/types";
import type { ObjectionDraft, OpenInboxItem } from "./types";

export type { ObjectionDraft, OpenInboxItem };

/**
 * Test-only phrase gate. Budget speaks for a charter that prefers the cheaper
 * option. A charter that lets comfort win, or free-form text without these
 * phrases, leaves the proposal alone.
 */
const GRANT = /save money|cheaper|ahorra|más barato|spar geld|günstigere|tasarruf|ucuz|эконом|дешевле/i;

/** Test-only Budget client: canned charter phrases. Not a product guardian. */
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
    if (!GRANT.test(input.constitution)) continue;

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
