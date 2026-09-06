import type { OpenInboxItem, ObjectionDraft } from "./types";

/**
 * Test-only phrase gate. Only the charter that ranks an outside promise above
 * internal convenience lets Calendar hold the slot. Free-form text may miss.
 */
const GRANT = /outrank|pesan más|gelten vor|önce gelir|обещания важнее/i;
const MOVE = /move|reschedul|11:00|сдвин|перенес/i;

/** Test-only Calendar client: canned charter phrases. Not a product guardian. */
export function decideCalendarTurn(input: {
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
    if (item.kind !== "book") continue;
    const text = `${item.payload.summary} ${item.evidence.map((row) => row.value).join(" ")}`;
    if (!MOVE.test(text)) continue;

    drafts.push({
      actionId: item.id,
      justification: `Calendar: this slot was promised outside. Charter: ${charter.slice(0, 240)}`,
      evidence: [...item.evidence, { type: "text", value: "Keep the 9:00 client call" }],
      counter_action: {
        kind: "cancel",
        summary: "Keep the 9:00 client call",
      },
    });
  }
  return drafts;
}
