import type { ActionPayload, EvidenceItem } from "@/lib/protocol/types";
import type { OpenInboxItem, ObjectionDraft } from "./types";

/** Case C: a message with other people's data. Security files a pure block. */
export const CASE_C = {
  kind: "message" as const,
  payload: {
    kind: "message",
    summary: "Send the client spreadsheet with emails",
  } satisfies ActionPayload,
  justification: "Need to share the list with the team.",
  evidence: [
    { type: "text" as const, value: "File contains other people's email addresses" },
  ] satisfies EvidenceItem[],
};

/**
 * Test-only phrase gate. The charter has to grant the block, not just mention
 * security. Free-form text without this clause never fires.
 */
const GRANT =
  /(security|seguridad|sicherheit|güvenlik|безопасн)[^.]*(may block|puede bloquear|blockieren|engelleyebilir|блокировать)/i;
const RISK = /spreadsheet|email|address|payment|данн|адрес|платёж|pago|zahlung/i;

/** Test-only Security client: canned charter phrases; pure block. Not a product guardian. */
export function decideSecurityTurn(input: {
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
    if (item.kind !== "message") continue;
    const text = `${item.payload.summary} ${item.evidence.map((row) => row.value).join(" ")}`;
    if (!RISK.test(text)) continue;

    drafts.push({
      actionId: item.id,
      justification: `Security: other people's data. Charter: ${charter.slice(0, 240)}`,
      evidence: item.evidence,
      counter_action: null,
    });
  }
  return drafts;
}
