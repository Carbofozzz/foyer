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
