import type { ActionPayload, EvidenceItem } from "@/lib/protocol/types";

/** Case A: Travel proposes business class against a Budget counter. */
export const CASE_A = {
  kind: "book" as const,
  payload: {
    kind: "book",
    summary: "Business class, €420",
    amount: 420,
    currency: "EUR",
  } satisfies ActionPayload,
  justification: "Client presentation at 9:00; need to arrive on time.",
  evidence: [{ type: "text" as const, value: "Presentation at 9:00" }] satisfies EvidenceItem[],
};

/** Case B: Travel tries to move a slot that Calendar treats as an external promise. */
export const CASE_B = {
  kind: "book" as const,
  payload: {
    kind: "book",
    summary: "Move the 9:00 client call to 11:00",
  } satisfies ActionPayload,
  justification: "Need a later slot to finish the deck.",
  evidence: [
    { type: "text" as const, value: "Client call was booked at 9:00 with an external party" },
  ] satisfies EvidenceItem[],
};
