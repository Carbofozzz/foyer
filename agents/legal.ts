import type { OpenInboxItem, ObjectionDraft } from "./types";

const LEGAL = /contract|legal|deadline|договор|срок|contrato|frist/i;
const PROMISE = /promise|friday|deadline|обещ|пятниц|fecha|termin/i;

/** Legal guardian: object when a message promises more than the contract. */
export function decideLegalTurn(input: {
  constitution: string;
  selfId: string;
  items: OpenInboxItem[];
}): ObjectionDraft[] {
  const drafts: ObjectionDraft[] = [];
  const charter = input.constitution.trim();
  if (!LEGAL.test(charter) && charter.length === 0) return drafts;

  for (const item of input.items) {
    if (item.status !== "open") continue;
    if (item.proposerId === input.selfId) continue;
    if (item.alreadyObjected) continue;
    if (item.kind !== "message") continue;
    const text = `${item.payload.summary} ${item.evidence.map((row) => row.value).join(" ")}`;
    if (!PROMISE.test(text)) continue;

    drafts.push({
      actionId: item.id,
      justification: `Legal: wider than the contract. Charter: ${charter.slice(0, 240)}`,
      evidence: [...item.evidence, { type: "text", value: "Reply without a hard date" }],
      counter_action: {
        kind: "message",
        summary: "Reply without a hard delivery date",
      },
    });
  }
  return drafts;
}
